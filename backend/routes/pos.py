"""POS routes blueprint"""
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
import os
import uuid
import sys
from pathlib import Path
from datetime import datetime, timedelta

# Add parent directory to path to import utils
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

load_dotenv()
from utils.helpers import get_database_url

DATABASE_URL = get_database_url()
engine = create_engine(DATABASE_URL, pool_pre_ping=True)

pos_bp = Blueprint('pos', __name__, url_prefix='/api/pos')

# Schema functions (temporary - should be moved to database/schema.py)
def ensure_products_reorder_supplier_columns() -> None:
	try:
		with engine.begin() as conn:
			conn.execute(text("""
				do $$ begin
					if not exists (
						select 1 from information_schema.columns
						where table_name='products' and column_name='reorder_point'
					) then
						alter table products add column reorder_point integer default 0;
					end if;
					if not exists (
						select 1 from information_schema.columns
						where table_name='products' and column_name='preferred_supplier_id'
					) then
						alter table products add column preferred_supplier_id bigint references suppliers(id);
					end if;
				end $$;
			"""))
	except Exception as e:
		print(f"[ensure_products_reorder_supplier_columns] Error: {e}")

def ensure_returns_tables() -> None:
	"""Ensure returns and return_items tables exist"""
	try:
		with engine.begin() as conn:
			conn.execute(text("""
				CREATE TABLE IF NOT EXISTS returns (
					id bigserial primary key,
					return_number text unique not null,
					sale_id bigint not null references sales(id) on delete cascade,
					pharmacy_id bigint not null references pharmacies(id) on delete cascade,
					user_id bigint references users(id) on delete set null,
					reason text not null,
					total_refund_amount numeric(12,2) not null check (total_refund_amount >= 0),
					status text default 'completed' check (status in ('pending', 'completed', 'cancelled')),
					notes text,
					created_at timestamptz default now(),
					updated_at timestamptz default now()
				)
			"""))
			conn.execute(text("""
				CREATE TABLE IF NOT EXISTS return_items (
					id bigserial primary key,
					return_id bigint references returns(id) on delete cascade,
					product_id bigint references products(id),
					quantity int not null check (quantity > 0),
					unit_price numeric(12,2) not null check (unit_price >= 0),
					total_refund numeric(12,2) generated always as (quantity * unit_price) stored,
					created_at timestamptz default now()
				)
			"""))
			conn.execute(text("""
				DROP TRIGGER IF EXISTS trg_returns_updated ON returns;
				CREATE TRIGGER trg_returns_updated 
				BEFORE UPDATE ON returns 
				FOR EACH ROW EXECUTE FUNCTION set_updated_at();
			"""))
	except Exception as e:
		print(f"Error creating returns tables: {e}")

@pos_bp.get('/products')
def get_pos_products():
	"""Get all products with inventory for POS"""
	# Ensure new product columns exist
	try:
		ensure_products_reorder_supplier_columns()
	except Exception:
		pass
	query = text('''
		SELECT 
			p.id, p.name, p.unit_price, p.cost_price,
			pc.name as category_name,
			COALESCE(i.current_stock, 0) as current_stock,
			p.location,
			COALESCE(p.reorder_point, 0) as reorder_point,
			p.preferred_supplier_id
		FROM products p
		LEFT JOIN product_categories pc ON p.category_id = pc.id
		LEFT JOIN inventory i ON p.id = i.product_id
		WHERE p.is_active = true
		ORDER BY p.name
	''')
	with engine.connect() as conn:
		rows = [dict(r) for r in conn.execute(query).mappings().all()]
		# Add computed fields
		for row in rows:
			row['in_stock'] = row['current_stock'] > 0
	return jsonify({'success': True, 'products': rows})

@pos_bp.get('/categories')
def get_pos_categories():
	"""Get all product categories"""
	query = text('SELECT id, name FROM product_categories ORDER BY name')
	with engine.connect() as conn:
		rows = [dict(r) for r in conn.execute(query).mappings().all()]
	return jsonify({'success': True, 'categories': rows})

@pos_bp.post('/process-sale')
@jwt_required()
def process_sale():
	"""Process a complete sale transaction"""
	try:
		data = request.get_json()
		user_id = get_jwt_identity()
		
		# Get user details
		user_sql = text('select id, pharmacy_id from users where id = :user_id')
		with engine.connect() as conn:
			user_row = conn.execute(user_sql, {'user_id': user_id}).mappings().first()
		if not user_row:
			return jsonify({'success': False, 'error': 'User not found'}), 404
		
		# Validate required fields
		required_fields = ['items', 'payment_method']
		for field in required_fields:
			if field not in data:
				return jsonify({'success': False, 'error': f'Missing required field: {field}'}), 400
		
		items = data['items']
		payment_method = data['payment_method']
		pharmacy_id = user_row['pharmacy_id']
		customer_name = data.get('customer_name', '')
		discount_amount = data.get('discount_amount', 0)
		tax_rate = data.get('tax_rate', 0.12)  # 12% VAT
		
		if not items or len(items) == 0:
			return jsonify({'success': False, 'error': 'No items in cart'}), 400
		
		# Calculate totals
		subtotal = sum(item['quantity'] * item['unit_price'] for item in items)
		tax_amount = subtotal * tax_rate
		total_amount = subtotal + tax_amount - discount_amount
		
		# Generate sale number
		sale_number = f"POS{datetime.now().strftime('%Y%m%d')}{str(uuid.uuid4())[:8].upper()}"
		
		with engine.begin() as conn:
			# Create sale record
			sale_sql = text('''
				INSERT INTO sales (
					sale_number, pharmacy_id, user_id, subtotal, tax_amount, discount_amount, 
					payment_method, status, notes, created_at
				) VALUES (:sale_number, :pharmacy_id, :user_id, :subtotal, :tax_amount, :discount_amount, 
					:payment_method, 'completed', :notes, :created_at)
				RETURNING id
			''')
			
			sale_result = conn.execute(sale_sql, {
				'sale_number': sale_number,
				'pharmacy_id': pharmacy_id,
				'user_id': user_id,
				'subtotal': subtotal,
				'tax_amount': tax_amount,
				'discount_amount': discount_amount,
				'payment_method': payment_method,
				'notes': f"Customer: {customer_name}" if customer_name else None,
				'created_at': datetime.now()
			})
			sale_id = sale_result.scalar()
			
			# Create sale items and update inventory
			for item in items:
				product_id = item['product_id']
				quantity = item['quantity']
				unit_price = item['unit_price']
				total_price = quantity * unit_price
				
				# Create sale item
				item_sql = text('''
					INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, created_at)
					VALUES (:sale_id, :product_id, :quantity, :unit_price, :created_at)
				''')
				conn.execute(item_sql, {
					'sale_id': sale_id,
					'product_id': product_id,
					'quantity': quantity,
					'unit_price': unit_price,
					'created_at': datetime.now()
				})
				
				# Update inventory
				inventory_sql = text('''
					UPDATE inventory 
					SET current_stock = current_stock - :quantity,
						last_updated = :last_updated
					WHERE product_id = :product_id
				''')
				conn.execute(inventory_sql, {
					'quantity': quantity,
					'last_updated': datetime.now(),
					'product_id': product_id
				})
		
		# Get sale details for receipt
		receipt_query = text('''
			SELECT 
				s.id, s.sale_number, s.subtotal, s.tax_amount, s.discount_amount, 
				s.total_amount, s.payment_method, s.created_at,
				u.first_name, u.last_name
			FROM sales s
			JOIN users u ON s.user_id = u.id
			WHERE s.id = :sale_id
		''')
		
		items_query = text('''
			SELECT 
				si.quantity, si.unit_price, si.total_price,
				p.name as product_name
			FROM sale_items si
			JOIN products p ON si.product_id = p.id
			WHERE si.sale_id = :sale_id
			ORDER BY si.id
		''')
		
		with engine.connect() as conn:
			sale_data = conn.execute(receipt_query, {'sale_id': sale_id}).mappings().first()
			sale_items = [dict(r) for r in conn.execute(items_query, {'sale_id': sale_id}).mappings().all()]
		
		return jsonify({
			'success': True,
			'sale': {
				'id': sale_data['id'],
				'sale_number': sale_data['sale_number'],
				'subtotal': float(sale_data['subtotal']),
				'tax_amount': float(sale_data['tax_amount']),
				'discount_amount': float(sale_data['discount_amount']),
				'total_amount': float(sale_data['total_amount']),
				'payment_method': sale_data['payment_method'],
				'created_at': sale_data['created_at'].isoformat(),
				'cashier': f"{sale_data['first_name']} {sale_data['last_name']}",
				'items': [
					{
						'product_name': item['product_name'],
						'quantity': item['quantity'],
						'unit_price': float(item['unit_price']),
						'total_price': float(item['total_price'])
					}
					for item in sale_items
				]
			}
		})
		
	except Exception as e:
		return jsonify({'success': False, 'error': str(e)}), 500

@pos_bp.get('/transactions')
@jwt_required()
def pos_transactions():
	try:
		user_id = get_jwt_identity()
		with engine.connect() as conn:
			# First check if user exists
			me = conn.execute(text('select id, pharmacy_id from users where id = :id'), {'id': user_id}).mappings().first()
			if not me:
				return jsonify({'success': False, 'error': 'User not found'}), 404
			
			# Ensure returns tables exist (using centralized function)
			ensure_returns_tables()
			
			# Get optional limit and date filter from query params
			limit = int(request.args.get('limit', 50))  # Default 50 instead of 100
			days = int(request.args.get('days', 30))  # Default last 30 days
			date_from = datetime.now() - timedelta(days=days)
			date_from = date_from.replace(hour=0, minute=0, second=0, microsecond=0)
			
			# Now get transactions with return info and staff names - optimized with date filter
			sales_rows = conn.execute(text('''
				SELECT 
					s.id, s.sale_number, s.subtotal, s.discount_amount, s.total_amount,
					s.user_id,
					s.payment_method, s.created_at, s.notes,
					COALESCE(r.return_count, 0) AS return_count,
					COALESCE(r.total_returned_amount, 0) AS total_returned_amount,
					CASE WHEN r.return_count > 0 THEN true ELSE false END AS has_returns,
					u.username as staff_username,
					u.first_name as staff_first_name,
					u.last_name as staff_last_name,
					-- last return editor (if any)
					lr.editor_username as last_editor_username,
					lr.editor_first_name as last_editor_first_name,
					lr.editor_last_name as last_editor_last_name,
					lr.updated_at as last_return_updated_at
				FROM sales s
				LEFT JOIN (
					SELECT sale_id, count(*) AS return_count, sum(total_refund_amount) AS total_returned_amount
					FROM returns 
					WHERE pharmacy_id = :ph
					GROUP BY sale_id
				) r ON r.sale_id = s.id
				LEFT JOIN users u ON u.id = s.user_id
				LEFT JOIN (
					SELECT r1.sale_id,
						   r1.updated_at,
						   uu.username AS editor_username,
						   uu.first_name AS editor_first_name,
						   uu.last_name AS editor_last_name
					FROM returns r1
					LEFT JOIN users uu ON uu.id = r1.user_id
					WHERE r1.pharmacy_id = :ph
					AND r1.updated_at = (
						SELECT MAX(r2.updated_at) FROM returns r2 WHERE r2.sale_id = r1.sale_id AND r2.pharmacy_id = r1.pharmacy_id
					)
				) lr ON lr.sale_id = s.id
				WHERE s.pharmacy_id = :ph AND s.created_at >= :date_from
				ORDER BY s.created_at DESC
				LIMIT :limit
			'''), {'ph': me['pharmacy_id'], 'date_from': date_from, 'limit': limit}).mappings().all()

			# Batch fetch all items for all sales in one query (much faster)
			sale_ids = [s['id'] for s in sales_rows]
			items_map = {}
			if sale_ids:
				items_rows = conn.execute(text('''
					select si.sale_id, si.quantity, si.unit_price, (si.quantity * si.unit_price) as total_price,
						   p.name as product_name, si.product_id
					from sale_items si
					join products p on p.id = si.product_id
					where si.sale_id = ANY(:sale_ids)
					order by si.sale_id, si.id
				'''), {'sale_ids': sale_ids}).mappings().all()
				for it in items_rows:
					sid = it['sale_id']
					if sid not in items_map:
						items_map[sid] = []
					items_map[sid].append(it)

			transactions = []
			for s in sales_rows:
				items = items_map.get(s['id'], [])
				transactions.append({
					'id': s['id'],
					'user_id': s['user_id'],
					'sale_number': s['sale_number'],
					'subtotal': float(s['subtotal']),
					'discount_amount': float(s['discount_amount'] or 0),
					'total_amount': float(s['total_amount']),
					'payment_method': s['payment_method'],
					'created_at': s['created_at'].isoformat(),
					'customer_name': (s['notes'][10:] if s['notes'] and s['notes'].startswith('Customer: ') else None),
					'has_returns': s['has_returns'],
					'return_count': int(s['return_count']),
					'total_returned_amount': float(s['total_returned_amount']),
					# staff name fields
					'staff_name': ('{} {}'.format(s.get('staff_first_name') or '', s.get('staff_last_name') or '').strip() or s.get('staff_username')),
					# last return editor fields
					'last_edited_by': ('{} {}'.format(s.get('last_editor_first_name') or '', s.get('last_editor_last_name') or '').strip() or s.get('last_editor_username')),
					'last_edited_at': (s.get('last_return_updated_at').isoformat() if s.get('last_return_updated_at') else None),
					'items': [
						{
							'name': it['product_name'],
							'quantity': it['quantity'],
							'unit_price': float(it['unit_price']),
							'total_price': float(it['total_price']),
							'product_id': it['product_id']
						} for it in items
					]
				})
			return jsonify({'success': True, 'transactions': transactions})
	except Exception as e:
		print(f"Error in pos_transactions: {e}")
		return jsonify({'success': False, 'error': str(e)}), 500

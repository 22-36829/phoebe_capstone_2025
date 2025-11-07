"""Manager routes blueprint"""
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
import bcrypt
import os
from datetime import datetime, timedelta
from collections import defaultdict
from utils.helpers import get_current_user, require_manager_or_admin, date_range_params
from database.schema import (
	ensure_returns_tables,
	ensure_products_reorder_supplier_columns,
	ensure_inventory_expiration_column,
	ensure_announcements_table
)

load_dotenv()
DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql+psycopg2://postgres:PhoebeDrugStore01@db.xybuirzvlfuwmtcokkwm.supabase.co:5432/postgres?sslmode=require')
engine = create_engine(DATABASE_URL, pool_pre_ping=True)

manager_bp = Blueprint('manager', __name__, url_prefix='/api/manager')

# Staff management routes moved to routes/staff.py - see blueprint registration in app.py

# --- Inventory Requests (Approvals) ---

@manager_bp.post('/api/inventory/requests')
@jwt_required()
def create_inventory_request():
	data = request.get_json(force=True) or {}
	user_id = get_jwt_identity()
	qty = data.get('quantity_change')
	product_id = data.get('product_id')
	reason = data.get('reason', '')
	if qty is None or product_id is None:
		return jsonify({'success': False, 'error': 'product_id and quantity_change are required'}), 400
	with engine.begin() as conn:
		me = conn.execute(text('select id, role, pharmacy_id from users where id = :id'), {'id': user_id}).mappings().first()
		if not me:
			return jsonify({'success': False, 'error': 'User not found'}), 404
		# verify product belongs to same pharmacy
		prod = conn.execute(text('select id, pharmacy_id from products where id = :pid'), {'pid': product_id}).mappings().first()
		if not prod or int(prod['pharmacy_id']) != int(me['pharmacy_id']):
			return jsonify({'success': False, 'error': 'Product not found in your pharmacy'}), 404
		row = conn.execute(text('''
			insert into inventory_adjustment_requests (pharmacy_id, product_id, requested_by, quantity_change, reason, status)
			values (:ph, :pid, :uid, :qty, :reason, 'pending')
			returning id, status
		'''), {'ph': me['pharmacy_id'], 'pid': product_id, 'uid': user_id, 'qty': int(qty), 'reason': reason}).mappings().first()
		return jsonify({'success': True, 'request': dict(row)})


@manager_bp.get('/api/inventory/requests')
@jwt_required()
def list_inventory_requests():
	user_id = get_jwt_identity()
	status = request.args.get('status')
	page = int(request.args.get('page', 1))
	page_size = int(request.args.get('page_size', 25))
	page = max(page, 1)
	page_size = max(min(page_size, 100), 1)
	with engine.connect() as conn:
		_ensure_batches_table(conn)
		me = conn.execute(text('select id, role, pharmacy_id from users where id = :id'), {'id': user_id}).mappings().first()
		if not me:
			return jsonify({'success': False, 'error': 'User not found'}), 404
		params = {'ph': me['pharmacy_id']}
		status_filter = ''
		if status:
			status_filter = ' and r.status = :st'
			params['st'] = status
		# total count
		total = conn.execute(text(f'''
			select count(*)
			from inventory_adjustment_requests r
			join products p on p.id = r.product_id
			where r.pharmacy_id = :ph{status_filter}
		'''), params).scalar() or 0

		params.update({'limit': page_size, 'offset': (page-1)*page_size})
		rows = conn.execute(text(f'''
			select r.id, r.product_id, p.name as product_name, r.quantity_change, r.reason, r.status,
			       r.requested_by,
			       ub.email as requested_by_email,
			       ub.first_name as requested_by_first_name,
			       ub.last_name as requested_by_last_name,
			       r.approved_by,
			       ua.email as approved_by_email,
			       ua.first_name as approved_by_first_name,
			       ua.last_name as approved_by_last_name,
			       r.created_at, r.decided_at
			from inventory_adjustment_requests r
			join products p on p.id = r.product_id
			left join users ub on ub.id = r.requested_by
			left join users ua on ua.id = r.approved_by
			where r.pharmacy_id = :ph{status_filter}
			order by r.created_at desc
			limit :limit offset :offset
		'''), params).mappings().all()
		return jsonify({'success': True, 'requests': [dict(r) for r in rows], 'total': int(total), 'page': page, 'page_size': page_size})


@manager_bp.post('/api/inventory/requests/<int:req_id>/approve')
@jwt_required()
def approve_inventory_request(req_id: int):
	user_id = get_jwt_identity()
	with engine.begin() as conn:
		me = conn.execute(text('select id, role, pharmacy_id from users where id = :id'), {'id': user_id}).mappings().first()
		if not me or me['role'] not in ('manager','admin','staff'):
			return jsonify({'success': False, 'error': 'Forbidden'}), 403
		req = conn.execute(text('select * from inventory_adjustment_requests where id = :id'), {'id': req_id}).mappings().first()
		if not req or int(req['pharmacy_id']) != int(me['pharmacy_id']):
			return jsonify({'success': False, 'error': 'Request not found'}), 404
		if req['status'] != 'pending':
			return jsonify({'success': False, 'error': 'Request already decided'}), 400
		# Update inventory ensuring non-negative
		inv = conn.execute(text('select current_stock from inventory where product_id = :pid'), {'pid': req['product_id']}).mappings().first()
		current_stock = int(inv['current_stock']) if inv else 0
		new_stock = current_stock + int(req['quantity_change'])
		if new_stock < 0:
			return jsonify({'success': False, 'error': 'Insufficient stock for this approval'}), 400
		conn.execute(text('''
			update inventory set current_stock = :cs, last_updated = now() where product_id = :pid
		'''), {'cs': new_stock, 'pid': req['product_id']})
		conn.execute(text('''
			update inventory_adjustment_requests set status = 'approved', approved_by = :uid, decided_at = now() where id = :id
		'''), {'uid': user_id, 'id': req_id})
		return jsonify({'success': True, 'new_stock': new_stock})


@manager_bp.post('/api/inventory/requests/<int:req_id>/reject')
@jwt_required()
def reject_inventory_request(req_id: int):
	user_id = get_jwt_identity()
	with engine.begin() as conn:
		me = conn.execute(text('select id, role, pharmacy_id from users where id = :id'), {'id': user_id}).mappings().first()
		if not me or me['role'] not in ('manager','admin','staff'):
			return jsonify({'success': False, 'error': 'Forbidden'}), 403
		req = conn.execute(text('select * from inventory_adjustment_requests where id = :id'), {'id': req_id}).mappings().first()
		if not req or int(req['pharmacy_id']) != int(me['pharmacy_id']):
			return jsonify({'success': False, 'error': 'Request not found'}), 404
		if req['status'] != 'pending':
			return jsonify({'success': False, 'error': 'Request already decided'}), 400
		conn.execute(text('''
			update inventory_adjustment_requests set status = 'rejected', approved_by = :uid, decided_at = now() where id = :id
		'''), {'uid': user_id, 'id': req_id})
		return jsonify({'success': True})

# --- Manager direct inventory update ---

@manager_bp.patch('/inventory/<int:product_id>')
@jwt_required()
def manager_update_inventory(product_id: int):
	data = request.get_json(force=True) or {}
	user_id = get_jwt_identity()
	new_stock = data.get('current_stock')
	if new_stock is None or int(new_stock) < 0:
		return jsonify({'success': False, 'error': 'current_stock must be provided and non-negative'}), 400
	with engine.begin() as conn:
		me = conn.execute(text('select id, role, pharmacy_id from users where id = :id'), {'id': user_id}).mappings().first()
		if not me or me['role'] not in ('manager','admin','staff'):
			return jsonify({'success': False, 'error': 'Forbidden'}), 403
		prod = conn.execute(text('select id, pharmacy_id from products where id = :pid'), {'pid': product_id}).mappings().first()
		if not prod or int(prod['pharmacy_id']) != int(me['pharmacy_id']):
			return jsonify({'success': False, 'error': 'Product not found in your pharmacy'}), 404
		conn.execute(text('''
			insert into inventory (product_id, current_stock, reserved_stock)
			values (:pid, :cs, 0)
			on conflict (product_id) do update set current_stock = excluded.current_stock, last_updated = now()
		'''), {'pid': product_id, 'cs': int(new_stock)})
		return jsonify({'success': True, 'current_stock': int(new_stock)})

# --- Manager: Product CRUD (pharmacy-scoped) ---

@manager_bp.post('/products')
@jwt_required()
def manager_create_product():
	data = request.get_json(force=True) or {}
	name = (data.get('name') or '').strip()
	unit_price = data.get('unit_price')
	cost_price = data.get('cost_price')
	category_id = data.get('category_id')
	location = (data.get('location') or '').strip() or None
	if not name or unit_price is None or cost_price is None or not category_id:
		return jsonify({'success': False, 'error': 'name, unit_price, cost_price, category_id are required'}), 400
	user_id = get_jwt_identity()
	with engine.begin() as conn:
		me = conn.execute(text('select id, role, pharmacy_id from users where id = :id'), {'id': user_id}).mappings().first()
		if not me or me['role'] not in ('manager','admin','staff'):
			return jsonify({'success': False, 'error': 'Forbidden'}), 403
		ensure_products_reorder_supplier_columns()
		row = conn.execute(text('''
			insert into products (pharmacy_id, name, category_id, unit_price, cost_price, is_active, location, reorder_point, preferred_supplier_id)
			values (:ph, :name, :cat, :up, :cp, true, :loc, :rp, :ps)
			returning id, name, category_id, unit_price, cost_price, is_active, location, reorder_point, preferred_supplier_id
		'''), {'ph': me['pharmacy_id'], 'name': name, 'cat': category_id, 'up': unit_price, 'cp': cost_price, 'loc': location, 'rp': int(data.get('reorder_point') or 0), 'ps': data.get('preferred_supplier_id')}).mappings().first()
		# Ensure inventory row exists (0 by default)
		conn.execute(text('''
			insert into inventory (product_id, current_stock, reserved_stock)
			values (:pid, 0, 0)
			on conflict (product_id) do nothing
		'''), {'pid': row['id']})
		return jsonify({'success': True, 'product': dict(row)})


@manager_bp.patch('/products/<int:product_id>')
@jwt_required()
def manager_update_product(product_id: int):
	data = request.get_json(force=True) or {}
	user_id = get_jwt_identity()
	with engine.begin() as conn:
		me = conn.execute(text('select id, role, pharmacy_id from users where id = :id'), {'id': user_id}).mappings().first()
		if not me or me['role'] not in ('manager','admin'):
			return jsonify({'success': False, 'error': 'Forbidden'}), 403
		fields = {}
		if 'name' in data:
			fields['name'] = (data['name'] or '').strip()
		if 'unit_price' in data:
			fields['unit_price'] = data['unit_price']
		if 'cost_price' in data:
			fields['cost_price'] = data['cost_price']
		if 'category_id' in data:
			fields['category_id'] = data['category_id']
		if 'location' in data:
			fields['location'] = (data['location'] or '').strip() or None
		if 'reorder_point' in data:
			ensure_products_reorder_supplier_columns()
			fields['reorder_point'] = int(data.get('reorder_point') or 0)
		if 'preferred_supplier_id' in data:
			ensure_products_reorder_supplier_columns()
			fields['preferred_supplier_id'] = data.get('preferred_supplier_id')
		if not fields:
			return jsonify({'success': False, 'error': 'Nothing to update'}), 400
		set_parts = []
		params = {'id': product_id, 'ph': me['pharmacy_id']}
		for key, val in fields.items():
			set_parts.append(f"{key} = :{key}")
			params[key] = val
		row = conn.execute(text(f"""
			update products set {', '.join(set_parts)}, updated_at = now()
			where id = :id and pharmacy_id = :ph
			returning id, name, category_id, unit_price, cost_price, is_active, location, reorder_point, preferred_supplier_id
		"""), params).mappings().first()
		if not row:
			return jsonify({'success': False, 'error': 'Product not found'}), 404
		return jsonify({'success': True, 'product': dict(row)})


@manager_bp.delete('/products/<int:product_id>')
@jwt_required()
def manager_deactivate_product(product_id: int):
	user_id = get_jwt_identity()
	with engine.begin() as conn:
		me = conn.execute(text('select id, role, pharmacy_id from users where id = :id'), {'id': user_id}).mappings().first()
		if not me or me['role'] not in ('manager','admin'):
			return jsonify({'success': False, 'error': 'Forbidden'}), 403
		row = conn.execute(text('''
			update products set is_active = false, updated_at = now()
			where id = :id and pharmacy_id = :ph
			returning id
		'''), {'id': product_id, 'ph': me['pharmacy_id']}).first()
		if not row:
			return jsonify({'success': False, 'error': 'Product not found'}), 404
		return jsonify({'success': True})

@manager_bp.get('/products')
@jwt_required()
def manager_list_products():
	status = request.args.get('status', 'active')  # active | inactive | all
	user_id = get_jwt_identity()
	with engine.connect() as conn:
		me = conn.execute(text('select id, role, pharmacy_id from users where id = :id'), {'id': user_id}).mappings().first()
		if not me or me['role'] not in ('manager','admin'):
			return jsonify({'success': False, 'error': 'Forbidden'}), 403
		where_status = ''
		if status == 'active':
			where_status = 'and p.is_active = true'
		elif status == 'inactive':
			where_status = 'and p.is_active = false'
		query = text(f'''
			select p.id, p.name, p.unit_price, p.cost_price, p.is_active,
			       pc.name as category_name,
			       coalesce(i.current_stock,0) as current_stock,
			       p.location
			from products p
			left join product_categories pc on pc.id = p.category_id
			left join inventory i on i.product_id = p.id
			where p.pharmacy_id = :ph {where_status}
			order by p.name
		''')
		rows = [dict(r) for r in conn.execute(query, {'ph': me['pharmacy_id']}).mappings().all()]
		return jsonify({'success': True, 'products': rows})

@manager_bp.post('/products/<int:product_id>/reactivate')
@jwt_required()
def manager_reactivate_product(product_id: int):
	user_id = get_jwt_identity()
	with engine.begin() as conn:
		me = conn.execute(text('select id, role, pharmacy_id from users where id = :id'), {'id': user_id}).mappings().first()
		if not me or me['role'] not in ('manager','admin'):
			return jsonify({'success': False, 'error': 'Forbidden'}), 403
		row = conn.execute(text('''
			update products set is_active = true, updated_at = now()
			where id = :id and pharmacy_id = :ph
			returning id
		'''), {'id': product_id, 'ph': me['pharmacy_id']}).first()
		if not row:
			return jsonify({'success': False, 'error': 'Product not found'}), 404
		return jsonify({'success': True})

@manager_bp.delete('/products/<int:product_id>/hard')
@jwt_required()
def manager_hard_delete_product(product_id: int):
	user_id = get_jwt_identity()
	with engine.begin() as conn:
		me = conn.execute(text('select id, role, pharmacy_id from users where id = :id'), {'id': user_id}).mappings().first()
		if not me or me['role'] not in ('manager','admin'):
			return jsonify({'success': False, 'error': 'Forbidden'}), 403
		try:
			res = conn.execute(text('delete from products where id = :id and pharmacy_id = :ph'), {'id': product_id, 'ph': me['pharmacy_id']})
			if res.rowcount == 0:
				return jsonify({'success': False, 'error': 'Product not found or cannot delete'}), 404
			return jsonify({'success': True})
		except Exception as e:
			return jsonify({'success': False, 'error': str(e)}), 400

# --- Manager: Category Management ---

@manager_bp.post('/categories')
@jwt_required()
def create_category():
	data = request.get_json(force=True) or {}
	name = (data.get('name') or '').strip()
	if not name:
		return jsonify({'success': False, 'error': 'name is required'}), 400
	user_id = get_jwt_identity()
	with engine.begin() as conn:
		me = conn.execute(text('select id, role from users where id = :id'), {'id': user_id}).mappings().first()
		if not me or me['role'] not in ('manager','admin'):
			return jsonify({'success': False, 'error': 'Forbidden'}), 403
		row = conn.execute(text('''
			insert into product_categories (name) values (:n)
			on conflict (name) do update set name = excluded.name
			returning id, name
		'''), {'n': name}).mappings().first()
		return jsonify({'success': True, 'category': dict(row)})

# --- Manager: Profile & Pharmacy ---

@manager_bp.patch('/profile')
@jwt_required()
def update_manager_profile():
	data = request.get_json(force=True) or {}
	user_id = get_jwt_identity()
	first_name = data.get('first_name')
	last_name = data.get('last_name')
	if first_name is None and last_name is None:
		return jsonify({'success': False, 'error': 'Nothing to update'}), 400
	with engine.begin() as conn:
		row = conn.execute(text('''
			update users set
				first_name = coalesce(:fn, first_name),
				last_name = coalesce(:ln, last_name),
				updated_at = now()
			where id = :uid
			returning id, email, username, first_name, last_name, role, pharmacy_id
		'''), {'fn': first_name, 'ln': last_name, 'uid': user_id}).mappings().first()
		return jsonify({'success': True, 'user': dict(row)})

@manager_bp.get('/pharmacy')
@jwt_required()
def get_manager_pharmacy():
	user_id = get_jwt_identity()
	with engine.connect() as conn:
		row = conn.execute(text('''
			select p.id, p.name, p.address, p.phone, p.email, p.license_number, p.is_active
			from pharmacies p
			join users u on u.pharmacy_id = p.id
			where u.id = :uid
			limit 1
		'''), {'uid': user_id}).mappings().first()
		if not row:
			return jsonify({'success': False, 'error': 'Pharmacy not found'}), 404
		return jsonify({'success': True, 'pharmacy': dict(row)})

@manager_bp.patch('/pharmacy')
@jwt_required()
def update_manager_pharmacy():
	data = request.get_json(force=True) or {}
	user_id = get_jwt_identity()
	with engine.begin() as conn:
		ph = conn.execute(text('select p.id from pharmacies p join users u on u.pharmacy_id = p.id where u.id = :uid'), {'uid': user_id}).scalar()
		if not ph:
			return jsonify({'success': False, 'error': 'Pharmacy not found'}), 404
		allowed = {k: v for k, v in data.items() if k in ('name','address','phone','email','license_number')}
		if not allowed:
			return jsonify({'success': False, 'error': 'Nothing to update'}), 400
		set_parts = []
		params = {'ph': ph}
		for key, val in allowed.items():
			set_parts.append(f"{key} = :{key}")
			params[key] = val
		row = conn.execute(text(f"""
			update pharmacies set {', '.join(set_parts)}, updated_at = now()
			where id = :ph
			returning id, name, address, phone, email, license_number, is_active
		"""), params).mappings().first()
		return jsonify({'success': True, 'pharmacy': dict(row)})

@manager_bp.post('/pharmacy/request-deletion')
@jwt_required()
def request_pharmacy_deletion():
	data = request.get_json(force=True) or {}
	reason = data.get('reason', '')
	user_id = get_jwt_identity()
	with engine.begin() as conn:
		ph = conn.execute(text('select p.id from pharmacies p join users u on u.pharmacy_id = p.id where u.id = :uid'), {'uid': user_id}).scalar()
		if not ph:
			return jsonify({'success': False, 'error': 'Pharmacy not found'}), 404
		row = conn.execute(text('''
			insert into pharmacy_deletion_requests (pharmacy_id, requested_by, reason, status)
			values (:ph, :uid, :reason, 'pending')
			returning id, status, created_at
		'''), {'ph': ph, 'uid': user_id, 'reason': reason}).mappings().first()
		return jsonify({'success': True, 'request': dict(row)})

@manager_bp.post('/change-password')
@jwt_required()
def change_password():
	data = request.get_json(force=True) or {}
	current_password = data.get('current_password')
	new_password = data.get('new_password')
	if not current_password or not new_password:
		return jsonify({'success': False, 'error': 'current_password and new_password are required'}), 400
	user_id = get_jwt_identity()
	with engine.begin() as conn:
		row = conn.execute(text('select id, password_hash from users where id = :id'), {'id': user_id}).mappings().first()
		if not row:
			return jsonify({'success': False, 'error': 'User not found'}), 404
		if not bcrypt.checkpw(current_password.encode('utf-8'), row['password_hash'].encode('utf-8')):
			return jsonify({'success': False, 'error': 'Current password is incorrect'}), 401
		new_hash = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
		conn.execute(text('update users set password_hash = :ph, updated_at = now() where id = :id'), {'ph': new_hash, 'id': user_id})
		return jsonify({'success': True})

# --- Manager: Analytics ---

@manager_bp.get('/analytics/overview')
@jwt_required()
def analytics_overview():
	user_id = get_jwt_identity()
	frm, to = date_range_params()
	with engine.connect() as conn:
		me = conn.execute(text('select id, role, pharmacy_id from users where id = :id'), {'id': user_id}).mappings().first()
		if not me or me['role'] not in ('manager','admin'):
			return jsonify({'success': False, 'error': 'Forbidden'}), 403
		params = {'ph': me['pharmacy_id'], 'from': frm, 'to': to}
		# Turnover: approx COGS / avg inventory value (using cost_price * stock)
		cogs = conn.execute(text('''
			select coalesce(sum(si.quantity * p.cost_price),0) as cogs
			from sale_items si
			join sales s on s.id = si.sale_id
			join products p on p.id = si.product_id
			where s.pharmacy_id = :ph and s.created_at between :from and :to
		'''), params).scalar() or 0
		inv_val = conn.execute(text('''
			select coalesce(sum(i.current_stock * p.cost_price),0) as inv_val
			from inventory i
			join products p on p.id = i.product_id
			where p.pharmacy_id = :ph
		'''), {'ph': me['pharmacy_id']}).scalar() or 0
		turnover = float(cogs) / float(inv_val) if inv_val > 0 else 0.0
		# Expiry ratio: items expiring in next 30 days or already expired
		expiring = conn.execute(text('''
			select count(*) from inventory i
			join products p on p.id = i.product_id
			where p.pharmacy_id = :ph and i.expiration_date is not null
			and i.expiration_date <= (current_date + interval '30 days')
		'''), {'ph': me['pharmacy_id']}).scalar() or 0
		total_items = conn.execute(text('''
			select count(*) from inventory i
			join products p on p.id = i.product_id
			where p.pharmacy_id = :ph
		'''), {'ph': me['pharmacy_id']}).scalar() or 0
		expiry_ratio = (float(expiring) / float(total_items)) if total_items > 0 else 0.0
		# Waste: expired/damaged adjustments in range vs previous equal window
		waste_current = conn.execute(text('''
			select coalesce(sum(abs(quantity_change)),0) from inventory_adjustment_requests r
			where r.pharmacy_id = :ph and r.status = 'approved'
			and (lower(r.reason) like '%expired%' or lower(r.reason) like '%damaged%') and r.decided_at between :from and :to
		'''), params).scalar() or 0
		prev_from = frm - (to - frm)
		prev_to = frm
		waste_prev = conn.execute(text('''
			select coalesce(sum(abs(quantity_change)),0) from inventory_adjustment_requests r
			where r.pharmacy_id = :ph and r.status = 'approved'
			and (lower(r.reason) like '%expired%' or lower(r.reason) like '%damaged%') and r.decided_at between :prev_from and :prev_to
		'''), {'ph': me['pharmacy_id'], 'prev_from': prev_from, 'prev_to': prev_to}).scalar() or 0
		waste_change = (float(waste_prev) - float(waste_current)) if waste_prev or waste_current else 0.0
		return jsonify({'success': True, 'from': frm.isoformat(), 'to': to.isoformat(), 'metrics': {
			'turnover': round(turnover, 3),
			'expiry_ratio': round(expiry_ratio, 3),
			'waste_current': float(waste_current),
			'waste_prev': float(waste_prev),
			'waste_reduction': round(waste_change, 3)
		}})

@manager_bp.get('/analytics/expiry-alerts')
@jwt_required()
def analytics_expiry_alerts():
	user_id = get_jwt_identity()
	with engine.connect() as conn:
		me = conn.execute(text('select id, role, pharmacy_id from users where id = :id'), {'id': user_id}).mappings().first()
		if not me or me['role'] not in ('manager','admin'):
			return jsonify({'success': False, 'error': 'Forbidden'}), 403
		rows = conn.execute(text('''
			select 
				p.id as product_id,
				p.name,
				sum(case when b.quantity > 0 then b.quantity else 0 end) as total_quantity,
				min(b.expiration_date) filter (where b.expiration_date <= (current_date + interval '30 days')) as next_expiration,
				sum(case when b.expiration_date <= (current_date + interval '30 days') then b.quantity * coalesce(b.cost_price, p.cost_price) else 0 end) as value_at_risk
			from products p
			join inventory_batches b on b.product_id = p.id
			where p.pharmacy_id = :ph 
			  and p.is_active = true
			  and b.quantity > 0
			  and b.expiration_date is not null
			  and b.expiration_date <= (current_date + interval '30 days')
			group by p.id, p.name
			having min(b.expiration_date) is not null
			order by next_expiration asc
		'''), {'ph': me['pharmacy_id']}).mappings().all()
		alerts = []
		for r in rows:
			next_exp = r['next_expiration']
			alerts.append({
				'product_id': r['product_id'],
				'name': r['name'],
				'current_stock': int(r['total_quantity'] or 0),
				'expiration_date': next_exp.isoformat() if next_exp else None,
				'value_at_risk': float(r['value_at_risk'] or 0.0)
			})
		return jsonify({'success': True, 'alerts': alerts})

# --- Manager: set expiration for a product's inventory ---
@manager_bp.patch('/inventory/expiration/<int:product_id>')
@jwt_required()
def set_inventory_expiration(product_id: int):
	data = request.get_json(force=True) or {}
	exp = data.get('expiration_date')  # ISO date string
	user_id = get_jwt_identity()
	with engine.begin() as conn:
		me = conn.execute(text('select id, role, pharmacy_id from users where id = :id'), {'id': user_id}).mappings().first()
		if not me or me['role'] not in ('manager','admin'):
			return jsonify({'success': False, 'error': 'Forbidden'}), 403
		prod = conn.execute(text('select id, pharmacy_id from products where id = :pid'), {'pid': product_id}).mappings().first()
		if not prod or int(prod['pharmacy_id']) != int(me['pharmacy_id']):
			return jsonify({'success': False, 'error': 'Product not found in your pharmacy'}), 404
		conn.execute(text('''
			update inventory set expiration_date = :exp where product_id = :pid
		'''), {'exp': exp, 'pid': product_id})
		return jsonify({'success': True})

# --- Enhanced Sustainability Analytics ---

@manager_bp.get('/sustainability/inventory-utilization')
@jwt_required()
def sustainability_inventory_utilization():
	"""Calculate inventory utilization rate - fast vs slow moving medicines"""
	user_id = get_jwt_identity()
	frm, to = date_range_params()
	with engine.connect() as conn:
		me = conn.execute(text('select id, role, pharmacy_id from users where id = :id'), {'id': user_id}).mappings().first()
		if not me or me['role'] not in ('manager','admin'):
			return jsonify({'success': False, 'error': 'Forbidden'}), 403
		
		params = {'ph': me['pharmacy_id'], 'from': frm, 'to': to}
		
		# Get product movement data aligned with batch inventory, completed sales, and returns
		movement_query = text('''
			with current_inventory as (
				select 
					p.id as product_id,
					coalesce(sum(case when b.quantity > 0 then b.quantity else 0 end), 0) as current_stock,
					coalesce(sum(case when b.quantity > 0 then b.quantity * coalesce(b.cost_price, p.cost_price) else 0 end), 0) as inventory_value
				from products p
				left join inventory_batches b on b.product_id = p.id
				where p.pharmacy_id = :ph and p.is_active = true
				group by p.id
			),
			sales_data as (
				select 
					si.product_id,
					sum(si.quantity) as total_sold,
					sum(si.total_price) as total_revenue
				from sale_items si
				join sales s on s.id = si.sale_id
				where s.pharmacy_id = :ph
				  and s.status = 'completed'
				  and s.created_at between :from and :to
				group by si.product_id
			),
			returns_data as (
				select 
					ri.product_id,
					sum(ri.quantity) as total_returned,
					sum(ri.total_refund) as total_refunded
				from return_items ri
				join returns r on r.id = ri.return_id
				where r.pharmacy_id = :ph
				  and coalesce(r.status, 'completed') = 'completed'
				  and r.created_at between :from and :to
				group by ri.product_id
			)
			select 
				p.id,
				p.name,
				p.cost_price,
				p.unit_price,
				pc.name as category_name,
				coalesce(ci.current_stock, 0) as current_stock,
				coalesce(ci.inventory_value, 0) as inventory_value,
				coalesce(sd.total_sold, 0) as total_sold,
				coalesce(sd.total_revenue, 0) as total_revenue,
				coalesce(rd.total_returned, 0) as total_returned,
				coalesce(rd.total_refunded, 0) as total_refunded
			from products p
			left join product_categories pc on pc.id = p.category_id
			left join current_inventory ci on ci.product_id = p.id
			left join sales_data sd on sd.product_id = p.id
			left join returns_data rd on rd.product_id = p.id
			where p.pharmacy_id = :ph and p.is_active = true
			order by coalesce(sd.total_sold, 0) desc
		''')
		
		products = [dict(r) for r in conn.execute(movement_query, params).mappings().all()]
		
		# Calculate utilization metrics
		fast_moving = []
		slow_moving = []
		medium_moving = []
		
		for product in products:
			current_stock = float(product.get('current_stock') or 0)
			total_sold_units = float(product.get('total_sold') or 0)
			total_returned_units = float(product.get('total_returned') or 0)
			net_sold_units = max(total_sold_units - total_returned_units, 0.0)
			days_range = max((to - frm).days, 1)
			avg_daily_sales = net_sold_units / days_range
			doi = current_stock / avg_daily_sales if avg_daily_sales > 0 else (0 if current_stock == 0 else 999)
			turnover_rate = net_sold_units / max(current_stock + net_sold_units, 1) if (current_stock > 0 or net_sold_units > 0) else 0
			
			product['total_sold'] = int(round(total_sold_units))
			product['total_returned'] = int(round(total_returned_units))
			product['net_sold'] = int(round(net_sold_units))
			product['current_stock'] = int(round(current_stock))
			product['days_of_inventory'] = round(doi, 1)
			product['avg_daily_sales'] = round(avg_daily_sales, 2)
			product['utilization_rate'] = round(min((avg_daily_sales * 30) / max(current_stock, 1) if current_stock > 0 else (1.0 if net_sold_units > 0 else 0.0), 1.0), 3)
			product['turnover_rate'] = round(turnover_rate, 3)
			product['inventory_value'] = float(product.get('inventory_value') or 0.0)
			
			# Categorize by movement speed
			if doi <= 7:  # Fast moving - less than 7 days inventory
				fast_moving.append(product)
			elif doi <= 30:  # Medium moving - 7-30 days
				medium_moving.append(product)
			else:  # Slow moving - more than 30 days
				slow_moving.append(product)
		
		# Calculate overall metrics
		total_products = len(products)
		fast_percentage = (len(fast_moving) / total_products * 100) if total_products > 0 else 0
		medium_percentage = (len(medium_moving) / total_products * 100) if total_products > 0 else 0
		slow_percentage = (len(slow_moving) / total_products * 100) if total_products > 0 else 0
		
		# Sort categories for consistent presentation
		fast_moving.sort(key=lambda x: x['days_of_inventory'])
		medium_moving.sort(key=lambda x: x['days_of_inventory'])
		slow_moving.sort(key=lambda x: x['days_of_inventory'], reverse=True)
		
		total_net_sold = sum(item['net_sold'] for item in products)
		total_inventory = sum(item['current_stock'] for item in products)
		overall_turnover = (float(total_net_sold) / max(total_inventory, 1)) if total_inventory else 0.0
		
		return jsonify({
			'success': True,
			'from': frm.isoformat(),
			'to': to.isoformat(),
			'summary': {
				'total_products': total_products,
				'fast_moving_count': len(fast_moving),
				'medium_moving_count': len(medium_moving),
				'slow_moving_count': len(slow_moving),
				'fast_moving_percentage': round(fast_percentage, 1),
				'medium_moving_percentage': round(medium_percentage, 1),
				'slow_moving_percentage': round(slow_percentage, 1),
				'net_units_sold': total_net_sold,
				'overall_turnover': round(overall_turnover, 2)
			},
			'fast_moving': fast_moving[:10],  # Top 10
			'slow_moving': slow_moving[:10],  # Top 10
			'medium_moving': medium_moving[:10]  # Top 10
		})

@manager_bp.get('/sustainability/expiry-risk')
@jwt_required()
def sustainability_expiry_risk():
	"""Calculate expiry risk index and categorize products by expiry risk"""
	user_id = get_jwt_identity()
	with engine.connect() as conn:
		me = conn.execute(text('select id, role, pharmacy_id from users where id = :id'), {'id': user_id}).mappings().first()
		if not me or me['role'] not in ('manager','admin'):
			return jsonify({'success': False, 'error': 'Forbidden'}), 403
		
		status_filter = (request.args.get('status') or 'all').lower()
		allowed_status = {'all', 'critical', 'high', 'medium', 'low'}
		if status_filter not in allowed_status:
			status_filter = 'all'

		state_filter = (request.args.get('expiry_state') or 'all').lower()
		allowed_states = {'all', 'expired', 'expiring', 'healthy'}
		if state_filter not in allowed_states:
			state_filter = 'all'

		category_id = request.args.get('category_id')
		raw_search = (request.args.get('search') or '').strip().lower()
		include_zero = (request.args.get('include_zero', 'false').lower() in ('true', '1', 'yes'))

		try:
			soon_window = int(request.args.get('soon_days', 30))
		except (TypeError, ValueError):
			soon_window = 30
		try:
			medium_window = int(request.args.get('medium_days', 90))
		except (TypeError, ValueError):
			medium_window = 90
		try:
			critical_window = int(request.args.get('critical_days', 7))
		except (TypeError, ValueError):
			critical_window = 7
		soon_window = max(1, min(soon_window, 365))
		medium_window = max(soon_window + 1, min(medium_window, 720))
		critical_window = max(0, min(critical_window, soon_window))

		keyword_state = None
		if state_filter == 'all' and raw_search:
			if 'expired' in raw_search and 'expiring' not in raw_search:
				keyword_state = 'expired'
			elif 'expiring' in raw_search:
				keyword_state = 'expiring'

		search_term = '' if keyword_state else raw_search
		if keyword_state:
			state_filter = keyword_state

		params = {
			'ph': me['pharmacy_id'],
			'soon_window': soon_window,
			'include_zero': include_zero,
			'category_id': None,
			'search': None,
		}
		if category_id:
			try:
				params['category_id'] = int(category_id)
			except (TypeError, ValueError):
				params['category_id'] = None
		if search_term:
			params['search'] = f"%{search_term}%"

		params['critical_window'] = critical_window
		params['soon_window'] = soon_window
		params['medium_window'] = medium_window

		# Optimized query: calculate risk levels and expiry states in SQL
		rows = conn.execute(text('''
			with product_data as (
				select 
					p.id,
					p.name,
					pc.name as category_name,
					sum(case when b.quantity > 0 then b.quantity else 0 end) as total_quantity,
					sum(case when b.quantity > 0 then b.quantity * coalesce(b.cost_price, p.cost_price) else 0 end) as total_value,
					sum(case when b.expiration_date <= current_date then b.quantity * coalesce(b.cost_price, p.cost_price) else 0 end) as expired_value,
					sum(case when b.expiration_date > current_date and b.expiration_date <= current_date + make_interval(days => :soon_window) then b.quantity * coalesce(b.cost_price, p.cost_price) else 0 end) as expiring_soon_value,
					sum(case when b.expiration_date <= current_date then b.quantity else 0 end) as expired_quantity,
					sum(case when b.expiration_date > current_date and b.expiration_date <= current_date + make_interval(days => :soon_window) then b.quantity else 0 end) as expiring_soon_quantity,
					min(b.expiration_date) as next_expiration,
					(min(b.expiration_date) - current_date)::int as days_to_expiry
				from products p
				join inventory_batches b on b.product_id = p.id
				left join product_categories pc on pc.id = p.category_id
				where p.pharmacy_id = :ph
				  and p.is_active = true
				  and b.expiration_date is not null
				  and (b.quantity > 0 or :include_zero)
				  and (:category_id is null or p.category_id = :category_id)
				  and (:search is null or lower(p.name) like :search or lower(coalesce(pc.name, '')) like :search)
				group by p.id, p.name, pc.name
			)
			select 
				id,
				name,
				category_name,
				total_quantity,
				total_value,
				expired_value,
				expiring_soon_value,
				expired_quantity,
				expiring_soon_quantity,
				next_expiration,
				days_to_expiry,
				case 
					when days_to_expiry is null or expired_quantity > 0 or (days_to_expiry < 0) then 'critical'
					when days_to_expiry <= :critical_window then 'critical'
					when days_to_expiry <= :soon_window then 'high'
					when days_to_expiry <= :medium_window then 'medium'
					else 'low'
				end as risk_level,
				case 
					when days_to_expiry is null or days_to_expiry < 0 or expired_quantity > 0 then 'expired'
					when days_to_expiry <= :soon_window then 'expiring'
					else 'healthy'
				end as expiry_state
			from product_data
			where 
				(:state_filter = 'all' or 
				 case 
					when days_to_expiry is null or days_to_expiry < 0 or expired_quantity > 0 then 'expired'
					when days_to_expiry <= :soon_window then 'expiring'
					else 'healthy'
				 end = :state_filter)
				and (:status_filter = 'all' or
				 case 
					when days_to_expiry is null or expired_quantity > 0 or (days_to_expiry < 0) then 'critical'
					when days_to_expiry <= :critical_window then 'critical'
					when days_to_expiry <= :soon_window then 'high'
					when days_to_expiry <= :medium_window then 'medium'
					else 'low'
				 end = :status_filter)
		'''), {**params, 'state_filter': state_filter, 'status_filter': status_filter}).mappings().all()

		critical_risk = []
		high_risk = []
		medium_risk = []
		low_risk = []

		total_value_sum = 0.0
		expired_value_sum = 0.0
		expiring_value_sum = 0.0

		for row in rows:
			total_value = float(row['total_value'] or 0.0)
			expired_value = float(row['expired_value'] or 0.0)
			expiring_value = float(row['expiring_soon_value'] or 0.0)
			value_at_risk = expired_value + expiring_value
			days_int = row['days_to_expiry']  # Already an int from SQL
			expired_qty = int(row['expired_quantity'] or 0)
			expiring_qty = int(row['expiring_soon_quantity'] or 0)
			total_qty = int(row['total_quantity'] or 0)
			next_exp = row['next_expiration']
			risk_level = row['risk_level']
			expiry_state = row['expiry_state']

			entry = {
				'id': row['id'],
				'name': row['name'],
				'category_name': row['category_name'],
				'current_stock': total_qty,
				'total_value': round(total_value, 2),
				'stock_value': round(total_value, 2),
				'value_at_risk': round(value_at_risk, 2),
				'safe_value': round(max(total_value - value_at_risk, 0.0), 2),
				'expired_value': round(expired_value, 2),
				'expiring_soon_value': round(expiring_value, 2),
				'expired_quantity': expired_qty,
				'expiring_soon_quantity': expiring_qty,
				'days_to_expiry': days_int,
				'next_expiration': next_exp.isoformat() if next_exp else None,
				'risk_level': risk_level,
				'expiry_state': expiry_state,
			}

			total_value_sum += total_value
			expired_value_sum += expired_value
			expiring_value_sum += expiring_value

			if risk_level == 'critical':
				critical_risk.append(entry)
			elif risk_level == 'high':
				high_risk.append(entry)
			elif risk_level == 'medium':
				medium_risk.append(entry)
			else:
				low_risk.append(entry)

		filtered_count = len(critical_risk) + len(high_risk) + len(medium_risk) + len(low_risk)
		safe_value = max(total_value_sum - (expired_value_sum + expiring_value_sum), 0.0)
		if total_value_sum > 0:
			risk_index = min(100.0, ((expired_value_sum * 2 + expiring_value_sum) / total_value_sum) * 100)
		else:
			risk_index = 0.0

		return jsonify({
			'success': True,
			'summary': {
				'total_products_with_expiry': filtered_count,
				'total_value': round(total_value_sum, 2),
				'total_value_at_risk': round(expired_value_sum + expiring_value_sum, 2),
				'expired_value': round(expired_value_sum, 2),
				'expiring_soon_value': round(expiring_value_sum, 2),
				'safe_value': round(safe_value, 2),
				'risk_index': round(risk_index, 1),
				'critical_count': len(critical_risk),
				'high_count': len(high_risk),
				'medium_count': len(medium_risk),
				'low_count': len(low_risk)
			},
			'critical_risk': critical_risk,
			'high_risk': high_risk,
			'medium_risk': medium_risk,
			'low_risk': low_risk
		})

@manager_bp.get('/sustainability/waste-reduction')
@jwt_required()
def sustainability_waste_reduction():
	"""Track pharmaceutical waste reduction and suggest improvements"""
	user_id = get_jwt_identity()
	frm, to = date_range_params()
	with engine.connect() as conn:
		me = conn.execute(text('select id, role, pharmacy_id from users where id = :id'), {'id': user_id}).mappings().first()
		if not me or me['role'] not in ('manager','admin'):
			return jsonify({'success': False, 'error': 'Forbidden'}), 403
		
		params = {'ph': me['pharmacy_id'], 'from': frm, 'to': to}
		
		# Get waste data from inventory adjustments
		waste_query = text('''
			select 
				r.id,
				r.quantity_change,
				r.reason,
				r.created_at,
				r.decided_at,
				p.name as product_name,
				coalesce(p.cost_price, 0) as cost_price,
				coalesce(p.unit_price, 0) as unit_price,
				pc.name as category_name,
				abs(r.quantity_change) * coalesce(p.cost_price, 0) as waste_value
			from inventory_adjustment_requests r
			join products p on p.id = r.product_id
			left join product_categories pc on pc.id = p.category_id
			where r.pharmacy_id = :ph and r.status = 'approved'
			and (lower(r.reason) like '%expired%' or lower(r.reason) like '%damaged%')
			and coalesce(r.decided_at, r.created_at) between :from and :to
			order by coalesce(r.decided_at, r.created_at) desc
		''')
		
		waste_items = [dict(r) for r in conn.execute(waste_query, params).mappings().all()]
		
		# Calculate previous period for comparison
		prev_from = frm - (to - frm)
		prev_to = frm
		prev_params = {'ph': me['pharmacy_id'], 'from': prev_from, 'to': prev_to}
		
		prev_waste_query = text('''
			select 
				coalesce(sum(abs(r.quantity_change) * coalesce(p.cost_price, 0)), 0) as total_waste_value,
				coalesce(sum(abs(r.quantity_change)), 0) as total_waste_units,
				count(*) as waste_incidents
			from inventory_adjustment_requests r
			join products p on p.id = r.product_id
			where r.pharmacy_id = :ph and r.status = 'approved'
			and (lower(r.reason) like '%expired%' or lower(r.reason) like '%damaged%')
			and coalesce(r.decided_at, r.created_at) between :from and :to
		''')
		
		prev_waste = conn.execute(prev_waste_query, prev_params).mappings().first()
		
		# Current period waste
		current_waste_value = float(sum(item['waste_value'] for item in waste_items))
		current_waste_incidents = len(waste_items)
		
		# Calculate reduction metrics
		prev_waste_value = float(prev_waste['total_waste_value']) if prev_waste else 0
		prev_waste_incidents = int(prev_waste['waste_incidents']) if prev_waste else 0
		prev_waste_units = int(prev_waste['total_waste_units']) if prev_waste and 'total_waste_units' in prev_waste else 0
		
		waste_reduction_value = prev_waste_value - current_waste_value
		if prev_waste_value > 0:
			waste_reduction_percentage = (waste_reduction_value / prev_waste_value) * 100
		elif current_waste_value == 0:
			waste_reduction_percentage = 0.0
		else:
			waste_reduction_percentage = -100.0

		total_waste_units = 0
		for entry in waste_items:
			qty = int(entry.get('quantity_change') or 0)
			entry['quantity_change'] = qty
			entry['quantity_wasted'] = abs(qty)
			total_waste_units += entry['quantity_wasted']
			entry['waste_value'] = float(entry.get('waste_value') or 0.0)
			entry['cost_price'] = float(entry.get('cost_price') or 0.0)
			entry['unit_price'] = float(entry.get('unit_price') or 0.0)
			entry['created_at'] = entry['created_at'].isoformat() if entry.get('created_at') else None
			entry['decided_at'] = entry['decided_at'].isoformat() if entry.get('decided_at') else None
			raw_reason = (entry.get('reason') or '').strip()
			entry['reason'] = raw_reason
			# Extract trans_type from reason if it contains expired/damaged keywords
			reason_lower = raw_reason.lower()
			if 'expired' in reason_lower:
				entry['trans_type'] = 'expired'
			elif 'damaged' in reason_lower:
				entry['trans_type'] = 'damaged'
			else:
				entry['trans_type'] = 'unspecified'
			entry['category_name'] = entry.get('category_name') or 'Uncategorized'

		avg_cost_per_incident = current_waste_value / current_waste_incidents if current_waste_incidents else 0.0
		avg_units_per_incident = total_waste_units / current_waste_incidents if current_waste_incidents else 0.0

		reason_breakdown_map = defaultdict(lambda: {'incidents': 0, 'units': 0, 'waste_value': 0.0, 'label': ''})
		trans_type_breakdown_map = defaultdict(lambda: {'incidents': 0, 'units': 0, 'waste_value': 0.0, 'label': ''})
		category_breakdown_map = defaultdict(lambda: {'incidents': 0, 'units': 0, 'waste_value': 0.0, 'label': ''})

		for entry in waste_items:
			reason_key = entry['reason'].strip().lower() if entry['reason'] else (entry.get('trans_type') or 'unspecified')
			reason_label = entry['reason'].strip().title() if entry['reason'] else (entry.get('trans_type', '').replace('_', ' ').title() if entry.get('trans_type') else 'Unspecified')
			reason_data = reason_breakdown_map[reason_key]
			reason_data['incidents'] += 1
			reason_data['units'] += entry['quantity_wasted']
			reason_data['waste_value'] += entry['waste_value']
			reason_data['label'] = reason_label

			type_key = entry.get('trans_type') or 'unspecified'
			type_label = type_key.replace('_', ' ').title() if type_key != 'unspecified' else 'Unspecified'
			type_data = trans_type_breakdown_map[type_key]
			type_data['incidents'] += 1
			type_data['units'] += entry['quantity_wasted']
			type_data['waste_value'] += entry['waste_value']
			type_data['label'] = type_label

			category_key = entry['category_name']
			category_data = category_breakdown_map[category_key]
			category_data['incidents'] += 1
			category_data['units'] += entry['quantity_wasted']
			category_data['waste_value'] += entry['waste_value']
			category_data['label'] = category_key

		def _format_breakdown(source_map):
			items = []
			for key, stats in source_map.items():
				value = stats['waste_value']
				items.append({
					'key': key,
					'label': stats['label'] or key.title(),
					'incidents': stats['incidents'],
					'units': stats['units'],
					'waste_value': round(value, 2),
					'percentage': round((value / current_waste_value) * 100, 1) if current_waste_value else 0.0
				})
			items.sort(key=lambda x: x['waste_value'], reverse=True)
			return items

		reason_breakdown = _format_breakdown(reason_breakdown_map)
		trans_type_breakdown = _format_breakdown(trans_type_breakdown_map)
		category_breakdown = _format_breakdown(category_breakdown_map)[:10]

		from_start = frm.replace(hour=0, minute=0, second=0, microsecond=0)
		to_end = to.replace(hour=0, minute=0, second=0, microsecond=0)
		weekly_trend_query = text('''
			with weeks as (
				select generate_series(date_trunc('week', :from_start), date_trunc('week', :to_end), interval '1 week') as week_start
			)
			select 
				w.week_start::date as week_start,
				(w.week_start + interval '6 days')::date as week_end,
				coalesce(sum(abs(r.quantity_change) * coalesce(p.cost_price, 0)), 0) as waste_value,
				coalesce(sum(abs(r.quantity_change)), 0) as total_units,
				count(r.id) filter (where r.id is not null) as incidents
			from weeks w
			left join inventory_adjustment_requests r
			  on r.pharmacy_id = :ph
			 and r.status = 'approved'
			 and (lower(r.reason) like '%expired%' or lower(r.reason) like '%damaged%')
			 and coalesce(r.decided_at, r.created_at) >= w.week_start
			 and coalesce(r.decided_at, r.created_at) < w.week_start + interval '1 week'
			left join products p on p.id = r.product_id
			group by 1,2
			order by 1
		''')
		trend_rows = conn.execute(weekly_trend_query, {'ph': me['pharmacy_id'], 'from_start': from_start, 'to_end': to_end}).mappings().all()
		weekly_trend = []
		for row in trend_rows:
			week_start = row['week_start']
			week_end = row['week_end']
			waste_val = float(row['waste_value'] or 0.0)
			weekly_trend.append({
				'from': week_start.isoformat(),
				'to': week_end.isoformat(),
				'waste_value': round(waste_val, 2),
				'units': int(row['total_units'] or 0),
				'incidents': int(row['incidents'] or 0)
			})

		returns_query = text('''
			select 
				coalesce(sum(ri.total_refund), 0) as total_refund,
				coalesce(sum(ri.quantity), 0) as total_quantity
			from return_items ri
			join returns r on r.id = ri.return_id
			where r.pharmacy_id = :ph
			  and coalesce(r.status, 'completed') = 'completed'
			  and r.created_at between :from and :to
		''')
		returns_data = conn.execute(returns_query, params).mappings().first()
		recovered_value = float(returns_data['total_refund']) if returns_data else 0.0
		recovered_units = int(returns_data['total_quantity']) if returns_data else 0
		
		# Get products with high waste potential (slow moving + near expiry)
		high_waste_risk_query = text('''
			with batch_stats as (
				select 
					p.id,
					p.name,
					pc.name as category_name,
					coalesce(sum(case when b.quantity > 0 then b.quantity else 0 end), 0) as total_quantity,
					coalesce(sum(case when b.expiration_date < current_date then b.quantity else 0 end), 0) as expired_quantity,
					coalesce(sum(case when b.expiration_date >= current_date and b.expiration_date <= current_date + interval '30 days' then b.quantity else 0 end), 0) as expiring_quantity,
					coalesce(sum(case when b.expiration_date < current_date then b.quantity * coalesce(b.cost_price, p.cost_price) else 0 end), 0) as expired_value,
					coalesce(sum(case when b.expiration_date >= current_date and b.expiration_date <= current_date + interval '30 days' then b.quantity * coalesce(b.cost_price, p.cost_price) else 0 end), 0) as expiring_value,
					min(b.expiration_date) filter (where b.expiration_date >= current_date) as next_expiration,
					max(b.expiration_date) filter (where b.expiration_date < current_date) as last_expiration
				from products p
				left join inventory_batches b on b.product_id = p.id
				left join product_categories pc on pc.id = p.category_id
				where p.pharmacy_id = :ph and p.is_active = true
				group by p.id, p.name, pc.name
			)
			select 
				id,
				name,
				category_name,
				total_quantity as current_stock,
				expired_quantity,
				expiring_quantity,
				expired_value,
				expiring_value,
				(expired_value + expiring_value) as potential_waste_value,
				case when last_expiration is not null then (current_date - last_expiration) else null end as days_expired,
				case when next_expiration is not null then (next_expiration - current_date) else null end as days_to_expiry,
				next_expiration
			from batch_stats
			where total_quantity > 0 and (expired_quantity > 0 or expiring_quantity > 0)
			order by potential_waste_value desc
		''')
		
		high_waste_risk = [dict(r) for r in conn.execute(high_waste_risk_query, {'ph': me['pharmacy_id']}).mappings().all()]
		for item in high_waste_risk:
			item['current_stock'] = int(item.get('current_stock') or 0)
			item['expired_quantity'] = int(item.get('expired_quantity') or 0)
			item['expiring_quantity'] = int(item.get('expiring_quantity') or 0)
			item['potential_waste_value'] = float(item.get('potential_waste_value') or 0.0)
			item['expired_value'] = float(item.get('expired_value') or 0.0)
			item['expiring_value'] = float(item.get('expiring_value') or 0.0)
			item['days_expired'] = int(item['days_expired']) if item.get('days_expired') is not None else 0
			item['days_to_expiry'] = int(item['days_to_expiry']) if item.get('days_to_expiry') is not None else None
			item['category_name'] = item.get('category_name') or 'Uncategorized'
			if item.get('next_expiration'):
				item['next_expiration'] = item['next_expiration'].isoformat()
			else:
				item['next_expiration'] = None
		
		return jsonify({
			'success': True,
			'from': frm.isoformat(),
			'to': to.isoformat(),
			'current_period': {
				'waste_value': round(current_waste_value, 2),
				'waste_incidents': current_waste_incidents,
				'waste_units': total_waste_units,
				'waste_items': waste_items
			},
			'previous_period': {
				'waste_value': round(prev_waste_value, 2),
				'waste_incidents': prev_waste_incidents,
				'waste_units': prev_waste_units
			},
			'reduction_metrics': {
				'value_reduction': round(waste_reduction_value, 2),
				'percentage_reduction': round(waste_reduction_percentage, 1),
				'incident_reduction': prev_waste_incidents - current_waste_incidents,
				'avg_cost_per_incident': round(avg_cost_per_incident, 2),
				'avg_units_per_incident': round(avg_units_per_incident, 2),
				'recovered_value': round(recovered_value, 2),
				'recovered_units': recovered_units
			},
			'reason_breakdown': reason_breakdown,
			'trans_type_breakdown': trans_type_breakdown,
			'category_breakdown': category_breakdown,
			'weekly_trend': weekly_trend,
			'high_waste_risk': high_waste_risk[:20],  # Top 20
			'recommendations': [
				"Implement FIFO (First In, First Out) shelving for all products",
				"Set up automated alerts for products expiring within 30 days",
				"Create discount promotions for products nearing expiry",
				"Review and adjust reorder quantities for slow-moving items",
				"Establish regular waste audits and reporting"
			]
		})

@manager_bp.get('/sustainability/dashboard')
@jwt_required()
def sustainability_dashboard():
	"""Comprehensive sustainability dashboard with all key metrics"""
	user_id = get_jwt_identity()
	frm, to = date_range_params()
	with engine.connect() as conn:
		me = conn.execute(text('select id, role, pharmacy_id from users where id = :id'), {'id': user_id}).mappings().first()
		if not me or me['role'] not in ('manager','admin'):
			return jsonify({'success': False, 'error': 'Forbidden'}), 403
		
		params = {'ph': me['pharmacy_id'], 'from': frm, 'to': to}
		
		# Get all sustainability metrics in one query
		metrics_query = text('''
			with sales_data as (
				select 
					coalesce(sum(si.quantity * p.cost_price), 0) as cogs,
					coalesce(sum(si.total_price), 0) as revenue,
					count(distinct s.id) as total_sales
				from sale_items si
				join sales s on s.id = si.sale_id
				join products p on p.id = si.product_id
				where s.pharmacy_id = :ph and s.created_at between :from and :to
			),
			inventory_data as (
				select 
					coalesce(sum(i.current_stock * p.cost_price), 0) as total_inventory_value,
					count(*) as total_products,
					count(case when i.expiration_date is not null then 1 end) as products_with_expiry
				from inventory i
				join products p on p.id = i.product_id
				where p.pharmacy_id = :ph
			),
			expiry_data as (
				select 
					count(case when i.expiration_date <= current_date then 1 end) as expired_count,
					count(case when i.expiration_date <= (current_date + interval '30 days') then 1 end) as expiring_soon_count,
					coalesce(sum(case when i.expiration_date <= (current_date + interval '30 days') 
						then i.current_stock * p.cost_price end), 0) as expiring_value
				from inventory i
				join products p on p.id = i.product_id
				where p.pharmacy_id = :ph and i.expiration_date is not null
			),
			waste_data as (
				select 
					coalesce(sum(abs(r.quantity_change) * coalesce(p.cost_price, 0)), 0) as current_waste_value,
					count(*) as waste_incidents
				from inventory_adjustment_requests r
				join products p on p.id = r.product_id
				where r.pharmacy_id = :ph and r.status = 'approved'
				and (lower(r.reason) like '%expired%' or lower(r.reason) like '%damaged%')
				and coalesce(r.decided_at, r.created_at) between :from and :to
			)
			select 
				sd.cogs, sd.revenue, sd.total_sales,
				id.total_inventory_value, id.total_products, id.products_with_expiry,
				ed.expired_count, ed.expiring_soon_count, ed.expiring_value,
				wd.current_waste_value, wd.waste_incidents
			from sales_data sd, inventory_data id, expiry_data ed, waste_data wd
		''')
		
		metrics = conn.execute(metrics_query, params).mappings().first()
		
		# Calculate derived metrics
		turnover_rate = float(metrics['cogs']) / max(float(metrics['total_inventory_value']), 1) if metrics['total_inventory_value'] > 0 else 0
		expiry_ratio = float(metrics['expiring_soon_count']) / max(float(metrics['products_with_expiry']), 1) if metrics['products_with_expiry'] > 0 else 0
		waste_ratio = float(metrics['current_waste_value']) / max(float(metrics['total_inventory_value']), 1) if metrics['total_inventory_value'] > 0 else 0
		
		# Calculate sustainability score (0-100)
		sustainability_score = max(0, 100 - (
			(expiry_ratio * 30) +  # 30% weight on expiry risk
			(waste_ratio * 20) +   # 20% weight on waste
			(max(0, 0.5 - turnover_rate) * 20)  # 20% weight on turnover (inverse)
		))
		
		return jsonify({
			'success': True,
			'from': frm.isoformat(),
			'to': to.isoformat(),
			'metrics': {
				'inventory_utilization': {
					'turnover_rate': round(turnover_rate, 3),
					'total_inventory_value': float(metrics['total_inventory_value']),
					'total_products': int(metrics['total_products'])
				},
				'expiry_risk': {
					'expiry_ratio': round(expiry_ratio, 3),
					'expired_count': int(metrics['expired_count']),
					'expiring_soon_count': int(metrics['expiring_soon_count']),
					'expiring_value': float(metrics['expiring_value'])
				},
				'waste_reduction': {
					'waste_value': float(metrics['current_waste_value']),
					'waste_incidents': int(metrics['waste_incidents']),
					'waste_ratio': round(waste_ratio, 3)
				},
				'overall': {
					'sustainability_score': round(sustainability_score, 1),
					'total_revenue': float(metrics['revenue']),
					'total_sales': int(metrics['total_sales'])
				}
			}
		})

@manager_bp.post('/api/pos/process-return')
@jwt_required()
def process_return():
    try:
        user_id = get_jwt_identity()
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['sale_id', 'reason', 'items', 'user_id', 'pharmacy_id']
        for field in required_fields:
            if field not in data:
                return jsonify({'success': False, 'error': f'Missing required field: {field}'}), 400
        
        sale_id = data['sale_id']
        reason = data['reason']
        items = data['items']
        pharmacy_id = data['pharmacy_id']
        
        if not items or len(items) == 0:
            return jsonify({'success': False, 'error': 'No items to return'}), 400
        
        # Ensure returns tables exist (using centralized function)
        ensure_returns_tables()
        
        with engine.begin() as conn:
            # Verify sale exists and belongs to pharmacy
            sale_check = conn.execute(text("""
                SELECT id, sale_number FROM sales 
                WHERE id = :sale_id AND pharmacy_id = :pharmacy_id
            """), {"sale_id": sale_id, "pharmacy_id": pharmacy_id}).fetchone()
            
            if not sale_check:
                return jsonify({'success': False, 'error': 'Sale not found'}), 404
            
            # Generate return number
            import time
            return_number = f"RET-{sale_check[1]}-{int(time.time())}"
            
            # Calculate total refund amount
            total_refund = sum(item['quantity'] * item['unit_price'] for item in items)
            
            # Create return record
            return_result = conn.execute(text("""
                INSERT INTO returns (return_number, sale_id, pharmacy_id, user_id, reason, total_refund_amount, status)
                VALUES (:return_number, :sale_id, :pharmacy_id, :user_id, :reason, :total_refund, 'completed')
                RETURNING id
            """), {
                "return_number": return_number,
                "sale_id": sale_id,
                "pharmacy_id": pharmacy_id,
                "user_id": user_id,
                "reason": reason,
                "total_refund": total_refund
            })
            
            return_id = return_result.fetchone()[0]
            
            # Create return items and update inventory
            for item in items:
                product_id = item['product_id']
                quantity = item['quantity']
                unit_price = item['unit_price']
                
                # Insert return item
                conn.execute(text("""
                    INSERT INTO return_items (return_id, product_id, quantity, unit_price)
                    VALUES (:return_id, :product_id, :quantity, :unit_price)
                """), {
                    "return_id": return_id,
                    "product_id": product_id,
                    "quantity": quantity,
                    "unit_price": unit_price
                })
                
                # Check if inventory record exists
                inventory_check = conn.execute(text("""
                    SELECT current_stock FROM inventory WHERE product_id = :product_id
                """), {"product_id": product_id}).fetchone()
                
                if inventory_check:
                    # Update existing inventory - add back to stock
                    inventory_result = conn.execute(text("""
                        UPDATE inventory 
                        SET current_stock = current_stock + :quantity,
                            last_updated = now()
                        WHERE product_id = :product_id
                    """), {
                        "product_id": product_id,
                        "quantity": quantity
                    })
                else:
                    # Create new inventory record
                    conn.execute(text("""
                        INSERT INTO inventory (product_id, current_stock, last_updated)
                        VALUES (:product_id, :quantity, now())
                    """), {
                        "product_id": product_id,
                        "quantity": quantity
                    })
            
            return jsonify({
                'success': True, 
                'message': 'Return processed successfully',
                'return_id': return_id,
                'return_number': return_number,
                'total_refund': total_refund
            })
            
    except Exception as e:
        return jsonify({'success': False, 'error': f'Failed to process return: {str(e)}'}), 500

@manager_bp.get('/api/pos/return-details/<int:sale_id>')
@jwt_required()
def get_return_details(sale_id):
    try:
        user_id = get_jwt_identity()
        
        # Get user's pharmacy_id
        with engine.begin() as conn:
            user_result = conn.execute(text("SELECT pharmacy_id FROM users WHERE id = :user_id"), {"user_id": user_id}).fetchone()
            if not user_result:
                return jsonify({'success': False, 'error': 'User not found'}), 404
            
            pharmacy_id = user_result[0]
            
            # Get return details for the sale
            returns_query = text("""
                SELECT 
                    r.id,
                    r.return_number,
                    r.reason,
                    r.total_refund_amount,
                    r.created_at,
                    r.status,
                    u.username as editor_username,
                    u.first_name as editor_first_name,
                    u.last_name as editor_last_name,
                    r.updated_at
                FROM returns r
                LEFT JOIN users u ON u.id = r.user_id
                WHERE r.sale_id = :sale_id AND r.pharmacy_id = :pharmacy_id
                ORDER BY r.created_at DESC
            """)
            
            returns = conn.execute(returns_query, {"sale_id": sale_id, "pharmacy_id": pharmacy_id}).fetchall()
            
            # Get return items for each return
            formatted_returns = []
            for ret in returns:
                items_query = text("""
                    SELECT 
                        ri.product_id,
                        p.name as product_name,
                        ri.quantity,
                        ri.unit_price,
                        ri.total_refund
                    FROM return_items ri
                    JOIN products p ON p.id = ri.product_id
                    WHERE ri.return_id = :return_id
                """)
                
                items = conn.execute(items_query, {"return_id": ret[0]}).fetchall()
                
                # Build editor display name
                editor_full_name = ((ret[7] or '') + ' ' + (ret[8] or '')).strip()
                editor_display = editor_full_name if editor_full_name else (ret[6] or None)

                formatted_returns.append({
                    'id': ret[0],
                    'return_number': ret[1],
                    'reason': ret[2],
                    'total_refund_amount': float(ret[3]),
                    'created_at': ret[4].isoformat(),
                    'status': ret[5],
                    'processed_by_name': editor_display,
                    'updated_at': (ret[9].isoformat() if ret[9] else None),
                    'items': [{
                        'product_id': item[0],
                        'product_name': item[1],
                        'quantity': item[2],
                        'unit_price': float(item[3]),
                        'total_refund': float(item[4])
                    } for item in items]
                })
            
            return jsonify({'success': True, 'returns': formatted_returns})
            
    except Exception as e:
        print(f"Error fetching return details: {e}")
        return jsonify({'success': False, 'error': 'Failed to fetch return details'}), 500

@manager_bp.get('/returned-items')
@jwt_required()
def get_returned_items():
    try:
        user_id = get_jwt_identity()
        
        # Get user's pharmacy_id
        with engine.begin() as conn:
            user_result = conn.execute(text("SELECT pharmacy_id FROM users WHERE id = :user_id"), {"user_id": user_id}).fetchone()
            if not user_result:
                return jsonify({'success': False, 'error': 'User not found'}), 404
            
            pharmacy_id = user_result[0]
            
            # Get returned items data
            returns_query = text("""
                SELECT 
                    r.id,
                    r.return_number,
                    r.reason,
                    r.total_refund_amount,
                    r.created_at,
                    s.sale_number,
                    COUNT(ri.id) as item_count,
                    r.updated_at,
                    u.username as editor_username,
                    u.first_name as editor_first_name,
                    u.last_name as editor_last_name,
                    r.user_id
                FROM returns r
                JOIN sales s ON s.id = r.sale_id
                LEFT JOIN return_items ri ON ri.return_id = r.id
                LEFT JOIN users u ON u.id = r.user_id
                WHERE r.pharmacy_id = :pharmacy_id
                GROUP BY r.id, r.return_number, r.reason, r.total_refund_amount, r.created_at, s.sale_number, r.updated_at, u.username, u.first_name, u.last_name, r.user_id
                ORDER BY r.created_at DESC
                LIMIT 100
            """)
            
            returns = conn.execute(returns_query, {"pharmacy_id": pharmacy_id}).fetchall()
            
            # Get detailed return items
            return_items_query = text("""
                SELECT 
                    ri.return_id,
                    ri.product_id,
                    p.name as product_name,
                    ri.quantity,
                    ri.unit_price,
                    ri.total_refund,
                    ri.created_at
                FROM return_items ri
                JOIN products p ON p.id = ri.product_id
                JOIN returns r ON r.id = ri.return_id
                WHERE r.pharmacy_id = :pharmacy_id
                ORDER BY ri.created_at DESC
            """)
            
            return_items = conn.execute(return_items_query, {"pharmacy_id": pharmacy_id}).fetchall()
            
            # Group items by return
            items_by_return = {}
            for item in return_items:
                return_id = item[0]
                if return_id not in items_by_return:
                    items_by_return[return_id] = []
                items_by_return[return_id].append({
                    'product_id': item[1],
                    'product_name': item[2],
                    'quantity': item[3],
                    'unit_price': float(item[4]),
                    'total_refund': float(item[5]),
                    'created_at': item[6].isoformat()
                })
            
            # Format returns with items
            formatted_returns = []
            for ret in returns:
                editor_full_name = ((ret[9] or '') + ' ' + (ret[10] or '')).strip()
                editor_display = editor_full_name if editor_full_name else (ret[8] or None)
                formatted_returns.append({
                    'id': ret[0],
                    'return_number': ret[1],
                    'reason': ret[2],
                    'total_refund_amount': float(ret[3]),
                    'created_at': ret[4].isoformat(),
                    'sale_number': ret[5],
                    'item_count': ret[6],
                    'updated_at': (ret[7].isoformat() if ret[7] else None),
                    'processed_by_name': editor_display,
                    'user_id': ret[11],
                    'items': items_by_return.get(ret[0], [])
                })
            
            return jsonify({'success': True, 'returns': formatted_returns})
            
    except Exception as e:
        print(f"Error fetching returned items: {e}")
        return jsonify({'success': False, 'error': 'Failed to fetch returned items'}), 500

# =========================
# INVENTORY: SUPPLIERS, POs, BATCHES, DASHBOARD
# =========================

def _ensure_suppliers_and_po_tables(conn) -> None:
    """Ensure suppliers and purchase order tables exist (normalized)"""
    # Create suppliers table (matches schema.sql)
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS suppliers (
            id bigserial primary key,
            pharmacy_id bigint not null references pharmacies(id) on delete cascade,
            name text not null,
            contact_name text,
            email text,
            phone text,
            address text,
            lead_time_days int default 7,
            is_active boolean default true,
            created_at timestamptz default now(),
            updated_at timestamptz default now(),
            unique(pharmacy_id, name)
        );
    """))
    
    # Create purchase_orders table (matches schema.sql, with expected_delivery_at for flexibility)
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS purchase_orders (
            id bigserial primary key,
            pharmacy_id bigint not null references pharmacies(id) on delete cascade,
            po_number text not null,
            supplier_id bigint not null references suppliers(id),
            status text not null default 'draft',
            total_amount numeric(12, 2) default 0,
            created_by bigint not null references users(id),
            expected_delivery_at date,
            notes text,
            created_at timestamptz default now(),
            updated_at timestamptz default now(),
            unique(pharmacy_id, po_number)
        );
    """))
    
    # Add expected_delivery_at and notes columns if they don't exist (for existing tables)
    try:
        conn.execute(text("ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS expected_delivery_at date;"))
        conn.execute(text("ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS notes text;"))
    except Exception:
        pass
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS purchase_order_items (
            id bigserial primary key,
            po_id bigint not null references purchase_orders(id) on delete cascade,
            product_id bigint not null references products(id) on delete restrict,
            quantity int not null check (quantity > 0),
            unit_cost numeric(12,2) not null check (unit_cost >= 0),
            total_cost numeric(12,2) not null check (total_cost >= 0),
            created_at timestamptz default now()
        );
    """))
    
    # Create indexes for suppliers and purchase orders (if not exist)
    try:
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_suppliers_pharmacy ON suppliers(pharmacy_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_purchase_orders_pharmacy ON purchase_orders(pharmacy_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_purchase_order_items_po ON purchase_order_items(po_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_purchase_order_items_product ON purchase_order_items(product_id)"))
    except Exception:
        pass


def _ensure_batches_table(conn) -> None:
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS inventory_batches (
            id bigserial primary key,
            product_id bigint not null references products(id) on delete cascade,
            batch_number text not null,
            quantity int not null check (quantity >= 0),
            expiration_date date,
            delivery_date date,
            supplier_id bigint references suppliers(id),
            cost_price numeric(12, 2),
            received_at timestamptz default now(),
            unique(product_id, batch_number)
        );
    """))
    
    # Add new columns if they don't exist (for existing tables)
    try:
        conn.execute(text("ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS delivery_date date;"))
        conn.execute(text("ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS supplier_id bigint references suppliers(id);"))
        conn.execute(text("ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS cost_price numeric(12, 2);"))
    except Exception:
        pass  # Columns might already exist
    
    # Add composite index for expiry risk queries (if not exists)
    try:
        conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_inventory_batches_product_expiry_qty 
            ON inventory_batches(product_id, expiration_date, quantity) 
            WHERE expiration_date IS NOT NULL
        """))
    except Exception:
        pass


@manager_bp.get('/inventory/dashboard')
@jwt_required()
def inventory_dashboard():
    """Return inventory KPIs for dashboard: totals, low stock, expiry, suppliers, waste ratio."""
    user_id = get_jwt_identity()
    with engine.begin() as conn:
        me = conn.execute(text('select id, role, pharmacy_id from users where id = :id'), {'id': user_id}).mappings().first()
        if not me:
            return jsonify({'success': False, 'error': 'User not found'}), 404
        ph = me['pharmacy_id']
        # Ensure optional tables exist before select
        try:
            _ensure_suppliers_and_po_tables(conn)
        except Exception:
            pass
        try:
            ensure_inventory_expiration_column()
        except Exception:
            pass

        totals = conn.execute(text("""
            select 
              (select count(*) from products p where p.pharmacy_id = :ph and p.is_active = true) as total_products,
              (select coalesce(count(*),0) from suppliers s where s.pharmacy_id = :ph and s.is_active = true) as total_suppliers,
              (
                select coalesce(count(*),0)
                from (
                  select p.id,
                         coalesce(sum(case when b.quantity > 0 then b.quantity else 0 end), 0) as qty,
                         coalesce(p.reorder_point, 10) as reorder_point
                  from products p
                  left join inventory_batches b on b.product_id = p.id
                  where p.pharmacy_id = :ph and p.is_active = true
                  group by p.id, reorder_point
                ) stock
                where coalesce(qty, 0) <= reorder_point
              ) as low_stock_count,
              (
                select coalesce(count(distinct p.id),0)
                from products p
                join inventory_batches b on b.product_id = p.id
                where p.pharmacy_id = :ph and p.is_active = true
                  and b.quantity > 0
                  and b.expiration_date is not null
                  and b.expiration_date < current_date
              ) as expired_count,
              (
                select coalesce(count(distinct p.id),0)
                from products p
                join inventory_batches b on b.product_id = p.id
                where p.pharmacy_id = :ph and p.is_active = true
                  and b.quantity > 0
                  and b.expiration_date is not null
                  and b.expiration_date between current_date and (current_date + interval '30 days')
              ) as expiring_soon_count
        """), {'ph': ph}).mappings().first()

        waste_value = conn.execute(text("""
            select coalesce(sum(abs(r.quantity_change) * p.cost_price), 0) as waste_value
            from inventory_adjustment_requests r
            join products p on p.id = r.product_id
            where r.pharmacy_id = :ph and r.status = 'approved' and (lower(r.reason) like '%expired%' or lower(r.reason) like '%damaged%')
              and r.decided_at >= (current_date - interval '30 days')
        """), {'ph': ph}).scalar() or 0
        inv_value = conn.execute(text("""
            select coalesce(sum(i.current_stock * p.cost_price),0)
            from inventory i join products p on p.id = i.product_id
            where p.pharmacy_id = :ph
        """), {'ph': ph}).scalar() or 0
        waste_rate = float(waste_value) / float(inv_value) if inv_value and float(inv_value) > 0 else 0.0

        return jsonify({'success': True, 'metrics': {
            'total_products': int(totals['total_products']) if totals else 0,
            'total_suppliers': int(totals['total_suppliers']) if totals else 0,
            'low_stock_count': int(totals['low_stock_count']) if totals else 0,
            'expired_count': int(totals['expired_count']) if totals else 0,
            'expiring_soon_count': int(totals['expiring_soon_count']) if totals else 0,
            'waste_rate': round(waste_rate, 4),
        }})


@manager_bp.get('/inventory/history')
@jwt_required()
def inventory_history():
    """Return end-of-month inventory snapshots for the last N months.
    Query params: months (default 6)
    """
    user_id = get_jwt_identity()
    months = int(request.args.get('months', 6))
    months = max(1, min(months, 24))
    with engine.connect() as conn:
        me = conn.execute(text('select id, role, pharmacy_id from users where id = :id'), {'id': user_id}).mappings().first()
        if not me or me['role'] not in ('manager','admin'):
            return jsonify({'success': False, 'error': 'Forbidden'}), 403
        # Approximate EOM by aggregating current batches received before each month end minus sales (optional simplified)
        # For simplicity, we'll compute snapshots from current inventory and extrapolate backwards using returns/sales deltas if available.
        # If historical_sales_daily exists, we can subtract cumulative sold qty per product.
        rows = conn.execute(text('''
            with months as (
                select (date_trunc('month', current_date) - (interval '1 month' * g))::date as month_start,
                       (date_trunc('month', current_date) - (interval '1 month' * g) + interval '1 month - 1 day')::date as month_end
                from generate_series(0, :m-1) g
            )
            select m.month_start, m.month_end,
                   p.id as product_id, p.name,
                   coalesce(i.current_stock,0) as current_stock,
                   coalesce(p.reorder_point,0) as reorder_point,
                   pc.name as category_name
            from months m
            cross join products p
            left join inventory i on i.product_id = p.id
            left join product_categories pc on pc.id = p.category_id
            where p.pharmacy_id = :ph and p.is_active = true
            order by m.month_start desc, p.name asc
        '''), {'m': months, 'ph': me['pharmacy_id']}).mappings().all()
        # Format result grouped by month
        by_month = {}
        for r in rows:
            key = r['month_start'].isoformat()
            by_month.setdefault(key, {'from': key, 'to': r['month_end'].isoformat(), 'items': []})
            by_month[key]['items'].append({
                'product_id': r['product_id'],
                'name': r['name'],
                'category_name': r['category_name'],
                'current_stock': int(r['current_stock']),
                'reorder_point': int(r['reorder_point'] or 0),
            })
        ordered = sorted(by_month.values(), key=lambda x: x['from'], reverse=True)
        return jsonify({'success': True, 'months': ordered})


@manager_bp.get('/batches/<int:product_id>')
@jwt_required()
def list_batches(product_id):
    """List all batches (deliveries) for a product."""
    user_id = get_jwt_identity()
    with engine.connect() as conn:
        _ensure_batches_table(conn)
        _ensure_suppliers_and_po_tables(conn)
        
        me = conn.execute(text('select id, role, pharmacy_id from users where id = :id'), {'id': user_id}).mappings().first()
        if not me or me['role'] not in ('manager','admin'):
            return jsonify({'success': False, 'error': 'Forbidden'}), 403
        
        # Verify product belongs to pharmacy
        product = conn.execute(text('select id, pharmacy_id from products where id = :id'), {'id': product_id}).mappings().first()
        if not product or product['pharmacy_id'] != me['pharmacy_id']:
            return jsonify({'success': False, 'error': 'Product not found'}), 404
        
        batches = conn.execute(text('''
            select b.id, b.batch_number, b.quantity, b.expiration_date, b.delivery_date, 
                   b.supplier_id, b.cost_price, b.received_at,
                   s.name as supplier_name
            from inventory_batches b
            left join suppliers s on s.id = b.supplier_id
            where b.product_id = :pid
            order by b.received_at desc
        '''), {'pid': product_id}).mappings().all()
        
        return jsonify({'success': True, 'batches': [dict(b) for b in batches]})


# Staff-visible: read-only batches listing (same pharmacy)
@manager_bp.get('/api/staff/batches/<int:product_id>')
@jwt_required()
def staff_list_batches(product_id: int):
    """List deliveries for a product for any authenticated user in the same pharmacy."""
    user_id = get_jwt_identity()
    with engine.connect() as conn:
        _ensure_batches_table(conn)
        _ensure_suppliers_and_po_tables(conn)

        me = conn.execute(text('select id, pharmacy_id from users where id = :id'), {'id': user_id}).mappings().first()
        if not me:
            return jsonify({'success': False, 'error': 'User not found'}), 404

        product = conn.execute(text('select id, pharmacy_id from products where id = :id'), {'id': product_id}).mappings().first()
        if not product or int(product['pharmacy_id']) != int(me['pharmacy_id']):
            return jsonify({'success': False, 'error': 'Product not found'}), 404

        batches = conn.execute(text('''
            select b.id, b.batch_number, b.quantity, b.expiration_date, b.delivery_date,
                   b.supplier_id, b.cost_price, b.received_at,
                   s.name as supplier_name
            from inventory_batches b
            left join suppliers s on s.id = b.supplier_id
            where b.product_id = :pid
            order by b.received_at desc
        '''), {'pid': product_id}).mappings().all()

        return jsonify({'success': True, 'batches': [dict(b) for b in batches]})


@manager_bp.post('/batches/<int:product_id>')
@jwt_required()
def create_batch(product_id):
    """Create a new batch (delivery) for a product."""
    user_id = get_jwt_identity()
    data = request.get_json()
    
    if not data:
        return jsonify({'success': False, 'error': 'No data provided'}), 400
    
    with engine.connect() as conn:
        _ensure_batches_table(conn)
        
        me = conn.execute(text('select id, role, pharmacy_id from users where id = :id'), {'id': user_id}).mappings().first()
        if not me or me['role'] not in ('manager','admin'):
            return jsonify({'success': False, 'error': 'Forbidden'}), 403
        
        # Verify product belongs to pharmacy
        product = conn.execute(text('select id, pharmacy_id from products where id = :id'), {'id': product_id}).mappings().first()
        if not product or product['pharmacy_id'] != me['pharmacy_id']:
            return jsonify({'success': False, 'error': 'Product not found'}), 404
        
        # Create batch
        batch_number = data.get('batch_number', f'DEL-{int(time.time())}')
        quantity = int(data.get('quantity', 0))
        expiration_date = data.get('expiration_date')
        delivery_date = data.get('delivery_date')
        supplier_id = data.get('supplier_id')
        cost_price = data.get('cost_price')
        
        if quantity <= 0:
            return jsonify({'success': False, 'error': 'Quantity must be positive'}), 400
        
        # Insert batch
        conn.execute(text('''
            insert into inventory_batches (product_id, batch_number, quantity, expiration_date, delivery_date, supplier_id, cost_price)
            values (:pid, :bn, :qty, :exp, :del, :sid, :cp)
        '''), {
            'pid': product_id,
            'bn': batch_number,
            'qty': quantity,
            'exp': expiration_date,
            'del': delivery_date,
            'sid': supplier_id,
            'cp': cost_price
        })
        
        # Update inventory total (excluding expired products)
        total = conn.execute(text('''
            select coalesce(sum(quantity),0) 
            from inventory_batches 
            where product_id = :pid 
            and (expiration_date is null or expiration_date > current_date)
        '''), {'pid': product_id}).scalar() or 0
        # Persist latest average cost into products.cost_price (simple average of deliveries)
        avg_cost = conn.execute(text('''
            select avg(cost_price)::numeric(12,2)
            from inventory_batches
            where product_id = :pid and cost_price is not null
        '''), {'pid': product_id}).scalar()
        if avg_cost is not None:
            conn.execute(text('update products set cost_price = :avg where id = :pid'), {'avg': avg_cost, 'pid': product_id})

        conn.execute(text('''
            insert into inventory (product_id, current_stock) 
            values (:pid, :total)
            on conflict (product_id) do update set 
                current_stock = :total,
                last_updated = now()
        '''), {'pid': product_id, 'total': total})
        
        conn.commit()
        return jsonify({'success': True, 'message': 'Batch created'})


@manager_bp.patch('/batches/<int:batch_id>')
@jwt_required()
def update_batch(batch_id):
    """Update a batch (delivery)."""
    user_id = get_jwt_identity()
    data = request.get_json()
    
    if not data:
        return jsonify({'success': False, 'error': 'No data provided'}), 400
    
    with engine.connect() as conn:
        _ensure_batches_table(conn)
        _ensure_suppliers_and_po_tables(conn)
        
        me = conn.execute(text('select id, role, pharmacy_id from users where id = :id'), {'id': user_id}).mappings().first()
        if not me or me['role'] not in ('manager','admin'):
            return jsonify({'success': False, 'error': 'Forbidden'}), 403
        
        # Verify batch belongs to pharmacy
        owner = conn.execute(text('''
            select p.pharmacy_id, b.product_id 
            from inventory_batches b 
            join products p on p.id=b.product_id 
            where b.id=:id
        '''), {'id': batch_id}).mappings().first()
        
        if not owner or owner['pharmacy_id'] != me['pharmacy_id']:
            return jsonify({'success': False, 'error': 'Batch not found'}), 404
        
        # Update batch
        quantity = data.get('quantity')
        expiration_date = data.get('expiration_date')
        delivery_date = data.get('delivery_date')
        supplier_id = data.get('supplier_id')
        cost_price = data.get('cost_price')
        
        if quantity is not None and quantity <= 0:
            return jsonify({'success': False, 'error': 'Quantity must be positive'}), 400
        
        # Update batch fields
        update_fields = []
        params = {'id': batch_id}
        
        if quantity is not None:
            update_fields.append('quantity = :qty')
            params['qty'] = int(quantity)
        if expiration_date is not None:
            update_fields.append('expiration_date = :exp')
            params['exp'] = expiration_date
        if delivery_date is not None:
            update_fields.append('delivery_date = :del')
            params['del'] = delivery_date
        if supplier_id is not None:
            update_fields.append('supplier_id = :sid')
            params['sid'] = supplier_id
        if cost_price is not None:
            update_fields.append('cost_price = :cp')
            params['cp'] = cost_price
        
        if update_fields:
            conn.execute(text(f'''
                update inventory_batches set {', '.join(update_fields)}
                where id = :id
            '''), params)
        
        # Update inventory total (excluding expired products)
        total = conn.execute(text('''
            select coalesce(sum(quantity),0) 
            from inventory_batches 
            where product_id = :pid 
            and (expiration_date is null or expiration_date > current_date)
        '''), {'pid': owner['product_id']}).scalar() or 0
        # Persist latest average cost into products.cost_price
        avg_cost = conn.execute(text('''
            select avg(cost_price)::numeric(12,2)
            from inventory_batches
            where product_id = :pid and cost_price is not null
        '''), {'pid': owner['product_id']}).scalar()
        if avg_cost is not None:
            conn.execute(text('update products set cost_price = :avg where id = :pid'), {'avg': avg_cost, 'pid': owner['product_id']})

        # Persist latest average cost into products.cost_price
        avg_cost = conn.execute(text('''
            select avg(cost_price)::numeric(12,2)
            from inventory_batches
            where product_id = :pid and cost_price is not null
        '''), {'pid': owner['product_id']}).scalar()
        if avg_cost is not None:
            conn.execute(text('update products set cost_price = :avg where id = :pid'), {'avg': avg_cost, 'pid': owner['product_id']})

        conn.execute(text('''
            insert into inventory (product_id, current_stock) 
            values (:pid, :total)
            on conflict (product_id) do update set 
                current_stock = :total,
                last_updated = now()
        '''), {'pid': owner['product_id'], 'total': total})
        
        conn.commit()
        return jsonify({'success': True, 'message': 'Batch updated'})


@manager_bp.delete('/batches/<int:batch_id>')
@jwt_required()
def delete_batch(batch_id):
    """Delete a batch (delivery)."""
    user_id = get_jwt_identity()
    with engine.connect() as conn:
        _ensure_batches_table(conn)
        _ensure_suppliers_and_po_tables(conn)
        me = conn.execute(text('select id, role, pharmacy_id from users where id = :id'), {'id': user_id}).mappings().first()
        if not me or me['role'] not in ('manager','admin'):
            return jsonify({'success': False, 'error': 'Forbidden'}), 403
        
        # Verify batch belongs to pharmacy
        owner = conn.execute(text('''
            select p.pharmacy_id, b.product_id 
            from inventory_batches b 
            join products p on p.id=b.product_id 
            where b.id=:id
        '''), {'id': batch_id}).mappings().first()
        
        if not owner or owner['pharmacy_id'] != me['pharmacy_id']:
            return jsonify({'success': False, 'error': 'Batch not found'}), 404
        
        # Delete batch
        conn.execute(text('delete from inventory_batches where id = :id'), {'id': batch_id})
        
        # Update inventory total (excluding expired products)
        total = conn.execute(text('''
            select coalesce(sum(quantity),0) 
            from inventory_batches 
            where product_id = :pid 
            and (expiration_date is null or expiration_date > current_date)
        '''), {'pid': owner['product_id']}).scalar() or 0
        conn.execute(text('''
            insert into inventory (product_id, current_stock) 
            values (:pid, :total)
            on conflict (product_id) do update set 
                current_stock = :total,
                last_updated = now()
        '''), {'pid': owner['product_id'], 'total': total})
        
        conn.commit()
        return jsonify({'success': True, 'message': 'Batch deleted'})


# ---------- Suppliers ----------
@manager_bp.get('/suppliers')
@jwt_required()
def list_suppliers():
    user_id = get_jwt_identity()
    with engine.begin() as conn:
        me = conn.execute(text('select id, role, pharmacy_id from users where id = :id'), {'id': user_id}).mappings().first()
        if not me or me['role'] not in ('manager','admin'):
            return jsonify({'success': False, 'error': 'Forbidden'}), 403
        _ensure_suppliers_and_po_tables(conn)
        rows = conn.execute(text('''
            select id, name, contact_name, email, phone, address, lead_time_days, is_active
            from suppliers where pharmacy_id = :ph order by name asc
        '''), {'ph': me['pharmacy_id']}).mappings().all()
        return jsonify({'success': True, 'suppliers': [dict(r) for r in rows]})


@manager_bp.post('/suppliers')
@jwt_required()
def create_supplier():
    data = request.get_json(force=True) or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'success': False, 'error': 'name is required'}), 400
    user_id = get_jwt_identity()
    with engine.begin() as conn:
        me = conn.execute(text('select id, role, pharmacy_id from users where id = :id'), {'id': user_id}).mappings().first()
        if not me or me['role'] not in ('manager','admin'):
            return jsonify({'success': False, 'error': 'Forbidden'}), 403
        _ensure_suppliers_and_po_tables(conn)
        row = conn.execute(text('''
            insert into suppliers (pharmacy_id, name, contact_name, email, phone, address, lead_time_days, is_active)
            values (:ph, :n, :cn, :e, :p, :a, :lt, true)
            returning id, name, contact_name, email, phone, address, lead_time_days, is_active
        '''), {
            'ph': me['pharmacy_id'],
            'n': name,
            'cn': (data.get('contact_name') or '').strip() or None,
            'e': (data.get('email') or '').strip() or None,
            'p': (data.get('phone') or '').strip() or None,
            'a': (data.get('address') or '').strip() or None,
            'lt': int(data.get('lead_time_days') or 7),
        }).mappings().first()
        return jsonify({'success': True, 'supplier': dict(row)})


@manager_bp.patch('/suppliers/<int:supplier_id>')
@jwt_required()
def update_supplier(supplier_id: int):
    data = request.get_json(force=True) or {}
    user_id = get_jwt_identity()
    with engine.begin() as conn:
        me = conn.execute(text('select id, role, pharmacy_id from users where id = :id'), {'id': user_id}).mappings().first()
        if not me or me['role'] not in ('manager','admin'):
            return jsonify({'success': False, 'error': 'Forbidden'}), 403
        _ensure_suppliers_and_po_tables(conn)
        conn.execute(text('''
            update suppliers set 
              name = coalesce(:n, name),
              contact_name = coalesce(:cn, contact_name),
              email = coalesce(:e, email),
              phone = coalesce(:p, phone),
              address = coalesce(:a, address),
              lead_time_days = coalesce(:lt, lead_time_days),
              is_active = coalesce(:ia, is_active),
              updated_at = now()
            where id = :id and pharmacy_id = :ph
        '''), {
            'id': supplier_id,
            'ph': me['pharmacy_id'],
            'n': data.get('name'),
            'cn': data.get('contact_name'),
            'e': data.get('email'),
            'p': data.get('phone'),
            'a': data.get('address'),
            'lt': int(data['lead_time_days']) if data.get('lead_time_days') is not None else None,
            'ia': bool(data['is_active']) if data.get('is_active') is not None else None,
        })
        return jsonify({'success': True})


@manager_bp.patch('/api/inventory/requests/<int:req_id>')
@jwt_required()
def update_inventory_request(req_id: int):
    """Allow the requester to edit their pending request (quantity_change, reason)."""
    user_id = get_jwt_identity()
    data = request.get_json(force=True) or {}
    with engine.begin() as conn:
        me = conn.execute(text('select id, role, pharmacy_id from users where id = :id'), {'id': user_id}).mappings().first()
        if not me:
            return jsonify({'success': False, 'error': 'User not found'}), 404
        req = conn.execute(text('select id, requested_by, status from inventory_adjustment_requests where id = :id'), {'id': req_id}).mappings().first()
        if not req:
            return jsonify({'success': False, 'error': 'Request not found'}), 404
        if int(req['requested_by']) != int(user_id):
            return jsonify({'success': False, 'error': 'Forbidden'}), 403
        if req['status'] != 'pending':
            return jsonify({'success': False, 'error': 'Only pending requests can be edited'}), 400
        fields = []
        params = {'id': req_id}
        if 'quantity_change' in data and data['quantity_change'] is not None:
            fields.append('quantity_change = :qty')
            params['qty'] = int(data['quantity_change'])
        if 'reason' in data:
            fields.append('reason = :reason')
            params['reason'] = data.get('reason') or ''
        if not fields:
            return jsonify({'success': False, 'error': 'No changes provided'}), 400
        conn.execute(text(f'update inventory_adjustment_requests set {", ".join(fields)} where id = :id'), params)
        return jsonify({'success': True})


@manager_bp.delete('/api/inventory/requests/<int:req_id>')
@jwt_required()
def delete_inventory_request(req_id: int):
    """Allow the requester to delete their pending request."""
    user_id = get_jwt_identity()
    with engine.begin() as conn:
        req = conn.execute(text('select id, requested_by, status from inventory_adjustment_requests where id = :id'), {'id': req_id}).mappings().first()
        if not req:
            return jsonify({'success': False, 'error': 'Request not found'}), 404
        if int(req['requested_by']) != int(user_id):
            return jsonify({'success': False, 'error': 'Forbidden'}), 403
        if req['status'] not in ('pending', 'rejected'):
            return jsonify({'success': False, 'error': 'Only pending or rejected requests can be deleted'}), 400
        conn.execute(text('delete from inventory_adjustment_requests where id = :id'), {'id': req_id})
        return jsonify({'success': True})


@manager_bp.delete('/suppliers/<int:supplier_id>')
@jwt_required()
def delete_supplier(supplier_id: int):
    user_id = get_jwt_identity()
    with engine.begin() as conn:
        me = conn.execute(text('select id, role, pharmacy_id from users where id = :id'), {'id': user_id}).mappings().first()
        if not me or me['role'] not in ('manager','admin'):
            return jsonify({'success': False, 'error': 'Forbidden'}), 403
        _ensure_suppliers_and_po_tables(conn)
        conn.execute(text('delete from suppliers where id = :id and pharmacy_id = :ph'), {'id': supplier_id, 'ph': me['pharmacy_id']})
        return jsonify({'success': True})


# ---------- Purchase Orders (minimal) ----------
@manager_bp.post('/purchase-orders')
@jwt_required()
def create_purchase_order():
    data = request.get_json(force=True) or {}
    supplier_id = data.get('supplier_id')
    items = data.get('items') or []  # [{product_id, quantity, unit_cost}]
    if not supplier_id or not items:
        return jsonify({'success': False, 'error': 'supplier_id and items are required'}), 400
    user_id = get_jwt_identity()
    with engine.begin() as conn:
        me = conn.execute(text('select id, role, pharmacy_id from users where id = :id'), {'id': user_id}).mappings().first()
        if not me or me['role'] not in ('manager','admin'):
            return jsonify({'success': False, 'error': 'Forbidden'}), 403
        _ensure_suppliers_and_po_tables(conn)
        import uuid
        po_number = f"PO-{str(uuid.uuid4())[:8].upper()}"
        row = conn.execute(text('''
            insert into purchase_orders (pharmacy_id, supplier_id, po_number, status, expected_delivery_at, notes)
            values (:ph, :sid, :po, 'ordered', :eta, :notes)
            returning id, po_number
        '''), {'ph': me['pharmacy_id'], 'sid': int(supplier_id), 'po': po_number, 'eta': data.get('expected_delivery_at'), 'notes': (data.get('notes') or '').strip() or None}).mappings().first()
        po_id = row['id']
        for it in items:
            if not it.get('product_id') or not it.get('quantity'):
                continue
            conn.execute(text('''
                insert into purchase_order_items (po_id, product_id, quantity, unit_cost, total_cost)
                values (:po, :pid, :q, :uc, :tc)
            '''), {
                'po': po_id, 
                'pid': int(it['product_id']), 
                'q': int(it['quantity']), 
                'uc': float(it.get('unit_cost') or 0),
                'tc': float(it.get('unit_cost') or 0) * int(it['quantity'])
            })
        return jsonify({'success': True, 'po_id': po_id, 'po_number': row['po_number']})


@manager_bp.get('/purchase-orders')
@jwt_required()
def list_purchase_orders():
    user_id = get_jwt_identity()
    with engine.connect() as conn:
        me = conn.execute(text('select id, role, pharmacy_id from users where id = :id'), {'id': user_id}).mappings().first()
        if not me or me['role'] not in ('manager','admin'):
            return jsonify({'success': False, 'error': 'Forbidden'}), 403
        rows = conn.execute(text('''
            select po.id, po.po_number, po.status, po.expected_delivery_at, po.created_at, s.name as supplier_name,
                   coalesce(sum(i.quantity),0) as total_items
            from purchase_orders po
            join suppliers s on s.id = po.supplier_id
            left join purchase_order_items i on i.po_id = po.id
            where po.pharmacy_id = :ph
            group by po.id, s.name
            order by po.created_at desc
            limit 200
        '''), {'ph': me['pharmacy_id']}).mappings().all()
        return jsonify({'success': True, 'purchase_orders': [dict(r) for r in rows]})


@manager_bp.patch('/purchase-orders/<int:po_id>')
@jwt_required()
def update_purchase_order(po_id: int):
    data = request.get_json(force=True) or {}
    user_id = get_jwt_identity()
    with engine.begin() as conn:
        me = conn.execute(text('select id, role, pharmacy_id from users where id = :id'), {'id': user_id}).mappings().first()
        if not me or me['role'] not in ('manager','admin'):
            return jsonify({'success': False, 'error': 'Forbidden'}), 403
        # Update status and when received create batches and bump inventory
        new_status = (data.get('status') or '').lower() or None
        conn.execute(text('update purchase_orders set status = coalesce(:st, status), expected_delivery_at = coalesce(:eta, expected_delivery_at), updated_at = now() where id = :id and pharmacy_id = :ph'), {'st': new_status, 'eta': data.get('expected_delivery_at'), 'id': po_id, 'ph': me['pharmacy_id']})
        if new_status == 'received':
            _ensure_batches_table(conn)
            items = conn.execute(text('select product_id, quantity, unit_cost from purchase_order_items where po_id = :po'), {'po': po_id}).mappings().all()
            import uuid as _uuid
            for it in items:
                batch_no = f"B-{str(_uuid.uuid4())[:8].upper()}"
                conn.execute(text('''
                    insert into inventory_batches (product_id, batch_number, quantity, expiration_date)
                    values (:pid, :bn, :q, :exp)
                    on conflict (product_id, batch_number) do update set quantity = inventory_batches.quantity + excluded.quantity
                '''), {'pid': it['product_id'], 'bn': batch_no, 'q': it['quantity'], 'exp': data.get('default_expiration_date')})
                conn.execute(text('''
                    insert into inventory (product_id, current_stock, reserved_stock)
                    values (:pid, :q, 0)
                    on conflict (product_id) do update set current_stock = inventory.current_stock + excluded.current_stock, last_updated = now()
                '''), {'pid': it['product_id'], 'q': it['quantity']})
        return jsonify({'success': True})



@manager_bp.get('/api/forecasting/accuracy')
@jwt_required()
def get_forecasting_accuracy():
    """Get accuracy metrics for all models"""
    try:
        user_id = get_jwt_identity()
        
        # Get user's pharmacy_id
        with engine.begin() as conn:
            user_row = conn.execute(text('select pharmacy_id from users where id = :id'), {'id': user_id}).mappings().first()
            if not user_row:
                return jsonify({'success': False, 'error': 'User not found'}), 404
            pharmacy_id = user_row['pharmacy_id']
        
        # Get model accuracy from database
        with engine.begin() as conn:
            models = conn.execute(text("""
                SELECT target_id, target_name, model_type, accuracy_percentage, last_trained_at
                FROM forecasting_models 
                WHERE pharmacy_id = :pharmacy_id
                ORDER BY last_trained_at DESC
            """), {'pharmacy_id': pharmacy_id}).mappings().all()
        
        # Calculate overall statistics
        if models:
            accuracies = [float(m['accuracy_percentage']) for m in models if m['accuracy_percentage']]
            avg_accuracy = sum(accuracies) / len(accuracies) if accuracies else 0
            models_above_90 = sum(1 for acc in accuracies if acc >= 90)
        else:
            avg_accuracy = 0
            models_above_90 = 0
        
        return jsonify({
            'success': True, 
            'accuracy_percentage': round(avg_accuracy, 2),
            'models': [dict(m) for m in models],
            'overall_stats': {
                'average_accuracy': round(avg_accuracy, 2),
                'models_above_90_percent': models_above_90,
                'total_models': len(models)
            }
        })
        
    except Exception as e:
        print(f"Error getting accuracy: {e}")
        return jsonify({'success': False, 'error': 'Failed to get accuracy metrics'}), 500

# Removed duplicate route - use /api/forecasting/products from forecasting.py instead

@manager_bp.get('/api/forecasting/categories')
@jwt_required()
def get_forecastable_categories():
    """Get categories that can be used for forecasting"""
    try:
        user_id = get_jwt_identity()
        
        # Get user's pharmacy_id
        with engine.begin() as conn:
            user_row = conn.execute(text('select pharmacy_id from users where id = :id'), {'id': user_id}).mappings().first()
            if not user_row:
                return jsonify({'success': False, 'error': 'User not found'}), 404
            pharmacy_id = user_row['pharmacy_id']
        
        # Get categories with real data from database
        with engine.begin() as conn2:
            categories = conn2.execute(text("""
                SELECT DISTINCT c.id, c.name,
                       COALESCE(hsd.sales_days, 30) as sales_days,
                       COALESCE(hsd.avg_daily_sales, 0) as avg_daily_sales,
                       COUNT(p.id) as product_count
                FROM product_categories c
                JOIN products p ON p.category_id = c.id
                LEFT JOIN (
                    SELECT p2.category_id,
                           COUNT(DISTINCT hsd2.sale_date) as sales_days,
                           AVG(hsd2.quantity_sold) as avg_daily_sales
                    FROM historical_sales_daily hsd2
                    JOIN products p2 ON p2.id = hsd2.product_id
                    WHERE hsd2.pharmacy_id = :pharmacy_id
                    GROUP BY p2.category_id
                ) hsd ON hsd.category_id = c.id
                WHERE p.pharmacy_id = :pharmacy_id
                GROUP BY c.id, c.name, hsd.sales_days, hsd.avg_daily_sales
                ORDER BY c.name
            """), {'pharmacy_id': pharmacy_id}).mappings().all()
        
        return jsonify({'success': True, 'categories': [dict(c) for c in categories]})
        
    except Exception as e:
        print(f"Error getting categories: {e}")
        return jsonify({'success': False, 'error': 'Failed to get categories'}), 500


# ===============================
# REPORTING ENDPOINTS
# ===============================

@manager_bp.get('/reports/stock')
@jwt_required()
def get_stock_report():
    """Generate current stock report"""
    user_id = get_jwt_identity()
    # Optional filters
    category_id = request.args.get('category_id')
    status = request.args.get('status', 'all')  # all, in_stock, low_stock, out_of_stock
    
    with engine.connect() as conn:
        me = conn.execute(text('select id, role, pharmacy_id from users where id = :id'), {'id': user_id}).mappings().first()
        if not me or me['role'] not in ('manager','admin'):
            return jsonify({'success': False, 'error': 'Forbidden'}), 403
        
        conditions = [
            'p.pharmacy_id = :pharmacy_id',
            'p.is_active = true'
        ]
        params = {'pharmacy_id': me['pharmacy_id']}
        
        if category_id and category_id != 'undefined':
            conditions.append('p.category_id = :category_id')
            params['category_id'] = category_id
        
        where_clause = ' and '.join(conditions)
        
        query = text(f'''
            select 
                p.id as product_id,
                p.name as product_name,
                pc.name as category_name,
                coalesce(i.current_stock, 0) as current_stock,
                coalesce(p.reorder_point, 10) as reorder_point,
                p.unit_price,
                p.cost_price,
                p.location,
                case 
                    when coalesce(i.current_stock, 0) = 0 then 'Out of Stock'
                    when coalesce(i.current_stock, 0) <= coalesce(p.reorder_point, 10) then 'Low Stock'
                    else 'In Stock'
                end as stock_status
            from products p
            left join product_categories pc on p.category_id = pc.id
            left join inventory i on p.id = i.product_id
            where {where_clause}
            order by 
                case 
                    when coalesce(i.current_stock, 0) = 0 then 1
                    when coalesce(i.current_stock, 0) <= coalesce(p.reorder_point, 10) then 2
                    else 3
                end,
                coalesce(i.current_stock, 0) asc, p.name
        ''')
        
        stock_data = conn.execute(query, params).mappings().all()
        
        # Filter by status if specified
        if status != 'all':
            if status == 'out_of_stock':
                stock_data = [row for row in stock_data if row['stock_status'] == 'Out of Stock']
            elif status == 'low_stock':
                stock_data = [row for row in stock_data if row['stock_status'] == 'Low Stock']
            elif status == 'in_stock':
                stock_data = [row for row in stock_data if row['stock_status'] == 'In Stock']
        
        return jsonify({'success': True, 'data': [dict(row) for row in stock_data]})


@manager_bp.get('/reports/low-stock')
@jwt_required()
def get_low_stock_report():
    """Generate low stock alert report"""
    user_id = get_jwt_identity()
    # Optional filters
    category_id = request.args.get('category_id')
    alert_level = request.args.get('alert_level', 'all')  # all, critical, low, out_of_stock
    
    with engine.connect() as conn:
        me = conn.execute(text('select id, role, pharmacy_id from users where id = :id'), {'id': user_id}).mappings().first()
        if not me or me['role'] not in ('manager','admin'):
            return jsonify({'success': False, 'error': 'Forbidden'}), 403
        
        conditions = [
            'p.pharmacy_id = :pharmacy_id',
            'p.is_active = true',
            'coalesce(i.current_stock, 0) <= coalesce(p.reorder_point, 10)'
        ]
        params = {'pharmacy_id': me['pharmacy_id']}
        
        if category_id and category_id != 'undefined':
            conditions.append('p.category_id = :category_id')
            params['category_id'] = category_id
        
        where_clause = ' and '.join(conditions)
        
        query = text(f'''
            select 
                p.id as product_id,
                p.name as product_name,
                pc.name as category_name,
                coalesce(i.current_stock, 0) as current_stock,
                coalesce(p.reorder_point, 10) as reorder_point,
                s.name as preferred_supplier,
                p.unit_price,
                p.cost_price,
                p.location,
                case 
                    when coalesce(i.current_stock, 0) = 0 then 'Out of Stock'
                    when coalesce(i.current_stock, 0) <= (coalesce(p.reorder_point, 10) * 0.5) then 'Critical'
                    else 'Low Stock'
                end as alert_level
            from products p
            left join product_categories pc on p.category_id = pc.id
            left join inventory i on p.id = i.product_id
            left join suppliers s on p.preferred_supplier_id = s.id
            where {where_clause}
            order by 
                case 
                    when coalesce(i.current_stock, 0) = 0 then 1
                    when coalesce(i.current_stock, 0) <= (coalesce(p.reorder_point, 10) * 0.5) then 2
                    else 3
                end,
                coalesce(i.current_stock, 0) asc, p.name
        ''')
        
        low_stock_data = conn.execute(query, params).mappings().all()
        
        # Filter by alert level if specified
        if alert_level != 'all':
            if alert_level == 'out_of_stock':
                low_stock_data = [row for row in low_stock_data if row['alert_level'] == 'Out of Stock']
            elif alert_level == 'critical':
                low_stock_data = [row for row in low_stock_data if row['alert_level'] == 'Critical']
            elif alert_level == 'low_stock':
                low_stock_data = [row for row in low_stock_data if row['alert_level'] == 'Low Stock']
        
        return jsonify({'success': True, 'data': [dict(row) for row in low_stock_data]})


@manager_bp.get('/reports/expired')
@jwt_required()
def get_expired_report():
    """Generate expired products report"""
    user_id = get_jwt_identity()
    # Optional filters
    status = request.args.get('status', 'all')  # expired | expiring | all
    category_id = request.args.get('category_id')
    with engine.connect() as conn:
        me = conn.execute(text('select id, role, pharmacy_id from users where id = :id'), {'id': user_id}).mappings().first()
        if not me or me['role'] not in ('manager','admin'):
            return jsonify({'success': False, 'error': 'Forbidden'}), 403
        
        conditions = [
            'p.pharmacy_id = :pharmacy_id',
            'p.is_active = true',
            'b.expiration_date is not null'
        ]
        params = {'pharmacy_id': me['pharmacy_id']}
        
        if status == 'expired':
            conditions.append('b.expiration_date < current_date')
        elif status == 'expiring':
            conditions.append("b.expiration_date between current_date and (current_date + interval '30 days')")
        else:
            conditions.append("b.expiration_date <= current_date + interval '30 days'")
        
        if category_id and category_id != 'undefined':
            conditions.append('p.category_id = :category_id')
            params['category_id'] = category_id
        
        where_clause = ' and '.join(conditions)
        
        query = text(f'''
            select 
                p.id as product_id,
                p.name as product_name,
                pc.name as category_name,
                p.location,
                string_agg(distinct s.name, ', ') as supplier_names,
                min(b.expiration_date) as earliest_expiration,
                max(b.expiration_date) as latest_expiration,
                sum(b.quantity) as expired_quantity,
                coalesce(avg(b.cost_price), 0) as avg_cost_price,
                count(b.cost_price) as priced_deliveries,
                coalesce(sum(case when b.cost_price is not null then b.cost_price * b.quantity else 0 end), 0) as estimated_loss,
                case 
                    when min(b.expiration_date) < current_date then 'Expired'
                    when min(b.expiration_date) <= current_date + interval '30 days' then 'Expiring Soon'
                    else 'Good'
                end as expiration_status
            from products p
            left join product_categories pc on pc.id = p.category_id
            join inventory_batches b on b.product_id = p.id
            left join suppliers s on s.id = b.supplier_id
            where {where_clause}
            group by p.id, p.name, pc.name, p.location
            order by estimated_loss desc, p.name
        ''')
        expired_data = conn.execute(query, params).mappings().all()
        
        return jsonify({'success': True, 'data': [dict(row) for row in expired_data]})


@manager_bp.get('/reports/sales-staff')
@jwt_required()
def get_sales_staff_report():
    """Generate sales report by staff"""
    user_id = get_jwt_identity()
    staff_id = request.args.get('staff_id')
    date_from = request.args.get('date_from')
    date_to = request.args.get('date_to')
    
    with engine.connect() as conn:
        me = conn.execute(text('select id, role, pharmacy_id from users where id = :id'), {'id': user_id}).mappings().first()
        if not me or me['role'] not in ('manager','admin'):
            return jsonify({'success': False, 'error': 'Forbidden'}), 403
        
        # Build query conditions
        conditions = ['s.pharmacy_id = :pharmacy_id', 's.status = \'completed\'']
        params = {'pharmacy_id': me['pharmacy_id']}
        
        if staff_id:
            conditions.append('s.user_id = :staff_id')
            params['staff_id'] = staff_id
            
        if date_from:
            conditions.append('s.created_at >= :date_from')
            params['date_from'] = date_from
            
        if date_to:
            conditions.append('s.created_at <= :date_to')
            params['date_to'] = date_to
        
        where_clause = ' and '.join(conditions)
        
        sales_data = conn.execute(text(f'''
            select 
                u.first_name || ' ' || u.last_name as staff_name,
                count(s.id) as total_sales,
                round(sum(s.total_amount)::numeric, 2) as total_revenue,
                round(avg(s.total_amount)::numeric, 2) as avg_sale_amount,
                count(distinct date(s.created_at)) as days_worked,
                count(distinct date_trunc('week', s.created_at)) as weeks_worked,
                count(distinct date_trunc('month', s.created_at)) as months_worked,
                round(sum(s.total_amount)::numeric / nullif(count(distinct date(s.created_at)), 0), 2) as avg_daily_revenue,
                round(sum(s.total_amount)::numeric / nullif(count(distinct date_trunc('week', s.created_at)), 0), 2) as avg_weekly_revenue,
                round(sum(s.total_amount)::numeric / nullif(count(distinct date_trunc('month', s.created_at)), 0), 2) as avg_monthly_revenue,
                round(count(s.id)::numeric / nullif(count(distinct date(s.created_at)), 0), 2) as sales_per_day,
                round(count(s.id)::numeric / nullif(count(distinct date_trunc('week', s.created_at)), 0), 2) as sales_per_week,
                round(count(s.id)::numeric / nullif(count(distinct date_trunc('month', s.created_at)), 0), 2) as sales_per_month,
                max(s.created_at) as last_sale
            from sales s
            join users u on s.user_id = u.id
            where {where_clause}
            group by u.id, u.first_name, u.last_name
            order by total_revenue desc
        '''), params).mappings().all()
        
        return jsonify({'success': True, 'data': [dict(row) for row in sales_data]})


@manager_bp.get('/reports/sales-date')
@jwt_required()
def get_sales_date_report():
    """Generate sales report by date"""
    user_id = get_jwt_identity()
    date_from = request.args.get('date_from')
    date_to = request.args.get('date_to')
    
    with engine.connect() as conn:
        me = conn.execute(text('select id, role, pharmacy_id from users where id = :id'), {'id': user_id}).mappings().first()
        if not me or me['role'] not in ('manager','admin'):
            return jsonify({'success': False, 'error': 'Forbidden'}), 403
        
        # Build query conditions
        conditions = ['s.pharmacy_id = :pharmacy_id', 's.status = \'completed\'']
        params = {'pharmacy_id': me['pharmacy_id']}
        
        if date_from:
            conditions.append('date(s.created_at) >= :date_from')
            params['date_from'] = date_from
            
        if date_to:
            conditions.append('date(s.created_at) <= :date_to')
            params['date_to'] = date_to
        
        where_clause = ' and '.join(conditions)
        
        sales_data = conn.execute(text(f'''
            select 
                date(s.created_at) as sale_date,
                count(s.id) as total_sales,
                sum(s.total_amount) as daily_revenue,
                avg(s.total_amount) as avg_sale_amount,
                count(distinct s.user_id) as staff_count,
                sum(si.quantity) as total_items_sold,
                string_agg(distinct u.first_name || ' ' || u.last_name, ', ') as staff_names
            from sales s
            left join sale_items si on s.id = si.sale_id
            left join users u on s.user_id = u.id
            where {where_clause}
            group by date(s.created_at)
            order by sale_date desc
        '''), params).mappings().all()
        
        return jsonify({'success': True, 'data': [dict(row) for row in sales_data]})


@manager_bp.get('/reports/sales-detailed')
@jwt_required()
def get_sales_detailed_report():
    """Generate detailed sales report by staff and date with pharmacy context"""
    user_id = get_jwt_identity()
    staff_id = request.args.get('staff_id')
    date_from = request.args.get('date_from')
    date_to = request.args.get('date_to')
    
    with engine.connect() as conn:
        me = conn.execute(text('select id, role, pharmacy_id from users where id = :id'), {'id': user_id}).mappings().first()
        if not me or me['role'] not in ('manager','admin'):
            return jsonify({'success': False, 'error': 'Forbidden'}), 403
        
        # Build query conditions
        conditions = ['s.pharmacy_id = :pharmacy_id', 's.status = \'completed\'']
        params = {'pharmacy_id': me['pharmacy_id']}
        
        if staff_id:
            conditions.append('s.user_id = :staff_id')
            params['staff_id'] = staff_id
            
        if date_from:
            conditions.append('date(s.created_at) >= :date_from')
            params['date_from'] = date_from
            
        if date_to:
            conditions.append('date(s.created_at) <= :date_to')
            params['date_to'] = date_to
        
        where_clause = ' and '.join(conditions)
        
        # Get detailed sales data
        sales_data = conn.execute(text(f'''
            select 
                s.id as sale_id,
                s.sale_number,
                date(s.created_at) as sale_date,
                u.first_name || ' ' || u.last_name as staff_name,
                u.pharmacy_id,
                p.name as pharmacy_name,
                s.subtotal,
                s.tax_amount,
                s.discount_amount,
                s.total_amount,
                s.payment_method,
                s.created_at,
                count(si.id) as items_count,
                sum(si.quantity) as total_quantity_sold
            from sales s
            join users u on s.user_id = u.id
            join pharmacies p on u.pharmacy_id = p.id
            left join sale_items si on s.id = si.sale_id
            where {where_clause}
            group by s.id, s.sale_number, s.created_at, u.first_name, u.last_name, u.pharmacy_id, p.name, s.subtotal, s.tax_amount, s.discount_amount, s.total_amount, s.payment_method
            order by s.created_at desc, s.sale_number
        '''), params).mappings().all()
        
        return jsonify({'success': True, 'data': [dict(row) for row in sales_data]})


@manager_bp.get('/reports/sales-period')
@jwt_required()
def get_sales_period_report():
    """Generate detailed sales report by period (day/week/month) for specific staff with all medicines"""
    user_id = get_jwt_identity()
    staff_id = request.args.get('staff_id')
    period = request.args.get('period', 'day')  # day, week, month
    date_from = request.args.get('date_from')
    date_to = request.args.get('date_to')
    
    with engine.connect() as conn:
        me = conn.execute(text('select id, role, pharmacy_id from users where id = :id'), {'id': user_id}).mappings().first()
        if not me or me['role'] not in ('manager','admin'):
            return jsonify({'success': False, 'error': 'Forbidden'}), 403
        
        if not staff_id:
            return jsonify({'success': False, 'error': 'Staff ID is required'}), 400
        
        # Verify staff belongs to same pharmacy
        staff_check = conn.execute(text('''
            select id, first_name, last_name, pharmacy_id 
            from users 
            where id = :staff_id and pharmacy_id = :pharmacy_id
        '''), {'staff_id': staff_id, 'pharmacy_id': me['pharmacy_id']}).mappings().first()
        
        if not staff_check:
            return jsonify({'success': False, 'error': 'Staff not found or access denied'}), 403
        
        # Build date grouping based on period
        if period == 'day':
            date_group = 'date(s.created_at)'
            date_format = 'YYYY-MM-DD'
        elif period == 'week':
            date_group = 'date_trunc(\'week\', s.created_at)::date'
            date_format = 'YYYY-MM-DD (Week)'
        elif period == 'month':
            date_group = 'date_trunc(\'month\', s.created_at)::date'
            date_format = 'YYYY-MM'
        else:
            return jsonify({'success': False, 'error': 'Invalid period. Use day, week, or month'}), 400
        
        # Build query conditions
        conditions = [
            's.pharmacy_id = :pharmacy_id', 
            's.status = \'completed\'',
            's.user_id = :staff_id'
        ]
        params = {
            'pharmacy_id': me['pharmacy_id'],
            'staff_id': staff_id
        }
        
        if date_from:
            conditions.append('s.created_at >= :date_from')
            params['date_from'] = date_from
            
        if date_to:
            conditions.append('s.created_at <= :date_to')
            params['date_to'] = date_to
        
        where_clause = ' and '.join(conditions)
        
        # Get sales summary data - calculate revenue from sale_items to get accurate totals
        sales_summary = conn.execute(text(f'''
            select 
                {date_group} as period_date,
                count(distinct s.id) as total_sales,
                sum(si.total_price) as period_revenue,
                avg(s.total_amount) as avg_sale_amount
            from sales s
            left join sale_items si on s.id = si.sale_id
            where {where_clause}
            group by {date_group}
            order by period_date desc
        '''), params).mappings().all()
        
        # Get detailed items data separately
        items_data = conn.execute(text(f'''
            select 
                {date_group} as period_date,
                count(si.id) as total_items_sold,
                sum(si.quantity) as total_quantity,
                array_agg(distinct s.id order by s.id) as sale_ids,
                array_agg(distinct s.sale_number order by s.sale_number) as sale_numbers,
                array_agg(distinct s.created_at order by s.created_at) as sale_times
            from sales s
            left join sale_items si on s.id = si.sale_id
            where {where_clause}
            group by {date_group}
            order by period_date desc
        '''), params).mappings().all()
        
        # Combine the data
        sales_data = []
        for summary in sales_summary:
            items = next((item for item in items_data if item['period_date'] == summary['period_date']), {})
            combined = {
                'period_date': summary['period_date'],
                'total_sales': summary['total_sales'],
                'period_revenue': summary['period_revenue'],
                'avg_sale_amount': summary['avg_sale_amount'],
                'total_items_sold': items.get('total_items_sold', 0),
                'total_quantity': items.get('total_quantity', 0),
                'sale_ids': items.get('sale_ids', []),
                'sale_numbers': items.get('sale_numbers', []),
                'sale_times': items.get('sale_times', [])
            }
            sales_data.append(combined)
        
        # Get detailed medicine breakdown for each period
        detailed_medicines = []
        for period_data in sales_data:
            period_date = period_data['period_date']
            sale_ids = period_data['sale_ids']
            
            # Get all medicines sold in this period
            medicine_data = conn.execute(text('''
                select 
                    si.sale_id,
                    s.sale_number,
                    s.created_at as sale_time,
                    si.quantity,
                    si.unit_price,
                    si.total_price,
                    p.name as product_name,
                    p.id as product_id,
                    pc.name as category_name
                from sale_items si
                join sales s on si.sale_id = s.id
                join products p on si.product_id = p.id
                left join product_categories pc on p.category_id = pc.id
                where si.sale_id = ANY(:sale_ids)
                order by s.created_at, p.name
            '''), {'sale_ids': sale_ids}).mappings().all()
            
            detailed_medicines.append({
                'period_date': period_date,
                'period_summary': dict(period_data),
                'medicines': [dict(med) for med in medicine_data]
            })
        
        # Get staff information
        staff_info = {
            'id': staff_check['id'],
            'name': f"{staff_check['first_name']} {staff_check['last_name']}",
            'pharmacy_id': staff_check['pharmacy_id']
        }
        
        return jsonify({
            'success': True, 
            'data': detailed_medicines,
            'staff_info': staff_info,
            'period': period,
            'date_format': date_format
        })

# =========================
# --- ABC / VED Analytics ---

@manager_bp.get('/analytics/abc-ved')
@jwt_required()
def analytics_abc_ved():
	"""Compute ABC classes by consumption value and VED classes by criticality,
	then return the ABC–VED matrix along with item-level classifications.

	Defaults:
	- ABC thresholds: A = top 70% value, B = next 20% (to 90%), C = remaining 10%
	- VED rules: heuristic keyword/category mapping; can be refined later.
	"""
	user_id = get_jwt_identity()
	frm, to = date_range_params()

	# Allow optional override thresholds via query params
	try:
		ath = float(request.args.get('a_threshold', '0.7'))
		bth = float(request.args.get('b_threshold', '0.9'))
	except Exception:
		ath, bth = 0.7, 0.9
	ath = max(0.5, min(0.9, ath))
	bth = max(ath, min(0.98, bth))

	with engine.connect() as conn:
		me = conn.execute(text('select id, role, pharmacy_id from users where id = :id'), {'id': user_id}).mappings().first()
		if not me or me['role'] not in ('manager','admin'):
			return jsonify({'success': False, 'error': 'Forbidden'}), 403

		params = {'ph': me['pharmacy_id'], 'from': frm, 'to': to}

		# Aggregate consumption (quantity sold) and value over the period
		qry = text('''
			with sales_agg as (
				select si.product_id,
				       sum(si.quantity) as total_qty
				from sale_items si
				join sales s on s.id = si.sale_id
				where s.pharmacy_id = :ph
				  and coalesce(s.status, 'completed') = 'completed'
				  and s.created_at between :from and :to
				group by si.product_id
			)
			select p.id,
			       p.name,
			       pc.name as category_name,
			       coalesce(sa.total_qty, 0) as total_qty,
			       coalesce(p.cost_price, 0) as cost_price,
			       coalesce(sa.total_qty, 0) * coalesce(p.cost_price, 0) as consumption_value
			from products p
			left join product_categories pc on pc.id = p.category_id
			left join sales_agg sa on sa.product_id = p.id
			where p.pharmacy_id = :ph and p.is_active = true
		''')

		rows = [dict(r) for r in conn.execute(qry, params).mappings().all()]

	# Compute ABC by cumulative value share
	total_value = sum(max(0.0, float(r.get('consumption_value') or 0)) for r in rows) or 0.0
	rows.sort(key=lambda r: float(r.get('consumption_value') or 0), reverse=True)
	cum = 0.0
	for r in rows:
		val = max(0.0, float(r.get('consumption_value') or 0))
		share = (val / total_value) if total_value > 0 else 0.0
		cum += share
		if cum <= ath:
			r['abc_class'] = 'A'
		elif cum <= bth:
			r['abc_class'] = 'B'
		else:
			r['abc_class'] = 'C'

	# Heuristic VED tagging (can be replaced with DB-driven tags later)
	def _infer_ved(name: str, category: str) -> str:
		name_l = (name or '').lower()
		cat_l = (category or '').lower()
		vital_keywords = [
			'insulin', 'epinephrine', 'adrenaline', 'antibiotic', 'cef', 'cillin', 'metformin',
			'amoxicillin', 'azithromycin', 'salbutamol', 'albuterol', 'antihypertensive', 'losartan',
			'telmisartan', 'amlodipine', 'anticonvulsant', 'antiepileptic', 'warfarin', 'heparin'
		]
		desirable_keywords = ['supplement', 'vitamin', 'cosmetic', 'herbal', 'lotion']
		vital_cats = ['antibiotics', 'cardio', 'antihypertensive', 'asthma', 'diabetes']
		desirable_cats = ['vitamins', 'supplements', 'cosmetics']
		if any(k in name_l for k in vital_keywords) or any(k in cat_l for k in vital_cats):
			return 'V'
		if any(k in name_l for k in desirable_keywords) or any(k in cat_l for k in desirable_cats):
			return 'D'
		return 'E'

	for r in rows:
		r['ved_class'] = _infer_ved(r.get('name'), r.get('category_name'))
		r['matrix_cell'] = f"{r['abc_class']}-{r['ved_class']}"

	# Build matrix summary
	matrix_counts = {}
	for abc in ('A','B','C'):
		for ved in ('V','E','D'):
			matrix_counts[f'{abc}-{ved}'] = 0
	for r in rows:
		matrix_counts[r['matrix_cell']] = matrix_counts.get(r['matrix_cell'], 0) + 1

	return jsonify({
		'success': True,
		'from': frm.isoformat(),
		'to': to.isoformat(),
		'abc_thresholds': {'A': ath, 'B': bth},
		'matrix_counts': matrix_counts,
		'items': rows
	})


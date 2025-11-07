"""Admin routes - User, Pharmacy, Subscription, and Signup Request management"""
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
import bcrypt
import os
from datetime import datetime

load_dotenv()

DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql+psycopg2://postgres:PhoebeDrugStore01@db.xybuirzvlfuwmtcokkwm.supabase.co:5432/postgres?sslmode=require')
engine = create_engine(DATABASE_URL, pool_pre_ping=True)

admin_bp = Blueprint('admin', __name__)

def _require_admin(conn, user_id):
	"""Helper to check if user is admin"""
	me = conn.execute(text('select id, role from users where id = :id'), {'id': user_id}).mappings().first()
	if not me or me['role'] != 'admin':
		from flask import abort
		abort(403, description='Forbidden')
	return me

# =========================
# USER MANAGEMENT
# =========================

@admin_bp.get('/api/admin/users')
@jwt_required()
def admin_list_users():
	"""List all users with pharmacy information (admin only)"""
	user_id = get_jwt_identity()
	with engine.connect() as conn:
		_require_admin(conn, user_id)
		rows = conn.execute(text('''
			select 
				u.id, u.email, u.username, u.first_name, u.last_name, u.role, u.is_active,
				u.created_at, u.updated_at,
				p.id as pharmacy_id, p.name as pharmacy_name
			from users u
			left join pharmacies p on p.id = u.pharmacy_id
			order by p.name, u.role desc, u.username asc
		''')).mappings().all()
		return jsonify({'success': True, 'users': [dict(r) for r in rows]})

@admin_bp.post('/api/admin/users')
@jwt_required()
def admin_create_user():
	"""Create a new user (admin only)"""
	user_id = get_jwt_identity()
	data = request.get_json(force=True) or {}
	
	with engine.connect() as conn:
		_require_admin(conn, user_id)
		
		required = ['email', 'password', 'first_name', 'last_name', 'role', 'pharmacy_id']
		if not all(data.get(k) for k in required):
			return jsonify({'success': False, 'error': 'email, password, first_name, last_name, role, and pharmacy_id are required'}), 400
		
		# Validate role
		if data['role'] not in ['admin', 'manager', 'staff']:
			return jsonify({'success': False, 'error': 'Invalid role. Must be admin, manager, or staff'}), 400
		
		# Validate pharmacy exists
		pharmacy = conn.execute(text('select id from pharmacies where id = :pid'), {'pid': data['pharmacy_id']}).mappings().first()
		if not pharmacy:
			return jsonify({'success': False, 'error': 'Pharmacy not found'}), 404
		
		pw_hash = bcrypt.hashpw(data['password'].encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
		username = data.get('username') or data['email'].split('@')[0]
		
		try:
			with engine.begin() as conn:
				row = conn.execute(text('''
					insert into users (username, email, password_hash, first_name, last_name, role, pharmacy_id, is_active)
					values (:username, :email, :password_hash, :first_name, :last_name, :role, :pharmacy_id, :is_active)
					returning id, username, email, first_name, last_name, role, is_active, pharmacy_id, created_at
				'''), {
					'username': username,
					'email': data['email'],
					'password_hash': pw_hash,
					'first_name': data['first_name'],
					'last_name': data['last_name'],
					'role': data['role'],
					'pharmacy_id': data['pharmacy_id'],
					'is_active': data.get('is_active', True)
				}).mappings().first()
				return jsonify({'success': True, 'user': dict(row)})
		except Exception as e:
			return jsonify({'success': False, 'error': str(e)}), 400

@admin_bp.patch('/api/admin/users/<int:user_id>/status')
@jwt_required()
def admin_update_user_status(user_id):
	"""Update user active status (admin only)"""
	current_user_id = get_jwt_identity()
	data = request.get_json(force=True) or {}
	
	with engine.connect() as conn:
		_require_admin(conn, current_user_id)
		
		# Prevent deactivating self
		if user_id == current_user_id:
			return jsonify({'success': False, 'error': 'Cannot deactivate your own account'}), 400
		
		is_active = data.get('is_active')
		if is_active is None:
			return jsonify({'success': False, 'error': 'is_active is required'}), 400
		
		try:
			with engine.begin() as conn:
				row = conn.execute(text('''
					update users set is_active = :is_active, updated_at = now()
					where id = :user_id
					returning id, email, username, first_name, last_name, role, is_active
				'''), {
					'user_id': user_id,
					'is_active': is_active
				}).mappings().first()
				
				if not row:
					return jsonify({'success': False, 'error': 'User not found'}), 404
				
				return jsonify({'success': True, 'user': dict(row)})
		except Exception as e:
			return jsonify({'success': False, 'error': str(e)}), 400

# =========================
# PHARMACY MANAGEMENT
# =========================

@admin_bp.get('/api/admin/pharmacies')
@jwt_required()
def admin_list_pharmacies():
	"""List all pharmacies (admin only)"""
	user_id = get_jwt_identity()
	with engine.connect() as conn:
		_require_admin(conn, user_id)
		rows = conn.execute(text('''
			select id, name, address, phone, email, license_number, owner_name, is_active, created_at, updated_at
			from pharmacies
			order by name asc
		''')).mappings().all()
		return jsonify({'success': True, 'pharmacies': [dict(r) for r in rows]})

@admin_bp.post('/api/admin/pharmacies')
@jwt_required()
def admin_create_pharmacy():
	"""Create a new pharmacy (admin only)"""
	user_id = get_jwt_identity()
	data = request.get_json(force=True) or {}
	
	with engine.connect() as conn:
		_require_admin(conn, user_id)
		
		required = ['name']
		if not all(data.get(k) for k in required):
			return jsonify({'success': False, 'error': 'name is required'}), 400
		
		try:
			with engine.begin() as conn:
				row = conn.execute(text('''
					insert into pharmacies (name, address, phone, email, license_number, owner_name, is_active)
					values (:name, :address, :phone, :email, :license_number, :owner_name, :is_active)
					returning id, name, address, phone, email, license_number, owner_name, is_active, created_at
				'''), {
					'name': data['name'],
					'address': data.get('address', ''),
					'phone': data.get('phone', ''),
					'email': data.get('email', ''),
					'license_number': data.get('license_number', ''),
					'owner_name': data.get('owner_name', ''),
					'is_active': data.get('is_active', True)
				}).mappings().first()
				return jsonify({'success': True, 'pharmacy': dict(row)})
		except Exception as e:
			return jsonify({'success': False, 'error': str(e)}), 400

@admin_bp.get('/api/admin/pharmacy/<int:pharmacy_id>/storage')
@jwt_required()
def admin_get_pharmacy_storage(pharmacy_id):
	"""Get pharmacy storage/data usage overview (admin only)"""
	user_id = get_jwt_identity()
	with engine.connect() as conn:
		_require_admin(conn, user_id)
		
		# Get pharmacy info
		pharmacy = conn.execute(text('SELECT id, name FROM pharmacies WHERE id = :pid'), {'pid': pharmacy_id}).mappings().first()
		if not pharmacy:
			return jsonify({'success': False, 'error': 'Pharmacy not found'}), 404
		
		# Calculate general storage usage by category
		storage_stats = conn.execute(text('''
			with table_stats as (
				select 
					'products' as category_name,
					count(*) as record_count,
					200 as avg_bytes_per_record
				from products where pharmacy_id = :pid
				union all
				select 
					'inventory' as category_name,
					count(*) as record_count,
					150 as avg_bytes_per_record
				from inventory_batches b
				join products p on p.id = b.product_id
				where p.pharmacy_id = :pid
				union all
				select 
					'transactions' as category_name,
					count(*) as record_count,
					400 as avg_bytes_per_record
				from sales where pharmacy_id = :pid
				union all
				select 
					'users' as category_name,
					count(*) as record_count,
					150 as avg_bytes_per_record
				from users where pharmacy_id = :pid
				union all
				select 
					'support' as category_name,
					count(*) as record_count,
					225 as avg_bytes_per_record
				from support_tickets where pharmacy_id = :pid
			)
			select 
				category_name,
				(record_count * avg_bytes_per_record) as size_bytes,
				pg_size_pretty((record_count * avg_bytes_per_record)::bigint) as total_size
			from table_stats
			where record_count > 0
			order by size_bytes desc
		'''), {'pid': pharmacy_id}).mappings().all()
		
		# Calculate totals
		total_size_bytes = sum(row['size_bytes'] or 0 for row in storage_stats)
		storage_limit_gb = 10
		storage_limit_bytes = storage_limit_gb * 1024 * 1024 * 1024
		usage_percentage = (total_size_bytes / storage_limit_bytes * 100) if storage_limit_bytes > 0 else 0
		
		return jsonify({
			'success': True,
			'pharmacy': dict(pharmacy),
			'storage_breakdown': [dict(row) for row in storage_stats],
			'summary': {
				'total_size_bytes': total_size_bytes,
				'total_size_pretty': f"{total_size_bytes / (1024*1024):.2f} MB" if total_size_bytes > 0 else "0 MB",
				'storage_limit_gb': storage_limit_gb,
				'usage_percentage': round(usage_percentage, 2)
			}
		})

# =========================
# SIGNUP REQUEST MANAGEMENT
# =========================

@admin_bp.get('/api/admin/signup-requests')
@jwt_required()
def admin_list_signup_requests():
	"""List all pharmacy signup requests (admin only)"""
	user_id = get_jwt_identity()
	with engine.connect() as conn:
		_require_admin(conn, user_id)
		rows = conn.execute(text('''
			select id, pharmacy_name, email, owner_name, status, admin_notes, created_at, updated_at
			from pharmacy_signup_requests
			order by created_at desc
		''')).mappings().all()
		return jsonify({'success': True, 'requests': [dict(r) for r in rows]})

@admin_bp.post('/api/admin/signup-requests/<int:request_id>/approve')
@jwt_required()
def admin_approve_signup_request(request_id):
	"""Approve a pharmacy signup request and create pharmacy + user (admin only)"""
	user_id = get_jwt_identity()
	data = request.get_json(force=True) or {}
	
	with engine.connect() as conn:
		_require_admin(conn, user_id)
		
		# Get the signup request
		request_row = conn.execute(text('''
			select id, pharmacy_name, email, owner_name, password_hash, status
			from pharmacy_signup_requests
			where id = :req_id
		'''), {'req_id': request_id}).mappings().first()
		
		if not request_row:
			return jsonify({'success': False, 'error': 'Signup request not found'}), 404
		
		if request_row['status'] != 'pending':
			return jsonify({'success': False, 'error': f'Request is already {request_row["status"]}'}), 400
		
		# Check if pharmacy with same name already exists
		existing_pharmacy = conn.execute(text('''
			select id from pharmacies where lower(name) = lower(:name)
		'''), {'name': request_row['pharmacy_name']}).mappings().first()
		
		if existing_pharmacy:
			return jsonify({'success': False, 'error': 'A pharmacy with this name already exists'}), 400
		
		# Check if user with same email already exists
		existing_user = conn.execute(text('''
			select id from users where lower(email) = lower(:email)
		'''), {'email': request_row['email']}).mappings().first()
		
		if existing_user:
			return jsonify({'success': False, 'error': 'A user with this email already exists'}), 400
		
		try:
			with engine.begin() as conn:
				# Create pharmacy
				pharmacy_row = conn.execute(text('''
					insert into pharmacies (name, owner_name, email, is_active)
					values (:name, :owner_name, :email, true)
					returning id, name
				'''), {
					'name': request_row['pharmacy_name'],
					'owner_name': request_row['owner_name'],
					'email': request_row['email']
				}).mappings().first()
				
				# Create user (manager role)
				username = request_row['email'].split('@')[0]
				owner_parts = (request_row['owner_name'] or '').strip().split(' ', 1)
				first_name = owner_parts[0] if owner_parts else ''
				last_name = owner_parts[1] if len(owner_parts) > 1 else ''
				
				user_row = conn.execute(text('''
					insert into users (username, email, password_hash, first_name, last_name, role, pharmacy_id, is_active)
					values (:username, :email, :password_hash, :first_name, :last_name, 'manager', :pharmacy_id, true)
					returning id, username, email, first_name, last_name, role
				'''), {
					'username': username,
					'email': request_row['email'],
					'password_hash': request_row['password_hash'],
					'first_name': first_name,
					'last_name': last_name,
					'pharmacy_id': pharmacy_row['id']
				}).mappings().first()
				
				# Update signup request status
				admin_notes = data.get('admin_notes', '')
				conn.execute(text('''
					update pharmacy_signup_requests
					set status = 'approved', admin_notes = :notes, updated_at = now()
					where id = :req_id
				'''), {
					'req_id': request_id,
					'notes': admin_notes
				})
				
				return jsonify({
					'success': True,
					'message': 'Signup request approved. Pharmacy and user created.',
					'pharmacy': dict(pharmacy_row),
					'user': dict(user_row)
				})
		except Exception as e:
			return jsonify({'success': False, 'error': str(e)}), 400

@admin_bp.post('/api/admin/signup-requests/<int:request_id>/reject')
@jwt_required()
def admin_reject_signup_request(request_id):
	"""Reject a pharmacy signup request (admin only)"""
	user_id = get_jwt_identity()
	data = request.get_json(force=True) or {}
	
	with engine.connect() as conn:
		_require_admin(conn, user_id)
		
		# Get the signup request
		request_row = conn.execute(text('''
			select id, status from pharmacy_signup_requests where id = :req_id
		'''), {'req_id': request_id}).mappings().first()
		
		if not request_row:
			return jsonify({'success': False, 'error': 'Signup request not found'}), 404
		
		if request_row['status'] != 'pending':
			return jsonify({'success': False, 'error': f'Request is already {request_row["status"]}'}), 400
		
		try:
			with engine.begin() as conn:
				admin_notes = data.get('admin_notes', '')
				conn.execute(text('''
					update pharmacy_signup_requests
					set status = 'rejected', admin_notes = :notes, updated_at = now()
					where id = :req_id
				'''), {
					'req_id': request_id,
					'notes': admin_notes
				})
				
				return jsonify({'success': True, 'message': 'Signup request rejected'})
		except Exception as e:
			return jsonify({'success': False, 'error': str(e)}), 400

# =========================
# SUBSCRIPTION PLAN MANAGEMENT
# =========================

@admin_bp.get('/api/admin/subscription-plans')
@jwt_required()
def admin_get_subscription_plans():
	"""Get all subscription plans with prices (admin only)"""
	user_id = get_jwt_identity()
	with engine.connect() as conn:
		_require_admin(conn, user_id)
		rows = conn.execute(text('''
			select id, plan_name, monthly_price, quarterly_price, semi_annual_price, annual_price, is_active
			from subscription_plans
			where is_active = true
			order by monthly_price asc
		''')).mappings().all()
		return jsonify({'success': True, 'plans': [dict(r) for r in rows]})

@admin_bp.post('/api/admin/subscription-plans')
@jwt_required()
def admin_create_subscription_plan():
	"""Create a new subscription plan (admin only)"""
	user_id = get_jwt_identity()
	data = request.get_json(force=True) or {}
	
	with engine.connect() as conn:
		_require_admin(conn, user_id)
		
		required = ['plan_name', 'monthly_price']
		if not all(data.get(k) is not None for k in required):
			return jsonify({'success': False, 'error': 'plan_name and monthly_price are required'}), 400
		
		# Check if plan name already exists
		existing = conn.execute(text('select id from subscription_plans where plan_name = :name'), {'name': data['plan_name']}).mappings().first()
		if existing:
			return jsonify({'success': False, 'error': f'Plan "{data["plan_name"]}" already exists'}), 400
		
		try:
			with engine.begin() as conn:
				row = conn.execute(text('''
					insert into subscription_plans (
						plan_name, monthly_price, quarterly_price, semi_annual_price, annual_price, is_active
					)
					values (
						:plan_name, :monthly_price, :quarterly_price, :semi_annual_price, :annual_price, true
					)
					returning id, plan_name, monthly_price, quarterly_price, semi_annual_price, annual_price, is_active
				'''), {
					'plan_name': data['plan_name'],
					'monthly_price': float(data['monthly_price']),
					'quarterly_price': float(data['quarterly_price']) if data.get('quarterly_price') else None,
					'semi_annual_price': float(data['semi_annual_price']) if data.get('semi_annual_price') else None,
					'annual_price': float(data['annual_price']) if data.get('annual_price') else None,
				}).mappings().first()
				
				return jsonify({'success': True, 'plan': dict(row)})
		except Exception as e:
			return jsonify({'success': False, 'error': str(e)}), 400

@admin_bp.patch('/api/admin/subscription-plans/<int:plan_id>')
@jwt_required()
def admin_update_subscription_plan(plan_id):
	"""Update subscription plan prices (admin only)"""
	user_id = get_jwt_identity()
	data = request.get_json(force=True) or {}
	
	with engine.connect() as conn:
		_require_admin(conn, user_id)
		
		try:
			with engine.begin() as conn:
				updates = []
				params = {'plan_id': plan_id}
				
				if 'monthly_price' in data:
					updates.append('monthly_price = :monthly_price')
					params['monthly_price'] = float(data['monthly_price'])
				
				if 'quarterly_price' in data:
					updates.append('quarterly_price = :quarterly_price')
					params['quarterly_price'] = float(data['quarterly_price'])
				
				if 'semi_annual_price' in data:
					updates.append('semi_annual_price = :semi_annual_price')
					params['semi_annual_price'] = float(data['semi_annual_price'])
				
				if 'annual_price' in data:
					updates.append('annual_price = :annual_price')
					params['annual_price'] = float(data['annual_price'])
				
				if not updates:
					return jsonify({'success': False, 'error': 'No fields to update'}), 400
				
				updates.append('updated_at = now()')
				
				row = conn.execute(text(f'''
					update subscription_plans
					set {', '.join(updates)}
					where id = :plan_id
					returning id, plan_name, monthly_price, quarterly_price, semi_annual_price, annual_price, is_active
				'''), params).mappings().first()
				
				if not row:
					return jsonify({'success': False, 'error': 'Plan not found'}), 404
				
				return jsonify({'success': True, 'plan': dict(row)})
		except Exception as e:
			return jsonify({'success': False, 'error': str(e)}), 400

@admin_bp.delete('/api/admin/subscription-plans/<int:plan_id>')
@jwt_required()
def admin_delete_subscription_plan(plan_id):
	"""Delete (deactivate) a subscription plan (admin only)"""
	user_id = get_jwt_identity()
	
	with engine.connect() as conn:
		_require_admin(conn, user_id)
		
		try:
			with engine.begin() as conn:
				# Check if plan exists
				plan = conn.execute(text('select id, plan_name from subscription_plans where id = :plan_id'), {'plan_id': plan_id}).mappings().first()
				if not plan:
					return jsonify({'success': False, 'error': 'Plan not found'}), 404
				
				# Check if plan is being used by any active subscriptions
				active_subs = conn.execute(text('''
					select count(*) as count
					from subscriptions
					where lower(plan::text) = lower(:plan_name) and status::text = 'active'
				'''), {'plan_name': plan['plan_name']}).mappings().first()
				
				if active_subs['count'] > 0:
					return jsonify({
						'success': False, 
						'error': f'Cannot delete plan. It is currently used by {active_subs["count"]} active subscription(s). Please cancel or expire those subscriptions first.'
					}), 400
				
				# Soft delete by setting is_active = false
				row = conn.execute(text('''
					update subscription_plans
					set is_active = false, updated_at = now()
					where id = :plan_id
					returning id, plan_name, is_active
				'''), {'plan_id': plan_id}).mappings().first()
				
				return jsonify({'success': True, 'plan': dict(row)})
		except Exception as e:
			return jsonify({'success': False, 'error': str(e)}), 400

# =========================
# SUBSCRIPTION MANAGEMENT
# =========================

@admin_bp.get('/api/admin/subscriptions')
@jwt_required()
def admin_list_subscriptions():
	"""List all subscriptions with pharmacy information (admin only) - supports filtering, search, and pagination"""
	user_id = get_jwt_identity()
	
	# Get query parameters
	search = request.args.get('search', '').strip()
	status_filter = request.args.get('status', 'all')
	plan_filter = request.args.get('plan', 'all')
	pharmacy_filter = request.args.get('pharmacy_id', 'all')
	page = int(request.args.get('page', 1))
	per_page = int(request.args.get('per_page', 10))
	
	with engine.connect() as conn:
		_require_admin(conn, user_id)
		
		# Build query with filters
		query = '''
			select 
				s.id, s.pharmacy_id, s.plan, s.status, s.start_date, s.end_date, s.price,
				s.billing_cycle_months, s.next_billing_at, s.xendit_payment_id, s.gcash_payment_id, 
				s.payment_method, s.created_at, s.updated_at,
				p.name as pharmacy_name
			from subscriptions s
			left join pharmacies p on p.id = s.pharmacy_id
			where 1=1
		'''
		params = {}
		
		# Search filter (pharmacy name or plan)
		if search:
			query += ' and (lower(p.name) like :search or lower(s.plan::text) like :search)'
			params['search'] = f'%{search.lower()}%'
		
		# Status filter
		if status_filter != 'all':
			query += ' and s.status::text = :status'
			params['status'] = status_filter.lower()
		
		# Plan filter
		if plan_filter != 'all':
			query += ' and lower(s.plan::text) = :plan'
			params['plan'] = plan_filter.lower()
		
		# Pharmacy filter
		if pharmacy_filter != 'all':
			try:
				pharmacy_id = int(pharmacy_filter)
				query += ' and s.pharmacy_id = :pharmacy_id'
				params['pharmacy_id'] = pharmacy_id
			except (ValueError, TypeError):
				pass
		
		# Get total count for pagination
		count_query = query.replace('select \n\t\t\t\ts.id, s.pharmacy_id, s.plan, s.status, s.start_date, s.end_date, s.price,\n\t\t\t\ts.billing_cycle_months, s.next_billing_at, s.xendit_payment_id, s.gcash_payment_id, \n\t\t\t\ts.payment_method, s.created_at, s.updated_at,\n\t\t\t\tp.name as pharmacy_name', 'select count(*) as total')
		total_result = conn.execute(text(count_query), params).mappings().first()
		total = total_result['total'] if total_result else 0
		
		# Add ordering and pagination
		query += ' order by s.created_at desc'
		offset = (page - 1) * per_page
		query += ' limit :limit offset :offset'
		params['limit'] = per_page
		params['offset'] = offset
		
		rows = conn.execute(text(query), params).mappings().all()
		
		total_pages = (total + per_page - 1) // per_page if per_page > 0 else 0
		
		return jsonify({
			'success': True,
			'subscriptions': [dict(r) for r in rows],
			'pagination': {
				'page': page,
				'per_page': per_page,
				'total': total,
				'total_pages': total_pages
			}
		})

@admin_bp.post('/api/admin/subscriptions')
@jwt_required()
def admin_create_subscription():
	"""Create a new subscription (admin only)"""
	user_id = get_jwt_identity()
	data = request.get_json(force=True) or {}
	
	with engine.connect() as conn:
		_require_admin(conn, user_id)
		
		required = ['pharmacy_id', 'plan', 'billing_cycle_months']
		if not all(data.get(k) is not None for k in required):
			return jsonify({'success': False, 'error': 'pharmacy_id, plan, and billing_cycle_months are required'}), 400
		
		# Validate pharmacy exists
		pharmacy = conn.execute(text('select id from pharmacies where id = :pid'), {'pid': data['pharmacy_id']}).mappings().first()
		if not pharmacy:
			return jsonify({'success': False, 'error': 'Pharmacy not found'}), 404
		
		# Check if pharmacy already has an active subscription with the same plan
		plan_name_lower = data['plan'].lower()
		existing_sub = conn.execute(text('''
			select id, plan, status
			from subscriptions
			where pharmacy_id = :pharmacy_id 
			and lower(plan::text) = :plan_name
			and status::text = ANY(ARRAY['active', 'deactivated']::text[])
		'''), {
			'pharmacy_id': data['pharmacy_id'],
			'plan_name': plan_name_lower
		}).mappings().first()
		
		if existing_sub:
			return jsonify({
				'success': False, 
				'error': f'This pharmacy already has an active or deactivated subscription with the {data["plan"]} plan. Please cancel or expire the existing subscription first.'
			}), 400
		
		# Get plan pricing from subscription_plans table
		plan_row = conn.execute(text('''
			select plan_name, monthly_price, quarterly_price, semi_annual_price, annual_price
			from subscription_plans
			where plan_name = :plan_name and is_active = true
		'''), {'plan_name': data['plan']}).mappings().first()
		
		if not plan_row:
			return jsonify({'success': False, 'error': f'Invalid plan: {data["plan"]}'}), 400
		
		# Calculate price based on billing cycle
		billing_months = int(data['billing_cycle_months'])
		if billing_months == 1:
			price = float(plan_row['monthly_price'])
		elif billing_months == 3:
			price = float(plan_row['quarterly_price'] or plan_row['monthly_price'] * 3)
		elif billing_months == 6:
			price = float(plan_row['semi_annual_price'] or plan_row['monthly_price'] * 6)
		elif billing_months == 12:
			price = float(plan_row['annual_price'] or plan_row['monthly_price'] * 12)
		else:
			# Custom billing cycle - use monthly price * months
			price = float(plan_row['monthly_price']) * billing_months
		
		# Allow override if price is explicitly provided
		if data.get('price') is not None:
			price = float(data['price'])
		
		# Validate status
		valid_statuses = ['active', 'deactivated', 'cancelled', 'expired']
		status = data.get('status', 'active')
		if status not in valid_statuses:
			status = 'active'
		
		# Calculate dates
		start_date = data.get('start_date')
		if start_date:
			try:
				start_date = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
			except:
				start_date = datetime.now()
		else:
			start_date = datetime.now()
		
		end_date = None
		if data.get('end_date'):
			try:
				end_date = datetime.fromisoformat(data['end_date'].replace('Z', '+00:00'))
			except:
				end_date = None
		
		# Calculate next billing date
		next_billing_at = None
		if status == 'active' and data.get('billing_cycle_months'):
			try:
				from dateutil.relativedelta import relativedelta
				next_billing_at = start_date + relativedelta(months=data['billing_cycle_months'])
			except:
				# Fallback: add months manually
				import calendar
				year = start_date.year
				month = start_date.month + data['billing_cycle_months']
				while month > 12:
					month -= 12
					year += 1
				day = min(start_date.day, calendar.monthrange(year, month)[1])
				next_billing_at = datetime(year, month, day, start_date.hour, start_date.minute, start_date.second)
		
		# Get payment method and payment IDs
		payment_method = data.get('payment_method', 'xendit').lower()
		xendit_payment_id = data.get('xendit_payment_id', '') if payment_method == 'xendit' else ''
		gcash_payment_id = data.get('gcash_payment_id', '') if payment_method == 'gcash' else ''
		
		try:
			with engine.begin() as conn:
				row = conn.execute(text('''
					insert into subscriptions (
						pharmacy_id, plan, status, start_date, end_date, price,
						billing_cycle_months, next_billing_at, xendit_payment_id, gcash_payment_id, payment_method
					)
					values (
						:pharmacy_id, :plan, :status::sub_status, :start_date, :end_date, :price,
						:billing_cycle_months, :next_billing_at, :xendit_payment_id, :gcash_payment_id, :payment_method
					)
					returning id, pharmacy_id, plan, status, start_date, end_date, price,
						billing_cycle_months, next_billing_at, xendit_payment_id, gcash_payment_id, payment_method, created_at
				'''), {
					'pharmacy_id': data['pharmacy_id'],
					'plan': data['plan'].lower()[:10] if len(data['plan']) > 10 else data['plan'].lower(),
					'status': status.lower(),
					'start_date': start_date,
					'end_date': end_date,
					'price': price,
					'billing_cycle_months': int(data['billing_cycle_months']),
					'next_billing_at': next_billing_at,
					'xendit_payment_id': xendit_payment_id,
					'gcash_payment_id': gcash_payment_id,
					'payment_method': payment_method
				}).mappings().first()
				
				# Get pharmacy name
				pharmacy_name = conn.execute(text('select name from pharmacies where id = :pid'), {'pid': data['pharmacy_id']}).mappings().first()
				result = dict(row)
				result['pharmacy_name'] = pharmacy_name['name'] if pharmacy_name else None
				
				return jsonify({'success': True, 'subscription': result})
		except Exception as e:
			return jsonify({'success': False, 'error': str(e)}), 400

@admin_bp.patch('/api/admin/subscriptions/<int:subscription_id>')
@jwt_required()
def admin_update_subscription(subscription_id):
	"""Update subscription (admin only) - primarily for price updates"""
	user_id = get_jwt_identity()
	data = request.get_json(force=True) or {}
	
	with engine.connect() as conn:
		_require_admin(conn, user_id)
		
		# Check if subscription exists
		existing = conn.execute(text('''
			select id, pharmacy_id, plan, status, price, billing_cycle_months
			from subscriptions
			where id = :sub_id
		'''), {'sub_id': subscription_id}).mappings().first()
		
		if not existing:
			return jsonify({'success': False, 'error': 'Subscription not found'}), 404
		
		try:
			with engine.begin() as conn:
				updates = []
				params = {'sub_id': subscription_id}
				
				if 'price' in data:
					updates.append('price = :price')
					params['price'] = float(data['price'])
				
				if 'status' in data:
					valid_statuses = ['active', 'deactivated', 'cancelled', 'expired']
					status_value = data['status'].lower() if isinstance(data['status'], str) else data['status']
					if status_value in valid_statuses:
						updates.append('status = cast(:status as sub_status)')
						params['status'] = status_value
						
						# If status changed to cancelled or expired, clear next_billing_at
						if status_value in ['cancelled', 'expired']:
							updates.append('next_billing_at = NULL')
				
				if 'end_date' in data:
					if data['end_date']:
						try:
							end_date = datetime.fromisoformat(data['end_date'].replace('Z', '+00:00'))
							updates.append('end_date = :end_date')
							params['end_date'] = end_date
						except:
							pass
					else:
						updates.append('end_date = NULL')
				
				if 'payment_method' in data:
					payment_method = data['payment_method'].lower()
					if payment_method in ['xendit', 'gcash']:
						updates.append('payment_method = :payment_method')
						params['payment_method'] = payment_method
				
				if 'xendit_payment_id' in data:
					updates.append('xendit_payment_id = :xendit_payment_id')
					params['xendit_payment_id'] = data.get('xendit_payment_id', '')
				
				if 'gcash_payment_id' in data:
					updates.append('gcash_payment_id = :gcash_payment_id')
					params['gcash_payment_id'] = data.get('gcash_payment_id', '')
				
				if not updates:
					return jsonify({'success': False, 'error': 'No fields to update'}), 400
				
				updates.append('updated_at = now()')
				
				row = conn.execute(text(f'''
					update subscriptions
					set {', '.join(updates)}
					where id = :sub_id
					returning id, pharmacy_id, plan, status, start_date, end_date, price,
						billing_cycle_months, next_billing_at, xendit_payment_id, gcash_payment_id, 
						payment_method, created_at, updated_at
				'''), params).mappings().first()
				
				# Get pharmacy name
				pharmacy_name = conn.execute(text('select name from pharmacies where id = :pid'), {'pid': row['pharmacy_id']}).mappings().first()
				result = dict(row)
				result['pharmacy_name'] = pharmacy_name['name'] if pharmacy_name else None
				
				return jsonify({'success': True, 'subscription': result})
		except Exception as e:
			return jsonify({'success': False, 'error': str(e)}), 400

@admin_bp.delete('/api/admin/subscriptions/<int:subscription_id>')
@jwt_required()
def admin_delete_subscription(subscription_id):
	"""Delete a subscription (admin only)"""
	user_id = get_jwt_identity()
	
	with engine.connect() as conn:
		_require_admin(conn, user_id)
		
		try:
			with engine.begin() as conn:
				# Check if subscription exists
				existing = conn.execute(text('''
					select id, pharmacy_id, plan, status
					from subscriptions
					where id = :sub_id
				'''), {'sub_id': subscription_id}).mappings().first()
				
				if not existing:
					return jsonify({'success': False, 'error': 'Subscription not found'}), 404
				
				# Delete the subscription
				conn.execute(text('delete from subscriptions where id = :sub_id'), {'sub_id': subscription_id})
				
				return jsonify({'success': True, 'message': 'Subscription deleted successfully'})
		except Exception as e:
			return jsonify({'success': False, 'error': str(e)}), 400


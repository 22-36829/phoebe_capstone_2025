"""Staff management routes blueprint"""
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
import bcrypt
import os
import re
from utils.helpers import get_current_user, require_manager_or_admin, get_database_url

load_dotenv()
DATABASE_URL = get_database_url()
engine = create_engine(DATABASE_URL, pool_pre_ping=True)

# Validation constants (matching frontend)
MAX_EMAIL_LENGTH = 255
MAX_PASSWORD_LENGTH = 128
MIN_PASSWORD_LENGTH = 8
MAX_NAME_LENGTH = 100

def validate_email(email):
	"""Validate email format and length - matches frontend exactly"""
	if not email or not isinstance(email, str):
		return False, "Email is required"
	
	email = email.strip()
	if len(email) > MAX_EMAIL_LENGTH:
		return False, f"Email must be no more than {MAX_EMAIL_LENGTH} characters"
	
	if len(email) < 3:
		return False, "Email must be at least 3 characters"
	
	# Email format validation - matches frontend pattern exactly
	# Frontend pattern: [a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}
	email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
	if not re.match(email_pattern, email):
		return False, "Invalid email format"
	
	return True, email.lower()

def validate_password(password):
	"""Validate password strength - matches frontend exactly"""
	if not password or not isinstance(password, str):
		return False, "Password is required"
	
	if len(password) < MIN_PASSWORD_LENGTH:
		return False, f"Password must be at least {MIN_PASSWORD_LENGTH} characters"
	
	if len(password) > MAX_PASSWORD_LENGTH:
		return False, f"Password must be no more than {MAX_PASSWORD_LENGTH} characters"
	
	# Check for at least one letter and one number (matches frontend validation)
	# Frontend checks: /[a-zA-Z]/ and /[0-9]/
	has_letter = re.search(r'[a-zA-Z]', password)
	has_number = re.search(r'[0-9]', password)
	
	if not has_letter:
		return False, "Password must contain at least one letter"
	
	if not has_number:
		return False, "Password must contain at least one number"
	
	return True, password

def validate_name(name, field_name="Name"):
	"""Validate name fields - matches frontend exactly"""
	if not name or not isinstance(name, str):
		return False, f"{field_name} is required"
	
	name = name.strip()
	if len(name) < 1:
		return False, f"{field_name} cannot be empty"
	
	if len(name) > MAX_NAME_LENGTH:
		return False, f"{field_name} must be no more than {MAX_NAME_LENGTH} characters"
	
	# Allow letters, spaces, hyphens, and apostrophes only (matches frontend pattern)
	# Frontend pattern: [a-zA-Z\s\-']+
	if not re.match(r'^[a-zA-Z\s\-\']+$', name):
		return False, f"{field_name} can only contain letters, spaces, hyphens, and apostrophes"
	
	return True, name

staff_bp = Blueprint('staff', __name__, url_prefix='/api/manager/staff')
staff_public_bp = Blueprint('staff_public', __name__, url_prefix='/api/staff')

@staff_bp.post('')
@jwt_required()
def create_staff():
	"""Create a new staff member with backend validation"""
	data = request.get_json(force=True) or {}
	
	# Security: Limit request size to prevent DoS attacks
	max_safe_length = 1000
	for key, value in data.items():
		if isinstance(value, str) and len(value) > max_safe_length:
			return jsonify({'success': False, 'error': f'Field {key} is too long'}), 400
	
	# Type checking - ensure all fields are strings if provided
	if 'email' in data and not isinstance(data.get('email'), str):
		return jsonify({'success': False, 'error': 'Email must be a string'}), 400
	if 'password' in data and not isinstance(data.get('password'), str):
		return jsonify({'success': False, 'error': 'Password must be a string'}), 400
	if 'first_name' in data and not isinstance(data.get('first_name'), str):
		return jsonify({'success': False, 'error': 'First name must be a string'}), 400
	if 'last_name' in data and not isinstance(data.get('last_name'), str):
		return jsonify({'success': False, 'error': 'Last name must be a string'}), 400
	
	# Check required fields
	required = ['email', 'password', 'first_name', 'last_name']
	if any(not data.get(k) for k in required):
		return jsonify({'success': False, 'error': 'email, password, first_name, last_name are required'}), 400
	
	# Validate email
	email = data.get('email') or ''
	is_valid, email_result = validate_email(email)
	if not is_valid:
		return jsonify({'success': False, 'error': email_result}), 400
	email = email_result
	
	# Validate password
	password = data.get('password') or ''
	is_valid, password_result = validate_password(password)
	if not is_valid:
		return jsonify({'success': False, 'error': password_result}), 400
	password = password_result
	
	# Validate first name
	first_name = data.get('first_name') or ''
	is_valid, first_name_result = validate_name(first_name, 'First name')
	if not is_valid:
		return jsonify({'success': False, 'error': first_name_result}), 400
	first_name = first_name_result
	
	# Validate last name
	last_name = data.get('last_name') or ''
	is_valid, last_name_result = validate_name(last_name, 'Last name')
	if not is_valid:
		return jsonify({'success': False, 'error': last_name_result}), 400
	last_name = last_name_result
	
	user_id = get_jwt_identity()
	with engine.begin() as conn:
		me = get_current_user(conn, user_id)
		require_manager_or_admin(me)
		pw_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
		try:
			row = conn.execute(text('''
				insert into users (username, email, password_hash, first_name, last_name, role, pharmacy_id, is_active)
				values (:u, :e, :p, :fn, :ln, 'staff', :ph, true)
				returning id, email, username, first_name, last_name, role, is_active
			'''), {
				'u': (data.get('username') or email.split('@')[0]),
				'e': email,
				'p': pw_hash,
				'fn': first_name,
				'ln': last_name,
				'ph': me['pharmacy_id']
			}).mappings().first()
			return jsonify({'success': True, 'user': dict(row)})
		except Exception as e:
			return jsonify({'success': False, 'error': str(e)}), 400


@staff_bp.get('')
@jwt_required()
def list_staff():
	"""List staff members for the current pharmacy."""
	user_id = get_jwt_identity()
	status = request.args.get('status', 'active')  # active | inactive | all

	with engine.connect() as conn:
		me = get_current_user(conn, user_id)
		require_manager_or_admin(me)

		conditions = ["pharmacy_id = :pharmacy_id", "role in ('staff','manager')"]
		params = {'pharmacy_id': me['pharmacy_id']}

		if status == 'active':
			conditions.append('is_active = true')
		elif status == 'inactive':
			conditions.append('is_active = false')

		query = text(f"""
			SELECT id, email, username, first_name, last_name, role, is_active
			FROM users
			WHERE {' AND '.join(conditions)}
			ORDER BY first_name, last_name
		""")

		rows = conn.execute(query, params).mappings().all()

	return jsonify({'success': True, 'staff': [dict(r) for r in rows]})


@staff_bp.patch('/<int:staff_id>')
@jwt_required()
def update_staff(staff_id: int):
	"""Update a staff member's information with backend validation"""
	data = request.get_json(force=True) or {}
	user_id = get_jwt_identity()
	
	# Security: Limit request size to prevent DoS attacks
	max_safe_length = 1000
	for key, value in data.items():
		if isinstance(value, str) and len(value) > max_safe_length:
			return jsonify({'success': False, 'error': f'Field {key} is too long'}), 400
	
	# Type checking for password if provided
	if 'password' in data:
		if not isinstance(data.get('password'), str):
			return jsonify({'success': False, 'error': 'Password must be a string'}), 400
		# Validate password if provided
		password = data.get('password') or ''
		is_valid, password_result = validate_password(password)
		if not is_valid:
			return jsonify({'success': False, 'error': password_result}), 400
		data['password'] = password_result
	
	with engine.begin() as conn:
		me = get_current_user(conn, user_id)
		require_manager_or_admin(me)
		# Disallow modifying own account
		if int(staff_id) == int(user_id):
			return jsonify({'success': False, 'error': 'Not allowed to modify your own account'}), 403
		# Only allow role change to 'staff' or 'manager' (not admin), is_active toggle, and password update
		fields = {}
		if 'role' in data and data['role'] in ('staff', 'manager'):
			fields['role'] = data['role']
		if 'is_active' in data:
			fields['is_active'] = bool(data['is_active'])
		if 'password' in data:
			fields['password'] = data['password']
		if not fields:
			return jsonify({'success': False, 'error': 'Nothing to update'}), 400
		set_clause = []
		params = {'id': staff_id, 'ph': me['pharmacy_id']}
		if 'role' in fields:
			set_clause.append('role = cast(:role as user_role)')
			params['role'] = fields['role']
		if 'is_active' in fields:
			set_clause.append('is_active = :is_active')
			params['is_active'] = fields['is_active']
		if 'password' in fields:
			# Hash the password before storing
			pw_hash = bcrypt.hashpw(fields['password'].encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
			set_clause.append('password_hash = :pw_hash')
			params['pw_hash'] = pw_hash
		sql = text(f"""
			update users set {', '.join(set_clause)}
			where id = :id and pharmacy_id = :ph and role in ('manager','staff')
			returning id, email, username, first_name, last_name, role, is_active
		""")
		row = conn.execute(sql, params).mappings().first()
		if not row:
			return jsonify({'success': False, 'error': 'Staff not found or not allowed'}), 404
		return jsonify({'success': True, 'user': dict(row)})


@staff_bp.delete('/<int:staff_id>')
@jwt_required()
def delete_staff(staff_id: int):
	"""Deactivate a staff member (soft delete)"""
	user_id = get_jwt_identity()
	with engine.begin() as conn:
		me = get_current_user(conn, user_id)
		require_manager_or_admin(me)
		row = conn.execute(text('''
			update users set is_active = false
			where id = :id and id <> :me and pharmacy_id = :ph and role = 'staff'
			returning id
		'''), {'id': staff_id, 'me': int(user_id), 'ph': me['pharmacy_id']}).first()
		if not row:
			return jsonify({'success': False, 'error': 'Staff not found or not allowed'}), 404
		return jsonify({'success': True})


# =========================
# Staff-facing sustainability endpoints
# =========================

@staff_public_bp.get('/sustainability/expiry-risk')
@jwt_required()
def staff_sustainability_expiry_risk():
	"""Staff-accessible expiry risk analysis.

	Same logic as manager endpoint but exposed under /api/staff.
	"""
	try:
		user_id = get_jwt_identity()
		with engine.connect() as conn:
			me = conn.execute(text('select id, role, pharmacy_id from users where id = :id'), {'id': user_id}).mappings().first()
			if not me or me['role'] not in ('staff','manager','admin'):
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
			}
			if category_id:
				try:
					params['category_id'] = int(category_id)
				except (TypeError, ValueError):
					pass
			if search_term:
				params['search'] = f"%{search_term}%"

			params['critical_window'] = critical_window
			params['soon_window'] = soon_window
			params['medium_window'] = medium_window

			# Build query with conditional filters to avoid type ambiguity
			base_query = '''
			with product_data as (
				select 
					p.id,
					p.name,
					pc.name as category_name,
					p.location,
					sum(case when b.quantity > 0 then (b.quantity - coalesce(b.sold_quantity, 0) - coalesce(b.disposed_quantity, 0)) else 0 end) as total_quantity,
					sum(case when b.quantity > 0 then (b.quantity - coalesce(b.sold_quantity, 0) - coalesce(b.disposed_quantity, 0)) * coalesce(b.cost_price, p.cost_price) else 0 end) as total_value,
					sum(case when b.expiration_date <= current_date and (b.quantity - coalesce(b.sold_quantity, 0) - coalesce(b.disposed_quantity, 0)) > 0 then (b.quantity - coalesce(b.sold_quantity, 0) - coalesce(b.disposed_quantity, 0)) * coalesce(b.cost_price, p.cost_price) else 0 end) as expired_value,
					sum(case when b.expiration_date > current_date and b.expiration_date <= current_date + make_interval(days => :soon_window) and (b.quantity - coalesce(b.sold_quantity, 0) - coalesce(b.disposed_quantity, 0)) > 0 then (b.quantity - coalesce(b.sold_quantity, 0) - coalesce(b.disposed_quantity, 0)) * coalesce(b.cost_price, p.cost_price) else 0 end) as expiring_soon_value,
					sum(case when b.expiration_date <= current_date and (b.quantity - coalesce(b.sold_quantity, 0) - coalesce(b.disposed_quantity, 0)) > 0 then (b.quantity - coalesce(b.sold_quantity, 0) - coalesce(b.disposed_quantity, 0)) else 0 end) as expired_quantity,
					sum(case when b.expiration_date > current_date and b.expiration_date <= current_date + make_interval(days => :soon_window) and (b.quantity - coalesce(b.sold_quantity, 0) - coalesce(b.disposed_quantity, 0)) > 0 then (b.quantity - coalesce(b.sold_quantity, 0) - coalesce(b.disposed_quantity, 0)) else 0 end) as expiring_soon_quantity,
					min(b.expiration_date) as next_expiration,
					(min(b.expiration_date) - current_date)::int as days_to_expiry
				from products p
				join inventory_batches b on b.product_id = p.id
				left join product_categories pc on pc.id = p.category_id
				where p.pharmacy_id = :ph
				  and p.is_active = true
				  and b.expiration_date is not null
				  and (b.quantity > 0 or :include_zero)
			'''
			
			# Add category filter if provided
			if params.get('category_id'):
				base_query += ' and p.category_id = :category_id'
			
			# Add search filter if provided
			if params.get('search'):
				base_query += ' and (lower(p.name) like :search or lower(coalesce(pc.name, \'\')) like :search)'
			
			base_query += '''
				group by p.id, p.name, pc.name, p.location
			)
			select 
				id,
				name,
				category_name,
				location,
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
			'''
			
			rows = conn.execute(text(base_query), {**params, 'state_filter': state_filter, 'status_filter': status_filter}).mappings().all()

			critical_risk, high_risk, medium_risk, low_risk = [], [], [], []
			total_value_sum = 0.0
			expired_value_sum = 0.0
			expiring_value_sum = 0.0
			filtered_count = 0

			for row in rows:
				try:
					days_int = row['days_to_expiry']
				except Exception:
					days_int = None
				next_exp = row['next_expiration']
				expiry_state = row['expiry_state']
				# Calculate days_expired for expired products (negative days_to_expiry means expired)
				days_expired = None
				if expiry_state == 'expired' and days_int is not None:
					if days_int < 0:
						days_expired = abs(days_int)
					elif row['expired_quantity'] and row['expired_quantity'] > 0:
						days_expired = 0  # Expired today
				
				item = {
					'id': row['id'],
					'name': row['name'],
					'category_name': row['category_name'],
					'location': row.get('location') or None,
					'total_quantity': int(row['total_quantity'] or 0),
					'current_stock': int(row['total_quantity'] or 0),  # Map total_quantity to current_stock for frontend compatibility
					'total_value': float(row['total_value'] or 0.0),
					'expired_quantity': int(row['expired_quantity'] or 0),
					'expiring_soon_quantity': int(row['expiring_soon_quantity'] or 0),
					'expired_value': float(row['expired_value'] or 0.0),
					'expiring_soon_value': float(row['expiring_soon_value'] or 0.0),
					'days_to_expiry': days_int,
					'days_expired': days_expired,  # Add days_expired for expired products
					'next_expiration': next_exp.isoformat() if next_exp else None,
					'risk_level': row['risk_level'],
					'expiry_state': expiry_state,
				}
				total_value_sum += item['total_value']
				expired_value_sum += item['expired_value']
				expiring_value_sum += item['expiring_soon_value']
				filtered_count += 1

				if item['risk_level'] == 'critical':
					critical_risk.append(item)
				elif item['risk_level'] == 'high':
					high_risk.append(item)
				elif item['risk_level'] == 'medium':
					medium_risk.append(item)
				else:
					low_risk.append(item)

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
	except Exception as e:
		return jsonify({'success': False, 'error': str(e)}), 500


@staff_public_bp.get('/batches/<int:product_id>')
@jwt_required()
def staff_list_batches(product_id: int):
	"""List deliveries for a product for any authenticated user in the same pharmacy."""
	user_id = get_jwt_identity()
	try:
		with engine.connect() as conn:
			# Ensure tables exist (with proper error handling)
			try:
				# Import helper functions from manager routes
				from routes.manager import _ensure_batches_table, _ensure_suppliers_and_po_tables
				try:
					_ensure_batches_table(conn)
				except Exception:
					conn.rollback()
				try:
					_ensure_suppliers_and_po_tables(conn)
				except Exception:
					conn.rollback()
			except ImportError:
				# If helper functions don't exist, tables may already be created
				pass

			me = conn.execute(text('select id, pharmacy_id from users where id = :id'), {'id': user_id}).mappings().first()
			if not me:
				return jsonify({'success': False, 'error': 'User not found'}), 404

			product = conn.execute(text('select id, pharmacy_id from products where id = :id'), {'id': product_id}).mappings().first()
			if not product or int(product['pharmacy_id']) != int(me['pharmacy_id']):
				return jsonify({'success': False, 'error': 'Product not found'}), 404

			batches = conn.execute(text('''
				select b.id, b.batch_number, b.quantity, 
					   coalesce(b.sold_quantity, 0) as sold_quantity,
					   coalesce(b.disposed_quantity, 0) as disposed_quantity,
					   CASE 
						   WHEN b.expiration_date IS NOT NULL AND b.expiration_date <= CURRENT_DATE THEN 0
						   ELSE (b.quantity - coalesce(b.sold_quantity, 0) - coalesce(b.disposed_quantity, 0))
					   END as available_quantity,
					   (b.quantity - coalesce(b.disposed_quantity, 0)) as delivered_quantity,
					   b.expiration_date, b.delivery_date,
					   b.supplier_id, b.cost_price, b.received_at,
					   s.name as supplier_name
				from inventory_batches b
				left join suppliers s on s.id = b.supplier_id
				where b.product_id = :pid
				order by b.received_at desc
			'''), {'pid': product_id}).mappings().all()

			conn.commit()
			return jsonify({'success': True, 'batches': [dict(b) for b in batches]})
	except Exception as e:
		return jsonify({'success': False, 'error': str(e)}), 500

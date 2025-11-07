"""Staff management routes blueprint"""
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
import bcrypt
import os
from utils.helpers import get_current_user, require_manager_or_admin

load_dotenv()
DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql+psycopg2://postgres:PhoebeDrugStore01@db.xybuirzvlfuwmtcokkwm.supabase.co:5432/postgres?sslmode=require')
engine = create_engine(DATABASE_URL, pool_pre_ping=True)

staff_bp = Blueprint('staff', __name__, url_prefix='/api/manager/staff')
staff_public_bp = Blueprint('staff_public', __name__, url_prefix='/api/staff')

@staff_bp.post('')
@jwt_required()
def create_staff():
	"""Create a new staff member"""
	data = request.get_json(force=True) or {}
	required = ['email', 'password', 'first_name', 'last_name']
	if any(not data.get(k) for k in required):
		return jsonify({'success': False, 'error': 'email, password, first_name, last_name are required'}), 400
	user_id = get_jwt_identity()
	with engine.begin() as conn:
		me = get_current_user(conn, user_id)
		require_manager_or_admin(me)
		pw_hash = bcrypt.hashpw(data['password'].encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
		try:
			row = conn.execute(text('''
				insert into users (username, email, password_hash, first_name, last_name, role, pharmacy_id, is_active)
				values (:u, :e, :p, :fn, :ln, 'staff', :ph, true)
				returning id, email, username, first_name, last_name, role, is_active
			'''), {
				'u': (data.get('username') or data['email'].split('@')[0]),
				'e': data['email'],
				'p': pw_hash,
				'fn': data['first_name'],
				'ln': data['last_name'],
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
	"""Update a staff member's information"""
	data = request.get_json(force=True) or {}
	user_id = get_jwt_identity()
	with engine.begin() as conn:
		me = get_current_user(conn, user_id)
		require_manager_or_admin(me)
		# Disallow modifying own account
		if int(staff_id) == int(user_id):
			return jsonify({'success': False, 'error': 'Not allowed to modify your own account'}), 403
		# Only allow role change to 'staff' or 'manager' (not admin), and is_active toggle
		fields = {}
		if 'role' in data and data['role'] in ('staff', 'manager'):
			fields['role'] = data['role']
		if 'is_active' in data:
			fields['is_active'] = bool(data['is_active'])
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
			item = {
				'id': row['id'],
				'name': row['name'],
				'category_name': row['category_name'],
				'total_quantity': int(row['total_quantity'] or 0),
				'total_value': float(row['total_value'] or 0.0),
				'expired_quantity': int(row['expired_quantity'] or 0),
				'expiring_soon_quantity': int(row['expiring_soon_quantity'] or 0),
				'expired_value': float(row['expired_value'] or 0.0),
				'expiring_soon_value': float(row['expiring_soon_value'] or 0.0),
				'days_to_expiry': days_int,
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

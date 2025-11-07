"""Authentication routes"""
from flask import Blueprint, jsonify, request
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
import bcrypt
import os
import sys
from pathlib import Path

# Add parent directory to path to import utils
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

load_dotenv()
from utils.helpers import get_database_url

DATABASE_URL = get_database_url()
engine = create_engine(DATABASE_URL, pool_pre_ping=True)

auth_bp = Blueprint('auth', __name__)

@auth_bp.post('/api/auth/register')
def register():
	data = request.get_json(force=True) or {}
	email = (data.get('email') or '').strip()
	password = data.get('password') or ''
	first_name = (data.get('first_name') or '').strip()
	last_name = (data.get('last_name') or '').strip()
	pharmacy_name = (data.get('pharmacy_name') or '').strip() or 'New Pharmacy'
	if not email or not password:
		return jsonify({'error': 'email and password are required'}), 400

	password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
	owner_name = f"{first_name} {last_name}".strip()

	try:
		with engine.begin() as conn:
			# Avoid duplicate pending requests for the same email
			existing = conn.execute(text('''
				select id from pharmacy_signup_requests
				where lower(email) = lower(:email) and status = 'pending'
				limit 1
			'''), {'email': email}).mappings().first()
			if existing:
				return jsonify({'success': True, 'pending_approval': True, 'message': 'Your signup request is already pending approval.'}), 202

			conn.execute(text('''
				insert into pharmacy_signup_requests (pharmacy_name, email, owner_name, password_hash, status)
				values (:pharmacy_name, :email, :owner_name, :password_hash, 'pending')
			'''), {
				'pharmacy_name': pharmacy_name,
				'email': email,
				'owner_name': owner_name,
				'password_hash': password_hash
			})
			return jsonify({'success': True, 'pending_approval': True, 'message': 'Signup request submitted. An admin will review and approve your pharmacy.'}), 202
	except Exception as e:
		return jsonify({'error': str(e)}), 400


@auth_bp.post('/api/auth/login')
def login():
	data = request.get_json(force=True) or {}
	email = data.get('email')
	password = data.get('password')
	if not all([email, password]):
		return jsonify({'error': 'email and password are required'}), 400

	sql = text('select id, email, username, password_hash, role, pharmacy_id from users where email = :email')
	with engine.connect() as conn:
		row = conn.execute(sql, {'email': email}).mappings().first()
	if not row:
		return jsonify({'error': 'Invalid credentials'}), 401
	if not bcrypt.checkpw(password.encode('utf-8'), row['password_hash'].encode('utf-8')):
		return jsonify({'error': 'Invalid credentials'}), 401

	user = {k: row[k] for k in ['id','email','username','role','pharmacy_id']}
	token = create_access_token(identity=str(row['id']))
	return jsonify({'user': user, 'access_token': token})


@auth_bp.get('/api/auth/me')
@jwt_required()
def me():
	user_id = get_jwt_identity()
	sql = text('select id, email, username, role, pharmacy_id from users where id = :user_id')
	with engine.connect() as conn:
		row = conn.execute(sql, {'user_id': user_id}).mappings().first()
	if not row:
		return jsonify({'error': 'User not found'}), 404
	user = {k: row[k] for k in ['id','email','username','role','pharmacy_id']}
	return jsonify({'user': user})

@auth_bp.post('/api/auth/create-demo')
def create_demo_accounts():
	"""Manually create demo accounts"""
	try:
		with engine.begin() as conn:
			# Ensure pharmacy exists
			ph = conn.execute(text("""
				insert into pharmacies (name, address, is_active)
				values ('Phoebe Drugstore','', true)
				on conflict (name) do update set name = excluded.name
				returning id
			""")).mappings().first()
			pharmacy_id = ph['id'] if ph else conn.execute(text("select id from pharmacies where name='Phoebe Drugstore' limit 1")).scalar()

			def upsert_user(email: str, password: str, role: str):
				pw_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
				conn.execute(text("""
					insert into users (username, email, password_hash, first_name, last_name, role, pharmacy_id, is_active)
					values (:u, :e, :p, '', '', cast(:r as user_role), :ph, true)
					on conflict (email) do update set password_hash = excluded.password_hash, role = excluded.role, pharmacy_id = excluded.pharmacy_id
				"""), { 'u': email.split('@')[0], 'e': email, 'p': pw_hash, 'r': role, 'ph': pharmacy_id })

			upsert_user('admin@phoebe.com', 'admin123', 'admin')
			upsert_user('manager@phoebe.com', 'manager123', 'manager')
			upsert_user('staff@phoebe.com', 'staff123', 'staff')
			
		return jsonify({'success': True, 'message': 'Demo accounts created successfully'})
	except Exception as e:
		return jsonify({'success': False, 'error': str(e)}), 400


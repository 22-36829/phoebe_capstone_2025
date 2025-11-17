"""Authentication routes"""
from flask import Blueprint, jsonify, request
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
import bcrypt
import os
import sys
import re
import secrets
from datetime import datetime, timedelta
from pathlib import Path

# Add parent directory to path to import utils
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

load_dotenv()
from utils.helpers import get_database_url

DATABASE_URL = get_database_url()
engine = create_engine(DATABASE_URL, pool_pre_ping=True)

auth_bp = Blueprint('auth', __name__)

# Validation constants
MAX_EMAIL_LENGTH = 255
MAX_PASSWORD_LENGTH = 128
MIN_PASSWORD_LENGTH = 8
MAX_NAME_LENGTH = 100
MAX_PHARMACY_NAME_LENGTH = 200
MIN_PHARMACY_NAME_LENGTH = 2

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

def validate_pharmacy_name(name):
	"""Validate pharmacy name - matches frontend exactly"""
	if not name or not isinstance(name, str):
		return False, "Pharmacy name is required"
	
	name = name.strip()
	if len(name) < MIN_PHARMACY_NAME_LENGTH:
		return False, f"Pharmacy name must be at least {MIN_PHARMACY_NAME_LENGTH} characters"
	
	if len(name) > MAX_PHARMACY_NAME_LENGTH:
		return False, f"Pharmacy name must be no more than {MAX_PHARMACY_NAME_LENGTH} characters"
	
	# Allow letters, numbers, spaces, hyphens, apostrophes, periods, commas, ampersands, parentheses
	# Frontend pattern: [a-zA-Z0-9\s\-'.,&()]+
	if not re.match(r'^[a-zA-Z0-9\s\-\'.,&()]+$', name):
		return False, "Pharmacy name contains invalid characters"
	
	return True, name

@auth_bp.post('/api/auth/register')
def register():
	# Ensure request has JSON data
	if not request.is_json:
		return jsonify({'error': 'Request must be JSON'}), 400
	
	data = request.get_json(force=True) or {}
	
	# Security: Limit request size to prevent DoS attacks
	# Check if any field is suspiciously long before processing
	max_safe_length = 1000  # Reasonable upper limit for any field
	for key, value in data.items():
		if isinstance(value, str) and len(value) > max_safe_length:
			return jsonify({'error': f'Field {key} is too long'}), 400
	
	# Type checking - ensure all fields are strings if provided
	if 'email' in data and not isinstance(data.get('email'), str):
		return jsonify({'error': 'Email must be a string'}), 400
	if 'password' in data and not isinstance(data.get('password'), str):
		return jsonify({'error': 'Password must be a string'}), 400
	if 'first_name' in data and not isinstance(data.get('first_name'), str):
		return jsonify({'error': 'First name must be a string'}), 400
	if 'last_name' in data and not isinstance(data.get('last_name'), str):
		return jsonify({'error': 'Last name must be a string'}), 400
	if 'pharmacy_name' in data and not isinstance(data.get('pharmacy_name'), str):
		return jsonify({'error': 'Pharmacy name must be a string'}), 400
	if 'confirm_password' in data and not isinstance(data.get('confirm_password'), str):
		return jsonify({'error': 'Password confirmation must be a string'}), 400
	if 'confirmPassword' in data and not isinstance(data.get('confirmPassword'), str):
		return jsonify({'error': 'Password confirmation must be a string'}), 400
	
	# Extract and validate email
	email = data.get('email') or ''
	is_valid, email_result = validate_email(email)
	if not is_valid:
		return jsonify({'error': email_result}), 400
	email = email_result
	
	# Extract and validate password
	password = data.get('password') or ''
	is_valid, password_result = validate_password(password)
	if not is_valid:
		return jsonify({'error': password_result}), 400
	password = password_result
	
	# Validate password confirmation (required)
	confirm_password = data.get('confirm_password') or data.get('confirmPassword') or ''
	if not confirm_password:
		return jsonify({'error': 'Please confirm your password'}), 400
	if not isinstance(confirm_password, str):
		return jsonify({'error': 'Password confirmation must be a string'}), 400
	if password != confirm_password:
		return jsonify({'error': 'Passwords do not match'}), 400
	
	# Extract and validate first name
	first_name = data.get('first_name') or ''
	is_valid, first_name_result = validate_name(first_name, 'First name')
	if not is_valid:
		return jsonify({'error': first_name_result}), 400
	first_name = first_name_result
	
	# Extract and validate last name
	last_name = data.get('last_name') or ''
	is_valid, last_name_result = validate_name(last_name, 'Last name')
	if not is_valid:
		return jsonify({'error': last_name_result}), 400
	last_name = last_name_result
	
	# Extract and validate pharmacy name
	pharmacy_name = data.get('pharmacy_name') or ''
	is_valid, pharmacy_name_result = validate_pharmacy_name(pharmacy_name)
	if not is_valid:
		return jsonify({'error': pharmacy_name_result}), 400
	pharmacy_name = pharmacy_name_result
	
	# Hash password
	password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
	owner_name = f"{first_name} {last_name}".strip()

	try:
		with engine.begin() as conn:
			# Check if email already exists in users table
			existing_user = conn.execute(text('''
				select id from users
				where lower(email) = lower(:email)
				limit 1
			'''), {'email': email}).mappings().first()
			if existing_user:
				return jsonify({'error': 'An account with this email already exists'}), 400
			
			# Check if email already exists in pharmacy_signup_requests (pending or approved)
			existing_request = conn.execute(text('''
				select id, status from pharmacy_signup_requests
				where lower(email) = lower(:email)
				limit 1
			'''), {'email': email}).mappings().first()
			if existing_request:
				if existing_request['status'] == 'pending':
					return jsonify({'success': True, 'pending_approval': True, 'message': 'Your signup request is already pending approval.'}), 202
				else:
					return jsonify({'error': 'An account with this email already exists or was previously registered'}), 400

			# Insert the signup request
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
		# Log the error but don't expose internal details
		print(f"Registration error: {e}")
		return jsonify({'error': 'Registration failed. Please try again later.'}), 400


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

@auth_bp.post('/api/auth/forgot-password')
def forgot_password():
	"""Request password reset - generates a reset token"""
	data = request.get_json(force=True) or {}
	email = data.get('email', '').strip().lower()
	
	if not email:
		return jsonify({'error': 'Email is required'}), 400
	
	# Validate email format
	is_valid, email_result = validate_email(email)
	if not is_valid:
		return jsonify({'error': email_result}), 400
	
	# Prevent password reset for demo accounts
	demo_accounts = ['admin@phoebe.com', 'manager@phoebe.com', 'staff@phoebe.com']
	if email in demo_accounts:
		return jsonify({'error': 'Password reset is not available for demo accounts. Please use the default password.'}), 403
	
	try:
		with engine.begin() as conn:
			# Check if user exists
			user = conn.execute(text('''
				select id, email from users where lower(email) = :email
			'''), {'email': email}).mappings().first()
			
			# Always return success to prevent email enumeration
			# Generate reset token
			reset_token = secrets.token_urlsafe(32)
			expires_at = datetime.utcnow() + timedelta(hours=1)
			
			if user:
				# Create or update password reset token
				conn.execute(text('''
					create table if not exists password_reset_tokens (
						id serial primary key,
						user_id integer not null references users(id) on delete cascade,
						token varchar(255) unique not null,
						expires_at timestamp not null,
						used boolean default false,
						created_at timestamp default now()
					)
				'''))
				
				# Delete old tokens for this user
				conn.execute(text('''
					delete from password_reset_tokens
					where user_id = :user_id or expires_at < now()
				'''), {'user_id': user['id']})
				
				# Insert new token
				conn.execute(text('''
					insert into password_reset_tokens (user_id, token, expires_at)
					values (:user_id, :token, :expires_at)
				'''), {
					'user_id': user['id'],
					'token': reset_token,
					'expires_at': expires_at
				})
			
			# Always return success (security: don't reveal if email exists)
			return jsonify({
				'success': True,
				'message': 'If an account exists with this email, a password reset link has been sent.',
				'reset_token': reset_token  # In production, send via email instead
			})
	except Exception as e:
		print(f"Forgot password error: {e}")
		return jsonify({'error': 'An error occurred. Please try again later.'}), 500

@auth_bp.post('/api/auth/reset-password')
def reset_password():
	"""Reset password using reset token"""
	data = request.get_json(force=True) or {}
	token = data.get('token', '').strip()
	password = data.get('password', '')
	
	if not token:
		return jsonify({'error': 'Reset token is required'}), 400
	
	if not password:
		return jsonify({'error': 'Password is required'}), 400
	
	# Validate password
	is_valid, password_result = validate_password(password)
	if not is_valid:
		return jsonify({'error': password_result}), 400
	
	try:
		with engine.begin() as conn:
			# Ensure table exists
			conn.execute(text('''
				create table if not exists password_reset_tokens (
					id serial primary key,
					user_id integer not null references users(id) on delete cascade,
					token varchar(255) unique not null,
					expires_at timestamp not null,
					used boolean default false,
					created_at timestamp default now()
				)
			'''))
			
			# Find valid token
			token_record = conn.execute(text('''
				select user_id, expires_at, used
				from password_reset_tokens
				where token = :token
			'''), {'token': token}).mappings().first()
			
			if not token_record:
				return jsonify({'error': 'Invalid or expired reset token'}), 400
			
			if token_record['used']:
				return jsonify({'error': 'This reset token has already been used'}), 400
			
			if datetime.utcnow() > token_record['expires_at']:
				return jsonify({'error': 'Reset token has expired. Please request a new one.'}), 400
			
			# Check if this is a demo account
			user = conn.execute(text('''
				select email from users where id = :user_id
			'''), {'user_id': token_record['user_id']}).mappings().first()
			
			if user:
				demo_accounts = ['admin@phoebe.com', 'manager@phoebe.com', 'staff@phoebe.com']
				if user['email'].lower() in demo_accounts:
					return jsonify({'error': 'Password reset is not available for demo accounts. Please use the default password.'}), 403
			
			# Update password
			password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
			conn.execute(text('''
				update users
				set password_hash = :password_hash, updated_at = now()
				where id = :user_id
			'''), {
				'password_hash': password_hash,
				'user_id': token_record['user_id']
			})
			
			# Mark token as used
			conn.execute(text('''
				update password_reset_tokens
				set used = true
				where token = :token
			'''), {'token': token})
			
			return jsonify({
				'success': True,
				'message': 'Password has been reset successfully'
			})
	except Exception as e:
		print(f"Reset password error: {e}")
		return jsonify({'error': 'An error occurred. Please try again later.'}), 500


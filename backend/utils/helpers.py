"""Utility helper functions for the application"""
from flask import request, abort
from sqlalchemy import text
from datetime import datetime, timedelta
import os
from urllib.parse import urlparse, urlencode, parse_qs, urlunparse


def get_current_user(conn, user_id: str):
	"""Get current user from database connection"""
	return conn.execute(text('select id, role, pharmacy_id from users where id = :id'), {'id': user_id}).mappings().first()


def require_manager_or_admin(user_row):
	"""Require user to be manager or admin, otherwise abort with 403"""
	if not user_row or user_row['role'] not in ('manager', 'admin'):
		abort(403, description='Forbidden')


def date_range_params():
	"""Extract date range parameters from request query string"""
	from_str = request.args.get('from')
	to_str = request.args.get('to')
	if to_str:
		to_dt = datetime.fromisoformat(to_str)
	else:
		to_dt = datetime.utcnow()
	if from_str:
		from_dt = datetime.fromisoformat(from_str)
	else:
		from_dt = to_dt - timedelta(days=30)
	return from_dt, to_dt


def get_database_url():
	"""
	Get DATABASE_URL from environment and sanitize it by removing invalid parameters.
	
	Converts psycopg2 URLs to psycopg (psycopg3) for Python 3.13 compatibility.
	Removes 'pgbouncer' parameter which is not recognized by psycopg.
	pgbouncer is handled automatically when connecting through the pooler port.
	"""
	default_url = 'postgresql+psycopg://postgres:PhoebeDrugStore01@db.xybuirzvlfuwmtcokkwm.supabase.co:5432/postgres?sslmode=require'
	db_url = os.getenv('DATABASE_URL', default_url)
	
	# Convert psycopg2 to psycopg (psycopg3) for Python 3.13 compatibility
	if 'postgresql+psycopg2://' in db_url:
		db_url = db_url.replace('postgresql+psycopg2://', 'postgresql+psycopg://')
	
	# Parse the URL
	parsed = urlparse(db_url)
	
	# Parse query parameters
	query_params = parse_qs(parsed.query)
	
	# Remove pgbouncer parameter if present (psycopg doesn't recognize it)
	if 'pgbouncer' in query_params:
		del query_params['pgbouncer']
	
	# Rebuild query string
	new_query = urlencode(query_params, doseq=True)
	
	# Reconstruct URL
	sanitized_url = urlunparse((
		parsed.scheme,
		parsed.netloc,
		parsed.path,
		parsed.params,
		new_query,
		parsed.fragment
	))
	
	return sanitized_url


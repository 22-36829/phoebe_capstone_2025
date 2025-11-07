"""Utility helper functions for the application"""
from flask import request, abort
from sqlalchemy import text
from datetime import datetime, timedelta


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


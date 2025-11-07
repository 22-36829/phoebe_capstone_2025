"""Inventory requests routes to match frontend paths under /api/inventory."""

import os
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql+psycopg2://postgres:PhoebeDrugStore01@db.xybuirzvlfuwmtcokkwm.supabase.co:5432/postgres?sslmode=require')
engine = create_engine(DATABASE_URL, pool_pre_ping=True)

inventory_bp = Blueprint('inventory', __name__, url_prefix='/api/inventory')


@inventory_bp.post('/requests')
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
        prod = conn.execute(text('select id, pharmacy_id from products where id = :pid'), {'pid': product_id}).mappings().first()
        if not prod or int(prod['pharmacy_id']) != int(me['pharmacy_id']):
            return jsonify({'success': False, 'error': 'Product not found in your pharmacy'}), 404
        row = conn.execute(text('''
            insert into inventory_adjustment_requests (pharmacy_id, product_id, requested_by, quantity_change, reason, status)
            values (:ph, :pid, :uid, :qty, :reason, 'pending')
            returning id, status
        '''), {'ph': me['pharmacy_id'], 'pid': product_id, 'uid': user_id, 'qty': int(qty), 'reason': reason}).mappings().first()
        return jsonify({'success': True, 'request': dict(row)})


@inventory_bp.get('/requests')
@jwt_required()
def list_inventory_requests():
    user_id = get_jwt_identity()
    status = request.args.get('status')
    page = int(request.args.get('page', 1))
    page_size = int(request.args.get('page_size', 25))
    page = max(page, 1)
    page_size = max(min(page_size, 100), 1)
    with engine.connect() as conn:
        me = conn.execute(text('select id, role, pharmacy_id from users where id = :id'), {'id': user_id}).mappings().first()
        if not me:
            return jsonify({'success': False, 'error': 'User not found'}), 404
        params = {'ph': me['pharmacy_id']}
        status_filter = ''
        if status:
            status_filter = ' and r.status = :st'
            params['st'] = status
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


@inventory_bp.post('/requests/<int:req_id>/approve')
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


@inventory_bp.post('/requests/<int:req_id>/reject')
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


@inventory_bp.patch('/requests/<int:req_id>')
@jwt_required()
def update_inventory_request(req_id: int):
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


@inventory_bp.delete('/requests/<int:req_id>')
@jwt_required()
def delete_inventory_request(req_id: int):
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




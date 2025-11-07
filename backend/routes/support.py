"""Support tickets and announcements routes."""

import os
import json
from datetime import datetime

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://postgres:PhoebeDrugStore01@db.xybuirzvlfuwmtcokkwm.supabase.co:5432/postgres?sslmode=require",
)

engine = create_engine(DATABASE_URL, pool_pre_ping=True)

support_bp = Blueprint("support", __name__, url_prefix="/api/support")
announcements_bp = Blueprint("announcements", __name__, url_prefix="/api/announcements")


def _generate_ticket_number(conn, pharmacy_id: int) -> str:
    """Generate a unique ticket number for the given pharmacy."""

    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    ticket_num = f"TKT-{pharmacy_id}-{timestamp}"
    while conn.execute(
        text("SELECT 1 FROM support_tickets WHERE ticket_number = :tn"),
        {"tn": ticket_num},
    ).first():
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S%f")
        ticket_num = f"TKT-{pharmacy_id}-{timestamp}"
    return ticket_num


@support_bp.post("/tickets")
@jwt_required()
def create_support_ticket():
    """Create a new support ticket (manager/owner only)."""

    user_id = get_jwt_identity()
    data = request.get_json() or {}

    with engine.connect() as conn:
        me = conn.execute(
            text("select id, role, pharmacy_id from users where id = :id"),
            {"id": user_id},
        ).mappings().first()
        if not me or me["role"] not in ("manager", "admin"):
            return jsonify({"success": False, "error": "Forbidden"}), 403

        type_val = data.get("type", "support")
        if type_val not in ("support", "feature_request", "bug_report"):
            return jsonify({"success": False, "error": "Invalid ticket type"}), 400

        subject = (data.get("subject") or "").strip()
        if not subject:
            return jsonify({"success": False, "error": "Subject is required"}), 400

        description = (data.get("description") or "").strip()
        priority = data.get("priority", "medium")
        if priority not in ("low", "medium", "high", "urgent"):
            priority = "medium"

        ticket_number = _generate_ticket_number(conn, me["pharmacy_id"])

        result = conn.execute(
            text(
                """
                INSERT INTO support_tickets (
                    ticket_number, pharmacy_id, created_by, type, subject, description, priority
                ) VALUES (
                    :ticket_number, :pharmacy_id, :created_by, :type, :subject, :description, :priority
                ) RETURNING id, ticket_number, created_at
                """
            ),
            {
                "ticket_number": ticket_number,
                "pharmacy_id": me["pharmacy_id"],
                "created_by": me["id"],
                "type": type_val,
                "subject": subject,
                "description": description,
                "priority": priority,
            },
        ).mappings().first()

        conn.commit()

        if description:
            conn.execute(
                text(
                    """
                    INSERT INTO support_ticket_messages (ticket_id, user_id, message)
                    VALUES (:ticket_id, :user_id, :message)
                    """
                ),
                {
                    "ticket_id": result["id"],
                    "user_id": me["id"],
                    "message": description,
                },
            )
            conn.commit()

        return jsonify({"success": True, "ticket": dict(result)})


@support_bp.get("/tickets")
@jwt_required()
def list_support_tickets():
    """List support tickets (role-aware filtering)."""

    user_id = get_jwt_identity()
    status = request.args.get("status", "all")
    type_filter = request.args.get("type", "all")

    with engine.connect() as conn:
        me = conn.execute(
            text(
                """
                select id, role, pharmacy_id, first_name, last_name
                from users
                where id = :id
                """
            ),
            {"id": user_id},
        ).mappings().first()
        if not me:
            return jsonify({"success": False, "error": "Forbidden"}), 403

        query = """
            SELECT
                t.id, t.ticket_number, t.pharmacy_id, t.type, t.subject,
                t.status, t.priority, t.created_at, t.updated_at,
                t.resolved_at, t.closed_at,
                u1.first_name || ' ' || u1.last_name as created_by_name,
                u2.first_name || ' ' || u2.last_name as assigned_to_name,
                p.name as pharmacy_name,
                (SELECT COUNT(*) FROM support_ticket_messages WHERE ticket_id = t.id) as message_count,
                (SELECT MAX(created_at) FROM support_ticket_messages WHERE ticket_id = t.id) as last_message_at
            FROM support_tickets t
            LEFT JOIN users u1 ON u1.id = t.created_by
            LEFT JOIN users u2 ON u2.id = t.assigned_to
            LEFT JOIN pharmacies p ON p.id = t.pharmacy_id
            WHERE 1=1
        """
        params = {}

        if me["role"] == "manager":
            query += " AND t.pharmacy_id = :pharmacy_id"
            params["pharmacy_id"] = me["pharmacy_id"]

        if status != "all":
            query += " AND t.status = :status"
            params["status"] = status

        if type_filter != "all":
            query += " AND t.type = :type"
            params["type"] = type_filter

        query += " ORDER BY t.created_at DESC"

        rows = conn.execute(text(query), params).mappings().all()
        return jsonify({"success": True, "tickets": [dict(row) for row in rows]})


@support_bp.get("/tickets/<int:ticket_id>")
@jwt_required()
def get_support_ticket(ticket_id: int):
    """Return ticket details including messages."""

    user_id = get_jwt_identity()

    with engine.connect() as conn:
        me = conn.execute(
            text("select id, role, pharmacy_id from users where id = :id"),
            {"id": user_id},
        ).mappings().first()
        if not me:
            return jsonify({"success": False, "error": "Forbidden"}), 403

        ticket = conn.execute(
            text(
                """
                SELECT
                    t.*,
                    u1.first_name || ' ' || u1.last_name as created_by_name,
                    u2.first_name || ' ' || u2.last_name as assigned_to_name,
                    p.name as pharmacy_name
                FROM support_tickets t
                LEFT JOIN users u1 ON u1.id = t.created_by
                LEFT JOIN users u2 ON u2.id = t.assigned_to
                LEFT JOIN pharmacies p ON p.id = t.pharmacy_id
                WHERE t.id = :ticket_id
                """
            ),
            {"ticket_id": ticket_id},
        ).mappings().first()

        if not ticket:
            return jsonify({"success": False, "error": "Ticket not found"}), 404

        if me["role"] == "manager" and ticket["pharmacy_id"] != me["pharmacy_id"]:
            return jsonify({"success": False, "error": "Forbidden"}), 403

        msg_query = """
            SELECT m.*, u.first_name || ' ' || u.last_name as user_name, u.role as user_role
            FROM support_ticket_messages m
            LEFT JOIN users u ON u.id = m.user_id
            WHERE m.ticket_id = :ticket_id
        """
        params = {"ticket_id": ticket_id, "user_id": me["id"]}
        if me["role"] == "manager":
            msg_query += " AND (m.is_internal = false OR m.user_id = :user_id)"

        msg_query += " ORDER BY m.created_at ASC"

        messages = conn.execute(text(msg_query), params).mappings().all()

        return jsonify(
            {
                "success": True,
                "ticket": dict(ticket),
                "messages": [dict(msg) for msg in messages],
            }
        )


@support_bp.delete("/tickets/<int:ticket_id>")
@jwt_required()
def delete_support_ticket(ticket_id: int):
    """Delete a support ticket (respecting role constraints)."""

    user_id = get_jwt_identity()

    with engine.begin() as conn:
        me = conn.execute(
            text("select id, role, pharmacy_id from users where id = :id"),
            {"id": user_id},
        ).mappings().first()
        if not me:
            return jsonify({"success": False, "error": "Forbidden"}), 403

        ticket = conn.execute(
            text("SELECT id, pharmacy_id FROM support_tickets WHERE id = :tid"),
            {"tid": ticket_id},
        ).mappings().first()
        if not ticket:
            return jsonify({"success": False, "error": "Ticket not found"}), 404

        if me["role"] == "manager" and ticket["pharmacy_id"] != me["pharmacy_id"]:
            return jsonify({"success": False, "error": "Forbidden"}), 403

        conn.execute(text("DELETE FROM support_tickets WHERE id = :tid"), {"tid": ticket_id})

    return jsonify({"success": True, "message": "Ticket deleted successfully"})


@support_bp.post("/tickets/<int:ticket_id>/messages")
@jwt_required()
def add_ticket_message(ticket_id: int):
    """Add a message to a ticket."""

    user_id = get_jwt_identity()
    data = request.get_json() or {}
    message_text = (data.get("message") or "").strip()

    if not message_text:
        return jsonify({"success": False, "error": "Message is required"}), 400

    with engine.connect() as conn:
        me = conn.execute(
            text("select id, role, pharmacy_id from users where id = :id"),
            {"id": user_id},
        ).mappings().first()
        if not me:
            return jsonify({"success": False, "error": "Forbidden"}), 403

        ticket = conn.execute(
            text("SELECT id, pharmacy_id, status FROM support_tickets WHERE id = :tid"),
            {"tid": ticket_id},
        ).mappings().first()
        if not ticket:
            return jsonify({"success": False, "error": "Ticket not found"}), 404

        if me["role"] == "manager" and ticket["pharmacy_id"] != me["pharmacy_id"]:
            return jsonify({"success": False, "error": "Forbidden"}), 403

        if ticket["status"] in ("closed", "resolved"):
            return jsonify(
                {
                    "success": False,
                    "error": "Cannot add messages to closed/resolved tickets",
                }
            ), 400

        is_internal = data.get("is_internal", False) if me["role"] == "admin" else False
        attachments = data.get("attachments", [])

        result = conn.execute(
            text(
                """
                INSERT INTO support_ticket_messages (ticket_id, user_id, message, is_internal, attachments)
                VALUES (:ticket_id, :user_id, :message, :is_internal, :attachments)
                RETURNING id, created_at
                """
            ),
            {
                "ticket_id": ticket_id,
                "user_id": me["id"],
                "message": message_text,
                "is_internal": is_internal,
                "attachments": json.dumps(attachments) if attachments else "[]",
            },
        ).mappings().first()

        if me["role"] == "admin" and ticket["status"] == "open":
            conn.execute(
                text("UPDATE support_tickets SET status = 'in_progress' WHERE id = :tid"),
                {"tid": ticket_id},
            )

        conn.commit()

        return jsonify({"success": True, "message": dict(result)})


@support_bp.patch("/tickets/<int:ticket_id>")
@jwt_required()
def update_support_ticket(ticket_id: int):
    """Update ticket metadata (status, priority, assignment)."""

    user_id = get_jwt_identity()
    data = request.get_json() or {}

    with engine.connect() as conn:
        me = conn.execute(
            text("select id, role, pharmacy_id from users where id = :id"),
            {"id": user_id},
        ).mappings().first()
        if not me:
            return jsonify({"success": False, "error": "Forbidden"}), 403

        ticket = conn.execute(
            text("SELECT id, pharmacy_id FROM support_tickets WHERE id = :tid"),
            {"tid": ticket_id},
        ).mappings().first()
        if not ticket:
            return jsonify({"success": False, "error": "Ticket not found"}), 404

        if me["role"] == "manager":
            if ticket["pharmacy_id"] != me["pharmacy_id"]:
                return jsonify({"success": False, "error": "Forbidden"}), 403
            if data.get("status") not in (None, "closed"):
                return jsonify({"success": False, "error": "Managers can only close tickets"}), 403
            if "priority" in data or "assigned_to" in data:
                return jsonify(
                    {
                        "success": False,
                        "error": "Managers cannot update priority or assignment",
                    }
                ), 403

        updates = []
        params = {"ticket_id": ticket_id, "user_id": me["id"]}

        if "status" in data:
            status = data["status"]
            if status in ("open", "in_progress", "resolved", "closed"):
                updates.append("status = :status")
                params["status"] = status
                if status == "resolved":
                    updates.append("resolved_at = now()")
                    updates.append("resolved_by = :user_id")
                elif status == "closed":
                    updates.append("closed_at = now()")
                    updates.append("closed_by = :user_id")
                elif status == "open":
                    updates.append("resolved_at = NULL")
                    updates.append("resolved_by = NULL")
                    updates.append("closed_at = NULL")
                    updates.append("closed_by = NULL")

        if me["role"] == "admin":
            if "priority" in data and data["priority"] in ("low", "medium", "high", "urgent"):
                updates.append("priority = :priority")
                params["priority"] = data["priority"]

            if "assigned_to" in data:
                assigned_to = data.get("assigned_to")
                if assigned_to:
                    user_check = conn.execute(
                        text("SELECT id FROM users WHERE id = :uid AND role = 'admin'"),
                        {"uid": assigned_to},
                    ).first()
                    if user_check:
                        updates.append("assigned_to = :assigned_to")
                        params["assigned_to"] = assigned_to
                else:
                    updates.append("assigned_to = NULL")

        if not updates:
            return jsonify({"success": False, "error": "No valid updates provided"}), 400

        query = f"UPDATE support_tickets SET {', '.join(updates)} WHERE id = :ticket_id"
        conn.execute(text(query), params)
        conn.commit()

        return jsonify({"success": True, "message": "Ticket updated"})


@support_bp.get("/tickets/stats")
@jwt_required()
def get_ticket_stats():
    """Fetch aggregate statistics for support tickets (admin only)."""

    user_id = get_jwt_identity()

    with engine.connect() as conn:
        me = conn.execute(
            text("select role from users where id = :id"),
            {"id": user_id},
        ).mappings().first()
        if not me or me["role"] != "admin":
            return jsonify({"success": False, "error": "Forbidden"}), 403

        stats = conn.execute(
            text(
                """
                SELECT
                    COUNT(*) FILTER (WHERE status = 'open') as open_count,
                    COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_count,
                    COUNT(*) FILTER (WHERE status = 'resolved') as resolved_count,
                    COUNT(*) FILTER (WHERE status = 'closed') as closed_count,
                    COUNT(*) FILTER (WHERE type = 'support') as support_count,
                    COUNT(*) FILTER (WHERE type = 'feature_request') as feature_request_count,
                    COUNT(*) FILTER (WHERE type = 'bug_report') as bug_report_count,
                    COUNT(*) FILTER (WHERE priority = 'urgent') as urgent_count,
                    COUNT(*) as total_count
                FROM support_tickets
                """
            )
        ).mappings().first()

        return jsonify({"success": True, "stats": dict(stats)})


@announcements_bp.post("")
@jwt_required()
def create_announcement():
    """Create a new announcement (admin only)."""

    user_id = get_jwt_identity()
    data = request.get_json() or {}

    with engine.connect() as conn:
        me = conn.execute(
            text("SELECT id, role FROM users WHERE id = :id"),
            {"id": user_id},
        ).mappings().first()
        if not me or me["role"] != "admin":
            return jsonify({"success": False, "error": "Forbidden"}), 403

        title = (data.get("title") or "").strip()
        content = (data.get("content") or "").strip()
        announcement_type = data.get("type", "info")
        is_pinned = bool(data.get("is_pinned", False))
        expires_at = data.get("expires_at")

        if not title or not content:
            return jsonify({"success": False, "error": "Title and content are required"}), 400

        if announcement_type not in ("info", "warning", "urgent", "update"):
            announcement_type = "info"

        result = conn.execute(
            text(
                """
                INSERT INTO announcements (title, content, type, is_pinned, created_by, expires_at)
                VALUES (:title, :content, :type, :is_pinned, :created_by, :expires_at)
                RETURNING id, title, content, type, is_pinned, is_active, created_at, updated_at, expires_at
                """
            ),
            {
                "title": title,
                "content": content,
                "type": announcement_type,
                "is_pinned": is_pinned,
                "created_by": me["id"],
                "expires_at": expires_at,
            },
        ).mappings().first()

        conn.commit()
        return jsonify({"success": True, "announcement": dict(result)})


@announcements_bp.get("")
@jwt_required()
def list_announcements():
    """List announcements with pagination and filtering."""

    user_id = get_jwt_identity()
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 10, type=int)
    type_filter = request.args.get("type", "all")
    status_filter = request.args.get("status", "all")
    pinned_filter = request.args.get("pinned", "all")
    search = request.args.get("search", "").strip()

    page = max(1, page)
    per_page = min(max(1, per_page), 100)
    offset = (page - 1) * per_page

    with engine.connect() as conn:
        me = conn.execute(
            text("SELECT role FROM users WHERE id = :id"),
            {"id": user_id},
        ).mappings().first()
        if not me:
            return jsonify({"success": False, "error": "Forbidden"}), 403

        where_conditions = []
        params = {}

        if me["role"] != "admin":
            where_conditions.append("a.is_active = true")
            where_conditions.append("(a.expires_at IS NULL OR a.expires_at > now())")
        else:
            if status_filter == "active":
                where_conditions.append(
                    "a.is_active = true AND (a.expires_at IS NULL OR a.expires_at > now())"
                )
            elif status_filter == "inactive":
                where_conditions.append("a.is_active = false")
            elif status_filter == "expired":
                where_conditions.append("a.expires_at IS NOT NULL AND a.expires_at <= now()")

        if type_filter != "all" and type_filter in ("info", "warning", "urgent", "update"):
            where_conditions.append("a.type = :type_filter")
            params["type_filter"] = type_filter

        if pinned_filter == "pinned":
            where_conditions.append("a.is_pinned = true")
        elif pinned_filter == "unpinned":
            where_conditions.append("a.is_pinned = false")

        if search:
            where_conditions.append("(a.title ILIKE :search OR a.content ILIKE :search)")
            params["search"] = f"%{search}%"

        where_clause = " AND ".join(where_conditions) if where_conditions else "1=1"

        total_result = conn.execute(
            text(
                f"""
                SELECT COUNT(*) as total
                FROM announcements a
                WHERE {where_clause}
                """
            ),
            params,
        ).mappings().first()
        total = total_result["total"] if total_result else 0

        query = text(
            f"""
            SELECT
                a.id, a.title, a.content, a.type, a.is_pinned, a.is_active,
                a.created_at, a.updated_at, a.expires_at,
                u.first_name || ' ' || u.last_name as created_by_name
            FROM announcements a
            LEFT JOIN users u ON u.id = a.created_by
            WHERE {where_clause}
            ORDER BY a.is_pinned DESC, a.created_at DESC
            LIMIT :limit OFFSET :offset
            """
        )
        params["limit"] = per_page
        params["offset"] = offset

        rows = conn.execute(query, params).mappings().all()

        return jsonify(
            {
                "success": True,
                "announcements": [dict(r) for r in rows],
                "pagination": {
                    "page": page,
                    "per_page": per_page,
                    "total": total,
                    "total_pages": (total + per_page - 1) // per_page if per_page > 0 else 0,
                },
            }
        )


@announcements_bp.patch("/<int:announcement_id>")
@jwt_required()
def update_announcement(announcement_id: int):
    """Update an announcement (admin only)."""

    user_id = get_jwt_identity()
    data = request.get_json() or {}

    with engine.connect() as conn:
        me = conn.execute(
            text("SELECT role FROM users WHERE id = :id"),
            {"id": user_id},
        ).mappings().first()
        if not me or me["role"] != "admin":
            return jsonify({"success": False, "error": "Forbidden"}), 403

        updates = []
        params = {"announcement_id": announcement_id}

        if "title" in data:
            updates.append("title = :title")
            params["title"] = (data["title"] or "").strip()

        if "content" in data:
            updates.append("content = :content")
            params["content"] = (data["content"] or "").strip()

        if "type" in data and data["type"] in ("info", "warning", "urgent", "update"):
            updates.append("type = :type")
            params["type"] = data["type"]

        if "is_pinned" in data:
            updates.append("is_pinned = :is_pinned")
            params["is_pinned"] = bool(data["is_pinned"])

        if "is_active" in data:
            updates.append("is_active = :is_active")
            params["is_active"] = bool(data["is_active"])

        if "expires_at" in data:
            updates.append("expires_at = :expires_at")
            params["expires_at"] = data.get("expires_at") or None

        if not updates:
            return jsonify({"success": False, "error": "No valid updates provided"}), 400

        query = f"UPDATE announcements SET {', '.join(updates)} WHERE id = :announcement_id"
        conn.execute(text(query), params)
        conn.commit()

        return jsonify({"success": True, "message": "Announcement updated"})


@announcements_bp.delete("/<int:announcement_id>")
@jwt_required()
def delete_announcement(announcement_id: int):
    """Delete an announcement (admin only)."""

    user_id = get_jwt_identity()

    with engine.connect() as conn:
        me = conn.execute(
            text("SELECT role FROM users WHERE id = :id"),
            {"id": user_id},
        ).mappings().first()
        if not me or me["role"] != "admin":
            return jsonify({"success": False, "error": "Forbidden"}), 403

        conn.execute(text("DELETE FROM announcements WHERE id = :id"), {"id": announcement_id})
        conn.commit()

    return jsonify({"success": True, "message": "Announcement deleted"})




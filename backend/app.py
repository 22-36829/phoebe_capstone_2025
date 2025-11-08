import os
from datetime import timedelta
from flask import Flask, jsonify
from flask_cors import CORS
from sqlalchemy import create_engine, text
from sqlalchemy import inspect
from sqlalchemy.engine import Engine
from dotenv import load_dotenv
from flask_jwt_extended import JWTManager
import bcrypt
from utils.helpers import get_database_url
import logging

load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Download NLTK data on startup (if NLTK is available)
try:
    import nltk
    import ssl
    try:
        _create_unverified_https_context = ssl._create_unverified_context
    except AttributeError:
        pass
    else:
        ssl._create_default_https_context = _create_unverified_https_context
    
    # Download NLTK data to a writable location
    # Use /tmp/nltk_data in Railway (writable) or current directory
    if os.path.exists('/tmp'):
        nltk_data_dir = '/tmp/nltk_data'
    else:
        nltk_data_dir = os.path.join(os.getcwd(), 'nltk_data')
    
    os.makedirs(nltk_data_dir, exist_ok=True)
    
    # Set NLTK_DATA environment variable so NLTK uses this directory
    os.environ['NLTK_DATA'] = nltk_data_dir
    nltk.data.path.insert(0, nltk_data_dir)
    
    # Download required NLTK data
    try:
        # Check if data already exists to avoid re-downloading
        punkt_path = os.path.join(nltk_data_dir, 'tokenizers', 'punkt')
        stopwords_path = os.path.join(nltk_data_dir, 'corpora', 'stopwords')
        wordnet_path = os.path.join(nltk_data_dir, 'corpora', 'wordnet')
        
        if not os.path.exists(punkt_path):
            nltk.download('punkt', quiet=True, download_dir=nltk_data_dir)
        if not os.path.exists(stopwords_path):
            nltk.download('stopwords', quiet=True, download_dir=nltk_data_dir)
        if not os.path.exists(wordnet_path):
            nltk.download('wordnet', quiet=True, download_dir=nltk_data_dir)
        logger.info(f"NLTK data available at {nltk_data_dir}")
    except Exception as e:
        logger.warning(f"Could not download NLTK data: {e}. Some NLP features may be limited.")
except ImportError:
    logger.info("NLTK not available, skipping NLTK data download")
except Exception as e:
    logger.warning(f"Error setting up NLTK: {e}")

DATABASE_URL = get_database_url()

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=False, expose_headers=["Authorization"], allow_headers=["Content-Type", "Authorization"], methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"]) 
app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY', 'dev-secret')
app.config['SECRET_KEY'] = os.getenv('APP_SECRET_KEY', 'dev-app-secret')
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(hours=24)  # 24 hours instead of 15 minutes
DEBUG_MODE = os.getenv('FLASK_DEBUG', '1').lower() in ('1', 'true', 'yes')
app.config['DEBUG'] = DEBUG_MODE
jwt = JWTManager(app)

# JSON auth/permission error handlers
@jwt.unauthorized_loader
def _jwt_unauthorized(err):
	return jsonify({'success': False, 'error': 'Missing or invalid authorization header'}), 401

@jwt.invalid_token_loader
def _jwt_invalid(err):
	return jsonify({'success': False, 'error': 'Invalid token'}), 401

@jwt.expired_token_loader
def _jwt_expired(jwt_header, jwt_payload):
	return jsonify({'success': False, 'error': 'Token expired'}), 401

@app.errorhandler(403)
def _forbidden(e):
	return jsonify({'success': False, 'error': 'Forbidden'}), 403

engine: Engine = create_engine(DATABASE_URL, pool_pre_ping=True)

# Database schema functions moved to database/schema.py
from database.schema import (
	ensure_returns_tables,
	ensure_pharmacy_signup_requests_table,
	ensure_inventory_requests_table,
	ensure_products_location_column,
	ensure_pharmacy_deletion_requests_table,
	ensure_inventory_expiration_column,
	ensure_products_reorder_supplier_columns,
	ensure_set_updated_at_function,
	ensure_support_tickets_tables,
	ensure_announcements_table,
	ensure_subscription_plans_table,
	ensure_subscription_status_enum,
	ensure_subscription_payment_fields
)

# Schema function definitions moved to database/schema.py

# Initialize database schema on startup
ensure_set_updated_at_function()
ensure_inventory_requests_table()
ensure_products_location_column()
ensure_pharmacy_deletion_requests_table()
ensure_inventory_expiration_column()
ensure_support_tickets_tables()
ensure_announcements_table()
ensure_subscription_status_enum()
ensure_subscription_payment_fields()
ensure_subscription_plans_table()
ensure_pharmacy_signup_requests_table()

# Utility endpoint to export current DB schema (DDL only)
@app.get('/api/_internal/schema')
def export_schema():
    try:
        inspector = inspect(engine)
        schema_names = inspector.get_schema_names()
        ddl_parts = []
        with engine.connect() as conn:
            for schema in schema_names:
                if schema in ('pg_toast', 'pg_catalog', 'information_schema'):
                    continue
                # Tables
                tables = inspector.get_table_names(schema=schema)
                for table in tables:
                    create_sql = conn.execute(text("""
                        SELECT pg_get_tabledef(format('%I.%I', :schema, :table))
                    """), { 'schema': schema, 'table': table }).scalar()
                    if not create_sql:
                        # Fallback for Postgres versions without pg_get_tabledef
                        res = conn.execute(text("""
                            SELECT 'CREATE TABLE ' || quote_ident(schemaname) || '.' || quote_ident(tablename) || ' (...)' as ddl
                            FROM pg_tables WHERE schemaname = :schema AND tablename = :table
                        """), { 'schema': schema, 'table': table }).scalar()
                        create_sql = res or ''
                    if create_sql:
                        ddl_parts.append(f"-- Schema: {schema}\n{create_sql};\n")
                # Views
                views = inspector.get_view_names(schema=schema)
                for view in views:
                    view_def = inspector.get_view_definition(view_name=view, schema=schema) or ''
                    if view_def:
                        ddl_parts.append(f"-- View: {schema}.{view}\nCREATE OR REPLACE VIEW \"{schema}\".\"{view}\" AS\n{view_def};\n")
        ddl = "\n".join(ddl_parts)
        # Write to file
        os.makedirs('file_dump', exist_ok=True)
        with open(os.path.join('file_dump', 'schema.sql'), 'w', encoding='utf-8') as f:
            f.write(ddl)
        return jsonify({ 'success': True, 'file': 'file_dump/schema.sql', 'bytes': len(ddl) })
    except Exception as e:
        return jsonify({ 'success': False, 'error': str(e) }), 500

# Seed demo accounts on startup when enabled
def seed_demo_accounts() -> None:
    if os.getenv('SEED_DEMO', 'true').lower() not in ('1','true','yes'):  # toggle with SEED_DEMO=false
        print("[seed_demo_accounts] Skipped - SEED_DEMO disabled")
        return
    try:
        print("[seed_demo_accounts] Starting...")
        with engine.begin() as conn:
            # Ensure pharmacy exists
            ph = conn.execute(text("""
                insert into pharmacies (name, address, is_active)
                values ('Phoebe Drugstore','', true)
                on conflict (name) do update set name = excluded.name
                returning id
            """)).mappings().first()
            pharmacy_id = ph['id'] if ph else conn.execute(text("select id from pharmacies where name='Phoebe Drugstore' limit 1")).scalar()
            print(f"[seed_demo_accounts] Pharmacy ID: {pharmacy_id}")

            def upsert_user(email: str, password: str, role: str):
                pw_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
                conn.execute(text("""
                    insert into users (username, email, password_hash, first_name, last_name, role, pharmacy_id, is_active)
                    values (:u, :e, :p, '', '', cast(:r as user_role), :ph, true)
                    on conflict (email) do update set password_hash = excluded.password_hash, role = excluded.role, pharmacy_id = excluded.pharmacy_id
                """), { 'u': email.split('@')[0], 'e': email, 'p': pw_hash, 'r': role, 'ph': pharmacy_id })
                print(f"[seed_demo_accounts] Created user: {email}")

            upsert_user('admin@phoebe.com', 'admin123', 'admin')
            upsert_user('manager@phoebe.com', 'manager123', 'manager')
            upsert_user('staff@phoebe.com', 'staff123', 'staff')
        print("[seed_demo_accounts] Completed successfully")
    except Exception as e:
        # Do not crash app if seeding fails
        print(f"[seed_demo_accounts] Error: {e}")
        import traceback
        traceback.print_exc()

@app.get('/')
def root():
	"""Root endpoint - simple health check without database"""
	return jsonify({ 
		'service': 'Phoebe Pharmacy Management API',
		'status': 'running',
		'version': '1.0.0',
		'endpoints': {
			'health': '/api/health',
			'auth': '/api/auth/login',
			'docs': 'See API documentation'
		}
	})

@app.get('/api/health')
def health():
    """Health check endpoint - includes database connection status"""
    try:
        with engine.connect() as conn:
            ok = conn.execute(text('select 1')).scalar() == 1
        return jsonify({
            'status': 'ok' if ok else 'down',
            'database': 'connected' if ok else 'disconnected'
        })
    except Exception as e:
        return jsonify({
            'status': 'partial',
            'database': 'disconnected',
            'error': str(e)
        }), 503

@app.get('/api/health/ai')
def health_ai():
    """AI services health check endpoint"""
    try:
        ai_status = {
            'basic': False,
            'enhanced': False,
            'errors': []
        }
        
        # Check basic AI service
        try:
            from routes.ai import get_ai_service, _ai_service_initialized, _ai_service_init_error
            if _ai_service_initialized:
                service = get_ai_service()
                # Check if it's the full service (has vectorizer) vs minimal service (fallback)
                ai_status['basic'] = hasattr(service, 'vectorizer') and service.vectorizer is not None
                if _ai_service_init_error:
                    ai_status['errors'].append(f"Basic AI: {_ai_service_init_error}")
                elif not ai_status['basic']:
                    ai_status['errors'].append("Basic AI: Using minimal fallback service")
            else:
                ai_status['errors'].append("Basic AI: Not yet initialized")
        except Exception as e:
            ai_status['errors'].append(f"Basic AI check failed: {str(e)}")
        
        # Check enhanced AI service
        try:
            from routes.ai_enhanced import _get_enhanced_ai_service
            service = _get_enhanced_ai_service()
            ai_status['enhanced'] = service is not None
        except Exception as e:
            ai_status['errors'].append(f"Enhanced AI check failed: {str(e)}")
        
        all_ready = ai_status['basic'] and ai_status['enhanced']
        return jsonify({
            'status': 'ready' if all_ready else 'partial',
            'services': ai_status,
            'ready': all_ready
        }), 200 if all_ready else 503
    except Exception as e:
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500

# Handle favicon requests to prevent 404 errors
@app.get('/favicon.ico')
def favicon():
	from flask import Response
	return Response(status=204)  # No Content

# Handle manifest.json requests to prevent 404 errors
@app.get('/manifest.json')
def manifest():
	from flask import jsonify
	return jsonify({
		"name": "Phoebe Drugstore",
		"short_name": "Phoebe",
		"description": "Pharmacy Management System",
		"start_url": "/",
		"display": "standalone",
		"theme_color": "#000000",
		"background_color": "#ffffff"
	})

@app.get('/api/products')
def get_products():
	query = text('''
		select p.id, p.name, pc.name as category, p.unit_price, p.cost_price,
		       coalesce(i.current_stock,0) as current_stock,
		       coalesce(i.available_stock,0) as available_stock,
		       p.location
		from products p
		left join product_categories pc on pc.id = p.category_id
		left join inventory i on i.product_id = p.id
		order by p.name asc
		limit 500
	''')
	with engine.connect() as conn:
		rows = [dict(r) for r in conn.execute(query).mappings().all()]
	return jsonify(rows)

@app.get('/api/inventory/low')
def get_low_stock():
	query = text('''
		select p.id, p.name, coalesce(i.current_stock,0) as current_stock
		from products p
		left join inventory i on i.product_id = p.id
		where coalesce(i.current_stock,0) <= 5
		order by current_stock asc, p.name asc
		limit 200
	''')
	with engine.connect() as conn:
		rows = [dict(r) for r in conn.execute(query).mappings().all()]
	return jsonify(rows)

# =========================
# AUTHENTICATION ROUTES
# =========================
# Moved to routes/auth.py - see blueprint registration below

# =========================
# POS ENDPOINTS
# =========================
# Moved to routes/pos.py - see blueprint registration above

# =========================
# ADMIN ROUTES
# =========================
# Moved to routes/admin.py - see blueprint registration above

# Utility functions moved to utils/helpers.py

# Old admin routes removed - now in routes/admin.py

# Ensure subscription status enum on startup
ensure_subscription_status_enum()

# Ensure subscription payment fields on startup
ensure_subscription_payment_fields()

# Ensure subscription plans table on startup
ensure_subscription_plans_table()

# Ensure signup requests table on startup
ensure_pharmacy_signup_requests_table()

# All admin routes moved to routes/admin.py - see blueprint registration above

# =========================
# REGISTER BLUEPRINTS
# =========================
# Authentication routes
from routes.auth import auth_bp
app.register_blueprint(auth_bp)

# Admin routes
from routes.admin import admin_bp
app.register_blueprint(admin_bp)

# Manager routes
from routes.manager import manager_bp
app.register_blueprint(manager_bp)

# Staff routes
from routes.staff import staff_bp, staff_public_bp
app.register_blueprint(staff_bp)
app.register_blueprint(staff_public_bp)

# POS routes
from routes.pos import pos_bp
app.register_blueprint(pos_bp)

# Forecasting routes (always enabled)
from routes.forecasting import forecasting_bp
app.register_blueprint(forecasting_bp)

# AI Assistant Routes (can be disabled via ENABLE_AI_ROUTES env var)
# Set ENABLE_AI_ROUTES=false on Railway to disable AI routes
# Default: enabled (for Render and local development)
ENABLE_AI_ROUTES = os.getenv('ENABLE_AI_ROUTES', 'true').lower() in ('true', '1', 'yes', 'on')

if ENABLE_AI_ROUTES:
    try:
        from routes.ai import ai_bp
        from routes.ai_enhanced import ai_enhanced_bp
        app.register_blueprint(ai_bp)
        app.register_blueprint(ai_enhanced_bp)
        logger.info("✓ AI Assistant routes enabled")
    except Exception as e:
        logger.warning(f"Failed to register AI routes: {e}")
else:
    logger.info("✗ AI Assistant routes disabled (ENABLE_AI_ROUTES=false)")

# Support Tickets & Announcements Routes
from routes.support import support_bp, announcements_bp
app.register_blueprint(support_bp)
app.register_blueprint(announcements_bp)

# Inventory Requests Routes (frontend expects /api/inventory/*)
from routes.inventory import inventory_bp
app.register_blueprint(inventory_bp)

# =========================
# INITIALIZE AI SERVICES AT STARTUP (only if AI routes are enabled)
# =========================
# For Railway/Gunicorn: Initialize synchronously in worker process
# This ensures services are ready before accepting requests
_ai_services_initializing = False
_ai_services_initialized = False

def initialize_ai_services():
    """Initialize AI services at startup (synchronous for Railway/Gunicorn)"""
    global _ai_services_initializing, _ai_services_initialized
    
    # Skip initialization if AI routes are disabled
    if not ENABLE_AI_ROUTES:
        logger.info("Skipping AI services initialization (AI routes disabled)")
        return
    
    # Prevent multiple initializations
    if _ai_services_initialized or _ai_services_initializing:
        return
    
    _ai_services_initializing = True
    try:
        logger.info("=" * 60)
        logger.info("Starting AI services initialization (Railway/Gunicorn mode)...")
        logger.info("=" * 60)
        
        # Initialize basic AI service
        try:
            from routes.ai import initialize_ai_service
            logger.info("Initializing basic AI service...")
            success = initialize_ai_service()
            if success:
                logger.info("✓ Basic AI service initialized successfully")
            else:
                logger.warning("✗ Basic AI service initialization failed, using fallback")
        except Exception as e:
            logger.error(f"Error initializing basic AI service: {e}", exc_info=True)
        
        # Initialize enhanced AI service
        try:
            from routes.ai_enhanced import _get_enhanced_ai_service
            logger.info("Initializing enhanced AI service...")
            service = _get_enhanced_ai_service()
            if service:
                logger.info("✓ Enhanced AI service initialized successfully")
            else:
                logger.warning("✗ Enhanced AI service initialization failed")
        except Exception as e:
            logger.error(f"Error initializing enhanced AI service: {e}", exc_info=True)
        
        _ai_services_initialized = True
        logger.info("=" * 60)
        logger.info("AI services initialization completed")
        logger.info("=" * 60)
    except Exception as e:
        logger.error(f"Critical error in AI services initialization: {e}", exc_info=True)
        _ai_services_initialized = True  # Mark as initialized to prevent retries
    finally:
        _ai_services_initializing = False

# Initialize AI services synchronously after all routes are registered
# This runs in each Gunicorn worker process
try:
    initialize_ai_services()
except Exception as e:
    logger.error(f"Failed to initialize AI services: {e}", exc_info=True)

def _in_reloader_process() -> bool:
	"""Return True when running inside the active Flask reloader process."""
	return os.environ.get('WERKZEUG_RUN_MAIN') == 'true' or os.environ.get('RUN_MAIN') == 'true'

# =========================
# MANAGER ROUTES
# =========================
# Moved to routes/manager.py - see blueprint registration above


if __name__ == '__main__':
	if not DEBUG_MODE or _in_reloader_process():
		ensure_returns_tables()
		ensure_announcements_table()
		seed_demo_accounts()
	# Use PORT from environment (Railway provides this) or default to 5000
	port = int(os.getenv('PORT', 5000))
	app.run(host='0.0.0.0', port=port, debug=DEBUG_MODE, use_reloader=DEBUG_MODE)

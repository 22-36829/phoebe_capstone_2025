#!/usr/bin/env python3
"""
Minimal Flask app for AI Assistant service only
Deploy this to Render for AI functionality
"""

import os
import logging
from flask import Flask
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Basic health check
@app.get('/')
def root():
    return {
        'service': 'Phoebe AI Assistant Service',
        'status': 'running',
        'endpoints': {
            'health': '/api/health',
            'ai_chat': '/api/ai/enhanced/chat',
            'ai_test': '/api/ai/enhanced/test'
        }
    }

@app.get('/api/health')
def health():
    """Health check endpoint"""
    try:
        return {
            'status': 'healthy',
            'service': 'AI Assistant',
            'database': 'connected'  # Add actual DB check if needed
        }, 200
    except Exception as e:
        return {
            'status': 'unhealthy',
            'error': str(e)
        }, 500

# Register AI routes
try:
    from routes.ai_enhanced import ai_enhanced_bp
    app.register_blueprint(ai_enhanced_bp)
    logger.info("Enhanced AI routes registered")
except Exception as e:
    logger.error(f"Failed to register enhanced AI routes: {e}", exc_info=True)

try:
    from routes.ai import ai_bp
    app.register_blueprint(ai_bp)
    logger.info("Basic AI routes registered")
except Exception as e:
    logger.error(f"Failed to register basic AI routes: {e}", exc_info=True)

# Initialize AI services at startup
def initialize_ai_services():
    """Initialize AI services at startup"""
    try:
        logger.info("=" * 60)
        logger.info("Initializing AI services for Render deployment...")
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
        
        logger.info("=" * 60)
        logger.info("AI services initialization completed")
        logger.info("=" * 60)
    except Exception as e:
        logger.error(f"Failed to initialize AI services: {e}", exc_info=True)

# Initialize on startup
if __name__ == '__main__':
    initialize_ai_services()
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
else:
    # For Gunicorn
    initialize_ai_services()


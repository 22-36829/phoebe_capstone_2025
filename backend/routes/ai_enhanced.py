#!/usr/bin/env python3
"""
Enhanced AI Routes with Inventory Classification
"""

import os
import time
import pandas as pd
from flask import Blueprint, request, jsonify
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
import logging

# Configure logging first
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

# Import AI services with graceful fallbacks
try:
    from services.ultra_advanced_ai import ultra_advanced_ai
    logger.info("ultra_advanced_ai imported successfully")
except (ImportError, Exception) as e:
    logger.warning(f"Could not import ultra_advanced_ai: {e}. Advanced features will be limited.")
    ultra_advanced_ai = None

try:
    from services.ai_inventory_classifier import ai_inventory_manager
    logger.info("ai_inventory_classifier imported successfully")
except (ImportError, Exception) as e:
    logger.warning(f"Could not import ai_inventory_classifier: {e}. Using fallback.")
    ai_inventory_manager = None

# Enhanced AI service will be initialized lazily via _get_enhanced_ai_service()
# Don't import it directly to avoid loading SentenceTransformer at startup
enhanced_ai_service = None

from services.ai_metrics import (
    flush_metrics,
    get_metrics_snapshot,
    record_interaction,
)

METRICS_SERVICE_TOKEN = os.getenv('AI_METRICS_SERVICE_TOKEN')


def _require_service_token():
    if not METRICS_SERVICE_TOKEN:
        return
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    provided = auth_header.split(' ', 1)[1]
    if provided != METRICS_SERVICE_TOKEN:
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    return None


ai_enhanced_bp = Blueprint('ai_enhanced', __name__, url_prefix='/api/ai/enhanced')

# Database connection
import sys
from pathlib import Path

# Add parent directory to path to import utils
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from utils.helpers import get_database_url

DATABASE_URL = get_database_url()
engine = create_engine(DATABASE_URL, pool_pre_ping=True)

@ai_enhanced_bp.route('/build-index', methods=['POST'])
def build_semantic_index():
    """Build semantic search index from database (CSV mode deprecated)"""
    try:
        if not enhanced_ai_service:
            return jsonify({
                'success': False,
                'error': 'Enhanced AI service is not available'
            }), 503
        
        # Use database instead of CSV - refresh the AI service inventory
        service = _get_enhanced_ai_service()
        if service:
            service.refresh_inventory(force=True)
            medicine_count = len(service.medicine_database) if hasattr(service, 'medicine_database') else 0
        else:
            medicine_count = 0
        
        return jsonify({
            'success': True,
            'message': f'Semantic index refreshed successfully from database with {medicine_count} medicines',
            'total_medicines': medicine_count,
            'source': 'database'
        })
        
    except Exception as e:
        logger.error(f"Error building semantic index: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to build semantic index: {str(e)}'
        }), 500

@ai_enhanced_bp.route('/search', methods=['POST'])
def enhanced_medicine_search():
    """Enhanced medicine search with multiple strategies"""
    try:
        if not ai_inventory_manager:
            return jsonify({
                'success': False,
                'error': 'AI inventory manager is not available'
            }), 503
            
        data = request.get_json()
        query = data.get('query', '').strip()
        limit = data.get('limit', 10)
        
        if not query:
            return jsonify({
                'success': False,
                'error': 'Query is required'
            }), 400
        
        # Perform intelligent search
        search_results = ai_inventory_manager.smart_medicine_search(query)
        
        # Format results
        formatted_results = {
            'query': query,
            'total_strategies': len([x for x in search_results.values() if isinstance(x, list) and x]),
            'direct_matches': len(search_results['direct_matches']),
            'category_matches': len(search_results['category_matches']),
            'semantic_matches': len(search_results['semantic_matches']),
            'ai_matches': len(search_results['ai_classified_matches']),
            'results': {
                'direct_matches': search_results['direct_matches'][:limit//4],
                'category_matches': search_results['category_matches'][:limit//4],
                'semantic_matches': search_results['semantic_matches'][:limit//4],
                'ai_classified_matches': search_results['ai_classified_matches'][:limit//4]
            },
            'query_analysis': search_results['query_analysis']
        }
        
        return jsonify({
            'success': True,
            'search_results': formatted_results
        })
        
    except Exception as e:
        logger.error(f"Error in enhanced search: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Search failed: {str(e)}'
        }), 500

@ai_enhanced_bp.route('/recommendations', methods=['POST'])
def get_medicine_recommendations():
    """Get AI-powered medicine recommendations"""
    try:
        if not ai_inventory_manager:
            return jsonify({
                'success': False,
                'error': 'AI inventory manager is not available'
            }), 503
            
        data = request.get_json()
        condition = data.get('condition', '').strip()
        
        if not condition:
            return jsonify({
                'success': False,
                'error': 'Condition is required'
            }), 400
        
        # Get recommendations
        recommendations = ai_inventory_manager.get_medicine_recommendations(condition)
        
        # Format recommendations
        formatted_recommendations = []
        for rec in recommendations:
            formatted_rec = {
                'name': rec['name'],
                'category': rec.get('category', ''),
                'ai_category': rec.get('ai_categories', [])[0] if rec.get('ai_categories') else 'others',
                'quantity': rec.get('quantity', 0),
                'price': rec.get('unit_price', 0),
                'location': rec.get('location', ''),
                'recommendation_reason': rec.get('recommendation_reason', ''),
                'medicine_info': rec.get('medicine_info', {})
            }
            formatted_recommendations.append(formatted_rec)
        
        return jsonify({
            'success': True,
            'condition': condition,
            'recommendations': formatted_recommendations,
            'total_found': len(formatted_recommendations)
        })
        
    except Exception as e:
        logger.error(f"Error getting recommendations: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to get recommendations: {str(e)}'
        }), 500

@ai_enhanced_bp.route('/classify', methods=['POST'])
def classify_medicine():
    """Classify a medicine using AI"""
    try:
        if not ai_inventory_manager:
            return jsonify({
                'success': False,
                'error': 'AI inventory manager is not available'
            }), 503
            
        data = request.get_json()
        medicine_name = data.get('medicine_name', '').strip()
        
        if not medicine_name:
            return jsonify({
                'success': False,
                'error': 'Medicine name is required'
            }), 400
        
        # Classify medicine
        classification = ai_inventory_manager.classifier.get_medicine_info(medicine_name)
        
        return jsonify({
            'success': True,
            'medicine_name': medicine_name,
            'classification': classification
        })
        
    except Exception as e:
        logger.error(f"Error classifying medicine: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Classification failed: {str(e)}'
        }), 500

_enhanced_ai_service_initialized = False
_enhanced_ai_service_init_error = None

def _get_enhanced_ai_service():
    """Initialize enhanced AI service (synchronous for Railway/Gunicorn)"""
    global enhanced_ai_service, _enhanced_ai_service_initialized, _enhanced_ai_service_init_error
    if enhanced_ai_service is not None:
        return enhanced_ai_service
    
    if _enhanced_ai_service_initialized:
        # Already tried to initialize, return None if it failed
        return None
    
    import time
    start_time = time.time()
    
    try:
        logger.info("Initializing Enhanced AI Service...")
        from services.enhanced_ai_service import EnhancedAIService
        enhanced_ai_service = EnhancedAIService()
        elapsed = time.time() - start_time
        _enhanced_ai_service_initialized = True
        _enhanced_ai_service_init_error = None
        logger.info(f"✓ Enhanced AI service initialized successfully in {elapsed:.2f}s")
        return enhanced_ai_service
    except SyntaxError as e:
        elapsed = time.time() - start_time
        _enhanced_ai_service_init_error = f"Syntax error: {e}"
        logger.error(f"✗ Syntax error in enhanced_ai_service after {elapsed:.2f}s: {e}. Please check the code.")
        _enhanced_ai_service_initialized = True
        return None
    except Exception as e:
        elapsed = time.time() - start_time
        _enhanced_ai_service_init_error = str(e)
        logger.error(f"✗ Failed to initialize enhanced AI service after {elapsed:.2f}s: {e}", exc_info=True)
        _enhanced_ai_service_initialized = True
        return None

@ai_enhanced_bp.route('/chat', methods=['POST'])
def enhanced_ai_chat():
    """Enhanced AI chat with inventory integration"""
    try:
        logger.info("Enhanced AI chat endpoint called")
        
        # Get request data first
        data = request.get_json() or {}
        message = data.get('message', '').strip()
        user_id = data.get('user_id', 'anonymous')
        pharmacy_id = data.get('pharmacy_id')
        
        if not message:
            logger.warning("Enhanced AI chat: No message provided")
            return jsonify({
                'success': True,  # Return success to frontend
                'response': {
                    'message': 'Please provide a message to search for.',
                    'type': 'error',
                    'data': [],
                    'total_matches': 0,
                    'enhanced_mode': False
                }
            }), 200
        
        logger.info(f"Enhanced AI chat: Processing message '{message[:50]}...' for user {user_id}")
        
        # Try to get service
        try:
            service = _get_enhanced_ai_service()
            logger.info(f"Enhanced AI service status: {service is not None}")
        except Exception as service_error:
            logger.error(f"Error getting enhanced AI service: {service_error}", exc_info=True)
            service = None
        
        if not service:
            logger.warning("Enhanced AI service not available, returning fallback response")
            # Return success with error message in response (frontend expects success: true)
            return jsonify({
                'success': True,
                'response': {
                    'message': 'I apologize, but the enhanced AI service is currently unavailable. Please try again in a moment.',
                    'type': 'error',
                    'data': [],
                    'total_matches': 0,
                    'enhanced_mode': False,
                    'confidence': 0.0,
                    'search_analysis': {
                        'error': 'Service not available'
                    },
                    'pagination': {
                        'showing': 0,
                        'total': 0,
                        'remaining': 0
                    }
                }
            }), 200
        
        # Generate response
        try:
            logger.info("Calling generate_chat_response...")
            start_time = time.perf_counter()
            response_payload = service.generate_chat_response(message)
            latency_ms = (time.perf_counter() - start_time) * 1000
            logger.info(f"Generated response in {latency_ms:.2f}ms with {response_payload.get('total_matches', 0)} matches")

            # Record interaction (non-blocking, don't fail if this errors)
            try:
                record_interaction(
                    pharmacy_id=pharmacy_id,
                    query_text=message,
                    match_count=response_payload.get('total_matches', 0),
                    detected_categories=response_payload.get('search_analysis', {}).get('detected_categories'),
                    latency_ms=latency_ms,
                )
            except Exception as metrics_error:
                logger.warning(f"Failed to record interaction metrics: {metrics_error}")

            return jsonify({
                'success': True,
                'response': response_payload
            })
        except Exception as gen_error:
            logger.error(f"Error generating chat response: {gen_error}", exc_info=True)
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            # Return success with error message (frontend expects success: true)
            return jsonify({
                'success': True,
                'response': {
                    'message': f"I apologize, but I encountered an error while processing your request. Please try again or rephrase your question. (Error: {str(gen_error)[:100]})",
                    'type': 'error',
                    'data': [],
                    'total_matches': 0,
                    'enhanced_mode': False,
                    'confidence': 0.0,
                    'search_analysis': {
                        'original_query': message,
                        'error': str(gen_error)
                    },
                    'pagination': {
                        'showing': 0,
                        'total': 0,
                        'remaining': 0
                    }
                }
            }), 200
        
    except Exception as e:
        logger.error(f"Unexpected error in enhanced chat endpoint: {str(e)}", exc_info=True)
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        # Return success with error message (frontend expects success: true)
        return jsonify({
            'success': True,
            'response': {
                'message': 'I apologize, but I encountered an unexpected error. Please try again.',
                'type': 'error',
                'data': [],
                'total_matches': 0,
                'enhanced_mode': False,
                'confidence': 0.0,
                'search_analysis': {
                    'error': str(e)
                },
                'pagination': {
                    'showing': 0,
                    'total': 0,
                    'remaining': 0
                }
            }
        }), 200  # Always return 200 so frontend doesn't treat it as network error


@ai_enhanced_bp.route('/refresh-cache', methods=['POST'])
def refresh_inventory_cache():
    """Manually refresh the AI inventory cache"""
    try:
        if not enhanced_ai_service:
            return jsonify({
                'success': False,
                'error': 'Enhanced AI service is not available'
            }), 503
            
        auth_error = _require_service_token()
        if auth_error is not None:
            return auth_error
        
        service = _get_enhanced_ai_service()
        if service:
            service.refresh_inventory(force=True)
            last_refresh = service.last_refresh.isoformat() if service.last_refresh else None
            source = service.last_refresh_source
        else:
            last_refresh = None
            source = None
        
        return jsonify({
            'success': True,
            'message': 'Inventory cache refreshed successfully',
            'last_refresh': last_refresh,
            'source': source
        })

    except Exception as e:
        logger.error(f"Error refreshing inventory cache: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to refresh cache: {str(e)}'
        }), 500


@ai_enhanced_bp.route('/flush-metrics', methods=['POST'])
def flush_ai_metrics():
    """Persist aggregated AI metrics and clear cache"""
    auth_error = _require_service_token()
    if auth_error is not None:
        return auth_error

    try:
        result = flush_metrics(engine)
        return jsonify({'success': True, **result, 'snapshot': get_metrics_snapshot()})
    except Exception as exc:
        logger.error("Error flushing AI metrics: %s", exc)
        return jsonify({'success': False, 'error': f'Failed to flush metrics: {exc}'}), 500

@ai_enhanced_bp.route('/categories', methods=['GET'])
def get_medicine_categories():
    """Get all available medicine categories"""
    try:
        if not ai_inventory_manager:
            return jsonify({
                'success': False,
                'error': 'AI inventory manager is not available'
            }), 503
            
        categories = list(ai_inventory_manager.classifier.medicine_categories.keys())
        
        return jsonify({
            'success': True,
            'categories': categories,
            'total_categories': len(categories)
        })
        
    except Exception as e:
        logger.error(f"Error getting categories: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to get categories: {str(e)}'
        }), 500

@ai_enhanced_bp.route('/inventory-stats', methods=['GET'])
def get_inventory_stats():
    """Get inventory statistics"""
    try:
        if not ai_inventory_manager:
            return jsonify({
                'success': False,
                'error': 'AI inventory manager is not available'
            }), 503
            
        if not ai_inventory_manager.medicine_database:
            return jsonify({
                'success': False,
                'error': 'Inventory not indexed. Please build index first.'
            }), 400
        
        # Calculate statistics
        total_medicines = len(ai_inventory_manager.medicine_database)
        
        category_counts = {}
        total_stock = 0
        total_value = 0
        
        for medicine_data in ai_inventory_manager.medicine_database.values():
            # Count by category
            for category in medicine_data.get('ai_categories', []):
                category_counts[category] = category_counts.get(category, 0) + 1
            
            # Calculate totals
            quantity = medicine_data.get('quantity', 0)
            price = medicine_data.get('unit_price', 0)
            
            total_stock += quantity
            total_value += quantity * price
        
        return jsonify({
            'success': True,
            'statistics': {
                'total_medicines': total_medicines,
                'total_stock_units': total_stock,
                'total_inventory_value': round(total_value, 2),
                'category_breakdown': category_counts,
                'average_price': round(total_value / total_stock, 2) if total_stock > 0 else 0
            }
        })
        
    except Exception as e:
        logger.error(f"Error getting inventory stats: {str(e)}")
        return jsonify({
            'success': False,
            'error': f'Failed to get inventory stats: {str(e)}'
        }), 500

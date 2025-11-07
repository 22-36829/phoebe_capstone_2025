"""Simplified Forecasting routes"""
from datetime import datetime
import os
import sys
from pathlib import Path

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from forecasting_service import ForecastingService
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

# Add parent directory to path to import utils
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

load_dotenv()
from utils.helpers import get_database_url

DATABASE_URL = get_database_url()
engine = create_engine(DATABASE_URL, pool_pre_ping=True)

forecasting_bp = Blueprint('forecasting', __name__, url_prefix='/api/forecasting')
forecasting_service = ForecastingService(DATABASE_URL)


def _get_user_pharmacy_id(user_id):
    """Helper to get user's pharmacy_id"""
    with engine.connect() as conn:
        user_row = conn.execute(
            text('SELECT pharmacy_id FROM users WHERE id = :id'),
            {'id': user_id}
        ).mappings().first()
        if not user_row:
            return None
        return user_row['pharmacy_id']


@forecasting_bp.route('/train', methods=['POST'])
@jwt_required()
def train_model():
    """Train forecasting models (ARIMA, SARIMAX, Prophet) and select best"""
    try:
        user_id = get_jwt_identity()
        pharmacy_id = _get_user_pharmacy_id(user_id)
        if not pharmacy_id:
            return jsonify({'success': False, 'error': 'User not found'}), 404
        
        data = request.get_json() or {}
        target_id = data.get('target_id') or request.args.get('target_id')
        target_name = data.get('target_name') or request.args.get('target_name')
        model_type = data.get('model_type', 'product')
        days = int(data.get('days', 365))
        return_forecast = bool(data.get('return_forecast', True))
        forecast_days = int(data.get('forecast_days', data.get('forecast_horizon', 30)))
        
        if not target_id:
            return jsonify({'success': False, 'error': 'target_id is required'}), 400
        
        if not target_name:
            # Get name from database
            with engine.connect() as conn:
                if model_type == 'product':
                    name_row = conn.execute(
                        text('SELECT name FROM products WHERE id = :id AND pharmacy_id = :ph'),
                        {'id': int(target_id), 'ph': pharmacy_id}
                    ).mappings().first()
                else:
                    name_row = conn.execute(
                        text('SELECT name FROM product_categories WHERE id = :id'),
                        {'id': int(target_id)}
                    ).mappings().first()
                
                if name_row:
                    target_name = name_row['name']
                else:
                    target_name = f"{model_type}_{target_id}"
        
        # Train models
        result, message = forecasting_service.train_and_compare_models(
            pharmacy_id=pharmacy_id,
            target_id=int(target_id),
            target_name=target_name,
            model_type=model_type,
            days=days
        )
        
        if result is None:
            return jsonify({'success': False, 'error': message}), 400
        
        response = {
            'success': True,
            'message': f'Models trained. Best model: {result["model_type"]}',
            'best_model': result['model_type'],
            'metrics': result['metrics'],
            'comparison': result['comparison']
        }

        # Optionally include immediate forecast so frontend can update instantly
        if return_forecast:
            fc = forecasting_service.forecast(
                pharmacy_id=pharmacy_id,
                target_id=str(target_id),
                days=forecast_days
            )
            if fc is not None:
                # Fetch prices for profit calculation
                unit_price = 0.0
                cost_price = 0.0
                try:
                    with engine.connect() as conn:
                        price_row = conn.execute(
                            text('SELECT unit_price, cost_price FROM products WHERE id = :id AND pharmacy_id = :ph'),
                            {'id': int(target_id), 'ph': pharmacy_id}
                        ).mappings().first()
                        if price_row:
                            unit_price = float(price_row.get('unit_price', 0) or 0)
                            cost_price = float(price_row.get('cost_price', 0) or 0)
                except:
                    pass
                revenue = [p * unit_price for p in fc['predictions']]
                cost = [p * cost_price for p in fc['predictions']]
                profit = [r - c for r, c in zip(revenue, cost)]

                response.update({
                    'forecast': {
                        'values': fc['predictions'],
                        'dates': fc['dates'],
                        'confidence_lower': fc.get('confidence_lower'),
                        'confidence_upper': fc.get('confidence_upper')
                    },
                    'forecasts': fc['predictions'],
                    'dates': fc['dates'],
                    'metrics': fc.get('metrics', result.get('metrics', {})),
                    'unit_price': unit_price,
                    'cost_price': cost_price,
                    'revenue': revenue,
                    'profit': profit,
                    'model_type': fc.get('model_type'),
                    'accuracy': result['metrics'].get('accuracy', 0),
                    'mae': result['metrics'].get('mae', 0),
                    'rmse': result['metrics'].get('rmse', 0),
                    'trained_at': datetime.utcnow().isoformat()
                })

        return jsonify(response)
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@forecasting_bp.route('/models', methods=['GET'])
@jwt_required()
def get_trained_models():
    try:
        user_id = get_jwt_identity()
        pharmacy_id = _get_user_pharmacy_id(user_id)
        if not pharmacy_id:
            return jsonify({'success': False, 'error': 'User not found'}), 404

        models = forecasting_service.list_saved_models(pharmacy_id)
        return jsonify({'success': True, 'models': models})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@forecasting_bp.route('/accuracy', methods=['GET'])
@jwt_required()
def get_forecasting_accuracy():
    try:
        user_id = get_jwt_identity()
        pharmacy_id = _get_user_pharmacy_id(user_id)
        if not pharmacy_id:
            return jsonify({'success': False, 'error': 'User not found'}), 404

        summary = forecasting_service.get_accuracy_summary(pharmacy_id)
        return jsonify({
            'success': True,
            'accuracy_percentage': summary.get('accuracy_percentage', 0),
            'total_models': summary.get('total_models', 0),
            'best_model': summary.get('best_model'),
            'models': summary.get('models', [])
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@forecasting_bp.route('/categories', methods=['GET'])
@jwt_required()
def get_forecastable_categories():
    try:
        user_id = get_jwt_identity()
        pharmacy_id = _get_user_pharmacy_id(user_id)
        if not pharmacy_id:
            return jsonify({'success': False, 'error': 'User not found'}), 404

        categories = forecasting_service.get_category_summary(pharmacy_id, limit=20)
        return jsonify({'success': True, 'categories': categories})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@forecasting_bp.route('/historical', methods=['GET'])
@jwt_required()
def get_historical_series():
    try:
        user_id = get_jwt_identity()
        pharmacy_id = _get_user_pharmacy_id(user_id)
        if not pharmacy_id:
            return jsonify({'success': False, 'error': 'User not found'}), 404

        target_id = request.args.get('target_id') or request.args.get('product_id')
        if target_id is None:
            return jsonify({'success': False, 'error': 'target_id is required'}), 400

        try:
            target_id_int = int(target_id)
        except ValueError:
            return jsonify({'success': False, 'error': 'target_id must be an integer'}), 400

        timeframe = request.args.get('timeframe', '1D')
        model_type = request.args.get('model_type', 'product')

        data = forecasting_service.get_historical_series(
            pharmacy_id=pharmacy_id,
            target_id=target_id_int,
            timeframe=timeframe,
            model_type=model_type
        )

        return jsonify({'success': True, 'data': data})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@forecasting_bp.route('/predictions', methods=['GET'])
@jwt_required()
def get_forecasts():
    """Get forecast predictions using trained model. Auto-trains if model doesn't exist."""
    try:
        user_id = get_jwt_identity()
        pharmacy_id = _get_user_pharmacy_id(user_id)
        if not pharmacy_id:
            return jsonify({'success': False, 'error': 'User not found'}), 404
        
        target_id = request.args.get('target_id') or request.args.get('product_id')
        forecast_days = int(request.args.get('forecast_days', request.args.get('days', 30)))
        model_type = request.args.get('model_type', 'product')
        target_name = request.args.get('target_name')
        
        if not target_id:
            return jsonify({'success': False, 'error': 'target_id is required'}), 400
        
        # Get forecast
        forecast = forecasting_service.forecast(
            pharmacy_id=pharmacy_id,
            target_id=str(target_id),
            days=forecast_days
        )
        
        # If model doesn't exist, try to auto-train it
        if forecast is None:
            # Get product name if not provided
            if not target_name:
                try:
                    with engine.connect() as conn:
                        if model_type == 'product':
                            name_row = conn.execute(
                                text('SELECT name FROM products WHERE id = :id AND pharmacy_id = :ph'),
                                {'id': int(target_id), 'ph': pharmacy_id}
                            ).mappings().first()
                        else:
                            name_row = conn.execute(
                                text('SELECT name FROM product_categories WHERE id = :id'),
                                {'id': int(target_id)}
                            ).mappings().first()
                        
                        if name_row:
                            target_name = name_row['name']
                        else:
                            target_name = f"{model_type}_{target_id}"
                except:
                    target_name = f"{model_type}_{target_id}"
            
            # Auto-train the model
            try:
                result, message = forecasting_service.train_and_compare_models(
                    pharmacy_id=pharmacy_id,
                    target_id=int(target_id),
                    target_name=target_name,
                    model_type=model_type,
                    days=365
                )
                
                if result is None:
                    return jsonify({
                        'success': False,
                        'error': f'Failed to train model: {message}. Please ensure there is sufficient historical data.'
                    }), 400
                
                # Now try to get forecast again
                forecast = forecasting_service.forecast(
                    pharmacy_id=pharmacy_id,
                    target_id=str(target_id),
                    days=forecast_days
                )
                
                if forecast is None:
                    return jsonify({
                        'success': False,
                        'error': 'Model trained but forecast generation failed. Please try again.'
                    }), 500
            except Exception as train_error:
                return jsonify({
                    'success': False,
                    'error': f'Auto-training failed: {str(train_error)}. Please train manually using /api/forecasting/train'
                }), 500
        
        # Get product prices for revenue calculation
        unit_price = 0.0
        cost_price = 0.0
        try:
            with engine.connect() as conn:
                price_row = conn.execute(
                    text('SELECT unit_price, cost_price FROM products WHERE id = :id AND pharmacy_id = :ph'),
                    {'id': int(target_id), 'ph': pharmacy_id}
                ).mappings().first()
                if price_row:
                    unit_price = float(price_row.get('unit_price', 0) or 0)
                    cost_price = float(price_row.get('cost_price', 0) or 0)
        except:
            pass
        
        # Calculate revenue, cost, profit
        predictions = forecast['predictions']
        revenue = [p * unit_price for p in predictions]
        cost = [p * cost_price for p in predictions]
        profit = [r - c for r, c in zip(revenue, cost)]
        
        metrics = forecast.get('metrics', {})
        resp = {
            'success': True,
            'best_model': forecast['model_type'],
            'forecast': {
                'values': predictions,
                'dates': forecast['dates'],
                'confidence_lower': forecast.get('confidence_lower'),
                'confidence_upper': forecast.get('confidence_upper')
            },
            'forecasts': predictions,
            'dates': forecast['dates'],
            'metrics': metrics,
            'revenue': revenue,
            'cost': cost,
            'profit': profit,
            'unit_price': unit_price,
            'cost_price': cost_price,
            'model_type': forecast['model_type'],
            'accuracy': metrics.get('accuracy', 0),
            'mae': metrics.get('mae', 0),
            'rmse': metrics.get('rmse', 0),
            'comparison': forecast.get('comparison', {}),
            'trained_at': forecast.get('trained_at')
        }
        # Include confidence arrays if available
        if forecast.get('confidence_lower') is not None and forecast.get('confidence_upper') is not None:
            resp['confidence_lower'] = forecast['confidence_lower']
            resp['confidence_upper'] = forecast['confidence_upper']
            resp['confidence'] = [forecast['confidence_lower'], forecast['confidence_upper']]

        return jsonify(resp)
        
    except Exception as e:
        import traceback
        return jsonify({'success': False, 'error': str(e)}), 500


@forecasting_bp.route('/products', methods=['GET'])
@jwt_required()
def get_forecastable_products():
    """Get top 50 products for forecasting, sorted by average daily sales"""
    try:
        user_id = get_jwt_identity()
        pharmacy_id = _get_user_pharmacy_id(user_id)
        if not pharmacy_id:
            return jsonify({'success': False, 'error': 'User not found'}), 404
        
        with engine.connect() as conn:
            has_sales_table = conn.execute(text("""
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public'
                      AND table_name = 'historical_sales_daily'
                )
            """)).scalar()

            if has_sales_table:
                query = """
                    SELECT 
                        p.id, 
                        p.name,
                        COALESCE(pc.name, '') AS category_name,
                        COALESCE(p.unit_price, 0) AS unit_price,
                        COALESCE(p.cost_price, 0) AS cost_price,
                        COALESCE(i.current_stock, 0) AS current_stock,
                        COALESCE(hsd.avg_daily_sales, 0) AS avg_daily_sales,
                        COALESCE(hsd.sales_days, 0) AS sales_days
                    FROM products p
                    LEFT JOIN product_categories pc ON pc.id = p.category_id
                    LEFT JOIN inventory i ON i.product_id = p.id
                    LEFT JOIN (
                        SELECT 
                            product_id,
                            AVG(quantity_sold) AS avg_daily_sales,
                            COUNT(DISTINCT sale_date) AS sales_days
                        FROM historical_sales_daily
                        WHERE pharmacy_id = :ph
                        GROUP BY product_id
                    ) hsd ON hsd.product_id = p.id
                    WHERE p.pharmacy_id = :ph AND p.is_active = true
                    ORDER BY COALESCE(hsd.avg_daily_sales, 0) DESC, p.name ASC
                    LIMIT 50
                """
            else:
                query = """
                    SELECT 
                        p.id, 
                        p.name,
                        COALESCE(pc.name, '') AS category_name,
                        COALESCE(p.unit_price, 0) AS unit_price,
                        COALESCE(p.cost_price, 0) AS cost_price,
                        COALESCE(i.current_stock, 0) AS current_stock,
                        0::numeric AS avg_daily_sales,
                        0 AS sales_days
                    FROM products p
                    LEFT JOIN product_categories pc ON pc.id = p.category_id
                    LEFT JOIN inventory i ON i.product_id = p.id
                    WHERE p.pharmacy_id = :ph AND p.is_active = true
                    ORDER BY p.name ASC
                    LIMIT 50
                """

            products = conn.execute(
                text(query),
                {'ph': pharmacy_id}
            ).mappings().all()
        
        return jsonify({
            'success': True,
            'products': [dict(p) for p in products]
        })
        
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


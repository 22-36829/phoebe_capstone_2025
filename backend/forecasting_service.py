"""
Simplified Forecasting Service
Uses SARIMAX and FBProphet models
Compares accuracy and selects the best model
"""
import json
import os
import pickle
from datetime import datetime, timedelta
from typing import Any, Dict, Optional, Tuple, List
import warnings

import numpy as np
import pandas as pd
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sklearn.metrics import mean_absolute_error, mean_squared_error

# Model imports
from statsmodels.tsa.statespace.sarimax import SARIMAX
try:
    from prophet import Prophet
except ImportError:
    try:
        from fbprophet import Prophet
    except ImportError:
        Prophet = None

warnings.filterwarnings('ignore')


class ForecastingService:
    """Simplified forecasting service with multi-model comparison"""

    def __init__(self, db_connection_string: Optional[str] = None) -> None:
        self.db_connection_string = db_connection_string or os.getenv('DATABASE_URL')
        self.engine: Optional[Engine] = (
            create_engine(self.db_connection_string)
            if self.db_connection_string
            else None
        )
        # Models directory - use relative to this file's location
        base_dir = os.path.dirname(os.path.abspath(__file__))
        self.models_dir = os.path.join(base_dir, 'ai_models')
        os.makedirs(self.models_dir, exist_ok=True)

    @staticmethod
    def _model_filename(pharmacy_id: int, target_id: str) -> str:
        """Generate model filename"""
        safe_target = str(target_id).replace('/', '_')
        return f"forecast_{pharmacy_id}_{safe_target}.pkl"

    def get_historical_data(
        self,
        pharmacy_id: int,
        product_id: Optional[int] = None,
        category_id: Optional[int] = None,
        days: int = 365,
    ) -> pd.DataFrame:
        """Get historical sales data from database"""
        if not self.engine:
            return pd.DataFrame()

        end_date = datetime.now().date()
        start_date = end_date - timedelta(days=days)
        recent_cutoff = end_date - timedelta(days=30)

        params = {
            'ph': pharmacy_id,
            'start': start_date,
            'end': end_date,
            'recent_cutoff': recent_cutoff,
        }

        if product_id:
            params['pid'] = product_id
            sql = text("""
                WITH historical_data AS (
                    SELECT 
                        h.sale_date::date AS sale_date,
                        SUM(h.quantity_sold) AS quantity
                    FROM historical_sales_daily h
                    WHERE h.pharmacy_id = :ph AND h.product_id = :pid
                      AND h.sale_date >= :start AND h.sale_date < :recent_cutoff
                    GROUP BY sale_date
                ),
                recent_sales AS (
                    SELECT 
                        DATE(s.created_at) AS sale_date,
                        SUM(si.quantity) AS quantity
                    FROM sales s
                    JOIN sale_items si ON s.id = si.sale_id
                    WHERE s.pharmacy_id = :ph AND si.product_id = :pid
                      AND s.status = 'completed'
                      AND DATE(s.created_at) >= :recent_cutoff
                      AND DATE(s.created_at) <= :end
                    GROUP BY DATE(s.created_at)
                ),
                combined AS (
                    SELECT sale_date, quantity FROM historical_data
                    UNION ALL
                    SELECT sale_date, quantity FROM recent_sales
                )
                SELECT 
                    sale_date,
                    SUM(quantity) AS quantity
                FROM combined
                GROUP BY sale_date
                ORDER BY sale_date ASC
            """)
        else:
            params['cid'] = category_id
            sql = text("""
                WITH historical_data AS (
                    SELECT 
                        h.sale_date::date AS sale_date,
                        SUM(h.quantity_sold) AS quantity
                    FROM historical_sales_daily h
                    JOIN products p ON p.id = h.product_id
                    WHERE h.pharmacy_id = :ph AND p.category_id = :cid
                      AND h.sale_date >= :start AND h.sale_date < :recent_cutoff
                    GROUP BY sale_date
                ),
                recent_sales AS (
                    SELECT 
                        DATE(s.created_at) AS sale_date,
                        SUM(si.quantity) AS quantity
                    FROM sales s
                    JOIN sale_items si ON s.id = si.sale_id
                    JOIN products p ON p.id = si.product_id
                    WHERE s.pharmacy_id = :ph AND p.category_id = :cid
                      AND s.status = 'completed'
                      AND DATE(s.created_at) >= :recent_cutoff
                      AND DATE(s.created_at) <= :end
                    GROUP BY DATE(s.created_at)
                ),
                combined AS (
                    SELECT sale_date, quantity FROM historical_data
                    UNION ALL
                    SELECT sale_date, quantity FROM recent_sales
                )
                SELECT 
                    sale_date,
                    SUM(quantity) AS quantity
                FROM combined
                GROUP BY sale_date
                ORDER BY sale_date ASC
            """)

        with self.engine.connect() as conn:
            df = pd.read_sql(sql, conn, params=params)

        if df.empty:
            return df

        df['sale_date'] = pd.to_datetime(df['sale_date'])
        df = df.set_index('sale_date').sort_index()
        df = df[['quantity']]
        df['quantity'] = df['quantity'].fillna(0.0).astype(float)
        
        # Fill missing dates with 0
        idx = pd.date_range(df.index.min(), df.index.max(), freq='D')
        df = df.reindex(idx, fill_value=0.0)
        
        return df

    @staticmethod
    def _prepare_series(df: pd.DataFrame) -> pd.Series:
        """Prepare time series from dataframe"""
        if df.empty:
            return pd.Series(dtype=float)
        series = df['quantity'].astype(float).clip(lower=0.0)
        return series

    def _train_sarimax(self, train: pd.Series, seasonal_period: int = 7) -> Optional[Tuple[Any, Dict]]:
        """Train SARIMAX model"""
        try:
            # Simple SARIMAX with auto-determined parameters
            if len(train) < seasonal_period * 2:
                seasonal_period = None
            
            if seasonal_period:
                model = SARIMAX(
                    train,
                    order=(1, 1, 1),
                    seasonal_order=(1, 1, 1, seasonal_period),
                    enforce_stationarity=False,
                    enforce_invertibility=False
                )
            else:
                model = SARIMAX(
                    train,
                    order=(1, 1, 1),
                    enforce_stationarity=False,
                    enforce_invertibility=False
                )
            
            fitted = model.fit(disp=False, maxiter=50)
            return fitted, {
                'type': 'sarimax',
                'order': (1, 1, 1),
                'seasonal_period': seasonal_period
            }
        except Exception as e:
            print(f"SARIMAX training failed: {e}")
            return None

    def _train_prophet(self, train: pd.Series) -> Optional[Tuple[Any, Dict]]:
        """Train FBProphet model"""
        if Prophet is None:
            return None
        try:
            # Prepare data for Prophet (needs 'ds' and 'y' columns)
            df = train.reset_index()
            df.columns = ['ds', 'y']
            df['y'] = df['y'].clip(lower=0.0)
            
            # Create Prophet model
            model = Prophet(
                daily_seasonality=False,
                weekly_seasonality=True if len(train) >= 14 else False,
                yearly_seasonality=False,
                changepoint_prior_scale=0.05,
                seasonality_prior_scale=10.0
            )
            
            # Fit model
            model.fit(df)
            return model, {'type': 'prophet'}
        except Exception as e:
            print(f"Prophet training failed: {e}")
            return None

    def _evaluate_model(self, model, model_meta: Dict, train: pd.Series, test: pd.Series) -> Optional[Dict]:
        """Evaluate model accuracy on test set"""
        try:
            # Make predictions
            if model_meta['type'] == 'prophet':
                # Prophet needs future dataframe
                future = model.make_future_dataframe(periods=len(test))
                forecast = model.predict(future)
                pred = forecast.tail(len(test))['yhat'].values
            elif model_meta['type'] == 'arima':
                # ARIMA forecast
                forecast_result = model.forecast(steps=len(test))
                pred = forecast_result.values if hasattr(forecast_result, 'values') else forecast_result
                # Ensure it's a numpy array
                if not isinstance(pred, np.ndarray):
                    pred = np.array(pred)
            else:  # SARIMAX
                pred = model.forecast(steps=len(test))
            
            # Ensure predictions are non-negative
            pred = np.maximum(pred, 0.0)
            
            # Calculate metrics
            mae = mean_absolute_error(test.values, pred)
            rmse = np.sqrt(mean_squared_error(test.values, pred))

            # Use sMAPE for accuracy (more stable for low-demand/zero days)
            eps = 1e-6
            denom = (np.abs(test.values) + np.abs(pred) + eps)
            smape = np.mean(2.0 * np.abs(test.values - pred) / denom) * 100.0
            accuracy = float(max(0.0, min(100.0, 100.0 - smape)))
            
            return {
                'mae': float(mae),
                'rmse': float(rmse),
                'accuracy': float(accuracy),
                'model_type': model_meta['type']
            }
        except Exception as e:
            print(f"Model evaluation failed: {e}")
            return None

    def train_and_compare_models(
        self,
        pharmacy_id: int,
        target_id: int,
        target_name: str,
        model_type: str = 'product',
        days: int = 365,
    ) -> Tuple[Optional[Dict], str]:
        """
        Train ARIMA, SARIMAX, and Prophet models
        Compare accuracy and return best model
        """
        # Get historical data
        product_id = target_id if model_type == 'product' else None
        category_id = target_id if model_type == 'category' else None
        
        df = self.get_historical_data(
            pharmacy_id,
            product_id=product_id,
            category_id=category_id,
            days=days
        )
        
        if df.empty or len(df) < 14:
            return None, 'Insufficient historical data (need at least 14 days)'
        
        # Prepare series
        series = self._prepare_series(df)
        
        # Split into train/test (80/20)
        split_idx = int(len(series) * 0.8)
        if split_idx < 7:
            split_idx = max(1, len(series) - 7)
        
        train = series.iloc[:split_idx]
        test = series.iloc[split_idx:]
        
        if len(test) < 1:
            return None, 'Insufficient data for testing'
        
        # Train all models
        models = []
        
        # 1. SARIMAX
        seasonal_period = 7 if len(train) >= 14 else None
        sarimax_result = self._train_sarimax(train, seasonal_period)
        if sarimax_result:
            model, meta = sarimax_result
            metrics = self._evaluate_model(model, meta, train, test)
            if metrics:
                models.append({
                    'model': model,
                    'meta': meta,
                    'metrics': metrics
                })
        
        # 2. Prophet
        prophet_result = self._train_prophet(train)
        if prophet_result:
            model, meta = prophet_result
            metrics = self._evaluate_model(model, meta, train, test)
            if metrics:
                models.append({
                    'model': model,
                    'meta': meta,
                    'metrics': metrics
                })
        
        if not models:
            return None, 'All models failed to train'
        
        # Select best model (highest accuracy, or lowest MAE if accuracy tie)
        best_model = max(models, key=lambda x: (x['metrics']['accuracy'], -x['metrics']['mae']))
        
        # Retrain on full dataset
        full_model_result = None
        if best_model['meta']['type'] == 'sarimax':
            full_model_result = self._train_sarimax(series, seasonal_period)
        elif best_model['meta']['type'] == 'prophet':
            full_model_result = self._train_prophet(series)
        
        if not full_model_result:
            return None, 'Failed to retrain best model on full dataset'
        
        full_model, full_meta = full_model_result
        
        comparison = {
            model['meta']['type']: {
                'accuracy': model['metrics']['accuracy'],
                'mae': model['metrics']['mae'],
                'rmse': model['metrics']['rmse']
            }
            for model in models
        }

        # Save model
        model_file = self._model_filename(pharmacy_id, str(target_id))
        model_path = os.path.join(self.models_dir, model_file)
        
        with open(model_path, 'wb') as f:
            pickle.dump({
                'model': full_model,
                'meta': full_meta,
                'metrics': best_model['metrics'],
                'comparison': comparison,
                'target_id': target_id,
                'target_name': target_name,
                'pharmacy_id': pharmacy_id,
                'model_type': model_type,
                'trained_at': datetime.now().isoformat()
            }, f)
        
        # Prepare results
        result = {
            'model_type': best_model['meta']['type'],
            'model_file': model_file,
            'metrics': best_model['metrics'],
            'comparison': comparison
        }
        
        return result, 'Success'

    def load_model(self, pharmacy_id: int, target_id: str) -> Optional[Dict]:
        """Load trained model from disk"""
        model_file = self._model_filename(pharmacy_id, target_id)
        model_path = os.path.join(self.models_dir, model_file)
        
        if not os.path.exists(model_path):
            return None
        
        try:
            with open(model_path, 'rb') as f:
                return pickle.load(f)
        except Exception:
            return None

    def forecast(
        self,
        pharmacy_id: int,
        target_id: str,
        days: int = 30
    ) -> Optional[Dict]:
        """Generate forecast using trained model"""
        model_data = self.load_model(pharmacy_id, target_id)
        if not model_data:
            return None
        
        model = model_data['model']
        meta = model_data['meta']
        
        try:
            # Generate forecast based on model type
            if meta['type'] == 'prophet':
                if Prophet is None:
                    return None
                future = model.make_future_dataframe(periods=days)
                forecast = model.predict(future)
                predictions = forecast.tail(days)['yhat'].values
                dates = forecast.tail(days)['ds'].dt.date.tolist()
                # Confidence intervals
                try:
                    lower = forecast.tail(days)['yhat_lower'].values
                    upper = forecast.tail(days)['yhat_upper'].values
                except Exception:
                    lower = None
                    upper = None
            else:  # SARIMAX
                # statsmodels SARIMAXResults supports get_forecast for CI
                try:
                    fc = model.get_forecast(steps=days)
                    predictions = fc.predicted_mean
                    conf_int = fc.conf_int()
                    # take first and second column as lower/upper
                    lower = conf_int.iloc[:, 0].values
                    upper = conf_int.iloc[:, 1].values
                except Exception:
                    predictions = model.forecast(steps=days)
                    lower = None
                    upper = None
                dates = [
                    (datetime.now() + timedelta(days=i)).date()
                    for i in range(1, days + 1)
                ]
            
            # Convert to numpy array and ensure non-negative
            predictions = np.array(predictions, dtype=float)
            predictions = np.maximum(predictions, 0.0).tolist()
            lower_list = None
            upper_list = None
            if lower is not None and upper is not None:
                lower_arr = np.maximum(np.array(lower, dtype=float), 0.0)
                upper_arr = np.maximum(np.array(upper, dtype=float), 0.0)
                lower_list = lower_arr.tolist()
                upper_list = upper_arr.tolist()
            
            return {
                'predictions': predictions,
                'dates': [str(d) for d in dates],
                'model_type': meta['type'],
                'metrics': model_data.get('metrics', {}),
                'comparison': model_data.get('comparison', {}),
                'trained_at': model_data.get('trained_at'),
                'confidence_lower': lower_list,
                'confidence_upper': upper_list
            }
        except Exception as e:
            print(f"Forecast generation failed: {e}")
            import traceback
            traceback.print_exc()
            return None

    def list_saved_models(self, pharmacy_id: int) -> List[Dict]:
        """Return metadata about saved models for a pharmacy"""
        models: List[Dict] = []
        if not os.path.isdir(self.models_dir):
            return models

        prefix = f"forecast_{pharmacy_id}_"
        for filename in os.listdir(self.models_dir):
            if not filename.startswith(prefix) or not filename.endswith('.pkl'):
                continue
            path = os.path.join(self.models_dir, filename)
            try:
                with open(path, 'rb') as f:
                    data = pickle.load(f)
                metrics = data.get('metrics', {})
                comparison = data.get('comparison', {})
                models.append({
                    'target_id': data.get('target_id'),
                    'target_name': data.get('target_name'),
                    'model_type': data.get('meta', {}).get('type') or data.get('model_type'),
                    'accuracy_percentage': metrics.get('accuracy'),
                    'mae': metrics.get('mae'),
                    'rmse': metrics.get('rmse'),
                    'trained_at': data.get('trained_at'),
                    'comparison': comparison,
                    'file': filename
                })
            except Exception as exc:
                print(f"Failed to read model file {filename}: {exc}")
                continue

        models.sort(key=lambda m: (m.get('accuracy_percentage') is not None, m.get('accuracy_percentage') or 0), reverse=True)
        return models

    def get_accuracy_summary(self, pharmacy_id: int) -> Dict:
        """Aggregate accuracy metrics for a pharmacy"""
        models = self.list_saved_models(pharmacy_id)
        accuracies = [m['accuracy_percentage'] for m in models if isinstance(m.get('accuracy_percentage'), (int, float))]
        overall_accuracy = sum(accuracies) / len(accuracies) if accuracies else 0.0

        best_model = None
        if models:
            best_model = max(models, key=lambda m: m.get('accuracy_percentage') or 0)

        return {
            'accuracy_percentage': overall_accuracy,
            'total_models': len(models),
            'models': models,
            'best_model': best_model
        }

    @staticmethod
    def _timeframe_to_days(timeframe: str) -> int:
        mapping = {
            '1H': 7,
            '4H': 14,
            '1D': 30,
            '7D': 90,
            '1M': 180,
            '3M': 240,
            '1Y': 365,
            'MAX': 365
        }
        return mapping.get(timeframe, 180)

    def get_historical_series(
        self,
        pharmacy_id: int,
        target_id: int,
        timeframe: str = '1D',
        model_type: str = 'product'
    ) -> List[Dict]:
        days = self._timeframe_to_days(timeframe)
        df = self.get_historical_data(
            pharmacy_id,
            product_id=target_id if model_type == 'product' else None,
            category_id=target_id if model_type == 'category' else None,
            days=days
        )

        if df.empty:
            return []

        df = df.tail(days)
        return [
            {
                'date': idx.strftime('%Y-%m-%d'),
                'quantity': float(row['quantity'])
            }
            for idx, row in df.iterrows()
        ]

    def get_category_summary(self, pharmacy_id: int, limit: int = 20) -> List[Dict]:
        """Return top categories by average daily sales"""
        if not self.engine:
            return []

        query_has_sales = text("""
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'historical_sales_daily'
            )
        """)

        with self.engine.connect() as conn:
            has_sales_table = conn.execute(query_has_sales).scalar()

            if has_sales_table:
                sql = text("""
                    SELECT 
                        c.id,
                        c.name,
                        COUNT(DISTINCT p.id) AS product_count,
                        COALESCE(SUM(h.quantity_sold), 0) AS total_sales,
                        COALESCE(AVG(h.quantity_sold), 0) AS avg_daily_sales
                    FROM product_categories c
                    JOIN products p ON p.category_id = c.id AND p.pharmacy_id = :ph AND p.is_active = true
                    LEFT JOIN historical_sales_daily h ON h.product_id = p.id AND h.pharmacy_id = :ph
                    GROUP BY c.id, c.name
                    ORDER BY avg_daily_sales DESC, c.name ASC
                    LIMIT :limit
                """)
            else:
                sql = text("""
                    SELECT 
                        c.id,
                        c.name,
                        COUNT(DISTINCT p.id) AS product_count,
                        0::numeric AS total_sales,
                        0::numeric AS avg_daily_sales
                    FROM product_categories c
                    JOIN products p ON p.category_id = c.id AND p.pharmacy_id = :ph AND p.is_active = true
                    GROUP BY c.id, c.name
                    ORDER BY c.name ASC
                    LIMIT :limit
                """)

            rows = conn.execute(sql, {'ph': pharmacy_id, 'limit': limit}).mappings().all()

        results: List[Dict] = []
        for row in rows:
            record = dict(row)
            if 'avg_daily_sales' in record:
                record['avg_daily_sales'] = float(record.get('avg_daily_sales', 0) or 0)
            if 'total_sales' in record:
                record['total_sales'] = float(record.get('total_sales', 0) or 0)
            results.append(record)

        return results


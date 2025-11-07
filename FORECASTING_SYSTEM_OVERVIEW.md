# 📊 Forecasting System Overview

## Executive Summary

### Where is the Code for Model

The **model code is located in `backend/forecasting_service.py`**, specifically within the `ForecastingService` class. This service implements two competing time series forecasting models: SARIMAX (Seasonal ARIMA with eXogenous variables) and Prophet (Facebook's time series forecasting library). The SARIMAX model is implemented in the `_train_sarimax()` method (Lines 173-204) using `statsmodels.tsa.statespace.sarimax.SARIMAX` with order parameters (1,1,1) for auto-regressive, differencing, and moving average components, and seasonal order (1,1,1,7) for weekly seasonality. The Prophet model is implemented in the `_train_prophet()` method (Lines 206-230) with weekly seasonality enabled when sufficient data is available (14+ days), daily and yearly seasonality disabled, changepoint prior scale of 0.05, and seasonality prior scale of 10.0. The main training pipeline is orchestrated by the `train_and_compare_models()` method (Lines 274-394), which coordinates the entire process from data preparation through model selection and saving. Forecast generation is handled by the `forecast()` method (Lines 410-483), which loads trained models and generates predictions with confidence intervals.

### Where the Data is Collected or Made

**Data collection occurs in the `get_historical_data()` method** (Lines 51-163 of `forecasting_service.py`). This method queries two primary data sources from the PostgreSQL database: the `historical_sales_daily` table for sales data older than 30 days, and the `sales` and `sale_items` tables joined together for recent transactions from the last 30 days. The method combines both data sources using a SQL UNION operation, groups sales by date and sums quantities, then converts the result into a pandas DataFrame with a date index. Missing dates within the date range are filled with zero values to ensure continuity in the time series, which is essential for time series forecasting models. The data is processed to handle both product-level forecasting (when `product_id` is provided) and category-level forecasting (when `category_id` is provided), with the default time range being 365 days of historical data, though this is configurable. The final output is a clean time series DataFrame with daily frequency, ready for model training.

### How the Metrics is Computed

**Metrics computation happens in the `_evaluate_model()` method** (Lines 232-272 of `forecasting_service.py`). The evaluation process uses an 80/20 train-test split, where 80% of the historical data is used for training and 20% is reserved for testing model performance. The system calculates three key metrics for each model: MAE (Mean Absolute Error) using `sklearn.metrics.mean_absolute_error()`, which computes the average absolute difference between actual and predicted values using the formula `(1/n) × Σ|Actual - Predicted|`; RMSE (Root Mean Squared Error) using `np.sqrt(mean_squared_error())`, which calculates the square root of the mean squared differences using `√[(1/n) × Σ(Actual - Predicted)²]` and penalizes larger errors more heavily than MAE; and Accuracy, which is derived from sMAPE (Symmetric Mean Absolute Percentage Error) using the formula `accuracy = 100 - sMAPE`, where `sMAPE = (2/n) × Σ|Actual - Predicted| / (|Actual| + |Predicted|)`. The sMAPE-based accuracy metric is specifically chosen because it handles zero sales days gracefully (unlike traditional MAPE which fails with zeros), is symmetric (treats over-prediction and under-prediction equally), and provides bounded results. All predictions are clipped to non-negative values before metric calculation to ensure realistic forecasts.

### What are the Comparisons

**The comparison process in `train_and_compare_models()`** (Lines 274-394 of `forecasting_service.py`) implements a comprehensive model selection strategy. The system trains both SARIMAX and Prophet models on the same 80% training dataset, then evaluates each model independently on the remaining 20% test set to generate performance metrics (accuracy, MAE, RMSE). A comparison dictionary is created containing both models' metrics, structured as `{'sarimax': {'accuracy': X, 'mae': Y, 'rmse': Z}, 'prophet': {'accuracy': A, 'mae': B, 'rmse': C}}`. The best model is selected using a two-tier selection criteria: first by highest accuracy percentage, and if there's a tie, by lowest MAE (Mean Absolute Error). Once the best model is identified, it is retrained on the full 100% dataset (combining both training and test sets) to maximize its learning from all available historical data. The final trained model, along with its metrics and the complete comparison data, is saved to disk at `backend/ai_models/forecast_{pharmacy_id}_{target_id}.pkl` using Python's pickle module. This comparison data is then available through the API endpoints and displayed in the frontend interface, allowing users to see how each model performed and understand why a particular model was selected.

### How Reliable the Interpretation is (Accuracy)

**The accuracy interpretation and reliability** depend on several critical factors. Accuracy scores above 80% are considered highly reliable for inventory planning and business decision-making, indicating that the model's predictions are within acceptable error margins. Scores between 70-79% represent moderate reliability, requiring cautious use and regular monitoring, as predictions may have more variability. Scores below 70% suggest the model may need retraining, additional historical data, or that the sales patterns are too irregular for reliable forecasting. The reliability is further enhanced by confidence intervals provided by both models: SARIMAX uses `get_forecast().conf_int()` to generate prediction intervals, while Prophet uses `yhat_lower` and `yhat_upper` columns from its forecast output. These intervals indicate the range within which actual values are likely to fall, with narrower intervals indicating higher confidence. The system's use of sMAPE-based accuracy ensures stable and meaningful metrics even with sparse data or frequent zero-sales days, which is common in retail environments. The accuracy percentage becomes a trustworthy indicator of model performance when sufficient historical data (ideally 365+ days) is available, sales patterns are relatively consistent, and the product has regular demand. However, users should also consider the MAE and RMSE values in context: a model with 85% accuracy but an MAE of 20 units for a product that averages 10 units per day would be less reliable than the same accuracy with an MAE of 2 units for a product averaging 100 units per day.

## Table of Contents
1. [System Architecture](#system-architecture)
2. [Model Code Location](#model-code-location)
3. [Data Collection & Processing](#data-collection--processing)
4. [Metrics Computation](#metrics-computation)
5. [Model Comparison](#model-comparison)
6. [Accuracy Interpretation & Reliability](#accuracy-interpretation--reliability)
7. [Training Process](#training-process)
8. [Forecast Generation](#forecast-generation)

---

## System Architecture

### File Structure
```
backend/
├── forecasting_service.py      # Core forecasting service (MODEL CODE)
├── train_models.py             # Training script entry point
├── routes/
│   └── forecasting.py         # API endpoints
└── ai_models/                 # Saved trained models
    └── forecast_{pharmacy_id}_{target_id}.pkl

frontend/
└── src/pages/manager/
    └── Forecasting.js          # UI for forecasting dashboard
```

---

## Model Code Location

### Primary Model Implementation
**File:** `backend/forecasting_service.py`

**Key Classes & Methods:**
- `ForecastingService` - Main service class
  - `_train_sarimax()` - SARIMAX model training (Lines 173-204)
  - `_train_prophet()` - Prophet model training (Lines 206-230)
  - `_evaluate_model()` - Model evaluation & metrics (Lines 232-272)
  - `train_and_compare_models()` - Training pipeline (Lines 274-394)
  - `forecast()` - Generate predictions (Lines 410-483)

### Model Types Implemented

#### 1. SARIMAX (Seasonal ARIMA with eXogenous variables)
```python
# Location: backend/forecasting_service.py, Lines 173-204
- Order: (1, 1, 1) - Auto-regressive, Differencing, Moving Average
- Seasonal Order: (1, 1, 1, 7) - Weekly seasonality
- Parameters: enforce_stationarity=False, maxiter=50
```

#### 2. Prophet (Facebook's Time Series Forecasting)
```python
# Location: backend/forecasting_service.py, Lines 206-230
- Weekly seasonality: Enabled if data >= 14 days
- Daily/Yearly: Disabled
- Changepoint prior scale: 0.05
- Seasonality prior scale: 10.0
```

---

## Data Collection & Processing

### Data Sources

#### 1. Historical Sales Data
**Source:** `historical_sales_daily` table
- **Fields:** `sale_date`, `quantity_sold`, `product_id`, `pharmacy_id`
- **Time Range:** Last 365 days (configurable)
- **Query Location:** `forecasting_service.py`, Lines 75-108

#### 2. Recent Sales Data
**Source:** `sales` + `sale_items` tables (last 30 days)
- **Fields:** `created_at`, `quantity`, `product_id`, `pharmacy_id`
- **Status Filter:** Only `completed` sales
- **Query Location:** `forecasting_service.py`, Lines 85-96

### Data Processing Pipeline

```python
# Location: forecasting_service.py, get_historical_data()

1. Fetch historical data (older than 30 days)
   ↓
2. Fetch recent sales (last 30 days)
   ↓
3. Combine both datasets
   ↓
4. Group by date and sum quantities
   ↓
5. Fill missing dates with 0
   ↓
6. Convert to pandas DataFrame with date index
   ↓
7. Prepare time series (clip negative values)
```

**Key Processing Steps:**
- **Date Range:** `start_date` to `end_date` (default: 365 days)
- **Recent Cutoff:** Last 30 days use live sales data
- **Missing Data:** Filled with 0 (no sales on that day)
- **Data Type:** Converted to float, clipped to non-negative

---

## Metrics Computation

### Evaluation Metrics

**Location:** `forecasting_service.py`, `_evaluate_model()` method (Lines 232-272)

#### 1. MAE (Mean Absolute Error)
```python
mae = mean_absolute_error(test.values, pred)
# Formula: (1/n) × Σ|Actual - Predicted|
# Interpretation: Average absolute difference between actual and predicted
# Lower is better
```

#### 2. RMSE (Root Mean Squared Error)
```python
rmse = np.sqrt(mean_squared_error(test.values, pred))
# Formula: √[(1/n) × Σ(Actual - Predicted)²]
# Interpretation: Penalizes larger errors more than MAE
# Lower is better
```

#### 3. Accuracy (sMAPE-based)
```python
# Uses Symmetric Mean Absolute Percentage Error (sMAPE)
eps = 1e-6  # Small epsilon to avoid division by zero
denom = (np.abs(test.values) + np.abs(pred) + eps)
smape = np.mean(2.0 * np.abs(test.values - pred) / denom) * 100.0
accuracy = max(0.0, min(100.0, 100.0 - smape))

# Formula: 100 - sMAPE
# sMAPE = (2/n) × Σ|Actual - Predicted| / (|Actual| + |Predicted|)
# Interpretation: Percentage accuracy (higher is better)
# Range: 0-100%
```

### Why sMAPE for Accuracy?

1. **Handles Zero Values:** Unlike MAPE, sMAPE works with zero sales days
2. **Symmetric:** Treats over-prediction and under-prediction equally
3. **Bounded:** Always between 0% and 200%, converted to 0-100% accuracy
4. **Stable:** Less sensitive to outliers than MAPE

### Test-Train Split

```python
# Location: forecasting_service.py, Lines 303-312
split_idx = int(len(series) * 0.8)  # 80% train, 20% test
train = series.iloc[:split_idx]
test = series.iloc[split_idx:]

# Minimum requirements:
# - At least 14 days of data total
# - At least 7 days for testing
```

---

## Model Comparison

### Comparison Process

**Location:** `forecasting_service.py`, `train_and_compare_models()` (Lines 274-394)

#### Step-by-Step Comparison:

1. **Train Both Models**
   - SARIMAX on training set
   - Prophet on training set

2. **Evaluate Each Model**
   - Predict on test set (20% of data)
   - Calculate MAE, RMSE, Accuracy

3. **Build Comparison Dictionary**
```python
comparison = {
    'sarimax': {
        'accuracy': 85.5,
        'mae': 2.3,
        'rmse': 3.1
    },
    'prophet': {
        'accuracy': 82.1,
        'mae': 2.8,
        'rmse': 3.5
    }
}
```

4. **Select Best Model**
```python
# Selection criteria (priority order):
best_model = max(models, key=lambda x: (
    x['metrics']['accuracy'],  # 1. Highest accuracy
    -x['metrics']['mae']       # 2. Lowest MAE (if accuracy tie)
))
```

5. **Retrain Best Model on Full Dataset**
   - Uses 100% of available data
   - Saves to disk for future predictions

### Comparison Display

**Frontend Location:** `frontend/src/pages/manager/Forecasting.js`

The comparison data is displayed in:
- Model Comparison Modal (Lines 3066-3150)
- Product details section showing best model metrics
- Comparison entries sorted by accuracy

---

## Accuracy Interpretation & Reliability

### Accuracy Ranges & Interpretation

| Accuracy % | Interpretation | Reliability | Action |
|------------|---------------|-------------|--------|
| **90-100%** | Excellent | Very High | Use confidently for inventory planning |
| **80-89%** | Good | High | Reliable for most forecasting needs |
| **70-79%** | Fair | Moderate | Use with caution, monitor closely |
| **50-69%** | Poor | Low | Consider retraining or more data |
| **<50%** | Very Poor | Very Low | Model may not be suitable |

### Factors Affecting Reliability

#### 1. **Data Quality**
- ✅ **Good:** Consistent daily sales, sufficient history (365+ days)
- ⚠️ **Fair:** Irregular sales, gaps in data
- ❌ **Poor:** Very sparse data, many zero days

#### 2. **Data Volume**
- **Minimum:** 14 days required
- **Recommended:** 90+ days for stable models
- **Optimal:** 365+ days for seasonal patterns

#### 3. **Sales Patterns**
- **High Reliability:** Regular, predictable patterns
- **Medium Reliability:** Seasonal variations
- **Low Reliability:** Highly irregular, sporadic sales

#### 4. **Model Type Performance**

**SARIMAX:**
- ✅ Best for: Seasonal patterns, weekly cycles
- ⚠️ Limitations: Requires sufficient data, can be slow

**Prophet:**
- ✅ Best for: Complex patterns, trend changes
- ⚠️ Limitations: More memory intensive, slower training

### Reliability Indicators

**High Reliability:**
- Accuracy > 80%
- MAE < 10% of average daily sales
- Consistent performance across test period

**Low Reliability:**
- Accuracy < 60%
- MAE > 20% of average daily sales
- High variance in predictions

### Confidence Intervals

**Location:** `forecasting_service.py`, `forecast()` method (Lines 410-483)

Both models provide confidence intervals:
- **SARIMAX:** Uses `get_forecast().conf_int()` (Lines 442-448)
- **Prophet:** Uses `yhat_lower` and `yhat_upper` (Lines 434-439)

**Interpretation:**
- Narrow intervals = Higher confidence
- Wide intervals = Lower confidence, more uncertainty

---

## Training Process

### Complete Training Pipeline

**Entry Point:** `backend/train_models.py`

#### 1. **Data Collection** (Lines 51-163)
```python
get_historical_data(pharmacy_id, product_id, days=365)
```
- Fetches sales data from database
- Combines historical + recent sales
- Returns pandas DataFrame

#### 2. **Data Validation** (Lines 297-312)
```python
if df.empty or len(df) < 14:
    return None, 'Insufficient historical data'
```
- Checks minimum data requirements
- Validates data quality

#### 3. **Data Preparation** (Lines 301)
```python
series = self._prepare_series(df)
```
- Converts to time series
- Clips negative values
- Sets date index

#### 4. **Train-Test Split** (Lines 303-312)
```python
split_idx = int(len(series) * 0.8)  # 80/20 split
train = series.iloc[:split_idx]
test = series.iloc[split_idx:]
```

#### 5. **Model Training** (Lines 317-340)
```python
# Train SARIMAX
sarimax_result = self._train_sarimax(train, seasonal_period=7)

# Train Prophet
prophet_result = self._train_prophet(train)
```

#### 6. **Model Evaluation** (Lines 322, 334)
```python
metrics = self._evaluate_model(model, meta, train, test)
# Returns: {accuracy, mae, rmse, model_type}
```

#### 7. **Best Model Selection** (Line 346)
```python
best_model = max(models, key=lambda x: (x['metrics']['accuracy'], -x['metrics']['mae']))
```

#### 8. **Final Training** (Lines 348-356)
```python
# Retrain best model on FULL dataset (100%)
full_model_result = self._train_sarimax(series, seasonal_period)
# OR
full_model_result = self._train_prophet(series)
```

#### 9. **Model Saving** (Lines 369-384)
```python
# Save to: backend/ai_models/forecast_{pharmacy_id}_{target_id}.pkl
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
```

### Training Time
- **Per Product:** 5-30 seconds (depends on data size)
- **SARIMAX:** Faster, ~5-15 seconds
- **Prophet:** Slower, ~10-30 seconds

---

## Forecast Generation

### Forecast Process

**Location:** `forecasting_service.py`, `forecast()` method (Lines 410-483)

#### 1. **Load Trained Model**
```python
model_data = self.load_model(pharmacy_id, target_id)
```

#### 2. **Generate Predictions**

**For SARIMAX:**
```python
fc = model.get_forecast(steps=days)
predictions = fc.predicted_mean
conf_int = fc.conf_int()
lower = conf_int.iloc[:, 0].values
upper = conf_int.iloc[:, 1].values
```

**For Prophet:**
```python
future = model.make_future_dataframe(periods=days)
forecast = model.predict(future)
predictions = forecast.tail(days)['yhat'].values
lower = forecast.tail(days)['yhat_lower'].values
upper = forecast.tail(days)['yhat_upper'].values
```

#### 3. **Post-Processing**
```python
# Ensure non-negative predictions
predictions = np.maximum(predictions, 0.0)
lower = np.maximum(lower, 0.0)
upper = np.maximum(upper, 0.0)
```

#### 4. **Generate Dates**
```python
dates = [(datetime.now() + timedelta(days=i)).date() 
         for i in range(1, days + 1)]
```

#### 5. **Return Forecast**
```python
return {
    'predictions': predictions,      # Forecasted quantities
    'dates': dates,                  # Forecast dates
    'model_type': meta['type'],      # 'sarimax' or 'prophet'
    'metrics': model_data['metrics'], # Training metrics
    'comparison': model_data['comparison'], # Model comparison
    'trained_at': model_data['trained_at'],
    'confidence_lower': lower,       # Lower confidence bound
    'confidence_upper': upper       # Upper confidence bound
}
```

### API Endpoints

**Location:** `backend/routes/forecasting.py`

#### 1. **Train Model**
```
POST /api/forecasting/train
Body: {
    target_id: int,
    target_name: string,
    model_type: 'product' | 'category',
    days: 365
}
```

#### 2. **Get Forecasts**
```
GET /api/forecasting/predictions?target_id={id}&forecast_days=30
Returns: {
    forecasts: [numbers],
    dates: [strings],
    model_type: string,
    accuracy: number,
    mae: number,
    rmse: number,
    comparison: object,
    confidence_lower: [numbers],
    confidence_upper: [numbers]
}
```

#### 3. **Get Models**
```
GET /api/forecasting/models
Returns: List of all trained models with metrics
```

---

## Summary

### Key Points

1. **Model Code:** `backend/forecasting_service.py` - Core implementation
2. **Data Source:** Database tables (`historical_sales_daily`, `sales`, `sale_items`)
3. **Metrics:** MAE, RMSE, Accuracy (sMAPE-based)
4. **Comparison:** SARIMAX vs Prophet, best selected by accuracy
5. **Reliability:** Depends on data quality, volume, and sales patterns
6. **Accuracy Range:** 0-100%, >80% is considered reliable

### Best Practices

1. **Train regularly** - Retrain when accuracy drops or new data available
2. **Monitor metrics** - Check MAE, RMSE, and accuracy trends
3. **Use confidence intervals** - Consider uncertainty in predictions
4. **Validate forecasts** - Compare predictions with actuals
5. **Retrain when needed** - If accuracy < 70%, consider retraining

---

## Technical Details

### Dependencies
- `statsmodels` - SARIMAX implementation
- `prophet` / `fbprophet` - Prophet model
- `pandas` - Data manipulation
- `numpy` - Numerical operations
- `sklearn` - Metrics calculation
- `sqlalchemy` - Database access

### Model Parameters

**SARIMAX:**
- Order: (1, 1, 1)
- Seasonal: (1, 1, 1, 7) - Weekly
- Max iterations: 50

**Prophet:**
- Weekly seasonality: Enabled
- Daily/Yearly: Disabled
- Changepoint prior: 0.05
- Seasonality prior: 10.0

---

*Last Updated: Based on current codebase analysis*
*Documentation Version: 1.0*


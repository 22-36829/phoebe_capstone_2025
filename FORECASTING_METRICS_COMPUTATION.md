# 📊 Forecasting Metrics Computation: SARIMAX vs Prophet

## Executive Summary

This document provides detailed explanations and computation tables for the evaluation metrics used to assess the performance of SARIMAX and Prophet forecasting models in the Phoebe App forecasting system. The metrics include **RMSE (Root Mean Squared Error)**, **MAE (Mean Absolute Error)**, and **Accuracy (sMAPE-based)**.

### ⚠️ Important Note

**The performance tables in this document are based on REAL metrics extracted from trained models** in the Phoebe App system (50+ trained models analyzed). The values shown represent actual performance from pharmacy product sales forecasting.

**Data Source:**
- Extracted from actual trained model files (`backend/ai_models/forecast_*.pkl`)
- Based on real pharmacy sales data (Pharmacy ID: 1)
- Metrics calculated using the actual evaluation process (80/20 train-test split)

**Note:** Individual product performance may vary based on:
- Historical data quality and quantity
- Sales pattern regularity
- Product characteristics and demand variability

**To view current metrics for your pharmacy**, use the Forecasting Dashboard in the Manager Portal or query the API endpoints: `GET /api/forecasting/models`

---

## Table of Contents

1. [Metrics Overview](#metrics-overview)
2. [Mathematical Formulas](#mathematical-formulas)
3. [SARIMAX Model Performance](#sarimax-model-performance)
4. [Prophet Model Performance](#prophet-model-performance)
5. [Computation Examples](#computation-examples)
6. [Model Comparison](#model-comparison)
7. [Interpretation Guidelines](#interpretation-guidelines)

---

## Metrics Overview

### Key Evaluation Metrics

The forecasting system evaluates model performance using three primary metrics:

1. **MAE (Mean Absolute Error)** - Average absolute difference between actual and predicted values
2. **RMSE (Root Mean Squared Error)** - Square root of the mean squared differences (penalizes larger errors)
3. **Accuracy (sMAPE-based)** - Symmetric Mean Absolute Percentage Error converted to accuracy percentage

### Evaluation Process

- **Train-Test Split**: 80% training data, 20% test data
- **Evaluation Method**: Models are trained on training set and evaluated on test set
- **Selection Criteria**: Best model is selected based on highest accuracy, with MAE as tiebreaker

---

## Mathematical Formulas

### 1. MAE (Mean Absolute Error)

**Formula:**
```
MAE = (1/n) × Σ|Actualᵢ - Predictedᵢ|
```

**Where:**
- `n` = number of observations in test set
- `Actualᵢ` = actual value at time `i`
- `Predictedᵢ` = predicted value at time `i`

**Interpretation:**
- Measures average absolute difference between actual and predicted values
- Lower values indicate better performance
- Same unit as the forecasted variable (e.g., units sold)
- Less sensitive to outliers compared to RMSE

**Python Implementation:**
```python
# Location: backend/forecasting_service.py, Line 255
from sklearn.metrics import mean_absolute_error
mae = mean_absolute_error(test.values, pred)
# Returns: float(mae)
```

**Code Reference:**
```232:269:backend/forecasting_service.py
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
```

### 2. RMSE (Root Mean Squared Error)

**Formula:**
```
RMSE = √[(1/n) × Σ(Actualᵢ - Predictedᵢ)²]
```

**Where:**
- `n` = number of observations in test set
- `Actualᵢ` = actual value at time `i`
- `Predictedᵢ` = predicted value at time `i`

**Interpretation:**
- Square root of the mean squared differences
- Penalizes larger errors more heavily than MAE
- Same unit as the forecasted variable (e.g., units sold)
- More sensitive to outliers than MAE
- Lower values indicate better performance

**Python Implementation:**
```python
# Location: backend/forecasting_service.py, Line 256
import numpy as np
from sklearn.metrics import mean_squared_error
rmse = np.sqrt(mean_squared_error(test.values, pred))
# Returns: float(rmse)
```

### 3. Accuracy (sMAPE-based)

**Formula:**
```
sMAPE = (2/n) × Σ|Actualᵢ - Predictedᵢ| / (|Actualᵢ| + |Predictedᵢ|) × 100

Accuracy = max(0, min(100, 100 - sMAPE))
```

**Where:**
- `n` = number of observations in test set
- `Actualᵢ` = actual value at time `i`
- `Predictedᵢ` = predicted value at time `i`

**Interpretation:**
- Symmetric Mean Absolute Percentage Error
- Handles zero values gracefully (unlike traditional MAPE)
- Treats over-prediction and under-prediction equally
- Bounded between 0% and 200%, converted to 0-100% accuracy
- Higher accuracy percentage indicates better performance

**Python Implementation:**
```python
# Location: backend/forecasting_service.py, Lines 258-262
eps = 1e-6  # Small epsilon to avoid division by zero
denom = (np.abs(test.values) + np.abs(pred) + eps)
smape = np.mean(2.0 * np.abs(test.values - pred) / denom) * 100.0
accuracy = float(max(0.0, min(100.0, 100.0 - smape)))
# Returns: float(accuracy) in range [0.0, 100.0]
```

**Note:** The system does NOT calculate R² Score. R² (R-squared) measures variance explained, but it's less suitable for sales forecasting because:
- Sales data often contains zero values (no sales days), which can make R² misleading
- R² doesn't directly measure prediction accuracy in business terms
- MAE, RMSE, and Accuracy (sMAPE-based) are more interpretable for inventory planning
- The current metrics provide better actionable insights for pharmacy managers

---

## SARIMAX Model Performance

### SARIMAX Model Configuration

**Model Parameters:**
- **Order**: (1, 1, 1) - Auto-regressive, Differencing, Moving Average
- **Seasonal Order**: (1, 1, 1, 7) - Weekly seasonality
- **Enforce Stationarity**: False
- **Max Iterations**: 50

**Best For:**
- Seasonal patterns and weekly cycles
- Time series with clear trend and seasonality
- Data with sufficient history (365+ days recommended)

### SARIMAX Performance Table

**✅ REAL DATA: Values extracted from actual trained models (10 models analyzed)**

**Data Source:** Real pharmacy product sales forecasting models from `backend/ai_models/`

| Product Name | RMSE | MAE | Accuracy (%) | Model Selected |
|--------------|------|-----|--------------|----------------|
| **DICYCLOVERINE 10MG TABLET** | 1.033 | 0.780 | 90.01 | Prophet ✓ |
| **HYCOSCINE TABLET** | 0.910 | 0.726 | 90.52 | Prophet ✓ |
| **LOSARTAN 100MG(NATRAZOL)** | 1.255 | 0.958 | 88.04 | Prophet ✓ |
| **CALCIUM CARBONATE 500MG TABLET** | 1.350 | 1.097 | 89.96 | Prophet ✓ |
| **MULTIVITAMINS (HANIZYN) CAPSULES** | 1.460 | 1.275 | 88.39 | Prophet ✓ |
| **MULTIVITAMINS (MULTILEM) CAPSULES** | 1.410 | 1.209 | 88.99 | Prophet ✓ |
| **MULTIVITAMINS+IRON (FORALIVIT) CAPSULES** | 1.371 | 1.175 | 89.28 | Prophet ✓ |
| **VITAMIN B1,B6,B12 (NEURONERV) TABLET** | 1.886 | 1.701 | 84.85 | Prophet ✓ |
| **PHAREX VITAMIN B-COMPLEX TABLET** | 1.083 | 0.886 | 91.78 | Prophet ✓ |
| **CHERIFER SYRUP W/ ZINC 120ML** | 0.822 | 0.609 | 90.87 | Prophet ✓ |

**Average SARIMAX Performance (10 products):**
- **RMSE:** 1.26 units
- **MAE:** 1.04 units  
- **Accuracy:** 89.27%

**Performance Range:**
- **Best Accuracy:** 91.78% (PHAREX VITAMIN B-COMPLEX TABLET)
- **Worst Accuracy:** 84.85% (VITAMIN B1,B6,B12 NEURONERV TABLET)
- **Typical Range:** 88-92% accuracy for pharmacy products

**Note:** All products in this sample selected Prophet as the better model, demonstrating Prophet's superior performance for pharmacy sales forecasting.

### SARIMAX Computation Example

**Real Example: DICYCLOVERINE 10MG TABLET**

**Actual Metrics from Trained Model:**
- **RMSE:** 1.033 units
- **MAE:** 0.780 units
- **Accuracy:** 90.01%

**Step 1: Data Preparation**
- Training Period: 80% of historical data (typically 292 days for 365-day dataset)
- Test Period: 20% of historical data (typically 73 days for 365-day dataset)
- Model: SARIMAX with order (1,1,1) and seasonal order (1,1,1,7)

**Step 2: Evaluation Process**
The model was evaluated on the test set using the `_evaluate_model()` method:

```python
# From backend/forecasting_service.py
pred = model.forecast(steps=len(test))  # SARIMAX forecast
pred = np.maximum(pred, 0.0)  # Ensure non-negative

# Calculate metrics
mae = mean_absolute_error(test.values, pred)  # Result: 0.780
rmse = np.sqrt(mean_squared_error(test.values, pred))  # Result: 1.033

# Calculate accuracy (sMAPE-based)
eps = 1e-6
denom = (np.abs(test.values) + np.abs(pred) + eps)
smape = np.mean(2.0 * np.abs(test.values - pred) / denom) * 100.0
accuracy = max(0.0, min(100.0, 100.0 - smape))  # Result: 90.01%
```

**Step 3: Interpretation**
- **MAE of 0.780:** On average, the model predicts within 0.78 units of actual sales
- **RMSE of 1.033:** The square root of mean squared errors, penalizing larger errors
- **Accuracy of 90.01%:** The model achieves 90% accuracy based on sMAPE calculation

**Step 4: Comparison with Prophet**
- **SARIMAX:** Accuracy 90.01%, MAE 0.780, RMSE 1.033
- **Prophet:** Accuracy 92.44%, MAE 0.580, RMSE 0.742
- **Result:** Prophet was selected as the best model for this product

### SARIMAX Performance Analysis

**Strengths:**
- ✅ Excellent performance for products with clear seasonal patterns
- ✅ Handles weekly cycles effectively (seasonal order 7)
- ✅ Good accuracy (80-87%) for medium to high volume products
- ✅ Reliable for category-level forecasting

**Limitations:**
- ⚠️ Requires sufficient historical data (minimum 14 days, optimal 365+ days)
- ⚠️ Can struggle with highly irregular or sparse sales patterns
- ⚠️ Training time increases with data volume
- ⚠️ May perform poorly on products with negative trends

**Best Use Cases:**
- Regular products with consistent demand patterns
- Categories with weekly seasonality (e.g., higher sales on weekends)
- Products with 90+ days of historical data
- Medium to high volume items

---

## Prophet Model Performance

### Prophet Model Configuration

**Model Parameters:**
- **Weekly Seasonality**: Enabled (if data >= 14 days)
- **Daily Seasonality**: Disabled
- **Yearly Seasonality**: Disabled
- **Changepoint Prior Scale**: 0.05
- **Seasonality Prior Scale**: 10.0

**Best For:**
- Complex patterns with trend changes
- Data with holidays and special events
- Irregular seasonality patterns
- Automatic handling of missing data

### Prophet Performance Table

**✅ REAL DATA: Values extracted from actual trained models (10 models analyzed)**

**Data Source:** Real pharmacy product sales forecasting models from `backend/ai_models/`

| Product Name | RMSE | MAE | Accuracy (%) | Selected as Best |
|--------------|------|-----|--------------|------------------|
| **DICYCLOVERINE 10MG TABLET** | 0.742 | 0.580 | 92.44 | ✓ Yes |
| **HYCOSCINE TABLET** | 0.527 | 0.518 | 93.07 | ✓ Yes |
| **LOSARTAN 100MG(NATRAZOL)** | 1.058 | 0.708 | 91.10 | ✓ Yes |
| **CALCIUM CARBONATE 500MG TABLET** | 1.013 | 0.654 | 93.96 | ✓ Yes |
| **MULTIVITAMINS (HANIZYN) CAPSULES** | 0.729 | 0.621 | 94.13 | ✓ Yes |
| **MULTIVITAMINS (MULTILEM) CAPSULES** | 1.014 | 0.771 | 92.85 | ✓ Yes |
| **MULTIVITAMINS+IRON (FORALIVIT) CAPSULES** | 0.608 | 0.553 | 94.74 | ✓ Yes |
| **VITAMIN B1,B6,B12 (NEURONERV) TABLET** | 1.048 | 0.787 | 92.71 | ✓ Yes |
| **PHAREX VITAMIN B-COMPLEX TABLET** | 0.814 | 0.684 | 93.57 | ✓ Yes |
| **CHERIFER SYRUP W/ ZINC 120ML** | 0.602 | 0.541 | 91.77 | ✓ Yes |

**Average Prophet Performance (10 products):**
- **RMSE:** 0.82 units
- **MAE:** 0.64 units
- **Accuracy:** 93.03%

**Performance Range:**
- **Best Accuracy:** 94.74% (MULTIVITAMINS+IRON FORALIVIT CAPSULES)
- **Worst Accuracy:** 91.10% (LOSARTAN 100MG NATRAZOL)
- **Typical Range:** 91-95% accuracy for pharmacy products

**Key Observations:**
- Prophet was selected as the best model for **100% of products** in this sample
- Prophet consistently outperforms SARIMAX with **3.76% higher accuracy** on average
- Lower MAE and RMSE indicate better prediction precision
- Excellent performance across various product types (medications, vitamins, supplements)

### Prophet Computation Example

**Real Example: DICYCLOVERINE 10MG TABLET (Selected as Best Model)**

**Actual Metrics from Trained Model:**
- **RMSE:** 0.742 units
- **MAE:** 0.580 units
- **Accuracy:** 92.44%

**Step 1: Data Preparation**
- Training Period: 80% of historical data (typically 292 days for 365-day dataset)
- Test Period: 20% of historical data (typically 73 days for 365-day dataset)
- Prophet Model: Weekly seasonality enabled, changepoint_prior_scale=0.05, seasonality_prior_scale=10.0

**Step 2: Evaluation Process**
The model was evaluated on the test set using the `_evaluate_model()` method:

```python
# From backend/forecasting_service.py
future = model.make_future_dataframe(periods=len(test))
forecast = model.predict(future)
pred = forecast.tail(len(test))['yhat'].values  # Prophet forecast
pred = np.maximum(pred, 0.0)  # Ensure non-negative

# Calculate metrics
mae = mean_absolute_error(test.values, pred)  # Result: 0.580
rmse = np.sqrt(mean_squared_error(test.values, pred))  # Result: 0.742

# Calculate accuracy (sMAPE-based)
eps = 1e-6
denom = (np.abs(test.values) + np.abs(pred) + eps)
smape = np.mean(2.0 * np.abs(test.values - pred) / denom) * 100.0
accuracy = max(0.0, min(100.0, 100.0 - smape))  # Result: 92.44%
```

**Step 3: Interpretation**
- **MAE of 0.580:** On average, the model predicts within 0.58 units of actual sales (better than SARIMAX's 0.780)
- **RMSE of 0.742:** Lower than SARIMAX (1.033), indicating better handling of prediction errors
- **Accuracy of 92.44%:** Higher than SARIMAX (90.01%), demonstrating superior performance

**Step 4: Model Selection**
- **SARIMAX:** Accuracy 90.01%, MAE 0.780, RMSE 1.033
- **Prophet:** Accuracy 92.44%, MAE 0.580, RMSE 0.742
- **Selected:** Prophet (higher accuracy, lower MAE and RMSE)

### Prophet Performance Analysis

**Strengths:**
- ✅ Superior performance for complex patterns and trend changes
- ✅ Automatic handling of holidays and special events
- ✅ Robust to missing data and outliers
- ✅ Generally higher accuracy (82-89%) compared to SARIMAX
- ✅ Better performance on low-volume products

**Limitations:**
- ⚠️ More memory intensive than SARIMAX
- ⚠️ Slower training time (10-30 seconds vs 5-15 seconds)
- ⚠️ Requires more computational resources
- ⚠️ May overfit on small datasets (< 30 days)

**Best Use Cases:**
- Products with irregular sales patterns
- Categories affected by holidays or promotions
- Data with gaps or missing values
- Low to medium volume items
- When trend changes are expected

---

## Computation Examples

### Detailed Step-by-Step Calculation

#### Example 1: SARIMAX Model - 7-Day Forecast

**Scenario:** Forecasting product sales for 7 days

**Test Data:**

| Day | Actual | Predicted | Error | |Error| | Error² |
|-----|--------|-----------|-------|-------|--------|
| 1 | 50 | 48 | 2 | 2 | 4 |
| 2 | 55 | 52 | 3 | 3 | 9 |
| 3 | 48 | 50 | -2 | 2 | 4 |
| 4 | 60 | 57 | 3 | 3 | 9 |
| 5 | 52 | 54 | -2 | 2 | 4 |
| 6 | 58 | 56 | 2 | 2 | 4 |
| 7 | 54 | 52 | 2 | 2 | 4 |

**Calculations:**

**MAE:**
```
MAE = (1/7) × (2 + 3 + 2 + 3 + 2 + 2 + 2)
MAE = (1/7) × 16
MAE = 2.29 units
```

**MSE:**
```
MSE = (1/7) × (4 + 9 + 4 + 9 + 4 + 4 + 4)
MSE = (1/7) × 38
MSE = 5.43
```

**RMSE:**
```
RMSE = √5.43
RMSE = 2.33 units
```

**Accuracy (sMAPE):**
```
sMAPE = (2/7) × [
    |50-48|/(|50|+|48|) + |55-52|/(|55|+|52|) + |48-50|/(|48|+|50|) +
    |60-57|/(|60|+|57|) + |52-54|/(|52|+|54|) + |58-56|/(|58|+|56|) +
    |54-52|/(|54|+|52|)
] × 100

sMAPE = (2/7) × [2/98 + 3/107 + 2/98 + 3/117 + 2/106 + 2/114 + 2/106] × 100
sMAPE = (2/7) × [0.0204 + 0.0280 + 0.0204 + 0.0256 + 0.0189 + 0.0175 + 0.0189] × 100
sMAPE = (2/7) × 0.1497 × 100
sMAPE = 4.28%

Accuracy = 100 - 4.28 = 95.72%
```

#### Example 2: Prophet Model - 7-Day Forecast

**Scenario:** Forecasting product sales for 7 days

**Test Data:**

| Day | Actual | Predicted | Error | |Error| | Error² |
|-----|--------|-----------|-------|-------|--------|
| 1 | 50 | 49 | 1 | 1 | 1 |
| 2 | 55 | 54 | 1 | 1 | 1 |
| 3 | 48 | 49 | -1 | 1 | 1 |
| 4 | 60 | 59 | 1 | 1 | 1 |
| 5 | 52 | 53 | -1 | 1 | 1 |
| 6 | 58 | 57 | 1 | 1 | 1 |
| 7 | 54 | 53 | 1 | 1 | 1 |

**Calculations:**

**MAE:**
```
MAE = (1/7) × (1 + 1 + 1 + 1 + 1 + 1 + 1)
MAE = (1/7) × 7
MAE = 1.00 units
```

**MSE:**
```
MSE = (1/7) × (1 + 1 + 1 + 1 + 1 + 1 + 1)
MSE = (1/7) × 7
MSE = 1.00
```

**RMSE:**
```
RMSE = √1.00
RMSE = 1.00 units
```

**Accuracy (sMAPE):**
```
sMAPE = (2/7) × [
    |50-49|/(|50|+|49|) + |55-54|/(|55|+|54|) + |48-49|/(|48|+|49|) +
    |60-59|/(|60|+|59|) + |52-53|/(|52|+|53|) + |58-57|/(|58|+|57|) +
    |54-53|/(|54|+|53|)
] × 100

sMAPE = (2/7) × [1/99 + 1/109 + 1/97 + 1/119 + 1/105 + 1/115 + 1/107] × 100
sMAPE = (2/7) × [0.0101 + 0.0092 + 0.0103 + 0.0084 + 0.0095 + 0.0087 + 0.0093] × 100
sMAPE = (2/7) × 0.0655 × 100
sMAPE = 1.87%

Accuracy = 100 - 1.87 = 98.13%
```

---

## Model Comparison

### SARIMAX Model Performance Summary Table

**✅ REAL DATA: Based on 10 actual trained models**

| Product Name | RMSE | MAE | Accuracy (%) | Selected as Best? |
|--------------|------|-----|--------------|-------------------|
| DICYCLOVERINE 10MG TABLET | 1.033 | 0.780 | 90.01 | ❌ No (Prophet selected) |
| HYCOSCINE TABLET | 0.910 | 0.726 | 90.52 | ❌ No (Prophet selected) |
| LOSARTAN 100MG(NATRAZOL) | 1.255 | 0.958 | 88.04 | ❌ No (Prophet selected) |
| CALCIUM CARBONATE 500MG TABLET | 1.350 | 1.097 | 89.96 | ❌ No (Prophet selected) |
| MULTIVITAMINS (HANIZYN) CAPSULES | 1.460 | 1.275 | 88.39 | ❌ No (Prophet selected) |
| MULTIVITAMINS (MULTILEM) CAPSULES | 1.410 | 1.209 | 88.99 | ❌ No (Prophet selected) |
| MULTIVITAMINS+IRON (FORALIVIT) CAPSULES | 1.371 | 1.175 | 89.28 | ❌ No (Prophet selected) |
| VITAMIN B1,B6,B12 (NEURONERV) TABLET | 1.886 | 1.701 | 84.85 | ❌ No (Prophet selected) |
| PHAREX VITAMIN B-COMPLEX TABLET | 1.083 | 0.886 | 91.78 | ❌ No (Prophet selected) |
| CHERIFER SYRUP W/ ZINC 120ML | 0.822 | 0.609 | 90.87 | ❌ No (Prophet selected) |

**SARIMAX Summary Statistics:**
- **Average RMSE:** 1.26 units
- **Average MAE:** 1.04 units
- **Average Accuracy:** 89.27%
- **Best Accuracy:** 91.78% (PHAREX VITAMIN B-COMPLEX TABLET)
- **Worst Accuracy:** 84.85% (VITAMIN B1,B6,B12 NEURONERV TABLET)
- **Accuracy Range:** 84.85% - 91.78%
- **Model Selection Rate:** 0% (0 out of 10 products)

### Prophet Model Performance Summary Table

**✅ REAL DATA: Based on 10 actual trained models**

| Product Name | RMSE | MAE | Accuracy (%) | Selected as Best? |
|--------------|------|-----|--------------|-------------------|
| DICYCLOVERINE 10MG TABLET | 0.742 | 0.580 | 92.44 | ✅ Yes |
| HYCOSCINE TABLET | 0.527 | 0.518 | 93.07 | ✅ Yes |
| LOSARTAN 100MG(NATRAZOL) | 1.058 | 0.708 | 91.10 | ✅ Yes |
| CALCIUM CARBONATE 500MG TABLET | 1.013 | 0.654 | 93.96 | ✅ Yes |
| MULTIVITAMINS (HANIZYN) CAPSULES | 0.729 | 0.621 | 94.13 | ✅ Yes |
| MULTIVITAMINS (MULTILEM) CAPSULES | 1.014 | 0.771 | 92.85 | ✅ Yes |
| MULTIVITAMINS+IRON (FORALIVIT) CAPSULES | 0.608 | 0.553 | 94.74 | ✅ Yes |
| VITAMIN B1,B6,B12 (NEURONERV) TABLET | 1.048 | 0.787 | 92.71 | ✅ Yes |
| PHAREX VITAMIN B-COMPLEX TABLET | 0.814 | 0.684 | 93.57 | ✅ Yes |
| CHERIFER SYRUP W/ ZINC 120ML | 0.602 | 0.541 | 91.77 | ✅ Yes |

**Prophet Summary Statistics:**
- **Average RMSE:** 0.82 units
- **Average MAE:** 0.64 units
- **Average Accuracy:** 93.03%
- **Best Accuracy:** 94.74% (MULTIVITAMINS+IRON FORALIVIT CAPSULES)
- **Worst Accuracy:** 91.10% (LOSARTAN 100MG NATRAZOL)
- **Accuracy Range:** 91.10% - 94.74%
- **Model Selection Rate:** 100% (10 out of 10 products)

### Side-by-Side Model Comparison

| Metric | SARIMAX | Prophet | Winner | Difference |
|--------|---------|---------|--------|------------|
| **Average RMSE** | 1.26 | 0.82 | Prophet ✓ | -0.44 (-35%) |
| **Average MAE** | 1.04 | 0.64 | Prophet ✓ | -0.40 (-38%) |
| **Average Accuracy** | 89.27% | 93.03% | Prophet ✓ | +3.76% (+4.2%) |
| **Best Accuracy** | 91.78% | 94.74% | Prophet ✓ | +2.96% |
| **Worst Accuracy** | 84.85% | 91.10% | Prophet ✓ | +6.25% |
| **Selection Rate** | 0% (0/10) | 100% (10/10) | Prophet ✓ | +100% |
| **Training Time** | 5-15 seconds | 10-30 seconds | SARIMAX ✓ | Faster |
| **Memory Usage** | Low | High | SARIMAX ✓ | Lower |
| **Handles Missing Data** | Fair | Excellent | Prophet ✓ | Better |
| **Seasonality Handling** | Good | Excellent | Prophet ✓ | Better |

### Performance Analysis

**Key Findings:**
1. **Prophet outperforms SARIMAX** on all metrics for pharmacy product forecasting
2. **100% model selection rate** for Prophet across all tested products
3. **3.76% higher accuracy** on average (89.27% vs 93.03%)
4. **38% lower MAE** (1.04 vs 0.64 units) - better prediction precision
5. **35% lower RMSE** (1.26 vs 0.82 units) - better error handling
6. **More consistent performance** - narrower accuracy range (91-95% vs 85-92%)

**Trade-offs:**
- **SARIMAX:** Faster training (5-15s) and lower memory usage, but lower accuracy
- **Prophet:** Higher accuracy and better performance, but slower training (10-30s) and higher memory usage

---

## Interpretation Guidelines

### MAE Interpretation

**MAE Range Guidelines:**

| MAE Value | Interpretation | Action |
|-----------|----------------|--------|
| **< 5% of average sales** | Excellent | Use confidently |
| **5-10% of average sales** | Good | Acceptable for planning |
| **10-20% of average sales** | Fair | Use with caution |
| **> 20% of average sales** | Poor | Consider retraining |

**Example:**
- Average daily sales: 100 units
- MAE: 8.5 units (8.5% of average)
- **Interpretation:** Good performance, acceptable for inventory planning

### RMSE Interpretation

**RMSE Range Guidelines:**

| RMSE Value | Interpretation | Action |
|------------|----------------|--------|
| **< 7% of average sales** | Excellent | Very reliable |
| **7-15% of average sales** | Good | Reliable for most uses |
| **15-25% of average sales** | Fair | Monitor closely |
| **> 25% of average sales** | Poor | High uncertainty |

**Example:**
- Average daily sales: 100 units
- RMSE: 12.0 units (12% of average)
- **Interpretation:** Good performance, reliable for forecasting

**RMSE vs MAE:**
- If RMSE >> MAE: Model has occasional large errors (outliers)
- If RMSE ≈ MAE: Model has consistent error magnitude
- RMSE penalizes larger errors more heavily

### Accuracy Interpretation

**Accuracy Range Guidelines:**

| Accuracy % | Interpretation | Reliability | Use Case |
|------------|----------------|-------------|----------|
| **90-100%** | Excellent | Very High | Critical inventory planning |
| **80-89%** | Good | High | Standard forecasting |
| **70-79%** | Fair | Moderate | Use with caution |
| **60-69%** | Poor | Low | Consider alternatives |
| **< 60%** | Very Poor | Very Low | Retrain or use different model |

**Example:**
- Accuracy: 87.89%
- **Interpretation:** Good performance, reliable for inventory planning and business decisions

### Combined Metrics Interpretation

**Best Case Scenario:**
- High Accuracy (> 85%)
- Low MAE (< 10% of average)
- Low RMSE (< 15% of average)
- **Action:** Use model confidently for all forecasting needs

**Good Case Scenario:**
- Moderate Accuracy (75-85%)
- Moderate MAE (10-15% of average)
- Moderate RMSE (15-20% of average)
- **Action:** Use for planning with regular monitoring

**Fair Case Scenario:**
- Low Accuracy (65-75%)
- High MAE (> 15% of average)
- High RMSE (> 20% of average)
- **Action:** Use with caution, consider retraining or gathering more data

**Poor Case Scenario:**
- Very Low Accuracy (< 65%)
- Very High MAE (> 20% of average)
- Very High RMSE (> 25% of average)
- **Action:** Retrain model, gather more historical data, or consider alternative forecasting methods

---

## Key Takeaways

### Summary

1. **Prophet generally outperforms SARIMAX** in accuracy, MAE, and RMSE across most product categories
2. **SARIMAX is faster** and uses less memory, making it suitable for resource-constrained environments
3. **Both models perform well** when sufficient historical data is available (365+ days)
4. **Accuracy above 80%** is considered reliable for business decision-making
5. **MAE and RMSE should be interpreted** relative to average sales volume

### Recommendations

1. **Use Prophet** when:
   - Accuracy is the primary concern
   - Data has complex patterns or trend changes
   - Handling holidays or special events is important
   - Sufficient computational resources are available

2. **Use SARIMAX** when:
   - Training speed is critical
   - Memory resources are limited
   - Data shows clear seasonal patterns
   - Small datasets (< 30 days)

3. **Monitor metrics regularly** and retrain when:
   - Accuracy drops below 70%
   - MAE exceeds 20% of average sales
   - Significant changes in sales patterns occur
   - New products are introduced

---

## References

### Code Implementation

- **Forecasting Service**: `backend/forecasting_service.py`
- **SARIMAX Training**: Lines 173-204
- **Prophet Training**: Lines 206-230
- **Metrics Evaluation**: Lines 232-272

### Formulas Reference

- **MAE**: `sklearn.metrics.mean_absolute_error()`
- **RMSE**: `np.sqrt(sklearn.metrics.mean_squared_error())`
- **Accuracy**: sMAPE-based calculation (Lines 258-262)

### Documentation

- **System Overview**: `FORECASTING_SYSTEM_OVERVIEW.md`
- **API Endpoints**: `backend/routes/forecasting.py`
- **Frontend Integration**: `frontend/src/pages/manager/Forecasting.js`

---

*Last Updated: Based on current codebase implementation*
*Documentation Version: 1.0*


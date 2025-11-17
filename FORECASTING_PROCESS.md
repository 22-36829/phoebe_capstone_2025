## Forecasting Process Overview

### 1. Data & Features
- Pulls product, category, model, and accuracy payloads via `ManagerAPI` endpoints, pairing them with historical series from `getHistoricalSeries`.
- Captures core signals (avg daily demand, unit price/cost, profit per unit) plus derived metrics (revenue, profit, demand bands) using deterministic fallbacks so UI stays populated when real data is sparse.
- Maintains `recentSalesData` and `recentPerformance` caches to chart actual vs predicted performance windows for each product.

### 2. Model Selection & Rationale
- Back end trains SARIMAX, Prophet, and Exponential Smoothing variants; responses include comparative metrics.
- Front end chooses the best-performing model per target through `selectBestModelType`, prioritizing highest accuracy and lowest MAE before rendering charts and KPIs.

### 3. Advantages
- Deterministic synthetic series eliminate blank charts, keeping interactions smooth while real data loads.
- `modelLookup` persists accuracy/MAE/RMSE metadata so retrains immediately reflect in lists, search, and detail panes.
- Category analysis surfaces profit/demand outliers without extra API round trips, enabling rapid interventions.

### 4. Data Preprocessing
- Normalizes timestamps to day boundaries (`normalizeDate`) and converts ISO strings locally to avoid TZ drift.
- Generates smoothed series (`generateSalesForecastData`) with weekday/seasonality adjustments and caches them per target/timeframe.
- Computes profit margins, demand levels, and aggregated category rollups for analytics tabs.

### 5. Model Development Flow
1. Fetch model metadata and historical series for the selected product.
2. Request fresh forecasts (`ManagerAPI.getForecasts`) with requested horizon/type.
3. Merge returned metrics/confidence bands into `modelLookup`, `products`, and chart datasets.
4. Update recent performance cache and recompute MAPE to monitor drift.

### 6. Data Split & Cross-Validation
- Splitting/validation happens server-side; the client consumes aggregated metrics (`accuracy`, `mae`, `rmse`) for visibility.
- Category modal highlights aggregate behavior so humans can sanity-check model applicability per segment.

### 7. Overfitting / Regularization / Generalization
- `checkModelPerformance` auto-prompts retraining when accuracy falls below 50% or models are missing.
- Bulk retrain workflow refreshes the top 50 products, preventing stale weights.
- Confidence intervals and ongoing MAPE tracking expose poor generalization quickly.

### 8. Intervention Guidance
- Category filters (high demand, at-risk, low profit) highlight where to focus operational changes.
- Analyzer modal produces timeframe-specific recommendations (inventory, staffing, marketing) based on sales trends and profit signals.

### 9. Validation & Evaluation
- Every forecast displays accuracy, MAE, RMSE, and MAPE, plus latest actual vs predicted deltas.
- Confidence bands and tooltip revenue/profit projections provide a reality check for planners.

### 10. Metrics & Interpretation
- Accuracy/MAPE chips are color-coded (green/yellow/red) for instant health assessment.
- Profit and demand badges in category tables signal which groups drive performance or need attention.
- Tooltips convert unit forecasts to revenue/profit so planners can interpret impact faster.

### 11. Model Comparison
- Dedicated modal lists SARIMAX/Prophet/etc metrics, sorted by accuracy, with training timestamps.
- Flags missing Prophet results to encourage retraining and ensures stakeholders can justify the active model choice.



import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { 
  Target, BarChart3, RefreshCw, AlertCircle, X
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ManagerAPI } from '../../services/api';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ArcElement
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import zoomPlugin from 'chartjs-plugin-zoom';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ArcElement,
  zoomPlugin
);

const MS_IN_DAY = 24 * 60 * 60 * 1000;

const normalizeDate = (value) => {
  const date = value instanceof Date ? new Date(value) : new Date(value || Date.now());
  date.setHours(0, 0, 0, 0);
  return date;
};

const addDays = (date, days) => {
  const base = date instanceof Date ? new Date(date) : new Date(date || Date.now());
  base.setDate(base.getDate() + days);
  return base;
};

const deterministicRandom = (seedInput = 1) => {
  let seed = Math.abs(Math.floor(seedInput)) % 2147483647;
  if (seed === 0) seed = 2147483646;
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
};

const getLatestNov8 = (referenceDate = new Date()) => {
  const date = referenceDate instanceof Date ? new Date(referenceDate) : new Date(referenceDate || Date.now());
  const year = date.getMonth() >= 10 ? date.getFullYear() : date.getFullYear() - 1;
  return new Date(year, 10, 8);
};

const parseLocalISODate = (s) => {
  if (!s || typeof s !== 'string') return new Date(s);
  const parts = s.split('-');
  if (parts.length !== 3) return new Date(s);
  const y = Number(parts[0]);
  const m = Number(parts[1]) - 1;
  const d = Number(parts[2]);
  return new Date(y, m, d);
};

const Forecasting = () => {
  const { token } = useAuth();
  // eslint-disable-next-line no-unused-vars
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Data states
  const [products, setProducts] = useState([]);
  const [fullProductList, setFullProductList] = useState([]);
  const [categories, setCategories] = useState([]);
  const [models, setModels] = useState([]);
  const [modelLookup, setModelLookup] = useState({});
  const [accuracy, setAccuracy] = useState(null);
  const [forecasts, setForecasts] = useState(null); // { values: number[], dates: string[], accuracy?: number, confidence?: number[][] }
  
  // UI states
  const [selectedType] = useState('product'); // product only
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [forecastDays] = useState(30);
  const [forecastType] = useState('daily');
  const [training, setTraining] = useState(false);
  const [trainingProgress, setTrainingProgress] = useState(0);
  const [showTrainConfirm, setShowTrainConfirm] = useState(false);
  const [trainPassword, setTrainPassword] = useState('');
  const [trainPasswordError, setTrainPasswordError] = useState('');
  const [bulkTraining, setBulkTraining] = useState(false);
  const [bulkTrainingStatus, setBulkTrainingStatus] = useState({ completed: 0, total: 0, currentName: '' });
  const [showBulkTrainConfirm, setShowBulkTrainConfirm] = useState(false);
  const [bulkTrainPassword, setBulkTrainPassword] = useState('');
  const [bulkTrainPasswordError, setBulkTrainPasswordError] = useState('');
  const [bulkTrainingProgress, setBulkTrainingProgress] = useState(0);
  
  // Bulk forecasting states
  const [, setBulkForecasting] = useState(false);
  // eslint-disable-next-line no-unused-vars
  const [selectedProducts] = useState([]);
  // eslint-disable-next-line no-unused-vars
  const [selectedCategories] = useState([]);
  const [bulkResults, setBulkResults] = useState(null);
  const [showBulkResults, setShowBulkResults] = useState(false);
  const [showAnalyzer, setShowAnalyzer] = useState(false);
  const [analysisData, setAnalysisData] = useState(null);
  
  // Category analysis state
  const [showCategoryAnalysis, setShowCategoryAnalysis] = useState(false);
  const [categoryModalTab, setCategoryModalTab] = useState('overview');
  const [categorySearchTerm, setCategorySearchTerm] = useState('');
  const [categoryFilterMode, setCategoryFilterMode] = useState('all');
  const [categoryDetailSelection, setCategoryDetailSelection] = useState(null);
  
  // Filter states
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sortBy] = useState('name'); // name, sales, accuracy
  
  // Auto-forecast states
  const [autoForecast] = useState(true);
  const [forecastInterval] = useState(30000); // 30 seconds
  
  // Advanced chart states
  const [timeframe] = useState('1D'); // 1H, 4H, 1D, 7D, 1M, 3M, 1Y
  
  // Chart refs
  const chartRef = useRef(null);
  
  // Request guards to prevent infinite loops
  const forecastRequestRef = useRef(false);
  const accuracyRequestRef = useRef(false);
  const lastForecastTargetRef = useRef(null);
  const lastAccuracyTargetRef = useRef(null);
  const currentTargetIdRef = useRef(null);
  const lastForecastTimeRef = useRef(0);
  const lastAccuracyTimeRef = useRef(0);
  
  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Fullscreen functions
  const closeFullscreen = () => {
    setIsFullscreen(false);
  };
  
  // Chart data states
  // eslint-disable-next-line no-unused-vars
  const [, setChartData] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [, setVolumeData] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [, setForecastData] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [, setTechnicalData] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [, setCurrentPrice] = useState(0);
  // eslint-disable-next-line no-unused-vars
  const [, setPriceChange] = useState(0);
  const [productSearch, setProductSearch] = useState('');
  // Cache for synthetic (generated) time series to ensure determinism across re-renders
  const [syntheticCache, setSyntheticCache] = useState({});
  const [recentSalesData, setRecentSalesData] = useState({});
  const [recentPerformance, setRecentPerformance] = useState({});

  const generateDummyRecentSalesSeries = useCallback((target) => {
    if (!target) return [];
    const today = normalizeDate(new Date());
    const startDate = getLatestNov8(today);
    const days = Math.max(1, Math.floor((today.getTime() - startDate.getTime()) / MS_IN_DAY) + 1);
    const avgSales = Math.max(1, Number(target.avg_daily_sales) || 5);
    const unitPrice = Number(target.unit_price || 0) || 50;
    const costPrice = Number(target.cost_price || 0) || Math.max(unitPrice * 0.6, 1);
    const profitPerUnit = unitPrice - costPrice;
    const rand = deterministicRandom(Number(target.id) || Math.round(avgSales * 17));
    const series = [];
    for (let i = 0; i < days; i++) {
      const date = addDays(startDate, i);
      const weeklySeasonality = 0.08 * Math.sin((i % 7) / 7 * Math.PI * 2);
      const randomNoise = (rand() - 0.5) * 0.25;
      const growthTrend = 1 + (i / days) * 0.03;
      const sales = Math.max(0, Math.round(avgSales * (1 + weeklySeasonality + randomNoise) * growthTrend));
      const revenue = sales * unitPrice;
      const profit = sales * profitPerUnit;
      series.push({
        date,
        timestamp: date.getTime(),
        sales,
        revenue: Math.round(revenue * 100) / 100,
        profit: Math.round(profit * 100) / 100,
        unitPrice,
        unitCost: costPrice,
        profitMargin: revenue > 0 ? Math.round((profit / revenue) * 10000) / 100 : 0
      });
    }
    return series;
  }, []);

  const computeMape = useCallback((actualVals = [], predictedVals = []) => {
    const upper = Math.min(actualVals.length, predictedVals.length);
    if (upper === 0) return null;
    let aggregate = 0;
    let count = 0;
    for (let i = 0; i < upper; i++) {
      const actual = Number(actualVals[i]);
      const predicted = Number(predictedVals[i]);
      if (!Number.isFinite(actual) || !Number.isFinite(predicted) || actual === 0) continue;
      aggregate += Math.abs((actual - predicted) / actual);
      count++;
    }
    if (!count) return null;
    return (aggregate / count) * 100;
  }, []);

  const updateRecentPerformance = useCallback((target, forecastPayload) => {
    if (!target) return;
    const targetId = Number(target.id);
    if (Number.isNaN(targetId)) return;
    const actualSeries = recentSalesData[targetId];
    if (!Array.isArray(actualSeries) || actualSeries.length === 0) return;

    const valuesSource = Array.isArray(forecastPayload?.values)
      ? forecastPayload.values
      : Array.isArray(forecastPayload?.forecasts)
        ? forecastPayload.forecasts
        : Array.isArray(forecastPayload?.forecast?.values)
          ? forecastPayload.forecast.values
          : [];
    const forecastValues = valuesSource.map(Number).filter(v => Number.isFinite(v));
    if (forecastValues.length === 0) return;

    const rawDates = Array.isArray(forecastPayload?.dates)
      ? forecastPayload.dates.map(parseLocalISODate)
      : Array.isArray(forecastPayload?.forecast?.dates)
        ? forecastPayload.forecast.dates.map(parseLocalISODate)
        : null;

    const comparisonWindow = Math.min(actualSeries.length, forecastValues.length);
    const actualComparison = actualSeries.slice(-comparisonWindow);
    const comparisonEntries = actualComparison.map((point, idx) => ({
      date: point.date,
      actual: point.sales,
      predicted: Number(forecastValues[idx] ?? 0)
    }));
    const mapeValue = computeMape(
      actualComparison.map(point => point.sales),
      comparisonEntries.map(entry => entry.predicted)
    );

    const futureEntries = [];
    if (forecastValues.length > comparisonWindow) {
      const lastActualDate = actualSeries[actualSeries.length - 1]?.date || new Date();
      for (let i = comparisonWindow; i < forecastValues.length; i++) {
        const baseDate = rawDates && rawDates[i] instanceof Date
          ? rawDates[i]
          : addDays(lastActualDate, i - comparisonWindow + 1);
        futureEntries.push({
          date: baseDate,
          predicted: Number(forecastValues[i] ?? 0)
        });
      }
    }

    setRecentPerformance(prev => ({
      ...prev,
      [targetId]: {
        comparison: comparisonEntries,
        future: futureEntries,
        mape: typeof mapeValue === 'number' ? mapeValue : null
      }
    }));
  }, [recentSalesData, computeMape]);

  const computeTargetMetrics = useCallback((target) => {
    const dailySales = Number(target.avg_daily_sales || 0);
    const unitPrice = Number(target.unit_price || 0);
    const costPrice = Number(target.cost_price || 0);
    let timeframeMultiplier = 1;
    switch (timeframe) {
      case '1H': timeframeMultiplier = 1 / 24; break;
      case '4H': timeframeMultiplier = 4 / 24; break;
      case '1D': timeframeMultiplier = 1; break;
      case '7D': timeframeMultiplier = 7; break;
      case '1M': timeframeMultiplier = 30; break;
      case '3M': timeframeMultiplier = 90; break;
      case '1Y': timeframeMultiplier = 365; break;
      default: timeframeMultiplier = 1;
    }
    const avgSales = dailySales * timeframeMultiplier;
    const avgRevenue = avgSales * unitPrice;
    const avgProfit = avgSales * (unitPrice - costPrice);
    return { avgSales, avgRevenue, avgProfit };
  }, [timeframe]);

  const getAvailableTargets = useCallback(() => {
    let targets = products;
    const enriched = targets.map(t => {
      const m = computeTargetMetrics(t);
      return { ...t, _metrics: m };
    });
    let filtered = enriched;
    if (categoryFilter && categoryFilter !== '') {
      filtered = filtered.filter(target =>
        (target.category_name || '').toLowerCase() === categoryFilter.toLowerCase()
      );
    }
    if (productSearch.trim()) {
      const query = productSearch.toLowerCase();
      filtered = filtered.filter(target => {
        const name = (target.name || '').toLowerCase();
        const generic = (target.generic_name || '').toLowerCase();
        const category = (target.category_name || '').toLowerCase();
        return name.includes(query) || generic.includes(query) || category.includes(query);
      });
    }
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'sales':
          return (b._metrics?.avgSales || 0) - (a._metrics?.avgSales || 0);
        case 'revenue':
          return (b._metrics?.avgRevenue || 0) - (a._metrics?.avgRevenue || 0);
        case 'profit':
          return (b._metrics?.avgProfit || 0) - (a._metrics?.avgProfit || 0);
        case 'accuracy':
          return (Number(b.accuracy_percentage) || 0) - (Number(a.accuracy_percentage) || 0);
        case 'name':
        default:
          return (a.name || '').localeCompare(b.name || '');
      }
    });
    return filtered;
  }, [products, computeTargetMetrics, categoryFilter, productSearch, sortBy]);

  const productSourceList = useMemo(() => {
    if (Array.isArray(fullProductList) && fullProductList.length > 0) {
      return fullProductList;
    }
    return Array.isArray(products) ? products : [];
  }, [fullProductList, products]);

  const categoryPerformance = useMemo(() => {
    if (!Array.isArray(productSourceList) || productSourceList.length === 0) {
      return [];
    }
    const categoryMap = new Map();
    const categoryNameToId = new Map();
    if (Array.isArray(categories)) {
      categories.forEach(cat => {
        if (cat?.name) {
          categoryNameToId.set(cat.name, cat.id);
        }
      });
    }
    productSourceList.forEach(product => {
      if (!product) return;
      const categoryName = product.category_name || 'Uncategorized';
      if (!categoryMap.has(categoryName)) {
        categoryMap.set(categoryName, {
          id: categoryNameToId.get(categoryName) || `cat-${categoryName}`,
          name: categoryName,
          productCount: 0,
          totalSales: 0,
          totalRevenue: 0,
          totalProfit: 0,
          products: []
        });
      }
      const entry = categoryMap.get(categoryName);
      const dailySales = Number(product.avg_daily_sales) || 0;
      const unitPrice = Number(product.unit_price) || 0;
      const costPrice = Number(product.cost_price) || 0;
      const revenue = dailySales * unitPrice;
      const profit = dailySales * (unitPrice - costPrice);
      entry.productCount += 1;
      entry.totalSales += dailySales;
      entry.totalRevenue += revenue;
      entry.totalProfit += profit;
      entry.products.push({
        id: product.id,
        name: product.name,
        dailySales,
        revenue,
        profit,
        profitMargin: unitPrice > 0 ? ((unitPrice - costPrice) / unitPrice) * 100 : 0,
        unitPrice,
        unitCost: costPrice
      });
    });
    const mapped = Array.from(categoryMap.values()).map(entry => {
      const profitMargin = entry.totalRevenue > 0 ? (entry.totalProfit / entry.totalRevenue) * 100 : 0;
      const avgSales = entry.productCount > 0 ? entry.totalSales / entry.productCount : 0;
      return {
        ...entry,
        avgSales,
        profitMargin,
        demandLevel: avgSales >= 15 ? 'High' : avgSales >= 8 ? 'Medium' : 'Low',
        profitHealth: profitMargin >= 30 ? 'High' : profitMargin >= 15 ? 'Medium' : 'Low',
        topProducts: entry.products.sort((a, b) => b.profit - a.profit).slice(0, 5)
      };
    });
    mapped.sort((a, b) => b.totalProfit - a.totalProfit);
    return mapped;
  }, [productSourceList, categories]);

  const filteredCategoryPerformance = useMemo(() => {
    if (!categoryPerformance.length) return [];
    let list = categoryPerformance;
    if (categorySearchTerm.trim()) {
      const query = categorySearchTerm.trim().toLowerCase();
      list = list.filter(cat => cat.name.toLowerCase().includes(query));
    }
    switch (categoryFilterMode) {
      case 'highDemand':
        list = list.filter(cat => cat.demandLevel === 'High');
        break;
      case 'lowDemand':
        list = list.filter(cat => cat.demandLevel === 'Low');
        break;
      case 'highProfit':
        list = list.filter(cat => cat.profitHealth === 'High');
        break;
      case 'lowProfit':
        list = list.filter(cat => cat.profitHealth === 'Low');
        break;
      case 'atRisk':
        list = list.filter(cat => cat.demandLevel === 'Low' || cat.profitHealth === 'Low');
        break;
      default:
        break;
    }
    return list;
  }, [categoryPerformance, categorySearchTerm, categoryFilterMode]);

  const selectedCategoryDetail = useMemo(() => {
    if (!filteredCategoryPerformance.length) return null;
    if (categoryDetailSelection) {
      const match = filteredCategoryPerformance.find(cat => cat.name === categoryDetailSelection);
      if (match) return match;
    }
    return filteredCategoryPerformance[0];
  }, [filteredCategoryPerformance, categoryDetailSelection]);

  const categorySummary = useMemo(() => {
    if (!categoryPerformance.length) {
      return {
        totalRevenue: 0,
        totalProfit: 0,
        avgMargin: 0,
        totalCategories: 0,
        totalProducts: productSourceList.length
      };
    }
    const totalRevenue = categoryPerformance.reduce((sum, cat) => sum + cat.totalRevenue, 0);
    const totalProfit = categoryPerformance.reduce((sum, cat) => sum + cat.totalProfit, 0);
    const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    return {
      totalRevenue,
      totalProfit,
      avgMargin,
      totalCategories: categoryPerformance.length,
      totalProducts: productSourceList.length
    };
  }, [categoryPerformance, productSourceList.length]);

  const topProfitCategories = useMemo(() => {
    if (!categoryPerformance.length) return [];
    return categoryPerformance.slice(0, 3);
  }, [categoryPerformance]);

  const topDemandCategories = useMemo(() => {
    if (!categoryPerformance.length) return [];
    const sorted = [...categoryPerformance].sort((a, b) => b.totalSales - a.totalSales);
    return sorted.slice(0, 3);
  }, [categoryPerformance]);

  const [showModelCompare, setShowModelCompare] = useState(false);
  

  // Historical true series cache: key = `${type}:${id}:${timeframe}` -> [{date, quantity}]
  const [historicalCache, setHistoricalCache] = useState({});
  // eslint-disable-next-line no-unused-vars
  const [, setHistoricalLoading] = useState(false);

  const historicalKey = useCallback((target, tf) => {
    if (!target) return '';
    return `${selectedType}:${target.id}:${tf}`;
  }, [selectedType]);

  const selectBestModelType = useCallback((comparison, fallbackType) => {
    if (comparison && typeof comparison === 'object') {
      const entries = Object.entries(comparison).filter(([, metrics]) => metrics && typeof metrics === 'object');
      if (entries.length > 0) {
        entries.sort((a, b) => {
          const accA = Number(a?.[1]?.accuracy ?? 0);
          const accB = Number(b?.[1]?.accuracy ?? 0);
          if (accB !== accA) return accB - accA;
          const maeA = Number.isFinite(Number(a?.[1]?.mae)) ? Number(a?.[1]?.mae) : Number.POSITIVE_INFINITY;
          const maeB = Number.isFinite(Number(b?.[1]?.mae)) ? Number(b?.[1]?.mae) : Number.POSITIVE_INFINITY;
          if (maeA !== maeB) return maeA - maeB;
          return 0;
        });
        return entries[0][0];
      }
    }
    return fallbackType;
  }, []);

  const getModelMetrics = useCallback((comparison, modelKey) => {
    if (!comparison || typeof comparison !== 'object' || !modelKey) return null;
    const metrics = comparison[modelKey];
    if (!metrics || typeof metrics !== 'object') return null;
    return {
      accuracy: typeof metrics.accuracy === 'number' ? metrics.accuracy : Number(metrics.accuracy) || 0,
      mae: typeof metrics.mae === 'number' ? metrics.mae : Number(metrics.mae),
      rmse: typeof metrics.rmse === 'number' ? metrics.rmse : Number(metrics.rmse)
    };
  }, []);

  const selectedModelMeta = useMemo(() => {
    if (!selectedTarget) return null;
    const targetId = Number(selectedTarget.id);
    if (Number.isNaN(targetId)) return null;

    const base = modelLookup[targetId];
    const comparisonSource = (forecasts?.comparison && typeof forecasts.comparison === 'object')
      ? forecasts.comparison
      : (base?.comparison && typeof base.comparison === 'object')
        ? base.comparison
        : null;
    const bestModelType = selectBestModelType(comparisonSource, forecasts?.model_type || base?.model_type);
    const metrics = getModelMetrics(
      comparisonSource || {},
      bestModelType || forecasts?.model_type || base?.model_type
    );

    const accuracyValue = forecasts && typeof forecasts.accuracy === 'number'
      ? forecasts.accuracy
      : metrics?.accuracy ?? base?.accuracy_percentage;
    const maeValue = forecasts && typeof forecasts.mae === 'number'
      ? forecasts.mae
      : metrics?.mae ?? base?.mae;
    const rmseValue = forecasts && typeof forecasts.rmse === 'number'
      ? forecasts.rmse
      : metrics?.rmse ?? base?.rmse;

    return {
      ...(base || {}),
      target_id: targetId,
      target_name: base?.target_name || selectedTarget.name,
      model_type: bestModelType || forecasts?.model_type || base?.model_type || null,
      accuracy_percentage: accuracyValue,
      mae: maeValue,
      rmse: rmseValue,
      trained_at: forecasts?.trained_at || base?.trained_at || null,
      comparison: (comparisonSource && typeof comparisonSource === 'object') ? comparisonSource : {}
    };
  }, [selectedTarget, modelLookup, forecasts, selectBestModelType, getModelMetrics]);

  const currentPerformance = useMemo(() => {
    if (!selectedTarget) return null;
    const targetId = Number(selectedTarget.id);
    if (Number.isNaN(targetId)) return null;
    return recentPerformance[targetId] || null;
  }, [selectedTarget, recentPerformance]);

  const currentActualSeries = useMemo(() => {
    if (!selectedTarget) return [];
    const targetId = Number(selectedTarget.id);
    if (Number.isNaN(targetId)) return [];
    return recentSalesData[targetId] || [];
  }, [selectedTarget, recentSalesData]);

  const actualLookup = useMemo(() => {
    const map = new Map();
    currentActualSeries.forEach(point => {
      map.set(normalizeDate(point.date).getTime(), point);
    });
    return map;
  }, [currentActualSeries]);

  const predictedLookup = useMemo(() => {
    const map = new Map();
    if (currentPerformance) {
      (currentPerformance.comparison || []).forEach(entry => {
        map.set(normalizeDate(entry.date).getTime(), entry.predicted);
      });
      (currentPerformance.future || []).forEach(entry => {
        map.set(normalizeDate(entry.date).getTime(), entry.predicted);
      });
    }
    return map;
  }, [currentPerformance]);

  const getModelDisplayName = useCallback((type) => {
    if (!type) return 'Not trained';
    const key = String(type).toLowerCase();
    if (key === 'sarimax' || key === 'sarima') return 'SARIMAX';
    if (key === 'prophet') return 'Prophet';
    if (key === 'exponential') return 'Exp Smooth';
    return key.toUpperCase();
  }, []);

  const formatTimestamp = useCallback((value) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }, []);

  const formatCurrency = useCallback((value = 0) => {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount)) return '₱0.00';
    return amount.toLocaleString(undefined, {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }, []);

  const formatNumber = useCallback((value = 0, digits = 0) => {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount)) return '0';
    return amount.toLocaleString(undefined, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  }, []);

  const fetchHistorical = useCallback(async (target, tf) => {
    if (!target || !token) return;
    const key = historicalKey(target, tf);
    if (historicalCache[key]) return; // already cached
    try {
      setHistoricalLoading(true);
      const res = await ManagerAPI.getHistoricalSeries({
        model_type: selectedType,
        target_id: target.id,
        timeframe: tf
      }, token);
      if (res && res.success) {
        setHistoricalCache(prev => ({ ...prev, [key]: res.data || [] }));
      }
    } catch (e) {
      // Non-fatal: fall back to generated data
    } finally {
      setHistoricalLoading(false);
    }
  }, [token, selectedType, historicalCache, historicalKey]);

  // When timeframe changes, force a refresh by clearing the cached entry for the current target+tf
  useEffect(() => {
    if (!selectedTarget) return;
    const key = historicalKey(selectedTarget, timeframe);
    setHistoricalCache(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    fetchHistorical(selectedTarget, timeframe);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeframe]);

  // Load initial data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      
      const [productsRes, categoriesRes, modelsRes, accuracyRes] = await Promise.all([
        ManagerAPI.getForecastableProducts(token),
        ManagerAPI.getForecastableCategories(token),
        ManagerAPI.getForecastingModels(token),
        ManagerAPI.getForecastingAccuracy(token)
      ]);
      
      const productsList = productsRes?.success && Array.isArray(productsRes?.products)
        ? productsRes.products
        : [];
      const categoriesList = categoriesRes?.success && Array.isArray(categoriesRes?.categories)
        ? categoriesRes.categories
        : [];
      const modelsList = modelsRes?.success && Array.isArray(modelsRes?.models)
        ? modelsRes.models
        : [];
      const accuracyPayload = accuracyRes?.success ? accuracyRes : null;

      const nextLookup = modelsList.reduce((acc, model) => {
        const targetId = Number(model?.target_id);
        if (!Number.isNaN(targetId)) {
          acc[targetId] = {
            ...model,
            target_id: targetId,
            accuracy_percentage: typeof model?.accuracy_percentage === 'number'
              ? model.accuracy_percentage
              : Number(model?.accuracy_percentage) || 0,
            comparison: model?.comparison && typeof model.comparison === 'object' ? model.comparison : {}
          };
        }
        return acc;
      }, {});

      const mergedProducts = productsList.map(product => {
        const pid = Number(product?.id);
        const trained = !Number.isNaN(pid) ? nextLookup[pid] : undefined;
        const accuracyValue = trained?.accuracy_percentage ?? (Number(product?.accuracy_percentage) || 0);
        return {
          ...product,
          accuracy_percentage: accuracyValue,
          _model: trained || null
        };
      });

      const displayProducts = mergedProducts.slice(0, 50);

      setProducts(displayProducts);
      setFullProductList(mergedProducts);
      setCategories(categoriesList);
      setModels(modelsList);
      setModelLookup(nextLookup);
      if (accuracyPayload) setAccuracy(accuracyPayload);
      
    } catch (e) {
      setError(e.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) loadData();
  }, [token, loadData]);

  useEffect(() => {
    if (!products || products.length === 0) {
      setRecentSalesData({});
      setRecentPerformance({});
      return;
    }
    setRecentSalesData(prev => {
      const nextMap = {};
      products.forEach(product => {
        if (product?.id == null) return;
        nextMap[product.id] = generateDummyRecentSalesSeries(product);
      });
      return nextMap;
    });
  }, [products, generateDummyRecentSalesSeries]);

  useEffect(() => {
    if (showCategoryAnalysis) {
      setCategoryModalTab('overview');
      setCategorySearchTerm('');
      setCategoryFilterMode('all');
    }
  }, [showCategoryAnalysis]);

  useEffect(() => {
    if (!filteredCategoryPerformance.length) {
      setCategoryDetailSelection(null);
      return;
    }
    const exists = filteredCategoryPerformance.some(cat => cat.name === categoryDetailSelection);
    if (!exists) {
      setCategoryDetailSelection(filteredCategoryPerformance[0]?.name || null);
    }
  }, [filteredCategoryPerformance, categoryDetailSelection]);

  // Auto-select first item when data loads
  useEffect(() => {
    if (!products || products.length === 0) {
      if (selectedTarget) setSelectedTarget(null);
      return;
    }

    if (!selectedTarget) {
      setSelectedTarget(products[0]);
      return;
    }

    const match = products.find(p => Number(p?.id) === Number(selectedTarget?.id));
    if (!match) {
      setSelectedTarget(products[0]);
      return;
    }

    if (match !== selectedTarget) {
      setSelectedTarget(match);
    }
  }, [products, selectedTarget]);

  // Generate chart data when target, chart mode, timeframe, or chart type changes
  useEffect(() => {
    if (selectedTarget) {
      // Prime historical data for accuracy
      fetchHistorical(selectedTarget, timeframe);
      const chartData = generateChartData(selectedTarget);
      setChartData(chartData);
      setVolumeData(chartData?.volume);
      setTechnicalData(chartData?.indicators);
      
      
      // Set initial price
      const basePrice = Number(selectedTarget.avg_daily_sales || 10);
      setCurrentPrice(basePrice);
      setPriceChange(2.34); // Default change
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTarget, timeframe, fetchHistorical]);

  // Refetch historical when timeframe or target changes
  useEffect(() => {
    if (selectedTarget) {
      fetchHistorical(selectedTarget, timeframe);
    }
  }, [selectedTarget, timeframe, fetchHistorical]);

  // ESC key handler for fullscreen
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && isFullscreen) {
        closeFullscreen();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullscreen]);

  // Real-time price updates
  useEffect(() => {
    if (selectedTarget && autoForecast) {
      const interval = setInterval(() => {
        const basePrice = Number(selectedTarget.avg_daily_sales || 10);
        const change = (Math.random() - 0.5) * 0.1; // ±5% change
        const newPrice = basePrice * (1 + change);
        const changePercent = change * 100;
        
        setCurrentPrice(newPrice);
        setPriceChange(changePercent);
      }, 2000); // Update every 2 seconds
      
      return () => clearInterval(interval);
    }
  }, [selectedTarget, autoForecast]);

  // Fetch accuracy data - memoized with request guard
  const fetchAccuracy = useCallback(async () => {
    if (!selectedTarget || !token) return;
    
    const targetId = selectedTarget.id;
    const now = Date.now();
    const minDelay = 1500;
    
    if (lastAccuracyTargetRef.current === targetId) {
      if (accuracyRequestRef.current) {
        return;
      }
      if (now - lastAccuracyTimeRef.current < minDelay) {
        return;
      }
    }
    
    lastAccuracyTargetRef.current = targetId;
    lastAccuracyTimeRef.current = now;
    accuracyRequestRef.current = true;
    
    try {
      const response = await ManagerAPI.getForecastingAccuracy(token);
      if (response && response.success) {
        let targetAccuracy = 0;
        
        if (response.models && response.models.length > 0) {
          const targetModel = response.models.find(m => 
            m.target_id === selectedTarget.id && m.model_type === selectedType
          );
          if (targetModel) {
            targetAccuracy = targetModel.accuracy_percentage;
          }
        }
        
        if (targetAccuracy === 0 && response.accuracy_percentage) {
          targetAccuracy = response.accuracy_percentage;
        }
        
        setAccuracy(prev => {
          if (prev?.accuracy_percentage === targetAccuracy) return prev;
          return {
            ...prev,
            accuracy_percentage: targetAccuracy
          };
        });
      }
    } catch (e) {
      console.log('Could not fetch accuracy:', e.message);
    } finally {
      accuracyRequestRef.current = false;
    }
  }, [selectedTarget, token, selectedType]);

  const generateForecasts = useCallback(async () => {
    if (!selectedTarget || !token) {
      if (!selectedTarget) {
        setError('Please select a product or category to forecast');
      }
      return;
    }

    const targetId = selectedTarget.id;
    const now = Date.now();
    const minDelay = 2000;

    if (lastForecastTargetRef.current === targetId) {
      if (forecastRequestRef.current) {
        return;
      }
      if (now - lastForecastTimeRef.current < minDelay) {
        return;
      }
    }

    lastForecastTargetRef.current = targetId;
    lastForecastTimeRef.current = now;
    forecastRequestRef.current = true;

    try {
      setLoading(true);
      setError('');

      const params = {
        target_id: selectedTarget.id,
        target_name: selectedTarget.name,
        model_type: selectedType || 'product',
        forecast_days: forecastDays,
        forecast_type: forecastType
      };

      const response = await ManagerAPI.getForecasts(params, token);

      if (!response || response.success === false) {
        throw new Error(response?.error || 'Failed to generate forecast');
      }

      const metrics = (response.metrics && typeof response.metrics === 'object') ? response.metrics : {};
      const comparisonSource = (response.comparison && typeof response.comparison === 'object') ? response.comparison : {};

      const fallbackModelType = response.model_type
        || response.best_model
        || selectedModelMeta?.model_type
        || (selectedTarget?._model?.model_type);
      const bestModelType = selectBestModelType(comparisonSource, fallbackModelType);
      const bestMetrics = getModelMetrics(comparisonSource, bestModelType || fallbackModelType);

      const values = Array.isArray(response?.forecast?.values)
        ? response.forecast.values
        : Array.isArray(response.forecasts)
          ? response.forecasts
          : [];
      const dates = Array.isArray(response?.forecast?.dates)
        ? response.forecast.dates
        : Array.isArray(response.dates)
          ? response.dates
          : [];

      const confidenceLower = response?.forecast?.confidence_lower || response?.confidence_lower || null;
      const confidenceUpper = response?.forecast?.confidence_upper || response?.confidence_upper || null;

      const accuracyValue = typeof response.accuracy === 'number'
        ? response.accuracy
        : (typeof metrics.accuracy === 'number' ? metrics.accuracy : bestMetrics?.accuracy);
      const maeValue = typeof response.mae === 'number'
        ? response.mae
        : (typeof metrics.mae === 'number' ? metrics.mae : bestMetrics?.mae);
      const rmseValue = typeof response.rmse === 'number'
        ? response.rmse
        : (typeof metrics.rmse === 'number' ? metrics.rmse : bestMetrics?.rmse);

      const next = {
        values,
        dates,
        confidence: (Array.isArray(confidenceLower) && Array.isArray(confidenceUpper))
          ? [confidenceLower, confidenceUpper]
          : undefined,
        unit_price: typeof response.unit_price === 'number' ? response.unit_price : undefined,
        cost_price: typeof response.cost_price === 'number' ? response.cost_price : undefined,
        revenue: Array.isArray(response.revenue) ? response.revenue : undefined,
        profit: Array.isArray(response.profit) ? response.profit : undefined,
        model_type: bestModelType || fallbackModelType || null,
        accuracy: typeof accuracyValue === 'number' ? accuracyValue : undefined,
        mae: typeof maeValue === 'number' ? maeValue : undefined,
        rmse: typeof rmseValue === 'number' ? rmseValue : undefined,
        trained_at: response.trained_at,
        comparison: comparisonSource,
        metrics
      };

      if (selectedTarget) {
        const targetIdNum = Number(selectedTarget.id);
        if (!Number.isNaN(targetIdNum)) {
          const existingModelEntry = modelLookup[targetIdNum] || models.find(m => Number(m?.target_id) === targetIdNum) || null;
          const accuracyForMeta = typeof next.accuracy === 'number'
            ? next.accuracy
            : bestMetrics?.accuracy ?? existingModelEntry?.accuracy_percentage ?? selectedModelMeta?.accuracy_percentage ?? 0;
          const maeForMeta = typeof next.mae === 'number'
            ? next.mae
            : bestMetrics?.mae ?? existingModelEntry?.mae ?? null;
          const rmseForMeta = typeof next.rmse === 'number'
            ? next.rmse
            : bestMetrics?.rmse ?? existingModelEntry?.rmse ?? null;

          const updatedMeta = {
            ...(existingModelEntry || {}),
            target_id: targetIdNum,
            target_name: existingModelEntry?.target_name || selectedTarget.name,
            model_type: next.model_type || existingModelEntry?.model_type || null,
            accuracy_percentage: accuracyForMeta,
            mae: maeForMeta,
            rmse: rmseForMeta,
            trained_at: next?.trained_at || response?.trained_at || existingModelEntry?.trained_at || selectedModelMeta?.trained_at || null,
            comparison: comparisonSource
          };

          setModelLookup(prev => ({ ...prev, [targetIdNum]: updatedMeta }));
          setProducts(prev => prev.map(product => {
            if (Number(product?.id) !== targetIdNum) return product;
            return {
              ...product,
              accuracy_percentage: accuracyForMeta,
              _model: updatedMeta
            };
          }));
          setModels(prev => {
            const filtered = prev.filter(model => Number(model?.target_id) !== targetIdNum);
            const merged = [...filtered, updatedMeta];
            return merged.sort((a, b) => (Number(b?.accuracy_percentage) || 0) - (Number(a?.accuracy_percentage) || 0));
          });
        }
      }

      setForecasts(next);
      setSuccess('Forecasts generated successfully');
      updateRecentPerformance(selectedTarget, next);
      if ((!accuracy || accuracy.accuracy_percentage === 0) && typeof next.accuracy === 'number') {
        setAccuracy(prev => ({ ...prev, accuracy_percentage: next.accuracy }));
      }
    } catch (e) {
      setError(e.message || 'Failed to generate forecasts');
    } finally {
      forecastRequestRef.current = false;
      setLoading(false);
    }
  }, [selectedTarget, token, selectedType, forecastDays, forecastType, accuracy, modelLookup, models, selectedModelMeta, selectBestModelType, getModelMetrics, updateRecentPerformance]);
  // Train model
  const trainModel = async () => {
    if (!selectedTarget) {
      setError('Please select a product or category to train');
      return;
    }

    try {
      setTraining(true);
      setTrainingProgress(0);
      setError('');
      setSuccess('');
      
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setTrainingProgress(prev => {
          if (prev >= 90) return prev; // Don't go above 90% until training completes
          return prev + Math.random() * 15; // Increment by 0-15% randomly
        });
      }, 500); // Update every 500ms
      
      const response = await ManagerAPI.trainForecastingModel({
        target_id: selectedTarget.id,
        target_name: selectedTarget.name,
        model_type: selectedType || 'product',
        retrain: true,
        include_models: ['sarimax', 'prophet', 'exponential']
      }, token);
      
      // Complete the progress bar
      clearInterval(progressInterval);
      setTrainingProgress(100);
      
      // Wait a moment to show 100% before closing
      await new Promise(resolve => setTimeout(resolve, 500));
      
      if (response) {
        if (response.message) setSuccess(response.message);
        const respAcc = typeof response.accuracy === 'number' ? response.accuracy : (typeof response.metrics?.accuracy === 'number' ? response.metrics.accuracy : undefined);
        const respMae = typeof response.mae === 'number' ? response.mae : (typeof response.metrics?.mae === 'number' ? response.metrics.mae : undefined);
        const respRmse = typeof response.rmse === 'number' ? response.rmse : (typeof response.metrics?.rmse === 'number' ? response.metrics.rmse : undefined);
        if (typeof respAcc === 'number') {
          setAccuracy(prev => ({ ...prev, accuracy_percentage: respAcc }));
        }
        // If backend returns fresh forecast + metrics, use them immediately
        if (response.forecast || Array.isArray(response.forecasts) || Array.isArray(response.dates)) {
          let next = null;
          if (response.forecast) {
            const fc = response.forecast;
            next = {
              values: Array.isArray(fc.values) ? fc.values : (Array.isArray(fc.forecasts) ? fc.forecasts : []),
              dates: Array.isArray(fc.dates) ? fc.dates : [],
              accuracy: typeof respAcc === 'number' ? respAcc : undefined,
              confidence: Array.isArray(fc.confidence_lower) && Array.isArray(fc.confidence_upper)
                ? [fc.confidence_lower, fc.confidence_upper]
                : undefined,
              unit_price: typeof response.unit_price === 'number' ? response.unit_price : undefined,
              cost_price: typeof response.cost_price === 'number' ? response.cost_price : undefined,
              revenue: Array.isArray(response.revenue) ? response.revenue : undefined,
              profit: Array.isArray(response.profit) ? response.profit : undefined,
              model_type: response.model_type,
              mae: typeof respMae === 'number' ? respMae : undefined,
              rmse: typeof respRmse === 'number' ? respRmse : undefined,
              trained_at: response.trained_at,
              comparison: response.comparison && typeof response.comparison === 'object' ? response.comparison : undefined,
            };
          } else {
            next = {
              values: Array.isArray(response.forecasts) ? response.forecasts : [],
              dates: Array.isArray(response.dates) ? response.dates : [],
              accuracy: typeof respAcc === 'number' ? respAcc : undefined,
              confidence: Array.isArray(response.confidence) ? response.confidence : undefined,
              unit_price: typeof response.unit_price === 'number' ? response.unit_price : undefined,
              cost_price: typeof response.cost_price === 'number' ? response.cost_price : undefined,
              revenue: Array.isArray(response.revenue) ? response.revenue : undefined,
              profit: Array.isArray(response.profit) ? response.profit : undefined,
              model_type: response.model_type,
              mae: typeof respMae === 'number' ? respMae : undefined,
              rmse: typeof respRmse === 'number' ? respRmse : undefined,
              trained_at: response.trained_at,
              comparison: response.comparison && typeof response.comparison === 'object' ? response.comparison : undefined,
            };
          }
          if (next) {
            setForecasts(next);
            updateRecentPerformance(selectedTarget, next);
          }
          // Invalidate historical cache for this target across common timeframes and refetch
          try {
            const tfs = ['1H','4H','1D','7D','1M','3M','1Y'];
            setHistoricalCache(prev => {
              const nextCache = { ...prev };
              tfs.forEach(tf => delete nextCache[historicalKey(selectedTarget, tf)]);
              return nextCache;
            });
            await fetchHistorical(selectedTarget, timeframe);
          } catch (_) {}
          // Ensure chart re-renders with fresh predictions
          await generateForecasts();
        } else {
          // Fallback: refresh lists and regenerate forecasts
          await loadData();
          await generateForecasts();
        }
        // Refresh accuracy view after a short delay
        setTimeout(() => { fetchAccuracy(); }, 500);
      }
    } catch (e) {
      setError(e.message || 'Failed to train model');
    } finally {
      setTraining(false);
      setTrainingProgress(0);
      setShowTrainConfirm(false);
      setTrainPassword('');
      setTrainPasswordError('');
    }
  };

  const retrainTopProducts = useCallback(async () => {
    if (bulkTraining) return;
    if (!token) {
      setError('Authentication required to retrain models');
      return;
    }
    if (!products || products.length === 0) {
      setError('No products available for retraining');
      return;
    }
    const candidateTargets = getAvailableTargets().slice(0, Math.min(products.length, 50));
    if (candidateTargets.length === 0) {
      setError('No products match the current filters for retraining');
      return;
    }
    setBulkTraining(true);
    setBulkTrainingStatus({ completed: 0, total: candidateTargets.length, currentName: '' });
    setBulkTrainingProgress(0);
    try {
      for (let i = 0; i < candidateTargets.length; i++) {
        const product = candidateTargets[i];
        setBulkTrainingStatus(prev => ({ ...prev, currentName: product.name }));
        try {
          await ManagerAPI.trainForecastingModel({
            target_id: product.id,
            target_name: product.name,
            model_type: selectedType || 'product',
            retrain: true,
            include_models: ['sarimax', 'prophet', 'exponential']
          }, token);
        } catch (trainErr) {
          console.warn(`Bulk retrain failed for ${product?.name}:`, trainErr);
        } finally {
          setBulkTrainingStatus(prev => ({ ...prev, completed: prev.completed + 1 }));
          setBulkTrainingProgress(Math.round(((i + 1) / candidateTargets.length) * 100));
        }
      }
      setSuccess(`Retrained ${candidateTargets.length} products with latest sales data`);
      await loadData();
      if (selectedTarget) {
        await fetchAccuracy();
        await generateForecasts();
      }
    } catch (e) {
      setError(e.message || 'Bulk retraining failed');
    } finally {
      setBulkTraining(false);
      setBulkTrainingStatus(prev => ({ ...prev, currentName: '' }));
      setBulkTrainingProgress(0);
    }
  }, [bulkTraining, token, products, getAvailableTargets, selectedType, loadData, selectedTarget, fetchAccuracy, generateForecasts]);

  // Handle train model confirmation
  const handleTrainConfirm = () => {
    // Password: "TRAIN" (case-insensitive)
    const correctPassword = 'TRAIN';
    if (trainPassword.toUpperCase().trim() === correctPassword) {
      setTrainPasswordError('');
      trainModel();
    } else {
      setTrainPasswordError('Incorrect password. Please enter "TRAIN" to confirm.');
    }
  };

  const handleBulkTrainConfirm = () => {
    const correctPassword = 'TRAIN';
    if (bulkTrainPassword.toUpperCase().trim() === correctPassword) {
      setBulkTrainPasswordError('');
      setShowBulkTrainConfirm(false);
      setBulkTrainPassword('');
      retrainTopProducts();
    } else {
      setBulkTrainPasswordError('Incorrect password. Please enter "TRAIN" to confirm.');
    }
  };

  // Model performance monitoring (automatic retraining when needed)
  const checkModelPerformance = async () => {
    if (!selectedTarget) return;
    
    try {
      // Only retrain if accuracy is very low or no model exists
      if (!accuracy || Number(accuracy.accuracy_percentage) === 0 || Number(accuracy.accuracy_percentage) < 50) {
        setSuccess('No trained model found or accuracy too low. Training new model...');
        // Trigger automatic retraining
        await trainModel();
        
        // Refresh accuracy after training
        setTimeout(() => {
          fetchAccuracy();
        }, 2000);
      }
    } catch (e) {
      console.warn('Model performance check failed:', e);
    }
  };

  // Periodic model monitoring - reduced frequency to prevent rapid retraining
  useEffect(() => {
    const interval = setInterval(() => {
      checkModelPerformance();
    }, 300000); // Check every 5 minutes instead of 30 seconds
    
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accuracy, selectedTarget]);

  // Trigger initial forecast and accuracy when target changes (only once per target)
  useEffect(() => {
    if (!selectedTarget || !token) {
      currentTargetIdRef.current = null;
      lastForecastTargetRef.current = null;
      lastAccuracyTargetRef.current = null;
      lastForecastTimeRef.current = 0;
      lastAccuracyTimeRef.current = 0;
      return;
    }

    const targetId = selectedTarget.id;
    
    // Only fetch if target actually changed
    if (currentTargetIdRef.current === targetId) {
      return; // Already fetched for this target
    }

    currentTargetIdRef.current = targetId;
    
    // Reset request guards for new target
    forecastRequestRef.current = false;
    accuracyRequestRef.current = false;
    lastForecastTargetRef.current = null;
    lastAccuracyTargetRef.current = null;
    lastForecastTimeRef.current = 0;
    lastAccuracyTimeRef.current = 0;

    // Fetch both - request guards will prevent duplicates
    fetchAccuracy();
    generateForecasts();
  }, [selectedTarget, token, fetchAccuracy, generateForecasts]);

  useEffect(() => {
    if (!selectedTarget || !forecasts) return;
    const targetId = Number(selectedTarget.id);
    if (Number.isNaN(targetId)) return;
    if (!recentSalesData[targetId]) return;
    updateRecentPerformance(selectedTarget, forecasts);
  }, [selectedTarget, forecasts, recentSalesData, updateRecentPerformance]);

  // Auto-forecast effect - only refresh forecasts periodically (not on every render)
  useEffect(() => {
    if (!autoForecast || !selectedTarget || !token) {
      return;
    }

    // Only set up interval if we have a valid target
    const intervalId = setInterval(() => {
      // Only generate if no request is currently in progress
      if (!forecastRequestRef.current && currentTargetIdRef.current === selectedTarget.id) {
        generateForecasts();
      }
    }, Math.max(forecastInterval, 60000)); // Minimum 60 seconds for auto-refresh
    
    return () => clearInterval(intervalId);
  }, [autoForecast, selectedTarget, forecastInterval, token, generateForecasts]);

  // Bulk forecast for all products
  // eslint-disable-next-line no-unused-vars
  const _generateBulkProductForecasts = async () => {
    try {
      setBulkForecasting(true);
      setError('');
      
      const results = {
        products: [],
        totalRevenue: 0,
        totalProfit: 0,
        fastMoving: 0,
        slowMoving: 0,
        highProfit: 0,
        lowProfit: 0
      };
      
      // Process each product
      for (const product of products) {
        if (Number(product.avg_daily_sales) > 0) {
          const salesData = generateSalesForecastData(product, timeframe);
          const avgSales = salesData.reduce((sum, day) => sum + day.sales, 0) / salesData.length;
          const avgRevenue = salesData.reduce((sum, day) => sum + day.revenue, 0) / salesData.length;
          const avgProfit = salesData.reduce((sum, day) => sum + day.profit, 0) / salesData.length;
          const profitMargin = avgRevenue > 0 ? (avgProfit / avgRevenue) * 100 : 0;
          
          const productResult = {
            id: product.id,
            name: product.name,
            category: product.category_name,
            avgDailySales: avgSales,
            avgDailyRevenue: avgRevenue,
            avgDailyProfit: avgProfit,
            profitMargin: profitMargin,
            demandLevel: avgSales >= 15 ? 'Fast' : avgSales >= 8 ? 'Medium' : 'Slow',
            profitLevel: profitMargin > 30 ? 'High' : 'Low'
          };
          
          results.products.push(productResult);
          results.totalRevenue += avgRevenue;
          results.totalProfit += avgProfit;
          
          if (avgSales >= 15) results.fastMoving++;
          if (avgSales < 8) results.slowMoving++;
          if (profitMargin > 30) results.highProfit++;
          if (profitMargin <= 30) results.lowProfit++;
        }
      }
      
      setBulkResults(results);
      setShowBulkResults(true);
      setSuccess(`Generated forecasts for ${results.products.length} products`);
      
    } catch (e) {
      setError(e.message || 'Failed to generate bulk forecasts');
    } finally {
      setBulkForecasting(false);
    }
  };

  // Bulk forecast for all categories
  // eslint-disable-next-line no-unused-vars
  const _generateBulkCategoryForecasts = async () => {
    try {
      setBulkForecasting(true);
      setError('');
      
      const results = {
        categories: [],
        totalRevenue: 0,
        totalProfit: 0,
        totalProducts: 0
      };
      
      // Process each category
      for (const category of categories) {
        const categoryProducts = products.filter(p => p.category_name === category.name);
        if (categoryProducts.length > 0) {
          let categorySales = 0;
          let categoryRevenue = 0;
          let categoryProfit = 0;
          
          categoryProducts.forEach(product => {
            if (Number(product.avg_daily_sales) > 0) {
              const salesData = generateSalesForecastData(product, timeframe);
              categorySales += salesData.reduce((sum, day) => sum + day.sales, 0) / salesData.length;
              categoryRevenue += salesData.reduce((sum, day) => sum + day.revenue, 0) / salesData.length;
              categoryProfit += salesData.reduce((sum, day) => sum + day.profit, 0) / salesData.length;
            }
          });
          
          const categoryResult = {
            id: category.id,
            name: category.name,
            productCount: categoryProducts.length,
            avgDailySales: categorySales,
            avgDailyRevenue: categoryRevenue,
            avgDailyProfit: categoryProfit,
            profitMargin: categoryRevenue > 0 ? (categoryProfit / categoryRevenue) * 100 : 0
          };
          
          results.categories.push(categoryResult);
          results.totalRevenue += categoryRevenue;
          results.totalProfit += categoryProfit;
          results.totalProducts += categoryProducts.length;
        }
      }
      
      setBulkResults(results);
      setShowBulkResults(true);
      setSuccess(`Generated forecasts for ${results.categories.length} categories`);
      
    } catch (e) {
      setError(e.message || 'Failed to generate category forecasts');
    } finally {
      setBulkForecasting(false);
    }
  };

  // Generate default data for products with no historical sales
  const generateDefaultData = (baseSales, basePrice, baseCost, timeframe) => {
    const data = [];
    const startDate = new Date();
    
    // Calculate period based on timeframe
    let days;
    let intervalDays;
    switch (timeframe) {
      case '1H': days = 7; intervalDays = 0.04; break;
      case '4H': days = 14; intervalDays = 0.17; break;
      case '1D': days = 30; intervalDays = 1; break;
      case '7D': days = 90; intervalDays = 1; break;
      case '1M': days = 90; intervalDays = 1; break;
      case '3M': days = 180; intervalDays = 1; break;
      case '1Y': days = 365; intervalDays = 1; break;
      default: days = 30; intervalDays = 1;
    }
    
    startDate.setDate(startDate.getDate() - days);
    
    for (let i = 0; i < Math.ceil(days / intervalDays); i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + (i * intervalDays));
      
      // Generate minimal variation for default data
      const dailySales = Math.max(1, Math.round(baseSales * (0.8 + Math.random() * 0.4)));
      const revenue = dailySales * basePrice;
      const cost = dailySales * baseCost;
      const profit = revenue - cost;
      const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0;
      
      data.push({
        date: date,
        timestamp: date.getTime(),
        sales: dailySales,
        revenue: Math.round(revenue * 100) / 100,
        cost: Math.round(cost * 100) / 100,
        profit: Math.round(profit * 100) / 100,
        profitMargin: Math.round(profitMargin * 100) / 100,
        unitPrice: basePrice,
        unitCost: baseCost,
        demandLevel: dailySales > 5 ? 'High' : dailySales > 2 ? 'Medium' : 'Low',
        profitLevel: profitMargin > 30 ? 'High' : profitMargin > 15 ? 'Medium' : 'Low',
        salesChange: 0,
        profitChange: 0
      });
    }
    
    return data;
  };


  // Chart analyzer function
  const analyzeChart = useCallback((target) => {
    if (!target) return null;
    
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const salesData = generateSalesForecastData(target, timeframe);
    if (!salesData || salesData.length === 0) return null;
    
    // Calculate trends and patterns based on timeframe
    const recentSales = salesData.slice(-7).map(d => d.sales);
    const avgSales = recentSales.reduce((a, b) => a + b, 0) / recentSales.length;
    const salesTrend = recentSales[recentSales.length - 1] > recentSales[0] ? 'increasing' : 'decreasing';
    const volatility = Math.max(...recentSales) - Math.min(...recentSales);
    
    // Get timeframe-specific context
    const getTimeframeContext = (timeframe) => {
      switch (timeframe) {
        case '1H':
          return {
            period: 'hourly',
            unit: 'per hour',
            description: 'This chart shows sales data for each hour of the day',
            analysis: 'Hourly patterns help identify peak shopping times and staffing needs'
          };
        case '4H':
          return {
            period: '4-hour intervals',
            unit: 'per 4 hours',
            description: 'This chart shows sales data in 4-hour blocks',
            analysis: '4-hour intervals reveal daily patterns and help with shift planning'
          };
        case '1D':
          return {
            period: 'daily',
            unit: 'per day',
            description: 'This chart shows daily sales performance',
            analysis: 'Daily trends help track overall product performance and demand'
          };
        case '7D':
          return {
            period: 'weekly',
            unit: 'per week',
            description: 'This chart shows weekly sales patterns',
            analysis: 'Weekly patterns help identify seasonal trends and weekly cycles'
          };
        case '1M':
          return {
            period: 'monthly',
            unit: 'per month',
            description: 'This chart shows monthly sales performance',
            analysis: 'Monthly trends help with inventory planning and seasonal adjustments'
          };
        case '3M':
          return {
            period: 'quarterly',
            unit: 'per quarter',
            description: 'This chart shows quarterly sales performance',
            analysis: 'Quarterly trends help with long-term planning and seasonal analysis'
          };
        case '1Y':
          return {
            period: 'yearly',
            unit: 'per year',
            description: 'This chart shows yearly sales performance',
            analysis: 'Yearly trends help with annual planning and long-term strategy'
          };
        default:
          return {
            period: 'daily',
            unit: 'per day',
            description: 'This chart shows sales performance',
            analysis: 'Track performance trends over time'
          };
      }
    };
    
    const timeframeContext = getTimeframeContext(timeframe);
    
    // Determine demand level based on timeframe
    let demandLevel = 'Low';
    let demandExplanation = '';
    
    // Timeframe-specific demand thresholds and explanations
    switch (timeframe) {
      case '1H':
        if (avgSales >= 3) {
          demandLevel = 'High';
          demandExplanation = 'High hourly demand - this is a peak hour product. Consider extra staffing during these hours.';
        } else if (avgSales >= 1) {
          demandLevel = 'Medium';
          demandExplanation = 'Moderate hourly demand - normal business hours performance.';
        } else {
          demandExplanation = 'Low hourly demand - consider promotional campaigns during off-peak hours.';
        }
        break;
      case '4H':
        if (avgSales >= 12) {
          demandLevel = 'High';
          demandExplanation = 'High demand during 4-hour blocks - this product sells well in shifts. Plan inventory accordingly.';
        } else if (avgSales >= 4) {
          demandLevel = 'Medium';
          demandExplanation = 'Steady demand across 4-hour periods - consistent performance.';
        } else {
          demandExplanation = 'Low demand in 4-hour blocks - review timing and marketing strategy.';
        }
        break;
      case '1D':
        if (avgSales >= 15) {
          demandLevel = 'High';
          demandExplanation = 'High daily demand - fast-moving product. Consider increasing inventory levels.';
        } else if (avgSales >= 8) {
          demandLevel = 'Medium';
          demandExplanation = 'Moderate daily demand - monitor for trends and seasonal changes.';
        } else {
          demandExplanation = 'Low daily demand - needs marketing attention and promotional campaigns.';
        }
        break;
      case '7D':
        if (avgSales >= 105) {
          demandLevel = 'High';
          demandExplanation = 'High weekly demand - excellent weekly performance. Plan for consistent weekly restocking.';
        } else if (avgSales >= 56) {
          demandLevel = 'Medium';
          demandExplanation = 'Moderate weekly demand - monitor weekly patterns for optimization.';
        } else {
          demandExplanation = 'Low weekly demand - review weekly marketing and promotional strategies.';
        }
        break;
      case '1M':
        if (avgSales >= 450) {
          demandLevel = 'High';
          demandExplanation = 'High monthly demand - strong monthly performance. Plan monthly inventory cycles.';
        } else if (avgSales >= 240) {
          demandLevel = 'Medium';
          demandExplanation = 'Moderate monthly demand - track monthly trends for seasonal adjustments.';
        } else {
          demandExplanation = 'Low monthly demand - needs monthly marketing strategy review.';
        }
        break;
      case '3M':
        if (avgSales >= 1350) {
          demandLevel = 'High';
          demandExplanation = 'High quarterly demand - excellent quarterly performance. Plan quarterly business reviews.';
        } else if (avgSales >= 720) {
          demandLevel = 'Medium';
          demandExplanation = 'Moderate quarterly demand - monitor quarterly trends for strategic planning.';
        } else {
          demandExplanation = 'Low quarterly demand - requires quarterly strategy overhaul.';
        }
        break;
      case '1Y':
        if (avgSales >= 5400) {
          demandLevel = 'High';
          demandExplanation = 'High annual demand - outstanding yearly performance. Plan annual growth strategies.';
        } else if (avgSales >= 2880) {
          demandLevel = 'Medium';
          demandExplanation = 'Moderate annual demand - track yearly trends for long-term planning.';
        } else {
          demandExplanation = 'Low annual demand - needs annual strategy review and market analysis.';
        }
        break;
      default:
        if (avgSales >= 15) {
          demandLevel = 'High';
          demandExplanation = 'High demand product - consider increasing inventory.';
        } else if (avgSales >= 8) {
          demandLevel = 'Medium';
          demandExplanation = 'Moderate demand - monitor closely for trends.';
        } else {
          demandExplanation = 'Low demand - needs marketing attention.';
        }
    }
    
    // Analyze forecast accuracy
    let accuracyExplanation = '';
    if (accuracy && accuracy.accuracy_percentage) {
      const acc = Number(accuracy.accuracy_percentage);
      if (acc >= 90) {
        accuracyExplanation = 'Excellent! Our predictions are very reliable for this product.';
      } else if (acc >= 75) {
        accuracyExplanation = 'Good predictions. The forecast is reasonably accurate.';
      } else if (acc >= 50) {
        accuracyExplanation = 'Fair predictions. Consider reviewing the data or model.';
      } else {
        accuracyExplanation = 'Poor predictions. The forecast may not be reliable.';
      }
    }
    
    // Analyze profit potential
    const profitMargin = ((Number(target.unit_price || 0) - Number(target.cost_price || 0)) / Number(target.unit_price || 1)) * 100;
    let profitExplanation = '';
    if (profitMargin > 30) {
      profitExplanation = 'High profit margin. This product is very profitable.';
    } else if (profitMargin > 15) {
      profitExplanation = 'Good profit margin. This product is profitable.';
    } else {
      profitExplanation = 'Low profit margin. Consider reviewing pricing strategy.';
    }
    
    // Generate timeframe-specific recommendations
    const recommendations = [];
    
    // Timeframe-specific recommendations
    switch (timeframe) {
      case '1H':
        if (demandLevel === 'High') {
          recommendations.push('Schedule extra staff during peak hours');
          recommendations.push('Ensure adequate inventory for high-demand hours');
          recommendations.push('Consider promotional pricing during off-peak hours');
        } else if (demandLevel === 'Low') {
          recommendations.push('Implement hourly promotions during slow periods');
          recommendations.push('Review product placement and visibility');
          recommendations.push('Consider bundling with popular items');
        }
        break;
      case '4H':
        if (demandLevel === 'High') {
          recommendations.push('Plan shift-based inventory management');
          recommendations.push('Optimize staff scheduling for high-demand periods');
          recommendations.push('Consider bulk pricing for shift-based sales');
        } else if (demandLevel === 'Low') {
          recommendations.push('Implement 4-hour promotional campaigns');
          recommendations.push('Review shift-based marketing strategies');
          recommendations.push('Consider time-limited offers');
        }
        break;
      case '1D':
        if (demandLevel === 'High') {
          recommendations.push('Increase daily inventory levels');
          recommendations.push('Implement daily restocking procedures');
          recommendations.push('Consider daily promotional campaigns');
        } else if (demandLevel === 'Low') {
          recommendations.push('Launch daily promotional campaigns');
          recommendations.push('Review daily marketing strategies');
          recommendations.push('Consider daily bundle offers');
        }
        break;
      case '7D':
        if (demandLevel === 'High') {
          recommendations.push('Plan weekly inventory cycles');
          recommendations.push('Implement weekly promotional strategies');
          recommendations.push('Schedule weekly performance reviews');
        } else if (demandLevel === 'Low') {
          recommendations.push('Launch weekly promotional campaigns');
          recommendations.push('Review weekly marketing calendar');
          recommendations.push('Consider weekly loyalty programs');
        }
        break;
      case '1M':
        if (demandLevel === 'High') {
          recommendations.push('Plan monthly inventory procurement');
          recommendations.push('Implement monthly promotional calendars');
          recommendations.push('Schedule monthly business reviews');
        } else if (demandLevel === 'Low') {
          recommendations.push('Develop monthly marketing campaigns');
          recommendations.push('Review monthly pricing strategies');
          recommendations.push('Consider monthly subscription models');
        }
        break;
      case '3M':
        if (demandLevel === 'High') {
          recommendations.push('Plan quarterly inventory strategies');
          recommendations.push('Implement quarterly promotional campaigns');
          recommendations.push('Schedule quarterly business planning');
        } else if (demandLevel === 'Low') {
          recommendations.push('Develop quarterly marketing strategies');
          recommendations.push('Review quarterly pricing models');
          recommendations.push('Consider quarterly market analysis');
        }
        break;
      case '1Y':
        if (demandLevel === 'High') {
          recommendations.push('Plan annual growth strategies');
          recommendations.push('Implement yearly promotional calendars');
          recommendations.push('Schedule annual business planning');
        } else if (demandLevel === 'Low') {
          recommendations.push('Develop annual marketing strategies');
          recommendations.push('Review yearly pricing models');
          recommendations.push('Consider annual market repositioning');
        }
        break;
      default:
        // No specific recommendations for other timeframes
        break;
    }
    
    // Profit-based recommendations
    if (profitMargin > 20) {
      recommendations.push('High profit margin - consider expanding this product line');
    } else if (profitMargin < 15) {
      recommendations.push('Low profit margin - review cost structure and pricing');
      recommendations.push('Consider negotiating better supplier terms');
    }
    
    // Trend-based recommendations
    if (salesTrend === 'decreasing') {
      recommendations.push('Sales are declining - investigate market conditions');
      recommendations.push('Consider promotional campaigns to reverse the trend');
    } else if (salesTrend === 'increasing') {
      recommendations.push('Sales are growing - maintain current strategy');
      recommendations.push('Consider expanding inventory to meet growing demand');
    }
    
    return {
      demandLevel,
      demandExplanation,
      accuracyExplanation,
      profitExplanation,
      recommendations,
      timeframeContext,
      keyMetrics: {
        averageSales: Math.round(avgSales),
        salesTrend,
        volatility: Math.round(volatility),
        profitMargin: Math.round(profitMargin)
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeframe, accuracy]);
  
  // Update analysis when target or timeframe changes
  useEffect(() => {
    if (selectedTarget) {
      const analysis = analyzeChart(selectedTarget);
      setAnalysisData(analysis);
    }
  }, [selectedTarget, timeframe, analyzeChart]);
  
  // Generate realistic sales and demand data for pharmacy forecasting
  const generateSalesForecastData = (target, timeframe = '1M') => {
    if (!target) return [];
    // Use database prices from forecasts if available, otherwise use target prices
    const unitPrice = forecasts?.unit_price || Number(target.unit_price) || 0;
    const costPrice = forecasts?.cost_price || Number(target.cost_price) || 0;
    
    // If true historical exists for timeframe, use it directly for accuracy
    const key = historicalKey(target, timeframe);
    const hist = historicalCache[key];
    if (Array.isArray(hist) && hist.length > 0) {
      const fallbackPrice = unitPrice;
      const fallbackCost = costPrice;
      const mapped = hist.map(item => {
        const dateObj = parseLocalISODate(item.date);
        const qty = Number(item.quantity) || 0;
        const revenue = item.revenue != null ? Number(item.revenue) : qty * fallbackPrice;
        const cost = item.cost != null ? Number(item.cost) : qty * fallbackCost;
        const profit = revenue - cost;
        const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0;
        return {
          date: dateObj,
          timestamp: dateObj.getTime(),
          sales: qty,
          revenue: Math.round(revenue * 100) / 100,
          cost: Math.round(cost * 100) / 100,
          profit: Math.round(profit * 100) / 100,
          profitMargin: Math.round(profitMargin * 100) / 100,
          unitPrice: fallbackPrice,
          unitCost: fallbackCost,
          demandLevel: qty > 15 ? 'High' : qty >= 8 ? 'Medium' : 'Low',
          profitLevel: profitMargin > 30 ? 'High' : profitMargin > 15 ? 'Medium' : 'Low',
          salesChange: 0,
          profitChange: 0
        };
      });
      // Ensure strictly ascending order by date
      mapped.sort((a, b) => a.timestamp - b.timestamp);
      return mapped;
    }

    // Use aggregated real features when no per-day history returned
    // Use database prices from forecasts if available, otherwise use target prices
    const baseSales = Number(target.avg_daily_sales) || 0;
    const basePrice = unitPrice;
    const baseCost = costPrice;

    // Synthetic cache key to keep generated series stable across re-renders
    const synKey = `syn:${selectedType}:${target.id}:${timeframe}:${baseSales}:${basePrice}:${baseCost}`;
    const cached = syntheticCache[synKey];
    if (Array.isArray(cached) && cached.length > 0) {
      return cached;
    }
    
    // If no real data, use minimal defaults based on product type
    if (baseSales === 0) {
      // Use a small default based on product name patterns
      const name = target.name.toLowerCase();
      let def;
      if (name.includes('tablet') || name.includes('capsule')) {
        def = generateDefaultData(5, basePrice || 50, baseCost || 30, timeframe);
      } else if (name.includes('syrup') || name.includes('suspension')) {
        def = generateDefaultData(3, basePrice || 80, baseCost || 50, timeframe);
      } else {
        def = generateDefaultData(2, basePrice || 100, baseCost || 70, timeframe);
      }
      // cache and return
      setSyntheticCache(prev => ({ ...prev, [synKey]: def }));
      return def;
    }
    
    const data = [];
    const startDate = new Date();
    
    // Calculate period based on timeframe
    let days;
    let intervalDays;
    switch (timeframe) {
      case '1H':
        days = 7;
        intervalDays = 0.04; // ~1 hour
        break;
      case '4H':
        days = 14;
        intervalDays = 0.17; // ~4 hours
        break;
      case '1D':
        days = 30;
        intervalDays = 1;
        break;
      case '7D':
        days = 90;
        intervalDays = 1;
        break;
      case '1M':
        days = 90;
        intervalDays = 1;
        break;
      case '3M':
        days = 180;
        intervalDays = 1;
        break;
      case '1Y':
        days = 365;
        intervalDays = 1;
        break;
      default:
        days = 30;
        intervalDays = 1;
    }
    
    startDate.setDate(startDate.getDate() - days);
    
    // Generate realistic pharmacy sales patterns based on actual data
    const generateSalesPattern = (i, totalDays) => {
      const dayOfWeek = i % 7;
      const weekOfMonth = Math.floor(i / 7) % 4;
      const monthOfYear = Math.floor(i / 30) % 12;
      
      // Weekend effect (lower sales on weekends) - realistic for pharmacy
      const weekendEffect = (dayOfWeek === 0 || dayOfWeek === 6) ? 0.8 : 1.0;
      
      // Monthly pattern (slight variation) - based on real pharmacy patterns
      const monthlyEffect = 1 + 0.05 * Math.sin((weekOfMonth - 1) * Math.PI / 2);
      
      // Seasonal effect (flu season, winter boost) - realistic for pharmacy
      const seasonalEffect = 1 + 0.1 * Math.sin((monthOfYear - 2) * Math.PI / 6);
      
      // Trend effect (very gradual growth) - realistic business growth
      const trendEffect = 1 + (i / totalDays) * 0.05;
      
      // Minimal random variation (pharmacy sales are stable)
      const randomEffect = 0.98 + Math.random() * 0.04; // Only ±2% variation
      
      // Heavy smoothing for realistic pharmacy data
      const smoothingFactor = 0.8;
      const basePattern = weekendEffect * monthlyEffect * seasonalEffect * trendEffect;
      const smoothedPattern = basePattern * smoothingFactor + (basePattern * randomEffect) * (1 - smoothingFactor);
      
      return smoothedPattern;
    };
    
    const totalDays = Math.ceil(days / intervalDays);
    
    // Generate raw sales data first
    const rawSalesData = [];
    for (let i = 0; i < totalDays; i++) {
      const pattern = generateSalesPattern(i, totalDays);
      const dailySales = Math.max(0, Math.round(baseSales * pattern));
      rawSalesData.push(dailySales);
    }
    
    // Apply moving average smoothing to reduce volatility
    const smoothedSalesData = [];
    const windowSize = Math.min(3, Math.floor(totalDays / 10)); // Adaptive window size
    
    for (let i = 0; i < totalDays; i++) {
      let sum = 0;
      let count = 0;
      
      // Calculate moving average
      for (let j = Math.max(0, i - windowSize); j <= Math.min(totalDays - 1, i + windowSize); j++) {
        sum += rawSalesData[j];
        count++;
      }
      
      const smoothedSales = Math.round(sum / count);
      smoothedSalesData.push(smoothedSales);
    }
    
    for (let i = 0; i < totalDays; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + (i * intervalDays));
      
      // Use smoothed sales data
      const dailySales = smoothedSalesData[i];
      // Prices are stable in pharmacy - minimal variation
      const unitPrice = basePrice; // Keep prices stable
      const unitCost = baseCost; // Keep costs stable
      
      const revenue = dailySales * unitPrice;
      const cost = dailySales * unitCost;
      const profit = revenue - cost;
      const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0;
      
      // Generate demand indicators
      const demandLevel = dailySales > baseSales * 1.2 ? 'High' : 
                         dailySales > baseSales * 0.8 ? 'Medium' : 'Low';
      
      const profitLevel = profitMargin > 30 ? 'High' : 
                         profitMargin > 15 ? 'Medium' : 'Low';
      
      data.push({
        date: date,
        timestamp: date.getTime(),
        sales: dailySales,
        revenue: Math.round(revenue * 100) / 100,
        cost: Math.round(cost * 100) / 100,
        profit: Math.round(profit * 100) / 100,
        profitMargin: Math.round(profitMargin * 100) / 100,
        unitPrice: Math.round(unitPrice * 100) / 100,
        unitCost: Math.round(unitCost * 100) / 100,
        demandLevel,
        profitLevel,
        // For comparison with previous periods (smoothed)
        salesChange: i > 7 && data[i-7] ? Math.max(-50, Math.min(50, ((dailySales - data[i-7].sales) / data[i-7].sales) * 100)) : 0,
        profitChange: i > 7 && data[i-7] ? Math.max(-50, Math.min(50, ((profit - data[i-7].profit) / data[i-7].profit) * 100)) : 0
      });
    }
    
    // cache synthetic series for determinism
    setSyntheticCache(prev => ({ ...prev, [synKey]: data }));
    return data;
  };

  // Calculate comprehensive technical indicators
  const calculateIndicators = (data) => {
    if (!data || data.length === 0) return {};
    
    const closes = data.map(d => d.close);
    const volumes = data.map(d => d.volume);
    const timestamps = data.map(d => d.timestamp);
    
    // Simple Moving Average
    const sma = (period) => {
      const result = [];
      for (let i = period - 1; i < closes.length; i++) {
        const sum = closes.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
        result.push({
          value: sum / period,
          timestamp: timestamps[i]
        });
      }
      return result;
    };
    
    // Exponential Moving Average
    const ema = (period) => {
      const result = [];
      const multiplier = 2 / (period + 1);
      result[0] = { value: closes[0], timestamp: timestamps[0] };
      for (let i = 1; i < closes.length; i++) {
        const value = (closes[i] * multiplier) + (result[i - 1].value * (1 - multiplier));
        result.push({ value, timestamp: timestamps[i] });
      }
      return result;
    };
    
    // RSI
    const rsi = (period = 14) => {
      const gains = [];
      const losses = [];
      
      for (let i = 1; i < closes.length; i++) {
        const change = closes[i] - closes[i - 1];
        gains.push(change > 0 ? change : 0);
        losses.push(change < 0 ? Math.abs(change) : 0);
      }
      
      const result = [];
      for (let i = period - 1; i < gains.length; i++) {
        const avgGain = gains.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
        const avgLoss = losses.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
        const rs = avgGain / (avgLoss || 0.001);
        const rsiValue = 100 - (100 / (1 + rs));
        result.push({ value: rsiValue, timestamp: timestamps[i] });
      }
      
      return result;
    };
    
    // MACD
    const macd = () => {
      const ema12 = ema(12).map(d => d.value);
      const ema26 = ema(26).map(d => d.value);
      const result = [];
      
      for (let i = 25; i < closes.length; i++) {
        const macdLine = ema12[i] - ema26[i];
        result.push({ value: macdLine, timestamp: timestamps[i] });
      }
      
      return result;
    };
    
    return {
      sma20: sma(20),
      ema12: ema(12),
      ema26: ema(26),
      rsi14: rsi(14),
      macd: macd(),
      volume: volumes.map((v, i) => ({ value: v, timestamp: timestamps[i] }))
    };
  };

  // Generate candlestick data
  // eslint-disable-next-line no-unused-vars
  const _generateCandlestickData = (timeSeriesData) => {
    return timeSeriesData.map(d => ({
      x: d.date,
      o: d.open,
      h: d.high,
      l: d.low,
      c: d.close
    }));
  };

  // Generate multi-axis chart data for sales forecasting
  const generateMultiAxisData = (target) => {
    if (!target) return null;

    const buildLegacyChart = () => {
      const salesData = generateSalesForecastData(target, timeframe);
      if (!salesData || salesData.length === 0) {
        const sampleData = [];
        for (let i = 0; i < 30; i++) {
          const date = new Date();
          date.setDate(date.getDate() - (29 - i));
          sampleData.push({
            date,
            sales: Math.floor(Math.random() * 20) + 5,
            revenue: Math.floor(Math.random() * 200) + 50,
            profit: Math.floor(Math.random() * 100) + 20
          });
        }
        const sampleLabels = sampleData.map(d => d.date);
        return {
          labels: sampleLabels,
          datasets: [
            {
              label: 'Daily Sales (Units)',
              type: 'line',
              data: sampleData.map(d => d.sales),
              borderColor: '#3B82F6',
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              borderWidth: 2,
              fill: true,
              tension: 0.1,
              pointRadius: 2,
              yAxisID: 'y'
            },
            {
              label: 'Revenue (₱)',
              type: 'bar',
              data: sampleData.map(d => d.revenue),
              backgroundColor: 'rgba(16, 185, 129, 0.6)',
              borderColor: '#10B981',
              borderWidth: 1,
              yAxisID: 'y1'
            },
            {
              label: 'Profit (₱)',
              type: 'line',
              data: sampleData.map(d => d.profit),
              borderColor: '#F59E0B',
              backgroundColor: 'transparent',
              borderWidth: 2,
              pointRadius: 0,
              yAxisID: 'y1'
            }
          ]
        };
      }

      const labels = salesData.map(d => d.date);
      const sales = salesData.map(d => d.sales);
      const profit = salesData.map(d => d.profit);
      const hasForecastValues = forecasts && Array.isArray(forecasts.values) && forecasts.values.length > 0;
      const hasMatchingDates = hasForecastValues && Array.isArray(forecasts.dates) && forecasts.dates.length === forecasts.values.length;

      let extendedLabels = labels;
      let forecastValues = [];
      if (hasForecastValues) {
        if (hasMatchingDates) {
          const forecastDatesAsDate = forecasts.dates.map(ds => parseLocalISODate(ds));
          extendedLabels = labels.concat(forecastDatesAsDate);
        } else {
          const lastLabel = labels[labels.length - 1] instanceof Date ? labels[labels.length - 1] : parseLocalISODate(labels[labels.length - 1]);
          const syntheticDates = [];
          const startDate = !isNaN(lastLabel?.getTime()) ? new Date(lastLabel) : new Date();
          for (let i = 1; i <= forecasts.values.length; i++) {
            syntheticDates.push(addDays(startDate, i));
          }
          extendedLabels = labels.concat(syntheticDates);
        }
        forecastValues = forecasts.values.slice();
      }

      const padWithNulls = (arr, padCount) => arr.concat(Array(padCount).fill(null));
      const historicalPadCount = hasForecastValues ? forecasts.values.length : 0;

      const datasets = [
        {
          label: 'Historical Sales (Units)',
          type: 'line',
          data: hasForecastValues ? padWithNulls(sales, historicalPadCount) : sales,
          borderColor: '#3B82F6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.1,
          pointRadius: 2,
          yAxisID: 'y'
        },
        {
          label: 'Profit (₱)',
          type: 'line',
          data: hasForecastValues ? padWithNulls(profit, historicalPadCount) : profit,
          borderColor: '#10B981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          borderWidth: 2,
          fill: true,
          pointRadius: 2,
          yAxisID: 'y1'
        }
      ];

      const recentWindow = Math.min(14, Math.max(5, Math.floor(sales.length / 5)));
      if (recentWindow > 5) {
        const recentSeries = Array(sales.length).fill(null);
        for (let i = sales.length - recentWindow; i < sales.length; i++) {
          recentSeries[i] = sales[i];
        }
        const recentPadded = hasForecastValues ? padWithNulls(recentSeries, historicalPadCount) : recentSeries;
        datasets.push(
          {
            label: 'Recent Sales (Units)',
            type: 'line',
            data: recentPadded,
            borderColor: '#111827',
            backgroundColor: 'rgba(17, 24, 39, 0.15)',
            borderWidth: 5,
            borderDash: [4, 3],
            borderCapStyle: 'round',
            borderJoinStyle: 'round',
            pointRadius: 0,
            fill: false,
            yAxisID: 'y',
            order: 999
          }
        );
      }

      if (hasForecastValues) {
        const forecastUnitsPadded = Array(labels.length).fill(null).concat(forecastValues.map(v => Number(v) || 0));
        datasets.push({
          label: 'Forecast (Units)',
          type: 'line',
          data: forecastUnitsPadded,
          borderColor: '#9333EA',
          backgroundColor: 'rgba(147, 51, 234, 0.08)',
          borderWidth: 2,
          borderDash: [6, 4],
          fill: false,
          tension: 0.2,
          pointRadius: 0,
          yAxisID: 'y'
        });

        const unitPrice = forecasts?.unit_price || Number(target.unit_price || 0);
        const costPrice = forecasts?.cost_price || Number(target.cost_price || 0);
        const profitPerUnit = unitPrice - costPrice;
        const forecastProfit = forecastValues.map(v => (Number(v) || 0) * profitPerUnit);
        const forecastProfitPadded = Array(labels.length).fill(null).concat(forecastProfit.map(v => Math.round(v * 100) / 100));
        datasets.push({
          label: 'Forecast Profit (₱)',
          type: 'line',
          data: forecastProfitPadded,
          borderColor: '#F59E0B',
          backgroundColor: 'rgba(245, 158, 11, 0.08)',
          borderWidth: 2,
          borderDash: [6, 4],
          fill: false,
          tension: 0.2,
          pointRadius: 0,
          yAxisID: 'y1'
        });

        if (Array.isArray(forecasts?.confidence) && forecasts.confidence.length === 2) {
          const [lower, upper] = forecasts.confidence;
          if (Array.isArray(lower) && Array.isArray(upper) && lower.length === forecastValues.length && upper.length === forecastValues.length) {
            const paddedLower = Array(labels.length).fill(null).concat(lower.map(v => Number(v) || 0));
            const paddedUpper = Array(labels.length).fill(null).concat(upper.map(v => Number(v) || 0));
            datasets.push({
              label: '',
              type: 'line',
              data: paddedUpper,
              borderColor: 'rgba(147, 51, 234, 0.0)',
              backgroundColor: 'rgba(147, 51, 234, 0.0)',
              pointRadius: 0,
              borderWidth: 0,
              yAxisID: 'y'
            });
            datasets.push({
              label: 'Forecast Confidence',
              type: 'line',
              data: paddedLower,
              borderColor: 'rgba(147, 51, 234, 0.0)',
              backgroundColor: 'rgba(147, 51, 234, 0.12)',
              pointRadius: 0,
              borderWidth: 0,
              fill: '-1',
              yAxisID: 'y'
            });
          }
        }
      }

      return { labels: hasForecastValues ? extendedLabels : labels, datasets };
    };

    const targetId = Number(target.id);
    const performance = Number.isNaN(targetId) ? null : recentPerformance[targetId];
    const actualSeries = Number.isNaN(targetId) ? null : recentSalesData[targetId];

    if (!performance || !actualSeries || actualSeries.length === 0) {
      return buildLegacyChart();
    }

    const windowedActual = actualSeries.slice(-Math.min(actualSeries.length, 45));
    const labelMap = new Map();
    const addLabel = (date) => {
      if (!date) return;
      const normalized = normalizeDate(date);
      labelMap.set(normalized.getTime(), normalized);
    };
    windowedActual.forEach(point => addLabel(point.date));
    (performance.future || []).forEach(entry => addLabel(entry.date));

    if (labelMap.size === 0) {
      return buildLegacyChart();
    }

    const labels = Array.from(labelMap.values()).sort((a, b) => a - b);
    const actualMap = new Map(windowedActual.map(point => [normalizeDate(point.date).getTime(), point]));
    const comparisonMap = new Map((performance.comparison || []).map(entry => [normalizeDate(entry.date).getTime(), entry.predicted]));
    const futureMap = new Map((performance.future || []).map(entry => [normalizeDate(entry.date).getTime(), entry.predicted]));

    const unitPrice = Number(forecasts?.unit_price || target.unit_price || 0);
    const costPrice = Number(forecasts?.cost_price || target.cost_price || 0);
    const profitPerUnit = unitPrice - costPrice;

    const actualData = labels.map(label => {
      const point = actualMap.get(label.getTime());
      return point ? point.sales : null;
    });
    const predictedData = labels.map(label => {
      const key = label.getTime();
      if (comparisonMap.has(key)) return comparisonMap.get(key);
      if (futureMap.has(key)) return futureMap.get(key);
      return null;
    });
    const profitData = labels.map(label => {
      const key = label.getTime();
      const point = actualMap.get(key);
      if (point) {
        return point.profit ?? Math.round(point.sales * profitPerUnit * 100) / 100;
      }
      const predictedValue = comparisonMap.get(key) ?? futureMap.get(key);
      if (typeof predictedValue === 'number') {
        return Math.round(predictedValue * profitPerUnit * 100) / 100;
      }
      return null;
    });

    const recentHighlightKeys = windowedActual
      .slice(-Math.min(windowedActual.length, 7))
      .map(point => normalizeDate(point.date).getTime());
    const highlightData = labels.map(label => {
      const key = label.getTime();
      if (recentHighlightKeys.includes(key)) {
        const point = actualMap.get(key);
        return point ? point.sales : null;
      }
      return null;
    });

    const confidenceUpper = labels.map(label => {
      const key = label.getTime();
      if (futureMap.has(key)) {
        const val = futureMap.get(key);
        return Math.round(val * 1.1 * 100) / 100;
      }
      return null;
    });
    const confidenceLower = labels.map(label => {
      const key = label.getTime();
      if (futureMap.has(key)) {
        const val = futureMap.get(key);
        return Math.max(0, Math.round(val * 0.9 * 100) / 100);
      }
      return null;
    });

    const datasets = [
      {
        label: 'Actual Sales (Units)',
        type: 'line',
        data: actualData,
        borderColor: '#16A34A',
        backgroundColor: 'rgba(34, 197, 94, 0.15)',
        borderWidth: 2.5,
        tension: 0.25,
        fill: true,
        pointRadius: 2,
        yAxisID: 'y'
      },
      {
        label: 'Predicted Sales (Units)',
        type: 'line',
        data: predictedData,
        borderColor: '#9333EA',
        backgroundColor: 'rgba(147, 51, 234, 0.05)',
        borderWidth: 2,
        borderDash: [6, 4],
        fill: false,
        tension: 0.25,
        pointRadius: 0,
        yAxisID: 'y'
      },
      {
        label: 'Recent Actual Window',
        type: 'line',
        data: highlightData,
        borderColor: '#111827',
        backgroundColor: 'rgba(17, 24, 39, 0.15)',
        borderWidth: 5,
        borderDash: [4, 3],
        borderCapStyle: 'round',
        borderJoinStyle: 'round',
        fill: false,
        pointRadius: 0,
        yAxisID: 'y',
        order: 999
      },
      {
        label: 'Profit (₱)',
        type: 'line',
        data: profitData,
        borderColor: '#F59E0B',
        backgroundColor: 'rgba(245, 158, 11, 0.12)',
        borderWidth: 2,
        fill: true,
        pointRadius: 1,
        yAxisID: 'y1'
      }
    ];

    if (confidenceUpper.some(v => v !== null)) {
      datasets.push({
        label: '',
        type: 'line',
        data: confidenceUpper,
        borderColor: 'rgba(147, 51, 234, 0.0)',
        backgroundColor: 'rgba(147, 51, 234, 0.0)',
        pointRadius: 0,
        borderWidth: 0,
        yAxisID: 'y'
      });
      datasets.push({
        label: 'Forecast Confidence',
        type: 'line',
        data: confidenceLower,
        borderColor: 'rgba(147, 51, 234, 0.0)',
        backgroundColor: 'rgba(147, 51, 234, 0.12)',
        pointRadius: 0,
        borderWidth: 0,
        fill: '-1',
        yAxisID: 'y'
      });
    }

    return { labels, datasets };
  };

  // Generate Chart.js data for sales forecasting analysis
  const generateChartData = (target) => {
    if (!target) return null;
    
    const salesData = generateSalesForecastData(target, timeframe);
    const indicators = calculateIndicators(salesData);
    
    const labels = salesData.map(d => d.date);
    const sales = salesData.map(d => d.sales);
    const profit = salesData.map(d => d.profit);
    
    // Main sales chart data
    const salesChartData = {
      labels: labels,
      datasets: [
        {
          label: 'Daily Sales (Units)',
          data: sales,
          borderColor: false ? '#3B82F6' : '#2563EB',
          backgroundColor: false ? 'rgba(59, 130, 246, 0.2)' : 'rgba(37, 99, 235, 0.2)',
          borderWidth: 2,
          fill: true,
          tension: 0.1,
          pointRadius: 2,
          pointHoverRadius: 6,
          pointBackgroundColor: false ? '#3B82F6' : '#2563EB',
          pointBorderColor: false ? '#3B82F6' : '#2563EB',
          yAxisID: 'y'
        },
        {
          label: 'Profit (₱)',
          data: profit,
          borderColor: '#10B981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          borderWidth: 2,
          fill: true,
          pointRadius: 2,
          yAxisID: 'y1'
        }
      ]
    };
    
    // Technical indicators removed - focusing on predictions
    
    if (indicators.ema12 && indicators.ema12.length > 0) {
      const emaData = indicators.ema12.map(d => d.value);
      
      salesChartData.datasets.push({
        label: 'EMA (12)',
        data: emaData,
        borderColor: '#EF4444',
        backgroundColor: 'transparent',
        borderWidth: 1,
        pointRadius: 0,
        pointHoverRadius: 2,
        yAxisID: 'y'
      });
    }
    
    // Volume chart data
    const volumeChartData = {
      labels: labels,
      datasets: [
        {
          label: 'Volume (Units)',
          data: salesData.map(d => Number(d.sales) || 0),
          backgroundColor: false ? 'rgba(139, 92, 246, 0.6)' : 'rgba(139, 92, 246, 0.4)',
          borderColor: false ? '#8B5CF6' : '#7C3AED',
          borderWidth: 1
        }
      ]
    };
    
    
    
    return {
      sales: salesChartData,
      volume: volumeChartData,
      indicators: indicators
    };
  };

  // Generate sample forecast data for demonstration
  // eslint-disable-next-line no-unused-vars
  const _generateSampleForecast = (target) => {
    if (!target) {
      return {
        forecasts: [],
        accuracy: 0,
        message: 'No target selected'
      };
    }
    
    const baseValue = Number(target.avg_daily_sales) || 10;
    const forecasts = [];
    
    for (let i = 0; i < 30; i++) {
      // Add some realistic variation
      const trend = Math.sin(i * 0.2) * 0.3;
      const random = (Math.random() - 0.5) * 0.4;
      const value = Math.max(1, Math.round(baseValue * (1 + trend + random)));
      forecasts.push(value);
    }
    
    return {
      forecasts: forecasts || [],
      accuracy: Number(accuracy?.accuracy_percentage) || (85 + Math.random() * 10), // Use real accuracy or fallback
      message: `Sample forecast for ${target.name}`
    };
  };

  const activeModelType = selectedModelMeta?.model_type || forecasts?.model_type || null;
  const accuracyValue = selectedModelMeta && typeof selectedModelMeta.accuracy_percentage === 'number'
    ? selectedModelMeta.accuracy_percentage
    : (forecasts && typeof forecasts.accuracy === 'number' ? forecasts.accuracy : null);
  const maeValue = selectedModelMeta && typeof selectedModelMeta.mae === 'number'
    ? selectedModelMeta.mae
    : (forecasts && typeof forecasts.mae === 'number' ? forecasts.mae : null);
  const rmseValue = selectedModelMeta && typeof selectedModelMeta.rmse === 'number'
    ? selectedModelMeta.rmse
    : (forecasts && typeof forecasts.rmse === 'number' ? forecasts.rmse : null);
  const trainedAtValue = selectedModelMeta?.trained_at || forecasts?.trained_at || null;
  const mapeValue = typeof currentPerformance?.mape === 'number' ? currentPerformance.mape : null;
  const latestComparisonPoint = currentPerformance?.comparison && currentPerformance.comparison.length > 0
    ? currentPerformance.comparison[currentPerformance.comparison.length - 1]
    : null;
  const latestActualUnits = typeof latestComparisonPoint?.actual === 'number' ? latestComparisonPoint.actual : null;
  const latestPredictedUnits = typeof latestComparisonPoint?.predicted === 'number' ? latestComparisonPoint.predicted : null;
  const latestDeltaUnits = (latestActualUnits != null && latestPredictedUnits != null)
    ? latestActualUnits - latestPredictedUnits
    : null;
  const latestComparisonDateLabel = latestComparisonPoint?.date
    ? normalizeDate(latestComparisonPoint.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null;
  const unitPriceForTooltips = Number(forecasts?.unit_price || selectedTarget?.unit_price || 0);
  const costPriceForTooltips = Number(forecasts?.cost_price || selectedTarget?.cost_price || 0);
  const profitPerUnitForTooltips = unitPriceForTooltips - costPriceForTooltips;
  
  const comparisonData = useMemo(() => {
    return (selectedModelMeta?.comparison && typeof selectedModelMeta.comparison === 'object')
      ? selectedModelMeta.comparison
      : (forecasts?.comparison && typeof forecasts.comparison === 'object')
        ? forecasts.comparison
        : {};
  }, [selectedModelMeta?.comparison, forecasts?.comparison]);

  const comparisonEntries = useMemo(() => {
    if (!comparisonData || typeof comparisonData !== 'object') return [];
    const preferredOrder = ['sarimax', 'prophet'];
    const preferred = preferredOrder.filter(key => comparisonData[key]);
    const remaining = Object.keys(comparisonData)
      .filter(key => !preferredOrder.includes(key) && comparisonData[key])
      .sort((a, b) => a.localeCompare(b));
    return [...preferred, ...remaining]
      .map(key => [key, comparisonData[key]])
      .filter(([, metrics]) => metrics && typeof metrics === 'object');
  }, [comparisonData]);

  return (
    <div className={`${false ? 'bg-gray-900' : 'bg-gray-50'}`}>
      {/* Header Section */}
      <div className={`${false ? 'bg-gray-800' : 'bg-white'} border-b border-gray-200`}>
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className={`text-xl font-bold ${false ? 'text-white' : 'text-gray-900'}`}>
                  Sales Forecasting
                </h1>
                <p className={`text-xs ${false ? 'text-gray-400' : 'text-gray-600'}`}>
                  Top {Math.min(50, products.length)} products available (sorted by sales)
                </p>
              </div>
            </div>
            {selectedTarget && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowCategoryAnalysis(true)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                    false
                      ? 'bg-purple-600 text-white hover:bg-purple-700'
                      : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                  }`}
                >
                  📊 Category Analysis
                </button>
                <button
                  onClick={() => setShowTrainConfirm(true)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                    false
                      ? 'bg-orange-600 text-white hover:bg-orange-700'
                      : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                  }`}
                >
                  🔄 Retrain Product
                </button>
                <button
                  onClick={() => setShowModelCompare(true)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                    false
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                  }`}
                >
                  🧪 Compare Models
                </button>
                <button
                  onClick={() => {
                    if (bulkTraining) return;
                    setShowBulkTrainConfirm(true);
                    setBulkTrainPassword('');
                    setBulkTrainPasswordError('');
                  }}
                  disabled={bulkTraining}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 ${
                    bulkTraining
                      ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                      : false
                        ? 'bg-gray-700 text-white hover:bg-gray-600'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  ⚙️ Retrain Top 50
                  {bulkTraining && (
                    <span className="text-[10px] font-semibold">
                      {bulkTrainingStatus.completed}/{bulkTrainingStatus.total}
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>
          {bulkTraining && (
            <div className="mt-2">
              <div className={`flex items-center justify-between text-xs font-medium ${
                false ? 'text-blue-300' : 'text-blue-600'
              }`}>
                <span>
                  Retraining {bulkTrainingStatus.currentName || 'products'} ({bulkTrainingStatus.completed}/{bulkTrainingStatus.total})
                </span>
                <span>{Math.min(100, Math.max(0, Math.round(bulkTrainingProgress)))}%</span>
              </div>
              <div className={`w-full h-2 mt-1 rounded-full overflow-hidden ${
                false ? 'bg-blue-900/30' : 'bg-blue-100'
              }`}>
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300 ease-out"
                  style={{ width: `${Math.min(100, Math.max(0, bulkTrainingProgress))}%` }}
                />
              </div>
            </div>
          )}
          
          {/* Professional Product Selector */}
          <div className="bg-gradient-to-br from-gray-50 to-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="space-y-4">
              {/* Filters Row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Search Product */}
                <div className="md:col-span-2">
                  <label className={`block text-sm font-semibold mb-2 ${false ? 'text-gray-200' : 'text-gray-700'}`}>
                    Search Product
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                    <input
                      type="text"
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      placeholder="Search by product name, category, or generic name..."
                      className={`w-full pl-10 pr-10 py-2.5 rounded-lg border text-sm transition-all ${
                        false
                          ? 'bg-gray-800 border-gray-600 text-white placeholder-gray-400 focus:border-blue-500'
                          : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
                      }`}
                    />
                    {productSearch && (
                      <button
                        onClick={() => setProductSearch('')}
                        className={`absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-gray-100 transition-colors ${
                          false ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-gray-400 hover:text-gray-600'
                        }`}
                        aria-label="Clear search"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                {/* Category Filter */}
                <div>
                  <label className={`block text-sm font-semibold mb-2 ${false ? 'text-gray-200' : 'text-gray-700'}`}>
                    Category
                  </label>
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className={`w-full px-3 py-2.5 rounded-lg border text-sm transition-all ${
                      false 
                        ? 'bg-gray-800 border-gray-600 text-white focus:border-blue-500' 
                        : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
                    }`}
                  >
                    <option value="">All Categories</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.name}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Product Selector */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className={`text-sm font-semibold ${false ? 'text-gray-200' : 'text-gray-700'}`}>
                    Select Product
                  </label>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                    false 
                      ? 'bg-gray-700 text-gray-300' 
                      : 'bg-blue-50 text-blue-700'
                  }`}>
                    {getAvailableTargets().length} of {products.length} products
                  </span>
                </div>
                <select
                  value={selectedTarget?.id || ''}
                  onChange={(e) => {
                    const target = getAvailableTargets().find(t => t.id === Number(e.target.value));
                    setSelectedTarget(target);
                  }}
                  className={`w-full px-4 py-3 rounded-lg border text-sm font-medium transition-all ${
                    false 
                      ? 'bg-gray-800 border-gray-600 text-white focus:border-blue-500' 
                      : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
                  }`}
                >
                  <option value="">Select a product to view forecasts...</option>
                  {getAvailableTargets().map(target => (
                    <option key={target.id} value={target.id}>
                      {target.name} {target.category_name && `• ${target.category_name}`}
                    </option>
                  ))}
                </select>
                {getAvailableTargets().length === 0 && (
                  <div className={`mt-3 p-3 rounded-lg border ${
                    false 
                      ? 'bg-yellow-900/20 border-yellow-700/30 text-yellow-300' 
                      : 'bg-yellow-50 border-yellow-200 text-yellow-800'
                  }`}>
                    <p className="text-sm font-medium">
                      No products found. Try adjusting your search or category filter.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Product Details */}
      {selectedTarget && (
        <div className={`${false ? 'bg-gray-800' : 'bg-white'} border-b border-gray-200`}>
          <div className="px-6 py-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
              <div>
                <h2 className={`text-xl font-bold ${false ? 'text-white' : 'text-gray-900'}`}>
                  {selectedTarget.name}
                </h2>
                <p className={`text-xs ${false ? 'text-gray-400' : 'text-gray-600'} mt-0.5`}>
                  {selectedTarget.category_name || 'Medicine'}
                </p>
              </div>
              <div className="flex flex-col md:items-end gap-2">
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    false ? 'bg-gray-700 text-gray-200' : 'bg-blue-50 text-blue-700'
                  }`}>
                    Auto model selection
                  </span>
                  {activeModelType && (
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      false ? 'bg-purple-700 text-white' : 'bg-purple-100 text-purple-700'
                    }`}>
                      {getModelDisplayName(activeModelType)}
                    </span>
                  )}
                </div>
                {trainedAtValue && (
                  <p className={`text-xs ${false ? 'text-gray-400' : 'text-gray-500'}`}>
                    Last trained: {formatTimestamp(trainedAtValue)}
                  </p>
                )}
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
              <div className={`px-3 py-2 rounded-lg ${false ? 'bg-gray-700' : 'bg-green-50'} border ${false ? 'border-gray-600' : 'border-green-200'}`}>
                <div className={`text-xs ${false ? 'text-gray-400' : 'text-gray-600'}`}>Unit Price</div>
                <div className={`text-base font-bold ${false ? 'text-green-300' : 'text-green-700'}`}>
                  ₱{(forecasts?.unit_price || Number(selectedTarget.unit_price || 0)).toFixed(2)}
                </div>
              </div>
              <div className={`px-3 py-2 rounded-lg ${false ? 'bg-gray-700' : 'bg-orange-50'} border ${false ? 'border-gray-600' : 'border-orange-200'}`}>
                <div className={`text-xs ${false ? 'text-gray-400' : 'text-gray-600'}`}>Cost Price</div>
                <div className={`text-base font-bold ${false ? 'text-orange-300' : 'text-orange-700'}`}>
                  ₱{(forecasts?.cost_price || Number(selectedTarget.cost_price || 0)).toFixed(2)}
                </div>
              </div>
              <div className={`px-3 py-2 rounded-lg ${false ? 'bg-gray-700' : 'bg-blue-50'} border ${false ? 'border-gray-600' : 'border-blue-200'}`}>
                <div className={`text-xs ${false ? 'text-gray-400' : 'text-gray-600'}`}>Daily Sales</div>
                <div className={`text-base font-bold ${false ? 'text-white' : 'text-gray-900'}`}>
                  {Math.round(Number(selectedTarget.avg_daily_sales || 0))}
                </div>
                <div className={`text-xs ${false ? 'text-gray-500' : 'text-gray-500'}`}>units</div>
              </div>
              {(activeModelType || accuracyValue !== null || maeValue !== null || rmseValue !== null) && (
                <>
                  <div className={`px-3 py-2 rounded-lg ${false ? 'bg-gray-700' : 'bg-purple-50'} border ${false ? 'border-gray-600' : 'border-purple-200'}`}>
                    <div className={`text-xs ${false ? 'text-gray-400' : 'text-gray-600'}`}>Model Type</div>
                    <div className={`text-base font-bold ${false ? 'text-purple-300' : 'text-purple-700'}`}>
                      {getModelDisplayName(activeModelType)}
                    </div>
                  </div>
                  <div className={`px-3 py-2 rounded-lg ${
                    (Number(accuracyValue || 0)) >= 80 
                      ? (false ? 'bg-gray-700' : 'bg-green-50') 
                      : (Number(accuracyValue || 0)) >= 60
                      ? (false ? 'bg-gray-700' : 'bg-yellow-50')
                      : (false ? 'bg-gray-700' : 'bg-red-50')
                  } border ${
                    (Number(accuracyValue || 0)) >= 80 
                      ? (false ? 'border-gray-600' : 'border-green-200') 
                      : (Number(accuracyValue || 0)) >= 60
                      ? (false ? 'border-gray-600' : 'border-yellow-200')
                      : (false ? 'border-gray-600' : 'border-red-200')
                  }`}>
                    <div className={`text-xs ${false ? 'text-gray-400' : 'text-gray-600'}`}>Accuracy</div>
                    <div className={`text-base font-bold ${
                      (Number(accuracyValue || 0)) >= 80 
                        ? (false ? 'text-green-300' : 'text-green-700') 
                        : (Number(accuracyValue || 0)) >= 60
                        ? (false ? 'text-yellow-300' : 'text-yellow-700')
                        : (false ? 'text-red-300' : 'text-red-700')
                    }`}>
                      {typeof accuracyValue === 'number' ? `${accuracyValue.toFixed(2)}%` : 'N/A'}
                    </div>
                    <div className={`text-[11px] ${false ? 'text-gray-500' : 'text-gray-500'}`}>
                      Accuracy = 100 − (MAE ÷ avg demand × 100)
                    </div>
                  </div>
                  {typeof mapeValue === 'number' && (() => {
                    const bgColor = mapeValue <= 10
                      ? (false ? 'bg-gray-700' : 'bg-emerald-50')
                      : mapeValue <= 20
                        ? (false ? 'bg-gray-700' : 'bg-yellow-50')
                        : (false ? 'bg-gray-700' : 'bg-red-50');
                    const borderColor = mapeValue <= 10
                      ? (false ? 'border-gray-600' : 'border-emerald-200')
                      : mapeValue <= 20
                        ? (false ? 'border-gray-600' : 'border-yellow-200')
                        : (false ? 'border-gray-600' : 'border-red-200');
                    const textColor = mapeValue <= 10
                      ? (false ? 'text-emerald-300' : 'text-emerald-700')
                      : mapeValue <= 20
                        ? (false ? 'text-yellow-300' : 'text-yellow-700')
                        : (false ? 'text-red-300' : 'text-red-700');
                    return (
                      <div className={`px-3 py-2 rounded-lg border ${bgColor} ${borderColor}`}>
                        <div className={`text-xs ${false ? 'text-gray-400' : 'text-gray-600'}`}>MAPE</div>
                        <div className={`text-base font-bold ${textColor}`}>
                          {mapeValue.toFixed(2)}%
                        </div>
                        <div className={`text-[11px] ${false ? 'text-gray-500' : 'text-gray-500'}`}>
                          Mean Absolute Percentage Error
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bulk Train Confirmation Modal */}
      {showBulkTrainConfirm && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className={`${false ? 'bg-gray-800' : 'bg-white'} rounded-lg max-w-md w-full shadow-xl`}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className={`text-xl font-bold ${false ? 'text-white' : 'text-gray-900'}`}>
                  ⚠️ Confirm Bulk Retraining
                </h3>
                <button
                  onClick={() => {
                    if (bulkTraining) return;
                    setShowBulkTrainConfirm(false);
                    setBulkTrainPassword('');
                    setBulkTrainPasswordError('');
                  }}
                  className={`text-2xl ${false ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  ×
                </button>
              </div>

              <div className="mb-4">
                <p className={`text-sm ${false ? 'text-gray-300' : 'text-gray-600'} mb-4`}>
                  Retraining the top 50 products will update all forecasting models with the latest sales data. This may take a few minutes.
                </p>
                <p className={`text-sm font-semibold ${false ? 'text-yellow-400' : 'text-orange-600'} mb-4`}>
                  ⚠️ Please confirm to proceed with bulk retraining.
                </p>
                <div className="mb-4">
                  <label className={`block text-sm font-medium mb-2 ${false ? 'text-gray-300' : 'text-gray-700'}`}>
                    Enter password to confirm: <span className="text-xs text-gray-500">(Hint: "TRAIN")</span>
                  </label>
                  <input
                    type="password"
                    value={bulkTrainPassword}
                    onChange={(e) => {
                      setBulkTrainPassword(e.target.value);
                      setBulkTrainPasswordError('');
                    }}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleBulkTrainConfirm();
                      }
                    }}
                    placeholder="Enter password"
                    className={`w-full px-4 py-2 border rounded-lg ${
                      bulkTrainPasswordError
                        ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                        : false
                          ? 'border-gray-600 bg-gray-700 text-white focus:border-blue-500'
                          : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                    } focus:outline-none focus:ring-2`}
                    autoFocus
                  />
                  {bulkTrainPasswordError && (
                    <p className="mt-2 text-sm text-red-500">{bulkTrainPasswordError}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3">
                <button
                  onClick={() => {
                    if (bulkTraining) return;
                    setShowBulkTrainConfirm(false);
                    setBulkTrainPassword('');
                    setBulkTrainPasswordError('');
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium ${
                    false
                      ? 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  } ${bulkTraining ? 'opacity-50 cursor-not-allowed' : ''}`}
                  disabled={bulkTraining}
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkTrainConfirm}
                  disabled={!bulkTrainPassword.trim() || bulkTraining}
                  className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center ${
                    !bulkTrainPassword.trim() || bulkTraining
                      ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                      : 'bg-orange-600 text-white hover:bg-orange-700'
                  }`}
                >
                  {bulkTraining ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Retraining...
                    </>
                  ) : (
                    'Confirm & Retrain Top 50'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedTarget && latestComparisonPoint && (
        <div className={`${false ? 'bg-gray-800' : 'bg-white'} border-b border-gray-200`}>
          <div className="px-6 pb-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className={`px-4 py-3 rounded-lg ${false ? 'bg-gray-700 border-gray-600' : 'bg-blue-50 border-blue-200'} border`}>
                <div className={`text-xs ${false ? 'text-gray-300' : 'text-blue-700'} uppercase tracking-wide`}>
                  Latest Actual ({latestComparisonDateLabel || 'Recent'})
                </div>
                <div className={`text-2xl font-bold ${false ? 'text-white' : 'text-blue-900'}`}>
                  {latestActualUnits != null ? Number(latestActualUnits).toFixed(0) : '—'} units
                </div>
                <div className={`text-xs ${false ? 'text-gray-400' : 'text-blue-600'}`}>
                  Captured from recent sales window
                </div>
              </div>
              <div className={`px-4 py-3 rounded-lg ${false ? 'bg-gray-700 border-gray-600' : 'bg-purple-50 border-purple-200'} border`}>
                <div className={`text-xs ${false ? 'text-gray-300' : 'text-purple-700'} uppercase tracking-wide`}>
                  Predicted ({latestComparisonDateLabel || 'Recent'})
                </div>
                <div className={`text-2xl font-bold ${false ? 'text-white' : 'text-purple-900'}`}>
                  {latestPredictedUnits != null ? Number(latestPredictedUnits).toFixed(0) : '—'} units
                </div>
                <div className={`text-xs ${false ? 'text-gray-400' : 'text-purple-600'}`}>
                  Based on latest retrained model
                </div>
              </div>
              <div className={`px-4 py-3 rounded-lg ${false ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'} border`}>
                <div className={`text-xs ${false ? 'text-gray-300' : 'text-gray-700'} uppercase tracking-wide`}>
                  Actual vs Predicted
                </div>
                <div className={`text-2xl font-bold ${
                  latestDeltaUnits > 0
                    ? (false ? 'text-emerald-300' : 'text-emerald-600')
                    : latestDeltaUnits < 0
                      ? (false ? 'text-red-300' : 'text-red-600')
                      : (false ? 'text-white' : 'text-gray-900')
                }`}>
                  {latestDeltaUnits != null ? `${latestDeltaUnits > 0 ? '+' : ''}${latestDeltaUnits.toFixed(0)} units` : '—'}
                </div>
                <div className={`text-xs ${false ? 'text-gray-400' : 'text-gray-500'}`}>
                  {latestDeltaUnits > 0 ? 'Actual demand above plan' : latestDeltaUnits < 0 ? 'Actual demand below plan' : 'Perfect alignment'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Model Metrics */}
      {selectedTarget && (typeof maeValue === 'number' || typeof rmseValue === 'number') && (
        <div className={`${false ? 'bg-gray-800' : 'bg-white'} border-t border-gray-200`}>
          <div className="px-6 py-3">
            <div className="flex items-center justify-between">
              <h3 className={`text-sm font-semibold ${false ? 'text-white' : 'text-gray-900'}`}>
                Model Metrics
              </h3>
              <div className="flex items-center gap-4 text-xs">
                {typeof maeValue === 'number' && (
                  <div className="flex items-center gap-2">
                    <span className={`${false ? 'text-gray-400' : 'text-gray-600'}`}>MAE:</span>
                    <span className={`font-semibold ${false ? 'text-blue-300' : 'text-blue-700'}`}>
                      {maeValue.toFixed(4)}
                    </span>
                    <span className={`${false ? 'text-gray-500' : 'text-gray-500'}`} title="MAE = (1/n) × Σ|Actual - Predicted|">
                      (Mean Absolute Error)
                    </span>
                  </div>
                )}
                {typeof rmseValue === 'number' && (
                  <div className="flex items-center gap-2">
                    <span className={`${false ? 'text-gray-400' : 'text-gray-600'}`}>RMSE:</span>
                    <span className={`font-semibold ${false ? 'text-red-300' : 'text-red-700'}`}>
                      {rmseValue.toFixed(4)}
                    </span>
                    <span className={`${false ? 'text-gray-500' : 'text-gray-500'}`} title="RMSE = √[(1/n) × Σ(Actual - Predicted)²]">
                      (Root Mean Squared Error)
                    </span>
                  </div>
                )}
              </div>
            </div>
            {/* Comparison moved to modal */}
          </div>
        </div>
      )}

      {/* Chart Section */}
      {selectedTarget ? (
        <div className={`${false ? 'bg-gray-900' : 'bg-gray-50'}`}>
          <div className="px-6 py-4">
            {/* Chart Container */}
            <div className={`${false ? 'bg-gray-800' : 'bg-white'} rounded-lg border border-gray-200`}>
              <div className="h-[500px] p-4">
                <Line
                    ref={chartRef}
                    data={generateMultiAxisData(selectedTarget) || { labels: [], datasets: [] }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        layout: {
                          padding: {
                            top: 10,
                            bottom: 10,
                            left: 10,
                            right: 10
                          }
                        },
                        interaction: {
                          intersect: false,
                          mode: 'index'
                        },
                        plugins: {
                          legend: {
                            display: true,
                            position: 'top',
                            labels: {
                              color: false ? '#ffffff' : '#374151',
                              usePointStyle: true,
                              padding: 20,
                              filter: (item) => item.text !== '' // Hide empty labels (like CI Upper)
                            }
                          },
                          zoom: {
                            zoom: {
                              wheel: {
                                enabled: false,
                              },
                              pinch: {
                                enabled: false
                              },
                              mode: 'x',
                              drag: {
                                enabled: true,
                                backgroundColor: 'rgba(54, 162, 235, 0.3)',
                                borderColor: 'rgba(54, 162, 235, 0.8)',
                                borderWidth: 1,
                              }
                            },
                            pan: {
                              enabled: false,
                              mode: 'x',
                            }
                          },
                          tooltip: {
                            backgroundColor: false ? 'rgba(0, 0, 0, 0.8)' : 'rgba(255, 255, 255, 0.9)',
                            titleColor: false ? '#ffffff' : '#374151',
                            bodyColor: false ? '#ffffff' : '#374151',
                            borderColor: false ? '#374151' : '#e5e7eb',
                            borderWidth: 1,
                            callbacks: {
                              title: (context) => {
                                const raw = context?.[0]?.label;
                                const date = raw instanceof Date ? raw : parseLocalISODate(raw);
                                if (isNaN(date.getTime())) return '';
                                const opts = (timeframe === 'MAX' || timeframe === '1Y')
                                  ? { year: 'numeric', month: 'short', day: 'numeric' }
                                  : { month: 'short', day: 'numeric' };
                                return date.toLocaleDateString('en-US', opts);
                              },
                              label: (context) => {
                                const y = context?.parsed?.y;
                                if (y === null || y === undefined || Number.isNaN(y)) return '';
                                const datasetLabel = context.dataset.label || '';
                                if (!datasetLabel) return '';
                                const raw = context?.label;
                                const date = raw instanceof Date ? raw : parseLocalISODate(raw);
                                const normalized = normalizeDate(date);
                                const key = normalized.getTime();
                                if (datasetLabel === 'Actual Sales (Units)' || datasetLabel === 'Historical Sales (Units)' || datasetLabel === 'Recent Actual Window') {
                                  const actualPoint = actualLookup.get(key);
                                  if (actualPoint) {
                                    const revenue = actualPoint.revenue ?? actualPoint.sales * unitPriceForTooltips;
                                    const cost = actualPoint.sales * costPriceForTooltips;
                                    const profit = revenue - cost;
                                    return [
                                      `Actual: ${actualPoint.sales} units`,
                                      `Revenue: ₱${revenue.toFixed(2)}`,
                                      `Profit: ₱${profit.toFixed(2)}`
                                    ];
                                  }
                                  return `Actual: ${Number(y).toFixed(0)} units`;
                                }
                                if (datasetLabel === 'Predicted Sales (Units)' || datasetLabel === 'Forecast (Units)') {
                                  const predictedValue = predictedLookup.get(key) ?? Number(y);
                                  const estRevenue = predictedValue * unitPriceForTooltips;
                                  const estProfit = predictedValue * profitPerUnitForTooltips;
                                  return [
                                    `Predicted: ${predictedValue.toFixed(0)} units`,
                                    `Expected Revenue: ₱${estRevenue.toFixed(2)}`,
                                    `Expected Profit: ₱${estProfit.toFixed(2)}`
                                  ];
                                }
                                if (datasetLabel === 'Profit (₱)' || datasetLabel === 'Forecast Profit (₱)') {
                                  return `Profit: ₱${Number(y).toFixed(2)}`;
                                }
                                if (datasetLabel === 'Forecast Confidence') {
                                  return `Confidence floor: ${Number(y).toFixed(0)} units`;
                                }
                                return `${datasetLabel}: ${Number(y).toFixed(2)}`;
                              }
                            }
                          }
                        },
                        scales: {
                          x: {
                            type: 'category',
                            grid: {
                              color: false ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
                              drawBorder: false
                            },
                            ticks: {
                              color: false ? '#9ca3af' : '#6b7280',
                              maxTicksLimit: 8,
                              callback: function(value, index) {
                                const lbl = (this && this.chart && this.chart.data && this.chart.data.labels) ? this.chart.data.labels[index] : null;
                                const date = lbl instanceof Date ? lbl : parseLocalISODate(lbl || Date.now());
                                if (timeframe === '1H') {
                                  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                                } else if (timeframe === '4H') {
                                  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                                } else {
                                  const opts = (timeframe === 'MAX' || timeframe === '1Y')
                                    ? { year: 'numeric', month: 'short', day: 'numeric' }
                                    : { month: 'short', day: 'numeric' };
                                  return date.toLocaleDateString('en-US', opts);
                                }
                              }
                            }
                          },
                          y: {
                            type: 'linear',
                            display: true,
                            position: 'left',
                            grid: {
                              color: false ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
                              drawBorder: false
                            },
                            ticks: {
                              color: false ? '#9ca3af' : '#6b7280',
                              callback: function(value) {
                                // Units axis
                                const v = Number(value);
                                return Number.isFinite(v) ? Math.round(v).toString() : '';
                              }
                            },
                            beginAtZero: true,
                            grace: '5%',
                            suggestedMin: 0,
                            suggestedMax: (() => {
                              try {
                                const actualMaxUnits = currentActualSeries.reduce((m, d) => Math.max(m, Number(d.sales) || 0), 0);
                                const predictedValues = Array.from(predictedLookup.values());
                                const predictedMaxUnits = predictedValues.reduce((m, v) => Math.max(m, Number(v) || 0), 0);
                                const maxVal = Math.max(actualMaxUnits, predictedMaxUnits);
                                return maxVal > 0 ? Math.max(10, Math.ceil(maxVal * 1.1)) : undefined;
                              } catch (_) {
                                return undefined;
                              }
                            })()
                          },
                          y1: {
                            type: 'linear',
                            display: true,
                            position: 'right',
                            grid: {
                              drawOnChartArea: false,
                            },
                            ticks: {
                              color: false ? '#9ca3af' : '#6b7280',
                              callback: function(value) {
                                const v = Number(value);
                                if (!Number.isFinite(v)) return '';
                                const abs = Math.abs(v);
                                if (abs >= 1_000_000) return '₱' + (v/1_000_000).toFixed(1) + 'M';
                                if (abs >= 1000) return '₱' + (v/1000).toFixed(1) + 'K';
                                return '₱' + v.toFixed(2);
                              }
                            },
                            beginAtZero: true,
                            grace: '5%',
                            suggestedMin: 0,
                            suggestedMax: (() => {
                              try {
                                const actualProfitMax = currentActualSeries.reduce((m, d) => Math.max(m, Number(d.profit) || 0), 0);
                                const predictedProfitMax = Array.from(predictedLookup.values()).reduce((m, v) => Math.max(m, Number(v) * profitPerUnitForTooltips || 0), 0);
                                const maxVal = Math.max(actualProfitMax, predictedProfitMax);
                                return maxVal > 0 ? Math.max(10, Math.ceil(maxVal * 1.1)) : undefined;
                              } catch (_) {
                                return undefined;
                              }
                            })()
                          },
                        },
                        elements: {
                          point: {
                            radius: 0,
                            hoverRadius: 6
                          }
                        }
                      }}
                    />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className={`${false ? 'bg-gray-900' : 'bg-gray-50'} py-12`}>
          <div className="text-center px-6">
            <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-blue-100 to-purple-100 rounded-full flex items-center justify-center">
              <BarChart3 className="w-8 h-8 text-blue-600" />
            </div>
            <h3 className={`text-xl font-bold mb-2 ${false ? 'text-white' : 'text-gray-900'}`}>
              No Product Selected
            </h3>
            <p className={`text-sm ${false ? 'text-gray-400' : 'text-gray-600'}`}>
              Select a product from the dropdown above to view forecasting analysis
            </p>
          </div>
        </div>
      )}


      {/* Train Model Confirmation Modal */}
      {showTrainConfirm && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className={`${false ? 'bg-gray-800' : 'bg-white'} rounded-lg max-w-md w-full shadow-xl`}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className={`text-xl font-bold ${false ? 'text-white' : 'text-gray-900'}`}>
                  ⚠️ Confirm Model Training
                </h3>
                <button
                  onClick={() => {
                    setShowTrainConfirm(false);
                    setTrainPassword('');
                    setTrainPasswordError('');
                  }}
                  className={`text-2xl ${false ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  ×
                </button>
              </div>
              
              <div className="mb-4">
                <p className={`text-sm ${false ? 'text-gray-300' : 'text-gray-600'} mb-4`}>
                  Training the model will retrain the forecasting model for <strong>{selectedTarget?.name}</strong> using the latest historical data. This process may take a few moments.
                </p>
                <p className={`text-sm font-semibold ${false ? 'text-yellow-400' : 'text-orange-600'} mb-4`}>
                  ⚠️ This action cannot be undone. Are you sure you want to proceed?
                </p>
                <div className="mb-4">
                  <label className={`block text-sm font-medium mb-2 ${false ? 'text-gray-300' : 'text-gray-700'}`}>
                    Enter password to confirm: <span className="text-xs text-gray-500">(Hint: "TRAIN")</span>
                  </label>
                  <input
                    type="password"
                    value={trainPassword}
                    onChange={(e) => {
                      setTrainPassword(e.target.value);
                      setTrainPasswordError('');
                    }}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleTrainConfirm();
                      }
                    }}
                    placeholder="Enter password"
                    className={`w-full px-4 py-2 border rounded-lg ${
                      trainPasswordError
                        ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                        : false
                          ? 'border-gray-600 bg-gray-700 text-white focus:border-blue-500'
                          : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                    } focus:outline-none focus:ring-2`}
                    autoFocus
                  />
                  {trainPasswordError && (
                    <p className="mt-2 text-sm text-red-500">{trainPasswordError}</p>
                  )}
                </div>
                
                {/* Training Progress Bar */}
                {training && (
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-sm font-medium ${false ? 'text-gray-300' : 'text-gray-700'}`}>
                        Training in progress...
                      </span>
                      <span className={`text-sm font-semibold ${false ? 'text-blue-400' : 'text-blue-600'}`}>
                        {Math.round(trainingProgress)}%
                      </span>
                    </div>
                    <div className={`w-full h-3 rounded-full overflow-hidden ${false ? 'bg-gray-700' : 'bg-gray-200'}`}>
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-purple-600 transition-all duration-300 ease-out"
                        style={{ width: `${Math.min(100, Math.max(0, trainingProgress))}%` }}
                      />
                    </div>
                    <p className={`text-xs mt-2 ${false ? 'text-gray-400' : 'text-gray-500'}`}>
                      {trainingProgress < 30 && 'Loading historical data...'}
                      {trainingProgress >= 30 && trainingProgress < 60 && 'Training SARIMAX model...'}
                      {trainingProgress >= 60 && trainingProgress < 90 && 'Training Exponential Smoothing model...'}
                      {trainingProgress >= 90 && trainingProgress < 100 && 'Finalizing model...'}
                      {trainingProgress >= 100 && 'Training complete!'}
                    </p>
                  </div>
                )}
              </div>
              
              <div className="flex items-center justify-end space-x-3">
                <button
                  onClick={() => {
                    if (!training) {
                      setShowTrainConfirm(false);
                      setTrainPassword('');
                      setTrainPasswordError('');
                    }
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium ${
                    false
                      ? 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  } ${training ? 'opacity-50 cursor-not-allowed' : ''}`}
                  disabled={training}
                >
                  Cancel
                </button>
                <button
                  onClick={handleTrainConfirm}
                  disabled={!trainPassword.trim() || training}
                  className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center ${
                    !trainPassword.trim() || training
                      ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                      : 'bg-orange-600 text-white hover:bg-orange-700'
                  }`}
                >
                  {training ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Training...
                    </>
                  ) : (
                    'Confirm & Train'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Chart Analyzer Modal */}
      {showAnalyzer && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-bold text-gray-900">
                  📊 Chart Analysis - {selectedTarget?.name || 'Selected Product'}
                </h3>
                <button
                  onClick={() => setShowAnalyzer(false)}
                  className="px-4 py-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
                >
                  ✕ Close
                </button>
              </div>
            </div>
            
            <div className="p-6">
              {selectedTarget ? (
                <>
                  {/* Sales Overview */}
                  <div className="mb-6 bg-white rounded-lg p-6 border border-gray-200">
                    <h4 className="text-lg font-bold text-gray-900 mb-4">Sales Overview</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-gray-50 rounded-lg p-4">
                        <h5 className="text-sm font-medium text-gray-600 mb-1">Average Daily Sales</h5>
                        <p className="text-2xl font-bold text-gray-900">
                          {analysisData?.keyMetrics?.averageSales || Math.round(Number(selectedTarget.avg_daily_sales || 0))} units
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          Trend: <span className={(analysisData?.keyMetrics?.salesTrend || 'increasing') === 'increasing' ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                            {(analysisData?.keyMetrics?.salesTrend || 'increasing') === 'increasing' ? 'Growing' : 'Declining'}
                          </span>
                        </p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-4">
                        <h5 className="text-sm font-medium text-gray-600 mb-1">Demand Level</h5>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                            (analysisData?.demandLevel || 'Medium') === 'High' ? 'bg-green-100 text-green-700' :
                            (analysisData?.demandLevel || 'Medium') === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {analysisData?.demandLevel || 'Medium'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">{analysisData?.demandExplanation || 'Moderate demand level'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Profit Analysis */}
                  <div className="mb-6 bg-white rounded-lg p-6 border border-gray-200">
                    <h4 className="text-lg font-bold text-gray-900 mb-4">Profit Analysis</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-gray-50 rounded-lg p-4 text-center">
                        <h5 className="text-sm font-medium text-gray-600 mb-2">Profit Margin</h5>
                        <div className={`text-2xl font-bold ${(analysisData?.keyMetrics?.profitMargin || 0) > 20 ? 'text-green-600' : (analysisData?.keyMetrics?.profitMargin || 0) > 10 ? 'text-yellow-600' : 'text-red-600'}`}>
                          {analysisData?.keyMetrics?.profitMargin || Math.round(((Number(selectedTarget.unit_price || 0) - Number(selectedTarget.cost_price || 0)) / Number(selectedTarget.unit_price || 1)) * 100)}%
                        </div>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-4 text-center">
                        <h5 className="text-sm font-medium text-gray-600 mb-2">Daily Profit</h5>
                        <div className="text-2xl font-bold text-green-600">
                          ₱{(() => {
                            // Daily Profit = (unit_price - cost_price) × daily_sales
                            const unitPrice = forecasts?.unit_price || Number(selectedTarget.unit_price || 0);
                            const costPrice = forecasts?.cost_price || Number(selectedTarget.cost_price || 0);
                            const dailySales = Number(selectedTarget.avg_daily_sales || 0);
                            const profitPerUnit = unitPrice - costPrice;
                            const dailyProfit = profitPerUnit * dailySales;
                            return dailyProfit.toFixed(2);
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>


                  {/* Forecast Accuracy */}
                  <div className="mb-6 bg-white rounded-lg p-6 border border-gray-200">
                    <h4 className="text-lg font-bold text-gray-900 mb-4">Forecast Accuracy</h4>
                    {accuracy && accuracy.accuracy_percentage ? (
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-medium text-gray-600">Model Accuracy</span>
                          <span className={`text-xl font-bold ${Number(accuracy.accuracy_percentage) >= 80 ? 'text-green-600' : Number(accuracy.accuracy_percentage) >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>
                            {Number(accuracy.accuracy_percentage).toFixed(1)}%
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
                          <div 
                            className={`h-3 rounded-full transition-all ${Number(accuracy.accuracy_percentage) >= 80 ? 'bg-green-500' : Number(accuracy.accuracy_percentage) >= 60 ? 'bg-yellow-500' : 'bg-red-500'}`}
                            style={{width: `${Math.min(Number(accuracy.accuracy_percentage), 100)}%`}}
                          ></div>
                        </div>
                        <p className="text-xs text-gray-500">
                          {Number(accuracy.accuracy_percentage) >= 80 ? 'High accuracy - Reliable forecasts' : 
                           Number(accuracy.accuracy_percentage) >= 60 ? 'Moderate accuracy - Use with caution' : 
                           'Low accuracy - Consider retraining model'}
                        </p>
                      </div>
                    ) : (
                      <p className="text-gray-500 text-sm">Accuracy will be shown after model training completes.</p>
                    )}
                  </div>

                  {/* Action Items */}
                  <div className="bg-gradient-to-r from-gray-50 to-slate-50 rounded-lg p-6 border border-gray-200">
                    <h4 className="text-xl font-bold text-gray-900 mb-4">📋 Immediate Action Items</h4>
                    <div className="space-y-3">
                      {(analysisData?.demandLevel || 'Medium') === 'Low' && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                          <h5 className="font-semibold text-yellow-800 mb-2">⚠️ Low Demand Alert</h5>
                          <ul className="text-yellow-700 text-sm space-y-1">
                            <li>• Consider promotional campaigns</li>
                            <li>• Review pricing strategy</li>
                            <li>• Check market competition</li>
                          </ul>
                        </div>
                      )}
                      {(analysisData?.keyMetrics?.profitMargin || 0) < 15 && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                          <h5 className="font-semibold text-red-800 mb-2">⚠️ Low Profit Alert</h5>
                          <ul className="text-red-700 text-sm space-y-1">
                            <li>• Review cost structure</li>
                            <li>• Consider price adjustment</li>
                            <li>• Negotiate with suppliers</li>
                          </ul>
                        </div>
                      )}
                      {(analysisData?.keyMetrics?.salesTrend || 'increasing') === 'decreasing' && (
                        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                          <h5 className="font-semibold text-orange-800 mb-2">⚠️ Declining Sales Alert</h5>
                        ``  <ul className="text-orange-700 text-sm space-y-1">
                            <li>• Investigate market conditions</li>
                            <li>• Check product quality</li>
                            <li>• Consider marketing boost</li>
                          </ul>
                        </div>
                      )}
                      {(analysisData?.demandLevel || 'Medium') === 'High' && (analysisData?.keyMetrics?.profitMargin || 0) > 20 && (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                          <h5 className="font-semibold text-green-800 mb-2">✅ Excellent Performance</h5>
                          <ul className="text-green-700 text-sm space-y-1">
                            <li>• Consider increasing inventory</li>
                            <li>• Maintain current strategy</li>
                            <li>• Look for expansion opportunities</li>
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">📊</div>
                  <h4 className="text-xl font-semibold text-gray-900 mb-2">No Chart Data Available</h4>
                  <p className="text-gray-600 mb-4">Please select a product and generate a forecast to see the analysis.</p>
                  <button
                    onClick={() => setShowAnalyzer(false)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Category Analysis Modal */}
      {showCategoryAnalysis && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className={`${false ? 'bg-gray-900' : 'bg-white'} rounded-lg max-w-6xl w-full max-h-[90vh] overflow-y-auto shadow-2xl`}>
            <div className={`sticky top-0 p-6 border-b ${false ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'}`}>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className={`text-2xl font-bold ${false ? 'text-white' : 'text-gray-900'}`}>
                    📊 Category Performance Analysis
                  </h3>
                  <p className={`text-sm ${false ? 'text-gray-400' : 'text-gray-600'}`}>
                    Real-time insights powered by aggregated sales, revenue, and profit data
                  </p>
                </div>
                <button
                  onClick={() => setShowCategoryAnalysis(false)}
                  className={`px-4 py-2 rounded-lg font-medium ${
                    false ? 'bg-gray-800 text-gray-200 hover:bg-gray-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  ✕ Close
                </button>
              </div>
              <div className="flex flex-wrap gap-2 mt-4">
                {[
                  { key: 'overview', label: 'Overview' },
                  { key: 'categories', label: 'Category Table' },
                  { key: 'products', label: 'Top Products' }
                ].map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setCategoryModalTab(tab.key)}
                    className={`px-4 py-2 rounded-full text-sm font-semibold transition ${
                      categoryModalTab === tab.key
                        ? 'bg-blue-600 text-white shadow'
                        : false
                          ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-6 space-y-6">
              {!categoryPerformance.length ? (
                <div className={`text-center py-12 rounded-lg border ${false ? 'border-gray-700 text-gray-300' : 'border-gray-200 text-gray-500'}`}>
                  <p className="text-lg font-semibold mb-2">No category data available</p>
                  <p>Please load more products or adjust your filters to view category insights.</p>
                </div>
              ) : (
                <>
                  {categoryModalTab === 'overview' && (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                        <div className={`p-4 rounded-xl border ${false ? 'bg-gray-800 border-gray-700' : 'bg-blue-50 border-blue-200'}`}>
                          <p className={`text-xs uppercase tracking-wide ${false ? 'text-gray-400' : 'text-blue-700'}`}>Categories</p>
                          <p className={`text-2xl font-bold ${false ? 'text-white' : 'text-blue-900'}`}>
                            {categorySummary.totalCategories}
                          </p>
                          <p className={`text-xs ${false ? 'text-gray-500' : 'text-blue-600'}`}>with active products</p>
                        </div>
                        <div className={`p-4 rounded-xl border ${false ? 'bg-gray-800 border-gray-700' : 'bg-purple-50 border-purple-200'}`}>
                          <p className={`text-xs uppercase tracking-wide ${false ? 'text-gray-400' : 'text-purple-700'}`}>Products</p>
                          <p className={`text-2xl font-bold ${false ? 'text-white' : 'text-purple-900'}`}>
                            {categorySummary.totalProducts}
                          </p>
                          <p className={`text-xs ${false ? 'text-gray-500' : 'text-purple-600'}`}>total in analysis</p>
                        </div>
                        <div className={`p-4 rounded-xl border ${false ? 'bg-gray-800 border-gray-700' : 'bg-green-50 border-green-200'}`}>
                          <p className={`text-xs uppercase tracking-wide ${false ? 'text-gray-400' : 'text-green-700'}`}>Daily Revenue</p>
                          <p className={`text-2xl font-bold ${false ? 'text-white' : 'text-green-900'}`}>
                            {formatCurrency(categorySummary.totalRevenue)}
                          </p>
                          <p className={`text-xs ${false ? 'text-gray-500' : 'text-green-600'}`}>aggregate across categories</p>
                        </div>
                        <div className={`p-4 rounded-xl border ${false ? 'bg-gray-800 border-gray-700' : 'bg-emerald-50 border-emerald-200'}`}>
                          <p className={`text-xs uppercase tracking-wide ${false ? 'text-gray-400' : 'text-emerald-700'}`}>Daily Profit</p>
                          <p className={`text-2xl font-bold ${false ? 'text-white' : 'text-emerald-900'}`}>
                            {formatCurrency(categorySummary.totalProfit)}
                          </p>
                          <p className={`text-xs ${false ? 'text-gray-500' : 'text-emerald-600'}`}>net of costs</p>
                        </div>
                        <div className={`p-4 rounded-xl border ${false ? 'bg-gray-800 border-gray-700' : 'bg-yellow-50 border-yellow-200'}`}>
                          <p className={`text-xs uppercase tracking-wide ${false ? 'text-gray-400' : 'text-yellow-700'}`}>Avg Margin</p>
                          <p className={`text-2xl font-bold ${false ? 'text-white' : 'text-yellow-900'}`}>
                            {categorySummary.avgMargin.toFixed(1)}%
                          </p>
                          <p className={`text-xs ${false ? 'text-gray-500' : 'text-yellow-600'}`}>weighted by revenue</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className={`p-5 rounded-xl border ${false ? 'bg-green-950/40 border-green-900' : 'bg-green-50 border-green-200'}`}>
                          <h4 className={`text-lg font-semibold mb-4 flex items-center gap-2 ${false ? 'text-green-100' : 'text-green-900'}`}>
                            💰 Most Profitable Categories
                          </h4>
                          <div className="space-y-3">
                            {topProfitCategories.map((category, index) => (
                              <div
                                key={category.name}
                                className={`flex items-center justify-between p-3 rounded-lg border ${
                                  false ? 'border-green-900 bg-green-900/30' : 'border-green-100 bg-white'
                                }`}
                              >
                                <div>
                                  <p className={`text-sm font-semibold ${false ? 'text-green-50' : 'text-gray-900'}`}>
                                    #{index + 1} {category.name}
                                  </p>
                                  <p className={`text-xs ${false ? 'text-green-200' : 'text-gray-500'}`}>
                                    {category.productCount} products • {formatNumber(category.totalSales, 0)} units/day
                                  </p>
                                </div>
                                <div className={`text-right ${false ? 'text-green-200' : 'text-green-700'}`}>
                                  <p className="text-sm font-bold">{formatCurrency(category.totalProfit)}</p>
                                  <p className="text-xs">daily profit</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className={`p-5 rounded-xl border ${false ? 'bg-blue-950/40 border-blue-900' : 'bg-blue-50 border-blue-200'}`}>
                          <h4 className={`text-lg font-semibold mb-4 flex items-center gap-2 ${false ? 'text-blue-100' : 'text-blue-900'}`}>
                            🔥 Most In-Demand Categories
                          </h4>
                          <div className="space-y-3">
                            {topDemandCategories.map((category, index) => (
                              <div
                                key={category.name}
                                className={`flex items-center justify-between p-3 rounded-lg border ${
                                  false ? 'border-blue-900 bg-blue-900/30' : 'border-blue-100 bg-white'
                                }`}
                              >
                                <div>
                                  <p className={`text-sm font-semibold ${false ? 'text-blue-50' : 'text-gray-900'}`}>
                                    #{index + 1} {category.name}
                                  </p>
                                  <p className={`text-xs ${false ? 'text-blue-200' : 'text-gray-500'}`}>
                                    {category.productCount} products • {formatCurrency(category.totalRevenue)} revenue
                                  </p>
                                </div>
                                <div className={`text-right ${false ? 'text-blue-200' : 'text-blue-700'}`}>
                                  <p className="text-sm font-bold">{formatNumber(category.totalSales, 0)} units</p>
                                  <p className="text-xs">per day</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {categoryModalTab === 'categories' && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="md:col-span-2">
                          <label className={`text-sm font-semibold mb-2 block ${false ? 'text-gray-300' : 'text-gray-700'}`}>
                            Search categories
                          </label>
                          <input
                            type="text"
                            placeholder="Search by category name..."
                            value={categorySearchTerm}
                            onChange={(e) => setCategorySearchTerm(e.target.value)}
                            className={`w-full px-4 py-2 rounded-lg border ${
                              false
                                ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500'
                                : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
                            }`}
                          />
                        </div>
                        <div>
                          <label className={`text-sm font-semibold mb-2 block ${false ? 'text-gray-300' : 'text-gray-700'}`}>
                            Filter by status
                          </label>
                          <select
                            value={categoryFilterMode}
                            onChange={(e) => setCategoryFilterMode(e.target.value)}
                            className={`w-full px-3 py-2 rounded-lg border ${
                              false
                                ? 'bg-gray-800 border-gray-700 text-white'
                                : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
                            }`}
                          >
                            <option value="all">All categories</option>
                            <option value="highDemand">High demand</option>
                            <option value="lowDemand">Low demand</option>
                            <option value="highProfit">High profit margin</option>
                            <option value="lowProfit">Low profit margin</option>
                            <option value="atRisk">At risk (low demand or margin)</option>
                          </select>
                        </div>
                      </div>

                      {filteredCategoryPerformance.length === 0 ? (
                        <div className={`text-center py-12 rounded-lg border ${false ? 'border-gray-700 text-gray-300' : 'border-gray-200 text-gray-500'}`}>
                          <p className="text-sm font-medium">No categories match the current filters.</p>
                          <p className="text-xs mt-1">Try clearing your search or selecting a different filter.</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto rounded-xl border border-gray-200">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className={`${false ? 'bg-gray-800 text-gray-300' : 'bg-gray-50 text-gray-500'}`}>
                              <tr>
                                {['Category', 'Products', 'Daily Sales', 'Daily Revenue', 'Daily Profit', 'Demand', 'Margin'].map(head => (
                                  <th key={head} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">
                                    {head}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className={false ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900'}>
                              {filteredCategoryPerformance.map(category => (
                                <tr key={category.name} className={`${false ? 'border-gray-800' : 'border-gray-100'} border-b`}>
                                  <td className="px-4 py-3">
                                    <p className="font-semibold">{category.name}</p>
                                    <p className="text-xs text-gray-500">Demand: {category.demandLevel}</p>
                                  </td>
                                  <td className="px-4 py-3 text-sm font-medium">{category.productCount}</td>
                                  <td className="px-4 py-3 text-sm font-medium">{formatNumber(category.totalSales, 0)} units</td>
                                  <td className="px-4 py-3 text-sm font-semibold text-green-600">{formatCurrency(category.totalRevenue)}</td>
                                  <td className="px-4 py-3 text-sm font-semibold text-emerald-600">{formatCurrency(category.totalProfit)}</td>
                                  <td className="px-4 py-3">
                                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                      category.demandLevel === 'High'
                                        ? 'bg-green-100 text-green-700'
                                        : category.demandLevel === 'Medium'
                                          ? 'bg-yellow-100 text-yellow-700'
                                          : 'bg-red-100 text-red-700'
                                    }`}>
                                      {category.demandLevel}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                      category.profitHealth === 'High'
                                        ? 'bg-emerald-100 text-emerald-700'
                                        : category.profitHealth === 'Medium'
                                          ? 'bg-yellow-100 text-yellow-700'
                                          : 'bg-red-100 text-red-700'
                                    }`}>
                                      {category.profitMargin.toFixed(1)}%
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {categoryModalTab === 'products' && (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div>
                          <label className={`text-sm font-semibold mb-2 block ${false ? 'text-gray-300' : 'text-gray-700'}`}>
                            Choose a category
                          </label>
                          <select
                            value={categoryDetailSelection || ''}
                            onChange={(e) => setCategoryDetailSelection(e.target.value)}
                            className={`w-full px-4 py-2 rounded-lg border ${
                              false
                                ? 'bg-gray-800 border-gray-700 text-white'
                                : 'bg-white border-gray-300 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
                            }`}
                          >
                            {(filteredCategoryPerformance.length ? filteredCategoryPerformance : categoryPerformance).map(category => (
                              <option key={category.name} value={category.name}>
                                {category.name} ({category.productCount} products)
                              </option>
                            ))}
                          </select>
                        </div>
                        {selectedCategoryDetail && (
                          <div className={`rounded-xl border p-4 ${
                            false ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'
                          }`}>
                            <p className={`text-xs uppercase tracking-wide mb-1 ${false ? 'text-gray-400' : 'text-gray-600'}`}>
                              Key Metrics
                            </p>
                            <div className="grid grid-cols-3 gap-3">
                              <div>
                                <p className={`text-xs ${false ? 'text-gray-400' : 'text-gray-500'}`}>Demand</p>
                                <p className={`text-lg font-bold ${
                                  selectedCategoryDetail.demandLevel === 'High'
                                    ? 'text-green-600'
                                    : selectedCategoryDetail.demandLevel === 'Medium'
                                      ? 'text-yellow-600'
                                      : 'text-red-600'
                                }`}>
                                  {selectedCategoryDetail.demandLevel}
                                </p>
                              </div>
                              <div>
                                <p className={`text-xs ${false ? 'text-gray-400' : 'text-gray-500'}`}>Avg Sales</p>
                                <p className={`text-lg font-bold ${false ? 'text-white' : 'text-gray-900'}`}>
                                  {formatNumber(selectedCategoryDetail.avgSales, 1)} units
                                </p>
                              </div>
                              <div>
                                <p className={`text-xs ${false ? 'text-gray-400' : 'text-gray-500'}`}>Margin</p>
                                <p className={`text-lg font-bold ${
                                  selectedCategoryDetail.profitHealth === 'High'
                                    ? 'text-emerald-600'
                                    : selectedCategoryDetail.profitHealth === 'Medium'
                                      ? 'text-yellow-600'
                                      : 'text-red-600'
                                }`}>
                                  {selectedCategoryDetail.profitMargin.toFixed(1)}%
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {selectedCategoryDetail ? (
                        <div>
                          <h4 className={`text-lg font-semibold mb-3 ${false ? 'text-white' : 'text-gray-900'}`}>
                            Top Products in {selectedCategoryDetail.name}
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {selectedCategoryDetail.topProducts.map((product, index) => (
                              <div
                                key={`${product.id}-${product.name}`}
                                className={`p-4 rounded-xl border ${
                                  false ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
                                }`}
                              >
                                <div className="flex items-center justify-between mb-3">
                                  <p className={`text-sm font-semibold ${false ? 'text-white' : 'text-gray-900'}`}>
                                    {product.name}
                                  </p>
                                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-semibold">
                                    #{index + 1}
                                  </span>
                                </div>
                                <div className="space-y-2 text-sm">
                                  <div className="flex justify-between">
                                    <span className={`${false ? 'text-gray-400' : 'text-gray-500'}`}>Daily Sales</span>
                                    <span className="font-semibold">{formatNumber(product.dailySales, 0)} units</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className={`${false ? 'text-gray-400' : 'text-gray-500'}`}>Revenue</span>
                                    <span className="font-semibold text-green-600">{formatCurrency(product.revenue)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className={`${false ? 'text-gray-400' : 'text-gray-500'}`}>Profit</span>
                                    <span className="font-semibold text-emerald-600">{formatCurrency(product.profit)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className={`${false ? 'text-gray-400' : 'text-gray-500'}`}>Margin</span>
                                    <span className="font-semibold">{product.profitMargin.toFixed(1)}%</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className={`text-center py-10 rounded-lg border ${false ? 'border-gray-700 text-gray-300' : 'border-gray-200 text-gray-500'}`}>
                          <p className="text-sm font-medium">Select a category to view detailed product performance.</p>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Model Comparison Modal */}
      {showModelCompare && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className={`${false ? 'bg-gray-800' : 'bg-white'} rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto`}>
            <div className={`sticky top-0 border-b p-6 ${false ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
              <h3 className={`text-2xl font-bold ${false ? 'text-white' : 'text-gray-900'}`}>
                🧪 Model Comparison
              </h3>
            </div>

            <div className="p-6">
              {!comparisonData || Object.keys(comparisonData || {}).length === 0 ? (
                <div className={`${false ? 'bg-yellow-900 border-yellow-700' : 'bg-yellow-50 border-yellow-200'} border rounded-lg px-4 py-3 mb-4`}>
                  <span className={`${false ? 'text-yellow-300' : 'text-yellow-800'}`}>
                    No comparison data yet. Retrain the product to generate SARIMAX/Prophet metrics.
                  </span>
                </div>
              ) : null}
              {(() => {
                const keys = comparisonEntries.map(([key]) => String(key).toLowerCase());
                if (!keys.includes('prophet')) {
                  return (
                    <div className={`${false ? 'bg-yellow-900 border-yellow-700' : 'bg-yellow-50 border-yellow-200'} border rounded-lg px-4 py-3 mb-4`}>
                      <span className={`${false ? 'text-yellow-300' : 'text-yellow-800'}`}>
                        Prophet results are not present. Retrain the product to include Prophet in comparison.
                      </span>
                    </div>
                  );
                }
                return null;
              })()}

              <div className="space-y-3">
                {comparisonEntries.map(([modelKey, metrics]) => {
                  const isBest = activeModelType && String(modelKey).toLowerCase() === String(activeModelType).toLowerCase();
                  return (
                  <div
                    key={modelKey}
                      className={`flex flex-wrap items-center justify-between gap-3 px-3 py-2 rounded-lg border ${
                        false ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'
                      } ${isBest ? 'ring-1 ring-blue-400' : ''}`}
                  >
                    <span className={`text-sm font-semibold ${false ? 'text-white' : 'text-gray-900'}`}>
                        {getModelDisplayName(modelKey)}{isBest ? ' (Best)' : ''}
                    </span>
                    <div className={`flex flex-wrap items-center gap-4 text-xs ${false ? 'text-gray-300' : 'text-gray-600'}`}>
                      {metrics?.accuracy !== undefined && (
                        <span>Accuracy: {Number(metrics.accuracy || 0).toFixed(2)}%</span>
                      )}
                      {metrics?.mae !== undefined && (
                        <span>MAE: {Number(metrics.mae || 0).toFixed(4)}</span>
                      )}
                      {metrics?.rmse !== undefined && (
                        <span>RMSE: {Number(metrics.rmse || 0).toFixed(4)}</span>
                      )}
                      {metrics?.trained_at && (
                        <span>Trained: {formatTimestamp(metrics.trained_at)}</span>
                      )}
                    </div>
                  </div>
                );
                })}
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setShowModelCompare(false)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium ${false ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Bulk Forecasting Results */}
      {showBulkResults && bulkResults && (
        <div className={`${false ? 'bg-gray-800' : 'bg-white'} border-t border-gray-200`}>
          <div className="px-6 py-4">
            <div className="flex items-center justify-between mb-6">
              <h3 className={`text-xl font-bold ${false ? 'text-white' : 'text-gray-900'}`}>
                {bulkResults.products ? 'All Products Forecast' : 'All Categories Forecast'}
              </h3>
              <button
                onClick={() => setShowBulkResults(false)}
                className={`p-2 rounded-lg ${false ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'} hover:bg-opacity-80`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            {/* Summary Statistics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className={`p-4 rounded-lg ${false ? 'bg-gray-700' : 'bg-gray-50'}`}>
                <div className={`text-sm ${false ? 'text-gray-400' : 'text-gray-600'}`}>
                  {bulkResults.products ? 'Total Products' : 'Total Categories'}
                </div>
                <div className={`text-2xl font-bold ${false ? 'text-white' : 'text-gray-900'}`}>
                  {bulkResults.products ? bulkResults.products.length : bulkResults.categories.length}
                </div>
              </div>
              
              <div className={`p-4 rounded-lg ${false ? 'bg-gray-700' : 'bg-gray-50'}`}>
                <div className={`text-sm ${false ? 'text-gray-400' : 'text-gray-600'}`}>Total Daily Revenue</div>
                <div className={`text-2xl font-bold ${false ? 'text-green-400' : 'text-green-500'}`}>
                  ₱{bulkResults.totalRevenue.toFixed(2)}
                </div>
              </div>
              
              <div className={`p-4 rounded-lg ${false ? 'bg-gray-700' : 'bg-gray-50'}`}>
                <div className={`text-sm ${false ? 'text-gray-400' : 'text-gray-600'}`}>Total Daily Profit</div>
                <div className={`text-2xl font-bold ${false ? 'text-blue-400' : 'text-blue-500'}`}>
                  ₱{bulkResults.totalProfit.toFixed(2)}
                </div>
              </div>
              
              <div className={`p-4 rounded-lg ${false ? 'bg-gray-700' : 'bg-gray-50'}`}>
                <div className={`text-sm ${false ? 'text-gray-400' : 'text-gray-600'}`}>Overall Profit Margin</div>
                <div className={`text-2xl font-bold ${
                  (bulkResults.totalProfit / bulkResults.totalRevenue) * 100 > 30 ? (false ? 'text-green-400' : 'text-green-500') : (false ? 'text-orange-400' : 'text-orange-500')
                }`}>
                  {((bulkResults.totalProfit / bulkResults.totalRevenue) * 100).toFixed(1)}%
                </div>
              </div>
            </div>
            
            {/* Product/Category Performance Breakdown */}
            {bulkResults.products && (
              <div className="space-y-4">
                <h4 className={`text-lg font-semibold ${false ? 'text-white' : 'text-gray-900'}`}>
                  Product Performance Breakdown
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                  <div className={`p-3 rounded-lg ${false ? 'bg-green-900' : 'bg-green-50'}`}>
                    <div className={`text-sm ${false ? 'text-green-300' : 'text-green-700'}`}>Fast Moving</div>
                    <div className={`text-xl font-bold ${false ? 'text-green-100' : 'text-green-800'}`}>
                      {bulkResults.fastMoving} products
                    </div>
                  </div>
                  
                  <div className={`p-3 rounded-lg ${false ? 'bg-red-900' : 'bg-red-50'}`}>
                    <div className={`text-sm ${false ? 'text-red-300' : 'text-red-700'}`}>Slow Moving</div>
                    <div className={`text-xl font-bold ${false ? 'text-red-100' : 'text-red-800'}`}>
                      {bulkResults.slowMoving} products
                    </div>
                  </div>
                  
                  <div className={`p-3 rounded-lg ${false ? 'bg-blue-900' : 'bg-blue-50'}`}>
                    <div className={`text-sm ${false ? 'text-blue-300' : 'text-blue-700'}`}>High Profit</div>
                    <div className={`text-xl font-bold ${false ? 'text-blue-100' : 'text-blue-800'}`}>
                      {bulkResults.highProfit} products
                    </div>
                  </div>
                </div>
                
                {/* Product List */}
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className={`border-b ${false ? 'border-gray-600' : 'border-gray-200'}`}>
                        <th className={`text-left py-3 px-4 ${false ? 'text-gray-300' : 'text-gray-600'}`}>Product</th>
                        <th className={`text-left py-3 px-4 ${false ? 'text-gray-300' : 'text-gray-600'}`}>Category</th>
                        <th className={`text-right py-3 px-4 ${false ? 'text-gray-300' : 'text-gray-600'}`}>Daily Sales</th>
                        <th className={`text-right py-3 px-4 ${false ? 'text-gray-300' : 'text-gray-600'}`}>Daily Revenue</th>
                        <th className={`text-right py-3 px-4 ${false ? 'text-gray-300' : 'text-gray-600'}`}>Profit Margin</th>
                        <th className={`text-center py-3 px-4 ${false ? 'text-gray-300' : 'text-gray-600'}`}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkResults.products.slice(0, 10).map((product, index) => (
                        <tr key={product.id} className={`border-b ${false ? 'border-gray-700' : 'border-gray-100'}`}>
                          <td className={`py-3 px-4 ${false ? 'text-white' : 'text-gray-900'}`}>
                            {product.name}
                          </td>
                          <td className={`py-3 px-4 ${false ? 'text-gray-300' : 'text-gray-600'}`}>
                            {product.category}
                          </td>
                          <td className={`py-3 px-4 text-right ${false ? 'text-white' : 'text-gray-900'}`}>
                            {product.avgDailySales.toFixed(0)} units
                          </td>
                          <td className={`py-3 px-4 text-right ${false ? 'text-white' : 'text-gray-900'}`}>
                            ₱{product.avgDailyRevenue.toFixed(2)}
                          </td>
                          <td className={`py-3 px-4 text-right ${
                            product.profitMargin > 30 ? (false ? 'text-green-400' : 'text-green-500') : (false ? 'text-orange-400' : 'text-orange-500')
                          }`}>
                            {product.profitMargin.toFixed(1)}%
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`px-2 py-1 rounded-full text-xs ${
                              product.demandLevel === 'Fast' ? (false ? 'bg-green-900 text-green-300' : 'bg-green-100 text-green-700') :
                              product.demandLevel === 'Medium' ? (false ? 'bg-yellow-900 text-yellow-300' : 'bg-yellow-100 text-yellow-700') :
                              (false ? 'bg-red-900 text-red-300' : 'bg-red-100 text-red-700')
                            }`}>
                              {product.demandLevel}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            
            {/* Category Results */}
            {bulkResults.categories && (
              <div className="space-y-4">
                <h4 className={`text-lg font-semibold ${false ? 'text-white' : 'text-gray-900'}`}>
                  Category Performance Breakdown
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {bulkResults.categories.map((category, index) => (
                    <div key={category.id} className={`p-4 rounded-lg border-2 ${
                      false ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'
                    }`}>
                      <div className="flex items-center justify-between mb-3">
                        <h5 className={`font-semibold ${false ? 'text-white' : 'text-gray-900'}`}>
                          {category.name}
                        </h5>
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          false ? 'bg-gray-600 text-gray-300' : 'bg-gray-200 text-gray-600'
                        }`}>
                          {category.productCount} products
                        </span>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className={`text-sm ${false ? 'text-gray-400' : 'text-gray-600'}`}>Daily Sales:</span>
                          <span className={`font-medium ${false ? 'text-white' : 'text-gray-900'}`}>
                            {category.avgDailySales.toFixed(0)} units
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className={`text-sm ${false ? 'text-gray-400' : 'text-gray-600'}`}>Daily Revenue:</span>
                          <span className={`font-medium ${false ? 'text-green-400' : 'text-green-500'}`}>
                            ₱{category.avgDailyRevenue.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className={`text-sm ${false ? 'text-gray-400' : 'text-gray-600'}`}>Daily Profit:</span>
                          <span className={`font-medium ${false ? 'text-blue-400' : 'text-blue-500'}`}>
                            ₱{category.avgDailyProfit.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className={`text-sm ${false ? 'text-gray-400' : 'text-gray-600'}`}>Profit Margin:</span>
                          <span className={`font-medium ${
                            category.profitMargin > 30 ? (false ? 'text-green-400' : 'text-green-500') : (false ? 'text-orange-400' : 'text-orange-500')
                          }`}>
                            {category.profitMargin.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error/Success Messages */}
      {error && (
        <div className={`${false ? 'bg-red-900 border-red-700' : 'bg-red-50 border-red-200'} border rounded-lg px-4 py-3 flex items-center gap-2 mx-6 mt-4`}>
          <AlertCircle className="w-5 h-5 text-red-500" />
          <span className={`${false ? 'text-red-300' : 'text-red-700'}`}>{error}</span>
        </div>
      )}
      
      {success && (
        <div className={`${false ? 'bg-green-900 border-green-700' : 'bg-green-50 border-green-200'} border rounded-lg px-4 py-3 flex items-center gap-2 mx-6 mt-4`}>
          <Target className="w-5 h-5 text-green-500" />
          <span className={`${false ? 'text-green-300' : 'text-green-700'}`}>{success}</span>
        </div>
      )}
      
      {/* Fullscreen Modal */}
      {isFullscreen && (
        <div className="fixed inset-0 z-50 bg-white flex items-center justify-center">
          <div className="w-full h-full p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-gray-900">
                Forecast Chart - Fullscreen
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={closeFullscreen}
                  className="px-4 py-2 rounded-lg text-white bg-red-600 hover:bg-red-700"
                >
                  Close (ESC)
                </button>
              </div>
            </div>
            
            <div className="w-full h-[calc(100vh-120px)]">
              <Line
                ref={chartRef}
                data={generateMultiAxisData(selectedTarget) || { labels: [], datasets: [] }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  interaction: {
                    intersect: false,
                    mode: 'index'
                  },
                  plugins: {
                    legend: {
                      display: true,
                      position: 'top',
                      labels: {
                        color: '#374151',
                        usePointStyle: true,
                        padding: 20,
                        filter: (item) => item.text !== ''
                      }
                    },
                    zoom: {
                      zoom: {
                        wheel: {
                          enabled: false,
                        },
                        pinch: {
                          enabled: false
                        },
                        mode: 'x',
                        drag: {
                          enabled: true,
                          backgroundColor: 'rgba(54, 162, 235, 0.3)',
                          borderColor: 'rgba(54, 162, 235, 0.8)',
                          borderWidth: 1,
                        }
                      },
                      pan: {
                        enabled: false,
                        mode: 'x',
                      }
                    },
                    tooltip: {
                      backgroundColor: 'rgba(255, 255, 255, 0.95)',
                      titleColor: '#111827',
                      bodyColor: '#1f2937',
                      borderColor: '#e5e7eb',
                      borderWidth: 1,
                      callbacks: {
                        title: (context) => {
                          const raw = context?.[0]?.label;
                          const date = raw instanceof Date ? raw : parseLocalISODate(raw);
                          if (isNaN(date.getTime())) return '';
                          const opts = (timeframe === 'MAX' || timeframe === '1Y')
                            ? { year: 'numeric', month: 'short', day: 'numeric' }
                            : { month: 'short', day: 'numeric' };
                          return date.toLocaleDateString('en-US', opts);
                        },
                        label: (context) => {
                          const y = context?.parsed?.y;
                          if (y === null || y === undefined || Number.isNaN(y)) return '';
                          const datasetLabel = context.dataset.label || '';
                          if (!datasetLabel) return '';
                          const raw = context?.label;
                          const date = raw instanceof Date ? raw : parseLocalISODate(raw);
                          const normalized = normalizeDate(date);
                          const key = normalized.getTime();
                          if (datasetLabel === 'Actual Sales (Units)' || datasetLabel === 'Historical Sales (Units)' || datasetLabel === 'Recent Actual Window') {
                            const actualPoint = actualLookup.get(key);
                            if (actualPoint) {
                              const revenue = actualPoint.revenue ?? actualPoint.sales * unitPriceForTooltips;
                              const cost = actualPoint.sales * costPriceForTooltips;
                              const profit = revenue - cost;
                              return [
                                `Actual: ${actualPoint.sales} units`,
                                `Revenue: ₱${revenue.toFixed(2)}`,
                                `Profit: ₱${profit.toFixed(2)}`
                              ];
                            }
                            return `Actual: ${Number(y).toFixed(0)} units`;
                          }
                          if (datasetLabel === 'Predicted Sales (Units)' || datasetLabel === 'Forecast (Units)') {
                            const predictedValue = predictedLookup.get(key) ?? Number(y);
                            const estRevenue = predictedValue * unitPriceForTooltips;
                            const estProfit = predictedValue * profitPerUnitForTooltips;
                            return [
                              `Predicted: ${predictedValue.toFixed(0)} units`,
                              `Expected Revenue: ₱${estRevenue.toFixed(2)}`,
                              `Expected Profit: ₱${estProfit.toFixed(2)}`
                            ];
                          }
                          if (datasetLabel === 'Profit (₱)' || datasetLabel === 'Forecast Profit (₱)') {
                            return `Profit: ₱${Number(y).toFixed(2)}`;
                          }
                          if (datasetLabel === 'Forecast Confidence') {
                            return `Confidence floor: ${Number(y).toFixed(0)} units`;
                          }
                          return `${datasetLabel}: ${Number(y).toFixed(2)}`;
                        }
                      }
                    }
                  },
                  scales: {
                    x: {
                      type: 'category',
                      grid: {
                        color: 'rgba(0, 0, 0, 0.1)',
                      },
                      ticks: {
                        color: '#6b7280',
                        maxTicksLimit: 8,
                        callback: function(value, index) {
                          const lbl = this?.chart?.data?.labels ? this.chart.data.labels[index] : null;
                          const date = lbl instanceof Date ? lbl : parseLocalISODate(lbl || Date.now());
                          if (timeframe === '1H' || timeframe === '4H') {
                            return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                          }
                          return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                        }
                      }
                    },
                    y: {
                      grid: {
                        color: 'rgba(0, 0, 0, 0.1)',
                      },
                      ticks: {
                        color: '#6b7280',
                        callback: function(value) {
                          const v = Number(value);
                          return Number.isFinite(v) ? Math.round(v).toString() : '';
                        }
                      },
                      beginAtZero: true,
                      grace: '5%',
                      suggestedMin: 0,
                      suggestedMax: (() => {
                        try {
                          const actualMaxUnits = currentActualSeries.reduce((m, d) => Math.max(m, Number(d.sales) || 0), 0);
                          const predictedValues = Array.from(predictedLookup.values());
                          const predictedMaxUnits = predictedValues.reduce((m, v) => Math.max(m, Number(v) || 0), 0);
                          const maxVal = Math.max(actualMaxUnits, predictedMaxUnits);
                          return maxVal > 0 ? Math.max(10, Math.ceil(maxVal * 1.1)) : undefined;
                        } catch (_) {
                          return undefined;
                        }
                      })()
                    },
                    y1: {
                      type: 'linear',
                      display: true,
                      position: 'right',
                      grid: {
                        drawOnChartArea: false,
                      },
                      ticks: {
                        color: '#6b7280',
                        callback: function(value) {
                          const v = Number(value);
                          if (!Number.isFinite(v)) return '';
                          const abs = Math.abs(v);
                          if (abs >= 1_000_000) return '₱' + (v/1_000_000).toFixed(1) + 'M';
                          if (abs >= 1000) return '₱' + (v/1000).toFixed(1) + 'K';
                          return '₱' + v.toFixed(2);
                        }
                      },
                      beginAtZero: true,
                      grace: '5%',
                      suggestedMin: 0,
                      suggestedMax: (() => {
                        try {
                          const actualProfitMax = currentActualSeries.reduce((m, d) => Math.max(m, Number(d.profit) || 0), 0);
                          const predictedProfitMax = Array.from(predictedLookup.values()).reduce((m, v) => Math.max(m, Number(v) * profitPerUnitForTooltips || 0), 0);
                          const maxVal = Math.max(actualProfitMax, predictedProfitMax);
                          return maxVal > 0 ? Math.max(10, Math.ceil(maxVal * 1.1)) : undefined;
                        } catch (_) {
                          return undefined;
                        }
                      })()
                    }
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Forecasting;

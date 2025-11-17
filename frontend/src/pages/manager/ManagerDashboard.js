import React, { useEffect, useMemo, useState } from 'react';
import { Users, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ManagerAPI, POSAPI, InventoryAPI } from '../../services/api';

const SectionCard = ({ title, subtitle, action, children, className = '', ...rest }) => (
  <section
    {...rest}
    className={`bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-2xl shadow-sm p-6 ${className}`}
  >
    {(title || subtitle || action) && (
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          {title && <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">{title}</h2>}
          {subtitle && <p className="text-sm text-gray-500 dark:text-slate-400">{subtitle}</p>}
        </div>
        {action}
      </div>
    )}
    {children}
  </section>
);

const formatCurrency = (value) => (value ?? 0).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });

const ManagerDashboard = () => {
  const { token, user } = useAuth();
  // eslint-disable-next-line no-unused-vars
  const [, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [overview, setOverview] = useState(null);
  const [pharmacy, setPharmacy] = useState(null);
  const [staff, setStaff] = useState([]);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const [sustainability, setSustainability] = useState(null);
  const [expiryRisk, setExpiryRisk] = useState(null);
  const [abcved, setABCVED] = useState(null);
  const [showABCHelp, setShowABCHelp] = useState(false);
  const [selectedCell, setSelectedCell] = useState('A-V');
  const [simpleMode, setSimpleMode] = useState(true);
  
  const [cellSort, setCellSort] = useState('value_desc');
  const [cellQuery, setCellQuery] = useState('');
  
  const [cellPage, setCellPage] = useState(1);
  const [cellPageSize, setCellPageSize] = useState(10);
  
  // Individual loading states for better UX
  const [loadingHeavy, setLoadingHeavy] = useState(false);

  // ABC-VED derived insights (coverage + priorities)
  const abcCoverage = useMemo(() => {
    const items = Array.isArray(abcved?.items) ? abcved.items : [];
    const total = items.reduce((a, r) => a + Number(r.consumption_value || 0), 0);
    const by = { A: 0, B: 0, C: 0 };
    items.forEach(r => { by[r.abc_class] = (by[r.abc_class] || 0) + Number(r.consumption_value || 0); });
    const pct = (v) => total > 0 ? Math.round((v / total) * 100) : 0;
    return { total, by, pctA: pct(by.A), pctB: pct(by.B), pctC: pct(by.C) };
  }, [abcved]);

  // eslint-disable-next-line no-unused-vars
  const getTopByCell = (abc, ved, limit = 5) => {
    const items = Array.isArray(abcved?.items) ? abcved.items : [];
    return items
      .filter(r => r.abc_class === abc && r.ved_class === ved)
      .sort((a, b) => Number(b.consumption_value || 0) - Number(a.consumption_value || 0))
      .slice(0, limit);
  };

  // Removed priority shortlists to keep panel concise

  const selectedAllItems = useMemo(() => {
    if (!selectedCell) return [];
    const [a, v] = selectedCell.split('-');
    const base = (Array.isArray(abcved?.items) ? abcved.items : [])
      .filter(r => r.abc_class === a && r.ved_class === v);
    const filtered = cellQuery
      ? base.filter(r => (r.name || '').toLowerCase().includes(cellQuery.toLowerCase()))
      : base;
    const sorted = [...filtered].sort((x, y) => {
      const valX = Number(x.consumption_value || 0);
      const valY = Number(y.consumption_value || 0);
      const qtyX = Number(x.total_qty || 0);
      const qtyY = Number(y.total_qty || 0);
      if (cellSort === 'value_desc') return valY - valX;
      if (cellSort === 'value_asc') return valX - valY;
      if (cellSort === 'qty_desc') return qtyY - qtyX;
      if (cellSort === 'qty_asc') return qtyX - qtyY;
      const nx = (x.name || '').toLowerCase();
      const ny = (y.name || '').toLowerCase();
      return nx.localeCompare(ny);
    });
    return sorted;
  }, [selectedCell, abcved, cellQuery, cellSort]);

  const itemsForSelected = useMemo(() => {
    const start = (cellPage - 1) * cellPageSize;
    return selectedAllItems.slice(start, start + cellPageSize);
  }, [selectedAllItems, cellPage, cellPageSize]);

  useEffect(() => { setCellPage(1); }, [selectedCell, cellQuery, cellSort, cellPageSize]);

  // Heatmap intensity based on counts
  const cellMax = useMemo(() => {
    const mc = abcved?.matrix_counts || {};
    return Object.values(mc).reduce((m, v) => Math.max(m, Number(v || 0)), 0) || 1;
  }, [abcved]);

  // Pagination model for numbered buttons with ellipsis
  // eslint-disable-next-line no-unused-vars
  const pagination = useMemo(() => {
    const totalItems = selectedAllItems.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / cellPageSize));
    const pages = [];
    const add = (n) => { if (n>=1 && n<=totalPages) pages.push(n); };
    add(1);
    for (let i = cellPage - 1; i <= cellPage + 1; i++) add(i);
    add(totalPages);
    const unique = [...new Set(pages)].sort((a,b)=>a-b);
    const withEllipsis = [];
    for (let i=0;i<unique.length;i++){
      withEllipsis.push(unique[i]);
      if (i<unique.length-1 && unique[i+1] - unique[i] > 1) withEllipsis.push('...');
    }
    return { totalPages, withEllipsis, totalItems };
  }, [selectedAllItems.length, cellPage, cellPageSize]);

  // Threshold controls removed per request

  const downloadSelectedCSV = () => {
    const headers = ['name', 'category_name', 'abc_class', 'ved_class', 'total_qty', 'cost_price', 'consumption_value'];
    const csv = [headers.join(',')]
      .concat(itemsForSelected.map(it => headers.map(h => `${(it[h] ?? '').toString().replace(/"/g, '""')}`)
      .map(x => /[",\n]/.test(x) ? `"${x}"` : x).join(',')))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `abcved_${selectedCell}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const actionText = (cell) => {
    switch (cell) {
      case 'A-V': return 'Review weekly • strict min-max • vendor priority';
      case 'A-E': return 'Review bi-weekly • maintain safety stock';
      case 'B-V': return 'Review bi-weekly • protect from stock-outs';
      case 'B-E': return 'Monthly review • balance cost and availability';
      case 'C-V': return 'Monthly review • ensure basic continuity';
      default: return 'Quarterly review • minimal controls';
    }
  };

  // Phase 1: Load critical data first (fast endpoints)
  useEffect(() => {
    let cancelled = false;
    const loadCritical = async () => {
      if (!token) return;
      try {
        setLoading(true);
        setError('');
        // Load only critical/fast data first - use shorter date range for overview
        const dateTo = new Date();
        const dateFrom = new Date();
        dateFrom.setDate(dateFrom.getDate() - 30); // Last 30 days instead of default
        const [ov, pharm, staffList, pendingReqs] = await Promise.all([
          ManagerAPI.getAnalyticsOverview({ 
            from: dateFrom.toISOString().split('T')[0],
            to: dateTo.toISOString().split('T')[0]
          }, token).catch(() => null),
          ManagerAPI.getPharmacy(token).catch(() => null),
          ManagerAPI.listStaff(token).catch(() => null),
          InventoryAPI.listRequests({ status: 'pending', page: 1, page_size: 50 }, token).catch(() => null), // Limit requests
        ]);
        if (cancelled) return;
        setOverview(ov);
        setPharmacy(pharm?.pharmacy || pharm);
        setStaff(Array.isArray(staffList) ? staffList : (staffList?.staff || []));
        setPendingApprovals(pendingReqs?.total ?? (Array.isArray(pendingReqs?.items) ? pendingReqs.items.length : 0));
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load dashboard metrics');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadCritical();
    return () => { cancelled = true; };
  }, [token]);

  // Phase 2: Load heavy data after initial render (staggered for better performance)
  useEffect(() => {
    let cancelled = false;
    const loadHeavy = async () => {
      if (!token) return;
      try {
        setLoadingHeavy(true);
        // Load heavy endpoints in parallel but after critical data - use shorter date ranges
        const dateTo = new Date();
        const dateFrom = new Date();
        dateFrom.setDate(dateFrom.getDate() - 30); // Last 30 days
        const [txns, sust, risk, av] = await Promise.all([
          POSAPI.getTransactions(token, 500, 7).catch(() => null), // Get up to 500 transactions from last 7 days for accurate sales chart
          ManagerAPI.getSustainabilityDashboard({ 
            from: dateFrom.toISOString().split('T')[0],
            to: dateTo.toISOString().split('T')[0]
          }, token).catch(() => null),
          ManagerAPI.getExpiryRisk({ soon_days: 30 }, token).catch(() => null),
          ManagerAPI.getABCVED({ 
            from: dateFrom.toISOString().split('T')[0],
            to: dateTo.toISOString().split('T')[0]
          }, token).catch(() => null),
        ]);
        if (cancelled) return;
        // Use all transactions from last 7 days for accurate sales calculation
        const txList = (txns?.transactions ?? txns?.data ?? (Array.isArray(txns) ? txns : []));
        setTransactions(Array.isArray(txList) ? txList : []);
        setSustainability(sust);
        setExpiryRisk(risk);
        setABCVED(av);
      } catch (e) {
        // Non-critical errors don't block the UI
        console.warn('Failed to load some dashboard data:', e.message);
      } finally {
        if (!cancelled) setLoadingHeavy(false);
      }
    };
    // Small delay to let critical data render first
    const timer = setTimeout(loadHeavy, 50);
    return () => { 
      cancelled = true;
      clearTimeout(timer);
    };
  }, [token]);

  // No generic stat grid; focus on requested KPIs only

  // Aggregate sales for last 7 days
  const salesLast7 = useMemo(() => {
    const safeTx = Array.isArray(transactions) ? transactions : [];
    const byDate = new Map();
    const now = new Date();
    // Initialize all 7 days with 0
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const key = d.toISOString().slice(0,10);
      byDate.set(key, 0);
    }
    // Aggregate sales by date using total_amount field from API
    safeTx.forEach(t => {
      const txDate = new Date(t.created_at || t.date || t.timestamp || 0);
      txDate.setHours(0, 0, 0, 0);
      const dateKey = txDate.toISOString().slice(0,10);
      // Use total_amount field (the correct field from the API)
      const amount = Number(t.total_amount || t.total || t.amount || t.grand_total || 0);
      if (byDate.has(dateKey)) {
        byDate.set(dateKey, (byDate.get(dateKey) || 0) + amount);
      }
    });
    return Array.from(byDate.entries())
      .map(([date, total]) => ({ date, total }))
      .sort((a, b) => a.date.localeCompare(b.date)); // Ensure chronological order
  }, [transactions]);

  // Waste analysis split (expired, expiring soon, safe)
  const wasteSplit = useMemo(() => {
    const s = sustainability || overview?.sustainability;
    // Prefer explicit dashboard summary if present
    let expired = s?.expired_value ?? 0;
    let expiring = s?.expiring_soon_value ?? 0;
    let totalValue = s?.total_value ?? overview?.inventory?.total_value ?? 0;

    // Fallback: compute from expiryRisk lists if summary missing
    if ((!expired && !expiring) && expiryRisk) {
      const sumBy = (arr, key) => (Array.isArray(arr) ? arr.reduce((acc, it) => acc + Number(it[key] ?? 0), 0) : 0);
      // Prefer summary if provided by API
      expired = expiryRisk?.summary?.expired_value ?? 0;
      expiring = expiryRisk?.summary?.expiring_soon_value ?? 0;
      if (!expired || !expiring) {
        // Derive from item lists as value_at_risk (or total_value fallback)
        const lists = [
          ...(expiryRisk?.critical_risk || []),
          ...(expiryRisk?.high_risk || []),
          ...(expiryRisk?.medium_risk || []),
          ...(expiryRisk?.low_risk || []),
        ];
        // Classify by expiry_state when available
        const expiredSum = lists.filter(i => (i.expiry_state || '').toLowerCase() === 'expired')
          .reduce((a,i)=> a + Number(i.value_at_risk ?? i.total_value ?? 0), 0);
        const expSoonSum = lists.filter(i => (i.expiry_state || '').toLowerCase() === 'expiring')
          .reduce((a,i)=> a + Number(i.value_at_risk ?? i.total_value ?? 0), 0);
        if (expired === 0) expired = expiredSum;
        if (expiring === 0) expiring = expSoonSum;
        if (!totalValue) totalValue = sumBy(lists, 'total_value');
      }
    }

    const safe = (s?.safe_value != null) ? s.safe_value : Math.max(totalValue - expired - expiring, 0);
    const total = Math.max(expired + expiring + safe, 1);
    return {
      expired, expiring, safe,
      pExpired: (expired / total) * 100,
      pExpiring: (expiring / total) * 100,
      pSafe: (safe / total) * 100,
      total
    };
  }, [sustainability, overview, expiryRisk]);

  const activeStaff = useMemo(() => staff.filter(s => s.active !== false).length, [staff]);

  const totalInventoryValue = useMemo(
    () => overview?.inventory?.total_value ?? wasteSplit.total ?? 0,
    [overview, wasteSplit.total]
  );
  const totalWeeklySales = useMemo(
    () => salesLast7.reduce((sum, day) => sum + (day.total || 0), 0),
    [salesLast7]
  );
  const sustainabilityScore = useMemo(
    () => sustainability?.score ?? overview?.sustainability?.score ?? null,
    [sustainability, overview]
  );
  const snapshotMetrics = useMemo(() => {
    const metrics = [
      {
        label: 'Active Staff',
        value: activeStaff,
        helper: 'on duty today',
        icon: Users,
        badgeClass: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-200'
      },
      {
        label: 'Pending Approvals',
        value: pendingApprovals,
        helper: 'awaiting review',
        icon: AlertTriangle,
        badgeClass: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-200'
      },
      {
        label: 'Weekly Sales',
        value: formatCurrency(totalWeeklySales),
        helper: 'last 7 days',
        badgeText: '₱',
        badgeClass: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-200'
      },
      {
        label: 'Inventory Value',
        value: formatCurrency(totalInventoryValue),
        helper: 'current stock',
        badgeText: 'INV',
        badgeClass: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-200'
      }
    ];
    if (sustainabilityScore != null) {
      metrics.push({
        label: 'Sustainability Score',
        value: `${sustainabilityScore}/100`,
        helper: 'waste & energy index',
        badgeText: 'Eco',
        badgeClass: 'bg-lime-100 text-lime-600 dark:bg-lime-900/30 dark:text-lime-200'
      });
    }
    return metrics;
  }, [activeStaff, pendingApprovals, totalWeeklySales, totalInventoryValue, sustainabilityScore]);

  // eslint-disable-next-line no-unused-vars
  const recentActivities = useMemo(() => {
    const items = overview?.recent_activities || [];
    return items.slice(0, 0); // intentionally hidden in simplified dashboard
  }, [overview]);

  return (
    <div className="space-y-6 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-10">
      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 rounded-lg px-4 py-3">
          {error}
        </div>
      )}
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-7 text-white">
        <div className="flex flex-col gap-2">
          <p className="text-sm text-white/70">Manager Command Center</p>
          <h1 className="text-3xl font-bold">Welcome, {user?.name || user?.full_name || 'Manager'}</h1>
          <p className="text-blue-100">{pharmacy?.name || 'Your Pharmacy'}</p>
        </div>
      </div>

      <section className="rounded-3xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-950/70 p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
          <div>
            <p className="text-sm uppercase tracking-wide text-gray-400 dark:text-slate-500">Operational Snapshot</p>
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-slate-100">Today's key metrics</h2>
          </div>
          <span className="text-xs font-medium text-gray-500 dark:text-slate-400">Auto-refreshed every load</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {snapshotMetrics.map((metric) => (
            <div
              key={metric.label}
              className="rounded-2xl border border-gray-100 dark:border-slate-800/70 bg-gradient-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-900/60 p-5 flex flex-col gap-4 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <span className={`flex h-11 w-11 items-center justify-center rounded-xl text-sm font-semibold ${metric.badgeClass}`}>
                  {metric.icon ? <metric.icon className="w-5 h-5" /> : metric.badgeText}
                </span>
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400">{metric.label}</p>
                  {metric.helper && <p className="text-[11px] text-gray-400 dark:text-slate-500">{metric.helper}</p>}
                </div>
              </div>
              <p className="text-3xl font-semibold text-gray-900 dark:text-slate-100">{metric.value}</p>
            </div>
          ))}
        </div>
      </section>

      <SectionCard
        title="Sales (Last 7 Days)"
        subtitle="POS transactions summarized daily"
        action={loadingHeavy && transactions.length === 0 ? <span className="text-xs text-gray-500">Updating…</span> : null}
      >
        <div className="h-48 flex items-end gap-3">
          {salesLast7.map((d) => {
            const max = Math.max(1, ...salesLast7.map(x => x.total));
            const height = Math.max(4, Math.round((d.total / max) * 150));
            return (
              <div key={d.date} className="flex-1 flex flex-col items-center">
                <div className="w-full rounded-t-lg bg-gradient-to-t from-blue-600 to-blue-400" style={{ height }} />
                <div className="mt-2 text-[11px] font-medium text-gray-500 dark:text-slate-400">{d.date.slice(5)}</div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex items-center justify-between text-sm text-gray-600 dark:text-slate-300">
          <span>Total sales</span>
          <span className="text-base font-semibold text-gray-900 dark:text-slate-100">{formatCurrency(salesLast7.reduce((a,b)=>a+b.total,0))}</span>
        </div>
      </SectionCard>

      {/* ABC-VED Matrix (compact panel) */}
      <SectionCard
        id="abcved-section"
        title="ABC–VED Matrix"
        subtitle="Focus procurement on the intersections with the highest value and clinical impact"
        action={(
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={()=>setSimpleMode(v=>!v)}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-slate-800 text-gray-700 dark:text-slate-200 bg-white dark:bg-slate-950 hover:bg-gray-50 dark:hover:bg-slate-900"
            >
              {simpleMode ? 'Switch to Advanced' : 'Switch to Simple'}
            </button>
            <div className="text-sm text-gray-500 dark:text-slate-400">{abcved?.from?.slice(0,10)} – {abcved?.to?.slice(0,10)}</div>
          </div>
        )}
      >
        {simpleMode && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
            {[
              {
                title: 'Priority Now',
                value: (abcved?.matrix_counts?.['A-V']||0)+(abcved?.matrix_counts?.['A-E']||0),
                description: 'Vital & essential A items. Reorder first.',
                gradient: 'from-orange-500/10 to-red-500/10',
                items: (abcved?.items||[]).filter(i => (i.abc_class==='A' && (i.ved_class==='V'||i.ved_class==='E')))
              },
              {
                title: 'Watchlist',
                value: abcved?.matrix_counts?.['B-V']||0,
                description: 'Monitor B–V weekly to avoid stock-outs.',
                gradient: 'from-blue-500/10 to-sky-500/10',
                items: (abcved?.items||[]).filter(i => (i.abc_class==='B' && i.ved_class==='V'))
              },
              {
                title: 'Low Priority',
                value: abcved?.matrix_counts?.['C-D']||0,
                description: 'Order C–D only when needed.',
                gradient: 'from-emerald-500/10 to-lime-500/10',
                items: []
              }
            ].map(panel => (
              <div key={panel.title} className={`rounded-2xl border border-gray-200 dark:border-slate-800 bg-gradient-to-br ${panel.gradient} p-5 shadow-sm`}>
                <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{panel.title}</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-slate-100 mt-1">{panel.value}</p>
                <p className="text-xs text-gray-600 dark:text-slate-300 mt-2">{panel.description}</p>
                {panel.items.length > 0 && (
                  <ul className="mt-3 space-y-1 text-sm text-gray-800 dark:text-slate-200">
                    {panel.items
                      .sort((a,b)=>Number(b.consumption_value||0)-Number(a.consumption_value||0))
                      .slice(0,3)
                      .map(it => (
                        <li key={it.id||it.name} className="truncate" title={it.name}>
                          {it.name}
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Advanced controls removed per request */}
        {!simpleMode && abcved?.matrix_counts ? (
          <div className="overflow-x-auto">
            <div className="inline-block min-w-full align-middle">
              <div className="grid grid-cols-4 gap-px bg-gray-200 dark:bg-slate-800 rounded-lg overflow-hidden">
                <div className="bg-gray-50 dark:bg-slate-900 p-3 text-xs font-medium text-gray-600 dark:text-slate-300"></div>
                {['V','E','D'].map(h => (
                  <div key={h} className="bg-gray-50 dark:bg-slate-900 p-3 text-xs font-medium text-gray-600 dark:text-slate-300 text-center">
                    <div>{h}</div>
                    <div className="text-[10px] text-gray-400 dark:text-slate-500 mt-1">
                      {h === 'V' && 'Must never stock-out'}
                      {h === 'E' && 'Needed for daily ops'}
                      {h === 'D' && 'Nice-to-have'}
                    </div>
                  </div>
                ))}
                {['A','B','C'].map(row => (
                  <React.Fragment key={row}>
                    <div className="bg-gray-50 dark:bg-slate-900 p-3 text-xs font-medium text-gray-700 dark:text-slate-200">
                      <div>{row}</div>
                      <div className="text-[10px] text-gray-400 dark:text-slate-500 mt-1">
                        {row === 'A' && 'Top peso impact'}
                        {row === 'B' && 'Mid impact'}
                        {row === 'C' && 'Low spend'}
                      </div>
                    </div>
                    {['V','E','D'].map(col => {
                      const key = `${row}-${col}`;
                      const val = abcved.matrix_counts[key] ?? 0;
                      const tone = (() => {
                        const mc = abcved?.matrix_counts || {};
                        const count = Number(mc[key] || 0);
                        // eslint-disable-next-line no-unused-vars
                        const intensity = Math.min(1, count / Math.max(1, cellMax));
                        if (row === 'A') return `bg-blue-50 dark:bg-blue-950/30`;
                        if (row === 'B') return `bg-purple-50 dark:bg-purple-950/30`;
                        return `bg-slate-50 dark:bg-slate-900`;
                      })();
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setSelectedCell(key)}
                          className={`${tone} p-3 text-center text-sm text-gray-900 dark:text-slate-100 hover:bg-opacity-70 focus:outline-none ${selectedCell===key ? 'ring-2 ring-blue-400 dark:ring-blue-600' : ''}`}
                          title={`Show items for ${key}`}
                        >
                          {val}
                        </button>
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
        ) : (!simpleMode ? (
          <div className="text-sm text-gray-500 dark:text-slate-400">No ABC–VED data available.</div>
        ) : null)}
        {/* Explainer toggle */}
        <div className="mt-3">
          <button type="button" onClick={() => setShowABCHelp(v => !v)} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
            {showABCHelp ? 'Hide quick explainer' : 'What is ABC–VED?'}
          </button>
          {showABCHelp && (
            <div className="mt-2 text-sm text-gray-700 dark:text-slate-300 space-y-1">
              <p><span className="font-semibold">ABC</span> sorts stock by peso impact. A-items drive most sales or usage, C-items contribute the least.</p>
              <p><span className="font-semibold">VED</span> tells you how critical the medicine is: V is life-or-death, E keeps care running, D can wait.</p>
              <p>Read the matrix like a heatmap. A–V needs constant cover, A–E/B–V get weekly reviews, C–D can be restocked only when demanded.</p>
            </div>
          )}
        </div>
        {/* Friendly legend and guidance */}
        <div className="mt-4 space-y-2 text-sm text-gray-700 dark:text-slate-300">
          <div className="flex flex-wrap gap-3">
            <span className="inline-flex items-center gap-2"><span className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-200 text-xs">A</span> High value</span>
            <span className="inline-flex items-center gap-2"><span className="px-2 py-0.5 rounded bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-200 text-xs">B</span> Medium value</span>
            <span className="inline-flex items-center gap-2"><span className="px-2 py-0.5 rounded bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-xs">C</span> Low value</span>
            <span className="inline-flex items-center gap-2"><span className="px-2 py-0.5 rounded bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-200 text-xs">V</span> Vital (must-have)</span>
            <span className="inline-flex items-center gap-2"><span className="px-2 py-0.5 rounded bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-200 text-xs">E</span> Essential</span>
            <span className="inline-flex items-center gap-2"><span className="px-2 py-0.5 rounded bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-200 text-xs">D</span> Desirable</span>
          </div>
          <p className="text-sm text-gray-600 dark:text-slate-400">Tip: Focus first on A–V items (high value + vital) to avoid costly stock-outs. Then A–E and B–V. C–D items need the least attention.</p>
          {/* Coverage chips (concise) */}
          {abcved?.items && (
            <div className="flex flex-wrap gap-2 mt-2">
              <span className="text-xs px-2 py-1 rounded-full bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-200">A {abcCoverage.pctA}%</span>
              <span className="text-xs px-2 py-1 rounded-full bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-200">B {abcCoverage.pctB}%</span>
              <span className="text-xs px-2 py-1 rounded-full bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200">C {abcCoverage.pctC}%</span>
            </div>
          )}
          {/* Selected cell detail */}
          {selectedCell && (
            <div className="mt-3">
              <div className="text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1">Items in {selectedCell}</div>
              <div className="flex flex-col md:flex-row md:items-center gap-2 mb-2">
                <input
                  type="text"
                  value={cellQuery}
                  onChange={(e)=>setCellQuery(e.target.value)}
                  placeholder="Search item name…"
                  className="px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-lg text-gray-800 dark:text-slate-200 w-full md:w-64"
                />
                <select
                  value={cellSort}
                  onChange={(e)=>setCellSort(e.target.value)}
                  className="px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-lg text-gray-800 dark:text-slate-200 w-full md:w-56"
                >
                  <option value="value_desc">Sort by Value (high → low)</option>
                  <option value="value_asc">Sort by Value (low → high)</option>
                  <option value="qty_desc">Sort by Qty (high → low)</option>
                  <option value="qty_asc">Sort by Qty (low → high)</option>
                  <option value="name_asc">Sort by Name (A → Z)</option>
                </select>
                <select
                  value={cellPageSize}
                  onChange={(e)=>setCellPageSize(Number(e.target.value))}
                  className="px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-lg text-gray-800 dark:text-slate-200 w-full md:w-28"
                >
                  <option value={10}>10 / page</option>
                  <option value={25}>25 / page</option>
                  <option value={50}>50 / page</option>
                </select>
                <button
                  type="button"
                  onClick={downloadSelectedCSV}
                  className="px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                >
                  Export CSV
                </button>
              </div>
              {/* Pagination bar */}
              <div className="flex items-center justify-between text-xs text-gray-600 dark:text-slate-300 mb-2">
                <div>Showing {itemsForSelected.length} of {selectedAllItems.length} items</div>
                {selectedAllItems.length > 0 && (
                  <div className="flex items-center gap-2">
                    {(() => {
                      const totalPages = Math.max(1, Math.ceil(selectedAllItems.length / cellPageSize));
                      const canPrev = cellPage > 1;
                      const canNext = cellPage < totalPages;
                      return (
                        <>
                          <button onClick={()=>setCellPage(1)} disabled={!canPrev} className={`px-2 py-1 rounded border ${canPrev ? 'border-gray-300 hover:bg-gray-50 dark:hover:bg-slate-900' : 'border-transparent opacity-40'}`}>First</button>
                          <button onClick={()=>setCellPage(p=>Math.max(1,p-1))} disabled={!canPrev} className={`px-2 py-1 rounded border ${canPrev ? 'border-gray-300 hover:bg-gray-50 dark:hover:bg-slate-900' : 'border-transparent opacity-40'}`}>Prev</button>
                          <span>Page {cellPage} of {totalPages}</span>
                          <button onClick={()=>setCellPage(p=>Math.min(totalPages,p+1))} disabled={!canNext} className={`px-2 py-1 rounded border ${canNext ? 'border-gray-300 hover:bg-gray-50 dark:hover:bg-slate-900' : 'border-transparent opacity-40'}`}>Next</button>
                          <button onClick={()=>setCellPage(Math.max(1, Math.ceil(selectedAllItems.length / cellPageSize)))} disabled={!canNext} className={`px-2 py-1 rounded border ${canNext ? 'border-gray-300 hover:bg-gray-50 dark:hover:bg-slate-900' : 'border-transparent opacity-40'}`}>Last</button>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
              <div className="rounded-lg border border-gray-200 dark:border-slate-800 overflow-hidden">
                <div className="grid grid-cols-6 gap-px bg-gray-200 dark:bg-slate-800">
                  <div className="bg-gray-50 dark:bg-slate-900 p-2 text-[11px] font-medium text-gray-600 dark:text-slate-300 col-span-3">Item</div>
                  <div className="bg-gray-50 dark:bg-slate-900 p-2 text-[11px] font-medium text-gray-600 dark:text-slate-300">Qty used</div>
                  <div className="bg-gray-50 dark:bg-slate-900 p-2 text-[11px] font-medium text-gray-600 dark:text-slate-300">Cost</div>
                  <div className="bg-gray-50 dark:bg-slate-900 p-2 text-[11px] font-medium text-gray-600 dark:text-slate-300">Value</div>
                  {itemsForSelected.map(it => (
                    <React.Fragment key={it.id || it.name}>
                      <div className="bg-white dark:bg-slate-950 p-2 text-[12px] text-gray-800 dark:text-slate-200 col-span-3 truncate" title={it.name}>{it.name}</div>
                      <div className="bg-white dark:bg-slate-950 p-2 text-[12px] text-gray-800 dark:text-slate-200">{Number(it.total_qty||0)}</div>
                      <div className="bg-white dark:bg-slate-950 p-2 text-[12px] text-gray-800 dark:text-slate-200">{Number(it.cost_price||0).toLocaleString('en-PH',{style:'currency',currency:'PHP'})}</div>
                      <div className="bg-white dark:bg-slate-950 p-2 text-[12px] text-gray-800 dark:text-slate-200">{Number(it.consumption_value||0).toLocaleString('en-PH',{style:'currency',currency:'PHP'})}</div>
                    </React.Fragment>
                  ))}
                  {itemsForSelected.length === 0 && (
                    <div className="bg-white dark:bg-slate-950 p-3 text-xs text-gray-500 dark:text-slate-400 col-span-6">No items in this cell for the selected period.</div>
                  )}
                </div>
              </div>
              <div className="text-[11px] text-gray-500 dark:text-slate-400 mt-1">Suggested action: {actionText(selectedCell)}</div>
              <div className="text-[11px] text-gray-500 dark:text-slate-400">Computed from completed sales × cost within the shown date range.</div>
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
};

export default ManagerDashboard;

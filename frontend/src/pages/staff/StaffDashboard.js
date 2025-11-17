import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Zap,
  ClipboardCheck,
  BellRing,
  ArrowUpRight,
  AlertTriangle,
  Clock,
  Loader2
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { POSAPI, StaffAPI } from '../../services/api';
import { useNavigate } from 'react-router-dom';

const StaffDashboard = () => {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState([]);
  const [expiryRisk, setExpiryRisk] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [range, setRange] = useState('7'); // days: '7' | '14' | '30'

  const [loadingHeavy, setLoadingHeavy] = useState(false);

  // Phase 1: Load transactions first (needed for sales chart)
  useEffect(() => {
    let cancelled = false;
    const loadTransactions = async () => {
      if (!token) return;
      try {
        setLoading(true);
        setError('');
        const txns = await POSAPI.getTransactions(token, 100, 30).catch(() => null); // Limit to 100 transactions, last 30 days
        if (cancelled) return;
        const txList = (txns?.transactions ?? txns?.data ?? (Array.isArray(txns) ? txns : []));
        // Backend already filters by date and limits, so just use the data directly
        setTransactions(Array.isArray(txList) ? txList : []);
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load transactions');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadTransactions();
    return () => { cancelled = true; };
  }, [token]);

  // Phase 2: Load expiry risk after initial render
  useEffect(() => {
    let cancelled = false;
    const loadExpiryRisk = async () => {
      if (!token) return;
      try {
        setLoadingHeavy(true);
        const risk = await StaffAPI.getExpiryRisk({ soon_days: Number(range) }, token).catch(() => null);
        if (cancelled) return;
        setExpiryRisk(risk);
      } catch (e) {
        console.warn('Failed to load expiry risk:', e.message);
      } finally {
        if (!cancelled) setLoadingHeavy(false);
      }
    };
    // Small delay to let transactions render first
    const timer = setTimeout(loadExpiryRisk, 50);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [token, range]);

  const todaySalesCount = useMemo(() => {
    const localDateKey = (d) => {
      const x = new Date(d);
      const yyyy = x.getFullYear();
      const mm = String(x.getMonth() + 1).padStart(2, '0');
      const dd = String(x.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };
    const todayKey = localDateKey(new Date());
    const safeTx = Array.isArray(transactions) ? transactions : [];
    const mine = (t) => {
      if (!user) return false;
      const uidRaw = user.id ?? user.user_id;
      const uid = uidRaw != null ? Number(uidRaw) : null;
      const txUidRaw = t.user_id ?? t.staff_id ?? t.cashier_id;
      const txUid = txUidRaw != null ? Number(txUidRaw) : null;
      const email = (user.email || '').toLowerCase();
      const name = (user.name || user.full_name || '').toLowerCase();
      const txStaffEmail = (t.staff_email || t.user_email || '').toLowerCase();
      const txStaffName = (t.staff_name || '').toLowerCase();
      return (
        (uid !== null && txUid !== null && txUid === uid) ||
        (txStaffEmail && txStaffEmail === email && email) ||
        (txStaffName && txStaffName === name && name)
      );
    };
    return safeTx.filter(t => {
      const raw = t.date || t.created_at || t.timestamp || t.time;
      if (!raw) return false;
      const key = localDateKey(raw);
      if (key !== todayKey) return false;
      return mine(t);
    }).length;
  }, [transactions, user]);

  const expiryOverview = useMemo(() => {
    const lists = [
      ...(expiryRisk?.critical_risk || []),
      ...(expiryRisk?.high_risk || []),
      ...(expiryRisk?.medium_risk || []),
      ...(expiryRisk?.low_risk || []),
    ].filter((item) => !(item?.disposed_by || item?.disposed_at || item?.is_disposed));

    const toState = (i) => String(i?.expiry_state || '').toLowerCase();
    const isSoonState = (s) => s === 'expiring' || s === 'soon' || s === 'near_expiry';

    const expiredItems = lists.filter(item => toState(item) === 'expired');
    const expiringItems = lists.filter(item => toState(item) !== 'expired' && isSoonState(toState(item)));

    const valueFrom = (item, keys) => {
      for (const key of keys) {
        const val = Number(item?.[key]);
        if (!Number.isNaN(val) && Number.isFinite(val)) return val;
      }
      return 0;
    };

    const expiredValue = expiredItems.reduce((sum, item) => sum + valueFrom(item, ['expired_value', 'value_at_risk', 'total_value']), 0);
    const expiringValue = expiringItems.reduce((sum, item) => sum + valueFrom(item, ['expiring_value', 'value_at_risk', 'total_value']), 0);

    const totalTracked = Number(expiryRisk?.summary?.total_products || expiryRisk?.summary?.tracked_products || expiryRisk?.summary?.total_items || lists.length || 0);
    const totalAtRisk = expiredItems.length + expiringItems.length;
    const ratio = totalTracked > 0 ? totalAtRisk / totalTracked : 0;

    return {
      expiredValue,
      expiringValue,
      expiredCount: expiredItems.length,
      expiringCount: expiringItems.length,
      totalTracked,
      totalAtRisk,
      ratio
    };
  }, [expiryRisk]);
  const riskPercent = useMemo(() => {
    const pct = Number.isFinite(expiryOverview.ratio) ? expiryOverview.ratio * 100 : 0;
    return Math.min(100, Math.max(0, pct));
  }, [expiryOverview]);

  const rangeLabel = useMemo(() => {
    const d = Number(range);
    if (d === 7) return 'Last 7 days';
    if (d === 14) return 'Last 14 days';
    return 'Last 30 days';
  }, [range]);

  const salesByDate = useMemo(() => {
    const days = Number(range);
    const safeTx = Array.isArray(transactions) ? transactions : [];
    const byDate = new Map();
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      byDate.set(key, 0);
    }
    const mine = (t) => {
      if (!user) return false;
      const uidRaw = user.id ?? user.user_id;
      const uid = uidRaw != null ? Number(uidRaw) : null;
      const txUidRaw = t.user_id ?? t.staff_id ?? t.cashier_id;
      const txUid = txUidRaw != null ? Number(txUidRaw) : null;
      const email = (user.email || '').toLowerCase();
      const name = (user.name || user.full_name || '').toLowerCase();
      const txStaffEmail = (t.staff_email || t.user_email || '').toLowerCase();
      const txStaffName = (t.staff_name || '').toLowerCase();
      return (
        (uid !== null && txUid !== null && txUid === uid) ||
        (txStaffEmail && email && txStaffEmail === email) ||
        (txStaffName && name && txStaffName === name)
      );
    };
    safeTx.forEach(t => {
      if (!mine(t)) return;
      const raw = t.date || t.created_at || t.timestamp || t.time;
      if (!raw) return;
      const d = new Date(raw);
      const dateKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const amount = Number(t.total || t.amount || t.grand_total || 0);
      if (byDate.has(dateKey)) byDate.set(dateKey, (byDate.get(dateKey) || 0) + amount);
    });
    return Array.from(byDate.entries()).map(([date, total]) => ({ date, total }));
  }, [transactions, range, user]);

  const maxSales = useMemo(() => Math.max(1, ...salesByDate.map(x => x.total)), [salesByDate]);
  const totalSales = useMemo(() => salesByDate.reduce((a,b)=>a+b.total,0), [salesByDate]);

  const [hoverBar, setHoverBar] = useState(null);
  const [txQuery, setTxQuery] = useState('');
  const [txPage, setTxPage] = useState(1);
  const [txPageSize, setTxPageSize] = useState(5);
  const currencyFormatter = useMemo(() => new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP'
  }), []);

  const txWithinRange = useMemo(() => {
    const days = Number(range);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (days - 1));
    const isoCut = cutoff.toISOString().slice(0,10);
    const safeTx = Array.isArray(transactions) ? transactions : [];
    return safeTx.filter(t => (t.date || t.created_at || t.timestamp || '').slice(0,10) >= isoCut);
  }, [transactions, range]);

  const filteredTx = useMemo(() => {
    const q = txQuery.trim().toLowerCase();
    if (!q) return txWithinRange;
    return txWithinRange.filter(t => {
      const fields = [t.id, t.customer_name, t.staff_name, t.reference, t.note]
        .map(x => (x ?? '').toString().toLowerCase());
      return fields.some(f => f.includes(q));
    });
  }, [txWithinRange, txQuery]);

  const txTotalPages = useMemo(() => Math.max(1, Math.ceil((filteredTx.length || 0) / txPageSize)), [filteredTx, txPageSize]);
  useEffect(() => { setTxPage(1); }, [txQuery, txPageSize, range]);
  const txPageItems = useMemo(() => {
    const start = (txPage - 1) * txPageSize;
    return filteredTx.slice(start, start + txPageSize);
  }, [filteredTx, txPage, txPageSize]);

  const bestDay = useMemo(() => {
    if (!salesByDate.length) return null;
    return salesByDate.reduce((best, day) => day.total > (best?.total || 0) ? day : best, null);
  }, [salesByDate]);

  const avgDaily = useMemo(() => {
    if (!salesByDate.length) return 0;
    return totalSales / salesByDate.length;
  }, [salesByDate, totalSales]);

  const quickActions = [
    {
      title: 'Process sale',
      description: 'Launch the POS workspace to ring up customers.',
      action: 'Open POS',
      onClick: () => navigate('/staff/pos'),
      accent: 'from-sky-500 to-blue-500',
      icon: Zap
    },
    {
      title: 'Inventory request',
      description: 'Submit adjustments or replenishment tickets.',
      action: 'New request',
      onClick: () => navigate('/staff/inventory-requests'),
      accent: 'from-violet-500 to-indigo-500',
      icon: ClipboardCheck
    },
    {
      title: 'Expiry alerts',
      description: 'Resolve items that are near or past expiry.',
      action: 'Review alerts',
      onClick: () => navigate('/staff/waste-expiry'),
      accent: 'from-amber-500 to-orange-500',
      icon: BellRing
    }
  ];

  return (
    <div className="space-y-6">
      {(loading || loadingHeavy) && (
        <div className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
          <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
          <span>Syncing latest sales and expiry insights…</span>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
          <AlertTriangle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      )}
      <div className="bg-gradient-to-br from-indigo-600 via-blue-600 to-purple-600 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex flex-wrap items-start gap-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center">
              <BarChart3 className="w-7 h-7 text-white" />
            </div>
            <div>
              <p className="text-sm uppercase tracking-[0.4em] text-white/70">Staff Overview</p>
              <h1 className="text-3xl font-semibold mt-1">
                {user?.first_name ? `Hi ${user.first_name},` : 'Hi there,'} your store pulse
              </h1>
              <p className="text-white/80 text-sm mt-1">
                Keep tabs on recent tickets, expiry risks, and momentum.
              </p>
            </div>
          </div>
          <div className="ml-auto" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
          <div className="flex items-center gap-4 rounded-2xl bg-white/10 backdrop-blur px-4 py-3">
            <div className="w-12 h-12 rounded-xl bg-white/30 flex items-center justify-center text-indigo-800">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-white/70">Today's sales</p>
              <p className="text-2xl font-semibold">{loading ? '—' : todaySalesCount}</p>
              <p className="text-[11px] text-white/80 mt-0.5">Transactions you handled</p>
            </div>
          </div>
          <div className="flex items-center gap-4 rounded-2xl bg-white/10 backdrop-blur px-4 py-3">
            <div className="w-12 h-12 rounded-xl bg-white/30 flex items-center justify-center text-amber-900">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-white/70">Expiry risk</p>
              <p className="text-2xl font-semibold">{expiryRisk ? `${riskPercent.toFixed(1)}%` : '—'}</p>
              <p className="text-[11px] text-white/80 mt-0.5">of tracked products at risk</p>
            </div>
          </div>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-6">
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div>
              <p className="text-sm font-semibold text-slate-900">Quick actions</p>
              <p className="text-xs text-slate-500">Stay ahead of frequent workflows</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {quickActions.map(({ title, description, action, onClick, accent, icon: Icon }) => (
              <button
                key={title}
                type="button"
                onClick={onClick}
                className="group relative text-left rounded-2xl border border-slate-100 bg-slate-50/60 p-4 hover:shadow-md transition focus:outline-none"
              >
                <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${accent} opacity-0 group-hover:opacity-10 transition`} />
                <div className="relative flex flex-col h-full gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white shadow flex items-center justify-center text-slate-800">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{title}</p>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">{description}</p>
                  </div>
                  <span className="mt-auto inline-flex items-center gap-1 text-xs font-semibold text-slate-900">
                    {action} <ArrowUpRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">Sales trend</p>
            <p className="text-xs text-slate-500">{rangeLabel}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <div className="flex flex-wrap gap-3">
              <div className="px-3 py-1.5 rounded-full bg-slate-50 border border-slate-100">
                Total <span className="font-semibold text-slate-900 ml-1">{currencyFormatter.format(totalSales || 0)}</span>
              </div>
              <div className="px-3 py-1.5 rounded-full bg-slate-50 border border-slate-100">
                Avg/day <span className="font-semibold text-slate-900 ml-1">{currencyFormatter.format(avgDaily)}</span>
              </div>
              {bestDay && (
                <div className="px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700">
                  Peak {bestDay.date.slice(5)} • {currencyFormatter.format(bestDay.total)}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span>Range</span>
              <select
                value={range}
                onChange={(e) => setRange(e.target.value)}
                className="px-3 py-1.5 rounded-full border border-slate-200 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="7">7 days</option>
                <option value="14">14 days</option>
                <option value="30">30 days</option>
              </select>
            </div>
          </div>
        </div>
        <div className="relative h-52 flex items-end gap-2">
          <div className="absolute inset-x-0 bottom-8 border-t border-dashed border-slate-200" />
          {salesByDate.map((d, idx) => {
            const height = Math.max(6, Math.round((d.total / maxSales) * 180));
            const active = hoverBar === idx;
            return (
              <div key={d.date} className="flex-1 flex flex-col items-center">
                <div
                  className={`w-full rounded-t-xl transition-all ${active ? 'bg-indigo-600 shadow-lg' : 'bg-indigo-400/80 hover:bg-indigo-500'}`}
                  style={{ height }}
                  onMouseEnter={() => setHoverBar(idx)}
                  onMouseLeave={() => setHoverBar(null)}
                />
                <div className="mt-2 text-[10px] text-slate-400">{d.date.slice(5)}</div>
              </div>
            );
          })}
          {hoverBar != null && (
            <div className="absolute left-0 right-0 bottom-full mb-3 pointer-events-none flex justify-center">
              <div className="px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs shadow-lg">
                {salesByDate[hoverBar]?.date}: {currencyFormatter.format(salesByDate[hoverBar]?.total || 0)}
              </div>
            </div>
          )}
        </div>
      </div>


      <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">Recent transactions ({rangeLabel})</p>
            <p className="text-xs text-slate-500">Showing {txPageItems.length} of {filteredTx.length}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={txQuery}
              onChange={(e)=>setTxQuery(e.target.value)}
              placeholder="Search id, customer, staff…"
              className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl text-slate-800 w-56"
            />
            <select
              value={txPageSize}
              onChange={(e)=>setTxPageSize(Number(e.target.value))}
              className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl text-slate-800"
            >
              <option value={5}>5 / page</option>
              <option value={10}>10 / page</option>
              <option value={20}>20 / page</option>
            </select>
            <button
              type="button"
              onClick={()=>navigate('/staff/own-sales')}
              className="px-4 py-2 text-sm font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-xl"
            >
              View my sales
            </button>
          </div>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-slate-100">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left font-medium">ID</th>
                <th className="px-4 py-3 text-left font-medium">Date</th>
                <th className="px-4 py-3 text-left font-medium">Customer</th>
                <th className="px-4 py-3 text-left font-medium">Staff</th>
                <th className="px-4 py-3 text-left font-medium">Items</th>
                <th className="px-4 py-3 text-left font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {txPageItems.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-500 text-sm">
                    No transactions found for this range.
                  </td>
                </tr>
              )}
              {txPageItems.map((t) => (
                <tr key={t.id || t.reference || `${t.date}-${t.customer_name}`}>
                  <td className="px-4 py-3 font-semibold text-slate-900">{t.id || t.reference || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{(t.date || t.created_at || '').slice(0,16).replace('T',' ')}</td>
                  <td className="px-4 py-3 text-slate-600">{t.customer_name || 'Walk-in'}</td>
                  <td className="px-4 py-3 text-slate-600">{t.staff_name || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{Array.isArray(t.items)? t.items.length : (t.item_count ?? '—')}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{currencyFormatter.format(Number(t.total || t.amount || t.grand_total || 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredTx.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-slate-500 mt-4">
            <div>Page {txPage} of {txTotalPages}</div>
            <div className="flex items-center gap-2">
              <button onClick={()=>setTxPage(1)} disabled={txPage===1} className={`px-3 py-1.5 rounded-full border text-xs ${txPage===1 ? 'border-slate-100 text-slate-300 cursor-not-allowed' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>First</button>
              <button onClick={()=>setTxPage(p=>Math.max(1,p-1))} disabled={txPage===1} className={`px-3 py-1.5 rounded-full border text-xs ${txPage===1 ? 'border-slate-100 text-slate-300 cursor-not-allowed' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>Prev</button>
              <button onClick={()=>setTxPage(p=>Math.min(txTotalPages,p+1))} disabled={txPage===txTotalPages} className={`px-3 py-1.5 rounded-full border text-xs ${txPage===txTotalPages ? 'border-slate-100 text-slate-300 cursor-not-allowed' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>Next</button>
              <button onClick={()=>setTxPage(txTotalPages)} disabled={txPage===txTotalPages} className={`px-3 py-1.5 rounded-full border text-xs ${txPage===txTotalPages ? 'border-slate-100 text-slate-300 cursor-not-allowed' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>Last</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StaffDashboard;



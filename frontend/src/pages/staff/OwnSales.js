import React, { useEffect, useMemo, useState } from 'react';
import {
  Receipt,
  RefreshCcw,
  Search,
  Printer,
  Calendar,
  ArrowDownUp,
  Package
} from 'lucide-react';
import { POSAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

const PesoIcon = ({ className = '' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M7 20V4h6a5 5 0 0 1 0 10H7" />
    <path d="M7 9h9" />
    <path d="M7 13h9" />
  </svg>
);

const OwnSales = () => {
  const { token, user } = useAuth();
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] = useState('newest');

  const currencyFormatter = useMemo(() => (
    new Intl.NumberFormat(undefined, { style: 'currency', currency: 'PHP' })
  ), []);

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await POSAPI.getTransactions(token, 200, 90); // Get more for own sales page (200 transactions, last 90 days)
      const list = Array.isArray(res?.transactions) ? res.transactions : [];
      const uid = user?.id ? Number(user.id) : null;
      const filtered = uid ? list.filter(s => Number(s.user_id) === uid) : list;
      setSales(filtered);
    } catch (e) {
      setError(e?.message || 'Failed to load sales');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { 
    load(); 
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user?.id]);

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase();
    const sorted = [...sales].sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      if (sort === 'highest') return (b.total_amount || 0) - (a.total_amount || 0);
      if (sort === 'lowest') return (a.total_amount || 0) - (b.total_amount || 0);
      if (sort === 'oldest') return dateA - dateB;
      return dateB - dateA;
    });
    return sorted.filter(s => {
      const created = s.created_at ? new Date(s.created_at) : null;
      const fromOk = !dateFrom || (created && created >= new Date(dateFrom));
      const toOk = !dateTo || (created && created <= new Date(dateTo + 'T23:59:59'));
      const matchesKw = !kw || [
        String(s.id || s.sale_number || ''),
        ...(Array.isArray(s.items) ? s.items.map(i => i.name) : [])
      ].some(v => String(v).toLowerCase().includes(kw));
      return fromOk && toOk && matchesKw;
    });
  }, [sales, search, dateFrom, dateTo, sort]);

  const stats = useMemo(() => {
    const totalRevenue = filtered.reduce((sum, sale) => sum + (Number(sale.total_amount) || 0), 0);
    const totalItems = filtered.reduce((sum, sale) => {
      if (!Array.isArray(sale.items)) return sum;
      return sum + sale.items.reduce((itemSum, item) => itemSum + (Number(item.quantity) || 0), 0);
    }, 0);
    const averageOrder = filtered.length ? totalRevenue / filtered.length : 0;
    return {
      totalRevenue,
      totalItems,
      transactions: filtered.length,
      averageOrder
    };
  }, [filtered]);

  // Pagination
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, totalPages);
  const start = (current - 1) * pageSize;
  const end = Math.min(start + pageSize, total);
  const paged = filtered.slice(start, end);

  useEffect(() => { setPage(1); }, [search, dateFrom, dateTo, pageSize]);

  const handlePrint = () => {
    const rows = filtered.map(s => `
      <tr>
        <td style="border:1px solid #ddd;padding:8px;">${s.id || s.sale_number}</td>
        <td style="border:1px solid #ddd;padding:8px;">${Array.isArray(s.items) ? s.items.map(i => `${i.name} x${i.quantity}`).join(', ') : (s.items_count||'—')}</td>
        <td style="border:1px solid #ddd;padding:8px;">${
          typeof s.total_amount === 'number'
            ? currencyFormatter.format(s.total_amount)
            : (s.total_amount || '—')
        }</td>
        <td style="border:1px solid #ddd;padding:8px;">${new Date(s.created_at).toLocaleString()}</td>
      </tr>
    `).join('');
    const filters = `Search: ${search||'—'} | ${dateFrom||'—'} to ${dateTo||'—'}`;
    const html = `
      <html><head><title>My Sales</title>
      <style>body{font-family:Arial;margin:20px} table{width:100%;border-collapse:collapse} th,td{border:1px solid #ddd;padding:8px;text-align:left} th{background:#f5f5f5}</style>
      </head><body>
      <h2>My Sales</h2>
      <p>${filters}</p>
      <table><thead><tr><th>Sale ID</th><th>Items</th><th>Total</th><th>Date</th></tr></thead><tbody>${rows}</tbody></table>
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html); w.document.close(); w.print();
  };

  const renderItems = (items, fallback) => {
    if (!Array.isArray(items) || items.length === 0) {
      return <span className="text-slate-400 text-xs">{fallback || '—'}</span>;
    }
    return (
      <div className="flex flex-wrap gap-2">
        {items.map((item, idx) => (
          <div
            key={`${item.name}-${idx}`}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-3 py-1 bg-slate-50 text-xs text-slate-700"
          >
            <span className="font-medium text-slate-900">{item.name}</span>
            <span className="text-slate-500">×{item.quantity || 1}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex flex-wrap items-start gap-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center shadow-inner">
              <Receipt className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-white/70">Personal Sales</p>
              <h1 className="text-3xl font-semibold mt-1">Hi {user?.first_name || 'there'}, here’s your performance</h1>
            </div>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="ml-auto inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-white text-indigo-600 rounded-xl hover:bg-white/90 transition shadow"
          >
            <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[
            { label: 'Total Revenue', value: currencyFormatter.format(stats.totalRevenue || 0), icon: PesoIcon },
            { label: 'Transactions', value: stats.transactions, icon: Receipt },
            { label: 'Items Sold', value: stats.totalItems || '—', icon: Package },
            { label: 'Avg. Order Value', value: stats.averageOrder ? currencyFormatter.format(stats.averageOrder) : '—', icon: ArrowDownUp }
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="bg-white/10 rounded-2xl p-4 backdrop-blur border border-white/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/70 text-xs uppercase tracking-wider">{label}</p>
                  <p className="text-2xl font-semibold mt-1">{value}</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-white" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        <div className="flex flex-wrap gap-3 items-center mb-6">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-50 text-xs font-medium text-slate-500">
            <Calendar className="w-3.5 h-3.5" /> Last 90 days of activity
          </div>
          <div className="text-xs text-slate-400">Use filters to focus on a period or ticket</div>
        </div>
        <div className="mb-6 grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-2 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input
              value={search}
              onChange={(e)=>setSearch(e.target.value)}
              placeholder="Search by sale id or product"
              className="w-full pl-12 pr-4 py-3 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 text-sm transition"
            />
          </div>
          <div className="flex gap-3">
            <div className="w-full relative">
              <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                type="date"
                value={dateFrom}
                onChange={(e)=>setDateFrom(e.target.value)}
                className="w-full pl-12 pr-4 py-3 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/40 text-sm"
              />
            </div>
            <div className="w-full relative">
              <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                type="date"
                value={dateTo}
                onChange={(e)=>setDateTo(e.target.value)}
                className="w-full pl-12 pr-4 py-3 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/40 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <select
              value={sort}
              onChange={(e)=>setSort(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-500/40"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="highest">Highest amount</option>
              <option value="lowest">Lowest amount</option>
            </select>
            <button
              onClick={()=>{setSearch(''); setDateFrom(''); setDateTo(''); setSort('newest');}}
              className="px-4 py-3 rounded-2xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
            >
              Clear
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 justify-between items-center mb-6">
          <p className="text-sm text-slate-500">
            Showing <span className="font-semibold text-slate-900">{paged.length}</span> of{' '}
            <span className="font-semibold text-slate-900">{total}</span> sales
          </p>
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-2xl text-sm font-medium hover:bg-slate-800 transition"
          >
            <Printer className="w-4 h-4" /> Export / Print
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-100">
                <th className="py-3 pr-4 font-medium">Sale ID</th>
                <th className="py-3 pr-4 font-medium">Items</th>
                <th className="py-3 pr-4 font-medium">Total</th>
                <th className="py-3 pr-4 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paged.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-10 text-center">
                    <div className="max-w-xs mx-auto">
                      <div className="w-16 h-16 mx-auto rounded-2xl bg-slate-50 flex items-center justify-center mb-4">
                        <Receipt className="w-6 h-6 text-slate-400" />
                      </div>
                      <p className="text-base font-semibold text-slate-800">No sales found</p>
                      <p className="text-sm text-slate-500 mt-1">Try adjusting your filters or date range.</p>
                    </div>
                  </td>
                </tr>
              )}
              {paged.map((s) => (
                <tr key={s.id || s.sale_id} className="hover:bg-slate-50/40 transition">
                  <td className="py-4 pr-4">
                    <div className="font-semibold text-slate-900">{s.id || s.sale_id}</div>
                    <p className="text-xs text-slate-500">{s.sale_number || 'POS Transaction'}</p>
                  </td>
                  <td className="py-4 pr-4 text-slate-600">
                    {renderItems(s.items, s.items_count)}
                  </td>
                  <td className="py-4 pr-4 font-semibold text-slate-900">
                    {typeof s.total_amount === 'number'
                      ? currencyFormatter.format(s.total_amount)
                      : s.total_amount || s.amount || '—'}
                  </td>
                  <td className="py-4 pr-4 text-slate-600">
                    {new Date(s.created_at).toLocaleString(undefined, {
                      dateStyle: 'medium',
                      timeStyle: 'short'
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-4 justify-between mt-6 pt-4 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-500">Rows per page</label>
            <select
              value={pageSize}
              onChange={(e)=>{setPageSize(Number(e.target.value)); setPage(1);}}
              className="px-2 py-1.5 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-500/40"
            >
              {[10,20,50,100].map(s=> <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <button
              onClick={()=>setPage(p=>Math.max(1,p-1))}
              disabled={current===1}
              className={`px-3 py-1.5 rounded-xl border ${current===1 ? 'border-slate-200 text-slate-300 cursor-not-allowed' : 'border-slate-200 hover:bg-slate-50'}`}
            >
              ‹
            </button>
            <span>Page {current} of {totalPages}</span>
            <button
              onClick={()=>setPage(p=>Math.min(totalPages,p+1))}
              disabled={current===totalPages}
              className={`px-3 py-1.5 rounded-xl border ${current===totalPages ? 'border-slate-200 text-slate-300 cursor-not-allowed' : 'border-slate-200 hover:bg-slate-50'}`}
            >
              ›
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OwnSales;



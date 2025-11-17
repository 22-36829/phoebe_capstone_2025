import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardList, Search, Layers, Loader2, ChevronDown, Building2, CheckCircle, Pencil, Trash2, RotateCw, X, Filter } from 'lucide-react';
import { InventoryAPI, POSAPI, ManagerAPI, StaffAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

const InventoryRequests = () => {
  const { token, user } = useAuth();
  // Requests
  const [requests, setRequests] = useState([]);
  const [requestsSearch, setRequestsSearch] = useState('');
  const [requestsDateFrom, setRequestsDateFrom] = useState('');
  const [requestsDateTo, setRequestsDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [reqPage, setReqPage] = useState(1);
  const [reqPageSize, setReqPageSize] = useState(10);
  const [reqTotal, setReqTotal] = useState(0);
  const [editModal, setEditModal] = useState(null); // {id, quantity_change, reason}
  // eslint-disable-next-line no-unused-vars
  const [error, setError] = useState('');

  // Products (for deliveries access only)
  const [products, setProducts] = useState([]);
  const [prodQuery, setProdQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [pageInput, setPageInput] = useState('');
  const prodSearchRef = useRef(null);

  // Deliveries modal state (copied from manager, limited to add/edit only)
  const [deliveriesOpen, setDeliveriesOpen] = useState(false);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);
  const [deliveries, setDeliveries] = useState([]);
  const [deliveryForm, setDeliveryForm] = useState({ quantity: '', expiration_date: '', delivery_date: '', supplier_name: '', cost_price: '' });
  const [deliveryTarget, setDeliveryTarget] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [suppliers, setSuppliers] = useState([]);
  const [deliverySearch, setDeliverySearch] = useState('');
  const [editingDelivery, setEditingDelivery] = useState(null);
  const [deliveryPage, setDeliveryPage] = useState(1);
  const [deliveryPageSize, setDeliveryPageSize] = useState(10);
  const [deliveryPageInput, setDeliveryPageInput] = useState('');
  // eslint-disable-next-line no-unused-vars
  const [inlineEditing, setInlineEditing] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [inlineEditValues, setInlineEditValues] = useState({});
  const [deliveryError, setDeliveryError] = useState('');
  const deliverySearchRef = useRef(null);
  const [requestSuccess, setRequestSuccess] = useState('');

  // Load requests
  const loadRequests = async () => {
    try {
      setLoading(true);
      setError('');
      const baseParams = { page: reqPage, page_size: reqPageSize };
      if (statusFilter) baseParams.status = statusFilter;
      // Staff can see all requests list; backend can scope by role
      const res = await InventoryAPI.listRequests(baseParams, token);
      setRequests(res.requests || []);
      if (typeof res?.total === 'number') setReqTotal(res.total);
    } catch (e) {
      setError(e.message || 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  };

  // Load products for deliveries access
  const loadProducts = async () => {
    try {
      const data = await POSAPI.getProducts();
      if (data.success) setProducts(data.products);
    } catch {}
  };

  useEffect(() => { 
    if (token) { 
      loadRequests(); 
      loadProducts(); 
    } 
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, statusFilter, reqPage, reqPageSize]);

  // Requests filtering like manager (general fields only)
  const filteredRequests = useMemo(() => {
    const kw = requestsSearch.trim().toLowerCase();
    return requests.filter(r => {
      const matchesKw = !kw || [r.product_name, r.requested_by_email, r.trans_type, r.status].filter(Boolean).some(v => String(v).toLowerCase().includes(kw));
      const matchesStatus = !statusFilter || r.status === statusFilter;
      const created = r.created_at ? new Date(r.created_at) : null;
      const fromOk = !requestsDateFrom || (created && created >= new Date(requestsDateFrom));
      const toOk = !requestsDateTo || (created && created <= new Date(requestsDateTo + 'T23:59:59'));
      return matchesKw && matchesStatus && fromOk && toOk;
    });
  }, [requests, requestsSearch, statusFilter, requestsDateFrom, requestsDateTo]);

  const requestStats = useMemo(() => {
    const stats = {
      total: typeof reqTotal === 'number' ? reqTotal : requests.length,
      pending: 0,
      approved: 0,
      rejected: 0,
    };
    requests.forEach(req => {
      if (!req?.status) return;
      if (req.status === 'pending') stats.pending += 1;
      if (req.status === 'approved') stats.approved += 1;
      if (req.status === 'rejected') stats.rejected += 1;
    });
    return stats;
  }, [requests, reqTotal]);

  // Product list filtering for deliveries
  const filteredProducts = useMemo(() => {
    const q = prodQuery.trim().toLowerCase();
    return products.filter(p => !q || [p.name, p.category_name, p.location].filter(Boolean).some(v => String(v).toLowerCase().includes(q)));
  }, [products, prodQuery]);

  // Pagination for products
  const total = filteredProducts.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, totalPages);
  const startIndex = (current - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, total);
  const pagedProducts = filteredProducts.slice(startIndex, endIndex);
  useEffect(() => { setPage(1); setPageInput(''); }, [prodQuery, products]);

  // Deliveries logic (copy minimal from manager)
  const loadSuppliers = async () => {
    try {
      const res = await ManagerAPI.listSuppliers(token);
      if (res && res.success) setSuppliers(res.suppliers || []);
    } catch (e) {
      // Staff may not have access to suppliers; ignore Forbidden
      const msg = (e && (e.error || e.message)) || '';
      if (String(msg).toLowerCase().includes('forbidden')) return;
      // Silently ignore other supplier errors for view-only context
    }
  };

  const openDeliveries = async (product) => {
    setDeliveryTarget(product);
    setDeliveriesOpen(true);
    setDeliveryForm({ quantity: '', expiration_date: '', delivery_date: '', supplier_name: '', cost_price: '' });
    setDeliverySearch('');
    setEditingDelivery(null);
    setDeliveryError('');
    setDeliveryPage(1);
    try {
      setDeliveriesLoading(true);
      const res = user && (user.role === 'manager' || user.role === 'admin')
        ? await ManagerAPI.listBatches(product.id, token)
        : await StaffAPI.listBatches(product.id, token);
      if (res && res.success) setDeliveries(res.batches || []);
      else {
        setDeliveries([]);
        const msg = (res && res.error) ? String(res.error).toLowerCase() : '';
        if (!msg.includes('forbidden')) setDeliveryError(res?.error || 'Unable to load deliveries');
      }
      if (user && (user.role === 'manager' || user.role === 'admin')) {
        await loadSuppliers();
      }
    } catch (e) {
      const msg = (e && (e.error || e.message)) ? String(e.error || e.message).toLowerCase() : '';
      if (!msg.includes('forbidden')) setDeliveryError(e.message || 'Failed to load deliveries');
    } finally {
      setDeliveriesLoading(false);
    }
  };

  const submitDelivery = async (e) => {
    e.preventDefault();
    if (!deliveryTarget) return;
    try {
      setDeliveriesLoading(true);
      setDeliveryError('');

      const newQty = Number(deliveryForm.quantity || 0);
      if (!newQty || Number.isNaN(newQty)) throw new Error('Enter a valid quantity');

      // Compute change: for edits, delta from original; for new, full qty
      const delta = editingDelivery ? (newQty - Number(editingDelivery.quantity || 0)) : newQty;

      const reasonParts = [
        editingDelivery ? 'Proposed edit to existing delivery' : 'Proposed new delivery',
      ];
      if (deliveryForm.supplier_name) reasonParts.push(`Supplier: ${deliveryForm.supplier_name}`);
      if (deliveryForm.delivery_date) reasonParts.push(`Delivery date: ${deliveryForm.delivery_date}`);
      if (deliveryForm.expiration_date) reasonParts.push(`Expiry: ${deliveryForm.expiration_date}`);
      if (deliveryForm.cost_price) reasonParts.push(`Cost: ₱${Number(deliveryForm.cost_price).toFixed(2)}`);
      const reason = reasonParts.join(' • ');

      // Create inventory request for manager approval
      let res = await InventoryAPI.createRequest({
        product_id: Number(deliveryTarget.id),
        quantity_change: delta,
        reason,
      }, token);
      // If server fails with 500 (no JSON), res may be undefined; try a blind retry once
      if (!res || res.success === false) {
        const errMsg = (res && res.error ? String(res.error).toLowerCase() : '');
        if (!res || errMsg.includes('trans_type') || errMsg.includes('500')) {
          res = await InventoryAPI.createRequest({ product_id: Number(deliveryTarget.id), quantity_change: delta, reason }, token);
        }
      }
      if (res && res.success === false) throw new Error(res.error || 'Failed to submit request');

      // Refresh requests and close modal
      // Optimistically show in the table immediately
      setRequests(prev => [
        {
          id: res?.request?.id || `temp_${Date.now()}`,
          product_id: Number(deliveryTarget.id),
          product_name: deliveryTarget.name,
          quantity_change: delta,
          reason,
          status: 'pending',
          requested_by_email: user?.email || undefined,
          requested_by_first_name: user?.first_name || undefined,
          requested_by_last_name: user?.last_name || undefined,
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);
      setRequestSuccess('Delivery request submitted');
      setTimeout(()=>setRequestSuccess(''), 1500);
      await loadRequests();
      setDeliveriesOpen(false);
      setDeliveryForm({ quantity: '', expiration_date: '', delivery_date: '', supplier_name: '', cost_price: '' });
      setEditingDelivery(null);
    } catch (e) {
      setDeliveryError(e.message || 'Failed to submit request');
    } finally {
      setDeliveriesLoading(false);
    }
  };

  // eslint-disable-next-line no-unused-vars
  const startEditProposal = (delivery) => {
    setEditingDelivery(delivery);
    setDeliveryForm({
      quantity: String(delivery.quantity ?? ''),
      expiration_date: delivery.expiration_date || '',
      delivery_date: delivery.delivery_date || '',
      supplier_name: delivery.supplier_name || '',
      cost_price: delivery.cost_price ? String(delivery.cost_price) : '',
    });
  };

  const filteredDeliveries = useMemo(() => {
    if (!deliverySearch.trim()) return deliveries;
    const search = deliverySearch.toLowerCase();
    return deliveries.filter(delivery => 
      delivery.supplier_name?.toLowerCase().includes(search) ||
      delivery.expiration_date?.includes(search) ||
      delivery.delivery_date?.includes(search) ||
      String(delivery.quantity).includes(search) ||
      String(delivery.cost_price || '').includes(search)
    );
  }, [deliveries, deliverySearch]);

  const deliveryTotal = filteredDeliveries.length;
  const deliveryTotalPages = Math.max(1, Math.ceil(deliveryTotal / deliveryPageSize));
  const deliveryCurrentPage = Math.min(deliveryPage, deliveryTotalPages);
  const deliveryStartIndex = (deliveryCurrentPage - 1) * deliveryPageSize;
  const deliveryEndIndex = Math.min(deliveryStartIndex + deliveryPageSize, deliveryTotal);
  const paginatedDeliveries = filteredDeliveries.slice(deliveryStartIndex, deliveryEndIndex);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 via-blue-600 to-sky-500 px-6 py-8 text-white shadow-xl">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-10 right-10 h-32 w-32 rounded-full bg-white/20 blur-3xl" />
          <div className="absolute -bottom-8 left-16 h-24 w-24 rounded-full bg-sky-300/20 blur-2xl" />
        </div>
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center">
          <div className="flex flex-1 items-start gap-4">
            <div className="h-14 w-14 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center shadow-inner shadow-white/30">
              <ClipboardList className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/70">Operations</p>
              <h1 className="text-3xl font-bold tracking-tight">Inventory Requests</h1>
              <p className="mt-2 text-white/80">
                Submit delivery proposals and monitor approval status in one place.
              </p>
              <div className="mt-4 flex flex-wrap gap-3 text-xs sm:text-sm">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-3 py-1 backdrop-blur">
                  <Loader2 className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  {loading ? 'Refreshing data…' : 'Data current'}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-3 py-1 backdrop-blur">
                  <Layers className="w-3.5 h-3.5" />
                  {products.length ? `${products.length} products available` : 'Loading product catalog'}
                </span>
              </div>
            </div>
          </div>
          <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4 lg:w-auto">
            {[
              { label: 'Total Requests', value: requestStats.total, accent: 'text-white' },
              { label: 'Pending', value: requestStats.pending, accent: 'text-amber-200' },
              { label: 'Approved', value: requestStats.approved, accent: 'text-emerald-200' },
              { label: 'Rejected', value: requestStats.rejected, accent: 'text-rose-200' },
            ].map(stat => (
              <div
                key={stat.label}
                className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 backdrop-blur shadow-md shadow-black/10"
              >
                <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-white/70">
                  {stat.label}
                </p>
                <p className={`mt-1 text-2xl font-semibold ${stat.accent}`}>
                  {stat.value ?? 0}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Requests (read-only, general fields) */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Inventory Requests</h2>
        </div>
        <div className="p-6">
          {requestSuccess && (
            <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800 text-sm flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              {requestSuccess}
            </div>
          )}
          
          {/* Professional Filters */}
          <div className="bg-gradient-to-r from-gray-50 to-indigo-50/30 border-2 border-indigo-200 rounded-xl p-4 mb-4 shadow-sm">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-indigo-200/50">
              <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
                <Filter className="w-4 h-4 text-indigo-600" />
              </div>
              <h3 className="text-sm font-semibold text-indigo-900">Filter Requests</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Search Keyword</label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input 
                    value={requestsSearch} 
                    onChange={(e)=>setRequestsSearch(e.target.value)} 
                    placeholder="Search keyword..." 
                    className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white shadow-sm transition-all" 
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Date From</label>
                <input 
                  type="date" 
                  value={requestsDateFrom} 
                  onChange={(e)=>setRequestsDateFrom(e.target.value)} 
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white shadow-sm transition-all" 
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Date To</label>
                <input 
                  type="date" 
                  value={requestsDateTo} 
                  onChange={(e)=>setRequestsDateTo(e.target.value)} 
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white shadow-sm transition-all" 
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Status</label>
                <div className="relative">
                  <select 
                    value={statusFilter} 
                    onChange={(e)=>setStatusFilter(e.target.value)} 
                    className="w-full appearance-none px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 pr-8 bg-white shadow-sm transition-all"
                  >
                    <option value="">All Status</option>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                  <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
                <button 
                  onClick={()=>{
                    setRequestsSearch(''); 
                    setRequestsDateFrom(''); 
                    setRequestsDateTo(''); 
                    setStatusFilter('');
                  }} 
                  className="px-3.5 py-2 text-sm font-semibold text-gray-700 border border-gray-200 rounded-md bg-white/90 hover:bg-white focus-visible:ring-1 focus-visible:ring-offset-1 focus-visible:ring-gray-300 transition-all shadow-sm flex items-center justify-center gap-1.5"
                  title="Clear all filters"
                >
                  <X className="w-4 h-4" />
                  Clear
                </button>
                <button 
                  onClick={loadRequests} 
                  className="px-3.5 py-2 text-sm font-semibold text-white rounded-md bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 border border-indigo-500 focus-visible:ring-1 focus-visible:ring-offset-1 focus-visible:ring-indigo-500 transition-all shadow flex items-center justify-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
                  disabled={loading}
                  title="Refresh requests list"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RotateCw className="w-4 h-4" />
                  )}
                  Refresh
                </button>
              </div>
            </div>
          </div>
          {loading ? (
            <div className="text-center py-12 text-gray-500">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
              Loading requests...
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <ClipboardList className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              No requests found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-600 bg-gray-50 border-b border-gray-200">
                    <th className="py-3 px-4 font-semibold">Product</th>
                    <th className="py-3 px-4 font-semibold">Qty Change</th>
                    <th className="py-3 px-4 font-semibold">Status</th>
                    <th className="py-3 px-4 font-semibold">Requested By</th>
                    <th className="py-3 px-4 font-semibold">Created</th>
                    <th className="py-3 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRequests.map(r => (
                    <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-4 font-medium text-gray-900">{r.product_name}</td>
                      <td className={`py-3 px-4 ${r.quantity_change < 0 ? 'text-rose-600' : 'text-emerald-700'} font-semibold`}>
                        {r.quantity_change > 0 ? '+' : ''}{r.quantity_change}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                          r.status === 'pending' 
                            ? 'bg-amber-100 text-amber-700 border border-amber-200' 
                            : r.status === 'approved' 
                            ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' 
                            : 'bg-rose-100 text-rose-700 border border-rose-200'
                        }`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-700">
                        {(r.requested_by_first_name || r.requested_by_last_name) 
                          ? `${r.requested_by_first_name||''} ${r.requested_by_last_name||''}`.trim() 
                          : (r.requested_by_email || r.requested_by)}
                      </td>
                      <td className="py-3 px-4 text-gray-600 text-sm">
                        {new Date(r.created_at).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {(r.status === 'pending' || r.status === 'rejected') && user && String(r.requested_by) === String(user.id) && (
                          <div className="flex items-center justify-end gap-2">
                            {r.status === 'pending' && (
                              <button 
                                onClick={()=>setEditModal({ id: r.id, quantity_change: r.quantity_change, reason: r.reason||'' })} 
                                className="p-2 rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50 shadow-sm hover:shadow transition-colors"
                                title="Edit request"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                            )}
                            <button 
                              onClick={async()=>{ 
                                if(!window.confirm('Delete this request?')) return; 
                                await InventoryAPI.deleteRequest(r.id, token); 
                                await loadRequests(); 
                              }} 
                              className="p-2 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 shadow-sm hover:shadow transition-colors"
                              title="Delete request"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {/* Pagination */}
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
                <div className="text-sm text-gray-600">
                  Total Requests: <span className="font-semibold text-gray-900">{reqTotal}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-600">Items per page:</label>
                    <select 
                      value={reqPageSize} 
                      onChange={(e)=>{setReqPageSize(Number(e.target.value)); setReqPage(1);}} 
                      className="px-2 py-1.5 text-xs border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
                    >
                      {[10,25,50,100].map(s=> <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-full px-2 py-1 shadow-sm">
                    <button 
                      onClick={()=>setReqPage(p=>Math.max(1,p-1))} 
                      disabled={reqPage===1} 
                      className={`w-8 h-8 inline-flex items-center justify-center rounded-full text-sm ${reqPage===1?'opacity-40 cursor-not-allowed text-gray-400':'hover:bg-gray-50 text-gray-700'}`}
                    >
                      ‹
                    </button>
                    <span className="text-sm text-gray-700 px-2">
                      Page <span className="font-semibold">{reqPage}</span> of <span className="font-semibold">{Math.max(1, Math.ceil(reqTotal/reqPageSize))}</span>
                    </span>
                    <button 
                      onClick={()=>setReqPage(p=>Math.min(Math.max(1, Math.ceil(reqTotal/reqPageSize)), p+1))} 
                      disabled={reqPage>=Math.ceil(reqTotal/reqPageSize)} 
                      className={`w-8 h-8 inline-flex items-center justify-center rounded-full text-sm ${reqPage>=Math.ceil(reqTotal/reqPageSize)?'opacity-40 cursor-not-allowed text-gray-400':'hover:bg-gray-50 text-gray-700'}`}
                    >
                      ›
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Products (Deliveries access only) */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Deliveries</h2>
            <p className="text-sm text-gray-600">Open a product to add a delivery request</p>
          </div>
        </div>
        <div className="p-6">
          {/* Professional Filters */}
          <div className="bg-gradient-to-r from-gray-50 to-indigo-50 border-2 border-indigo-200 rounded-xl p-4 mb-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-indigo-200">
              <Filter className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-semibold text-indigo-900">Search & Filter Products</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-8">
                <label className="block text-sm font-medium text-gray-700 mb-1">Search Products</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input 
                    value={prodQuery} 
                    onChange={(e)=>setProdQuery(e.target.value)} 
                    placeholder="Search by name, category, or location..." 
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white text-sm shadow-sm" 
                    ref={prodSearchRef} 
                  />
                </div>
              </div>
              <div className="md:col-span-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Items per page</label>
                <div className="relative">
                  <select 
                    value={pageSize} 
                    onChange={(e)=>setPageSize(Number(e.target.value))} 
                    className="w-full appearance-none px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white text-sm shadow-sm"
                  >
                    {[10,12,20,50].map(s=> <option key={s} value={s}>{s}</option>)}
                  </select>
                  <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            </div>
          </div>

        <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-600 bg-gray-50 border-b border-gray-200">
                  <th className="py-3 px-4 font-semibold">Product</th>
                  <th className="py-3 px-4 font-semibold">Category</th>
                  <th className="py-3 px-4 font-semibold">Current Stock</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedProducts.map(p => (
                  <tr key={p.id} className="border-b border-gray-100 hover:bg-indigo-50/40 transition-colors">
                    <td className="py-3 px-4 font-medium text-gray-900">{p.name}</td>
                    <td className="py-3 px-4 text-gray-700">{p.category_name || '—'}</td>
                    <td className="py-3 px-4 text-gray-900 font-semibold">{p.current_stock}</td>
                    <td className="py-3 px-4 text-right">
                      <button 
                        onClick={() => openDeliveries(p)} 
                        className="inline-flex items-center gap-1 px-3 py-1.5 border border-indigo-300 text-indigo-600 rounded-md hover:bg-indigo-50 transition-colors text-sm font-medium"
                      >
                        <Layers className="w-4 h-4" /> Deliveries
                      </button>
                    </td>
                  </tr>
                ))}
                {pagedProducts.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-gray-500">
                      <ClipboardList className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      No products found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {total > pageSize && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
              <div className="text-sm text-gray-600">
                Total Items: <span className="font-semibold text-gray-900">{total}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-full px-2 py-1 shadow-sm">
                  <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={current===1} className={`w-8 h-8 inline-flex items-center justify-center rounded-full text-sm ${current===1?'opacity-40 cursor-not-allowed text-gray-400':'hover:bg-gray-50 text-gray-700'}`}>‹</button>
                  {Array.from({length: Math.min(5, totalPages)}, (_,i)=> Math.max(1, current-2)+i).map(num => (
                    <button key={num} onClick={()=>setPage(num)} className={`w-8 h-8 inline-flex items-center justify-center rounded-md text-sm font-medium ${num===current?'bg-indigo-600 text-white shadow-sm':'border border-gray-300 text-gray-700 hover:bg-gray-50'}`}>{num}</button>
                  ))}
                  <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={current===totalPages} className={`w-8 h-8 inline-flex items-center justify-center rounded-full text-sm ${current===totalPages?'opacity-40 cursor-not-allowed text-gray-400':'hover:bg-gray-50 text-gray-700'}`}>›</button>
                </div>
                <form onSubmit={(e)=>{e.preventDefault(); const n=parseInt(pageInput,10); if(!Number.isNaN(n)){ const c=Math.max(1, Math.min(totalPages, n)); setPage(c);} setPageInput('');}} className="flex items-center gap-2 text-sm text-gray-700">
                  <span>Go to page:</span>
                  <input type="number" min="1" max={totalPages} value={pageInput} onChange={(e)=>setPageInput(e.target.value)} placeholder={`${current}`} className="w-16 px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-center bg-white" />
                  <span className="text-sm text-gray-600">of {totalPages}</span>
                  <button type="submit" className="px-3 py-1.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-xs font-medium">Go</button>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Deliveries Modal (add/edit only) */}
      {deliveriesOpen && deliveryTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-7xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Layers className="w-5 h-5"/>
                Deliveries — {deliveryTarget.name}
              </div>
              <button onClick={() => setDeliveriesOpen(false)} className="px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50">Close</button>
            </div>

            {deliveryError && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800 flex items-start justify-between gap-4">
                <div className="text-sm"><strong className="font-semibold">Error:</strong> {deliveryError}</div>
                <button onClick={() => setDeliveryError('')} className="text-sm font-medium text-red-700 hover:underline">Dismiss</button>
              </div>
            )}

            <div className="mb-4">
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"/>
                <input type="text" value={deliverySearch} onChange={(e)=>setDeliverySearch(e.target.value)} placeholder="Search deliveries by supplier, date, quantity, or cost..." className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent" ref={deliverySearchRef} />
              </div>
            </div>

            {/* Add/Edit Delivery Form */}
            <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <h3 className="text-sm font-medium text-gray-900 mb-3">
                {editingDelivery ? 'Edit Delivery Request' : 'Add New Delivery Request'}
              </h3>
              <form onSubmit={submitDelivery} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Quantity *</label>
                  <input 
                    type="number" 
                    min={1} 
                    value={deliveryForm.quantity} 
                    onChange={(e)=>setDeliveryForm(f=>({...f,quantity:e.target.value}))} 
                    placeholder="Enter quantity" 
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent" 
                    required 
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Expiration Date</label>
                  <input 
                    type="date" 
                    value={deliveryForm.expiration_date} 
                    onChange={(e)=>setDeliveryForm(f=>({...f,expiration_date:e.target.value}))} 
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Delivery Date</label>
                  <input 
                    type="date" 
                    value={deliveryForm.delivery_date} 
                    onChange={(e)=>setDeliveryForm(f=>({...f,delivery_date:e.target.value}))} 
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Supplier Name</label>
                  <input 
                    type="text" 
                    value={deliveryForm.supplier_name} 
                    onChange={(e)=>setDeliveryForm(f=>({...f,supplier_name:e.target.value}))} 
                    placeholder="Enter supplier name" 
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Cost Price</label>
                  <input 
                    type="number" 
                    min={0} 
                    step="0.01" 
                    value={deliveryForm.cost_price} 
                    onChange={(e)=>setDeliveryForm(f=>({...f,cost_price:e.target.value}))} 
                    placeholder="₱0.00"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent" 
                  />
                </div>
              </form>
              <div className="flex items-center gap-2 mt-4">
                <button 
                  type="submit" 
                  onClick={submitDelivery} 
                  disabled={deliveriesLoading} 
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2"
                >
                  {deliveriesLoading && <Loader2 className="w-4 h-4 animate-spin"/>}
                  {editingDelivery ? 'Update Delivery Request' : 'Add Delivery Request'}
                </button>
              </div>
            </div>

            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium text-gray-700">{deliveryTotal} delivery{deliveryTotal !== 1 ? 'ies' : ''} found</span>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-600">Per page:</label>
                    <select value={deliveryPageSize} onChange={(e)=>{setDeliveryPageSize(Number(e.target.value)); setDeliveryPage(1);}} className="text-xs px-2 py-1 border border-gray-300 rounded">
                      {[5,10,20,50].map(size => (<option key={size} value={size}>{size}</option>))}
                    </select>
                  </div>
                </div>
                {deliverySearch && (
                  <button onClick={() => setDeliverySearch('')} className="text-xs text-indigo-600 hover:text-indigo-800">Clear search</button>
                )}
              </div>
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-600 bg-gray-50">
                    <th className="py-3 px-4">Delivered</th>
                    <th className="py-3 px-4">Sold</th>
                    <th className="py-3 px-4">Available</th>
                    <th className="py-3 px-4">Expiration Date</th>
                    <th className="py-3 px-4">Delivery Date</th>
                    <th className="py-3 px-4">Supplier</th>
                    <th className="py-3 px-4">Cost Price</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedDeliveries.map((delivery) => {
                    // Calculate delivered quantity (excluding disposed)
                    const deliveredQty = delivery.delivered_quantity !== undefined 
                      ? delivery.delivered_quantity 
                      : (delivery.quantity || 0) - (delivery.disposed_quantity || 0);
                    
                    // Calculate available quantity
                    const isExpired = delivery.expiration_date && new Date(delivery.expiration_date) <= new Date();
                    const availableQty = isExpired ? 0 : (delivery.available_quantity ?? ((delivery.quantity || 0) - (delivery.sold_quantity || 0)));
                    
                    return (
                      <tr key={delivery.id} className="border-t border-gray-100 hover:bg-gray-50">
                        {/* Delivered Quantity */}
                        <td className="py-3 px-4">
                          <span className="font-medium">{deliveredQty}</span>
                        </td>
                        
                        {/* Sold Quantity */}
                        <td className="py-3 px-4">
                          <span className="font-medium text-red-600">{delivery.sold_quantity || 0}</span>
                        </td>
                        
                        {/* Available Quantity */}
                        <td className="py-3 px-4">
                          <span className={`font-medium ${isExpired ? 'text-gray-400 line-through' : 'text-emerald-600'}`}>
                            {availableQty}
                          </span>
                        </td>
                        
                        {/* Expiration Date */}
                        <td className="py-3 px-4">
                          {delivery.expiration_date ? (
                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                              new Date(delivery.expiration_date) < new Date() 
                                ? 'bg-red-100 text-red-700' 
                                : new Date(delivery.expiration_date) < new Date(Date.now() + 30*24*60*60*1000)
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-green-100 text-green-700'
                            }`}>
                              {new Date(delivery.expiration_date).toLocaleDateString()}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        
                        {/* Delivery Date */}
                        <td className="py-3 px-4">
                          {delivery.delivery_date ? new Date(delivery.delivery_date).toLocaleDateString() : '—'}
                        </td>
                        
                        {/* Supplier */}
                        <td className="py-3 px-4">
                          {delivery.supplier_name ? (
                            <div className="flex items-center gap-1">
                              <Building2 className="w-3 h-3 text-gray-400"/>
                              {delivery.supplier_name}
                            </div>
                          ) : (
                            '—'
                          )}
                        </td>
                        
                        {/* Cost Price */}
                        <td className="py-3 px-4">
                          {delivery.cost_price ? `₱${Number(delivery.cost_price).toFixed(2)}` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                  {(!paginatedDeliveries || paginatedDeliveries.length === 0) && (
                    <tr>
                      <td className="py-8 px-4 text-center text-gray-500" colSpan={7}>
                        {deliveriesLoading ? 'Loading deliveries…' : 
                         deliverySearch ? 'No deliveries match your search' : 'No deliveries recorded yet'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

                  {deliveryTotal > deliveryPageSize && (
                    <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
                      <div className="text-sm text-gray-600">Showing <span className="font-semibold">{deliveryStartIndex + 1}-{deliveryEndIndex}</span> of <span className="font-semibold">{deliveryTotal}</span> deliveries</div>
                      <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-full px-2 py-1 shadow-sm">
                        <button onClick={() => setDeliveryPage(p => Math.max(1, p - 1))} disabled={deliveryCurrentPage === 1} className={`w-8 h-8 inline-flex items-center justify-center rounded-full text-sm ${deliveryCurrentPage === 1 ? 'opacity-40 cursor-not-allowed text-gray-400' : 'hover:bg-gray-50 text-gray-700'}`}>‹</button>
                        {Array.from({ length: Math.min(5, deliveryTotalPages) }, (_, i) => { const start = Math.max(1, deliveryCurrentPage - 2); return Math.min(deliveryTotalPages, start + i); }).map((pageNum) => (
                          <button key={pageNum} onClick={() => setDeliveryPage(pageNum)} className={`w-8 h-8 inline-flex items-center justify-center rounded-md text-sm font-medium ${deliveryCurrentPage === pageNum ? 'bg-indigo-600 text-white shadow-sm' : 'border border-gray-300 text-gray-700 hover:bg-gray-50'}`}>{pageNum}</button>
                        ))}
                        <button onClick={() => setDeliveryPage(p => Math.min(deliveryTotalPages, p + 1))} disabled={deliveryCurrentPage === deliveryTotalPages} className={`w-8 h-8 inline-flex items-center justify-center rounded-full text-sm ${deliveryCurrentPage === deliveryTotalPages ? 'opacity-40 cursor-not-allowed text-gray-400' : 'hover:bg-gray-50 text-gray-700'}`}>›</button>
                        <div className="flex items-center gap-2 ml-2 pl-2 border-l border-gray-200 text-sm text-gray-700">
                          <span>Go to page:</span>
                          <form onSubmit={(e)=>{e.preventDefault(); const n=parseInt(deliveryPageInput,10); if(!Number.isNaN(n)){ const c=Math.max(1, Math.min(deliveryTotalPages, n)); setDeliveryPage(c);} setDeliveryPageInput('');}} className="flex items-center gap-2">
                            <input type="number" min="1" max={deliveryTotalPages} value={deliveryPageInput} onChange={(e)=>setDeliveryPageInput(e.target.value)} placeholder={`${deliveryCurrentPage}`} className="w-16 px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-center" />
                            <span className="text-sm text-gray-600">of {deliveryTotalPages}</span>
                            <button type="submit" className="px-3 py-1.5 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-xs font-medium">Go</button>
                          </form>
                        </div>
                      </div>
                    </div>
                  )}
            </div>
          </div>
        </div>
      )}

      {editModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <div className="text-lg font-semibold text-gray-900 mb-4">Edit Delivery Request</div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantity Change</label>
                <input type="number" value={editModal.quantity_change} onChange={(e)=>setEditModal(m=>({...m, quantity_change: Number(e.target.value)}))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                <textarea rows={3} value={editModal.reason} onChange={(e)=>setEditModal(m=>({...m, reason: e.target.value}))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button onClick={()=>setEditModal(null)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={async()=>{ await InventoryAPI.updateRequest(editModal.id, { quantity_change: editModal.quantity_change, reason: editModal.reason }, token); setEditModal(null); await loadRequests(); }} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InventoryRequests;



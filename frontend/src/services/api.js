const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:5000';

// Simple in-memory cache for GET requests (2 second TTL for faster updates)
const requestCache = new Map();
const CACHE_TTL = 2000; // 2 seconds

function getCached(path, token) {
  const key = `GET:${path}:${token ? 'auth' : 'no-auth'}`;
  const cached = requestCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

function setCache(path, token, data) {
  const key = `GET:${path}:${token ? 'auth' : 'no-auth'}`;
  requestCache.set(key, { data, timestamp: Date.now() });
}

export async function apiRequest(path, { method = 'GET', body, token, useCache = true } = {}) {
  // Use cache for GET requests only
  if (method === 'GET' && useCache) {
    const cached = getCached(path, token);
    if (cached) {
      return cached;
    }
  }
  
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    
    // Cache successful GET responses
    if (method === 'GET' && useCache && res.ok) {
      setCache(path, token, data);
    }
    
    // Handle token expiration
    if (res.status === 401 && (data.error === 'Token expired' || data.error === 'Invalid token')) {
      // Clear expired token and redirect to login
      localStorage.removeItem('phoebe_token');
      localStorage.removeItem('phoebe_user');
      window.location.href = '/login';
      return;
    }
    
    // For non-200 responses, return the data so the caller can check success/error
    if (!res.ok) {
      // Return error data instead of throwing, so caller can check res.success
      return { success: false, error: data.error || `Request failed with status ${res.status}` };
    }
    return data;
  } catch (error) {
    // Handle network errors, CORS errors, or other fetch failures
    if (error.message === 'Failed to fetch' || error.message.includes('ECONNREFUSED')) {
      return { 
        success: false, 
        error: 'Unable to connect to server. Please ensure the backend server is running on port 5000.' 
      };
    }
    // For other errors, return them
    return { success: false, error: error.message || 'An unexpected error occurred' };
  }
}

export const AuthAPI = {
  login: (email, password) => apiRequest('/api/auth/login', { method: 'POST', body: { email, password } }),
  register: (payload) => apiRequest('/api/auth/register', { method: 'POST', body: payload }),
  me: (token) => apiRequest('/api/auth/me', { token }),
};

export const POSAPI = {
  getProducts: () => apiRequest('/api/pos/products'),
  getCategories: () => apiRequest('/api/pos/categories'),
  processSale: (saleData, token) => apiRequest('/api/pos/process-sale', { method: 'POST', body: saleData, token }),
  getTransactions: (token, limit = 50, days = 30) => apiRequest(`/api/pos/transactions?limit=${limit}&days=${days}`, { token }),
  processReturn: (returnData, token) => apiRequest('/api/pos/process-return', { method: 'POST', body: returnData, token }),
  getReturnDetails: (saleId, token) => apiRequest(`/api/pos/return-details/${saleId}`, { token }),
};

export const ManagerAPI = {
  listStaff: (token, status = 'all') => apiRequest(`/api/manager/staff?status=${encodeURIComponent(status)}`, { token }),
  createStaff: (payload, token) => apiRequest('/api/manager/staff', { method: 'POST', body: payload, token }),
  updateStaff: (id, payload, token) => apiRequest(`/api/manager/staff/${id}`, { method: 'PATCH', body: payload, token }),
  deleteStaff: (id, token) => apiRequest(`/api/manager/staff/${id}`, { method: 'DELETE', token }),
  createProduct: (payload, token) => apiRequest('/api/manager/products', { method: 'POST', body: payload, token }),
  updateProduct: (id, payload, token) => apiRequest(`/api/manager/products/${id}`, { method: 'PATCH', body: payload, token }),
  deactivateProduct: (id, token) => apiRequest(`/api/manager/products/${id}`, { method: 'DELETE', token }),
  reactivateProduct: (id, token) => apiRequest(`/api/manager/products/${id}/reactivate`, { method: 'POST', token }),
  hardDeleteProduct: (id, token) => apiRequest(`/api/manager/products/${id}/hard`, { method: 'DELETE', token }),
  listProductsByStatus: (status, token) => apiRequest(`/api/manager/products?status=${encodeURIComponent(status)}`, { token }),
  createCategory: (name, token) => apiRequest('/api/manager/categories', { method: 'POST', body: { name }, token }),
  updateProfile: (payload, token) => apiRequest('/api/manager/profile', { method: 'PATCH', body: payload, token }),
  getPharmacy: (token) => apiRequest('/api/manager/pharmacy', { token }),
  updatePharmacy: (payload, token) => apiRequest('/api/manager/pharmacy', { method: 'PATCH', body: payload, token }),
  requestPharmacyDeletion: (reason, token) => apiRequest('/api/manager/pharmacy/request-deletion', { method: 'POST', body: { reason }, token }),
  changePassword: (payload, token) => apiRequest('/api/manager/change-password', { method: 'POST', body: payload, token }),
  setInventoryExpiration: (productId, expiration_date, token) => apiRequest(`/api/manager/inventory/expiration/${productId}`, { method: 'PATCH', body: { expiration_date }, token }),
  getAnalyticsOverview: (params = {}, token) => {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`/api/manager/analytics/overview${q ? `?${q}` : ''}`, { token });
  },
  getExpiryAlerts: (token) => apiRequest('/api/manager/analytics/expiry-alerts', { token }),
  // Enhanced Sustainability Analytics
  getInventoryUtilization: (params = {}, token) => {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`/api/manager/sustainability/inventory-utilization${q ? `?${q}` : ''}`, { token });
  },
  getExpiryRisk: (params = {}, token) => {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`/api/manager/sustainability/expiry-risk${q ? `?${q}` : ''}`, { token });
  },
  getWasteReduction: (params = {}, token) => {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`/api/manager/sustainability/waste-reduction${q ? `?${q}` : ''}`, { token });
  },
  getSustainabilityDashboard: (params = {}, token) => {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`/api/manager/sustainability/dashboard${q ? `?${q}` : ''}`, { token });
  },
  // ABC-VED analytics
  getABCVED: (params = {}, token) => {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`/api/manager/analytics/abc-ved${q ? `?${q}` : ''}`, { token });
  },
  getReturnedItems: (token) => apiRequest('/api/manager/returned-items', { token }),
  // Inventory dashboard
  getInventoryDashboard: (token) => apiRequest('/api/manager/inventory/dashboard', { token }),
  getInventoryHistory: (months = 6, token) => apiRequest(`/api/manager/inventory/history?months=${months}`, { token }),
  // Suppliers
  listSuppliers: (token) => apiRequest('/api/manager/suppliers', { token }),
  createSupplier: (payload, token) => apiRequest('/api/manager/suppliers', { method: 'POST', body: payload, token }),
  updateSupplier: (id, payload, token) => apiRequest(`/api/manager/suppliers/${id}`, { method: 'PATCH', body: payload, token }),
  disposeExpiredProduct: (productId, quantity, token) => apiRequest(`/api/manager/dispose-expired/${productId}`, { method: 'POST', body: { quantity }, token }),
  listDisposedProducts: (token, params = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.append('page', params.page);
    if (params.page_size) query.append('page_size', params.page_size);
    if (params.search) query.append('search', params.search);
    if (params.date_from) query.append('date_from', params.date_from);
    if (params.date_to) query.append('date_to', params.date_to);
    return apiRequest(`/api/manager/disposed-products?${query.toString()}`, { token });
  },
  deleteSupplier: (id, token) => apiRequest(`/api/manager/suppliers/${id}`, { method: 'DELETE', token }),
  // Purchase Orders
  createPurchaseOrder: (payload, token) => apiRequest('/api/manager/purchase-orders', { method: 'POST', body: payload, token }),
  listPurchaseOrders: (token) => apiRequest('/api/manager/purchase-orders', { token }),
  updatePurchaseOrder: (id, payload, token) => apiRequest(`/api/manager/purchase-orders/${id}`, { method: 'PATCH', body: payload, token }),
  // Batches (Deliveries)
  listBatches: (productId, token) => apiRequest(`/api/manager/batches/${productId}`, { token }),
  createBatch: (productId, payload, token) => apiRequest(`/api/manager/batches/${productId}`, { method: 'POST', body: payload, token }),
  updateBatch: (batchId, payload, token) => apiRequest(`/api/manager/batches/${batchId}`, { method: 'PATCH', body: payload, token }),
  deleteBatch: (batchId, token) => apiRequest(`/api/manager/batches/${batchId}`, { method: 'DELETE', token }),
  generateReport: (endpoint, params, token) => {
    const queryString = new URLSearchParams(params).toString();
    const url = `${endpoint}${queryString ? `?${queryString}` : ''}`;
    return apiRequest(url, { token });
  },
  
  // Forecasting API methods
  trainForecastingModel: (data, token) => apiRequest('/api/forecasting/train', { method: 'POST', body: data, token }),
  // Removed manual retraining - now handled automatically by smart monitoring
  getForecasts: (params, token) => apiRequest(`/api/forecasting/predictions?${new URLSearchParams(params)}`, { token }),
  getForecastingModels: (token) => apiRequest('/api/forecasting/models', { token }),
  getForecastingAccuracy: (token) => apiRequest('/api/forecasting/accuracy', { token }),
  getForecastableProducts: (token) => apiRequest('/api/forecasting/products', { token }),
  getForecastableCategories: (token) => apiRequest('/api/forecasting/categories', { token }),
  getHistoricalSeries: (params, token) => {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`/api/forecasting/historical?${q}`, { token });
  },
};

export const InventoryAPI = {
  createRequest: (payload, token) => apiRequest('/api/inventory/requests', { method: 'POST', body: payload, token }),
  listRequests: (params = {}, token) => {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`/api/inventory/requests${q ? `?${q}` : ''}`, { token });
  },
  approveRequest: (id, token) => apiRequest(`/api/inventory/requests/${id}/approve`, { method: 'POST', token }),
  rejectRequest: (id, token) => apiRequest(`/api/inventory/requests/${id}/reject`, { method: 'POST', token }),
  updateRequest: (id, payload, token) => apiRequest(`/api/inventory/requests/${id}`, { method: 'PATCH', body: payload, token }),
  deleteRequest: (id, token) => apiRequest(`/api/inventory/requests/${id}`, { method: 'DELETE', token }),
  updateStockDirect: (productId, current_stock, token) => apiRequest(`/api/manager/inventory/${productId}`, { method: 'PATCH', body: { current_stock }, token }),
};

export const StaffAPI = {
  listBatches: (productId, token) => apiRequest(`/api/staff/batches/${productId}`, { token }),
  getExpiryRisk: (params = {}, token) => {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`/api/staff/sustainability/expiry-risk${q ? `?${q}` : ''}`, { token });
  },
  // Use manager endpoints (now accessible by staff for read operations)
  getSustainabilityDashboard: (params = {}, token) => {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`/api/manager/sustainability/dashboard${q ? `?${q}` : ''}`, { token });
  },
  getWasteReduction: (params = {}, token) => {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`/api/manager/sustainability/waste-reduction${q ? `?${q}` : ''}`, { token });
  },
  getReturnedItems: (token) => apiRequest('/api/manager/returned-items', { token }),
  listProductsByStatus: (status, token) => apiRequest(`/api/manager/products?status=${status}`, { token }),
  listPurchaseOrders: (token) => apiRequest('/api/manager/purchase-orders', { token }),
  listSuppliers: (token) => apiRequest('/api/manager/suppliers', { token }),
  listStaff: (token, status = 'all') => apiRequest(`/api/manager/staff?status=${encodeURIComponent(status)}`, { token }),
  // Disposed products (staff can view but manager endpoint allows staff access)
  listDisposedProducts: (token, params = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.append('page', params.page);
    if (params.page_size) query.append('page_size', params.page_size);
    if (params.search) query.append('search', params.search);
    if (params.date_from) query.append('date_from', params.date_from);
    if (params.date_to) query.append('date_to', params.date_to);
    const queryString = query.toString();
    return apiRequest(`/api/manager/disposed-products${queryString ? `?${queryString}` : ''}`, { token });
  },
  // Dispose expired products (staff can dispose, manager endpoint allows staff access)
  disposeExpiredProduct: (productId, quantity, token) => apiRequest(`/api/manager/dispose-expired/${productId}`, { method: 'POST', body: { quantity }, token }),
};

export const AdminAPI = {
  listUsers: (token) => apiRequest('/api/admin/users', { token }),
  getPharmacyStorage: (pharmacyId, token) => apiRequest(`/api/admin/pharmacy/${pharmacyId}/storage`, { token }),
  listPharmacies: (token) => apiRequest('/api/admin/pharmacies', { token }),
  createPharmacy: (payload, token) => apiRequest('/api/admin/pharmacies', { method: 'POST', body: payload, token }),
  deactivatePharmacy: (pharmacyId, token) => apiRequest(`/api/admin/pharmacies/${pharmacyId}/deactivate`, { method: 'PATCH', token }),
  activatePharmacy: (pharmacyId, token) => apiRequest(`/api/admin/pharmacies/${pharmacyId}/activate`, { method: 'PATCH', token }),
  createUser: (payload, token) => apiRequest('/api/admin/users', { method: 'POST', body: payload, token }),
  updateUserStatus: (userId, isActive, token) => apiRequest(`/api/admin/users/${userId}/status`, { method: 'PATCH', body: { is_active: isActive }, token }),
  listSubscriptions: (params = {}, token) => {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`/api/admin/subscriptions${q ? `?${q}` : ''}`, { token });
  },
  createSubscription: (payload, token) => apiRequest('/api/admin/subscriptions', { method: 'POST', body: payload, token }),
  updateSubscription: (subscriptionId, payload, token) => apiRequest(`/api/admin/subscriptions/${subscriptionId}`, { method: 'PATCH', body: payload, token }),
  deleteSubscription: (subscriptionId, token) => apiRequest(`/api/admin/subscriptions/${subscriptionId}`, { method: 'DELETE', token }),
  getSubscriptionPlans: (token) => apiRequest('/api/admin/subscription-plans', { token }),
  createSubscriptionPlan: (payload, token) => apiRequest('/api/admin/subscription-plans', { method: 'POST', body: payload, token }),
  updateSubscriptionPlan: (planId, payload, token) => apiRequest(`/api/admin/subscription-plans/${planId}`, { method: 'PATCH', body: payload, token }),
  deleteSubscriptionPlan: (planId, token) => apiRequest(`/api/admin/subscription-plans/${planId}`, { method: 'DELETE', token }),
  listSignupRequests: (token) => apiRequest('/api/admin/signup-requests', { token }),
  approveSignupRequest: (requestId, payload, token) => apiRequest(`/api/admin/signup-requests/${requestId}/approve`, { method: 'POST', body: payload, token }),
  rejectSignupRequest: (requestId, payload, token) => apiRequest(`/api/admin/signup-requests/${requestId}/reject`, { method: 'POST', body: payload, token }),
};

export const AnnouncementsAPI = {
  list: (params = {}, token) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/api/announcements${query ? `?${query}` : ''}`, { token });
  },
  create: (payload, token) => apiRequest('/api/announcements', { method: 'POST', body: payload, token }),
  update: (id, payload, token) => apiRequest(`/api/announcements/${id}`, { method: 'PATCH', body: payload, token }),
  delete: (id, token) => apiRequest(`/api/announcements/${id}`, { method: 'DELETE', token }),
};

export const SupportAPI = {
  createTicket: (payload, token) => apiRequest('/api/support/tickets', { method: 'POST', body: payload, token }),
  listTickets: (params = {}, token) => {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`/api/support/tickets${q ? `?${q}` : ''}`, { token });
  },
  getTicket: (ticketId, token) => apiRequest(`/api/support/tickets/${ticketId}`, { token }),
  addMessage: (ticketId, payload, token) => apiRequest(`/api/support/tickets/${ticketId}/messages`, { method: 'POST', body: payload, token }),
  updateTicket: (ticketId, payload, token) => apiRequest(`/api/support/tickets/${ticketId}`, { method: 'PATCH', body: payload, token }),
  deleteTicket: (ticketId, token) => apiRequest(`/api/support/tickets/${ticketId}`, { method: 'DELETE', token }),
  getStats: (token) => apiRequest('/api/support/tickets/stats', { token }),
};



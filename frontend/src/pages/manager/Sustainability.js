import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Clock, Shield, Printer, Search, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Package, CheckCircle, XCircle, Plus, X, Loader2, TrendingDown, ShoppingCart, RefreshCw, BarChart3, Pencil, Building2, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ManagerAPI, StaffAPI } from '../../services/api';

const Sustainability = () => {
  const { token, user } = useAuth();
  const [error, setError] = useState('');

  // Tab management
  const [activeTab, setActiveTab] = useState('dashboard'); // dashboard | reorders | returns | loss | expired

  // Toggle states for explanations
  const [showScoreCalculation, setShowScoreCalculation] = useState(false);
  const [showScoreExplanation, setShowScoreExplanation] = useState(false);

  // Low Stock Reorders state
  const [products, setProducts] = useState([]);
  const [reorderQuery, setReorderQuery] = useState('');
  const [reorderCategory, setReorderCategory] = useState('');
  const [reorderOnlyLow, setReorderOnlyLow] = useState(true);
  const [reorderPlan, setReorderPlan] = useState({});
  const [reorderStatusFilter, setReorderStatusFilter] = useState('all');
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [loadingPO, setLoadingPO] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [reorderLoading, setReorderLoading] = useState(false);

  // Product Returns state
  const [returnedItems, setReturnedItems] = useState([]);
  const [loadingReturns, setLoadingReturns] = useState(false);
  const [returnsSearch, setReturnsSearch] = useState('');
  const [returnsStaff, setReturnsStaff] = useState('');
  const [returnsDateFrom, setReturnsDateFrom] = useState('');
  const [returnsDateTo, setReturnsDateTo] = useState('');
  const [staffList, setStaffList] = useState([]);

  // Product Loss state
  const [wasteData, setWasteData] = useState(null);
  const [loadingWaste, setLoadingWaste] = useState(false);
  const [wasteDateFrom, setWasteDateFrom] = useState('');
  const [wasteDateTo, setWasteDateTo] = useState('');
  const [wastePage, setWastePage] = useState(1);
  const [wastePerPage] = useState(10);

  // All Expired Products state
  const [expiredProducts, setExpiredProducts] = useState([]);
  const [loadingExpired, setLoadingExpired] = useState(false);
  const [disposingProductId, setDisposingProductId] = useState(null);
  const [selectedExpiredProducts, setSelectedExpiredProducts] = useState(new Set());
  const [batchDisposing, setBatchDisposing] = useState(false);
  const [expiredSearch, setExpiredSearch] = useState('');
  const [expiredCategory, setExpiredCategory] = useState('');
  const [expiredPage, setExpiredPage] = useState(1);
  const [expiredPerPage] = useState(10);
  const [expiredDateFrom, setExpiredDateFrom] = useState('');
  const [expiredDateTo, setExpiredDateTo] = useState('');

  // Disposed Products state
  const [disposedProducts, setDisposedProducts] = useState([]);
  const [loadingDisposed, setLoadingDisposed] = useState(false);
  const [disposedPage, setDisposedPage] = useState(1);
  const [disposedPerPage, setDisposedPerPage] = useState(10);
  const [disposedSearch, setDisposedSearch] = useState('');
  const [disposedDateFrom, setDisposedDateFrom] = useState('');
  const [disposedDateTo, setDisposedDateTo] = useState('');
  const [totalDisposed, setTotalDisposed] = useState(0);
  const [totalDisposedQuantity, setTotalDisposedQuantity] = useState(0);
  const [totalDisposedCost, setTotalDisposedCost] = useState(0);

  // Dashboard state
  const [dashboardData, setDashboardData] = useState(null);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  
  // Helper function - must be defined early as it's used in callbacks
  const formatCurrency = useCallback((value) => (value ?? 0).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' }), []);
  
  const [dashboardDateFrom, setDashboardDateFrom] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date.toISOString().split('T')[0];
  });
  const [dashboardDateTo, setDashboardDateTo] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });

  // Get API based on user role
  const API = useMemo(() => (user?.role === 'staff') ? StaffAPI : ManagerAPI, [user?.role]);

  // Load products for reorders
  const loadProducts = useCallback(async () => {
    if (!token) return;
    try {
      const data = await API.listProductsByStatus('active', token);
      if (data.success) setProducts(data.products || []);
    } catch (e) {
      console.error('Failed to load products:', e);
    }
  }, [token, API]);

  // Load purchase orders for reorders
  const loadPurchaseOrders = useCallback(async () => {
    if (!token) return;
    try {
      setLoadingPO(true);
      const data = await API.listPurchaseOrders(token);
      if (data.success) setPurchaseOrders(data.purchase_orders || []);
    } catch (e) {
      console.error('Failed to load purchase orders:', e);
    } finally {
      setLoadingPO(false);
    }
  }, [token, API]);

  // Load suppliers
  const loadSuppliers = useCallback(async () => {
    if (!token) return;
    try {
      const data = await API.listSuppliers(token);
      if (data.success) setSuppliers(data.suppliers || []);
    } catch (e) {
      console.error('Failed to load suppliers:', e);
    }
  }, [token, API]);

  // Load returns
  const loadReturns = useCallback(async () => {
    if (!token) return;
    try {
      setLoadingReturns(true);
      const data = await API.getReturnedItems(token);
      if (data.success) setReturnedItems(data.returns || []);
    } catch (e) {
      setError(e.message || 'Failed to load returns');
    } finally {
      setLoadingReturns(false);
    }
  }, [token, API]);

  // Load waste/loss data
  const loadWasteData = useCallback(async () => {
    if (!token) return;
    try {
      setLoadingWaste(true);
      setError('');
      const params = {
        date_from: wasteDateFrom || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        date_to: wasteDateTo || new Date().toISOString().split('T')[0]
      };
      const data = await API.getWasteReduction(params, token);
      if (data.success) {
        setWasteData(data);
        setWastePage(1); // Reset to first page when data changes
      } else {
        setError(data.error || 'Failed to load waste data');
      }
    } catch (e) {
      setError(e.message || 'Failed to load waste data');
    } finally {
      setLoadingWaste(false);
    }
  }, [token, wasteDateFrom, wasteDateTo, API]);

  // Load dashboard data
  const loadDashboard = useCallback(async () => {
    if (!token) return;
    try {
      setLoadingDashboard(true);
      setError('');
      const params = {
        date_from: dashboardDateFrom || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        date_to: dashboardDateTo || new Date().toISOString().split('T')[0]
      };
      const data = await API.getSustainabilityDashboard(params, token);
      if (data.success) {
        setDashboardData(data);
      } else {
        setError(data.error || 'Failed to load dashboard data');
      }
    } catch (e) {
      setError(e.message || 'Failed to load dashboard');
    } finally {
      setLoadingDashboard(false);
    }
  }, [token, dashboardDateFrom, dashboardDateTo, API]);

  // Load staff list
  const loadStaff = useCallback(async () => {
    if (!token) return;
    try {
      const data = await API.listStaff(token, 'all');
      if (data.success) setStaffList(data.staff || []);
    } catch (e) {
      console.error('Failed to load staff:', e);
    }
  }, [token, API]);

  // Load expired products
  const loadExpiredProducts = useCallback(async () => {
    if (!token) return;
    try {
      setLoadingExpired(true);
      setError('');
      const ExpiryAPI = (user?.role === 'staff') ? StaffAPI : ManagerAPI;
      const params = { expiry_state: 'expired', status: 'all' };
      if (expiredSearch) params.search = expiredSearch;
      if (expiredCategory) params.category_id = expiredCategory;
      const data = await ExpiryAPI.getExpiryRisk(params, token);
      if (data.success) {
        // Combine all risk levels that have expired products
        const allExpired = [
          ...(data.critical_risk || []).filter(p => p.expiry_state === 'expired'),
          ...(data.high_risk || []).filter(p => p.expiry_state === 'expired'),
          ...(data.medium_risk || []).filter(p => p.expiry_state === 'expired'),
          ...(data.low_risk || []).filter(p => p.expiry_state === 'expired')
        ];

        // Filter out products that have been fully disposed
        // Check disposed_products table to see which products have been disposed
        try {
          // Use the correct API based on user role
          const DisposedAPI = (user?.role === 'staff') ? StaffAPI : ManagerAPI;
          const disposedData = await DisposedAPI.listDisposedProducts(token, { page_size: 1000 });
          if (disposedData && disposedData.success && disposedData.disposed) {
            // Create a map of product_id -> total disposed quantity
            const disposedQuantities = new Map();
            disposedData.disposed.forEach(item => {
              const productId = item.product_id;
              const currentDisposed = disposedQuantities.get(productId) || 0;
              disposedQuantities.set(productId, currentDisposed + (item.quantity_disposed || 0));
            });
            
            // Filter out products that have been fully disposed
            // Only keep products that still have expired quantity remaining
            const activeExpired = allExpired.filter(product => {
              const totalDisposed = disposedQuantities.get(product.id) || 0;
              const expiredQty = product.expired_quantity || 0;
              // Keep product if there's still expired quantity that hasn't been disposed
              return expiredQty > totalDisposed;
            });
            
            setExpiredProducts(activeExpired);
          } else {
            setExpiredProducts(allExpired);
          }
        } catch (disposalError) {
          console.error('Failed to check disposed products:', disposalError);
          // Continue with all expired products if check fails
          setExpiredProducts(allExpired);
        }
        setExpiredPage(1); // Reset to first page when data changes
      } else {
        setError(data.error || 'Failed to load expired products');
      }
    } catch (e) {
      console.error('Error loading expired products:', e);
      // Check if it's a network error and provide a more helpful message
      if (e.message && (e.message.includes('Failed to fetch') || e.message.includes('Unable to connect'))) {
        setError('Unable to connect to server. Please ensure the backend server is running on port 5000.');
      } else {
        setError(e.message || 'Failed to load expired products');
      }
    } finally {
      setLoadingExpired(false);
    }
  }, [token, user?.role, expiredSearch, expiredCategory]);

  // Load disposed products
  const loadDisposedProducts = useCallback(async () => {
    if (!token) return;
    try {
      setLoadingDisposed(true);
      setError('');
      const params = {
        page: disposedPage,
        page_size: disposedPerPage
      };
      if (disposedSearch) params.search = disposedSearch;
      if (disposedDateFrom) params.date_from = disposedDateFrom;
      if (disposedDateTo) params.date_to = disposedDateTo;
      
      const data = await API.listDisposedProducts(token, params);
      if (data.success) {
        setDisposedProducts(data.disposed || []);
        setTotalDisposed(data.total || 0);
        setTotalDisposedQuantity(data.total_quantity || 0);
        setTotalDisposedCost(data.total_cost || 0);
      } else {
        setError(data.error || 'Failed to load disposed products');
      }
    } catch (e) {
      setError(e.message || 'Failed to load disposed products');
    } finally {
      setLoadingDisposed(false);
    }
  }, [token, disposedPage, disposedPerPage, disposedSearch, disposedDateFrom, disposedDateTo, API]);

  // Load all disposed products for printing (without pagination)
  const loadAllDisposedProducts = useCallback(async () => {
    if (!token) return [];
    try {
      const params = {
        page: 1,
        page_size: 10000 // Get all for printing
      };
      if (disposedSearch) params.search = disposedSearch;
      if (disposedDateFrom) params.date_from = disposedDateFrom;
      if (disposedDateTo) params.date_to = disposedDateTo;
      
      const data = await API.listDisposedProducts(token, params);
      if (data.success) {
        return data.disposed || [];
      }
      return [];
    } catch (e) {
      console.error('Failed to load all disposed products for printing:', e);
      return [];
    }
  }, [token, disposedSearch, disposedDateFrom, disposedDateTo, API]);

  // Print disposed products
  const handlePrintDisposed = useCallback(async () => {
    if (totalDisposed === 0) {
      alert('No disposed products to print');
      return;
    }

    // Load all disposed products for printing
    const allDisposed = await loadAllDisposedProducts();
    
    if (allDisposed.length === 0) {
      alert('No disposed products match your filters');
      return;
    }

    const rows = allDisposed.map((item, idx) => {
      const disposedByName = item.disposed_by_name 
        ? `${item.disposed_by_role ? item.disposed_by_role.charAt(0).toUpperCase() + item.disposed_by_role.slice(1) : ''} ${item.disposed_by_name}`.trim()
        : '—';
      const disposedAt = item.disposed_at 
        ? new Date(item.disposed_at).toLocaleString() 
        : '—';
      const expirationDate = item.expiration_date 
        ? new Date(item.expiration_date).toLocaleDateString() 
        : '—';

      return `
        <tr>
          <td style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">${idx + 1}</td>
          <td style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">${item.product_name || '—'}</td>
          <td style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">${item.category_name || '—'}</td>
          <td style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">${item.batch_number || '—'}</td>
          <td style="text-align: right; padding: 8px; border-bottom: 1px solid #ddd;">${item.quantity_disposed || 0} units</td>
          <td style="text-align: right; padding: 8px; border-bottom: 1px solid #ddd;">${formatCurrency(item.cost_price || 0)}</td>
          <td style="text-align: right; padding: 8px; border-bottom: 1px solid #ddd;">${formatCurrency(item.total_cost || 0)}</td>
          <td style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">${expirationDate}</td>
          <td style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">${disposedByName}</td>
          <td style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">${disposedAt}</td>
        </tr>
      `;
    }).join('');

    const dateRange = disposedDateFrom && disposedDateTo 
      ? `${new Date(disposedDateFrom).toLocaleDateString()} to ${new Date(disposedDateTo).toLocaleDateString()}`
      : 'All time';

    const totalCost = allDisposed.reduce((sum, item) => sum + (item.total_cost || 0), 0);
    const totalQuantity = allDisposed.reduce((sum, item) => sum + (item.quantity_disposed || 0), 0);

    const printHtml = `
      <html>
        <head>
          <title>Disposed Products Report</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; color: #111; }
            h1 { margin-bottom: 8px; color: #dc2626; }
            .info { margin-bottom: 15px; color: #666; font-size: 14px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background: #f3f4f6; text-align: left; border: 1px solid #ddd; padding: 10px; font-weight: bold; }
            td { border: 1px solid #ddd; padding: 8px; }
            .summary { background: #fef2f2; padding: 15px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #fecaca; }
            .summary-item { display: inline-block; margin-right: 30px; }
            @media print {
              body { margin: 0; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <h1>Disposed Products Report</h1>
          <div class="info">
            <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
            <p><strong>Date Range:</strong> ${dateRange}</p>
            <p><strong>Search:</strong> ${disposedSearch || 'All'}</p>
            <p><strong>Purpose:</strong> Records of expired products that have been disposed and removed from inventory deliveries.</p>
          </div>
          <div class="summary">
            <div class="summary-item"><strong>Total Records:</strong> ${allDisposed.length}</div>
            <div class="summary-item"><strong>Total Quantity Disposed:</strong> ${totalQuantity} units</div>
            <div class="summary-item"><strong>Total Cost:</strong> ${formatCurrency(totalCost)}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Product Name</th>
                <th>Category</th>
                <th>Batch Number</th>
                <th>Quantity</th>
                <th>Cost Price</th>
                <th>Total Cost</th>
                <th>Expiration Date</th>
                <th>Disposed By</th>
                <th>Disposed At</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="10" style="text-align: center;">No disposed products found</td></tr>'}
            </tbody>
          </table>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(printHtml);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  }, [totalDisposed, disposedSearch, disposedDateFrom, disposedDateTo, loadAllDisposedProducts, formatCurrency]);

  // Filtered and paginated expired products (must be defined before useCallback that uses it)
  // Only show expired products that haven't been disposed yet (need to be disposed)
  const filteredExpired = useMemo(() => {
    const kw = expiredSearch.trim().toLowerCase();
    return expiredProducts.filter(p => {
      // Only show products that haven't been disposed yet
      if (p.disposed_by) return false;
      
      const matchesKw = !kw || 
        [p.name, p.category_name].filter(Boolean).some(v => String(v).toLowerCase().includes(kw));
      const matchesCategory = !expiredCategory || p.category_name === expiredCategory;
      // Date filter would be based on expiry date if available, but for now we filter what we have
      return matchesKw && matchesCategory;
    }).sort((a, b) => (b.expired_value || 0) - (a.expired_value || 0));
  }, [expiredProducts, expiredSearch, expiredCategory]);

  const paginatedExpired = useMemo(() => {
    const startIndex = (expiredPage - 1) * expiredPerPage;
    const endIndex = startIndex + expiredPerPage;
    return filteredExpired.slice(startIndex, endIndex);
  }, [filteredExpired, expiredPage, expiredPerPage]);

  const totalExpiredPages = Math.ceil(filteredExpired.length / expiredPerPage);

  // Print expired products
  const handlePrintExpired = useCallback(() => {
    if (filteredExpired.length === 0) {
      alert('No expired products to print');
      return;
    }

    const rows = filteredExpired.map((product, idx) => {
      const expiredValue = product.expired_value || 0;
      const expiredQuantity = product.expired_quantity || 0;
      const daysExpired = product.days_expired || 0;
      const disposedBy = product.disposed_by || '—';
      const disposedAt = product.disposed_at 
        ? new Date(product.disposed_at).toLocaleDateString() 
        : '—';

      return `
        <tr>
          <td style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">${idx + 1}</td>
          <td style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">${product.name || '—'}</td>
          <td style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">${product.category_name || '—'}</td>
          <td style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">${product.location || '—'}</td>
          <td style="text-align: right; padding: 8px; border-bottom: 1px solid #ddd;">${product.current_stock || 0} units</td>
          <td style="text-align: right; padding: 8px; border-bottom: 1px solid #ddd;">${expiredQuantity} units</td>
          <td style="text-align: right; padding: 8px; border-bottom: 1px solid #ddd;">₱${expiredValue.toFixed(2)}</td>
          <td style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">${daysExpired > 0 ? `${daysExpired} days ago` : 'Expired'}</td>
          <td style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">${disposedBy}</td>
          <td style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">${disposedAt}</td>
        </tr>
      `;
    }).join('');

    const dateRange = expiredDateFrom && expiredDateTo 
      ? `${new Date(expiredDateFrom).toLocaleDateString()} to ${new Date(expiredDateTo).toLocaleDateString()}`
      : 'All time';

    const printHtml = `
      <html>
        <head>
          <title>All Expired Products Report</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; color: #111; }
            h1 { margin-bottom: 8px; color: #dc2626; }
            .info { margin-bottom: 15px; color: #666; font-size: 14px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background: #f3f4f6; text-align: left; border: 1px solid #ddd; padding: 10px; font-weight: bold; }
            td { border: 1px solid #ddd; padding: 8px; }
            .summary { background: #fef2f2; padding: 15px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #fecaca; }
            .summary-item { display: inline-block; margin-right: 30px; }
            @media print {
              body { margin: 0; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <h1>All Expired Products Report</h1>
          <div class="info">
            <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
            <p><strong>Date Range:</strong> ${dateRange}</p>
            <p><strong>Search:</strong> ${expiredSearch || 'All'}</p>
            <p><strong>Category:</strong> ${expiredCategory || 'All'}</p>
            <p><strong>Purpose:</strong> List of all expired products that need to be disposed or removed from inventory.</p>
          </div>
          <div class="summary">
            <div class="summary-item"><strong>Total Products:</strong> ${filteredExpired.length}</div>
            <div class="summary-item"><strong>Total Expired Quantity:</strong> ${filteredExpired.reduce((sum, p) => sum + (p.expired_quantity || 0), 0)} units</div>
            <div class="summary-item"><strong>Total Expired Value:</strong> ₱${filteredExpired.reduce((sum, p) => sum + (p.expired_value || 0), 0).toFixed(2)}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Product Name</th>
                <th>Category</th>
                <th>Location</th>
                <th>Current Stock</th>
                <th>Expired Quantity</th>
                <th>Expired Value</th>
                <th>Days Expired</th>
                <th>Disposed By</th>
                <th>Disposed Date</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="10" style="text-align: center;">No expired products found</td></tr>'}
            </tbody>
          </table>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(printHtml);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  }, [filteredExpired, expiredSearch, expiredCategory, expiredDateFrom, expiredDateTo]);

  // Dispose expired product - removes from batches and records in disposed_products table
  const disposeProduct = useCallback(async (productId, productName, expiredQuantity) => {
    // Validate expired quantity
    const qty = parseInt(expiredQuantity, 10) || 0;
    if (qty <= 0) {
      alert('Cannot dispose: expired quantity must be greater than 0');
      return;
    }

    if (!window.confirm(`Dispose ${qty} units of "${productName}"? This will remove the expired products from inventory deliveries and record them as disposed.`)) {
      return;
    }

    try {
      setDisposingProductId(productId);
      setError('');
      
      // Use new disposal endpoint that removes from batches
      const response = await API.disposeExpiredProduct(productId, qty, token);

      if (response.success) {
        // Clear selection if this product was selected
        setSelectedExpiredProducts(prev => {
          const newSet = new Set(prev);
          newSet.delete(productId);
          return newSet;
        });
        
        // Reload expired products to reflect the change (disposed items will be removed)
        await loadExpiredProducts();
        // Reload disposed products to show the newly disposed item
        await loadDisposedProducts();
        // Reload dashboard to reflect updated metrics (expired count, waste value, sustainability score, etc.)
        // Always reload dashboard, not just when on dashboard tab, so metrics are up-to-date
        await loadDashboard();
        setError(''); // Clear any previous errors
        alert(response.message || `Successfully disposed ${qty} units of expired products. The item has been removed from expired products and added to disposed products.`);
      } else {
        setError(response.error || 'Failed to dispose product');
      }
    } catch (e) {
      setError(e.message || 'Failed to dispose product');
    } finally {
      setDisposingProductId(null);
    }
  }, [token, loadExpiredProducts, loadDisposedProducts, loadDashboard, API]);

  // Batch dispose selected expired products
  const disposeSelectedProducts = useCallback(async () => {
    if (selectedExpiredProducts.size === 0) {
      alert('Please select at least one product to dispose');
      return;
    }

    const selectedProducts = filteredExpired.filter(p => selectedExpiredProducts.has(p.id) && (p.expired_quantity || 0) > 0);
    
    if (selectedProducts.length === 0) {
      alert('No valid products selected for disposal');
      return;
    }

    const totalQuantity = selectedProducts.reduce((sum, p) => sum + (p.expired_quantity || 0), 0);
    const totalValue = selectedProducts.reduce((sum, p) => sum + (p.expired_value || 0), 0);
    const productNames = selectedProducts.map(p => p.name).join(', ');
    
    if (!window.confirm(`Dispose ${selectedProducts.length} product(s) with ${totalQuantity} total units (Value: ${formatCurrency(totalValue)})?\n\nProducts:\n${productNames}\n\nThis will mark all selected expired products as disposed and remove them from inventory.`)) {
      return;
    }

    try {
      setBatchDisposing(true);
      setError('');
      
      let successCount = 0;
      let failCount = 0;
      const failedProducts = [];

      for (const product of selectedProducts) {
        try {
          const expiredQuantity = parseInt(product.expired_quantity || 0, 10);
          if (expiredQuantity <= 0) {
            console.warn(`Skipping ${product.name}: invalid expired quantity (${expiredQuantity})`);
            continue;
          }

          // Use new disposal endpoint that removes from batches
          const response = await API.disposeExpiredProduct(product.id, expiredQuantity, token);

          if (response.success) {
            successCount++;
          } else {
            failCount++;
            failedProducts.push(product.name);
            console.error(`Failed to dispose ${product.name}:`, response.error);
          }
        } catch (e) {
          failCount++;
          failedProducts.push(product.name);
          console.error(`Failed to dispose ${product.name}:`, e);
        }
      }

      // Clear selection
      setSelectedExpiredProducts(new Set());
      
      // Reload expired products to reflect the changes (disposed items will be removed)
      await loadExpiredProducts();
      // Reload disposed products to show the newly disposed items
      await loadDisposedProducts();
      // Reload dashboard to reflect updated metrics (expired count, waste value, sustainability score, etc.)
      // Always reload dashboard, not just when on dashboard tab, so metrics are up-to-date
      await loadDashboard();

      // Show result message
      if (failCount === 0) {
        alert(`Successfully disposed ${successCount} product(s)!`);
      } else {
        alert(`Disposed ${successCount} product(s) successfully.\nFailed to dispose ${failCount} product(s):\n${failedProducts.join(', ')}`);
      }
      
      setError('');
    } catch (e) {
      setError(e.message || 'Failed to dispose selected products');
      alert('An error occurred while disposing products. Please try again.');
    } finally {
      setBatchDisposing(false);
    }
  }, [selectedExpiredProducts, filteredExpired, token, loadExpiredProducts, loadDisposedProducts, loadDashboard, formatCurrency, API]);

  // Toggle selection for a single expired product
  const toggleExpiredProductSelection = useCallback((productId) => {
    setSelectedExpiredProducts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(productId)) {
        newSet.delete(productId);
      } else {
        newSet.add(productId);
      }
      return newSet;
    });
  }, []);

  // Select/deselect all expired products on current page
  const toggleSelectAllExpired = useCallback(() => {
    const availableProducts = paginatedExpired.filter(p => (p.expired_quantity || 0) > 0);
    const allSelected = availableProducts.length > 0 && availableProducts.every(p => selectedExpiredProducts.has(p.id));
    
    setSelectedExpiredProducts(prev => {
      const newSet = new Set(prev);
      if (allSelected) {
        // Deselect all on current page
        availableProducts.forEach(p => newSet.delete(p.id));
      } else {
        // Select all on current page
        availableProducts.forEach(p => newSet.add(p.id));
      }
      return newSet;
    });
  }, [paginatedExpired, selectedExpiredProducts]);

  // Load data when tab changes
  useEffect(() => {
    if (!token) return;
    
    if (activeTab === 'reorders') {
      loadProducts();
      loadPurchaseOrders();
      loadSuppliers();
    } else if (activeTab === 'returns') {
      loadReturns();
      loadStaff();
    } else if (activeTab === 'loss') {
      if (!wasteDateFrom || !wasteDateTo) {
        const to = new Date();
        const from = new Date();
        from.setDate(from.getDate() - 30);
        setWasteDateFrom(from.toISOString().split('T')[0]);
        setWasteDateTo(to.toISOString().split('T')[0]);
      }
      loadWasteData();
    } else if (activeTab === 'dashboard') {
      loadDashboard();
    } else if (activeTab === 'expired') {
      loadExpiredProducts();
    } else if (activeTab === 'disposed') {
      loadDisposedProducts();
    }
  }, [activeTab, token, loadProducts, loadPurchaseOrders, loadSuppliers, loadReturns, loadStaff, loadWasteData, loadDashboard, loadExpiredProducts, loadDisposedProducts, wasteDateFrom, wasteDateTo]);

  // Reset page when filters change
  useEffect(() => {
    if (activeTab === 'expired') {
      setExpiredPage(1);
    } else if (activeTab === 'disposed') {
      setDisposedPage(1);
    }
  }, [expiredSearch, expiredCategory, expiredDateFrom, expiredDateTo, disposedSearch, disposedDateFrom, disposedDateTo, activeTab]);

  // Low Stock Reorders - computed list
  const lowStockList = useMemo(() => {
    const q = reorderQuery.trim().toLowerCase();
    const productPOStatus = {};
    
    purchaseOrders.forEach(po => {
      if (po.items && Array.isArray(po.items)) {
        po.items.forEach(item => {
          const productId = Number(item.product_id);
          if (!productId || isNaN(productId)) return;
          if (!productPOStatus[productId]) {
            productPOStatus[productId] = [];
          }
          productPOStatus[productId].push({
            po_id: po.id,
            po_number: po.po_number,
            status: po.status,
            quantity: item.quantity,
            created_at: po.created_at,
            created_by_name: po.created_by_name,
            was_edited: po.was_edited,
            updated_at: po.updated_at,
            updated_by_name: po.updated_by_name,
          });
        });
      }
    });
    
    const manuallyAddedProductIds = new Set(Object.keys(reorderPlan).map(id => Number(id)));
    
    const allProductsForReorder = products.filter(p => {
      const matchesQ = !q || [p.name, p.category_name, p.location].filter(Boolean).some(v => String(v).toLowerCase().includes(q));
      const matchesCat = !reorderCategory || p.category_name === reorderCategory;
      const current = Number(p.current_stock ?? 0);
      const reorderPoint = Number(p.reorder_point ?? 10);
      const isLow = current <= reorderPoint || current <= 5;
      const isManuallyAdded = manuallyAddedProductIds.has(Number(p.id));
      
      return matchesQ && matchesCat && (!reorderOnlyLow || isLow || isManuallyAdded);
    });
    
    return allProductsForReorder
      .filter(p => {
        const productId = Number(p.id);
        const productPOs = productPOStatus[productId] || [];
        const hasOrdered = productPOs.some(po => po.status === 'ordered');
        const hasReceived = productPOs.some(po => po.status === 'received');
        const hasRequested = hasOrdered || hasReceived;
        
        if (reorderStatusFilter === 'requested') {
          return hasRequested;
        } else if (reorderStatusFilter === 'not_requested') {
          return !hasRequested;
        }
        return true;
      })
      .map(p => {
        const current = Number(p.current_stock ?? 0);
        const reorderPoint = Number(p.reorder_point ?? 10);
        const suggested = Math.max(1, reorderPoint * 2 - current);
        
        const productId = Number(p.id);
        const productPOs = productPOStatus[productId] || [];
        const orderedPO = productPOs.find(po => po.status === 'ordered');
        const receivedPO = productPOs.find(po => po.status === 'received');
        
        let deliveryStatus = 'not_requested';
        let poId = null;
        let poNumber = null;
        let requestDate = null;
        let orderedQuantity = null;
        let createdByName = null;
        let wasEdited = false;
        let updatedAt = null;
        let updatedByName = null;
        
        if (orderedPO) {
          deliveryStatus = 'ordered';
          poId = orderedPO.po_id;
          poNumber = orderedPO.po_number;
          requestDate = orderedPO.created_at;
          orderedQuantity = orderedPO.quantity;
          createdByName = orderedPO.created_by_name;
          wasEdited = orderedPO.was_edited || false;
          updatedAt = orderedPO.updated_at;
          updatedByName = orderedPO.updated_by_name;
        } else if (receivedPO) {
          deliveryStatus = 'received';
          poId = receivedPO.po_id;
          poNumber = receivedPO.po_number;
          requestDate = receivedPO.created_at;
          orderedQuantity = receivedPO.quantity;
          createdByName = receivedPO.created_by_name;
          wasEdited = receivedPO.was_edited || false;
          updatedAt = receivedPO.updated_at;
          updatedByName = receivedPO.updated_by_name;
        }
        
        return { 
          ...p, 
          reorder_point: reorderPoint, 
          suggested,
          delivery_status: deliveryStatus,
          po_id: poId,
          po_number: poNumber,
          request_date: requestDate,
          ordered_quantity: orderedQuantity,
          created_by_name: createdByName,
          was_edited: wasEdited,
          updated_at: updatedAt,
          updated_by_name: updatedByName
        };
      });
  }, [products, reorderQuery, reorderCategory, reorderOnlyLow, reorderStatusFilter, purchaseOrders, reorderPlan]);

  // Print Low Stock Reorders
  const handlePrintLowStock = useCallback(() => {
    const filteredList = lowStockList;
    if (filteredList.length === 0) {
      window.alert('No low stock items to print.');
      return;
    }
    const rows = filteredList.map((p, idx) => {
      let status = 'Not Ordered';
      if (p.delivery_status === 'ordered') status = 'Ordered';
      if (p.delivery_status === 'received') status = 'Received';

      return `
        <tr>
          <td style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">${idx + 1}</td>
          <td style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">${p.name || '—'}</td>
          <td style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">${p.category_name || '—'}</td>
          <td style="text-align: right; padding: 8px; border-bottom: 1px solid #ddd;">${p.current_stock ?? 0}</td>
          <td style="text-align: right; padding: 8px; border-bottom: 1px solid #ddd;">${p.reorder_point ?? 10}</td>
          <td style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">${status}</td>
          <td style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">${p.po_number ? `PO: ${p.po_number}` : '—'}</td>
          <td style="text-align: right; padding: 8px; border-bottom: 1px solid #ddd;">${p.ordered_quantity || reorderPlan[p.id] || p.suggested || '—'}</td>
        </tr>
      `;
    }).join('');

    const filters = [];
    if (reorderQuery) filters.push(`Search: ${reorderQuery}`);
    if (reorderCategory) filters.push(`Category: ${reorderCategory}`);
    if (reorderStatusFilter !== 'all') filters.push(`Status: ${reorderStatusFilter === 'requested' ? 'Ordered/Received' : 'Not Ordered'}`);
    if (reorderOnlyLow) filters.push('Only Low Stock');

    const printHtml = `
      <html>
        <head>
          <title>Low Stock Reorders Report</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; color: #111; }
            h1 { margin-bottom: 8px; color: #059669; }
            .info { margin-bottom: 15px; color: #666; font-size: 14px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background: #f3f4f6; text-align: left; border: 1px solid #ddd; padding: 10px; font-weight: bold; }
            td { border: 1px solid #ddd; padding: 8px; }
            .summary { background: #f9fafb; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
            .summary-item { display: inline-block; margin-right: 30px; }
            @media print {
              body { margin: 0; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <h1>Low Stock Reorders Report</h1>
          <div class="info">
            <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
            ${filters.length > 0 ? `<p><strong>Filters:</strong> ${filters.join(', ')}</p>` : ''}
          </div>
          <div class="summary">
            <div class="summary-item"><strong>Total Low Stock Items:</strong> ${filteredList.length}</div>
            <div class="summary-item"><strong>Selected for Order:</strong> ${selectedItems.size}</div>
            <div class="summary-item"><strong>Already Ordered:</strong> ${filteredList.filter(p => p.delivery_status === 'ordered' || p.delivery_status === 'received').length}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Product Name</th>
                <th>Category</th>
                <th>Current Stock</th>
                <th>Reorder Point</th>
                <th>Status</th>
                <th>Order Info</th>
                <th>Order Quantity</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="8" style="text-align: center;">No items found</td></tr>'}
            </tbody>
          </table>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank', 'width=1000,height=700');
    if (!printWindow) return;
    printWindow.document.write(printHtml);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }, [lowStockList, selectedItems, reorderQuery, reorderCategory, reorderStatusFilter, reorderOnlyLow, reorderPlan]);

  // Print Product Loss report
  const handlePrintProductLoss = useCallback(() => {
    if (!wasteData || !wasteData.high_waste_risk || wasteData.high_waste_risk.length === 0) {
      alert('No product loss data to print');
      return;
    }

    const filteredProducts = wasteData.high_waste_risk
      .filter(p => (p.expired_value || 0) > 0)
      .sort((a, b) => (b.expired_value || 0) - (a.expired_value || 0));

    if (filteredProducts.length === 0) {
      alert('No expired products to print');
      return;
    }

    const rows = filteredProducts.map((product, idx) => {
      const expiredValue = product.expired_value || 0;
      const expiringValue = product.expiring_value || 0;
      const potentialWaste = product.potential_waste_value || 0;
      const daysExpired = product.days_expired || 0;
      
      let status = 'Monitor';
      if (daysExpired > 0) {
        status = `Expired ${daysExpired}d ago`;
      } else if (product.days_to_expiry !== null && product.days_to_expiry <= 30) {
        status = `Expires in ${product.days_to_expiry}d`;
      }

      return `
        <tr>
          <td style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">${idx + 1}</td>
          <td style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">${product.name || '—'}</td>
          <td style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">${product.category_name || '—'}</td>
          <td style="text-align: right; padding: 8px; border-bottom: 1px solid #ddd;">${product.current_stock || 0} units</td>
          <td style="text-align: right; padding: 8px; border-bottom: 1px solid #ddd;">${product.expired_quantity || 0} units</td>
          <td style="text-align: right; padding: 8px; border-bottom: 1px solid #ddd;">${product.expiring_quantity || 0} units</td>
          <td style="text-align: right; padding: 8px; border-bottom: 1px solid #ddd;">₱${expiredValue.toFixed(2)}</td>
          <td style="text-align: right; padding: 8px; border-bottom: 1px solid #ddd;">₱${expiringValue.toFixed(2)}</td>
          <td style="text-align: right; padding: 8px; border-bottom: 1px solid #ddd;">₱${potentialWaste.toFixed(2)}</td>
          <td style="text-align: left; padding: 8px; border-bottom: 1px solid #ddd;">${status}</td>
        </tr>
      `;
    }).join('');

    const dateRange = wasteData.from && wasteData.to 
      ? `${new Date(wasteData.from).toLocaleDateString()} to ${new Date(wasteData.to).toLocaleDateString()}`
      : 'All time';

    const printHtml = `
      <html>
        <head>
          <title>Product Loss Report - Most Expired Products</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; color: #111; }
            h1 { margin-bottom: 8px; color: #ea580c; }
            .info { margin-bottom: 15px; color: #666; font-size: 14px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background: #f3f4f6; text-align: left; border: 1px solid #ddd; padding: 10px; font-weight: bold; }
            td { border: 1px solid #ddd; padding: 8px; }
            .summary { background: #f9fafb; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
            .summary-item { display: inline-block; margin-right: 30px; }
            @media print {
              body { margin: 0; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <h1>Most Expired Products - Purchase Recommendations</h1>
          <div class="info">
            <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
            <p><strong>Date Range:</strong> ${dateRange}</p>
            <p><strong>Purpose:</strong> Products with highest expired value. Consider reducing purchase quantities to minimize waste.</p>
          </div>
          <div class="summary">
            <div class="summary-item"><strong>Total Products:</strong> ${filteredProducts.length}</div>
            <div class="summary-item"><strong>Total Expired Value:</strong> ₱${filteredProducts.reduce((sum, p) => sum + (p.expired_value || 0), 0).toFixed(2)}</div>
            <div class="summary-item"><strong>Total Potential Waste:</strong> ₱${filteredProducts.reduce((sum, p) => sum + (p.potential_waste_value || 0), 0).toFixed(2)}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Product Name</th>
                <th>Category</th>
                <th>Current Stock</th>
                <th>Expired Qty</th>
                <th>Expiring Qty (30 days)</th>
                <th>Expired Value</th>
                <th>Expiring Value</th>
                <th>Potential Waste</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="10" style="text-align: center;">No expired products found</td></tr>'}
            </tbody>
          </table>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank', 'width=1200,height=700');
    if (!printWindow) return;
    printWindow.document.write(printHtml);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }, [wasteData]);

  // Filtered returns
  const filteredReturns = useMemo(() => {
    const kw = returnsSearch.trim().toLowerCase();
    return returnedItems.filter(ret => {
      const matchesKw = !kw || [ret.return_number, ret.sale_number, ret.reason].filter(Boolean).some(v => String(v).toLowerCase().includes(kw)) || (ret.items || []).some(i => String(i.product_name).toLowerCase().includes(kw));
      const matchesStaff = !returnsStaff || String(ret.user_id) === String(returnsStaff);
      const created = ret.created_at ? new Date(ret.created_at) : null;
      const fromOk = !returnsDateFrom || (created && created >= new Date(returnsDateFrom));
      const toOk = !returnsDateTo || (created && created <= new Date(returnsDateTo + 'T23:59:59'));
      return matchesKw && matchesStaff && fromOk && toOk;
    });
  }, [returnedItems, returnsSearch, returnsStaff, returnsDateFrom, returnsDateTo]);

  // Category names for dropdowns
  const categoryNames = useMemo(() => {
    const names = new Set();
    products.forEach(p => {
      if (p.category_name) names.add(p.category_name);
    });
    // Also include categories from expired products
    expiredProducts.forEach(p => {
      if (p.category_name) names.add(p.category_name);
    });
    return Array.from(names).sort();
  }, [products, expiredProducts]);

  // Reorder functions
  const toggleItemSelection = (productId) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(productId)) {
        newSet.delete(productId);
      } else {
        newSet.add(productId);
      }
      return newSet;
    });
  };

  const selectAllItems = () => {
    if (selectedItems.size === lowStockList.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(lowStockList.map(p => p.id)));
    }
  };

  const requestSelectedItems = async () => {
    if (selectedItems.size === 0) {
      setError('Please select at least one item to order');
      return;
    }
    
    const selectedProducts = lowStockList.filter(p => selectedItems.has(p.id));
    const invalidProducts = [];
    const validItems = [];
    
    for (const product of selectedProducts) {
      const quantity = reorderPlan[product.id] ?? product.suggested;
      if (!quantity || quantity <= 0 || isNaN(quantity)) {
        invalidProducts.push(product.name);
      } else {
        validItems.push({ 
          product, 
          quantity,
          unit_cost: product.cost_price || 0
        });
      }
    }
    
    if (invalidProducts.length > 0) {
      setError(`Cannot create order with 0 or invalid quantity for: ${invalidProducts.join(', ')}`);
      return;
    }
    
    if (validItems.length === 0) {
      setError('Please enter valid quantities (greater than 0) for the selected items');
      return;
    }
    
    if (suppliers.length === 0) {
      await loadSuppliers();
    }
    
    if (suppliers.filter(s => s.is_active !== false).length === 0) {
      setError('No suppliers available. Please add suppliers first.');
      return;
    }
    
    setShowSupplierModal(true);
    window._pendingPOItems = validItems;
  };

  const createPurchaseOrder = async (supplierId) => {
    if (!window._pendingPOItems || window._pendingPOItems.length === 0) {
      setError('No items to order');
      return;
    }
    
    const validItems = window._pendingPOItems;
    
    if (!window.confirm(`Create purchase order for ${validItems.length} item(s)?`)) {
      return;
    }
    
    try {
      setReorderLoading(true);
      setError('');
      setShowSupplierModal(false);
      
      const items = validItems.map(({ product, quantity, unit_cost }) => ({
        product_id: product.id,
        quantity: quantity,
        unit_cost: unit_cost
      }));
      
      // Only managers can create purchase orders
      const PurchaseAPI = (user?.role === 'staff') ? null : ManagerAPI;
      if (!PurchaseAPI) {
        setError('Only managers can create purchase orders');
        return;
      }
      const response = await PurchaseAPI.createPurchaseOrder({
        supplier_id: supplierId,
        items: items
      }, token);
      
      if (response.success) {
        setSelectedItems(new Set());
        setReorderPlan({});
        await loadProducts();
        await loadPurchaseOrders();
      } else {
        setError(response.error || 'Failed to create purchase order');
      }
    } catch (e) {
      setError(e.message || 'Failed to create purchase order');
    } finally {
      setReorderLoading(false);
      window._pendingPOItems = null;
    }
  };


  return (
    <div className="space-y-8">
      <div className="bg-gradient-to-r from-emerald-600 to-lime-600 rounded-2xl p-7 lg:p-8 text-white">
        <h1 className="text-3xl font-bold mb-2">Sustainability Analytics</h1>
        <p className="text-emerald-100">Comprehensive analytics for waste reduction, low stock management, returns, and loss tracking</p>
      </div>

      {error && <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 rounded-lg px-4 py-3">{error}</div>}

      {/* Tab Navigation Container */}
      <div className="bg-white dark:bg-slate-950 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 overflow-hidden">
        {/* Tab Navigation Bar */}
        <div className="bg-gray-50 dark:bg-slate-900/50 border-b border-gray-200 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-1 p-2">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`relative flex items-center gap-2 px-5 py-3 rounded-lg font-medium text-sm transition-all duration-200 ${
                activeTab === 'dashboard'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                  : 'bg-transparent text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-slate-100'
              }`}
            >
              <BarChart3 className={`w-4 h-4 ${activeTab === 'dashboard' ? 'text-white' : 'text-gray-500 dark:text-slate-400'}`} />
              <span>Dashboard</span>
              {activeTab === 'dashboard' && (
                <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-1/2 h-0.5 bg-white rounded-full"></div>
              )}
            </button>
                <button
              onClick={() => setActiveTab('reorders')}
              className={`relative flex items-center gap-2 px-5 py-3 rounded-lg font-medium text-sm transition-all duration-200 ${
                activeTab === 'reorders'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                  : 'bg-transparent text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-slate-100'
              }`}
            >
              <ShoppingCart className={`w-4 h-4 ${activeTab === 'reorders' ? 'text-white' : 'text-gray-500 dark:text-slate-400'}`} />
              <span>Low Stock Reorders</span>
              {activeTab === 'reorders' && (
                <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-1/2 h-0.5 bg-white rounded-full"></div>
              )}
            </button>
                <button
              onClick={() => setActiveTab('returns')}
              className={`relative flex items-center gap-2 px-5 py-3 rounded-lg font-medium text-sm transition-all duration-200 ${
                activeTab === 'returns'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                  : 'bg-transparent text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-slate-100'
              }`}
            >
              <RefreshCw className={`w-4 h-4 ${activeTab === 'returns' ? 'text-white' : 'text-gray-500 dark:text-slate-400'}`} />
              <span>Product Returns</span>
              {activeTab === 'returns' && (
                <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-1/2 h-0.5 bg-white rounded-full"></div>
              )}
            </button>
                <button
              onClick={() => setActiveTab('loss')}
              className={`relative flex items-center gap-2 px-5 py-3 rounded-lg font-medium text-sm transition-all duration-200 ${
                activeTab === 'loss'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                  : 'bg-transparent text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-slate-100'
              }`}
            >
              <TrendingDown className={`w-4 h-4 ${activeTab === 'loss' ? 'text-white' : 'text-gray-500 dark:text-slate-400'}`} />
              <span>Product Loss</span>
              {activeTab === 'loss' && (
                <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-1/2 h-0.5 bg-white rounded-full"></div>
              )}
            </button>
            <button
              onClick={() => setActiveTab('expired')}
              className={`relative flex items-center gap-2 px-5 py-3 rounded-lg font-medium text-sm transition-all duration-200 ${
                activeTab === 'expired'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                  : 'bg-transparent text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-slate-100'
              }`}
            >
              <XCircle className={`w-4 h-4 ${activeTab === 'expired' ? 'text-white' : 'text-gray-500 dark:text-slate-400'}`} />
              <span>All Expired Products</span>
              {activeTab === 'expired' && (
                <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-1/2 h-0.5 bg-white rounded-full"></div>
              )}
            </button>
            <button
              onClick={() => setActiveTab('disposed')}
              className={`relative flex items-center gap-2 px-5 py-3 rounded-lg font-medium text-sm transition-all duration-200 ${
                activeTab === 'disposed'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                  : 'bg-transparent text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-slate-100'
              }`}
            >
              <Trash2 className={`w-4 h-4 ${activeTab === 'disposed' ? 'text-white' : 'text-gray-500 dark:text-slate-400'}`} />
              <span>Disposed Products</span>
              {activeTab === 'disposed' && (
                <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-1/2 h-0.5 bg-white rounded-full"></div>
              )}
            </button>
          </div>
        </div>
              
        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <div className="p-6">

            {/* Date Range Filter */}
            <div className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl p-4 mb-6">
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1 uppercase tracking-wide">Date Range</label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={dashboardDateFrom}
                      onChange={(e) => setDashboardDateFrom(e.target.value)}
                      className="px-3 py-2 text-sm border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white dark:bg-slate-950"
                    />
                    <input
                      type="date"
                      value={dashboardDateTo}
                      onChange={(e) => setDashboardDateTo(e.target.value)}
                      className="px-3 py-2 text-sm border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white dark:bg-slate-950"
                    />
        </div>
      </div>
                <button
                  onClick={loadDashboard}
                  disabled={loadingDashboard}
                  className="px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {loadingDashboard ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Refresh
                </button>
        </div>
      </div>

            {loadingDashboard ? (
              <div className="text-center py-12">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-emerald-600" />
                <p className="text-gray-600 dark:text-slate-400">Loading dashboard data...</p>
      </div>
            ) : dashboardData?.metrics ? (
              <div className="space-y-6">
                {/* Sustainability Score Card */}
                <div className="relative bg-white dark:bg-slate-950 rounded-2xl shadow-xl border-2 border-emerald-500/20 dark:border-emerald-500/30 overflow-hidden">
                  {/* Decorative Background Pattern */}
                  <div className="absolute inset-0 opacity-5 dark:opacity-10 pointer-events-none z-0">
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-400 via-lime-400 to-emerald-600"></div>
          </div>

                  {/* Score Display Section */}
                  <div className="relative bg-gradient-to-br from-emerald-50 via-lime-50 to-emerald-100 dark:from-emerald-950/30 dark:via-lime-950/30 dark:to-emerald-950/30 p-8 border-b border-emerald-200/50 dark:border-emerald-800/50">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-12 h-12 bg-emerald-600 dark:bg-emerald-700 rounded-xl flex items-center justify-center shadow-lg">
                            <Shield className="w-6 h-6 text-white" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide mb-0.5">Sustainability Score</p>
                            <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70">Overall sustainability performance</p>
                          </div>
                        </div>
                        <div className="mt-4 flex items-baseline gap-3">
                          <p className="text-6xl font-extrabold text-emerald-600 dark:text-emerald-400 leading-none">
                            {dashboardData.metrics?.overall?.sustainability_score?.toFixed(1) || '0.0'}
                          </p>
                          <p className="text-2xl font-bold text-emerald-500 dark:text-emerald-400 mb-2">%</p>
                        </div>
                      </div>
                  <div className="relative">
                        {/* Circular Progress Indicator */}
                        <div className="w-32 h-32 relative">
                          <svg className="transform -rotate-90 w-32 h-32">
                            <circle
                              cx="64"
                              cy="64"
                              r="56"
                              stroke="currentColor"
                              strokeWidth="8"
                              fill="none"
                              className="text-emerald-100 dark:text-emerald-900/50"
                            />
                            <circle
                              cx="64"
                              cy="64"
                              r="56"
                              stroke="currentColor"
                              strokeWidth="8"
                              fill="none"
                              strokeDasharray={`${2 * Math.PI * 56}`}
                              strokeDashoffset={`${2 * Math.PI * 56 * (1 - (dashboardData.metrics?.overall?.sustainability_score || 0) / 100)}`}
                              className="text-emerald-600 dark:text-emerald-400 transition-all duration-1000"
                              strokeLinecap="round"
                            />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="text-center">
                              <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase">Score</div>
                            </div>
                          </div>
                        </div>
                      </div>
                  </div>
                </div>

                  {/* Calculation Breakdown - Toggleable */}
                  <div className="relative z-10 border-t border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-900/50">
                <button
                      type="button"
                      onClick={() => {
                        console.log('Toggle calculation, current:', showScoreCalculation);
                        setShowScoreCalculation(prev => !prev);
                      }}
                      className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-100 dark:hover:bg-slate-800/50 transition-colors cursor-pointer relative z-10"
                    >
                      <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">Score Calculation Breakdown</span>
                      {showScoreCalculation ? (
                        <ChevronUp className="w-5 h-5 text-gray-600 dark:text-slate-400" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-gray-600 dark:text-slate-400" />
                      )}
                </button>
                    {showScoreCalculation && (
                      <div className="px-6 pb-6 pt-2 space-y-3 text-xs text-gray-700 dark:text-slate-300 animate-in slide-in-from-top-2 duration-200">
                        <div className="flex justify-between items-center py-1.5">
                          <span className="text-gray-600 dark:text-slate-400">Starting score:</span>
                          <span className="font-semibold text-gray-900 dark:text-slate-100">100.0%</span>
        </div>
                        <div className="flex justify-between items-center py-1.5">
                          <div className="flex-1 pr-2">
                            <span className="text-gray-600 dark:text-slate-400">Expiry risk penalty:</span>
                            <span className="text-emerald-600 dark:text-emerald-400 ml-1 text-xs">
                              ({((dashboardData.metrics?.expiry_risk?.expiry_ratio || 0) * 100).toFixed(1)}% products × 30%)
                            </span>
                          </div>
                          <span className="font-semibold text-orange-600 dark:text-orange-400">-{((dashboardData.metrics?.expiry_risk?.expiry_ratio || 0) * 30).toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between items-center py-1.5">
                          <div className="flex-1 pr-2">
                            <span className="text-gray-600 dark:text-slate-400">Waste penalty:</span>
                            <span className="text-emerald-600 dark:text-emerald-400 ml-1 text-xs">
                              ({((dashboardData.metrics?.waste_reduction?.waste_ratio || 0) * 100).toFixed(1)}% expired × 20%)
                            </span>
                          </div>
                          <span className="font-semibold text-red-600 dark:text-red-400">-{((dashboardData.metrics?.waste_reduction?.waste_ratio || 0) * 20).toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between items-center py-1.5">
                          <div className="flex-1 pr-2">
                            <span className="text-gray-600 dark:text-slate-400">Slow turnover penalty:</span>
                            <span className="text-emerald-600 dark:text-emerald-400 ml-1 text-xs">
                              (Sold {((dashboardData.metrics?.inventory_utilization?.turnover_rate || 0) * 100).toFixed(1)}% &lt; 50% target)
                            </span>
                          </div>
                          <span className="font-semibold text-yellow-600 dark:text-yellow-400">
                            -{(() => {
                              const turnoverRate = dashboardData.metrics?.inventory_utilization?.turnover_rate || 0;
                              const penalty = Math.max(0, 0.5 - turnoverRate) * 20;
                              return penalty.toFixed(1);
                            })()}%
                          </span>
                        </div>
                        <div className="pt-3 mt-3 border-t border-gray-200 dark:border-slate-800">
                          <div className="flex justify-between items-center font-semibold text-sm mb-2">
                            <span className="text-gray-900 dark:text-slate-100">Final Score:</span>
                            <span className="text-lg text-emerald-600 dark:text-emerald-400">{dashboardData.metrics?.overall?.sustainability_score?.toFixed(1) || '0.0'}%</span>
                          </div>
                          <div className="text-xs text-gray-600 dark:text-slate-400 text-right bg-gray-100 dark:bg-slate-800 rounded p-2 font-mono">
                            {(() => {
                              const expiryPenalty = ((dashboardData.metrics?.expiry_risk?.expiry_ratio || 0) * 30);
                              const wastePenalty = ((dashboardData.metrics?.waste_reduction?.waste_ratio || 0) * 20);
                              const turnoverRate = dashboardData.metrics?.inventory_utilization?.turnover_rate || 0;
                              const turnoverPenalty = Math.max(0, 0.5 - turnoverRate) * 20;
                              return `100 - ${expiryPenalty.toFixed(1)} - ${wastePenalty.toFixed(1)} - ${turnoverPenalty.toFixed(1)} = ${dashboardData.metrics?.overall?.sustainability_score?.toFixed(1) || '0.0'}%`;
                            })()}
                          </div>
                        </div>
                      </div>
                    )}
      </div>

                  {/* Explanation - Toggleable */}
                  <div className="relative z-10 border-t border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-900/50">
                <button
                      type="button"
                      onClick={() => {
                        console.log('Toggle explanation, current:', showScoreExplanation);
                        setShowScoreExplanation(prev => !prev);
                      }}
                      className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-100 dark:hover:bg-slate-800/50 transition-colors cursor-pointer relative z-10"
                    >
                      <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">How the Score Works</span>
                      {showScoreExplanation ? (
                        <ChevronUp className="w-5 h-5 text-gray-600 dark:text-slate-400" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-gray-600 dark:text-slate-400" />
                      )}
                </button>
                    {showScoreExplanation && (
                      <div className="px-6 pb-6 pt-2 space-y-4 text-xs text-gray-700 dark:text-slate-300 animate-in slide-in-from-top-2 duration-200">
                        <p className="text-gray-600 dark:text-slate-400 mb-3">
                          Your sustainability score starts at 100% (perfect). Points are deducted based on three key factors:
                        </p>
                        <div className="space-y-3">
                          <div className="bg-white dark:bg-slate-950 rounded-lg p-3 border border-orange-200 dark:border-orange-800/50">
                            <div className="font-semibold text-orange-600 dark:text-orange-400 mb-2">1. Expiry Risk (30% weight)</div>
                            <div className="space-y-1 text-gray-600 dark:text-slate-400 text-xs ml-2">
                              <div><strong>Calculation:</strong> (% of products at risk) × 30</div>
                              <div><strong>Example:</strong> If 78% of products are expired/expiring → 78% × 30 = 23.4 point penalty</div>
                              <div className="text-orange-600/80 dark:text-orange-400/80 italic mt-1">Products expiring soon need immediate action to prevent waste.</div>
              </div>
                          </div>
                          <div className="bg-white dark:bg-slate-950 rounded-lg p-3 border border-red-200 dark:border-red-800/50">
                            <div className="font-semibold text-red-600 dark:text-red-400 mb-2">2. Waste (20% weight)</div>
                            <div className="space-y-1 text-gray-600 dark:text-slate-400 text-xs ml-2">
                              <div><strong>Calculation:</strong> (% of inventory already expired) × 20</div>
                              <div><strong>Example:</strong> If 15% of inventory is expired → 15% × 20 = 3.0 point penalty</div>
                              <div className="text-red-600/80 dark:text-red-400/80 italic mt-1">Expired inventory represents money already lost.</div>
                            </div>
                          </div>
                          <div className="bg-white dark:bg-slate-950 rounded-lg p-3 border border-yellow-200 dark:border-yellow-800/50">
                            <div className="font-semibold text-yellow-600 dark:text-yellow-400 mb-2">3. Slow Sales (20% weight)</div>
                            <div className="space-y-1 text-gray-600 dark:text-slate-400 text-xs ml-2">
                              <div><strong>Calculation:</strong> If sold &lt; 50% of inventory → (50% - actual %) × 20</div>
                              <div><strong>Example:</strong> If you sold 8% → (50% - 8%) × 20 = 8.4 point penalty</div>
                              <div className="text-yellow-600/80 dark:text-yellow-400/80 italic mt-1">Slow sales increase the risk of products expiring before they're sold.</div>
                            </div>
                          </div>
                        </div>
                        <div className="pt-3 mt-3 border-t border-gray-200 dark:border-slate-800">
                          <p className="font-semibold text-gray-900 dark:text-slate-100 mb-2">Score Ranges:</p>
                          <div className="grid grid-cols-3 gap-2 text-xs">
                            <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-lg p-3 text-center border border-emerald-200 dark:border-emerald-800/50">
                              <div className="font-semibold text-emerald-600 dark:text-emerald-400">80-100%</div>
                              <div className="text-emerald-600/80 dark:text-emerald-400/80 mt-0.5">Excellent</div>
                            </div>
                            <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 text-center border border-blue-200 dark:border-blue-800/50">
                              <div className="font-semibold text-blue-600 dark:text-blue-400">70-79%</div>
                              <div className="text-blue-600/80 dark:text-blue-400/80 mt-0.5">Good</div>
                            </div>
                            <div className="bg-orange-50 dark:bg-orange-950/30 rounded-lg p-3 text-center border border-orange-200 dark:border-orange-800/50">
                              <div className="font-semibold text-orange-600 dark:text-orange-400">Below 70%</div>
                              <div className="text-orange-600/80 dark:text-orange-400/80 mt-0.5">Needs improvement</div>
                            </div>
                          </div>
                          <p className="text-gray-600 dark:text-slate-400 mt-3 text-center text-xs">
                            <strong>Target:</strong> Aim for 70% or higher by managing expiry dates, reducing waste, and maintaining good inventory turnover.
                          </p>
                        </div>
                      </div>
                    )}
            </div>
            </div>
              
                {/* Key Metrics Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Total Products */}
                  <div className="bg-white dark:bg-slate-950 rounded-xl p-6 border border-gray-200 dark:border-slate-800 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-gray-600 dark:text-slate-400">Total Products</p>
                      <Package className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <p className="text-3xl font-bold text-gray-900 dark:text-slate-100">
                      {dashboardData.metrics?.inventory_utilization?.total_products || 0}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">
                      Active inventory items
                    </p>
            </div>
              
                  {/* Expired Products */}
                  <div className="bg-white dark:bg-slate-950 rounded-xl p-6 border border-orange-200 dark:border-orange-800 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-gray-600 dark:text-slate-400">Expired Products</p>
                      <AlertTriangle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                    </div>
                    <p className="text-3xl font-bold text-orange-600 dark:text-orange-400">
                      {dashboardData.metrics?.expiry_risk?.expired_count || 0}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">
                      Products past expiration date
                    </p>
                  </div>

                  {/* Expiring Soon */}
                  <div className="bg-white dark:bg-slate-950 rounded-xl p-6 border border-yellow-200 dark:border-yellow-800 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-gray-600 dark:text-slate-400">Expiring Soon</p>
                      <Clock className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                    </div>
                    <p className="text-3xl font-bold text-yellow-600 dark:text-yellow-400">
                      {dashboardData.metrics?.expiry_risk?.expiring_soon_count || 0}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">
                      Products expiring within 30 days
                    </p>
                  </div>

                  {/* Waste Value */}
                  <div className="bg-white dark:bg-slate-950 rounded-xl p-6 border border-red-200 dark:border-red-800 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-gray-600 dark:text-slate-400">Waste Value</p>
                      <TrendingDown className="w-5 h-5 text-red-600 dark:text-red-400" />
                    </div>
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                      {formatCurrency(dashboardData.metrics?.waste_reduction?.waste_value || 0)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">
                      Total cost of all expired products
                    </p>
                  </div>
                </div>

                {/* Detailed Metrics Section */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Inventory & Sales Metrics */}
                  <div className="bg-white dark:bg-slate-950 rounded-xl p-6 border border-gray-200 dark:border-slate-800 shadow-sm">
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-1 flex items-center gap-2">
                        <Package className="w-5 h-5 text-emerald-600" />
                        Inventory & Sales
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-slate-400">
                        Current inventory status and sales performance for the selected period
                      </p>
                    </div>
                    <div className="space-y-4">
                      {/* Current Inventory Value */}
                      <div className="bg-blue-50 dark:bg-blue-900/10 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                        <div className="flex items-center justify-between">
                    <div>
                            <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">Current Inventory Value</span>
                            <p className="text-xs text-gray-600 dark:text-slate-400 mt-0.5">
                              Total cost value of all products in stock (as of now)
                            </p>
            </div>
                          <span className="text-xl font-bold text-blue-600 dark:text-blue-400">
                            {formatCurrency(dashboardData.metrics?.inventory_utilization?.total_inventory_value || 0)}
                          </span>
        </div>
              </div>

                      {/* COGS and Turnover */}
                      <div className="bg-gray-50 dark:bg-slate-900 rounded-lg p-4 border border-gray-200 dark:border-slate-800">
                        <div className="space-y-3">
                          <div>
                            <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">Inventory Sold (This Period)</span>
                            <p className="text-xs text-gray-600 dark:text-slate-400 mt-1">
                              What percentage of your current inventory was sold in this period
                            </p>
                            <div className="mt-2 flex items-baseline gap-2">
                              <span className="text-2xl font-bold text-gray-900 dark:text-slate-100">
                                {((dashboardData.metrics?.inventory_utilization?.turnover_rate || 0) * 100).toFixed(1)}%
                              </span>
                              <span className="text-sm text-gray-500 dark:text-slate-500">
                                of your inventory
                              </span>
        </div>
                            {(() => {
                              const daysDiff = dashboardData.from && dashboardData.to 
                                ? Math.round((new Date(dashboardData.to) - new Date(dashboardData.from)) / (1000 * 60 * 60 * 24)) + 1
                                : null;
                              const turnoverRate = dashboardData.metrics?.inventory_utilization?.turnover_rate || 0;
                              const annualized = daysDiff && daysDiff > 0 
                                ? (turnoverRate * (365 / daysDiff)).toFixed(2)
                                : null;
                              return annualized ? (
                                <p className="text-xs text-gray-600 dark:text-slate-400 mt-2">
                                  At this rate, you'll sell your entire inventory about <strong>{annualized}</strong> time{annualized !== '1' ? 's' : ''} per year
                                </p>
                              ) : null;
                            })()}
                          </div>
                          <div className="pt-2 border-t border-gray-200 dark:border-slate-800 space-y-2">
                            <div className="flex justify-between text-xs text-gray-600 dark:text-slate-400">
                              <span>Cost of Goods Sold (COGS):</span>
                              <span className="font-semibold text-gray-900 dark:text-slate-100">
                                {formatCurrency(dashboardData.metrics?.inventory_utilization?.cogs || 0)}
                              </span>
                            </div>
                            <div className="flex justify-between text-xs text-gray-600 dark:text-slate-400">
                              <span>Current Inventory Value:</span>
                              <span className="font-semibold text-gray-900 dark:text-slate-100">
                                {formatCurrency(dashboardData.metrics?.inventory_utilization?.total_inventory_value || 0)}
                              </span>
                            </div>
                            <div className="text-xs text-gray-500 dark:text-slate-500 pt-1 border-t border-gray-200 dark:border-slate-800">
                              <p>
                                <strong>Simple math:</strong> You sold {formatCurrency(dashboardData.metrics?.inventory_utilization?.cogs || 0)} worth of inventory, 
                                which is {((dashboardData.metrics?.inventory_utilization?.turnover_rate || 0) * 100).toFixed(1)}% of your current stock value of {formatCurrency(dashboardData.metrics?.inventory_utilization?.total_inventory_value || 0)}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Sales Performance */}
                      <div className="bg-emerald-50 dark:bg-emerald-900/10 rounded-lg p-4 border border-emerald-200 dark:border-emerald-800">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">Total Revenue</span>
                              <p className="text-xs text-gray-600 dark:text-slate-400 mt-0.5">
                                Total sales revenue for the selected period
                              </p>
                            </div>
                            <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                              {formatCurrency(dashboardData.metrics?.overall?.total_revenue || 0)}
                            </span>
                          </div>
                          <div className="pt-2 border-t border-emerald-200 dark:border-emerald-800 flex items-center justify-between">
                            <div>
                              <span className="text-sm font-medium text-gray-700 dark:text-slate-300">Sales Transactions</span>
                              <p className="text-xs text-gray-500 dark:text-slate-500 mt-0.5">
                                Number of completed sales in this period
                              </p>
                            </div>
                            <span className="text-lg font-semibold text-gray-900 dark:text-slate-100">
                              {dashboardData.metrics?.overall?.total_sales || 0}
                            </span>
                          </div>
                          {dashboardData.metrics?.overall?.total_sales > 0 && (
                            <div className="pt-2 border-t border-emerald-200 dark:border-emerald-800 text-xs text-gray-600 dark:text-slate-400">
                              <p>
                                Average order value: <strong className="text-emerald-600 dark:text-emerald-400">
                                  {formatCurrency(
                                    (dashboardData.metrics?.overall?.total_revenue || 0) / 
                                    (dashboardData.metrics?.overall?.total_sales || 1)
                                  )}
                                </strong>
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Expiry & Waste Metrics */}
                  <div className="bg-white dark:bg-slate-950 rounded-xl p-6 border border-gray-200 dark:border-slate-800 shadow-sm">
            <div className="mb-4">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-1 flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-orange-600" />
                        Expiry & Waste Risk
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-slate-400">
                        Monitor products at risk of expiring or already expired
                      </p>
                    </div>
                    <div className="space-y-4">
                      {/* Expired Products Value */}
                      <div className="bg-red-50 dark:bg-red-900/10 rounded-lg p-4 border border-red-200 dark:border-red-800">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
                              <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">Already Expired</span>
                            </div>
                            <p className="text-xs text-gray-600 dark:text-slate-400">
                              Products past their expiration date
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xl font-bold text-red-600 dark:text-red-400">
                              {formatCurrency(dashboardData.metrics?.expiry_risk?.expired_value || 0)}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-slate-500 mt-0.5">
                              {dashboardData.metrics?.expiry_risk?.expired_count || 0} product{dashboardData.metrics?.expiry_risk?.expired_count !== 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Expiring Soon Value */}
                      <div className="bg-yellow-50 dark:bg-yellow-900/10 rounded-lg p-4 border border-yellow-200 dark:border-yellow-800">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Clock className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                              <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">Expiring Soon (≤30 days)</span>
                            </div>
                            <p className="text-xs text-gray-600 dark:text-slate-400">
                              Products that will expire in the next 30 days
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xl font-bold text-yellow-600 dark:text-yellow-400">
                              {formatCurrency(dashboardData.metrics?.expiry_risk?.expiring_value || 0)}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-slate-500 mt-0.5">
                              {dashboardData.metrics?.expiry_risk?.expiring_soon_count || 0} product{dashboardData.metrics?.expiry_risk?.expiring_soon_count !== 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Risk Summary */}
                      <div className="bg-gray-50 dark:bg-slate-900 rounded-lg p-4 border border-gray-200 dark:border-slate-800">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-sm font-medium text-gray-700 dark:text-slate-300">Products at Risk</span>
                              <p className="text-xs text-gray-500 dark:text-slate-500 mt-0.5">
                                Products that are expired or expiring soon
                              </p>
                            </div>
                            <span className="text-lg font-bold text-orange-600 dark:text-orange-400">
                              {((dashboardData.metrics?.expiry_risk?.expiry_ratio || 0) * 100).toFixed(1)}%
                            </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-slate-800 rounded-full h-2">
                <div
                              className="bg-orange-500 h-2 rounded-full transition-all"
                              style={{ width: `${Math.min((dashboardData.metrics?.expiry_risk?.expiry_ratio || 0) * 100, 100)}%` }}
                ></div>
                          </div>
                          <div className="text-xs text-gray-600 dark:text-slate-400 space-y-1">
                            <p>
                              Out of <strong>{dashboardData.metrics?.inventory_utilization?.total_products || 0} total products</strong>, 
                              {' '}<strong>{dashboardData.metrics?.expiry_risk?.expired_count || 0}</strong> are expired and 
                              {' '}<strong>{dashboardData.metrics?.expiry_risk?.expiring_soon_count || 0}</strong> are expiring soon
                            </p>
                            <p className="text-gray-500 dark:text-slate-500">
                              This percentage only applies to products with expiration dates
                            </p>
                          </div>
          </div>
              </div>
            
                      {/* Waste Ratio */}
                      <div className="bg-red-50 dark:bg-red-900/10 rounded-lg p-4 border border-red-200 dark:border-red-800">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">Expired Inventory Value</span>
                              <p className="text-xs text-gray-600 dark:text-slate-400 mt-0.5">
                                What % of your inventory investment is already expired
                              </p>
                            </div>
                            <span className="text-2xl font-bold text-red-600 dark:text-red-400">
                              {((dashboardData.metrics?.waste_reduction?.waste_ratio || 0) * 100).toFixed(1)}%
                            </span>
                          </div>
                          <div className="pt-2 border-t border-red-200 dark:border-red-800">
                            <div className="flex justify-between text-xs text-gray-600 dark:text-slate-400 mb-1">
                              <span>Expired value:</span>
                              <span className="font-semibold text-red-600 dark:text-red-400">
                                {formatCurrency(dashboardData.metrics?.expiry_risk?.expired_value || 0)}
                              </span>
                            </div>
                            <div className="flex justify-between text-xs text-gray-600 dark:text-slate-400">
                              <span>Total inventory value:</span>
                              <span className="font-semibold text-gray-900 dark:text-slate-100">
                                {formatCurrency(dashboardData.metrics?.inventory_utilization?.total_inventory_value || 0)}
                              </span>
                            </div>
                          </div>
                          <div className="w-full bg-gray-200 dark:bg-slate-800 rounded-full h-2 mt-2">
                            <div
                              className="bg-red-500 h-2 rounded-full transition-all"
                              style={{ width: `${Math.min((dashboardData.metrics?.waste_reduction?.waste_ratio || 0) * 100, 100)}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Date Range Info */}
                {dashboardData.from && dashboardData.to && (
                  <div className="text-center text-xs text-gray-500 dark:text-slate-500 bg-gray-50 dark:bg-slate-900 rounded-lg p-3 border border-gray-200 dark:border-slate-800">
                    Data period: {new Date(dashboardData.from).toLocaleDateString()} to {new Date(dashboardData.to).toLocaleDateString()}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500 dark:text-slate-400 bg-gray-50 dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800">
                <BarChart3 className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <p className="font-medium">No dashboard data available</p>
                <p className="text-sm mt-1">Try adjusting the date range or refresh the page</p>
              </div>
            )}
          </div>
        )}

        {/* 3.1 Manage Low Stock Reorders */}
        {activeTab === 'reorders' && (
          <div className="p-6">
            {/* Section Header */}
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100 mb-2">Manage Low Stock Reorders</h2>
              <p className="text-sm text-gray-600 dark:text-slate-400">Monitor products with low stock levels and create purchase orders to replenish inventory</p>
            </div>

            {/* Summary Cards */}
            {lowStockList.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
                  <p className="text-sm font-medium text-gray-600 dark:text-slate-400">Total Low Stock Items</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-slate-100 mt-1">{lowStockList.length}</p>
                </div>
                <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-4 border border-emerald-200 dark:border-emerald-800">
                  <p className="text-sm font-medium text-gray-600 dark:text-slate-400">Selected for Order</p>
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{selectedItems.size}</p>
                </div>
                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4 border border-purple-200 dark:border-purple-800">
                  <p className="text-sm font-medium text-gray-600 dark:text-slate-400">Already Ordered</p>
                  <p className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-1">
                    {lowStockList.filter(p => p.delivery_status === 'ordered' || p.delivery_status === 'received').length}
                  </p>
                </div>
              </div>
            )}

            {/* Filters */}
            <div className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl p-4 mb-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-3">
            <div className="relative">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                    value={reorderQuery}
                    onChange={(e) => setReorderQuery(e.target.value)}
                    placeholder="Search products..."
                    className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white dark:bg-slate-950"
                    />
        </div>
                  <div className="relative">
                    <select
                    value={reorderCategory}
                    onChange={(e) => setReorderCategory(e.target.value)}
                    className="w-full appearance-none px-3 py-2 text-sm border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white dark:bg-slate-950 pr-8"
                  >
                    <option value="">All Categories</option>
                    {categoryNames.map(c => (<option key={c} value={c}>{c}</option>))}
                    </select>
                  <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>
                  <div className="relative">
                    <select
                    value={reorderStatusFilter}
                    onChange={(e) => setReorderStatusFilter(e.target.value)}
                    className="w-full appearance-none px-3 py-2 text-sm border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white dark:bg-slate-950 pr-8"
                  >
                    <option value="all">All Status</option>
                    <option value="requested">Ordered/Received</option>
                    <option value="not_requested">Not Ordered</option>
                    </select>
                  <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
                <label className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">
                  <input
                    type="checkbox"
                    checked={reorderOnlyLow}
                    onChange={(e) => setReorderOnlyLow(e.target.checked)}
                    className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-sm">Only low stock</span>
                </label>
                <button
                  onClick={() => {
                    setReorderQuery('');
                    setReorderCategory('');
                    setReorderStatusFilter('all');
                    setReorderOnlyLow(true);
                    setReorderPlan({});
                    setSelectedItems(new Set());
                  }}
                  className="px-4 py-2 text-sm font-medium border border-gray-300 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Clear Filters
                </button>
      </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-200 dark:border-slate-800">
                <button
                  onClick={requestSelectedItems}
                  disabled={reorderLoading || selectedItems.size === 0}
                  className="px-4 py-2 text-sm font-medium border border-emerald-500 text-emerald-700 dark:text-emerald-300 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                >
                  {reorderLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  Request Selected
                </button>
                <button 
                  onClick={handlePrintLowStock}
                  disabled={lowStockList.length === 0}
                  className="px-4 py-2 text-sm font-medium border border-gray-300 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                  title="Print low stock report"
                >
                  <Printer className="w-4 h-4" />
                  Print
                </button>
              </div>
            </div>

            {/* Products Table */}
            <div className="bg-white dark:bg-slate-950 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-100 dark:bg-slate-800">
                    <tr>
                      <th className="px-4 py-3 text-left">
                        <input
                          type="checkbox"
                          checked={lowStockList.length > 0 && selectedItems.size === lowStockList.length}
                          onChange={selectAllItems}
                          className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                          title="Select all items"
                        />
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-slate-300">Product Name</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-slate-300">Category</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-slate-300">Current Stock</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-slate-300">Reorder Point</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-slate-300">Status</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-slate-300">Order Info</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-slate-300">Order Quantity</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-slate-300">Edited</th>
                    </tr>
                  </thead>
                    <tbody className="bg-white dark:bg-slate-950 divide-y divide-gray-200 dark:divide-slate-800">
                    {loadingPO ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center">
                          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
                          <p className="text-sm text-gray-600 dark:text-slate-400">Loading purchase orders...</p>
                        </td>
                      </tr>
                    ) : lowStockList.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-12 text-center text-gray-500 dark:text-slate-400">
                          <ShoppingCart className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                          <p className="font-medium">No products match your filters</p>
                          <p className="text-sm mt-1">Try adjusting your search or category filters</p>
                        </td>
                      </tr>
                    ) : (
                      lowStockList.map(p => {
                        const isLow = (p.current_stock ?? 0) <= (p.reorder_point ?? 10);
                        return (
                          <tr
                            key={p.id}
                            className={`hover:bg-gray-50 dark:hover:bg-slate-900 transition-colors ${
                              selectedItems.has(p.id) ? 'bg-emerald-50 dark:bg-emerald-900/20' : ''
                            } ${isLow ? 'border-l-4 border-l-orange-500' : ''}`}
                          >
                            <td className="px-4 py-3">
                              {p.delivery_status === 'not_requested' && (
                                <input
                                  type="checkbox"
                                  checked={selectedItems.has(p.id)}
                                  onChange={() => toggleItemSelection(p.id)}
                                  className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                                />
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div>
                                <p className="font-medium text-gray-900 dark:text-slate-100">{p.name}</p>
                                {p.location && (
                                  <p className="text-xs text-gray-500 dark:text-slate-500 mt-0.5">Location: {p.location}</p>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-gray-700 dark:text-slate-300">{p.category_name || '—'}</td>
                            <td className="px-4 py-3 text-right">
                              <span className={`font-semibold ${isLow ? 'text-orange-600 dark:text-orange-400' : 'text-gray-900 dark:text-slate-100'}`}>
                                {p.current_stock ?? 0}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right text-gray-700 dark:text-slate-300">{p.reorder_point ?? 10}</td>
                            <td className="px-4 py-3">
                              {p.delivery_status === 'ordered' && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                                  <Clock className="w-3 h-3" />
                                  Ordered
                                </span>
                              )}
                              {p.delivery_status === 'received' && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                                  <CheckCircle className="w-3 h-3" />
                                  Received
                                </span>
                              )}
                              {p.delivery_status === 'not_requested' && (
                                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                                  Not Ordered
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-600 dark:text-slate-400">
                              {p.po_number && (
                                <div>
                                  <p className="font-medium">PO: {p.po_number}</p>
                                  {p.request_date && (
                                    <p className="mt-0.5">{new Date(p.request_date).toLocaleDateString()}</p>
                                  )}
                                </div>
                              )}
                              {!p.po_number && <span>—</span>}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className="font-medium text-gray-900 dark:text-slate-100">{p.ordered_quantity || '—'}</span>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-300">
                              {p.was_edited && p.updated_by_name ? (
                                <div>
                                  <span className="font-medium">{p.updated_by_name}</span>
                                  {p.updated_at && (
                                    <p className="text-xs text-gray-500 dark:text-slate-500 mt-0.5">
                                      {new Date(p.updated_at).toLocaleDateString()}
                                    </p>
                                  )}
                                </div>
                              ) : p.was_edited && p.updated_at ? (
                                <div>
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                                    <Pencil className="w-3 h-3" />
                                    Edited
                                  </span>
                                  <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">
                                    {new Date(p.updated_at).toLocaleDateString()}
                                  </p>
                                </div>
                              ) : (
                                <span className="text-gray-400 dark:text-slate-500">—</span>
                              )}
                            </td>
                      </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* 3.2 Track Product Returns */}
        {activeTab === 'returns' && (
          <div className="p-6">
            {/* Section Header */}
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100 mb-2">Track Product Returns</h2>
              <p className="text-sm text-gray-600 dark:text-slate-400">Monitor all product returns, refunds, and track return trends over time</p>
            </div>

            {/* Summary Cards */}
            {returnedItems.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-4 border border-orange-200 dark:border-orange-800">
                  <p className="text-sm font-medium text-gray-600 dark:text-slate-400">Total Returns</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-slate-100 mt-1">{returnedItems.length}</p>
                </div>
                <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4 border border-red-200 dark:border-red-800">
                  <p className="text-sm font-medium text-gray-600 dark:text-slate-400">Total Refunded</p>
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">
                    {formatCurrency(returnedItems.reduce((sum, ret) => sum + (ret.total_refund_amount || 0), 0))}
                  </p>
                </div>
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
                  <p className="text-sm font-medium text-gray-600 dark:text-slate-400">Total Items Returned</p>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">
                    {returnedItems.reduce((sum, ret) => sum + (ret.item_count || 0), 0)}
                  </p>
                </div>
              </div>
            )}

            {/* Filters */}
            <div className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl p-4 mb-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 mb-3">
                <div className="relative">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={returnsSearch}
                    onChange={(e) => setReturnsSearch(e.target.value)}
                    placeholder="Search returns..."
                    className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-slate-700 rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white dark:bg-slate-950"
                  />
                </div>
                  <div className="relative">
                    <select
                    value={returnsStaff}
                    onChange={(e) => setReturnsStaff(e.target.value)}
                    className="w-full appearance-none px-3 py-2 text-sm border border-gray-300 dark:border-slate-700 rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white dark:bg-slate-950 pr-8"
                  >
                    <option value="">All Staff</option>
                    {staffList.map(s => (<option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>))}
                    </select>
                  <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                <input
                  type="date"
                  value={returnsDateFrom}
                  onChange={(e) => setReturnsDateFrom(e.target.value)}
                  placeholder="From Date"
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-700 rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white dark:bg-slate-950"
                />
                <input
                  type="date"
                  value={returnsDateTo}
                  onChange={(e) => setReturnsDateTo(e.target.value)}
                  placeholder="To Date"
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-700 rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white dark:bg-slate-950"
                />
                <button 
                  onClick={() => {
                    setReturnsSearch('');
                    setReturnsStaff('');
                    setReturnsDateFrom('');
                    setReturnsDateTo('');
                  }}
                  className="px-4 py-2 text-sm font-medium border border-gray-300 dark:border-slate-700 rounded-md hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Clear
                </button>
                <button 
                  onClick={() => {
                    if (filteredReturns.length === 0) {
                      window.alert('No returns to print');
                      return;
                    }
                    const printWindow = window.open('', '_blank');
                    const filters = `Keyword: ${returnsSearch || 'All'} | Staff: ${returnsStaff ? (staffList.find(s => String(s.id) === String(returnsStaff))?.first_name + ' ' + staffList.find(s => String(s.id) === String(returnsStaff))?.last_name) : 'All'} | Date: ${returnsDateFrom || 'All'} to ${returnsDateTo || 'All'}`;
                    const rows = filteredReturns.map(ret => `<tr><td>${ret.return_number || '—'}</td><td>${ret.sale_number || '—'}</td><td>${ret.item_count || 0}</td><td>₱${(ret.total_refund_amount || 0).toFixed(2)}</td><td>${(ret.reason || '').replace('_', ' ')}</td><td>${ret.created_at ? new Date(ret.created_at).toLocaleString() : '—'}</td></tr>`).join('');
                    const html = `<html><head><title>Product Returns Report</title><style>body{font-family:Arial;margin:20px;color:#111}h1{margin-bottom:8px}table{width:100%;border-collapse:collapse;margin-top:20px}th{background:#f3f4f6;text-align:left;border:1px solid #ddd;padding:8px;font-weight:bold}td{border:1px solid #ddd;padding:8px}</style></head><body><h1>Product Returns Report</h1><p><strong>Filters:</strong> ${filters}</p><p>Generated: ${new Date().toLocaleString()}</p><table><thead><tr><th>Return #</th><th>Sale #</th><th>Items</th><th>Total Refund</th><th>Reason</th><th>Created</th></tr></thead><tbody>${rows || '<tr><td colspan="6" style="text-align:center">No returns found</td></tr>'}</tbody></table></body></html>`;
                    printWindow.document.write(html);
                    printWindow.document.close();
                    printWindow.print();
                  }}
                  disabled={filteredReturns.length === 0}
                  className="px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
                >
                  <Printer className="w-4 h-4" />
                  Print
                </button>
      </div>
          </div>

            {/* Returns List */}
            {loadingReturns ? (
              <div className="text-center py-12 bg-gray-50 dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-emerald-600" />
                <p className="text-gray-600 dark:text-slate-400">Loading returns data...</p>
              </div>
            ) : filteredReturns.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800">
                <RefreshCw className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="font-medium text-gray-900 dark:text-slate-100">No returns found</p>
                <p className="text-sm text-gray-500 dark:text-slate-500 mt-1">
                  {returnedItems.length === 0
                    ? 'No returns recorded yet'
                    : 'No returns match your current filters. Try adjusting your search or date range.'}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredReturns.map(returnItem => (
                  <div
                    key={returnItem.id}
                    className="bg-white dark:bg-slate-950 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow overflow-hidden"
                  >
                    {/* Return Header */}
                    <div className="bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20 px-6 py-4 border-b border-orange-200 dark:border-orange-800">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg flex items-center justify-center shadow-lg">
                            <Package className="w-6 h-6 text-white" />
                          </div>
                          <div>
                            <h4 className="text-lg font-bold text-gray-900 dark:text-slate-100">Return #{returnItem.return_number || returnItem.id}</h4>
                            <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-gray-600 dark:text-slate-400">
                              <span className="flex items-center gap-1">
                                <span className="font-medium">Sale:</span> {returnItem.sale_number || '—'}
                              </span>
                              <span className="flex items-center gap-1">
                                <span className="font-medium">Items:</span> {returnItem.item_count || 0}
                              </span>
                              <span className="flex items-center gap-1">
                                <span className="font-medium">Date:</span> {returnItem.created_at ? new Date(returnItem.created_at).toLocaleDateString() : '—'}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                            {formatCurrency(returnItem.total_refund_amount || 0)}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">Total Refund</p>
              </div>
            </div>
            </div>
            
                    {/* Return Details */}
                    <div className="p-6">
                      {/* Reason and Status */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                          <p className="text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wide mb-1">Return Reason</p>
                          <p className="text-sm font-medium text-gray-900 dark:text-slate-100 capitalize">
                            {(returnItem.reason || 'Not specified').replace(/_/g, ' ')}
                          </p>
            </div>
                        {returnItem.processed_by_name && (
                          <div>
                            <p className="text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wide mb-1">Processed By</p>
                            <p className="text-sm font-medium text-gray-900 dark:text-slate-100">{returnItem.processed_by_name}</p>
                            {returnItem.updated_at && (
                              <p className="text-xs text-gray-500 dark:text-slate-500 mt-0.5">
                                Updated: {new Date(returnItem.updated_at).toLocaleString()}
                              </p>
                            )}
        </div>
                        )}
              </div>

                      {/* Returned Items List */}
                      {returnItem.items && returnItem.items.length > 0 && (
                        <div className="border-t border-gray-200 dark:border-slate-800 pt-4">
                          <h5 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-3 flex items-center gap-2">
                            <Package className="w-4 h-4 text-emerald-600" />
                            Returned Items ({returnItem.items.length})
                          </h5>
                          <div className="bg-gray-50 dark:bg-slate-900 rounded-lg overflow-hidden border border-gray-200 dark:border-slate-800">
                            <table className="min-w-full text-sm">
                              <thead className="bg-gray-100 dark:bg-slate-800">
                                <tr>
                                  <th className="px-4 py-2 text-left font-semibold text-gray-700 dark:text-slate-300">Product</th>
                                  <th className="px-4 py-2 text-right font-semibold text-gray-700 dark:text-slate-300">Quantity</th>
                                  <th className="px-4 py-2 text-right font-semibold text-gray-700 dark:text-slate-300">Unit Price</th>
                                  <th className="px-4 py-2 text-right font-semibold text-gray-700 dark:text-slate-300">Refund Amount</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200 dark:divide-slate-800">
                                {returnItem.items.map((item, idx) => (
                                  <tr key={idx} className="hover:bg-gray-100 dark:hover:bg-slate-800">
                                    <td className="px-4 py-2 font-medium text-gray-900 dark:text-slate-100">{item.product_name || '—'}</td>
                                    <td className="px-4 py-2 text-right text-gray-700 dark:text-slate-300">{item.quantity || 0}</td>
                                    <td className="px-4 py-2 text-right text-gray-700 dark:text-slate-300">
                                      {formatCurrency(item.unit_price || 0)}
                                    </td>
                                    <td className="px-4 py-2 text-right font-semibold text-orange-600 dark:text-orange-400">
                                      {formatCurrency(item.total_refund || 0)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                  </div>
                </div>
      )}

              </div>
          </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 3.3 Track Product Loss */}
        {activeTab === 'loss' && (
          <div className="p-6">
            {/* Section Header */}
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100 mb-2">Track Product Loss</h2>
              <p className="text-sm text-gray-600 dark:text-slate-400">Monitor product losses from expired, damaged, or wasted items and track waste reduction trends</p>
            </div>

            {/* Date Range Filter */}
            <div className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl p-4 mb-6">
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-semibold text-gray-600 dark:text-slate-400 mb-1 uppercase tracking-wide">Date Range</label>
                  <div className="grid grid-cols-2 gap-2">
                          <input
                      type="date"
                      value={wasteDateFrom}
                      onChange={(e) => setWasteDateFrom(e.target.value)}
                      className="px-3 py-2 text-sm border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white dark:bg-slate-950"
                    />
                    <input
                      type="date"
                      value={wasteDateTo}
                      onChange={(e) => setWasteDateTo(e.target.value)}
                      className="px-3 py-2 text-sm border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent bg-white dark:bg-slate-950"
                    />
                  </div>
                </div>
                <button 
                  onClick={loadWasteData}
                  disabled={loadingWaste}
                  className="px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                  >
                  {loadingWaste ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Refresh Data
                </button>
                      </div>
                    </div>

            {loadingWaste ? (
              <div className="text-center py-12 bg-gray-50 dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-emerald-600" />
                <p className="text-gray-600 dark:text-slate-400">Loading waste reduction data...</p>
              </div>
            ) : wasteData ? (
              <div className="space-y-6">
                {/* Most Expired Products Section */}
                {wasteData.high_waste_risk && wasteData.high_waste_risk.length > 0 && (
                  <div className="bg-white dark:bg-slate-950 rounded-xl border border-orange-200 dark:border-orange-800 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-orange-200 dark:border-orange-800 bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20 flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 flex items-center gap-2">
                          <AlertTriangle className="w-5 h-5 text-orange-600" />
                          Most Expired Products - Purchase Recommendations
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">
                          Products with highest expired value. Consider reducing purchase quantities to minimize waste.
                        </p>
                      </div>
                <button 
                        onClick={handlePrintProductLoss}
                        disabled={!wasteData.high_waste_risk || wasteData.high_waste_risk.filter(p => (p.expired_value || 0) > 0).length === 0}
                        className="px-4 py-2 text-sm font-medium border border-gray-300 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                        title="Print product loss report"
                      >
                        <Printer className="w-4 h-4" />
                        Print
                </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-100 dark:bg-slate-800">
                          <tr>
                            <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-slate-300">Product Name</th>
                            <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-slate-300">Category</th>
                            <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-slate-300">Current Stock</th>
                            <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-slate-300">Expired Qty</th>
                            <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-slate-300">Expiring Qty (30 days)</th>
                            <th className="px-4 py-3 text-right font-semibold text-orange-600 dark:text-orange-400">Expired Value</th>
                            <th className="px-4 py-3 text-right font-semibold text-yellow-600 dark:text-yellow-400">Expiring Value</th>
                            <th className="px-4 py-3 text-right font-semibold text-red-600 dark:text-red-400">Potential Waste</th>
                            <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-slate-300">Status</th>
                    </tr>
                  </thead>
                    <tbody className="bg-white dark:bg-slate-950 divide-y divide-gray-200 dark:divide-slate-800">
                          {(() => {
                            const filteredProducts = wasteData.high_waste_risk
                              .filter(p => (p.expired_value || 0) > 0)
                              .sort((a, b) => (b.expired_value || 0) - (a.expired_value || 0));
                            const startIndex = (wastePage - 1) * wastePerPage;
                            const endIndex = startIndex + wastePerPage;
                            const paginatedProducts = filteredProducts.slice(startIndex, endIndex);
                            
                            return paginatedProducts.map((product, idx) => {
                              const expiredValue = product.expired_value || 0;
                              const expiringValue = product.expiring_value || 0;
                              const potentialWaste = product.potential_waste_value || 0;
                              const daysExpired = product.days_expired || 0;
                        return (
                                <tr key={product.id || idx} className="hover:bg-gray-50 dark:hover:bg-slate-900 transition-colors">
                                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-slate-100">{product.name || '—'}</td>
                                  <td className="px-4 py-3 text-gray-700 dark:text-slate-300">{product.category_name || '—'}</td>
                                  <td className="px-4 py-3 text-right text-gray-900 dark:text-slate-100">{product.current_stock || 0} units</td>
                                  <td className="px-4 py-3 text-right font-medium text-red-600 dark:text-red-400">
                                    {product.expired_quantity || 0} units
                                  </td>
                                  <td className="px-4 py-3 text-right font-medium text-yellow-600 dark:text-yellow-400">
                                    {product.expiring_quantity || 0} units
                                  </td>
                                  <td className="px-4 py-3 text-right font-semibold text-red-600 dark:text-red-400">
                                    {formatCurrency(expiredValue)}
                                  </td>
                                  <td className="px-4 py-3 text-right font-semibold text-yellow-600 dark:text-yellow-400">
                                    {formatCurrency(expiringValue)}
                                  </td>
                                  <td className="px-4 py-3 text-right font-bold text-red-600 dark:text-red-400">
                                    {formatCurrency(potentialWaste)}
                                  </td>
                                  <td className="px-4 py-3">
                                    {daysExpired > 0 ? (
                                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                                        Expired {daysExpired}d ago
                              </span>
                                    ) : product.days_to_expiry !== null && product.days_to_expiry <= 30 ? (
                                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300">
                                        Expires in {product.days_to_expiry}d
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                                        Monitor
                                      </span>
                                    )}
                            </td>
                      </tr>
                        );
                      })})()}
                          {(() => {
                            const filteredProducts = wasteData.high_waste_risk.filter(p => (p.expired_value || 0) > 0);
                            if (filteredProducts.length === 0) {
                              return (
                                <tr>
                                  <td colSpan={9} className="px-4 py-8 text-center text-gray-500 dark:text-slate-400">
                                    No expired products found in current inventory
                                  </td>
                                </tr>
                              );
                            }
                            return null;
                          })()}
                  </tbody>
                </table>
            </div>
                  {/* Pagination Controls */}
            {(() => {
              const filteredProducts = wasteData.high_waste_risk.filter(p => (p.expired_value || 0) > 0);
              const totalPages = Math.ceil(filteredProducts.length / wastePerPage);
              const startIndex = (wastePage - 1) * wastePerPage;
              const endIndex = Math.min(startIndex + wastePerPage, filteredProducts.length);
              
              if (totalPages <= 1) return null;
              
              return (
                <div className="px-6 py-4 border-t border-orange-200 dark:border-orange-800 bg-gray-50 dark:bg-slate-900 flex items-center justify-between">
                  <div className="text-sm text-gray-600 dark:text-slate-400">
                    Showing {startIndex + 1} to {endIndex} of {filteredProducts.length} products
                  </div>
                  <div className="flex items-center gap-2">
                <button 
                      onClick={() => setWastePage(prev => Math.max(1, prev - 1))}
                      disabled={wastePage === 1}
                      className="px-3 py-1.5 text-sm font-medium border border-gray-300 dark:border-slate-700 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 transition-colors"
                  >
                      <ChevronLeft className="w-4 h-4" />
                      Previous
                </button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum;
                        if (totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (wastePage <= 3) {
                          pageNum = i + 1;
                        } else if (wastePage >= totalPages - 2) {
                          pageNum = totalPages - 4 + i;
                        } else {
                          pageNum = wastePage - 2 + i;
                        }
                        return (
                          <button
                            key={pageNum}
                            onClick={() => setWastePage(pageNum)}
                            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                              wastePage === pageNum
                                ? 'bg-emerald-600 text-white'
                                : 'border border-gray-300 dark:border-slate-700 hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-700 dark:text-slate-300'
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
              </div>
                        <button
                      onClick={() => setWastePage(prev => Math.min(totalPages, prev + 1))}
                      disabled={wastePage === totalPages}
                      className="px-3 py-1.5 text-sm font-medium border border-gray-300 dark:border-slate-700 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 transition-colors"
                    >
                      Next
                      <ChevronRight className="w-4 h-4" />
                        </button>
            </div>
            </div>
              );
            })()}
                  </div>
                )}

            </div>
            ) : (
              <div className="text-center py-12 bg-gray-50 dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800">
                <TrendingDown className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="font-medium text-gray-900 dark:text-slate-100">No waste data available</p>
                <p className="text-sm text-gray-500 dark:text-slate-500 mt-1">Try adjusting the date range or refresh the page</p>
        </div>
            )}
              </div>
        )}

        {/* 3.4 All Expired Products */}
        {activeTab === 'expired' && (
          <div className="p-6">
            {/* Section Header */}
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100 mb-2">All Expired Products</h2>
              <p className="text-sm text-gray-600 dark:text-slate-400">View and dispose of all expired products in your inventory</p>
            </div>

            {/* Filters */}
            <div className="mb-6 bg-white dark:bg-slate-950 rounded-xl border border-gray-200 dark:border-slate-800 p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search products..."
                    value={expiredSearch}
                    onChange={(e) => setExpiredSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>

                {/* Category */}
                <div>
                  <select
                    value={expiredCategory}
                    onChange={(e) => setExpiredCategory(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="">All Categories</option>
                    {categoryNames.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
        </div>

                {/* Date From */}
                <div>
                  <input
                    type="date"
                    value={expiredDateFrom}
                    onChange={(e) => setExpiredDateFrom(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 dark:bg-slate-900 dark:text-slate-100"
                  />
              </div>

                {/* Date To */}
                <div>
                  <input
                    type="date"
                    value={expiredDateTo}
                    onChange={(e) => setExpiredDateTo(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 dark:bg-slate-900 dark:text-slate-100"
                  />
              </div>
            
                {/* Clear & Print */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setExpiredSearch('');
                      setExpiredCategory('');
                      setExpiredDateFrom('');
                      setExpiredDateTo('');
                    }}
                    className="px-4 py-2 text-sm font-medium border border-gray-300 dark:border-slate-700 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    Clear
                  </button>
                  <button
                    onClick={handlePrintExpired}
                    disabled={filteredExpired.length === 0}
                    className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                  >
                    <Printer className="w-4 h-4" />
                    Print
                  </button>
                </div>
          </div>
              </div>
            
            {loadingExpired ? (
              <div className="text-center py-12 bg-gray-50 dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-emerald-600" />
                <p className="text-gray-600 dark:text-slate-400">Loading expired products...</p>
              </div>
            ) : filteredExpired.length > 0 ? (
              <div className="bg-white dark:bg-slate-950 rounded-xl border border-red-200 dark:border-red-800 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-red-200 dark:border-red-800 bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 flex items-center gap-2">
                        <XCircle className="w-5 h-5 text-red-600" />
                        Expired Products Needing Disposal ({filteredExpired.length})
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">
                        These products have expired and need to be disposed. Select products to dispose multiple items at once, or click "Dispose" on individual items. Once disposed, they will be removed from this list and appear in the "Disposed Products" tab.
                      </p>
                    </div>
                    {selectedExpiredProducts.size > 0 && (
                      <button
                        onClick={disposeSelectedProducts}
                        disabled={batchDisposing}
                        className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                      >
                        {batchDisposing ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Disposing {selectedExpiredProducts.size}...
                          </>
              ) : (
                <>
                            <Trash2 className="w-4 h-4" />
                            Dispose Selected ({selectedExpiredProducts.size})
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-100 dark:bg-slate-800">
                      <tr>
                        <th className="px-4 py-3 text-left">
                          <input
                            type="checkbox"
                            checked={paginatedExpired.filter(p => (p.expired_quantity || 0) > 0 && !p.disposed_by).length > 0 && 
                              paginatedExpired.filter(p => (p.expired_quantity || 0) > 0 && !p.disposed_by).every(p => selectedExpiredProducts.has(p.id))}
                            onChange={toggleSelectAllExpired}
                            className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                            title="Select all on this page"
                          />
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-slate-300">Product Name</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-slate-300">Category</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-slate-300">Location</th>
                        <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-slate-300">Current Stock</th>
                        <th className="px-4 py-3 text-right font-semibold text-red-600 dark:text-red-400">Expired Quantity</th>
                        <th className="px-4 py-3 text-right font-semibold text-red-600 dark:text-red-400">Expired Value</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-slate-300">Days Expired</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-slate-300">Action</th>
                    </tr>
                  </thead>
                    <tbody className="bg-white dark:bg-slate-950 divide-y divide-gray-200 dark:divide-slate-800">
                      {paginatedExpired.map((product, idx) => {
                        const expiredValue = product.expired_value || 0;
                        const expiredQuantity = product.expired_quantity || 0;
                        const daysExpired = product.days_expired || 0;
                        const isDisposing = disposingProductId === product.id;
                        const canSelect = (expiredQuantity || 0) > 0;
                        const isSelected = selectedExpiredProducts.has(product.id);

                        return (
                          <tr 
                            key={product.id || idx} 
                            className={`hover:bg-gray-50 dark:hover:bg-slate-900 transition-colors ${
                              isSelected ? 'bg-red-50 dark:bg-red-900/20' : ''
                            }`}
                          >
                            <td className="px-4 py-3">
                              {canSelect ? (
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleExpiredProductSelection(product.id)}
                                  className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                                />
                              ) : (
                                <span className="text-gray-300 dark:text-slate-600">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 font-medium text-gray-900 dark:text-slate-100">{product.name || '—'}</td>
                            <td className="px-4 py-3 text-gray-700 dark:text-slate-300">{product.category_name || '—'}</td>
                            <td className="px-4 py-3 text-gray-700 dark:text-slate-300">{product.location || '—'}</td>
                            <td className="px-4 py-3 text-right text-gray-900 dark:text-slate-100">{product.current_stock || 0} units</td>
                            <td className="px-4 py-3 text-right font-medium text-red-600 dark:text-red-400">
                              {expiredQuantity} units
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-red-600 dark:text-red-400">
                              {formatCurrency(expiredValue)}
                            </td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                                {daysExpired > 0 ? `${daysExpired} days ago` : 'Expired'}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <button
                                onClick={() => disposeProduct(product.id, product.name, expiredQuantity)}
                                disabled={isDisposing || expiredQuantity === 0}
                                className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                                title={expiredQuantity === 0 ? 'No expired quantity to dispose' : `Dispose ${expiredQuantity} units`}
                              >
                                {isDisposing ? (
                                  <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Disposing...
                                  </>
                                ) : (
                                  <>
                                    <Trash2 className="w-4 h-4" />
                                    Dispose
                                  </>
                                )}
                              </button>
                            </td>
                      </tr>
                        );
                      })}
                  </tbody>
                </table>
                </div>

                  {/* Pagination Controls */}
                {totalExpiredPages > 1 && (
                  <div className="px-6 py-4 border-t border-red-200 dark:border-red-800 bg-gray-50 dark:bg-slate-900 flex items-center justify-between">
                    <div className="text-sm text-gray-600 dark:text-slate-400">
                      Showing {(expiredPage - 1) * expiredPerPage + 1} to {Math.min(expiredPage * expiredPerPage, filteredExpired.length)} of {filteredExpired.length} products
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                        onClick={() => setExpiredPage(prev => Math.max(1, prev - 1))}
                        disabled={expiredPage === 1}
                        className="px-3 py-1.5 text-sm font-medium border border-gray-300 dark:border-slate-700 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 transition-colors"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        Previous
                        </button>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(5, totalExpiredPages) }, (_, i) => {
                          let pageNum;
                          if (totalExpiredPages <= 5) {
                            pageNum = i + 1;
                          } else if (expiredPage <= 3) {
                            pageNum = i + 1;
                          } else if (expiredPage >= totalExpiredPages - 2) {
                            pageNum = totalExpiredPages - 4 + i;
                          } else {
                            pageNum = expiredPage - 2 + i;
                          }
                          return (
                          <button
                              key={pageNum}
                              onClick={() => setExpiredPage(pageNum)}
                              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                                expiredPage === pageNum
                                  ? 'bg-red-600 text-white'
                                  : 'border border-gray-300 dark:border-slate-700 hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-700 dark:text-slate-300'
                              }`}
                            >
                              {pageNum}
                          </button>
                          );
                        })}
                      </div>
                        <button
                        onClick={() => setExpiredPage(prev => Math.min(totalExpiredPages, prev + 1))}
                        disabled={expiredPage === totalExpiredPages}
                        className="px-3 py-1.5 text-sm font-medium border border-gray-300 dark:border-slate-700 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 transition-colors"
                      >
                        Next
                        <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12 bg-gray-50 dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800">
                <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
                <p className="font-medium text-gray-900 dark:text-slate-100">No expired products found</p>
                <p className="text-sm text-gray-500 dark:text-slate-500 mt-1">
                  {expiredSearch || expiredCategory || expiredDateFrom || expiredDateTo 
                    ? 'No expired products needing disposal match your filters. Try adjusting your search criteria.'
                    : 'No expired products need disposal. All expired products have been disposed or all products in your inventory are within their expiration dates'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Disposed Products Tab */}
        {activeTab === 'disposed' && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-950 rounded-xl shadow-sm border border-gray-200 dark:border-slate-800 p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Disposed Products</h2>
                  <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                    Records of expired products that have been disposed and removed from inventory deliveries
                  </p>
                </div>
              </div>

              {/* Filters */}
              <div className="mb-6 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-xl p-4">
                {/* First Row: Search */}
                <div className="mb-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                          <input
                      type="text"
                      placeholder="Search products or batch number..."
                      value={disposedSearch}
                      onChange={(e) => {
                        setDisposedSearch(e.target.value);
                        setDisposedPage(1);
                      }}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Second Row: Date Filters and Actions */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
                  <div className="relative">
                    <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">
                      Date From
                    </label>
                    <input
                      type="date"
                      value={disposedDateFrom}
                      max={disposedDateTo || new Date().toISOString().split('T')[0]}
                      onChange={(e) => {
                        const value = e.target.value;
                        setDisposedDateFrom(value);
                        // Validate: date_from should not be after date_to
                        if (!disposedDateTo || value <= disposedDateTo) {
                          setDisposedPage(1);
                        } else {
                          alert('Date From cannot be after Date To');
                        }
                      }}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />
                  </div>
                  <div className="relative">
                    <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">
                      Date To
                    </label>
                    <input
                      type="date"
                      value={disposedDateTo}
                      min={disposedDateFrom || undefined}
                      max={new Date().toISOString().split('T')[0]}
                      onChange={(e) => {
                        const value = e.target.value;
                        // Validate: date_to should not be before date_from
                        if (!disposedDateFrom || value >= disposedDateFrom) {
                          setDisposedDateTo(value);
                          setDisposedPage(1);
                        } else {
                          alert('Date To cannot be before Date From');
                        }
                      }}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />
                  </div>
                  <div className="flex items-end">
                          <button
                      onClick={() => {
                        setDisposedSearch('');
                        setDisposedDateFrom('');
                        setDisposedDateTo('');
                        setDisposedPage(1);
                      }}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 text-gray-700 dark:text-slate-300 transition-colors font-medium"
                    >
                      Clear Filters
                          </button>
                      </div>
                    </div>
                {/* Active Filters Display */}
                {(disposedSearch || disposedDateFrom || disposedDateTo) && (
                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-slate-800">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-gray-600 dark:text-slate-400 font-medium">Active Filters:</span>
                      {disposedSearch && (
                        <span className="px-3 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-full flex items-center gap-1">
                          Search: "{disposedSearch}"
                          <button
                            onClick={() => {
                              setDisposedSearch('');
                              setDisposedPage(1);
                            }}
                            className="hover:text-emerald-900 dark:hover:text-emerald-100"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      )}
                      {disposedDateFrom && (
                        <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full flex items-center gap-1">
                          From: {new Date(disposedDateFrom).toLocaleDateString()}
                          <button
                            onClick={() => {
                              setDisposedDateFrom('');
                              setDisposedPage(1);
                            }}
                            className="hover:text-blue-900 dark:hover:text-blue-100"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      )}
                      {disposedDateTo && (
                        <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full flex items-center gap-1">
                          To: {new Date(disposedDateTo).toLocaleDateString()}
                          <button
                            onClick={() => {
                              setDisposedDateTo('');
                              setDisposedPage(1);
                            }}
                            className="hover:text-blue-900 dark:hover:text-blue-100"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                            )}
                          </div>
            </div>
                )}
                {/* Action Buttons and Per Page */}
                <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-gray-200 dark:border-slate-800">
                  <button 
                    onClick={handlePrintDisposed}
                    disabled={totalDisposed === 0 || loadingDisposed}
                    className="px-4 py-2 text-sm font-medium border border-gray-300 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                    title="Print disposed products report"
                  >
                    <Printer className="w-4 h-4" />
                    Print
                  </button>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600 dark:text-slate-400 font-medium">
                      Items per page:
                    </label>
                    <select
                      value={disposedPerPage}
                      onChange={(e) => {
                        setDisposedPerPage(Number(e.target.value));
                        setDisposedPage(1);
                      }}
                      className="px-3 py-1.5 text-sm border border-gray-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Mini Dashboard - Total Loss Summary */}
              {totalDisposed > 0 && !loadingDisposed && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                  <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4 border border-red-200 dark:border-red-800">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-gray-600 dark:text-slate-400">Total Records</p>
                      <TrendingDown className="w-5 h-5 text-red-600 dark:text-red-400" />
                    </div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-slate-100">{totalDisposed}</p>
                    <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">
                      Disposed products in this period
                    </p>
                  </div>
                  <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-4 border border-orange-200 dark:border-orange-800">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-gray-600 dark:text-slate-400">Total Quantity</p>
                      <Package className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                    </div>
                    <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{totalDisposedQuantity.toLocaleString()}</p>
                    <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">
                      Total units disposed
                    </p>
                  </div>
                  <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4 border border-red-200 dark:border-red-800">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-gray-600 dark:text-slate-400">Total Loss</p>
                      <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                    </div>
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400">{formatCurrency(totalDisposedCost)}</p>
                    <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">
                      Total cost of disposed products
                    </p>
                  </div>
                </div>
              )}

              {/* Disposed Products Table */}
              {loadingDisposed ? (
                <div className="text-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mx-auto mb-4" />
                  <p className="text-gray-600 dark:text-slate-400">Loading disposed products...</p>
                </div>
              ) : disposedProducts.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-slate-900 border-b border-gray-200 dark:border-slate-800">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-slate-300">Product Name</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-slate-300">Category</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-slate-300">Batch Number</th>
                        <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-slate-300">Quantity</th>
                        <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-slate-300">Cost Price</th>
                        <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-slate-300">Total Cost</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-slate-300">Expiration Date</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-slate-300">Disposed By</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-slate-300">Disposed At</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-slate-950 divide-y divide-gray-200 dark:divide-slate-800">
                      {disposedProducts.map((item, idx) => (
                        <tr key={item.id || idx} className="hover:bg-gray-50 dark:hover:bg-slate-900 transition-colors">
                          <td className="px-4 py-3 text-gray-900 dark:text-slate-100">{item.product_name}</td>
                          <td className="px-4 py-3 text-gray-600 dark:text-slate-400">{item.category_name || '-'}</td>
                          <td className="px-4 py-3 text-gray-600 dark:text-slate-400">{item.batch_number || '-'}</td>
                          <td className="px-4 py-3 text-right text-gray-900 dark:text-slate-100">{item.quantity_disposed}</td>
                          <td className="px-4 py-3 text-right text-gray-900 dark:text-slate-100">{formatCurrency(item.cost_price || 0)}</td>
                          <td className="px-4 py-3 text-right text-red-600 dark:text-red-400 font-medium">{formatCurrency(item.total_cost || 0)}</td>
                          <td className="px-4 py-3 text-gray-600 dark:text-slate-400">
                            {item.expiration_date ? new Date(item.expiration_date).toLocaleDateString() : '-'}
                          </td>
                          <td className="px-4 py-3 text-gray-600 dark:text-slate-400">
                            {item.disposed_by_name ? `${item.disposed_by_role ? item.disposed_by_role.charAt(0).toUpperCase() + item.disposed_by_role.slice(1) : ''} ${item.disposed_by_name}`.trim() : '-'}
                          </td>
                          <td className="px-4 py-3 text-gray-600 dark:text-slate-400">
                            {item.disposed_at ? new Date(item.disposed_at).toLocaleString() : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Pagination */}
                  {totalDisposed > 0 && (
                    <div className="px-6 py-4 border-t border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-900">
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="text-sm text-gray-600 dark:text-slate-400">
                          Showing <span className="font-medium text-gray-900 dark:text-slate-100">{(disposedPage - 1) * disposedPerPage + 1}</span> to{' '}
                          <span className="font-medium text-gray-900 dark:text-slate-100">{Math.min(disposedPage * disposedPerPage, totalDisposed)}</span> of{' '}
                          <span className="font-medium text-gray-900 dark:text-slate-100">{totalDisposed}</span> records
                          {Math.ceil(totalDisposed / disposedPerPage) > 1 && (
                            <span className="ml-2 text-gray-500 dark:text-slate-500">
                              (Page <span className="font-medium">{disposedPage}</span> of <span className="font-medium">{Math.ceil(totalDisposed / disposedPerPage)}</span>)
                            </span>
                          )}
                        </div>
                        {Math.ceil(totalDisposed / disposedPerPage) > 1 && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setDisposedPage(prev => Math.max(1, prev - 1))}
                              disabled={disposedPage === 1}
                              className="px-3 py-1.5 text-sm font-medium border border-gray-300 dark:border-slate-700 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 transition-colors"
                            >
                              <ChevronLeft className="w-4 h-4" />
                              Previous
                            </button>
                            <div className="flex items-center gap-1">
                              {Array.from({ length: Math.min(5, Math.ceil(totalDisposed / disposedPerPage)) }, (_, i) => {
                                const totalPages = Math.ceil(totalDisposed / disposedPerPage);
                                let pageNum;
                                if (totalPages <= 5) {
                                  pageNum = i + 1;
                                } else if (disposedPage <= 3) {
                                  pageNum = i + 1;
                                } else if (disposedPage >= totalPages - 2) {
                                  pageNum = totalPages - 4 + i;
                                } else {
                                  pageNum = disposedPage - 2 + i;
                                }
                                return (
                                  <button
                                    key={pageNum}
                                    onClick={() => setDisposedPage(pageNum)}
                                    className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                                      disposedPage === pageNum
                                        ? 'bg-emerald-600 text-white'
                                        : 'border border-gray-300 dark:border-slate-700 hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-700 dark:text-slate-300'
                                    }`}
                                  >
                                    {pageNum}
                                  </button>
                                );
                              })}
                            </div>
                            <button
                              onClick={() => setDisposedPage(prev => Math.min(Math.ceil(totalDisposed / disposedPerPage), prev + 1))}
                              disabled={disposedPage >= Math.ceil(totalDisposed / disposedPerPage)}
                              className="px-3 py-1.5 text-sm font-medium border border-gray-300 dark:border-slate-700 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 transition-colors"
                            >
                              Next
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12 bg-gray-50 dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-800">
                  <Trash2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="font-medium text-gray-900 dark:text-slate-100">No disposed products found</p>
                  <p className="text-sm text-gray-500 dark:text-slate-500 mt-1">
                    {disposedSearch || disposedDateFrom || disposedDateTo
                      ? 'No records match your filters. Try adjusting your search criteria.'
                      : 'No products have been disposed yet'}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

                          </div>

      {/* Supplier Selection Modal for Purchase Order */}
      {showSupplierModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-950 rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900 dark:text-slate-100">Select Supplier</h3>
                          <button
                onClick={() => {
                  setShowSupplierModal(false);
                  window._pendingPOItems = null;
                }}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5 text-gray-500 dark:text-slate-400" />
                          </button>
                      </div>
            
            <div className="mb-4">
              <p className="text-sm text-gray-600 dark:text-slate-400 mb-4">
                Select a supplier for this purchase order:
              </p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {suppliers.filter(s => s.is_active !== false).map(supplier => (
                          <button
                    key={supplier.id}
                    onClick={() => createPurchaseOrder(supplier.id)}
                    className="w-full text-left p-3 border border-gray-300 dark:border-slate-700 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:border-emerald-500 dark:hover:border-emerald-700 transition-colors"
                  >
                    <div className="font-medium text-gray-900 dark:text-slate-100">{supplier.name}</div>
                    {supplier.phone && (
                      <div className="text-sm text-gray-500 dark:text-slate-500">Phone: {supplier.phone}</div>
                    )}
                    {supplier.email && (
                      <div className="text-sm text-gray-500 dark:text-slate-500">Email: {supplier.email}</div>
                    )}
                          </button>
                        ))}
                          </div>
              {suppliers.filter(s => s.is_active !== false).length === 0 && (
                <div className="text-center py-8 text-gray-500 dark:text-slate-400">
                  <Building2 className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                  <p>No active suppliers found</p>
                  <p className="text-sm mt-1">Please add suppliers first</p>
            </div>
              )}
            </div>
            
            <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-200 dark:border-slate-800">
                          <button
                onClick={() => {
                  setShowSupplierModal(false);
                  window._pendingPOItems = null;
                }}
                className="px-4 py-2 text-sm border border-gray-300 dark:border-slate-700 rounded-md hover:bg-gray-50 dark:hover:bg-slate-800"
              >
                Cancel
                          </button>
                      </div>
                    </div>
                          </div>
      )}
    </div>
  );
};

export default Sustainability;


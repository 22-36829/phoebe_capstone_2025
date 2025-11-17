import React, { useEffect, useMemo, useState } from 'react';
import { Users, Plus, Search, Mail, Shield, Trash2, Loader2, X, Edit3, RotateCcw, UserCheck, UserX, Eye, EyeOff } from 'lucide-react';
import { ManagerAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

const StaffAccounts = () => {
  const { token, user } = useAuth();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', password: '', confirmPassword: '' });
  const [passwordError, setPasswordError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({ first_name: '', last_name: '', email: '', phone: '', address: '' });
  const [resettingId, setResettingId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all'); // all, active, inactive
  
  // Validation constants
  const MIN_PASSWORD_LENGTH = 8;
  const MAX_PASSWORD_LENGTH = 128;
  const MAX_NAME_LENGTH = 100;
  const MAX_EMAIL_LENGTH = 255;

  const filtered = useMemo(() => {
    let result = staff;
    
    // Apply status filter
    if (statusFilter === 'active') {
      result = result.filter(s => s.is_active === true || s.is_active === 1);
    } else if (statusFilter === 'inactive') {
      result = result.filter(s => s.is_active === false || s.is_active === 0 || s.is_active === null);
    }
    
    // Apply search query
    const q = query.trim().toLowerCase();
    if (q) {
      result = result.filter(s =>
        [s.email, s.username, s.first_name, s.last_name, s.role]
          .filter(Boolean)
          .some(v => String(v).toLowerCase().includes(q))
      );
    }
    
    return result;
  }, [query, staff, statusFilter]);

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await ManagerAPI.listStaff(token);
      setStaff(data.staff || []);
    } catch (e) {
      setError(e.message || 'Failed to load staff');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { 
    load(); 
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Validation functions
  const validateField = (name, value) => {
    let error = '';
    
    switch (name) {
      case 'first_name':
      case 'last_name':
        if (!value || !value.trim()) {
          error = `${name === 'first_name' ? 'First name' : 'Last name'} is required`;
        } else if (value.length > MAX_NAME_LENGTH) {
          error = `Must be no more than ${MAX_NAME_LENGTH} characters`;
        } else if (!/^[a-zA-Z\s\-']+$/.test(value)) {
          error = 'Can only contain letters, spaces, hyphens, and apostrophes';
        }
        break;
      
      case 'email':
        if (!value || !value.trim()) {
          error = 'Email is required';
        } else if (value.length > MAX_EMAIL_LENGTH) {
          error = `Email must be no more than ${MAX_EMAIL_LENGTH} characters`;
        } else if (value.length < 3) {
          error = 'Email must be at least 3 characters';
        } else if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value)) {
          error = 'Invalid email format';
        }
        break;
      
      case 'password':
        if (!value) {
          error = 'Password is required';
        } else if (value.length < MIN_PASSWORD_LENGTH) {
          error = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
        } else if (value.length > MAX_PASSWORD_LENGTH) {
          error = `Password must be no more than ${MAX_PASSWORD_LENGTH} characters`;
        } else if (!/[a-zA-Z]/.test(value)) {
          error = 'Password must contain at least one letter';
        } else if (!/[0-9]/.test(value)) {
          error = 'Password must contain at least one number';
        }
        break;
      
      case 'confirmPassword':
        if (!value) {
          error = 'Please confirm your password';
        } else if (value !== form.password) {
          error = 'Passwords do not match';
        }
        break;
      
      default:
        break;
    }
    
    return error;
  };

  const handleFieldChange = (field, value) => {
    // Enforce max length
    let processedValue = value;
    if (field === 'first_name' || field === 'last_name') {
      if (value.length > MAX_NAME_LENGTH) {
        processedValue = value.slice(0, MAX_NAME_LENGTH);
      }
      // Filter invalid characters for names
      processedValue = processedValue.replace(/[^a-zA-Z\s\-']/g, '');
    } else if (field === 'email') {
      if (value.length > MAX_EMAIL_LENGTH) {
        processedValue = value.slice(0, MAX_EMAIL_LENGTH);
      }
    } else if (field === 'password' || field === 'confirmPassword') {
      if (value.length > MAX_PASSWORD_LENGTH) {
        processedValue = value.slice(0, MAX_PASSWORD_LENGTH);
      }
    }
    
    setForm(f => ({ ...f, [field]: processedValue }));
    
    // Clear password error when typing
    if (field === 'password' || field === 'confirmPassword') {
      if (passwordError) setPasswordError('');
    }
    
    // Validate if field has been touched
    if (touched[field]) {
      const error = validateField(field, processedValue);
      setFieldErrors(f => ({ ...f, [field]: error }));
    }
  };

  const handleFieldBlur = (field) => {
    setTouched(f => ({ ...f, [field]: true }));
    const error = validateField(field, form[field]);
    setFieldErrors(f => ({ ...f, [field]: error }));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    
    // Mark all fields as touched
    const allTouched = {
      first_name: true,
      last_name: true,
      email: true,
      password: true,
      confirmPassword: true
    };
    setTouched(allTouched);
    
    // Validate all fields
    const errors = {};
    ['first_name', 'last_name', 'email', 'password', 'confirmPassword'].forEach(field => {
      const error = validateField(field, form[field]);
      if (error) errors[field] = error;
    });
    
    setFieldErrors(errors);
    
    // Check if there are any errors
    if (Object.keys(errors).length > 0) {
      setPasswordError(errors.password || errors.confirmPassword || '');
      return;
    }
    
    // Validate password match
    if (form.password !== form.confirmPassword) {
      setPasswordError('Passwords do not match');
      setFieldErrors(f => ({ ...f, confirmPassword: 'Passwords do not match' }));
      return;
    }
    
    try {
      setCreating(true);
      setError('');
      setPasswordError('');
      // Only send password, not confirmPassword to the API
      const { confirmPassword, ...staffData } = form;
      await ManagerAPI.createStaff(staffData, token);
      setShowAdd(false);
      setForm({ first_name: '', last_name: '', email: '', password: '', confirmPassword: '' });
      setFieldErrors({});
      setTouched({});
      setShowPassword(false);
      setShowConfirmPassword(false);
      await load();
    } catch (e) {
      setError(e.message || 'Failed to create staff');
    } finally {
      setCreating(false);
    }
  };

  const makeRole = async (target, role) => {
    try {
      setError('');
      await ManagerAPI.updateStaff(target.id, { role }, token);
      await load();
    } catch (e) {
      setError(e.message || 'Failed to update role');
    }
  };

  const removeStaff = async (target) => {
    if (!target || isSelf(target)) return;
    const ok = window.confirm(`Deactivate ${target.email}? They will no longer be able to access the system.`);
    if (!ok) return;
    try {
      setError('');
      await ManagerAPI.deleteStaff(target.id, token);
      await load();
    } catch (e) {
      setError(e.message || 'Failed to deactivate staff');
    }
  };

  const reactivateStaff = async (target) => {
    if (!target || isSelf(target)) return;
    const ok = window.confirm(`Reactivate ${target.email}? They will be able to access the system again.`);
    if (!ok) return;
    try {
      setError('');
      await ManagerAPI.updateStaff(target.id, { is_active: true }, token);
      await load();
    } catch (e) {
      setError(e.message || 'Failed to reactivate staff');
    }
  };

  const isSelf = (row) => user && row.id === user.id;

  const openEdit = (row) => {
    setEditing(row);
    setEditForm({
      first_name: row.first_name || '',
      last_name: row.last_name || '',
      email: row.email || '',
      phone: row.phone || row.mobile || '',
      address: row.address || '',
    });
    setEditOpen(true);
  };

  const saveEdit = async (e) => {
    e?.preventDefault?.();
    if (!editing) return;
    try {
      setEditSaving(true);
      setError('');
      await ManagerAPI.updateStaff(editing.id, editForm, token);
      setEditOpen(false);
      setEditing(null);
      await load();
    } catch (e) {
      setError(e.message || 'Failed to update staff');
    } finally {
      setEditSaving(false);
    }
  };

  const resetPassword = async (row) => {
    if (!row || isSelf(row)) return;
    const ok = window.confirm(`Reset password for ${row.email} to default (staff123)?`);
    if (!ok) return;
    try {
      setResettingId(row.id);
      setError('');
      await ManagerAPI.updateStaff(row.id, { password: 'staff123' }, token);
    } catch (e) {
      setError(e.message || 'Failed to reset password');
    } finally {
      setResettingId(null);
    }
  };

  return (
    <>
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-xl p-6 text-white">
        <h1 className="text-3xl font-bold mb-2">Staff Management</h1>
        <p className="text-indigo-100">Manage staff accounts and permissions for your pharmacy</p>
      </div>

      {/* Actions */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="flex flex-1 gap-4 w-full">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search staff..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
            >
              <option value="all">All Status</option>
              <option value="active">Active Only</option>
              <option value="inactive">Deactivated Only</option>
            </select>
          </div>
          <button onClick={() => setShowAdd(true)} className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
            <Plus className="w-4 h-4 mr-2" />
            Add Staff
          </button>
        </div>
      </div>

      {/* Errors */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3">{error}</div>
      )}

      {/* Staff Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Staff Members</h2>
          {loading && <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}
        </div>
        <div className="p-6">
          {filtered.length === 0 && !loading ? (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No staff members</h3>
              <p className="text-gray-500 mb-4">Add your first staff member to get started</p>
              <button onClick={() => setShowAdd(true)} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
                Add Staff Member
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-600">
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">Email</th>
                    <th className="py-2 pr-4">Role</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(row => {
                    const isDeactivated = row.is_active === false || row.is_active === 0 || row.is_active === null;
                    return (
                    <tr key={row.id} className={`border-t border-gray-100 ${isDeactivated ? 'opacity-60 bg-gray-50' : ''}`}>
                      <td className="py-3 pr-4 font-medium text-gray-900">{row.first_name || row.last_name ? `${row.first_name || ''} ${row.last_name || ''}`.trim() : row.username}</td>
                      <td className="py-3 pr-4 text-gray-700 flex items-center gap-2"><Mail className="w-4 h-4 text-gray-400" />{row.email}</td>
                      <td className="py-3 pr-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${row.role === 'manager' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {row.role}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        {isDeactivated ? (
                          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-200 text-gray-700 flex items-center gap-1.5 w-fit">
                            <UserX className="w-3 h-3" />
                            Deactivated
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700 flex items-center gap-1.5 w-fit">
                            <UserCheck className="w-3 h-3" />
                            Active
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-0">
                        <div className="flex items-center justify-end gap-2">
                          {/* Only allow actions on staff and not self */}
                          {!isSelf(row) && (
                            <>
                              {isDeactivated ? (
                                <button
                                  onClick={() => reactivateStaff(row)}
                                  className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-1.5"
                                  title="Reactivate Account"
                                >
                                  <UserCheck className="w-4 h-4" />
                                  <span className="text-xs">Reactivate</span>
                                </button>
                              ) : (
                                <>
                                  <button
                                    onClick={() => openEdit(row)}
                                    className="px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                                    title="Edit Info"
                                  >
                                    <Edit3 className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => resetPassword(row)}
                                    className="px-3 py-1.5 border border-amber-300 text-amber-600 rounded-lg hover:bg-amber-50 transition-colors disabled:opacity-50"
                                    title="Reset Password"
                                    disabled={resettingId === row.id}
                                  >
                                    {resettingId === row.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                                  </button>
                                  {row.role === 'staff' ? (
                                    <button
                                      onClick={() => makeRole(row, 'manager')}
                                      className="px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                                      title="Make Manager"
                                    >
                                      <Shield className="w-4 h-4" />
                                    </button>
                                  ) : row.role === 'manager' && (
                                    <button
                                      onClick={() => makeRole(row, 'staff')}
                                      className="px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                                      title="Make Staff"
                                    >
                                      <Shield className="w-4 h-4" />
                                    </button>
                                  )}
                                  <button
                                    onClick={() => removeStaff(row)}
                                    className="px-3 py-1.5 border border-rose-300 text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                                    title="Deactivate"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

    </div>

      {/* Add Staff Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4 py-0">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">Add Staff Member</h3>
              <button onClick={() => {
                setShowAdd(false);
                setForm({ first_name: '', last_name: '', email: '', password: '', confirmPassword: '' });
                setPasswordError('');
                setFieldErrors({});
                setTouched({});
                setShowPassword(false);
                setShowConfirmPassword(false);
              }} className="p-2 rounded-lg hover:bg-gray-100"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    First Name <span className="text-red-500">*</span>
                  </label>
                  <input 
                    value={form.first_name} 
                    onChange={e => handleFieldChange('first_name', e.target.value)}
                    onBlur={() => handleFieldBlur('first_name')}
                    maxLength={MAX_NAME_LENGTH}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                      fieldErrors.first_name && touched.first_name ? 'border-red-300' : 'border-gray-300'
                    }`} 
                    required 
                  />
                  {fieldErrors.first_name && touched.first_name && (
                    <p className="mt-1 text-sm text-red-600">{fieldErrors.first_name}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Last Name <span className="text-red-500">*</span>
                  </label>
                  <input 
                    value={form.last_name} 
                    onChange={e => handleFieldChange('last_name', e.target.value)}
                    onBlur={() => handleFieldBlur('last_name')}
                    maxLength={MAX_NAME_LENGTH}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                      fieldErrors.last_name && touched.last_name ? 'border-red-300' : 'border-gray-300'
                    }`} 
                    required 
                  />
                  {fieldErrors.last_name && touched.last_name && (
                    <p className="mt-1 text-sm text-red-600">{fieldErrors.last_name}</p>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input 
                  type="email" 
                  value={form.email} 
                  onChange={e => handleFieldChange('email', e.target.value)}
                  onBlur={() => handleFieldBlur('email')}
                  maxLength={MAX_EMAIL_LENGTH}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                    fieldErrors.email && touched.email ? 'border-red-300' : 'border-gray-300'
                  }`} 
                  required 
                />
                {fieldErrors.email && touched.email && (
                  <p className="mt-1 text-sm text-red-600">{fieldErrors.email}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Temporary Password <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input 
                    type={showPassword ? 'text' : 'password'} 
                    value={form.password} 
                    onChange={e => handleFieldChange('password', e.target.value)}
                    onBlur={() => handleFieldBlur('password')}
                    maxLength={MAX_PASSWORD_LENGTH}
                    minLength={MIN_PASSWORD_LENGTH}
                    className={`w-full px-3 py-2 pr-10 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                      fieldErrors.password && touched.password ? 'border-red-300' : 'border-gray-300'
                    }`} 
                    required 
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                    ) : (
                      <Eye className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                    )}
                  </button>
                </div>
                {fieldErrors.password && touched.password && (
                  <p className="mt-1 text-sm text-red-600">{fieldErrors.password}</p>
                )}
                {!fieldErrors.password && form.password && (
                  <p className="mt-1 text-xs text-gray-500">
                    Must be {MIN_PASSWORD_LENGTH}-{MAX_PASSWORD_LENGTH} characters with at least one letter and one number
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Confirm Password <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input 
                    type={showConfirmPassword ? 'text' : 'password'} 
                    value={form.confirmPassword} 
                    onChange={e => handleFieldChange('confirmPassword', e.target.value)}
                    onBlur={() => handleFieldBlur('confirmPassword')}
                    maxLength={MAX_PASSWORD_LENGTH}
                    minLength={MIN_PASSWORD_LENGTH}
                    className={`w-full px-3 py-2 pr-10 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                      (fieldErrors.confirmPassword && touched.confirmPassword) || passwordError ? 'border-red-300' : 'border-gray-300'
                    }`} 
                    required 
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                    ) : (
                      <Eye className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                    )}
                  </button>
                </div>
                {(fieldErrors.confirmPassword && touched.confirmPassword) && (
                  <p className="mt-1 text-sm text-red-600">{fieldErrors.confirmPassword}</p>
                )}
                {passwordError && !fieldErrors.confirmPassword && (
                  <p className="mt-1 text-sm text-red-600">{passwordError}</p>
                )}
              </div>
              <div className="flex items-center gap-2 justify-end pt-2">
                <button 
                  type="button" 
                  onClick={() => {
                    setShowAdd(false);
                    setForm({ first_name: '', last_name: '', email: '', password: '', confirmPassword: '' });
                    setPasswordError('');
                    setFieldErrors({});
                    setTouched({});
                    setShowPassword(false);
                    setShowConfirmPassword(false);
                  }} 
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button disabled={creating} type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
                  {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Staff Modal */}
      {editOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4 py-0">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">Edit Staff</h3>
              <button onClick={() => { setEditOpen(false); setEditing(null); }} className="p-2 rounded-lg hover:bg-gray-100"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <form onSubmit={saveEdit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                  <input value={editForm.first_name} onChange={e => setEditForm(f => ({ ...f, first_name: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                  <input value={editForm.last_name} onChange={e => setEditForm(f => ({ ...f, last_name: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent" required />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent" required />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                  <input value={editForm.address} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
                </div>
              </div>
              <div className="flex items-center gap-2 justify-end pt-2">
                <button type="button" onClick={() => { setEditOpen(false); setEditing(null); }} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                <button disabled={editSaving} type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
                  {editSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default StaffAccounts;

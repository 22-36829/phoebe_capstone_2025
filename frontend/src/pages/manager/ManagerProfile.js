import React, { useEffect, useState } from 'react';
import { Mail, Phone, MapPin, Camera, Building2, Trash2, Edit3, Shield } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ManagerAPI } from '../../services/api';

const ManagerProfile = () => {
  const { token, user } = useAuth();
  // eslint-disable-next-line no-unused-vars
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [pharmacy, setPharmacy] = useState({ name: '', address: '', phone: '', email: '', license_number: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Modal state
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showPharmacyModal, setShowPharmacyModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showDeletionModal, setShowDeletionModal] = useState(false);
  const [deletionReason, setDeletionReason] = useState('');

  useEffect(() => {
    if (user) {
      setFormData(prev => ({
        ...prev,
        firstName: user.first_name || '',
        lastName: user.last_name || '',
        email: user.email || prev.email,
      }));
    }
  }, [user]);

  useEffect(() => {
    (async () => {
      try {
        if (!token) return;
        const res = await ManagerAPI.getPharmacy(token);
        if (res.success) setPharmacy(res.pharmacy);
      } catch {}
    })();
  }, [token]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  const handlePharmacyChange = (e) => {
    const { name, value } = e.target;
    setPharmacy(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    try {
      setError(''); setMessage('');
      const confirm = window.confirm('Save profile changes?');
      if (!confirm) return;
      await ManagerAPI.updateProfile({ first_name: formData.firstName, last_name: formData.lastName }, token);
      setShowProfileModal(false);
      setMessage('Profile updated');
      setTimeout(() => setMessage(''), 2000);
    } catch (e) {
      setError(e.message || 'Failed to update profile');
    }
  };

  const handlePharmacySave = async () => {
    try {
      setError(''); setMessage('');
      const confirm = window.confirm('Save pharmacy changes?');
      if (!confirm) return;
      const payload = { name: pharmacy.name, address: pharmacy.address, phone: pharmacy.phone, email: pharmacy.email, license_number: pharmacy.license_number };
      await ManagerAPI.updatePharmacy(payload, token);
      setShowPharmacyModal(false);
      setMessage('Pharmacy updated');
      setTimeout(() => setMessage(''), 2000);
    } catch (e) {
      setError(e.message || 'Failed to update pharmacy');
    }
  };

  const handlePasswordChange = async () => {
    if (!formData.currentPassword || !formData.newPassword) {
      alert('Please fill current and new password');
      return;
    }
    if (formData.newPassword !== formData.confirmPassword) {
      alert('Passwords do not match');
      return;
    }
    try {
      setError(''); setMessage('');
      const confirm = window.confirm('Change your password now?');
      if (!confirm) return;
      await ManagerAPI.changePassword({ current_password: formData.currentPassword, new_password: formData.newPassword }, token);
      setShowPasswordModal(false);
      setMessage('Password updated successfully');
      setFormData(prev => ({ ...prev, currentPassword: '', newPassword: '', confirmPassword: '' }));
      setTimeout(() => setMessage(''), 3000);
    } catch (e) {
      setError(e.message || 'Failed to change password');
    }
  };

  const requestDeletion = async () => {
    if (!window.confirm('Are you sure you want to request deletion of your pharmacy?')) return;
    try {
      setError(''); setMessage('');
      await ManagerAPI.requestPharmacyDeletion(deletionReason || '', token);
      setShowDeletionModal(false);
      setDeletionReason('');
      setMessage('Deletion request sent to Admin');
      setTimeout(() => setMessage(''), 3000);
    } catch (e) {
      setError(e.message || 'Failed to send deletion request');
    }
  };

  return (
    <>
    <div className="w-full max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl p-6 sm:p-8 text-white">
        <h1 className="text-2xl sm:text-3xl font-bold mb-2">Profile Settings</h1>
        <p className="text-blue-100 text-sm sm:text-base">Manage your account and pharmacy information</p>
      </div>

      {message && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg px-4 py-3">{message}</div>}
      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile Card */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-slate-950 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-slate-800 h-full">
            <div className="text-center">
              <div className="relative inline-block mb-6">
                <div className="w-32 h-32 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-4xl font-bold mx-auto">
                  {(formData.firstName || 'M')[0]}{(formData.lastName || 'G')[0]}
                </div>
                <button 
                  onClick={() => {/* TODO: Add avatar change functionality */}}
                  className="absolute bottom-0 right-0 p-2.5 bg-white dark:bg-slate-800 rounded-full shadow-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors border border-gray-200 dark:border-slate-700 z-10 cursor-pointer"
                  title="Change avatar"
                  type="button"
                >
                  <Camera className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                </button>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-100 mb-1">{formData.firstName} {formData.lastName}</h2>
              <p className="text-gray-500 dark:text-slate-400">Manager</p>
              <p className="text-sm text-gray-400 dark:text-slate-500 mt-2">Phoebe Drugstore</p>
            </div>
            <div className="mt-6 space-y-3 text-left">
              <div className="flex items-center text-gray-700 dark:text-slate-300 py-1">
                <Mail className="w-4 h-4 mr-3 text-gray-400 dark:text-slate-500 flex-shrink-0" /> 
                <span className="text-sm break-words">{formData.email}</span>
              </div>
              <div className="flex items-center text-gray-700 dark:text-slate-300 py-1">
                <Phone className="w-4 h-4 mr-3 text-gray-400 dark:text-slate-500 flex-shrink-0" /> 
                <span className="text-sm">{formData.phone || '—'}</span>
              </div>
              <div className="flex items-start text-gray-700 dark:text-slate-300 py-1">
                <MapPin className="w-4 h-4 mr-3 mt-0.5 text-gray-400 dark:text-slate-500 flex-shrink-0" /> 
                <span className="text-sm break-words">{formData.address || '—'}</span>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-1 gap-3">
              <button 
                onClick={() => setShowProfileModal(true)} 
                className="w-full px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 active:bg-indigo-800 flex items-center justify-center gap-2 font-medium transition-colors cursor-pointer touch-manipulation"
                type="button"
              >
                <Edit3 className="w-4 h-4" /> 
                <span>Edit Profile</span>
              </button>
              <button 
                onClick={() => setShowPasswordModal(true)} 
                className="w-full px-4 py-3 bg-gray-900 dark:bg-slate-800 text-white rounded-lg hover:bg-gray-800 dark:hover:bg-slate-700 active:bg-gray-700 dark:active:bg-slate-600 flex items-center justify-center gap-2 font-medium transition-colors cursor-pointer touch-manipulation"
                type="button"
              >
                <Shield className="w-4 h-4" /> 
                <span>Change Password</span>
              </button>
            </div>
          </div>
        </div>

        {/* Pharmacy Card */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-slate-950 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-slate-800 h-full">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 flex items-center gap-2">
                <Building2 className="w-5 h-5" /> 
                <span>Pharmacy</span>
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <button 
                  onClick={() => setShowPharmacyModal(true)} 
                  className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 active:bg-indigo-800 flex items-center gap-2 font-medium transition-colors cursor-pointer touch-manipulation whitespace-nowrap"
                  type="button"
                >
                  <Edit3 className="w-4 h-4" /> 
                  <span>Edit</span>
                </button>
                <button 
                  onClick={() => setShowDeletionModal(true)} 
                  className="px-4 py-2.5 bg-rose-600 text-white rounded-lg hover:bg-rose-700 active:bg-rose-800 flex items-center gap-2 font-medium transition-colors cursor-pointer touch-manipulation whitespace-nowrap"
                  type="button"
                >
                  <Trash2 className="w-4 h-4" /> 
                  <span>Request Deletion</span>
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              <div className="space-y-1">
                <span className="block text-gray-500 dark:text-slate-400 text-sm font-medium">Name</span>
                <div className="font-medium text-gray-900 dark:text-slate-100 py-1">{pharmacy.name || '—'}</div>
              </div>
              <div className="space-y-1">
                <span className="block text-gray-500 dark:text-slate-400 text-sm font-medium">Phone</span>
                <div className="font-medium text-gray-900 dark:text-slate-100 py-1">{pharmacy.phone || '—'}</div>
              </div>
              <div className="space-y-1">
                <span className="block text-gray-500 dark:text-slate-400 text-sm font-medium">Email</span>
                <div className="font-medium text-gray-900 dark:text-slate-100 py-1 break-words">{pharmacy.email || '—'}</div>
              </div>
              <div className="space-y-1">
                <span className="block text-gray-500 dark:text-slate-400 text-sm font-medium">License #</span>
                <div className="font-medium text-gray-900 dark:text-slate-100 py-1">{pharmacy.license_number || '—'}</div>
              </div>
              <div className="md:col-span-2 space-y-1">
                <span className="block text-gray-500 dark:text-slate-400 text-sm font-medium">Address</span>
                <div className="font-medium text-gray-900 dark:text-slate-100 py-1 break-words">{pharmacy.address || '—'}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

      {/* Profile Modal */}
      {showProfileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 py-0 overflow-y-auto">
          <div className="bg-white dark:bg-slate-950 rounded-2xl shadow-2xl p-6 w-full max-w-lg my-auto">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-6">Edit Profile</h3>
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">First Name</label>
                  <input 
                    name="firstName" 
                    value={formData.firstName} 
                    onChange={handleInputChange} 
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Last Name</label>
                  <input 
                    name="lastName" 
                    value={formData.lastName} 
                    onChange={handleInputChange} 
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100" 
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Phone</label>
                <input 
                  name="phone" 
                  value={formData.phone} 
                  onChange={handleInputChange} 
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Address</label>
                <textarea 
                  name="address" 
                  value={formData.address} 
                  onChange={handleInputChange} 
                  rows={3} 
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 resize-none" 
                />
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-slate-800">
                <button 
                  onClick={() => setShowProfileModal(false)} 
                  className="px-5 py-2.5 border border-gray-300 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 font-medium transition-colors cursor-pointer touch-manipulation"
                  type="button"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSave} 
                  className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 font-medium transition-colors cursor-pointer touch-manipulation"
                  type="button"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pharmacy Modal */}
      {showPharmacyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 py-0 overflow-y-auto">
          <div className="bg-white dark:bg-slate-950 rounded-2xl shadow-2xl p-6 w-full max-w-2xl my-auto">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-6">Edit Pharmacy</h3>
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Name</label>
                  <input 
                    name="name" 
                    value={pharmacy.name} 
                    onChange={handlePharmacyChange} 
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Phone</label>
                  <input 
                    name="phone" 
                    value={pharmacy.phone || ''} 
                    onChange={handlePharmacyChange} 
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Email</label>
                  <input 
                    name="email" 
                    value={pharmacy.email || ''} 
                    onChange={handlePharmacyChange} 
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">License Number</label>
                  <input 
                    name="license_number" 
                    value={pharmacy.license_number || ''} 
                    onChange={handlePharmacyChange} 
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100" 
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Address</label>
                  <textarea 
                    name="address" 
                    value={pharmacy.address || ''} 
                    onChange={handlePharmacyChange} 
                    rows={3} 
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 resize-none" 
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-slate-800">
                <button 
                  onClick={() => setShowPharmacyModal(false)} 
                  className="px-5 py-2.5 border border-gray-300 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 font-medium transition-colors cursor-pointer touch-manipulation"
                  type="button"
                >
                  Cancel
                </button>
                <button 
                  onClick={handlePharmacySave} 
                  className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 font-medium transition-colors cursor-pointer touch-manipulation"
                  type="button"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 py-0 overflow-y-auto">
          <div className="bg-white dark:bg-slate-950 rounded-2xl shadow-2xl p-6 w-full max-w-md my-auto">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-6">Change Password</h3>
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Current Password</label>
                <input 
                  type={showPassword ? 'text' : 'password'} 
                  name="currentPassword" 
                  value={formData.currentPassword} 
                  onChange={handleInputChange} 
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100" 
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">New Password</label>
                  <input 
                    type="password" 
                    name="newPassword" 
                    value={formData.newPassword} 
                    onChange={handleInputChange} 
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Confirm Password</label>
                  <input 
                    type="password" 
                    name="confirmPassword" 
                    value={formData.confirmPassword} 
                    onChange={handleInputChange} 
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100" 
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-slate-800">
                <button 
                  onClick={() => setShowPasswordModal(false)} 
                  className="px-5 py-2.5 border border-gray-300 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 font-medium transition-colors cursor-pointer touch-manipulation"
                  type="button"
                >
                  Cancel
                </button>
                <button 
                  onClick={handlePasswordChange} 
                  className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 font-medium transition-colors cursor-pointer touch-manipulation"
                  type="button"
                >
                  Update Password
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Deletion Request Modal */}
      {showDeletionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 py-0 overflow-y-auto">
          <div className="bg-white dark:bg-slate-950 rounded-2xl shadow-2xl p-6 w-full max-w-md my-auto">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-4">Request Pharmacy Deletion</h3>
            <p className="text-sm text-gray-600 dark:text-slate-400 mb-5">This will notify Admin to review and process your request.</p>
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">Reason (optional)</label>
                <textarea 
                  value={deletionReason} 
                  onChange={(e) => setDeletionReason(e.target.value)} 
                  rows={3} 
                  className="w-full px-4 py-2.5 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 resize-none" 
                />
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-slate-800">
                <button 
                  onClick={() => setShowDeletionModal(false)} 
                  className="px-5 py-2.5 border border-gray-300 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 font-medium transition-colors cursor-pointer touch-manipulation"
                  type="button"
                >
                  Cancel
                </button>
                <button 
                  onClick={requestDeletion} 
                  className="px-5 py-2.5 bg-rose-600 text-white rounded-lg hover:bg-rose-700 active:bg-rose-800 font-medium transition-colors cursor-pointer touch-manipulation"
                  type="button"
                >
                  Send Request
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ManagerProfile;

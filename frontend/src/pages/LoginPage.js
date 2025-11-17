import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, Mail, ArrowLeft, Shield, BarChart3, Brain, User, Crown, Briefcase, Sparkles, Zap } from 'lucide-react';
import { AuthAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const LoginPage = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState(null);
  const navigate = useNavigate();
  const { login } = useAuth();

  const demoAccounts = [
    { 
      role: 'Admin', 
      email: 'admin@phoebe.com', 
      password: 'admin123', 
      icon: Crown, 
      color: 'from-blue-500 to-blue-600',
      hoverColor: 'hover:from-blue-600 hover:to-blue-700',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      textColor: 'text-blue-700'
    },
    { 
      role: 'Manager', 
      email: 'manager@phoebe.com', 
      password: 'manager123', 
      icon: Briefcase, 
      color: 'from-purple-500 to-purple-600',
      hoverColor: 'hover:from-purple-600 hover:to-purple-700',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-200',
      textColor: 'text-purple-700'
    },
    { 
      role: 'Staff', 
      email: 'staff@phoebe.com', 
      password: 'staff123', 
      icon: User, 
      color: 'from-blue-500 to-purple-500',
      hoverColor: 'hover:from-blue-600 hover:to-purple-600',
      bgColor: 'bg-gradient-to-br from-blue-50 to-purple-50',
      borderColor: 'border-blue-200',
      textColor: 'text-blue-700'
    }
  ];

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleDemoClick = (email, password) => {
    setFormData({
      email,
      password
    });
    // Add a cute animation effect
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    if (emailInput) {
      emailInput.focus();
      setTimeout(() => passwordInput?.focus(), 300);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await AuthAPI.login(formData.email, formData.password);
      login(res); // Use AuthContext login function
      
      // Navigate based on role
      const role = (res.user?.role || '').toLowerCase();
      const roleToPath = { 
        admin: '/admin', 
        manager: '/manager', 
        staff: '/staff' 
      };
      
      const redirectPath = roleToPath[role] || '/';
      console.log('Login successful, redirecting to:', redirectPath, 'for role:', role);
      navigate(redirectPath);
    } catch (error) {
      console.error('Login error:', error);
      alert('Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Animated background accents */}
      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-blue-200/30 blur-3xl animate-pulse"></div>
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-purple-200/30 blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
      <div className="pointer-events-none absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 h-64 w-64 rounded-full bg-blue-200/20 blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>

      {/* Floating sparkles */}
      <div className="pointer-events-none absolute top-20 left-20 animate-bounce" style={{ animationDuration: '3s' }}>
        <Sparkles className="w-6 h-6 text-blue-400/60" />
      </div>
      <div className="pointer-events-none absolute bottom-32 right-32 animate-bounce" style={{ animationDuration: '4s', animationDelay: '1s' }}>
        <Sparkles className="w-5 h-5 text-purple-400/60" />
      </div>
      <div className="pointer-events-none absolute top-1/3 right-20 animate-bounce" style={{ animationDuration: '5s', animationDelay: '2s' }}>
        <Sparkles className="w-4 h-4 text-blue-400/60" />
      </div>

      <div className="relative mx-auto grid min-h-screen max-w-7xl grid-cols-1 md:grid-cols-2 gap-0 px-0">
        {/* Left brand/marketing panel */}
        <div className="hidden md:flex flex-col justify-center p-8 md:p-12 lg:p-16 bg-gradient-to-br from-blue-600 to-purple-700 text-white relative overflow-hidden">
          {/* Animated background pattern */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 left-0 w-64 h-64 bg-white rounded-full blur-3xl"></div>
            <div className="absolute bottom-0 right-0 w-96 h-96 bg-white rounded-full blur-3xl"></div>
          </div>
          
          <div className="relative z-10">
            <Link to="/" className="inline-flex items-center text-white/90 hover:text-white mb-8 transition-all hover:translate-x-1 group">
              <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
              Back to Home
            </Link>
            <div className="mb-6 inline-flex items-center px-4 py-2 rounded-full bg-white/20 backdrop-blur-sm" style={{ marginLeft: '20px' }}>
              <Zap className="w-4 h-4 mr-2 animate-pulse" />
              <span className="text-sm font-medium">AI-Powered Platform</span>
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold leading-tight mb-4">
              Welcome back to{' '}
              <span className="bg-gradient-to-r from-blue-200 to-purple-200 bg-clip-text text-transparent">
                Phoebe Drugstore
              </span>
            </h1>
            <p className="text-white/80 text-lg mb-10 max-w-md leading-relaxed">
              Manage sales, inventory, and forecasts with an AI-powered platform designed for modern pharmacies.
            </p>
            <div className="space-y-4">
              <div className="flex items-center space-x-3 group">
                <div className="p-2 rounded-lg bg-white/20 backdrop-blur-sm group-hover:bg-white/30 transition-all">
                  <Shield className="w-5 h-5" />
                </div>
                <span className="text-white/90">Bank-level security and privacy</span>
              </div>
              <div className="flex items-center space-x-3 group">
                <div className="p-2 rounded-lg bg-white/20 backdrop-blur-sm group-hover:bg-white/30 transition-all">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <span className="text-white/90">Real-time analytics dashboard</span>
              </div>
              <div className="flex items-center space-x-3 group">
                <div className="p-2 rounded-lg bg-white/20 backdrop-blur-sm group-hover:bg-white/30 transition-all">
                  <Brain className="w-5 h-5" />
                </div>
                <span className="text-white/90">AI recommendations and forecasting</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right form card */}
        <div className="flex items-center justify-center p-4 sm:p-8 md:p-10 px-4 sm:px-6 lg:px-8">
          <div className="w-full max-w-md">
            {/* Logo/Icon with animation */}
            <div className="mb-8 text-center">
              <div className="mx-auto h-16 w-16 flex items-center justify-center rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 shadow-xl transform hover:scale-110 transition-transform duration-300 relative">
                <Lock className="h-8 w-8 text-white" />
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 opacity-0 hover:opacity-100 blur-xl transition-opacity"></div>
              </div>
              <h2 className="mt-6 text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
                Sign in to your account
              </h2>
              <p className="mt-3 text-sm text-gray-600">
                Or{' '}
                <Link to="/register" className="font-semibold text-blue-600 hover:text-blue-700 transition-colors">
                  create a new account
                </Link>
              </p>
            </div>

            {/* Demo Account Buttons */}
            <div className="mb-6">
              <div className="flex items-center justify-center mb-3">
                <div className="flex-1 border-t border-gray-200"></div>
                <span className="px-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Try Demo Accounts</span>
                <div className="flex-1 border-t border-gray-200"></div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {demoAccounts.map((account, index) => {
                  const Icon = account.icon;
                  return (
                    <button
                      key={account.role}
                      type="button"
                      onClick={() => handleDemoClick(account.email, account.password)}
                      className={`group relative overflow-hidden rounded-xl p-3 ${account.bgColor} border-2 ${account.borderColor} transition-all duration-300 hover:scale-105 hover:shadow-lg transform`}
                      style={{ animationDelay: `${index * 100}ms` }}
                    >
                      <div className="flex flex-col items-center space-y-1">
                        <div className={`p-2 rounded-lg bg-gradient-to-r ${account.color} shadow-md group-hover:shadow-xl transition-all`}>
                          <Icon className="w-4 h-4 text-white" />
                        </div>
                        <span className={`text-xs font-semibold ${account.textColor}`}>{account.role}</span>
                      </div>
                      <div className={`absolute inset-0 bg-gradient-to-r ${account.color} opacity-0 group-hover:opacity-10 transition-opacity`}></div>
                    </button>
                  );
                })}
              </div>
            </div>

            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="space-y-5">
                <div>
                  <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-2">
                    Email address
                  </label>
                  <div className="relative group">
                    <div className={`absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors ${focusedField === 'email' ? 'text-blue-600' : 'text-gray-400'}`}>
                      <Mail className="h-5 w-5" />
                    </div>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={formData.email}
                      onChange={handleChange}
                      onFocus={() => setFocusedField('email')}
                      onBlur={() => setFocusedField(null)}
                      className="w-full pr-6 py-4 rounded-xl border-2 border-gray-200 bg-white/90 backdrop-blur-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 hover:border-gray-300"
                      style={{ paddingLeft: '24px' }}
                      placeholder="Enter your email"
                    />
                  </div>
                </div>
                
                <div>
                  <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-2">
                    Password
                  </label>
                  <div className="relative group">
                    <div className={`absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors ${focusedField === 'password' ? 'text-blue-600' : 'text-gray-400'}`}>
                      <Lock className="h-5 w-5" />
                    </div>
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={formData.password}
                      onChange={handleChange}
                      onFocus={() => setFocusedField('password')}
                      onBlur={() => setFocusedField(null)}
                      className="w-full pr-16 py-4 rounded-xl border-2 border-gray-200 bg-white/90 backdrop-blur-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 hover:border-gray-300"
                      style={{ paddingLeft: '24px' }}
                      placeholder="Enter your password"
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-blue-600 transition-colors"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff className="h-5 w-5" />
                      ) : (
                        <Eye className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <input
                    id="remember-me"
                    name="remember-me"
                    type="checkbox"
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                  />
                  <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-700 cursor-pointer">
                    Remember me
                  </label>
                </div>

                <div className="text-sm">
                  <Link to="/forgot-password" className="font-medium text-blue-600 hover:text-blue-700 transition-colors">
                    Forgot password?
                  </Link>
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className="group relative w-full flex justify-center items-center py-4 px-4 border border-transparent text-base font-semibold rounded-xl text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  {loading ? (
                    <div className="flex items-center space-x-2">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      <span>Signing in...</span>
                    </div>
                  ) : (
                    <>
                      <span>Sign in</span>
                      <ArrowLeft className="w-5 h-5 ml-2 transform group-hover:translate-x-1 transition-transform rotate-180" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;

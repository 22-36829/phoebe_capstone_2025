import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, User, Mail, Building, ArrowLeft, Shield, Brain, BarChart3 } from 'lucide-react';
import { AuthAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const RegisterPage = () => {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    pharmacyName: '',
    role: 'manager'
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [serverMsg, setServerMsg] = useState('');
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const navigate = useNavigate();
  const { login } = useAuth();

  // Validation constants (matching backend)
  const MAX_EMAIL_LENGTH = 255;
  const MAX_PASSWORD_LENGTH = 128;
  const MIN_PASSWORD_LENGTH = 8;
  const MAX_NAME_LENGTH = 100;
  const MAX_PHARMACY_NAME_LENGTH = 200;
  const MIN_PHARMACY_NAME_LENGTH = 2;

  // Filter invalid characters based on field type
  const filterInput = (value, fieldName) => {
    if (!value) return '';
    
    switch (fieldName) {
      case 'firstName':
      case 'lastName':
        // Only allow letters, spaces, hyphens, and apostrophes
        return value.replace(/[^a-zA-Z\s\-']/g, '');
      
      case 'pharmacyName':
        // Allow letters, numbers, spaces, hyphens, apostrophes, periods, commas, ampersands, parentheses
        return value.replace(/[^a-zA-Z0-9\s\-'.,&()]/g, '');
      
      case 'email':
        // Allow email-valid characters
        return value.replace(/[^a-zA-Z0-9._%+-@]/g, '');
      
      case 'password':
      case 'confirmPassword':
        // Allow all characters for password (will be validated on submit)
        return value;
      
      default:
        return value;
    }
  };

  // Enforce max length
  const enforceMaxLength = (value, maxLength) => {
    if (value.length > maxLength) {
      return value.slice(0, maxLength);
    }
    return value;
  };

  // Validation functions
  const validateField = (name, value, currentPassword = null) => {
    let error = '';
    const passwordToCompare = currentPassword !== null ? currentPassword : formData.password;
    
    switch (name) {
      case 'firstName':
      case 'lastName':
        if (!value || !value.trim()) {
          error = `${name === 'firstName' ? 'First name' : 'Last name'} is required`;
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
      
      case 'pharmacyName':
        if (!value || !value.trim()) {
          error = 'Pharmacy name is required';
        } else if (value.length < MIN_PHARMACY_NAME_LENGTH) {
          error = `Pharmacy name must be at least ${MIN_PHARMACY_NAME_LENGTH} characters`;
        } else if (value.length > MAX_PHARMACY_NAME_LENGTH) {
          error = `Pharmacy name must be no more than ${MAX_PHARMACY_NAME_LENGTH} characters`;
        } else if (!/^[a-zA-Z0-9\s\-'.,&()]+$/.test(value)) {
          error = 'Pharmacy name contains invalid characters';
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
        } else if (value !== passwordToCompare) {
          error = 'Passwords do not match';
        }
        break;
      
      default:
        // No validation needed for unknown fields
        break;
    }
    
    return error;
  };

  const handleBlur = (e) => {
    const { name, value } = e.target;
    setTouched({ ...touched, [name]: true });
    const error = validateField(name, value);
    setErrors({ ...errors, [name]: error });
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    let filteredValue = filterInput(value, name);
    
    // Enforce max length based on field
    switch (name) {
      case 'email':
        filteredValue = enforceMaxLength(filteredValue, MAX_EMAIL_LENGTH);
        break;
      case 'password':
      case 'confirmPassword':
        filteredValue = enforceMaxLength(filteredValue, MAX_PASSWORD_LENGTH);
        break;
      case 'firstName':
      case 'lastName':
        filteredValue = enforceMaxLength(filteredValue, MAX_NAME_LENGTH);
        break;
      case 'pharmacyName':
        filteredValue = enforceMaxLength(filteredValue, MAX_PHARMACY_NAME_LENGTH);
        break;
      
      default:
        // No length enforcement needed for unknown fields
        break;
    }
    
    setFormData({
      ...formData,
      [name]: filteredValue
    });
    
    // Validate on change if field has been touched
    if (touched[name]) {
      const error = validateField(name, filteredValue);
      setErrors({ ...errors, [name]: error });
    }
    
    // If password changes, re-validate confirmPassword if it's been touched
    if (name === 'password' && touched.confirmPassword) {
      const confirmError = validateField('confirmPassword', formData.confirmPassword, filteredValue);
      setErrors({ ...errors, confirmPassword: confirmError });
    }
  };

  // Prevent invalid key presses
  const handleKeyPress = (e, fieldName) => {
    const char = e.key;
    
    switch (fieldName) {
      case 'firstName':
      case 'lastName':
        // Only allow letters, spaces, hyphens, apostrophes, and backspace/delete
        if (!/^[a-zA-Z\s\-']$/.test(char) && !['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight'].includes(char)) {
          e.preventDefault();
        }
        break;
      
      case 'pharmacyName':
        // Allow letters, numbers, spaces, hyphens, apostrophes, periods, commas, ampersands, parentheses
        if (!/^[a-zA-Z0-9\s\-'.,&()]$/.test(char) && !['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight'].includes(char)) {
          e.preventDefault();
        }
        break;
      
      case 'email':
        // Allow email-valid characters
        if (!/^[a-zA-Z0-9._%+-@]$/.test(char) && !['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight'].includes(char)) {
          e.preventDefault();
        }
        break;
      
      default:
        // Allow all characters for unknown fields
        break;
    }
  };

  // Handle paste events to filter invalid characters
  const handlePaste = (e, fieldName) => {
    e.preventDefault();
    const pastedText = (e.clipboardData || window.clipboardData).getData('text');
    const filteredText = filterInput(pastedText, fieldName);
    
    // Enforce max length
    let finalText = filteredText;
    switch (fieldName) {
      case 'email':
        finalText = enforceMaxLength(finalText, MAX_EMAIL_LENGTH);
        break;
      case 'password':
      case 'confirmPassword':
        finalText = enforceMaxLength(finalText, MAX_PASSWORD_LENGTH);
        break;
      case 'firstName':
      case 'lastName':
        finalText = enforceMaxLength(finalText, MAX_NAME_LENGTH);
        break;
      case 'pharmacyName':
        finalText = enforceMaxLength(finalText, MAX_PHARMACY_NAME_LENGTH);
        break;
      
      default:
        // No length enforcement needed for unknown fields
        break;
    }
    
    setFormData({
      ...formData,
      [fieldName]: finalText
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setServerMsg('');

    // Validate all fields
    const newErrors = {};
    Object.keys(formData).forEach(key => {
      if (key !== 'role') {
        const error = validateField(key, formData[key]);
        if (error) {
          newErrors[key] = error;
        }
      }
    });
    
    // Mark all fields as touched
    const allTouched = {};
    Object.keys(formData).forEach(key => {
      if (key !== 'role') {
        allTouched[key] = true;
      }
    });
    setTouched(allTouched);
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setLoading(false);
      return;
    }

    try {
      const payload = {
        email: formData.email,
        password: formData.password,
        confirmPassword: formData.confirmPassword,
        first_name: formData.firstName,
        last_name: formData.lastName,
        pharmacy_name: formData.pharmacyName,
        role: 'manager'
      };
      const res = await AuthAPI.register(payload);
      if (res && res.pending_approval) {
        setSubmitted(true);
        setServerMsg(res.message || 'Signup request submitted. We will notify you once approved.');
        return;
      }
      // Fallback: if backend still returns token
      if (res && res.access_token) {
        login(res);
        navigate('/manager');
      }
    } catch (error) {
      console.error('Registration error:', error);
      setServerMsg(error.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Background accents */}
      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-blue-200/30 blur-3xl"></div>
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-purple-200/30 blur-3xl"></div>

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
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold leading-tight mb-4">
            Create your pharmacy account
          </h1>
          <p className="text-white/80 text-lg mb-10 max-w-md">
            Start your 14-day free trial. No credit card required.
          </p>
            <div className="space-y-4">
              <div className="flex items-center space-x-3 group">
                <div className="p-2 rounded-lg bg-white/20 backdrop-blur-sm group-hover:bg-white/30 transition-all">
                  <Shield className="w-5 h-5" />
                </div>
                <span className="text-white/90">Secure and compliant</span>
              </div>
              <div className="flex items-center space-x-3 group">
                <div className="p-2 rounded-lg bg-white/20 backdrop-blur-sm group-hover:bg-white/30 transition-all">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <span className="text-white/90">Insights and dashboards</span>
              </div>
              <div className="flex items-center space-x-3 group">
                <div className="p-2 rounded-lg bg-white/20 backdrop-blur-sm group-hover:bg-white/30 transition-all">
                  <Brain className="w-5 h-5" />
                </div>
                <span className="text-white/90">AI-powered recommendations</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right form card */}
        <div className="flex items-center justify-center p-4 sm:p-8 md:p-10 px-4 sm:px-6 lg:px-8">
          <div className="w-full max-w-md md:max-w-md">
            <div className="mb-8 text-center">
              <div className="mx-auto h-12 w-12 flex items-center justify-center rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 shadow-lg">
                <User className="h-6 w-6 text-white" />
              </div>
              <h2 className="mt-6 text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
                Create your pharmacy account
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                Or{' '}
                <Link to="/login" className="font-semibold text-blue-600 hover:text-blue-700">
                  sign in to existing account
                </Link>
              </p>
            </div>

            <form className="space-y-6" onSubmit={handleSubmit}>
              {submitted && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-800 px-4 py-3 text-sm">
                  <p className="font-semibold">Request submitted</p>
                  <p className="mt-1">{serverMsg}</p>
                </div>
              )}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="firstName" className="block text-sm font-medium text-gray-700">
                      First Name
                    </label>
                    <div className="mt-1 relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <User className="h-5 w-5 text-gray-400" />
                      </div>
                      <input
                        id="firstName"
                        name="firstName"
                        type="text"
                        required
                        value={formData.firstName}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        onKeyPress={(e) => handleKeyPress(e, 'firstName')}
                        onPaste={(e) => handlePaste(e, 'firstName')}
                        maxLength={MAX_NAME_LENGTH}
                        pattern="[a-zA-Z\s\-']+"
                        className={`input-field pl-10 bg-white/80 backdrop-blur-sm py-3.5 ${errors.firstName && touched.firstName ? 'border-red-500' : ''}`}
                        placeholder="First name"
                      />
                    </div>
                    {errors.firstName && touched.firstName && (
                      <p className="mt-1 text-sm text-red-600">{errors.firstName}</p>
                    )}
                  </div>
                  
                  <div>
                    <label htmlFor="lastName" className="block text-sm font-medium text-gray-700">
                      Last Name
                    </label>
                    <input
                      id="lastName"
                      name="lastName"
                      type="text"
                      required
                      value={formData.lastName}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      onKeyPress={(e) => handleKeyPress(e, 'lastName')}
                      onPaste={(e) => handlePaste(e, 'lastName')}
                      maxLength={MAX_NAME_LENGTH}
                      pattern="[a-zA-Z\s\-']+"
                      className={`input-field bg-white/80 backdrop-blur-sm py-3.5 ${errors.lastName && touched.lastName ? 'border-red-500' : ''}`}
                      placeholder="Last name"
                    />
                    {errors.lastName && touched.lastName && (
                      <p className="mt-1 text-sm text-red-600">{errors.lastName}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                    Email address
                  </label>
                  <div className="mt-1 relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Mail className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={formData.email}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      onKeyPress={(e) => handleKeyPress(e, 'email')}
                      onPaste={(e) => handlePaste(e, 'email')}
                      maxLength={MAX_EMAIL_LENGTH}
                      pattern="[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"
                      className={`input-field pl-10 bg-white/80 backdrop-blur-sm py-3.5 ${errors.email && touched.email ? 'border-red-500' : ''}`}
                      placeholder="Enter your email"
                    />
                  </div>
                  {errors.email && touched.email && (
                    <p className="mt-1 text-sm text-red-600">{errors.email}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="pharmacyName" className="block text-sm font-medium text-gray-700">
                    Pharmacy Name
                  </label>
                  <div className="mt-1 relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Building className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      id="pharmacyName"
                      name="pharmacyName"
                      type="text"
                      required
                      value={formData.pharmacyName}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      onKeyPress={(e) => handleKeyPress(e, 'pharmacyName')}
                      onPaste={(e) => handlePaste(e, 'pharmacyName')}
                      minLength={MIN_PHARMACY_NAME_LENGTH}
                      maxLength={MAX_PHARMACY_NAME_LENGTH}
                      pattern="[a-zA-Z0-9\s\-'.,&()]+"
                      className={`input-field pl-10 bg-white/80 backdrop-blur-sm py-3.5 ${errors.pharmacyName && touched.pharmacyName ? 'border-red-500' : ''}`}
                      placeholder="Your pharmacy name"
                    />
                  </div>
                  {errors.pharmacyName && touched.pharmacyName ? (
                    <p className="mt-1 text-sm text-red-600">{errors.pharmacyName}</p>
                  ) : (
                    <p className="mt-2 text-xs text-gray-500">We'll create your pharmacy and start a 14-day Free Trial.</p>
                  )}
                </div>

                {/* Role is auto-set to manager. Admin accounts cannot be self-registered. */}
                
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                    Password
                  </label>
                  <div className="mt-1 relative">
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      value={formData.password}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      minLength={MIN_PASSWORD_LENGTH}
                      maxLength={MAX_PASSWORD_LENGTH}
                      className={`input-field pr-10 bg-white/80 backdrop-blur-sm py-3.5 ${errors.password && touched.password ? 'border-red-500' : ''}`}
                      placeholder="Create a password"
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff className="h-5 w-5 text-gray-400" />
                      ) : (
                        <Eye className="h-5 w-5 text-gray-400" />
                      )}
                    </button>
                  </div>
                  {errors.password && touched.password && (
                    <p className="mt-1 text-sm text-red-600">{errors.password}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                    Confirm Password
                  </label>
                  <div className="mt-1 relative">
                    <input
                      id="confirmPassword"
                      name="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      minLength={MIN_PASSWORD_LENGTH}
                      maxLength={MAX_PASSWORD_LENGTH}
                      className={`input-field pr-10 bg-white/80 backdrop-blur-sm py-3.5 ${errors.confirmPassword && touched.confirmPassword ? 'border-red-500' : ''}`}
                      placeholder="Confirm your password"
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-5 w-5 text-gray-400" />
                      ) : (
                        <Eye className="h-5 w-5 text-gray-400" />
                      )}
                    </button>
                  </div>
                  {errors.confirmPassword && touched.confirmPassword && (
                    <p className="mt-1 text-sm text-red-600">{errors.confirmPassword}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center">
                <input
                  id="terms"
                  name="terms"
                  type="checkbox"
                  required
                  className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                />
                <label htmlFor="terms" className="ml-2 block text-sm text-gray-900">
                  I agree to the{' '}
                  <Link to="/terms" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:text-primary-500 underline font-medium">
                    Terms of Service
                  </Link>{' '}
                  and{' '}
                  <Link to="/privacy" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:text-primary-500 underline font-medium">
                    Privacy Policy
                  </Link>
                </label>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={loading || submitted}
                  className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-semibold rounded-lg text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {loading ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  ) : (
                    submitted ? 'Request Submitted' : 'Create your pharmacy account'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;

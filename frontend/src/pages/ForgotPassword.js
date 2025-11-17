import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Mail, CheckCircle, AlertCircle } from 'lucide-react';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [resetToken, setResetToken] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to process request');
      }

      setSuccess(true);
      if (data.reset_token) {
        setResetToken(data.reset_token);
      }
    } catch (err) {
      setError(err.message || 'An error occurred. Please try again.');
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
        {/* Left panel */}
        <div className="hidden md:flex flex-col justify-center p-8 md:p-12 lg:p-16 bg-gradient-to-br from-blue-600 to-purple-700 text-white relative overflow-hidden">
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 left-0 w-64 h-64 bg-white rounded-full blur-3xl"></div>
            <div className="absolute bottom-0 right-0 w-96 h-96 bg-white rounded-full blur-3xl"></div>
          </div>
          
          <div className="relative z-10">
            <Link to="/login" className="inline-flex items-center text-white/90 hover:text-white mb-8 transition-all hover:translate-x-1 group">
              <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
              Back to Login
            </Link>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold leading-tight mb-4">
              Reset your password
            </h1>
            <p className="text-white/80 text-lg mb-10 max-w-md leading-relaxed">
              Enter your email address and we'll help you reset your password.
            </p>
          </div>
        </div>

        {/* Right form card */}
        <div className="flex items-center justify-center p-4 sm:p-8 md:p-10 px-4 sm:px-6 lg:px-8">
          <div className="w-full max-w-md">
            <div className="mb-8 text-center">
              <div className="mx-auto h-16 w-16 flex items-center justify-center rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 shadow-xl">
                <Mail className="h-8 w-8 text-white" />
              </div>
              <h2 className="mt-6 text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
                Forgot Password?
              </h2>
              <p className="mt-3 text-sm text-gray-600">
                Enter your email address and we'll send you a reset link
              </p>
            </div>

            {success ? (
              <div className="bg-white rounded-2xl shadow-lg p-8 space-y-6">
                <div className="flex items-center justify-center">
                  <div className="p-3 rounded-full bg-green-100">
                    <CheckCircle className="w-8 h-8 text-green-600" />
                  </div>
                </div>
                <div className="text-center">
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Reset Link Sent!</h3>
                  <p className="text-gray-600 mb-4">
                    We've sent password reset instructions to <strong>{email}</strong>
                  </p>
                  {resetToken && (
                    <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                      <p className="text-sm text-gray-700 mb-2 font-semibold">Your Reset Token:</p>
                      <p className="text-xs font-mono bg-white p-2 rounded border break-all">{resetToken}</p>
                      <p className="text-xs text-gray-600 mt-2">
                        Use this token to reset your password. This token will expire in 1 hour.
                      </p>
                    </div>
                  )}
                  <div className="mt-6 space-y-3">
                    <Link
                      to={`/reset-password?token=${resetToken || ''}`}
                      className="block w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-xl hover:shadow-lg transition-all text-center"
                    >
                      Reset Password Now
                    </Link>
                    <Link
                      to="/login"
                      className="block w-full px-6 py-3 bg-white text-gray-700 font-semibold rounded-xl border-2 border-gray-300 hover:border-gray-400 transition-all text-center"
                    >
                      Back to Login
                    </Link>
                  </div>
                </div>
              </div>
            ) : (
              <form className="bg-white rounded-2xl shadow-lg p-8 space-y-6" onSubmit={handleSubmit}>
                {error && (
                  <div className="flex items-center space-x-2 p-4 bg-red-50 border border-red-200 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                )}

                <div>
                  <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-2">
                    Email address
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Mail className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-12 pr-4 py-4 rounded-xl border-2 border-gray-200 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                      placeholder="Enter your email"
                    />
                  </div>
                </div>

                <div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex justify-center items-center py-4 px-4 border border-transparent text-base font-semibold rounded-xl text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300"
                  >
                    {loading ? (
                      <div className="flex items-center space-x-2">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        <span>Sending...</span>
                      </div>
                    ) : (
                      'Send Reset Link'
                    )}
                  </button>
                </div>

                <div className="text-center">
                  <Link
                    to="/login"
                    className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    Back to Login
                  </Link>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;


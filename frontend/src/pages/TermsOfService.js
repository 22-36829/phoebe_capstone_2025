import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';

const TermsOfService = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="mb-8">
          <Link 
            to="/register" 
            className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-6 transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
            Back to Registration
          </Link>
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-3 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 shadow-lg">
              <FileText className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900">
              Terms of Service
            </h1>
          </div>
          <p className="text-gray-600">Last updated: January 2025</p>
        </div>

        {/* Content */}
        <div className="bg-white rounded-2xl shadow-lg p-8 sm:p-10 space-y-8">
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">1. Agreement to Terms</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              By accessing or using Phoebe Drugstore ("the Service"), you agree to be bound by these Terms of Service. 
              If you disagree with any part of these terms, you may not access the Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">2. Description of Service</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Phoebe Drugstore is a comprehensive pharmacy management system that provides:
            </p>
            <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
              <li>Point of Sale (POS) functionality for pharmacy transactions</li>
              <li>Inventory management with real-time tracking</li>
              <li>Forecasting and demand prediction capabilities</li>
              <li>Expiry date tracking and waste management</li>
              <li>Staff and account management features</li>
              <li>AI-powered recommendations and insights</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">3. User Accounts</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              To use the Service, you must:
            </p>
            <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
              <li>Provide accurate, current, and complete information during registration</li>
              <li>Maintain and update your account information to keep it accurate</li>
              <li>Maintain the security of your password and account</li>
              <li>Accept responsibility for all activities under your account</li>
              <li>Notify us immediately of any unauthorized use of your account</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">4. Subscription Plans</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              The Service offers various subscription plans with different features and pricing:
            </p>
            <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
              <li><strong>Free Trial:</strong> 14-day trial period with limited features</li>
              <li><strong>Basic Plan:</strong> Monthly, quarterly, semi-annual, and annual billing options</li>
              <li><strong>Premium Plan:</strong> Enhanced features with advanced analytics</li>
              <li><strong>Enterprise Plan:</strong> Full feature access with priority support</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mt-4">
              Subscription fees are billed in advance and are non-refundable except as required by law. 
              You may cancel your subscription at any time, but you will continue to have access until the end of your billing period.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">5. Acceptable Use</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              You agree not to:
            </p>
            <ul className="list-disc list-inside text-gray-700 space-y-2 ml-4">
              <li>Use the Service for any illegal purpose or in violation of any laws</li>
              <li>Violate any intellectual property rights of Phoebe Drugstore or third parties</li>
              <li>Transmit any viruses, malware, or harmful code</li>
              <li>Attempt to gain unauthorized access to the Service or related systems</li>
              <li>Interfere with or disrupt the Service or servers</li>
              <li>Use automated systems to access the Service without permission</li>
              <li>Share your account credentials with unauthorized parties</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">6. Data and Privacy</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              Your use of the Service is also governed by our Privacy Policy. We take data security seriously 
              and implement industry-standard measures to protect your information. However, you are responsible 
              for maintaining the confidentiality of your account credentials.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">7. Intellectual Property</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              The Service and its original content, features, and functionality are owned by Phoebe Drugstore 
              and are protected by international copyright, trademark, patent, trade secret, and other intellectual 
              property laws. You may not copy, modify, distribute, sell, or lease any part of the Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">8. Termination</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              We may terminate or suspend your account and access to the Service immediately, without prior notice, 
              for any reason, including breach of these Terms. Upon termination, your right to use the Service will 
              cease immediately.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">9. Disclaimer of Warranties</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              The Service is provided "as is" and "as available" without warranties of any kind, either express 
              or implied. We do not warrant that the Service will be uninterrupted, secure, or error-free.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">10. Limitation of Liability</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              To the maximum extent permitted by law, Phoebe Drugstore shall not be liable for any indirect, 
              incidental, special, consequential, or punitive damages resulting from your use or inability to 
              use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">11. Changes to Terms</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              We reserve the right to modify these Terms at any time. We will notify users of any material 
              changes via email or through the Service. Your continued use of the Service after such changes 
              constitutes acceptance of the new Terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">12. Contact Information</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              If you have any questions about these Terms of Service, please contact us at:
            </p>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-gray-700">
                <strong>Email:</strong> support@phoebedrugstore.com<br />
                <strong>Website:</strong> www.phoebedrugstore.com
              </p>
            </div>
          </section>
        </div>

        {/* Footer Actions */}
        <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            to="/register"
            className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-xl hover:shadow-lg transition-all transform hover:-translate-y-0.5 text-center"
          >
            Return to Registration
          </Link>
          <Link
            to="/"
            className="px-6 py-3 bg-white text-gray-700 font-semibold rounded-xl border-2 border-gray-300 hover:border-gray-400 transition-all text-center"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
};

export default TermsOfService;


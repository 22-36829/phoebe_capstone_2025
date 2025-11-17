import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  BarChart3, 
  Brain, 
  Shield, 
  Users, 
  TrendingUp, 
  Clock,
  CheckCircle,
  ArrowRight,
  Star,
  Globe,
  Sparkles,
  Award,
  Heart,
  Smartphone,
  Monitor,
  Cloud,
  Lock,
  Zap as Lightning,
  ChevronLeft,
  ChevronRight,
  Pill,
  Activity,
  Package
} from 'lucide-react';

// Default pricing plans (fallback if API fails) - moved outside component to avoid dependency issues
const defaultPricingPlans = [
  {
    name: "Basic",
    price: "₱2,999.00",
    period: "per month",
    description: "Perfect for small pharmacies",
    features: [
      "Unlimited products",
      "Pharmacy POS & Inventory",
      "Real-time stock tracking",
      "Sales reports & analytics",
      "Batch & expiry tracking",
      "Email support",
      "Mobile-ready interface"
    ],
    popular: false,
    cta: "Create pharmacy account"
  },
  {
    name: "Premium",
    price: "₱4,999.00",
    period: "per month",
    description: "Most popular for growing pharmacies",
    features: [
      "Everything in Basic",
      "AI-powered product recommendations",
      "Demand forecasting (SARIMAX)",
      "Advanced analytics dashboard",
      "Expiry & waste analytics",
      "Multi-role access (Admin, Manager, Staff)",
      "Priority support",
      "API access"
    ],
    popular: true,
    cta: "Create pharmacy account"
  },
  {
    name: "Enterprise",
    price: "₱7,999.00",
    period: "per month",
    description: "For large pharmacy chains",
    features: [
      "Everything in Premium",
      "Advanced ML models",
      "Custom integrations",
      "Dedicated account manager",
      "Custom training sessions",
      "White-label options",
      "24/7 priority support",
      "Custom reporting"
    ],
    popular: false,
    cta: "Contact Sales"
  }
];

const LandingPage = () => {
  const [email, setEmail] = useState('');
  const [demoOpen, setDemoOpen] = useState(false);
  const [subscribeMsg, setSubscribeMsg] = useState('');
  const [currentSlide, setCurrentSlide] = useState(0);
  const [pricingPlans, setPricingPlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(true);

  // Medicine-only background images for slideshow - Using Pexels images
  const pharmacySlides = [
    {
      image: 'https://images.pexels.com/photos/208512/pexels-photo-208512.jpeg?auto=compress&cs=tinysrgb&w=1920', // 20 mg label blister pack
      overlay: 'rgba(79, 70, 229, 0.75)'
    },
    {
      image: 'https://images.pexels.com/photos/3652097/pexels-photo-3652097.jpeg?auto=compress&cs=tinysrgb&w=1920', // White and blue medication pills
      overlay: 'rgba(30, 64, 175, 0.75)'
    },
    {
      image: 'https://images.pexels.com/photos/3652103/pexels-photo-3652103.jpeg?auto=compress&cs=tinysrgb&w=1920', // Close-up photo of pills
      overlay: 'rgba(55, 48, 163, 0.75)'
    },
    {
      image: 'https://images.pexels.com/photos/5910953/pexels-photo-5910953.jpeg?auto=compress&cs=tinysrgb&w=1920', // Woman with face mask holding an alcohol bottle
      overlay: 'rgba(30, 58, 138, 0.75)'
    },
    {
      image: 'https://images.pexels.com/photos/5910956/pexels-photo-5910956.jpeg?auto=compress&cs=tinysrgb&w=1920', // Woman in black shirt holding a hand sanitizer bottle
      overlay: 'rgba(79, 70, 229, 0.75)'
    },
    {
      image: 'https://images.pexels.com/photos/4021811/pexels-photo-4021811.jpeg?auto=compress&cs=tinysrgb&w=1920', // Faceless doctor with pills in hands
      overlay: 'rgba(30, 64, 175, 0.75)'
    },
    {
      image: 'https://images.pexels.com/photos/7605733/pexels-photo-7605733.jpeg?auto=compress&cs=tinysrgb&w=1920', // Assorted pills in top view
      overlay: 'rgba(55, 48, 163, 0.75)'
    },
    {
      image: 'https://images.pexels.com/photos/5407208/pexels-photo-5407208.jpeg?auto=compress&cs=tinysrgb&w=1920', // A doctor writing on a notebook
      overlay: 'rgba(30, 58, 138, 0.75)'
    }
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % pharmacySlides.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [pharmacySlides.length]);

  // Fetch pricing plans from database
  useEffect(() => {
    const fetchPricingPlans = async () => {
      try {
        const response = await fetch('/api/public/subscription-plans');
        const data = await response.json();
        
        if (data.success && data.plans) {
          // Map database plans to frontend format with accurate features
          const mappedPlans = data.plans
            .filter(plan => plan.plan_name !== 'Free Trial') // Exclude free trial from pricing display
            .map((plan) => {
              const planName = plan.plan_name;
              const monthlyPrice = parseFloat(plan.monthly_price || 0);
              
              // Format price in Philippine Peso
              const formatPrice = (price) => {
                return `₱${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
              };

              // Define features based on plan tier
              let features = [];
              let description = '';
              let popular = false;
              
              if (planName === 'Basic') {
                description = 'Perfect for small pharmacies';
                features = [
                  'Unlimited products',
                  'Pharmacy POS & Inventory',
                  'Real-time stock tracking',
                  'Sales reports & analytics',
                  'Batch & expiry tracking',
                  'Email support',
                  'Mobile-ready interface'
                ];
                popular = false;
              } else if (planName === 'Premium') {
                description = 'Most popular for growing pharmacies';
                features = [
                  'Everything in Basic',
                  'AI-powered product recommendations',
                  'Demand forecasting',
                  'Advanced analytics dashboard',
                  'Expiry & waste analytics',
                  'Multi-role access',
                  'Priority support',
                  'API access'
                ];
                popular = true;
              } else if (planName === 'Enterprise') {
                description = 'For large pharmacy chains';
                features = [
                  'Everything in Premium',
                  'Advanced ML models',
                  'Custom integrations',
                  'Dedicated account manager',
                  'Custom training sessions',
                  'White-label options',
                  '24/7 priority support',
                  'Custom reporting'
                ];
                popular = false;
              }

              return {
                name: planName,
                price: formatPrice(monthlyPrice),
                period: 'per month',
                description: description,
                features: features,
                popular: popular,
                cta: planName === 'Enterprise' ? 'Contact Sales' : 'Create pharmacy account'
              };
            });
          
          setPricingPlans(mappedPlans);
        } else {
          // Fallback to default plans if API fails
          setPricingPlans(defaultPricingPlans);
        }
      } catch (error) {
        console.error('Error fetching pricing plans:', error);
        // Fallback to default plans on error
        setPricingPlans(defaultPricingPlans);
      } finally {
        setLoadingPlans(false);
      }
    };

    fetchPricingPlans();
  }, []);

  const handleSubscribe = async (e) => {
    e.preventDefault();
    setSubscribeMsg('');
    try {
      // Optional: send to backend if available; fallback to local success
      await fetch('/api/public/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      }).catch(() => {});
      setSubscribeMsg('Subscribed! We\'ll keep you posted.');
      setEmail('');
    } catch {
      setSubscribeMsg('Subscription failed. Please try again later.');
    }
  };

  const scrollToId = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const features = [
    {
      icon: <BarChart3 className="w-10 h-10 text-white" />,
      title: "Pharmacy POS & Inventory",
      description: "POS, real-time stock, reorder points, and pharmacy dashboards.",
      gradient: "from-blue-500 to-blue-600"
    },
    {
      icon: <Brain className="w-10 h-10 text-white" />,
      title: "AI-Powered Recommendations",
      description: "Smart suggestions and benefits guidance.",
      gradient: "from-purple-500 to-purple-600"
    },
    {
      icon: <TrendingUp className="w-10 h-10 text-white" />,
      title: "Demand Forecasting",
      description: "Forecast demand to plan orders, reduce stockouts, and cut overstock.",
      gradient: "from-green-500 to-green-600"
    },
    {
      icon: <Shield className="w-10 h-10 text-white" />,
      title: "Expiry & Waste Analytics",
      description: "Expiry insights and sustainability overview.",
      gradient: "from-orange-500 to-orange-600"
    },
    {
      icon: <Users className="w-10 h-10 text-white" />,
      title: "Multi-Role Access",
      description: "Secure roles for your pharmacy team.",
      gradient: "from-indigo-500 to-indigo-600"
    },
    {
      icon: <Clock className="w-10 h-10 text-white" />,
      title: "Expiry Tracking",
      description: "Track expiries, and get records all in one before items go to waste.",
      gradient: "from-pink-500 to-pink-600"
    }
  ];

  const stats = [
    { number: "500+", label: "Pharmacies Trust Us" },
    { number: "99.9%", label: "Uptime Guarantee" },
    { number: "24/7", label: "Customer Support" },
    { number: "₱2M+", label: "Saved Monthly" }
  ];

  return (
    <div className="min-h-screen relative" style={{
      background: '#f8fafc',
    }}>
      {/* Enhanced Pattern Background for Main Container - Rich Design Not Plain */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.06]" style={{
        backgroundImage: `linear-gradient(rgba(59, 130, 246, 0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(59, 130, 246, 0.2) 1px, transparent 1px)`,
        backgroundSize: '40px 40px',
        zIndex: 0,
      }}></div>
      <div className="fixed inset-0 pointer-events-none opacity-[0.04]" style={{
        backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 35px, rgba(79, 70, 229, 0.1) 35px, rgba(79, 70, 229, 0.1) 70px)`,
        zIndex: 0,
      }}></div>
      <div className="fixed inset-0 pointer-events-none opacity-[0.03]" style={{
        backgroundImage: `radial-gradient(circle at 2px 2px, rgba(59, 130, 246, 0.15) 1px, transparent 0), radial-gradient(circle at 30px 30px, rgba(139, 92, 246, 0.1) 1px, transparent 0)`,
        backgroundSize: '60px 60px',
        zIndex: 0,
      }}></div>
      <div className="fixed inset-0 pointer-events-none opacity-[0.025]" style={{
        background: `linear-gradient(135deg, rgba(147, 197, 253, 0.08) 0%, transparent 30%, rgba(196, 181, 253, 0.08) 70%, transparent 100%)`,
        zIndex: 0,
      }}></div>
      <div className="fixed inset-0 pointer-events-none opacity-[0.02]" style={{
        backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(59, 130, 246, 0.05) 2px, rgba(59, 130, 246, 0.05) 4px), repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(79, 70, 229, 0.05) 2px, rgba(79, 70, 229, 0.05) 4px)`,
        backgroundSize: '20px 20px',
        zIndex: 0,
      }}></div>
      <div className="fixed inset-0 pointer-events-none opacity-[0.015]" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3Cpattern id='cross' x='0' y='0' width='20' height='20' patternUnits='userSpaceOnUse'%3E%3Cpath d='M 10 0 L 10 20 M 0 10 L 20 10' stroke='%233b82f6' stroke-width='0.5' opacity='0.1'/%3E%3C/pattern%3E%3C/defs%3E%3Crect width='100' height='100' fill='url(%23cross)'/%3E%3C/svg%3E")`,
        zIndex: 0,
      }}></div>
      <div className="relative z-10">
      {/* Demo Modal */}
      {demoOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Product Demo</h3>
              <button onClick={() => setDemoOpen(false)} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>
            <div className="aspect-video w-full bg-black">
              <iframe
                title="Phoebe Demo"
                width="100%"
                height="100%"
                src="https://www.youtube.com/embed/dQw4w9WgXcQ"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full"
              />
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end">
              <button onClick={() => setDemoOpen(false)} className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium">Close</button>
            </div>
          </div>
        </div>
      )}
      {/* Header - Enhanced Outstanding Design */}
      <header className="sticky top-0 z-50 backdrop-blur-xl border-b" style={{
        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.98) 50%, rgba(255, 255, 255, 0.95) 100%)',
        borderColor: 'rgba(59, 130, 246, 0.2)',
        boxShadow: '0 4px 20px rgba(59, 130, 246, 0.08), 0 1px 3px rgba(0, 0, 0, 0.05)',
      }}>
        {/* Subtle Pattern Overlay */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{
          backgroundImage: `linear-gradient(rgba(59, 130, 246, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(59, 130, 246, 0.1) 1px, transparent 1px)`,
          backgroundSize: '20px 20px',
        }}></div>
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between items-center py-4 sm:py-5 gap-4">
            {/* Logo Section - Enhanced */}
            <Link to="/" className="flex items-center group">
              <div className="flex-shrink-0 flex items-center">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-xl blur-md opacity-40 group-hover:opacity-60 transition-opacity duration-300"></div>
                  <div className="relative w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-xl flex items-center justify-center mr-3 shadow-lg shadow-purple-500/30 group-hover:shadow-xl group-hover:shadow-purple-500/40 group-hover:scale-105 transition-all duration-300">
                    <Heart className="w-5 h-5 sm:w-6 sm:h-6 text-white drop-shadow-sm" />
                  </div>
                </div>
                <div className="flex flex-col">
                  <h1 className="text-xl sm:text-2xl font-extrabold bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent group-hover:from-indigo-700 group-hover:via-purple-700 group-hover:to-pink-700 transition-all duration-300">
                    Phoebe Drugstore
                  </h1>
                  <p className="text-xs text-gray-500 font-medium hidden sm:block">Pharmacy Management</p>
                </div>
              </div>
            </Link>
            
            {/* Navigation Buttons - Enhanced */}
            <div className="flex items-center space-x-3 sm:space-x-4 w-full sm:w-auto justify-center sm:justify-end">
              <Link 
                to="/login" 
                className="relative px-5 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base font-semibold text-gray-700 hover:text-indigo-600 transition-all duration-300 whitespace-nowrap rounded-lg hover:bg-gradient-to-r hover:from-indigo-50 hover:to-purple-50 group"
              >
                <span className="relative z-10 flex items-center">
                  Sign In
                  <ArrowRight className="w-4 h-4 ml-1.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-300" />
                </span>
                <div className="absolute inset-0 rounded-lg bg-gradient-to-r from-indigo-50 via-purple-50 to-pink-50 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              </Link>
              <Link 
                to="/register" 
                className="relative group overflow-hidden bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 hover:from-indigo-600 hover:via-purple-600 hover:to-pink-600 text-white font-semibold py-2.5 sm:py-3 px-5 sm:px-7 rounded-xl transition-all duration-300 shadow-lg shadow-purple-500/30 hover:shadow-2xl hover:shadow-purple-500/40 transform hover:-translate-y-0.5 text-sm sm:text-base whitespace-nowrap"
              >
                <span className="relative z-10 flex items-center">
                  Create your pharmacy account
                  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform duration-300" />
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/25 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section with Slideshow Background */}
      <section id="hero" className="relative min-h-[90vh] overflow-hidden">
        {/* Slideshow Background */}
        <div className="absolute inset-0">
          {pharmacySlides.map((slide, index) => (
            <div
              key={index}
              className={`absolute inset-0 transition-opacity duration-1000 ${
                index === currentSlide ? 'opacity-100' : 'opacity-0'
              }`}
              style={{
                backgroundImage: `url(${slide.image})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat'
              }}
            >
              <div 
                className="absolute inset-0"
                style={{ backgroundColor: slide.overlay }}
              ></div>
            </div>
          ))}
        </div>

        {/* Pattern Overlay for Pharmacy Theme */}
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 35px, rgba(255,255,255,.1) 35px, rgba(255,255,255,.1) 70px)`,
        }}></div>

        {/* Pharmacy Icons Pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-20 left-10">
            <Pill className="w-32 h-32 text-white" />
          </div>
          <div className="absolute top-40 right-20">
            <Activity className="w-24 h-24 text-white" />
          </div>
          <div className="absolute bottom-32 left-1/4">
            <Package className="w-28 h-28 text-white" />
          </div>
          <div className="absolute bottom-20 right-1/3">
            <Pill className="w-36 h-36 text-white" />
          </div>
        </div>

        {/* Slideshow Navigation */}
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-20 flex gap-2">
          {pharmacySlides.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentSlide(index)}
              className={`h-2 rounded-full transition-all duration-300 ${
                index === currentSlide ? 'w-8 bg-white' : 'w-2 bg-white/50'
              }`}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>

        {/* Slide Navigation Arrows */}
        <button
          onClick={() => setCurrentSlide((prev) => (prev - 1 + pharmacySlides.length) % pharmacySlides.length)}
          className="absolute left-4 top-1/2 transform -translate-y-1/2 z-20 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-full p-3 transition-all duration-300"
          aria-label="Previous slide"
        >
          <ChevronLeft className="w-6 h-6 text-white" />
        </button>
        <button
          onClick={() => setCurrentSlide((prev) => (prev + 1) % pharmacySlides.length)}
          className="absolute right-4 top-1/2 transform -translate-y-1/2 z-20 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-full p-3 transition-all duration-300"
          aria-label="Next slide"
        >
          <ChevronRight className="w-6 h-6 text-white" />
        </button>
        
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 min-h-[90vh] flex items-center">
          <div className="text-center w-full">
            <div className="inline-flex items-center px-4 py-2 rounded-full bg-white/90 backdrop-blur-sm text-blue-800 text-sm font-medium mb-8 whitespace-nowrap shadow-lg">
              <Sparkles className="w-4 h-4 mr-2 flex-shrink-0" />
              Trusted by 500+ Pharmacies Nationwide
            </div>
            
            <h1 className="text-5xl md:text-7xl font-bold mb-8 leading-tight">
              <span className="text-white drop-shadow-2xl">
                All‑in‑one Pharmacy POS & Inventory
              </span>
              <br />
              <span className="text-white drop-shadow-lg">with Forecasting and Expiry Tracking</span>
            </h1>
            
            <p className="text-xl md:text-2xl mb-12 text-white/95 max-w-4xl mx-auto leading-relaxed drop-shadow-lg">
              Streamline sales, control inventory, forecast demand, and track expiries—built for
              pharmacies with role-based access, dashboards, and smart ordering.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-6 justify-center mb-16">
              <Link 
                to="/register" 
                className="group bg-white hover:bg-gray-50 text-blue-600 font-semibold py-4 px-8 rounded-xl transition-all duration-300 shadow-2xl hover:shadow-3xl transform hover:-translate-y-1 flex items-center justify-center"
              >
                <span>Create your pharmacy account</span>
                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </Link>
              <button onClick={() => setDemoOpen(true)} className="group border-2 border-white/80 hover:border-white text-white hover:bg-white/10 font-semibold py-4 px-8 rounded-xl transition-all duration-300 backdrop-blur-sm flex items-center justify-center">
                <Monitor className="w-5 h-5 mr-2" />
                Watch Demo
              </button>
            </div>

            {/* Trust Indicators */}
            <div className="flex flex-wrap justify-center items-center gap-8 text-white/90 text-sm">
              <div className="flex items-center whitespace-nowrap bg-white/10 backdrop-blur-sm px-4 py-2 rounded-lg">
                <Lock className="w-4 h-4 mr-2 flex-shrink-0" />
                <span>Bank-level Security</span>
              </div>
              <div className="flex items-center whitespace-nowrap bg-white/10 backdrop-blur-sm px-4 py-2 rounded-lg">
                <Cloud className="w-4 h-4 mr-2 flex-shrink-0" />
                <span>Cloud-based</span>
              </div>
              <div className="flex items-center whitespace-nowrap bg-white/10 backdrop-blur-sm px-4 py-2 rounded-lg">
                <Smartphone className="w-4 h-4 mr-2 flex-shrink-0" />
                <span>Mobile Ready</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section id="stats" className="py-20 relative overflow-hidden" style={{
        background: '#f8fafc',
      }}>
        {/* Enhanced Pattern Background - Rich Design Not Plain */}
        <div className="absolute inset-0 opacity-[0.06]" style={{
          backgroundImage: `linear-gradient(rgba(59, 130, 246, 0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(59, 130, 246, 0.2) 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }}></div>
        <div className="absolute inset-0 opacity-[0.04]" style={{
          backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 35px, rgba(79, 70, 229, 0.1) 35px, rgba(79, 70, 229, 0.1) 70px)`,
        }}></div>
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `radial-gradient(circle at 2px 2px, rgba(59, 130, 246, 0.15) 1px, transparent 0), radial-gradient(circle at 30px 30px, rgba(139, 92, 246, 0.1) 1px, transparent 0)`,
          backgroundSize: '60px 60px',
        }}></div>
        <div className="absolute inset-0 opacity-[0.025]" style={{
          background: `linear-gradient(135deg, rgba(147, 197, 253, 0.08) 0%, transparent 30%, rgba(196, 181, 253, 0.08) 70%, transparent 100%)`,
        }}></div>
        <div className="absolute inset-0 opacity-[0.02]" style={{
          backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(59, 130, 246, 0.05) 2px, rgba(59, 130, 246, 0.05) 4px), repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(79, 70, 229, 0.05) 2px, rgba(79, 70, 229, 0.05) 4px)`,
          backgroundSize: '20px 20px',
        }}></div>
        <div className="absolute inset-0 opacity-[0.015]" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3Cpattern id='cross' x='0' y='0' width='20' height='20' patternUnits='userSpaceOnUse'%3E%3Cpath d='M 10 0 L 10 20 M 0 10 L 20 10' stroke='%233b82f6' stroke-width='0.5' opacity='0.1'/%3E%3C/pattern%3E%3C/defs%3E%3Crect width='100' height='100' fill='url(%23cross)'/%3E%3C/svg%3E")`,
        }}></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <div key={index} className="text-center group bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-md hover:shadow-xl transition-all duration-300 border border-blue-100">
                <div className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-3 group-hover:scale-110 transition-transform duration-300">
                  {stat.number}
                </div>
                <div className="text-gray-700 font-medium">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 relative overflow-hidden" style={{
        background: '#f8fafc',
      }}>
        {/* Enhanced Pattern Background - Rich Design Not Plain */}
        <div className="absolute inset-0 opacity-[0.06]" style={{
          backgroundImage: `linear-gradient(rgba(59, 130, 246, 0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(59, 130, 246, 0.2) 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }}></div>
        <div className="absolute inset-0 opacity-[0.04]" style={{
          backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 35px, rgba(79, 70, 229, 0.1) 35px, rgba(79, 70, 229, 0.1) 70px)`,
        }}></div>
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `radial-gradient(circle at 2px 2px, rgba(59, 130, 246, 0.15) 1px, transparent 0), radial-gradient(circle at 30px 30px, rgba(139, 92, 246, 0.1) 1px, transparent 0)`,
          backgroundSize: '60px 60px',
        }}></div>
        <div className="absolute inset-0 opacity-[0.025]" style={{
          background: `linear-gradient(135deg, rgba(147, 197, 253, 0.08) 0%, transparent 30%, rgba(196, 181, 253, 0.08) 70%, transparent 100%)`,
        }}></div>
        <div className="absolute inset-0 opacity-[0.02]" style={{
          backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(59, 130, 246, 0.05) 2px, rgba(59, 130, 246, 0.05) 4px), repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(79, 70, 229, 0.05) 2px, rgba(79, 70, 229, 0.05) 4px)`,
          backgroundSize: '20px 20px',
        }}></div>
        <div className="absolute inset-0 opacity-[0.015]" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3Cpattern id='cross' x='0' y='0' width='20' height='20' patternUnits='userSpaceOnUse'%3E%3Cpath d='M 10 0 L 10 20 M 0 10 L 20 10' stroke='%233b82f6' stroke-width='0.5' opacity='0.1'/%3E%3C/pattern%3E%3C/defs%3E%3Crect width='100' height='100' fill='url(%23cross)'/%3E%3C/svg%3E")`,
        }}></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-20">
            <div className="inline-flex items-center px-4 py-2 rounded-full bg-blue-100 text-blue-800 text-sm font-medium mb-6 shadow-sm">
              <Award className="w-4 h-4 mr-2" />
              Powerful Features
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              Everything you need to run a
              <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent"> modern pharmacy</span>
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Streamline operations, reduce waste, and boost sales with our comprehensive AI-powered platform
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div key={index} role="button" tabIndex={0} onClick={() => scrollToId('pricing')} onKeyDown={(e) => (e.key === 'Enter' ? scrollToId('pricing') : null)} className="group relative bg-white rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2 border border-gray-200">
                <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${feature.gradient} rounded-t-2xl`}></div>
                <div className={`w-16 h-16 bg-gradient-to-r ${feature.gradient} rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300 shadow-md`}>
                  <div className="w-10 h-10 flex items-center justify-center">
                    {feature.icon}
                  </div>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-4 group-hover:text-blue-600 transition-colors">
                  {feature.title}
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24 relative overflow-hidden" style={{
        background: '#f8fafc',
      }}>
        {/* Enhanced Pattern Background - Rich Design Not Plain */}
        <div className="absolute inset-0 opacity-[0.06]" style={{
          backgroundImage: `linear-gradient(rgba(59, 130, 246, 0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(59, 130, 246, 0.2) 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }}></div>
        <div className="absolute inset-0 opacity-[0.04]" style={{
          backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 35px, rgba(79, 70, 229, 0.1) 35px, rgba(79, 70, 229, 0.1) 70px)`,
        }}></div>
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `radial-gradient(circle at 2px 2px, rgba(59, 130, 246, 0.15) 1px, transparent 0), radial-gradient(circle at 30px 30px, rgba(139, 92, 246, 0.1) 1px, transparent 0)`,
          backgroundSize: '60px 60px',
        }}></div>
        <div className="absolute inset-0 opacity-[0.025]" style={{
          background: `linear-gradient(135deg, rgba(147, 197, 253, 0.08) 0%, transparent 30%, rgba(196, 181, 253, 0.08) 70%, transparent 100%)`,
        }}></div>
        <div className="absolute inset-0 opacity-[0.02]" style={{
          backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(59, 130, 246, 0.05) 2px, rgba(59, 130, 246, 0.05) 4px), repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(79, 70, 229, 0.05) 2px, rgba(79, 70, 229, 0.05) 4px)`,
          backgroundSize: '20px 20px',
        }}></div>
        <div className="absolute inset-0 opacity-[0.015]" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3Cpattern id='cross' x='0' y='0' width='20' height='20' patternUnits='userSpaceOnUse'%3E%3Cpath d='M 10 0 L 10 20 M 0 10 L 20 10' stroke='%233b82f6' stroke-width='0.5' opacity='0.1'/%3E%3C/pattern%3E%3C/defs%3E%3Crect width='100' height='100' fill='url(%23cross)'/%3E%3C/svg%3E")`,
        }}></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-20">
            <div className="inline-flex items-center px-4 py-2 rounded-full bg-green-100 text-green-800 text-sm font-medium mb-6">
              <Star className="w-4 h-4 mr-2" />
              Transparent Pricing
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              Simple, transparent pricing
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Choose the plan that fits your pharmacy's needs. All plans include 14-day free trial.
            </p>
          </div>
          
          {loadingPlans ? (
            <div className="flex justify-center items-center py-20">
              <div className="text-gray-500 text-lg">Loading pricing plans...</div>
            </div>
          ) : pricingPlans.length === 0 ? (
            <div className="flex justify-center items-center py-20">
              <div className="text-gray-500 text-lg">No pricing plans available at the moment.</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {pricingPlans.map((plan, index) => (
              <div 
                key={index} 
                className={`relative bg-white rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2 w-full ${
                  plan.popular 
                    ? 'ring-2 ring-blue-500 scale-105' 
                    : 'border border-gray-200'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <span className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-2 rounded-full text-sm font-semibold shadow-lg">
                      Most Popular
                    </span>
                  </div>
                )}
                
                <div className="p-8">
                  <div className="text-center mb-8">
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">
                      {plan.name}
                    </h3>
                    <p className="text-gray-600 mb-4">{plan.description}</p>
                    <div className="mb-4">
                      <span className="text-5xl font-bold text-gray-900 leading-none align-baseline">
                        {plan.price}
                      </span>
                      <span className="text-gray-600 ml-2 text-lg align-baseline">
                        {plan.period}
                      </span>
                    </div>
                  </div>
                  
                  <ul className="space-y-4 mb-8">
                    {plan.features.map((feature, featureIndex) => (
                      <li key={featureIndex} className="flex items-start">
                        <CheckCircle className="w-5 h-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                        <span className="text-gray-700">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  
                  <button onClick={() => window.location.assign('/register')} className={`w-full py-4 px-6 rounded-xl font-semibold transition-all duration-300 ${
                    plan.popular 
                      ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg hover:shadow-xl' 
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-900 hover:shadow-md'
                  }`}>
                    {plan.cta}
                  </button>
                </div>
              </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Newsletter Section */}
      <section id="newsletter" className="py-24 bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800 relative overflow-hidden">
        <div className="absolute inset-0 bg-black/10"></div>
        <div className="absolute top-0 left-0 w-full h-full">
          <div className="absolute top-10 left-10 w-32 h-32 bg-white/10 rounded-full blur-xl"></div>
          <div className="absolute bottom-10 right-10 w-40 h-40 bg-white/10 rounded-full blur-xl"></div>
        </div>
        
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center px-4 py-2 rounded-full bg-white/20 text-white text-sm font-medium mb-8">
            <Lightning className="w-4 h-4 mr-2" />
            Stay Updated
          </div>
          
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Stay updated with the latest features
          </h2>
          <p className="text-xl text-blue-100 mb-12 max-w-2xl mx-auto">
            Get notified about new features, updates, and pharmacy management tips delivered to your inbox.
          </p>
          
          <form onSubmit={handleSubscribe} className="flex flex-col sm:flex-row gap-4 max-w-lg mx-auto">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email address"
              className="flex-1 px-6 py-4 rounded-xl border-0 focus:ring-2 focus:ring-white/50 text-gray-900 placeholder-gray-500"
              required
            />
            <button
              type="submit"
              className="bg-white text-blue-600 hover:bg-gray-100 font-semibold py-4 px-8 rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl flex items-center justify-center group"
            >
              Subscribe
              <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
            </button>
          </form>
          {subscribeMsg && (
            <p className="mt-4 text-blue-100">{subscribeMsg}</p>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
            <div className="md:col-span-1">
              <div className="flex items-center mb-6">
                <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center mr-3">
                  <Heart className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                  Phoebe Drugstore
                </h3>
              </div>
              <p className="text-gray-400 leading-relaxed mb-6">
                Modern pharmacy management system with AI-powered insights and automation for the digital age.
              </p>
              <div className="flex space-x-4">
                <button className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center hover:bg-gray-700 transition-colors">
                  <Globe className="w-5 h-5" />
                </button>
                <button className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center hover:bg-gray-700 transition-colors">
                  <Heart className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <div>
              <h4 className="font-bold text-lg mb-6">Product</h4>
              <ul className="space-y-3 text-gray-400">
                <li><button onClick={() => scrollToId('features')} className="hover:text-white transition-colors">Features</button></li>
                <li><button onClick={() => scrollToId('pricing')} className="hover:text-white transition-colors">Pricing</button></li>
                <li><button onClick={() => window.location.assign('/login')} className="hover:text-white transition-colors">API Documentation</button></li>
                <li><button onClick={() => window.location.assign('/login')} className="hover:text-white transition-colors">Integrations</button></li>
                <li><button onClick={() => scrollToId('hero')} className="hover:text-white transition-colors">Mobile App</button></li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-bold text-lg mb-6">Support</h4>
              <ul className="space-y-3 text-gray-400">
                <li><button onClick={() => scrollToId('newsletter')} className="hover:text-white transition-colors">Help Center</button></li>
                <li><a href="mailto:support@phoebe.app" className="hover:text-white transition-colors">Contact Support</a></li>
                <li><button onClick={() => scrollToId('features')} className="hover:text-white transition-colors">Training</button></li>
                <li><button onClick={() => scrollToId('stats')} className="hover:text-white transition-colors">Status Page</button></li>
                <li><button onClick={() => scrollToId('newsletter')} className="hover:text-white transition-colors">Community</button></li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-bold text-lg mb-6">Company</h4>
              <ul className="space-y-3 text-gray-400">
                <li><button onClick={() => scrollToId('hero')} className="hover:text-white transition-colors">About Us</button></li>
                <li><button onClick={() => scrollToId('features')} className="hover:text-white transition-colors">Careers</button></li>
                <li><a href="/privacy" className="hover:text-white transition-colors">Privacy Policy</a></li>
                <li><a href="/terms" className="hover:text-white transition-colors">Terms of Service</a></li>
                <li><button onClick={() => scrollToId('newsletter')} className="hover:text-white transition-colors">Security</button></li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-gray-800 mt-12 pt-8">
            <div className="flex flex-col md:flex-row justify-between items-center">
              <p className="text-gray-400 text-sm">
                &copy; 2025 Phoebe Drugstore. All rights reserved.
              </p>
              <div className="flex items-center space-x-6 mt-4 md:mt-0">
                <span className="text-gray-400 text-sm">Made with</span>
                <Heart className="w-4 h-4 text-red-500" />
                <span className="text-gray-400 text-sm">in the Philippines</span>
              </div>
            </div>
          </div>
        </div>
      </footer>
      </div>
    </div>
  );
};

export default LandingPage;

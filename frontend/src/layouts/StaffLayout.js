import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { 
  BarChart3, 
  Settings, 
  ShoppingCart, 
  Bot, 
  Leaf, 
  ClipboardList,
  Receipt,
  LogOut,
  Menu,
  X,
  Sun,
  Moon,
  ChevronLeft,
  ChevronDown,
  Recycle
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const StaffLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const [isDark, setIsDark] = useState(() => {
    const stored = localStorage.getItem('phoebe_theme');
    return stored ? stored === 'dark' : false;
  });

  useEffect(() => {
    localStorage.setItem('phoebe_theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  const userInitials = useMemo(() => {
    const source = user?.name || user?.full_name || '';
    const parts = String(source).split(/[\s@._-]+/).filter(Boolean);
    const initials = parts.slice(0, 2).map(p => p.charAt(0).toUpperCase()).join('');
    return initials || 'ST';
  }, [user]);

  const navigation = [
    { name: 'Overview', href: '/staff', icon: BarChart3 },
    { name: 'Profile', href: '/staff/profile', icon: Settings },
    { name: 'Inventory Requests', href: '/staff/inventory-requests', icon: ClipboardList },
    { name: 'POS System', href: '/staff/pos', icon: ShoppingCart },
    { name: 'Own Sales', href: '/staff/own-sales', icon: Receipt },
    { name: 'Waste & Expiry', href: '/staff/waste-expiry', icon: Leaf },
    { name: 'Sustainability', href: '/staff/sustainability', icon: Recycle },
    { name: 'AI Assistant', href: '/staff/ai', icon: Bot },
  ];

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const toggleTheme = () => setIsDark(v => !v);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileMenuOpen && !event.target.closest('.profile-menu-container')) {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [profileMenuOpen]);

  return (
    <div className={isDark ? 'dark' : ''}>
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-50 to-white dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
      {/* Mobile sidebar */}
      <div className={`fixed inset-0 z-50 lg:hidden ${sidebarOpen ? 'block' : 'hidden'}`}>
        <div className="fixed inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
        <div className="fixed inset-y-0 left-0 w-72 bg-white dark:bg-slate-950 shadow-2xl flex flex-col border-r border-slate-200/70 dark:border-slate-800">
          <div className="flex items-center justify-between h-16 px-4 sm:px-6 bg-white dark:bg-slate-950">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-indigo-500 to-blue-400 rounded-xl blur-md opacity-40"></div>
                <div className="relative h-9 w-9 rounded-xl bg-gradient-to-br from-blue-600 via-indigo-500 to-blue-400 text-white flex items-center justify-center font-bold text-sm flex-shrink-0 shadow-md">
                  ST
                </div>
              </div>
              <div className="leading-tight min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 truncate tracking-tight">Staff Portal</p>
              </div>
            </div>
            <button 
              onClick={() => setSidebarOpen(false)} 
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:text-slate-500 dark:hover:text-slate-200 dark:hover:bg-slate-800/60 transition-all duration-200 cursor-pointer touch-manipulation flex-shrink-0"
              type="button"
              aria-label="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="flex-1 px-2 sm:px-3 py-4 space-y-2 overflow-y-auto">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`group relative flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${
                    isActive
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/25 dark:shadow-blue-500/20'
                      : 'text-gray-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-white rounded-r-full"></div>
                  )}
                  <item.icon className={`mr-4 w-5 h-5 ${isActive ? 'text-white' : 'text-gray-400 dark:text-slate-500 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors'}`} />
                  <span className="font-medium">
                    {item.name}
                  </span>
                  {isActive && (
                    <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white/80"></div>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className={`hidden lg:fixed lg:inset-y-0 lg:flex ${sidebarCollapsed ? 'lg:w-24' : 'lg:w-72'} lg:flex-col transition-all duration-300 ease-in-out`}>
        <div className="flex flex-col flex-grow bg-white dark:bg-slate-950 border-r border-slate-200/70 dark:border-slate-800 shadow-xl">
          <div className="flex items-center justify-between h-16 px-4 sm:px-6 bg-white dark:bg-slate-950">
            <div className={`flex items-center ${sidebarCollapsed ? 'justify-center w-full' : 'gap-3'}`}>
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-indigo-500 to-blue-400 rounded-xl blur-md opacity-40 group-hover:opacity-60 transition-opacity"></div>
                <div className="relative h-9 w-9 rounded-xl bg-gradient-to-br from-blue-600 via-indigo-500 to-blue-400 text-white flex items-center justify-center font-bold text-sm flex-shrink-0 shadow-md">
                  ST
                </div>
              </div>
              {!sidebarCollapsed && (
                <div className="leading-tight min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 tracking-tight">Staff Portal</p>
                </div>
              )}
            </div>
            {!sidebarCollapsed && (
              <button
                onClick={() => setSidebarCollapsed(true)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:text-slate-500 dark:hover:text-slate-200 dark:hover:bg-slate-800/60 transition-all duration-200 cursor-pointer touch-manipulation flex-shrink-0"
                title="Collapse sidebar"
                type="button"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
          </div>

          {sidebarCollapsed && (
            <button
              onClick={() => setSidebarCollapsed(false)}
              className="absolute top-3 right-[-12px] z-10 p-2 rounded-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-md hover:shadow-lg transition-transform"
              title="Expand sidebar"
              type="button"
            >
              <ChevronLeft className="w-4 h-4 rotate-180 text-gray-600 dark:text-slate-300" />
            </button>
          )}

          <nav className="flex-1 px-2 sm:px-3 py-4 space-y-2 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700 scrollbar-track-transparent">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  title={sidebarCollapsed ? item.name : undefined}
                  className={`group relative flex items-center ${sidebarCollapsed ? 'justify-center' : ''} px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${
                    isActive
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/25 dark:shadow-blue-500/20'
                      : 'text-gray-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-white rounded-r-full"></div>
                  )}
                  <item.icon className={`${sidebarCollapsed ? '' : 'mr-4'} w-5 h-5 ${isActive ? 'text-white' : 'text-gray-400 dark:text-slate-500 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors'}`} />
                  {!sidebarCollapsed && (
                    <span className="font-medium">
                      {item.name}
                    </span>
                  )}
                  {isActive && !sidebarCollapsed && (
                    <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white/80"></div>
                  )}
                </Link>
              );
            })}
          </nav>

        </div>
      </div>

      {/* Main content */}
      <div className={`${sidebarCollapsed ? 'lg:pl-24' : 'lg:pl-72'}`}>
        {/* Top bar */}
        <div className="sticky top-0 z-40 bg-white/85 dark:bg-slate-950/85 backdrop-blur-xl border-b border-slate-200/60 dark:border-slate-800/60 shadow-md">
          <div className="flex items-center justify-between h-16 px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/60 lg:hidden transition-all duration-200 cursor-pointer touch-manipulation flex-shrink-0"
                type="button"
                aria-label="Open menu"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="min-w-0">
                <p className="text-base sm:text-lg font-semibold text-gray-900 dark:text-slate-100 tracking-tight">
                  {navigation.find(item => item.href === location.pathname)?.name || 'Staff Dashboard'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              {/* Profile Menu Dropdown */}
              <div className="relative profile-menu-container">
                <button
                  onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                  className="flex items-center rounded-xl border border-slate-200/70 dark:border-slate-700/70 bg-white dark:bg-slate-900 px-3 py-2 shadow-sm hover:shadow-md hover:bg-slate-50 dark:hover:bg-slate-800 transition-all duration-200 cursor-pointer touch-manipulation"
                  type="button"
                  title="Account Menu"
                  aria-label="Account menu"
                >
                  <div className="relative mr-3 flex-shrink-0">
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-indigo-500 to-blue-400 rounded-full blur opacity-40"></div>
                    <span className="relative h-8 w-8 rounded-full bg-gradient-to-br from-blue-600 via-indigo-500 to-blue-400 text-white text-xs font-bold flex items-center justify-center shadow pointer-events-none">
                      {userInitials}
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white max-w-[10rem] truncate pointer-events-none mr-2">{user?.name || user?.full_name || 'Staff'}</span>
                  <ChevronDown className={`w-4 h-4 text-slate-500 dark:text-slate-400 transition-transform duration-200 pointer-events-none ${profileMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown Menu */}
                {profileMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl z-50 overflow-hidden">
                    <div className="p-2">
                      {/* Profile Link */}
                      <Link
                        to="/staff/profile"
                        onClick={() => setProfileMenuOpen(false)}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        <Settings className="w-5 h-5 text-gray-500 dark:text-slate-400" />
                        <span className="font-medium">Profile Settings</span>
                      </Link>

                      {/* Theme Toggle */}
                      <button
                        onClick={() => {
                          toggleTheme();
                          setProfileMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        type="button"
                      >
                        {isDark ? (
                          <>
                            <Sun className="w-5 h-5 text-amber-500" />
                            <span className="font-medium">Light Mode</span>
                          </>
                        ) : (
                          <>
                            <Moon className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                            <span className="font-medium">Dark Mode</span>
                          </>
                        )}
                      </button>

                      {/* Divider */}
                      <div className="my-1 border-t border-slate-200 dark:border-slate-800"></div>

                      {/* Logout */}
                      <button
                        onClick={() => {
                          setProfileMenuOpen(false);
                          handleLogout();
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
                        type="button"
                      >
                        <LogOut className="w-5 h-5" />
                        <span className="font-medium">Logout</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-x-hidden">
          <div className="pt-6 sm:pt-8 pb-6 sm:pb-8">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <Outlet />
            </div>
          </div>
        </main>
      </div>
    </div>
    </div>
  );
};

export default StaffLayout;



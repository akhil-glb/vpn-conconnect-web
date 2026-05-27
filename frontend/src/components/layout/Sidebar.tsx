import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import * as authApi from '../../api/auth';

const adminNavItems = [
  { label: 'Dashboard', path: '/dashboard', icon: '🏠' },
  { label: 'Devices', path: '/devices', icon: '💻' },
  { label: 'Policies', path: '/policies', icon: '📋' },
  { label: 'Groups', path: '/groups', icon: '👥' },
  { label: 'VPN Sessions', path: '/vpn-sessions', icon: '🔒' },
  { label: 'Audit Logs', path: '/audit-logs', icon: '📜' },
  { label: 'Settings', path: '/settings', icon: '⚙️' },
];

const superAdminNavItems = [
  { label: 'Platform Overview', path: '/platform', icon: '🌐' },
];

export default function Sidebar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const navItems = user?.role === 'SUPER_ADMIN' ? superAdminNavItems : adminNavItems;

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore errors on logout
    }
    logout();
    navigate('/login');
  };

  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-gray-900 text-white flex flex-col z-10">
      {/* Logo */}
      <div className="p-6 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🛡️</span>
          <span className="font-bold text-lg leading-tight">VPN ConConnect</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-6 py-3 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`
            }
          >
            <span className="text-base">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* User info + Logout */}
      <div className="p-4 border-t border-gray-700">
        {user && (
          <div className="mb-3">
            <p className="text-xs text-gray-400 truncate">{user.email}</p>
            <p className="text-xs text-gray-500 mt-0.5">{user.role}</p>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="w-full text-left text-sm text-gray-400 hover:text-white px-2 py-1.5 rounded hover:bg-gray-800 transition-colors"
        >
          ← Logout
        </button>
      </div>
    </aside>
  );
}

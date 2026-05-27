import React from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

const routeTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/devices': 'Devices',
  '/policies': 'Policies',
  '/policies/new': 'New Policy',
  '/groups': 'Groups',
  '/vpn-sessions': 'VPN Sessions',
  '/audit-logs': 'Audit Logs',
  '/settings': 'Settings',
};

function getPageTitle(pathname: string): string {
  if (routeTitles[pathname]) return routeTitles[pathname];
  if (pathname.startsWith('/devices/')) return 'Device Detail';
  if (pathname.endsWith('/edit')) return 'Edit Policy';
  return '';
}

function getBreadcrumbs(pathname: string): { label: string; path: string }[] {
  const crumbs: { label: string; path: string }[] = [
    { label: 'Home', path: '/dashboard' },
  ];

  if (pathname === '/dashboard') return crumbs;

  const segments = pathname.split('/').filter(Boolean);
  let accumulated = '';
  for (const seg of segments) {
    accumulated += `/${seg}`;
    const title = routeTitles[accumulated];
    if (title) {
      crumbs.push({ label: title, path: accumulated });
    } else {
      // Dynamic segment (id or 'edit')
      if (seg === 'edit') {
        crumbs.push({ label: 'Edit', path: accumulated });
      } else if (seg === 'new') {
        crumbs.push({ label: 'New', path: accumulated });
      } else {
        // Likely an ID
        crumbs.push({ label: seg.slice(0, 8) + '...', path: accumulated });
      }
    }
  }
  return crumbs;
}

export default function TopBar() {
  const { pathname } = useLocation();
  const { user, impersonatingOrgName, exitImpersonation } = useAuthStore();
  const navigate = useNavigate();
  const title = getPageTitle(pathname);
  const breadcrumbs = getBreadcrumbs(pathname);

  const handleExitImpersonation = () => {
    exitImpersonation();
    navigate('/platform');
  };

  return (
    <header className="fixed top-0 left-64 right-0 bg-white shadow-sm z-10">
      {impersonatingOrgName && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 flex items-center justify-between">
          <span className="text-xs text-amber-800 font-medium">
            Viewing as admin of <span className="font-bold">{impersonatingOrgName}</span> — session expires in 1 hour
          </span>
          <button
            onClick={handleExitImpersonation}
            className="text-xs bg-amber-600 text-white px-3 py-1 rounded-lg hover:bg-amber-700 font-medium transition-colors"
          >
            ← Exit to Platform
          </button>
        </div>
      )}
      <div className="h-16 flex items-center px-6">
      <div className="flex-1">
        {title && <h1 className="text-lg font-semibold text-gray-900">{title}</h1>}
        <nav className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
          {breadcrumbs.map((crumb, i) => (
            <React.Fragment key={crumb.path}>
              {i > 0 && <span className="mx-1">/</span>}
              {i === breadcrumbs.length - 1 ? (
                <span className="text-gray-700">{crumb.label}</span>
              ) : (
                <Link to={crumb.path} className="hover:text-blue-600 transition-colors">
                  {crumb.label}
                </Link>
              )}
            </React.Fragment>
          ))}
        </nav>
      </div>

      {user && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">{user.email}</span>
          {user.role === 'SUPER_ADMIN' && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
              Super Admin
            </span>
          )}
          {user.role === 'ADMIN' && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
              Admin
            </span>
          )}
        </div>
      )}
      </div>
    </header>
  );
}

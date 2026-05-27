import React from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import Sidebar from './components/layout/Sidebar';
import TopBar from './components/layout/TopBar';

// Pages (lazy-loaded)
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Devices from './pages/Devices';
import DeviceDetail from './pages/DeviceDetail';
import Policies from './pages/Policies';
import PolicyEditor from './pages/PolicyEditor';
import Groups from './pages/Groups';
import AuditLogs from './pages/AuditLogs';
import VpnSessions from './pages/VpnSessions';
import Settings from './pages/Settings';
import Platform from './pages/Platform';

function AppLayout() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 ml-64 flex flex-col">
        <TopBar />
        <main className="flex-1 mt-16 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function ProtectedRoute() {
  const { token } = useAuthStore();
  if (!token) return <Navigate to="/login" replace />;
  return <AppLayout />;
}

function OrgRoute() {
  const { token, user } = useAuthStore();
  if (!token) return <Navigate to="/login" replace />;
  if (user?.role === 'SUPER_ADMIN') return <Navigate to="/platform" replace />;
  return <Outlet />;
}

function RootRedirect() {
  const { token, user } = useAuthStore();
  if (!token) return <Navigate to="/login" replace />;
  return <Navigate to={user?.role === 'SUPER_ADMIN' ? '/platform' : '/dashboard'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<RootRedirect />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/platform" element={<Platform />} />
        <Route element={<OrgRoute />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/devices" element={<Devices />} />
          <Route path="/devices/:id" element={<DeviceDetail />} />
          <Route path="/policies" element={<Policies />} />
          <Route path="/policies/new" element={<PolicyEditor />} />
          <Route path="/policies/:id/edit" element={<PolicyEditor />} />
          <Route path="/groups" element={<Groups />} />
          <Route path="/audit-logs" element={<AuditLogs />} />
          <Route path="/vpn-sessions" element={<VpnSessions />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Route>

      {/* Catch-all: redirect to root */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Approval from './pages/Approval.jsx';
import Reports from './pages/Reports.jsx';
import Clients from './pages/Clients.jsx';
import UserManagement from './pages/UserManagement.jsx';
import Tasks from './pages/Tasks.jsx';
import PublicApproval from './pages/PublicApproval.jsx';
import Feed from './pages/Feed.jsx';
import PublicFeed from './pages/PublicFeed.jsx';
import Finance from './pages/Finance.jsx';
import ActionPlan from './pages/ActionPlan.jsx';
import BrandSettings from './pages/BrandSettings.jsx';
import Agencies from './pages/Agencies.jsx';
import Diagnostics from './pages/Diagnostics.jsx';
import PublicDiagnostic from './pages/PublicDiagnostic.jsx';

function ProtectedRoute({ children, roles, platformOnly = false }) {
  const { user, checkingSession } = useAuth();
  if (checkingSession) return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500">Carregando Zebrahub...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  if (platformOnly && !user.is_platform_owner) return <Navigate to="/" replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/aprovar/:token" element={<PublicApproval />} />
      <Route path="/grade/:token" element={<PublicFeed />} />
      <Route path="/diagnostico/:token" element={<PublicDiagnostic />} />
      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/aprovacao" element={<ProtectedRoute><Approval /></ProtectedRoute>} />
      <Route path="/calendario" element={<Navigate to="/feed?view=calendar" replace />} />
      <Route path="/feed" element={<ProtectedRoute><Feed /></ProtectedRoute>} />
      <Route
        path="/tarefas"
        element={
          <ProtectedRoute roles={['admin', 'team', 'client']}>
            <Tasks />
          </ProtectedRoute>
        }
      />
      <Route path="/plano-de-acao" element={<ProtectedRoute><ActionPlan /></ProtectedRoute>} />
      <Route path="/diagnosticos" element={<ProtectedRoute roles={['admin', 'team']}><Diagnostics /></ProtectedRoute>} />
      <Route path="/relatorios" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
      <Route
        path="/financeiro"
        element={
          <ProtectedRoute roles={['admin']}>
            <Finance />
          </ProtectedRoute>
        }
      />
      <Route
        path="/clientes"
        element={
          <ProtectedRoute roles={['admin', 'team']}>
            <Clients />
          </ProtectedRoute>
        }
      />
      <Route
        path="/usuarios"
        element={
          <ProtectedRoute roles={['admin']}>
            <UserManagement />
          </ProtectedRoute>
        }
      />
      <Route
        path="/marca"
        element={<ProtectedRoute roles={['admin']}><BrandSettings /></ProtectedRoute>}
      />
      <Route
        path="/agencias"
        element={<ProtectedRoute roles={['admin']} platformOnly><Agencies /></ProtectedRoute>}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

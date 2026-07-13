import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Approval from './pages/Approval.jsx';
import Reports from './pages/Reports.jsx';
import Clients from './pages/Clients.jsx';

function ProtectedRoute({ children, roles }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/aprovacao" element={<ProtectedRoute><Approval /></ProtectedRoute>} />
      <Route path="/relatorios" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
      <Route
        path="/clientes"
        element={
          <ProtectedRoute roles={['admin', 'team']}>
            <Clients />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

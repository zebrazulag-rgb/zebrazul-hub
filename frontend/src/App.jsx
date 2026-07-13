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
import CalendarView from './pages/CalendarView.jsx';
import PublicApproval from './pages/PublicApproval.jsx';

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
      <Route path="/aprovar/:token" element={<PublicApproval />} />
      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/aprovacao" element={<ProtectedRoute><Approval /></ProtectedRoute>} />
      <Route path="/calendario" element={<ProtectedRoute><CalendarView /></ProtectedRoute>} />
      <Route
        path="/tarefas"
        element={
          <ProtectedRoute roles={['admin', 'team']}>
            <Tasks />
          </ProtectedRoute>
        }
      />
      <Route path="/relatorios" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
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
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

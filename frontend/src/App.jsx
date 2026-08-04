import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Approval from './pages/Approval.jsx';
import VideoApprovals from './pages/VideoApprovals.jsx';
import VideoReviewWorkspace from './pages/VideoReviewWorkspace.jsx';
import Reports from './pages/Reports.jsx';
import Tasks from './pages/Tasks.jsx';
import PublicApproval from './pages/PublicApproval.jsx';
import Feed from './pages/Feed.jsx';
import PublicFeed from './pages/PublicFeed.jsx';
import Finance from './pages/Finance.jsx';
import StrategicDiagnosis from './pages/StrategicDiagnosis.jsx';
import Diagnostics from './pages/Diagnostics.jsx';
import CompassPage from './pages/Compass.jsx';
import PublicDiagnostic from './pages/PublicDiagnostic.jsx';
import Sales from './pages/Sales.jsx';
import CommercialFunnel from './pages/CommercialFunnel.jsx';
import Materials from './pages/Materials.jsx';
import MaterialViewer from './pages/MaterialViewer.jsx';
import Settings from './pages/Settings.jsx';
import StoryHub from './pages/StoryHub.jsx';

function ProtectedRoute({ children, roles, platformOnly = false, commercialTeamAllowed = false, commercialAccess = false }) {
  const { user, checkingSession } = useAuth();
  if (checkingSession) return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500">Carregando Zebrahub...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  if (user.is_commercial_team && !commercialTeamAllowed) return <Navigate to="/" replace />;
  if (commercialAccess && !(user.role === 'admin' || user.role === 'client' || user.is_commercial_team)) return <Navigate to="/" replace />;
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
      <Route path="/" element={<ProtectedRoute commercialTeamAllowed><Dashboard /></ProtectedRoute>} />
      <Route path="/aprovacao" element={<ProtectedRoute><Approval /></ProtectedRoute>} />
      <Route path="/aprovacao/videos" element={<ProtectedRoute><VideoApprovals /></ProtectedRoute>} />
      <Route path="/aprovacao/videos/:id" element={<ProtectedRoute><VideoReviewWorkspace /></ProtectedRoute>} />
      <Route path="/calendario" element={<Navigate to="/feed?view=calendar" replace />} />
      <Route path="/feed" element={<ProtectedRoute><Feed /></ProtectedRoute>} />
      <Route path="/stories" element={<ProtectedRoute><StoryHub /></ProtectedRoute>} />
      <Route
        path="/tarefas"
        element={
          <ProtectedRoute roles={['admin', 'team', 'client']} commercialTeamAllowed>
            <Tasks />
          </ProtectedRoute>
        }
      />
      <Route path="/bussola" element={<ProtectedRoute><CompassPage /></ProtectedRoute>} />
      <Route path="/bussola/dme" element={<ProtectedRoute roles={['admin', 'team']}><Diagnostics /></ProtectedRoute>} />
      <Route path="/bussola/diagnostico" element={<ProtectedRoute><StrategicDiagnosis /></ProtectedRoute>} />
      <Route path="/bussola/plano-anual" element={<Navigate to="/bussola/diagnostico" replace />} />
      <Route path="/bussola/ciclo-90-dias" element={<Navigate to="/bussola/diagnostico" replace />} />
      <Route path="/bussola/planejamento-mensal" element={<Navigate to="/bussola/diagnostico" replace />} />
      <Route path="/plano-de-acao" element={<Navigate to="/bussola/diagnostico" replace />} />
      <Route path="/diagnostico-estrategico" element={<Navigate to="/bussola/diagnostico" replace />} />
      <Route path="/diagnosticos" element={<Navigate to="/bussola/dme" replace />} />
      <Route path="/plano-anual" element={<Navigate to="/bussola/diagnostico" replace />} />
      <Route path="/ciclo-90-dias" element={<Navigate to="/bussola/diagnostico" replace />} />
      <Route path="/planejamento-mensal" element={<Navigate to="/bussola/diagnostico" replace />} />
      <Route path="/comercial" element={<ProtectedRoute roles={['admin', 'team', 'client']} commercialTeamAllowed commercialAccess><Sales /></ProtectedRoute>} />
      <Route path="/comercial/funil" element={<ProtectedRoute roles={['admin', 'team', 'client']} commercialTeamAllowed commercialAccess><CommercialFunnel /></ProtectedRoute>} />
      <Route path="/relatorios" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
      <Route path="/materiais" element={<ProtectedRoute><Materials /></ProtectedRoute>} />
      <Route path="/materiais/:id" element={<ProtectedRoute><MaterialViewer /></ProtectedRoute>} />
      <Route
        path="/financeiro"
        element={
          <ProtectedRoute roles={['admin']}>
            <Finance />
          </ProtectedRoute>
        }
      />
      <Route path="/configuracoes/:section?" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      <Route path="/clientes" element={<Navigate to="/configuracoes/clientes" replace />} />
      <Route path="/usuarios" element={<Navigate to="/configuracoes/usuarios" replace />} />
      <Route path="/marca" element={<Navigate to="/configuracoes/marca" replace />} />
      <Route path="/agencias" element={<Navigate to="/configuracoes/agencias" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

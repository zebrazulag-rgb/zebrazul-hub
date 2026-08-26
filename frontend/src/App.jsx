import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import VideoReviewWorkspace from './pages/VideoReviewWorkspace.jsx';
import Tasks from './pages/Tasks.jsx';
import PublicApproval from './pages/PublicApproval.jsx';
import PublicFeed from './pages/PublicFeed.jsx';
import PublicSocialMediaFeed from './pages/PublicSocialMediaFeed.jsx';
import PublicPost from './pages/PublicPost.jsx';
import Finance from './pages/Finance.jsx';
import PasswordVault from './pages/PasswordVault.jsx';
import StrategicDiagnosis from './pages/StrategicDiagnosis.jsx';
import Diagnostics from './pages/Diagnostics.jsx';
import CompassPage from './pages/Compass.jsx';
import PublicDiagnostic from './pages/PublicDiagnostic.jsx';
import Sales from './pages/Sales.jsx';
import CommercialFunnel from './pages/CommercialFunnel.jsx';
import Materials from './pages/Materials.jsx';
import MaterialViewer from './pages/MaterialViewer.jsx';
import Settings from './pages/Settings.jsx';
import SocialMedia from './pages/SocialMedia.jsx';
import PrivacyPolicy from './pages/PrivacyPolicy.jsx';
import TermsOfUse from './pages/TermsOfUse.jsx';
import DataDeletion from './pages/DataDeletion.jsx';
import BeeRematriculas from './pages/BeeRematriculas.jsx';
import BeeCampaignBriefing from './pages/BeeCampaignBriefing.jsx';
import BeeFamilySurvey from './pages/BeeFamilySurvey.jsx';
import PublicBeeFamilySurvey from './pages/PublicBeeFamilySurvey.jsx';
import PublicBeeCampaignBriefing from './pages/PublicBeeCampaignBriefing.jsx';
import PublicTaskRequest from './pages/PublicTaskRequest.jsx';
import PublicTaskCalendar from './pages/PublicTaskCalendar.jsx';
import ClientDemand from './pages/ClientDemand.jsx';
import { hasPermission } from './permissions.js';


function SocialMediaLegacyRedirect({ section }) {
  const location = useLocation();
  return <Navigate to={`/social-media/${section}${location.search || ''}`} replace />;
}

function fallbackRoute(user) {
  if (user?.role === 'client') return '/cliente/solicitar';
  if (hasPermission(user, 'dashboard.view')) return '/';
  if (hasPermission(user, 'tasks.view')) return '/tarefas';
  if (hasPermission(user, 'social.feed')) return '/social-media/feed';
  if (hasPermission(user, 'social.stories')) return '/social-media/stories';
  if (hasPermission(user, 'social.reports')) return '/social-media/relatorios';
  if (hasPermission(user, 'commercial.view')) return '/comercial';
  if (hasPermission(user, 'materials.view')) return '/materiais';
  return '/configuracoes/aparencia';
}

function ProtectedRoute({ children, roles, platformOnly = false, commercialTeamAllowed = false, commercialAccess = false, permission }) {
  const { user, checkingSession } = useAuth();
  if (checkingSession) return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500">Carregando Zebrahub...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (permission && !hasPermission(user, permission)) return <Navigate to={fallbackRoute(user)} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={fallbackRoute(user)} replace />;
  if (user.is_commercial_team && !commercialTeamAllowed && !permission) return <Navigate to={fallbackRoute(user)} replace />;
  if (commercialAccess && !(user.role === 'admin' || user.role === 'client' || user.is_commercial_team) && !hasPermission(user, 'commercial.view')) return <Navigate to={fallbackRoute(user)} replace />;
  if (platformOnly && !user.is_platform_owner) return <Navigate to={fallbackRoute(user)} replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/npsbee" element={<PublicBeeFamilySurvey />} />
      <Route path="/aprovar/:token" element={<PublicApproval />} />
      <Route path="/grade/:token" element={<PublicFeed />} />
      <Route path="/link-social-media/:token" element={<PublicSocialMediaFeed />} />
      <Route path="/post/:token" element={<PublicPost />} />
      <Route path="/diagnostico/:token" element={<PublicDiagnostic />} />
      <Route path="/briefing-bee-2027/:token" element={<PublicBeeCampaignBriefing />} />
      <Route path="/solicitar/:token" element={<PublicTaskRequest />} />
      <Route path="/agenda/:token" element={<PublicTaskCalendar />} />
      <Route path="/politica-de-privacidade" element={<PrivacyPolicy />} />
      <Route path="/termos-de-uso" element={<TermsOfUse />} />
      <Route path="/exclusao-de-dados" element={<DataDeletion />} />
      <Route path="/cliente/solicitar" element={<ProtectedRoute roles={["client"]}><ClientDemand /></ProtectedRoute>} />
      <Route path="/cliente/grade" element={<ProtectedRoute roles={["client"]} permission="social.feed"><SocialMedia section="feed" /></ProtectedRoute>} />
      <Route path="/cliente/aprovacao" element={<ProtectedRoute roles={["client"]} permission="tasks.approval"><Tasks /></ProtectedRoute>} />
      <Route path="/cliente/relatorios" element={<ProtectedRoute roles={["client"]} permission="social.reports"><SocialMedia section="relatorios" /></ProtectedRoute>} />
      <Route path="/cliente/materiais" element={<ProtectedRoute roles={["client"]} permission="materials.view"><Materials /></ProtectedRoute>} />
      <Route path="/" element={<ProtectedRoute permission="dashboard.view"><Dashboard /></ProtectedRoute>} />
      <Route path="/aprovacao" element={<ProtectedRoute permission="tasks.approval"><Navigate to="/tarefas?area=aprovacao" replace /></ProtectedRoute>} />
      <Route path="/aprovacao/videos" element={<ProtectedRoute permission="tasks.approval"><Navigate to="/tarefas?area=aprovacao&approval_view=videos" replace /></ProtectedRoute>} />
      <Route path="/aprovacao/videos/:id" element={<ProtectedRoute permission="tasks.approval"><VideoReviewWorkspace /></ProtectedRoute>} />
      <Route path="/calendario" element={<Navigate to="/social-media/feed?view=calendar" replace />} />
      <Route path="/social-media" element={<Navigate to="/social-media/feed" replace />} />
      <Route path="/social-media/feed" element={<ProtectedRoute permission="social.feed"><SocialMedia section="feed" /></ProtectedRoute>} />
      <Route path="/social-media/stories" element={<ProtectedRoute permission="social.stories"><SocialMedia section="stories" /></ProtectedRoute>} />
      <Route path="/social-media/relatorios" element={<ProtectedRoute permission="social.reports"><SocialMedia section="relatorios" /></ProtectedRoute>} />
      <Route path="/feed" element={<ProtectedRoute permission="social.feed"><SocialMediaLegacyRedirect section="feed" /></ProtectedRoute>} />
      <Route path="/stories" element={<ProtectedRoute permission="social.stories"><SocialMediaLegacyRedirect section="stories" /></ProtectedRoute>} />
      <Route
        path="/tarefas"
        element={
          <ProtectedRoute permission="tasks.view">
            <Tasks />
          </ProtectedRoute>
        }
      />
      <Route path="/bussola" element={<ProtectedRoute permission="compass.view"><CompassPage /></ProtectedRoute>} />
      <Route path="/bussola/dme" element={<ProtectedRoute permission="compass.view"><Diagnostics /></ProtectedRoute>} />
      <Route path="/bussola/diagnostico" element={<ProtectedRoute permission="compass.view"><StrategicDiagnosis /></ProtectedRoute>} />
      <Route path="/bussola/briefing-bee-2027" element={<ProtectedRoute permission="compass.view"><BeeCampaignBriefing /></ProtectedRoute>} />
      <Route path="/bussola/pesquisa-familias-bee" element={<ProtectedRoute permission="compass.view"><BeeFamilySurvey /></ProtectedRoute>} />
      <Route path="/bussola/plano-anual" element={<Navigate to="/bussola/diagnostico" replace />} />
      <Route path="/bussola/ciclo-90-dias" element={<Navigate to="/bussola/diagnostico" replace />} />
      <Route path="/bussola/planejamento-mensal" element={<Navigate to="/bussola/diagnostico" replace />} />
      <Route path="/plano-de-acao" element={<Navigate to="/bussola/diagnostico" replace />} />
      <Route path="/diagnostico-estrategico" element={<Navigate to="/bussola/diagnostico" replace />} />
      <Route path="/diagnosticos" element={<Navigate to="/bussola/dme" replace />} />
      <Route path="/plano-anual" element={<Navigate to="/bussola/diagnostico" replace />} />
      <Route path="/ciclo-90-dias" element={<Navigate to="/bussola/diagnostico" replace />} />
      <Route path="/planejamento-mensal" element={<Navigate to="/bussola/diagnostico" replace />} />
      <Route path="/comercial" element={<ProtectedRoute permission="commercial.view"><Sales /></ProtectedRoute>} />
      <Route path="/comercial/funil" element={<ProtectedRoute permission="commercial.view"><CommercialFunnel /></ProtectedRoute>} />
      <Route path="/rematriculas" element={<ProtectedRoute permission="reenrollments.view"><BeeRematriculas /></ProtectedRoute>} />
      <Route path="/relatorios" element={<ProtectedRoute permission="social.reports"><SocialMediaLegacyRedirect section="relatorios" /></ProtectedRoute>} />
      <Route path="/materiais" element={<ProtectedRoute permission="materials.view"><Materials /></ProtectedRoute>} />
      <Route path="/materiais/:id" element={<ProtectedRoute permission="materials.view"><MaterialViewer /></ProtectedRoute>} />
      <Route path="/senhas" element={<Navigate to="/configuracoes/senhas" replace />} />
      <Route
        path="/financeiro"
        element={
          <ProtectedRoute permission="finance.view">
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

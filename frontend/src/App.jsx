import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import TrialSignup from './pages/TrialSignup.jsx';
import TrialExperience from './pages/TrialExperience.jsx';
import Dashboard from './pages/Dashboard.jsx';
import MyWork from './pages/MyWork.jsx';
import Alerts from './pages/Alerts.jsx';
import VideoReviewWorkspace from './pages/VideoReviewWorkspace.jsx';
import Tasks from './pages/Tasks.jsx';
import ClientApproval from './pages/ClientApproval.jsx';
import Radar from './pages/Radar.jsx';
import DesignerApproval from './pages/DesignerApproval.jsx';
import Scheduling from './pages/Scheduling.jsx';
import UnifiedCalendar from './pages/UnifiedCalendar.jsx';
import OperationalIntelligence from './pages/OperationalIntelligence.jsx';
import Automations from './pages/Automations.jsx';
import Moodboard from './pages/Moodboard.jsx';
import SiteLP from './pages/SiteLP.jsx';
import PublicApproval from './pages/PublicApproval.jsx';
import PublicDesignerApproval from './pages/PublicDesignerApproval.jsx';
import PublicFeed from './pages/PublicFeed.jsx';
import PublicPostedReport from './pages/PublicPostedReport.jsx';
import ZebraLeitor from './pages/ZebraLeitor.jsx';
import ZebraLeitorReader from './pages/ZebraLeitorReader.jsx';
import { NarrationProvider } from './context/NarrationContext.jsx';
import PublicSocialMediaFeed from './pages/PublicSocialMediaFeed.jsx';
import PublicPost from './pages/PublicPost.jsx';
import Finance from './pages/Finance.jsx';
import Contracts from './pages/Contracts.jsx';
import Audiovisual from './pages/Audiovisual.jsx';
import ProductDevelopment from './pages/ProductDevelopment.jsx';
import PasswordVault from './pages/PasswordVault.jsx';
import StrategicDiagnosis from './pages/StrategicDiagnosis.jsx';
import Diagnostics from './pages/Diagnostics.jsx';
import CompassPage from './pages/Compass.jsx';
import PublicDiagnostic from './pages/PublicDiagnostic.jsx';
import Sales from './pages/Sales.jsx';
import CommercialFunnel from './pages/CommercialFunnel.jsx';
import CommercialSectionNav from './components/CommercialSectionNav.jsx';
import Materials from './pages/Materials.jsx';
import MaterialViewer from './pages/MaterialViewer.jsx';
import Settings from './pages/Settings.jsx';
import SocialMedia from './pages/SocialMedia.jsx';
import Reports from './pages/Reports.jsx';
import Organizer from './pages/Organizer.jsx';
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
import ClientPortal from './pages/ClientPortal.jsx';
import ClientPortalHome from './pages/ClientPortalHome.jsx';
import { hasPermission } from './permissions.js';
import zebraMark from './assets/zebrazul-mark-dark.png';



function SessionLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--zh-bg)] px-6 text-[#17181C]">
      <div className="text-center">
        <div className="relative mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[22px] bg-white shadow-[0_18px_50px_rgba(23,24,28,0.10)]">
          <img src={zebraMark} alt="" className="h-12 w-12 object-contain" />
          <span className="absolute -bottom-1 -right-1 h-4 w-4 animate-pulse rounded-full bg-[#C9FF2F] ring-4 ring-[#F5F3EE]" />
        </div>
        <p className="text-sm font-black uppercase tracking-[-0.02em]">ARRUMANDO A CASA.</p>
        <p className="mt-1 text-xs text-slate-500">Carregando o ZebraHub...</p>
      </div>
    </div>
  );
}

function DesignerLegacyRedirect() {
  const location = useLocation();
  return <Navigate to={`/designer${location.search || ''}`} replace />;
}

function LegacyAIRedirect() {
  const { user } = useAuth();
  const location = useLocation();
  const params = new URLSearchParams(location.search || '');
  const requested = params.get('view');
  if (requested === 'stories' && hasPermission(user, 'social.stories')) return <Navigate to="/social-media/stories" replace />;
  if (hasPermission(user, 'social.covers')) return <Navigate to="/social-media/capas" replace />;
  if (hasPermission(user, 'social.messages')) return <Navigate to="/social-media/mensagens" replace />;
  if (hasPermission(user, 'social.stories')) return <Navigate to="/social-media/stories" replace />;
  return <Navigate to={fallbackRoute(user)} replace />;
}

function fallbackRoute(user) {
  if (user?.role === 'client') return user?.trial?.is_trial ? '/cliente/experiencia' : '/cliente/inicio';
  if (hasPermission(user, 'dashboard.view')) return '/';
  if (hasPermission(user, 'audiovisual.view')) return '/audiovisual';
  if (hasPermission(user, 'designer.view') && user?.role !== 'client') return '/designer';
  if (hasPermission(user, 'social.messages')) return '/social-media/mensagens';
  if (hasPermission(user, 'social.covers')) return '/social-media/capas';
  if (hasPermission(user, 'social.stories')) return '/social-media/stories';
  if (hasPermission(user, 'social.reports')) return '/relatorios';
  if (hasPermission(user, 'commercial.view')) return '/comercial';
  if (hasPermission(user, 'materials.view')) return '/bussola/materiais';
  return '/configuracoes/aparencia';
}

function ProtectedRoute({ children, roles, platformOnly = false, operationsOnly = false, commercialTeamAllowed = false, commercialAccess = false, permission, trialAllowed = false }) {
  const { user, checkingSession } = useAuth();
  if (checkingSession) return <SessionLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (user?.trial?.is_trial && !trialAllowed) return <Navigate to="/cliente/experiencia" replace />;
  if (permission && !hasPermission(user, permission)) return <Navigate to={fallbackRoute(user)} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={fallbackRoute(user)} replace />;
  if (user.is_commercial_team && !commercialTeamAllowed && !permission) return <Navigate to={fallbackRoute(user)} replace />;
  if (commercialAccess && !(user.role === 'admin' || user.role === 'client' || user.is_commercial_team) && !hasPermission(user, 'commercial.view')) return <Navigate to={fallbackRoute(user)} replace />;
  if (platformOnly && !user.is_platform_owner) return <Navigate to={fallbackRoute(user)} replace />;
  if (operationsOnly && !(user.role === 'admin' || Number(user.is_operations_head) === 1)) return <Navigate to={fallbackRoute(user)} replace />;
  return <Layout>{children}</Layout>;
}

function CommercialPage({ children }) {
  return (
    <>
      <CommercialSectionNav />
      {children}
    </>
  );
}

export default function App() {
  return (
    <NarrationProvider>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/experimentar" element={<TrialSignup />} />
      <Route path="/portal/:token" element={<ClientPortal />} />
      <Route path="/npsbee" element={<PublicBeeFamilySurvey />} />
      <Route path="/aprovar/:token" element={<PublicApproval />} />
      <Route path="/aprovacao-cliente/:token" element={<PublicDesignerApproval />} />
      <Route path="/grade/:token" element={<PublicFeed />} />
      <Route path="/relatorio/:token" element={<PublicPostedReport />} />
      <Route path="/link-social-media/:token" element={<PublicSocialMediaFeed />} />
      <Route path="/post/:token" element={<PublicPost />} />
      <Route path="/diagnostico/:token" element={<PublicDiagnostic />} />
      <Route path="/briefing-bee-2027/:token" element={<PublicBeeCampaignBriefing />} />
      <Route path="/solicitar/:token" element={<PublicTaskRequest />} />
      <Route path="/agenda/:token" element={<PublicTaskCalendar />} />
      <Route path="/politica-de-privacidade" element={<PrivacyPolicy />} />
      <Route path="/termos-de-uso" element={<TermsOfUse />} />
      <Route path="/exclusao-de-dados" element={<DataDeletion />} />
      <Route path="/cliente/experiencia" element={<ProtectedRoute roles={["client"]} trialAllowed><TrialExperience /></ProtectedRoute>} />
      <Route path="/cliente/inicio" element={<ProtectedRoute roles={["client"]}><ClientPortalHome /></ProtectedRoute>} />
      <Route path="/cliente/solicitar" element={<ProtectedRoute roles={["client"]}><ClientDemand /></ProtectedRoute>} />
      <Route path="/cliente/aprovacao" element={<ProtectedRoute roles={["client"]} permission="tasks.approval"><ClientApproval /></ProtectedRoute>} />
      <Route path="/cliente/grade" element={<Navigate to="/cliente/aprovacao" replace />} />
      <Route path="/cliente/relatorios" element={<ProtectedRoute roles={["client"]} permission="social.reports"><Reports /></ProtectedRoute>} />
      <Route path="/cliente/materiais" element={<ProtectedRoute roles={["client"]} permission="materials.view"><Materials /></ProtectedRoute>} />
      <Route path="/cliente/materiais/:id" element={<ProtectedRoute roles={["client"]} permission="materials.view"><MaterialViewer /></ProtectedRoute>} />
      <Route path="/conversas" element={<Navigate to="/" replace />} />
      <Route path="/" element={<ProtectedRoute permission="dashboard.view"><Dashboard /></ProtectedRoute>} />
      <Route path="/minha-fila" element={<ProtectedRoute roles={["admin","team"]} permission="work_queue.view"><MyWork /></ProtectedRoute>} />
      <Route path="/alertas" element={<ProtectedRoute permission="alerts.view"><Alerts /></ProtectedRoute>} />
      <Route path="/aprovacao" element={<ProtectedRoute roles={["admin","team"]} permission="approval.view"><DesignerApproval /></ProtectedRoute>} />
      <Route path="/radar" element={<ProtectedRoute roles={["admin","team"]} permission="radar.view"><Radar /></ProtectedRoute>} />
      <Route path="/cliente/radar" element={<ProtectedRoute roles={["client"]} permission="radar.view" trialAllowed><Radar /></ProtectedRoute>} />
      <Route path="/leitor" element={<ProtectedRoute roles={["admin","team"]} permission="reader.view"><ZebraLeitor /></ProtectedRoute>} />
      <Route path="/leitor/:id" element={<ProtectedRoute roles={["admin","team"]} permission="reader.view"><ZebraLeitorReader /></ProtectedRoute>} />
      <Route path="/agendamento" element={<ProtectedRoute roles={["admin","team"]} permission="scheduling.view"><Scheduling /></ProtectedRoute>} />
      <Route path="/aprovacao/videos" element={<Navigate to="/aprovacao" replace />} />
      <Route path="/aprovacao/videos/:id" element={<Navigate to="/aprovacao" replace />} />
      <Route path="/calendario" element={<ProtectedRoute roles={["admin","team"]} permission="calendar.view"><UnifiedCalendar /></ProtectedRoute>} />
      <Route path="/inteligencia" element={<ProtectedRoute roles={["admin","team"]} permission="intelligence.view"><OperationalIntelligence /></ProtectedRoute>} />
      <Route path="/automacoes" element={<ProtectedRoute roles={["admin","team"]} permission="dashboard.view" operationsOnly><Automations /></ProtectedRoute>} />
      <Route path="/social-media" element={<ProtectedRoute roles={["admin","team"]} permission="social.view"><SocialMedia /></ProtectedRoute>} />
      <Route path="/social-media/feed" element={<Navigate to="/aprovacao" replace />} />
      <Route path="/social-media/mensagens" element={<ProtectedRoute roles={["admin","team"]} permission="social.messages"><SocialMedia section="messages" /></ProtectedRoute>} />
      <Route path="/social-media/capas" element={<ProtectedRoute roles={["admin","team"]} permission="social.covers"><SocialMedia section="covers" /></ProtectedRoute>} />
      <Route path="/social-media/stories" element={<ProtectedRoute roles={["admin","team"]} permission="social.stories"><SocialMedia section="stories" /></ProtectedRoute>} />
      <Route path="/social-media/relatorios" element={<Navigate to="/relatorios" replace />} />
      <Route path="/feed" element={<Navigate to="/aprovacao" replace />} />
      <Route path="/stories" element={<Navigate to="/social-media/stories" replace />} />
      <Route path="/designer" element={<ProtectedRoute roles={["admin","team"]} permission="designer.view"><Tasks workspace="designer" /></ProtectedRoute>} />
      <Route path="/moodboard" element={<ProtectedRoute roles={["admin","team"]} permission="moodboard.view"><Moodboard /></ProtectedRoute>} />
      <Route path="/designer/moodboard" element={<Navigate to="/moodboard" replace />} />
      <Route path="/tarefas" element={<DesignerLegacyRedirect />} />
      <Route path="/site-lp" element={<ProtectedRoute roles={["admin","team"]} permission="site_lp.view"><SiteLP /></ProtectedRoute>} />
      <Route path="/organizacao" element={<ProtectedRoute roles={["admin","team"]} permission="organizer.view"><Organizer /></ProtectedRoute>} />
      <Route path="/audiovisual" element={<ProtectedRoute permission="audiovisual.view"><Audiovisual /></ProtectedRoute>} />
      <Route path="/produto" element={<ProtectedRoute roles={["admin","team"]} permission="product.view"><ProductDevelopment /></ProtectedRoute>} />
      <Route path="/concorrentes" element={<Navigate to="/relatorios?view=concorrentes" replace />} />
      <Route path="/bussola" element={<ProtectedRoute permission="compass.view"><CompassPage /></ProtectedRoute>} />
      <Route path="/ia" element={<ProtectedRoute roles={["admin","team"]} permission="social.view"><LegacyAIRedirect /></ProtectedRoute>} />
      <Route path="/bussola/concorrencia" element={<Navigate to="/relatorios?view=concorrentes" replace />} />
      <Route path="/bussola/dme" element={<Navigate to="/bussola" replace />} />
      <Route path="/bussola/diagnostico" element={<Navigate to="/bussola" replace />} />
      <Route path="/bussola/briefing-bee-2027" element={<ProtectedRoute permission="compass.view"><BeeCampaignBriefing /></ProtectedRoute>} />
      <Route path="/bussola/pesquisa-familias-bee" element={<ProtectedRoute permission="compass.view"><BeeFamilySurvey /></ProtectedRoute>} />
      <Route path="/bussola/materiais" element={<ProtectedRoute permission="materials.view"><Materials /></ProtectedRoute>} />
      <Route path="/bussola/materiais/:id" element={<ProtectedRoute permission="materials.view"><MaterialViewer /></ProtectedRoute>} />
      <Route path="/bussola/plano-anual" element={<Navigate to="/bussola" replace />} />
      <Route path="/bussola/ciclo-90-dias" element={<Navigate to="/bussola" replace />} />
      <Route path="/bussola/planejamento-mensal" element={<Navigate to="/bussola" replace />} />
      <Route path="/plano-de-acao" element={<Navigate to="/bussola" replace />} />
      <Route path="/diagnostico-estrategico" element={<Navigate to="/bussola" replace />} />
      <Route path="/diagnosticos" element={<Navigate to="/bussola" replace />} />
      <Route path="/plano-anual" element={<Navigate to="/bussola" replace />} />
      <Route path="/ciclo-90-dias" element={<Navigate to="/bussola" replace />} />
      <Route path="/planejamento-mensal" element={<Navigate to="/bussola" replace />} />

      <Route path="/comercial" element={<ProtectedRoute permission="commercial.view"><CommercialPage><Sales /></CommercialPage></ProtectedRoute>} />
      <Route path="/comercial/funil" element={<ProtectedRoute permission="commercial.view"><CommercialPage><CommercialFunnel /></CommercialPage></ProtectedRoute>} />
      <Route path="/comercial/contratos" element={<ProtectedRoute permission="commercial.view" platformOnly><CommercialPage><Contracts /></CommercialPage></ProtectedRoute>} />
      <Route path="/contratos" element={<Navigate to="/comercial/contratos" replace />} />

      <Route path="/rematriculas" element={<ProtectedRoute permission="reenrollments.view"><BeeRematriculas /></ProtectedRoute>} />
      <Route path="/relatorios" element={<ProtectedRoute permission="social.reports"><Reports /></ProtectedRoute>} />
      <Route path="/materiais" element={<Navigate to="/bussola/materiais" replace />} />
      <Route path="/materiais/:id" element={<ProtectedRoute permission="materials.view"><MaterialViewer /></ProtectedRoute>} />
      <Route path="/senhas" element={<Navigate to="/configuracoes/senhas" replace />} />
      <Route path="/financeiro" element={<ProtectedRoute permission="finance.view"><Finance /></ProtectedRoute>} />
      <Route path="/configuracoes/:section?" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      <Route path="/clientes" element={<Navigate to="/configuracoes/clientes" replace />} />
      <Route path="/usuarios" element={<Navigate to="/configuracoes/usuarios" replace />} />
      <Route path="/marca" element={<Navigate to="/configuracoes/marca" replace />} />
      <Route path="/agencias" element={<Navigate to="/configuracoes/agencias" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </NarrationProvider>
  );
}

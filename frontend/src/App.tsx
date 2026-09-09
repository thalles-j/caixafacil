import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAppData } from './context/AppDataContext';
import { useAuth } from './context/AuthContext';
import LoadingScreen from './components/LoadingScreen';
import AdminRoute from './components/AdminRoute';

const Layout = lazy(() => import('./components/Layout'));
const Landing = lazy(() => import('./pages/Landing'));
const NotFound = lazy(() => import('./pages/NotFound'));
const Login = lazy(() => import('./pages/Login'));
const Cadastro = lazy(() => import('./pages/Cadastro'));
const RecuperarConta = lazy(() => import('./pages/RecuperarConta'));
const Suporte = lazy(() => import('./pages/Suporte'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Caixa = lazy(() => import('./pages/Caixa'));
const FecharCaixa = lazy(() => import('./pages/FecharCaixa'));
const Catalogo = lazy(() => import('./pages/Catalogo'));
const Financas = lazy(() => import('./pages/Financas'));
const Configuracoes = lazy(() => import('./pages/Configuracoes'));
const ConfiguracoesColaborador = lazy(() => import('./pages/ConfiguracoesColaborador'));
const Movimentacoes = lazy(() => import('./pages/Movimentacoes'));
const RelatoriosCaixa = lazy(() => import('./pages/RelatoriosCaixa'));
const RelatorioPeriodo = lazy(() => import('./pages/RelatorioPeriodo'));
const Relatorios = lazy(() => import('./pages/Relatorios'));
const Fechamentos = lazy(() => import('./pages/Fechamentos'));
const AdminLayout = lazy(() => import('./components/AdminLayout'));
const AdminClients = lazy(() => import('./pages/admin/AdminClients'));
const AdminClientDetail = lazy(() => import('./pages/admin/AdminClientDetail'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'));
const AdminAudit = lazy(() => import('./pages/admin/AdminAudit'));
const AdminTeam = lazy(() => import('./pages/admin/AdminTeam'));
const Operadores = lazy(() => import('./pages/Operadores'));
const Termos = lazy(() => import('./pages/Termos'));
const Privacidade = lazy(() => import('./pages/Privacidade'));
const Negocios = lazy(() => import('./pages/Negocios'));
const ExtratoConsolidado = lazy(() => import('./pages/ExtratoConsolidado'));

export default function App() {
  const { pathname } = useLocation();
  const { isAuthenticated, isInitializing, user } = useAuth();
  const { data, loadedUserId } = useAppData();
  const onboardingConcluido = data.config?.onboardingConcluido ?? false;

  if (isInitializing || (user?.role === 'client' && loadedUserId !== user.tenantId)) {
    if (pathname !== '/' && pathname !== '/login' && pathname !== '/suporte') return null;
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/cadastro" element={<Cadastro />} />
          <Route path="/recuperar-conta" element={<RecuperarConta />} />
          <Route path="/suporte" element={<Suporte />} />
          <Route path="/termos" element={<Termos />} />
          <Route path="/privacidade" element={<Privacidade />} />
          <Route path="/admin/*" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    );
  }

  if (user?.role === 'admin') {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path="/suporte" element={<Suporte />} />
          <Route element={<AdminRoute><AdminLayout /></AdminRoute>}>
            <Route path="/admin" element={<AdminClients />} />
            <Route path="/admin/clients/:id" element={<AdminClientDetail />} />
            <Route path="/admin/configuracoes" element={<AdminSettings />} />
            <Route path="/admin/auditoria" element={<AdminAudit />} />
            <Route path="/admin/equipe" element={user.adminLevel === 'SUPERADMIN' ? <AdminTeam /> : <Navigate to="/admin" replace />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    );
  }

  const owner = user?.tenantRole === 'OWNER';

  if (!onboardingConcluido) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/suporte" element={<Suporte />} />
          <Route path="*" element={<Navigate to="/onboarding" replace />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/suporte" element={<Suporte />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/cadastro" element={<Navigate to="/" replace />} />
        <Route path="/onboarding" element={<Navigate to="/" replace />} />
        <Route element={<Layout />}>
          <Route path="/" element={owner ? <Dashboard /> : <Navigate to="/caixa" replace />} />
          <Route path="/dashboard" element={owner ? <Dashboard /> : <Navigate to="/caixa" replace />} />
          <Route path="/caixa" element={<Caixa />} />
          <Route path="/caixa/fechamento" element={<FecharCaixa />} />
          <Route path="/catalogo" element={<Catalogo />} />
          <Route path="/estoque" element={<Navigate to="/catalogo" replace />} />
          <Route path="/financas" element={owner ? <Financas /> : <Navigate to="/caixa" replace />} />
          <Route path="/movimentacoes" element={owner ? <Movimentacoes modo="todas" /> : <Navigate to="/caixa" replace />} />
          <Route path="/entradas" element={<Movimentacoes modo="vendas" />} />
          <Route path="/vendas" element={<Navigate to="/entradas" replace />} />
          <Route path="/despesas" element={owner ? <Movimentacoes modo="saidas" /> : <Navigate to="/caixa" replace />} />
          <Route path="/fechamentos" element={owner ? <Fechamentos /> : <Navigate to="/caixa" replace />} />
          <Route path="/fechamentos/semanal/:periodo" element={owner ? <RelatorioPeriodo tipo="semanal" /> : <Navigate to="/caixa" replace />} />
          <Route path="/fechamentos/mensal/:periodo" element={owner ? <RelatorioPeriodo tipo="mensal" /> : <Navigate to="/caixa" replace />} />
          <Route path="/fechamentos/:dataRelatorio" element={owner ? <RelatoriosCaixa /> : <Navigate to="/caixa" replace />} />
          <Route path="/relatorios" element={owner ? <Relatorios /> : <Navigate to="/caixa" replace />} />
          <Route path="/relatorios/diario/:dataRelatorio" element={owner ? <RelatoriosCaixa /> : <Navigate to="/caixa" replace />} />
          <Route path="/relatorios/semanal/:periodo" element={owner ? <RelatorioPeriodo tipo="semanal" /> : <Navigate to="/caixa" replace />} />
          <Route path="/relatorios/mensal/:periodo" element={owner ? <RelatorioPeriodo tipo="mensal" /> : <Navigate to="/caixa" replace />} />
          <Route path="/relatorios/consolidado/:tipo/:periodo" element={owner ? <ExtratoConsolidado /> : <Navigate to="/caixa" replace />} />
          <Route path="/configuracoes" element={owner ? <Configuracoes /> : <ConfiguracoesColaborador />} />
          <Route path="/operadores" element={owner ? <Operadores /> : <Navigate to="/caixa" replace />} />
          <Route path="/negocios" element={owner ? <Negocios /> : <Navigate to="/caixa" replace />} />
          <Route path="/termos" element={<Termos />} />
          <Route path="/privacidade" element={<Privacidade />} />
          <Route path="/admin/*" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

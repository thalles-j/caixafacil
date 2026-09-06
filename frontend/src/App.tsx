import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAppData } from './context/AppDataContext';
import { useAuth } from './context/AuthContext';
import LoadingScreen from './components/LoadingScreen';
import AdminRoute from './components/AdminRoute';

const Layout = lazy(() => import('./components/Layout'));
const Landing = lazy(() => import('./pages/Landing'));
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
const Movimentacoes = lazy(() => import('./pages/Movimentacoes'));
const RelatoriosCaixa = lazy(() => import('./pages/RelatoriosCaixa'));
const RelatorioPeriodo = lazy(() => import('./pages/RelatorioPeriodo'));
const Relatorios = lazy(() => import('./pages/Relatorios'));
const Fechamentos = lazy(() => import('./pages/Fechamentos'));
const AdminLayout = lazy(() => import('./components/AdminLayout'));
const AdminClients = lazy(() => import('./pages/admin/AdminClients'));
const AdminClientDetail = lazy(() => import('./pages/admin/AdminClientDetail'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'));

export default function App() {
  const { pathname } = useLocation();
  const { isAuthenticated, isInitializing, user } = useAuth();
  const { data, loadedUserId } = useAppData();
  const onboardingConcluido = data.config?.onboardingConcluido ?? false;

  if (isInitializing || (user && loadedUserId !== user.id)) {
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
          <Route path="/admin/*" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
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
          </Route>
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </Suspense>
    );
  }

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
          <Route path="/" element={<Dashboard />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/caixa" element={<Caixa />} />
          <Route path="/caixa/fechamento" element={<FecharCaixa />} />
          <Route path="/catalogo" element={<Catalogo />} />
          <Route path="/estoque" element={<Navigate to="/catalogo" replace />} />
          <Route path="/financas" element={<Financas />} />
          <Route path="/movimentacoes" element={<Movimentacoes modo="todas" />} />
          <Route path="/entradas" element={<Movimentacoes modo="vendas" />} />
          <Route path="/vendas" element={<Navigate to="/entradas" replace />} />
          <Route path="/despesas" element={<Movimentacoes modo="saidas" />} />
          <Route path="/fechamentos" element={<Fechamentos />} />
          <Route path="/fechamentos/semanal/:periodo" element={<RelatorioPeriodo tipo="semanal" />} />
          <Route path="/fechamentos/mensal/:periodo" element={<RelatorioPeriodo tipo="mensal" />} />
          <Route path="/fechamentos/:dataRelatorio" element={<RelatoriosCaixa />} />
          <Route path="/relatorios" element={<Relatorios />} />
          <Route path="/relatorios/diario/:dataRelatorio" element={<RelatoriosCaixa />} />
          <Route path="/relatorios/semanal/:periodo" element={<RelatorioPeriodo tipo="semanal" />} />
          <Route path="/relatorios/mensal/:periodo" element={<RelatorioPeriodo tipo="mensal" />} />
          <Route path="/configuracoes" element={<Configuracoes />} />
          <Route path="/admin/*" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

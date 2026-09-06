import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import { initObservability } from './lib/observability';

initObservability();
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import { AppDataProvider } from './context/AppDataContext.tsx';
import { AuthProvider } from './context/AuthContext.tsx';
import { initializeTheme } from './lib/theme.ts';

initializeTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <AppDataProvider>
            <App />
          </AppDataProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);

import React, { Suspense, useEffect } from 'react';
import {
  HashRouter as Router,
  Routes,
  Route,
  useLocation,
} from 'react-router-dom';
import IntersectObserver from '@/components/common/IntersectObserver';
import PageLoader from '@/components/common/PageLoader';
import { RouteGuard } from '@/components/common/RouteGuard';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { routes } from './routes';

const APP_TITLE = 'IT Helpdesk';

// Keeps the browser tab title in sync with the current route so it always
// reflects the page the user is on and never retains a previous page's title.
function PageTitleWatcher() {
  const location = useLocation();
  useEffect(() => {
    const rawPath = location.hash.replace(/^#/, '') || location.pathname;
    const path = rawPath || '/';
    const route = routes.find((r) => {
      if (r.path === path) return true;
      if (r.path.includes(':')) {
        const regex = new RegExp(
          '^' + r.path.replace(/:[^/]+/g, '[^/]+') + '$'
        );
        return regex.test(path);
      }
      return false;
    });
    document.title = route ? `${route.name} | ${APP_TITLE}` : APP_TITLE;
  }, [location]);
  return null;
}

const App: React.FC = () => {
  return (
    <Router>
      <ThemeProvider>
      <AuthProvider>
        <IntersectObserver />
        <PageTitleWatcher />
        <Suspense fallback={<PageLoader />}>
          {/* Redirects logged-out users to /login for non-public routes;
              the API remains the authoritative guard. */}
          <RouteGuard>
            <Routes>
              {routes.map((route, index) => (
                <Route key={index} path={route.path} element={route.element} />
              ))}
            </Routes>
          </RouteGuard>
        </Suspense>
        <Toaster theme="light" richColors />
      </AuthProvider>
      </ThemeProvider>
    </Router>
  );
};

export default App;

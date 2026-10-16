import React, { Suspense } from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import IntersectObserver from '@/components/common/IntersectObserver';
import PageLoader from '@/components/common/PageLoader';
import { RouteGuard } from '@/components/common/RouteGuard';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { routes } from './routes';

const App: React.FC = () => {
  return (
    <Router>
      <ThemeProvider>
      <AuthProvider>
        <IntersectObserver />
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

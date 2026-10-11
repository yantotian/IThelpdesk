import React, { Suspense } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import IntersectObserver from '@/components/common/IntersectObserver';
import PageLoader from '@/components/common/PageLoader';
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
          <Routes>
            {routes.map((route, index) => (
              <Route key={index} path={route.path} element={route.element} />
            ))}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        <Toaster theme="light" richColors />
      </AuthProvider>
      </ThemeProvider>
    </Router>
  );
};

export default App;

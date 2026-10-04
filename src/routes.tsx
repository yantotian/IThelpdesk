import { Navigate } from 'react-router-dom';
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import ProfilePage from '@/pages/ProfilePage';
import TicketListPage from '@/pages/TicketListPage';
import CreateTicketPage from '@/pages/CreateTicketPage';
import TicketDetailPage from '@/pages/TicketDetailPage';
import KanbanPage from '@/pages/KanbanPage';
import UsersPage from '@/pages/admin/UsersPage';
import CategoriesPage from '@/pages/admin/CategoriesPage';
import PrioritiesPage from '@/pages/admin/PrioritiesPage';
import SystemConfigPage from '@/pages/admin/SystemConfigPage';
import ReportsPage from '@/pages/admin/ReportsPage';
import AuditLogPage from '@/pages/admin/AuditLogPage';
import TemplatesPage from '@/pages/admin/TemplatesPage';
import IDRequestPage from '@/pages/IDRequestPage';
import IDRequestsAdminPage from '@/pages/admin/IDRequestsAdminPage';
import ICTInventoryPage from '@/pages/admin/ICTInventoryPage';
import ICTDashboardPage from '@/pages/admin/ICTDashboardPage';
import ICTSubmissionPage from '@/pages/ICTSubmissionPage';
import ICTSubmissionsReviewPage from '@/pages/admin/ICTSubmissionsReviewPage';
import type { ReactNode } from 'react';

export interface RouteConfig {
  name: string;
  path: string;
  element: ReactNode;
  public?: boolean;
}

export const routes: RouteConfig[] = [
  { name: 'Home',                   path: '/',                          element: <Navigate to="/dashboard" replace />, public: true },
  { name: 'Login',                  path: '/login',                     element: <LoginPage />,                  public: true },
  { name: 'Dashboard',              path: '/dashboard',                 element: <DashboardPage /> },
  { name: 'Tickets',                path: '/tickets',                   element: <TicketListPage /> },
  { name: 'New Ticket',             path: '/tickets/new',               element: <CreateTicketPage /> },
  { name: 'Ticket Detail',          path: '/tickets/:id',               element: <TicketDetailPage /> },
  { name: 'Kanban',                 path: '/kanban',                    element: <KanbanPage /> },
  { name: 'Reports',                path: '/reports',                   element: <ReportsPage /> },
  { name: 'Users',                  path: '/admin/users',               element: <UsersPage /> },
  { name: 'Categories',             path: '/admin/categories',          element: <CategoriesPage /> },
  { name: 'Priorities',             path: '/admin/priorities',          element: <PrioritiesPage /> },
  { name: 'Config',                 path: '/admin/config',              element: <SystemConfigPage /> },
  { name: 'Audit Log',              path: '/admin/audit',               element: <AuditLogPage /> },
  { name: 'Templates',              path: '/admin/templates',           element: <TemplatesPage /> },
  { name: 'Profile',                path: '/profile',                   element: <ProfilePage /> },
  { name: 'ID Request',             path: '/id-request',                element: <IDRequestPage /> },
  { name: 'ID Requests',            path: '/admin/id-requests',         element: <IDRequestsAdminPage /> },
  { name: 'ICT Inventory',          path: '/admin/ict-inventory',       element: <ICTInventoryPage /> },
  { name: 'ICT Dashboard',          path: '/admin/ict-dashboard',       element: <ICTDashboardPage /> },
  { name: 'Submit Inventory',       path: '/ict-submission',            element: <ICTSubmissionPage /> },
  { name: 'Inventory Submissions',  path: '/admin/ict-submissions',     element: <ICTSubmissionsReviewPage /> },
];



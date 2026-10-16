import { Navigate } from 'react-router-dom';
import { lazy, type ReactNode } from 'react';

const LoginPage = lazy(() => import('@/pages/LoginPage'));
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const ProfilePage = lazy(() => import('@/pages/ProfilePage'));
const TicketListPage = lazy(() => import('@/pages/TicketListPage'));
const CreateTicketPage = lazy(() => import('@/pages/CreateTicketPage'));
const TicketDetailPage = lazy(() => import('@/pages/TicketDetailPage'));
const KanbanPage = lazy(() => import('@/pages/KanbanPage'));
const UsersPage = lazy(() => import('@/pages/admin/UsersPage'));
const CategoriesPage = lazy(() => import('@/pages/admin/CategoriesPage'));
const PrioritiesPage = lazy(() => import('@/pages/admin/PrioritiesPage'));
const SystemConfigPage = lazy(() => import('@/pages/admin/SystemConfigPage'));
const ReportsPage = lazy(() => import('@/pages/admin/ReportsPage'));
const AuditLogPage = lazy(() => import('@/pages/admin/AuditLogPage'));
const TemplatesPage = lazy(() => import('@/pages/admin/TemplatesPage'));
const IDRequestPage = lazy(() => import('@/pages/IDRequestPage'));
const IDRequestsAdminPage = lazy(() => import('@/pages/admin/IDRequestsAdminPage'));
const ICTInventoryPage = lazy(() => import('@/pages/admin/ICTInventoryPage'));
const ICTDashboardPage = lazy(() => import('@/pages/admin/ICTDashboardPage'));
const VenueBookingPage = lazy(() => import('@/pages/VenueBookingPage'));
const VenuesPage = lazy(() => import('@/pages/admin/VenuesPage'));
const VenueBookingsReviewPage = lazy(() => import('@/pages/admin/VenueBookingsReviewPage'));
const NotFound = lazy(() => import('@/pages/NotFound'));

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
  { name: 'Venue Booking',          path: '/venues',                    element: <VenueBookingPage /> },
  { name: 'Venues',                 path: '/admin/venues',              element: <VenuesPage /> },
  { name: 'Booking Approvals',      path: '/admin/venue-bookings',      element: <VenueBookingsReviewPage /> },
  // Catch-all. Deliberately NOT marked public: RouteGuard's wildcard matcher
  // would treat `*` as matching every path and silently disable the guard.
  { name: 'Not Found',              path: '*',                          element: <NotFound /> },
];

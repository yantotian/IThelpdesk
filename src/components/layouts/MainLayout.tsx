import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import GlobalSearch from '@/components/common/GlobalSearch';
import NotificationBell from '@/components/common/NotificationBell';
import { cn } from '@/lib/utils';
import {
  Menu, X, LayoutDashboard, Ticket, KanbanSquare, IdCard,
  MonitorSmartphone, ClipboardList, Users, FolderTree, SlidersHorizontal,
  Settings, ScrollText, BookTemplate, ServerCog, Send, LogOut, Wrench,
} from 'lucide-react';
import type { UserRole } from '@/types/types';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  roles: UserRole[];
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'GENERAL',
    items: [
      { to: '/dashboard', label: 'DASHBOARD', icon: <LayoutDashboard className="w-4 h-4" />, roles: ['requester', 'technician', 'it_admin', 'sysadmin'] },
      { to: '/tickets', label: 'TICKETS', icon: <Ticket className="w-4 h-4" />, roles: ['requester', 'technician', 'it_admin', 'sysadmin'] },
      { to: '/tickets/new', label: 'NEW TICKET', icon: <ClipboardList className="w-4 h-4" />, roles: ['requester', 'it_admin', 'sysadmin'] },
      { to: '/kanban', label: 'KANBAN', icon: <KanbanSquare className="w-4 h-4" />, roles: ['technician', 'it_admin', 'sysadmin'] },
      { to: '/reports', label: 'REPORTS', icon: <SlidersHorizontal className="w-4 h-4" />, roles: ['it_admin', 'sysadmin'] },
    ],
  },
  {
    title: 'INVENTORY',
    items: [
      { to: '/id-request', label: 'ID REQUEST', icon: <IdCard className="w-4 h-4" />, roles: ['requester', 'it_admin', 'sysadmin'] },
      { to: '/ict-submission', label: 'SUBMIT INVENTORY', icon: <Send className="w-4 h-4" />, roles: ['requester', 'it_admin', 'sysadmin'] },
      { to: '/admin/ict-dashboard', label: 'ICT DASHBOARD', icon: <ServerCog className="w-4 h-4" />, roles: ['it_admin', 'sysadmin'] },
    ],
  },
  {
    title: 'ADMINISTRATION',
    items: [
      { to: '/admin/users', label: 'USERS', icon: <Users className="w-4 h-4" />, roles: ['sysadmin'] },
      { to: '/admin/categories', label: 'CATEGORIES', icon: <FolderTree className="w-4 h-4" />, roles: ['it_admin', 'sysadmin'] },
      { to: '/admin/priorities', label: 'PRIORITIES', icon: <SlidersHorizontal className="w-4 h-4" />, roles: ['it_admin', 'sysadmin'] },
      { to: '/admin/config', label: 'SYSTEM CONFIG', icon: <Settings className="w-4 h-4" />, roles: ['it_admin', 'sysadmin'] },
      { to: '/admin/audit', label: 'AUDIT LOG', icon: <ScrollText className="w-4 h-4" />, roles: ['it_admin', 'sysadmin'] },
      { to: '/admin/templates', label: 'TEMPLATES', icon: <BookTemplate className="w-4 h-4" />, roles: ['it_admin', 'sysadmin'] },
      { to: '/admin/id-requests', label: 'ID REQUESTS', icon: <IdCard className="w-4 h-4" />, roles: ['it_admin', 'sysadmin'] },
      { to: '/admin/ict-inventory', label: 'ICT INVENTORY', icon: <MonitorSmartphone className="w-4 h-4" />, roles: ['it_admin', 'sysadmin'] },
      { to: '/admin/ict-submissions', label: 'SUBMISSIONS', icon: <Wrench className="w-4 h-4" />, roles: ['it_admin', 'sysadmin'] },
    ],
  },
];

const ROLE_LABELS: Record<UserRole, string> = {
  requester: 'REQUESTER',
  technician: 'TECHNICIAN',
  it_admin: 'IT ADMIN',
  sysadmin: 'SYSTEM ADMIN',
};

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, role, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login', { replace: true });
    }
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const groups = NAV_GROUPS.map(g => ({
    ...g,
    items: g.items.filter(i => role && i.roles.includes(role)),
  })).filter(g => g.items.length > 0);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  const sidebar = (
    <div className="flex flex-col h-full bg-sidebar border-r border-sidebar-border">
      {/* Brand */}
      <div className="px-5 py-4 border-b border-sidebar-border flex items-center gap-2">
        <div className="w-8 h-8 bg-primary flex items-center justify-center hud-glow">
          <Wrench className="w-4 h-4 text-primary-foreground" />
        </div>
        <div>
          <div className="mono text-sm text-sidebar-foreground leading-none">IT HELPDESK</div>
          <div className="mono text-[9px] text-muted-foreground tracking-[0.25em] mt-1">TICKETING SYSTEM</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {groups.map(group => (
          <div key={group.title}>
            <div className="mono text-[9px] text-muted-foreground tracking-[0.2em] px-3 mb-2">{group.title}</div>
            <div className="space-y-1">
              {group.items.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 px-3 py-2 text-xs transition-colors border-l-2',
                      isActive
                        ? 'bg-sidebar-primary/10 text-primary border-sidebar-primary'
                        : 'text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent border-transparent'
                    )
                  }
                >
                  {item.icon}
                  <span className="mono tracking-wide">{item.label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div className="p-3 border-t border-sidebar-border">
        <div className="flex items-center gap-3 p-3 bg-card border border-border">
          <div className="w-8 h-8 bg-primary/15 flex items-center justify-center shrink-0">
            <span className="mono text-xs text-primary">{(profile?.full_name || profile?.username || '?').charAt(0).toUpperCase()}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="mono text-xs text-foreground truncate">{profile?.full_name || profile?.username}</div>
            <div className="mono text-[9px] text-muted-foreground truncate">{role ? ROLE_LABELS[role] : ''}</div>
          </div>
          <button
            onClick={handleSignOut}
            className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:block w-60 shrink-0 border-r border-sidebar-border sticky top-0 h-screen">
        {sidebar}
      </aside>

      {/* Mobile sidebar */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="w-60 h-full shrink-0">{sidebar}</div>
          <div
            className="flex-1 bg-black/50"
            onClick={() => setSidebarOpen(false)}
          />
        </div>
      )}

      {/* Main column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-40 bg-card/95 backdrop-blur border-b border-border flex items-center gap-3 px-4 h-14">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden flex items-center justify-center w-8 h-8 border border-border text-muted-foreground hover:text-primary transition-colors"
          >
            <Menu className="w-4 h-4" />
          </button>

          <GlobalSearch />
          <div className="flex-1" />
          <NotificationBell />

          <NavLink
            to="/profile"
            className="flex items-center gap-2 border border-border px-2 py-1 bg-secondary hover:border-primary transition-colors"
          >
            <div className="w-6 h-6 bg-primary/15 flex items-center justify-center">
              <span className="mono text-[10px] text-primary">{(profile?.full_name || profile?.username || '?').charAt(0).toUpperCase()}</span>
            </div>
            <span className="mono text-xs text-muted-foreground hidden sm:block">{profile?.username}</span>
          </NavLink>
        </header>

        {/* Content */}
        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
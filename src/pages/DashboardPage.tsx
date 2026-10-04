import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import MainLayout from '@/components/layouts/MainLayout';
import { StatusBadge, PriorityBadge, SLAIndicator } from '@/components/common/Badges';
import { getDashboardStats, getTechnicianWorkload, getRecentActivity, getTickets } from '@/lib/api';
import { TicketStatus, TicketPriority } from '@/types/types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { PlusCircle, AlertTriangle, Clock, CheckCircle, Ticket, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatUtc8Stamp } from '@/lib/utils';

const STATUS_ORDER: TicketStatus[] = ['new', 'assigned', 'in_progress', 'resolved', 'on_hold', 'verified', 'closed'];
// Colors are referenced via CSS variables so they adapt to light/dark mode.
// We read them at render time from the root element.
function getCssVar(name: string) {
  if (typeof window === 'undefined') return '#888';
  return `hsl(${getComputedStyle(document.documentElement).getPropertyValue(name).trim()})`;
}
function getStatusColors() {
  return {
    new: getCssVar('--status-new'),
    assigned: getCssVar('--status-assigned'),
    in_progress: getCssVar('--status-in-progress'),
    resolved: getCssVar('--status-resolved'),
    on_hold: getCssVar('--status-on-hold'),
    verified: getCssVar('--status-verified'),
    closed: getCssVar('--status-closed'),
  };
}
function getPriorityColors() {
  return {
    low: getCssVar('--priority-low'),
    medium: getCssVar('--priority-medium'),
    high: getCssVar('--priority-high'),
    critical: getCssVar('--priority-critical'),
  };
}

function StatCard({ label, value, icon, accent = false }: {
  label: string; value: string | number; icon: React.ReactNode; accent?: boolean
}) {
  return (
    <div className={`border p-5 bg-card ${accent ? 'border-primary/50' : 'border-border'}`}>
      <div className="flex items-start justify-between mb-3">
        <span className="mono text-[10px] text-muted-foreground tracking-widest">{label}</span>
        <span className={accent ? 'text-primary' : 'text-muted-foreground'}>{icon}</span>
      </div>
      <div className={`mono text-3xl font-bold ${accent ? 'text-primary' : 'text-foreground'}`}>{value}</div>
    </div>
  );
}

export default function DashboardPage() {
  const { profile, role } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [workload, setWorkload] = useState<any[]>([]);
  const [recent, setRecent] = useState<any[]>([]);
  const [slaTickets, setSlaTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    setLoading(true);
    const fetchAll = async () => {
      const [s, a] = await Promise.all([
        getDashboardStats(profile.id, role || undefined).catch(() => null),
        getRecentActivity(10).catch(() => []),
      ]);
      setStats(s);
      setRecent(a);

      if (role === 'it_admin' || role === 'sysadmin') {
        const [wl, sla] = await Promise.all([
          getTechnicianWorkload().catch(() => []),
          getTickets({ status: undefined }, 0, 20).then(t =>
            t.filter(tk => tk.sla_breached || (tk.sla_due_at && new Date(tk.sla_due_at) < new Date()))
          ).catch(() => []),
        ]);
        setWorkload(wl);
        setSlaTickets(sla);
      } else if (role === 'technician') {
        const sla = await getTickets({ assigned_to: profile.id }, 0, 50)
          .then(t => t.filter(tk => tk.sla_breached || (tk.sla_due_at && new Date(tk.sla_due_at) < new Date())))
          .catch(() => []);
        setSlaTickets(sla);
      }
      setLoading(false);
    };
    fetchAll();
  }, [profile, role]);

  if (loading || !stats) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <span className="mono text-primary text-sm animate-pulse">LOADING DASHBOARD...</span>
        </div>
      </MainLayout>
    );
  }

  const statusColors = getStatusColors();
  const priorityColors = getPriorityColors();
  const tickColor = getCssVar('--chart-tick');
  const tooltipBg = getCssVar('--chart-tooltip-bg');
  const tooltipBorder = getCssVar('--chart-tooltip-border');
  const tooltipText = getCssVar('--foreground');

  const statusChartData = STATUS_ORDER.map(s => ({
    name: s.replace('_', ' ').toUpperCase(),
    count: stats.by_status[s] || 0,
    color: statusColors[s as keyof typeof statusColors],
  })).filter(d => d.count > 0);

  const priorityChartData = (['critical', 'high', 'medium', 'low'] as TicketPriority[]).map(p => ({
    name: p.toUpperCase(),
    count: stats.by_priority[p] || 0,
    color: priorityColors[p as keyof typeof priorityColors],
  })).filter(d => d.count > 0);

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="laser-line mb-3 w-32" />
            <h1 className="mono text-xl text-foreground">
              WELCOME, <span className="text-primary">{(profile?.full_name || profile?.username || '').toUpperCase()}</span>
            </h1>
            <p className="text-muted-foreground text-xs mono mt-1">
              {formatUtc8Stamp(new Date())} +08:00
            </p>
          </div>
          {(role === 'requester' || role === 'it_admin' || role === 'sysadmin') && (
            <Button asChild className="bg-primary text-primary-foreground mono text-xs hud-press">
              <Link to="/tickets/new"><PlusCircle className="w-4 h-4 mr-2" />NEW TICKET</Link>
            </Button>
          )}
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="TOTAL TICKETS" value={stats.total} icon={<Ticket className="w-4 h-4" />} />
          <StatCard label="OPEN TICKETS" value={stats.open} icon={<Clock className="w-4 h-4" />} />
          <StatCard label="SLA BREACHED" value={stats.sla_breached} icon={<AlertTriangle className="w-4 h-4" />} accent={stats.sla_breached > 0} />
          <StatCard label="CLOSED" value={stats.by_status?.closed || 0} icon={<CheckCircle className="w-4 h-4" />} />
        </div>

        {/* SLA Breach Alert */}
        {slaTickets.length > 0 && (
          <div className="border border-primary/50 bg-primary/5 p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-primary shrink-0" />
              <span className="mono text-xs text-primary tracking-widest">SLA BREACH ALERTS ({slaTickets.length})</span>
            </div>
            <div className="space-y-2">
              {slaTickets.slice(0, 5).map(t => (
                <div key={t.id} className="flex items-center justify-between gap-4 text-xs border-b border-border/30 pb-2">
                  <Link to={`/tickets/${t.id}`} className="mono text-primary hover:underline shrink-0">{t.ticket_number}</Link>
                  <span className="text-foreground min-w-0 truncate">{t.subject}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <PriorityBadge priority={t.priority} />
                    <SLAIndicator slaBreached={t.sla_breached} slaDue={t.sla_due_at} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          {/* Status Chart */}
          {statusChartData.length > 0 && (
            <div className="border border-border bg-card p-5">
              <div className="mono text-xs text-muted-foreground tracking-widest mb-4">TICKETS BY STATUS</div>
              <div className="w-full min-w-0 overflow-hidden" style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statusChartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: tickColor, fontFamily: 'Inter, sans-serif' }} />
                    <YAxis tick={{ fontSize: 9, fill: tickColor, fontFamily: 'Inter, sans-serif' }} />
                    <Tooltip
                      contentStyle={{ background: tooltipBg, border: `1px solid ${tooltipBorder}`, fontSize: 11, fontFamily: 'Inter, sans-serif', color: tooltipText }}
                      cursor={{ fill: 'hsl(var(--muted) / 0.4)' }}
                    />
                    <Bar dataKey="count" radius={0}>
                      {statusChartData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Priority Chart */}
          {priorityChartData.length > 0 && (
            <div className="border border-border bg-card p-5">
              <div className="mono text-xs text-muted-foreground tracking-widest mb-4">TICKETS BY PRIORITY</div>
              <div className="w-full min-w-0 overflow-hidden" style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={priorityChartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: tickColor, fontFamily: 'Inter, sans-serif' }} />
                    <YAxis tick={{ fontSize: 9, fill: tickColor, fontFamily: 'Inter, sans-serif' }} />
                    <Tooltip
                      contentStyle={{ background: tooltipBg, border: `1px solid ${tooltipBorder}`, fontSize: 11, fontFamily: 'Inter, sans-serif', color: tooltipText }}
                      cursor={{ fill: 'hsl(var(--muted) / 0.4)' }}
                    />
                    <Bar dataKey="count" radius={0}>
                      {priorityChartData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>

        {/* Technician Workload (admin only) */}
        {(role === 'it_admin' || role === 'sysadmin') && workload.length > 0 && (
          <div className="border border-border bg-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span className="mono text-xs text-muted-foreground tracking-widest">TECHNICIAN WORKLOAD</span>
            </div>
            <div className="space-y-2">
              {workload.sort((a, b) => b.active_tickets - a.active_tickets).map(t => (
                <div key={t.id} className="flex items-center gap-3">
                  <span className="mono text-xs text-foreground w-32 truncate shrink-0">{t.full_name || t.username}</span>
                  <div className="flex-1 bg-secondary h-2 min-w-0">
                    <div
                      className="h-2 bg-primary transition-all"
                      style={{ width: `${Math.min((t.active_tickets / 20) * 100, 100)}%` }}
                    />
                  </div>
                  <span className="mono text-xs text-muted-foreground w-8 text-right shrink-0">{t.active_tickets}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Activity */}
        {recent.length > 0 && (
          <div className="border border-border bg-card p-5">
            <div className="mono text-xs text-muted-foreground tracking-widest mb-4">RECENT ACTIVITY</div>
            <div className="space-y-2">
              {recent.map((a: any) => (
                <div key={a.id} className="flex items-start gap-3 text-xs border-b border-border/30 pb-2">
                  <span className="mono text-muted-foreground shrink-0 mt-0.5">
                    {formatUtc8Stamp(a.created_at, 5)}
                  </span>
                  <span className="text-foreground min-w-0">
                    <span className="text-primary">{a.actor?.full_name || a.actor?.username || 'System'}</span>
                    {' — '}{a.content || a.activity_type}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}

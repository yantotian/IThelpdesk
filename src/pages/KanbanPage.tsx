import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import MainLayout from '@/components/layouts/MainLayout';
import { PriorityBadge, SLAIndicator } from '@/components/common/Badges';
import { getTickets, updateTicketStatus } from '@/lib/api';
import type { Ticket, TicketStatus } from '@/types/types';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

const COLUMNS: { status: TicketStatus; label: string; color: string }[] = [
  { status: 'new',         label: 'NEW',         color: 'border-blue-500' },
  { status: 'assigned',    label: 'ASSIGNED',     color: 'border-yellow-500' },
  { status: 'in_progress', label: 'IN PROGRESS',  color: 'border-cyan-500' },
  { status: 'on_hold',     label: 'ON HOLD',      color: 'border-purple-500' },
  { status: 'resolved',    label: 'RESOLVED',     color: 'border-green-500' },
  { status: 'verified',    label: 'VERIFIED',     color: 'border-emerald-500' },
  { status: 'closed',      label: 'CLOSED',       color: 'border-muted' },
];

// Determine if role can move a ticket from one column to another
function canMove(role: string | null, ticket: Ticket, newStatus: TicketStatus): boolean {
  if (role === 'it_admin' || role === 'sysadmin') return ticket.status !== newStatus;
  if (role === 'technician') {
    const allowed: Record<TicketStatus, TicketStatus[]> = {
      assigned: ['in_progress'],
      in_progress: ['resolved', 'on_hold'],
      on_hold: ['in_progress'],
      resolved: ['closed'],
      verified: ['closed'],
      new: [], closed: [],
    };
    return (allowed[ticket.status] || []).includes(newStatus);
  }
  return false;
}

function KanbanCard({
  ticket, role, onDrop, onDragStart
}: {
  ticket: Ticket;
  role: string | null;
  onDrop?: (ticketId: string, newStatus: TicketStatus) => void;
  onDragStart?: (ticketId: string) => void;
}) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart?.(ticket.id)}
      className="border border-border bg-secondary p-3 cursor-grab active:cursor-grabbing hover:border-primary/50 transition-colors"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <Link to={`/tickets/${ticket.id}`} className="mono text-[10px] text-primary hover:underline shrink-0">
          {ticket.ticket_number}
        </Link>
        <PriorityBadge priority={ticket.priority} />
      </div>
      <p className="text-xs text-foreground leading-snug line-clamp-2 mb-2">{ticket.subject}</p>
      <div className="flex items-center justify-between">
        <span className="mono text-[10px] text-muted-foreground truncate">
          {ticket.assignee?.full_name || ticket.assignee?.username || 'Unassigned'}
        </span>
        <SLAIndicator slaBreached={ticket.sla_breached} slaDue={ticket.sla_due_at} />
      </div>
    </div>
  );
}

export default function KanbanPage() {
  const { profile, role } = useAuth();
  const [ticketMap, setTicketMap] = useState<Record<TicketStatus, Ticket[]>>({} as any);
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<TicketStatus | null>(null);

  const fetchAll = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const filters = role === 'technician' ? { assigned_to: profile.id } : {};
      const tickets = await getTickets(filters, 0, 200);
      const map: Record<string, Ticket[]> = {};
      COLUMNS.forEach(c => { map[c.status] = []; });
      tickets.forEach(t => { if (map[t.status]) map[t.status].push(t); });
      setTicketMap(map as any);
    } catch (e: any) { toast.error(e.message); }
    setLoading(false);
  }, [profile, role]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleDrop = async (newStatus: TicketStatus) => {
    if (!dragging || !profile) return;
    const allTickets = Object.values(ticketMap).flat();
    const ticket = allTickets.find(t => t.id === dragging);
    if (!ticket) return;
    if (ticket.status === newStatus) { setDragging(null); setDragOver(null); return; }
    if (!canMove(role, ticket, newStatus)) {
      toast.error('You cannot move this ticket to that column');
      setDragging(null); setDragOver(null); return;
    }
    try {
      await updateTicketStatus(ticket.id, newStatus, profile.id, ticket.status);
      toast.success(`Moved to ${newStatus.replace('_', ' ')}`);
      await fetchAll();
    } catch (e: any) { toast.error(e.message); }
    setDragging(null); setDragOver(null);
  };

  return (
    <MainLayout>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="laser-line mb-2 w-24" />
            <h1 className="mono text-lg text-foreground">KANBAN BOARD</h1>
            {role === 'technician' && <p className="mono text-xs text-muted-foreground">YOUR ASSIGNED TICKETS</p>}
          </div>
          <Button size="sm" variant="ghost" onClick={fetchAll} className="border border-border mono text-xs">
            <RefreshCw className="w-3 h-3 mr-1" />REFRESH
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <span className="mono text-primary text-sm animate-pulse">LOADING BOARD...</span>
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-4">
            {COLUMNS.map(col => {
              const colTickets = ticketMap[col.status] || [];
              return (
                <div
                  key={col.status}
                  className={`flex-none w-52 border-t-2 ${col.color} ${
                    dragOver === col.status ? 'bg-primary/5 border border-primary/30' : 'bg-card border-x border-b border-border'
                  }`}
                  onDragOver={e => { e.preventDefault(); setDragOver(col.status); }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={() => handleDrop(col.status)}
                >
                  {/* Column header */}
                  <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                    <span className="mono text-[10px] tracking-widest text-muted-foreground">{col.label}</span>
                    <span className="mono text-[10px] text-primary">{colTickets.length}</span>
                  </div>

                  {/* Cards */}
                  <div className="p-2 space-y-2 min-h-[120px] overflow-y-auto max-h-[calc(100vh-220px)]">
                    {colTickets.length === 0 ? (
                      <div className="flex items-center justify-center h-16">
                        <span className="mono text-[10px] text-muted-foreground/50">EMPTY</span>
                      </div>
                    ) : colTickets.map(t => (
                      <KanbanCard
                        key={t.id}
                        ticket={t}
                        role={role}
                        onDragStart={id => setDragging(id)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </MainLayout>
  );
}

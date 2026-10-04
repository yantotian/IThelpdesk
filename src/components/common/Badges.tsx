import { cn } from '@/lib/utils';
import type { TicketStatus, TicketPriority } from '@/types/types';

const STATUS_CONFIG: Record<TicketStatus, { label: string; cls: string }> = {
  new:         { label: 'NEW',         cls: 'status-new' },
  assigned:    { label: 'ASSIGNED',    cls: 'status-assigned' },
  in_progress: { label: 'IN PROGRESS', cls: 'status-in_progress' },
  resolved:    { label: 'RESOLVED',    cls: 'status-resolved' },
  on_hold:     { label: 'ON HOLD',     cls: 'status-on_hold' },
  verified:    { label: 'VERIFIED',    cls: 'status-verified' },
  closed:      { label: 'CLOSED',      cls: 'status-closed' },
};

const PRIORITY_CONFIG: Record<TicketPriority, { label: string; cls: string }> = {
  low:      { label: 'LOW',      cls: 'text-muted-foreground border-muted-foreground' },
  medium:   { label: 'MEDIUM',   cls: 'text-blue-400 border-blue-500' },
  high:     { label: 'HIGH',     cls: 'text-yellow-400 border-yellow-500' },
  critical: { label: 'CRITICAL', cls: 'text-primary border-primary' },
};

export function StatusBadge({ status }: { status: TicketStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={cn('mono text-[10px] border px-1.5 py-0.5 inline-block', cfg.cls)}>
      {cfg.label}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  const cfg = PRIORITY_CONFIG[priority];
  return (
    <span className={cn('mono text-[10px] border px-1.5 py-0.5 inline-block', cfg.cls)}>
      {cfg.label}
    </span>
  );
}

export function SLAIndicator({ slaBreached, slaDue }: { slaBreached: boolean; slaDue: string | null }) {
  if (!slaDue) return null;
  const due = new Date(slaDue);
  const now = new Date();
  const diffH = (due.getTime() - now.getTime()) / 3600000;

  if (slaBreached || diffH < 0) {
    return <span className="mono text-[10px] text-primary border border-primary px-1.5 py-0.5">BREACHED</span>;
  }
  if (diffH < 1) {
    return <span className="mono text-[10px] text-yellow-400 border border-yellow-500 px-1.5 py-0.5">SLA &lt;1H</span>;
  }
  if (diffH < 4) {
    return <span className="mono text-[10px] text-yellow-400 border border-yellow-400/60 px-1.5 py-0.5">SLA {Math.ceil(diffH)}H</span>;
  }
  return null;
}

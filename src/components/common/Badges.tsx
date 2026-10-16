import type { ReactNode } from 'react';
import { CheckCircle, Clock, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TicketStatus, TicketPriority, VenueBookingStatus } from '@/types/types';

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

// ── Status pill primitive ────────────────────────────────────────────────────
// Every status chip in the app renders through StatusPill so the shared pill
// styling (mono / text-[10px] / border / padding) lives in exactly one place.
// Each domain below keeps only its status → class map plus its label/icon
// rules, so a chip's rendered classes stay identical to the old per-page code.
function StatusPill({ label, className, icon }: {
  label: string;
  className?: string;
  icon?: ReactNode;
}) {
  const layout = icon ? 'inline-flex items-center gap-1 ' : '';
  return (
    <span className={`${layout}mono text-[10px] border px-1.5 py-0.5 ${className ?? 'border-border text-muted-foreground'}`}>
      {icon ? <>{icon} {label}</> : label}
    </span>
  );
}

// ── ID request statuses (public form + admin list) ───────────────────────────
const ID_REQUEST_STYLES: Record<string, string> = {
  pending:  'border-yellow-500 text-yellow-600',
  approved: 'border-green-500 text-green-600',
  rejected: 'border-red-500 text-red-600',
};
const ID_REQUEST_ICONS: Record<string, ReactNode> = {
  pending:  <Clock className="w-3 h-3" />,
  approved: <CheckCircle className="w-3 h-3" />,
  rejected: <XCircle className="w-3 h-3" />,
};
export function IDRequestStatusBadge({ status }: { status: string }) {
  return (
    <StatusPill
      label={status.toUpperCase()}
      className={ID_REQUEST_STYLES[status]}
      icon={ID_REQUEST_ICONS[status]}
    />
  );
}

// ── Venue booking statuses (booking page + approval queue) ───────────────────
const VENUE_BOOKING_STYLES: Record<VenueBookingStatus, string> = {
  pending:   'border-yellow-500 text-yellow-600',
  approved:  'border-green-500 text-green-600',
  rejected:  'border-red-500 text-red-600',
  cancelled: 'border-border text-muted-foreground',
};
export function VenueBookingStatusBadge({ status }: { status: VenueBookingStatus }) {
  return <StatusPill label={status.toUpperCase()} className={VENUE_BOOKING_STYLES[status]} />;
}

// ── ICT device statuses ──────────────────────────────────────────────────────
const ICT_DEVICE_STYLES: Record<string, string> = {
  active:       'border-green-500 text-green-600',
  inactive:     'border-gray-400 text-gray-500',
  under_repair: 'border-yellow-500 text-yellow-600',
  retired:      'border-red-400 text-red-500',
  suspended:    'border-orange-400 text-orange-500',
};
export function ICTDeviceStatusBadge({ status }: { status: string }) {
  return (
    <StatusPill
      label={status.replace(/_/g, ' ').toUpperCase()}
      className={ICT_DEVICE_STYLES[status]}
    />
  );
}

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import MainLayout from '@/components/layouts/MainLayout';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { getVenues, getVenueBookings, reviewVenueBooking } from '@/lib/api';
import type { Venue, VenueBooking, VenueBookingStatus } from '@/types/types';
import { formatDateRange } from '@/lib/utils';
import { RefreshCw, CheckCircle, XCircle, CalendarDays, MapPin } from 'lucide-react';

function StatusBadge({ status }: { status: VenueBookingStatus }) {
  const map: Record<VenueBookingStatus, string> = {
    pending: 'border-yellow-500 text-yellow-600',
    approved: 'border-green-500 text-green-600',
    rejected: 'border-red-500 text-red-600',
    cancelled: 'border-border text-muted-foreground',
  };
  return (
    <span className={`mono text-[10px] border px-1.5 py-0.5 ${map[status]}`}>
      {status.toUpperCase()}
    </span>
  );
}

function timeLabel(b: VenueBooking): string {
  if (b.is_all_day) return 'All day';
  const s = b.start_time ? b.start_time.slice(0, 5) : '?';
  const e = b.end_time ? b.end_time.slice(0, 5) : '?';
  return `${s} – ${e}`;
}

type Filter = VenueBookingStatus | 'all';
const FILTERS: Filter[] = ['pending', 'approved', 'rejected', 'cancelled', 'all'];

export default function VenueBookingsReviewPage() {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<VenueBooking[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('pending');
  const [venueFilter, setVenueFilter] = useState('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<VenueBooking | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [rejecting, setRejecting] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [bs, vs] = await Promise.all([getVenueBookings(), getVenues()]);
      setBookings(bs);
      setVenues(vs);
    } catch (e: any) {
      toast.error(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { pending: 0, approved: 0, rejected: 0, cancelled: 0 };
    for (const b of bookings) c[b.status] = (c[b.status] ?? 0) + 1;
    return c;
  }, [bookings]);

  const filtered = useMemo(
    () =>
      bookings
        .filter((b) => (filter === 'all' ? true : b.status === filter))
        .filter((b) => (venueFilter === 'all' ? true : b.venue_id === venueFilter))
        .sort((a, b) => a.booking_date.localeCompare(b.booking_date)),
    [bookings, filter, venueFilter]
  );

  const handleApprove = async (b: VenueBooking) => {
    setBusyId(b.id);
    try {
      await reviewVenueBooking(b.id, 'approved');
      toast.success(`Approved “${b.title}”`);
      await reload();
    } catch (e: any) {
      toast.error(e.message);
    }
    setBusyId(null);
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    setRejecting(true);
    try {
      await reviewVenueBooking(rejectTarget.id, 'rejected', rejectNote || undefined);
      toast.success(`Rejected “${rejectTarget.title}”`);
      setRejectTarget(null);
      setRejectNote('');
      await reload();
    } catch (e: any) {
      toast.error(e.message);
    }
    setRejecting(false);
  };

  return (
    <MainLayout>
      <div className="p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="laser-line mb-2 w-24" />
            <h1 className="text-xl font-bold text-foreground">Venue Booking Approvals</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Review booking requests and approve or reject them.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => navigate('/venues')}
              className="border border-border text-xs"
            >
              <CalendarDays className="w-3 h-3 mr-1" /> Calendar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={reload}
              className="border border-border text-xs"
            >
              <RefreshCw className="w-3 h-3 mr-1" /> Refresh
            </Button>
          </div>
        </div>

        {/* Summary + filters */}
        <div className="flex flex-wrap items-center gap-3">
          {FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`flex items-center gap-2 border px-3 py-1.5 mono text-[10px] tracking-widest transition-colors ${
                filter === s
                  ? 'border-primary text-primary bg-primary/10'
                  : 'border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {s.toUpperCase()}
              <span className="text-sm font-bold">
                {s === 'all' ? bookings.length : counts[s] ?? 0}
              </span>
            </button>
          ))}

          <div className="ml-auto min-w-[200px]">
            <Select value={venueFilter} onValueChange={setVenueFilter}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All venues</SelectItem>
                {venues.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="border border-border bg-card py-12 text-center text-sm text-muted-foreground">
            No {filter === 'all' ? '' : filter} bookings.
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((b) => (
              <div key={b.id} className="border border-border bg-card">
                <div className="flex items-start justify-between gap-3 px-4 py-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground truncate">
                        {b.title}
                      </span>
                      <StatusBadge status={b.status} />
                    </div>
                    <div className="flex flex-wrap items-center gap-3 mono text-[10px] text-muted-foreground mt-1">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {b.venue?.name ?? 'Venue'}
                      </span>
                      <span>
                        {formatDateRange(b.booking_date, b.end_date)} · {timeLabel(b)}
                      </span>
                      {b.booker?.full_name || b.booker?.username ? (
                        <span>by {b.booker.full_name || b.booker.username}</span>
                      ) : null}
                    </div>
                    {b.purpose && (
                      <p className="text-xs text-muted-foreground mt-1">{b.purpose}</p>
                    )}
                    {b.admin_note && (
                      <p className="text-xs text-muted-foreground mt-1">
                        <span className="mono text-[10px]">ADMIN NOTE: </span>
                        {b.admin_note}
                      </p>
                    )}
                  </div>

                  {b.status === 'pending' && (
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        onClick={() => handleApprove(b)}
                        disabled={busyId === b.id}
                        className="text-xs"
                      >
                        <CheckCircle className="w-3 h-3 mr-1" />
                        {busyId === b.id ? 'Approving…' : 'Approve'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setRejectTarget(b);
                          setRejectNote('');
                        }}
                        className="text-xs text-destructive hover:text-destructive"
                      >
                        <XCircle className="w-3 h-3 mr-1" /> Reject
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Reject dialog */}
        <Dialog
          open={!!rejectTarget}
          onOpenChange={(o) => {
            if (!o) setRejectTarget(null);
          }}
        >
          <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-base font-bold">
                Reject “{rejectTarget?.title}”?
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Reason (optional)</Label>
                <Textarea
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  className="text-sm min-h-[70px]"
                  placeholder="This will be included in the notification to the requester."
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setRejectTarget(null)} className="text-sm">
                  Cancel
                </Button>
                <Button
                  onClick={handleReject}
                  disabled={rejecting}
                  className="text-sm bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {rejecting ? 'Rejecting…' : 'Reject Booking'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}

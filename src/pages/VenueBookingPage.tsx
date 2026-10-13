import { useEffect, useState, useCallback, useMemo } from 'react';
import MainLayout from '@/components/layouts/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import {
  getVenues,
  getVenueBookings,
  createVenueBooking,
  cancelVenueBooking,
} from '@/lib/api';
import type { Venue, VenueBooking, VenueBookingStatus } from '@/types/types';
import VenueCalendar, { toDateKey } from '@/components/venue/VenueCalendar';
import { formatDateRange } from '@/lib/utils';
import { Plus, RefreshCw, MapPin, Users, CalendarDays, X } from 'lucide-react';

// ── Status badge ──────────────────────────────────────────────────────────────
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

// ── Booking form ──────────────────────────────────────────────────────────────
function BookingForm({
  date,
  saving,
  onSubmit,
  onCancel,
}: {
  date: string;
  saving: boolean;
  onSubmit: (data: {
    title: string;
    purpose: string | null;
    booking_date: string;
    end_date: string;
    is_all_day: boolean;
    start_time: string | null;
    end_time: string | null;
  }) => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState({
    title: '',
    purpose: '',
    duration: 'times' as 'times' | 'all_day' | 'multi_day',
    booking_date: date,
    end_date: date,
    start_time: '09:00',
    end_time: '10:00',
  });
  const set = (k: string, v: unknown) => setF((p) => ({ ...p, [k]: v }));

  // 'Multiple Days' books whole days across a start→end period; the other two
  // choices are single-day. Start/end times only apply to 'Specific time'.
  const isMultiDay = f.duration === 'multi_day';
  const isAllDay = f.duration === 'all_day' || isMultiDay;

  // Keep the end date on/after the start date whenever either changes.
  const setStartDate = (v: string) =>
    setF((p) => ({ ...p, booking_date: v, end_date: p.end_date < v ? v : p.end_date }));

  const setDuration = (v: 'times' | 'all_day' | 'multi_day') =>
    setF((p) => ({
      ...p,
      duration: v,
      end_date: v === 'multi_day' && p.end_date < p.booking_date ? p.booking_date : p.end_date,
    }));

  const handleSubmit = () => {
    if (!f.title.trim()) {
      toast.error('A title / purpose for the booking is required');
      return;
    }
    if (!f.booking_date) {
      toast.error('Please choose a date');
      return;
    }
    if (isMultiDay && (!f.end_date || f.end_date < f.booking_date)) {
      toast.error('End date cannot be before start date');
      return;
    }
    if (f.duration === 'times' && f.end_time <= f.start_time) {
      toast.error('End time must be after start time');
      return;
    }
    onSubmit({
      title: f.title.trim(),
      purpose: f.purpose || null,
      booking_date: f.booking_date,
      end_date: isMultiDay ? f.end_date : f.booking_date,
      is_all_day: isAllDay,
      start_time: f.duration === 'times' ? f.start_time : null,
      end_time: f.duration === 'times' ? f.end_time : null,
    });
  };

  return (
    <div className="border border-border bg-card p-4 space-y-3">
      <div className="mono text-[10px] text-muted-foreground tracking-widest">
        NEW BOOKING REQUEST
      </div>

      <div className="space-y-1">
        <Label className="text-xs font-semibold">Title / Event *</Label>
        <Input
          value={f.title}
          onChange={(e) => set('title', e.target.value)}
          className="h-9 text-sm"
          placeholder="e.g. Quarterly planning meeting"
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs font-semibold">Purpose / Notes</Label>
        <Textarea
          value={f.purpose}
          onChange={(e) => set('purpose', e.target.value)}
          className="text-sm min-h-[56px]"
          placeholder="Optional details"
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs font-semibold">Duration</Label>
        <Select
          value={f.duration}
          onValueChange={(v) => setDuration(v as 'times' | 'all_day' | 'multi_day')}
        >
          <SelectTrigger className="h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="times">Specific time</SelectItem>
            <SelectItem value="all_day">All day</SelectItem>
            <SelectItem value="multi_day">Multiple Days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isMultiDay ? (
        <div className="space-y-1">
          <Label className="text-xs font-semibold">Date range *</Label>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="mono text-[10px] text-muted-foreground">START DATE</Label>
              <Input
                value={f.booking_date}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-9 text-sm"
                type="date"
              />
            </div>
            <div className="space-y-1">
              <Label className="mono text-[10px] text-muted-foreground">END DATE</Label>
              <Input
                value={f.end_date}
                min={f.booking_date}
                onChange={(e) => set('end_date', e.target.value)}
                className="h-9 text-sm"
                type="date"
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <Label className="text-xs font-semibold">Date *</Label>
          <Input
            value={f.booking_date}
            onChange={(e) => set('booking_date', e.target.value)}
            className="h-9 text-sm"
            type="date"
          />
        </div>
      )}

      {f.duration === 'times' && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Start</Label>
            <Input
              value={f.start_time}
              onChange={(e) => set('start_time', e.target.value)}
              className="h-9 text-sm"
              type="time"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold">End</Label>
            <Input
              value={f.end_time}
              onChange={(e) => set('end_time', e.target.value)}
              className="h-9 text-sm"
              type="time"
            />
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button onClick={handleSubmit} disabled={saving} className="text-sm">
          {saving ? 'Submitting…' : 'Request Booking'}
        </Button>
        <Button variant="outline" onClick={onCancel} className="text-sm">
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function VenueBookingPage() {
  const { profile } = useAuth();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [venueId, setVenueId] = useState('');
  const [bookings, setBookings] = useState<VenueBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));

  const selectedVenue = useMemo(
    () => venues.find((v) => v.id === venueId) ?? null,
    [venues, venueId]
  );

  const loadVenues = useCallback(async () => {
    try {
      const vs = await getVenues();
      setVenues(vs);
      setVenueId((current) => current || vs[0]?.id || '');
    } catch (e: any) {
      toast.error(e.message);
    }
  }, []);

  const loadBookings = useCallback(async (id: string) => {
    if (!id) {
      setBookings([]);
      return;
    }
    setLoading(true);
    try {
      setBookings(await getVenueBookings({ venue_id: id }));
    } catch (e: any) {
      toast.error(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadVenues();
  }, [loadVenues]);

  useEffect(() => {
    loadBookings(venueId);
  }, [venueId, loadBookings]);

  const refresh = () => loadBookings(venueId);

  const handleCreate = async (data: {
    title: string;
    purpose: string | null;
    booking_date: string;
    end_date: string;
    is_all_day: boolean;
    start_time: string | null;
    end_time: string | null;
  }) => {
    if (!venueId) return;
    setSaving(true);
    try {
      await createVenueBooking({ ...data, venue_id: venueId });
      toast.success('Booking request sent for approval');
      setShowForm(false);
      await loadBookings(venueId);
    } catch (e: any) {
      toast.error(e.message);
    }
    setSaving(false);
  };

  const handleCancel = async (id: string) => {
    try {
      await cancelVenueBooking(id);
      toast.success('Booking cancelled');
      await loadBookings(venueId);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const selectedDayBookings = useMemo(
    () =>
      bookings
        .filter(
          (b) =>
            b.booking_date.slice(0, 10) <= selectedDate &&
            (b.end_date ?? b.booking_date).slice(0, 10) >= selectedDate
        )
        .sort((a, b) => {
          if (a.is_all_day !== b.is_all_day) return a.is_all_day ? -1 : 1;
          return (a.start_time ?? '').localeCompare(b.start_time ?? '');
        }),
    [bookings, selectedDate]
  );

  const myBookings = useMemo(
    () =>
      bookings
        .filter((b) => b.booked_by === profile?.id && b.status !== 'cancelled' && b.status !== 'rejected')
        .sort((a, b) => b.booking_date.localeCompare(a.booking_date)),
    [bookings, profile]
  );

  return (
    <MainLayout>
      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="laser-line mb-2 w-24" />
            <h1 className="text-xl font-bold text-foreground">Venue Booking</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Reserve a venue for a single day or a multi-day period. Any signed-in user can
              request a booking; an administrator reviews and approves it.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={refresh}
              className="border border-border text-xs"
            >
              <RefreshCw className="w-3 h-3 mr-1" /> Refresh
            </Button>
            {/* Any signed-in role (requester, technician, admin) may request a
                booking; admins use the same period date selector. */}
            {!showForm && (
              <Button
                size="sm"
                onClick={() => setShowForm(true)}
                disabled={!venueId}
                className="text-xs"
              >
                <Plus className="w-3 h-3 mr-1" /> New Booking
              </Button>
            )}
          </div>
        </div>

        {/* Venue selector */}
        <div className="border border-border bg-card p-4 flex flex-wrap items-end gap-x-6 gap-y-3">
          <div className="space-y-1 min-w-[240px]">
            <Label className="text-xs font-semibold">Venue</Label>
            <Select value={venueId} onValueChange={setVenueId}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select a venue" />
              </SelectTrigger>
              <SelectContent>
                {venues.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedVenue && (
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground pb-1">
              {selectedVenue.location && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" /> {selectedVenue.location}
                </span>
              )}
              {selectedVenue.capacity != null && (
                <span className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" /> Capacity {selectedVenue.capacity}
                </span>
              )}
            </div>
          )}
        </div>

        {venues.length === 0 && !loading ? (
          <div className="border border-border bg-card py-14 text-center space-y-2">
            <CalendarDays className="w-8 h-8 mx-auto text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              No venues are available yet. Please ask an administrator to add one.
            </p>
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            {/* Left: calendar + selected day */}
            <div className="space-y-4">
              <VenueCalendar
                month={month}
                onMonthChange={setMonth}
                bookings={bookings}
                selectedDate={selectedDate}
                onSelectDate={setSelectedDate}
              />

              <div className="border border-border bg-card">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                  <span className="mono text-xs tracking-widest text-foreground">
                    {selectedVenue?.name ?? 'VENUE'} · {selectedDate}
                  </span>
                  <span className="mono text-[10px] text-muted-foreground">
                    {selectedDayBookings.length} BOOKING{selectedDayBookings.length === 1 ? '' : 'S'}
                  </span>
                </div>
                {selectedDayBookings.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                    This venue is free on this day.
                  </p>
                ) : (
                  <div>
                    {selectedDayBookings.map((b) => (
                      <div
                        key={b.id}
                        className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border/50 last:border-0"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-foreground truncate">
                            {b.title}
                          </div>
                          <div className="mono text-[10px] text-muted-foreground mt-0.5">
                            {timeLabel(b)}
                            {b.booker?.full_name || b.booker?.username
                              ? ` · ${b.booker.full_name || b.booker.username}`
                              : ''}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <StatusBadge status={b.status} />
                          {b.booked_by === profile?.id &&
                            (b.status === 'pending' || b.status === 'approved') && (
                              <button
                                onClick={() => handleCancel(b.id)}
                                className="text-muted-foreground hover:text-destructive transition-colors"
                                title="Cancel booking"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right: form + my bookings */}
            <div className="space-y-4">
              {showForm && (
                <BookingForm
                  date={selectedDate}
                  saving={saving}
                  onSubmit={handleCreate}
                  onCancel={() => setShowForm(false)}
                />
              )}

              <div className="border border-border bg-card">
                <div className="px-4 py-2.5 border-b border-border">
                  <span className="mono text-xs tracking-widest text-foreground">
                    MY BOOKINGS
                  </span>
                </div>
                {myBookings.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                    You have no active bookings.
                  </p>
                ) : (
                  <div>
                    {myBookings.map((b) => (
                      <div
                        key={b.id}
                        className="px-4 py-3 border-b border-border/50 last:border-0 space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-foreground truncate">
                            {b.title}
                          </span>
                          <StatusBadge status={b.status} />
                        </div>
                        <div className="mono text-[10px] text-muted-foreground">
                          {formatDateRange(b.booking_date, b.end_date)} · {timeLabel(b)}
                        </div>
                        {(b.status === 'pending' || b.status === 'approved') && (
                          <button
                            onClick={() => handleCancel(b.id)}
                            className="mono text-[10px] text-muted-foreground hover:text-destructive transition-colors"
                          >
                            CANCEL
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}

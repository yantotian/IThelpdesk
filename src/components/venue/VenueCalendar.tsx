import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { VenueBooking } from '@/types/types';

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/** Local-time YYYY-MM-DD key. Booking dates are plain dates, so we avoid UTC. */
export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse a YYYY-MM-DD key into a local Date. */
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

interface DayOccupancy {
  approved: number;
  pending: number;
}

interface VenueCalendarProps {
  month: Date;
  onMonthChange: (d: Date) => void;
  bookings: VenueBooking[];
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
}

export default function VenueCalendar({
  month,
  onMonthChange,
  bookings,
  selectedDate,
  onSelectDate,
}: VenueCalendarProps) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();

  const occupancy = new Map<string, DayOccupancy>();
  for (const b of bookings) {
    if (b.status !== 'approved' && b.status !== 'pending') continue;
    const startKey = b.booking_date.slice(0, 10);
    const endKey = (b.end_date ?? b.booking_date).slice(0, 10);
    let cursor = parseDateKey(startKey);
    const last = parseDateKey(endKey);
    // A booking may span several days; mark each one. The guard caps the walk
    // so malformed ranges can never loop forever.
    for (let guard = 0; cursor <= last && guard < 366; guard += 1) {
      const key = toDateKey(cursor);
      const current = occupancy.get(key) ?? { approved: 0, pending: 0 };
      if (b.status === 'approved') current.approved += 1;
      else current.pending += 1;
      occupancy.set(key, current);
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
    }
  }

  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const todayKey = toDateKey(new Date());

  // Pad to whole weeks so the grid stays rectangular.
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const shiftMonth = (delta: number) => onMonthChange(new Date(year, monthIndex + delta, 1));

  return (
    <div className="border border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          className="w-7 h-7 flex items-center justify-center border border-border text-muted-foreground hover:text-primary hover:border-primary transition-colors"
          title="Previous month"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <div className="mono text-xs tracking-widest text-foreground uppercase">
          {month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </div>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          className="w-7 h-7 flex items-center justify-center border border-border text-muted-foreground hover:text-primary hover:border-primary transition-colors"
          title="Next month"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 border-b border-border">
        {WEEKDAYS.map((w) => (
          <div key={w} className="mono text-[9px] text-muted-foreground tracking-widest text-center py-1.5">
            {w}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7">
        {cells.map((day, idx) => {
          if (day === null) {
            return <div key={`blank-${idx}`} className="h-14 border-b border-r border-border/40 bg-muted/5" />;
          }
          const key = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const occ = occupancy.get(key);
          const isSelected = key === selectedDate;
          const isToday = key === todayKey;

          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDate(key)}
              className={`h-14 border-b border-r border-border/40 p-1.5 text-left transition-colors hover:bg-muted/20 ${
                isSelected ? 'bg-primary/10 ring-1 ring-inset ring-primary' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`mono text-[11px] ${
                    isToday
                      ? 'text-primary font-bold'
                      : 'text-foreground'
                  }`}
                >
                  {day}
                </span>
                {occ && occ.approved + occ.pending > 0 && (
                  <span className="mono text-[9px] text-muted-foreground">
                    {occ.approved + occ.pending}
                  </span>
                )}
              </div>
              <div className="flex gap-1 mt-1.5">
                {occ?.approved ? <span className="w-2 h-2 bg-primary" title="Occupied" /> : null}
                {occ?.pending ? <span className="w-2 h-2 bg-yellow-500" title="Pending approval" /> : null}
              </div>
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-3 py-2 border-t border-border">
        <span className="flex items-center gap-1.5 mono text-[9px] text-muted-foreground tracking-widest">
          <span className="w-2 h-2 bg-primary inline-block" /> OCCUPIED
        </span>
        <span className="flex items-center gap-1.5 mono text-[9px] text-muted-foreground tracking-widest">
          <span className="w-2 h-2 bg-yellow-500 inline-block" /> PENDING
        </span>
        <span className="flex items-center gap-1.5 mono text-[9px] text-muted-foreground tracking-widest">
          <span className="w-2 h-2 border border-border inline-block" /> FREE
        </span>
      </div>
    </div>
  );
}

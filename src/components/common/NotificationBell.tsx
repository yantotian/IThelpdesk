import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, BellRing, CheckCheck, X, AlertTriangle, UserCheck, MessageSquare, RefreshCw, Info } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  getNotifications, getUnreadCount,
  markNotificationRead, markAllNotificationsRead,
} from '@/lib/api';
import type { AppNotification } from '@/types/types';

const POLL_INTERVAL_MS = 30_000; // poll every 30 s

const TYPE_ICON: Record<AppNotification['type'], React.ReactNode> = {
  sla_breach:    <AlertTriangle className="w-3.5 h-3.5 text-primary shrink-0" />,
  assignment:    <UserCheck className="w-3.5 h-3.5 text-blue-400 shrink-0" />,
  comment:       <MessageSquare className="w-3.5 h-3.5 text-green-400 shrink-0" />,
  status_change: <RefreshCw className="w-3.5 h-3.5 text-yellow-400 shrink-0" />,
  system:        <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0" />,
};

export default function NotificationBell() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const [notifs, count] = await Promise.all([
        getNotifications(profile.id),
        getUnreadCount(profile.id),
      ]);
      setNotifications(notifs);
      setUnread(count);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  // Initial fetch + polling — no Realtime channel needed.
  useEffect(() => {
    if (!profile) return;
    fetchNotifications();
    const timer = setInterval(fetchNotifications, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchNotifications]);

  // Close panel on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleClick = async (n: AppNotification) => {
    if (!n.is_read) {
      await markNotificationRead(n.id);
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x));
      setUnread(u => Math.max(0, u - 1));
    }
    if (n.ticket_id) {
      navigate(`/tickets/${n.ticket_id}`);
      setOpen(false);
    }
  };

  const handleMarkAll = async () => {
    if (!profile) return;
    await markAllNotificationsRead(profile.id);
    setNotifications(prev => prev.map(x => ({ ...x, is_read: true })));
    setUnread(0);
  };

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className="relative flex items-center justify-center w-8 h-8 border border-border text-muted-foreground hover:text-primary hover:border-primary transition-colors shrink-0"
        title="Notifications"
      >
        {unread > 0 ? <BellRing className="w-4 h-4 text-primary" /> : <Bell className="w-4 h-4" />}
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary text-primary-foreground mono text-[9px] flex items-center justify-center font-bold">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-80 max-w-[calc(100vw-2rem)] border border-border bg-card shadow-lg">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
            <span className="mono text-xs text-foreground tracking-widest">NOTIFICATIONS</span>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button onClick={handleMarkAll} title="Mark all read"
                  className="text-muted-foreground hover:text-primary transition-colors">
                  <CheckCheck className="w-3.5 h-3.5" />
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-[380px] overflow-y-auto">
            {loading ? (
              <div className="px-4 py-6 text-center mono text-xs text-muted-foreground">LOADING...</div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Bell className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
                <p className="mono text-xs text-muted-foreground">No notifications</p>
              </div>
            ) : notifications.map(n => (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                className={`w-full text-left flex items-start gap-3 px-4 py-3 border-b border-border/50 transition-colors ${
                  n.is_read ? 'opacity-60 hover:opacity-100 hover:bg-secondary/40' : 'bg-primary/5 hover:bg-primary/10'
                }`}
              >
                <span className="mt-0.5">{TYPE_ICON[n.type]}</span>
                <div className="flex-1 min-w-0">
                  <p className="mono text-xs text-foreground truncate">{n.title}</p>
                  {n.body && <p className="mono text-[10px] text-muted-foreground line-clamp-2 mt-0.5">{n.body}</p>}
                  {n.ticket && (
                    <p className="mono text-[10px] text-primary mt-0.5">{n.ticket.ticket_number}</p>
                  )}
                  <p className="mono text-[10px] text-muted-foreground/60 mt-1">{timeAgo(n.created_at)}</p>
                </div>
                {!n.is_read && (
                  <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                )}
              </button>
            ))}
          </div>

          {notifications.length > 0 && (
            <div className="px-4 py-2 border-t border-border">
              <p className="mono text-[10px] text-muted-foreground text-center">
                {unread > 0 ? `${unread} unread` : 'All caught up'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

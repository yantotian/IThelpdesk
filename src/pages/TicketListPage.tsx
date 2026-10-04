import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import MainLayout from '@/components/layouts/MainLayout';
import { StatusBadge, PriorityBadge, SLAIndicator } from '@/components/common/Badges';
import { getTickets, getCategories, getProfiles, bulkAssignTickets } from '@/lib/api';
import type { Ticket, TicketFilters, TicketStatus, TicketPriority, Category, Profile } from '@/types/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Search, Download, RefreshCw, PlusCircle, ChevronLeft, ChevronRight, Users } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_OPTIONS: TicketStatus[] = ['new', 'assigned', 'in_progress', 'resolved', 'on_hold', 'verified', 'closed'];
const PRIORITY_OPTIONS: TicketPriority[] = ['critical', 'high', 'medium', 'low'];

export default function TicketListPage() {
  const { profile, role } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [technicians, setTechnicians] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkTech, setBulkTech] = useState('');
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [filters, setFilters] = useState<TicketFilters>({ status: 'all', priority: 'all', category_id: 'all' });
  const [search, setSearch] = useState('');

  const PAGE_SIZE = 25;

  const fetchTickets = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const f: TicketFilters = { ...filters, search: search || undefined };
      if (role === 'requester') {
        // Fetch all then filter to own
        const all = await getTickets(f, page);
        setTickets(all.filter(t => t.requester_id === profile.id));
      } else if (role === 'technician') {
        setTickets(await getTickets({ ...f, assigned_to: profile.id }, page));
      } else {
        setTickets(await getTickets(f, page));
      }
    } catch (e: any) {
      toast.error('Failed to load tickets: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [profile, role, filters, search, page]);

  useEffect(() => {
    getCategories().then(cats => setCategories(cats.filter(c => !c.parent_id)));
    if (role === 'it_admin' || role === 'sysadmin') {
      getProfiles('technician').then(setTechnicians);
    }
  }, [role]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const setFilter = (k: keyof TicketFilters, v: string) =>
    setFilters(f => ({ ...f, [k]: v }));

  const toggleSelect = (id: string) =>
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const toggleAll = () =>
    setSelected(s => s.size === tickets.length ? new Set() : new Set(tickets.map(t => t.id)));

  const handleBulkAssign = async () => {
    if (!bulkTech || selected.size === 0 || !profile) return;
    // Only new tickets can be bulk-assigned
    const newTicketIds = tickets
      .filter(t => selected.has(t.id) && t.status === 'new')
      .map(t => t.id);
    if (newTicketIds.length === 0) {
      toast.error('No unassigned (NEW) tickets in selection');
      return;
    }
    setBulkAssigning(true);
    try {
      await bulkAssignTickets(newTicketIds, bulkTech, profile.id);
      toast.success(`Assigned ${newTicketIds.length} ticket(s)`);
      setSelected(new Set());
      setBulkTech('');
      await fetchTickets();
    } catch (e: any) {
      toast.error('Bulk assign failed: ' + e.message);
    } finally {
      setBulkAssigning(false);
    }
  };

  const exportCSV = () => {
    const rows = tickets.filter(t => selected.size === 0 || selected.has(t.id));
    if (rows.length === 0) { toast.error('No tickets to export'); return; }
    const headers = ['Ticket #', 'Subject', 'Requester', 'Category', 'Priority', 'Status', 'Assigned To', 'Office', 'Created', 'SLA Due', 'Resolved'];
    const csvRows = rows.map(t => [
      t.ticket_number,
      `"${(t.subject || '').replace(/"/g, '""')}"`,
      t.requester?.full_name || t.requester?.username || '',
      t.category?.name || '',
      t.priority,
      t.status,
      t.assignee?.full_name || t.assignee?.username || '',
      t.office || '',
      t.created_at.slice(0, 10),
      t.sla_due_at?.slice(0, 10) || '',
      t.resolved_at?.slice(0, 10) || '',
    ]);
    const csv = [headers, ...csvRows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `tickets_${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} tickets`);
  };

  return (
    <MainLayout>
      <div className="p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="laser-line mb-2 w-24" />
            <h1 className="mono text-lg text-foreground">TICKET QUEUE</h1>
            <p className="mono text-xs text-muted-foreground">{tickets.length} RECORDS</p>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <Button size="sm" variant="ghost" onClick={fetchTickets} className="border border-border mono text-xs">
              <RefreshCw className="w-3 h-3 mr-1" />REFRESH
            </Button>
            <Button size="sm" variant="ghost" onClick={exportCSV} className="border border-border mono text-xs">
              <Download className="w-3 h-3 mr-1" />EXPORT CSV
            </Button>
            {(role === 'requester' || role === 'it_admin' || role === 'sysadmin') && (
              <Button size="sm" asChild className="bg-primary text-primary-foreground mono text-xs hud-press">
                <Link to="/tickets/new"><PlusCircle className="w-3 h-3 mr-1" />NEW</Link>
              </Button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="border border-border bg-card p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <Input
                placeholder="Search ticket # or subject..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 bg-input border-border mono text-xs h-8"
              />
            </div>
            <Select value={filters.status || 'all'} onValueChange={v => setFilter('status', v)}>
              <SelectTrigger className="w-36 bg-input border-border mono text-xs h-8">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="all" className="mono text-xs">ALL STATUS</SelectItem>
                {STATUS_OPTIONS.map(s => (
                  <SelectItem key={s} value={s} className="mono text-xs">{s.replace('_', ' ').toUpperCase()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filters.priority || 'all'} onValueChange={v => setFilter('priority', v)}>
              <SelectTrigger className="w-32 bg-input border-border mono text-xs h-8">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="all" className="mono text-xs">ALL PRIORITY</SelectItem>
                {PRIORITY_OPTIONS.map(p => (
                  <SelectItem key={p} value={p} className="mono text-xs">{p.toUpperCase()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filters.category_id || 'all'} onValueChange={v => setFilter('category_id', v)}>
              <SelectTrigger className="w-36 bg-input border-border mono text-xs h-8">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="all" className="mono text-xs">ALL CATEGORY</SelectItem>
                {categories.map(c => (
                  <SelectItem key={c.id} value={c.id} className="mono text-xs">{c.name.toUpperCase()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Bulk-assign action bar — visible to admins when tickets are selected */}
        {(role === 'it_admin' || role === 'sysadmin') && selected.size > 0 && (
          <div className="border border-primary bg-primary/5 p-3 flex flex-wrap items-center gap-3">
            <span className="mono text-xs text-primary shrink-0">
              {selected.size} SELECTED
            </span>
            <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
              <Select value={bulkTech} onValueChange={setBulkTech}>
                <SelectTrigger className="w-48 bg-input border-border mono text-xs h-8">
                  <SelectValue placeholder="Select technician..." />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {technicians.map(t => (
                    <SelectItem key={t.id} value={t.id} className="mono text-xs">
                      {t.full_name || t.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                onClick={handleBulkAssign}
                disabled={!bulkTech || bulkAssigning}
                className="bg-primary text-primary-foreground mono text-xs hud-press shrink-0"
              >
                <Users className="w-3 h-3 mr-1" />
                {bulkAssigning ? 'ASSIGNING...' : 'ASSIGN'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelected(new Set())}
                className="border border-border mono text-xs shrink-0"
              >
                CLEAR
              </Button>
            </div>
            <span className="mono text-[10px] text-muted-foreground shrink-0">
              Only NEW tickets will be assigned
            </span>
          </div>
        )}

        {/* Table */}
        <div className="border border-border bg-card min-w-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-max">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-2 w-8">
                    <input
                      type="checkbox"
                      checked={selected.size === tickets.length && tickets.length > 0}
                      onChange={toggleAll}
                      className="accent-primary"
                    />
                  </th>
                  {['TICKET #', 'SUBJECT', 'REQUESTER', 'CATEGORY', 'PRIORITY', 'STATUS', 'ASSIGNED TO', 'SLA', 'CREATED'].map(h => (
                    <th key={h} className="px-3 py-2 text-left mono text-[10px] text-muted-foreground tracking-widest whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={10} className="px-3 py-8 text-center mono text-xs text-muted-foreground">LOADING...</td></tr>
                ) : tickets.length === 0 ? (
                  <tr><td colSpan={10} className="px-3 py-8 text-center mono text-xs text-muted-foreground">NO TICKETS FOUND</td></tr>
                ) : tickets.map(t => (
                  <tr key={t.id} className="border-b border-border/50 hover:bg-secondary/50 transition-colors">
                    <td className="px-3 py-2 w-8">
                      <input
                        type="checkbox"
                        checked={selected.has(t.id)}
                        onChange={() => toggleSelect(t.id)}
                        className="accent-primary"
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <Link to={`/tickets/${t.id}`} className="mono text-xs text-primary hover:underline">
                        {t.ticket_number}
                      </Link>
                    </td>
                    <td className="px-3 py-2 max-w-[200px]">
                      <Link to={`/tickets/${t.id}`} className="text-xs text-foreground hover:text-primary line-clamp-1">{t.subject}</Link>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap mono text-xs text-muted-foreground">
                      {t.requester?.full_name || t.requester?.username || '—'}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap mono text-xs text-muted-foreground">
                      {t.category?.name || '—'}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap"><PriorityBadge priority={t.priority} /></td>
                    <td className="px-3 py-2 whitespace-nowrap"><StatusBadge status={t.status} /></td>
                    <td className="px-3 py-2 whitespace-nowrap mono text-xs text-muted-foreground">
                      {t.assignee?.full_name || t.assignee?.username || '—'}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <SLAIndicator slaBreached={t.sla_breached} slaDue={t.sla_due_at} />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap mono text-[10px] text-muted-foreground">
                      {t.created_at.slice(0, 10)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-3 py-2 border-t border-border">
            <span className="mono text-[10px] text-muted-foreground">PAGE {page + 1}</span>
            <div className="flex items-center gap-2">
              <Button size="icon" variant="ghost" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="w-7 h-7 border border-border">
                <ChevronLeft className="w-3 h-3" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setPage(p => p + 1)} disabled={tickets.length < PAGE_SIZE} className="w-7 h-7 border border-border">
                <ChevronRight className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}

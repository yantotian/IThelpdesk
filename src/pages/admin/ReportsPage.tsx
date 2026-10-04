import { useEffect, useState } from 'react';
import MainLayout from '@/components/layouts/MainLayout';
import { getTickets, getIDRequestCount } from '@/lib/api';
import { exportReportsToPdf } from '@/lib/pdfExport';
import type { Ticket, TicketStatus, TicketPriority } from '@/types/types';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';
import { Download, RefreshCw, FileDown } from 'lucide-react';
import { toast } from 'sonner';

const PRIORITY_COLORS: Record<string, string> = {
  low: '#888', medium: '#4A90D9', high: '#F5A623', critical: '#FF4500',
};

const STATUS_COLORS: Record<string, string> = {
  new: '#4A90D9', assigned: '#F5A623', in_progress: '#50C8C8', resolved: '#5BBF6B',
  on_hold: '#9B7FD6', verified: '#4DB89A', closed: '#666',
};

export default function ReportsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [exportingPdf, setExportingPdf] = useState(false);
  const [idRequestCount, setIdRequestCount] = useState(0);

  const reload = async () => {
    setLoading(true);
    try {
      const [all, idCount] = await Promise.all([
        getTickets({ date_from: dateFrom || undefined, date_to: dateTo || undefined }, 0, 500),
        getIDRequestCount(),
      ]);
      setTickets(all);
      setIdRequestCount(idCount);
    } catch (e: any) { toast.error(e.message); }
    setLoading(false);
  };

  useEffect(() => { reload(); }, []);

  // Stats
  const byStatus: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  const byTech: Record<string, number> = {};
  let slaBreached = 0;

  tickets.forEach(t => {
    byStatus[t.status] = (byStatus[t.status] || 0) + 1;
    byPriority[t.priority] = (byPriority[t.priority] || 0) + 1;
    const cat = t.category?.name || 'Uncategorized';
    byCategory[cat] = (byCategory[cat] || 0) + 1;
    const tech = t.assignee?.full_name || t.assignee?.username || 'Unassigned';
    byTech[tech] = (byTech[tech] || 0) + 1;
    if (t.sla_breached) slaBreached++;
  });

  const statusData = Object.entries(byStatus).map(([name, count]) => ({
    name: name.replace('_', ' ').toUpperCase(), count, color: STATUS_COLORS[name],
  }));
  const priorityData = Object.entries(byPriority).map(([name, count]) => ({
    name: name.toUpperCase(), count, color: PRIORITY_COLORS[name],
  }));
  const categoryData = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([name, count]) => ({ name: name.toUpperCase(), count }));
  const techData = Object.entries(byTech).sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  const slaCompliance = tickets.length > 0
    ? (((tickets.length - slaBreached) / tickets.length) * 100).toFixed(1)
    : 100;

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      const period = dateFrom && dateTo ? `${dateFrom} to ${dateTo}` : dateFrom || dateTo || undefined;
      await exportReportsToPdf({ tickets, idRequestCount, period });
      toast.success('PDF report exported');
    } catch (e: any) {
      toast.error('PDF export failed: ' + e.message);
    } finally {
      setExportingPdf(false);
    }
  };

  const exportCSV = () => {
    const headers = ['Ticket #', 'Subject', 'Requester', 'Category', 'Priority', 'Status', 'Assigned', 'SLA Breached', 'Created', 'Resolved'];
    const rows = tickets.map(t => [
      t.ticket_number,
      `"${t.subject.replace(/"/g, '""')}"`,
      t.requester?.full_name || t.requester?.username || '',
      t.category?.name || '',
      t.priority,
      t.status,
      t.assignee?.full_name || '',
      t.sla_breached ? 'YES' : 'NO',
      t.created_at.slice(0, 10),
      t.resolved_at?.slice(0, 10) || '',
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `report_${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${tickets.length} tickets`);
  };

  return (
    <MainLayout>
      <div className="p-6 space-y-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="laser-line mb-2 w-24" />
            <h1 className="mono text-lg text-foreground">REPORTS</h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Label className="mono text-[10px] text-muted-foreground">FROM</Label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="bg-input border-border mono text-xs h-8 w-36" />
            </div>
            <div className="flex items-center gap-2">
              <Label className="mono text-[10px] text-muted-foreground">TO</Label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="bg-input border-border mono text-xs h-8 w-36" />
            </div>
            <Button size="sm" variant="ghost" onClick={reload} className="border border-border mono text-xs">
              <RefreshCw className="w-3 h-3 mr-1" />APPLY
            </Button>
            <Button size="sm" variant="ghost" onClick={exportCSV} className="border border-border mono text-xs">
              <Download className="w-3 h-3 mr-1" />EXPORT CSV
            </Button>
            <Button size="sm" variant="ghost" onClick={handleExportPdf} disabled={exportingPdf} className="border border-border mono text-xs">
              <FileDown className="w-3 h-3 mr-1" />{exportingPdf ? 'EXPORTING...' : 'EXPORT PDF'}
            </Button>
          </div>
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            ['TOTAL TICKETS', tickets.length, ''],
            ['SLA COMPLIANCE', `${slaCompliance}%`, slaCompliance === '100.0' ? '' : 'text-yellow-400'],
            ['SLA BREACHED', slaBreached, slaBreached > 0 ? 'text-primary' : ''],
            ['CLOSED', byStatus['closed'] || 0, ''],
            ['ID REQUESTS', idRequestCount, ''],
          ].map(([label, value, cls]) => (
            <div key={label as string} className="border border-border bg-card p-4">
              <div className="mono text-[10px] text-muted-foreground mb-2">{label as string}</div>
              <div className={`mono text-2xl font-bold text-foreground ${cls as string}`}>{value as string | number}</div>
            </div>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {/* By Status */}
          <div className="border border-border bg-card p-5">
            <div className="mono text-[10px] text-muted-foreground tracking-widest mb-4">TICKETS BY STATUS</div>
            <div className="w-full min-w-0 overflow-hidden" style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statusData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 8, fill: '#888', fontFamily: 'monospace' }} />
                  <YAxis tick={{ fontSize: 9, fill: '#888', fontFamily: 'monospace' }} />
                  <Tooltip contentStyle={{ background: '#0A0A0A', border: '1px solid #333', fontSize: 10, fontFamily: 'monospace' }} />
                  <Bar dataKey="count">{statusData.map((e, i) => <Cell key={i} fill={e.color} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* By Priority */}
          <div className="border border-border bg-card p-5">
            <div className="mono text-[10px] text-muted-foreground tracking-widest mb-4">TICKETS BY PRIORITY</div>
            <div className="w-full min-w-0 overflow-hidden" style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={priorityData} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {priorityData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#0A0A0A', border: '1px solid #333', fontSize: 10, fontFamily: 'monospace' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* By Category */}
          <div className="border border-border bg-card p-5">
            <div className="mono text-[10px] text-muted-foreground tracking-widest mb-4">TOP CATEGORIES</div>
            <div className="w-full min-w-0 overflow-hidden" style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryData} layout="vertical" margin={{ top: 0, right: 20, left: 60, bottom: 0 }}>
                  <XAxis type="number" tick={{ fontSize: 9, fill: '#888', fontFamily: 'monospace' }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 8, fill: '#888', fontFamily: 'monospace' }} width={60} />
                  <Tooltip contentStyle={{ background: '#0A0A0A', border: '1px solid #333', fontSize: 10, fontFamily: 'monospace' }} />
                  <Bar dataKey="count" fill="#FF4500" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* By Technician */}
          <div className="border border-border bg-card p-5">
            <div className="mono text-[10px] text-muted-foreground tracking-widest mb-4">TICKETS BY TECHNICIAN</div>
            <div className="w-full min-w-0 overflow-hidden" style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={techData} layout="vertical" margin={{ top: 0, right: 20, left: 70, bottom: 0 }}>
                  <XAxis type="number" tick={{ fontSize: 9, fill: '#888', fontFamily: 'monospace' }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 8, fill: '#888', fontFamily: 'monospace' }} width={70} />
                  <Tooltip contentStyle={{ background: '#0A0A0A', border: '1px solid #333', fontSize: 10, fontFamily: 'monospace' }} />
                  <Bar dataKey="count" fill="#4A90D9" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}

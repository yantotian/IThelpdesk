import { useEffect, useState, useMemo } from 'react';
import MainLayout from '@/components/layouts/MainLayout';
import { getICTDevices, getICTInternet, getAllSpeedTestLogs } from '@/lib/api';
import type { ICTDevice, ICTInternet, SpeedTestLog } from '@/types/types';
import { toast } from 'sonner';
import { Monitor, Laptop, Printer, Router, Wifi, RefreshCw, FileDown, Activity, CalendarRange } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  LineChart, Line, CartesianGrid,
} from 'recharts';
import { formatUtc8Date, formatUtc8ShortDate, formatUtc8DateTime, formatUtc8DateStamp } from '@/lib/utils';

// ── Palette ───────────────────────────────────────────────────────────────────
const COLORS = ['hsl(18 85% 40%)','hsl(18 85% 60%)','hsl(18 65% 30%)','hsl(30 50% 55%)','hsl(200 60% 45%)'];
const STATUS_COLORS: Record<string, string> = {
  active: '#22c55e', inactive: '#94a3b8', under_repair: '#f59e0b', retired: '#ef4444', suspended: '#f97316',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
type SpeedLogRow = SpeedTestLog & { internet?: { id: string; location: string; isp_name: string } };

function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

function escapeCSV(v: string | number | boolean | null | undefined) {
  return `"${String(v ?? '').replace(/"/g, '""')}"`;
}

// ── Export full report CSV ────────────────────────────────────────────────────
function exportFullReport(devices: ICTDevice[], internet: ICTInternet[]) {
  const devHeaders = ['Section','Type','Brand','Model','Serial No','Asset Tag','Location','Assigned To','Status',
    'CPU','GPU','RAM (GB)','Storage (GB)','Storage Type','OS','Printer Type','Network Printer',
    'Router Type','WiFi Standard','Ports','Purchase Date','Warranty Until','Notes'];
  const devRows = devices.map(d => [
    'DEVICE', d.device_type, d.brand, d.model, d.serial_no, d.asset_tag, d.location, d.assigned_to, d.status,
    d.cpu, d.gpu, d.ram_gb, d.storage_gb, d.storage_type, d.os,
    d.printer_type, d.is_network_printer, d.router_type, d.wifi_standard, d.num_ports,
    d.purchase_date, d.warranty_until, d.notes,
  ].map(escapeCSV).join(','));

  const netHeaders = ['Section','Location','ISP','Plan','Plan Type','Subscribed (Mbps)','DL (Mbps)','UL (Mbps)',
    'Monthly Cost','Contract Start','Contract End','Account No','Contact Person','Contact No','Router','Status','Notes'];
  const netRows = internet.map(r => [
    'INTERNET', r.location, r.isp_name, r.plan_name, r.plan_type, r.subscribed_speed_mbps,
    r.actual_dl_mbps, r.actual_ul_mbps, r.monthly_cost,
    r.contract_start, r.contract_end, r.account_no, r.contact_person, r.contact_number,
    r.router ? `${r.router.brand} ${r.router.model}` : '',
    r.status, r.notes,
  ].map(escapeCSV).join(','));

  downloadCSV([
    `ICT INVENTORY REPORT — Generated ${formatUtc8DateTime(new Date())}`,
    '', '# DEVICES', devHeaders.join(','), ...devRows,
    '', '# INTERNET CONNECTIONS', netHeaders.join(','), ...netRows,
  ].join('\n'), `ict-full-report-${formatUtc8DateStamp(new Date())}.csv`);
}

// ── Export speed logs CSV ─────────────────────────────────────────────────────
function exportSpeedLogsCSV(logs: SpeedLogRow[]) {
  const headers = ['Tested At','Location','ISP','DL (Mbps)','UL (Mbps)','Latency (ms)','Notes'];
  const rows = logs.map(l => [
    l.tested_at, l.internet?.location ?? '', l.internet?.isp_name ?? '',
    l.dl_mbps, l.ul_mbps ?? '', l.latency_ms ?? '', l.notes ?? '',
  ].map(escapeCSV).join(','));
  downloadCSV([headers.join(','), ...rows].join('\n'),
    `speed-test-logs-${formatUtc8DateStamp(new Date())}.csv`);
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon, accent }: {
  label: string; value: number | string; sub?: string; icon: React.ReactNode; accent?: string;
}) {
  return (
    <div className={`border border-border bg-card p-4 flex items-start gap-3 border-l-2 ${accent ?? 'border-l-primary'}`}>
      <div className="text-primary mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0">
        <div className="mono text-[10px] text-muted-foreground tracking-widest">{label}</div>
        <div className="text-2xl font-bold text-foreground">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ICTDashboardPage() {
  const [devices, setDevices] = useState<ICTDevice[]>([]);
  const [internet, setInternet] = useState<ICTInternet[]>([]);
  const [speedLogs, setSpeedLogs] = useState<SpeedLogRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Date range filter state (empty string = no filter)
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');

  const reload = async () => {
    setLoading(true);
    try {
      const [devs, nets, logs] = await Promise.all([getICTDevices(), getICTInternet(), getAllSpeedTestLogs()]);
      setDevices(devs); setInternet(nets); setSpeedLogs(logs);
    } catch (e: any) { toast.error(e.message); }
    setLoading(false);
  };
  useEffect(() => { reload(); }, []);

  // ── Date-filtered speed logs ───────────────────────────────────────────────
  const filteredSpeedLogs = useMemo(() => {
    let logs = speedLogs;
    if (dateFrom) logs = logs.filter(l => new Date(l.tested_at) >= new Date(dateFrom));
    if (dateTo)   logs = logs.filter(l => new Date(l.tested_at) <= new Date(dateTo + 'T23:59:59'));
    return logs;
  }, [speedLogs, dateFrom, dateTo]);

  // Quick presets
  const applyPreset = (days: number) => {
    const to   = new Date();
    const from = new Date(); from.setDate(from.getDate() - days);
    setDateFrom(from.toISOString().slice(0,10));
    setDateTo(to.toISOString().slice(0,10));
  };

  // ── Derived stats ──────────────────────────────────────────────────────────
  const laptops  = devices.filter(d => d.device_type === 'laptop');
  const desktops = devices.filter(d => d.device_type === 'desktop');
  const printers = devices.filter(d => d.device_type === 'printer');
  const routers  = devices.filter(d => d.device_type === 'router');

  const statusCount = (arr: ICTDevice[]) => {
    const s: Record<string, number> = {};
    arr.forEach(d => { s[d.status] = (s[d.status] ?? 0) + 1; });
    return s;
  };

  const allStatuses = devices.reduce((acc, d) => {
    acc[d.status] = (acc[d.status] ?? 0) + 1; return acc;
  }, {} as Record<string, number>);

  const deviceTypeData = [
    { name: 'Laptops', count: laptops.length },
    { name: 'Desktops', count: desktops.length },
    { name: 'Printers', count: printers.length },
    { name: 'Routers', count: routers.length },
  ];

  const statusPieData = Object.entries(allStatuses).map(([name, value]) => ({ name, value }));

  const computeDevices = [...laptops, ...desktops];
  const ramBuckets: Record<string, number> = {};
  computeDevices.forEach(d => {
    if (!d.ram_gb) return;
    const label = `${d.ram_gb} GB`;
    ramBuckets[label] = (ramBuckets[label] ?? 0) + 1;
  });
  const ramData = Object.entries(ramBuckets)
    .sort((a,b) => parseInt(a[0]) - parseInt(b[0]))
    .map(([name, count]) => ({ name, count }));

  const storageBuckets: Record<string, number> = {};
  computeDevices.forEach(d => {
    const k = d.storage_type ?? 'Unknown';
    storageBuckets[k] = (storageBuckets[k] ?? 0) + 1;
  });
  const storageData = Object.entries(storageBuckets).map(([name, value]) => ({ name, value }));

  const ispBuckets: Record<string, number> = {};
  internet.forEach(r => { ispBuckets[r.isp_name] = (ispBuckets[r.isp_name] ?? 0) + 1; });
  const ispData = Object.entries(ispBuckets).map(([name, count]) => ({ name, count }));

  const speedData = internet
    .filter(r => r.actual_dl_mbps != null)
    .map(r => ({
      name: r.location.length > 15 ? r.location.slice(0,15)+'…' : r.location,
      subscribed: r.subscribed_speed_mbps,
      actual: r.actual_dl_mbps ?? 0,
    }));

  const totalMonthlyCost = internet.reduce((s, r) => s + (r.monthly_cost ?? 0), 0);
  const activeConnections = internet.filter(r => r.status === 'active').length;
  const avgDownload = internet.filter(r => r.actual_dl_mbps != null).length > 0
    ? (internet.reduce((s,r) => s + (r.actual_dl_mbps ?? 0), 0) / internet.filter(r => r.actual_dl_mbps != null).length).toFixed(1)
    : '—';

  // ── Speed history derived (filtered) ──────────────────────────────────────
  const byConnection = useMemo(() => {
    const map: Record<string, SpeedLogRow[]> = {};
    filteredSpeedLogs.forEach(l => {
      if (!map[l.internet_id]) map[l.internet_id] = [];
      map[l.internet_id].push(l);
    });
    return map;
  }, [filteredSpeedLogs]);

  const globalTrendData = useMemo(() => {
    const byDate: Record<string, { total: number; count: number }> = {};
    filteredSpeedLogs.forEach(l => {
      const d = formatUtc8ShortDate(l.tested_at);
      if (!byDate[d]) byDate[d] = { total: 0, count: 0 };
      byDate[d].total += l.dl_mbps;
      byDate[d].count += 1;
    });
    return Object.entries(byDate).map(([date, v]) => ({
      date,
      avg_dl: parseFloat((v.total / v.count).toFixed(2)),
      tests: v.count,
    }));
  }, [filteredSpeedLogs]);

  if (loading) return (
    <MainLayout>
      <div className="p-6 py-16 text-center text-sm text-muted-foreground animate-pulse">Loading ICT dashboard...</div>
    </MainLayout>
  );

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="laser-line mb-2 w-24" />
            <h1 className="text-xl font-bold text-foreground">ICT Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Overview of all ICT assets and internet subscriptions.</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => exportFullReport(devices, internet)} variant="ghost" className="border border-border text-xs">
              <FileDown className="w-3 h-3 mr-1" /> Full Report CSV
            </Button>
            <Button size="sm" variant="ghost" onClick={reload} className="border border-border text-xs">
              <RefreshCw className="w-3 h-3 mr-1" /> Refresh
            </Button>
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="TOTAL DEVICES" value={devices.length}
            sub={`${statusCount(devices)['active'] ?? 0} active`}
            icon={<Monitor className="w-4 h-4" />} />
          <KpiCard label="LAPTOPS / DESKTOPS" value={`${laptops.length} / ${desktops.length}`}
            sub={`${printers.length} printers`}
            icon={<Laptop className="w-4 h-4" />} accent="border-l-[hsl(18_85%_40%)]" />
          <KpiCard label="INTERNET LINES" value={internet.length}
            sub={`${activeConnections} active`}
            icon={<Wifi className="w-4 h-4" />} accent="border-l-[hsl(200_60%_45%)]" />
          <KpiCard label="MONTHLY COST" value={`₱${totalMonthlyCost.toLocaleString()}`}
            sub={`Avg DL ${avgDownload} Mbps`}
            icon={<Activity className="w-4 h-4" />} accent="border-l-[hsl(18_65%_30%)]" />
        </div>

        {/* Device charts */}
        {devices.length > 0 && (
          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="border border-border bg-card p-4">
              <div className="mono text-[10px] text-muted-foreground tracking-widest mb-3">DEVICE TYPE BREAKDOWN</div>
              <div className="w-full min-w-0 overflow-hidden">
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={deviceTypeData} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ fontSize: 12 }} />
                    <Bar dataKey="count" fill="hsl(18 85% 40%)" radius={[2,2,0,0]}>
                      {deviceTypeData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="border border-border bg-card p-4">
              <div className="mono text-[10px] text-muted-foreground tracking-widest mb-3">STATUS DISTRIBUTION</div>
              <div className="w-full min-w-0 overflow-hidden">
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={statusPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60}
                      label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                      {statusPieData.map((entry, i) => (
                        <Cell key={i} fill={STATUS_COLORS[entry.name] ?? COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="border border-border bg-card p-4">
              <div className="mono text-[10px] text-muted-foreground tracking-widest mb-3">RAM DISTRIBUTION</div>
              {ramData.length === 0
                ? <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">No RAM data recorded</div>
                : (
                  <div className="w-full min-w-0 overflow-hidden">
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={ramData} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <Tooltip contentStyle={{ fontSize: 12 }} />
                        <Bar dataKey="count" fill="hsl(18 65% 45%)" radius={[2,2,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
            </div>

            <div className="border border-border bg-card p-4">
              <div className="mono text-[10px] text-muted-foreground tracking-widest mb-3">STORAGE TYPE DISTRIBUTION</div>
              {storageData.length === 0
                ? <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">No storage data recorded</div>
                : (
                  <div className="w-full min-w-0 overflow-hidden">
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie data={storageData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60}
                          label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                          {storageData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Legend layout="horizontal" wrapperStyle={{ paddingTop: 8, fontSize: 11 }} />
                        <Tooltip contentStyle={{ fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
            </div>
          </div>
        )}

        {/* Internet Section */}
        {internet.length > 0 && (
          <div className="space-y-4">
            <div className="mono text-[10px] text-muted-foreground tracking-widest">INTERNET SUBSCRIPTIONS</div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="border border-border bg-card p-4">
                <div className="mono text-[10px] text-muted-foreground tracking-widest mb-3">LINES BY ISP</div>
                {ispData.length === 0
                  ? <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">No data</div>
                  : (
                    <div className="w-full min-w-0 overflow-hidden">
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={ispData} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                          <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                          <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
                          <Tooltip contentStyle={{ fontSize: 12 }} />
                          <Bar dataKey="count" fill="hsl(200 60% 45%)" radius={[0,2,2,0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
              </div>

              {speedData.length > 0 && (
                <div className="border border-border bg-card p-4">
                  <div className="mono text-[10px] text-muted-foreground tracking-widest mb-1">SUBSCRIBED vs ACTUAL SPEED (Mbps)</div>
                  <div className="text-xs text-muted-foreground mb-2">Avg actual DL: {avgDownload} Mbps</div>
                  <div className="w-full min-w-0 overflow-hidden">
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={speedData} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v, n) => [`${v} Mbps`, n]} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="subscribed" name="Subscribed" fill="hsl(18 85% 40%)" radius={[2,2,0,0]} />
                        <Bar dataKey="actual" name="Actual DL" fill="hsl(18 50% 65%)" radius={[2,2,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>

            {/* Internet table summary */}
            <div className="border border-border bg-card overflow-x-auto">
              <div className="px-4 py-2.5 border-b border-border bg-muted/30">
                <span className="mono text-[10px] text-muted-foreground tracking-widest">ALL CONNECTIONS SUMMARY</span>
              </div>
              <table className="w-full text-sm whitespace-nowrap">
                <thead className="border-b border-border">
                  <tr>
                    {['Location','ISP','Plan','Type','Subscribed','DL / UL','Cost/mo','Status'].map(h => (
                      <th key={h} className="px-4 py-2 text-left mono text-[10px] text-muted-foreground tracking-widest">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {internet.map(r => (
                    <tr key={r.id} className="border-b border-border/40 last:border-0 hover:bg-muted/10">
                      <td className="px-4 py-2 font-medium">{r.location}</td>
                      <td className="px-4 py-2">{r.isp_name}</td>
                      <td className="px-4 py-2">{r.plan_name}</td>
                      <td className="px-4 py-2 mono text-xs">{r.plan_type.toUpperCase()}</td>
                      <td className="px-4 py-2 font-semibold">{r.subscribed_speed_mbps} Mbps</td>
                      <td className="px-4 py-2 text-xs">{r.actual_dl_mbps != null ? `↓${r.actual_dl_mbps} / ↑${r.actual_ul_mbps ?? '?'}` : '—'}</td>
                      <td className="px-4 py-2 text-xs">{r.monthly_cost != null ? `₱${Number(r.monthly_cost).toLocaleString()}` : '—'}</td>
                      <td className="px-4 py-2">
                        <span className={`mono text-[10px] border px-1.5 py-0.5 ${r.status === 'active' ? 'border-green-500 text-green-600' : r.status === 'suspended' ? 'border-orange-400 text-orange-500' : 'border-gray-400 text-gray-500'}`}>
                          {r.status.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {totalMonthlyCost > 0 && (
                  <tfoot className="border-t border-border bg-muted/20">
                    <tr>
                      <td colSpan={6} className="px-4 py-2 text-right font-semibold text-sm">Total Monthly Cost:</td>
                      <td className="px-4 py-2 font-bold text-primary">₱{totalMonthlyCost.toLocaleString()}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}

        {/* Speed Test History Section */}
        {speedLogs.length > 0 && (
          <div className="space-y-4">
            {/* Section header with date filter + export */}
            <div className="flex flex-wrap items-end gap-3 justify-between">
              <div className="flex items-center gap-2">
                <CalendarRange className="w-3.5 h-3.5 text-primary" />
                <span className="mono text-[10px] text-muted-foreground tracking-widest">SPEED TEST HISTORY</span>
                {(dateFrom || dateTo) && (
                  <span className="mono text-[10px] text-primary border border-primary/30 px-1.5 py-0.5">
                    {filteredSpeedLogs.length} of {speedLogs.length} tests
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-end gap-2">
                {/* Quick presets */}
                <div className="flex gap-1">
                  {[7, 30, 90].map(d => (
                    <button key={d} onClick={() => applyPreset(d)}
                      className="mono text-[10px] border border-border px-2 py-1 hover:border-primary hover:text-primary transition-colors">
                      {d}d
                    </button>
                  ))}
                  {(dateFrom || dateTo) && (
                    <button onClick={() => { setDateFrom(''); setDateTo(''); }}
                      className="mono text-[10px] border border-border px-2 py-1 hover:border-destructive hover:text-destructive transition-colors">
                      Clear
                    </button>
                  )}
                </div>
                {/* Custom range */}
                <div className="flex items-end gap-2">
                  <div className="space-y-0.5">
                    <Label className="mono text-[10px] text-muted-foreground">FROM</Label>
                    <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                      className="h-7 text-xs w-36" />
                  </div>
                  <div className="space-y-0.5">
                    <Label className="mono text-[10px] text-muted-foreground">TO</Label>
                    <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                      className="h-7 text-xs w-36" />
                  </div>
                </div>
                {/* Export */}
                <Button size="sm" variant="ghost" onClick={() => exportSpeedLogsCSV(filteredSpeedLogs)}
                  className="border border-border text-xs h-7 px-2">
                  <FileDown className="w-3 h-3 mr-1" /> Export CSV
                </Button>
              </div>
            </div>

            {filteredSpeedLogs.length === 0
              ? (
                <div className="border border-border bg-card py-10 text-center text-sm text-muted-foreground">
                  No speed test records in the selected date range.
                </div>
              )
              : (
                <div className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    {/* Global trend */}
                    <div className="border border-border bg-card p-4">
                      <div className="mono text-[10px] text-muted-foreground tracking-widest mb-1">AVERAGE DL SPEED TREND (ALL CONNECTIONS)</div>
                      <div className="text-xs text-muted-foreground mb-2">{filteredSpeedLogs.length} test{filteredSpeedLogs.length !== 1 ? 's' : ''} in range</div>
                      <div className="w-full min-w-0 overflow-hidden">
                        <ResponsiveContainer width="100%" height={180}>
                          <LineChart data={globalTrendData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 10 }} />
                            <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v: number) => [`${v} Mbps`, 'Avg DL']} />
                            <Line type="monotone" dataKey="avg_dl" name="Avg DL" stroke="hsl(18 85% 40%)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Latest per connection */}
                    <div className="border border-border bg-card p-4">
                      <div className="mono text-[10px] text-muted-foreground tracking-widest mb-3">LATEST TEST PER CONNECTION</div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs whitespace-nowrap">
                          <thead className="border-b border-border">
                            <tr>
                              {['Location','ISP','DL (Mbps)','UL (Mbps)','Latency','Tested'].map(h => (
                                <th key={h} className="px-3 py-1.5 text-left mono text-[10px] text-muted-foreground tracking-widest">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {Object.values(byConnection).map(logs => {
                              const latest = logs[logs.length - 1];
                              return (
                                <tr key={latest.id} className="border-b border-border/30 last:border-0 hover:bg-muted/10">
                                  <td className="px-3 py-1.5 font-medium">{latest.internet?.location ?? '—'}</td>
                                  <td className="px-3 py-1.5 text-muted-foreground">{latest.internet?.isp_name ?? '—'}</td>
                                  <td className="px-3 py-1.5 font-semibold text-primary">{latest.dl_mbps}</td>
                                  <td className="px-3 py-1.5">{latest.ul_mbps ?? '—'}</td>
                                  <td className="px-3 py-1.5">{latest.latency_ms != null ? `${latest.latency_ms} ms` : '—'}</td>
                                  <td className="px-3 py-1.5 mono">{formatUtc8Date(latest.tested_at)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  {/* Per-connection line charts when >1 connection */}
                  {Object.entries(byConnection).length > 1 && (
                    <div className="grid md:grid-cols-2 gap-4">
                      {Object.entries(byConnection).map(([, logs]) => {
                        const conn = logs[0].internet;
                        const chartData = logs.map(l => ({
                          date: formatUtc8ShortDate(l.tested_at),
                          dl: l.dl_mbps,
                          ul: l.ul_mbps ?? undefined,
                        }));
                        return (
                          <div key={logs[0].internet_id} className="border border-border bg-card p-4">
                            <div className="mono text-[10px] text-muted-foreground tracking-widest mb-1">
                              {conn ? `${conn.location} — ${conn.isp_name}` : 'Connection'}
                            </div>
                            <div className="w-full min-w-0 overflow-hidden">
                              <ResponsiveContainer width="100%" height={150}>
                                <LineChart data={chartData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                  <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                                  <YAxis tick={{ fontSize: 9 }} />
                                  <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v: number, n: string) => [`${v} Mbps`, n.toUpperCase()]} />
                                  <Legend wrapperStyle={{ fontSize: 10 }} />
                                  <Line type="monotone" dataKey="dl" name="DL" stroke="hsl(18 85% 40%)" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                                  <Line type="monotone" dataKey="ul" name="UL" stroke="hsl(18 50% 65%)" strokeWidth={1.5} dot={{ r: 2 }} connectNulls />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
          </div>
        )}
      </div>
    </MainLayout>
  );
}

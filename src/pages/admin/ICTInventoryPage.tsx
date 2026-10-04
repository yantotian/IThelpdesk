import { useEffect, useState, useCallback } from 'react';
import MainLayout from '@/components/layouts/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  Monitor, Laptop, Printer, Router, Wifi, Plus, Pencil, Trash2,
  Search, RefreshCw, ChevronDown, ChevronUp, FileDown, Activity,
  Link2, Unlink, Gauge,
} from 'lucide-react';
import {
  getICTDevices, createICTDevice, updateICTDevice, deleteICTDevice,
  getICTInternet, createICTInternet, updateICTInternet, deleteICTInternet,
  getSpeedTestLogs, createSpeedTestLog, deleteSpeedTestLog,
  getDeviceTicketLinks, createDeviceTicketLink, deleteDeviceTicketLink,
  searchTickets,
} from '@/lib/api';
import type { ICTDevice, ICTInternet, DeviceType, SpeedTestLog, DeviceTicketLink } from '@/types/types';
import { useAuth } from '@/contexts/AuthContext';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from 'recharts';
import { formatUtc8Date, formatUtc8ShortDate, formatUtc8DateTime, formatUtc8DateStamp } from '@/lib/utils';

// ── Helpers ──────────────────────────────────────────────────────────────────
const DEVICE_TABS: { key: DeviceType | 'internet'; label: string; icon: React.ReactNode }[] = [
  { key: 'laptop',   label: 'Laptops',   icon: <Laptop  className="w-4 h-4" /> },
  { key: 'desktop',  label: 'Desktops',  icon: <Monitor className="w-4 h-4" /> },
  { key: 'printer',  label: 'Printers',  icon: <Printer className="w-4 h-4" /> },
  { key: 'router',   label: 'Routers',   icon: <Router  className="w-4 h-4" /> },
  { key: 'internet', label: 'Internet',  icon: <Wifi    className="w-4 h-4" /> },
];

const STATUS_COLORS: Record<string, string> = {
  active:       'border-green-500 text-green-600',
  inactive:     'border-gray-400 text-gray-500',
  under_repair: 'border-yellow-500 text-yellow-600',
  retired:      'border-red-400 text-red-500',
  suspended:    'border-orange-400 text-orange-500',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`mono text-[10px] border px-1.5 py-0.5 ${STATUS_COLORS[status] ?? 'border-border text-muted-foreground'}`}>
      {status.replace(/_/g,' ').toUpperCase()}
    </span>
  );
}

function exportDevicesCSV(devices: ICTDevice[], type: string) {
  const headers = ['Type','Brand','Model','Serial No','Asset Tag','Location','Assigned To','Status',
    'CPU','GPU','RAM (GB)','Storage (GB)','Storage Type','OS',
    'Printer Type','Network Printer','Router Type','WiFi Standard','Ports',
    'Purchase Date','Warranty Until','Notes'];
  const escape = (v: string | number | boolean | null | undefined) => `"${String(v ?? '').replace(/"/g,'""')}"`;
  const lines = [headers.join(','), ...devices.map(d => [
    d.device_type, d.brand, d.model, d.serial_no, d.asset_tag, d.location, d.assigned_to, d.status,
    d.cpu, d.gpu, d.ram_gb, d.storage_gb, d.storage_type, d.os,
    d.printer_type, d.is_network_printer, d.router_type, d.wifi_standard, d.num_ports,
    d.purchase_date, d.warranty_until, d.notes,
  ].map(escape).join(','))];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `ict-${type}-${formatUtc8DateStamp(new Date())}.csv`; a.click();
}

function exportInternetCSV(rows: ICTInternet[]) {
  const headers = ['Location','ISP','Plan Name','Plan Type','Subscribed (Mbps)','DL (Mbps)','UL (Mbps)',
    'Monthly Cost','Contract Start','Contract End','Account No','Contact Person','Contact Number','Router','Status','Notes'];
  const escape = (v: string | number | null | undefined) => `"${String(v ?? '').replace(/"/g,'""')}"`;
  const lines = [headers.join(','), ...rows.map(r => [
    r.location, r.isp_name, r.plan_name, r.plan_type, r.subscribed_speed_mbps,
    r.actual_dl_mbps, r.actual_ul_mbps, r.monthly_cost,
    r.contract_start, r.contract_end, r.account_no,
    r.contact_person, r.contact_number,
    r.router ? `${r.router.brand} ${r.router.model}` : '',
    r.status, r.notes,
  ].map(escape).join(','))];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `ict-internet-${formatUtc8DateStamp(new Date())}.csv`; a.click();
}

// ── Device Form ───────────────────────────────────────────────────────────────
const EMPTY_DEVICE: Partial<ICTDevice> = {
  device_type: 'laptop', brand: '', model: '', serial_no: '', asset_tag: '',
  location: '', assigned_to: '', status: 'active',
  cpu: '', gpu: '', ram_gb: undefined, storage_gb: undefined, storage_type: undefined, os: '',
  printer_type: undefined, is_network_printer: false,
  router_type: undefined, wifi_standard: '', num_ports: undefined,
  purchase_date: '', warranty_until: '', notes: '',
};

function DeviceForm({
  initial, onSave, onClose, routers,
}: { initial: Partial<ICTDevice>; onSave: (d: Partial<ICTDevice>) => Promise<void>; onClose: () => void; routers: ICTDevice[] }) {
  const [form, setForm] = useState<Partial<ICTDevice>>(initial);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof ICTDevice, v: unknown) => setForm(p => ({ ...p, [k]: v }));
  const type = form.device_type;

  const handleSave = async () => {
    if (!form.brand?.trim()) { toast.error('Brand is required'); return; }
    if (!form.model?.trim()) { toast.error('Model is required'); return; }
    setSaving(true);
    try { await onSave(form); } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  return (
    <div className="space-y-4 text-sm">
      {/* Basic */}
      <div>
        <div className="mono text-[10px] text-muted-foreground tracking-widest mb-2">BASIC INFORMATION</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Device Type</Label>
            <Select value={form.device_type} onValueChange={v => set('device_type', v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(['laptop','desktop','printer','router'] as DeviceType[]).map(t => (
                  <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Status</Label>
            <Select value={form.status} onValueChange={v => set('status', v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {['active','inactive','under_repair','retired'].map(s => (
                  <SelectItem key={s} value={s}>{s.replace(/_/g,' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {[['brand','Brand *'],['model','Model *'],['serial_no','Serial No'],['asset_tag','Asset Tag'],
            ['location','Location'],['assigned_to','Assigned To']].map(([k,l]) => (
            <div key={k} className="space-y-1">
              <Label className="text-xs font-semibold">{l}</Label>
              <Input value={(form as any)[k] ?? ''} onChange={e => set(k as keyof ICTDevice, e.target.value)} className="h-9 text-sm" />
            </div>
          ))}
        </div>
      </div>

      {/* Compute specs */}
      {(type === 'laptop' || type === 'desktop') && (
        <div>
          <div className="mono text-[10px] text-muted-foreground tracking-widest mb-2">HARDWARE SPECIFICATIONS</div>
          <div className="grid grid-cols-2 gap-3">
            {[['cpu','CPU'],['gpu','GPU'],['os','Operating System']].map(([k,l]) => (
              <div key={k} className={`space-y-1 ${k === 'os' ? 'col-span-2' : ''}`}>
                <Label className="text-xs font-semibold">{l}</Label>
                <Input value={(form as any)[k] ?? ''} onChange={e => set(k as keyof ICTDevice, e.target.value)} className="h-9 text-sm" placeholder={k === 'cpu' ? 'e.g. Intel Core i7-1255U' : k === 'gpu' ? 'e.g. NVIDIA RTX 3060' : ''} />
              </div>
            ))}
            <div className="space-y-1">
              <Label className="text-xs font-semibold">RAM (GB)</Label>
              <Input type="number" value={form.ram_gb ?? ''} onChange={e => set('ram_gb', e.target.value ? +e.target.value : undefined)} className="h-9 text-sm" placeholder="e.g. 16" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Storage (GB)</Label>
              <Input type="number" value={form.storage_gb ?? ''} onChange={e => set('storage_gb', e.target.value ? +e.target.value : undefined)} className="h-9 text-sm" placeholder="e.g. 512" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Storage Type</Label>
              <Select value={form.storage_type ?? ''} onValueChange={v => set('storage_type', v || undefined)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {['HDD','SSD','NVMe','eMMC'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      {/* Printer specs */}
      {type === 'printer' && (
        <div>
          <div className="mono text-[10px] text-muted-foreground tracking-widest mb-2">PRINTER SPECIFICATIONS</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Printer Type</Label>
              <Select value={form.printer_type ?? ''} onValueChange={v => set('printer_type', v || undefined)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {['inkjet','laser','dot_matrix','thermal'].map(t => <SelectItem key={t} value={t}>{t.replace('_',' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Network Printer</Label>
              <Select value={String(form.is_network_printer ?? false)} onValueChange={v => set('is_network_printer', v === 'true')}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="false">No</SelectItem>
                  <SelectItem value="true">Yes</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      {/* Router specs */}
      {type === 'router' && (
        <div>
          <div className="mono text-[10px] text-muted-foreground tracking-widest mb-2">ROUTER SPECIFICATIONS</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Router Type</Label>
              <Select value={form.router_type ?? ''} onValueChange={v => set('router_type', v || undefined)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {['wired','wireless','fiber','mesh'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">WiFi Standard</Label>
              <Input value={form.wifi_standard ?? ''} onChange={e => set('wifi_standard', e.target.value)} className="h-9 text-sm" placeholder="e.g. Wi-Fi 6 (802.11ax)" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Number of Ports</Label>
              <Input type="number" value={form.num_ports ?? ''} onChange={e => set('num_ports', e.target.value ? +e.target.value : undefined)} className="h-9 text-sm" placeholder="e.g. 4" />
            </div>
          </div>
        </div>
      )}

      {/* Dates & Notes */}
      <div>
        <div className="mono text-[10px] text-muted-foreground tracking-widest mb-2">PURCHASE & WARRANTY</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Purchase Date</Label>
            <Input type="date" value={form.purchase_date ?? ''} onChange={e => set('purchase_date', e.target.value || null)} className="h-9 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Warranty Until</Label>
            <Input type="date" value={form.warranty_until ?? ''} onChange={e => set('warranty_until', e.target.value || null)} className="h-9 text-sm" />
          </div>
          <div className="space-y-1 col-span-2">
            <Label className="text-xs font-semibold">Notes</Label>
            <Textarea value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} rows={2} className="text-sm" />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1 border-t border-border">
        <Button variant="outline" onClick={onClose} className="text-sm">Cancel</Button>
        <Button onClick={handleSave} disabled={saving} className="text-sm">{saving ? 'Saving...' : 'Save Device'}</Button>
      </div>
    </div>
  );
}

// ── Internet Form ─────────────────────────────────────────────────────────────
const EMPTY_INTERNET: Partial<ICTInternet> = {
  location: '', isp_name: '', plan_name: '', plan_type: 'fiber',
  subscribed_speed_mbps: undefined as any, actual_dl_mbps: undefined as any, actual_ul_mbps: undefined as any,
  monthly_cost: undefined as any, contract_start: '', contract_end: '',
  account_no: '', contact_person: '', contact_number: '',
  router_id: undefined, status: 'active', notes: '',
};

function InternetForm({
  initial, onSave, onClose, routers,
}: { initial: Partial<ICTInternet>; onSave: (d: Partial<ICTInternet>) => Promise<void>; onClose: () => void; routers: ICTDevice[] }) {
  const [form, setForm] = useState<Partial<ICTInternet>>(initial);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof ICTInternet, v: unknown) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!form.location?.trim()) { toast.error('Location is required'); return; }
    if (!form.isp_name?.trim()) { toast.error('ISP Name is required'); return; }
    if (!form.plan_name?.trim()) { toast.error('Plan Name is required'); return; }
    if (!form.subscribed_speed_mbps) { toast.error('Subscribed Speed is required'); return; }
    setSaving(true);
    try { await onSave(form); } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  return (
    <div className="space-y-4 text-sm">
      <div>
        <div className="mono text-[10px] text-muted-foreground tracking-widest mb-2">CONNECTION DETAILS</div>
        <div className="grid grid-cols-2 gap-3">
          {[['location','Location *'],['isp_name','ISP Name *'],['plan_name','Plan Name *'],['account_no','Account No']].map(([k,l]) => (
            <div key={k} className="space-y-1">
              <Label className="text-xs font-semibold">{l}</Label>
              <Input value={(form as any)[k] ?? ''} onChange={e => set(k as keyof ICTInternet, e.target.value)} className="h-9 text-sm" />
            </div>
          ))}
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Plan Type</Label>
            <Select value={form.plan_type ?? 'fiber'} onValueChange={v => set('plan_type', v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {['fiber','dsl','cable','wireless','satellite'].map(t => <SelectItem key={t} value={t}>{t.toUpperCase()}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Status</Label>
            <Select value={form.status ?? 'active'} onValueChange={v => set('status', v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {['active','inactive','suspended'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div>
        <div className="mono text-[10px] text-muted-foreground tracking-widest mb-2">SPEED &amp; COST</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Subscribed Speed (Mbps) *</Label>
            <Input type="number" value={form.subscribed_speed_mbps ?? ''} onChange={e => set('subscribed_speed_mbps', +e.target.value)} className="h-9 text-sm" placeholder="e.g. 100" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Actual DL (Mbps)</Label>
            <Input type="number" value={form.actual_dl_mbps ?? ''} onChange={e => set('actual_dl_mbps', e.target.value ? +e.target.value : null)} className="h-9 text-sm" placeholder="e.g. 95.5" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Actual UL (Mbps)</Label>
            <Input type="number" value={form.actual_ul_mbps ?? ''} onChange={e => set('actual_ul_mbps', e.target.value ? +e.target.value : null)} className="h-9 text-sm" placeholder="e.g. 48.2" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Monthly Cost (₱)</Label>
            <Input type="number" value={form.monthly_cost ?? ''} onChange={e => set('monthly_cost', e.target.value ? +e.target.value : null)} className="h-9 text-sm" placeholder="e.g. 2499" />
          </div>
        </div>
      </div>

      <div>
        <div className="mono text-[10px] text-muted-foreground tracking-widest mb-2">CONTRACT &amp; CONTACT</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Contract Start</Label>
            <Input type="date" value={form.contract_start ?? ''} onChange={e => set('contract_start', e.target.value || null)} className="h-9 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Contract End</Label>
            <Input type="date" value={form.contract_end ?? ''} onChange={e => set('contract_end', e.target.value || null)} className="h-9 text-sm" />
          </div>
          {[['contact_person','Contact Person'],['contact_number','Contact Number']].map(([k,l]) => (
            <div key={k} className="space-y-1">
              <Label className="text-xs font-semibold">{l}</Label>
              <Input value={(form as any)[k] ?? ''} onChange={e => set(k as keyof ICTInternet, e.target.value)} className="h-9 text-sm" />
            </div>
          ))}
          <div className="space-y-1 col-span-2">
            <Label className="text-xs font-semibold">Linked Router</Label>
            <Select value={form.router_id ?? 'none'} onValueChange={v => set('router_id', v === 'none' ? null : v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {routers.map(r => <SelectItem key={r.id} value={r.id}>{r.brand} {r.model} ({r.asset_tag ?? r.serial_no ?? r.id.slice(0,8)})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 col-span-2">
            <Label className="text-xs font-semibold">Notes</Label>
            <Textarea value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} rows={2} className="text-sm" />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1 border-t border-border">
        <Button variant="outline" onClick={onClose} className="text-sm">Cancel</Button>
        <Button onClick={handleSave} disabled={saving} className="text-sm">{saving ? 'Saving...' : 'Save Connection'}</Button>
      </div>
    </div>
  );
}

// ── Speed Test Panel (inside Internet expanded row) ───────────────────────────
function SpeedTestPanel({ connection, isAdmin }: { connection: ICTInternet; isAdmin: boolean }) {
  const [logs, setLogs] = useState<SpeedTestLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ dl_mbps: '', ul_mbps: '', latency_ms: '', notes: '', tested_at: '' });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try { setLogs(await getSpeedTestLogs(connection.id)); } catch (e: any) { toast.error(e.message); }
    setLoading(false);
  }, [connection.id]);

  useEffect(() => { reload(); }, [reload]);

  const handleSave = async () => {
    if (!form.dl_mbps) { toast.error('Download speed is required'); return; }
    setSaving(true);
    try {
      await createSpeedTestLog({
        internet_id: connection.id,
        dl_mbps: parseFloat(form.dl_mbps),
        ul_mbps: form.ul_mbps ? parseFloat(form.ul_mbps) : null,
        latency_ms: form.latency_ms ? parseInt(form.latency_ms) : null,
        notes: form.notes || null,
        tested_at: form.tested_at || undefined,
      });
      toast.success('Speed test logged');
      setForm({ dl_mbps: '', ul_mbps: '', latency_ms: '', notes: '', tested_at: '' });
      setShowForm(false);
      reload();
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try { await deleteSpeedTestLog(deleteId); toast.success('Log deleted'); setDeleteId(null); reload(); }
    catch (e: any) { toast.error(e.message); }
  };

  const chartData = logs.map(l => ({
    date: formatUtc8ShortDate(l.tested_at),
    dl: l.dl_mbps,
    ul: l.ul_mbps ?? undefined,
    latency: l.latency_ms ?? undefined,
  }));

  return (
    <div className="border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Gauge className="w-3.5 h-3.5 text-primary" />
          <span className="mono text-[10px] text-muted-foreground tracking-widest">SPEED TEST HISTORY — {connection.location} / {connection.isp_name}</span>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={() => setShowForm(s => !s)} className="text-xs h-7 px-2">
            <Plus className="w-3 h-3 mr-1" /> Log Test
          </Button>
        )}
      </div>

      {showForm && (
        <div className="border border-border bg-muted/20 p-3 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">DL Speed (Mbps) *</Label>
              <Input value={form.dl_mbps} onChange={e => setForm(p => ({ ...p, dl_mbps: e.target.value }))} className="h-8 text-sm" placeholder="e.g. 95.4" type="number" step="0.1" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">UL Speed (Mbps)</Label>
              <Input value={form.ul_mbps} onChange={e => setForm(p => ({ ...p, ul_mbps: e.target.value }))} className="h-8 text-sm" placeholder="e.g. 48.2" type="number" step="0.1" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Latency (ms)</Label>
              <Input value={form.latency_ms} onChange={e => setForm(p => ({ ...p, latency_ms: e.target.value }))} className="h-8 text-sm" placeholder="e.g. 12" type="number" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Tested At</Label>
              <Input value={form.tested_at} onChange={e => setForm(p => ({ ...p, tested_at: e.target.value }))} className="h-8 text-sm" type="datetime-local" />
            </div>
            <div className="space-y-1 col-span-2 md:col-span-4">
              <Label className="text-xs font-semibold">Notes</Label>
              <Input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className="h-8 text-sm" placeholder="Optional notes" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={saving} className="text-xs h-7">{saving ? 'Saving...' : 'Save'}</Button>
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)} className="text-xs h-7">Cancel</Button>
          </div>
        </div>
      )}

      {loading
        ? <div className="text-xs text-muted-foreground animate-pulse py-2">Loading...</div>
        : logs.length === 0
          ? <div className="text-xs text-muted-foreground py-2">No speed tests logged yet.</div>
          : (
            <div className="space-y-3">
              {/* Trend chart */}
              <div className="w-full min-w-0 overflow-hidden">
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={chartData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v: number, n: string) => [`${v} ${n === 'latency' ? 'ms' : 'Mbps'}`, n.toUpperCase()]} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Line type="monotone" dataKey="dl" name="DL" stroke="hsl(18 85% 40%)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    <Line type="monotone" dataKey="ul" name="UL" stroke="hsl(18 50% 65%)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    <Line type="monotone" dataKey="latency" name="latency" stroke="hsl(200 60% 45%)" strokeWidth={1} strokeDasharray="4 2" dot={{ r: 2 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Log table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs whitespace-nowrap">
                  <thead className="border-b border-border">
                    <tr>
                      {['Tested At', 'DL (Mbps)', 'UL (Mbps)', 'Latency (ms)', 'Notes', ...(isAdmin ? [''] : [])].map(h => (
                        <th key={h} className="px-3 py-1.5 text-left mono text-[10px] text-muted-foreground tracking-widest">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...logs].reverse().map(l => (
                      <tr key={l.id} className="border-b border-border/30 last:border-0 hover:bg-muted/10">
                        <td className="px-3 py-1.5 mono">{formatUtc8DateTime(l.tested_at)}</td>
                        <td className="px-3 py-1.5 font-semibold text-primary">{l.dl_mbps}</td>
                        <td className="px-3 py-1.5">{l.ul_mbps ?? '—'}</td>
                        <td className="px-3 py-1.5">{l.latency_ms != null ? `${l.latency_ms} ms` : '—'}</td>
                        <td className="px-3 py-1.5 text-muted-foreground max-w-[200px] truncate">{l.notes ?? '—'}</td>
                        {isAdmin && (
                          <td className="px-3 py-1.5">
                            <button onClick={() => setDeleteId(l.id)} className="text-destructive hover:text-destructive/80">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

      <AlertDialog open={!!deleteId} onOpenChange={o => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this log entry?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Device-Ticket Links Panel (inside device expanded row) ────────────────────
function DeviceTicketsPanel({ device, isAdmin }: { device: ICTDevice; isAdmin: boolean }) {
  const [links, setLinks] = useState<DeviceTicketLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [ticketSearch, setTicketSearch] = useState('');
  const [searchResults, setSearchResults] = useState<{ id: string; ticket_number: string; subject: string; status: string; priority: string }[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<{ id: string; ticket_number: string; subject: string } | null>(null);
  const [linkNote, setLinkNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try { setLinks(await getDeviceTicketLinks(device.id)); } catch (e: any) { toast.error(e.message); }
    setLoading(false);
  }, [device.id]);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    if (!ticketSearch.trim()) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try { setSearchResults(await searchTickets(ticketSearch)); } catch { /* ignore */ }
      setSearching(false);
    }, 350);
    return () => clearTimeout(t);
  }, [ticketSearch]);

  const handleLink = async () => {
    if (!selectedTicket) { toast.error('Select a ticket first'); return; }
    setSaving(true);
    try {
      await createDeviceTicketLink({ device_id: device.id, ticket_id: selectedTicket.id, note: linkNote || null });
      toast.success(`Linked to ${selectedTicket.ticket_number}`);
      setShowForm(false); setSelectedTicket(null); setTicketSearch(''); setLinkNote('');
      reload();
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  const handleUnlink = async () => {
    if (!deleteId) return;
    try { await deleteDeviceTicketLink(deleteId); toast.success('Link removed'); setDeleteId(null); reload(); }
    catch (e: any) { toast.error(e.message); }
  };

  const STATUS_DOT: Record<string, string> = {
    new: 'bg-blue-500', assigned: 'bg-indigo-500', in_progress: 'bg-yellow-500',
    resolved: 'bg-green-500', closed: 'bg-gray-400', on_hold: 'bg-orange-400', verified: 'bg-teal-500',
  };

  return (
    <div className="border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Link2 className="w-3.5 h-3.5 text-primary" />
          <span className="mono text-[10px] text-muted-foreground tracking-widest">LINKED TICKETS — {device.brand} {device.model}</span>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={() => setShowForm(s => !s)} className="text-xs h-7 px-2">
            <Plus className="w-3 h-3 mr-1" /> Link Ticket
          </Button>
        )}
      </div>

      {showForm && (
        <div className="border border-border bg-muted/20 p-3 space-y-3">
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Search Ticket</Label>
            <Input
              value={ticketSearch}
              onChange={e => { setTicketSearch(e.target.value); setSelectedTicket(null); }}
              placeholder="Ticket number or subject..."
              className="h-8 text-sm"
            />
          </div>
          {searching && <div className="text-xs text-muted-foreground animate-pulse">Searching...</div>}
          {searchResults.length > 0 && !selectedTicket && (
            <div className="border border-border bg-card max-h-40 overflow-y-auto">
              {searchResults.map(t => (
                <button key={t.id} onClick={() => { setSelectedTicket(t); setTicketSearch(`${t.ticket_number} — ${t.subject}`); setSearchResults([]); }}
                  className="w-full flex items-start gap-2 px-3 py-2 hover:bg-muted/30 text-left">
                  <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[t.status] ?? 'bg-gray-400'}`} />
                  <span className="mono text-xs text-primary shrink-0">{t.ticket_number}</span>
                  <span className="text-xs text-foreground truncate">{t.subject}</span>
                </button>
              ))}
            </div>
          )}
          {selectedTicket && (
            <div className="text-xs text-muted-foreground border border-border px-3 py-2 bg-muted/10">
              Selected: <span className="text-primary font-semibold mono">{selectedTicket.ticket_number}</span> — {selectedTicket.subject}
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Link Note (optional)</Label>
            <Input value={linkNote} onChange={e => setLinkNote(e.target.value)} className="h-8 text-sm" placeholder="e.g. Hardware failure reported" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleLink} disabled={saving || !selectedTicket} className="text-xs h-7">{saving ? 'Linking...' : 'Link'}</Button>
            <Button size="sm" variant="outline" onClick={() => { setShowForm(false); setSelectedTicket(null); setTicketSearch(''); }} className="text-xs h-7">Cancel</Button>
          </div>
        </div>
      )}

      {loading
        ? <div className="text-xs text-muted-foreground animate-pulse py-2">Loading...</div>
        : links.length === 0
          ? <div className="text-xs text-muted-foreground py-2">No tickets linked yet.</div>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs whitespace-nowrap">
                <thead className="border-b border-border">
                  <tr>
                    {['Ticket No', 'Subject', 'Status', 'Priority', 'Note', 'Linked At', ...(isAdmin ? [''] : [])].map(h => (
                      <th key={h} className="px-3 py-1.5 text-left mono text-[10px] text-muted-foreground tracking-widest">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {links.map(l => (
                    <tr key={l.id} className="border-b border-border/30 last:border-0 hover:bg-muted/10">
                      <td className="px-3 py-1.5 mono text-primary font-semibold">{l.ticket?.ticket_number ?? '—'}</td>
                      <td className="px-3 py-1.5 max-w-[200px] truncate">{l.ticket?.subject ?? '—'}</td>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-1">
                          <span className={`w-2 h-2 rounded-full ${STATUS_DOT[l.ticket?.status ?? ''] ?? 'bg-gray-400'}`} />
                          <span className="mono text-[10px]">{(l.ticket?.status ?? '—').replace(/_/g, ' ').toUpperCase()}</span>
                        </div>
                      </td>
                      <td className="px-3 py-1.5 mono text-[10px]">{(l.ticket?.priority ?? '—').toUpperCase()}</td>
                      <td className="px-3 py-1.5 text-muted-foreground max-w-[160px] truncate">{l.note ?? '—'}</td>
                      <td className="px-3 py-1.5 mono">{formatUtc8Date(l.created_at)}</td>
                      {isAdmin && (
                        <td className="px-3 py-1.5">
                          <button onClick={() => setDeleteId(l.id)} className="text-destructive hover:text-destructive/80">
                            <Unlink className="w-3 h-3" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

      <AlertDialog open={!!deleteId} onOpenChange={o => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this ticket link?</AlertDialogTitle>
            <AlertDialogDescription>The ticket will not be deleted — only the association is removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleUnlink} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remove Link</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
export default function ICTInventoryPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'it_admin' || profile?.role === 'sysadmin';

  const [activeTab, setActiveTab] = useState<DeviceType | 'internet'>('laptop');
  const [devices, setDevices] = useState<ICTDevice[]>([]);
  const [internet, setInternet] = useState<ICTInternet[]>([]);
  const [routers, setRouters] = useState<ICTDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [deviceDialog, setDeviceDialog] = useState<{ open: boolean; editing: ICTDevice | null }>({ open: false, editing: null });
  const [internetDialog, setInternetDialog] = useState<{ open: boolean; editing: ICTInternet | null }>({ open: false, editing: null });
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; type: 'device' | 'internet' } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [devs, nets, rts] = await Promise.all([
        getICTDevices(activeTab !== 'internet' ? activeTab : undefined),
        activeTab === 'internet' ? getICTInternet() : Promise.resolve([] as ICTInternet[]),
        getICTDevices('router'),
      ]);
      setDevices(devs);
      setInternet(nets);
      setRouters(rts);
    } catch (e: any) { toast.error(e.message); }
    setLoading(false);
  }, [activeTab]);

  useEffect(() => { reload(); setSearch(''); setStatusFilter('all'); }, [reload]);

  const filteredDevices = devices.filter(d => {
    const q = search.toLowerCase();
    const matchSearch = !q || d.brand.toLowerCase().includes(q) || d.model.toLowerCase().includes(q)
      || (d.serial_no ?? '').toLowerCase().includes(q) || (d.asset_tag ?? '').toLowerCase().includes(q)
      || (d.location ?? '').toLowerCase().includes(q) || (d.assigned_to ?? '').toLowerCase().includes(q);
    return matchSearch && (statusFilter === 'all' || d.status === statusFilter);
  });

  const filteredInternet = internet.filter(r => {
    const q = search.toLowerCase();
    const matchSearch = !q || r.isp_name.toLowerCase().includes(q) || r.plan_name.toLowerCase().includes(q)
      || r.location.toLowerCase().includes(q);
    return matchSearch && (statusFilter === 'all' || r.status === statusFilter);
  });

  const handleSaveDevice = async (data: Partial<ICTDevice>) => {
    if (deviceDialog.editing) {
      await updateICTDevice(deviceDialog.editing.id, data);
      toast.success('Device updated');
    } else {
      await createICTDevice(data);
      toast.success('Device added');
    }
    setDeviceDialog({ open: false, editing: null });
    reload();
  };

  const handleSaveInternet = async (data: Partial<ICTInternet>) => {
    if (internetDialog.editing) {
      await updateICTInternet(internetDialog.editing.id, data);
      toast.success('Connection updated');
    } else {
      await createICTInternet(data);
      toast.success('Connection added');
    }
    setInternetDialog({ open: false, editing: null });
    reload();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.type === 'device') await deleteICTDevice(deleteTarget.id);
      else await deleteICTInternet(deleteTarget.id);
      toast.success('Deleted');
      setDeleteTarget(null);
      reload();
    } catch (e: any) { toast.error(e.message); }
    setDeleting(false);
  };

  const tabCounts: Record<string, number> = {
    laptop: devices.filter(d => d.device_type === 'laptop').length,
    desktop: devices.filter(d => d.device_type === 'desktop').length,
    printer: devices.filter(d => d.device_type === 'printer').length,
    router: devices.filter(d => d.device_type === 'router').length,
    internet: internet.length,
  };

  // When switching non-internet tabs, we need counts from all-devices fetch
  // so also keep a summary loaded
  const [allDeviceSummary, setAllDeviceSummary] = useState<Record<string, number>>({});
  useEffect(() => {
    getICTDevices().then(all => {
      const s: Record<string, number> = {};
      all.forEach(d => { s[d.device_type] = (s[d.device_type] ?? 0) + 1; });
      setAllDeviceSummary(s);
    }).catch(() => {});
  }, [devices]);

  return (
    <MainLayout>
      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="laser-line mb-2 w-24" />
            <h1 className="text-xl font-bold text-foreground">ICT Inventory</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Manage laptops, desktops, printers, routers, and internet subscriptions.</p>
          </div>
          <div className="flex gap-2">
            {activeTab !== 'internet' && isAdmin && (
              <Button size="sm" onClick={() => exportDevicesCSV(filteredDevices, activeTab)} variant="ghost" className="border border-border text-xs">
                <FileDown className="w-3 h-3 mr-1" /> Export CSV
              </Button>
            )}
            {activeTab === 'internet' && isAdmin && (
              <Button size="sm" onClick={() => exportInternetCSV(filteredInternet)} variant="ghost" className="border border-border text-xs">
                <FileDown className="w-3 h-3 mr-1" /> Export CSV
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={reload} className="border border-border text-xs">
              <RefreshCw className="w-3 h-3 mr-1" /> Refresh
            </Button>
            {isAdmin && (
              <Button size="sm" onClick={() => activeTab === 'internet'
                ? setInternetDialog({ open: true, editing: null })
                : setDeviceDialog({ open: true, editing: null })}
                className="text-xs">
                <Plus className="w-3 h-3 mr-1" />
                Add {activeTab === 'internet' ? 'Connection' : activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
              </Button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border overflow-x-auto">
          {DEVICE_TABS.map(({ key, label, icon }) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 mono text-xs tracking-widest border-b-2 whitespace-nowrap transition-colors ${activeTab === key ? 'border-primary text-primary font-semibold' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              {icon} {label.toUpperCase()}
              <span className="ml-1 text-[10px] bg-muted text-muted-foreground px-1 rounded">
                {key === 'internet' ? internet.length : (allDeviceSummary[key] ?? 0)}
              </span>
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[180px] space-y-1">
            <Label className="text-xs font-semibold">Search</Label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="h-9 text-sm pl-7" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 text-sm w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {activeTab === 'internet'
                  ? ['active','inactive','suspended'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)
                  : ['active','inactive','under_repair','retired'].map(s => <SelectItem key={s} value={s}>{s.replace(/_/g,' ')}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Device Table */}
        {activeTab !== 'internet' && (
          loading
            ? <div className="py-10 text-center text-sm text-muted-foreground animate-pulse">Loading...</div>
            : filteredDevices.length === 0
              ? <div className="border border-border bg-card py-12 text-center text-sm text-muted-foreground">No {activeTab}s found.</div>
              : (
                <div className="border border-border bg-card overflow-x-auto">
                  <table className="w-full text-sm whitespace-nowrap">
                    <thead className="border-b border-border bg-muted/30">
                      <tr>
                        {['Brand','Model','Asset Tag','Location','Assigned To','Status','Specs','Actions'].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left mono text-[10px] text-muted-foreground tracking-widest font-semibold">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDevices.map(d => (
                        <>
                          <tr key={d.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                            <td className="px-4 py-2.5 font-medium">{d.brand}</td>
                            <td className="px-4 py-2.5">{d.model}</td>
                            <td className="px-4 py-2.5 mono text-xs text-muted-foreground">{d.asset_tag ?? '—'}</td>
                            <td className="px-4 py-2.5 text-xs">{d.location ?? '—'}</td>
                            <td className="px-4 py-2.5 text-xs">{d.assigned_to ?? '—'}</td>
                            <td className="px-4 py-2.5"><StatusBadge status={d.status} /></td>
                            <td className="px-4 py-2.5">
                              <button onClick={() => setExpandedRow(expandedRow === d.id ? null : d.id)}
                                className="flex items-center gap-1 text-xs text-primary hover:underline">
                                Details {expandedRow === d.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              </button>
                            </td>
                            <td className="px-4 py-2.5">
                              {isAdmin && (
                                <div className="flex gap-1">
                                  <Button size="sm" variant="ghost" onClick={() => setDeviceDialog({ open: true, editing: d })}
                                    className="h-7 px-2 border border-border text-xs">
                                    <Pencil className="w-3 h-3 mr-1" /> Edit
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => setDeleteTarget({ id: d.id, type: 'device' })}
                                    className="h-7 px-2 border border-border text-xs text-destructive hover:text-destructive">
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
                              )}
                            </td>
                          </tr>
                          {expandedRow === d.id && (
                            <tr key={`${d.id}-exp`} className="bg-muted/10 border-b border-border">
                              <td colSpan={8} className="px-6 py-3 space-y-3">
                                {/* Specs grid */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                  {(d.device_type === 'laptop' || d.device_type === 'desktop') && (
                                    <>
                                      {[['CPU', d.cpu],['GPU', d.gpu],['RAM', d.ram_gb ? `${d.ram_gb} GB` : null],
                                        ['Storage', d.storage_gb ? `${d.storage_gb} GB ${d.storage_type ?? ''}` : null],
                                        ['OS', d.os],['Serial No', d.serial_no]].map(([l,v]) => v ? (
                                        <div key={l as string}><span className="text-muted-foreground">{l}: </span><span className="font-medium">{v}</span></div>
                                      ) : null)}
                                    </>
                                  )}
                                  {d.device_type === 'printer' && (
                                    <>
                                      <div><span className="text-muted-foreground">Type: </span><span className="font-medium">{d.printer_type ?? '—'}</span></div>
                                      <div><span className="text-muted-foreground">Network: </span><span className="font-medium">{d.is_network_printer ? 'Yes' : 'No'}</span></div>
                                      <div><span className="text-muted-foreground">Serial: </span><span className="font-medium">{d.serial_no ?? '—'}</span></div>
                                    </>
                                  )}
                                  {d.device_type === 'router' && (
                                    <>
                                      <div><span className="text-muted-foreground">Type: </span><span className="font-medium">{d.router_type ?? '—'}</span></div>
                                      <div><span className="text-muted-foreground">WiFi: </span><span className="font-medium">{d.wifi_standard ?? '—'}</span></div>
                                      <div><span className="text-muted-foreground">Ports: </span><span className="font-medium">{d.num_ports ?? '—'}</span></div>
                                      <div><span className="text-muted-foreground">Serial: </span><span className="font-medium">{d.serial_no ?? '—'}</span></div>
                                    </>
                                  )}
                                  {d.purchase_date && <div><span className="text-muted-foreground">Purchased: </span><span className="font-medium">{d.purchase_date}</span></div>}
                                  {d.warranty_until && <div><span className="text-muted-foreground">Warranty: </span><span className="font-medium">{d.warranty_until}</span></div>}
                                  {d.notes && <div className="col-span-2 md:col-span-4"><span className="text-muted-foreground">Notes: </span><span className="font-medium">{d.notes}</span></div>}
                                </div>
                                {/* Linked Tickets panel */}
                                <DeviceTicketsPanel device={d} isAdmin={isAdmin} />
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
        )}

        {/* Internet Table */}
        {activeTab === 'internet' && (
          loading
            ? <div className="py-10 text-center text-sm text-muted-foreground animate-pulse">Loading...</div>
            : filteredInternet.length === 0
              ? <div className="border border-border bg-card py-12 text-center text-sm text-muted-foreground">No internet connections found.</div>
              : (
                <div className="border border-border bg-card overflow-x-auto">
                  <table className="w-full text-sm whitespace-nowrap">
                    <thead className="border-b border-border bg-muted/30">
                      <tr>
                        {['Location','ISP','Plan','Type','Speed','Actual DL/UL','Cost/mo','Router','Status','Actions'].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left mono text-[10px] text-muted-foreground tracking-widest font-semibold">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInternet.map(r => (
                        <>
                          <tr key={r.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                            <td className="px-4 py-2.5 font-medium">{r.location}</td>
                            <td className="px-4 py-2.5">{r.isp_name}</td>
                            <td className="px-4 py-2.5">{r.plan_name}</td>
                            <td className="px-4 py-2.5 mono text-xs">{r.plan_type.toUpperCase()}</td>
                            <td className="px-4 py-2.5 font-semibold">{r.subscribed_speed_mbps} Mbps</td>
                            <td className="px-4 py-2.5 text-xs">
                              {r.actual_dl_mbps != null ? `↓${r.actual_dl_mbps} / ↑${r.actual_ul_mbps ?? '?'}` : '—'}
                            </td>
                            <td className="px-4 py-2.5 text-xs">{r.monthly_cost != null ? `₱${r.monthly_cost.toLocaleString()}` : '—'}</td>
                            <td className="px-4 py-2.5 text-xs">{r.router ? `${r.router.brand} ${r.router.model}` : '—'}</td>
                            <td className="px-4 py-2.5"><StatusBadge status={r.status} /></td>
                            <td className="px-4 py-2.5">
                              <div className="flex gap-1">
                                <button onClick={() => setExpandedRow(expandedRow === r.id ? null : r.id)}
                                  className="flex items-center gap-1 text-xs text-primary hover:underline">
                                  Details {expandedRow === r.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                </button>
                                {isAdmin && (
                                  <>
                                    <Button size="sm" variant="ghost" onClick={() => setInternetDialog({ open: true, editing: r })}
                                      className="h-7 px-2 border border-border text-xs">
                                      <Pencil className="w-3 h-3 mr-1" /> Edit
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => setDeleteTarget({ id: r.id, type: 'internet' })}
                                      className="h-7 px-2 border border-border text-xs text-destructive hover:text-destructive">
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                          {/* expanded row for notes/contract + speed test panel */}
                          {expandedRow === r.id && (
                            <tr key={`${r.id}-sub`} className="bg-muted/5 border-b border-border">
                              <td colSpan={10} className="px-4 py-3 space-y-3">
                                {(r.account_no || r.contract_start || r.notes || r.contact_person) && (
                                  <div className="flex flex-wrap gap-4 text-xs px-2">
                                    {r.account_no && <span><span className="text-muted-foreground">Account: </span>{r.account_no}</span>}
                                    {r.contract_start && <span><span className="text-muted-foreground">Contract: </span>{r.contract_start} → {r.contract_end ?? 'Open'}</span>}
                                    {r.contact_person && <span><span className="text-muted-foreground">Contact: </span>{r.contact_person} {r.contact_number ?? ''}</span>}
                                    {r.notes && <span><span className="text-muted-foreground">Notes: </span>{r.notes}</span>}
                                  </div>
                                )}
                                {/* Speed Test History panel */}
                                <SpeedTestPanel connection={r} isAdmin={isAdmin} />
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
        )}
      </div>

      {/* Device Dialog */}
      <Dialog open={deviceDialog.open} onOpenChange={o => { if (!o) setDeviceDialog({ open: false, editing: null }); }}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-2xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold mono">
              {deviceDialog.editing ? 'EDIT DEVICE' : `ADD ${activeTab.toUpperCase()}`}
            </DialogTitle>
          </DialogHeader>
          <DeviceForm
            initial={deviceDialog.editing ?? { ...EMPTY_DEVICE, device_type: activeTab as DeviceType }}
            onSave={handleSaveDevice}
            onClose={() => setDeviceDialog({ open: false, editing: null })}
            routers={routers}
          />
        </DialogContent>
      </Dialog>

      {/* Internet Dialog */}
      <Dialog open={internetDialog.open} onOpenChange={o => { if (!o) setInternetDialog({ open: false, editing: null }); }}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-2xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold mono">
              {internetDialog.editing ? 'EDIT CONNECTION' : 'ADD INTERNET CONNECTION'}
            </DialogTitle>
          </DialogHeader>
          <InternetForm
            initial={internetDialog.editing ?? EMPTY_INTERNET}
            onSave={handleSaveInternet}
            onClose={() => setInternetDialog({ open: false, editing: null })}
            routers={routers}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={o => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this record?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}

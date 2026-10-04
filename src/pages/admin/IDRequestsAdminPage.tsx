import { useEffect, useState, useCallback } from 'react';
import type { ImgHTMLAttributes } from 'react';
import MainLayout from '@/components/layouts/MainLayout';
import { getIDRequests, updateIDRequestStatus, updateIDRequestPayment, getSignedStorageUrl } from '@/lib/api';
import type { IDRequest } from '@/types/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { RefreshCw, Eye, CheckCircle, XCircle, Clock, Search, Download, CreditCard, FileDown } from 'lucide-react';
import { formatUtc8Date, formatUtc8DateStamp } from '@/lib/utils';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const STATUS_STYLES: Record<string, string> = {
  pending:  'border-yellow-500 text-yellow-600',
  approved: 'border-green-500 text-green-600',
  rejected: 'border-red-500 text-red-600',
};
const STATUS_ICONS: Record<string, React.ReactNode> = {
  pending:  <Clock className="w-3 h-3" />,
  approved: <CheckCircle className="w-3 h-3" />,
  rejected: <XCircle className="w-3 h-3" />,
};
function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1 mono text-[10px] border px-1.5 py-0.5 ${STATUS_STYLES[status] ?? 'border-border text-muted-foreground'}`}>
      {STATUS_ICONS[status]} {status.toUpperCase()}
    </span>
  );
}

function exportCSV(rows: IDRequest[]) {
  const headers = ['Submitted', 'Full Name', 'Nickname', 'ID Number', 'Office', 'Position', 'Address',
    'Emergency Name', 'Emergency Contact', 'Emergency Address', 'Status', 'Paid', 'Notes'];
  const escape = (v: string | null | undefined) => `"${(v ?? '').replace(/"/g, '""')}"`;
  const lines = [
    headers.join(','),
    ...rows.map(r => [
      formatUtc8Date(r.created_at),
      r.full_name, r.nickname ?? '', r.id_number, r.office_name, r.position, r.address,
      r.emergency_name, r.emergency_contact, r.emergency_address,
      r.status, r.is_paid ? 'Yes' : 'No', r.notes ?? '',
    ].map(escape).join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `id-requests-${formatUtc8DateStamp(new Date())}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

async function downloadImage(bucket: string, path: string, filename: string) {
  try {
    const url = await getSignedStorageUrl(bucket, path);
    const res = await fetch(url);
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl; a.download = filename; a.click();
    URL.revokeObjectURL(objUrl);
  } catch { toast.error('Download failed'); }
}

function SignedImg({ bucket, ref, ...props }: { bucket: string; ref: string } & ImgHTMLAttributes<HTMLImageElement>) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    if (!ref) return;
    let cancelled = false;
    getSignedStorageUrl(bucket, ref).then(u => { if (!cancelled) setSrc(u); }).catch(() => {});
    return () => { cancelled = true; };
  }, [bucket, ref]);
  return src ? <img src={src} {...props} /> : null;
}

export default function IDRequestsAdminPage() {
  const [requests, setRequests] = useState<IDRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPaid, setFilterPaid] = useState('all');
  const [viewing, setViewing] = useState<IDRequest | null>(null);
  const [actionTarget, setActionTarget] = useState<{ req: IDRequest; action: 'approved' | 'rejected' } | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [togglingPaid, setTogglingPaid] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try { setRequests(await getIDRequests(0, 200)); }
    catch (e: any) { toast.error(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const filtered = requests.filter(r => {
    const matchStatus = filterStatus === 'all' || r.status === filterStatus;
    const matchPaid = filterPaid === 'all' || (filterPaid === 'paid' ? r.is_paid : !r.is_paid);
    const q = search.toLowerCase();
    const matchSearch = !q || r.full_name.toLowerCase().includes(q) || r.id_number.toLowerCase().includes(q) || r.office_name.toLowerCase().includes(q);
    return matchStatus && matchPaid && matchSearch;
  });

  const handleAction = async () => {
    if (!actionTarget) return;
    setSaving(true);
    try {
      await updateIDRequestStatus(actionTarget.req.id, actionTarget.action, notes);
      toast.success(`Request ${actionTarget.action}`);
      setActionTarget(null); setNotes(''); setViewing(null);
      await reload();
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  const handleTogglePaid = async (req: IDRequest) => {
    setTogglingPaid(req.id);
    try {
      await updateIDRequestPayment(req.id, !req.is_paid);
      toast.success(req.is_paid ? 'Marked as unpaid' : 'Marked as paid');
      setRequests(prev => prev.map(r => r.id === req.id ? { ...r, is_paid: !r.is_paid } : r));
      if (viewing?.id === req.id) setViewing(v => v ? { ...v, is_paid: !v.is_paid } : v);
    } catch (e: any) { toast.error(e.message); }
    setTogglingPaid(null);
  };

  const counts = { pending: 0, approved: 0, rejected: 0, paid: 0 };
  requests.forEach(r => {
    if (r.status in counts) counts[r.status as 'pending' | 'approved' | 'rejected']++;
    if (r.is_paid) counts.paid++;
  });

  return (
    <MainLayout>
      <div className="p-6 space-y-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="laser-line mb-2 w-24" />
            <h1 className="text-xl font-bold text-foreground">ID Requests</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Review, approve, and manage employee ID creation requests.</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => exportCSV(filtered)} className="border border-border text-xs">
              <FileDown className="w-3 h-3 mr-1" /> Export CSV
            </Button>
            <Button size="sm" variant="ghost" onClick={reload} className="border border-border text-xs">
              <RefreshCw className="w-3 h-3 mr-1" /> Refresh
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {([
            ['Pending',  counts.pending,  'border-yellow-400'],
            ['Approved', counts.approved, 'border-green-400'],
            ['Rejected', counts.rejected, 'border-red-400'],
            ['Paid',     counts.paid,     'border-primary'],
          ] as [string, number, string][]).map(([label, count, border]) => (
            <div key={label} className={`border-l-2 ${border} bg-card border border-border pl-4 py-3 pr-3`}>
              <div className="mono text-[10px] text-muted-foreground tracking-widest">{label.toUpperCase()}</div>
              <div className="text-2xl font-bold text-foreground mt-1">{count}</div>
            </div>
          ))}
        </div>

        <div className="flex items-start gap-2 border border-yellow-300 bg-yellow-50 px-4 py-2.5 text-xs text-yellow-700">
          <CreditCard className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>ID processing begins only after payment has been marked as confirmed. Approved requests without payment will remain on hold until paid.</span>
        </div>

        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1 flex-1 min-w-[180px]">
            <Label className="text-xs font-semibold">Search</Label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, ID, office..." className="h-9 text-sm pl-7" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Status</Label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-9 text-sm w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Payment</Label>
            <Select value={filterPaid} onValueChange={setFilterPaid}>
              <SelectTrigger className="h-9 text-sm w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="unpaid">Unpaid</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground animate-pulse">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="border border-border bg-card py-12 text-center text-sm text-muted-foreground">No ID requests found.</div>
        ) : (
          <div className="border border-border bg-card overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="border-b border-border bg-muted/30">
                <tr>
                  {['Submitted', 'Name', 'ID Number', 'Office', 'Position', 'Status', 'Payment', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left mono text-[10px] text-muted-foreground tracking-widest font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatUtc8Date(r.created_at)}</td>
                    <td className="px-4 py-2.5 font-medium">{r.full_name}</td>
                    <td className="px-4 py-2.5 mono text-xs">{r.id_number}</td>
                    <td className="px-4 py-2.5 text-xs">{r.office_name}</td>
                    <td className="px-4 py-2.5 text-xs">{r.position}</td>
                    <td className="px-4 py-2.5"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-2.5">
                      <button onClick={() => handleTogglePaid(r)} disabled={togglingPaid === r.id}
                        className={`inline-flex items-center gap-1 mono text-[10px] border px-1.5 py-0.5 cursor-pointer transition-opacity hover:opacity-70 ${r.is_paid ? 'border-green-500 text-green-600' : 'border-yellow-500 text-yellow-600'} ${togglingPaid === r.id ? 'opacity-50' : ''}`}>
                        <CreditCard className="w-3 h-3" /> {r.is_paid ? 'PAID' : 'UNPAID'}
                      </button>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setViewing(r)} className="h-7 px-2 border border-border text-xs">
                          <Eye className="w-3 h-3 mr-1" /> View
                        </Button>
                        {r.status === 'pending' && (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => { setActionTarget({ req: r, action: 'approved' }); setNotes(''); }}
                              className="h-7 px-2 border border-border text-xs text-green-600 hover:text-green-700">
                              <CheckCircle className="w-3 h-3 mr-1" /> Approve
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => { setActionTarget({ req: r, action: 'rejected' }); setNotes(''); }}
                              className="h-7 px-2 border border-border text-xs text-destructive hover:text-destructive">
                              <XCircle className="w-3 h-3 mr-1" /> Reject
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Detail Dialog */}
        <Dialog open={!!viewing} onOpenChange={o => { if (!o) setViewing(null); }}>
          <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-2xl max-h-[90dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base font-bold mono">ID REQUEST — {viewing?.id_number}</DialogTitle>
            </DialogHeader>
            {viewing && (
              <div className="space-y-5 text-sm">
                <div className="flex flex-wrap gap-2 items-center">
                  <StatusBadge status={viewing.status} />
                  <button onClick={() => handleTogglePaid(viewing)} disabled={togglingPaid === viewing.id}
                    className={`inline-flex items-center gap-1 mono text-[10px] border px-1.5 py-0.5 cursor-pointer hover:opacity-70 transition-opacity ${viewing.is_paid ? 'border-green-500 text-green-600' : 'border-yellow-500 text-yellow-600'}`}>
                    <CreditCard className="w-3 h-3" /> {viewing.is_paid ? 'PAID — click to mark unpaid' : 'UNPAID — click to mark paid'}
                  </button>
                </div>
                {!viewing.is_paid && viewing.status !== 'rejected' && (
                  <div className="flex items-start gap-2 border border-yellow-300 bg-yellow-50 px-3 py-2 text-xs text-yellow-700">
                    <CreditCard className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>This ID will be processed after payment is confirmed.</span>
                  </div>
                )}
                <div>
                  <div className="mono text-[10px] text-muted-foreground tracking-widest mb-2">EMPLOYEE INFORMATION</div>
                  <div className="grid grid-cols-2 gap-2">
                    {([['Office', viewing.office_name],['Full Name', viewing.full_name],['Nickname', viewing.nickname||'—'],['ID Number', viewing.id_number],['Position', viewing.position],['Address', viewing.address]] as [string,string][]).map(([l,v]) => (
                      <div key={l}><span className="text-xs text-muted-foreground block">{l}</span><span className="font-medium">{v}</span></div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mono text-[10px] text-muted-foreground tracking-widest mb-2">IN CASE OF EMERGENCY</div>
                  <div className="grid grid-cols-2 gap-2">
                    {([['Name', viewing.emergency_name],['Contact', viewing.emergency_contact],['Address', viewing.emergency_address]] as [string,string][]).map(([l,v]) => (
                      <div key={l}><span className="text-xs text-muted-foreground block">{l}</span><span className="font-medium">{v}</span></div>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="mono text-[10px] text-muted-foreground tracking-widest">ID PHOTO</span>
                      {viewing.photo_url && (
                        <Button size="sm" variant="ghost" onClick={() => downloadImage('id-photos', viewing.photo_url!, `${viewing.id_number}-photo.png`)}
                          className="h-6 px-2 border border-border text-[10px]">
                          <Download className="w-3 h-3 mr-1" /> Download
                        </Button>
                      )}
                    </div>
                    {viewing.photo_url
                      ? <SignedImg bucket="id-photos" ref={viewing.photo_url} alt="ID Photo" className="h-28 border border-border object-contain bg-muted w-full" />
                      : <span className="text-xs text-muted-foreground">Not provided</span>}
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="mono text-[10px] text-muted-foreground tracking-widest">SIGNATURE</span>
                      {viewing.signature_url && (
                        <Button size="sm" variant="ghost" onClick={() => downloadImage('id-signatures', viewing.signature_url!, `${viewing.id_number}-signature.png`)}
                          className="h-6 px-2 border border-border text-[10px]">
                          <Download className="w-3 h-3 mr-1" /> Download
                        </Button>
                      )}
                    </div>
                    {viewing.signature_url
                      ? <SignedImg bucket="id-signatures" ref={viewing.signature_url} alt="Signature" className="h-16 border border-border bg-white p-1 object-contain w-full" />
                      : <span className="text-xs text-muted-foreground">Not provided</span>}
                  </div>
                </div>
                {viewing.notes && (
                  <div>
                    <div className="mono text-[10px] text-muted-foreground tracking-widest mb-1">ADMIN NOTES</div>
                    <p className="text-sm border border-border bg-muted/30 px-3 py-2">{viewing.notes}</p>
                  </div>
                )}
                {viewing.status === 'pending' && (
                  <div className="flex gap-2 pt-2 border-t border-border">
                    <Button size="sm" onClick={() => { setViewing(null); setActionTarget({ req: viewing, action: 'approved' }); setNotes(''); }}
                      className="text-xs bg-green-600 text-white hover:bg-green-700">
                      <CheckCircle className="w-3 h-3 mr-1" /> Approve
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setViewing(null); setActionTarget({ req: viewing, action: 'rejected' }); setNotes(''); }}
                      className="text-xs border border-border text-destructive hover:text-destructive">
                      <XCircle className="w-3 h-3 mr-1" /> Reject
                    </Button>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!actionTarget} onOpenChange={o => { if (!o) setActionTarget(null); }}>
          <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
            <AlertDialogHeader>
              <AlertDialogTitle>
                {actionTarget?.action === 'approved' ? 'Approve' : 'Reject'} ID Request for "{actionTarget?.req.full_name}"?
              </AlertDialogTitle>
              <AlertDialogDescription>
                {actionTarget?.action === 'approved'
                  ? 'This will mark the request as approved. Processing will begin once payment is confirmed.'
                  : 'This will reject the request. Please provide a reason below.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="px-6 pb-2 space-y-1">
              <Label className="text-xs font-semibold">Notes (optional)</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="text-sm" placeholder="Add a note for the requester..." />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleAction} disabled={saving}
                className={actionTarget?.action === 'approved'
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'}>
                {saving ? 'Saving...' : actionTarget?.action === 'approved' ? 'Approve' : 'Reject'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </MainLayout>
  );
}

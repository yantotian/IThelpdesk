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
import { getAllSubmissions, reviewInventorySubmission } from '@/lib/api';
import type { ICTInventorySubmission } from '@/types/types';
import { RefreshCw, CheckCircle, XCircle, Monitor, Wifi, ChevronDown, ChevronUp, FileDown } from 'lucide-react';
import { formatUtc8Date, formatUtc8DateTime, formatUtc8DateStamp } from '@/lib/utils';

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending:  'border-yellow-500 text-yellow-600',
    approved: 'border-green-500 text-green-600',
    rejected: 'border-red-500 text-red-600',
  };
  return (
    <span className={`mono text-[10px] border px-1.5 py-0.5 ${map[status] ?? 'border-border text-muted-foreground'}`}>
      {status.toUpperCase()}
    </span>
  );
}

// ── Detail fields ─────────────────────────────────────────────────────────────
function SubmissionDetail({ s }: { s: ICTInventorySubmission }) {
  const isDevice = s.submission_type === 'device';
  const fields = isDevice ? [
    ['Type', s.device_type], ['Brand', s.brand], ['Model', s.model],
    ['Serial No', s.serial_no], ['Asset Tag', s.asset_tag],
    ['Location', s.location], ['Assigned To', s.assigned_to],
    ['CPU', s.cpu], ['GPU', s.gpu],
    ['RAM', s.ram_gb ? `${s.ram_gb} GB` : null],
    ['Storage', s.storage_gb ? `${s.storage_gb} GB ${s.storage_type ?? ''}` : null],
    ['OS', s.os], ['Printer Type', s.printer_type],
    ['Network Printer', s.is_network_printer != null ? (s.is_network_printer ? 'Yes' : 'No') : null],
    ['Router Type', s.router_type], ['WiFi Standard', s.wifi_standard],
    ['Ports', s.num_ports != null ? String(s.num_ports) : null],
    ['Purchase Date', s.purchase_date], ['Warranty Until', s.warranty_until],
  ] : [
    ['ISP', s.isp_name], ['Plan', s.plan_name], ['Plan Type', s.plan_type],
    ['Location', s.location],
    ['Speed', s.subscribed_speed_mbps ? `${s.subscribed_speed_mbps} Mbps` : null],
    ['Monthly Cost', s.monthly_cost ? `₱${Number(s.monthly_cost).toLocaleString()}` : null],
    ['Contract Start', s.contract_start], ['Contract End', s.contract_end],
    ['Account No', s.account_no], ['Contact Person', s.contact_person],
    ['Contact No', s.contact_number],
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
        {fields.filter(([, v]) => v).map(([l, v]) => (
          <div key={l as string}>
            <span className="text-muted-foreground">{l}: </span>
            <span className="font-medium">{v}</span>
          </div>
        ))}
      </div>
      {s.notes && (
        <div className="text-xs border border-border/50 bg-muted/10 px-3 py-2">
          <span className="text-muted-foreground">Notes: </span>{s.notes}
        </div>
      )}
    </div>
  );
}

// ── CSV export ────────────────────────────────────────────────────────────────
function exportSubmissionsCSV(subs: ICTInventorySubmission[]) {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const headers = ['Type','Submitter','Status','Brand/ISP','Model/Plan','Location','Device Type / Plan Type',
    'Serial No','Asset Tag','Assigned To','CPU','GPU','RAM (GB)','Storage (GB)','Storage Type','OS',
    'ISP','Plan','Speed (Mbps)','Monthly Cost','Notes','Submitted At','Admin Note'];
  const rows = subs.map(s => [
    s.submission_type, s.submitter?.full_name ?? s.submitter?.username ?? '', s.status,
    s.submission_type === 'device' ? s.brand : s.isp_name,
    s.submission_type === 'device' ? s.model : s.plan_name,
    s.location, s.submission_type === 'device' ? s.device_type : s.plan_type,
    s.serial_no, s.asset_tag, s.assigned_to, s.cpu, s.gpu, s.ram_gb, s.storage_gb, s.storage_type, s.os,
    s.isp_name, s.plan_name, s.subscribed_speed_mbps, s.monthly_cost,
    s.notes, s.created_at, s.admin_note,
  ].map(esc).join(','));
  const content = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ict-submissions-${formatUtc8DateStamp(new Date())}.csv`;
  a.click();
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ICTSubmissionsReviewPage() {
  const [submissions, setSubmissions] = useState<ICTInventorySubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Review dialog
  const [reviewTarget, setReviewTarget] = useState<ICTInventorySubmission | null>(null);
  const [reviewAction, setReviewAction] = useState<'approved' | 'rejected'>('approved');
  const [adminNote, setAdminNote] = useState('');
  const [reviewing, setReviewing] = useState(false);

  // Confirm reject dialog
  const [confirmReject, setConfirmReject] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try { setSubmissions(await getAllSubmissions()); }
    catch (e: any) { toast.error(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const filtered = submissions.filter(s => statusFilter === 'all' || s.status === statusFilter);

  const openReview = (s: ICTInventorySubmission, action: 'approved' | 'rejected') => {
    setReviewTarget(s); setReviewAction(action); setAdminNote('');
    if (action === 'rejected') setConfirmReject(true);
    else setConfirmReject(false);
  };

  const handleReview = async () => {
    if (!reviewTarget) return;
    setReviewing(true);
    try {
      await reviewInventorySubmission(reviewTarget.id, reviewAction, adminNote || undefined);
      toast.success(reviewAction === 'approved' ? 'Submission approved' : 'Submission rejected');
      setReviewTarget(null); setAdminNote('');
      reload();
    } catch (e: any) { toast.error(e.message); }
    setReviewing(false);
  };

  const counts = {
    pending:  submissions.filter(s => s.status === 'pending').length,
    approved: submissions.filter(s => s.status === 'approved').length,
    rejected: submissions.filter(s => s.status === 'rejected').length,
  };

  return (
    <MainLayout>
      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="laser-line mb-2 w-24" />
            <h1 className="text-xl font-bold text-foreground">Inventory Submissions</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Review and approve requester-submitted inventory information.</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => exportSubmissionsCSV(filtered)}
              className="border border-border text-xs">
              <FileDown className="w-3 h-3 mr-1" /> Export CSV
            </Button>
            <Button size="sm" variant="ghost" onClick={reload} className="border border-border text-xs">
              <RefreshCw className="w-3 h-3 mr-1" /> Refresh
            </Button>
          </div>
        </div>

        {/* Status filter tabs */}
        <div className="flex border-b border-border">
          {([
            { key: 'pending',  label: 'Pending Review', count: counts.pending },
            { key: 'approved', label: 'Approved',        count: counts.approved },
            { key: 'rejected', label: 'Rejected',        count: counts.rejected },
            { key: 'all',      label: 'All',             count: submissions.length },
          ] as const).map(({ key, label, count }) => (
            <button key={key} onClick={() => setStatusFilter(key)}
              className={`px-4 py-2.5 mono text-xs tracking-widest border-b-2 whitespace-nowrap transition-colors ${statusFilter === key ? 'border-primary text-primary font-semibold' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              {label.toUpperCase()}
              <span className="ml-1.5 text-[10px] bg-muted text-muted-foreground px-1 rounded">{count}</span>
            </button>
          ))}
        </div>

        {/* Submissions list */}
        {loading
          ? <div className="py-12 text-center text-sm text-muted-foreground animate-pulse">Loading submissions...</div>
          : filtered.length === 0
            ? <div className="border border-border bg-card py-12 text-center text-sm text-muted-foreground">
                No {statusFilter !== 'all' ? statusFilter : ''} submissions found.
              </div>
            : (
              <div className="space-y-2">
                {filtered.map(s => {
                  const isDevice = s.submission_type === 'device';
                  const isOpen = expandedId === s.id;
                  return (
                    <div key={s.id} className="border border-border bg-card">
                      {/* Row header */}
                      <div className="flex items-center gap-3 px-4 py-3">
                        <button onClick={() => setExpandedId(isOpen ? null : s.id)}
                          className="flex items-center gap-3 flex-1 min-w-0 text-left">
                          {isDevice
                            ? <Monitor className="w-3.5 h-3.5 text-primary shrink-0" />
                            : <Wifi    className="w-3.5 h-3.5 text-primary shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">
                              {isDevice
                                ? `${s.brand ?? '—'} ${s.model ?? '—'}`
                                : `${s.isp_name ?? '—'} — ${s.plan_name ?? '—'}`}
                            </div>
                            <div className="text-xs text-muted-foreground mono">
                              Submitted by <span className="text-foreground">{s.submitter?.full_name ?? s.submitter?.username ?? 'Unknown'}</span>
                              {' · '}{formatUtc8Date(s.created_at)}
                              {' · '}{isDevice ? (s.device_type ?? '').toUpperCase() : 'INTERNET'}
                            </div>
                          </div>
                        </button>
                        <div className="flex items-center gap-2 shrink-0">
                          <StatusBadge status={s.status} />
                          {s.status === 'pending' && (
                            <>
                              <Button size="sm" onClick={() => openReview(s, 'approved')}
                                className="h-7 px-2 text-xs bg-green-600 hover:bg-green-700 text-white">
                                <CheckCircle className="w-3 h-3 mr-1" /> Approve
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => openReview(s, 'rejected')}
                                className="h-7 px-2 text-xs border border-destructive text-destructive hover:bg-destructive/10">
                                <XCircle className="w-3 h-3 mr-1" /> Reject
                              </Button>
                            </>
                          )}
                          <button onClick={() => setExpandedId(isOpen ? null : s.id)}>
                            {isOpen
                              ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                              : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                          </button>
                        </div>
                      </div>

                      {/* Expanded detail */}
                      {isOpen && (
                        <div className="px-4 pb-4 border-t border-border space-y-3 pt-3">
                          <SubmissionDetail s={s} />
                          {s.admin_note && (
                            <div className="border border-border/50 bg-muted/10 px-3 py-2 text-xs">
                              <span className="mono text-[10px] text-muted-foreground">ADMIN NOTE: </span>
                              {s.admin_note}
                            </div>
                          )}
                          {s.reviewed_at && (
                            <div className="text-xs text-muted-foreground">
                              Reviewed {formatUtc8DateTime(s.reviewed_at)}
                              {s.reviewer && ` by ${s.reviewer.full_name ?? s.reviewer.username}`}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
      </div>

      {/* Approve dialog */}
      <Dialog open={!!reviewTarget && reviewAction === 'approved'} onOpenChange={o => { if (!o) setReviewTarget(null); }}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold mono">APPROVE SUBMISSION</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Approve this {reviewTarget?.submission_type} submission from{' '}
              <span className="text-foreground font-medium">
                {reviewTarget?.submitter?.full_name ?? reviewTarget?.submitter?.username ?? 'Unknown'}
              </span>?
            </p>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Admin Note (optional)</Label>
              <Textarea value={adminNote} onChange={e => setAdminNote(e.target.value)}
                placeholder="Approval note visible to the requester..."
                className="text-sm min-h-[80px]" />
            </div>
            <div className="flex gap-2 pt-1">
              <Button onClick={handleReview} disabled={reviewing}
                className="bg-green-600 hover:bg-green-700 text-white text-sm">
                {reviewing ? 'Approving...' : 'Confirm Approve'}
              </Button>
              <Button variant="outline" onClick={() => setReviewTarget(null)} className="text-sm">Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reject confirm */}
      <AlertDialog open={confirmReject} onOpenChange={o => { if (!o) { setConfirmReject(false); setReviewTarget(null); } }}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Reject this submission?</AlertDialogTitle>
            <AlertDialogDescription>
              You can add a note explaining why the submission was rejected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-1 pb-2 space-y-1">
            <Label className="text-xs font-semibold">Rejection Reason (optional)</Label>
            <Textarea value={adminNote} onChange={e => setAdminNote(e.target.value)}
              placeholder="e.g. Duplicate entry, missing serial number..."
              className="text-sm min-h-[80px]" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setReviewTarget(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setConfirmReject(false); handleReview(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}

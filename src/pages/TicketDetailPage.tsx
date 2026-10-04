import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import MainLayout from '@/components/layouts/MainLayout';
import { StatusBadge, PriorityBadge, SLAIndicator } from '@/components/common/Badges';
import {
  getTicket, getActivities, getAttachments, addComment,
  updateTicketStatus, assignTicket, getProfiles, updateTicket, uploadAttachment, deleteTicket, getSignedStorageUrl
} from '@/lib/api';
import { exportTicketToPdf } from '@/lib/pdfExport';
import type { Ticket, TicketActivity, TicketAttachment, TicketStatus, Profile } from '@/types/types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  MessageSquare, Paperclip, Clock, User, ArrowRight, CheckCircle,
  RotateCcw, ChevronDown, AlertTriangle, Download, FileDown, Trash2
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { formatUtc8Stamp } from '@/lib/utils';

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  comment: <MessageSquare className="w-3 h-3" />,
  status_change: <ArrowRight className="w-3 h-3" />,
  assignment: <User className="w-3 h-3" />,
  resolution: <CheckCircle className="w-3 h-3" />,
  attachment: <Paperclip className="w-3 h-3" />,
  system: <Clock className="w-3 h-3" />,
};

function AttachmentLink({ path }: { path: string }) {
  const [href, setHref] = useState('');
  useEffect(() => {
    let cancelled = false;
    getSignedStorageUrl('ticket-attachments', path).then(u => { if (!cancelled) setHref(u); }).catch(() => {});
    return () => { cancelled = true; };
  }, [path]);
  if (!href) return <Download className="w-3 h-3 text-muted-foreground" />;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary shrink-0">
      <Download className="w-3 h-3" />
    </a>
  );
}

// Allowed transitions per role
function getAllowedTransitions(status: TicketStatus, role: string | null): TicketStatus[] {
  if (role === 'requester') {
    if (status === 'resolved') return ['verified', 'in_progress']; // confirm or reopen
    return [];
  }
  if (role === 'technician') {
    if (status === 'assigned') return ['in_progress'];
    if (status === 'in_progress') return ['resolved', 'on_hold'];
    if (status === 'on_hold') return ['in_progress'];
    if (status === 'resolved') return ['closed'];
    if (status === 'verified') return ['closed'];
    return [];
  }
  if (role === 'it_admin' || role === 'sysadmin') {
    const all: TicketStatus[] = ['new', 'assigned', 'in_progress', 'resolved', 'on_hold', 'verified', 'closed'];
    return all.filter(s => s !== status);
  }
  return [];
}

const STATUS_LABELS: Record<TicketStatus, string> = {
  new: 'NEW', assigned: 'ASSIGNED', in_progress: 'IN PROGRESS',
  resolved: 'RESOLVED', on_hold: 'ON HOLD', verified: 'VERIFIED', closed: 'CLOSED',
};

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { profile, role } = useAuth();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [activities, setActivities] = useState<TicketActivity[]>([]);
  const [attachments, setAttachments] = useState<TicketAttachment[]>([]);
  const [technicians, setTechnicians] = useState<Profile[]>([]);
  const [comment, setComment] = useState('');
  const [resolution, setResolution] = useState('');
  const [newStatus, setNewStatus] = useState<TicketStatus | ''>('');
  const [assignTo, setAssignTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showResolution, setShowResolution] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const reload = useCallback(async () => {
    if (!id) return;
    const [t, a, att] = await Promise.all([
      getTicket(id),
      getActivities(id),
      getAttachments(id),
    ]);
    setTicket(t);
    setActivities(a);
    setAttachments(att);
  }, [id]);

  useEffect(() => {
    setLoading(true);
    reload().finally(() => setLoading(false));
    if (role === 'it_admin' || role === 'sysadmin') {
      getProfiles('technician').then(setTechnicians);
    }
  }, [reload, role]);

  const handleComment = async () => {
    if (!comment.trim() || !profile || !ticket) return;
    setSaving(true);
    try {
      await addComment(ticket.id, profile.id, comment);
      setComment('');
      await reload();
      toast.success('Comment added');
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  const handleStatusChange = async () => {
    if (!newStatus || !ticket || !profile) return;
    setSaving(true);
    try {
      const updates: Partial<Ticket> = {};
      if (newStatus === 'resolved' && resolution) {
        updates.resolution = resolution;
        updates.resolved_at = new Date().toISOString();
      }
      if (Object.keys(updates).length > 0) await updateTicket(ticket.id, updates);
      await updateTicketStatus(ticket.id, newStatus, profile.id, ticket.status);
      setNewStatus('');
      setResolution('');
      setShowResolution(false);
      await reload();
      toast.success(`Status updated to ${STATUS_LABELS[newStatus]}`);
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  const handleAssign = async () => {
    if (!assignTo || !ticket || !profile) return;
    setSaving(true);
    try {
      await assignTicket(ticket.id, assignTo, profile.id);
      setAssignTo('');
      await reload();
      toast.success('Ticket reassigned');
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!profile || !ticket) return;
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error('File exceeds 10MB'); return; }
    setSaving(true);
    try {
      await uploadAttachment(ticket.id, profile.id, file);
      await reload();
      toast.success('Attachment uploaded');
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  const handleExportPdf = async () => {
    if (!ticket) return;
    setExportingPdf(true);
    try {
      await exportTicketToPdf({ ticket, activities, attachments });
      toast.success('PDF exported');
    } catch (e: any) {
      toast.error('PDF export failed: ' + e.message);
    } finally {
      setExportingPdf(false);
    }
  };

  const allowedTransitions = ticket ? getAllowedTransitions(ticket.status, role) : [];
  const canAssign = (role === 'it_admin' || role === 'sysadmin') && ticket?.status !== 'closed';
  const canComment = !!ticket && ticket.status !== 'closed';
  const canDelete = role === 'sysadmin';

  const timelinePartner = (a: TicketActivity): string | null => {
    if (!ticket) return null;
    const requesterName = ticket.requester?.full_name || ticket.requester?.username || null;
    const assigneeName = ticket.assignee?.full_name || ticket.assignee?.username || null;
    if (a.activity_type === 'assignment') return assigneeName;
    if (a.activity_type === 'comment' || a.activity_type === 'status_change') {
      if (!a.actor_id) return requesterName;
      if (a.actor_id === ticket.requester_id) return assigneeName;
      return requesterName;
    }
    return null;
  };

  const handleDelete = async () => {
    if (!ticket) return;
    setDeleting(true);
    try {
      await deleteTicket(ticket.id);
      toast.success(`Ticket ${ticket.ticket_number} deleted`);
      navigate('/tickets');
    } catch (e: any) {
      toast.error('Delete failed: ' + e.message);
    }
    setDeleting(false);
    setDeleteConfirm(false);
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <span className="mono text-primary text-sm animate-pulse">LOADING TICKET...</span>
        </div>
      </MainLayout>
    );
  }

  if (!ticket) {
    return (
      <MainLayout>
        <div className="p-6"><div className="mono text-muted-foreground">Ticket not found.</div></div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="p-6 space-y-5 max-w-5xl mx-auto">
        {/* Header */}
        <div>
          <div className="laser-line mb-2 w-24" />
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <h1 className="mono text-xl text-primary">{ticket.ticket_number}</h1>
              <p className="text-foreground text-sm mt-1 text-balance">{ticket.subject}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap shrink-0">
              <PriorityBadge priority={ticket.priority} />
              <StatusBadge status={ticket.status} />
              <SLAIndicator slaBreached={ticket.sla_breached} slaDue={ticket.sla_due_at} />
              <Button
                size="sm"
                variant="ghost"
                onClick={handleExportPdf}
                disabled={exportingPdf}
                className="border border-border mono text-xs"
              >
                <FileDown className="w-3 h-3 mr-1" />
                {exportingPdf ? 'EXPORTING...' : 'PDF'}
              </Button>
              {canDelete && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDeleteConfirm(true)}
                  className="border border-border mono text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="w-3 h-3 mr-1" />
                  DELETE
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          {/* Main Column */}
          <div className="md:col-span-2 space-y-5">
            {/* Details */}
            <div className="border border-border bg-card p-5">
              <div className="mono text-[10px] text-muted-foreground tracking-widest mb-4">TICKET DETAILS</div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                {[
                  ['Requester', ticket.requester?.full_name || ticket.requester?.username || '—'],
                  ['Office', ticket.requester?.office || ticket.office || '—'],
                  ['Contact', ticket.requester?.contact || ticket.contact || '—'],
                  ['Location', ticket.location || '—'],
                  ['Category', ticket.category?.name || '—'],
                  ['Subcategory', ticket.subcategory?.name || '—'],
                  ['Assigned To', ticket.assignee?.full_name || ticket.assignee?.username || 'Unassigned'],
                  ['Created', ticket.created_at.slice(0, 16).replace('T', ' ')],
                  ['SLA Due', ticket.sla_due_at ? ticket.sla_due_at.slice(0, 16).replace('T', ' ') : '—'],
                  ['Resolved', ticket.resolved_at ? ticket.resolved_at.slice(0, 16).replace('T', ' ') : '—'],
                ].map(([k, v]) => (
                  <div key={k}>
                    <div className="mono text-[10px] text-muted-foreground">{k.toUpperCase()}</div>
                    <div className="text-foreground mono mt-0.5 break-words">{v}</div>
                  </div>
                ))}
              </div>
              {ticket.description && (
                <div className="mt-4 pt-4 border-t border-border">
                  <div className="mono text-[10px] text-muted-foreground mb-2">DESCRIPTION</div>
                  <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{ticket.description}</p>
                </div>
              )}
              {ticket.resolution && (
                <div className="mt-4 pt-4 border-t border-border">
                  <div className="mono text-[10px] text-muted-foreground mb-2">RESOLUTION</div>
                  <p className="text-xs text-foreground leading-relaxed">{ticket.resolution}</p>
                </div>
              )}
              {ticket.remarks && (
                <div className="mt-4 pt-4 border-t border-border">
                  <div className="mono text-[10px] text-muted-foreground mb-2">REMARKS</div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{ticket.remarks}</p>
                </div>
              )}
            </div>

            {/* Activity Timeline */}
            <div className="border border-border bg-card p-5">
              <div className="mono text-[10px] text-muted-foreground tracking-widest mb-4">ACTIVITY TIMELINE</div>
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {activities.map((a, i) => (
                  <div key={a.id} className={`flex gap-3 ${i < activities.length - 1 ? 'border-b border-border/30 pb-3' : ''}`}>
                    <div className={`shrink-0 w-6 h-6 flex items-center justify-center border mt-0.5 ${
                      a.activity_type === 'system' ? 'border-muted text-muted-foreground' : 'border-primary text-primary'
                    }`}>
                      {ACTIVITY_ICONS[a.activity_type] || <Clock className="w-3 h-3" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="mono text-[10px] text-primary">
                          {a.actor?.full_name || a.actor?.username || 'System'}
                        </span>
                        {timelinePartner(a) && (
                          <>
                            <ArrowRight className="w-2.5 h-2.5 text-muted-foreground" />
                            <span className="mono text-[10px] text-muted-foreground">{timelinePartner(a)}</span>
                          </>
                        )}
                        <span className="mono text-[10px] text-muted-foreground">
                          {formatUtc8Stamp(a.created_at, 16)}
                        </span>
                      </div>
                      <p className="text-xs text-foreground mt-0.5 break-words">{a.content}</p>
                      {a.old_value && a.new_value && (
                        <div className="flex items-center gap-1 mt-1 text-[10px] mono text-muted-foreground">
                          <span>{a.old_value.replace('_', ' ')}</span>
                          <ArrowRight className="w-2 h-2" />
                          <span className="text-primary">{a.new_value.replace('_', ' ')}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {activities.length === 0 && (
                  <p className="mono text-xs text-muted-foreground">No activity yet.</p>
                )}
              </div>

              {/* Comment box */}
              {canComment && (
                <div className="mt-4 pt-4 border-t border-border space-y-2">
                  <Textarea
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    placeholder="Add a comment..."
                    rows={3}
                    className="bg-input border-border mono text-xs resize-none"
                  />
                  <Button onClick={handleComment} disabled={saving || !comment.trim()}
                    className="bg-primary text-primary-foreground mono text-xs hud-press">
                    <MessageSquare className="w-3 h-3 mr-1" />ADD COMMENT
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Actions Column */}
          <div className="space-y-4">
            {/* Status Actions */}
            {allowedTransitions.length > 0 && (
              <div className="border border-border bg-card p-4">
                <div className="mono text-[10px] text-muted-foreground tracking-widest mb-3">UPDATE STATUS</div>
                <Select value={newStatus} onValueChange={v => {
                  setNewStatus(v as TicketStatus);
                  setShowResolution(v === 'resolved');
                }}>
                  <SelectTrigger className="bg-input border-border mono text-xs">
                    <SelectValue placeholder="Select new status" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {allowedTransitions.map(s => (
                      <SelectItem key={s} value={s} className="mono text-xs">
                        {role === 'requester' && s === 'verified' ? '✓ CONFIRM RESOLVED' :
                         role === 'requester' && s === 'in_progress' ? '↩ REOPEN' :
                         STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {showResolution && (
                  <Textarea
                    value={resolution}
                    onChange={e => setResolution(e.target.value)}
                    placeholder="Resolution notes..."
                    rows={3}
                    className="bg-input border-border mono text-xs resize-none mt-2"
                  />
                )}
                <Button onClick={handleStatusChange} disabled={saving || !newStatus}
                  className="w-full mt-2 bg-primary text-primary-foreground mono text-xs hud-press">
                  APPLY STATUS
                </Button>
              </div>
            )}

            {/* Assign Technician */}
            {canAssign && (
              <div className="border border-border bg-card p-4">
                <div className="mono text-[10px] text-muted-foreground tracking-widest mb-3">ASSIGN TECHNICIAN</div>
                <Select value={assignTo} onValueChange={setAssignTo}>
                  <SelectTrigger className="bg-input border-border mono text-xs">
                    <SelectValue placeholder="Select technician" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {technicians.map(t => (
                      <SelectItem key={t.id} value={t.id} className="mono text-xs">
                        {t.full_name || t.username}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={handleAssign} disabled={saving || !assignTo}
                  className="w-full mt-2 bg-primary text-primary-foreground mono text-xs hud-press">
                  ASSIGN
                </Button>
              </div>
            )}

            {/* Attachments */}
            <div className="border border-border bg-card p-4">
              <div className="mono text-[10px] text-muted-foreground tracking-widest mb-3">
                ATTACHMENTS ({attachments.length})
              </div>
              <div className="space-y-2 mb-3">
                {attachments.map(att => (
                  <div key={att.id} className="flex items-center justify-between gap-2 bg-secondary px-2 py-1.5 border border-border/50">
                    <span className="mono text-[10px] text-foreground truncate">{att.file_name}</span>
                    <AttachmentLink path={att.file_path} />
                  </div>
                ))}
                {attachments.length === 0 && (
                  <p className="mono text-[10px] text-muted-foreground">No attachments</p>
                )}
              </div>
              {ticket.status !== 'closed' && (
                <label className="flex items-center gap-2 border border-dashed border-border px-3 py-2 cursor-pointer hover:border-primary transition-colors">
                  <Paperclip className="w-3 h-3 text-muted-foreground" />
                  <span className="mono text-[10px] text-muted-foreground">Upload file</span>
                  <input type="file" onChange={handleFileUpload} className="hidden" />
                </label>
              )}
            </div>

            {/* Ticket meta */}
            <div className="border border-border bg-card p-4 space-y-2">
              <div className="mono text-[10px] text-muted-foreground tracking-widest mb-2">TICKET INFO</div>
              <div className="mono text-[10px] text-muted-foreground">
                Created: <span className="text-foreground">{ticket.created_at.slice(0, 10)}</span>
              </div>
              {ticket.sla_due_at && (
                <div className="mono text-[10px] text-muted-foreground">
                  SLA Due: <span className={ticket.sla_breached ? 'text-primary' : 'text-foreground'}>
                    {ticket.sla_due_at.slice(0, 16).replace('T', ' ')}
                  </span>
                </div>
              )}
              {ticket.auto_close_at && (
                <div className="mono text-[10px] text-muted-foreground flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-yellow-400" />
                  Auto-close: <span className="text-yellow-400">{ticket.auto_close_at.slice(0, 16).replace('T', ' ')}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Delete confirm */}
      <AlertDialog open={deleteConfirm} onOpenChange={o => { if (!o) setDeleteConfirm(false); }}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete ticket {ticket?.ticket_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the ticket, all its comments, and attachments. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Deleting…' : 'Delete Permanently'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}

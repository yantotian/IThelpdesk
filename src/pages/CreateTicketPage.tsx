import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import MainLayout from '@/components/layouts/MainLayout';
import { createTicket, getCategories, uploadAttachment, getTicketTemplates } from '@/lib/api';
import type { Category, TicketPriority, TicketTemplate } from '@/types/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Paperclip, X, FileText, ChevronDown } from 'lucide-react';

const PRIORITIES: TicketPriority[] = ['low', 'medium', 'high', 'critical'];

export default function CreateTicketPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Category[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    office: profile?.office || '',
    contact: profile?.contact || '',
    category_id: '',
    subcategory_id: '',
    priority: 'medium' as TicketPriority,
    subject: '',
    description: '',
    location: '',
    remarks: '',
  });

  useEffect(() => {
    getCategories().then(cats => setCategories(cats.filter(c => !c.parent_id)));
  }, []);

  useEffect(() => {
    if (form.category_id) {
      getCategories().then(cats =>
        setSubcategories(cats.filter(c => c.parent_id === form.category_id && c.is_active))
      );
    } else {
      setSubcategories([]);
    }
  }, [form.category_id]);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(e.target.files || []);
    const valid = incoming.filter(f => {
      if (f.size > 10 * 1024 * 1024) { toast.error(`${f.name} exceeds 10MB`); return false; }
      return true;
    });
    setFiles(prev => [...prev, ...valid]);
  };

  const removeFile = (idx: number) => setFiles(f => f.filter((_, i) => i !== idx));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    if (!form.subject.trim()) { toast.error('Subject is required'); return; }
    setSubmitting(true);
    try {
      const ticketId = await createTicket({
        requester_id: profile.id,
        office: form.office || undefined,
        contact: form.contact || undefined,
        category_id: form.category_id || undefined,
        subcategory_id: form.subcategory_id || undefined,
        priority: form.priority,
        subject: form.subject,
        description: form.description || undefined,
        location: form.location || undefined,
        remarks: form.remarks || undefined,
      } as any);

      // Upload attachments
      for (const file of files) {
        await uploadAttachment(ticketId, profile.id, file);
      }

      toast.success('Ticket created successfully');
      navigate(`/tickets/${ticketId}`);
    } catch (e: any) {
      toast.error('Failed to create ticket: ' + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MainLayout>
      <div className="p-6 max-w-3xl mx-auto">
        <div className="mb-6">
          <div className="laser-line mb-2 w-24" />
          <h1 className="mono text-lg text-foreground">CREATE NEW TICKET</h1>
          <p className="mono text-xs text-muted-foreground">Submit a support request</p>
        </div>

        <form onSubmit={handleSubmit} className="border border-border bg-card p-6 space-y-5">
          {/* Requester info (read-only) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-4 border-b border-border">
            <div>
              <Label className="mono text-[10px] text-muted-foreground">REQUESTER</Label>
              <div className="mt-1 px-3 py-2 bg-secondary border border-border mono text-xs text-foreground">
                {profile?.full_name || profile?.username}
              </div>
            </div>
            <div>
              <Label className="mono text-[10px] text-muted-foreground">OFFICE</Label>
              <Input value={form.office} onChange={e => set('office', e.target.value)}
                placeholder="Office/dept" className="bg-input border-border mono text-xs mt-1" />
            </div>
            <div>
              <Label className="mono text-[10px] text-muted-foreground">CONTACT</Label>
              <Input value={form.contact} onChange={e => set('contact', e.target.value)}
                placeholder="Phone or email" className="bg-input border-border mono text-xs mt-1" />
            </div>
          </div>

          {/* Category / Priority */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="mono text-[10px] text-muted-foreground">CATEGORY *</Label>
              <Select value={form.category_id} onValueChange={v => { set('category_id', v); set('subcategory_id', ''); }}>
                <SelectTrigger className="bg-input border-border mono text-xs mt-1">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {categories.map(c => (
                    <SelectItem key={c.id} value={c.id} className="mono text-xs">{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mono text-[10px] text-muted-foreground">SUBCATEGORY</Label>
              <Select value={form.subcategory_id} onValueChange={v => set('subcategory_id', v)}
                disabled={subcategories.length === 0}>
                <SelectTrigger className="bg-input border-border mono text-xs mt-1">
                  <SelectValue placeholder={subcategories.length ? 'Select subcategory' : 'No subcategories'} />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {subcategories.map(c => (
                    <SelectItem key={c.id} value={c.id} className="mono text-xs">{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mono text-[10px] text-muted-foreground">PRIORITY *</Label>
              <Select value={form.priority} onValueChange={v => set('priority', v)}>
                <SelectTrigger className="bg-input border-border mono text-xs mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {PRIORITIES.map(p => (
                    <SelectItem key={p} value={p} className="mono text-xs">{p.toUpperCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Subject */}
          <div>
            <Label className="mono text-[10px] text-muted-foreground">SUBJECT *</Label>
            <Input
              required
              value={form.subject}
              onChange={e => set('subject', e.target.value)}
              placeholder="Brief description of the issue"
              className="bg-input border-border mono text-sm mt-1"
            />
          </div>

          {/* Description */}
          <div>
            <Label className="mono text-[10px] text-muted-foreground">DESCRIPTION</Label>
            <Textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="Detailed description of the problem..."
              rows={5}
              className="bg-input border-border mono text-xs mt-1 resize-none"
            />
          </div>

          {/* Location */}
          <div>
            <Label className="mono text-[10px] text-muted-foreground">LOCATION</Label>
            <Input
              value={form.location}
              onChange={e => set('location', e.target.value)}
              placeholder="Physical location of the issue"
              className="bg-input border-border mono text-xs mt-1"
            />
          </div>

          {/* Remarks */}
          <div>
            <Label className="mono text-[10px] text-muted-foreground">REMARKS (optional)</Label>
            <Textarea
              value={form.remarks}
              onChange={e => set('remarks', e.target.value)}
              placeholder="Additional notes..."
              rows={2}
              className="bg-input border-border mono text-xs mt-1 resize-none"
            />
          </div>

          {/* Attachments */}
          <div>
            <Label className="mono text-[10px] text-muted-foreground">ATTACHMENTS</Label>
            <div className="mt-1">
              <label className="flex items-center gap-2 border border-dashed border-border px-4 py-3 cursor-pointer hover:border-primary transition-colors">
                <Paperclip className="w-4 h-4 text-muted-foreground" />
                <span className="mono text-xs text-muted-foreground">Click to attach files (max 10MB each)</span>
                <input type="file" multiple onChange={handleFiles} className="hidden" accept="*/*" />
              </label>
              {files.length > 0 && (
                <div className="mt-2 space-y-1">
                  {files.map((f, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 px-3 py-1.5 bg-secondary border border-border">
                      <span className="mono text-xs text-foreground truncate">{f.name}</span>
                      <span className="mono text-[10px] text-muted-foreground shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                      <button type="button" onClick={() => removeFile(i)} className="text-muted-foreground hover:text-destructive shrink-0">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* SLA info */}
          <div className="border border-border/50 bg-secondary/30 p-3 mono text-[10px] text-muted-foreground">
            SLA: CRITICAL = 4H &nbsp;|&nbsp; HIGH = 8H &nbsp;|&nbsp; MEDIUM = 24H &nbsp;|&nbsp; LOW = 48H
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => navigate(-1)}
              className="border border-border mono text-xs">CANCEL</Button>
            <Button type="submit" disabled={submitting}
              className="bg-primary text-primary-foreground mono text-xs hud-press">
              {submitting ? 'SUBMITTING...' : 'SUBMIT TICKET'}
            </Button>
          </div>
        </form>
      </div>
    </MainLayout>
  );
}

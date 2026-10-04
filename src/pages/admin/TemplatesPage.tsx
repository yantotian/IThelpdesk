import { useEffect, useState } from 'react';
import MainLayout from '@/components/layouts/MainLayout';
import { getTicketTemplates, upsertTicketTemplate, deleteTicketTemplate, getCategories } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import type { TicketTemplate, Category, TicketPriority } from '@/types/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { PlusCircle, Pencil, Trash2, FileText, RefreshCw } from 'lucide-react';

const PRIORITIES: TicketPriority[] = ['low', 'medium', 'high', 'critical'];
const PRIORITY_COLORS: Record<TicketPriority, string> = {
  low: 'text-muted-foreground', medium: 'text-blue-400', high: 'text-yellow-400', critical: 'text-primary',
};

const EMPTY_FORM = {
  name: '', description: '', category_id: '', subcategory_id: '',
  priority: 'medium' as TicketPriority, subject: '', body: '', is_active: true,
};

export default function TemplatesPage() {
  const { profile } = useAuth();
  const [templates, setTemplates] = useState<TicketTemplate[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TicketTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [tmpl, cats] = await Promise.all([
        getTicketTemplates(false),
        getCategories(),
      ]);
      setTemplates(tmpl);
      setCategories(cats.filter(c => !c.parent_id));
    } catch (e: any) {
      toast.error('Failed to load: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  useEffect(() => {
    if (form.category_id) {
      getCategories().then(cats =>
        setSubcategories(cats.filter(c => c.parent_id === form.category_id))
      );
    } else {
      setSubcategories([]);
    }
  }, [form.category_id]);

  const set = (k: string, v: string | boolean) => setForm(f => ({ ...f, [k]: v }));

  const openNew = () => {
    setEditTarget(null);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  };

  const openEdit = (t: TicketTemplate) => {
    setEditTarget(t);
    setForm({
      name: t.name,
      description: t.description || '',
      category_id: t.category_id || '',
      subcategory_id: t.subcategory_id || '',
      priority: t.priority,
      subject: t.subject,
      body: t.body,
      is_active: t.is_active,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    if (!form.subject.trim()) { toast.error('Subject is required'); return; }
    setSaving(true);
    try {
      await upsertTicketTemplate({
        ...(editTarget ? { id: editTarget.id } : {}),
        ...form,
        category_id: form.category_id || undefined,
        subcategory_id: form.subcategory_id || undefined,
        created_by: editTarget ? editTarget.created_by : (profile?.id ?? undefined),
      } as any);
      toast.success(editTarget ? 'Template updated' : 'Template created');
      setDialogOpen(false);
      fetchAll();
    } catch (e: any) {
      toast.error('Save failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (t: TicketTemplate) => {
    if (!confirm(`Deactivate template "${t.name}"?`)) return;
    try {
      await deleteTicketTemplate(t.id);
      toast.success('Template deactivated');
      fetchAll();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <MainLayout>
      <div className="p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="laser-line mb-2 w-24" />
            <h1 className="mono text-lg text-foreground">TICKET TEMPLATES</h1>
            <p className="mono text-xs text-muted-foreground">{templates.filter(t => t.is_active).length} ACTIVE</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button size="sm" variant="ghost" onClick={fetchAll} className="border border-border mono text-xs">
              <RefreshCw className="w-3 h-3 mr-1" />REFRESH
            </Button>
            <Button size="sm" onClick={openNew} className="bg-primary text-primary-foreground mono text-xs hud-press">
              <PlusCircle className="w-3 h-3 mr-1" />NEW TEMPLATE
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="border border-border bg-card min-w-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-max">
              <thead>
                <tr className="border-b border-border">
                  {['NAME', 'SUBJECT', 'CATEGORY', 'PRIORITY', 'STATUS', 'ACTIONS'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left mono text-[10px] text-muted-foreground tracking-widest whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center mono text-xs text-muted-foreground">LOADING...</td></tr>
                ) : templates.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-10 text-center">
                    <FileText className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
                    <p className="mono text-xs text-muted-foreground">No templates yet. Create one above.</p>
                  </td></tr>
                ) : templates.map(t => (
                  <tr key={t.id} className="border-b border-border/50 hover:bg-secondary/40 transition-colors">
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <p className="mono text-xs text-foreground">{t.name}</p>
                      {t.description && <p className="mono text-[10px] text-muted-foreground truncate max-w-[160px]">{t.description}</p>}
                    </td>
                    <td className="px-4 py-2.5 max-w-[200px]">
                      <p className="mono text-xs text-foreground truncate">{t.subject}</p>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap mono text-xs text-muted-foreground">
                      {t.category?.name || '—'}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className={`mono text-xs font-semibold ${PRIORITY_COLORS[t.priority]}`}>
                        {t.priority.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className={`mono text-[10px] border px-2 py-0.5 ${t.is_active ? 'border-green-500/40 text-green-400' : 'border-border text-muted-foreground'}`}>
                        {t.is_active ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(t)}
                          className="w-7 h-7 border border-border text-muted-foreground hover:text-primary">
                          <Pencil className="w-3 h-3" />
                        </Button>
                        {t.is_active && (
                          <Button size="icon" variant="ghost" onClick={() => handleDelete(t)}
                            className="w-7 h-7 border border-border text-muted-foreground hover:text-destructive">
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card border-border max-w-[calc(100%-2rem)] md:max-w-2xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="mono text-sm text-foreground">
              {editTarget ? 'EDIT TEMPLATE' : 'NEW TEMPLATE'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="mono text-[10px] text-muted-foreground">TEMPLATE NAME *</Label>
                <Input value={form.name} onChange={e => set('name', e.target.value)}
                  placeholder="e.g. Password Reset" className="bg-input border-border mono text-xs mt-1" />
              </div>
              <div>
                <Label className="mono text-[10px] text-muted-foreground">DESCRIPTION</Label>
                <Input value={form.description} onChange={e => set('description', e.target.value)}
                  placeholder="Short description" className="bg-input border-border mono text-xs mt-1" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="mono text-[10px] text-muted-foreground">CATEGORY</Label>
                <Select value={form.category_id || 'none'} onValueChange={v => { set('category_id', v === 'none' ? '' : v); set('subcategory_id', ''); }}>
                  <SelectTrigger className="bg-input border-border mono text-xs mt-1">
                    <SelectValue placeholder="No category" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="none" className="mono text-xs">No category</SelectItem>
                    {categories.map(c => (
                      <SelectItem key={c.id} value={c.id} className="mono text-xs">{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mono text-[10px] text-muted-foreground">SUBCATEGORY</Label>
                <Select value={form.subcategory_id || 'none'} onValueChange={v => set('subcategory_id', v === 'none' ? '' : v)}
                  disabled={!form.category_id || subcategories.length === 0}>
                  <SelectTrigger className="bg-input border-border mono text-xs mt-1">
                    <SelectValue placeholder="No subcategory" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="none" className="mono text-xs">No subcategory</SelectItem>
                    {subcategories.map(c => (
                      <SelectItem key={c.id} value={c.id} className="mono text-xs">{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mono text-[10px] text-muted-foreground">PRIORITY</Label>
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

            <div>
              <Label className="mono text-[10px] text-muted-foreground">TICKET SUBJECT *</Label>
              <Input value={form.subject} onChange={e => set('subject', e.target.value)}
                placeholder="Default subject line" className="bg-input border-border mono text-xs mt-1" />
            </div>
            <div>
              <Label className="mono text-[10px] text-muted-foreground">TICKET BODY</Label>
              <p className="mono text-[10px] text-muted-foreground/70 mb-1">
                Use [placeholder] markers for requesters to fill in. e.g. [username], [department]
              </p>
              <Textarea value={form.body} onChange={e => set('body', e.target.value)}
                rows={6} placeholder="Template body text..." className="bg-input border-border mono text-xs mt-1 resize-none" />
            </div>

            <div className="flex items-center gap-3">
              <input type="checkbox" id="is_active" checked={form.is_active}
                onChange={e => set('is_active', e.target.checked)} className="accent-primary" />
              <Label htmlFor="is_active" className="mono text-xs text-foreground cursor-pointer">Active (visible to requesters)</Label>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setDialogOpen(false)} className="border border-border mono text-xs">CANCEL</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-primary text-primary-foreground mono text-xs hud-press">
              {saving ? 'SAVING...' : 'SAVE TEMPLATE'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}

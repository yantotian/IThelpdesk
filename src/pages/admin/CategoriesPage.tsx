import { useEffect, useState, useCallback } from 'react';
import MainLayout from '@/components/layouts/MainLayout';
import { getCategories, upsertCategory, deactivateCategory, deleteCategory, updateCategorySortOrders } from '@/lib/api';
import type { Category } from '@/types/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, RefreshCw, GripVertical, EyeOff } from 'lucide-react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface CategoryForm { name: string; parent_id: string; }

// ── Sortable row wrapper ──────────────────────────────────────────────────────
function SortableRow({ id, children }: { id: string; children: (drag: React.ReactNode, isDragging: boolean) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const handle = (
    <button
      {...attributes}
      {...listeners}
      className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-1 touch-none"
      title="Drag to reorder"
      type="button"
    >
      <GripVertical className="w-4 h-4" />
    </button>
  );
  return (
    <div ref={setNodeRef} style={style}>
      {children(handle, isDragging)}
    </div>
  );
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState<CategoryForm>({ name: '', parent_id: '' });
  const [saving, setSaving] = useState(false);
  // deactivate confirm
  const [deactivateTarget, setDeactivateTarget] = useState<Category | null>(null);
  const [deactivating, setDeactivating] = useState(false);
  // hard-delete confirm
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const reload = useCallback(async () => {
    setLoading(true);
    getCategories().then(setCategories).finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const openNew = () => { setEditing(null); setForm({ name: '', parent_id: '' }); setDialog(true); };
  const openEdit = (c: Category) => {
    setEditing(c);
    setForm({ name: c.name, parent_id: c.parent_id || '' });
    setDialog(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Name required'); return; }
    setSaving(true);
    try {
      await upsertCategory({
        ...(editing ? { id: editing.id } : {}),
        name: form.name,
        parent_id: form.parent_id || null,
        is_active: true,
      });
      toast.success(editing ? 'Category updated' : 'Category created');
      setDialog(false);
      await reload();
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  // Deactivate (soft-delete)
  const handleDeactivate = async () => {
    if (!deactivateTarget) return;
    setDeactivating(true);
    try {
      await deactivateCategory(deactivateTarget.id);
      toast.success(`"${deactivateTarget.name}" deactivated`);
      setDeactivateTarget(null);
      await reload();
    } catch (e: any) { toast.error(e.message); }
    setDeactivating(false);
  };

  // Hard-delete (inactive only)
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteCategory(deleteTarget.id);
      toast.success(`"${deleteTarget.name}" permanently deleted`);
      setDeleteTarget(null);
      await reload();
    } catch (e: any) { toast.error(e.message); }
    setDeleting(false);
  };

  // Drag-to-reorder parents
  const handleParentDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const parents = categories.filter(c => !c.parent_id);
    const oldIdx = parents.findIndex(c => c.id === active.id);
    const newIdx = parents.findIndex(c => c.id === over.id);
    const reordered = arrayMove(parents, oldIdx, newIdx);
    // Optimistic update
    setCategories(prev => {
      const subs = prev.filter(c => c.parent_id);
      return [...reordered.map((c, i) => ({ ...c, sort_order: i })), ...subs];
    });
    try {
      await updateCategorySortOrders(reordered.map((c, i) => ({ id: c.id, sort_order: i })));
    } catch (e: any) { toast.error('Failed to save order'); reload(); }
  };

  // Drag-to-reorder subcategories within a parent
  const handleSubDragEnd = (parentId: string) => async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const subs = categories.filter(c => c.parent_id === parentId);
    const oldIdx = subs.findIndex(c => c.id === active.id);
    const newIdx = subs.findIndex(c => c.id === over.id);
    const reordered = arrayMove(subs, oldIdx, newIdx);
    setCategories(prev => {
      const others = prev.filter(c => c.parent_id !== parentId);
      return [...others, ...reordered.map((c, i) => ({ ...c, sort_order: i }))];
    });
    try {
      await updateCategorySortOrders(reordered.map((c, i) => ({ id: c.id, sort_order: i })));
    } catch (e: any) { toast.error('Failed to save order'); reload(); }
  };

  const parents = categories.filter(c => !c.parent_id);

  return (
    <MainLayout>
      <div className="p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="laser-line mb-2 w-24" />
            <h1 className="text-xl font-bold text-foreground">Category Management</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{categories.filter(c => c.is_active).length} active · {categories.filter(c => !c.is_active).length} inactive</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={reload} className="border border-border text-xs">
              <RefreshCw className="w-3 h-3 mr-1" /> Refresh
            </Button>
            <Button size="sm" onClick={openNew} className="text-xs">
              <Plus className="w-3 h-3 mr-1" /> Add Category
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : parents.length === 0 ? (
          <div className="border border-border bg-card py-12 text-center text-sm text-muted-foreground">
            No categories yet — click "Add Category" to create one.
          </div>
        ) : (
          /* ── Drag context for parent ordering ── */
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleParentDragEnd}>
            <SortableContext items={parents.map(c => c.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-3">
                {parents.map(parent => {
                  const subs = categories.filter(c => c.parent_id === parent.id);
                  return (
                    <SortableRow key={parent.id} id={parent.id}>
                      {(dragHandle) => (
                        <div className={`border border-border bg-card rounded-sm ${!parent.is_active ? 'opacity-60' : ''}`}>
                          {/* Parent row */}
                          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
                            <div className="flex items-center gap-2 min-w-0">
                              {dragHandle}
                              <span className="text-sm font-semibold text-foreground truncate">{parent.name}</span>
                              {!parent.is_active && (
                                <span className="inline-flex items-center gap-1 text-[10px] border border-border text-muted-foreground px-1.5 py-0.5 shrink-0">
                                  <EyeOff className="w-2.5 h-2.5" /> INACTIVE
                                </span>
                              )}
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <Button size="icon" variant="ghost" onClick={() => openEdit(parent)}
                                className="w-7 h-7 border border-border" title="Edit">
                                <Pencil className="w-3 h-3" />
                              </Button>
                              {parent.is_active ? (
                                <Button size="icon" variant="ghost" onClick={() => setDeactivateTarget(parent)}
                                  className="w-7 h-7 border border-border text-muted-foreground hover:text-foreground" title="Deactivate">
                                  <EyeOff className="w-3 h-3" />
                                </Button>
                              ) : (
                                <Button size="icon" variant="ghost" onClick={() => setDeleteTarget(parent)}
                                  className="w-7 h-7 border border-border text-destructive hover:text-destructive" title="Permanently delete">
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              )}
                            </div>
                          </div>

                          {/* Subcategories with their own DnD context */}
                          <div className="px-3 py-1.5">
                            {subs.length === 0 ? (
                              <p className="text-xs text-muted-foreground py-1.5 pl-6 italic">No subcategories</p>
                            ) : (
                              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSubDragEnd(parent.id)}>
                                <SortableContext items={subs.map(c => c.id)} strategy={verticalListSortingStrategy}>
                                  {subs.map(sub => (
                                    <SortableRow key={sub.id} id={sub.id}>
                                      {(subHandle) => (
                                        <div className={`flex items-center justify-between py-1.5 border-b border-border/30 last:border-0 ${!sub.is_active ? 'opacity-60' : ''}`}>
                                          <div className="flex items-center gap-1.5 min-w-0">
                                            {subHandle}
                                            <span className="text-sm text-muted-foreground truncate">↳ {sub.name}</span>
                                            {!sub.is_active && (
                                              <span className="text-[10px] border border-border text-muted-foreground px-1 py-0.5 shrink-0">INACTIVE</span>
                                            )}
                                          </div>
                                          <div className="flex gap-1 shrink-0">
                                            <Button size="icon" variant="ghost" onClick={() => openEdit(sub)} className="w-6 h-6" title="Edit">
                                              <Pencil className="w-2.5 h-2.5" />
                                            </Button>
                                            {sub.is_active ? (
                                              <Button size="icon" variant="ghost" onClick={() => setDeactivateTarget(sub)}
                                                className="w-6 h-6 text-muted-foreground hover:text-foreground" title="Deactivate">
                                                <EyeOff className="w-2.5 h-2.5" />
                                              </Button>
                                            ) : (
                                              <Button size="icon" variant="ghost" onClick={() => setDeleteTarget(sub)}
                                                className="w-6 h-6 text-destructive hover:text-destructive" title="Permanently delete">
                                                <Trash2 className="w-2.5 h-2.5" />
                                              </Button>
                                            )}
                                          </div>
                                        </div>
                                      )}
                                    </SortableRow>
                                  ))}
                                </SortableContext>
                              </DndContext>
                            )}
                          </div>
                        </div>
                      )}
                    </SortableRow>
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {/* ── Add / Edit Dialog ── */}
        <Dialog open={dialog} onOpenChange={setDialog}>
          <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-base font-bold">
                {editing ? 'Edit Category' : 'New Category'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Name <span className="text-destructive">*</span></Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="h-9 text-sm" placeholder="e.g. Hardware" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Parent Category</Label>
                <Select value={form.parent_id || 'none'} onValueChange={v => setForm(f => ({ ...f, parent_id: v === 'none' ? '' : v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="None (top-level)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (top-level)</SelectItem>
                    {parents.filter(p => !editing || p.id !== editing.id).map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setDialog(false)} className="text-sm">Cancel</Button>
                <Button onClick={handleSave} disabled={saving} className="text-sm">
                  {saving ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── Deactivate Confirm ── */}
        <AlertDialog open={!!deactivateTarget} onOpenChange={o => { if (!o) setDeactivateTarget(null); }}>
          <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
            <AlertDialogHeader>
              <AlertDialogTitle>Deactivate "{deactivateTarget?.name}"?</AlertDialogTitle>
              <AlertDialogDescription>
                The category will be hidden from new tickets but existing tickets keep their current assignment. You can permanently delete it afterwards.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeactivate} disabled={deactivating}
                className="bg-muted text-foreground hover:bg-muted/80 border border-border">
                {deactivating ? 'Deactivating…' : 'Deactivate'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* ── Hard-Delete Confirm (inactive only) ── */}
        <AlertDialog open={!!deleteTarget} onOpenChange={o => { if (!o) setDeleteTarget(null); }}>
          <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
            <AlertDialogHeader>
              <AlertDialogTitle>Permanently delete "{deleteTarget?.name}"?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove the category record from the database. Tickets that referenced it will keep their stored category name but the link will be broken. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {deleting ? 'Deleting…' : 'Delete Permanently'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </MainLayout>
  );
}

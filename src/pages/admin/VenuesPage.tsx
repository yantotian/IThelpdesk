import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import MainLayout from '@/components/layouts/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { getVenues, createVenue, updateVenue, deleteVenue } from '@/lib/api';
import type { Venue } from '@/types/types';
import { Plus, Pencil, Trash2, RefreshCw, EyeOff, Eye, CalendarCheck, MapPin, Users } from 'lucide-react';

interface VenueForm {
  name: string;
  location: string;
  capacity: string;
  description: string;
}

export default function VenuesPage() {
  const navigate = useNavigate();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState<Venue | null>(null);
  const [form, setForm] = useState<VenueForm>({ name: '', location: '', capacity: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Venue | null>(null);
  const [deleting, setDeleting] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setVenues(await getVenues());
    } catch (e: any) {
      toast.error(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const openNew = () => {
    setEditing(null);
    setForm({ name: '', location: '', capacity: '', description: '' });
    setDialog(true);
  };

  const openEdit = (v: Venue) => {
    setEditing(v);
    setForm({
      name: v.name,
      location: v.location ?? '',
      capacity: v.capacity != null ? String(v.capacity) : '',
      description: v.description ?? '',
    });
    setDialog(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Venue name is required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        location: form.location || null,
        capacity: form.capacity ? parseInt(form.capacity, 10) : null,
        description: form.description || null,
        is_active: editing ? editing.is_active : true,
      };
      if (editing) {
        await updateVenue(editing.id, payload);
        toast.success('Venue updated');
      } else {
        await createVenue(payload);
        toast.success('Venue created');
      }
      setDialog(false);
      await reload();
    } catch (e: any) {
      toast.error(e.message);
    }
    setSaving(false);
  };

  const toggleActive = async (v: Venue) => {
    try {
      await updateVenue(v.id, {
        name: v.name,
        location: v.location,
        capacity: v.capacity,
        description: v.description,
        is_active: !v.is_active,
      });
      toast.success(v.is_active ? `"${v.name}" deactivated` : `"${v.name}" reactivated`);
      await reload();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteVenue(deleteTarget.id);
      toast.success(`"${deleteTarget.name}" deleted`);
      setDeleteTarget(null);
      await reload();
    } catch (e: any) {
      toast.error(e.message);
    }
    setDeleting(false);
  };

  return (
    <MainLayout>
      <div className="p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="laser-line mb-2 w-24" />
            <h1 className="text-xl font-bold text-foreground">Venue Management</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {venues.filter((v) => v.is_active).length} active ·{' '}
              {venues.filter((v) => !v.is_active).length} inactive
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => navigate('/admin/venue-bookings')}
              className="border border-border text-xs"
            >
              <CalendarCheck className="w-3 h-3 mr-1" /> Approvals
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={reload}
              className="border border-border text-xs"
            >
              <RefreshCw className="w-3 h-3 mr-1" /> Refresh
            </Button>
            <Button size="sm" onClick={openNew} className="text-xs">
              <Plus className="w-3 h-3 mr-1" /> Add Venue
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : venues.length === 0 ? (
          <div className="border border-border bg-card py-12 text-center text-sm text-muted-foreground">
            No venues yet — click “Add Venue” to create one.
          </div>
        ) : (
          <div className="space-y-2">
            {venues.map((v) => (
              <div
                key={v.id}
                className={`border border-border bg-card ${!v.is_active ? 'opacity-60' : ''}`}
              >
                <div className="flex items-center justify-between gap-3 px-4 py-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground truncate">
                        {v.name}
                      </span>
                      {!v.is_active && (
                        <span className="inline-flex items-center gap-1 text-[10px] border border-border text-muted-foreground px-1.5 py-0.5 shrink-0">
                          <EyeOff className="w-2.5 h-2.5" /> INACTIVE
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 mono text-[10px] text-muted-foreground mt-1">
                      {v.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {v.location}
                        </span>
                      )}
                      {v.capacity != null && (
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" /> {v.capacity}
                        </span>
                      )}
                      <span>
                        {v.active_bookings ?? 0} active booking
                        {(v.active_bookings ?? 0) === 1 ? '' : 's'}
                      </span>
                    </div>
                    {v.description && (
                      <p className="text-xs text-muted-foreground mt-1">{v.description}</p>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => openEdit(v)}
                      className="w-7 h-7 border border-border"
                      title="Edit"
                    >
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => toggleActive(v)}
                      className="w-7 h-7 border border-border text-muted-foreground hover:text-foreground"
                      title={v.is_active ? 'Deactivate' : 'Reactivate'}
                    >
                      {v.is_active ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setDeleteTarget(v)}
                      className="w-7 h-7 border border-border text-destructive hover:text-destructive"
                      title="Delete"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add / Edit dialog */}
        <Dialog open={dialog} onOpenChange={setDialog}>
          <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-base font-bold">
                {editing ? 'Edit Venue' : 'New Venue'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="h-9 text-sm"
                  placeholder="e.g. Conference Room A"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Location</Label>
                  <Input
                    value={form.location}
                    onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                    className="h-9 text-sm"
                    placeholder="e.g. 2nd Floor"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Capacity</Label>
                  <Input
                    value={form.capacity}
                    onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
                    className="h-9 text-sm"
                    type="number"
                    placeholder="e.g. 20"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Description</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="text-sm min-h-[64px]"
                  placeholder="Optional notes about the venue"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setDialog(false)} className="text-sm">
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={saving} className="text-sm">
                  {saving ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete confirm */}
        <AlertDialog
          open={!!deleteTarget}
          onOpenChange={(o) => {
            if (!o) setDeleteTarget(null);
          }}
        >
          <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete “{deleteTarget?.name}”?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently removes the venue. It can only be deleted when it has no
                bookings — deactivate it instead to keep its history.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </MainLayout>
  );
}

import { useEffect, useState } from 'react';
import MainLayout from '@/components/layouts/MainLayout';
import { getPriorityConfigs, updatePriorityConfig } from '@/lib/api';
import type { PriorityConfig } from '@/types/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Save, RefreshCw } from 'lucide-react';

const PRIORITY_ORDER = ['critical', 'high', 'medium', 'low'];

export default function PrioritiesPage() {
  const [configs, setConfigs] = useState<PriorityConfig[]>([]);
  const [edits, setEdits] = useState<Record<string, Partial<PriorityConfig>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    getPriorityConfigs().then(setConfigs).finally(() => setLoading(false));
  };

  useEffect(() => { reload(); }, []);

  const setEdit = (id: string, k: keyof PriorityConfig, v: string | number) =>
    setEdits(e => ({ ...e, [id]: { ...e[id], [k]: v } }));

  const handleSave = async (cfg: PriorityConfig) => {
    const changes = edits[cfg.id];
    if (!changes) return;
    setSaving(cfg.id);
    try {
      await updatePriorityConfig(cfg.id, changes);
      toast.success(`${cfg.priority.toUpperCase()} priority updated`);
      setEdits(e => { const n = { ...e }; delete n[cfg.id]; return n; });
      await reload();
    } catch (e: any) { toast.error(e.message); }
    setSaving(null);
  };

  const sorted = [...configs].sort((a, b) =>
    PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority)
  );

  return (
    <MainLayout>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="laser-line mb-2 w-24" />
            <h1 className="mono text-lg text-foreground">PRIORITIES & SLA</h1>
            <p className="mono text-xs text-muted-foreground">Configure SLA response times</p>
          </div>
          <Button size="sm" variant="ghost" onClick={reload} className="border border-border mono text-xs">
            <RefreshCw className="w-3 h-3 mr-1" />REFRESH
          </Button>
        </div>

        <div className="space-y-3">
          {sorted.map(cfg => {
            const draft = edits[cfg.id] || {};
            const slaH = draft.sla_hours ?? cfg.sla_hours;
            const label = draft.label ?? cfg.label;
            const isDirty = Object.keys(draft).length > 0;

            return (
              <div key={cfg.id} className="border border-border bg-card p-5">
                <div className="flex items-start justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-8 shrink-0" style={{ background: cfg.color }} />
                    <div>
                      <div className="mono text-xs text-foreground">{cfg.priority.toUpperCase()}</div>
                      <div className="mono text-[10px] text-muted-foreground">
                        Current SLA: {cfg.sla_hours}h
                        {cfg.priority === 'critical' || cfg.priority === 'high'
                          ? ' (email alert on breach)'
                          : ''}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-end gap-4 flex-wrap">
                    <div>
                      <Label className="mono text-[10px] text-muted-foreground">LABEL</Label>
                      <Input
                        value={label}
                        onChange={e => setEdit(cfg.id, 'label', e.target.value)}
                        className="bg-input border-border mono text-xs w-28 h-8 mt-1"
                      />
                    </div>
                    <div>
                      <Label className="mono text-[10px] text-muted-foreground">SLA HOURS</Label>
                      <Input
                        type="number"
                        min={1}
                        value={slaH}
                        onChange={e => setEdit(cfg.id, 'sla_hours', parseInt(e.target.value) || 1)}
                        className="bg-input border-border mono text-xs w-24 h-8 mt-1"
                      />
                    </div>
                    {isDirty && (
                      <Button
                        size="sm"
                        onClick={() => handleSave(cfg)}
                        disabled={saving === cfg.id}
                        className="bg-primary text-primary-foreground mono text-xs hud-press h-8"
                      >
                        <Save className="w-3 h-3 mr-1" />SAVE
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="border border-border/50 bg-secondary/30 p-4">
          <div className="mono text-[10px] text-muted-foreground mb-2">SLA POLICY NOTES</div>
          <ul className="space-y-1 mono text-[10px] text-muted-foreground">
            <li>• Critical and High priority tickets trigger email alerts when SLA is breached</li>
            <li>• SLA timer starts from ticket creation time</li>
            <li>• Verified tickets auto-close after 48 hours (configurable in System Config)</li>
            <li>• SLA check runs every 5 minutes via scheduled task</li>
          </ul>
        </div>
      </div>
    </MainLayout>
  );
}

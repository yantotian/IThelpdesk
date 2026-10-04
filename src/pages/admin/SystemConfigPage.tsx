import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import MainLayout from '@/components/layouts/MainLayout';
import { getSystemConfigs, updateSystemConfig } from '@/lib/api';
import { api } from '@/lib/api-client';
import type { SystemConfig } from '@/types/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Save, RefreshCw, Activity } from 'lucide-react';

export default function SystemConfigPage() {
  const { role } = useAuth();
  const [configs, setConfigs] = useState<SystemConfig[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [health, setHealth] = useState<'ok' | 'error' | 'checking'>('checking');

  const reload = async () => {
    setLoading(true);
    getSystemConfigs().then(setConfigs).finally(() => setLoading(false));
  };

  useEffect(() => {
    reload();
    // Health check
    api.get('/health')
      .then(() => setHealth('ok'))
      .catch(() => setHealth('error'));
  }, []);

  const handleSave = async (key: string) => {
    const val = edits[key];
    if (val === undefined) return;
    setSaving(key);
    try {
      await updateSystemConfig(key, val);
      toast.success(`Config "${key}" updated`);
      setEdits(e => { const n = { ...e }; delete n[key]; return n; });
      await reload();
    } catch (e: any) { toast.error(e.message); }
    setSaving(null);
  };

  const isSysAdmin = role === 'sysadmin';

  return (
    <MainLayout>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="laser-line mb-2 w-24" />
            <h1 className="mono text-lg text-foreground">SYSTEM CONFIGURATION</h1>
            <p className="mono text-xs text-muted-foreground">SysAdmin only</p>
          </div>
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-1.5 mono text-[10px] border px-2 py-1 ${
              health === 'ok' ? 'border-green-500 text-green-400' :
              health === 'error' ? 'border-destructive text-destructive' :
              'border-border text-muted-foreground'
            }`}>
              <Activity className="w-3 h-3" />
              {health === 'ok' ? 'SYSTEM HEALTHY' : health === 'error' ? 'HEALTH ERROR' : 'CHECKING...'}
            </div>
            <Button size="sm" variant="ghost" onClick={reload} className="border border-border mono text-xs">
              <RefreshCw className="w-3 h-3 mr-1" />REFRESH
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          {loading ? (
            <div className="mono text-xs text-muted-foreground">LOADING...</div>
          ) : configs.map(cfg => {
            const val = edits[cfg.key] ?? cfg.value;
            const isDirty = edits[cfg.key] !== undefined;
            return (
              <div key={cfg.key} className="border border-border bg-card p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <div className="mono text-xs text-primary">{cfg.key}</div>
                    <div className="mono text-[10px] text-muted-foreground mt-0.5">{cfg.description || ''}</div>
                    <div className="mono text-[10px] text-muted-foreground">
                      Last updated: {cfg.updated_at.slice(0, 16).replace('T', ' ')}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      value={val}
                      onChange={e => setEdits(ed => ({ ...ed, [cfg.key]: e.target.value }))}
                      disabled={!isSysAdmin}
                      className="bg-input border-border mono text-xs w-48 h-8"
                    />
                    {isDirty && isSysAdmin && (
                      <Button
                        size="sm"
                        onClick={() => handleSave(cfg.key)}
                        disabled={saving === cfg.key}
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

        {/* API Info */}
        <div className="border border-border bg-card p-5">
          <div className="mono text-[10px] text-muted-foreground tracking-widest mb-3">API ENDPOINTS</div>
          <div className="space-y-1 mono text-[10px] text-muted-foreground">
            <div><span className="text-primary">GET</span>  /api/health — Health check</div>
            <div><span className="text-primary">POST</span> /api/auth/register — User registration (JWT)</div>
            <div><span className="text-primary">POST</span> /api/auth/login — User login</div>
            <div><span className="text-primary">GET</span>  /api/dashboard-stats — Dashboard statistics</div>
            <div className="pt-2 border-t border-border">
              <span className="text-yellow-400">Rate Limit:</span> Configurable via rate_limit_per_minute setting
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}

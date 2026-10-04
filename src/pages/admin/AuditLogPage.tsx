import { useEffect, useState } from 'react';
import MainLayout from '@/components/layouts/MainLayout';
import { api } from '@/lib/api-client';
import type { AuditLog } from '@/types/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';

export default function AuditLogPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const reload = async () => {
    setLoading(true);
    try {
      const data = await api.get<any[]>('/audit-log');
      setLogs(Array.isArray(data) ? data : []);
    } catch (e: any) { toast.error(e.message); }
    setLoading(false);
  };

  useEffect(() => { reload(); }, []);

  const filtered = logs.filter(l =>
    !search ||
    l.table_name?.includes(search) ||
    l.action?.includes(search) ||
    l.actor?.username?.includes(search) ||
    l.record_id?.includes(search)
  );

  return (
    <MainLayout>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="laser-line mb-2 w-24" />
            <h1 className="mono text-lg text-foreground">AUDIT LOG</h1>
            <p className="mono text-xs text-muted-foreground">{logs.length} RECORDS</p>
          </div>
          <Button size="sm" variant="ghost" onClick={reload} className="border border-border mono text-xs">
            <RefreshCw className="w-3 h-3 mr-1" />REFRESH
          </Button>
        </div>

        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <Input
            placeholder="Search action, table, actor..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 bg-input border-border mono text-xs h-8"
          />
        </div>

        <div className="border border-border bg-card min-w-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-max">
              <thead>
                <tr className="border-b border-border">
                  {['TIMESTAMP', 'ACTOR', 'ACTION', 'TABLE', 'RECORD ID'].map(h => (
                    <th key={h} className="px-3 py-2 text-left mono text-[10px] text-muted-foreground tracking-widest whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="px-3 py-8 text-center mono text-xs text-muted-foreground">LOADING...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={5} className="px-3 py-8 text-center mono text-xs text-muted-foreground">NO RECORDS</td></tr>
                ) : filtered.map(l => (
                  <tr key={l.id} className="border-b border-border/50 hover:bg-secondary/50">
                    <td className="px-3 py-2 whitespace-nowrap mono text-[10px] text-muted-foreground">
                      {l.created_at.slice(0, 16).replace('T', ' ')}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap mono text-xs text-primary">
                      {l.actor?.full_name || l.actor?.username || '—'}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap mono text-xs text-foreground">{l.action}</td>
                    <td className="px-3 py-2 whitespace-nowrap mono text-xs text-muted-foreground">{l.table_name}</td>
                    <td className="px-3 py-2 whitespace-nowrap mono text-[10px] text-muted-foreground max-w-[200px] truncate">
                      {l.record_id}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}

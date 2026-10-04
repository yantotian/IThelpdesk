import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import MainLayout from '@/components/layouts/MainLayout';
import { updateProfile } from '@/lib/api';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { PASSWORD_MIN_LENGTH } from '@/lib/utils';
import { User, Lock, Save, KeyRound } from 'lucide-react';

export default function ProfilePage() {
  const { profile, refreshProfile } = useAuth();

  const [info, setInfo] = useState({
    full_name: profile?.full_name || '',
    office: profile?.office || '',
    contact: profile?.contact || '',
  });
  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' });
  const [savingInfo, setSavingInfo] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  const handleInfoSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSavingInfo(true);
    try {
      await updateProfile(profile.id, {
        full_name: info.full_name || null,
        office: info.office || null,
        contact: info.contact || null,
      } as any);
      await refreshProfile();
      toast.success('Profile updated');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingInfo(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pwd.next || pwd.next.length < PASSWORD_MIN_LENGTH) {
      toast.error(`New password must be at least ${PASSWORD_MIN_LENGTH} characters`);
      return;
    }
    if (pwd.next !== pwd.confirm) {
      toast.error('Passwords do not match');
      return;
    }
    setSavingPwd(true);
    try {
      await api.post('/auth/change-password', {
        current_password: pwd.current,
        new_password: pwd.next,
      });
      setPwd({ current: '', next: '', confirm: '' });
      toast.success('Password changed successfully');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingPwd(false);
    }
  };

  const ROLE_LABELS: Record<string, string> = {
    requester: 'REQUESTER',
    technician: 'TECHNICIAN',
    it_admin: 'IT ADMIN',
    sysadmin: 'SYSTEM ADMIN',
  };

  return (
    <MainLayout>
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <div className="laser-line mb-2 w-24" />
          <h1 className="mono text-lg text-foreground">PROFILE SETTINGS</h1>
          <p className="mono text-xs text-muted-foreground">
            {profile?.username} &nbsp;·&nbsp;
            <span className="text-primary">{ROLE_LABELS[profile?.role || ''] || profile?.role}</span>
          </p>
        </div>

        {/* Profile Info */}
        <form onSubmit={handleInfoSave} className="border border-border bg-card p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <User className="w-4 h-4 text-primary" />
            <span className="mono text-xs text-muted-foreground tracking-widest">ACCOUNT INFORMATION</span>
          </div>
          <div className="laser-line mb-4" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="mono text-[10px] text-muted-foreground">USERNAME (read-only)</Label>
              <div className="px-3 py-2 bg-secondary border border-border mono text-xs text-muted-foreground">
                {profile?.username}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="mono text-[10px] text-muted-foreground">ROLE (read-only)</Label>
              <div className="px-3 py-2 bg-secondary border border-border mono text-xs text-muted-foreground">
                {ROLE_LABELS[profile?.role || ''] || profile?.role}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="mono text-[10px] text-muted-foreground">FULL NAME</Label>
              <Input
                value={info.full_name}
                onChange={e => setInfo(i => ({ ...i, full_name: e.target.value }))}
                placeholder="Display name"
                className="bg-input border-border mono text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="mono text-[10px] text-muted-foreground">OFFICE / DEPARTMENT</Label>
              <Input
                value={info.office}
                onChange={e => setInfo(i => ({ ...i, office: e.target.value }))}
                placeholder="e.g. HQ Floor 3"
                className="bg-input border-border mono text-sm"
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label className="mono text-[10px] text-muted-foreground">CONTACT (email or phone)</Label>
              <Input
                value={info.contact}
                onChange={e => setInfo(i => ({ ...i, contact: e.target.value }))}
                placeholder="contact@company.com or +1 555-0100"
                className="bg-input border-border mono text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              disabled={savingInfo}
              className="bg-primary text-primary-foreground mono text-xs hud-press"
            >
              <Save className="w-3 h-3 mr-1" />
              {savingInfo ? 'SAVING...' : 'SAVE CHANGES'}
            </Button>
          </div>
        </form>

        {/* Password Change */}
        <form onSubmit={handlePasswordChange} className="border border-border bg-card p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Lock className="w-4 h-4 text-primary" />
            <span className="mono text-xs text-muted-foreground tracking-widest">CHANGE PASSWORD</span>
          </div>
          <div className="laser-line mb-4" />

          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="mono text-[10px] text-muted-foreground">CURRENT PASSWORD</Label>
              <div className="relative">
                <Input
                  required
                  type={showPwd ? 'text' : 'password'}
                  value={pwd.current}
                  onChange={e => setPwd(p => ({ ...p, current: e.target.value }))}
                  placeholder="••••••••"
                  autoComplete={showPwd ? 'off' : 'current-password'}
                  className="bg-input border-border mono text-sm pr-10"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="mono text-[10px] text-muted-foreground">NEW PASSWORD (min 6 chars)</Label>
              <Input
                required
                type={showPwd ? 'text' : 'password'}
                value={pwd.next}
                onChange={e => setPwd(p => ({ ...p, next: e.target.value }))}
                placeholder="••••••••"
                autoComplete={showPwd ? 'off' : 'new-password'}
                className="bg-input border-border mono text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="mono text-[10px] text-muted-foreground">CONFIRM NEW PASSWORD</Label>
              <Input
                required
                type={showPwd ? 'text' : 'password'}
                value={pwd.confirm}
                onChange={e => setPwd(p => ({ ...p, confirm: e.target.value }))}
                placeholder="••••••••"
                autoComplete={showPwd ? 'off' : 'new-password'}
                className="bg-input border-border mono text-sm"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showPwd}
                onChange={e => setShowPwd(e.target.checked)}
                className="accent-primary"
              />
              <span className="mono text-xs text-muted-foreground">Show passwords</span>
            </label>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              disabled={savingPwd}
              className="bg-primary text-primary-foreground mono text-xs hud-press"
            >
              <KeyRound className="w-3 h-3 mr-1" />
              {savingPwd ? 'CHANGING...' : 'CHANGE PASSWORD'}
            </Button>
          </div>
        </form>

        {/* Account meta */}
        <div className="border border-border bg-card p-4 grid grid-cols-2 gap-3">
          <div>
            <div className="mono text-[10px] text-muted-foreground">MEMBER SINCE</div>
            <div className="mono text-xs text-foreground mt-0.5">
              {profile?.created_at?.slice(0, 10) || '—'}
            </div>
          </div>
          <div>
            <div className="mono text-[10px] text-muted-foreground">LAST UPDATED</div>
            <div className="mono text-xs text-foreground mt-0.5">
              {profile?.updated_at?.slice(0, 16).replace('T', ' ') || '—'}
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}

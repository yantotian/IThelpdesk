import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validatePassword } from "@/lib/utils";
import { Eye, EyeOff, Terminal } from "lucide-react";

type Mode = "login" | "register";

export default function LoginPage() {
  const { signInWithUsername, signUpWithUsername } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [form, setForm] = useState({
    username: "",
    password: "",
    full_name: "",
    office: "",
    contact: "",
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
if (mode === "register" && !agreed) {
        toast.error("Please accept the User Agreement and Privacy Policy");
        return;
      }
      if (mode === "register") {
        const pwdError = validatePassword(form.password);
        if (pwdError) {
          toast.error(pwdError);
          return;
        }
      }
      setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await signInWithUsername(
          form.username,
          form.password,
        );
        if (error) {
          toast.error(error.message);
          return;
        }
        toast.success("Logged in");
        navigate("/dashboard");
      } else {
        const { error } = await signUpWithUsername({
          username: form.username,
          password: form.password,
          full_name: form.full_name,
          role: "requester",
          office: form.office || undefined,
          contact: form.contact || undefined,
        });
        if (error) {
          toast.error(error.message);
          return;
        }
        toast.success("Account created");
        navigate("/dashboard");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel — branding */}
      <div className="hidden md:flex flex-col justify-between w-1/2 p-12 border-r border-border relative overflow-hidden">
        {/* decorative laser lines */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent opacity-80" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent opacity-40" />
        <div className="absolute left-0 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-primary to-transparent opacity-40" />

        <div className="flex items-center gap-3">
          <div className="w-8 h-8 border border-primary flex items-center justify-center">
            <Terminal className="w-4 h-4 text-primary" />
          </div>
          <span className="text-primary mono text-sm tracking-widest">
            HELPDESK.SYS
          </span>
        </div>

        <div>
          <div className="laser-line mb-8" />
          <h1 className="mono text-4xl font-bold text-foreground leading-tight mb-4">
            IT HELPDESK
            <br />
            <span className="text-primary">TICKETING</span>
            <br />
            SYSTEM
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed max-w-sm">
            Enterprise-grade incident management. Full lifecycle tracking from
            ticket creation to closure.
          </p>
          <div className="laser-line mt-8" />
        </div>

        <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground">
          {[
            ["STATUS", "OPERATIONAL"],
            ["VERSION", "v1.0.0"],
            ["SLA", "MONITORED"],
            ["Maintained by", "Operations Division - CIO"],
          ].map(([k, v]) => (
            <div key={k} className="border border-border p-3">
              <div className="text-primary mono">{k}</div>
              <div className="text-foreground mono mt-1">{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 md:hidden">
            <div className="w-7 h-7 border border-primary flex items-center justify-center">
              <Terminal className="w-3 h-3 text-primary" />
            </div>
            <span className="text-primary mono text-xs tracking-widest">
              HELPDESK.SYS
            </span>
          </div>

          <div className="border border-border bg-card p-8">
            {/* Tab switcher */}
            <div className="flex border-b border-border mb-8">
              {(["login", "register"] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex-1 pb-3 mono text-xs tracking-widest uppercase transition-colors ${
                    mode === m
                      ? "text-primary border-b-2 border-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m === "login" ? "SIGN IN" : "REGISTER"}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "register" && (
                <div className="space-y-1">
                  <Label className="mono text-xs text-muted-foreground">
                    FULL NAME
                  </Label>
                  <Input
                    value={form.full_name}
                    onChange={(e) => set("full_name", e.target.value)}
                    placeholder="Display name"
                    className="bg-input border-border mono text-sm"
                  />
                </div>
              )}

              <div className="space-y-1">
                <Label className="mono text-xs text-muted-foreground">
                  USERNAME
                </Label>
                <Input
                  required
                  value={form.username}
                  onChange={(e) =>
                    set(
                      "username",
                      e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""),
                    )
                  }
                  placeholder="letters, digits, underscore"
                  className="bg-input border-border mono text-sm"
                  autoComplete="username"
                />
              </div>

              <div className="space-y-1">
                <Label className="mono text-xs text-muted-foreground">
                  PASSWORD
                </Label>
                <div className="relative">
                  <Input
                    required
                    minLength={6}
                    type={showPwd ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => set("password", e.target.value)}
                    placeholder={
                      mode === "register"
                        ? "Min 6 chars: letters, numbers, symbols"
                        : "••••••••"
                    }
                    className="bg-input border-border mono text-sm pr-10"
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(!showPwd)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPwd ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {mode === "register" && (
                <>
                  <div className="space-y-1">
                    <Label className="mono text-xs text-muted-foreground">
                      OFFICE (optional)
                    </Label>
                    <Input
                      value={form.office}
                      onChange={(e) => set("office", e.target.value)}
                      placeholder="e.g. City Information Office"
                      className="bg-input border-border mono text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="mono text-xs text-muted-foreground">
                      CONTACT (optional)
                    </Label>
                    <Input
                      value={form.contact}
                      onChange={(e) => set("contact", e.target.value)}
                      placeholder="Email or phone"
                      className="bg-input border-border mono text-sm"
                    />
                  </div>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={agreed}
                      onChange={(e) => setAgreed(e.target.checked)}
                      className="mt-0.5 accent-primary"
                    />
                    <span className="text-xs text-muted-foreground">
                      I agree to the{" "}
                      <Link
                        to="/terms"
                        className="text-primary hover:underline"
                      >
                        User Agreement
                      </Link>{" "}
                      and{" "}
                      <Link
                        to="/privacy"
                        className="text-primary hover:underline"
                      >
                        Privacy Policy
                      </Link>
                    </span>
                  </label>
                </>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-primary text-primary-foreground mono text-xs tracking-widest hud-press"
              >
                {loading
                  ? "PROCESSING..."
                  : mode === "login"
                    ? "AUTHENTICATE"
                    : "CREATE ACCOUNT"}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

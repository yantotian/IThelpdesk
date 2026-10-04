import { useEffect, useState, useCallback } from "react";
import MainLayout from "@/components/layouts/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { createInventorySubmission, getMySubmissions } from "@/lib/api";
import type { ICTInventorySubmission } from "@/types/types";
import {
  Plus,
  ClipboardList,
  Monitor,
  Wifi,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { formatUtc8Date } from "@/lib/utils";

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "border-yellow-500 text-yellow-600",
    approved: "border-green-500 text-green-600",
    rejected: "border-red-500 text-red-600",
  };
  return (
    <span
      className={`mono text-[10px] border px-1.5 py-0.5 ${map[status] ?? "border-border text-muted-foreground"}`}
    >
      {status.toUpperCase()}
    </span>
  );
}

// ── Device submission form ────────────────────────────────────────────────────
function DeviceForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const [f, setF] = useState({
    device_type: "laptop",
    brand: "",
    model: "",
    serial_no: "",
    asset_tag: "",
    location: "",
    assigned_to: "",
    cpu: "",
    gpu: "",
    ram_gb: "",
    storage_gb: "",
    storage_type: "",
    os: "",
    printer_type: "",
    is_network_printer: false,
    router_type: "",
    wifi_standard: "",
    num_ports: "",
    purchase_date: "",
    warranty_until: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: unknown) => setF((p) => ({ ...p, [k]: v }));

  const handleSubmit = async () => {
    if (!f.brand.trim() || !f.model.trim()) {
      toast.error("Brand and Model are required");
      return;
    }
    setSaving(true);
    await onSubmit({
      submission_type: "device",
      device_type: f.device_type,
      brand: f.brand.trim(),
      model: f.model.trim(),
      serial_no: f.serial_no || null,
      asset_tag: f.asset_tag || null,
      location: f.location || null,
      assigned_to: f.assigned_to || null,
      cpu: f.cpu || null,
      gpu: f.gpu || null,
      ram_gb: f.ram_gb ? parseInt(f.ram_gb) : null,
      storage_gb: f.storage_gb ? parseInt(f.storage_gb) : null,
      storage_type: f.storage_type || null,
      os: f.os || null,
      printer_type: f.device_type === "printer" ? f.printer_type || null : null,
      is_network_printer:
        f.device_type === "printer" ? f.is_network_printer : null,
      router_type: f.device_type === "router" ? f.router_type || null : null,
      wifi_standard:
        f.device_type === "router" ? f.wifi_standard || null : null,
      num_ports:
        f.device_type === "router" && f.num_ports
          ? parseInt(f.num_ports)
          : null,
      purchase_date: f.purchase_date || null,
      warranty_until: f.warranty_until || null,
      notes: f.notes || null,
    });
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className="text-xs font-semibold">Device Type *</Label>
          <Select
            value={f.device_type}
            onValueChange={(v) => set("device_type", v)}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["laptop", "desktop", "printer", "router"].map((t) => (
                <SelectItem key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-semibold">Brand *</Label>
          <Input
            value={f.brand}
            onChange={(e) => set("brand", e.target.value)}
            className="h-9 text-sm"
            placeholder="e.g. Dell"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-semibold">Model *</Label>
          <Input
            value={f.model}
            onChange={(e) => set("model", e.target.value)}
            className="h-9 text-sm"
            placeholder="e.g. Latitude 5420"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-semibold">Serial No</Label>
          <Input
            value={f.serial_no}
            onChange={(e) => set("serial_no", e.target.value)}
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-semibold">Asset Tag</Label>
          <Input
            value={f.asset_tag}
            onChange={(e) => set("asset_tag", e.target.value)}
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-semibold">Location</Label>
          <Input
            value={f.location}
            onChange={(e) => set("location", e.target.value)}
            className="h-9 text-sm"
            placeholder="e.g. City Information Office"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-semibold">Assigned To</Label>
          <Input
            value={f.assigned_to}
            onChange={(e) => set("assigned_to", e.target.value)}
            className="h-9 text-sm"
            placeholder="Person's name"
          />
        </div>
      </div>

      {/* Compute specs */}
      {(f.device_type === "laptop" || f.device_type === "desktop") && (
        <div className="border border-border/50 bg-muted/10 p-3 space-y-3">
          <div className="mono text-[10px] text-muted-foreground tracking-widest">
            COMPUTE SPECS
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">CPU</Label>
              <Input
                value={f.cpu}
                onChange={(e) => set("cpu", e.target.value)}
                className="h-9 text-sm"
                placeholder="e.g. i7-1165G7"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">GPU</Label>
              <Input
                value={f.gpu}
                onChange={(e) => set("gpu", e.target.value)}
                className="h-9 text-sm"
                placeholder="e.g. Intel Iris Xe"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">RAM (GB)</Label>
              <Input
                value={f.ram_gb}
                onChange={(e) => set("ram_gb", e.target.value)}
                className="h-9 text-sm"
                type="number"
                placeholder="e.g. 16"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Storage (GB)</Label>
              <Input
                value={f.storage_gb}
                onChange={(e) => set("storage_gb", e.target.value)}
                className="h-9 text-sm"
                type="number"
                placeholder="e.g. 512"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Storage Type</Label>
              <Select
                value={f.storage_type}
                onValueChange={(v) => set("storage_type", v)}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SSD">SSD</SelectItem>
                  <SelectItem value="HDD">HDD</SelectItem>
                  <SelectItem value="NVMe">NVMe</SelectItem>
                  <SelectItem value="eMMC">eMMC</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">OS</Label>
              <Input
                value={f.os}
                onChange={(e) => set("os", e.target.value)}
                className="h-9 text-sm"
                placeholder="e.g. Windows 11 Pro"
              />
            </div>
          </div>
        </div>
      )}

      {/* Printer specs */}
      {f.device_type === "printer" && (
        <div className="border border-border/50 bg-muted/10 p-3 space-y-3">
          <div className="mono text-[10px] text-muted-foreground tracking-widest">
            PRINTER SPECS
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Printer Type</Label>
              <Select
                value={f.printer_type}
                onValueChange={(v) => set("printer_type", v)}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {["inkjet", "laser", "dot_matrix", "thermal"].map((t) => (
                    <SelectItem key={t} value={t}>
                      {t.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Network Printer?</Label>
              <Select
                value={f.is_network_printer ? "yes" : "no"}
                onValueChange={(v) => set("is_network_printer", v === "yes")}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}

      {/* Router specs */}
      {f.device_type === "router" && (
        <div className="border border-border/50 bg-muted/10 p-3 space-y-3">
          <div className="mono text-[10px] text-muted-foreground tracking-widest">
            ROUTER SPECS
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Router Type</Label>
              <Select
                value={f.router_type}
                onValueChange={(v) => set("router_type", v)}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {["wired", "wireless", "fiber", "mesh"].map((t) => (
                    <SelectItem key={t} value={t}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">WiFi Standard</Label>
              <Input
                value={f.wifi_standard}
                onChange={(e) => set("wifi_standard", e.target.value)}
                className="h-9 text-sm"
                placeholder="e.g. 802.11ax"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">No. of Ports</Label>
              <Input
                value={f.num_ports}
                onChange={(e) => set("num_ports", e.target.value)}
                className="h-9 text-sm"
                type="number"
              />
            </div>
          </div>
        </div>
      )}

      {/* Dates + notes */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className="text-xs font-semibold">Purchase Date</Label>
          <Input
            value={f.purchase_date}
            onChange={(e) => set("purchase_date", e.target.value)}
            className="h-9 text-sm"
            type="date"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-semibold">Warranty Until</Label>
          <Input
            value={f.warranty_until}
            onChange={(e) => set("warranty_until", e.target.value)}
            className="h-9 text-sm"
            type="date"
          />
        </div>
        <div className="space-y-1 col-span-2 md:col-span-1">
          <Label className="text-xs font-semibold">Notes</Label>
          <Input
            value={f.notes}
            onChange={(e) => set("notes", e.target.value)}
            className="h-9 text-sm"
            placeholder="Additional details"
          />
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <Button onClick={handleSubmit} disabled={saving} className="text-sm">
          {saving ? "Submitting..." : "Submit for Review"}
        </Button>
        <Button variant="outline" onClick={onCancel} className="text-sm">
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Internet submission form ───────────────────────────────────────────────────
function InternetForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const [f, setF] = useState({
    isp_name: "",
    plan_name: "",
    plan_type: "fiber",
    subscribed_speed_mbps: "",
    monthly_cost: "",
    location: "",
    contract_start: "",
    contract_end: "",
    account_no: "",
    contact_person: "",
    contact_number: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: unknown) => setF((p) => ({ ...p, [k]: v }));

  const handleSubmit = async () => {
    if (!f.isp_name.trim() || !f.plan_name.trim() || !f.location.trim()) {
      toast.error("ISP name, plan name, and location are required");
      return;
    }
    setSaving(true);
    await onSubmit({
      submission_type: "internet",
      isp_name: f.isp_name.trim(),
      plan_name: f.plan_name.trim(),
      plan_type: f.plan_type,
      subscribed_speed_mbps: f.subscribed_speed_mbps
        ? parseFloat(f.subscribed_speed_mbps)
        : null,
      monthly_cost: f.monthly_cost ? parseFloat(f.monthly_cost) : null,
      location: f.location.trim(),
      contract_start: f.contract_start || null,
      contract_end: f.contract_end || null,
      account_no: f.account_no || null,
      contact_person: f.contact_person || null,
      contact_number: f.contact_number || null,
      notes: f.notes || null,
    });
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className="text-xs font-semibold">ISP Name *</Label>
          <Input
            value={f.isp_name}
            onChange={(e) => set("isp_name", e.target.value)}
            className="h-9 text-sm"
            placeholder="e.g. PLDT"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-semibold">Plan Name *</Label>
          <Input
            value={f.plan_name}
            onChange={(e) => set("plan_name", e.target.value)}
            className="h-9 text-sm"
            placeholder="e.g. Fibr 100 Mbps"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-semibold">Plan Type *</Label>
          <Select
            value={f.plan_type}
            onValueChange={(v) => set("plan_type", v)}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["fiber", "dsl", "cable", "wireless", "satellite"].map((t) => (
                <SelectItem key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-semibold">Location *</Label>
          <Input
            value={f.location}
            onChange={(e) => set("location", e.target.value)}
            className="h-9 text-sm"
            placeholder="e.g. Main Office"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-semibold">
            Subscribed Speed (Mbps)
          </Label>
          <Input
            value={f.subscribed_speed_mbps}
            onChange={(e) => set("subscribed_speed_mbps", e.target.value)}
            className="h-9 text-sm"
            type="number"
            placeholder="e.g. 100"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-semibold">Monthly Cost (₱)</Label>
          <Input
            value={f.monthly_cost}
            onChange={(e) => set("monthly_cost", e.target.value)}
            className="h-9 text-sm"
            type="number"
            placeholder="e.g. 2999"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-semibold">Contract Start</Label>
          <Input
            value={f.contract_start}
            onChange={(e) => set("contract_start", e.target.value)}
            className="h-9 text-sm"
            type="date"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-semibold">Contract End</Label>
          <Input
            value={f.contract_end}
            onChange={(e) => set("contract_end", e.target.value)}
            className="h-9 text-sm"
            type="date"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-semibold">Account No</Label>
          <Input
            value={f.account_no}
            onChange={(e) => set("account_no", e.target.value)}
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-semibold">Contact Person</Label>
          <Input
            value={f.contact_person}
            onChange={(e) => set("contact_person", e.target.value)}
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-semibold">Contact Number</Label>
          <Input
            value={f.contact_number}
            onChange={(e) => set("contact_number", e.target.value)}
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1 col-span-2 md:col-span-3">
          <Label className="text-xs font-semibold">Notes</Label>
          <Textarea
            value={f.notes}
            onChange={(e) => set("notes", e.target.value)}
            className="text-sm min-h-[60px]"
            placeholder="Additional details"
          />
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <Button onClick={handleSubmit} disabled={saving} className="text-sm">
          {saving ? "Submitting..." : "Submit for Review"}
        </Button>
        <Button variant="outline" onClick={onCancel} className="text-sm">
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Submission detail row ─────────────────────────────────────────────────────
function SubmissionRow({ s }: { s: ICTInventorySubmission }) {
  const [open, setOpen] = useState(false);
  const isDevice = s.submission_type === "device";

  return (
    <div className="border border-border bg-card">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/10 text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          {isDevice ? (
            <Monitor className="w-3.5 h-3.5 text-primary shrink-0" />
          ) : (
            <Wifi className="w-3.5 h-3.5 text-primary shrink-0" />
          )}
          <div className="min-w-0">
            <div className="text-sm font-medium">
              {isDevice
                ? `${s.brand ?? "—"} ${s.model ?? "—"}`
                : `${s.isp_name ?? "—"} — ${s.plan_name ?? "—"}`}
            </div>
            <div className="text-xs text-muted-foreground mono">
              {isDevice ? (s.device_type ?? "").toUpperCase() : "INTERNET"} ·{" "}
              {formatUtc8Date(s.created_at)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={s.status} />
          {open ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2 border-t border-border">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 pt-3 text-xs">
            {isDevice ? (
              <>
                {[
                  ["Location", s.location],
                  ["Assigned To", s.assigned_to],
                  ["Serial No", s.serial_no],
                  ["Asset Tag", s.asset_tag],
                  ["CPU", s.cpu],
                  ["GPU", s.gpu],
                  ["RAM", s.ram_gb ? `${s.ram_gb} GB` : null],
                  [
                    "Storage",
                    s.storage_gb
                      ? `${s.storage_gb} GB ${s.storage_type ?? ""}`
                      : null,
                  ],
                  ["OS", s.os],
                  ["Purchase Date", s.purchase_date],
                  ["Warranty", s.warranty_until],
                ]
                  .filter(([, v]) => v)
                  .map(([l, v]) => (
                    <div key={l as string}>
                      <span className="text-muted-foreground">{l}: </span>
                      <span className="font-medium">{v}</span>
                    </div>
                  ))}
              </>
            ) : (
              <>
                {[
                  ["Location", s.location],
                  ["Plan Type", s.plan_type],
                  [
                    "Speed",
                    s.subscribed_speed_mbps
                      ? `${s.subscribed_speed_mbps} Mbps`
                      : null,
                  ],
                  [
                    "Monthly Cost",
                    s.monthly_cost
                      ? `₱${Number(s.monthly_cost).toLocaleString()}`
                      : null,
                  ],
                  [
                    "Contract",
                    s.contract_start
                      ? `${s.contract_start} → ${s.contract_end ?? "Open"}`
                      : null,
                  ],
                  ["Account No", s.account_no],
                  ["Contact", s.contact_person],
                ]
                  .filter(([, v]) => v)
                  .map(([l, v]) => (
                    <div key={l as string}>
                      <span className="text-muted-foreground">{l}: </span>
                      <span className="font-medium">{v}</span>
                    </div>
                  ))}
              </>
            )}
            {s.notes && (
              <div className="col-span-2 md:col-span-3">
                <span className="text-muted-foreground">Notes: </span>
                <span className="font-medium">{s.notes}</span>
              </div>
            )}
          </div>
          {s.admin_note && (
            <div className="border border-border/50 bg-muted/10 px-3 py-2 text-xs">
              <span className="text-muted-foreground mono text-[10px]">
                ADMIN NOTE:{" "}
              </span>
              <span>{s.admin_note}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ICTSubmissionPage() {
  const [submissions, setSubmissions] = useState<ICTInventorySubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<"device" | "internet">("device");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setSubmissions(await getMySubmissions());
    } catch (e: any) {
      toast.error(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleSubmit = async (data: Record<string, unknown>) => {
    try {
      await createInventorySubmission(
        data as Parameters<typeof createInventorySubmission>[0],
      );
      toast.success("Submission sent for admin review");
      setShowForm(false);
      reload();
    } catch (e: any) {
      toast.error(e.message);
      throw e;
    }
  };

  const pending = submissions.filter((s) => s.status === "pending");
  const approved = submissions.filter((s) => s.status === "approved");
  const rejected = submissions.filter((s) => s.status === "rejected");

  return (
    <MainLayout>
      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="laser-line mb-2 w-24" />
            <h1 className="text-xl font-bold text-foreground">
              Submit Inventory Info
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Submit device or internet connection details for admin review and
              approval.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={reload}
              className="border border-border text-xs"
            >
              <RefreshCw className="w-3 h-3 mr-1" /> Refresh
            </Button>
            {!showForm && (
              <Button
                size="sm"
                onClick={() => setShowForm(true)}
                className="text-xs"
              >
                <Plus className="w-3 h-3 mr-1" /> New Submission
              </Button>
            )}
          </div>
        </div>

        {/* New submission form */}
        {showForm && (
          <div className="border border-border bg-card p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="mono text-[10px] text-muted-foreground tracking-widest">
                SUBMISSION TYPE
              </div>
              <div className="flex border border-border">
                {(["device", "internet"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setFormType(t)}
                    className={`px-4 py-1.5 mono text-xs transition-colors ${formType === t ? "bg-primary text-primary-foreground" : "hover:bg-muted/30 text-muted-foreground"}`}
                  >
                    {t === "device" ? (
                      <span className="flex items-center gap-1">
                        <Monitor className="w-3 h-3" /> Device
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <Wifi className="w-3 h-3" /> Internet
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {formType === "device" ? (
              <DeviceForm
                onSubmit={handleSubmit}
                onCancel={() => setShowForm(false)}
              />
            ) : (
              <InternetForm
                onSubmit={handleSubmit}
                onCancel={() => setShowForm(false)}
              />
            )}
          </div>
        )}

        {/* My submissions */}
        {loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground animate-pulse">
            Loading submissions...
          </div>
        ) : submissions.length === 0 && !showForm ? (
          <div className="border border-border bg-card py-14 text-center space-y-2">
            <ClipboardList className="w-8 h-8 mx-auto text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No submissions yet.</p>
            <Button
              size="sm"
              onClick={() => setShowForm(true)}
              className="text-xs mt-1"
            >
              <Plus className="w-3 h-3 mr-1" /> Make your first submission
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Summary badges */}
            <div className="flex flex-wrap gap-3">
              {[
                {
                  label: "Pending Review",
                  count: pending.length,
                  color: "border-yellow-500 text-yellow-600",
                },
                {
                  label: "Approved",
                  count: approved.length,
                  color: "border-green-500 text-green-600",
                },
                {
                  label: "Rejected",
                  count: rejected.length,
                  color: "border-red-500 text-red-600",
                },
              ].map(({ label, count, color }) => (
                <div
                  key={label}
                  className={`border ${color} px-3 py-1.5 flex items-center gap-2`}
                >
                  <span className="mono text-[10px] tracking-widest">
                    {label}
                  </span>
                  <span className="text-lg font-bold">{count}</span>
                </div>
              ))}
            </div>

            {/* All submissions, grouped */}
            {[
              { label: "PENDING REVIEW", items: pending },
              { label: "APPROVED", items: approved },
              { label: "REJECTED", items: rejected },
            ]
              .filter((g) => g.items.length > 0)
              .map((group) => (
                <div key={group.label} className="space-y-2">
                  <div className="mono text-[10px] text-muted-foreground tracking-widest">
                    {group.label} ({group.items.length})
                  </div>
                  {group.items.map((s) => (
                    <SubmissionRow key={s.id} s={s} />
                  ))}
                </div>
              ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}

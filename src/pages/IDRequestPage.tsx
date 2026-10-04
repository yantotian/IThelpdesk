import { useRef, useState, useCallback, useEffect } from "react";
import type { ImgHTMLAttributes } from "react";
import MainLayout from "@/components/layouts/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Upload,
  Camera,
  RotateCcw,
  CheckCircle,
  X,
  Clock,
  XCircle,
  CreditCard,
  FileText,
} from "lucide-react";
import {
  submitIDRequest,
  getMyIDRequests,
  getSignedStorageUrl,
} from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import type { IDRequest } from "@/types/types";
import { formatUtc8Date } from "@/lib/utils";

interface EmergencyContact {
  name: string;
  contact: string;
  address: string;
}
interface IDForm {
  office_name: string;
  full_name: string;
  nickname: string;
  id_number: string;
  position: string;
  address: string;
  emergency: EmergencyContact;
}
const EMPTY_FORM: IDForm = {
  office_name: "",
  full_name: "",
  nickname: "",
  id_number: "",
  position: "",
  address: "",
  emergency: { name: "", contact: "", address: "" },
};

const MAX_MEDIA_BYTES = 2 * 1024 * 1024;

const STATUS_STYLES: Record<string, string> = {
  pending: "border-yellow-500 text-yellow-600",
  approved: "border-green-500 text-green-600",
  rejected: "border-red-500 text-red-600",
};
const STATUS_ICONS: Record<string, React.ReactNode> = {
  pending: <Clock className="w-3 h-3" />,
  approved: <CheckCircle className="w-3 h-3" />,
  rejected: <XCircle className="w-3 h-3" />,
};
function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 mono text-[10px] border px-1.5 py-0.5 ${STATUS_STYLES[status] ?? "border-border text-muted-foreground"}`}
    >
      {STATUS_ICONS[status]} {status.toUpperCase()}
    </span>
  );
}

// Signature Pad
function SignaturePad({ onCapture }: { onCapture: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const [hasStroke, setHasStroke] = useState(false);
  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width,
      scaleY = canvas.height / rect.height;
    if ("touches" in e)
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };
  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    drawing.current = true;
    lastPos.current = getPos(e);
  };
  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!drawing.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d")!;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.strokeStyle = "#1a1008";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (lastPos.current) {
      ctx.moveTo(lastPos.current.x, lastPos.current.y);
      ctx.lineTo(pos.x, pos.y);
    }
    ctx.stroke();
    lastPos.current = pos;
    setHasStroke(true);
  };
  const endDraw = () => {
    drawing.current = false;
    lastPos.current = null;
  };
  const clear = () => {
    canvasRef.current?.getContext("2d")!.clearRect(0, 0, 600, 160);
    setHasStroke(false);
  };
  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        width={600}
        height={160}
        className="w-full border border-border bg-white touch-none cursor-crosshair"
        style={{ height: "140px" }}
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={endDraw}
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={clear}
          className="border border-border text-xs"
        >
          <RotateCcw className="w-3 h-3 mr-1" /> Clear
        </Button>
        <Button
          size="sm"
          onClick={() => {
            if (!hasStroke) {
              toast.error("Draw your signature first");
              return;
            }
            onCapture(canvasRef.current!.toDataURL("image/png"));
            toast.success("Signature saved");
          }}
          disabled={!hasStroke}
          className="text-xs"
        >
          <CheckCircle className="w-3 h-3 mr-1" /> Use This Signature
        </Button>
      </div>
    </div>
  );
}

// Camera Capture
function CameraCapture({
  onCapture,
  onClose,
}: {
  onCapture: (dataUrl: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [started, setStarted] = useState(false);
  const [err, setErr] = useState("");
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setStarted(true);
    } catch {
      setErr("Camera permission denied or unavailable.");
    }
  }, []);
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStarted(false);
  }, []);
  const capture = () => {
    if (!videoRef.current) return;
    const c = document.createElement("canvas");
    c.width = videoRef.current.videoWidth;
    c.height = videoRef.current.videoHeight;
    c.getContext("2d")!.drawImage(videoRef.current, 0, 0);
    onCapture(c.toDataURL("image/png"));
    stopCamera();
    toast.success("Photo captured");
  };
  const handleClose = () => {
    stopCamera();
    onClose();
  };
  return (
    <div className="border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="mono text-xs text-muted-foreground tracking-widest">
          CAMERA CAPTURE
        </span>
        <Button
          size="icon"
          variant="ghost"
          onClick={handleClose}
          className="w-7 h-7"
        >
          <X className="w-3 h-3" />
        </Button>
      </div>
      {err ? (
        <p className="text-sm text-destructive">{err}</p>
      ) : (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="w-full border border-border bg-black"
          style={{ maxHeight: "240px" }}
        />
      )}
      <div className="flex gap-2">
        {!started ? (
          <Button size="sm" onClick={startCamera} className="text-xs">
            <Camera className="w-3 h-3 mr-1" /> Start Camera
          </Button>
        ) : (
          <Button size="sm" onClick={capture} className="text-xs">
            <Camera className="w-3 h-3 mr-1" /> Capture
          </Button>
        )}
      </div>
    </div>
  );
}

// Media Section
function MediaSection({
  label,
  required,
  preview,
  mode,
  setMode,
  onFileUpload,
  onCameraCapture,
  onRemove,
  accept = "image/*",
  fileInputRef,
  showDraw = false,
  onDraw,
}: {
  label: string;
  required?: boolean;
  preview: string | null;
  mode: "none" | "upload" | "camera" | "draw";
  setMode: (m: "none" | "upload" | "camera" | "draw") => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onCameraCapture: (url: string) => void;
  onRemove: () => void;
  accept?: string;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  showDraw?: boolean;
  onDraw?: (url: string) => void;
}) {
  return (
    <div className="space-y-3">
      <Label className="text-xs font-semibold">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      {preview && (
        <div className="flex items-start gap-3">
          <div className="border border-border bg-white p-1 inline-block">
            <img
              src={preview}
              alt={label}
              className="h-20 max-w-xs object-contain"
            />
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={onRemove}
            className="border border-border text-xs text-muted-foreground"
          >
            <X className="w-3 h-3 mr-1" /> Remove
          </Button>
        </div>
      )}
      {!preview && mode === "none" && (
        <div className="flex flex-wrap gap-2">
          {showDraw && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setMode("draw")}
              className="border border-border text-xs"
            >
              <CheckCircle className="w-3 h-3 mr-1" /> Draw
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => fileInputRef.current?.click()}
            className="border border-border text-xs"
          >
            <Upload className="w-3 h-3 mr-1" /> Upload Image
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setMode("camera")}
            className="border border-border text-xs"
          >
            <Camera className="w-3 h-3 mr-1" /> Use Camera
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            className="hidden"
            onChange={onFileUpload}
          />
        </div>
      )}
      {!preview && mode === "draw" && onDraw && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Draw your signature below:
          </p>
          <SignaturePad
            onCapture={(url) => {
              onDraw(url);
              setMode("none");
            }}
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setMode("none")}
            className="border border-border text-xs text-muted-foreground"
          >
            Cancel
          </Button>
        </div>
      )}
      {!preview && mode === "camera" && (
        <CameraCapture
          onCapture={(url) => {
            onCameraCapture(url);
            setMode("none");
          }}
          onClose={() => setMode("none")}
        />
      )}
    </div>
  );
}

function SignedImg({
  bucket,
  ref,
  ...props
}: { bucket: string; ref: string } & ImgHTMLAttributes<HTMLImageElement>) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    if (!ref) return;
    let cancelled = false;
    getSignedStorageUrl(bucket, ref)
      .then((u) => {
        if (!cancelled) setSrc(u);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [bucket, ref]);
  return src ? <img src={src} {...props} /> : null;
}

// My Requests Tab
function MyRequestsTab() {
  const [requests, setRequests] = useState<IDRequest[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    getMyIDRequests()
      .then(setRequests)
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);
  if (loading)
    return (
      <div className="py-12 text-center text-sm text-muted-foreground animate-pulse">
        Loading your requests...
      </div>
    );
  if (requests.length === 0)
    return (
      <div className="border border-border bg-card py-14 text-center space-y-2">
        <FileText className="w-8 h-8 text-muted-foreground mx-auto" />
        <p className="text-sm text-muted-foreground">
          No ID requests submitted yet.
        </p>
      </div>
    );
  return (
    <div className="space-y-4">
      {requests.map((r) => (
        <div key={r.id} className="border border-border bg-card">
          <div className="flex items-start justify-between px-5 py-3 border-b border-border flex-wrap gap-2">
            <div className="space-y-0.5">
              <div className="font-semibold text-sm text-foreground">
                {r.full_name}
              </div>
              <div className="mono text-[10px] text-muted-foreground tracking-widest">
                {r.id_number} · {r.position}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={r.status} />
              <span
                className={`inline-flex items-center gap-1 mono text-[10px] border px-1.5 py-0.5 ${r.is_paid ? "border-green-500 text-green-600" : "border-yellow-500 text-yellow-600"}`}
              >
                <CreditCard className="w-3 h-3" />{" "}
                {r.is_paid ? "PAID" : "PAYMENT PENDING"}
              </span>
            </div>
          </div>
          <div className="px-5 py-4 space-y-3 text-sm">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2">
              {(
                [
                  ["Office", r.office_name],
                  ["Address", r.address],
                  ["Submitted", formatUtc8Date(r.created_at)],
                ] as [string, string][]
              ).map(([l, v]) => (
                <div key={l}>
                  <span className="text-xs text-muted-foreground block">
                    {l}
                  </span>
                  <span className="font-medium">{v}</span>
                </div>
              ))}
            </div>
            {!r.is_paid && r.status !== "rejected" && (
              <div className="flex items-start gap-2 border border-yellow-300 bg-yellow-50 px-3 py-2 text-xs text-yellow-700">
                <CreditCard className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  Your ID will be processed after payment has been confirmed by
                  the administrator.
                </span>
              </div>
            )}
            {r.notes && (
              <div className="border border-border bg-muted/30 px-3 py-2">
                <span className="mono text-[10px] text-muted-foreground tracking-widest block mb-1">
                  ADMIN NOTE
                </span>
                <p className="text-xs text-foreground">{r.notes}</p>
              </div>
            )}
            {(r.photo_url || r.signature_url) && (
              <div className="flex gap-4">
                {r.photo_url && (
                  <div>
                    <span className="mono text-[10px] text-muted-foreground tracking-widest block mb-1">
                      ID PHOTO (max 2MB)
                    </span>
                    <SignedImg
                      bucket="id-photos"
                      ref={r.photo_url}
                      alt="ID Photo"
                      className="h-20 border border-border object-contain bg-muted"
                    />
                  </div>
                )}
                {r.signature_url && (
                  <div>
                    <span className="mono text-[10px] text-muted-foreground tracking-widest block mb-1">
                      SIGNATURE (max 2MB)
                    </span>
                    <SignedImg
                      bucket="id-signatures"
                      ref={r.signature_url}
                      alt="Signature"
                      className="h-12 border border-border bg-white p-1 object-contain"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// Main Page
export default function IDRequestPage() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<"new" | "mine">("new");
  const [form, setForm] = useState<IDForm>(EMPTY_FORM);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoMode, setPhotoMode] = useState<
    "none" | "upload" | "camera" | "draw"
  >("none");
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [sigMode, setSigMode] = useState<"none" | "upload" | "camera" | "draw">(
    "none",
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const photoFileRef = useRef<HTMLInputElement>(null);
  const sigFileRef = useRef<HTMLInputElement>(null);

  const setField = (f: keyof Omit<IDForm, "emergency">, v: string) =>
    setForm((p) => ({ ...p, [f]: v }));
  const setEmergency = (f: keyof EmergencyContact, v: string) =>
    setForm((p) => ({ ...p, emergency: { ...p.emergency, [f]: v } }));

  const handlePhotoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }
    if (file.size > MAX_MEDIA_BYTES) {
      toast.error("ID photo exceeds 2MB limit");
      return;
    }
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoDataUrl(ev.target?.result as string);
    reader.readAsDataURL(file);
    setPhotoMode("none");
  };
  const handlePhotoCam = (url: string) => {
    setPhotoDataUrl(url);
    fetch(url)
      .then((r) => r.blob())
      .then((blob) => {
        if (blob.size > MAX_MEDIA_BYTES) {
          setPhotoDataUrl(null);
          toast.error("Captured photo exceeds 2MB limit");
          return;
        }
        setPhotoFile(new File([blob], "photo.png", { type: "image/png" }));
      });
  };
  const handleSigFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }
    if (file.size > MAX_MEDIA_BYTES) {
      toast.error("Signature exceeds 2MB limit");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => setSignatureDataUrl(ev.target?.result as string);
    reader.readAsDataURL(file);
    setSigMode("none");
  };

  const handleSubmit = async () => {
    const required: [string, string][] = [
      [form.office_name, "Office Name"],
      [form.full_name, "Employee's Complete Name"],
      [form.id_number, "ID Number"],
      [form.position, "Company Position"],
      [form.address, "Address"],
      [form.emergency.name, "Emergency Contact Name"],
      [form.emergency.contact, "Emergency Contact Number"],
      [form.emergency.address, "Emergency Contact Address"],
    ];
    for (const [val, label] of required) {
      if (!val.trim()) {
        toast.error(`${label} is required`);
        return;
      }
    }
    if (!signatureDataUrl) {
      toast.error("Signature is required");
      return;
    }
    if (!profile?.id) {
      toast.error("Not authenticated");
      return;
    }
    setSubmitting(true);
    try {
      await submitIDRequest({
        office_name: form.office_name,
        full_name: form.full_name,
        nickname: form.nickname,
        id_number: form.id_number,
        position: form.position,
        address: form.address,
        emergency_name: form.emergency.name,
        emergency_contact: form.emergency.contact,
        emergency_address: form.emergency.address,
        photoFile,
        signatureDataUrl,
        userId: profile.id,
      });
      setSubmitted(true);
      toast.success("ID Request submitted successfully");
    } catch (e: any) {
      toast.error(e.message);
    }
    setSubmitting(false);
  };

  const handleReset = () => {
    setForm(EMPTY_FORM);
    setPhotoDataUrl(null);
    setPhotoFile(null);
    setPhotoMode("none");
    setSignatureDataUrl(null);
    setSigMode("none");
    setSubmitted(false);
  };

  return (
    <MainLayout>
      <div className="p-6 max-w-3xl mx-auto space-y-5">
        <div>
          <div className="laser-line mb-2 w-24" />
          <h1 className="text-xl font-bold text-foreground">
            Company ID Request
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Request your official company ID or track existing submissions.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border gap-0">
          {(
            [
              ["new", "New Request"],
              ["mine", "My Requests"],
            ] as [typeof activeTab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => {
                setActiveTab(key);
                if (key === "new" && submitted) handleReset();
              }}
              className={`px-5 py-2.5 mono text-xs tracking-widest border-b-2 transition-colors ${activeTab === key ? "border-primary text-primary font-semibold" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {label.toUpperCase()}
            </button>
          ))}
        </div>

        {activeTab === "mine" && <MyRequestsTab />}

        {activeTab === "new" && (
          <>
            {submitted ? (
              <div className="space-y-6 text-center">
                <CheckCircle className="w-12 h-12 text-primary mx-auto" />
                <h2 className="text-lg font-bold">ID Request Submitted</h2>
                <p className="text-sm text-muted-foreground">
                  Your request is pending review by an administrator.
                </p>
                <div className="border border-yellow-300 bg-yellow-50 px-4 py-3 text-xs text-yellow-700 text-left flex gap-2">
                  <CreditCard className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Your ID will be processed after payment has been confirmed
                    by the administrator. Please coordinate with your HR or
                    admin team regarding payment.
                  </span>
                </div>
                <div className="border border-border bg-card p-5 text-left space-y-2 text-sm">
                  <div className="mono text-[10px] text-muted-foreground tracking-widest mb-3">
                    SUBMITTED DETAILS
                  </div>
                  {(
                    [
                      ["Office", form.office_name],
                      ["Name", form.full_name],
                      ["Nickname", form.nickname || "—"],
                      ["ID Number", form.id_number],
                      ["Position", form.position],
                      ["Address", form.address],
                      ["Emergency Contact", form.emergency.name],
                      ["Emergency Phone", form.emergency.contact],
                      ["Emergency Address", form.emergency.address],
                    ] as [string, string][]
                  ).map(([l, v]) => (
                    <div key={l} className="flex gap-3">
                      <span className="text-muted-foreground w-36 shrink-0">
                        {l}
                      </span>
                      <span className="font-medium">{v}</span>
                    </div>
                  ))}
                  {photoDataUrl && (
                    <div className="pt-2">
                      <span className="text-xs text-muted-foreground">
                        ID Photo
                      </span>
                      <img
                        src={photoDataUrl}
                        alt="ID Photo"
                        className="mt-2 h-20 border border-border object-contain"
                      />
                    </div>
                  )}
                  {signatureDataUrl && (
                    <div className="pt-2">
                      <span className="text-xs text-muted-foreground">
                        Signature
                      </span>
                      <img
                        src={signatureDataUrl}
                        alt="Signature"
                        className="mt-2 h-12 border border-border bg-white p-1 object-contain"
                      />
                    </div>
                  )}
                </div>
                <div className="flex gap-3 justify-center">
                  <Button
                    onClick={handleReset}
                    variant="ghost"
                    className="border border-border text-sm"
                  >
                    Submit Another
                  </Button>
                  <Button
                    onClick={() => setActiveTab("mine")}
                    className="text-sm"
                  >
                    View My Requests
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <section className="border border-border bg-card">
                  <div className="px-5 py-3 border-b border-border">
                    <span className="mono text-[10px] text-muted-foreground tracking-widest">
                      EMPLOYEE INFORMATION
                    </span>
                  </div>
                  <div className="p-5 grid md:grid-cols-2 gap-4">
                    {[
                      [
                        "office_name",
                        "Office Name",
                        true,
                        "e.g. City Mayor's Offce",
                      ],
                      [
                        "full_name",
                        "Employee's Complete Name",
                        true,
                        "First Name M.I. Last Name",
                      ],
                      ["nickname", "Nickname", false, "Preferred name on ID"],
                      ["id_number", "ID Number", true, "e.g. 2024-0001"],
                      [
                        "position",
                        "Company Position",
                        true,
                        "e.g. Admin Aide I",
                      ],
                    ].map(([field, label, req, ph]) => (
                      <div key={field as string} className="space-y-1.5">
                        <Label className="text-xs font-semibold">
                          {label as string}
                          {req && (
                            <span className="text-destructive ml-1">*</span>
                          )}
                        </Label>
                        <Input
                          value={form[field as keyof Omit<IDForm, "emergency">]}
                          onChange={(e) =>
                            setField(
                              field as keyof Omit<IDForm, "emergency">,
                              e.target.value,
                            )
                          }
                          placeholder={ph as string}
                          className="h-9 text-sm"
                        />
                      </div>
                    ))}
                    <div className="space-y-1.5 md:col-span-2">
                      <Label className="text-xs font-semibold">
                        Address <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        value={form.address}
                        onChange={(e) => setField("address", e.target.value)}
                        placeholder="Complete home / mailing address"
                        className="h-9 text-sm"
                      />
                    </div>
                  </div>
                </section>

                <section className="border border-border bg-card">
                  <div className="px-5 py-3 border-b border-border">
                    <span className="mono text-[10px] text-muted-foreground tracking-widest">
                      IN CASE OF EMERGENCY
                    </span>
                  </div>
                  <div className="p-5 grid md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">
                        Name of Person{" "}
                        <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        value={form.emergency.name}
                        onChange={(e) => setEmergency("name", e.target.value)}
                        placeholder="Full name"
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">
                        Contact Number{" "}
                        <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        value={form.emergency.contact}
                        onChange={(e) =>
                          setEmergency("contact", e.target.value)
                        }
                        placeholder="+63 917 123 4567"
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                      <Label className="text-xs font-semibold">
                        Address <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        value={form.emergency.address}
                        onChange={(e) =>
                          setEmergency("address", e.target.value)
                        }
                        placeholder="Emergency contact's address"
                        className="h-9 text-sm"
                      />
                    </div>
                  </div>
                </section>

                <section className="border border-border bg-card">
                  <div className="px-5 py-3 border-b border-border">
                    <span className="mono text-[10px] text-muted-foreground tracking-widest">
                      ID PHOTO
                    </span>
                  </div>
                  <div className="p-5 space-y-3">
                    <p className="text-xs text-muted-foreground">
                      ID photo must not exceed 2MB.
                    </p>
                    <MediaSection
                      label="Upload or Capture Photo"
                      preview={photoDataUrl}
                      mode={photoMode}
                      setMode={setPhotoMode}
                      onFileUpload={handlePhotoFile}
                      onCameraCapture={handlePhotoCam}
                      onRemove={() => {
                        setPhotoDataUrl(null);
                        setPhotoFile(null);
                      }}
                      fileInputRef={photoFileRef}
                    />
                  </div>
                </section>

                <section className="border border-border bg-card">
                  <div className="px-5 py-3 border-b border-border">
                    <span className="mono text-[10px] text-muted-foreground tracking-widest">
                      SIGNATURE <span className="text-destructive ml-1">*</span>
                    </span>
                  </div>
                  <div className="p-5 space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Signature must not exceed 2MB.
                    </p>
                    <MediaSection
                      label="Draw, upload, or capture your signature"
                      required
                      preview={signatureDataUrl}
                      mode={sigMode}
                      setMode={setSigMode}
                      onFileUpload={handleSigFile}
                      onCameraCapture={(url) => setSignatureDataUrl(url)}
                      onRemove={() => setSignatureDataUrl(null)}
                      fileInputRef={sigFileRef}
                      showDraw
                      onDraw={(url) => setSignatureDataUrl(url)}
                    />
                  </div>
                </section>

                <div className="flex justify-end gap-3 pb-8">
                  <Button
                    variant="outline"
                    onClick={handleReset}
                    className="text-sm"
                  >
                    Clear Form
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="text-sm px-6"
                  >
                    {submitting ? "Submitting..." : "Submit ID Request"}
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </MainLayout>
  );
}

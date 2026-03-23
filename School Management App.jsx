import { useState, useMemo, useRef, useCallback, memo, useReducer, createContext, useContext, useEffect } from "react";
import {
  GraduationCap, Database, FileText, Printer, PlusCircle,
  Check, X, Settings, Save, LogOut, LayoutDashboard,
  Trash2, Search, PenTool, Upload, RotateCcw,
  AlertTriangle, Clock, ShieldAlert, Users, UserPlus,
  UserX, UserCheck, Eye, EyeOff, KeyRound, Shield,
  Menu, BookOpen, MoreVertical, ChevronRight, ChevronLeft,
  CalendarDays, ClipboardList, BookMarked, Edit2, ArrowLeft
} from "lucide-react";

// ─── Static Data ──────────────────────────────────────────────────────────────
const CURRICULUM: Record<string, { classes: string[]; subjects: string[] }> = {
  "Early Years":      { classes:["Creche","Pre-Nursery","Nursery 1","Nursery 2"], subjects:["Numeracy","Literacy","Health Habits","Social Norms","Basic Science","CRS","IRS","Rhymes & Poem","Phonics","Creative Arts","Physical Development"] },
  "Lower Primary":    { classes:["Primary 1","Primary 2","Primary 3"],           subjects:["Mathematics","English Studies","Basic Science & Tech","Social Studies","Civic Education","Agricultural Science","Home Economics","CRS","IRS","PHE","Computer Studies","Cultural & Creative Arts","Verbal Reasoning","Quantitative Reasoning","Yoruba/Igbo/Hausa"] },
  "Upper Primary":    { classes:["Primary 4","Primary 5","Primary 6"],           subjects:["Mathematics","English Studies","Basic Science","ICT","Social Studies","Civic Education","Agricultural Science","Home Economics","CRS","IRS","PHE","Cultural & Creative Arts","Verbal Reasoning","Quantitative Reasoning","French","Yoruba/Igbo/Hausa"] },
  "Junior Secondary": { classes:["JSS 1","JSS 2","JSS 3"],                       subjects:["Mathematics","English Language","Basic Science","Basic Technology","Social Studies","Civic Education","Agricultural Science","Home Economics","Business Studies","CRS","IRS","PHE","Computer Studies","Cultural & Creative Arts","French","Nigerian Language"] },
  "Senior Secondary": { classes:["SS 1","SS 2","SS 3"],                          subjects:["Mathematics","English Language","Civic Education","Biology","Economics","Physics","Chemistry","Further Mathematics","Agricultural Science","Geography","Government","Literature-in-English","CRS","IRS","Financial Accounting","Commerce","Data Processing","Marketing","Technical Drawing"] },
};
const ALL_CLASSES: string[] = Object.values(CURRICULUM).flatMap(c => c.classes);
const TERMS = ["First Term","Second Term","Third Term"];
const ROLES = ["Teacher","Class Teacher","Subject Teacher","Head of Dept","Vice Principal","Principal"];
const DEFAULT_PIN = "1234";
const PERMS_META = [
  { key:"scoreEntry",    label:"Score Entry",    desc:"Enter CA & exam scores" },
  { key:"viewReports",   label:"View Reports",   desc:"Access student reports" },
  { key:"printReports",  label:"Print Reports",  desc:"Print or export reports" },
  { key:"manageRecords", label:"Manage Records", desc:"Delete or edit grades" },
];
const ATT_STATUSES = [
  { key:"present", label:"Present", icon:"✓", color:"emerald" },
  { key:"absent",  label:"Absent",  icon:"✗", color:"red" },
  { key:"late",    label:"Late",    icon:"⏱", color:"amber" },
  { key:"excused", label:"Excused", icon:"📋", color:"indigo" },
];

// ─── Types ────────────────────────────────────────────────────────────────────
interface RollStudent {
  id: string;
  name: string;
  admNo: string;
  suggested?: boolean;
}
interface Entry {
  id: string;
  studentName: string;
  studentClass: string;
  subject: string;
  caScore: number;
  examScore: number;
  total: number;
  createdAt: string;
  restoredAt?: string;
}
interface BinEntry extends Entry {
  deletedAt: string;
}
interface StaffMember {
  id: string;
  name: string;
  role: string;
  pin: string;
  status: "active" | "restricted" | "revoked";
  assignedClasses: string[];
  permissions: Record<string, boolean>;
  createdAt: string;
  updatedAt: string;
}
interface AttendanceRecord {
  id: string;
  studentName: string;
  studentClass: string;
  date: string;
  status: string;
  note: string;
  createdAt: string;
}
interface SchoolSettings {
  name: string;
  motto: string;
  session: string;
  term: string;
  resumptionDate: string;
}
interface AppState {
  entries: Entry[];
  bin: BinEntry[];
  logs: any[];
  comments: Record<string, Record<string, string>>;
  attendance: AttendanceRecord[];
  classRolls: Record<string, RollStudent[]>;
  staffList: StaffMember[];
  schoolSettings: SchoolSettings;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
const today = () => new Date().toISOString().slice(0, 10);

// ─── Persistent Database (localStorage) ──────────────────────────────────────
const DB_KEY = "greatmind_school_db_v2";

function loadDB(): Partial<AppState> {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<AppState>;
  } catch { return {}; }
}

function saveDB(state: AppState) {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(state));
  } catch { /* storage full or unavailable */ }
}

// Debounced save — avoids hammering storage on every keystroke
let _saveTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedSaveDB(state: AppState) {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => saveDB(state), 400);
}

const getGrade = (s: number) => {
  if (s >= 75) return { grade:"A1", remark:"Excellent",  color:"#059669", bg:"#d1fae5" };
  if (s >= 70) return { grade:"B2", remark:"Very Good",  color:"#10b981", bg:"#d1fae5" };
  if (s >= 65) return { grade:"B3", remark:"Good",       color:"#2563eb", bg:"#dbeafe" };
  if (s >= 60) return { grade:"C4", remark:"Credit",     color:"#3b82f6", bg:"#dbeafe" };
  if (s >= 55) return { grade:"C5", remark:"Credit",     color:"#6366f1", bg:"#e0e7ff" };
  if (s >= 50) return { grade:"C6", remark:"Credit",     color:"#8b5cf6", bg:"#ede9fe" };
  if (s >= 45) return { grade:"D7", remark:"Pass",       color:"#d97706", bg:"#fef3c7" };
  if (s >= 40) return { grade:"E8", remark:"Pass",       color:"#f59e0b", bg:"#fef3c7" };
  return           { grade:"F9", remark:"Fail",       color:"#dc2626", bg:"#fee2e2" };
};

const getOrdinal = (n: number) => {
  const s = ["th","st","nd","rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const fmtTs = (iso: string) => {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" }),
    time: d.toLocaleTimeString("en-GB", { hour:"2-digit", minute:"2-digit" }),
  };
};

const fmtDate = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { weekday:"short", day:"2-digit", month:"short", year:"numeric" });

// ─── State / Reducer ──────────────────────────────────────────────────────────
const _saved = loadDB();
const initialState: AppState = {
  entries:        _saved.entries        ?? [],
  bin:            _saved.bin            ?? [],
  logs:           _saved.logs           ?? [],
  comments:       _saved.comments       ?? {},
  attendance:     _saved.attendance     ?? [],
  classRolls:     _saved.classRolls     ?? {},
  staffList:      _saved.staffList      ?? [
    { id:"s1", name:"Mrs. Amaka Obi",  role:"Class Teacher",   pin:"5678", status:"active", assignedClasses:["Primary 3","Primary 4"], permissions:{scoreEntry:true,viewReports:true,printReports:true,manageRecords:false},  createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() },
    { id:"s2", name:"Mr. Chidi Eze",   role:"Subject Teacher", pin:"9012", status:"active", assignedClasses:["JSS 1","JSS 2","JSS 3"],  permissions:{scoreEntry:true,viewReports:true,printReports:false,manageRecords:false}, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() },
  ],
  schoolSettings: _saved.schoolSettings ?? { name:"Greatmind Academy", motto:"Excellence in every child", session:"2024/2025", term:"First Term", resumptionDate:"January 8th, 2025" },
};

function mkLog(action: string, student: string, subject: string, detail = "") {
  return { id:uid(), action, student, subject, detail, ts:new Date().toISOString() };
}

function appReducer(state: AppState, action: any): AppState {
  switch (action.type) {
    case "ADD_ENTRY":
      return {
        ...state,
        entries: [...state.entries, action.payload],
        logs: [mkLog("Added", action.payload.studentName, action.payload.subject, `Total: ${action.payload.total}`), ...state.logs].slice(0, 100),
      };
    case "DELETE_ENTRY": {
      const e = state.entries.find(x => x.id === action.id);
      if (!e) return state;
      return {
        ...state,
        entries: state.entries.filter(x => x.id !== action.id),
        bin: [{ ...e, deletedAt: new Date().toISOString() }, ...state.bin],
        logs: [mkLog("Deleted", e.studentName, e.subject, `Score: ${e.total}`), ...state.logs].slice(0, 100),
      };
    }
    case "RESTORE_ENTRY": {
      const e = state.bin.find(x => x.id === action.id);
      if (!e) return state;
      const { deletedAt, ...r } = e;
      return {
        ...state,
        bin: state.bin.filter(x => x.id !== action.id),
        entries: [...state.entries, { ...r, restoredAt: new Date().toISOString() }],
        logs: [mkLog("Restored", e.studentName, e.subject), ...state.logs].slice(0, 100),
      };
    }
    case "SAVE_STAFF": {
      const exists = state.staffList.find(s => s.id === action.payload.id);
      return {
        ...state,
        staffList: exists
          ? state.staffList.map(s => s.id === action.payload.id ? action.payload : s)
          : [...state.staffList, action.payload],
        logs: [mkLog(exists ? "Updated" : "Staff Added", action.payload.name, action.payload.role), ...state.logs].slice(0, 100),
      };
    }
    case "SET_STAFF_STATUS": {
      const s = state.staffList.find(x => x.id === action.id);
      if (!s) return state;
      return {
        ...state,
        staffList: state.staffList.map(x => x.id === action.id ? { ...x, status: action.status, updatedAt: new Date().toISOString() } : x),
        logs: [mkLog(action.status === "revoked" ? "Revoked" : "Restored", s.name, s.role), ...state.logs].slice(0, 100),
      };
    }
    case "SAVE_ATTENDANCE": {
      const idx = state.attendance.findIndex(a => a.id === action.payload.id);
      return {
        ...state,
        attendance: idx >= 0
          ? state.attendance.map((a, i) => i === idx ? action.payload : a)
          : [...state.attendance, action.payload],
      };
    }
    case "BULK_SAVE_ATTENDANCE":
      return {
        ...state,
        attendance: [
          ...state.attendance.filter(a => !action.payload.find((p: AttendanceRecord) =>
            p.studentName === a.studentName && p.studentClass === a.studentClass && p.date === a.date
          )),
          ...action.payload,
        ],
      };
    case "DELETE_ATTENDANCE":
      return { ...state, attendance: state.attendance.filter(a => a.id !== action.id) };
    case "SAVE_CLASS_ROLL":
      // Strip 'suggested' flag when saving permanently
      return {
        ...state,
        classRolls: {
          ...state.classRolls,
          [action.className]: (action.students as RollStudent[]).map(({ suggested: _s, ...rest }) => rest),
        },
      };
    case "DELETE_ROLL_STUDENT": {
      const roll = state.classRolls[action.className] || [];
      return {
        ...state,
        classRolls: {
          ...state.classRolls,
          [action.className]: roll.filter(s => s.id !== action.studentId),
        },
      };
    }
    case "SET_COMMENT":
      return {
        ...state,
        comments: {
          ...state.comments,
          [action.studentId]: {
            ...(state.comments[action.studentId] || {}),
            [action.field]: action.value,
          },
        },
      };
    case "SET_SCHOOL_SETTINGS":
      return { ...state, schoolSettings: { ...state.schoolSettings, ...action.payload } };
    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────
interface AppCtxType {
  state: AppState;
  dispatch: React.Dispatch<any>;
  showToast: (msg: string, type?: string) => void;
}
const AppCtx = createContext<AppCtxType | null>(null);
const useApp = () => useContext(AppCtx)!;

function useToast() {
  const [toast, setToast] = useState<{ msg: string; type: string; id: string } | null>(null);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((msg: string, type = "success") => {
    if (t.current) clearTimeout(t.current);
    setToast({ msg, type, id: uid() });
    t.current = setTimeout(() => setToast(null), 3000);
  }, []);
  useEffect(() => () => { if (t.current) clearTimeout(t.current); }, []);
  return { toast, showToast: show };
}

// ─── Primitives ───────────────────────────────────────────────────────────────
const colorMap: Record<string, string> = {
  slate: "bg-slate-100 text-slate-600",
  blue:  "bg-blue-100 text-blue-700",
  green: "bg-emerald-100 text-emerald-700",
  amber: "bg-amber-100 text-amber-700",
  red:   "bg-red-100 text-red-700",
  indigo:"bg-indigo-100 text-indigo-700",
  emerald:"bg-emerald-100 text-emerald-700",
};

const Pill = ({ children, color = "slate" }: { children: React.ReactNode; color?: string }) => (
  <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-black uppercase ${colorMap[color] || colorMap.slate}`}>
    {children}
  </span>
);

const StatusPill = ({ status }: { status: string }) => {
  const m: Record<string, { l: string; c: string }> = {
    active:     { l:"Active",     c:"green" },
    restricted: { l:"Restricted", c:"amber" },
    revoked:    { l:"Revoked",    c:"red" },
  };
  const s = m[status] || m.active;
  return <Pill color={s.c}>{s.l}</Pill>;
};

const SchoolLogo = ({ logoUrl, size = "md", className = "" }: { logoUrl: string | null; size?: string; className?: string }) => {
  const sz: Record<string, string> = { lg:"w-16 h-16", sm:"w-8 h-8", xs:"w-6 h-6", md:"w-10 h-10" };
  const ic: Record<string, number> = { lg:32, sm:18, xs:14, md:22 };
  if (logoUrl) return (
    <img src={logoUrl} alt="Logo" className={`${sz[size] || sz.md} rounded-xl object-contain bg-white border border-slate-100 flex-shrink-0 ${className}`} />
  );
  return (
    <div className={`${sz[size] || sz.md} bg-blue-600 rounded-xl flex items-center justify-center text-white flex-shrink-0 ${className}`}>
      <GraduationCap size={ic[size] || 22} />
    </div>
  );
};

const Field = ({ label, error, children }: { label?: string; error?: string; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    {label && <label className="block text-xs font-black uppercase text-slate-400 tracking-wide">{label}</label>}
    {children}
    {error && <p className="text-red-500 text-xs font-bold flex items-center gap-1"><AlertTriangle size={11} />{error}</p>}
  </div>
);

const Inp = ({ label, error, className = "", ...p }: any) => (
  <Field label={label} error={error}>
    <input
      {...p}
      className={`w-full px-4 py-3 bg-slate-50 border-2 ${error ? "border-red-300" : "border-slate-100"} rounded-xl font-semibold text-sm text-slate-900 focus:border-blue-500 focus:bg-white outline-none transition-all placeholder:text-slate-300 ${className}`}
    />
  </Field>
);

const Sel = ({ label, children, className = "", ...p }: any) => (
  <Field label={label}>
    <select
      {...p}
      className={`w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-semibold text-sm text-slate-900 focus:border-blue-500 focus:bg-white outline-none transition-all ${className}`}
    >
      {children}
    </select>
  </Field>
);

// FIX: Destructure loading separately so it's not passed to DOM <button>
const Btn = ({ children, variant = "primary", size = "md", className = "", loading = false, ...p }: any) => {
  const base = "inline-flex items-center justify-center gap-2 font-black uppercase tracking-widest rounded-xl transition-all active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed";
  const sz: Record<string, string> = { sm:"text-xs px-3 py-2", md:"text-xs px-4 py-3", lg:"text-sm px-6 py-4" };
  const v: Record<string, string> = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 shadow-sm",
    danger:  "bg-red-600 text-white hover:bg-red-700",
    success: "bg-emerald-600 text-white hover:bg-emerald-700",
    ghost:   "bg-slate-100 text-slate-700 hover:bg-slate-200",
    outline: "bg-white border-2 border-slate-200 text-slate-600 hover:border-slate-300",
  };
  return (
    <button
      className={`${base} ${sz[size] || sz.md} ${v[variant] || v.primary} ${className}`}
      disabled={loading || p.disabled}
      {...p}
    >
      {loading
        ? <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
        : children}
    </button>
  );
};

const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-white rounded-2xl border border-slate-100 shadow-sm ${className}`}>{children}</div>
);

const EmptyState = ({ icon: Icon, title, subtitle, action }: { icon: any; title: string; subtitle?: string; action?: React.ReactNode }) => (
  <Card className="p-12 text-center">
    <Icon size={40} className="mx-auto text-slate-200 mb-3" />
    <p className="font-bold text-slate-400">{title}</p>
    {subtitle && <p className="text-xs text-slate-300 mt-1">{subtitle}</p>}
    {action && <div className="mt-4">{action}</div>}
  </Card>
);

const Modal = ({ children, maxW = "max-w-md", onBgClick }: { children: React.ReactNode; maxW?: string; onBgClick?: () => void }) => (
  <div
    className="fixed inset-0 z-[200] flex items-center justify-center p-4"
    style={{ background: "rgba(15,23,42,0.65)" }}
    onClick={e => { if (e.target === e.currentTarget) onBgClick?.(); }}
  >
    <div className={`bg-white rounded-2xl shadow-2xl w-full ${maxW} overflow-hidden max-h-[92vh] flex flex-col`}>
      {children}
    </div>
  </div>
);

const MHead = ({ icon: Icon, title, subtitle, color = "bg-blue-600", onClose }: any) => (
  <div className={`${color} px-6 py-5 flex items-center justify-between flex-shrink-0`}>
    <div className="flex items-center gap-3">
      {Icon && <div className="bg-white/20 p-2 rounded-xl"><Icon size={20} className="text-white" /></div>}
      <div>
        <p className="text-white font-black uppercase tracking-widest text-xs">{title}</p>
        {subtitle && <p className="text-white/60 text-xs mt-0.5 max-w-xs truncate">{subtitle}</p>}
      </div>
    </div>
    {onClose && (
      <button onClick={onClose} className="text-white/60 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors">
        <X size={18} />
      </button>
    )}
  </div>
);

// ─── Pin Auth ─────────────────────────────────────────────────────────────────
const PinAuth = ({ title, subtitle, headerColor = "bg-blue-600", icon: Icon, children, confirmLabel, confirmVariant = "danger", correctPin, onConfirm, onCancel }: any) => {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { ref.current?.focus(); }, []);

  const verify = useCallback(() => {
    if (pin === correctPin) {
      onConfirm();
    } else {
      setErr("Incorrect PIN — access denied.");
      setPin("");
      ref.current?.focus();
    }
  }, [pin, correctPin, onConfirm]);

  return (
    <Modal onBgClick={onCancel}>
      <MHead icon={Icon} title={title} subtitle={subtitle} color={headerColor} onClose={onCancel} />
      <div className="p-6 space-y-4 overflow-y-auto">
        {children}
        <Field label="Admin PIN" error={err}>
          <div className="relative">
            <input
              ref={ref}
              type={show ? "text" : "password"}
              value={pin}
              maxLength={8}
              placeholder="••••••"
              onChange={e => { setPin(e.target.value.replace(/\D/g, "")); setErr(""); }}
              onKeyDown={e => e.key === "Enter" && verify()}
              className={`w-full px-4 py-3 bg-slate-50 border-2 ${err ? "border-red-300" : "border-slate-100"} rounded-xl font-black text-center text-xl tracking-[0.5em] focus:border-blue-500 outline-none transition-all`}
            />
            <button type="button" onClick={() => setShow(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </Field>
        <p className="text-xs text-slate-400 text-center">Default PIN: <span className="font-black text-slate-600">1234</span></p>
      </div>
      <div className="px-6 pb-6 grid grid-cols-2 gap-3 flex-shrink-0">
        <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
        <Btn variant={confirmVariant} onClick={verify}>{confirmLabel}</Btn>
      </div>
    </Modal>
  );
};

// ─── Toast ────────────────────────────────────────────────────────────────────
const Toast = memo(({ toast }: { toast: { msg: string; type: string; id: string } }) => {
  const s: Record<string, string> = { success:"bg-slate-900 text-white", error:"bg-red-600 text-white", warning:"bg-amber-500 text-white" };
  const ic: Record<string, React.ReactNode> = { success:<Check size={12}/>, error:<X size={12}/>, warning:<AlertTriangle size={12}/> };
  const ib: Record<string, string> = { success:"bg-emerald-500", error:"bg-white/20", warning:"bg-white/20" };
  return (
    <div key={toast.id} className={`fixed bottom-24 md:bottom-6 right-4 md:right-6 z-[300] flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl text-xs font-black uppercase tracking-widest ${s[toast.type] || s.success}`}>
      <div className={`p-1.5 rounded-full ${ib[toast.type] || ib.success}`}>{ic[toast.type] || ic.success}</div>
      <span>{toast.msg}</span>
    </div>
  );
});

// ─── Staff Card ───────────────────────────────────────────────────────────────
const StaffCard = memo(({ s, onEdit, onRevoke, onRestore }: { s: StaffMember; onEdit: (s: StaffMember) => void; onRevoke: (s: StaffMember) => void; onRestore: (s: StaffMember) => void }) => {
  const { date } = fmtTs(s.updatedAt);
  const ab = s.status === "active" ? "bg-indigo-500" : s.status === "restricted" ? "bg-amber-500" : "bg-slate-400";
  const initials = s.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <Card className={`p-5 flex items-start gap-4 ${s.status === "revoked" ? "opacity-55" : ""}`}>
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${ab}`}>
        <span className="text-white font-black text-sm">{initials}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <p className="font-black text-slate-900 uppercase text-sm">{s.name}</p>
          <StatusPill status={s.status} />
        </div>
        <p className="text-xs text-slate-500 font-bold mb-2">{s.role}</p>
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {PERMS_META.filter(p => s.permissions[p.key]).map(p => (
            <Pill key={p.key} color="blue">{p.label.split(" ")[0]}</Pill>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {s.assignedClasses.slice(0, 5).map(c => <Pill key={c} color="slate">{c}</Pill>)}
          {s.assignedClasses.length > 5 && <Pill color="slate">+{s.assignedClasses.length - 5}</Pill>}
          {s.assignedClasses.length === 0 && <span className="text-xs text-slate-400 italic">All classes</span>}
        </div>
        <p className="text-xs text-slate-300 mt-2">Updated: {date}</p>
      </div>
      <div className="flex gap-1.5 flex-shrink-0">
        <button onClick={() => onEdit(s)} className="p-2.5 rounded-xl bg-slate-100 text-slate-500 hover:bg-indigo-100 hover:text-indigo-600 transition-all">
          <KeyRound size={15} />
        </button>
        {s.status !== "revoked"
          ? <button onClick={() => onRevoke(s)} className="p-2.5 rounded-xl bg-slate-100 text-slate-500 hover:bg-red-100 hover:text-red-600 transition-all"><UserX size={15} /></button>
          : <button onClick={() => onRestore(s)} className="p-2.5 rounded-xl bg-emerald-100 text-emerald-600 hover:bg-emerald-200 transition-all"><UserCheck size={15} /></button>
        }
      </div>
    </Card>
  );
});

// ─── Staff Dialog ─────────────────────────────────────────────────────────────
const STEPS = [
  { id:"identity",    label:"Identity",    icon:"👤", desc:"Name, role & PIN" },
  { id:"status",      label:"Status",      icon:"🔑", desc:"Account access level" },
  { id:"permissions", label:"Permissions", icon:"🛡️", desc:"Feature access" },
  { id:"classes",     label:"Classes",     icon:"📚", desc:"Assigned classes" },
];

const blankStaff = (): Omit<StaffMember, "id" | "createdAt" | "updatedAt"> => ({
  name: "", role: "Teacher", pin: "", status: "active",
  assignedClasses: [],
  permissions: { scoreEntry:true, viewReports:true, printReports:false, manageRecords:false },
});

const StaffDialog = memo(({ staff, mode, onSave, onClose }: { staff?: StaffMember; mode: "add" | "edit"; onSave: (s: StaffMember) => void; onClose: () => void }) => {
  const originalRef = useRef<any>(staff ? { ...staff, pin: "" } : blankStaff());
  const [form, setForm] = useState<any>(() => staff ? { ...staff, pin: "" } : blankStaff());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPin, setShowPin] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  // FIX: Use step-based navigation (one section at a time) instead of continuous scroll
  // This eliminates the lag entirely — only renders ONE section at a time
  const [step, setStep] = useState(0);

  // FIX: Use a Set for O(1) class lookups instead of Array.includes() on every render
  const [classSet, setClassSet] = useState<Set<string>>(() => new Set(form.assignedClasses));

  // Keep classSet and form.assignedClasses in sync
  const syncClasses = useCallback((newSet: Set<string>) => {
    setClassSet(newSet);
    setForm((f: any) => ({ ...f, assignedClasses: Array.from(newSet) }));
  }, []);

  const isDirty = useMemo(() => {
    const orig = originalRef.current;
    // Compare only the fields that matter, not full JSON (faster)
    return form.name !== orig.name ||
      form.role !== orig.role ||
      form.pin !== orig.pin ||
      form.status !== orig.status ||
      JSON.stringify(form.permissions) !== JSON.stringify(orig.permissions) ||
      JSON.stringify(Array.from(classSet).sort()) !== JSON.stringify([...(orig.assignedClasses || [])].sort());
  }, [form.name, form.role, form.pin, form.status, form.permissions, classSet]);

  const setF = useCallback((key: string, val: any) => {
    setForm((f: any) => ({ ...f, [key]: val }));
    setErrors(e => ({ ...e, [key]: "" }));
  }, []);

  const toggleClass = useCallback((cls: string) => {
    setClassSet(prev => {
      const next = new Set(prev);
      if (next.has(cls)) next.delete(cls); else next.add(cls);
      setForm((f: any) => ({ ...f, assignedClasses: Array.from(next) }));
      return next;
    });
  }, []);

  const toggleAllClasses = useCallback(() => {
    if (classSet.size === ALL_CLASSES.length) {
      syncClasses(new Set());
    } else {
      syncClasses(new Set(ALL_CLASSES));
    }
  }, [classSet.size, syncClasses]);

  const toggleCategoryClasses = useCallback((classes: string[]) => {
    const allSelected = classes.every(c => classSet.has(c));
    setClassSet(prev => {
      const next = new Set(prev);
      if (allSelected) { classes.forEach(c => next.delete(c)); }
      else { classes.forEach(c => next.add(c)); }
      setForm((f: any) => ({ ...f, assignedClasses: Array.from(next) }));
      return next;
    });
  }, [classSet]);

  const togglePerm = useCallback((k: string) => {
    setF("permissions", { ...form.permissions, [k]: !form.permissions[k] });
  }, [form.permissions, setF]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) { e.name = "Full name is required"; }
    if (mode === "add" && form.pin.length < 4) e.pin = "PIN must be at least 4 digits";
    if (mode === "edit" && form.pin.length > 0 && form.pin.length < 4) e.pin = "PIN must be at least 4 digits";
    setErrors(e);
    // If error is in identity section, jump there
    if (e.name || e.pin) setStep(0);
    return !Object.keys(e).length;
  };

  const handleSave = () => {
    if (!validate()) return;
    const finalPin = (mode === "edit" && form.pin === "") ? (staff?.pin || "") : form.pin;
    onSave({
      ...form,
      assignedClasses: Array.from(classSet),
      pin: finalPin,
      id: staff?.id || uid(),
      createdAt: staff?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  };

  const handleClose = () => { if (isDirty) setConfirmClose(true); else onClose(); };
  const goNext = () => setStep(s => Math.min(s + 1, STEPS.length - 1));
  const goPrev = () => setStep(s => Math.max(s - 1, 0));

  const avatarBg = form.status === "active" ? "bg-indigo-500" : form.status === "restricted" ? "bg-amber-500" : "bg-slate-400";
  const initials = form.name.trim() ? form.name.trim().split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase() : "?";

  // Step content renderer
  const renderStep = () => {
    switch (STEPS[step].id) {
      case "identity": return (
        <div className="space-y-5">
          <Inp label="Full Name" value={form.name} onChange={(e: any) => setF("name", e.target.value)} placeholder="e.g. Mrs. Amaka Obi" error={errors.name} />
          <Sel label="Role" value={form.role} onChange={(e: any) => setF("role", e.target.value)}>
            {ROLES.map(r => <option key={r}>{r}</option>)}
          </Sel>
          <Field label={mode === "add" ? "Access PIN *" : "New PIN (optional)"} error={errors.pin}>
            <div className="relative">
              <input
                type={showPin ? "text" : "password"}
                value={form.pin}
                maxLength={8}
                placeholder={mode === "add" ? "4–8 digits" : "Leave blank to keep current"}
                onChange={e => setF("pin", e.target.value.replace(/\D/g, "").slice(0, 8))}
                className={`w-full px-4 py-3 bg-slate-50 border-2 ${errors.pin ? "border-red-300" : "border-slate-100"} rounded-xl font-black text-center tracking-widest text-lg focus:border-blue-500 outline-none transition-all pr-10`}
              />
              <button type="button" onClick={() => setShowPin(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                {showPin ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            {form.pin.length >= 4 && <p className="text-xs text-emerald-600 font-bold mt-1">✓ PIN set — {form.pin.length} digits</p>}
            {mode === "edit" && form.pin === "" && <p className="text-xs text-slate-400 mt-1">Current PIN will be kept unchanged</p>}
          </Field>
          {/* Live preview card */}
          <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-4 border border-slate-100">
            <div className={`w-12 h-12 rounded-xl ${avatarBg} flex items-center justify-center flex-shrink-0`}>
              <span className="text-white font-black text-base">{initials}</span>
            </div>
            <div>
              <p className="font-black text-slate-900 text-sm uppercase">{form.name || <span className="text-slate-300">No name yet</span>}</p>
              <p className="text-xs text-slate-500 mt-0.5">{form.role}</p>
              <div className="mt-1"><StatusPill status={form.status} /></div>
            </div>
          </div>
        </div>
      );

      case "status": return (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3">
            {([
              ["active",     "✓ Active",      "Full access to all permitted features.", "border-emerald-400 bg-emerald-50 text-emerald-700", "bg-emerald-500"],
              ["restricted", "⚠ Restricted",  "Can log in but with limited feature access.", "border-amber-400 bg-amber-50 text-amber-700", "bg-amber-500"],
              ["revoked",    "✗ Revoked",     "Account disabled — staff cannot log in.", "border-red-400 bg-red-50 text-red-700", "bg-red-400"],
            ] as const).map(([v, l, desc, ac, dot]) => (
              <button key={v} type="button" onClick={() => setF("status", v)}
                className={`flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all ${form.status === v ? ac : "border-slate-200 bg-white hover:border-slate-300"}`}>
                <div className={`w-4 h-4 rounded-full flex-shrink-0 border-2 flex items-center justify-center ${form.status === v ? "border-current" : "border-slate-300"}`}>
                  {form.status === v && <div className="w-2 h-2 rounded-full bg-current" />}
                </div>
                <div className="flex-1">
                  <p className={`text-sm font-black uppercase ${form.status === v ? "" : "text-slate-500"}`}>{l}</p>
                  <p className={`text-xs mt-0.5 ${form.status === v ? "opacity-80" : "text-slate-400"}`}>{desc}</p>
                </div>
                {form.status === v && <Check size={16} className="flex-shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      );

      case "permissions": return (
        <div className="space-y-3">
          <p className="text-xs text-slate-400 font-bold">Toggle which features this staff member can access.</p>
          {PERMS_META.map(({ key, label, desc }) => (
            <button key={key} type="button" onClick={() => togglePerm(key)}
              className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all ${form.permissions[key] ? "border-blue-200 bg-blue-50" : "border-slate-100 bg-slate-50"}`}>
              <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-all ${form.permissions[key] ? "bg-blue-600 border-blue-600" : "bg-white border-slate-300"}`}>
                {form.permissions[key] && <Check size={12} className="text-white" />}
              </div>
              <div className="flex-1">
                <p className={`text-sm font-black uppercase ${form.permissions[key] ? "text-blue-800" : "text-slate-600"}`}>{label}</p>
                <p className={`text-xs mt-0.5 ${form.permissions[key] ? "text-blue-600" : "text-slate-400"}`}>{desc}</p>
              </div>
              <span className={`text-xs font-black uppercase px-2.5 py-1 rounded-lg ${form.permissions[key] ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-500"}`}>
                {form.permissions[key] ? "ON" : "OFF"}
              </span>
            </button>
          ))}
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 mt-2">
            <p className="text-xs text-slate-500 font-medium">
              <span className="font-black text-slate-700">{Object.values(form.permissions).filter(Boolean).length}</span> of {PERMS_META.length} permissions enabled
            </p>
          </div>
        </div>
      );

      case "classes": return (
        <div className="space-y-4">
          {/* Quick actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black px-2.5 py-1 rounded-full bg-blue-100 text-blue-700">{classSet.size} selected</span>
              {classSet.size === 0 && <span className="text-xs font-bold text-amber-600">→ sees all classes</span>}
            </div>
            <button type="button" onClick={toggleAllClasses}
              className={`text-xs font-black uppercase px-3 py-1.5 rounded-lg transition-all ${classSet.size === ALL_CLASSES.length ? "bg-red-100 text-red-600 hover:bg-red-200" : "bg-blue-600 text-white hover:bg-blue-700"}`}>
              {classSet.size === ALL_CLASSES.length ? "× Clear All" : "✓ Select All"}
            </button>
          </div>

          {/* Per-category class selectors */}
          {Object.entries(CURRICULUM).map(([cat, data]) => {
            const allInCat = data.classes.every(c => classSet.has(c));
            const someInCat = data.classes.some(c => classSet.has(c));
            return (
              <div key={cat} className="border border-slate-100 rounded-xl overflow-hidden">
                {/* Category header — click to toggle whole category */}
                <button type="button" onClick={() => toggleCategoryClasses(data.classes)}
                  className={`w-full flex items-center justify-between px-4 py-3 text-left transition-all ${allInCat ? "bg-blue-600" : someInCat ? "bg-blue-50" : "bg-slate-50 hover:bg-slate-100"}`}>
                  <div className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${allInCat ? "bg-white border-white" : someInCat ? "border-blue-400 bg-blue-400" : "border-slate-300 bg-white"}`}>
                      {(allInCat || someInCat) && <Check size={10} className={allInCat ? "text-blue-600" : "text-white"} />}
                    </div>
                    <span className={`text-xs font-black uppercase tracking-wide ${allInCat ? "text-white" : someInCat ? "text-blue-700" : "text-slate-600"}`}>{cat}</span>
                  </div>
                  <span className={`text-xs font-bold ${allInCat ? "text-white/70" : "text-slate-400"}`}>
                    {data.classes.filter(c => classSet.has(c)).length}/{data.classes.length}
                  </span>
                </button>
                {/* Individual class buttons */}
                <div className="p-3 flex flex-wrap gap-2">
                  {data.classes.map(cls => {
                    const selected = classSet.has(cls);
                    return (
                      <button key={cls} type="button" onClick={() => toggleClass(cls)}
                        className={`px-3 py-2 rounded-lg text-xs font-black uppercase transition-all flex items-center gap-1.5 ${selected ? "bg-blue-600 text-white shadow-sm" : "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700"}`}>
                        {selected && <Check size={10} />}
                        {cls}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {classSet.size === 0 && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
              <AlertTriangle size={13} className="text-amber-500 flex-shrink-0" />
              <p className="text-xs text-amber-700 font-bold">No classes selected — this staff member will see all classes by default</p>
            </div>
          )}
        </div>
      );

      default: return null;
    }
  };

  return (
    <>
      {/* FIX: Full-screen modal on mobile, large modal on desktop — proper flex layout */}
      <div className="fixed inset-0 z-[200] flex items-stretch md:items-center justify-center md:p-4" style={{ background: "rgba(15,23,42,0.72)" }}>
        <div className="bg-white w-full md:max-w-lg md:rounded-2xl md:shadow-2xl flex flex-col overflow-hidden md:max-h-[92vh]" style={{ maxHeight: "100dvh" }}>

          {/* ── Top nav bar ─────────────────────────────────────────────── */}
          <div className={`flex-shrink-0 ${mode === "add" ? "bg-blue-600" : "bg-indigo-600"}`}>
            <div className="flex items-center justify-between px-4 py-4">
              <button onClick={handleClose} className="flex items-center gap-2 text-white/80 hover:text-white transition-colors">
                <ArrowLeft size={18} />
                <span className="text-xs font-black uppercase tracking-wide">
                  {mode === "add" ? "Cancel" : "Back"}
                </span>
              </button>
              <div className="text-center flex-1 mx-4">
                <p className="text-white font-black uppercase tracking-widest text-xs leading-tight">
                  {mode === "add" ? "New Staff" : "Edit Staff"}
                </p>
                {form.name.trim() && (
                  <p className="text-white/60 text-xs mt-0.5 truncate">{form.name}</p>
                )}
              </div>
              <Btn
                variant="ghost"
                size="sm"
                className="bg-white/20 text-white hover:bg-white/30 border-0"
                onClick={handleSave}
                disabled={!isDirty && mode === "edit"}
              >
                <Save size={13} />
                {mode === "add" ? "Create" : "Save"}
              </Btn>
            </div>

            {/* ── Step progress bar ───────────────────────────────────── */}
            <div className="flex border-t border-white/20">
              {STEPS.map((s, i) => (
                <button key={s.id} type="button" onClick={() => setStep(i)}
                  className={`flex-1 flex flex-col items-center py-2.5 px-1 transition-all relative ${step === i ? "bg-white/20" : "hover:bg-white/10"}`}>
                  <span className="text-sm">{s.icon}</span>
                  <span className={`text-xs font-black uppercase tracking-tight mt-0.5 hidden sm:block ${step === i ? "text-white" : "text-white/50"}`}>{s.label}</span>
                  {/* Active indicator */}
                  {step === i && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white rounded-full" />}
                  {/* Completion dot */}
                  {i < step && <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                </button>
              ))}
            </div>
          </div>

          {/* ── Dirty banner ─────────────────────────────────────────────── */}
          {isDirty && (
            <div className="flex-shrink-0 bg-amber-50 border-b border-amber-200 px-4 py-1.5 flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse flex-shrink-0" />
              <p className="text-xs font-black uppercase text-amber-700 tracking-wide">Unsaved changes</p>
            </div>
          )}

          {/* ── Section title ─────────────────────────────────────────────── */}
          <div className="flex-shrink-0 px-5 pt-5 pb-3 border-b border-slate-100 flex items-center gap-3">
            <span className="text-2xl">{STEPS[step].icon}</span>
            <div>
              <p className="font-black uppercase text-slate-900 text-sm">{STEPS[step].label}</p>
              <p className="text-xs text-slate-400 mt-0.5">{STEPS[step].desc}</p>
            </div>
            <div className="ml-auto text-xs font-black text-slate-400">
              {step + 1} / {STEPS.length}
            </div>
          </div>

          {/* ── Scrollable step content ───────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto overscroll-contain">
            <div className="p-5">
              {renderStep()}
            </div>
          </div>

          {/* ── Bottom navigation bar ─────────────────────────────────────── */}
          <div className="flex-shrink-0 border-t border-slate-100 bg-white px-4 py-3 flex items-center gap-3">
            <Btn variant="ghost" onClick={goPrev} disabled={step === 0} className="flex-1">
              <ChevronLeft size={15} />Prev
            </Btn>
            <div className="flex gap-1.5 flex-shrink-0">
              {STEPS.map((_, i) => (
                <button key={i} type="button" onClick={() => setStep(i)}
                  className={`rounded-full transition-all ${step === i ? "w-6 h-2 bg-blue-600" : "w-2 h-2 bg-slate-200 hover:bg-slate-300"}`} />
              ))}
            </div>
            {step < STEPS.length - 1 ? (
              <Btn variant="primary" onClick={goNext} className="flex-1">
                Next<ChevronRight size={15} />
              </Btn>
            ) : (
              <Btn variant="primary" onClick={handleSave} disabled={!isDirty && mode === "edit"} className="flex-1">
                <Save size={14} />{mode === "add" ? "Create Account" : "Save Changes"}
              </Btn>
            )}
          </div>
        </div>
      </div>

      {confirmClose && (
        <Modal maxW="max-w-sm" onBgClick={() => setConfirmClose(false)}>
          <MHead icon={AlertTriangle} title="Discard Changes?" subtitle="Your unsaved changes will be lost" color="bg-amber-500" onClose={() => setConfirmClose(false)} />
          <div className="p-6 space-y-4">
            <p className="text-sm text-slate-600 font-medium">Are you sure you want to close without saving?</p>
            <div className="grid grid-cols-2 gap-3">
              <Btn variant="ghost" onClick={() => setConfirmClose(false)}>Keep Editing</Btn>
              <Btn variant="danger" onClick={() => { setConfirmClose(false); onClose(); }}>Discard</Btn>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
});

// ─── Print Dialog ─────────────────────────────────────────────────────────────
const PRINT_OPTS = [
  { id:"browser",   icon:"🖨️", label:"Browser / USB",      desc:"Any connected printer" },
  { id:"bluetooth", icon:"🔵", label:"Bluetooth",           desc:"Wireless nearby printer" },
  { id:"email",     icon:"📧", label:"Email",               desc:"Send to email address" },
  { id:"download",  icon:"💾", label:"Download / Flash",    desc:"Save as HTML file" },
  { id:"share",     icon:"📤", label:"Share",               desc:"Native share / WhatsApp" },
];

const PrintDialog = memo(({ student, schoolName, onClose }: { student: any; schoolName: string; onClose: () => void }) => {
  const [sel, setSel] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string>("idle");

  const go = async () => {
    if (!sel) return;
    setStatus("loading");
    try {
      if (sel === "browser") {
        onClose();
        setTimeout(() => window.print(), 300);
        return;
      }
      if (sel === "bluetooth") {
        // FIX: Check for bluetooth support before accessing
        if (!navigator.bluetooth) throw new Error("no-bluetooth");
        await (navigator as any).bluetooth.requestDevice({ acceptAllDevices: true });
      } else if (sel === "email") {
        if (!email.includes("@")) throw new Error("bad-email");
        const s = encodeURIComponent(`${student.name} Report — ${schoolName}`);
        const b = encodeURIComponent(`Academic report for ${student.name}.\n\n— ${schoolName}`);
        window.location.href = `mailto:${email}?subject=${s}&body=${b}`;
      } else if (sel === "download") {
        // FIX: Generate report HTML inline instead of depending on DOM element in another tab
        const reportEl = document.getElementById("printable-report");
        const content = reportEl ? reportEl.innerHTML : `<h1>${student.name} - Academic Report</h1><p>Please view the report in the Reports tab.</p>`;
        const blob = new Blob([
          `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${student.name}</title>` +
          `<style>body{font-family:serif;padding:20px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #000;padding:8px}thead{background:#1e293b;color:white}</style>` +
          `</head><body>${content}</body></html>`
        ], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${student.name.replace(/\s+/g, "_")}_Report.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else if (sel === "share") {
        const t = `Academic Report for ${student.name} — ${schoolName}.`;
        if (navigator.share) {
          await navigator.share({ title: `${student.name} Report`, text: t });
        } else {
          await navigator.clipboard?.writeText(t);
        }
      }
      setStatus("done");
    } catch (e: any) {
      if (e.message === "bad-email") setStatus("bad-email");
      else if (e.message === "no-bluetooth") setStatus("no-bluetooth");
      else setStatus("error");
    }
  };

  return (
    <Modal onBgClick={onClose}>
      <MHead icon={Printer} title="Print / Export" subtitle={student.name} color="bg-blue-600" onClose={onClose} />
      <div className="p-5 space-y-3 overflow-y-auto">
        {status === "done" ? (
          <div className="text-center py-10 space-y-4">
            <div className="inline-flex p-4 bg-emerald-100 rounded-full"><Check size={32} className="text-emerald-600" /></div>
            <p className="font-black uppercase text-slate-900">Done!</p>
            <Btn variant="ghost" onClick={onClose}>Close</Btn>
          </div>
        ) : (
          <>
            {PRINT_OPTS.map(o => (
              <button key={o.id} type="button" onClick={() => { setSel(o.id); setStatus("idle"); }}
                className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all ${sel === o.id ? "border-blue-500 bg-blue-50" : "border-slate-100 hover:border-slate-200 hover:bg-slate-50"}`}>
                <span className="text-xl flex-shrink-0">{o.icon}</span>
                <div className="flex-1">
                  <p className={`text-sm font-black ${sel === o.id ? "text-blue-700" : "text-slate-800"}`}>{o.label}</p>
                  <p className="text-xs text-slate-400">{o.desc}</p>
                </div>
                <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${sel === o.id ? "border-blue-600 bg-blue-600" : "border-slate-300"}`}>
                  {sel === o.id && <Check size={9} className="text-white" />}
                </div>
              </button>
            ))}
            {sel === "email" && (
              <Inp
                label="Recipient Email"
                type="email"
                placeholder="parent@example.com"
                value={email}
                onChange={(e: any) => { setEmail(e.target.value); setStatus("idle"); }}
                error={status === "bad-email" ? "Enter a valid email address" : ""}
              />
            )}
            {(status === "error" || status === "no-bluetooth") && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl p-3">
                <AlertTriangle size={13} className="text-red-500" />
                <p className="text-xs text-red-600 font-bold">
                  {status === "no-bluetooth" ? "Bluetooth not supported on this device/browser." : "Something went wrong. Please try another method."}
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
              <Btn variant="primary" onClick={go} loading={status === "loading"} disabled={!sel}>
                <Printer size={14} />Proceed
              </Btn>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
});

// ─── Settings Tab ─────────────────────────────────────────────────────────────
const SETTINGS_SECTIONS = [
  { id:"logo",     label:"School Logo",    icon:"🖼️" },
  { id:"info",     label:"School Info",    icon:"🏫" },
  { id:"session",  label:"Session & Term", icon:"📅" },
  { id:"security", label:"Security & PIN", icon:"🔒" },
  { id:"database", label:"Database",       icon:"🗄️" },
];

const SettingsTab = memo(({ logoUrl, setSchoolLogo, logoRef, showToast, adminPinRef }: {
  logoUrl: string | null;
  setSchoolLogo: (url: string | null) => void;
  logoRef: React.RefObject<HTMLInputElement>;
  showToast: (msg: string, type?: string) => void;
  adminPinRef: React.MutableRefObject<string>;
}) => {
  const { state, dispatch } = useApp();
  const { schoolSettings } = state;
  const [sec, setSec] = useState("logo");
  const [draft, setDraft] = useState({ ...schoolSettings });
  const [pinF, setPinF] = useState({ cur: "", nxt: "", cnf: "" });
  const [pinErr, setPinErr] = useState("");
  const [pinSh, setPinSh] = useState({ cur: false, nxt: false, cnf: false });
  const [saved, setSaved] = useState(false);
  const [dbStats, setDbStats] = useState<{ size: string; keys: string[] }>({ size: "—", keys: [] });
  const [clearPin, setClearPin] = useState("");
  const [clearPinErr, setClearPinErr] = useState("");

  useEffect(() => { setDraft({ ...schoolSettings }); }, [schoolSettings]);

  // Compute DB stats
  useEffect(() => {
    if (sec !== "database") return;
    try {
      const raw = localStorage.getItem(DB_KEY) || "";
      const bytes = new Blob([raw]).size;
      const size = bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes/1024).toFixed(1)} KB` : `${(bytes/1048576).toFixed(2)} MB`;
      const keys = Object.keys(localStorage).filter(k => k.startsWith("greatmind"));
      setDbStats({ size, keys });
    } catch { setDbStats({ size: "N/A", keys: [] }); }
  }, [sec]);

  const saveInfo = () => {
    dispatch({ type: "SET_SCHOOL_SETTINGS", payload: draft });
    setSaved(true);
    showToast("Settings saved");
    setTimeout(() => setSaved(false), 2000);
  };

  const handleLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) return showToast("Invalid image", "error");
    if (f.size > 2097152) return showToast("Image must be under 2MB", "error");
    const r = new FileReader();
    r.onload = ev => { setSchoolLogo(ev.target?.result as string); showToast("Logo uploaded"); };
    r.readAsDataURL(f);
  };

  const changePin = () => {
    setPinErr("");
    if (pinF.cur !== adminPinRef.current) return setPinErr("Current PIN is incorrect.");
    if (pinF.nxt.length < 4) return setPinErr("New PIN must be ≥ 4 digits.");
    if (pinF.nxt !== pinF.cnf) return setPinErr("New PINs do not match.");
    adminPinRef.current = pinF.nxt;
    setPinF({ cur: "", nxt: "", cnf: "" });
    showToast("Admin PIN updated");
  };

  const handleClearDB = () => {
    setClearPinErr("");
    if (clearPin !== adminPinRef.current) return setClearPinErr("Incorrect PIN.");
    try { localStorage.removeItem(DB_KEY); } catch {}
    showToast("Database cleared — reload to reset app", "warning");
    setClearPin("");
    setTimeout(() => window.location.reload(), 1500);
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-slate-900 uppercase">Settings</h1>
        <p className="text-sm text-slate-400 mt-0.5">Manage school identity, session info and security</p>
      </div>
      <div className="flex flex-col md:flex-row gap-5">
        <Card className="p-2 md:w-48 h-fit flex-shrink-0">
          {SETTINGS_SECTIONS.map(s => (
            <button key={s.id} type="button" onClick={() => setSec(s.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all text-sm font-bold ${sec === s.id ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"}`}>
              <span>{s.icon}</span>{s.label}
              {sec === s.id && <ChevronRight size={14} className="ml-auto" />}
            </button>
          ))}
        </Card>
        <div className="flex-1 space-y-4">
          {sec === "logo" && (
            <Card className="p-6 space-y-5">
              <div>
                <p className="text-sm font-black uppercase text-slate-700">School Logo</p>
                <p className="text-xs text-slate-400 mt-0.5">Appears on login, sidebar and printed reports.</p>
              </div>
              <div className="flex items-center gap-5">
                <SchoolLogo logoUrl={logoUrl} size="lg" />
                <div className="flex-1 space-y-2">
                  <p className="text-xs text-slate-500 font-medium">PNG, JPG or SVG · max 2MB</p>
                  <div className="flex gap-2 flex-wrap">
                    <Btn variant="primary" size="sm" onClick={() => logoRef.current?.click()}>
                      <Upload size={13} />{logoUrl ? "Replace" : "Upload"}
                    </Btn>
                    {logoUrl && (
                      <Btn variant="ghost" size="sm" onClick={() => { setSchoolLogo(null); if (logoRef.current) logoRef.current.value = ""; showToast("Logo removed"); }}>
                        <X size={13} />Remove
                      </Btn>
                    )}
                  </div>
                </div>
              </div>
              <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={handleLogo} />
              <div onClick={() => logoRef.current?.click()}
                className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all group">
                <Upload size={22} className="mx-auto text-slate-300 group-hover:text-blue-400 mb-2" />
                <p className="text-xs font-black uppercase text-slate-400 group-hover:text-blue-500">Click or drop image here</p>
              </div>
              {logoUrl && (
                <div className="bg-slate-50 rounded-xl p-4 flex items-center gap-3">
                  <img src={logoUrl} alt="preview" className="w-12 h-12 rounded-lg object-contain border border-slate-200" />
                  <div>
                    <p className="text-xs font-black text-slate-700 uppercase">Current Preview</p>
                    <p className="text-xs text-slate-400">This appears on all reports.</p>
                  </div>
                </div>
              )}
            </Card>
          )}
          {sec === "info" && (
            <Card className="p-6 space-y-5">
              <div>
                <p className="text-sm font-black uppercase text-slate-700">School Information</p>
                <p className="text-xs text-slate-400 mt-0.5">Shown on reports and login screen.</p>
              </div>
              <Inp label="School Name" value={draft.name} onChange={(e: any) => setDraft(d => ({ ...d, name: e.target.value }))} />
              <Inp label="School Motto" value={draft.motto} onChange={(e: any) => setDraft(d => ({ ...d, motto: e.target.value }))} />
              <div className="pt-2 border-t border-slate-100">
                <Btn variant="primary" size="lg" className="w-full" onClick={saveInfo}>
                  {saved ? <><Check size={15} />Saved!</> : <><Save size={15} />Save Information</>}
                </Btn>
              </div>
            </Card>
          )}
          {sec === "session" && (
            <Card className="p-6 space-y-5">
              <div>
                <p className="text-sm font-black uppercase text-slate-700">Session & Term</p>
                <p className="text-xs text-slate-400 mt-0.5">Controls the academic period shown on reports.</p>
              </div>
              <Inp label="Academic Session" value={draft.session} onChange={(e: any) => setDraft(d => ({ ...d, session: e.target.value }))} placeholder="e.g. 2024/2025" />
              <Sel label="Current Term" value={draft.term} onChange={(e: any) => setDraft(d => ({ ...d, term: e.target.value }))}>
                {TERMS.map(t => <option key={t}>{t}</option>)}
              </Sel>
              <Inp label="Next Resumption Date" value={draft.resumptionDate} onChange={(e: any) => setDraft(d => ({ ...d, resumptionDate: e.target.value }))} placeholder="e.g. January 8th, 2025" />
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-2">
                <p className="text-xs font-black uppercase text-slate-400">Report Preview</p>
                <div className="flex flex-wrap gap-2">
                  <span className="px-3 py-1 bg-slate-900 text-white text-xs font-black rounded-full">{draft.session}</span>
                  <span className="px-3 py-1 bg-blue-100 text-blue-700 text-xs font-black rounded-full">{draft.term}</span>
                  <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-black rounded-full">Resumes: {draft.resumptionDate}</span>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100">
                <Btn variant="primary" size="lg" className="w-full" onClick={saveInfo}>
                  {saved ? <><Check size={15} />Saved!</> : <><Save size={15} />Save Session</>}
                </Btn>
              </div>
            </Card>
          )}
          {sec === "database" && (
            <Card className="p-6 space-y-5">
              <div>
                <p className="text-sm font-black uppercase text-slate-700">Database Management</p>
                <p className="text-xs text-slate-400 mt-0.5">All data is stored locally on this device via localStorage.</p>
              </div>
              {/* Stats */}
              <div className="grid grid-cols-2 gap-3">
                {([
                  ["Storage Used", dbStats.size, "bg-blue-50 text-blue-800"],
                  ["DB Keys",      dbStats.keys.length.toString(), "bg-slate-50 text-slate-700"],
                ] as const).map(([l, v, c]) => (
                  <div key={l} className={`${c} rounded-xl p-4 text-center border border-slate-100`}>
                    <p className="text-2xl font-black">{v}</p>
                    <p className="text-xs font-black uppercase opacity-60 mt-1">{l}</p>
                  </div>
                ))}
              </div>
              {/* Data breakdown */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-2">
                <p className="text-xs font-black uppercase text-slate-400 mb-3">Data Breakdown</p>
                {([
                  ["Score Records", state.entries.length],
                  ["Bin (deleted)", state.bin.length],
                  ["Attendance",    state.attendance.length],
                  ["Staff Accounts",state.staffList.length],
                  ["Class Rolls",   Object.values(state.classRolls).reduce((a, b) => a + b.length, 0)],
                  ["Activity Logs", state.logs.length],
                ] as const).map(([l, v]) => (
                  <div key={l} className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-600">{l}</span>
                    <span className="text-xs font-black text-slate-900 bg-white border border-slate-200 px-2 py-0.5 rounded-md">{v}</span>
                  </div>
                ))}
              </div>
              {/* Export backup */}
              <div>
                <p className="text-xs font-black uppercase text-slate-400 mb-2">Backup</p>
                <Btn variant="outline" size="sm" className="w-full" onClick={() => {
                  const data = localStorage.getItem(DB_KEY) || "{}";
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(new Blob([data], { type:"application/json" }));
                  a.download = `greatmind_backup_${today()}.json`;
                  a.click();
                  showToast("Backup downloaded");
                }}>
                  <Database size={13} />Export Backup (.json)
                </Btn>
              </div>
              {/* Danger zone */}
              <div className="border-2 border-red-100 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={14} className="text-red-500" />
                  <p className="text-xs font-black uppercase text-red-600">Danger Zone — Clear All Data</p>
                </div>
                <p className="text-xs text-red-500 font-medium">This permanently deletes all records, staff, attendance and settings. Enter your Admin PIN to confirm.</p>
                <Field error={clearPinErr}>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={clearPin}
                      maxLength={8}
                      placeholder="Admin PIN"
                      onChange={e => { setClearPin(e.target.value.replace(/\D/g,"")); setClearPinErr(""); }}
                      className="flex-1 px-3 py-2.5 bg-white border-2 border-red-200 rounded-xl text-sm font-black text-center tracking-widest focus:border-red-400 outline-none transition-all"
                    />
                    <Btn variant="danger" size="sm" onClick={handleClearDB} disabled={clearPin.length < 4}>
                      <Trash2 size={13} />Clear DB
                    </Btn>
                  </div>
                </Field>
              </div>
            </Card>
          )}
            <Card className="p-6 space-y-5">
              <div>
                <p className="text-sm font-black uppercase text-slate-700">Security & PIN</p>
                <p className="text-xs text-slate-400 mt-0.5">Admin PIN authorises sensitive actions.</p>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
                <AlertTriangle size={15} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 font-medium">Keep this PIN private. Default: <strong>1234</strong></p>
              </div>
              {(["cur", "nxt", "cnf"] as const).map((fk, i) => {
                const labels = { cur: "Current PIN", nxt: "New PIN (min 4 digits)", cnf: "Confirm New PIN" };
                return (
                  <Field key={fk} label={labels[fk]}>
                    <div className="relative">
                      <input
                        type={pinSh[fk] ? "text" : "password"}
                        value={pinF[fk]}
                        maxLength={8}
                        placeholder="••••••"
                        onChange={e => setPinF(p => ({ ...p, [fk]: e.target.value.replace(/\D/g, "") }))}
                        className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-black text-center text-xl tracking-[0.5em] focus:border-blue-500 outline-none transition-all pr-11"
                      />
                      <button type="button" onClick={() => setPinSh(s => ({ ...s, [fk]: !s[fk] }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                        {pinSh[fk] ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </Field>
                );
              })}
              {pinErr && <p className="text-red-500 text-xs font-bold flex items-center gap-1"><AlertTriangle size={12} />{pinErr}</p>}
              <div className="pt-2 border-t border-slate-100">
                <Btn variant="primary" size="lg" className="w-full" onClick={changePin}>
                  <Shield size={15} />Update Admin PIN
                </Btn>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
});

// ─── Report Sheet ─────────────────────────────────────────────────────────────
const ReportSheet = memo(({ report, curC, attRate, schoolLogo, schoolSettings }: any) => (
  <div id="printable-report" className="bg-white rounded-2xl overflow-hidden border border-slate-200 shadow-lg" style={{ fontFamily: "Georgia,serif" }}>
    <div className="h-1.5 bg-blue-600" />
    <div className="px-8 pt-7 pb-5 border-b-2 border-slate-900 flex items-center justify-between gap-4">
      <div className="flex items-center gap-4 min-w-0">
        <SchoolLogo logoUrl={schoolLogo} size="lg" />
        <div>
          <h1 className="text-2xl font-black uppercase text-slate-900 tracking-tight leading-tight">{schoolSettings.name}</h1>
          <p className="text-xs font-bold text-blue-600 uppercase tracking-widest mt-1">{schoolSettings.motto}</p>
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <span className="inline-block bg-slate-900 text-white text-xs font-black uppercase tracking-widest px-4 py-1.5 rounded-full">Report Sheet</span>
        <p className="text-xs text-slate-500 font-bold mt-1.5">{schoolSettings.session} · {schoolSettings.term}</p>
      </div>
    </div>
    <div className="bg-slate-50 px-8 py-3.5 border-b border-slate-100 grid grid-cols-4 gap-3">
      {([
        ["Student", report.name, "font-black text-blue-700"],
        ["Class", report.class, ""],
        ["Position", report.position, "font-black text-emerald-700"],
        ["In Class", report.classCount, ""],
      ] as const).map(([l, v, x]) => (
        <div key={l}>
          <p className="text-xs font-black uppercase text-slate-400 tracking-wide mb-0.5">{l}</p>
          <p className={`text-sm font-black uppercase text-slate-900 ${x}`}>{v}</p>
        </div>
      ))}
    </div>
    <div className="px-8 pt-5 pb-3">
      <p className="text-xs font-black uppercase text-slate-400 tracking-wide mb-2">Academic Performance</p>
      <table className="w-full border-collapse text-xs" style={{ borderTop: "2px solid #0f172a", borderBottom: "2px solid #0f172a" }}>
        <thead>
          <tr className="bg-slate-900 text-white">
            {["Subject", "CA /40", "Exam /60", "Total /100", "Grade", "Remark"].map((h, i) => (
              <th key={i} style={{ padding:"9px 10px", textAlign: i === 0 ? "left" : "center", fontWeight:800, fontSize:"9px", letterSpacing:"0.1em", textTransform:"uppercase", borderRight: i < 5 ? "1px solid #334155" : "none" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {report.records.map((r: any, i: number) => {
            const g = getGrade(r.total);
            return (
              <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#f8fafc" }}>
                <td style={{ padding:"8px 10px", borderRight:"1px solid #e2e8f0", borderBottom:"1px solid #e2e8f0", fontWeight:700, textTransform:"uppercase", fontSize:"10px" }}>{r.subject}</td>
                <td style={{ padding:"8px 10px", borderRight:"1px solid #e2e8f0", borderBottom:"1px solid #e2e8f0", textAlign:"center", fontWeight:700 }}>{r.caScore}</td>
                <td style={{ padding:"8px 10px", borderRight:"1px solid #e2e8f0", borderBottom:"1px solid #e2e8f0", textAlign:"center", fontWeight:700 }}>{r.examScore}</td>
                <td style={{ padding:"8px 10px", borderRight:"1px solid #e2e8f0", borderBottom:"1px solid #e2e8f0", textAlign:"center", fontWeight:900, fontSize:"12px" }}>{r.total}</td>
                <td style={{ padding:"8px 10px", borderRight:"1px solid #e2e8f0", borderBottom:"1px solid #e2e8f0", textAlign:"center", fontWeight:900, color:g.color }}>{g.grade}</td>
                <td style={{ padding:"8px 10px", borderBottom:"1px solid #e2e8f0", fontStyle:"italic", color:"#64748b", fontSize:"10px" }}>{g.remark}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ background: "#0f172a" }}>
            <td colSpan={3} style={{ padding:"9px 10px", color:"#94a3b8", fontWeight:800, fontSize:"9px", textTransform:"uppercase", letterSpacing:"0.1em" }}>Cumulative Total</td>
            <td style={{ padding:"9px 10px", textAlign:"center", color:"#fff", fontWeight:900, fontSize:"14px" }}>{report.summary.total}<span style={{ fontSize:"9px", opacity:0.5 }}>/{report.summary.obtainable}</span></td>
            <td style={{ padding:"9px 10px", textAlign:"center", color:"#34d399", fontWeight:900, fontSize:"12px" }}>{report.summary.avg}%</td>
            <td style={{ padding:"9px 10px", color:"#94a3b8", fontWeight:800, fontSize:"9px", textTransform:"uppercase" }}>Avg.</td>
          </tr>
        </tfoot>
      </table>
    </div>
    <div className="px-8 pt-4 pb-3">
      <p className="text-xs font-black uppercase text-slate-400 tracking-wide mb-2">Attendance</p>
      <div className="grid grid-cols-4 gap-2">
        {([
          ["Days Opened",  curC.daysOpen    || "—", "bg-slate-100 text-slate-800"],
          ["Days Present", curC.daysPresent || "—", "bg-emerald-50 text-emerald-800"],
          ["Days Absent",  curC.daysAbsent  || "—", "bg-red-50 text-red-700"],
          ["Rate", attRate !== null ? `${attRate}%` : "—", attRate === null ? "bg-slate-100 text-slate-800" : attRate >= 75 ? "bg-emerald-100 text-emerald-900" : "bg-red-100 text-red-900"],
        ] as const).map(([l, v, c]) => (
          <div key={l} className={`${c} rounded-xl p-3 text-center`}>
            <p className="text-xs font-black uppercase opacity-60 mb-0.5">{l}</p>
            <p className="text-xl font-black">{v}</p>
          </div>
        ))}
      </div>
    </div>
    <div className="px-8 pt-4 pb-5 grid grid-cols-2 gap-4">
      {([
        ["teacher",   "Class Teacher's Remark", "teacherSig",   ""],
        ["principal", "Principal's Remark",     "principalSig", "principal"],
      ] as const).map(([f, l, sf, role]) => (
        <div key={f} className="border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-black uppercase text-slate-400 tracking-wide mb-2">{l}</p>
          <div className="min-h-10 text-sm text-slate-700 italic border-b border-dashed border-slate-200 pb-2 mb-3">
            {curC[f] || <span className="text-slate-300 not-italic text-xs">No remark entered</span>}
          </div>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs font-black uppercase text-slate-400 mb-0.5">Signature</p>
              <p className="text-blue-600 italic text-base" style={{ fontFamily:"Georgia,serif" }}>{curC[sf] || "_____________________"}</p>
            </div>
            {role === "principal" && (
              <div className="w-16 h-10 border-2 border-dashed border-slate-200 rounded-lg flex items-center justify-center">
                <p className="text-xs text-slate-300 font-bold">Stamp</p>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
    <div className="bg-slate-900 px-8 py-3 flex items-center justify-between">
      <p className="text-xs font-black uppercase tracking-widest text-slate-500">Next Term Resumption</p>
      <p className="text-sm font-black text-white uppercase">{schoolSettings.resumptionDate}</p>
    </div>
    <div className="h-1.5 bg-blue-600" />
  </div>
));

// ─────────────────────────────────────────────────────────────────────────────
// ATTENDANCE TAB
// ─────────────────────────────────────────────────────────────────────────────
const AttendanceTab = memo(() => {
  const { state, dispatch, showToast } = useApp();
  const { attendance, classRolls, entries } = state;
  const [attTab, setAttTab] = useState<"roll" | "mark" | "history">("roll");

  // ── Class Roll ────────────────────────────────────────────────────────────
  const [rollClass, setRollClass] = useState("");
  const [rollSearch, setRollSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [newAdmNo, setNewAdmNo] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [showBulk, setShowBulk] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editAdmNo, setEditAdmNo] = useState("");

  // FIX: Reset search when class changes
  const handleRollClassChange = useCallback((cls: string) => {
    setRollClass(cls);
    setRollSearch("");
    setEditingId(null);
  }, []);

  const rollStudents = useMemo((): RollStudent[] => {
    const roll = classRolls[rollClass] || [];
    const fromEntries = entries.filter(e => e.studentClass === rollClass).map(e => e.studentName);
    const entrySet = new Set(fromEntries);
    const rollSet = new Set(roll.map(r => r.name));
    const suggested = [...entrySet]
      .filter(n => !rollSet.has(n))
      .map(n => ({ id: "suggest_" + n, name: n, admNo: "", suggested: true }));
    return [...roll, ...suggested];
  }, [classRolls, rollClass, entries]);

  const filteredRoll = useMemo(() =>
    rollStudents.filter(s =>
      s.name.toLowerCase().includes(rollSearch.toLowerCase()) ||
      (s.admNo || "").includes(rollSearch)
    ),
  [rollStudents, rollSearch]);

  const addStudent = () => {
    if (!newName.trim()) return showToast("Enter student name", "error");
    if (!rollClass) return showToast("Select a class", "error");
    const existing = classRolls[rollClass] || [];
    if (existing.find(s => s.name.toLowerCase() === newName.trim().toLowerCase()))
      return showToast("Student already exists", "error");
    dispatch({
      type: "SAVE_CLASS_ROLL",
      className: rollClass,
      students: [...existing, { id: uid(), name: newName.trim(), admNo: newAdmNo.trim() }],
    });
    setNewName(""); setNewAdmNo("");
    showToast("Student added to roll");
  };

  const addBulk = () => {
    if (!rollClass) return showToast("Select a class", "error");
    const lines = bulkText.split("\n").map(l => l.trim()).filter(Boolean);
    const existing = classRolls[rollClass] || [];
    const existingNames = new Set(existing.map(s => s.name.toLowerCase()));
    const newStudents = lines
      .filter(l => !existingNames.has(l.toLowerCase()))
      .map(l => ({ id: uid(), name: l, admNo: "" }));
    if (!newStudents.length) return showToast("All students already in roll", "warning");
    dispatch({ type: "SAVE_CLASS_ROLL", className: rollClass, students: [...existing, ...newStudents] });
    setBulkText(""); setShowBulk(false);
    showToast(`${newStudents.length} student${newStudents.length !== 1 ? "s" : ""} added`);
  };

  const confirmStudent = (student: RollStudent) => {
    const existing = (classRolls[rollClass] || []);
    dispatch({
      type: "SAVE_CLASS_ROLL",
      className: rollClass,
      students: [...existing, { id: uid(), name: student.name, admNo: student.admNo || "" }],
    });
    showToast(`${student.name} added to roll`);
  };

  const saveEdit = (id: string) => {
    if (!editName.trim()) return;
    const roll = (classRolls[rollClass] || []).map(s =>
      s.id === id ? { ...s, name: editName.trim(), admNo: editAdmNo.trim() } : s
    );
    dispatch({ type: "SAVE_CLASS_ROLL", className: rollClass, students: roll });
    setEditingId(null);
    showToast("Student updated");
  };

  const removeStudent = (studentId: string) => {
    dispatch({ type: "DELETE_ROLL_STUDENT", className: rollClass, studentId });
    showToast("Student removed from roll");
  };

  // ── Mark Attendance ───────────────────────────────────────────────────────
  const [markClass, setMarkClass] = useState("");
  const [markDate, setMarkDate] = useState(today());
  const [markRecords, setMarkRecords] = useState<Record<string, { status: string | null; note: string }>>({});
  const [markSearch, setMarkSearch] = useState("");

  // FIX: Reset markRecords when class OR date changes
  const handleMarkClassChange = useCallback((cls: string) => {
    setMarkClass(cls);
    setMarkRecords({});
    setMarkSearch("");
  }, []);

  const handleMarkDateChange = useCallback((date: string) => {
    setMarkDate(date);
    setMarkRecords({});
  }, []);

  const markPool = useMemo((): string[] => {
    const roll = classRolls[markClass] || [];
    const fromEntries = [...new Set(entries.filter(e => e.studentClass === markClass).map(e => e.studentName))];
    const rollNames = new Set(roll.map(s => s.name));
    const extra = fromEntries.filter(n => !rollNames.has(n));
    return [...roll.map(s => s.name), ...extra].sort();
  }, [classRolls, markClass, entries]);

  const filteredMark = useMemo(() =>
    markPool.filter(n => n.toLowerCase().includes(markSearch.toLowerCase())),
  [markPool, markSearch]);

  const existingForDate = useMemo(() => {
    const m: Record<string, { status: string; note: string }> = {};
    attendance
      .filter(a => a.studentClass === markClass && a.date === markDate)
      .forEach(a => { m[a.studentName] = { status: a.status, note: a.note || "" }; });
    return m;
  }, [attendance, markClass, markDate]);

  const markSummary = useMemo(() => {
    const all = attendance.filter(a => a.studentClass === markClass && a.date === markDate);
    return {
      present: all.filter(a => a.status === "present").length,
      absent:  all.filter(a => a.status === "absent").length,
      late:    all.filter(a => a.status === "late").length,
      excused: all.filter(a => a.status === "excused").length,
      total:   all.length,
    };
  }, [attendance, markClass, markDate]);

  const setStudentAtt = useCallback((name: string, field: "status" | "note", val: string | null) => {
    setMarkRecords(p => ({ ...p, [name]: { ...(p[name] || { status: null, note: "" }), [field]: val } }));
  }, []);

  const markAll = useCallback((status: string) => {
    const m: Record<string, { status: string; note: string }> = {};
    filteredMark.forEach(n => { m[n] = { ...(markRecords[n] || { status: null, note: "" }), status }; });
    setMarkRecords(prev => ({ ...prev, ...m }));
  }, [filteredMark, markRecords]);

  const saveAttendance = () => {
    if (!markClass) return showToast("Select a class", "error");
    const toSave = Object.entries(markRecords)
      .filter(([, v]) => v?.status)
      .map(([name, v]) => {
        const ex = attendance.find(a => a.studentName === name && a.studentClass === markClass && a.date === markDate);
        return {
          id: ex?.id || uid(),
          studentName: name,
          studentClass: markClass,
          date: markDate,
          status: v.status!,
          note: v.note || "",
          createdAt: ex?.createdAt || new Date().toISOString(),
        };
      });
    if (!toSave.length) return showToast("Mark at least one student", "error");
    dispatch({ type: "BULK_SAVE_ATTENDANCE", payload: toSave });
    setMarkRecords({});
    showToast(`Attendance saved for ${toSave.length} student${toSave.length !== 1 ? "s" : ""}`);
  };

  const unsavedCount = Object.values(markRecords).filter(v => v?.status).length;

  // ── History ───────────────────────────────────────────────────────────────
  const [hClass,  setHClass]  = useState("");
  const [hDate,   setHDate]   = useState(today());
  const [hStatus, setHStatus] = useState("All");
  const [hSearch, setHSearch] = useState("");

  const historyData = useMemo(() => {
    let d = [...attendance];
    if (hClass)          d = d.filter(a => a.studentClass === hClass);
    if (hDate)           d = d.filter(a => a.date === hDate);
    if (hStatus !== "All") d = d.filter(a => a.status === hStatus);
    if (hSearch)         d = d.filter(a => a.studentName.toLowerCase().includes(hSearch.toLowerCase()));
    return d.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [attendance, hClass, hDate, hStatus, hSearch]);

  const statColor: Record<string, string> = { present:"emerald", absent:"red", late:"amber", excused:"indigo" };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 uppercase">Attendance</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {attendance.length} record{attendance.length !== 1 ? "s" : ""} · {Object.keys(classRolls).length} class roll{Object.keys(classRolls).length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {([
            ["roll",    "Class Rolls", ClipboardList],
            ["mark",    "Mark",        CalendarDays],
            ["history", "History",     Database],
          ] as const).map(([id, label, Icon]) => (
            <Btn key={id} variant={attTab === id ? "primary" : "outline"} size="sm" onClick={() => setAttTab(id)}>
              <Icon size={14} />{label}
            </Btn>
          ))}
        </div>
      </div>

      {/* CLASS ROLLS */}
      {attTab === "roll" && (
        <div className="space-y-5">
          <Card className="p-5 space-y-4">
            <p className="text-xs font-black uppercase text-slate-400 tracking-wide">Select Class to Manage Roll</p>
            <Sel value={rollClass} onChange={(e: any) => handleRollClassChange(e.target.value)}>
              <option value="">Choose a class…</option>
              {ALL_CLASSES.map(c => <option key={c}>{c}</option>)}
            </Sel>
            {rollClass && (
              <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black uppercase text-slate-600">{rollClass}</span>
                  <Pill color="blue">{(classRolls[rollClass] || []).length} registered</Pill>
                  {[...new Set(entries.filter(e => e.studentClass === rollClass).map(e => e.studentName))].length > 0 && (
                    <Pill color="green">{[...new Set(entries.filter(e => e.studentClass === rollClass).map(e => e.studentName))].length} from scores</Pill>
                  )}
                </div>
                <Btn variant="outline" size="sm" onClick={() => setShowBulk(b => !b)}>
                  {showBulk ? <><X size={13} />Close Bulk</> : <><PlusCircle size={13} />Bulk Add</>}
                </Btn>
              </div>
            )}
          </Card>

          {rollClass && (
            <>
              {showBulk && (
                <Card className="p-5 space-y-3 border-2 border-blue-200 bg-blue-50">
                  <p className="text-xs font-black uppercase text-blue-700 tracking-wide">Bulk Add Students</p>
                  <p className="text-xs text-blue-600 font-medium">Paste one student name per line. Duplicates are automatically skipped.</p>
                  <textarea
                    value={bulkText}
                    onChange={e => setBulkText(e.target.value)}
                    rows={6}
                    placeholder={"Adaeze Okonkwo\nEmeka Nwosu\nFatima Bello\n…"}
                    className="w-full px-4 py-3 bg-white border-2 border-blue-200 rounded-xl text-sm font-medium focus:border-blue-500 outline-none transition-all resize-none"
                  />
                  <div className="flex gap-3">
                    <Btn variant="ghost" onClick={() => { setBulkText(""); setShowBulk(false); }}>Cancel</Btn>
                    <Btn variant="primary" onClick={addBulk} disabled={!bulkText.trim()}>
                      <PlusCircle size={14} />Add {bulkText.split("\n").filter(l => l.trim()).length} Students
                    </Btn>
                  </div>
                </Card>
              )}

              <Card className="p-5 space-y-3">
                <p className="text-xs font-black uppercase text-slate-400 tracking-wide">Add Individual Student</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <Inp value={newName} onChange={(e: any) => setNewName(e.target.value)} placeholder="Student full name"
                      onKeyDown={(e: any) => e.key === "Enter" && addStudent()} />
                  </div>
                  <Inp value={newAdmNo} onChange={(e: any) => setNewAdmNo(e.target.value)} placeholder="Adm No. (optional)"
                    onKeyDown={(e: any) => e.key === "Enter" && addStudent()} />
                </div>
                <Btn variant="primary" onClick={addStudent} disabled={!newName.trim()}>
                  <PlusCircle size={14} />Add to Roll
                </Btn>
              </Card>

              {filteredRoll.length === 0 && !rollSearch ? (
                <EmptyState icon={Users} title="No students on roll" subtitle="Add students above or they'll appear from score entries" />
              ) : (
                <Card className="overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
                    <div className="relative flex-1">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input value={rollSearch} onChange={e => setRollSearch(e.target.value)}
                        placeholder="Search student or adm no…"
                        className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-semibold focus:border-blue-500 focus:bg-white outline-none transition-all" />
                    </div>
                    <span className="text-xs font-black text-slate-400 flex-shrink-0">{filteredRoll.length} student{filteredRoll.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {filteredRoll.map((s, i) => (
                      <div key={s.id} className={`px-5 py-3.5 flex items-center gap-3 ${s.suggested ? "bg-blue-50" : ""}`}>
                        <span className="text-xs font-black text-slate-400 w-6 flex-shrink-0 text-center">{i + 1}</span>
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${s.suggested ? "bg-blue-200" : "bg-slate-200"}`}>
                          <span className={`font-black text-sm ${s.suggested ? "text-blue-700" : "text-slate-600"}`}>
                            {s.name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()}
                          </span>
                        </div>
                        {editingId === s.id ? (
                          <div className="flex-1 flex items-center gap-2 flex-wrap">
                            <input value={editName} onChange={e => setEditName(e.target.value)}
                              className="flex-1 min-w-0 px-3 py-2 bg-white border-2 border-blue-300 rounded-xl text-sm font-semibold outline-none focus:border-blue-500"
                              onKeyDown={e => e.key === "Enter" && saveEdit(s.id)} />
                            <input value={editAdmNo} onChange={e => setEditAdmNo(e.target.value)}
                              placeholder="Adm No."
                              className="w-28 px-3 py-2 bg-white border-2 border-slate-200 rounded-xl text-sm font-semibold outline-none focus:border-blue-500" />
                            <Btn size="sm" variant="success" onClick={() => saveEdit(s.id)}><Check size={13} />Save</Btn>
                            <Btn size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Btn>
                          </div>
                        ) : (
                          <div className="flex-1 min-w-0">
                            <p className="font-black text-sm text-slate-900 truncate">{s.name}</p>
                            <p className="text-xs text-slate-400">
                              {s.admNo ? `Adm: ${s.admNo}` : "No adm no."}
                              {s.suggested && <span className="ml-2 text-blue-600 font-black">← from score entry</span>}
                            </p>
                          </div>
                        )}
                        {editingId !== s.id && (
                          <div className="flex gap-1.5 flex-shrink-0">
                            {s.suggested ? (
                              <Btn size="sm" variant="primary" onClick={() => confirmStudent(s)}><Check size={13} />Confirm</Btn>
                            ) : (
                              <>
                                <button onClick={() => { setEditingId(s.id); setEditName(s.name); setEditAdmNo(s.admNo || ""); }}
                                  className="p-2 rounded-xl bg-slate-100 text-slate-500 hover:bg-indigo-100 hover:text-indigo-600 transition-all">
                                  <Edit2 size={13} />
                                </button>
                                <button onClick={() => removeStudent(s.id)}
                                  className="p-2 rounded-xl bg-slate-100 text-slate-500 hover:bg-red-100 hover:text-red-600 transition-all">
                                  <Trash2 size={13} />
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </>
          )}
          {!rollClass && <EmptyState icon={BookMarked} title="Select a class to manage its roll" subtitle="You can add, edit or remove students from each class roll" />}
        </div>
      )}

      {/* MARK ATTENDANCE */}
      {attTab === "mark" && (
        <div className="space-y-5">
          <Card className="p-5 space-y-4">
            <p className="text-xs font-black uppercase text-slate-400 tracking-wide">Session Details</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Sel value={markClass} onChange={(e: any) => handleMarkClassChange(e.target.value)}>
                <option value="">Select class…</option>
                {ALL_CLASSES.map(c => <option key={c}>{c}</option>)}
              </Sel>
              <Inp type="date" value={markDate} onChange={(e: any) => handleMarkDateChange(e.target.value)} max={today()} />
            </div>
            {markClass && markDate && (
              <div className="grid grid-cols-4 gap-2 pt-1">
                {([
                  ["Present", markSummary.present, "bg-emerald-50 text-emerald-700"],
                  ["Absent",  markSummary.absent,  "bg-red-50 text-red-700"],
                  ["Late",    markSummary.late,    "bg-amber-50 text-amber-700"],
                  ["Excused", markSummary.excused, "bg-indigo-50 text-indigo-700"],
                ] as const).map(([l, v, c]) => (
                  <div key={l} className={`${c} rounded-xl p-3 text-center`}>
                    <p className="text-2xl font-black">{v}</p>
                    <p className="text-xs font-black uppercase opacity-70">{l}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {markClass ? (
            markPool.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No students in this class"
                subtitle="Add students to the class roll first, or enter scores to auto-populate"
                action={<Btn variant="primary" size="sm" onClick={() => setAttTab("roll")}><ClipboardList size={14} />Go to Class Rolls</Btn>}
              />
            ) : (
              <Card className="overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                  <div className="relative flex-1">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={markSearch} onChange={e => setMarkSearch(e.target.value)}
                      placeholder="Search student…"
                      className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-semibold focus:border-blue-500 focus:bg-white outline-none transition-all" />
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0 flex-wrap">
                    <span className="text-xs font-black uppercase text-slate-400 self-center hidden sm:block">All:</span>
                    {ATT_STATUSES.map(({ key, label, icon, color }) => (
                      <button key={key} onClick={() => markAll(key)}
                        className={`text-xs font-black uppercase px-3 py-2 rounded-xl transition-opacity hover:opacity-80 ${color === "emerald" ? "bg-emerald-500 text-white" : color === "red" ? "bg-red-500 text-white" : color === "amber" ? "bg-amber-500 text-white" : "bg-indigo-500 text-white"}`}>
                        {icon} {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="divide-y divide-slate-50">
                  {filteredMark.map((name, i) => {
                    const saved = existingForDate[name];
                    const cur = markRecords[name];
                    const status = cur?.status || saved?.status || null;
                    const note = cur?.note !== undefined ? cur.note : (saved?.note || "");
                    const rowBg = status === "present" ? "bg-emerald-50" : status === "absent" ? "bg-red-50" : status === "late" ? "bg-amber-50" : status === "excused" ? "bg-indigo-50" : "hover:bg-slate-50";
                    return (
                      <div key={name} className={`px-5 py-3.5 transition-colors ${rowBg}`}>
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-xs font-black text-slate-400 w-6 text-center flex-shrink-0">{i + 1}</span>
                          <div className="w-9 h-9 rounded-xl bg-slate-200 flex items-center justify-center flex-shrink-0">
                            <span className="text-slate-600 font-black text-sm">{name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()}</span>
                          </div>
                          <p className="font-black text-sm text-slate-900 flex-1 min-w-0 truncate">{name}</p>
                          <div className="flex gap-1.5 flex-shrink-0">
                            {ATT_STATUSES.map(({ key, icon, color }) => {
                              const active = status === key;
                              const bg = active
                                ? (color === "emerald" ? "bg-emerald-500 border-emerald-500" : color === "red" ? "bg-red-500 border-red-500" : color === "amber" ? "bg-amber-500 border-amber-500" : "bg-indigo-500 border-indigo-500")
                                : "bg-white border-slate-200 hover:border-slate-300 text-slate-400";
                              return (
                                <button key={key}
                                  onClick={() => setStudentAtt(name, "status", status === key ? null : key)}
                                  className={`w-9 h-9 rounded-xl text-sm font-black border-2 transition-all ${bg} ${active ? "text-white" : ""}`}>
                                  {icon}
                                </button>
                              );
                            })}
                          </div>
                          {saved && !cur && <span className="text-xs font-black text-slate-400 uppercase">Saved</span>}
                        </div>
                        {status && (
                          <div className="mt-2 ml-20">
                            <input value={note} onChange={e => setStudentAtt(name, "note", e.target.value)}
                              placeholder="Note (optional)…"
                              className="w-full px-3 py-2 bg-white/80 border border-slate-200 rounded-lg text-xs font-medium focus:border-blue-400 outline-none transition-all" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="px-5 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
                  <p className="text-xs text-slate-500 font-bold">{unsavedCount} unsaved change{unsavedCount !== 1 ? "s" : ""}</p>
                  <Btn variant="primary" onClick={saveAttendance} disabled={unsavedCount === 0}>
                    <Save size={14} />Save Attendance
                  </Btn>
                </div>
              </Card>
            )
          ) : (
            <EmptyState
              icon={CalendarDays}
              title="Select a class to mark attendance"
              subtitle="Choose a class and date above to begin"
              action={<Btn variant="outline" size="sm" onClick={() => setAttTab("roll")}><ClipboardList size={14} />Manage Class Rolls</Btn>}
            />
          )}
        </div>
      )}

      {/* HISTORY */}
      {attTab === "history" && (
        <div className="space-y-4">
          <Card className="p-4 space-y-3">
            <p className="text-xs font-black uppercase text-slate-400 tracking-wide">Filter Records</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="relative col-span-2 md:col-span-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={hSearch} onChange={e => setHSearch(e.target.value)} placeholder="Search name…"
                  className="w-full pl-9 pr-3 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-semibold focus:border-blue-500 focus:bg-white outline-none transition-all" />
              </div>
              <select value={hClass} onChange={e => setHClass(e.target.value)}
                className="px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-semibold focus:border-blue-500 outline-none">
                <option value="">All Classes</option>
                {ALL_CLASSES.map(c => <option key={c}>{c}</option>)}
              </select>
              <input type="date" value={hDate} onChange={e => setHDate(e.target.value)}
                className="px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-semibold focus:border-blue-500 outline-none" />
              <select value={hStatus} onChange={e => setHStatus(e.target.value)}
                className="px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-semibold focus:border-blue-500 outline-none">
                <option value="All">All Statuses</option>
                {ATT_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
            {(hClass || hStatus !== "All" || hSearch) && (
              <div className="flex items-center gap-2 flex-wrap">
                {hSearch  && <Pill color="blue">"{hSearch}"</Pill>}
                {hClass   && <Pill color="indigo">{hClass}</Pill>}
                {hDate    && <Pill color="green">{fmtDate(hDate)}</Pill>}
                {hStatus !== "All" && <Pill color={statColor[hStatus] || "slate"}>{hStatus}</Pill>}
                <span className="text-xs text-slate-400 font-bold">{historyData.length} record{historyData.length !== 1 ? "s" : ""}</span>
                <button onClick={() => { setHSearch(""); setHClass(""); setHDate(today()); setHStatus("All"); }}
                  className="text-xs font-black uppercase text-red-400 hover:text-red-600 flex items-center gap-1">
                  <X size={11} />Clear
                </button>
              </div>
            )}
          </Card>

          {historyData.length === 0 ? (
            <EmptyState icon={Clock} title="No attendance records found" subtitle="Mark attendance in the Mark tab to see history here" />
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      {["Student", "Class", "Date", "Status", "Note", ""].map((h, i) => (
                        <th key={i} className="px-4 py-3 text-xs font-black uppercase text-slate-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {historyData.map(a => {
                      const sc: Record<string, string> = {
                        present: "bg-emerald-100 text-emerald-700",
                        absent:  "bg-red-100 text-red-700",
                        late:    "bg-amber-100 text-amber-700",
                        excused: "bg-indigo-100 text-indigo-700",
                      };
                      return (
                        <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 font-black text-sm text-slate-900">{a.studentName}</td>
                          <td className="px-4 py-3 text-xs font-bold text-slate-600">{a.studentClass}</td>
                          <td className="px-4 py-3 text-xs font-bold text-slate-600">{fmtDate(a.date)}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-black uppercase px-2 py-1 rounded-lg ${sc[a.status] || "bg-slate-100 text-slate-600"}`}>{a.status}</span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500 max-w-xs truncate">{a.note || <span className="text-slate-300 italic">—</span>}</td>
                          <td className="px-4 py-3">
                            <button onClick={() => dispatch({ type: "DELETE_ATTENDANCE", id: a.id })}
                              className="p-1.5 rounded-lg text-red-400 hover:text-white hover:bg-red-500 transition-all">
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Main App
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [appState, dispatch] = useReducer(appReducer, initialState);
  const { toast, showToast } = useToast();
  const adminPinRef = useRef(DEFAULT_PIN);
  const logoRef = useRef<HTMLInputElement>(null);
  const [schoolLogo, setSchoolLogo] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [showLogout, setShowLogout] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [dlg, setDlg] = useState<any>(null);
  const [showBin, setShowBin] = useState(false);
  const [staffDetailId, setStaffDetailId] = useState<string | null>(null);
  const [auth, setAuth] = useState<{ loggedIn: boolean; user: StaffMember | null }>({ loggedIn: false, user: null });
  const [loginId, setLoginId] = useState("admin");
  const [loginPass, setLoginPass] = useState("");
  const [loginErr, setLoginErr] = useState("");
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotStep, setForgotStep] = useState(1);
  const [forgotInput, setForgotInput] = useState("");
  const [dbSearch, setDbSearch] = useState("");
  const [dbClass,  setDbClass]  = useState("");
  const [dbDate,   setDbDate]   = useState("");
  const [rpSearch, setRpSearch] = useState("");
  const [rpClass,  setRpClass]  = useState("All");
  const [activeReport, setActiveReport] = useState<any>(null);
  const [scoreForm, setScoreForm] = useState({ studentName:"", studentClass:"", subject:"", caScore:"", examScore:"" });

  const { entries, bin, logs, attendance, classRolls, staffList, schoolSettings } = appState;
  const isAdmin = !auth.user;
  const can = useCallback((p: string) => isAdmin || (auth.user?.permissions?.[p] ?? false), [isAdmin, auth.user]);

  const subjectList = useMemo(() => {
    const cat = Object.values(CURRICULUM).find(c => c.classes.includes(scoreForm.studentClass));
    return cat ? cat.subjects : [];
  }, [scoreForm.studentClass]);

  const allKnownStudents = useMemo(() => {
    const fromRolls = Object.entries(classRolls).flatMap(([cls, students]) =>
      students.map(s => ({ name: s.name, class: cls }))
    );
    const fromEntries = entries.map(e => ({ name: e.studentName, class: e.studentClass }));
    const map: Record<string, { name: string; class: string }> = {};
    [...fromRolls, ...fromEntries].forEach(s => { map[`${s.name}||${s.class}`] = s; });
    return Object.values(map);
  }, [classRolls, entries]);

  const classSuggestions = useMemo(() => {
    if (!scoreForm.studentClass) return [];
    return allKnownStudents.filter(s => s.class === scoreForm.studentClass).map(s => s.name).sort();
  }, [allKnownStudents, scoreForm.studentClass]);

  const studentList = useMemo(() => {
    const m: Record<string, { name: string; class: string; id: string }> = {};
    entries.forEach(e => {
      const k = `${e.studentName}||${e.studentClass}`;
      if (!m[k]) m[k] = { name: e.studentName, class: e.studentClass, id: k };
    });
    return Object.values(m);
  }, [entries]);

  const filteredStudents = useMemo(() =>
    studentList.filter(s =>
      s.name.toLowerCase().includes(rpSearch.toLowerCase()) &&
      (rpClass === "All" || s.class === rpClass)
    ),
  [studentList, rpSearch, rpClass]);

  const filteredEntries = useMemo(() =>
    entries.filter(e =>
      (!dbSearch || e.studentName.toLowerCase().includes(dbSearch.toLowerCase())) &&
      (!dbClass  || e.studentClass === dbClass) &&
      (!dbDate   || e.createdAt.slice(0, 10) === dbDate)
    ),
  [entries, dbSearch, dbClass, dbDate]);

  const curC = useMemo(() =>
    activeReport
      ? (appState.comments[activeReport.id] || { teacher:"", principal:"", teacherSig:"", principalSig:"", daysOpen:"", daysPresent:"", daysAbsent:"" })
      : { teacher:"", principal:"", teacherSig:"", principalSig:"", daysOpen:"", daysPresent:"", daysAbsent:"" },
  [activeReport, appState.comments]);

  const attRate = useMemo(() => {
    const o = parseInt(curC.daysOpen) || 0, p = parseInt(curC.daysPresent) || 0;
    return o > 0 ? Math.round(p / o * 100) : null;
  }, [curC]);

  const navigate = useCallback((id: string) => {
    setActiveTab(id);
    setMenuOpen(false);
    setStaffDetailId(null);
  }, []);

  const TABS = useMemo(() => [
    { id:"dashboard",  label:"Dashboard",  icon:LayoutDashboard, show:true,                                   primary:true },
    { id:"entry",      label:"Score Entry",icon:PlusCircle,       show:can("scoreEntry"),                     primary:true },
    { id:"database",   label:"Records",    icon:Database,         show:isAdmin||can("manageRecords")||can("scoreEntry"), primary:true },
    { id:"reports",    label:"Reports",    icon:FileText,         show:can("viewReports"),                    primary:true },
    { id:"attendance", label:"Attendance", icon:CalendarDays,     show:can("scoreEntry")||isAdmin,            primary:false },
    { id:"staff",      label:"Staff",      icon:Users,            show:isAdmin,                               primary:false },
    { id:"settings",   label:"Settings",   icon:Settings,         show:isAdmin,                               primary:false },
  ].filter(t => t.show), [can, isAdmin]);

  const primaryTabs = useMemo(() => TABS.filter(t => t.primary), [TABS]);
  const moreTabs    = useMemo(() => TABS.filter(t => !t.primary), [TABS]);

  const doLogin = useCallback(() => {
    setLoginErr("");
    if (loginId.toLowerCase() === "admin") {
      if (!loginPass) return setLoginErr("Enter a password");
      setAuth({ loggedIn: true, user: null });
      return;
    }
    const s = staffList.find(st => st.name.toLowerCase() === loginId.toLowerCase() && st.pin === loginPass);
    if (!s) return setLoginErr("Invalid name or PIN");
    if (s.status === "revoked") return setLoginErr("Your access has been revoked.");
    setAuth({ loggedIn: true, user: s });
    if (s.status === "restricted") showToast("Account restricted — limited access.", "warning");
  }, [loginId, loginPass, staffList, showToast]);

  const submitScore = useCallback(() => {
    const { studentName, studentClass, subject, caScore, examScore } = scoreForm;
    if (!studentName.trim() || !studentClass || !subject || caScore === "" || examScore === "")
      return showToast("Fill in all fields.", "error");
    if (entries.some(e =>
      e.studentName.toLowerCase().trim() === studentName.toLowerCase().trim() &&
      e.studentClass === studentClass && e.subject === subject
    )) return showToast(`${subject} already exists for ${studentName}.`, "error");
    const ca = parseFloat(caScore) || 0, ex = parseFloat(examScore) || 0;
    if (ca < 0 || ca > 40) return showToast("CA score must be 0–40", "error");
    if (ex < 0 || ex > 60) return showToast("Exam score must be 0–60", "error");
    dispatch({
      type: "ADD_ENTRY",
      payload: { studentName: studentName.trim(), studentClass, subject, caScore: ca, examScore: ex, id: uid(), total: ca + ex, createdAt: new Date().toISOString() },
    });
    showToast("Score saved");
    setScoreForm(f => ({ ...f, caScore: "", examScore: "" }));
  }, [scoreForm, entries, showToast]);

  const openReport = useCallback((student: { name: string; class: string; id: string }) => {
    const records = entries.filter(e =>
      e.studentName.toLowerCase() === student.name.toLowerCase() && e.studentClass === student.class
    );
    if (!records.length) return showToast("No records found", "error");
    const names = [...new Set(entries.filter(e => e.studentClass === student.class).map(e => e.studentName.toLowerCase().trim()))];
    const standings = names
      .map(n => ({ name: n, total: entries.filter(e => e.studentName.toLowerCase().trim() === n && e.studentClass === student.class).reduce((a, c) => a + c.total, 0) }))
      .sort((a, b) => b.total - a.total);
    const pos = standings.findIndex(s => s.name === student.name.toLowerCase().trim()) + 1;
    const total = records.reduce((a, c) => a + c.total, 0);
    setActiveReport({
      id: student.id,
      name: student.name,
      class: student.class,
      records,
      position: getOrdinal(pos),
      classCount: names.length,
      summary: { total, obtainable: records.length * 100, avg: records.length ? (total / records.length).toFixed(1) : "0.0" },
    });
    setActiveTab("reports");
  }, [entries, showToast]);

  const saveStaff = useCallback((sd: StaffMember) => {
    const isEdit = appState.staffList.some(s => s.id === sd.id);
    dispatch({ type: "SAVE_STAFF", payload: sd });
    showToast(`${sd.name} ${isEdit ? "updated" : "created successfully"}`);
    setDlg(null);
  }, [appState.staffList, showToast]);

  const ctxValue = useMemo<AppCtxType>(() => ({ state: appState, dispatch, showToast }), [appState, showToast]);

  // ── Auto-save to localStorage whenever state changes ──────────────────────
  useEffect(() => {
    debouncedSaveDB(appState);
  }, [appState]);

  // ── Forgot password ────────────────────────────────────────────────────────
  if (!auth.loggedIn && forgotOpen) return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <Card className="w-full max-w-sm p-8 border-t-4 border-t-amber-500">
        <div className="text-center mb-6">
          <div className="inline-flex p-3 bg-amber-100 rounded-2xl mb-3"><ShieldAlert size={28} className="text-amber-600" /></div>
          <h2 className="text-xl font-black text-slate-900">Password Recovery</h2>
        </div>
        {forgotStep === 1 ? (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-700 font-medium">
              Enter the registered school name to verify identity.
            </div>
            <Inp
              label="Registered School Name"
              value={forgotInput}
              onChange={(e: any) => setForgotInput(e.target.value)}
              onKeyDown={(e: any) => e.key === "Enter" && (forgotInput.toLowerCase() === schoolSettings.name.toLowerCase() ? setForgotStep(2) : showToast("School name does not match", "error"))}
              placeholder={schoolSettings.name}
            />
            <Btn variant="primary" size="lg" className="w-full"
              onClick={() => forgotInput.toLowerCase() === schoolSettings.name.toLowerCase() ? setForgotStep(2) : showToast("School name does not match", "error")}>
              Verify Identity
            </Btn>
            <button onClick={() => { setForgotOpen(false); setForgotStep(1); setForgotInput(""); }}
              className="w-full text-xs font-black uppercase text-slate-400 hover:text-slate-600 py-2">
              ← Back to Login
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-5 text-center space-y-3">
              <Check size={28} className="text-emerald-500 mx-auto" />
              <p className="text-xs font-black uppercase text-emerald-700">Identity Verified</p>
              <p className="text-xs text-slate-500">Admin accepts any non-empty password. Staff use full name + assigned PIN.</p>
              <div className="bg-white border border-emerald-200 rounded-lg p-3">
                <p className="text-xs text-slate-400 font-bold uppercase mb-1">Default Admin PIN</p>
                <p className="text-3xl font-black text-slate-900 tracking-widest">1234</p>
              </div>
            </div>
            <Btn variant="ghost" size="lg" className="w-full" onClick={() => { setForgotOpen(false); setForgotStep(1); setForgotInput(""); }}>
              Back to Login
            </Btn>
          </div>
        )}
      </Card>
      {toast && <Toast toast={toast} />}
    </div>
  );

  // ── Login ──────────────────────────────────────────────────────────────────
  if (!auth.loggedIn) return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <Card className="w-full max-w-sm p-8 border-t-4 border-t-blue-600">
        <div className="text-center mb-8">
          <SchoolLogo logoUrl={schoolLogo} size="lg" className="mx-auto mb-4" />
          <h1 className="text-xl font-black text-slate-900">{schoolSettings.name}</h1>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Staff Authentication</p>
        </div>
        <div className="space-y-4">
          <Inp label="Name / Username" value={loginId} onChange={(e: any) => { setLoginId(e.target.value); setLoginErr(""); }} placeholder="admin or staff full name" />
          <Field label="Password / PIN" error={loginErr}>
            <input
              type="password"
              value={loginPass}
              onChange={e => { setLoginPass(e.target.value); setLoginErr(""); }}
              onKeyDown={e => e.key === "Enter" && doLogin()}
              placeholder="••••••••"
              className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-semibold text-sm focus:border-blue-500 focus:bg-white outline-none transition-all"
            />
          </Field>
          <div className="text-right -mt-1">
            <button onClick={() => setForgotOpen(true)} className="text-xs font-black uppercase text-blue-500 hover:text-blue-700 transition-colors">
              Forgot Password?
            </button>
          </div>
          <Btn variant="primary" size="lg" className="w-full" onClick={doLogin}>Launch Portal</Btn>
          <p className="text-xs text-slate-400 text-center">
            Admin: <code className="font-black bg-slate-100 px-1 rounded">admin</code> + any password · Staff: full name + PIN
          </p>
        </div>
      </Card>
      {toast && <Toast toast={toast} />}
    </div>
  );

  // ── Main App ───────────────────────────────────────────────────────────────
  return (
    <AppCtx.Provider value={ctxValue}>
      <div className="flex h-screen overflow-hidden bg-slate-100">

        {/* Sidebar */}
        <aside className="hidden md:flex flex-col w-60 bg-white border-r border-slate-100 flex-shrink-0">
          <div className="p-5 border-b border-slate-100 flex items-center gap-3">
            <SchoolLogo logoUrl={schoolLogo} size="sm" />
            <div className="min-w-0">
              <p className="font-black text-sm text-slate-900 truncate">{schoolSettings.name}</p>
              <p className="text-xs text-slate-400">{schoolSettings.term}</p>
            </div>
          </div>
          <div className="px-4 py-3 border-b border-slate-100">
            <div className={`flex items-center gap-2.5 p-2.5 rounded-xl ${isAdmin ? "bg-blue-50" : "bg-slate-50"}`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-white ${isAdmin ? "bg-blue-600" : "bg-indigo-500"}`}>
                {isAdmin ? <Shield size={14} /> : <span className="font-black text-xs">{auth.user!.name[0]}</span>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black text-slate-900 truncate">{isAdmin ? "Super Admin" : auth.user!.name}</p>
                <p className="text-xs text-slate-400 truncate">{isAdmin ? "Full Access" : auth.user!.role}</p>
              </div>
              {auth.user && <StatusPill status={auth.user.status} />}
            </div>
          </div>
          <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
            {TABS.map(t => (
              <button key={t.id} onClick={() => navigate(t.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === t.id ? "bg-blue-50 text-blue-600" : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"}`}>
                <t.icon size={18} className="flex-shrink-0" />
                <span className="text-sm font-bold">{t.label}</span>
                {t.id === "database" && bin.length > 0 && (
                  <span className="ml-auto text-xs font-black bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center">{bin.length}</span>
                )}
              </button>
            ))}
          </nav>
          <div className="p-3 border-t border-slate-100">
            <button onClick={() => setShowLogout(true)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-500 hover:bg-red-50 hover:text-red-600 transition-all font-bold text-sm group">
              <LogOut size={18} className="group-hover:translate-x-0.5 transition-transform" />Sign Out
            </button>
          </div>
        </aside>

        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Mobile top bar */}
          <header className="md:hidden bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between flex-shrink-0 z-40 relative">
            <div className="flex items-center gap-2.5">
              <SchoolLogo logoUrl={schoolLogo} size="xs" />
              <p className="font-black text-sm text-slate-900 truncate max-w-[160px]">{schoolSettings.name}</p>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setShowLogout(true)} className="p-2 text-slate-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50">
                <LogOut size={18} />
              </button>
              <button onClick={() => setMenuOpen(o => !o)}
                className={`p-2 rounded-lg transition-all ${menuOpen ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100"}`}>
                <Menu size={20} />
              </button>
            </div>
          </header>

          {/* Mobile dropdown */}
          {menuOpen && (
            <div className="md:hidden absolute top-[57px] left-0 right-0 bg-white border-b border-slate-100 shadow-xl z-50 px-4 py-3 space-y-1">
              <div className={`flex items-center gap-2.5 p-3 rounded-xl mb-3 ${isAdmin ? "bg-blue-50" : "bg-slate-50"}`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-white ${isAdmin ? "bg-blue-600" : "bg-indigo-500"}`}>
                  {isAdmin ? <Shield size={14} /> : <span className="font-black text-xs">{auth.user!.name[0]}</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black text-slate-900 truncate">{isAdmin ? "Super Admin" : auth.user!.name}</p>
                  <p className="text-xs text-slate-400">{isAdmin ? "Full Access" : auth.user!.role}</p>
                </div>
                {auth.user && <StatusPill status={auth.user.status} />}
              </div>
              <p className="text-xs font-black uppercase text-slate-400 tracking-wide px-2 pb-1">Navigation</p>
              {TABS.map(t => (
                <button key={t.id} onClick={() => navigate(t.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all ${activeTab === t.id ? "bg-blue-50 text-blue-600 font-black" : "text-slate-600 font-bold hover:bg-slate-50"}`}>
                  <t.icon size={18} className="flex-shrink-0" />
                  <span className="text-sm">{t.label}</span>
                  {t.id === "database" && bin.length > 0 && (
                    <span className="ml-auto text-xs font-black bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center">{bin.length}</span>
                  )}
                </button>
              ))}
              <div className="pt-2 border-t border-slate-100 mt-1">
                <button onClick={() => { setShowLogout(true); setMenuOpen(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-500 hover:bg-red-50 transition-all font-bold text-sm">
                  <LogOut size={18} />Sign Out
                </button>
              </div>
            </div>
          )}

          {/* Main content — FIX: backdrop closes menu on tap */}
          <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 relative">
            {menuOpen && (
              <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMenuOpen(false)} />
            )}
            <div className="max-w-5xl mx-auto space-y-6 pb-8">

              {/* DASHBOARD */}
              {activeTab === "dashboard" && (
                <>
                  <div>
                    <h1 className="text-2xl font-black text-slate-900 uppercase">Dashboard</h1>
                    <p className="text-sm text-slate-400 mt-0.5">{schoolSettings.term} · {schoolSettings.session}</p>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {([
                      ["Students",     studentList.length,                                                          "border-l-blue-500"],
                      ["Records",      entries.length,                                                              "border-l-emerald-500"],
                      ["Active Staff", `${staffList.filter(s => s.status === "active").length}/${staffList.length}`,"border-l-indigo-500"],
                    ] as const).map(([l, v, a]) => (
                      <Card key={l} className={`p-5 border-l-4 ${a}`}>
                        <p className="text-xs font-black uppercase text-slate-400 tracking-wide mb-1">{l}</p>
                        <p className="text-2xl font-black text-slate-900">{v}</p>
                      </Card>
                    ))}
                    <Card className="p-5 bg-slate-900 border-slate-900 col-span-2 md:col-span-1">
                      <p className="text-xs font-black uppercase text-blue-400 tracking-wide mb-1">Session</p>
                      <p className="text-lg font-black text-white leading-tight">{schoolSettings.session || "—"}</p>
                      <p className="text-xs text-slate-400 mt-1 font-bold">{schoolSettings.term || "—"}</p>
                    </Card>
                  </div>
                  {logs.length > 0 && (
                    <Card>
                      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                        <Clock size={14} className="text-slate-400" />
                        <p className="text-sm font-black uppercase text-slate-600">Activity Log</p>
                      </div>
                      <div className="divide-y divide-slate-50">
                        {logs.slice(0, 8).map((log: any) => {
                          const { date, time } = fmtTs(log.ts);
                          const ac = log.action === "Deleted" ? "bg-red-100 text-red-600" : log.action === "Restored" ? "bg-emerald-100 text-emerald-700" : log.action.includes("Revok") ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700";
                          return (
                            <div key={log.id} className="flex items-center justify-between gap-3 px-5 py-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <span className={`text-xs font-black px-2 py-0.5 rounded-md flex-shrink-0 ${ac}`}>{log.action}</span>
                                <div className="min-w-0">
                                  <p className="text-xs font-black text-slate-900 truncate">{log.student}</p>
                                  <p className="text-xs text-slate-500 truncate">{log.subject}{log.detail && ` · ${log.detail}`}</p>
                                </div>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="text-xs font-bold text-slate-500">{time}</p>
                                <p className="text-xs text-slate-400">{date}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </Card>
                  )}
                </>
              )}

              {/* SCORE ENTRY */}
              {activeTab === "entry" && can("scoreEntry") && (
                <div className="max-w-xl mx-auto">
                  <Card className="overflow-hidden">
                    <div className="bg-blue-600 px-6 py-4 flex items-center gap-3">
                      <BookOpen size={18} className="text-white/80" />
                      <p className="text-white font-black uppercase tracking-widest text-sm">Score Submission</p>
                    </div>
                    <div className="p-6 space-y-5">
                      <div className="space-y-1.5">
                        <label className="block text-xs font-black uppercase text-slate-400 tracking-wide">Student Name</label>
                        <input
                          list="student-suggestions"
                          value={scoreForm.studentName}
                          onChange={e => setScoreForm(f => ({ ...f, studentName: e.target.value }))}
                          placeholder="Student full name"
                          className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-semibold text-sm text-slate-900 focus:border-blue-500 focus:bg-white outline-none transition-all placeholder:text-slate-300"
                        />
                        <datalist id="student-suggestions">
                          {classSuggestions.map(n => <option key={n} value={n} />)}
                        </datalist>
                        {classSuggestions.length > 0 && (
                          <p className="text-xs text-blue-600 font-bold">{classSuggestions.length} student{classSuggestions.length !== 1 ? "s" : ""} on roll — type to filter</p>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <Sel
                          label="Class"
                          value={scoreForm.studentClass}
                          onChange={(e: any) => setScoreForm(f => ({ ...f, studentClass: e.target.value, subject: "", studentName: "" }))}
                        >
                          <option value="">Select class</option>
                          {(auth.user?.assignedClasses?.length ? auth.user.assignedClasses : ALL_CLASSES).map(c => <option key={c}>{c}</option>)}
                        </Sel>
                        <Sel
                          label="Subject"
                          value={scoreForm.subject}
                          onChange={(e: any) => setScoreForm(f => ({ ...f, subject: e.target.value }))}
                          disabled={!scoreForm.studentClass}
                        >
                          <option value="">Select subject</option>
                          {subjectList.map(s => <option key={s}>{s}</option>)}
                        </Sel>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        {([
                          ["caScore",   "CA Score (max 40)",   40],
                          ["examScore", "Exam Score (max 60)", 60],
                        ] as const).map(([field, label, max]) => (
                          <div key={field} className="space-y-1.5">
                            <label className="block text-xs font-black uppercase text-slate-400 tracking-wide">{label}</label>
                            <input
                              type="number"
                              min="0"
                              max={max}
                              step="0.5"
                              value={scoreForm[field]}
                              placeholder={`0–${max}`}
                              onChange={e => {
                                const v = e.target.value;
                                if (v === "" || (+v >= 0 && +v <= max))
                                  setScoreForm(f => ({ ...f, [field]: v }));
                              }}
                              onKeyDown={e => ["-","e","E","+"].includes(e.key) && e.preventDefault()}
                              className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-black text-center text-lg focus:border-blue-500 focus:bg-white outline-none transition-all"
                            />
                          </div>
                        ))}
                      </div>
                      {/* Score preview */}
                      {(scoreForm.caScore !== "" || scoreForm.examScore !== "") && (() => {
                        const t = (+scoreForm.caScore || 0) + (+scoreForm.examScore || 0);
                        const g = getGrade(t);
                        return (
                          <div className="bg-slate-50 rounded-xl p-4 text-center border-2 border-slate-100">
                            <p className="text-xs font-black uppercase text-slate-400 mb-1">Total Preview</p>
                            <p className="text-4xl font-black text-slate-900">{t}<span className="text-lg text-slate-400">/100</span></p>
                            <span className="inline-block mt-1 px-3 py-0.5 rounded-full text-xs font-black uppercase" style={{ background: g.bg, color: g.color }}>
                              {g.grade} — {g.remark}
                            </span>
                          </div>
                        );
                      })()}
                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <Btn variant="ghost" onClick={() => { setScoreForm({ studentName:"", studentClass:"", subject:"", caScore:"", examScore:"" }); showToast("Form cleared"); }}>
                          Clear
                        </Btn>
                        <Btn variant="primary" onClick={submitScore}><Check size={14} />Save Grade</Btn>
                      </div>
                    </div>
                  </Card>
                </div>
              )}

              {/* RECORDS */}
              {activeTab === "database" && (
                <>
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <h1 className="text-2xl font-black text-slate-900 uppercase">Records</h1>
                      <p className="text-sm text-slate-400">{entries.length} active · {bin.length} in bin</p>
                    </div>
                    {(isAdmin || can("manageRecords")) && (
                      <Btn variant={showBin ? "primary" : "outline"} onClick={() => setShowBin(b => !b)}>
                        <RotateCcw size={14} />{showBin ? "View Active" : `Bin${bin.length ? ` (${bin.length})` : ""}`}
                      </Btn>
                    )}
                  </div>
                  {!showBin && (
                    <Card className="p-4 space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="relative">
                          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input value={dbSearch} onChange={e => setDbSearch(e.target.value)} placeholder="Search by name…"
                            className="w-full pl-9 pr-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-semibold focus:border-blue-500 focus:bg-white outline-none transition-all" />
                        </div>
                        <select value={dbClass} onChange={e => setDbClass(e.target.value)}
                          className="px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-semibold focus:border-blue-500 outline-none">
                          <option value="">All Classes</option>
                          {ALL_CLASSES.map(c => <option key={c}>{c}</option>)}
                        </select>
                        <input type="date" value={dbDate} onChange={e => setDbDate(e.target.value)}
                          className="px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-semibold focus:border-blue-500 outline-none" />
                      </div>
                      {(dbSearch || dbClass || dbDate) && (
                        <div className="flex items-center gap-2 flex-wrap">
                          {dbSearch && <Pill color="blue">Name: "{dbSearch}"</Pill>}
                          {dbClass  && <Pill color="indigo">{dbClass}</Pill>}
                          {dbDate   && <Pill color="green">{new Date(dbDate + "T00:00:00").toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" })}</Pill>}
                          <span className="text-xs text-slate-400 font-bold">{filteredEntries.length} result{filteredEntries.length !== 1 ? "s" : ""}</span>
                          <button onClick={() => { setDbSearch(""); setDbClass(""); setDbDate(""); }}
                            className="text-xs font-black uppercase text-red-400 hover:text-red-600 flex items-center gap-1">
                            <X size={11} />Clear
                          </button>
                        </div>
                      )}
                    </Card>
                  )}
                  {!showBin && (
                    entries.length === 0
                      ? <EmptyState icon={Database} title="No records yet" subtitle="Add scores in the Score Entry tab" />
                      : filteredEntries.length === 0
                        ? <EmptyState icon={Search} title="No matching records"
                            action={<Btn variant="ghost" size="sm" onClick={() => { setDbSearch(""); setDbClass(""); setDbDate(""); }}>Clear filters</Btn>} />
                        : (
                          <Card className="overflow-hidden">
                            <div className="overflow-x-auto">
                              <table className="w-full text-left">
                                <thead className="bg-slate-50 border-b border-slate-100">
                                  <tr>
                                    {["Student","Class","Subject","CA","Exam","Total","Grade","Logged"].map((h, i) => (
                                      <th key={i} className={`px-4 py-3 text-xs font-black uppercase text-slate-400 ${[3,4,5,6].includes(i) ? "text-center" : ""}`}>{h}</th>
                                    ))}
                                    {(isAdmin || can("manageRecords")) && <th className="px-4 py-3" />}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                  {filteredEntries.map(e => {
                                    const g = getGrade(e.total);
                                    const { date, time } = fmtTs(e.createdAt);
                                    return (
                                      <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-3 font-black text-sm text-slate-900">{e.studentName}</td>
                                        <td className="px-4 py-3 text-xs font-bold text-slate-600">{e.studentClass}</td>
                                        <td className="px-4 py-3 text-xs font-bold text-blue-600">{e.subject}</td>
                                        <td className="px-4 py-3 text-xs font-bold text-center">{e.caScore}</td>
                                        <td className="px-4 py-3 text-xs font-bold text-center">{e.examScore}</td>
                                        <td className="px-4 py-3 text-sm font-black text-center">{e.total}</td>
                                        <td className="px-4 py-3 text-center">
                                          <span className="text-xs font-black px-2 py-0.5 rounded-md" style={{ background: g.bg, color: g.color }}>{g.grade}</span>
                                        </td>
                                        <td className="px-4 py-3">
                                          <p className="text-xs font-bold text-slate-600">{time}</p>
                                          <p className="text-xs text-slate-400">{date}</p>
                                        </td>
                                        {(isAdmin || can("manageRecords")) && (
                                          <td className="px-4 py-3 text-center">
                                            <button onClick={() => setDlg({ type:"delete", data:e })}
                                              className="p-1.5 rounded-lg text-red-400 hover:text-white hover:bg-red-500 transition-all">
                                              <Trash2 size={14} />
                                            </button>
                                          </td>
                                        )}
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </Card>
                        )
                  )}
                  {showBin && (
                    bin.length === 0
                      ? <EmptyState icon={RotateCcw} title="Recycle bin is empty" />
                      : (
                        <Card className="overflow-hidden border-amber-200">
                          <div className="bg-amber-50 px-5 py-3 border-b border-amber-100 flex items-center gap-2">
                            <AlertTriangle size={13} className="text-amber-500" />
                            <p className="text-xs font-black uppercase text-amber-700">Recycle Bin — {bin.length} item{bin.length !== 1 ? "s" : ""}</p>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-left">
                              <thead className="bg-slate-50 border-b border-slate-100">
                                <tr>{["Student","Class","Subject","Total","Created","Deleted",""].map((h, i) => (
                                  <th key={i} className="px-4 py-3 text-xs font-black uppercase text-slate-400">{h}</th>
                                ))}</tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                {bin.map(e => {
                                  const g = getGrade(e.total);
                                  const cr = fmtTs(e.createdAt);
                                  const dl = fmtTs(e.deletedAt);
                                  return (
                                    <tr key={e.id} className="hover:bg-amber-50 transition-colors">
                                      <td className="px-4 py-3 font-black text-sm text-slate-700">{e.studentName}</td>
                                      <td className="px-4 py-3 text-xs font-bold text-slate-500">{e.studentClass}</td>
                                      <td className="px-4 py-3 text-xs font-bold text-slate-400 line-through">{e.subject}</td>
                                      <td className="px-4 py-3">
                                        <span className="text-xs font-black px-2 py-0.5 rounded-md" style={{ background: g.bg, color: g.color }}>{e.total} · {g.grade}</span>
                                      </td>
                                      <td className="px-4 py-3"><p className="text-xs font-bold text-slate-500">{cr.time}</p><p className="text-xs text-slate-400">{cr.date}</p></td>
                                      <td className="px-4 py-3"><p className="text-xs font-bold text-red-400">{dl.time}</p><p className="text-xs text-red-300">{dl.date}</p></td>
                                      <td className="px-4 py-3">
                                        <button onClick={() => setDlg({ type:"restore", data:e })}
                                          className="p-1.5 rounded-lg text-emerald-500 hover:text-white hover:bg-emerald-500 transition-all">
                                          <RotateCcw size={14} />
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </Card>
                      )
                  )}
                </>
              )}

              {/* REPORTS */}
              {activeTab === "reports" && can("viewReports") && (
                !activeReport ? (
                  <>
                    <div>
                      <h1 className="text-2xl font-black text-slate-900 uppercase">Reports</h1>
                      <p className="text-sm text-slate-400">{filteredStudents.length} student{filteredStudents.length !== 1 ? "s" : ""} found</p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="relative flex-1">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input value={rpSearch} onChange={e => setRpSearch(e.target.value)} placeholder="Search student…"
                          className="w-full pl-9 pr-4 py-3 bg-white border-2 border-slate-100 rounded-xl text-sm font-semibold focus:border-blue-500 outline-none shadow-sm transition-all" />
                      </div>
                      <select value={rpClass} onChange={e => setRpClass(e.target.value)}
                        className="px-4 py-3 bg-white border-2 border-slate-100 rounded-xl text-sm font-semibold focus:border-blue-500 outline-none shadow-sm">
                        <option value="All">All Classes</option>
                        {ALL_CLASSES.map(c => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                    {filteredStudents.length === 0
                      ? <EmptyState icon={FileText} title="No students found" subtitle="Add scores to see students here" />
                      : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {filteredStudents.map(s => (
                            <button key={s.id} onClick={() => openReport(s)}
                              className="p-5 bg-white border-2 border-slate-100 rounded-2xl flex items-center justify-between text-left group hover:border-blue-400 hover:shadow-md transition-all">
                              <div>
                                <p className="font-black text-sm uppercase text-slate-900">{s.name}</p>
                                <p className="text-xs font-bold text-slate-400 mt-0.5">{s.class}</p>
                              </div>
                              <FileText size={18} className="text-slate-300 group-hover:text-blue-500 transition-colors" />
                            </button>
                          ))}
                        </div>
                      )}
                  </>
                ) : (
                  <div className="space-y-5 max-w-3xl mx-auto">
                    <button onClick={() => setActiveReport(null)}
                      className="flex items-center gap-2 text-xs font-black uppercase text-slate-400 hover:text-slate-700 transition-colors">
                      <X size={13} />Back to Students
                    </button>
                    <Card className="overflow-hidden">
                      <div className="bg-blue-600 px-6 py-4 flex items-center gap-3">
                        <PenTool size={16} className="text-white/80" />
                        <p className="text-white font-black uppercase tracking-widest text-sm">Report Editor — {activeReport.name}</p>
                      </div>
                      <div className="p-6 space-y-5">
                        <div>
                          <p className="text-xs font-black uppercase text-slate-400 tracking-wide mb-3">Attendance</p>
                          <div className="grid grid-cols-3 gap-3">
                            {([
                              ["daysOpen",    "Days Opened",  "slate"],
                              ["daysPresent", "Days Present", "emerald"],
                              ["daysAbsent",  "Days Absent",  "red"],
                            ] as const).map(([f, l, c]) => (
                              <div key={f}>
                                <label className="block text-xs font-black uppercase text-slate-400 mb-1.5">{l}</label>
                                <input
                                  type="number" min="0" max="365" placeholder="0"
                                  value={curC[f] || ""}
                                  onChange={e => {
                                    const v = e.target.value;
                                    if (v === "" || (+v >= 0 && +v <= 365))
                                      dispatch({ type:"SET_COMMENT", studentId:activeReport.id, field:f, value:v });
                                  }}
                                  onKeyDown={e => ["-","e","E","+"].includes(e.key) && e.preventDefault()}
                                  className={`w-full px-3 py-3 rounded-xl border-2 font-black text-center text-xl outline-none transition-all ${c === "emerald" ? "bg-emerald-50 border-emerald-100 focus:border-emerald-400" : c === "red" ? "bg-red-50 border-red-100 focus:border-red-400" : "bg-slate-50 border-slate-100 focus:border-slate-400"}`}
                                />
                              </div>
                            ))}
                          </div>
                          {attRate !== null && (
                            <p className={`mt-2 text-center text-sm font-black ${attRate >= 75 ? "text-emerald-600" : "text-red-500"}`}>
                              Attendance Rate: {attRate}% {attRate >= 75 ? "✓" : "⚠"}
                            </p>
                          )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          {([
                            ["teacher",   "Class Teacher's Remark", "teacherSig",   "Teacher Signature"],
                            ["principal", "Principal's Remark",     "principalSig", "Principal's Signature"],
                          ] as const).map(([f, l, sf, sl]) => (
                            <div key={f} className="space-y-2">
                              <label className="block text-xs font-black uppercase text-slate-400 tracking-wide">{l}</label>
                              <textarea
                                value={curC[f] || ""}
                                onChange={e => dispatch({ type:"SET_COMMENT", studentId:activeReport.id, field:f, value:e.target.value })}
                                rows={3} placeholder="Enter remark…"
                                className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-medium focus:border-blue-500 outline-none transition-all resize-none"
                              />
                              <input
                                value={curC[sf] || ""}
                                onChange={e => dispatch({ type:"SET_COMMENT", studentId:activeReport.id, field:sf, value:e.target.value })}
                                placeholder={sl}
                                className="w-full px-3 py-2 bg-slate-50 border-2 border-slate-100 rounded-xl text-xs font-black uppercase tracking-wide focus:border-blue-500 outline-none transition-all"
                              />
                            </div>
                          ))}
                        </div>
                        {can("printReports") && (
                          <Btn variant="primary" size="lg" className="w-full" onClick={() => setShowPrint(true)}>
                            <Printer size={16} />Print / Export Report
                          </Btn>
                        )}
                      </div>
                    </Card>
                    <ReportSheet report={activeReport} curC={curC} attRate={attRate} schoolLogo={schoolLogo} schoolSettings={schoolSettings} />
                  </div>
                )
              )}

              {/* ATTENDANCE */}
              {activeTab === "attendance" && (can("scoreEntry") || isAdmin) && <AttendanceTab />}

              {/* STAFF */}
              {activeTab === "staff" && isAdmin && (() => {
                const detailStaff = staffDetailId ? staffList.find(s => s.id === staffDetailId) : null;

                // ── Staff Detail View ──────────────────────────────────────
                if (detailStaff) return (
                  <div className="space-y-5 max-w-2xl mx-auto">
                    {/* Back nav */}
                    <button onClick={() => setStaffDetailId(null)}
                      className="flex items-center gap-2 text-xs font-black uppercase text-slate-400 hover:text-slate-700 transition-colors group">
                      <ArrowLeft size={15} className="group-hover:-translate-x-0.5 transition-transform" />
                      Back to Staff List
                    </button>
                    {/* Detail card */}
                    <Card className="overflow-hidden">
                      <div className={`px-6 py-5 ${detailStaff.status === "active" ? "bg-indigo-600" : detailStaff.status === "restricted" ? "bg-amber-500" : "bg-slate-600"} flex items-center gap-4`}>
                        <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-white font-black text-xl">{detailStaff.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-black uppercase text-lg truncate">{detailStaff.name}</p>
                          <p className="text-white/70 text-sm font-bold mt-0.5">{detailStaff.role}</p>
                          <div className="mt-2"><StatusPill status={detailStaff.status} /></div>
                        </div>
                      </div>
                      <div className="p-6 space-y-5">
                        {/* Permissions */}
                        <div>
                          <p className="text-xs font-black uppercase text-slate-400 tracking-wide mb-3">Permissions</p>
                          <div className="grid grid-cols-2 gap-2">
                            {PERMS_META.map(p => (
                              <div key={p.key} className={`flex items-center gap-2 p-3 rounded-xl border ${detailStaff.permissions[p.key] ? "bg-blue-50 border-blue-100" : "bg-slate-50 border-slate-100 opacity-50"}`}>
                                <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 ${detailStaff.permissions[p.key] ? "bg-blue-600" : "bg-slate-300"}`}>
                                  {detailStaff.permissions[p.key] && <Check size={10} className="text-white" />}
                                </div>
                                <p className={`text-xs font-black uppercase ${detailStaff.permissions[p.key] ? "text-blue-800" : "text-slate-400"}`}>{p.label}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                        {/* Assigned classes */}
                        <div>
                          <p className="text-xs font-black uppercase text-slate-400 tracking-wide mb-3">Assigned Classes</p>
                          {detailStaff.assignedClasses.length === 0
                            ? <p className="text-xs text-slate-400 italic">All classes (no restriction)</p>
                            : <div className="flex flex-wrap gap-1.5">{detailStaff.assignedClasses.map(c => <Pill key={c} color="slate">{c}</Pill>)}</div>}
                        </div>
                        {/* Timestamps */}
                        <div className="grid grid-cols-2 gap-3 text-xs text-slate-400 border-t border-slate-100 pt-4">
                          <div><p className="font-black uppercase mb-0.5">Created</p><p>{fmtTs(detailStaff.createdAt).date}</p></div>
                          <div><p className="font-black uppercase mb-0.5">Last Updated</p><p>{fmtTs(detailStaff.updatedAt).date}</p></div>
                        </div>
                        {/* Actions */}
                        <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
                          <Btn variant="outline" onClick={() => { setDlg({ type:"staffEdit", data:detailStaff }); setStaffDetailId(null); }}>
                            <KeyRound size={14} />Edit Access
                          </Btn>
                          {detailStaff.status !== "revoked"
                            ? <Btn variant="danger" onClick={() => setDlg({ type:"revoke", data:detailStaff })}>
                                <UserX size={14} />Revoke Access
                              </Btn>
                            : <Btn variant="success" onClick={() => { dispatch({ type:"SET_STAFF_STATUS", id:detailStaff.id, status:"active" }); showToast(`${detailStaff.name} restored`); setStaffDetailId(null); }}>
                                <UserCheck size={14} />Restore Access
                              </Btn>
                          }
                        </div>
                      </div>
                    </Card>
                  </div>
                );

                // ── Staff List View ────────────────────────────────────────
                return (
                  <>
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div>
                        <h1 className="text-2xl font-black text-slate-900 uppercase">Staff Access</h1>
                        <p className="text-sm text-slate-400">
                          {staffList.filter(s => s.status === "active").length} active ·{" "}
                          {staffList.filter(s => s.status === "restricted").length} restricted ·{" "}
                          {staffList.filter(s => s.status === "revoked").length} revoked
                        </p>
                      </div>
                      <Btn variant="primary" onClick={() => setDlg({ type:"staffAdd" })}><UserPlus size={15} />Add Staff</Btn>
                    </div>
                    {staffList.length === 0
                      ? <EmptyState icon={Users} title='No staff accounts yet' subtitle='Click "Add Staff" to create one' />
                      : (
                        <div className="space-y-2">
                          {staffList.map(s => (
                            <div key={s.id} onClick={() => setStaffDetailId(s.id)}
                              className="cursor-pointer group">
                              <StaffCard s={s}
                                onEdit={s => { setDlg({ type:"staffEdit", data:s }); }}
                                onRevoke={s => setDlg({ type:"revoke", data:s })}
                                onRestore={s => { dispatch({ type:"SET_STAFF_STATUS", id:s.id, status:"active" }); showToast(`${s.name} restored`); }}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                  </>
                );
              })()}

              {/* SETTINGS */}
              {activeTab === "settings" && isAdmin && (
                <SettingsTab
                  logoUrl={schoolLogo}
                  setSchoolLogo={setSchoolLogo}
                  logoRef={logoRef as React.RefObject<HTMLInputElement>}
                  showToast={showToast}
                  adminPinRef={adminPinRef}
                />
              )}

            </div>
          </main>

          {/* Mobile bottom nav */}
          <nav className="md:hidden bg-white border-t border-slate-100 flex-shrink-0 z-40">
            <div className="flex items-stretch">
              {primaryTabs.map(t => (
                <button key={t.id} onClick={() => navigate(t.id)}
                  className={`flex-1 flex flex-col items-center gap-0.5 py-3 px-1 transition-all ${activeTab === t.id ? "text-blue-600" : "text-slate-400"}`}>
                  <t.icon size={20} />
                  <span className="text-xs font-bold">{t.label.split(" ")[0]}</span>
                </button>
              ))}
              {moreTabs.length > 0 && (
                <button onClick={() => setMenuOpen(o => !o)}
                  className={`flex-1 flex flex-col items-center gap-0.5 py-3 px-1 transition-all ${moreTabs.some(t => t.id === activeTab) || menuOpen ? "text-blue-600" : "text-slate-400"}`}>
                  <MoreVertical size={20} />
                  <span className="text-xs font-bold">More</span>
                </button>
              )}
            </div>
          </nav>
        </div>
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {showPrint && activeReport && (
        <PrintDialog student={activeReport} schoolName={schoolSettings.name} onClose={() => setShowPrint(false)} />
      )}
      {dlg?.type === "staffAdd" && (
        <StaffDialog mode="add" onSave={saveStaff} onClose={() => setDlg(null)} />
      )}
      {dlg?.type === "staffEdit" && (
        <StaffDialog mode="edit" staff={dlg.data} onSave={saveStaff} onClose={() => setDlg(null)} />
      )}
      {dlg?.type === "delete" && (
        <PinAuth
          title="Delete Record"
          subtitle={`${dlg.data.subject} — ${dlg.data.studentName}`}
          headerColor="bg-red-600"
          icon={Trash2}
          confirmLabel={<><Trash2 size={13} />Delete</>}
          confirmVariant="danger"
          correctPin={adminPinRef.current}
          onConfirm={() => { dispatch({ type:"DELETE_ENTRY", id:dlg.data.id }); showToast("Moved to recycle bin"); setDlg(null); }}
          onCancel={() => setDlg(null)}
        >
          <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex gap-3">
            <AlertTriangle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-red-700">
              <p className="font-black uppercase mb-1">Deleting:</p>
              <p className="font-bold">{dlg.data.subject} — {dlg.data.studentName}</p>
              <p className="text-red-400">Score: {dlg.data.caScore} + {dlg.data.examScore} = {dlg.data.total}</p>
            </div>
          </div>
        </PinAuth>
      )}
      {dlg?.type === "restore" && (
        <PinAuth
          title="Restore Record"
          subtitle={`${dlg.data.subject} — ${dlg.data.studentName}`}
          headerColor="bg-emerald-600"
          icon={RotateCcw}
          confirmLabel={<><RotateCcw size={13} />Restore</>}
          confirmVariant="success"
          correctPin={adminPinRef.current}
          onConfirm={() => { dispatch({ type:"RESTORE_ENTRY", id:dlg.data.id }); showToast("Record restored"); setDlg(null); }}
          onCancel={() => setDlg(null)}
        >
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex gap-3">
            <RotateCcw size={15} className="text-emerald-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-emerald-700 font-medium">
              <strong>{dlg.data.subject}</strong> — {dlg.data.studentName} will be moved back to active records.
            </p>
          </div>
        </PinAuth>
      )}
      {dlg?.type === "revoke" && (
        <PinAuth
          title="Revoke Access"
          subtitle={dlg.data.name}
          headerColor="bg-red-600"
          icon={UserX}
          confirmLabel={<><UserX size={13} />Revoke</>}
          confirmVariant="danger"
          correctPin={adminPinRef.current}
          onConfirm={() => { dispatch({ type:"SET_STAFF_STATUS", id:dlg.data.id, status:"revoked" }); showToast(`${dlg.data.name}'s access revoked`); setDlg(null); }}
          onCancel={() => setDlg(null)}
        >
          <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex gap-3">
            <AlertTriangle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-700 font-medium"><strong>{dlg.data.name}</strong> will lose portal access immediately.</p>
          </div>
        </PinAuth>
      )}
      {showLogout && (
        <Modal onBgClick={() => setShowLogout(false)}>
          <MHead icon={LogOut} title="Sign Out" subtitle="You are about to leave the portal" color="bg-slate-900" onClose={() => setShowLogout(false)} />
          <div className="p-6 space-y-5">
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 flex gap-3">
              <AlertTriangle size={15} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-slate-600 font-medium">Unsaved changes will be lost. Are you sure?</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Btn variant="ghost" size="lg" onClick={() => setShowLogout(false)}>Stay</Btn>
              <Btn variant="danger" size="lg" onClick={() => {
                setAuth({ loggedIn:false, user:null });
                setLoginId("admin"); setLoginPass(""); setShowLogout(false);
                setActiveTab("dashboard"); setActiveReport(null); setMenuOpen(false);
              }}>
                <LogOut size={15} />Sign Out
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {toast && <Toast toast={toast} />}

      <style>{`
        @media print {
          aside, nav, header { display: none !important; }
          main { padding: 0 !important; overflow: visible !important; height: auto !important; }
          #printable-report { box-shadow: none !important; border-radius: 0 !important; }
          @page { size: A4 portrait; margin: 12mm; }
        }
      `}</style>
    </AppCtx.Provider>
  );
}

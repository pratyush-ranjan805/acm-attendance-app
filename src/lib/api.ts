// Single API layer. Adjust paths here if the Antigravity contract differs.
const BASE = process.env.NEXT_PUBLIC_API_URL || "/api";
export type Status = "Present" | "Absent";
export type Member = { id: string; name: string; email?: string; role: "Leader" | "Member"; status?: Status | null; markedAt?: string | null };
export type Team = { teamId: string; name: string; memberCount?: number; members: Member[] };
export type Stats = { totalTeams: number; totalMembers: number; present: number; absent: number; percentage: number };
export type Rec = { date: string; teamId: string; teamName: string; memberId: string; memberName: string; role: string; status: Status; markedAt: string | null };
export type Admin = { name: string; email: string };

export type MovementReason = "Exam" | "Food" | "Personal" | "Restroom" | "Other";

export interface ParticipantMovement {
  id: string;
  name: string;
  registrationNumber: string;
  phoneNumber: string;
  department?: string;
  teamName: string;
  teamCode: string;
  role: "Leader" | "Member";
  isOut: boolean;
  activeMovement?: {
    id: string;
    reason: MovementReason;
    customReason?: string;
    outTime: string;
    markedBy?: string;
    minutesOut: number;
  } | null;
}

export interface MovementSummary {
  totalParticipants: number;
  insideCount: number;
  outCount: number;
  totalMovementsToday: number;
  participants: ParticipantMovement[];
}

export interface MovementHistory {
  id: string;
  profileId: string;
  participantName: string;
  registrationNumber: string;
  phoneNumber: string;
  teamName: string;
  teamCode: string;
  status: "OUT" | "IN";
  reason: MovementReason;
  customReason?: string;
  outTime: string;
  inTime?: string | null;
  durationMinutes: number;
  markedBy?: string;
  createdAt: string;
}

export class ApiError extends Error { constructor(public status: number, msg: string) { super(msg); } }
export const session = {
  token: () => (typeof window === "undefined" ? null : localStorage.getItem("acm_token")),
  admin: (): Admin | null => { try { return JSON.parse(localStorage.getItem("acm_admin") || "null"); } catch { return null; } },
  set: (t: string, a: Admin) => { localStorage.setItem("acm_token", t); localStorage.setItem("acm_admin", JSON.stringify(a)); },
  clear: () => { localStorage.removeItem("acm_token"); localStorage.removeItem("acm_admin"); },
};
const MSG: Record<number, string> = { 401: "Session expired. Sign in again.", 403: "You don't have admin permission for this action.", 404: "Not found.", 500: "Server error. Try again shortly." };

async function raw(path: string, init: RequestInit = {}): Promise<Response> {
  const url = BASE.endsWith("/") ? BASE.slice(0, -1) + path : BASE + path;
  const t = session.token();
  let r: Response;
  try {
    r = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}), ...init.headers } });
  } catch { throw new ApiError(0, "Unable to load data. Check your connection and API URL."); }
  if (r.status === 401 && !path.startsWith("/auth/login")) { session.clear(); if (!location.pathname.startsWith("/login")) location.href = "/login"; }
  if (!r.ok) {
    let m = MSG[r.status] ?? `Request failed (${r.status}).`;
    try { const b = await r.json(); if (b?.message) m = b.message; } catch {}
    throw new ApiError(r.status, m);
  }
  return r;
}
// Client-side in-memory cache for ultra-fast navigation
const clientCache = new Map<string, { data: unknown; expiresAt: number }>();

export function clearClientCache(pattern?: string) {
  if (!pattern) {
    clientCache.clear();
  } else {
    for (const k of clientCache.keys()) {
      if (k.includes(pattern)) {
        clientCache.delete(k);
      }
    }
  }
}

const j = async <T,>(path: string, init?: RequestInit, ttlSec = 0): Promise<T> => {
  const isGet = !init || !init.method || init.method.toUpperCase() === "GET";
  if (isGet && ttlSec > 0) {
    const cached = clientCache.get(path);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data as T;
    }
  }

  const res = (await raw(path, init)).json() as Promise<T>;
  const data = await res;

  if (isGet && ttlSec > 0) {
    clientCache.set(path, { data, expiresAt: Date.now() + ttlSec * 1000 });
  } else if (!isGet) {
    // Clear client cache on any mutation
    clearClientCache();
  }

  return data;
};

const q = (o: Record<string, string | undefined>) => { const p = new URLSearchParams(); Object.entries(o).forEach(([k, v]) => v && p.set(k, v)); const s = p.toString(); return s ? `?${s}` : ""; };
const body = (m: string, b?: unknown): RequestInit => ({ method: m, body: b ? JSON.stringify(b) : undefined });
const e = encodeURIComponent;

export const api = {
  login: (email: string, password: string) => {
    clearClientCache();
    return j<{ token: string; admin: Admin }>("/auth/login", body("POST", { email, password }));
  },
  stats: (date: string) => j<Stats>(`/dashboard/stats${q({ date })}`, undefined, 20),
  teams: (search?: string) => j<Team[]>(`/teams${q({ search })}`, undefined, 20),
  team: (id: string, date: string) => j<Team>(`/teams/${e(id)}${q({ date })}`, undefined, 15),
  addTeam: (t: { teamId: string; name: string }) => j<Team>("/teams", body("POST", t)),
  editTeam: (id: string, t: { teamId: string; name: string }) => j<Team>(`/teams/${e(id)}`, body("PUT", t)),
  delTeam: (id: string) => { clearClientCache(); return raw(`/teams/${e(id)}`, body("DELETE")); },
  addMember: (id: string, m: Partial<Member>) => j<Member>(`/teams/${e(id)}/members`, body("POST", m)),
  editMember: (id: string, mid: string, m: Partial<Member>) => j<Member>(`/teams/${e(id)}/members/${mid}`, body("PUT", m)),
  delMember: (id: string, mid: string) => { clearClientCache(); return raw(`/teams/${e(id)}/members/${mid}`, body("DELETE")); },
  saveAttendance: (p: { teamId: string; date: string; records: { memberId: string; status: Status }[] }) => {
    clearClientCache();
    return j<{ markedAt: string }>("/attendance", body("POST", p));
  },
  attendance: (f: { date?: string; teamId?: string; status?: string }) => j<Rec[]>(`/attendance${q(f)}`, undefined, 15),
  async exportXlsx(date?: string) {
    const r = await raw(`/attendance/export${q({ date })}`);
    const a = document.createElement("a"); a.href = URL.createObjectURL(await r.blob());
    a.download = `siggraph-attendance-${date ?? "all"}.xlsx`; a.click(); URL.revokeObjectURL(a.href);
  },
  async importTeams(file: File, clearExisting: boolean = false) {
    clearClientCache();
    const fd = new FormData();
    fd.append("file", file);
    if (clearExisting) fd.append("clearExisting", "true");
    const t = session.token();
    const url = BASE.endsWith("/") ? BASE.slice(0, -1) + "/teams/import" : BASE + "/teams/import";
    const res = await fetch(url, {
      method: "POST",
      headers: { ...(t ? { Authorization: `Bearer ${t}` } : {}) },
      body: fd,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ApiError(res.status, err.message || "Failed to import teams file.");
    }
    return res.json() as Promise<{ success: boolean; teamsCount: number; membersCount: number; message: string }>;
  },
  async downloadTemplate() {
    const r = await raw("/teams/import/template");
    const a = document.createElement("a"); a.href = URL.createObjectURL(await r.blob());
    a.download = "acm-teams-registration-template.xlsx"; a.click(); URL.revokeObjectURL(a.href);
  },
  clearTeams: () => { clearClientCache(); return raw("/teams/clear", body("DELETE")); },
  movement: (params?: { search?: string; filter?: "all" | "out" | "in" }) =>
    j<MovementSummary>(`/movement${q(params || {})}`, undefined, 10),
  markOut: (p: { profileId: string; reason: MovementReason; customReason?: string }) => {
    clearClientCache("movement");
    return j<{ success: boolean; message: string }>("/movement/out", body("POST", p));
  },
  markIn: (profileId: string) => {
    clearClientCache("movement");
    return j<{ success: boolean; message: string }>("/movement/in", body("POST", { profileId }));
  },
  movementHistory: (limit?: number) =>
    j<MovementHistory[]>(`/movement/history${q({ limit: limit ? String(limit) : undefined })}`, undefined, 10),
  async exportMovementXlsx() {
    const r = await raw("/movement/export");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(await r.blob());
    a.download = `room-movement-${new Date().toLocaleDateString("en-CA")}.xlsx`;
    a.click();
    URL.revokeObjectURL(a.href);
  },
};
export const today = () => new Date().toLocaleDateString("en-CA");
export const shift = (d: number) => { const x = new Date(); x.setDate(x.getDate() + d); return x.toLocaleDateString("en-CA"); };
export const fmtDate = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
export const fmtTime = (s?: string | null) => (s ? new Date(s).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "-");

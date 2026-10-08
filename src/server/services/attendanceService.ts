/* eslint-disable @typescript-eslint/no-explicit-any */
import { getSupabaseClient } from "../supabase";
import { serverCache } from "../cache";
import { fetchEligibleTeamsRaw } from "./teamService";

export type AttendanceStatus = "Present" | "Absent";

export interface AttendanceRecordDto {
  id?: string;
  date: string;
  teamId: string;      // team_code
  teamName: string;    // ig_teams.name
  memberId: string;    // profile_id
  memberName: string;  // profiles.full_name
  role: string;
  status: AttendanceStatus;
  markedAt: string | null;
  registrationNumber?: string;
  department?: string;
  meals?: Record<string, boolean> | null;
  updatedBy?: string | null;
}

export interface DashboardStatsDto {
  totalTeams: number;
  totalMembers: number;
  presentToday: number;
  present: number;
  absentToday: number;
  absent: number;
  notMarkedToday: number;
  notMarked: number;
  attendancePercentage: number;
  percentage: number;
  teams?: {
    teamId: string;
    teamName: string;
    totalMembers: number;
    present: number;
    absent: number;
    attendancePercentage: number;
  }[];
}

function requireSupabase() {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

// ─── saveAttendanceBatch ──────────────────────────────────────────────────────

export async function saveAttendanceBatch(
  payload: {
    teamId?: string;    // team_code or ig_teams.id
    date?: string;
    records?: { memberId?: string; team_member_id?: string; status: string; meals?: Record<string, boolean> }[];
    attendance?: { memberId?: string; team_member_id?: string; status: string; date?: string; meals?: Record<string, boolean> }[];
  },
  adminUserId?: string
): Promise<{ markedAt: string; count: number }> {
  const supabase = requireSupabase();
  const now = new Date().toISOString();
  const fallbackDate = payload.date || new Date().toLocaleDateString("en-CA");
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // Verify if adminUserId is an actual profile in public.profiles before using as updated_by foreign key
  let validUpdatedBy: string | null = null;
  if (adminUserId && uuidRegex.test(adminUserId)) {
    const cachedAdmin = serverCache.get<boolean>(`admin_prof:${adminUserId}`);
    if (cachedAdmin) {
      validUpdatedBy = adminUserId;
    } else {
      const { data: prof } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", adminUserId)
        .limit(1);
      if (prof && prof.length > 0) {
        validUpdatedBy = adminUserId;
        serverCache.set(`admin_prof:${adminUserId}`, true, 3600);
      }
    }
  }

  const rawList = payload.records || payload.attendance || [];
  if (!Array.isArray(rawList) || rawList.length === 0) {
    throw new Error("No attendance records provided.");
  }

  // Resolve team UUID from team_code or UUID (checking in-memory index first)
  const teamIdentifier = payload.teamId || "";
  let teamUuid: string | null = null;
  if (teamIdentifier) {
    const isUuid = uuidRegex.test(teamIdentifier);
    if (isUuid) {
      teamUuid = teamIdentifier;
    } else {
      const cachedTeam = serverCache.get<any>(`team:raw:${teamIdentifier.trim().toLowerCase()}`);
      if (cachedTeam?.id) {
        teamUuid = cachedTeam.id;
      } else {
        const { data } = await supabase
          .from("ig_teams")
          .select("id")
          .ilike("team_code", teamIdentifier.trim())
          .limit(1);
        teamUuid = data?.[0]?.id || null;
      }
    }
  }

  if (!teamUuid) throw new Error("Team not found. Cannot save attendance.");

  // Build batch upsert rows — single DB round trip instead of N*2 round trips
  const upsertRows: Record<string, any>[] = [];
  for (const item of rawList) {
    const profileId = item.memberId || item.team_member_id;
    if (!profileId) continue;

    const rawStatus = item.status?.trim();
    if (rawStatus !== "Present" && rawStatus !== "Absent") {
      throw new Error(`Invalid status '${item.status}'. Must be 'Present' or 'Absent'.`);
    }
    const status: AttendanceStatus = rawStatus as AttendanceStatus;
    const itemDate = String("date" in item && item.date ? item.date : fallbackDate).trim();

    const row: Record<string, any> = {
      team_id: teamUuid,
      profile_id: profileId,
      attendance_date: itemDate,
      status,
      marked_at: now,
      updated_at: now,
    };
    if (validUpdatedBy) {
      row.updated_by = validUpdatedBy;
    }
    // Preserve meals if provided
    if (item.meals !== undefined) {
      row.meals = item.meals;
    }
    upsertRows.push(row);
  }

  if (upsertRows.length === 0) throw new Error("No valid attendance records to save.");

  // Single batch upsert — conflict on (team_id, profile_id, attendance_date)
  const { error } = await supabase
    .from("ig_attendance")
    .upsert(upsertRows, {
      onConflict: "team_id,profile_id,attendance_date",
      ignoreDuplicates: false,
    });

  if (error) throw new Error(error.message);

  // Invalidate stats, team dtos, and attendance cache so subsequent reads see latest data immediately
  serverCache.invalidate("stats");
  serverCache.invalidate("attendance");
  serverCache.invalidate("team:dto:");
  serverCache.invalidate("teams_with_stats:");

  return { markedAt: now, count: upsertRows.length };
}

// ─── saveMealsBatch ───────────────────────────────────────────────────────────
// Update meals JSONB for attendance records without changing status

export async function saveMealsBatch(
  payload: {
    teamId: string;
    date: string;
    meals: { memberId: string; meals: Record<string, boolean> }[];
  },
  adminUserId?: string
): Promise<{ count: number }> {
  const supabase = requireSupabase();
  const now = new Date().toISOString();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  let validUpdatedBy: string | null = null;
  if (adminUserId && uuidRegex.test(adminUserId)) {
    const { data: prof } = await supabase.from("profiles").select("id").eq("id", adminUserId).limit(1);
    if (prof && prof.length > 0) validUpdatedBy = adminUserId;
  }

  // Resolve team UUID
  let teamUuid: string | null = null;
  const isUuid = uuidRegex.test(payload.teamId);
  if (isUuid) {
    teamUuid = payload.teamId;
  } else {
    const { data } = await supabase.from("ig_teams").select("id").ilike("team_code", payload.teamId.trim()).limit(1);
    teamUuid = data?.[0]?.id || null;
  }
  if (!teamUuid) throw new Error("Team not found.");

  let count = 0;
  for (const item of payload.meals) {
    const update: Record<string, any> = { meals: item.meals, updated_at: now };
    if (validUpdatedBy) update.updated_by = validUpdatedBy;

    const { error } = await supabase
      .from("ig_attendance")
      .update(update)
      .eq("team_id", teamUuid)
      .eq("profile_id", item.memberId)
      .eq("attendance_date", payload.date);

    if (error) throw new Error(error.message);
    count++;
  }

  serverCache.invalidate("attendance");
  return { count };
}

// ─── getAttendanceList ────────────────────────────────────────────────────────

export async function getAttendanceList(filters: {
  date?: string;
  team?: string;
  teamId?: string;
  status?: string;
}): Promise<AttendanceRecordDto[]> {
  const supabase = requireSupabase();
  let teamList = await fetchEligibleTeamsRaw();

  // Apply team search filter
  const teamFilter = (filters.teamId || filters.team || "").trim().toLowerCase();
  if (teamFilter) {
    teamList = teamList.filter(
      (t: any) =>
        String(t.team_code).toLowerCase().includes(teamFilter) ||
        String(t.name).toLowerCase().includes(teamFilter)
    );
  }

  if (teamList.length === 0) return [];

  const eligibleTeamIds = teamList.map((t: any) => t.id);
  const teamMap = new Map<string, { name: string; team_code: string; leader_id: string }>(
    teamList.map((t: any) => [t.id, { name: t.name, team_code: t.team_code, leader_id: t.leader_id }])
  );

  // Build ig_attendance query
  let query = supabase
    .from("ig_attendance")
    .select(`
      id,
      team_id,
      profile_id,
      attendance_date,
      status,
      marked_at,
      meals,
      updated_by,
      profiles!profile_id (
        id,
        full_name,
        college_email,
        registration_number,
        department
      ),
      updater:profiles!updated_by (
        id,
        full_name
      )
    `)
    .in("team_id", eligibleTeamIds)
    .order("attendance_date", { ascending: false });

  if (filters.date && filters.date.trim()) {
    query = query.eq("attendance_date", filters.date.trim());
  }
  if (filters.status && filters.status.trim()) {
    query = query.eq("status", filters.status.trim());
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const results: AttendanceRecordDto[] = [];
  for (const r of data || []) {
    const p = (r as any).profiles;
    if (!p) continue;

    const teamInfo = teamMap.get(String(r.team_id));
    if (!teamInfo) continue;

    const updater = (r as any).updater;

    results.push({
      id: String(r.id),
      date: String(r.attendance_date),
      teamId: teamInfo.team_code,
      teamName: teamInfo.name,
      memberId: String(r.profile_id),
      memberName: String(p.full_name),
      role: r.profile_id === teamInfo.leader_id ? "Leader" : "Member",
      status: String(r.status) as AttendanceStatus,
      markedAt: r.marked_at ? String(r.marked_at) : null,
      registrationNumber: p.registration_number ? String(p.registration_number) : undefined,
      department: p.department ? String(p.department) : undefined,
      meals: (r as any).meals ?? null,
      updatedBy: updater ? String(updater.full_name) : null,
    });
  }

  return results.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.teamId.localeCompare(b.teamId) ||
      a.memberName.localeCompare(b.memberName)
  );
}

// ─── getDashboardStats ────────────────────────────────────────────────────────

export async function getDashboardStats(targetDate?: string): Promise<DashboardStatsDto> {
  const date = targetDate || new Date().toLocaleDateString("en-CA");
  const cacheKey = `stats:${date}`;
  const cached = serverCache.get<DashboardStatsDto>(cacheKey);
  if (cached) {
    return cached;
  }

  const supabase = requireSupabase();
  const rawTeams = await fetchEligibleTeamsRaw();

  const teamList = rawTeams;
  const teamIds = teamList.map((t: any) => t.id);
  const membersList: { team_id: string; profile_id: string }[] = [];

  for (const t of rawTeams) {
    for (const m of (t.ig_team_members || [])) {
      membersList.push({ team_id: t.id, profile_id: m.profile_id });
    }
  }

  if (teamIds.length === 0) {
    const emptyStats: DashboardStatsDto = {
      totalTeams: 0, totalMembers: 0, presentToday: 0, present: 0,
      absentToday: 0, absent: 0, notMarkedToday: 0, notMarked: 0,
      attendancePercentage: 0, percentage: 0, teams: [],
    };
    serverCache.set(cacheKey, emptyStats, 30);
    return emptyStats;
  }

  // Single query: attendance for today
  const { data: attData, error: attErr } = await supabase
    .from("ig_attendance")
    .select("team_id, profile_id, status")
    .in("team_id", teamIds)
    .eq("attendance_date", date);

  if (attErr) throw new Error(attErr.message);
  const attList = attData || [];

  const totalTeams = teamList.length;
  const totalMembers = membersList.length;

  const present = attList.filter((a: any) => a.status === "Present").length;
  const absent = attList.filter((a: any) => a.status === "Absent").length;
  const notMarked = Math.max(0, totalMembers - (present + absent));
  const percentage = totalMembers > 0 ? Number(((present / totalMembers) * 100).toFixed(2)) : 0;

  // Build per-team stats
  const attMap = new Map<string, string>(); // "teamId:profileId" -> status
  attList.forEach((a: any) => attMap.set(`${a.team_id}:${a.profile_id}`, a.status));

  const teams = teamList.map((t: any) => {
    const teamMems = membersList.filter((m: any) => m.team_id === t.id);
    const memCount = teamMems.length;
    let pCount = 0;
    let aCount = 0;
    teamMems.forEach((m: any) => {
      const st = attMap.get(`${t.id}:${m.profile_id}`);
      if (st === "Present") pCount++;
      else if (st === "Absent") aCount++;
    });
    const pct = memCount > 0 ? Number(((pCount / memCount) * 100).toFixed(2)) : 0;
    return {
      teamId: String(t.team_code),
      teamName: String(t.name),
      totalMembers: memCount,
      present: pCount,
      absent: aCount,
      attendancePercentage: pct,
    };
  });

  const result: DashboardStatsDto = {
    totalTeams,
    totalMembers,
    presentToday: present,
    present,
    absentToday: absent,
    absent,
    notMarkedToday: notMarked,
    notMarked,
    attendancePercentage: percentage,
    percentage,
    teams,
  };

  // Cache for 30 seconds
  serverCache.set(cacheKey, result, 30);
  return result;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
import { v4 as uuidv4 } from "uuid";
import { getDb } from "../db";
import { getSupabaseClient } from "../supabase";

export type MovementReason = "Exam" | "Food" | "Personal" | "Restroom" | "Other";

export interface ParticipantMovementDto {
  id: string; // profile_id
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

export interface MovementHistoryRecord {
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

export interface MovementSummary {
  totalParticipants: number;
  insideCount: number;
  outCount: number;
  totalMovementsToday: number;
  participants: ParticipantMovementDto[];
}

let dbReady = false;

export async function ensureMovementTable(): Promise<void> {
  if (dbReady) return;
  const db = getDb();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS room_movements (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      participant_name TEXT NOT NULL,
      registration_number TEXT NOT NULL,
      phone_number TEXT,
      team_name TEXT,
      team_code TEXT,
      status TEXT NOT NULL,
      reason TEXT NOT NULL,
      custom_reason TEXT,
      out_time TEXT NOT NULL,
      in_time TEXT,
      marked_by TEXT,
      created_at TEXT NOT NULL
    );
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_movements_profile ON room_movements(profile_id);`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_movements_status ON room_movements(status);`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_movements_out_time ON room_movements(out_time);`);
  dbReady = true;
}

const ELIGIBLE_FILTER = "staged_at.not.is.null,shortlisted_at.not.is.null";

import { fetchEligibleTeamsRaw } from "./teamService";

/**
 * Fetch all participants from eligible teams (staged/shortlisted) in Supabase,
 * combined with their current active room movement status.
 */
export async function getMovementData(search?: string, filter?: "all" | "out" | "in"): Promise<MovementSummary> {
  await ensureMovementTable();

  // 1. Fetch eligible teams with member profiles (uses shared server cache)
  const teamsData = await fetchEligibleTeamsRaw();

  // 2. Fetch active "OUT" records from SQLite
  const db = getDb();
  const activeRes = await db.execute(`
    SELECT * FROM room_movements
    WHERE in_time IS NULL
    ORDER BY out_time DESC;
  `);

  const activeMap = new Map<string, any>();
  for (const row of activeRes.rows) {
    const profileId = String(row.profile_id);
    if (!activeMap.has(profileId)) {
      activeMap.set(profileId, row);
    }
  }

  // 3. Today movements count
  const todayPrefix = new Date().toLocaleDateString("en-CA");
  const todayCountRes = await db.execute({
    sql: `SELECT COUNT(*) as count FROM room_movements WHERE out_time LIKE ?;`,
    args: [`${todayPrefix}%`],
  });
  const totalMovementsToday = Number(todayCountRes.rows[0]?.count ?? 0);

  // 4. Map participants
  const nowMs = Date.now();
  const participantsList: ParticipantMovementDto[] = [];
  const seenProfiles = new Set<string>();

  for (const team of (teamsData || []) as any[]) {
    const leaderId = team.leader_id;
    for (const link of (team.ig_team_members || []) as any[]) {
      const p: any = Array.isArray(link.profiles) ? link.profiles[0] : link.profiles;
      if (!p || seenProfiles.has(p.id)) continue;
      seenProfiles.add(p.id);

      const activeRow = activeMap.get(p.id);
      let activeMovement: ParticipantMovementDto["activeMovement"] = null;

      if (activeRow) {
        const outMs = new Date(String(activeRow.out_time)).getTime();
        const minutesOut = Math.max(0, Math.floor((nowMs - outMs) / 60000));
        activeMovement = {
          id: String(activeRow.id),
          reason: String(activeRow.reason) as MovementReason,
          customReason: activeRow.custom_reason ? String(activeRow.custom_reason) : undefined,
          outTime: String(activeRow.out_time),
          markedBy: activeRow.marked_by ? String(activeRow.marked_by) : undefined,
          minutesOut,
        };
      }

      participantsList.push({
        id: String(p.id),
        name: String(p.full_name || "Unknown"),
        registrationNumber: String(p.registration_number || "—"),
        phoneNumber: String(p.phone_number || "—"),
        department: p.department ? String(p.department) : undefined,
        teamName: String(team.name || "Unknown Team"),
        teamCode: String(team.team_code || "—"),
        role: leaderId === p.id ? "Leader" : "Member",
        isOut: !!activeMovement,
        activeMovement,
      });
    }
  }

  const totalParticipants = participantsList.length;
  const outCount = participantsList.filter((p) => p.isOut).length;
  const insideCount = totalParticipants - outCount;

  // 5. Apply filters and search
  let filtered = participantsList;

  if (filter === "out") {
    filtered = filtered.filter((p) => p.isOut);
  } else if (filter === "in") {
    filtered = filtered.filter((p) => !p.isOut);
  }

  if (search && search.trim()) {
    const term = search.trim().toLowerCase();
    filtered = filtered.filter((p) =>
      p.name.toLowerCase().includes(term) ||
      p.registrationNumber.toLowerCase().includes(term) ||
      p.phoneNumber.toLowerCase().includes(term) ||
      p.teamName.toLowerCase().includes(term) ||
      p.teamCode.toLowerCase().includes(term)
    );
  }

  // Sort: OUT participants first (sorted by minutesOut descending), then by teamCode/name
  filtered.sort((a, b) => {
    if (a.isOut && !b.isOut) return -1;
    if (!a.isOut && b.isOut) return 1;
    if (a.isOut && b.isOut) {
      return (b.activeMovement?.minutesOut || 0) - (a.activeMovement?.minutesOut || 0);
    }
    return a.teamCode.localeCompare(b.teamCode) || a.name.localeCompare(b.name);
  });

  return {
    totalParticipants,
    insideCount,
    outCount,
    totalMovementsToday,
    participants: filtered,
  };
}

/**
 * Mark a participant OUT of the room with a reason
 */
export async function markParticipantOut(params: {
  profileId: string;
  reason: MovementReason;
  customReason?: string;
  markedBy?: string;
}): Promise<void> {
  await ensureMovementTable();
  const db = getDb();
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured");

  // Check if already OUT
  const existingRes = await db.execute({
    sql: `SELECT id FROM room_movements WHERE profile_id = ? AND in_time IS NULL LIMIT 1;`,
    args: [params.profileId],
  });

  if (existingRes.rows.length > 0) {
    throw new Error("Participant is already marked as OUT of the room.");
  }

  // Get participant details from profiles and ig_team_members
  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("id, full_name, registration_number, phone_number")
    .eq("id", params.profileId)
    .single();

  if (pErr || !profile) {
    throw new Error("Participant profile not found.");
  }

  // Get team info
  const { data: memberLink } = await supabase
    .from("ig_team_members")
    .select("team_id, ig_teams(name, team_code)")
    .eq("profile_id", params.profileId)
    .single();

  const teamName = (memberLink?.ig_teams as any)?.name || "Unknown Team";
  const teamCode = (memberLink?.ig_teams as any)?.team_code || "—";

  const now = new Date().toISOString();
  const id = uuidv4();

  await db.execute({
    sql: `
      INSERT INTO room_movements (
        id, profile_id, participant_name, registration_number,
        phone_number, team_name, team_code, status, reason,
        custom_reason, out_time, in_time, marked_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'OUT', ?, ?, ?, NULL, ?, ?);
    `,
    args: [
      id,
      params.profileId,
      profile.full_name || "Unknown",
      profile.registration_number || "—",
      profile.phone_number || "—",
      teamName,
      teamCode,
      params.reason,
      params.customReason?.trim() || null,
      now,
      params.markedBy || "Admin",
      now,
    ],
  });
}

/**
 * Mark a participant IN (returned to the room)
 */
export async function markParticipantIn(profileId: string, markedBy?: string): Promise<void> {
  await ensureMovementTable();
  const db = getDb();

  const activeRes = await db.execute({
    sql: `SELECT id FROM room_movements WHERE profile_id = ? AND in_time IS NULL ORDER BY out_time DESC LIMIT 1;`,
    args: [profileId],
  });

  if (activeRes.rows.length === 0) {
    throw new Error("No active OUT record found for this participant.");
  }

  const activeId = String(activeRes.rows[0].id);
  const now = new Date().toISOString();

  await db.execute({
    sql: `
      UPDATE room_movements
      SET in_time = ?, status = 'IN', marked_by = ?
      WHERE id = ?;
    `,
    args: [now, markedBy || "Admin", activeId],
  });
}

/**
 * Fetch movement history logs
 */
export async function getMovementHistory(limit = 100): Promise<MovementHistoryRecord[]> {
  await ensureMovementTable();
  const db = getDb();

  const res = await db.execute({
    sql: `SELECT * FROM room_movements ORDER BY out_time DESC LIMIT ?;`,
    args: [limit],
  });

  const nowMs = Date.now();

  return res.rows.map((row: any) => {
    const outMs = new Date(String(row.out_time)).getTime();
    const inMs = row.in_time ? new Date(String(row.in_time)).getTime() : null;
    const durationMinutes = inMs
      ? Math.max(0, Math.round((inMs - outMs) / 60000))
      : Math.max(0, Math.round((nowMs - outMs) / 60000));

    return {
      id: String(row.id),
      profileId: String(row.profile_id),
      participantName: String(row.participant_name),
      registrationNumber: String(row.registration_number),
      phoneNumber: String(row.phone_number || "—"),
      teamName: String(row.team_name || "—"),
      teamCode: String(row.team_code || "—"),
      status: String(row.status) as "OUT" | "IN",
      reason: String(row.reason) as MovementReason,
      customReason: row.custom_reason ? String(row.custom_reason) : undefined,
      outTime: String(row.out_time),
      inTime: row.in_time ? String(row.in_time) : null,
      durationMinutes,
      markedBy: row.marked_by ? String(row.marked_by) : undefined,
      createdAt: String(row.created_at),
    };
  });
}

/* eslint-disable @typescript-eslint/no-explicit-any */
import { getSupabaseClient } from "../supabase";

// ─── DTOs ────────────────────────────────────────────────────────────────────

export interface TeamMemberDto {
  id: string;          // profile_id (uuid)
  name: string;        // full_name from profiles
  email?: string;      // college_email
  role: "Leader" | "Member";
  registrationNumber?: string;
  department?: string;
  status?: "Present" | "Absent" | null;
  markedAt?: string | null;
}

export interface TeamDto {
  id: string;          // ig_teams.id (uuid)
  teamId: string;      // ig_teams.team_code  (used as display ID)
  team_id: string;
  name: string;        // ig_teams.name
  team_name: string;
  memberCount: number;
  members: TeamMemberDto[];
  created_at: string;
  updated_at: string;
  // Extra IG fields
  isShortlisted: boolean;
  isStaged: boolean;
  submissionUrl?: string | null;
  problemStatement?: string | null;
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function requireSupabase() {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured. Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  return supabase;
}

/** Only teams that have been staged OR shortlisted */
const ELIGIBLE_FILTER = "staged_at.not.is.null,shortlisted_at.not.is.null";

import { serverCache } from "../cache";

// ─── getAllTeams ──────────────────────────────────────────────────────────────

let pendingRawTeamsPromise: Promise<any[]> | null = null;

export async function fetchEligibleTeamsRaw(): Promise<any[]> {
  const cached = serverCache.get<any[]>("teams:raw_all");
  if (cached) return cached;

  if (pendingRawTeamsPromise) {
    return pendingRawTeamsPromise;
  }

  pendingRawTeamsPromise = (async () => {
    try {
      const supabase = requireSupabase();
      const { data, error } = await supabase
        .from("ig_teams")
        .select(`
          id,
          name,
          team_code,
          leader_id,
          submission_url,
          problem_statement,
          staged_at,
          shortlisted_at,
          created_at,
          updated_at,
          ig_team_members (
            profile_id,
            profiles (
              id,
              full_name,
              college_email,
              registration_number,
              department,
              phone_number
            )
          )
        `)
        .or(ELIGIBLE_FILTER)
        .order("team_code", { ascending: true });

      if (error) throw new Error(error.message);
      const teams = data || [];
      serverCache.set("teams:raw_all", teams, 60);
      return teams;
    } finally {
      pendingRawTeamsPromise = null;
    }
  })();

  return pendingRawTeamsPromise;
}

export async function getAllTeams(search?: string): Promise<TeamDto[]> {
  const rawTeams = await fetchEligibleTeamsRaw();
  const dtos = rawTeams.map((t: any) => buildTeamDto(t, []));

  if (search && search.trim()) {
    const term = search.trim().toLowerCase();
    return dtos.filter(
      (t) =>
        t.name.toLowerCase().includes(term) ||
        t.teamId.toLowerCase().includes(term)
    );
  }

  return dtos;
}

// ─── getTeamByIdOrCode ───────────────────────────────────────────────────────

export async function getTeamByIdOrCode(identifier: string, date?: string): Promise<TeamDto | null> {
  const supabase = requireSupabase();
  const targetDate = date || new Date().toLocaleDateString("en-CA");

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);

  // Check if team is in raw cache first to save round trips
  const rawTeams = serverCache.get<any[]>("teams:raw_all");
  let team: any = null;
  if (rawTeams) {
    team = isUuid
      ? rawTeams.find((t) => t.id === identifier)
      : rawTeams.find((t) => String(t.team_code).toLowerCase() === identifier.trim().toLowerCase());
  }

  if (!team) {
    let query = supabase
      .from("ig_teams")
      .select(`
        id,
        name,
        team_code,
        leader_id,
        submission_url,
        problem_statement,
        staged_at,
        shortlisted_at,
        created_at,
        updated_at,
        ig_team_members (
          profile_id,
          profiles (
            id,
            full_name,
            college_email,
            registration_number,
            department
          )
        )
      `)
      .or(ELIGIBLE_FILTER)
      .limit(1);

    if (isUuid) {
      query = query.eq("id", identifier);
    } else {
      query = query.ilike("team_code", identifier.trim());
    }

    const { data, error } = await query;
    if (error || !data || data.length === 0) return null;
    team = data[0];
  }

  // Fetch attendance for all members on this date
  const profileIds = (team.ig_team_members || []).map((m: any) => m.profile_id);
  let attMap = new Map<string, { status: string; marked_at: string | null }>();

  if (profileIds.length > 0) {
    const { data: attData } = await supabase
      .from("ig_attendance")
      .select("profile_id, status, marked_at")
      .eq("team_id", team.id)
      .eq("attendance_date", targetDate)
      .in("profile_id", profileIds);

    (attData || []).forEach((a: any) => {
      attMap.set(a.profile_id, { status: a.status, marked_at: a.marked_at });
    });
  }

  return buildTeamDto(team, [], attMap);
}

// ─── buildTeamDto ─────────────────────────────────────────────────────────────

function buildTeamDto(
  t: any,
  _unused: any[],
  attMap?: Map<string, { status: string; marked_at: string | null }>
): TeamDto {
  const rawMembers: any[] = t.ig_team_members || [];
  const leaderId: string = t.leader_id;

  const members: TeamMemberDto[] = rawMembers
    .filter((m: any) => m.profiles) // skip if profile is missing
    .sort((a: any, b: any) => {
      // Leader first
      const aIsLeader = a.profile_id === leaderId;
      const bIsLeader = b.profile_id === leaderId;
      if (aIsLeader && !bIsLeader) return -1;
      if (!aIsLeader && bIsLeader) return 1;
      return (a.profiles?.full_name || "").localeCompare(b.profiles?.full_name || "");
    })
    .map((m: any) => {
      const p = m.profiles;
      const att = attMap?.get(m.profile_id);
      return {
        id: String(m.profile_id),
        name: String(p.full_name),
        email: p.college_email ? String(p.college_email) : undefined,
        registrationNumber: p.registration_number ? String(p.registration_number) : undefined,
        department: p.department ? String(p.department) : undefined,
        role: m.profile_id === leaderId ? "Leader" : "Member",
        status: att ? (att.status as "Present" | "Absent") : null,
        markedAt: att ? att.marked_at : null,
      };
    });

  return {
    id: String(t.id),
    teamId: String(t.team_code),
    team_id: String(t.team_code),
    name: String(t.name),
    team_name: String(t.name),
    memberCount: members.length,
    members,
    created_at: String(t.created_at),
    updated_at: String(t.updated_at),
    isShortlisted: !!t.shortlisted_at,
    isStaged: !!t.staged_at,
    submissionUrl: t.submission_url || null,
    problemStatement: t.problem_statement || null,
  };
}

// ─── Stubs for operations that are no longer applicable ──────────────────────
// Teams and members come from Supabase (the IG portal), not from this app.
// These are kept as stubs so the API routes compile, but they throw with clear messages.

export async function createTeam(_data: unknown): Promise<TeamDto> {
  throw new Error("Teams are managed in the IG portal. Only staged or shortlisted teams appear here.");
}

export async function updateTeam(_identifier: string, _data: unknown): Promise<TeamDto> {
  throw new Error("Team editing is not supported here. Manage teams in the IG portal.");
}

export async function deleteTeam(_identifier: string): Promise<void> {
  throw new Error("Team deletion is not supported here. Manage teams in the IG portal.");
}

export async function addMemberToTeam(_teamIdentifier: string, _data: unknown): Promise<TeamMemberDto> {
  throw new Error("Member management is not supported here. Manage members in the IG portal.");
}

export async function updateTeamMember(_memberId: string, _data: unknown): Promise<TeamMemberDto> {
  throw new Error("Member management is not supported here. Manage members in the IG portal.");
}

export async function deleteTeamMember(_memberId: string): Promise<void> {
  throw new Error("Member management is not supported here. Manage members in the IG portal.");
}

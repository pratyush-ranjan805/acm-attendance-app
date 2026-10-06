import { v4 as uuidv4 } from "uuid";
import { getDb, initDatabase } from "../db";
import { getSupabaseClient } from "../supabase";

export interface TeamMemberDto {
  id: string;
  name: string;
  member_name?: string;
  email?: string;
  role: "Leader" | "Member";
  status?: "Present" | "Absent" | "Not Marked" | null;
  markedAt?: string | null;
  marked_at?: string | null;
}

export interface TeamDto {
  id: string;
  teamId: string;
  team_id: string;
  name: string;
  team_name: string;
  memberCount: number;
  members: TeamMemberDto[];
  created_at: string;
  updated_at: string;
}

export async function getAllTeams(search?: string): Promise<TeamDto[]> {
  const supabase = getSupabaseClient();

  if (supabase) {
    let query = supabase.from("teams").select("*, team_members(*)").order("team_id", { ascending: true });

    if (search && search.trim()) {
      const term = search.trim();
      query = query.or(`team_name.ilike.%${term}%,team_id.ilike.%${term}%`);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data || []).map((t: any) => {
      const rawMembers = t.team_members || [];
      const members: TeamMemberDto[] = rawMembers
        .sort((a: any, b: any) => (a.role === "Leader" ? -1 : 1) - (b.role === "Leader" ? -1 : 1) || a.member_name.localeCompare(b.member_name))
        .map((m: any) => ({
          id: String(m.id),
          name: String(m.member_name),
          member_name: String(m.member_name),
          email: m.email ? String(m.email) : undefined,
          role: m.role === "Leader" ? "Leader" : "Member",
          status: null,
          markedAt: null,
        }));

      return {
        id: String(t.id),
        teamId: String(t.team_id),
        team_id: String(t.team_id),
        name: String(t.team_name),
        team_name: String(t.team_name),
        memberCount: members.length,
        members,
        created_at: String(t.created_at),
        updated_at: String(t.updated_at),
      };
    });
  }

  // Fallback to SQLite
  await initDatabase();
  const db = getDb();

  let sql = `SELECT id, team_id, team_name, created_at, updated_at FROM teams`;
  const args: any[] = [];

  if (search && search.trim()) {
    const term = `%${search.trim().toLowerCase()}%`;
    sql += ` WHERE LOWER(team_name) LIKE ? OR LOWER(team_id) LIKE ?`;
    args.push(term, term);
  }

  sql += ` ORDER BY team_id ASC`;

  const teamsRes = await db.execute({ sql, args });

  const teams: TeamDto[] = [];
  for (const row of teamsRes.rows) {
    const tId = String(row.id);
    const membersRes = await db.execute({
      sql: `SELECT id, member_name, email, role, created_at, updated_at FROM team_members WHERE team_id = ? ORDER BY CASE WHEN role = 'Leader' THEN 0 ELSE 1 END, member_name ASC`,
      args: [tId],
    });

    const members: TeamMemberDto[] = membersRes.rows.map((m) => ({
      id: String(m.id),
      name: String(m.member_name),
      member_name: String(m.member_name),
      email: m.email ? String(m.email) : undefined,
      role: (m.role === "Leader" ? "Leader" : "Member") as "Leader" | "Member",
      status: null,
      markedAt: null,
    }));

    teams.push({
      id: tId,
      teamId: String(row.team_id),
      team_id: String(row.team_id),
      name: String(row.team_name),
      team_name: String(row.team_name),
      memberCount: members.length,
      members,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    });
  }

  return teams;
}

export async function getTeamByIdOrCode(identifier: string, date?: string): Promise<TeamDto | null> {
  const targetDate = date || new Date().toLocaleDateString("en-CA");
  const supabase = getSupabaseClient();

  if (supabase) {
    let query = supabase.from("teams").select("*, team_members(*)");
    // Check if identifier is uuid or team_id
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier)) {
      query = query.eq("id", identifier);
    } else {
      query = query.ilike("team_id", identifier.trim());
    }

    const { data, error } = await query.limit(1);
    if (error || !data || data.length === 0) return null;

    const team = data[0];
    const memberIds = (team.team_members || []).map((m: any) => m.id);

    // Fetch attendance for this date
    let attMap = new Map<string, { status: string; marked_at: string | null }>();
    if (memberIds.length > 0) {
      const { data: attData } = await supabase
        .from("attendance")
        .select("team_member_id, status, marked_at")
        .eq("attendance_date", targetDate)
        .in("team_member_id", memberIds);

      (attData || []).forEach((a: any) => {
        attMap.set(a.team_member_id, { status: a.status, marked_at: a.marked_at });
      });
    }

    const members: TeamMemberDto[] = (team.team_members || [])
      .sort((a: any, b: any) => (a.role === "Leader" ? -1 : 1) - (b.role === "Leader" ? -1 : 1) || a.member_name.localeCompare(b.member_name))
      .map((m: any) => {
        const att = attMap.get(m.id);
        return {
          id: String(m.id),
          name: String(m.member_name),
          member_name: String(m.member_name),
          email: m.email ? String(m.email) : undefined,
          role: m.role === "Leader" ? "Leader" : "Member",
          status: (att ? att.status : null) as "Present" | "Absent" | null,
          markedAt: att ? att.marked_at : null,
          marked_at: att ? att.marked_at : null,
        };
      });

    return {
      id: String(team.id),
      teamId: String(team.team_id),
      team_id: String(team.team_id),
      name: String(team.team_name),
      team_name: String(team.team_name),
      memberCount: members.length,
      members,
      created_at: String(team.created_at),
      updated_at: String(team.updated_at),
    };
  }

  // Fallback to SQLite
  await initDatabase();
  const db = getDb();

  const teamRes = await db.execute({
    sql: `SELECT id, team_id, team_name, created_at, updated_at FROM teams WHERE id = ? OR LOWER(team_id) = LOWER(?) LIMIT 1`,
    args: [identifier, identifier.trim()],
  });

  if (teamRes.rows.length === 0) {
    return null;
  }

  const teamRow = teamRes.rows[0];
  const tId = String(teamRow.id);

  const membersRes = await db.execute({
    sql: `
      SELECT 
        m.id, 
        m.member_name, 
        m.email, 
        m.role, 
        a.status as attendance_status, 
        a.marked_at
      FROM team_members m
      LEFT JOIN attendance a ON m.id = a.team_member_id AND a.attendance_date = ?
      WHERE m.team_id = ?
      ORDER BY CASE WHEN m.role = 'Leader' THEN 0 ELSE 1 END, m.member_name ASC
    `,
    args: [targetDate, tId],
  });

  const members: TeamMemberDto[] = membersRes.rows.map((m) => ({
    id: String(m.id),
    name: String(m.member_name),
    member_name: String(m.member_name),
    email: m.email ? String(m.email) : undefined,
    role: (m.role === "Leader" ? "Leader" : "Member") as "Leader" | "Member",
    status: (m.attendance_status ? String(m.attendance_status) : null) as "Present" | "Absent" | null,
    markedAt: m.marked_at ? String(m.marked_at) : null,
    marked_at: m.marked_at ? String(m.marked_at) : null,
  }));

  return {
    id: tId,
    teamId: String(teamRow.team_id),
    team_id: String(teamRow.team_id),
    name: String(teamRow.team_name),
    team_name: String(teamRow.team_name),
    memberCount: members.length,
    members,
    created_at: String(teamRow.created_at),
    updated_at: String(teamRow.updated_at),
  };
}

export async function createTeam(data: { teamId?: string; team_id?: string; name?: string; team_name?: string }): Promise<TeamDto> {
  const code = (data.team_id || data.teamId || "").trim().toUpperCase();
  const name = (data.team_name || data.name || "").trim();

  if (!code) throw new Error("Team ID is required (e.g. ACM001).");
  if (!name) throw new Error("Team Name is required.");

  const supabase = getSupabaseClient();
  if (supabase) {
    const { data: existing } = await supabase.from("teams").select("id").ilike("team_id", code).limit(1);
    if (existing && existing.length > 0) {
      throw new Error(`Team ID '${code}' already exists.`);
    }

    const { data: created, error } = await supabase
      .from("teams")
      .insert([{ team_id: code, team_name: name }])
      .select()
      .single();

    if (error) throw new Error(error.message);

    return {
      id: String(created.id),
      teamId: String(created.team_id),
      team_id: String(created.team_id),
      name: String(created.team_name),
      team_name: String(created.team_name),
      memberCount: 0,
      members: [],
      created_at: String(created.created_at),
      updated_at: String(created.updated_at),
    };
  }

  // SQLite Fallback
  await initDatabase();
  const db = getDb();

  const checkRes = await db.execute({
    sql: `SELECT id FROM teams WHERE LOWER(team_id) = LOWER(?) LIMIT 1`,
    args: [code],
  });
  if (checkRes.rows.length > 0) {
    throw new Error(`Team ID '${code}' already exists.`);
  }

  const id = uuidv4();
  const now = new Date().toISOString();

  await db.execute({
    sql: `INSERT INTO teams (id, team_id, team_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    args: [id, code, name, now, now],
  });

  return {
    id,
    teamId: code,
    team_id: code,
    name,
    team_name: name,
    memberCount: 0,
    members: [],
    created_at: now,
    updated_at: now,
  };
}

export async function updateTeam(identifier: string, data: { teamId?: string; team_id?: string; name?: string; team_name?: string }): Promise<TeamDto> {
  const team = await getTeamByIdOrCode(identifier);
  if (!team) throw new Error("Team not found.");

  const newCode = (data.team_id || data.teamId || team.teamId).trim().toUpperCase();
  const newName = (data.team_name || data.name || team.name).trim();

  const supabase = getSupabaseClient();
  if (supabase) {
    const { error } = await supabase
      .from("teams")
      .update({ team_id: newCode, team_name: newName, updated_at: new Date().toISOString() })
      .eq("id", team.id);

    if (error) throw new Error(error.message);
    return (await getTeamByIdOrCode(team.id))!;
  }

  // SQLite Fallback
  await initDatabase();
  const db = getDb();

  const now = new Date().toISOString();
  await db.execute({
    sql: `UPDATE teams SET team_id = ?, team_name = ?, updated_at = ? WHERE id = ?`,
    args: [newCode, newName, now, team.id],
  });

  return (await getTeamByIdOrCode(team.id))!;
}

export async function deleteTeam(identifier: string): Promise<void> {
  const team = await getTeamByIdOrCode(identifier);
  if (!team) throw new Error("Team not found.");

  const supabase = getSupabaseClient();
  if (supabase) {
    const { error } = await supabase.from("teams").delete().eq("id", team.id);
    if (error) throw new Error(error.message);
    return;
  }

  // SQLite Fallback
  await initDatabase();
  const db = getDb();

  const members = await db.execute({
    sql: `SELECT id FROM team_members WHERE team_id = ?`,
    args: [team.id],
  });

  for (const m of members.rows) {
    await db.execute({
      sql: `DELETE FROM attendance WHERE team_member_id = ?`,
      args: [String(m.id)],
    });
  }

  await db.execute({
    sql: `DELETE FROM team_members WHERE team_id = ?`,
    args: [team.id],
  });

  await db.execute({
    sql: `DELETE FROM teams WHERE id = ?`,
    args: [team.id],
  });
}

export async function addMemberToTeam(
  teamIdentifier: string,
  data: { name?: string; member_name?: string; email?: string; role?: string }
): Promise<TeamMemberDto> {
  const team = await getTeamByIdOrCode(teamIdentifier);
  if (!team) throw new Error("Team not found.");

  const memberName = (data.member_name || data.name || "").trim();
  if (!memberName) throw new Error("Member name is required.");

  const role = data.role === "Leader" ? "Leader" : "Member";
  const email = data.email ? data.email.trim() : null;

  const supabase = getSupabaseClient();
  if (supabase) {
    const { data: created, error } = await supabase
      .from("team_members")
      .insert([{ team_id: team.id, member_name: memberName, email, role }])
      .select()
      .single();

    if (error) throw new Error(error.message);

    return {
      id: String(created.id),
      name: memberName,
      member_name: memberName,
      email: email || undefined,
      role,
      status: null,
      markedAt: null,
    };
  }

  // SQLite Fallback
  await initDatabase();
  const db = getDb();

  const id = uuidv4();
  const now = new Date().toISOString();

  await db.execute({
    sql: `INSERT INTO team_members (id, team_id, member_name, email, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [id, team.id, memberName, email, role, now, now],
  });

  return {
    id,
    name: memberName,
    member_name: memberName,
    email: email || undefined,
    role,
    status: null,
    markedAt: null,
  };
}

export async function updateTeamMember(
  memberId: string,
  data: { name?: string; member_name?: string; email?: string; role?: string }
): Promise<TeamMemberDto> {
  const supabase = getSupabaseClient();

  if (supabase) {
    const updateObj: any = { updated_at: new Date().toISOString() };
    if (data.member_name || data.name) updateObj.member_name = (data.member_name || data.name)?.trim();
    if (data.email !== undefined) updateObj.email = data.email ? data.email.trim() : null;
    if (data.role) updateObj.role = data.role === "Leader" ? "Leader" : "Member";

    const { data: updated, error } = await supabase
      .from("team_members")
      .update(updateObj)
      .eq("id", memberId)
      .select()
      .single();

    if (error) throw new Error(error.message);

    return {
      id: memberId,
      name: String(updated.member_name),
      member_name: String(updated.member_name),
      email: updated.email ? String(updated.email) : undefined,
      role: updated.role as "Leader" | "Member",
      status: null,
      markedAt: null,
    };
  }

  // SQLite Fallback
  await initDatabase();
  const db = getDb();

  const memberRes = await db.execute({
    sql: `SELECT id, team_id, member_name, email, role FROM team_members WHERE id = ? LIMIT 1`,
    args: [memberId],
  });

  if (memberRes.rows.length === 0) {
    throw new Error("Team member not found.");
  }

  const existing = memberRes.rows[0];
  const newName = (data.member_name || data.name || String(existing.member_name)).trim();
  const newRole = data.role ? (data.role === "Leader" ? "Leader" : "Member") : String(existing.role);
  const newEmail = data.email !== undefined ? (data.email ? data.email.trim() : null) : (existing.email ? String(existing.email) : null);
  const now = new Date().toISOString();

  await db.execute({
    sql: `UPDATE team_members SET member_name = ?, email = ?, role = ?, updated_at = ? WHERE id = ?`,
    args: [newName, newEmail, newRole, now, memberId],
  });

  return {
    id: memberId,
    name: newName,
    member_name: newName,
    email: newEmail || undefined,
    role: newRole as "Leader" | "Member",
    status: null,
    markedAt: null,
  };
}

export async function deleteTeamMember(memberId: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (supabase) {
    const { error } = await supabase.from("team_members").delete().eq("id", memberId);
    if (error) throw new Error(error.message);
    return;
  }

  // SQLite Fallback
  await initDatabase();
  const db = getDb();

  await db.execute({
    sql: `DELETE FROM attendance WHERE team_member_id = ?`,
    args: [memberId],
  });

  const res = await db.execute({
    sql: `DELETE FROM team_members WHERE id = ?`,
    args: [memberId],
  });

  if (res.rowsAffected === 0) {
    throw new Error("Team member not found.");
  }
}

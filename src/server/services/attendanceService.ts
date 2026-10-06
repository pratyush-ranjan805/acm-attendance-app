import { v4 as uuidv4 } from "uuid";
import { getDb, initDatabase } from "../db";
import { getSupabaseClient } from "../supabase";

export type AttendanceStatus = "Present" | "Absent";

export interface AttendanceRecordDto {
  id?: string;
  date: string;
  teamId: string;
  teamName: string;
  memberId: string;
  memberName: string;
  role: string;
  status: AttendanceStatus;
  markedAt: string | null;
  marked_at?: string | null;
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

export async function saveAttendanceBatch(
  payload: {
    teamId?: string;
    date?: string;
    records?: { memberId?: string; team_member_id?: string; status: string }[];
    attendance?: { memberId?: string; team_member_id?: string; status: string; date?: string }[];
  },
  adminUserId?: string
): Promise<{ markedAt: string; count: number }> {
  const now = new Date().toISOString();
  const fallbackDate = payload.date || new Date().toLocaleDateString("en-CA");
  const markedBy = adminUserId || "admin";

  const rawList = payload.records || payload.attendance || [];
  if (!Array.isArray(rawList) || rawList.length === 0) {
    throw new Error("No attendance records provided.");
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    let count = 0;
    for (const item of rawList) {
      const memberId = item.memberId || item.team_member_id;
      if (!memberId) continue;

      const rawStatus = item.status?.trim();
      if (rawStatus !== "Present" && rawStatus !== "Absent") {
        throw new Error(`Invalid status '${item.status}'. Status must be 'Present' or 'Absent'.`);
      }
      const status: AttendanceStatus = rawStatus as AttendanceStatus;
      const itemDate = String("date" in item && item.date ? item.date : fallbackDate).trim();

      // Upsert into Supabase attendance table
      const { error } = await supabase
        .from("attendance")
        .upsert(
          {
            team_member_id: memberId,
            attendance_date: itemDate,
            status,
            marked_at: now,
            updated_at: now,
            marked_by: markedBy,
          },
          { onConflict: "team_member_id,attendance_date" }
        );

      if (error) throw new Error(error.message);
      count++;
    }
    return { markedAt: now, count };
  }

  // SQLite Fallback
  await initDatabase();
  const db = getDb();

  let count = 0;
  for (const item of rawList) {
    const memberId = item.memberId || item.team_member_id;
    if (!memberId) continue;

    const rawStatus = item.status?.trim();
    if (rawStatus !== "Present" && rawStatus !== "Absent") {
      throw new Error(`Invalid status '${item.status}'. Status must be 'Present' or 'Absent'.`);
    }
    const status: AttendanceStatus = rawStatus as AttendanceStatus;
    const itemDate = String("date" in item && item.date ? item.date : fallbackDate).trim();

    // Verify member exists
    const memberCheck = await db.execute({
      sql: `SELECT id FROM team_members WHERE id = ? LIMIT 1`,
      args: [memberId],
    });
    if (memberCheck.rows.length === 0) {
      continue;
    }

    // Check if attendance already exists for this member on this date
    const existing = await db.execute({
      sql: `SELECT id FROM attendance WHERE team_member_id = ? AND attendance_date = ? LIMIT 1`,
      args: [memberId, itemDate],
    });

    if (existing.rows.length > 0) {
      // Update existing record
      await db.execute({
        sql: `UPDATE attendance SET status = ?, updated_at = ?, marked_at = ?, marked_by = ? WHERE id = ?`,
        args: [status, now, now, markedBy, String(existing.rows[0].id)],
      });
    } else {
      // Insert new record
      await db.execute({
        sql: `INSERT INTO attendance (id, team_member_id, attendance_date, status, marked_at, updated_at, marked_by) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [uuidv4(), memberId, itemDate, status, now, now, markedBy],
      });
    }
    count++;
  }

  return { markedAt: now, count };
}

export async function getAttendanceList(filters: {
  date?: string;
  team?: string;
  teamId?: string;
  status?: string;
}): Promise<AttendanceRecordDto[]> {
  const supabase = getSupabaseClient();

  if (supabase) {
    let query = supabase
      .from("attendance")
      .select(`
        id,
        attendance_date,
        status,
        marked_at,
        team_members (
          id,
          member_name,
          role,
          teams (
            id,
            team_id,
            team_name
          )
        )
      `)
      .order("attendance_date", { ascending: false });

    if (filters.date && filters.date.trim()) {
      query = query.eq("attendance_date", filters.date.trim());
    }

    if (filters.status && filters.status.trim()) {
      query = query.eq("status", filters.status.trim());
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const teamFilter = (filters.teamId || filters.team || "").trim().toLowerCase();

    const results: AttendanceRecordDto[] = [];
    for (const r of data || []) {
      const tm = (r as any).team_members;
      if (!tm) continue;
      const t = tm.teams;
      if (!t) continue;

      if (teamFilter) {
        const matchCode = String(t.team_id || "").toLowerCase().includes(teamFilter);
        const matchName = String(t.team_name || "").toLowerCase().includes(teamFilter);
        if (!matchCode && !matchName) continue;
      }

      results.push({
        id: String(r.id),
        date: String(r.attendance_date),
        teamId: String(t.team_id),
        teamName: String(t.team_name),
        memberId: String(tm.id),
        memberName: String(tm.member_name),
        role: String(tm.role),
        status: String(r.status) as AttendanceStatus,
        markedAt: r.marked_at ? String(r.marked_at) : null,
        marked_at: r.marked_at ? String(r.marked_at) : null,
      });
    }

    return results.sort((a, b) => a.date.localeCompare(b.date) || a.teamId.localeCompare(b.teamId) || a.memberName.localeCompare(b.memberName));
  }

  // SQLite Fallback
  await initDatabase();
  const db = getDb();

  let sql = `
    SELECT 
      a.id,
      a.attendance_date,
      a.status,
      a.marked_at,
      m.id as member_id,
      m.member_name,
      m.role,
      t.id as team_uuid,
      t.team_id,
      t.team_name
    FROM attendance a
    JOIN team_members m ON a.team_member_id = m.id
    JOIN teams t ON m.team_id = t.id
    WHERE 1=1
  `;
  const args: any[] = [];

  if (filters.date && filters.date.trim()) {
    sql += ` AND a.attendance_date = ?`;
    args.push(filters.date.trim());
  }

  const teamFilter = (filters.teamId || filters.team || "").trim();
  if (teamFilter) {
    sql += ` AND (LOWER(t.team_id) = LOWER(?) OR LOWER(t.team_name) LIKE ?)`;
    args.push(teamFilter, `%${teamFilter.toLowerCase()}%`);
  }

  if (filters.status && filters.status.trim()) {
    sql += ` AND a.status = ?`;
    args.push(filters.status.trim());
  }

  sql += ` ORDER BY a.attendance_date DESC, t.team_id ASC, m.member_name ASC`;

  const res = await db.execute({ sql, args });

  return res.rows.map((r) => ({
    id: String(r.id),
    date: String(r.attendance_date),
    teamId: String(r.team_id),
    teamName: String(r.team_name),
    memberId: String(r.member_id),
    memberName: String(r.member_name),
    role: String(r.role),
    status: String(r.status) as AttendanceStatus,
    markedAt: r.marked_at ? String(r.marked_at) : null,
    marked_at: r.marked_at ? String(r.marked_at) : null,
  }));
}

export async function getDashboardStats(targetDate?: string): Promise<DashboardStatsDto> {
  const date = targetDate || new Date().toLocaleDateString("en-CA");
  const supabase = getSupabaseClient();

  if (supabase) {
    const [teamsRes, membersRes, attRes] = await Promise.all([
      supabase.from("teams").select("id, team_id, team_name"),
      supabase.from("team_members").select("id, team_id"),
      supabase.from("attendance").select("team_member_id, status").eq("attendance_date", date),
    ]);

    const teamsList = teamsRes.data || [];
    const membersList = membersRes.data || [];
    const attList = attRes.data || [];

    const totalTeams = teamsList.length;
    const totalMembers = membersList.length;

    const present = attList.filter((a: any) => a.status === "Present").length;
    const absent = attList.filter((a: any) => a.status === "Absent").length;
    const notMarked = Math.max(0, totalMembers - (present + absent));
    const percentage = totalMembers > 0 ? Number(((present / totalMembers) * 100).toFixed(2)) : 0;

    const attStatusMap = new Map<string, string>();
    attList.forEach((a: any) => attStatusMap.set(a.team_member_id, a.status));

    const teams = teamsList.map((t: any) => {
      const teamMems = membersList.filter((m: any) => m.team_id === t.id);
      const memCount = teamMems.length;
      let pCount = 0, aCount = 0;
      teamMems.forEach((m: any) => {
        const st = attStatusMap.get(m.id);
        if (st === "Present") pCount++;
        else if (st === "Absent") aCount++;
      });
      const pct = memCount > 0 ? Number(((pCount / memCount) * 100).toFixed(2)) : 0;

      return {
        teamId: String(t.team_id),
        teamName: String(t.team_name),
        totalMembers: memCount,
        present: pCount,
        absent: aCount,
        attendancePercentage: pct,
      };
    });

    return {
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
  }

  // SQLite Fallback
  await initDatabase();
  const db = getDb();

  const teamsCountRes = await db.execute(`SELECT COUNT(*) as count FROM teams;`);
  const totalTeams = Number(teamsCountRes.rows[0]?.count ?? 0);

  const membersCountRes = await db.execute(`SELECT COUNT(*) as count FROM team_members;`);
  const totalMembers = Number(membersCountRes.rows[0]?.count ?? 0);

  const presentRes = await db.execute({
    sql: `SELECT COUNT(*) as count FROM attendance WHERE attendance_date = ? AND status = 'Present'`,
    args: [date],
  });
  const present = Number(presentRes.rows[0]?.count ?? 0);

  const absentRes = await db.execute({
    sql: `SELECT COUNT(*) as count FROM attendance WHERE attendance_date = ? AND status = 'Absent'`,
    args: [date],
  });
  const absent = Number(absentRes.rows[0]?.count ?? 0);

  const notMarked = Math.max(0, totalMembers - (present + absent));
  const percentage = totalMembers > 0 ? Number(((present / totalMembers) * 100).toFixed(2)) : 0;

  const teamStatsRes = await db.execute({
    sql: `
      SELECT 
        t.team_id,
        t.team_name,
        COUNT(m.id) as total_members,
        SUM(CASE WHEN a.status = 'Present' THEN 1 ELSE 0 END) as present_count,
        SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END) as absent_count
      FROM teams t
      LEFT JOIN team_members m ON t.id = m.team_id
      LEFT JOIN attendance a ON m.id = a.team_member_id AND a.attendance_date = ?
      GROUP BY t.id, t.team_id, t.team_name
      ORDER BY t.team_id ASC
    `,
    args: [date],
  });

  const teams = teamStatsRes.rows.map((row) => {
    const mems = Number(row.total_members ?? 0);
    const p = Number(row.present_count ?? 0);
    const a = Number(row.absent_count ?? 0);
    const pct = mems > 0 ? Number(((p / mems) * 100).toFixed(2)) : 0;

    return {
      teamId: String(row.team_id),
      teamName: String(row.team_name),
      totalMembers: mems,
      present: p,
      absent: a,
      attendancePercentage: pct,
    };
  });

  return {
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
}

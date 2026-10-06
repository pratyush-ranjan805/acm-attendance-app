import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { v4 as uuidv4 } from "uuid";
import { getSupabaseClient } from "../supabase";
import { getDb, initDatabase } from "../db";

async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const pdfParse = require("pdf-parse");
    const data = await pdfParse(buffer);
    return data.text || "";
  } catch {
    return "";
  }
}

export interface ParsedMember {
  name: string;
  email?: string;
  role: "Leader" | "Member";
}

export interface ParsedTeam {
  teamId: string;
  teamName: string;
  members: ParsedMember[];
}

export interface ImportResult {
  success: boolean;
  teamsCount: number;
  membersCount: number;
  teams: ParsedTeam[];
  message: string;
  errors?: string[];
}

function cleanText(val: any): string {
  if (val === null || val === undefined) return "";
  return String(val).trim();
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function parseFileToTeams(buffer: Buffer, fileName: string): Promise<ParsedTeam[]> {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";

  if (ext === "pdf") {
    return parsePdfToTeams(buffer);
  } else {
    // Handles xlsx, xls, csv, tsv
    return parseSpreadsheetToTeams(buffer);
  }
}

function parseSpreadsheetToTeams(buffer: Buffer): ParsedTeam[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error("The uploaded spreadsheet is empty.");

  const sheet = workbook.Sheets[firstSheetName];
  const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  if (rawRows.length === 0) throw new Error("No data rows found in the sheet.");

  const teamsMap = new Map<string, ParsedTeam>();
  let autoIdCounter = 1;

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const normalizedRow: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) {
      normalizedRow[normalizeKey(k)] = cleanText(v);
    }

    // Check for Horizontal Format (e.g. Leader Name, Member 1, Member 2, Team Name)
    const teamNameVal =
      normalizedRow["teamname"] ||
      normalizedRow["team"] ||
      normalizedRow["projectname"] ||
      normalizedRow["projecttitle"] ||
      normalizedRow["groupname"] ||
      "";

    let teamIdVal =
      normalizedRow["teamid"] ||
      normalizedRow["teamcode"] ||
      normalizedRow["teamno"] ||
      normalizedRow["teamnumber"] ||
      normalizedRow["id"] ||
      "";

    // Format A: Standard Row per Member (Team ID, Team Name, Member Name, Role, Email)
    const singleMemberName =
      normalizedRow["membername"] ||
      normalizedRow["name"] ||
      normalizedRow["participantname"] ||
      normalizedRow["studentname"] ||
      normalizedRow["fullname"] ||
      "";

    if (singleMemberName) {
      const finalTeamName = teamNameVal || `Team ${teamIdVal || autoIdCounter}`;
      const finalTeamId = (teamIdVal || `ACM${String(autoIdCounter).padStart(3, "0")}`).toUpperCase();

      if (!teamsMap.has(finalTeamId)) {
        teamsMap.set(finalTeamId, {
          teamId: finalTeamId,
          teamName: finalTeamName,
          members: [],
        });
        if (!teamIdVal) autoIdCounter++;
      }

      const teamObj = teamsMap.get(finalTeamId)!;
      const roleVal = normalizedRow["role"] || normalizedRow["designation"] || normalizedRow["position"] || "";
      const isLeader =
        roleVal.toLowerCase().includes("lead") ||
        roleVal.toLowerCase().includes("captain") ||
        teamObj.members.length === 0;

      const emailVal =
        normalizedRow["email"] ||
        normalizedRow["emailid"] ||
        normalizedRow["mail"] ||
        normalizedRow["contact"] ||
        "";

      teamObj.members.push({
        name: singleMemberName,
        email: emailVal || undefined,
        role: isLeader ? "Leader" : "Member",
      });
      continue;
    }

    // Format B: Horizontal Row per Team (Leader Name, Member 2, Member 3, Member 4)
    if (teamNameVal || teamIdVal) {
      const finalTeamName = teamNameVal || `Team ${teamIdVal}`;
      const finalTeamId = (teamIdVal || `ACM${String(autoIdCounter++).padStart(3, "0")}`).toUpperCase();

      const members: ParsedMember[] = [];

      // Check leader
      const leaderName = normalizedRow["leadername"] || normalizedRow["teamleader"] || normalizedRow["leader"] || "";
      const leaderEmail = normalizedRow["leaderemail"] || normalizedRow["leadmail"] || "";
      if (leaderName) {
        members.push({
          name: leaderName,
          email: leaderEmail || undefined,
          role: "Leader",
        });
      }

      // Check member 1, 2, 3, 4, 5...
      for (let m = 1; m <= 10; m++) {
        const mName =
          normalizedRow[`member${m}name`] ||
          normalizedRow[`member${m}`] ||
          normalizedRow[`student${m}`] ||
          normalizedRow[`participant${m}`] ||
          "";
        const mEmail = normalizedRow[`member${m}email`] || normalizedRow[`email${m}`] || "";

        if (mName && mName !== leaderName) {
          members.push({
            name: mName,
            email: mEmail || undefined,
            role: members.length === 0 ? "Leader" : "Member",
          });
        }
      }

      if (members.length > 0) {
        teamsMap.set(finalTeamId, {
          teamId: finalTeamId,
          teamName: finalTeamName,
          members,
        });
      }
    }
  }

  return Array.from(teamsMap.values());
}

async function parsePdfToTeams(buffer: Buffer): Promise<ParsedTeam[]> {
  const text = await extractPdfText(buffer);
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const teamsMap = new Map<string, ParsedTeam>();
  let currentTeam: ParsedTeam | null = null;
  let counter = 1;

  for (const line of lines) {
    // Detect Team headers like "Team: ACM001 - CyberKnights" or "ACM001: CyberKnights"
    const teamMatch = line.match(/(?:Team\s*ID\s*[:\-]?\s*)?(ACM\d{3,4}|[A-Z0-9_-]{3,10})\s*[:\-|]\s*(.+)/i);
    if (teamMatch) {
      const code = teamMatch[1].toUpperCase();
      const name = teamMatch[2].trim();
      currentTeam = {
        teamId: code,
        teamName: name,
        members: [],
      };
      teamsMap.set(code, currentTeam);
      continue;
    }

    // Detect member lines like "- Rahul Kumar (Leader) - rahul@org" or "1. Aman Singh - Member"
    if (currentTeam) {
      const memberMatch = line.match(/^(?:[\d\-\*\•\.]+\s*)?([A-Za-z\s\.\'\-]+?)(?:\s*[\(\[\-]\s*(Leader|Member|Captain)\s*[\)\]])?(?:\s*[\-|\:]\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}))?$/i);
      if (memberMatch) {
        const memName = memberMatch[1].trim();
        const role = (memberMatch[2] || "").toLowerCase().includes("lead") ? "Leader" : (currentTeam.members.length === 0 ? "Leader" : "Member");
        const email = memberMatch[3] ? memberMatch[3].trim() : undefined;

        if (memName.length > 2 && !memName.toLowerCase().startsWith("page ") && !memName.toLowerCase().startsWith("attendance")) {
          currentTeam.members.push({
            name: memName,
            email,
            role,
          });
        }
      }
    }
  }

  return Array.from(teamsMap.values());
}

export async function importTeamsAndMembers(teams: ParsedTeam[], clearExisting: boolean = false): Promise<ImportResult> {
  if (!teams || teams.length === 0) {
    throw new Error("No valid teams or members found in the uploaded file.");
  }

  const supabase = getSupabaseClient();
  let teamsCount = 0;
  let membersCount = 0;

  if (supabase) {
    if (clearExisting) {
      await supabase.from("attendance").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("team_members").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("teams").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    }

    for (const t of teams) {
      // Upsert Team
      const { data: teamData, error: teamErr } = await supabase
        .from("teams")
        .upsert({ team_id: t.teamId.toUpperCase(), team_name: t.teamName }, { onConflict: "team_id" })
        .select("id")
        .single();

      if (teamErr) throw new Error(`Error saving team ${t.teamId}: ${teamErr.message}`);
      const teamId = teamData.id;
      teamsCount++;

      // Insert Members
      for (const m of t.members) {
        const { error: memErr } = await supabase.from("team_members").insert({
          team_id: teamId,
          member_name: m.name,
          email: m.email || null,
          role: m.role || "Member",
        });

        if (!memErr) membersCount++;
      }
    }

    return {
      success: true,
      teamsCount,
      membersCount,
      teams,
      message: `Successfully registered ${teamsCount} teams and ${membersCount} members in Supabase!`,
    };
  }

  // SQLite Fallback
  await initDatabase();
  const db = getDb();

  if (clearExisting) {
    await db.execute(`DELETE FROM attendance;`);
    await db.execute(`DELETE FROM team_members;`);
    await db.execute(`DELETE FROM teams;`);
  }

  const now = new Date().toISOString();

  for (const t of teams) {
    let tId = uuidv4();
    const existingTeam = await db.execute({
      sql: `SELECT id FROM teams WHERE LOWER(team_id) = LOWER(?) LIMIT 1`,
      args: [t.teamId],
    });

    if (existingTeam.rows.length > 0) {
      tId = String(existingTeam.rows[0].id);
      await db.execute({
        sql: `UPDATE teams SET team_name = ?, updated_at = ? WHERE id = ?`,
        args: [t.teamName, now, tId],
      });
    } else {
      await db.execute({
        sql: `INSERT INTO teams (id, team_id, team_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
        args: [tId, t.teamId.toUpperCase(), t.teamName, now, now],
      });
    }
    teamsCount++;

    for (const m of t.members) {
      const mId = uuidv4();
      await db.execute({
        sql: `INSERT INTO team_members (id, team_id, member_name, email, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [mId, tId, m.name, m.email || null, m.role || "Member", now, now],
      });
      membersCount++;
    }
  }

  return {
    success: true,
    teamsCount,
    membersCount,
    teams,
    message: `Successfully registered ${teamsCount} teams and ${membersCount} members!`,
  };
}

export async function generateImportTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Teams & Members Template");

  ws.columns = [
    { header: "Team ID", key: "teamId", width: 16 },
    { header: "Team Name", key: "teamName", width: 26 },
    { header: "Member Name", key: "memberName", width: 24 },
    { header: "Role", key: "role", width: 14 },
    { header: "Email", key: "email", width: 30 },
  ];

  const headerRow = ws.getRow(1);
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFEA580C" }, // ACM Orange
  };
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.height = 24;

  const sampleRows = [
    { teamId: "ACM001", teamName: "Pixel Pioneers", memberName: "Alex Morgan", role: "Leader", email: "alex.m@college.edu" },
    { teamId: "ACM001", teamName: "Pixel Pioneers", memberName: "Jordan Lee", role: "Member", email: "jordan.l@college.edu" },
    { teamId: "ACM001", teamName: "Pixel Pioneers", memberName: "Samira Khan", role: "Member", email: "samira.k@college.edu" },
    { teamId: "ACM002", teamName: "Neural Ninjas", memberName: "Chris Davis", role: "Leader", email: "chris.d@college.edu" },
    { teamId: "ACM002", teamName: "Neural Ninjas", memberName: "Taylor Swift", role: "Member", email: "taylor.s@college.edu" },
    { teamId: "ACM002", teamName: "Neural Ninjas", memberName: "David Miller", role: "Member", email: "david.m@college.edu" },
  ];

  for (const r of sampleRows) {
    ws.addRow(r);
  }

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function clearAllTeamsAndMembers(): Promise<void> {
  const supabase = getSupabaseClient();
  if (supabase) {
    await supabase.from("attendance").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("team_members").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("teams").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    return;
  }

  await initDatabase();
  const db = getDb();
  await db.execute(`DELETE FROM attendance;`);
  await db.execute(`DELETE FROM team_members;`);
  await db.execute(`DELETE FROM teams;`);
}

import { createClient, Client } from "@libsql/client";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";

let dbInstance: Client | null = null;
let initialized = false;

export function getDb(): Client {
  if (!dbInstance) {
    const defaultFile = process.env.VERCEL ? "file:/tmp/attendance.db" : "file:./data/attendance.db";
    const dbUrl = process.env.DATABASE_URL || defaultFile;
    
    // Ensure directory exists if it's a local file database
    if (dbUrl.startsWith("file:")) {
      const dbPath = dbUrl.replace("file:", "");
      const resolvedDir = path.dirname(path.resolve(process.cwd(), dbPath));
      if (!fs.existsSync(resolvedDir)) {
        fs.mkdirSync(resolvedDir, { recursive: true });
      }
    }

    dbInstance = createClient({
      url: dbUrl,
      authToken: process.env.DATABASE_AUTH_TOKEN,
    });
  }
  return dbInstance;
}

export async function initDatabase(): Promise<void> {
  if (initialized) return;
  const db = getDb();

  // Create tables according to requirements
  await db.execute(`
    CREATE TABLE IF NOT EXISTS admins (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      team_id TEXT UNIQUE NOT NULL,
      team_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS team_members (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      member_name TEXT NOT NULL,
      email TEXT,
      role TEXT NOT NULL DEFAULT 'Member',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS attendance (
      id TEXT PRIMARY KEY,
      team_member_id TEXT NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
      attendance_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('Present', 'Absent')),
      marked_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      marked_by TEXT,
      UNIQUE (team_member_id, attendance_date)
    );
  `);

  // Create indexes for performance
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(attendance_date);`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_attendance_member ON attendance(team_member_id);`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_members_team ON team_members(team_id);`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_teams_team_id ON teams(team_id);`);

  // Seed default Admin if no admin exists
  const adminRes = await db.execute(`SELECT COUNT(*) as count FROM admins;`);
  const adminCount = Number(adminRes.rows[0]?.count ?? 0);

  if (adminCount === 0) {
    const adminEmail = process.env.DEFAULT_ADMIN_EMAIL || "admin@siggraph.acm.org";
    const adminPass = process.env.DEFAULT_ADMIN_PASSWORD || "Admin@123";
    const passHash = await bcrypt.hash(adminPass, 10);
    const now = new Date().toISOString();

    await db.execute({
      sql: `INSERT INTO admins (id, name, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [uuidv4(), "SIGGRAPH Admin", adminEmail.toLowerCase(), passHash, "admin", now, now],
    });
  }

  initialized = true;
}

import { NextRequest } from "next/server";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { getDb, initDatabase } from "./db";
import { getSupabaseClient } from "./supabase";

const JWT_SECRET = process.env.JWT_SECRET || "acm-siggraph-secret-key-2026";

export interface AdminPayload {
  userId: string;
  name: string;
  email: string;
  role: "admin";
}

export function signAdminToken(admin: AdminPayload): string {
  return jwt.sign(
    {
      userId: admin.userId,
      name: admin.name,
      email: admin.email,
      role: admin.role,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

export function verifyAdminToken(token: string): AdminPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AdminPayload;
    if (decoded && decoded.role === "admin") {
      return decoded;
    }
    return null;
  } catch {
    return null;
  }
}

export async function authenticateRequest(req: NextRequest): Promise<AdminPayload | null> {
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
  if (!authHeader) return null;

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
    return null;
  }

  const token = parts[1];
  return verifyAdminToken(token);
}

export async function loginAdmin(email: string, password: string): Promise<{ token: string; admin: { name: string; email: string } } | null> {
  const supabase = getSupabaseClient();

  if (supabase) {
    const { data, error } = await supabase
      .from("admins")
      .select("id, name, email, password_hash, role")
      .ilike("email", email.trim())
      .limit(1);

    if (error || !data || data.length === 0) {
      return null;
    }

    const adminRow = data[0];
    const isMatch = await bcrypt.compare(password, adminRow.password_hash);
    if (!isMatch) return null;

    const payload: AdminPayload = {
      userId: adminRow.id,
      name: adminRow.name,
      email: adminRow.email,
      role: "admin",
    };

    const token = signAdminToken(payload);
    return {
      token,
      admin: {
        name: adminRow.name,
        email: adminRow.email,
      },
    };
  }

  // Fallback to SQLite
  await initDatabase();
  const db = getDb();
  
  const res = await db.execute({
    sql: `SELECT id, name, email, password_hash, role FROM admins WHERE LOWER(email) = LOWER(?) LIMIT 1`,
    args: [email.trim()],
  });

  if (res.rows.length === 0) {
    return null;
  }

  const adminRow = res.rows[0] as unknown as {
    id: string;
    name: string;
    email: string;
    password_hash: string;
    role: "admin";
  };

  const isMatch = await bcrypt.compare(password, adminRow.password_hash);
  if (!isMatch) {
    return null;
  }

  const payload: AdminPayload = {
    userId: adminRow.id,
    name: adminRow.name,
    email: adminRow.email,
    role: "admin",
  };

  const token = signAdminToken(payload);
  return {
    token,
    admin: {
      name: adminRow.name,
      email: adminRow.email,
    },
  };
}

import { NextRequest } from "next/server";
import jwt from "jsonwebtoken";
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

/**
 * Passwordless login: if the email matches a profile with is_admin=true, issue a token directly.
 * No password is required.
 */
export async function loginAdminByEmail(
  email: string
): Promise<{ token: string; admin: { name: string; email: string } } | null> {
  const cleanEmail = email.trim().toLowerCase();
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, college_email, is_admin")
    .ilike("college_email", cleanEmail)
    .single();

  if (!profileError && profileData && profileData.is_admin) {
    const payload: AdminPayload = {
      userId: String(profileData.id),
      name: String(profileData.full_name || "Admin"),
      email: String(profileData.college_email || cleanEmail),
      role: "admin",
    };
    const token = signAdminToken(payload);
    return {
      token,
      admin: { name: payload.name, email: payload.email },
    };
  }
  return null;
}

/**
 * Login using shared ADMIN_PASSWORD or Supabase Auth.
 * 
 * Supports:
 * 1. Passwordless: is_admin=true profile email (no password needed)
 * 2. Master admin fallback (email matches ADMIN_EMAIL + ADMIN_PASSWORD)
 * 3. Any college_email with profiles.is_admin = true + ADMIN_PASSWORD
 * 4. Supabase Auth credentials (email + Supabase password) with profiles.is_admin = true
 */
export async function loginAdmin(
  email: string,
  password: string
): Promise<{ token: string; admin: { name: string; email: string } } | null> {
  const cleanEmail = email.trim().toLowerCase();
  const envAdminPassword = process.env.ADMIN_PASSWORD || "admin123";
  const envAdminEmail = (process.env.ADMIN_EMAIL || "admin@acm.org").trim().toLowerCase();

  // 0. Passwordless: is_admin=true profile — no password required
  if (!password || password.trim() === "") {
    const byEmail = await loginAdminByEmail(cleanEmail);
    if (byEmail) return byEmail;
    return null; // email not found or not admin
  }

  // 1. Master admin bypass / default desk credentials
  if (password === envAdminPassword && cleanEmail === envAdminEmail) {
    const payload: AdminPayload = {
      userId: "master-admin",
      name: "Event Admin",
      email: cleanEmail,
      role: "admin",
    };
    const token = signAdminToken(payload);
    return {
      token,
      admin: {
        name: payload.name,
        email: payload.email,
      },
    };
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  // 2. Shared ADMIN_PASSWORD matching any admin profile in public.profiles
  if (password === envAdminPassword) {
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name, college_email, is_admin")
      .ilike("college_email", cleanEmail)
      .single();

    if (!profileError && profileData && profileData.is_admin) {
      const payload: AdminPayload = {
        userId: String(profileData.id),
        name: String(profileData.full_name || "Admin"),
        email: String(profileData.college_email || cleanEmail),
        role: "admin",
      };
      const token = signAdminToken(payload);
      return {
        token,
        admin: {
          name: payload.name,
          email: payload.email,
        },
      };
    }
  }

  // 3. Fallback: Supabase Auth (email + password)
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: cleanEmail,
    password,
  });

  if (!authError && authData?.user) {
    const user = authData.user;
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name, college_email, is_admin")
      .eq("id", user.id)
      .single();

    if (!profileError && profileData && profileData.is_admin) {
      const payload: AdminPayload = {
        userId: String(profileData.id),
        name: String(profileData.full_name || "Admin"),
        email: String(profileData.college_email || user.email),
        role: "admin",
      };
      const token = signAdminToken(payload);
      return {
        token,
        admin: {
          name: payload.name,
          email: payload.email,
        },
      };
    }
  }

  return null;
}

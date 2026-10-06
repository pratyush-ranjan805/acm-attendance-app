-- ============================================================
-- ACM SIGGRAPH Attendance Management System
-- Supabase Database Setup Script
-- Run this in Supabase → SQL Editor
-- ============================================================

-- 1. ADMINS TABLE
CREATE TABLE IF NOT EXISTS admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. TEAMS TABLE
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id TEXT UNIQUE NOT NULL,
  team_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. TEAM MEMBERS TABLE
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  member_name TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'Member' CHECK (role IN ('Leader', 'Member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. ATTENDANCE TABLE
CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Present', 'Absent')),
  marked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  marked_by TEXT,
  UNIQUE (team_member_id, attendance_date)
);

-- ============================================================
-- INDEXES for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_member ON attendance(team_member_id);
CREATE INDEX IF NOT EXISTS idx_members_team ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_teams_team_id ON teams(team_id);

-- ============================================================
-- DISABLE ROW LEVEL SECURITY (Admin-only system)
-- ============================================================
ALTER TABLE admins DISABLE ROW LEVEL SECURITY;
ALTER TABLE teams DISABLE ROW LEVEL SECURITY;
ALTER TABLE team_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE attendance DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- SEED DEFAULT ADMIN
-- Password: Admin@123  (bcrypt hash below)
-- ============================================================
INSERT INTO admins (name, email, password_hash, role)
VALUES (
  'SIGGRAPH Admin',
  'admin@siggraph.acm.org',
  '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',  -- Admin@123 (bcrypt)
  'admin'
)
ON CONFLICT (email) DO NOTHING;

-- ============================================================
-- DONE! Your Supabase database is ready.
-- ============================================================
-- Login credentials:
--   Email:    admin@siggraph.acm.org
--   Password: Admin@123
-- ============================================================

import { requireSupabase } from "../supabase";
import { fetchEligibleTeamsRaw } from "./teamService";
import { serverCache } from "../cache";

export interface MealTypeItem {
  key: string;
  label: string;
  icon?: string;
}

export interface MealParticipantDto {
  profileId: string;
  name: string;
  regNo: string;
  phone: string;
  email: string;
  teamId: string;
  teamCode: string;
  teamName: string;
  role: "Leader" | "Member";
  attendanceStatus: "Present" | "Absent" | "Unmarked";
  meals: Record<string, boolean>;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface MealsSummaryDto {
  date: string;
  participants: MealParticipantDto[];
  mealTypes: MealTypeItem[];
  stats: {
    totalParticipants: number;
    mealCounts: Record<string, number>;
  };
}

export const DEFAULT_MEAL_TYPES: MealTypeItem[] = [
  { key: "day1_snack", label: "Day 1 – Snacks", icon: "🥪" },
  { key: "day1_dinner", label: "Day 1 – Dinner", icon: "🍛" },
  { key: "day1_overnight", label: "Day 1 – Overnight Snacks", icon: "🌙" },
  { key: "day2_snack", label: "Day 2 – Snacks", icon: "🥐" },
];

/**
 * Fetch all participants from eligible teams with their meal distribution state for a given date.
 */
export async function getMealsData(date: string): Promise<MealsSummaryDto> {
  const supabase = requireSupabase();

  // 1. Fetch eligible teams with member profiles
  const rawTeams = await fetchEligibleTeamsRaw();

  // 2. Fetch existing attendance records (which store meals jsonb) for the date
  const { data: attRows, error: attErr } = await supabase
    .from("ig_attendance")
    .select(`
      id,
      team_id,
      profile_id,
      attendance_date,
      status,
      meals,
      updated_by,
      updated_at,
      updater:profiles!updated_by(full_name)
    `)
    .eq("attendance_date", date);

  if (attErr) {
    console.error("Error fetching ig_attendance for meals:", attErr.message);
  }

  const attMap = new Map<string, any>();
  if (attRows) {
    for (const row of attRows) {
      attMap.set(row.profile_id, row);
    }
  }

  // 3. Collect all discovered custom meal keys from DB rows
  const discoveredKeys = new Set<string>();
  if (attRows) {
    for (const row of attRows) {
      if (row.meals && typeof row.meals === "object") {
        for (const k of Object.keys(row.meals)) {
          discoveredKeys.add(k);
        }
      }
    }
  }

  const mealTypes: MealTypeItem[] = [...DEFAULT_MEAL_TYPES];
  for (const k of discoveredKeys) {
    if (!mealTypes.some((m) => m.key === k)) {
      // Format human-friendly label from key
      const formatted = k
        .replace(/[_-]+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      mealTypes.push({ key: k, label: formatted, icon: "🍽️" });
    }
  }

  // 4. Map all participants
  const participants: MealParticipantDto[] = [];
  const seenProfiles = new Set<string>();
  const mealCounts: Record<string, number> = {};
  for (const m of mealTypes) mealCounts[m.key] = 0;

  for (const team of (rawTeams || []) as any[]) {
    const leaderId = team.leader_id;
    for (const link of (team.ig_team_members || []) as any[]) {
      const p: any = Array.isArray(link.profiles) ? link.profiles[0] : link.profiles;
      if (!p || seenProfiles.has(p.id)) continue;
      seenProfiles.add(p.id);

      const att = attMap.get(p.id);
      const mealsObj: Record<string, boolean> =
        att && att.meals && typeof att.meals === "object" ? { ...att.meals } : {};

      // Increment counts
      for (const [k, v] of Object.entries(mealsObj)) {
        if (v === true) {
          mealCounts[k] = (mealCounts[k] || 0) + 1;
        }
      }

      let statusVal: "Present" | "Absent" | "Unmarked" = "Unmarked";
      if (att?.status) {
        const s = String(att.status).toUpperCase();
        if (s === "PRESENT") statusVal = "Present";
        else if (s === "ABSENT") statusVal = "Absent";
      }

      const updaterName = (att?.updater as any)?.full_name || null;

      participants.push({
        profileId: String(p.id),
        name: String(p.full_name || "Unknown"),
        regNo: String(p.registration_number || "—"),
        phone: String(p.phone_number || "—"),
        email: String(p.college_email || ""),
        teamId: String(team.id),
        teamCode: String(team.team_code || "—"),
        teamName: String(team.name || "Unknown Team"),
        role: leaderId === p.id ? "Leader" : "Member",
        attendanceStatus: statusVal,
        meals: mealsObj,
        updatedBy: updaterName,
        updatedAt: att?.updated_at || null,
      });
    }
  }

  // Sort participants by team code, then name
  participants.sort((a, b) => {
    if (a.teamCode !== b.teamCode) return a.teamCode.localeCompare(b.teamCode);
    return a.name.localeCompare(b.name);
  });

  return {
    date,
    participants,
    mealTypes,
    stats: {
      totalParticipants: participants.length,
      mealCounts,
    },
  };
}

/**
 * Toggle or set a single participant's meal value.
 */
export async function updateParticipantMeal(
  payload: {
    date: string;
    profileId: string;
    teamId: string;
    mealKey: string;
    value: boolean;
  },
  adminUserId?: string
): Promise<{ success: boolean; meals: Record<string, boolean> }> {
  const supabase = requireSupabase();
  const now = new Date().toISOString();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  let validUpdatedBy: string | null = null;
  if (adminUserId && uuidRegex.test(adminUserId)) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", adminUserId)
      .limit(1);
    if (prof && prof.length > 0) validUpdatedBy = adminUserId;
  }

  // Check existing attendance row
  const { data: existing, error: findErr } = await supabase
    .from("ig_attendance")
    .select("id, meals")
    .eq("team_id", payload.teamId)
    .eq("profile_id", payload.profileId)
    .eq("attendance_date", payload.date)
    .limit(1);

  if (findErr) throw new Error(findErr.message);

  const currentMeals =
    existing && existing.length > 0 && existing[0].meals && typeof existing[0].meals === "object"
      ? { ...existing[0].meals }
      : {};

  const updatedMeals = {
    ...currentMeals,
    [payload.mealKey]: payload.value,
  };

  if (existing && existing.length > 0) {
    const updateBody: any = {
      meals: updatedMeals,
      updated_at: now,
    };
    if (validUpdatedBy) updateBody.updated_by = validUpdatedBy;

    const { error: updErr } = await supabase
      .from("ig_attendance")
      .update(updateBody)
      .eq("id", existing[0].id);

    if (updErr) throw new Error(updErr.message);
  } else {
    const insertBody: any = {
      team_id: payload.teamId,
      profile_id: payload.profileId,
      attendance_date: payload.date,
      status: "UNMARKED",
      meals: updatedMeals,
      marked_at: now,
      updated_at: now,
    };
    if (validUpdatedBy) insertBody.updated_by = validUpdatedBy;

    const { error: insErr } = await supabase
      .from("ig_attendance")
      .insert(insertBody);

    if (insErr) throw new Error(insErr.message);
  }

  serverCache.invalidate("attendance");
  return { success: true, meals: updatedMeals };
}

/**
 * Batch update meals for multiple participants (or an entire team).
 */
export async function batchUpdateParticipantMeals(
  payload: {
    date: string;
    updates: {
      profileId: string;
      teamId: string;
      meals: Record<string, boolean>;
    }[];
  },
  adminUserId?: string
): Promise<{ count: number }> {
  const supabase = requireSupabase();
  const now = new Date().toISOString();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  let validUpdatedBy: string | null = null;
  if (adminUserId && uuidRegex.test(adminUserId)) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", adminUserId)
      .limit(1);
    if (prof && prof.length > 0) validUpdatedBy = adminUserId;
  }

  let count = 0;
  for (const item of payload.updates) {
    const { data: existing } = await supabase
      .from("ig_attendance")
      .select("id, meals")
      .eq("team_id", item.teamId)
      .eq("profile_id", item.profileId)
      .eq("attendance_date", payload.date)
      .limit(1);

    const currentMeals =
      existing && existing.length > 0 && existing[0].meals && typeof existing[0].meals === "object"
        ? { ...existing[0].meals }
        : {};

    const mergedMeals = {
      ...currentMeals,
      ...item.meals,
    };

    if (existing && existing.length > 0) {
      const updateBody: any = {
        meals: mergedMeals,
        updated_at: now,
      };
      if (validUpdatedBy) updateBody.updated_by = validUpdatedBy;

      const { error } = await supabase
        .from("ig_attendance")
        .update(updateBody)
        .eq("id", existing[0].id);

      if (error) throw new Error(error.message);
    } else {
      const insertBody: any = {
        team_id: item.teamId,
        profile_id: item.profileId,
        attendance_date: payload.date,
        status: "UNMARKED",
        meals: mergedMeals,
        marked_at: now,
        updated_at: now,
      };
      if (validUpdatedBy) insertBody.updated_by = validUpdatedBy;

      const { error } = await supabase
        .from("ig_attendance")
        .insert(insertBody);

      if (error) throw new Error(error.message);
    }
    count++;
  }

  serverCache.invalidate("attendance");
  return { count };
}

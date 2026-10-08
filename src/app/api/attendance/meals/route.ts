import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/auth";
import { saveMealsBatch } from "@/server/services/attendanceService";

export async function POST(req: NextRequest) {
  try {
    const admin = await authenticateRequest(req);
    if (!admin) {
      return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
    }

    const body = await req.json();
    const { teamId, date, meals } = body || {};

    if (!teamId || !date || !Array.isArray(meals)) {
      return NextResponse.json(
        { message: "teamId, date, and meals[] are required." },
        { status: 400 }
      );
    }

    const result = await saveMealsBatch({ teamId, date, meals }, admin.userId);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { message: (error as Error).message || "Internal server error." },
      { status: 500 }
    );
  }
}

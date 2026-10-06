import { NextRequest, NextResponse } from "next/server";
import { saveAttendanceBatch, getAttendanceList } from "@/server/services/attendanceService";
import { authenticateRequest } from "@/server/auth";

export async function GET(req: NextRequest) {
  try {
    const admin = await authenticateRequest(req);
    if (!admin) {
      return NextResponse.json({ message: "Unauthorized. Admin access only." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date") || undefined;
    const teamId = searchParams.get("teamId") || searchParams.get("team") || undefined;
    const status = searchParams.get("status") || undefined;

    const records = await getAttendanceList({ date, teamId, status });
    return NextResponse.json(records, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { message: (error as Error).message || "Failed to fetch attendance records." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await authenticateRequest(req);
    if (!admin) {
      return NextResponse.json({ message: "Unauthorized. Admin access only." }, { status: 401 });
    }

    const body = await req.json();
    const result = await saveAttendanceBatch(body, admin.userId);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { message: (error as Error).message || "Failed to save attendance." },
      { status: 400 }
    );
  }
}

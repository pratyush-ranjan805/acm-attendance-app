import { NextRequest, NextResponse } from "next/server";
import { getDashboardStats } from "@/server/services/attendanceService";
import { authenticateRequest } from "@/server/auth";

export async function GET(req: NextRequest) {
  try {
    const admin = await authenticateRequest(req);
    if (!admin) {
      return NextResponse.json({ message: "Unauthorized. Admin access only." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date") || undefined;

    const stats = await getDashboardStats(date);
    return NextResponse.json(stats, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { message: (error as Error).message || "Failed to fetch dashboard stats." },
      { status: 500 }
    );
  }
}

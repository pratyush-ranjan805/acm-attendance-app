import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/auth";
import { clearAllTeamsAndMembers } from "@/server/services/importService";

export async function DELETE(req: NextRequest) {
  try {
    const admin = await authenticateRequest(req);
    if (!admin) {
      return NextResponse.json({ message: "Unauthorized. Admin access only." }, { status: 401 });
    }

    await clearAllTeamsAndMembers();
    return NextResponse.json({ message: "All teams and attendance records have been cleared." }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { message: (error as Error).message || "Failed to clear teams." },
      { status: 500 }
    );
  }
}

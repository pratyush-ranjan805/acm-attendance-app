import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/auth";
import { markParticipantIn } from "@/server/services/movementService";

export async function POST(req: NextRequest) {
  const admin = await authenticateRequest(req);
  if (!admin) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { profileId } = body || {};

    if (!profileId) {
      return NextResponse.json({ message: "Participant ID is required" }, { status: 400 });
    }

    await markParticipantIn(profileId, admin.name || admin.email);

    return NextResponse.json({ success: true, message: "Marked IN successfully" });
  } catch (error) {
    return NextResponse.json(
      { message: (error as Error).message || "Failed to mark IN" },
      { status: 400 }
    );
  }
}

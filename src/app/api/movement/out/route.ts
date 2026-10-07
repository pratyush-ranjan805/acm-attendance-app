import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/auth";
import { markParticipantOut, MovementReason } from "@/server/services/movementService";

export async function POST(req: NextRequest) {
  const admin = await authenticateRequest(req);
  if (!admin) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { profileId, reason, customReason } = body || {};

    if (!profileId) {
      return NextResponse.json({ message: "Participant ID is required" }, { status: 400 });
    }

    const validReasons: MovementReason[] = ["Exam", "Food", "Personal", "Restroom", "Other"];
    if (!reason || !validReasons.includes(reason)) {
      return NextResponse.json(
        { message: "Valid reason is required (Exam, Food, Personal, Restroom, Other)" },
        { status: 400 }
      );
    }

    await markParticipantOut({
      profileId,
      reason,
      customReason,
      markedBy: admin.name || admin.email,
    });

    return NextResponse.json({ success: true, message: "Marked OUT successfully" });
  } catch (error) {
    return NextResponse.json(
      { message: (error as Error).message || "Failed to mark OUT" },
      { status: 400 }
    );
  }
}

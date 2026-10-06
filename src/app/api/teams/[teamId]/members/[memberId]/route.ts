import { NextRequest, NextResponse } from "next/server";
import { updateTeamMember, deleteTeamMember } from "@/server/services/teamService";
import { authenticateRequest } from "@/server/auth";

export async function PUT(
  req: NextRequest,
  { params }: { params: { teamId: string; memberId: string } }
) {
  try {
    const admin = await authenticateRequest(req);
    if (!admin) {
      return NextResponse.json({ message: "Unauthorized. Admin access only." }, { status: 401 });
    }

    const body = await req.json();
    const updated = await updateTeamMember(params.memberId, body);
    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { message: (error as Error).message || "Failed to update member." },
      { status: 400 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { teamId: string; memberId: string } }
) {
  try {
    const admin = await authenticateRequest(req);
    if (!admin) {
      return NextResponse.json({ message: "Unauthorized. Admin access only." }, { status: 401 });
    }

    await deleteTeamMember(params.memberId);
    return NextResponse.json({ message: "Member deleted successfully." }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { message: (error as Error).message || "Failed to delete member." },
      { status: 400 }
    );
  }
}

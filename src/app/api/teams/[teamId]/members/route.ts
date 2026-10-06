import { NextRequest, NextResponse } from "next/server";
import { addMemberToTeam } from "@/server/services/teamService";
import { authenticateRequest } from "@/server/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: { teamId: string } }
) {
  try {
    const admin = await authenticateRequest(req);
    if (!admin) {
      return NextResponse.json({ message: "Unauthorized. Admin access only." }, { status: 401 });
    }

    const body = await req.json();
    const member = await addMemberToTeam(params.teamId, body);
    return NextResponse.json(member, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { message: (error as Error).message || "Failed to add team member." },
      { status: 400 }
    );
  }
}

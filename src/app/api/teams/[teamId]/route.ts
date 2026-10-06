import { NextRequest, NextResponse } from "next/server";
import { getTeamByIdOrCode, updateTeam, deleteTeam } from "@/server/services/teamService";
import { authenticateRequest } from "@/server/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: { teamId: string } }
) {
  try {
    const admin = await authenticateRequest(req);
    if (!admin) {
      return NextResponse.json({ message: "Unauthorized. Admin access only." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date") || undefined;
    const team = await getTeamByIdOrCode(params.teamId, date);

    if (!team) {
      return NextResponse.json({ message: "Team not found." }, { status: 404 });
    }

    return NextResponse.json(team, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { message: (error as Error).message || "Failed to fetch team details." },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { teamId: string } }
) {
  try {
    const admin = await authenticateRequest(req);
    if (!admin) {
      return NextResponse.json({ message: "Unauthorized. Admin access only." }, { status: 401 });
    }

    const body = await req.json();
    const updated = await updateTeam(params.teamId, body);
    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { message: (error as Error).message || "Failed to update team." },
      { status: 400 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { teamId: string } }
) {
  try {
    const admin = await authenticateRequest(req);
    if (!admin) {
      return NextResponse.json({ message: "Unauthorized. Admin access only." }, { status: 401 });
    }

    await deleteTeam(params.teamId);
    return NextResponse.json({ message: "Team deleted successfully." }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { message: (error as Error).message || "Failed to delete team." },
      { status: 400 }
    );
  }
}

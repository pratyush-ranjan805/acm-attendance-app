import { NextRequest, NextResponse } from "next/server";
import { getAllTeams, createTeam } from "@/server/services/teamService";
import { authenticateRequest } from "@/server/auth";

export async function GET(req: NextRequest) {
  try {
    const admin = await authenticateRequest(req);
    if (!admin) {
      return NextResponse.json({ message: "Unauthorized. Admin access only." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || undefined;
    const date = searchParams.get("date") || undefined;

    const teams = await getAllTeams(search, date);
    return NextResponse.json(teams, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { message: (error as Error).message || "Failed to fetch teams." },
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
    const team = await createTeam(body);
    return NextResponse.json(team, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { message: (error as Error).message || "Failed to create team." },
      { status: 400 }
    );
  }
}

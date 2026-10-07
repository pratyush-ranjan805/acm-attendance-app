import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/auth";
import { getMovementHistory } from "@/server/services/movementService";

export async function GET(req: NextRequest) {
  const admin = await authenticateRequest(req);
  if (!admin) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "100", 10);
    const history = await getMovementHistory(limit);
    return NextResponse.json(history);
  } catch (error) {
    return NextResponse.json(
      { message: (error as Error).message || "Failed to load movement history" },
      { status: 500 }
    );
  }
}

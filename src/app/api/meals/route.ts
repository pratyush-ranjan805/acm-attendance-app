import { NextRequest, NextResponse } from "next/server";
import {
  getMealsData,
  updateParticipantMeal,
  batchUpdateParticipantMeals,
} from "@/server/services/mealService";
import { authenticateRequest } from "@/server/auth";

export async function GET(req: NextRequest) {
  try {
    const admin = await authenticateRequest(req);
    if (!admin) {
      return NextResponse.json({ message: "Unauthorized. Admin access only." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date") || new Date().toLocaleDateString("en-CA");

    const data = await getMealsData(date);
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { message: (error as Error).message || "Failed to fetch meals data." },
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

    if (body.updates && Array.isArray(body.updates)) {
      // Batch mode
      const result = await batchUpdateParticipantMeals(
        { date: body.date, updates: body.updates },
        admin.userId
      );
      return NextResponse.json(result, { status: 200 });
    }

    // Single toggle mode
    if (!body.profileId || !body.teamId || !body.mealKey) {
      return NextResponse.json(
        { message: "Missing required fields: profileId, teamId, mealKey." },
        { status: 400 }
      );
    }

    const result = await updateParticipantMeal(
      {
        date: body.date || new Date().toLocaleDateString("en-CA"),
        profileId: body.profileId,
        teamId: body.teamId,
        mealKey: body.mealKey,
        value: Boolean(body.value),
      },
      admin.userId
    );

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { message: (error as Error).message || "Failed to update meal." },
      { status: 400 }
    );
  }
}

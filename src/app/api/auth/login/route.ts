import { NextRequest, NextResponse } from "next/server";
import { loginAdmin } from "@/server/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body || {};

    if (!email) {
      return NextResponse.json(
        { message: "Email is required." },
        { status: 400 }
      );
    }

    // password is optional — is_admin profiles can log in without one
    const result = await loginAdmin(email, password ?? "");
    if (!result) {
      return NextResponse.json(
        { message: "Access denied. Email not found or not an admin account." },
        { status: 401 }
      );
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { message: (error as Error).message || "Internal server error." },
      { status: 500 }
    );
  }
}

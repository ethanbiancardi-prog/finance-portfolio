import { NextRequest, NextResponse } from "next/server";
import {
  CLIENT_WORK_COOKIE,
  generateSessionToken,
  verifyPasscode,
} from "@/lib/clientWorkAuth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { passcode } = body || {};

    if (!passcode || typeof passcode !== "string") {
      return NextResponse.json(
        { error: "Passcode is required" },
        { status: 400 }
      );
    }

    if (!verifyPasscode(passcode)) {
      return NextResponse.json(
        { error: "Incorrect passcode" },
        { status: 401 }
      );
    }

    const token = generateSessionToken(passcode.trim());
    const response = NextResponse.json({ success: true });

    // Set HTTP-only session cookie for 30 days
    response.cookies.set({
      name: CLIENT_WORK_COOKIE,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return response;
  } catch {
    return NextResponse.json(
      { error: "Failed to authenticate" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true, locked: true });
  response.cookies.set({
    name: CLIENT_WORK_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}

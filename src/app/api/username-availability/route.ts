import { NextRequest, NextResponse } from "next/server";
import { checkUsernameAvailability } from "@/lib/username-availability";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const username = searchParams.get("username")?.trim() ?? "";
  const businessSlug = searchParams.get("businessSlug")?.trim() || undefined;
  const firstName = searchParams.get("firstName")?.trim() || undefined;
  const lastName = searchParams.get("lastName")?.trim() || undefined;

  if (!username) {
    return NextResponse.json({ error: "username is required." }, { status: 400 });
  }

  const result = await checkUsernameAvailability(username, { businessSlug, firstName, lastName });
  return NextResponse.json(result);
}

import { cache } from "react";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySession, type SessionPayload } from "@/lib/auth";

// Memoized per request so the JWT is verified once per render; each caller
// still gets its own copy of the payload.
const readSession = cache(async (): Promise<SessionPayload | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  return token ? verifySession(token) : null;
});

export async function getSession(): Promise<SessionPayload | null> {
  const session = await readSession();
  return session ? { ...session } : null;
}

export function getSessionFromRequest(request: NextRequest): SessionPayload | null {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  return token ? verifySession(token) : null;
}

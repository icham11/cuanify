import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getBaseUrl(request: NextRequest) {
  return process.env.NEXTAUTH_URL || request.nextUrl.origin;
}

function getGoogleOAuthRedirectUri(request: NextRequest) {
  const explicit = process.env.GOOGLE_CALENDAR_OAUTH_REDIRECT_URI?.trim();
  if (explicit) return explicit;
  const baseUrl = getBaseUrl(request).replace(/\/$/, "");
  return `${baseUrl}/api/bookings/google-calendar/callback`;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    const clientId = process.env.GOOGLE_CLIENT_ID || "";
    if (!clientId) {
      return NextResponse.json(
        { error: "GOOGLE_CLIENT_ID is not configured." },
        { status: 500 },
      );
    }

    const redirectUri = getGoogleOAuthRedirectUri(request);
    const statePayload = `${auth.businessId}:${randomUUID()}`;

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      scope: [
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/userinfo.email",
      ].join(" "),
      state: statePayload,
    });

    const redirectTo = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    const response = NextResponse.redirect(redirectTo);
    response.cookies.set("gcal_oauth_state", statePayload, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 10,
    });

    return response;
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Failed to start Google OAuth." },
      { status: 500 },
    );
  }
}

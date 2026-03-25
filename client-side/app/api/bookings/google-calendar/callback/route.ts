import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/session";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

function parseEmailFromIdToken(idToken?: string): string | null {
  if (!idToken) return null;
  const parts = idToken.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    ) as { email?: string };
    return payload.email || null;
  } catch {
    return null;
  }
}

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
    const { searchParams } = request.nextUrl;
    const code = searchParams.get("code") || "";
    const state = searchParams.get("state") || "";
    const error = searchParams.get("error");

    const expectedState = request.cookies.get("gcal_oauth_state")?.value || "";

    if (error) {
      return NextResponse.redirect(
        `${getBaseUrl(request)}/bakery/calendar?gcal=error&reason=${encodeURIComponent(error)}`,
      );
    }

    if (!code || !state || !expectedState || state !== expectedState) {
      return NextResponse.redirect(
        `${getBaseUrl(request)}/bakery/calendar?gcal=error&reason=invalid_state`,
      );
    }

    const [stateBusinessIdRaw] = state.split(":");
    const stateBusinessId = Number(stateBusinessIdRaw);
    if (
      !Number.isFinite(stateBusinessId) ||
      stateBusinessId !== auth.businessId
    ) {
      return NextResponse.redirect(
        `${getBaseUrl(request)}/bakery/calendar?gcal=error&reason=business_mismatch`,
      );
    }

    const clientId = process.env.GOOGLE_CLIENT_ID || "";
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
    if (!clientId || !clientSecret) {
      return NextResponse.redirect(
        `${getBaseUrl(request)}/bakery/calendar?gcal=error&reason=oauth_env_missing`,
      );
    }

    const redirectUri = getGoogleOAuthRedirectUri(request);
    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    const tokenData = (await tokenResponse
      .json()
      .catch(() => ({}))) as TokenResponse;
    if (!tokenResponse.ok) {
      const reason =
        tokenData.error_description ||
        tokenData.error ||
        "token_exchange_failed";
      return NextResponse.redirect(
        `${getBaseUrl(request)}/bakery/calendar?gcal=error&reason=${encodeURIComponent(reason)}`,
      );
    }

    const existing = await prisma.businessDocument.findFirst({
      where: {
        businessId: auth.businessId,
        sourceType: "google_calendar_oauth",
      },
      orderBy: {
        updatedAt: "desc",
      },
      select: {
        id: true,
        metadata: true,
      },
    });

    const existingRefreshToken =
      existing?.metadata && typeof existing.metadata === "object"
        ? (existing.metadata as { refreshToken?: string }).refreshToken
        : undefined;

    const refreshToken = tokenData.refresh_token || existingRefreshToken;
    if (!refreshToken) {
      return NextResponse.redirect(
        `${getBaseUrl(request)}/bakery/calendar?gcal=error&reason=refresh_token_missing`,
      );
    }

    const metadata = {
      provider: "google_oauth",
      refreshToken,
      scope: tokenData.scope || "https://www.googleapis.com/auth/calendar",
      tokenType: tokenData.token_type || "Bearer",
      connectedEmail: parseEmailFromIdToken(tokenData.id_token),
      calendarId: "primary",
      connectedAt: new Date().toISOString(),
    };

    const content = "google calendar oauth connection";
    const contentHash = createHash("sha256")
      .update(JSON.stringify(metadata))
      .digest("hex");

    if (existing?.id) {
      await prisma.businessDocument.update({
        where: { id: existing.id },
        data: {
          content,
          contentHash,
          metadata,
        },
      });
    } else {
      await prisma.businessDocument.create({
        data: {
          businessId: auth.businessId,
          content,
          contentHash,
          sourceType: "google_calendar_oauth",
          metadata,
          chunkIndex: 0,
        },
      });
    }

    const response = NextResponse.redirect(
      `${getBaseUrl(request)}/bakery/calendar?gcal=connected`,
    );
    response.cookies.set("gcal_oauth_state", "", {
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.redirect(
      `${getBaseUrl(request)}/bakery/calendar?gcal=error&reason=callback_failed`,
    );
  }
}

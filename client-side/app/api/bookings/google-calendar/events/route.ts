import { createSign } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/session";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

type OAuthMetadata = {
  refreshToken?: string;
  calendarId?: string;
};

function base64UrlEncode(value: Buffer | string): string {
  const base64 = (
    typeof value === "string" ? Buffer.from(value) : value
  ).toString("base64");
  return base64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function getOAuthCalendarConfig(
  businessId: number,
): Promise<OAuthMetadata | null> {
  const doc = await prisma.businessDocument.findFirst({
    where: {
      businessId,
      sourceType: "google_calendar_oauth",
    },
    orderBy: {
      updatedAt: "desc",
    },
    select: {
      metadata: true,
    },
  });

  if (!doc?.metadata || typeof doc.metadata !== "object") return null;
  return doc.metadata as OAuthMetadata;
}

async function getServiceAccountAccessToken(scopes: string[]): Promise<string> {
  const serviceEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "";
  const privateKeyRaw = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "";
  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");

  if (!serviceEmail || !privateKey) {
    throw new Error("Missing Google service account env configuration.");
  }

  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: serviceEmail,
    scope: scopes.join(" "),
    aud: GOOGLE_TOKEN_URL,
    exp,
    iat,
  };

  const unsignedJwt = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;

  const signer = createSign("RSA-SHA256");
  signer.update(unsignedJwt);
  signer.end();
  const signature = signer.sign(privateKey);
  const assertion = `${unsignedJwt}.${base64UrlEncode(signature)}`;

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });

  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const tokenData = (await tokenResponse.json().catch(() => ({}))) as {
    access_token?: string;
    error_description?: string;
    error?: string;
  };

  if (!tokenResponse.ok || !tokenData.access_token) {
    throw new Error(
      tokenData.error_description ||
        tokenData.error ||
        "Failed to get Google access token.",
    );
  }

  return tokenData.access_token;
}

async function getOAuthAccessToken(
  refreshToken: string,
): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
  if (!clientId || !clientSecret) return null;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: GOOGLE_CALENDAR_SCOPE,
  });

  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const tokenData = (await tokenResponse.json().catch(() => ({}))) as {
    access_token?: string;
  };

  if (!tokenResponse.ok || !tokenData.access_token) return null;
  return tokenData.access_token;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    const searchParams = request.nextUrl.searchParams;
    const timeMin = searchParams.get("timeMin") || new Date().toISOString();
    const timeMax =
      searchParams.get("timeMax") ||
      new Date(Date.now() + 1000 * 60 * 60 * 24 * 60).toISOString();
    const maxResults = Math.min(
      Number(searchParams.get("maxResults") || 250),
      2500,
    );

    const oauthConfig = await getOAuthCalendarConfig(auth.businessId);
    const calendarId =
      oauthConfig?.calendarId || process.env.GOOGLE_CALENDAR_ID || "primary";

    let accessToken: string;
    if (oauthConfig?.refreshToken) {
      const oauthToken = await getOAuthAccessToken(oauthConfig.refreshToken);
      accessToken =
        oauthToken ||
        (await getServiceAccountAccessToken([GOOGLE_CALENDAR_SCOPE]));
    } else {
      accessToken = await getServiceAccountAccessToken([GOOGLE_CALENDAR_SCOPE]);
    }

    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: String(maxResults),
    });

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    const payload = (await response.json().catch(() => ({}))) as {
      items?: Array<{
        id?: string;
        summary?: string;
        description?: string;
        htmlLink?: string;
        status?: string;
        start?: { dateTime?: string; date?: string };
        end?: { dateTime?: string; date?: string };
        extendedProperties?: {
          private?: {
            bookingId?: string;
            bookingCode?: string;
          };
        };
      }>;
      error?: { message?: string };
    };

    if (!response.ok) {
      return NextResponse.json(
        {
          error:
            payload.error?.message ||
            `Google Calendar API error ${response.status}`,
        },
        { status: response.status },
      );
    }

    return NextResponse.json({
      success: true,
      calendarId,
      events: payload.items || [],
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load events.",
      },
      { status: 500 },
    );
  }
}

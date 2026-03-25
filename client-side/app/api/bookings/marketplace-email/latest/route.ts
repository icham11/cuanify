import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/session";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

type OAuthMetadata = {
  refreshToken?: string;
};

type GmailHeader = {
  name?: string;
  value?: string;
};

type GmailPayload = {
  mimeType?: string;
  body?: { data?: string };
  headers?: GmailHeader[];
  parts?: GmailPayload[];
};

type GmailMessage = {
  id?: string;
  threadId?: string;
  snippet?: string;
  internalDate?: string;
  payload?: GmailPayload;
};

const MARKETPLACE_HINTS = ["tokopedia", "shopee"];
const BLOCKED_HINTS = [
  "kredivo",
  "tagihan",
  "jatuh tempo",
  "pinjaman",
  "top up",
  "topup",
  "promo",
  "voucher",
  "cashback",
];

function decodeBase64Url(value?: string): string {
  if (!value) return "";
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    return Buffer.from(padded, "base64").toString("utf8");
  } catch {
    return "";
  }
}

function extractHeader(payload: GmailPayload | undefined, key: string): string {
  const headers = payload?.headers ?? [];
  const found = headers.find(
    (entry) => entry.name?.toLowerCase() === key.toLowerCase(),
  );
  return found?.value?.trim() || "";
}

function extractTextFromPayload(payload?: GmailPayload): string {
  if (!payload) return "";

  const mime = (payload.mimeType || "").toLowerCase();
  const bodyText = decodeBase64Url(payload.body?.data).trim();

  if (mime.includes("text/plain") && bodyText) {
    return bodyText;
  }

  if (payload.parts?.length) {
    for (const part of payload.parts) {
      const text = extractTextFromPayload(part);
      if (text) return text;
    }
  }

  return bodyText;
}

function cleanupText(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function containsKeyword(source: string, keywords: string[]): boolean {
  const lowered = source.toLowerCase();
  return keywords.some((keyword) => lowered.includes(keyword));
}

function buildReadableGmailError(detail: string): string {
  const normalized = detail.toLowerCase();
  const activationUrlMatch = detail.match(
    /(https:\/\/console\.developers\.google\.com\/[^\s]+)/i,
  );
  const activationUrl = activationUrlMatch?.[1] || "";

  if (
    normalized.includes("gmail api has not been used") ||
    normalized.includes("is disabled")
  ) {
    return [
      "Gmail API belum aktif di Google Cloud project untuk OAuth ini.",
      activationUrl
        ? `Buka dan Enable dulu: ${activationUrl}`
        : "Enable Gmail API di Google Cloud Console untuk project OAuth yang sama.",
      "Setelah enable, tunggu 5-10 menit lalu reconnect Google OAuth.",
    ].join(" ");
  }

  if (normalized.includes("insufficient") || normalized.includes("scope")) {
    return "Akses Gmail belum diizinkan. Silakan reconnect Google OAuth agar scope gmail.readonly ter-grant.";
  }

  return detail;
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

export async function GET() {
  try {
    const auth = await requireAuth();
    const oauthConfig = await getOAuthCalendarConfig(auth.businessId);

    if (!oauthConfig?.refreshToken) {
      return NextResponse.json(
        {
          error:
            "Google OAuth belum terhubung. Klik Connect Google OAuth lalu reconnect agar akses Gmail aktif.",
        },
        { status: 400 },
      );
    }

    const accessToken = await getOAuthAccessToken(oauthConfig.refreshToken);
    if (!accessToken) {
      return NextResponse.json(
        {
          error: "Gagal membuat akses Gmail. Silakan reconnect Google OAuth.",
        },
        { status: 401 },
      );
    }

    const listParams = new URLSearchParams({
      q: "newer_than:180d (from:tokopedia OR from:shopee OR subject:tokopedia OR subject:shopee) -from:kredivo -subject:tagihan -subject:jatuh -subject:pinjaman -subject:promo",
      maxResults: "20",
      includeSpamTrash: "false",
    });

    const listResponse = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?${listParams.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    const listPayload = (await listResponse.json().catch(() => ({}))) as {
      messages?: Array<{ id?: string }>;
      error?: { message?: string; status?: string };
    };

    if (!listResponse.ok) {
      const detail = listPayload.error?.message || "Gmail API request failed";
      const readable = buildReadableGmailError(detail);
      return NextResponse.json(
        {
          error: readable,
        },
        { status: listResponse.status },
      );
    }

    const messageIds = (listPayload.messages || [])
      .map((entry) => entry.id)
      .filter((value): value is string => Boolean(value));

    if (!messageIds.length) {
      return NextResponse.json({
        success: true,
        found: false,
        message: null,
      });
    }
    let latestPayload: GmailMessage | null = null;
    let latestTimestamp = 0;

    for (const messageId of messageIds) {
      const detailParams = new URLSearchParams({
        format: "full",
      });

      const detailResponse = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?${detailParams.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      const detailPayload = (await detailResponse
        .json()
        .catch(() => ({}))) as GmailMessage & {
        error?: { message?: string };
      };

      if (!detailResponse.ok) {
        continue;
      }

      const subject = extractHeader(detailPayload.payload, "Subject") || "";
      const from = extractHeader(detailPayload.payload, "From") || "";
      const senderSubjectSource = `${subject}\n${from}`;
      if (!containsKeyword(senderSubjectSource, MARKETPLACE_HINTS)) {
        continue;
      }
      if (containsKeyword(senderSubjectSource, BLOCKED_HINTS)) {
        continue;
      }

      const timestamp = Number(detailPayload.internalDate || "0");
      const safeTimestamp = Number.isFinite(timestamp) ? timestamp : 0;
      if (safeTimestamp >= latestTimestamp) {
        latestTimestamp = safeTimestamp;
        latestPayload = detailPayload;
      }
    }

    if (!latestPayload) {
      return NextResponse.json(
        {
          success: true,
          found: false,
          message: null,
        },
        { status: 200 },
      );
    }

    const subject = extractHeader(latestPayload.payload, "Subject") || "";
    const from = extractHeader(latestPayload.payload, "From") || "";
    const date = extractHeader(latestPayload.payload, "Date") || "";
    const bodyText = cleanupText(extractTextFromPayload(latestPayload.payload));
    const snippet = (latestPayload.snippet || "").trim();

    const normalizedText = cleanupText(
      [
        subject ? `Subject: ${subject}` : "",
        from ? `From: ${from}` : "",
        date ? `Date: ${date}` : "",
        "",
        bodyText || snippet,
      ]
        .filter(Boolean)
        .join("\n"),
    );

    return NextResponse.json({
      success: true,
      found: true,
      message: {
        id: latestPayload.id || messageIds[0],
        subject,
        from,
        date,
        snippet,
        text: normalizedText,
      },
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch marketplace email.",
      },
      { status: 500 },
    );
  }
}

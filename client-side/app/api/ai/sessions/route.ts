import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { getChatSessions, createChatSession, deleteChatSession, updateSessionTitle } from "@/lib/ai/chat-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/ai/sessions — List chat sessions */
export async function GET() {
  try {
    const { businessId } = await requireAuth();
    const sessions = await getChatSessions(businessId);
    return NextResponse.json({ success: true, sessions });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to fetch sessions" }, { status: 500 });
  }
}

/** POST /api/ai/sessions — Create new chat session */
export async function POST(request: NextRequest) {
  try {
    const { businessId } = await requireAuth();
    const body = await request.json().catch(() => ({}));
    const session = await createChatSession(businessId, body.title);
    return NextResponse.json({ success: true, session });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
  }
}

/** DELETE /api/ai/sessions — Delete a chat session */
export async function DELETE(request: NextRequest) {
  try {
    const { businessId } = await requireAuth();
    const sessionId = request.nextUrl.searchParams.get("id");
    if (!sessionId) {
      return NextResponse.json({ error: "Session ID required" }, { status: 400 });
    }
    await deleteChatSession(parseInt(sessionId), businessId);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to delete session" }, { status: 500 });
  }
}

/** PATCH /api/ai/sessions — Update session title */
export async function PATCH(request: NextRequest) {
  try {
    const { businessId } = await requireAuth();
    const body = await request.json();
    const { id, title } = body;
    if (!id || !title) {
      return NextResponse.json({ error: "id and title required" }, { status: 400 });
    }
    const session = await updateSessionTitle(parseInt(id), businessId, title);
    return NextResponse.json({ success: true, session });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to update session" }, { status: 500 });
  }
}


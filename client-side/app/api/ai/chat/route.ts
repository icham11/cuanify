import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/session";
import {
  chatWithAssistant,
  streamChatWithAssistant,
  getChatHistory,
  type ChatMessage,
} from "@/lib/ai/chat-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ai/chat — Send a message to AI assistant
 * Body: { messages: ChatMessage[], sessionId?: number, stream?: boolean, contextType?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { businessId } = await requireAuth();
    const body = await request.json();
    const { messages, sessionId, stream = false, contextType } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "Messages array is required" }, { status: 400 });
    }

    // Validate message format
    for (const msg of messages) {
      if (!msg.role || !msg.content) {
        return NextResponse.json({ error: "Each message must have role and content" }, { status: 400 });
      }
    }

    const context = { businessId, sessionId, contextType };

    if (stream) {
      const readableStream = await streamChatWithAssistant(messages as ChatMessage[], context);
      return new Response(readableStream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    const response = await chatWithAssistant(messages as ChatMessage[], context);
    return NextResponse.json({
      success: true,
      message: {
        role: "assistant",
        content: response,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("AI Chat error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    const lowered = msg.toLowerCase();
    const status =
      lowered.includes("connection error") ||
      lowered.includes("fetch failed") ||
      lowered.includes("network")
        ? 503
        : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

/**
 * GET /api/ai/chat — Get chat history
 * Query: ?sessionId=123&limit=50
 */
export async function GET(request: NextRequest) {
  try {
    const { businessId } = await requireAuth();
    const sessionId = request.nextUrl.searchParams.get("sessionId");
    const limit = parseInt(request.nextUrl.searchParams.get("limit") || "50");

    const history = await getChatHistory(
      businessId,
      sessionId ? parseInt(sessionId) : undefined,
      limit
    );

    return NextResponse.json({ success: true, messages: history });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("Chat history error:", error);
    return NextResponse.json({ error: "Failed to fetch chat history" }, { status: 500 });
  }
}

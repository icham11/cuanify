import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { searchDocuments } from "@/lib/ai/rag-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { businessId } = await requireAuth();
    const { query, topK, sourceTypes, minSimilarity } = await request.json();

    if (!query) {
      return NextResponse.json({ error: "query is required" }, { status: 400 });
    }

    const results = await searchDocuments(businessId, query, {
      topK: topK || 8,
      sourceTypes,
      minSimilarity: minSimilarity || 0.25,
    });

    return NextResponse.json({ success: true, count: results.length, results });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("[RAG Search] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Search failed" },
      { status: 500 }
    );
  }
}

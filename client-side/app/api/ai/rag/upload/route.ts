/**
 * POST /api/ai/rag/upload — Upload a PDF document for RAG indexing
 *
 * Flow:
 * 1. Receive PDF file via multipart form data
 * 2. Extract text with pdf-parse
 * 3. Split into semantic chunks
 * 4. Generate embeddings via Gemini
 * 5. Store in BusinessDocument table (pgvector)
 *
 * Limits:
 * - Max 10MB per file
 * - Max 10 documents per business
 * - Only PDF files
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { processPDF } from "@/lib/ai/pdf-processor";
import { generateEmbeddingsBatch } from "@/lib/ai/embedding";
import prisma from "@/lib/prisma";
import { createHash } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_DOCUMENTS_PER_BUSINESS = 10;

export async function POST(request: NextRequest) {
  try {
    const { businessId } = await requireAuth();

    // 1. Parse multipart form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "File PDF diperlukan" },
        { status: 400 }
      );
    }

    // 2. Validate file
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json(
        { error: "Hanya file PDF yang didukung" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `Ukuran file maksimal ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    // 3. Check document limit
    const existingDocs = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(DISTINCT metadata->>'filename') as count
       FROM "BusinessDocument"
       WHERE "businessId" = $1 AND "sourceType" = 'pdf_document'`,
      businessId
    );
    const docCount = Number(existingDocs[0]?.count || 0);

    if (docCount >= MAX_DOCUMENTS_PER_BUSINESS) {
      return NextResponse.json(
        {
          error: `Maksimal ${MAX_DOCUMENTS_PER_BUSINESS} dokumen per bisnis. Hapus dokumen lama untuk mengunggah yang baru.`,
        },
        { status: 400 }
      );
    }

    // 4. Check for duplicate filename
    const duplicate = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*) as count
       FROM "BusinessDocument"
       WHERE "businessId" = $1 AND "sourceType" = 'pdf_document' AND metadata->>'filename' = $2`,
      businessId,
      file.name
    );
    if (Number(duplicate[0]?.count || 0) > 0) {
      return NextResponse.json(
        {
          error: `Dokumen "${file.name}" sudah pernah diunggah. Hapus dulu jika ingin mengunggah ulang.`,
        },
        { status: 409 }
      );
    }

    // 5. Read file buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 6. Extract text and chunk
    console.log(`[PDF Upload] Processing "${file.name}" (${(file.size / 1024).toFixed(1)}KB)...`);
    const result = await processPDF(buffer, file.name);
    console.log(
      `[PDF Upload] Extracted ${result.totalPages} pages, ${result.chunks.length} chunks`
    );

    // 7. Generate embeddings
    console.log(`[PDF Upload] Generating ${result.chunks.length} embeddings...`);
    const texts = result.chunks.map((c) => c.content);
    const embeddings = await generateEmbeddingsBatch(texts);

    // 8. Store in vector DB
    const fileHash = createHash("sha256").update(buffer).digest("hex");

    for (let i = 0; i < result.chunks.length; i++) {
      const chunk = result.chunks[i];
      const vecStr = `[${embeddings[i].join(",")}]`;
      const contentHash = createHash("sha256")
        .update(chunk.content)
        .digest("hex");

      await prisma.$executeRawUnsafe(
        `INSERT INTO "BusinessDocument"
           ("businessId", "content", "contentHash", "embedding", "sourceType", "sourceId", "metadata", "chunkIndex", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4::vector, 'pdf_document', NULL, $5::jsonb, $6, NOW(), NOW())`,
        businessId,
        chunk.content,
        contentHash,
        vecStr,
        JSON.stringify({
          ...chunk.metadata,
          fileHash,
          fileSize: file.size,
          uploadedAt: new Date().toISOString(),
        }),
        chunk.chunkIndex
      );
    }

    console.log(
      `[PDF Upload] ✅ Stored ${result.chunks.length} chunks for "${file.name}"`
    );

    return NextResponse.json({
      success: true,
      document: {
        filename: file.name,
        pages: result.totalPages,
        chunks: result.chunks.length,
        textLength: result.text.length,
      },
      message: `Dokumen "${file.name}" berhasil diunggah. ${result.totalPages} halaman → ${result.chunks.length} bagian diindeks.`,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("[PDF Upload] Error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Gagal memproses dokumen",
      },
      { status: 500 }
    );
  }
}


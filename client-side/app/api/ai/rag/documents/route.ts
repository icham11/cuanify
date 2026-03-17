/**
 * GET  /api/ai/rag/documents — List uploaded PDF documents
 * DELETE /api/ai/rag/documents — Delete an uploaded PDF document by filename
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/session";
import prisma from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DocumentRow {
  filename: string;
  chunk_count: bigint;
  total_pages: number;
  uploaded_at: string;
  file_size: number;
}

/** GET — List all uploaded PDF documents for the business */
export async function GET() {
  try {
    const { businessId } = await requireAuth();

    const rows = await prisma.$queryRawUnsafe<DocumentRow[]>(
      `SELECT
         metadata->>'filename' as filename,
         COUNT(*) as chunk_count,
         MAX((metadata->>'totalPages')::int) as total_pages,
         MAX(metadata->>'uploadedAt') as uploaded_at,
         MAX((metadata->>'fileSize')::int) as file_size
       FROM "BusinessDocument"
       WHERE "businessId" = $1 AND "sourceType" = 'pdf_document'
       GROUP BY metadata->>'filename'
       ORDER BY MAX("createdAt") DESC`,
      businessId
    );

    const documents = rows.map((r) => ({
      filename: r.filename,
      chunks: Number(r.chunk_count),
      pages: r.total_pages || 0,
      uploadedAt: r.uploaded_at || null,
      fileSize: r.file_size || 0,
    }));

    return NextResponse.json({ success: true, documents });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Gagal mengambil daftar dokumen" },
      { status: 500 }
    );
  }
}

/** DELETE — Delete all chunks of a specific uploaded document */
export async function DELETE(request: NextRequest) {
  try {
    const { businessId } = await requireAuth();
    const filename = request.nextUrl.searchParams.get("filename");

    if (!filename) {
      return NextResponse.json(
        { error: "Parameter 'filename' diperlukan" },
        { status: 400 }
      );
    }

    const deleted = await prisma.$executeRawUnsafe(
      `DELETE FROM "BusinessDocument"
       WHERE "businessId" = $1 AND "sourceType" = 'pdf_document' AND metadata->>'filename' = $2`,
      businessId,
      filename
    );

    console.log(`[PDF Delete] Deleted ${deleted} chunks for "${filename}"`);

    return NextResponse.json({
      success: true,
      message: `Dokumen "${filename}" berhasil dihapus (${deleted} bagian).`,
      deletedChunks: Number(deleted),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Gagal menghapus dokumen" },
      { status: 500 }
    );
  }
}


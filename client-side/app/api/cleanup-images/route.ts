import { NextRequest, NextResponse } from "next/server";
import { imagekit } from "@/lib/imagekit";

interface ImageKitFile {
  fileId: string;
  name: string;
  tags?: string[] | null;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cleanup-images
 *
 * Cleanup expired temporary images from ImageKit.
 * Auth: Authorization header with Bearer <CRON_SECRET>
 *
 * Success (200):
 *   {
 *     "success": true, "message": "Cleanup completed",
 *     "deleted": 5, "errors": 0,
 *     "deletedFiles": ["fileId1", "fileId2"],
 *     "errorDetails": []
 *   }
 *
 * Errors:
 *   401 — { "error": "Unauthorized" }
 *   500 — { "error": "Failed to cleanup images", "details": "..." }
 */
export async function POST(request: NextRequest) {
  try {
    // Verify cron secret for security
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET || "development-secret";

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = Date.now();
    const deletedFiles: string[] = [];
    const errors: string[] = [];

    // List files with 'temp' tag — limit to 50 per cycle to avoid timeout
    let files;
    try {
      files = await Promise.race([
        imagekit.listFiles({ tags: "temp", limit: 50 }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("ImageKit listFiles timeout")), 10_000)
        ),
      ]);
    } catch (err) {
      console.warn("ImageKit listFiles failed:", err instanceof Error ? err.message : err);
      return NextResponse.json({
        success: true,
        message: "Cleanup skipped — ImageKit unavailable",
        deleted: 0,
        errors: 0,
        deletedFiles: [],
        errorDetails: [],
      });
    }

    console.log(`Found ${files.length} temporary files to check`);

    // Check each file for expiry
    for (const item of files) {
      try {
        // Skip folders, only process files
        if (!("fileId" in item)) continue;

        const file = item as ImageKitFile;

        // Check if file has expiry tag
        const expiryTag = file.tags?.find((tag: string) => tag.startsWith("expire:"));

        if (expiryTag) {
          const expiryTime = parseInt(expiryTag.split(":")[1]);

          // If expired, delete it
          if (now > expiryTime) {
            await Promise.race([
              imagekit.deleteFile(file.fileId),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error("deleteFile timeout")), 8_000)
              ),
            ]);
            deletedFiles.push(file.fileId);
            console.log(`Auto-deleted file: ${file.fileId}`);
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const fileId = "fileId" in item ? (item as ImageKitFile).fileId : "unknown";
        errors.push(`Failed to process ${fileId}: ${errorMessage}`);
        console.error(`Error processing file ${fileId}:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Cleanup completed",
      deleted: deletedFiles.length,
      errors: errors.length,
      deletedFiles,
      errorDetails: errors,
    });
  } catch (error) {
    console.error("Cleanup error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        error: "Failed to cleanup images",
        details: errorMessage,
      },
      { status: 500 },
    );
  }
}

/**
 * GET /api/cleanup-images
 * Manual trigger (calls POST internally). Same auth required.
 *
 * Errors:
 *   401 — { "error": "Unauthorized - Use POST with Bearer token" }
 */
// GET endpoint for manual trigger (development only)
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET || "development-secret";

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized - Use POST with Bearer token" }, { status: 401 });
  }

  // Call POST internally
  return POST(request);
}

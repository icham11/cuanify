import { NextRequest, NextResponse } from "next/server";
import { imagekit } from "@/lib/imagekit";
import cloudinary from "@/lib/cloudinary";

interface ImageKitFile {
  fileId: string;
  name: string;
  tags?: string[] | null;
}

interface CloudinaryResource {
  public_id: string;
  tags?: string[];
  created_at?: string;
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
    const deletedCloudinaryFiles: string[] = [];

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

    const canCleanupCloudinary =
      Boolean(process.env.CLOUDINARY_CLOUD_NAME) &&
      Boolean(process.env.CLOUDINARY_API_KEY) &&
      Boolean(process.env.CLOUDINARY_API_SECRET);

    if (canCleanupCloudinary) {
      try {
        const resourcesResponse = (await Promise.race([
          cloudinary.api.resources({
            type: "upload",
            prefix: "orders/outbound-temp",
            max_results: 100,
            tags: true,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error("Cloudinary resources timeout")),
              10_000,
            ),
          ),
        ])) as { resources?: CloudinaryResource[] };

        const resources = Array.isArray(resourcesResponse.resources)
          ? resourcesResponse.resources
          : [];

        const expiredPublicIds = resources
          .filter((resource) => {
            const expireTag = resource.tags?.find((tag) =>
              tag.startsWith("expire:"),
            );
            if (expireTag) {
              const expiresAt = Number(expireTag.split(":")[1]);
              return Number.isFinite(expiresAt) && now > expiresAt;
            }

            const createdAt = Date.parse(resource.created_at || "");
            if (!Number.isFinite(createdAt)) return false;
            return now - createdAt > 24 * 60 * 60 * 1000;
          })
          .map((resource) => resource.public_id)
          .filter(Boolean);

        if (expiredPublicIds.length > 0) {
          await Promise.race([
            cloudinary.api.delete_resources(expiredPublicIds, {
              resource_type: "image",
              type: "upload",
              invalidate: true,
            }),
            new Promise<never>((_, reject) =>
              setTimeout(
                () => reject(new Error("Cloudinary delete_resources timeout")),
                10_000,
              ),
            ),
          ]);

          deletedCloudinaryFiles.push(...expiredPublicIds);
        }
      } catch (error) {
        errors.push(
          `Cloudinary cleanup failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        console.error("Cloudinary cleanup failed:", error);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Cleanup completed",
      deleted: deletedFiles.length + deletedCloudinaryFiles.length,
      errors: errors.length,
      deletedFiles: [...deletedFiles, ...deletedCloudinaryFiles],
      errorDetails: errors,
      deletedImageKitFiles: deletedFiles,
      deletedCloudinaryFiles,
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

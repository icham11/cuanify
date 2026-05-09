import cloudinary from "@/lib/cloudinary";

interface UploadToCloudinaryOptions {
  folder?: string;
  format?: string;
}

export async function uploadToCloudinary(
  buffer: Buffer,
  options: UploadToCloudinaryOptions = {},
): Promise<string> {
  if (
    !process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_API_KEY ||
    !process.env.CLOUDINARY_API_SECRET
  ) {
    throw new Error(
      "Cloudinary not configured. Missing CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET.",
    );
  }

  const attemptUpload = (): Promise<string> =>
    new Promise<string>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: options.folder || "orders/generated",
          format: options.format || "jpg",
        },
        (error, result) => {
          if (error) return reject(error);
          if (!result?.secure_url) {
            return reject(
              new Error(
                "Cloudinary upload succeeded but secure_url is missing.",
              ),
            );
          }
          console.info(
            "[uploadToCloudinary] Uploaded image URL:",
            result.secure_url,
          );
          resolve(result.secure_url);
        },
      );

      stream.end(buffer);
    });

  // Retry once on transient failure
  try {
    return await attemptUpload();
  } catch (firstError) {
    console.warn(
      "[uploadToCloudinary] first upload attempt failed, retrying...",
      firstError,
    );
    try {
      return await attemptUpload();
    } catch (secondError) {
      console.error(
        "[uploadToCloudinary] upload failed after retry:",
        secondError,
      );
      throw secondError;
    }
  }
}

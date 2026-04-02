import cloudinary from "@/lib/cloudinary";

interface UploadToCloudinaryOptions {
  folder?: string;
  format?: string;
}

export async function uploadToCloudinary(
  buffer: Buffer,
  options: UploadToCloudinaryOptions = {},
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: options.folder || "orders/generated",
        format: options.format || "jpg",
      },
      (error, result) => {
        if (error) return reject(error);
        if (!result?.secure_url) {
          return reject(new Error("Cloudinary upload succeeded but secure_url is missing."));
        }
        console.log("Uploaded image URL:", result.secure_url);
        resolve(result.secure_url);
      },
    );

    stream.end(buffer);
  });
}

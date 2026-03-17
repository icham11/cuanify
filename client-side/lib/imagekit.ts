import ImageKit from "imagekit";

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatImageKitError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "object" && error !== null) {
    const obj = error as Record<string, unknown>;
    const nestedError = obj.error as Record<string, unknown> | undefined;
    const response = obj.response as Record<string, unknown> | undefined;
    const responseData = response?.data as Record<string, unknown> | undefined;
    const apiResponse = obj.ApiResponse as { error_messages?: string[] } | undefined;

    const candidates: unknown[] = [
      obj.message,
      nestedError?.message,
      obj.reason,
      obj.help,
      responseData?.message,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim() !== "") {
        return candidate;
      }
    }

    if (Array.isArray(apiResponse?.error_messages) && apiResponse.error_messages.length > 0) {
      return apiResponse.error_messages.join(", ");
    }

    return safeJsonStringify(obj);
  }

  return String(error);
}

function getImageKitClient(): ImageKit {
  const publicKey = process.env.IMAGEKIT_PUBLIC_KEY;
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
  const urlEndpoint = process.env.IMAGEKIT_URL_ENDPOINT;

  if (!publicKey || !privateKey || !urlEndpoint) {
    throw new Error(
      "Missing ImageKit environment variables: IMAGEKIT_PUBLIC_KEY, IMAGEKIT_PRIVATE_KEY, IMAGEKIT_URL_ENDPOINT",
    );
  }

  return new ImageKit({
    publicKey,
    privateKey,
    urlEndpoint,
  });
}

type UploadParams = Parameters<ImageKit["upload"]>[0];
type ListFilesParams = Parameters<ImageKit["listFiles"]>[0];

export const imagekit = {
  upload: (params: UploadParams) => getImageKitClient().upload(params),
  deleteFile: (fileId: string) => getImageKitClient().deleteFile(fileId),
  listFiles: (params: ListFilesParams) => getImageKitClient().listFiles(params),
  getFileDetails: (fileId: string) => getImageKitClient().getFileDetails(fileId),
  url: (params: Parameters<ImageKit["url"]>[0]) => getImageKitClient().url(params),
};

export interface UploadImageResult {
  url: string;
  fileId: string;
  name: string;
  thumbnailUrl: string;
  filePath: string;
}

export interface ImageTransformation {
  width?: number;
  height?: number;
  quality?: number;
  format?: string;
  crop?: "maintain_ratio" | "force" | "at_least" | "at_max";
  cropMode?: "extract" | "pad_extract" | "pad_resize";
}

/**
 * Schedule file deletion after specified minutes
 * @param fileId - ID of the file to delete
 * @param minutes - Minutes to wait before deletion
 */
function scheduleFileDeletion(fileId: string, minutes: number): void {
  if (typeof window === "undefined") {
    // Server-side: use setTimeout
    setTimeout(
      async () => {
        try {
          await deleteImage(fileId);
          console.log(`Auto-deleted file: ${fileId}`);
        } catch (error) {
          console.error(`Failed to auto-delete file ${fileId}:`, error);
        }
      },
      minutes * 60 * 1000,
    );
  }
}

/**
 * Upload an image to ImageKit with auto-deletion after expiry
 * @param file - Buffer or base64 string of the image
 * @param fileName - Name of the file
 * @param folder - Folder path in ImageKit (default: 'umkm-helper')
 * @param expiryMinutes - Minutes until file should be deleted (default: 1)
 * @returns Upload result with URL and file information
 */
export async function uploadImage(
  file: Buffer | string,
  fileName: string,
  folder: string = "umkm-helper",
  expiryMinutes: number = 1,
): Promise<UploadImageResult> {
  try {
    const expiryTime = new Date(Date.now() + expiryMinutes * 60 * 1000);

    const result = await imagekit.upload({
      file,
      fileName,
      folder,
      useUniqueFileName: true,
      tags: ["umkm", "business", "temp", `expire:${expiryTime.getTime()}`],
    });

    // Schedule deletion after expiry time
    scheduleFileDeletion(result.fileId, expiryMinutes);

    return {
      url: result.url,
      fileId: result.fileId,
      name: result.name,
      thumbnailUrl: result.thumbnailUrl || result.url,
      filePath: result.filePath,
    };
  } catch (error: unknown) {
    console.error("ImageKit upload error:", error);
    const errorMessage = formatImageKitError(error);
    throw new Error(`Failed to upload image: ${errorMessage}`);
  }
}

/**
 * Upload multiple images to ImageKit
 * @param files - Array of {file: Buffer, fileName: string}
 * @param folder - Folder path in ImageKit
 * @returns Array of upload results
 */
export async function uploadMultipleImages(
  files: Array<{ file: Buffer | string; fileName: string }>,
  folder: string = "umkm-helper",
): Promise<UploadImageResult[]> {
  const uploadPromises = files.map((fileData) => uploadImage(fileData.file, fileData.fileName, folder));
  return Promise.all(uploadPromises);
}

/**
 * Upload product image with auto-expiry
 * @param file - Image file buffer
 * @param productName - Name of the product
 * @param expiryMinutes - Minutes until file should be deleted (default: 1)
 * @returns Upload result
 */
export async function uploadProductImage(
  file: Buffer | string,
  productName: string,
  expiryMinutes: number = 1,
): Promise<UploadImageResult> {
  const fileName = `product-${productName}-${Date.now()}.jpg`;
  return uploadImage(file, fileName, "umkm-helper/products", expiryMinutes);
}

/**
 * Upload ingredient image with auto-expiry
 * @param file - Image file buffer
 * @param ingredientName - Name of the ingredient
 * @param expiryMinutes - Minutes until file should be deleted (default: 1)
 * @returns Upload result
 */
export async function uploadIngredientImage(
  file: Buffer | string,
  ingredientName: string,
  expiryMinutes: number = 1,
): Promise<UploadImageResult> {
  const fileName = `ingredient-${ingredientName}-${Date.now()}.jpg`;
  return uploadImage(file, fileName, "umkm-helper/ingredients", expiryMinutes);
}

/**
 * Upload recipe image with auto-expiry
 * @param file - Image file buffer
 * @param recipeName - Name of the recipe
 * @param expiryMinutes - Minutes until file should be deleted (default: 1)
 * @returns Upload result
 */
export async function uploadRecipeImage(
  file: Buffer | string,
  recipeName: string,
  expiryMinutes: number = 1,
): Promise<UploadImageResult> {
  const fileName = `recipe-${recipeName}-${Date.now()}.jpg`;
  return uploadImage(file, fileName, "umkm-helper/recipes", expiryMinutes);
}

/**
 * Upload stock document image (for OCR/AI analysis) with auto-expiry
 * @param file - Image file buffer
 * @param documentType - Type of document (invoice, receipt, etc.)
 * @param expiryMinutes - Minutes until file should be deleted (default: 1)
 * @returns Upload result
 */
export async function uploadStockDocument(
  file: Buffer | string,
  documentType: string = "document",
  expiryMinutes: number = 1,
): Promise<UploadImageResult> {
  const fileName = `stock-${documentType}-${Date.now()}.jpg`;
  return uploadImage(file, fileName, "umkm-helper/stock-documents", expiryMinutes);
}

/**
 * Delete an image from ImageKit
 * @param fileId - ID of the file to delete
 */
export async function deleteImage(fileId: string): Promise<void> {
  try {
    await imagekit.deleteFile(fileId);
  } catch (error: unknown) {
    console.error("ImageKit delete error:", error);
    const errorMessage = formatImageKitError(error);
    throw new Error(`Failed to delete image: ${errorMessage}`);
  }
}

/**
 * Delete multiple images from ImageKit
 * @param fileIds - Array of file IDs to delete
 */
export async function deleteMultipleImages(fileIds: string[]): Promise<void> {
  const deletePromises = fileIds.map((fileId) => deleteImage(fileId));
  await Promise.all(deletePromises);
}

/**
 * Get a transformed image URL
 * @param path - Path of the image in ImageKit
 * @param transformations - Transformation options
 * @returns Transformed image URL
 */
export function getImageUrl(path: string, transformations?: ImageTransformation): string {
  const transformationArray: Array<Record<string, string>> = [];

  if (transformations) {
    if (transformations.width) {
      transformationArray.push({ width: transformations.width.toString() });
    }
    if (transformations.height) {
      transformationArray.push({ height: transformations.height.toString() });
    }
    if (transformations.quality) {
      transformationArray.push({ quality: transformations.quality.toString() });
    }
    if (transformations.format) {
      transformationArray.push({ format: transformations.format });
    }
  }

  return imagekit.url({
    path,
    transformation: transformationArray.length > 0 ? transformationArray : undefined,
  });
}

/**
 * Get thumbnail URL for an image
 * @param path - Path of the image in ImageKit
 * @param size - Size of thumbnail (default: 200)
 * @returns Thumbnail URL
 */
export function getThumbnailUrl(path: string, size: number = 200): string {
  return getImageUrl(path, {
    width: size,
    height: size,
    crop: "maintain_ratio",
    quality: 80,
  });
}

/**
 * List files in a folder
 * @param folder - Folder path
 * @returns List of files
 */
export async function listFiles(folder: string = "umkm-helper") {
  try {
    const result = await imagekit.listFiles({
      path: folder,
      searchQuery: 'tags IN ["umkm", "business"]',
    });
    return result;
  } catch (error: unknown) {
    console.error("ImageKit list files error:", error);
    const errorMessage = formatImageKitError(error);
    throw new Error(`Failed to list files: ${errorMessage}`);
  }
}

/**
 * Get file details
 * @param fileId - ID of the file
 * @returns File details
 */
export async function getFileDetails(fileId: string) {
  try {
    const result = await imagekit.getFileDetails(fileId);
    return result;
  } catch (error: unknown) {
    console.error("ImageKit get file details error:", error);
    const errorMessage = formatImageKitError(error);
    throw new Error(`Failed to get file details: ${errorMessage}`);
  }
}

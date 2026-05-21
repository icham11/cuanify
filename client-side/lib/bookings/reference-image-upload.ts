const MAX_REFERENCE_IMAGE_TOTAL_BYTES = 6 * 1024 * 1024;
const MAX_REFERENCE_IMAGE_FILE_BYTES = 900 * 1024;
const MAX_REFERENCE_IMAGE_DIMENSION = 1600;
const MIN_REFERENCE_IMAGE_SCALE = 0.45;
const OUTPUT_IMAGE_MIME_TYPE = "image/jpeg";
const IMAGE_QUALITY_STEPS = [0.86, 0.78, 0.7, 0.62, 0.54];
const IMAGE_SCALE_STEPS = [1, 0.9, 0.8, 0.7, 0.6];

type PreparedReferenceImagesResult = {
  files: File[];
  optimized: boolean;
  totalBytesBefore: number;
  totalBytesAfter: number;
};

function sumFileSizes(files: File[]): number {
  return files.reduce((total, file) => total + file.size, 0);
}

function isVectorImage(file: File): boolean {
  return file.type === "image/svg+xml";
}

function renameImageToJpeg(fileName: string): string {
  const normalizedBaseName = fileName.replace(/\.[^.]+$/, "").trim() || "reference-image";
  return `${normalizedBaseName}.jpg`;
}

function loadImageFromFile(file: File): Promise<{
  image: HTMLImageElement;
  objectUrl: string;
}> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => resolve({ image, objectUrl });
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`File "${file.name}" tidak bisa dibaca sebagai gambar.`));
    };
    image.src = objectUrl;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Browser gagal menyiapkan gambar upload."));
          return;
        }
        resolve(blob);
      },
      type,
      quality,
    );
  });
}

async function compressReferenceImageFile(
  file: File,
  targetBytes: number,
): Promise<File> {
  if (!file.type.startsWith("image/") || isVectorImage(file)) {
    return file;
  }

  const { image, objectUrl } = await loadImageFromFile(file);

  try {
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    const sourceLongestSide = Math.max(sourceWidth, sourceHeight, 1);
    const resizeRatio = Math.min(1, MAX_REFERENCE_IMAGE_DIMENSION / sourceLongestSide);
    const normalizedScaleSteps = Array.from(
      new Set(
        IMAGE_SCALE_STEPS.map((step) =>
          Math.max(MIN_REFERENCE_IMAGE_SCALE, Math.min(1, resizeRatio * step)),
        ),
      ),
    );

    if (file.size <= targetBytes && resizeRatio >= 1) {
      return file;
    }

    let bestBlob: Blob | null = null;

    for (const scale of normalizedScaleSteps) {
      const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
      const targetHeight = Math.max(1, Math.round(sourceHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Canvas browser tidak tersedia untuk kompresi gambar.");
      }

      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, targetWidth, targetHeight);
      context.drawImage(image, 0, 0, targetWidth, targetHeight);

      for (const quality of IMAGE_QUALITY_STEPS) {
        const blob = await canvasToBlob(canvas, OUTPUT_IMAGE_MIME_TYPE, quality);
        if (!bestBlob || blob.size < bestBlob.size) {
          bestBlob = blob;
        }
        if (blob.size <= targetBytes) {
          return new File([blob], renameImageToJpeg(file.name), {
            type: OUTPUT_IMAGE_MIME_TYPE,
            lastModified: file.lastModified,
          });
        }
      }
    }

    if (!bestBlob || bestBlob.size >= file.size) {
      return file;
    }

    return new File([bestBlob], renameImageToJpeg(file.name), {
      type: OUTPUT_IMAGE_MIME_TYPE,
      lastModified: file.lastModified,
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function prepareReferenceImagesForUpload(
  files: File[],
): Promise<PreparedReferenceImagesResult> {
  if (files.length === 0) {
    return {
      files: [],
      optimized: false,
      totalBytesBefore: 0,
      totalBytesAfter: 0,
    };
  }

  const totalBytesBefore = sumFileSizes(files);
  const needsOptimization =
    totalBytesBefore > MAX_REFERENCE_IMAGE_TOTAL_BYTES ||
    files.some((file) => file.size > MAX_REFERENCE_IMAGE_FILE_BYTES);

  if (!needsOptimization) {
    return {
      files,
      optimized: false,
      totalBytesBefore,
      totalBytesAfter: totalBytesBefore,
    };
  }

  const perFileTargetBytes = Math.max(
    180 * 1024,
    Math.min(
      MAX_REFERENCE_IMAGE_FILE_BYTES,
      Math.floor(MAX_REFERENCE_IMAGE_TOTAL_BYTES / Math.max(files.length, 1)),
    ),
  );

  const preparedFiles: File[] = [];
  for (const file of files) {
    preparedFiles.push(
      await compressReferenceImageFile(file, perFileTargetBytes),
    );
  }

  const totalBytesAfter = sumFileSizes(preparedFiles);
  if (totalBytesAfter > MAX_REFERENCE_IMAGE_TOTAL_BYTES) {
    throw new Error(
      "Total gambar referensi masih terlalu besar meski sudah dikompres. Kurangi jumlah gambar atau crop area penting saja.",
    );
  }

  return {
    files: preparedFiles,
    optimized: true,
    totalBytesBefore,
    totalBytesAfter,
  };
}

/**
 * PDF Processor — Extract text from PDF files and split into semantic chunks
 *
 * Flow:
 * 1. PDF Buffer → pdf-parse → Raw text
 * 2. Raw text → Clean & normalize
 * 3. Cleaned text → Recursive chunk splitting (max ~800 tokens per chunk)
 * 4. Each chunk gets metadata (page range, position, filename)
 *
 * Safety:
 * - Max buffer size guard (10MB)
 * - Graceful error for encrypted/image-only PDFs
 * - Multiple require paths for pdf-parse (handles the test-file bug)
 * - Input sanitization
 */

// ==================== TYPES ====================

export interface PDFChunk {
  content: string;
  chunkIndex: number;
  metadata: {
    filename: string;
    totalPages: number;
    totalChunks: number;
    chunkPosition: string; // e.g., "1/12"
  };
}

export interface PDFExtractionResult {
  text: string;
  totalPages: number;
  chunks: PDFChunk[];
  filename: string;
}

// ==================== CONSTANTS ====================

const MAX_BUFFER_SIZE = 10 * 1024 * 1024; // 10MB hard limit
const CHUNK_MAX_CHARS = 3000;
const CHUNK_OVERLAP_CHARS = 200;
const CHUNK_MIN_CHARS = 100;

// ==================== TEXT EXTRACTION ====================

/**
 * Safely load pdf-parse module.
 *
 * pdf-parse has a known bug: its index.js loads a test PDF file at
 * `./test/data/05-versions-space.pdf` during module init. This breaks
 * in production/bundled environments.
 *
 * We try multiple import strategies:
 * 1. Direct lib import (bypasses the test file load)
 * 2. Normal require (works if test file exists)
 * 3. Dynamic import fallback
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _pdfParseModule: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadPdfParse(): Promise<any> {
  if (_pdfParseModule) return _pdfParseModule;

  const strategies = [
    // Strategy 1: Direct lib path (avoids index.js test-file bug)
    () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require("pdf-parse/lib/pdf-parse.js");
    },
    // Strategy 2: Normal require (works if test file exists or in dev)
    () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require("pdf-parse");
    },
  ];

  for (let i = 0; i < strategies.length; i++) {
    try {
      const result = strategies[i]();
      if (result && typeof result === "function") {
        _pdfParseModule = result;
        return _pdfParseModule;
      }
    } catch (err) {
      console.warn(`[PDF] Load strategy ${i + 1} failed:`, err instanceof Error ? err.message : err);
    }
  }

  throw new Error(
    "pdf-parse module tidak tersedia. Pastikan package 'pdf-parse' terinstall: npm install pdf-parse"
  );
}

/**
 * Extract text from a PDF buffer using pdf-parse with comprehensive error handling.
 */
export async function extractPDFText(
  buffer: Buffer,
  filename: string
): Promise<{ text: string; totalPages: number }> {
  // Guard: buffer size
  if (!buffer || buffer.length === 0) {
    throw new Error(`File PDF "${filename}" kosong (0 bytes).`);
  }
  if (buffer.length > MAX_BUFFER_SIZE) {
    throw new Error(
      `File PDF "${filename}" terlalu besar (${(buffer.length / 1024 / 1024).toFixed(1)}MB). Maksimal ${MAX_BUFFER_SIZE / 1024 / 1024}MB.`
    );
  }

  // Guard: check PDF magic bytes (%PDF)
  const header = buffer.subarray(0, 5).toString("ascii");
  if (!header.startsWith("%PDF")) {
    throw new Error(
      `File "${filename}" bukan PDF yang valid (header: ${JSON.stringify(header.slice(0, 10))}).`
    );
  }

  try {
    const pdfParse = await loadPdfParse();

    // Configure options for robustness
    const options = {
      // Limit pages to prevent OOM on very large PDFs
      max: 200,
      // Don't render page images (we only need text)
      pagerender: undefined,
    };

    const data = await pdfParse(buffer, options);

    const text = typeof data?.text === "string" ? data.text : "";
    const totalPages = typeof data?.numpages === "number" ? data.numpages : 1;

    return { text, totalPages };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);

    // Classify common PDF errors into user-friendly messages
    if (msg.includes("password") || msg.includes("encrypted")) {
      throw new Error(
        `PDF "${filename}" dilindungi password. Hapus password terlebih dahulu sebelum mengunggah.`
      );
    }
    if (msg.includes("Invalid PDF") || msg.includes("bad XRef") || msg.includes("XRef")) {
      throw new Error(
        `PDF "${filename}" rusak atau formatnya tidak didukung. Coba simpan ulang PDF dari aplikasi asalnya.`
      );
    }
    if (msg.includes("stream") || msg.includes("ENOENT") || msg.includes("no such file")) {
      // This is the pdf-parse test file bug — re-throw with clear message
      throw new Error(
        `Gagal memproses PDF "${filename}". Kemungkinan masalah konfigurasi library. Coba restart server.`
      );
    }

    throw new Error(
      `Gagal membaca PDF "${filename}": ${msg}`
    );
  }
}

// ==================== TEXT CLEANING ====================

/**
 * Clean and normalize extracted PDF text
 */
function cleanText(raw: string): string {
  return (
    raw
      // Normalize line endings
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      // Remove NULL bytes (sometimes appear in corrupted PDFs)
      .replace(/\0/g, "")
      // Remove excessive blank lines (keep max 2)
      .replace(/\n{4,}/g, "\n\n\n")
      // Remove common page number patterns
      .replace(/^(Page|Halaman|Hal\.?)\s*\d+\s*(of|dari)?\s*\d*\s*$/gim, "")
      .replace(/^-\s*\d+\s*-\s*$/gm, "")
      .replace(/^\d+\s*$/gm, "") // standalone page numbers
      // Remove excessive spaces on a single line
      .replace(/[ \t]{3,}/g, "  ")
      // Trim each line
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n")
      // Remove leading/trailing whitespace
      .trim()
  );
}

// ==================== CHUNKING ====================

/**
 * Split text into semantic chunks using a recursive strategy.
 *
 * Priority order of split boundaries:
 * 1. Double newline (paragraph break)
 * 2. Single newline (line break)
 * 3. Sentence boundary (. ! ?)
 * 4. Hard split at max length
 *
 * Target: ~800 tokens per chunk (~3000 chars), overlap 200 chars
 */
function splitIntoChunks(text: string): string[] {
  if (!text || text.trim().length === 0) return [];
  if (text.length <= CHUNK_MAX_CHARS) {
    return text.length >= CHUNK_MIN_CHARS ? [text] : [];
  }

  const chunks: string[] = [];
  let remaining = text;
  let safetyCounter = 0;
  const maxIterations = Math.ceil(text.length / (CHUNK_MIN_CHARS / 2)) + 10; // prevent infinite loop

  while (remaining.length > 0 && safetyCounter++ < maxIterations) {
    if (remaining.length <= CHUNK_MAX_CHARS) {
      if (remaining.trim().length >= CHUNK_MIN_CHARS) {
        chunks.push(remaining.trim());
      }
      break;
    }

    // Find the best split point within the max window
    const window = remaining.slice(0, CHUNK_MAX_CHARS);
    let splitAt = -1;

    // 1. Try paragraph break
    const paraBreak = window.lastIndexOf("\n\n");
    if (paraBreak > CHUNK_MAX_CHARS * 0.3) {
      splitAt = paraBreak;
    }

    // 2. Try line break
    if (splitAt === -1) {
      const lineBreak = window.lastIndexOf("\n");
      if (lineBreak > CHUNK_MAX_CHARS * 0.3) {
        splitAt = lineBreak;
      }
    }

    // 3. Try sentence boundary
    if (splitAt === -1) {
      const sentenceEnd = Math.max(
        window.lastIndexOf(". "),
        window.lastIndexOf("! "),
        window.lastIndexOf("? ")
      );
      if (sentenceEnd > CHUNK_MAX_CHARS * 0.3) {
        splitAt = sentenceEnd + 1; // include the period
      }
    }

    // 4. Hard split at word boundary
    if (splitAt === -1) {
      const spaceAt = window.lastIndexOf(" ");
      splitAt = spaceAt > CHUNK_MAX_CHARS * 0.5 ? spaceAt : CHUNK_MAX_CHARS;
    }

    const chunk = remaining.slice(0, splitAt).trim();
    if (chunk.length >= CHUNK_MIN_CHARS) {
      chunks.push(chunk);
    }

    // Move forward with overlap
    const advance = Math.max(splitAt - CHUNK_OVERLAP_CHARS, 1);
    remaining = remaining.slice(advance);
  }

  if (safetyCounter >= maxIterations) {
    console.warn(`[PDF Chunker] Hit safety limit (${maxIterations} iterations). Text length: ${text.length}`);
  }

  return chunks;
}

// ==================== MAIN PIPELINE ====================

/**
 * Full pipeline: PDF buffer → extracted text → cleaned → chunked
 */
export async function processPDF(
  buffer: Buffer,
  filename: string
): Promise<PDFExtractionResult> {
  // Sanitize filename
  const safeName = filename.replace(/[<>:"/\\|?*]/g, "_").slice(0, 255);

  // 1. Extract raw text
  const { text: rawText, totalPages } = await extractPDFText(buffer, safeName);

  if (!rawText || rawText.trim().length < 20) {
    throw new Error(
      `PDF "${safeName}" tidak mengandung teks yang bisa dibaca (${rawText?.length || 0} karakter). ` +
      `Pastikan PDF bukan berupa scan/gambar. Gunakan OCR terlebih dahulu jika PDF adalah hasil scan.`
    );
  }

  // 2. Clean text
  const cleanedText = cleanText(rawText);

  if (cleanedText.length < 20) {
    throw new Error(
      `PDF "${safeName}" menghasilkan teks terlalu pendek setelah dibersihkan (${cleanedText.length} karakter).`
    );
  }

  // 3. Chunk
  const textChunks = splitIntoChunks(cleanedText);

  if (textChunks.length === 0) {
    throw new Error(
      `PDF "${safeName}" menghasilkan 0 chunk setelah diproses. Teks mungkin terlalu pendek atau hanya berisi karakter spesial.`
    );
  }

  // 4. Build chunk objects with metadata
  const chunks: PDFChunk[] = textChunks.map((content, i) => ({
    content: `[Dokumen: ${safeName}]\n${content}`,
    chunkIndex: i,
    metadata: {
      filename: safeName,
      totalPages,
      totalChunks: textChunks.length,
      chunkPosition: `${i + 1}/${textChunks.length}`,
    },
  }));

  console.log(
    `[PDF] Processed "${safeName}": ${totalPages} pages, ${cleanedText.length} chars → ${chunks.length} chunks`
  );

  return {
    text: cleanedText,
    totalPages,
    chunks,
    filename: safeName,
  };
}

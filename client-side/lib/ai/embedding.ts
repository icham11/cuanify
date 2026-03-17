/**
 * Gemini Embedding Service for RAG
 * Uses Google Gemini text-embedding-004 model (768 dimensions)
 *
 * Flow:
 * 1. Text → Gemini API → Embedding vector (768 dims)
 * 2. Vector stored in PostgreSQL via pgvector
 * 3. Query → Embed → Cosine similarity search → Top-K relevant docs
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_DIMENSIONS = 768;
const GEMINI_EMBEDDING_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBEDDING_MODEL}:embedContent`;
const GEMINI_BATCH_EMBEDDING_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBEDDING_MODEL}:batchEmbedContents`;

// ==================== EMBEDDING GENERATION ====================

/**
 * Generate a single embedding vector from text using Gemini
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set. Required for RAG embeddings.");
  }

  // Sanitize — remove null bytes and limit
  const safeText = text.replace(/\0/g, "").slice(0, 10000);
  if (!safeText.trim()) {
    throw new Error("Input text kosong — tidak bisa menghasilkan embedding.");
  }

  const response = await fetch(`${GEMINI_EMBEDDING_URL}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: `models/${GEMINI_EMBEDDING_MODEL}`,
      content: {
        parts: [{ text: safeText }],
      },
      taskType: "RETRIEVAL_DOCUMENT",
      outputDimensionality: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini Embedding API error: ${response.status} — ${error}`);
  }

  const data = await response.json();
  const values = data?.embedding?.values;
  if (!Array.isArray(values) || values.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Gemini returned invalid embedding: expected ${EMBEDDING_DIMENSIONS} dimensions, got ${Array.isArray(values) ? values.length : "null"}`
    );
  }
  return values as number[];
}

/**
 * Generate embedding for a query (uses RETRIEVAL_QUERY task type for better search)
 */
export async function generateQueryEmbedding(query: string): Promise<number[]> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set.");
  }

  // Sanitize query — remove null bytes and limit length
  const safeQuery = query.replace(/\0/g, "").slice(0, 10000);
  if (!safeQuery.trim()) {
    throw new Error("Query kosong — tidak bisa menghasilkan embedding.");
  }

  const response = await fetch(`${GEMINI_EMBEDDING_URL}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: `models/${GEMINI_EMBEDDING_MODEL}`,
      content: {
        parts: [{ text: safeQuery }],
      },
      taskType: "RETRIEVAL_QUERY",
      outputDimensionality: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini Query Embedding error: ${response.status} — ${error}`);
  }

  const data = await response.json();
  const values = data?.embedding?.values;
  if (!Array.isArray(values) || values.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Gemini returned invalid query embedding: expected ${EMBEDDING_DIMENSIONS} dimensions, got ${Array.isArray(values) ? values.length : "null"}`
    );
  }
  return values as number[];
}

/**
 * Generate embeddings for multiple texts in batch
 *
 * Gemini free tier limits:
 *   - 100 embedContent requests/min/model
 *   - batchEmbedContents counts each item in the batch as 1 request
 *
 * Strategy:
 *   - Use small batches (20 texts each) to avoid slamming the quota
 *   - Wait between batches to stay under 100 req/min
 *   - Retry with exponential backoff on 429 (rate limit) errors
 */
export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set.");
  }

  if (texts.length === 0) return [];

  // Sanitize all texts — remove null bytes and limit
  const safeTexts = texts.map((t) => t.replace(/\0/g, "").slice(0, 10000));

  const BATCH_SIZE = 20;  // 20 items per API call → 5 calls = 100 items/min (safe)
  const DELAY_MS = 1500;  // 1.5s between batches → ~13 batches/min × 20 = 260 items/min headroom
  const MAX_RETRIES = 3;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < safeTexts.length; i += BATCH_SIZE) {
    const batch = safeTexts.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(safeTexts.length / BATCH_SIZE);

    console.log(`[Embedding] Batch ${batchNum}/${totalBatches} (${batch.length} items)`);

    const requests = batch.map((text) => ({
      model: `models/${GEMINI_EMBEDDING_MODEL}`,
      content: {
        parts: [{ text: text.slice(0, 10000) }],
      },
      taskType: "RETRIEVAL_DOCUMENT",
      outputDimensionality: EMBEDDING_DIMENSIONS,
    }));

    // Retry loop with exponential backoff
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(
          `${GEMINI_BATCH_EMBEDDING_URL}?key=${GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ requests }),
          }
        );

        if (response.status === 429) {
          // Rate limited — parse retry delay from response if available
          const errorBody = await response.text();
          const retryMatch = errorBody.match(/retry in ([\d.]+)s/i);
          const waitSec = retryMatch ? Math.ceil(parseFloat(retryMatch[1])) + 2 : (attempt + 1) * 15;
          console.warn(`[Embedding] Rate limited (429). Waiting ${waitSec}s before retry ${attempt + 1}/${MAX_RETRIES}...`);
          await sleep(waitSec * 1000);
          continue; // retry
        }

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Gemini Batch Embedding error: ${response.status} — ${error}`);
        }

        const data = await response.json();
        const embeddings = data.embeddings.map(
          (e: { values: number[] }) => e.values
        );

        // Validate dimensions
        for (let j = 0; j < embeddings.length; j++) {
          if (!Array.isArray(embeddings[j]) || embeddings[j].length !== EMBEDDING_DIMENSIONS) {
            throw new Error(
              `Batch embedding ${j} has invalid dimensions: expected ${EMBEDDING_DIMENSIONS}, got ${Array.isArray(embeddings[j]) ? embeddings[j].length : "null"}`
            );
          }
        }

        allEmbeddings.push(...embeddings);
        lastError = null;
        break; // success — exit retry loop

      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < MAX_RETRIES - 1) {
          const backoff = (attempt + 1) * 10_000; // 10s, 20s, 30s
          console.warn(`[Embedding] Attempt ${attempt + 1} failed, retrying in ${backoff / 1000}s...`);
          await sleep(backoff);
        }
      }
    }

    if (lastError) {
      throw lastError;
    }

    // Pause between batches to respect rate limits
    if (i + BATCH_SIZE < safeTexts.length) {
      await sleep(DELAY_MS);
    }
  }

  return allEmbeddings;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { EMBEDDING_DIMENSIONS };



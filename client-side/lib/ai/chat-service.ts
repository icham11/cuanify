import { groq, GROQ_MODELS } from "@/lib/groq";
import prisma from "@/lib/prisma";
import { getRelevantContext, getIndexStatus, indexBusinessDocuments } from "@/lib/ai/rag-store";

const GROQ_CHAT_COMPLETIONS_URL = "https://api.groq.com/openai/v1/chat/completions";

// ===================== TYPES =====================

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatContext {
  businessId: number;
  sessionId?: number;
  contextType?: string;
}

export interface BusinessDataContext {
  businessName: string;
  products: { name: string; sellingPrice: number; category?: string }[];
  recentSales: {
    date: string;
    totalRevenue: number;
    totalCost: number;
    items: { productName: string; quantity: number }[];
  }[];
  ingredients: {
    name: string;
    unit: string;
    minStock: number;
    currentStock: number;
    batches: { remainingQty: number; expirationDate?: string | null }[];
  }[];
  metrics?: {
    totalRevenue: number;
    totalProfit: number;
    marginAvg: number;
    growthRate: number;
  } | null;
  recipes: {
    productName: string;
    ingredientName: string;
    quantity: number;
    unit: string;
  }[];
}

type GroqRole = "user" | "assistant" | "system";
type GroqMessage = { role: GroqRole; content: string };

function toGroqMessages(messages: ChatMessage[]): GroqMessage[] {
  return messages.map((m) => ({
    role: m.role as GroqRole,
    content: m.content,
  }));
}

function isGroqConnectionError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  const maybeError = error as { code?: string; cause?: { code?: string } };
  const code = maybeError.code || maybeError.cause?.code || "";

  return (
    msg.includes("connection error") ||
    msg.includes("fetch failed") ||
    msg.includes("network") ||
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "ENOTFOUND"
  );
}

async function createChatCompletionWithNetworkFallback(params: {
  messages: GroqMessage[];
  model: string;
  temperature: number;
  maxTokens: number;
}): Promise<string> {
  try {
    const completion = await groq.chat.completions.create({
      messages: params.messages,
      model: params.model,
      temperature: params.temperature,
      max_tokens: params.maxTokens,
    });
    return completion.choices[0]?.message?.content || "";
  } catch (error) {
    if (!isGroqConnectionError(error)) {
      throw error;
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw error;
    }

    console.warn("⚠️ GROQ SDK connection failed, retrying via direct HTTP API...");

    const response = await fetch(GROQ_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        messages: params.messages,
        model: params.model,
        temperature: params.temperature,
        max_tokens: params.maxTokens,
        stream: false,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      throw new Error(
        `Groq direct HTTP failed (${response.status}): ${bodyText || response.statusText}`
      );
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };

    return data.choices?.[0]?.message?.content || "";
  }
}

// ===================== SYSTEM PROMPT =====================

const CHAT_SYSTEM_PROMPT = `Kamu adalah AI Business Assistant untuk UMKM (Usaha Mikro Kecil Menengah) Indonesia.
Kamu membantu pemilik usaha kecil dengan analisis bisnis, saran strategi, dan insight berbasis data.

KEMAMPUAN kamu:
- Analisis penjualan dan tren pendapatan
- Monitoring stok dan prediksi kehabisan bahan
- Rekomendasi produk dan optimasi menu
- Strategi harga dan margin profit
- Tips manajemen bisnis UMKM
- Analisis performa produk
- Prediksi demand dan perencanaan produksi

ATURAN:
1. Jawab dalam Bahasa Indonesia yang ramah dan mudah dipahami
2. Gunakan DATA BISNIS yang diberikan di bawah untuk memberikan insight SPESIFIK
3. Data di bawah adalah hasil pencarian semantik — hanya data yang RELEVAN dengan pertanyaan user
4. Berikan saran yang actionable dan praktis untuk UMKM
5. Gunakan format markdown yang rapi: tabel, bold, heading, numbered list
6. Selalu sertakan angka dan persentase jika data tersedia
7. Jika data tidak cukup, katakan secara jujur lalu berikan saran umum
8. Jangan mengarang data yang tidak ada dalam konteks
9. Gunakan emoji secukupnya, lebih baik gunakan format list dan tabel`;

// ===================== FETCH BUSINESS DATA =====================

export async function fetchBusinessContext(businessId: number): Promise<BusinessDataContext> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 30);

  const [business, products, sales, ingredients, metrics, recipes] = await Promise.all([
    prisma.business.findUnique({
      where: { id: businessId },
      select: { name: true },
    }),

    prisma.product.findMany({
      where: { businessId, isActive: true },
      select: {
        name: true,
        sellingPrice: true,
        category: { select: { name: true } },
      },
      take: 50,
    }),

    prisma.sale.findMany({
      where: {
        businessId,
        createdAt: { gte: thirtyDaysAgo },
      },
      select: {
        createdAt: true,
        totalRevenue: true,
        totalCost: true,
        saleItems: {
          select: {
            quantity: true,
            product: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),

    prisma.ingredient.findMany({
      where: { businessId },
      select: {
        name: true,
        unit: true,
        minStock: true,
        inventoryBatches: {
          select: {
            remainingQty: true,
            expirationDate: true,
          },
          where: { remainingQty: { gt: 0 } },
        },
      },
    }),

    prisma.businessMetrics.findFirst({
      where: {
        businessId,
        date: { gte: thirtyDaysAgo },
      },
      orderBy: { date: "desc" },
      select: {
        totalRevenue: true,
        totalProfit: true,
        marginAvg: true,
        growthRate: true,
      },
    }),

    prisma.recipe.findMany({
      where: { product: { businessId } },
      select: {
        quantity: true,
        product: { select: { name: true } },
        ingredient: { select: { name: true, unit: true } },
      },
      take: 100,
    }),
  ]);

  return {
    businessName: business?.name || "Unknown",
    products: products.map((p) => ({
      name: p.name,
      sellingPrice: Number(p.sellingPrice),
      category: p.category?.name,
    })),
    recentSales: sales.map((s) => ({
      date: s.createdAt.toISOString(),
      totalRevenue: Number(s.totalRevenue),
      totalCost: Number(s.totalCost),
      items: s.saleItems.map((si) => ({
        productName: si.product.name,
        quantity: si.quantity,
      })),
    })),
    ingredients: ingredients.map((i) => ({
      name: i.name,
      unit: i.unit,
      minStock: i.minStock,
      currentStock: i.inventoryBatches.reduce(
        (sum, b) => sum + Number(b.remainingQty),
        0
      ),
      batches: i.inventoryBatches.map((b) => ({
        remainingQty: Number(b.remainingQty),
        expirationDate: b.expirationDate?.toISOString() || null,
      })),
    })),
    metrics: metrics
      ? {
          totalRevenue: Number(metrics.totalRevenue),
          totalProfit: Number(metrics.totalProfit),
          marginAvg: metrics.marginAvg,
          growthRate: metrics.growthRate,
        }
      : null,
    recipes: recipes.map((r) => ({
      productName: r.product.name,
      ingredientName: r.ingredient.name,
      quantity: Number(r.quantity),
      unit: r.ingredient.unit,
    })),
  };
}

// ===================== RAG CONTEXT BUILDER =====================

/**
 * Ensures business data is indexed in the vector store.
 * Auto-indexes if not yet done, re-indexes if data is stale (>1 hour).
 */
async function ensureRAGIndex(businessId: number): Promise<void> {
  try {
    const status = await getIndexStatus(businessId);
    if (!status.indexed) {
      console.log(`[RAG] Business ${businessId} not indexed. Auto-indexing...`);
      await indexBusinessDocuments(businessId);
    } else if (status.lastUpdated) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      if (status.lastUpdated < oneHourAgo) {
        console.log(`[RAG] Re-indexing business ${businessId} (stale data)...`);
        // Run in background so we don't block the response
        indexBusinessDocuments(businessId).catch((e) =>
          console.error("[RAG] Background re-index failed:", e)
        );
      }
    }
  } catch (err) {
    console.warn("[RAG] Index check failed, will use fallback context:", err);
  }
}

/**
 * Build context prompt using RAG semantic search.
 * Falls back to the old dump-all approach if RAG fails.
 */
async function buildRAGContextPrompt(
  businessId: number,
  userMessage: string
): Promise<{ prompt: string; ragUsed: boolean; sourceCount: number; sources: { sourceType: string; similarity: number; content: string }[] }> {
  try {
    await ensureRAGIndex(businessId);

    const { context, sources } = await getRelevantContext(businessId, userMessage, {
      topK: 10,
      minSimilarity: 0.2,
    });

    if (sources.length > 0) {
      console.log(
        `[RAG] Found ${sources.length} relevant docs (similarity: ${sources.map((s) => s.similarity.toFixed(2)).join(", ")})`
      );

      const business = await prisma.business.findUnique({
        where: { id: businessId },
        select: { name: true },
      });

      const prompt = `
DATA BISNIS "${business?.name || "UMKM"}" (via RAG Semantic Search — ${sources.length} dokumen relevan):

${context}
`;
      const sourceRefs = sources.map((s) => ({
        sourceType: s.sourceType,
        similarity: s.similarity,
        content: s.content.slice(0, 100),
      }));
      return { prompt, ragUsed: true, sourceCount: sources.length, sources: sourceRefs };
    }
  } catch (err) {
    console.warn("[RAG] Semantic search failed, falling back to dump-all:", err);
  }

  // Fallback: use the old approach
  const businessData = await fetchBusinessContext(businessId);
  const prompt = buildContextPrompt(businessData);
  return { prompt, ragUsed: false, sourceCount: 0, sources: [] };
}

// ===================== CHAT COMPLETION =====================

export async function chatWithAssistant(
  messages: ChatMessage[],
  context: ChatContext
): Promise<string> {
  // Get the user's latest message for RAG search
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  const searchQuery = lastUserMsg?.content || messages[messages.length - 1]?.content || "";

  // Build context using RAG semantic search
  const { prompt: contextPrompt, ragUsed, sourceCount } = await buildRAGContextPrompt(
    context.businessId,
    searchQuery
  );
  console.log(`🤖 AI Chat [RAG=${ragUsed}, sources=${sourceCount}]`);

  const systemMessage: ChatMessage = {
    role: "system",
    content: CHAT_SYSTEM_PROMPT + "\n\n" + contextPrompt,
  };

  const allMessages = [systemMessage, ...messages.slice(-10)]; // Keep last 10 messages for context
  const modelMessages = toGroqMessages(allMessages);

  const modelConfig = GROQ_MODELS.text;
  let selectedModel = modelConfig.primary;

  try {
    console.log(`🤖 AI Chat using model: ${selectedModel}`);

    const response = await createChatCompletionWithNetworkFallback({
      messages: modelMessages,
      model: selectedModel,
      temperature: 0.7,
      maxTokens: 2048,
    });

    const safeResponse = response || "Maaf, saya tidak bisa memberikan respons saat ini.";

    // Persist messages
    try {
      await persistMessages(context.businessId, context.sessionId, messages[messages.length - 1], {
        role: "assistant",
        content: safeResponse,
      }, context.contextType);
    } catch (persistError) {
      console.warn("Failed to persist chat messages:", persistError);
    }

    return safeResponse;
  } catch {
    // Try fallback model
    console.warn(`⚠️ Primary chat model failed, trying fallback: ${modelConfig.fallback}`);
    selectedModel = modelConfig.fallback;

    try {
      const response = await createChatCompletionWithNetworkFallback({
        messages: modelMessages,
        model: selectedModel,
        temperature: 0.7,
        maxTokens: 2048,
      });

      return response || "Maaf, saya tidak bisa memberikan respons saat ini.";
    } catch (fallbackError) {
      const msg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      console.error("❌ AI Chat Error:", msg);
      throw new Error(`AI Chat failed: ${msg}`);
    }
  }
}

// ===================== STREAMING CHAT =====================

export async function streamChatWithAssistant(
  messages: ChatMessage[],
  context: ChatContext
): Promise<ReadableStream<Uint8Array>> {
  // Get the user's latest message for RAG search
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  const searchQuery = lastUserMsg?.content || messages[messages.length - 1]?.content || "";

  // Build context using RAG semantic search
  const { prompt: contextPrompt, ragUsed, sourceCount, sources } = await buildRAGContextPrompt(
    context.businessId,
    searchQuery
  );
  console.log(`🤖 AI Stream [RAG=${ragUsed}, sources=${sourceCount}]`);

  const systemMessage: ChatMessage = {
    role: "system",
    content: CHAT_SYSTEM_PROMPT + "\n\n" + contextPrompt,
  };

  const allMessages = [systemMessage, ...messages.slice(-10)];
  const modelMessages = toGroqMessages(allMessages);
  const modelConfig = GROQ_MODELS.text;

  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let fullResponse = "";

      // Send RAG sources as first SSE event so frontend can show badges
      if (sources.length > 0) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "sources", sources })}\n\n`)
        );
      }

      try {
        const stream = await groq.chat.completions.create({
          messages: allMessages.map((m) => ({
            role: m.role as "user" | "assistant" | "system",
            content: m.content,
          })),
          model: modelConfig.primary,
          temperature: 0.7,
          max_tokens: 2048,
          stream: true,
        });

        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || "";
          if (content) {
            fullResponse += content;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
          }
        }

        // Persist after streaming completes
        try {
          await persistMessages(context.businessId, context.sessionId, messages[messages.length - 1], {
            role: "assistant",
            content: fullResponse,
          }, context.contextType);
        } catch {
          console.warn("Failed to persist streamed messages");
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
        controller.close();
      } catch (primaryError) {
        // Try fallback
        const primaryMsg = primaryError instanceof Error ? primaryError.message : String(primaryError);
        console.warn(`⚠️ Streaming primary failed (${primaryMsg}), trying fallback...`);

        // If this is a network-layer issue on SDK stream, jump directly to non-stream fallback.
        if (isGroqConnectionError(primaryError)) {
          try {
            const nonStream = await createChatCompletionWithNetworkFallback({
              messages: modelMessages,
              model: modelConfig.primary,
              temperature: 0.7,
              maxTokens: 2048,
            });
            if (nonStream) {
              fullResponse = nonStream;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: nonStream })}\n\n`));
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
              controller.close();
              return;
            }
          } catch (directFallbackError) {
            const msg =
              directFallbackError instanceof Error
                ? directFallbackError.message
                : String(directFallbackError);
            console.warn(`⚠️ Direct non-stream fallback after stream error failed (${msg})`);
          }
        }

        try {
          const stream = await groq.chat.completions.create({
            messages: modelMessages,
            model: modelConfig.fallback,
            temperature: 0.7,
            max_tokens: 2048,
            stream: true,
          });

          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (content) {
              fullResponse += content;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
            }
          }

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
          controller.close();
        } catch (fallbackError) {
          const fallbackMsg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
          console.warn(`⚠️ Streaming fallback failed (${fallbackMsg}), trying non-stream fallback...`);

          // Final fallback: return a normal completion as one chunk.
          // This keeps UX working even if provider streaming fails in certain runtimes.
          try {
            const nonStream = await chatWithAssistant(messages, context);
            if (nonStream) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: nonStream })}\n\n`));
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
              controller.close();
              return;
            }
          } catch (nonStreamError) {
            const nonStreamMsg =
              nonStreamError instanceof Error ? nonStreamError.message : String(nonStreamError);
            console.error("❌ AI Stream + non-stream fallback failed:", {
              streaming: fallbackMsg,
              nonStreaming: nonStreamMsg,
            });
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ error: nonStreamMsg })}\n\n`)
            );
            controller.close();
            return;
          }

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: fallbackMsg })}\n\n`));
          controller.close();
        }
      }
    },
  });
}

// ===================== HELPERS =====================

function buildContextPrompt(data: BusinessDataContext): string {
  const lowStockItems = data.ingredients.filter((i) => i.currentStock <= i.minStock);
  const totalRev = data.recentSales.reduce((s, r) => s + r.totalRevenue, 0);
  const totalCost = data.recentSales.reduce((s, r) => s + r.totalCost, 0);

  // Aggregate top-selling products
  const productSales: Record<string, number> = {};
  data.recentSales.forEach((s) =>
    s.items.forEach((i) => {
      productSales[i.productName] = (productSales[i.productName] || 0) + i.quantity;
    })
  );
  const topProducts = Object.entries(productSales)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  return `
DATA BISNIS "${data.businessName}" (30 hari terakhir):

📦 PRODUK AKTIF: ${data.products.length}
🏆 TOP SELLING:
${topProducts.map(([name, qty], i) => `${i + 1}. ${name} (${qty} terjual)`).join("\n") || "Belum ada data"}

💰 RINGKASAN KEUANGAN:
- Total Revenue: Rp${totalRev.toLocaleString("id-ID")}
- Total Cost: Rp${totalCost.toLocaleString("id-ID")}  
- Total Profit: Rp${(totalRev - totalCost).toLocaleString("id-ID")}
- Jumlah Transaksi: ${data.recentSales.length}
${data.recentSales.length > 0 ? `- Rata-rata/transaksi: Rp${Math.round(totalRev / data.recentSales.length).toLocaleString("id-ID")}` : ""}

⚠️ BAHAN BAKU RENDAH (${lowStockItems.length} item):
${lowStockItems.map((i) => `- ${i.name}: ${i.currentStock}/${i.minStock} ${i.unit}`).join("\n") || "Semua stok aman ✅"}

🥕 TOTAL BAHAN BAKU: ${data.ingredients.length}
🍳 TOTAL RESEP: ${data.recipes.length}

${data.metrics ? `📊 METRIK: Margin ${data.metrics.marginAvg.toFixed(1)}% | Growth ${data.metrics.growthRate.toFixed(1)}%` : ""}
`;
}

async function persistMessages(
  businessId: number,
  sessionId: number | undefined,
  userMsg: ChatMessage,
  assistantMsg: ChatMessage,
  contextType?: string
) {
  await prisma.chatMessage.createMany({
    data: [
      {
        businessId,
        sessionId: sessionId || null,
        role: userMsg.role,
        content: userMsg.content,
        contextType: contextType || "general",
      },
      {
        businessId,
        sessionId: sessionId || null,
        role: assistantMsg.role,
        content: assistantMsg.content,
        contextType: contextType || "general",
      },
    ],
  });

  // Auto-title the session from first user message
  if (sessionId) {
    try {
      await autoTitleSession(sessionId, businessId, userMsg.content);
    } catch {
      // Non-critical — don't fail the main flow
    }
  }
}

// ===================== CHAT HISTORY =====================

export async function getChatHistory(businessId: number, sessionId?: number, limit = 50) {
  return prisma.chatMessage.findMany({
    where: {
      businessId,
      ...(sessionId ? { sessionId } : {}),
      role: { not: "system" },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: {
      id: true,
      role: true,
      content: true,
      contextType: true,
      createdAt: true,
    },
  });
}

export async function getChatSessions(businessId: number) {
  // Auto-cleanup: delete empty sessions older than 5 minutes
  try {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    await prisma.chatSession.deleteMany({
      where: {
        businessId,
        createdAt: { lt: fiveMinAgo },
        messages: { none: {} },
      },
    });
  } catch {
    // Non-critical
  }

  return prisma.chatSession.findMany({
    where: { businessId },
    orderBy: { updatedAt: "desc" },
    take: 20,
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { messages: true } },
    },
  });
}

export async function createChatSession(businessId: number, title?: string) {
  return prisma.chatSession.create({
    data: {
      businessId,
      title: title || "Percakapan Baru",
    },
  });
}

export async function deleteChatSession(sessionId: number, businessId: number) {
  return prisma.chatSession.delete({
    where: { id: sessionId, businessId },
  });
}

/**
 * Update session title.
 * Truncates to 50 chars max.
 */
export async function updateSessionTitle(sessionId: number, businessId: number, title: string) {
  const truncated = title.length > 50 ? title.slice(0, 47) + "..." : title;
  return prisma.chatSession.update({
    where: { id: sessionId, businessId },
    data: { title: truncated },
  });
}

/**
 * Generate a short, readable title from a user message.
 * Strips filler words and produces a clean summary ≤ 40 chars.
 */
function generateTitleFromMessage(message: string): string {
  // Remove common filler/prefix words in Indonesian & English
  const fillers = [
    "tolong", "coba", "bisa", "boleh", "mohon", "minta", "berikan", "kasih",
    "jelaskan", "bantu", "saya", "aku", "kami", "kita", "ingin", "mau", "dong",
    "ya", "please", "can", "you", "could", "help", "me", "i", "want", "to",
    "the", "a", "an", "give", "show", "tell", "explain",
    "bagaimana", "gimana", "apa", "apakah", "kenapa", "mengapa",
  ];

  const cleaned = message
    .replace(/[?!.,;:'"` ]/g, " ")  // strip punctuation
    .trim();

  // Remove filler words from the start
  const words = cleaned.split(/\s+/);
  let startIdx = 0;
  while (startIdx < words.length && fillers.includes(words[startIdx].toLowerCase())) {
    startIdx++;
  }
  const meaningful = words.slice(startIdx);

  if (meaningful.length === 0) {
    // All filler — use original but capitalize first letter
    const fallback = message.trim().slice(0, 40);
    return fallback.charAt(0).toUpperCase() + fallback.slice(1);
  }

  // Take first ~6 meaningful words, capitalize
  const title = meaningful.slice(0, 6).join(" ");
  const capitalized = title.charAt(0).toUpperCase() + title.slice(1);

  return capitalized.length > 40 ? capitalized.slice(0, 37) + "..." : capitalized;
}

/**
 * Auto-set session title from the first user message if it's still a default title.
 */
export async function autoTitleSession(sessionId: number, businessId: number, firstMessage: string) {
  const session = await prisma.chatSession.findUnique({
    where: { id: sessionId },
    select: { title: true },
  });
  const defaultTitles = ["New Chat", "Chat Baru", "Percakapan Baru"];
  if (session && defaultTitles.includes(session.title || "")) {
    const title = generateTitleFromMessage(firstMessage);
    await updateSessionTitle(sessionId, businessId, title);
  }
}


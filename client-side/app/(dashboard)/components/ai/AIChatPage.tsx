"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle,
  Send,
  Trash2,
  Plus,
  Bot,
  User,
  Menu,
  X,
  RefreshCw,
  Database,
  BarChart3,
  Package,
  TrendingUp,
  Target,
  Utensils,
  AlertTriangle,
  DollarSign,
  Factory,
  Paperclip,
  FileText,
  Brain,
  Sparkles,
} from "lucide-react";
import { useApiQuery } from "@/hooks/useApiQuery";
import {
  aiRagIndexUrl,
  aiSessionsUrl,
  aiChatHistoryUrl,
  invalidateAiChatCaches,
  invalidateAiInsightsCaches,
  invalidateAiRagStatusCaches,
  API_CACHE_TTL_5_MIN_MS,
} from "@/lib/api/cache-keys";
import MarkdownRenderer from "./MarkdownRenderer";

interface SourceRef {
  sourceType: string;
  similarity: number;
  content: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  sources?: SourceRef[];
}

interface ChatSession {
  id: number;
  title: string;
  createdAt: string;
  updatedAt: string;
  _count: { messages: number };
}

interface RAGStatus {
  indexed: boolean;
  documentCount: number;
  lastUpdated: string | null;
}

const SUGGESTION_PROMPTS = [
  { icon: BarChart3, title: "Analisis Penjualan", prompt: "Tolong analisis detail penjualan 30 hari terakhir. Apa tren yang terlihat?", color: "from-blue-500 to-indigo-500" },
  { icon: Package, title: "Status Inventori", prompt: "Bagaimana status stok bahan baku? Mana yang perlu segera dibeli?", color: "from-emerald-500 to-teal-500" },
  { icon: DollarSign, title: "Optimasi Profit", prompt: "Berikan saran konkret untuk meningkatkan profit margin bisnis saya", color: "from-amber-500 to-orange-500" },
  { icon: TrendingUp, title: "Produk Terlaris", prompt: "Analisis produk terlaris dan berikan strategi untuk memaksimalkan penjualannya", color: "from-violet-500 to-purple-500" },
  { icon: Target, title: "Prediksi Demand", prompt: "Prediksi demand produk untuk minggu depan berdasarkan data penjualan", color: "from-rose-500 to-pink-500" },
  { icon: Utensils, title: "Rekomendasi Menu", prompt: "Berikan rekomendasi menu baru yang potensial berdasarkan bahan yang tersedia", color: "from-cyan-500 to-blue-500" },
  { icon: AlertTriangle, title: "Analisis Risiko", prompt: "Identifikasi risiko bisnis saat ini dan berikan strategi mitigasinya", color: "from-red-500 to-rose-500" },
  { icon: DollarSign, title: "Strategi Harga", prompt: "Evaluasi strategi harga produk saya dan berikan saran penyesuaian", color: "from-lime-500 to-green-500" },
];

const SOURCE_ICONS: Record<string, { icon: typeof Package; label: string; color: string }> = {
  product: { icon: Package, label: "Produk", color: "bg-blue-50 text-blue-600 border-blue-200" },
  ingredient: { icon: Package, label: "Bahan", color: "bg-green-50 text-green-600 border-green-200" },
  sale: { icon: DollarSign, label: "Penjualan", color: "bg-amber-50 text-amber-600 border-amber-200" },
  sale_detail: { icon: FileText, label: "Detail Penjualan", color: "bg-amber-50 text-amber-600 border-amber-200" },
  bakery_order: { icon: FileText, label: "Bakery Order", color: "bg-orange-50 text-orange-600 border-orange-200" },
  production_batch: { icon: Factory, label: "Produksi", color: "bg-violet-50 text-violet-600 border-violet-200" },
  recipe: { icon: Utensils, label: "Resep", color: "bg-purple-50 text-purple-600 border-purple-200" },
  metric: { icon: BarChart3, label: "Metrik", color: "bg-indigo-50 text-indigo-600 border-indigo-200" },
  health: { icon: AlertTriangle, label: "Kesehatan", color: "bg-red-50 text-red-600 border-red-200" },
  inventory_batch: { icon: Package, label: "Stok Batch", color: "bg-teal-50 text-teal-600 border-teal-200" },
  inventory_movement: { icon: TrendingUp, label: "Pergerakan Stok", color: "bg-cyan-50 text-cyan-600 border-cyan-200" },
  debt: { icon: FileText, label: "Kasbon", color: "bg-orange-50 text-orange-600 border-orange-200" },
  category: { icon: FileText, label: "Kategori", color: "bg-gray-50 text-gray-600 border-gray-200" },
  business: { icon: BarChart3, label: "Bisnis", color: "bg-slate-50 text-slate-600 border-slate-200" },
  pdf_document: { icon: FileText, label: "Dokumen PDF", color: "bg-red-50 text-red-600 border-red-200" },
};

export default function AIChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentSession, setCurrentSession] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingSources, setStreamingSources] = useState<SourceRef[]>([]);
  const [showSidebar, setShowSidebar] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sessionsQuery = useApiQuery<{ success?: boolean; sessions?: ChatSession[] }>(
    aiSessionsUrl,
    { ttlMs: API_CACHE_TTL_5_MIN_MS },
  );
  const ragStatusQuery = useApiQuery<{ success?: boolean } & RAGStatus>(
    aiRagIndexUrl,
    { ttlMs: API_CACHE_TTL_5_MIN_MS },
  );
  const historyQuery = useApiQuery<{
    success?: boolean;
    messages?: Array<{ id: number; role: string; content: string; createdAt: string }>;
  }>(
    currentSession ? aiChatHistoryUrl(currentSession) : null,
    { ttlMs: API_CACHE_TTL_5_MIN_MS },
  );
  const sessions = sessionsQuery.data?.sessions ?? [];
  const ragStatus = useMemo<RAGStatus | null>(
    () =>
      ragStatusQuery.data
        ? {
            indexed: Boolean(ragStatusQuery.data.indexed),
            documentCount: Number(ragStatusQuery.data.documentCount ?? 0),
            lastUpdated: ragStatusQuery.data.lastUpdated ?? null,
          }
        : null,
    [ragStatusQuery.data],
  );

  const scrollToBottom = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (messages.length === 0 && !streamingContent) return;
    scrollToBottom();
  }, [messages.length, streamingContent, scrollToBottom]);

  useEffect(() => {
    if (!currentSession || !historyQuery.data?.success) return;
    setMessages(
      (historyQuery.data.messages ?? []).map((m) => ({
        id: m.id.toString(),
        role: m.role as "user" | "assistant",
        content: m.content,
        timestamp: new Date(m.createdAt),
      })),
    );
  }, [currentSession, historyQuery.data]);

  // ─── RAG Status ───
  const handleSyncData = async () => {
    setIndexing(true);
    try {
      const res = await fetch("/api/ai/rag/index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        invalidateAiRagStatusCaches();
        invalidateAiInsightsCaches();
        await ragStatusQuery.refresh({ force: true });
      }
    } catch { /* ignore */ }
    finally { setIndexing(false); }
  };

  // ─── Sessions ───
  const loadSession = async (sessionId: number) => {
    setCurrentSession(sessionId);
    setShowSidebar(false);
  };

  const createNewChat = () => {
    setMessages([]);
    setCurrentSession(null);
    setStreamingContent("");
    setStreamingSources([]);
    setShowSidebar(false);
  };

  const deleteSession = async (sessionId: number) => {
    try {
      await fetch(`/api/ai/sessions?id=${sessionId}`, { method: "DELETE" });
      if (currentSession === sessionId) {
        setMessages([]);
        setCurrentSession(null);
      }
      invalidateAiChatCaches(sessionId);
      await sessionsQuery.refresh({ force: true });
    } catch { /* ignore */ }
  };

  // ─── Send Message ───
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setStreamingContent("");
    setStreamingSources([]);

    // Auto-create session if needed
    let sessionId = currentSession;
    if (!sessionId) {
      try {
        const res = await fetch("/api/ai/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Percakapan Baru" }),
        });
        const data = await res.json();
        if (data.success) {
          sessionId = data.session.id;
          setCurrentSession(sessionId);
          invalidateAiChatCaches(sessionId);
          void sessionsQuery.refresh({ force: true });
        }
      } catch { /* ignore */ }
    }

    try {
      const allMessages = [...messages, userMessage].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: allMessages,
          sessionId,
          stream: true,
        }),
      });

      if (!response.ok) throw new Error("Failed");

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader");

      const decoder = new TextDecoder();
      let fullContent = "";
      let capturedSources: SourceRef[] = [];
      let streamBuffer = "";
      let streamError: string | null = null;

      const processSSEEvent = (eventBlock: string) => {
        const dataLines = eventBlock
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.startsWith("data:"));

        for (const line of dataLines) {
          const payload = line.slice(5).trim();
          if (!payload) continue;

          let data: unknown;
          try {
            data = JSON.parse(payload);
          } catch {
            continue;
          }

          const parsed = data as {
            type?: string;
            sources?: SourceRef[];
            done?: boolean;
            error?: string;
            content?: string;
          };

          if (parsed.type === "sources" && Array.isArray(parsed.sources)) {
            capturedSources = parsed.sources;
            setStreamingSources(capturedSources);
            continue;
          }
          if (parsed.error) {
            streamError = parsed.error;
            return;
          }
          if (parsed.done) {
            return;
          }
          if (typeof parsed.content === "string" && parsed.content.length > 0) {
            fullContent += parsed.content;
            setStreamingContent(fullContent);
          }
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        streamBuffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");

        let separatorIdx = streamBuffer.indexOf("\n\n");
        while (separatorIdx !== -1) {
          const eventBlock = streamBuffer.slice(0, separatorIdx).trim();
          streamBuffer = streamBuffer.slice(separatorIdx + 2);

          if (eventBlock) {
            processSSEEvent(eventBlock);
          }
          if (streamError) break;

          separatorIdx = streamBuffer.indexOf("\n\n");
        }

        if (streamError) break;
      }

      // Flush any trailing event that may not end with \n\n
      if (!streamError && streamBuffer.trim()) {
        processSSEEvent(streamBuffer.trim());
      }

      if (streamError) {
        throw new Error(streamError);
      }

      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: fullContent || "Maaf, tidak bisa merespons.",
          timestamp: new Date(),
          sources: capturedSources.length > 0 ? capturedSources : undefined,
        },
      ]);
      setStreamingContent("");
      setStreamingSources([]);
      invalidateAiChatCaches(sessionId);
      void sessionsQuery.refresh({ force: true });
      if (sessionId) {
        void historyQuery.refresh({ force: true });
      }
    } catch {
      try {
        const allMessages = [...messages, userMessage].map((m) => ({
          role: m.role,
          content: m.content,
        }));
        const response = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: allMessages, sessionId }),
        });
        const data = await response.json();
        if (data.success) {
          setMessages((prev) => [
            ...prev,
            {
              id: (Date.now() + 1).toString(),
              role: "assistant",
              content: data.message.content,
              timestamp: new Date(),
              sources: data.sources,
            },
          ]);
          invalidateAiChatCaches(sessionId);
          void sessionsQuery.refresh({ force: true });
          if (sessionId) {
            void historyQuery.refresh({ force: true });
          }
        } else {
          throw new Error(data.error || "Gagal mendapatkan respons AI");
        }
      } catch {
        setMessages((prev) => [
          ...prev,
          { id: (Date.now() + 1).toString(), role: "assistant", content: "Terjadi kesalahan. Silakan coba lagi.", timestamp: new Date() },
        ]);
      }
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, messages, currentSession]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  // ─── Source Badge Component ───
  const SourceBadges = ({ sources }: { sources: SourceRef[] }) => {
    if (!sources || sources.length === 0) return null;
    const uniqueTypes = [...new Set(sources.map((s) => s.sourceType))];
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="flex flex-wrap items-center gap-1.5 mt-3 pt-2.5 border-t border-gray-100"
      >
        <Paperclip className="w-3 h-3 text-gray-400" />
        <span className="text-[10px] text-gray-400 mr-0.5">Sumber:</span>
        {uniqueTypes.map((type) => {
          const info = SOURCE_ICONS[type] || { icon: FileText, label: type, color: "bg-gray-50 text-gray-600 border-gray-200" };
          const IconComp = info.icon;
          const count = sources.filter((s) => s.sourceType === type).length;
          const bestSim = Math.max(...sources.filter((s) => s.sourceType === type).map((s) => s.similarity));
          return (
            <span
              key={type}
              className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium border ${info.color}`}
              title={`${count} dokumen, relevansi ${(bestSim * 100).toFixed(0)}%`}
            >
              <IconComp className="w-3 h-3" />
              {info.label} ({count})
            </span>
          );
        })}
      </motion.div>
    );
  };

  const formatRelativeTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Baru saja";
    if (mins < 60) return `${mins}m lalu`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}j lalu`;
    const days = Math.floor(hours / 24);
    return `${days}h lalu`;
  };

  return (
    <div className="relative flex flex-col md:flex-row min-h-[500px] sm:min-h-[560px] md:min-h-[640px] md:max-h-[85vh] bg-white/80 backdrop-blur-xl rounded-2xl shadow-xl shadow-gray-200/40 border border-white/60 overflow-hidden">
      {/* ─── Sidebar Overlay ─── */}
      <AnimatePresence>
        {showSidebar && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/10 backdrop-blur-[2px] z-10"
              onClick={() => setShowSidebar(false)}
            />
            <motion.div
              initial={{ x: -300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -300, opacity: 0 }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="absolute left-0 top-0 bottom-0 w-[280px] bg-white/95 backdrop-blur-xl z-20 shadow-2xl flex flex-col border-r border-gray-100"
            >
              {/* Sidebar header */}
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center">
                    <MessageCircle className="w-3.5 h-3.5 text-indigo-600" />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-800">Riwayat Chat</h3>
                </div>
                <button
                  onClick={() => setShowSidebar(false)}
                  className="text-gray-400 hover:text-gray-600 transition p-1.5 rounded-lg hover:bg-gray-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* New chat button */}
              <div className="p-3">
                <motion.button
                  onClick={createNewChat}
                  className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 text-white py-2.5 px-4 rounded-xl hover:shadow-lg hover:shadow-indigo-500/25 transition-all font-medium text-sm flex items-center justify-center gap-2"
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Plus className="w-4 h-4" />
                  Percakapan Baru
                </motion.button>
              </div>

              {/* Session list */}
              <div className="flex-1 overflow-y-auto px-3 space-y-1">
                {sessions.filter((s) => s._count.messages > 0).map((session, i) => (
                  <motion.div
                    key={session.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all ${
                      currentSession === session.id
                        ? "bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-sm"
                        : "hover:bg-gray-50 text-gray-700"
                    }`}
                    onClick={() => loadSession(session.id)}
                  >
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <MessageCircle className={`w-3.5 h-3.5 shrink-0 ${currentSession === session.id ? "text-indigo-500" : "text-gray-400"}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{session.title}</p>
                        <p className="text-[10px] text-gray-400">{session._count.messages} pesan · {formatRelativeTime(session.updatedAt)}</p>
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }}
                      className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition p-1 rounded-md hover:bg-red-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </motion.div>
                ))}
                {sessions.filter((s) => s._count.messages > 0).length === 0 && (
                  <div className="text-center py-10">
                    <MessageCircle className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                    <p className="text-gray-400 text-xs">Belum ada riwayat chat</p>
                  </div>
                )}
              </div>

              {/* Sidebar footer with RAG status */}
              <div className="p-3 border-t border-gray-100 bg-gray-50/60">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${ragStatus?.indexed ? "bg-green-500 animate-pulse" : "bg-gray-300"}`} />
                    <span className="text-[10px] font-medium text-gray-500">
                      {ragStatus?.indexed ? `${ragStatus.documentCount} data tersinkronisasi` : "Belum tersinkronisasi"}
                    </span>
                  </div>
                  <motion.button
                    onClick={handleSyncData}
                    disabled={indexing}
                    className="text-[10px] px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 font-medium text-gray-600 transition flex items-center gap-1 shadow-sm"
                    whileTap={{ scale: 0.95 }}
                  >
                    <RefreshCw className={`w-3 h-3 ${indexing ? "animate-spin" : ""}`} />
                    Sync
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ─── Main Chat Area ─── */}
      <div className="flex-1 flex flex-col min-w-0 justify-between">
        {/* Header */}
        <div className="relative overflow-hidden shrink-0">
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.1),transparent)]" />
          <div className="relative px-4 py-3.5 flex items-center gap-3">
            <motion.button
              onClick={() => setShowSidebar(!showSidebar)}
              className="text-white/80 hover:text-white transition p-1.5 rounded-lg hover:bg-white/10"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Menu className="w-[18px] h-[18px]" />
            </motion.button>
            <div className="relative w-8 h-8 bg-white/20 rounded-full flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-white" />
              <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-400 rounded-full border-2 border-indigo-600" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-white font-semibold text-sm truncate">AI Business Assistant</h2>
                {ragStatus?.indexed && (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-[9px] bg-white/15 text-white/90 px-2 py-0.5 rounded-full font-medium whitespace-nowrap shrink-0 flex items-center gap-1 border border-white/10"
                  >
                    <Sparkles className="w-2.5 h-2.5" />
                    Terhubung
                  </motion.span>
                )}
              </div>
              <p className="text-indigo-200 text-[11px] truncate">
                {ragStatus?.indexed
                  ? `Data bisnis tersinkronisasi · ${ragStatus.documentCount} data terintegrasi`
                  : "AI siap membantu bisnis Anda"}
              </p>
            </div>
            <motion.button
              onClick={handleSyncData}
              disabled={indexing}
              className="text-white/50 hover:text-white text-xs p-2 rounded-lg hover:bg-white/10 transition shrink-0 hidden sm:flex"
              title="Sync data bisnis"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <RefreshCw className={`w-4 h-4 ${indexing ? "animate-spin" : ""}`} />
            </motion.button>
          </div>
        </div>

        {/* Messages */}
        <div
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-5 space-y-4"
          style={{ minHeight: "280px", paddingBottom: "max(76px, env(safe-area-inset-bottom))" }}
        >
          {/* Empty state */}
          {messages.length === 0 && !streamingContent && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 200, damping: 20 }}
              className="text-center py-6 sm:py-8"
            >
              <motion.div
                className="w-16 h-16 bg-gradient-to-br from-indigo-100 to-violet-100 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm"
                animate={{ y: [0, -4, 0] }}
                transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
              >
                <Bot className="w-8 h-8 text-indigo-600" />
              </motion.div>
              <h3 className="text-lg font-bold text-gray-800 mb-1">AI Business Assistant</h3>
              <p className="text-gray-500 text-sm mb-4 max-w-sm mx-auto">
                Tanyakan apa saja tentang bisnis Anda.
              </p>

              {ragStatus?.indexed ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2 }}
                  className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs px-4 py-2 rounded-full mb-6 shadow-sm"
                >
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                  <Brain className="w-3 h-3" />
                  Data bisnis terhubung — {ragStatus.documentCount} data siap dianalisis
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="flex flex-col items-center gap-2.5 mb-6"
                >
                  <span className="text-xs text-yellow-600 bg-yellow-50 border border-yellow-200 px-4 py-2 rounded-full flex items-center gap-1.5 shadow-sm">
                    <AlertTriangle className="w-3 h-3" />
                    Data bisnis belum tersinkronisasi
                  </span>
                  <motion.button
                    onClick={handleSyncData}
                    disabled={indexing}
                    className="text-xs bg-gradient-to-r from-indigo-600 to-violet-600 text-white px-5 py-2 rounded-xl hover:shadow-lg hover:shadow-indigo-500/25 disabled:opacity-50 transition-all flex items-center gap-1.5 font-medium"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <RefreshCw className={`w-3 h-3 ${indexing ? "animate-spin" : ""}`} />
                    {indexing ? "Menyinkronkan..." : "Sinkronkan Data Sekarang"}
                  </motion.button>
                </motion.div>
              )}

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 max-w-2xl mx-auto">
                {SUGGESTION_PROMPTS.map((sp, i) => (
                  <motion.button
                    key={i}
                    onClick={() => sendMessage(sp.prompt)}
                    className="group relative flex flex-col items-center gap-2 p-3.5 bg-white rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all text-center overflow-hidden"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 + i * 0.04 }}
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${sp.color} flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow`}>
                      <sp.icon className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-[11px] font-medium text-gray-600 group-hover:text-gray-800 leading-tight transition-colors">{sp.title}</span>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}

          {/* Message bubbles */}
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 24 }}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div className={`flex items-start gap-2.5 ${msg.role === "user" ? "max-w-[85%]" : "max-w-[90%]"}`}>
                {msg.role === "assistant" && (
                  <div className="w-7 h-7 bg-gradient-to-br from-indigo-100 to-violet-100 rounded-full flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                    <Bot className="w-3.5 h-3.5 text-indigo-600" />
                  </div>
                )}
                <div
                  className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed overflow-hidden ${
                    msg.role === "user"
                      ? "bg-gradient-to-br from-indigo-600 to-violet-600 text-white rounded-br-sm shadow-md shadow-indigo-500/20"
                      : "bg-white text-gray-700 border border-gray-100 rounded-bl-sm shadow-sm"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <>
                      <MarkdownRenderer content={msg.content} />
                      {msg.sources && <SourceBadges sources={msg.sources} />}
                    </>
                  ) : (
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="w-7 h-7 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-full flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                    <User className="w-3.5 h-3.5 text-white" />
                  </div>
                )}
              </div>
            </motion.div>
          ))}

          {/* Streaming content */}
          {streamingContent && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-start"
            >
              <div className="flex items-start gap-2.5 max-w-[90%]">
                <div className="w-7 h-7 bg-gradient-to-br from-indigo-100 to-violet-100 rounded-full flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                  <Bot className="w-3.5 h-3.5 text-indigo-600" />
                </div>
                <div className="rounded-2xl px-4 py-2.5 text-sm leading-relaxed bg-white text-gray-700 border border-gray-100 rounded-bl-sm shadow-sm overflow-hidden">
                  <MarkdownRenderer content={streamingContent} />
                  <span className="inline-block w-1.5 h-4 bg-gradient-to-b from-indigo-500 to-violet-500 rounded-full animate-pulse ml-0.5" />
                  {streamingSources.length > 0 && <SourceBadges sources={streamingSources} />}
                </div>
              </div>
            </motion.div>
          )}

          {/* Loading indicator */}
          {isLoading && !streamingContent && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-start"
            >
              <div className="flex items-start gap-2.5">
                <div className="w-7 h-7 bg-gradient-to-br from-indigo-100 to-violet-100 rounded-full flex items-center justify-center shrink-0 shadow-sm">
                  <Bot className="w-3.5 h-3.5 text-indigo-600" />
                </div>
                <div className="bg-white rounded-2xl px-4 py-3 border border-gray-100 shadow-sm">
                  <div className="flex items-center gap-2.5">
                    <div className="flex gap-1">
                      <motion.div className="w-1.5 h-1.5 bg-indigo-400 rounded-full" animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 0.8, delay: 0 }} />
                      <motion.div className="w-1.5 h-1.5 bg-violet-400 rounded-full" animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 0.8, delay: 0.15 }} />
                      <motion.div className="w-1.5 h-1.5 bg-purple-400 rounded-full" animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 0.8, delay: 0.3 }} />
                    </div>
                    <span className="text-[11px] text-gray-400">Sedang menganalisis...</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div
          className="p-3 md:p-4 border-t border-gray-100 bg-white/80 backdrop-blur-sm shrink-0"
          style={{ position: "sticky", bottom: 0, zIndex: 10, paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Tanyakan tentang bisnis Anda..."
              rows={1}
              className="flex-1 resize-none rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 max-h-28 text-black placeholder-gray-400 bg-white/80"
              disabled={isLoading}
            />
            <motion.button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isLoading}
              className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white p-2.5 rounded-xl hover:shadow-lg hover:shadow-indigo-500/25 disabled:from-gray-300 disabled:to-gray-300 disabled:shadow-none disabled:cursor-not-allowed transition-all shrink-0"
              whileHover={{ scale: !input.trim() || isLoading ? 1 : 1.05 }}
              whileTap={{ scale: !input.trim() || isLoading ? 1 : 0.95 }}
            >
              <Send className="w-[18px] h-[18px]" />
            </motion.button>
          </div>
          <div className="flex items-center justify-center gap-1.5 mt-2">
            <Database className="w-3 h-3 text-gray-300" />
            <p className="text-[9px] text-gray-400">
              AI menganalisis data bisnis Anda secara real-time
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

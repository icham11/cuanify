"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle,
  X,
  Send,
  Trash2,
  BarChart3,
  Package,
  Lightbulb,
  Trophy,
  History,
  Plus,
  ChevronLeft,
  Bot,
  User,
  RefreshCw,
  Paperclip,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Upload,
  Sparkles,
} from "lucide-react";
import MarkdownRenderer from "./MarkdownRenderer";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface ChatSession {
  id: number;
  title: string;
  updatedAt: string;
  _count: { messages: number };
}

const QUICK_PROMPTS = [
  {
    icon: BarChart3,
    label: "Analisis Penjualan",
    prompt: "Berikan analisis penjualan 30 hari terakhir",
    color: "from-blue-500 to-indigo-500",
  },
  {
    icon: Package,
    label: "Cek Stok",
    prompt: "Bagaimana status stok bahan baku saat ini?",
    color: "from-emerald-500 to-teal-500",
  },
  {
    icon: Lightbulb,
    label: "Saran Bisnis",
    prompt: "Berikan saran untuk meningkatkan profit bisnis saya",
    color: "from-amber-500 to-orange-500",
  },
  {
    icon: Trophy,
    label: "Top Produk",
    prompt: "Apa saja produk terlaris bulan ini?",
    color: "from-violet-500 to-purple-500",
  },
];

export default function AIChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<"chat" | "history">("chat");
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Sync & Upload state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"idle" | "success" | "error">("idle");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [showUploadArea, setShowUploadArea] = useState(false);
  const fileInputRef2 = useRef<HTMLInputElement>(null);

  // ─── Modal detection (hide widget when any modal overlay is open) ───
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const checkForModals = () => {
      // Matches any fixed full-screen backdrop (modal overlays)
      setIsModalOpen(!!document.querySelector("div.fixed.inset-0"));
    };
    const observer = new MutationObserver(checkForModals);
    observer.observe(document.body, { childList: true, subtree: true });
    checkForModals();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (isModalOpen) setIsOpen(false);
  }, [isModalOpen]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent, scrollToBottom]);

  useEffect(() => {
    if (isOpen && view === "chat") {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen, view]);

  // ─── Sessions ───
  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/sessions");
      const data = await res.json();
      if (data.success) setSessions(data.sessions ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (isOpen) fetchSessions();
  }, [isOpen, fetchSessions]);

  const loadSession = useCallback(async (sessionId: number) => {
    setCurrentSessionId(sessionId);
    setView("chat");
    try {
      const res = await fetch(`/api/ai/chat?sessionId=${sessionId}`);
      const data = await res.json();
      if (data.success) {
        setMessages(
          data.messages.map((m: { id: number; role: string; content: string; createdAt: string }) => ({
            id: m.id.toString(),
            role: m.role as "user" | "assistant",
            content: m.content,
            timestamp: new Date(m.createdAt),
          })),
        );
      }
    } catch {
      /* ignore */
    }
  }, []);

  const startNewChat = useCallback(() => {
    setMessages([]);
    setStreamingContent("");
    setCurrentSessionId(null);
    setView("chat");
    setTimeout(() => inputRef.current?.focus(), 200);
  }, []);

  const deleteSession = useCallback(
    async (sessionId: number) => {
      try {
        await fetch(`/api/ai/sessions?id=${sessionId}`, { method: "DELETE" });
        if (currentSessionId === sessionId) {
          setMessages([]);
          setCurrentSessionId(null);
        }
        fetchSessions();
      } catch {
        /* ignore */
      }
    },
    [currentSessionId, fetchSessions],
  );

  // ─── RAG Sync ───
  const handleSync = useCallback(async () => {
    setIsSyncing(true);
    setSyncStatus("idle");
    try {
      const res = await fetch("/api/ai/rag/index", { method: "POST" });
      if (!res.ok) throw new Error("Sync failed");
      setSyncStatus("success");
      setTimeout(() => setSyncStatus("idle"), 3000);
    } catch {
      setSyncStatus("error");
      setTimeout(() => setSyncStatus("idle"), 3000);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  // ─── PDF Upload ───
  const handleFileUpload = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setUploadStatus({ type: "error", message: "Hanya file PDF yang didukung" });
      setTimeout(() => setUploadStatus(null), 3000);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadStatus({ type: "error", message: "Ukuran file maks 10MB" });
      setTimeout(() => setUploadStatus(null), 3000);
      return;
    }

    setIsUploading(true);
    setUploadStatus(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/ai/rag/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Gagal mengunggah");

      setUploadStatus({ type: "success", message: `"${file.name}" berhasil diproses (${data.chunksCreated} bagian)` });
      setShowUploadArea(false);
      setTimeout(() => setUploadStatus(null), 5000);
    } catch (err) {
      setUploadStatus({ type: "error", message: err instanceof Error ? err.message : "Gagal mengunggah" });
      setTimeout(() => setUploadStatus(null), 5000);
    } finally {
      setIsUploading(false);
      if (fileInputRef2.current) fileInputRef2.current.value = "";
    }
  }, []);

  const handleWidgetDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setShowUploadArea(false);
      const files = e.dataTransfer.files;
      if (files?.[0]) handleFileUpload(files[0]);
    },
    [handleFileUpload],
  );

  // ─── Send Message ───
  const sendMessage = useCallback(
    async (text: string) => {
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

      let sessionId = currentSessionId;
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
            setCurrentSessionId(sessionId);
          }
        } catch {
          /* ignore */
        }
      }

      try {
        const allMessages = [...messages, userMessage].map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const response = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: allMessages, sessionId, stream: true }),
        });

        if (!response.ok) throw new Error("Failed to get response");

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No reader");

        const decoder = new TextDecoder();
        let fullContent = "";
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
              done?: boolean;
              error?: string;
              content?: string;
            };

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
            content: fullContent || "Maaf, saya tidak bisa memberikan respons.",
            timestamp: new Date(),
          },
        ]);
        setStreamingContent("");
        fetchSessions();
      } catch {
        try {
          const allMessages = [...messages, userMessage].map((m) => ({ role: m.role, content: m.content }));
          const response = await fetch("/api/ai/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: allMessages, sessionId, stream: false }),
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
              },
            ]);
            fetchSessions();
          } else {
            throw new Error(data.error);
          }
        } catch {
          setMessages((prev) => [
            ...prev,
            {
              id: (Date.now() + 1).toString(),
              role: "assistant",
              content: "Maaf, terjadi kesalahan. Silakan coba lagi.",
              timestamp: new Date(),
            },
          ]);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, messages, currentSessionId, fetchSessions],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
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
    <>
      {/* ─── Floating Button ─── */}
      <AnimatePresence>
        {!isModalOpen && (
          <motion.button
            onClick={() => setIsOpen(!isOpen)}
            className="fixed bottom-24 md:bottom-6 right-4 md:right-6 z-40 w-12 h-12 md:w-14 md:h-14 rounded-full shadow-lg flex items-center justify-center text-white hover:shadow-xl transition-shadow"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1, rotate: isOpen ? 180 : 0 }}
            exit={{ opacity: 0, scale: 0.8 }}
            style={{
              background: "linear-gradient(135deg, #6366f1, #8b5cf6, #a855f7)",
              boxShadow: isOpen ? "0 8px 25px rgba(99, 102, 241, 0.3)" : "0 4px 15px rgba(99, 102, 241, 0.25)",
            }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
          >
            <AnimatePresence mode="wait">
              {isOpen ? (
                <motion.div
                  key="close"
                  initial={{ opacity: 0, rotate: -90 }}
                  animate={{ opacity: 1, rotate: 0 }}
                  exit={{ opacity: 0, rotate: 90 }}
                  transition={{ duration: 0.15 }}
                >
                  <X className="w-5 h-5" />
                </motion.div>
              ) : (
                <motion.div
                  key="open"
                  initial={{ opacity: 0, rotate: 90 }}
                  animate={{ opacity: 1, rotate: 0 }}
                  exit={{ opacity: 0, rotate: -90 }}
                  transition={{ duration: 0.15 }}
                >
                  <MessageCircle className="w-5 h-5" />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.button>
        )}
      </AnimatePresence>

      {/* ─── Chat Panel ─── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.92 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="fixed bottom-40 md:bottom-24 right-3 md:right-6 z-40 w-[calc(100vw-24px)] sm:w-100 h-[60vh] md:h-150 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/60 flex flex-col overflow-hidden"
            style={{ boxShadow: "0 25px 50px -12px rgba(99, 102, 241, 0.15), 0 12px 24px -8px rgba(0, 0, 0, 0.1)" }}
            onDragOver={(e) => {
              e.preventDefault();
              if (view === "chat") setShowUploadArea(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setShowUploadArea(false);
            }}
            onDrop={handleWidgetDrop}
          >
            {/* ─── Header ─── */}
            <div className="relative overflow-hidden shrink-0">
              <div className="absolute inset-0 bg-linear-to-r from-indigo-600 via-violet-600 to-purple-600" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(255,255,255,0.12),transparent)]" />
              <div className="relative px-4 py-3 flex items-center gap-3">
                {view === "history" ? (
                  <motion.button
                    onClick={() => setView("chat")}
                    className="text-white/80 hover:text-white transition p-1"
                    whileHover={{ x: -2 }}
                    whileTap={{ scale: 0.9 }}
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </motion.button>
                ) : (
                  <div className="relative w-8 h-8 bg-white/20 rounded-full flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 text-white" />
                    <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-400 rounded-full border-2 border-indigo-600" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="text-white font-semibold text-sm truncate">
                    {view === "history" ? "Riwayat Chat" : "AI Assistant"}
                  </h3>
                  <p className="text-indigo-200 text-[11px] truncate">
                    {view === "history"
                      ? `${sessions.filter((s) => s._count.messages > 0).length} percakapan`
                      : "Siap membantu analisis bisnis Anda"}
                  </p>
                </div>
                <div className="flex items-center gap-0.5">
                  {view === "chat" && (
                    <>
                      {/* Sync */}
                      <motion.button
                        onClick={handleSync}
                        disabled={isSyncing}
                        className="relative text-white/60 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition"
                        title="Sinkronkan data bisnis ke AI"
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                      >
                        <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
                        <AnimatePresence>
                          {syncStatus === "success" && (
                            <motion.span
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              exit={{ scale: 0 }}
                              className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-green-400 rounded-full border border-purple-600"
                            />
                          )}
                          {syncStatus === "error" && (
                            <motion.span
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              exit={{ scale: 0 }}
                              className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-400 rounded-full border border-purple-600"
                            />
                          )}
                        </AnimatePresence>
                      </motion.button>
                      {/* History */}
                      <motion.button
                        onClick={() => {
                          fetchSessions();
                          setView("history");
                        }}
                        className="text-white/60 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition"
                        title="Riwayat chat"
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                      >
                        <History className="w-4 h-4" />
                      </motion.button>
                      {/* New chat */}
                      <motion.button
                        onClick={startNewChat}
                        className="text-white/60 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition"
                        title="Chat baru"
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                      >
                        <Plus className="w-4 h-4" />
                      </motion.button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* ─── Status banners ─── */}
            <AnimatePresence>
              {(isSyncing || syncStatus !== "idle" || uploadStatus) && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
                  className="shrink-0 overflow-hidden"
                >
                  {isSyncing && (
                    <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50/80 text-indigo-700 text-xs border-b border-indigo-100/50">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span className="font-medium">Menyinkronkan data bisnis...</span>
                    </div>
                  )}
                  {!isSyncing && syncStatus === "success" && (
                    <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50/80 text-emerald-700 text-xs border-b border-emerald-100/50">
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span className="font-medium">Data bisnis berhasil disinkronkan</span>
                    </div>
                  )}
                  {!isSyncing && syncStatus === "error" && (
                    <div className="flex items-center gap-2 px-4 py-2 bg-red-50/80 text-red-700 text-xs border-b border-red-100/50">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span className="font-medium">Gagal sinkronkan data</span>
                    </div>
                  )}
                  {uploadStatus && (
                    <div
                      className={`flex items-center gap-2 px-4 py-2 text-xs border-b ${
                        uploadStatus.type === "success"
                          ? "bg-emerald-50/80 text-emerald-700 border-emerald-100/50"
                          : "bg-red-50/80 text-red-700 border-red-100/50"
                      }`}
                    >
                      {uploadStatus.type === "success" ? (
                        <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span className="truncate font-medium">{uploadStatus.message}</span>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* ─── Drag & drop overlay ─── */}
            <AnimatePresence>
              {showUploadArea && view === "chat" && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl"
                  style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.92), rgba(139,92,246,0.92))" }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleWidgetDrop}
                >
                  <motion.div animate={{ y: [0, -8, 0] }} transition={{ repeat: Infinity, duration: 1.5 }}>
                    <Upload className="w-12 h-12 text-white mb-3" />
                  </motion.div>
                  <p className="text-white font-semibold text-sm">Lepaskan file PDF di sini</p>
                  <p className="text-indigo-200 text-xs mt-1">File akan diproses untuk AI</p>
                  <button
                    onClick={() => setShowUploadArea(false)}
                    className="absolute top-4 right-4 text-white/60 hover:text-white transition"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Hidden file input */}
            <input
              ref={fileInputRef2}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
              }}
            />

            {/* ─── History View ─── */}
            {view === "history" && (
              <div className="flex-1 overflow-y-auto">
                <div className="p-3">
                  <motion.button
                    onClick={startNewChat}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-white rounded-xl text-sm font-medium"
                    style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
                    whileHover={{ scale: 1.01, boxShadow: "0 4px 15px rgba(99,102,241,0.25)" }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Plus className="w-4 h-4" />
                    Percakapan Baru
                  </motion.button>
                </div>
                <div className="px-3 pb-3 space-y-1">
                  {sessions
                    .filter((s) => s._count.messages > 0)
                    .map((session, i) => (
                      <motion.div
                        key={session.id}
                        initial={{ opacity: 0, x: -15 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all ${
                          currentSessionId === session.id
                            ? "bg-indigo-50 border border-indigo-200 shadow-sm"
                            : "hover:bg-gray-50"
                        }`}
                        onClick={() => loadSession(session.id)}
                      >
                        <MessageCircle
                          className={`w-4 h-4 shrink-0 ${currentSessionId === session.id ? "text-indigo-500" : "text-gray-400"}`}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{session.title}</p>
                          <p className="text-[10px] text-gray-400">
                            {session._count.messages} pesan · {formatRelativeTime(session.updatedAt)}
                          </p>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSession(session.id);
                          }}
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
              </div>
            )}

            {/* ─── Chat View ─── */}
            {view === "chat" && (
              <>
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-linear-to-b from-gray-50/50 to-white">
                  {/* Empty state */}
                  {messages.length === 0 && !streamingContent && (
                    <motion.div
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ type: "spring", stiffness: 200, damping: 20 }}
                      className="text-center py-8"
                    >
                      <motion.div
                        className="w-14 h-14 bg-linear-to-br from-indigo-100 to-violet-100 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-sm"
                        animate={{ y: [0, -3, 0] }}
                        transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
                      >
                        <Sparkles className="w-7 h-7 text-indigo-600" />
                      </motion.div>
                      <h4 className="font-bold text-gray-700 text-sm mb-1">Halo! Saya AI Assistant</h4>
                      <p className="text-xs text-gray-500 mb-5">Tanyakan apa saja tentang bisnis Anda</p>
                      <div className="grid grid-cols-2 gap-2">
                        {QUICK_PROMPTS.map((qp, i) => (
                          <motion.button
                            key={i}
                            onClick={() => sendMessage(qp.prompt)}
                            className="group flex items-center gap-2.5 p-3 bg-white rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all text-left text-xs overflow-hidden"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 + i * 0.05 }}
                            whileHover={{ y: -1 }}
                            whileTap={{ scale: 0.97 }}
                          >
                            <div
                              className={`w-7 h-7 rounded-lg bg-linear-to-br ${qp.color} flex items-center justify-center shrink-0 shadow-sm group-hover:shadow transition-shadow`}
                            >
                              <qp.icon className="w-3.5 h-3.5 text-white" />
                            </div>
                            <span className="text-gray-600 group-hover:text-gray-800 font-medium leading-tight transition-colors">
                              {qp.label}
                            </span>
                          </motion.button>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {/* Messages */}
                  {messages.map((msg) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ type: "spring", stiffness: 260, damping: 24 }}
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div className={`flex items-end gap-2 ${msg.role === "user" ? "max-w-[85%]" : "max-w-[90%]"}`}>
                        {msg.role === "assistant" && (
                          <div className="w-6 h-6 bg-linear-to-br from-indigo-100 to-violet-100 rounded-full flex items-center justify-center shrink-0 mb-0.5 shadow-sm">
                            <Bot className="w-3.5 h-3.5 text-indigo-600" />
                          </div>
                        )}
                        <div
                          className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                            msg.role === "user"
                              ? "text-white rounded-br-md shadow-md"
                              : "bg-white text-gray-700 border border-gray-100 rounded-bl-md shadow-sm"
                          }`}
                          style={
                            msg.role === "user"
                              ? { background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }
                              : undefined
                          }
                        >
                          {msg.role === "assistant" ? <MarkdownRenderer content={msg.content} /> : msg.content}
                        </div>
                        {msg.role === "user" && (
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mb-0.5 shadow-sm"
                            style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
                          >
                            <User className="w-3.5 h-3.5 text-white" />
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}

                  {/* Streaming */}
                  {streamingContent && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex justify-start"
                    >
                      <div className="flex items-end gap-2 max-w-[90%]">
                        <div className="w-6 h-6 bg-linear-to-br from-indigo-100 to-violet-100 rounded-full flex items-center justify-center shrink-0 mb-0.5 shadow-sm">
                          <Bot className="w-3.5 h-3.5 text-indigo-600" />
                        </div>
                        <div className="rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed bg-white text-gray-700 border border-gray-100 rounded-bl-md shadow-sm">
                          <MarkdownRenderer content={streamingContent} />
                          <span className="inline-block w-1.5 h-4 bg-linear-to-b from-indigo-500 to-violet-500 rounded-full animate-pulse ml-0.5" />
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Loading dots */}
                  {isLoading && !streamingContent && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex justify-start"
                    >
                      <div className="flex items-end gap-2">
                        <div className="w-6 h-6 bg-linear-to-br from-indigo-100 to-violet-100 rounded-full flex items-center justify-center shrink-0 shadow-sm">
                          <Bot className="w-3.5 h-3.5 text-indigo-600" />
                        </div>
                        <div className="bg-white rounded-2xl px-4 py-3 border border-gray-100 shadow-sm">
                          <div className="flex gap-1">
                            <motion.div
                              className="w-1.5 h-1.5 bg-indigo-400 rounded-full"
                              animate={{ y: [0, -5, 0] }}
                              transition={{ repeat: Infinity, duration: 0.7, delay: 0 }}
                            />
                            <motion.div
                              className="w-1.5 h-1.5 bg-violet-400 rounded-full"
                              animate={{ y: [0, -5, 0] }}
                              transition={{ repeat: Infinity, duration: 0.7, delay: 0.15 }}
                            />
                            <motion.div
                              className="w-1.5 h-1.5 bg-purple-400 rounded-full"
                              animate={{ y: [0, -5, 0] }}
                              transition={{ repeat: Infinity, duration: 0.7, delay: 0.3 }}
                            />
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  <div ref={messagesEndRef} />
                </div>

                {/* Upload progress */}
                <AnimatePresence>
                  {isUploading && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="shrink-0 overflow-hidden border-t border-gray-100"
                    >
                      <div className="flex items-center gap-2.5 px-4 py-2.5 bg-indigo-50/80">
                        <Loader2 className="w-4 h-4 text-indigo-600 animate-spin shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-indigo-700 font-medium">Memproses PDF...</p>
                          <p className="text-[10px] text-indigo-500">Mengekstrak teks & membuat embedding</p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* ─── Input area ─── */}
                <div className="p-3 border-t border-gray-100 bg-white/90 backdrop-blur-sm shrink-0">
                  <div className="flex gap-2 items-end">
                    <motion.button
                      onClick={() => fileInputRef2.current?.click()}
                      disabled={isUploading}
                      className="shrink-0 p-2.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition disabled:opacity-50"
                      title="Upload dokumen PDF untuk AI"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.9 }}
                    >
                      <Paperclip className="w-4 h-4" />
                    </motion.button>
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Ketik pesan..."
                      rows={1}
                      className="flex-1 resize-none rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 max-h-24 text-black placeholder-gray-400 bg-white/80"
                      disabled={isLoading}
                    />
                    <motion.button
                      onClick={() => sendMessage(input)}
                      disabled={!input.trim() || isLoading}
                      className="text-white p-2.5 rounded-xl disabled:bg-gray-300 disabled:cursor-not-allowed transition-all shrink-0"
                      style={
                        !input.trim() || isLoading
                          ? { background: "#d1d5db" }
                          : {
                              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                              boxShadow: "0 2px 8px rgba(99,102,241,0.25)",
                            }
                      }
                      whileHover={{ scale: !input.trim() || isLoading ? 1 : 1.05 }}
                      whileTap={{ scale: !input.trim() || isLoading ? 1 : 0.92 }}
                    >
                      <Send className="w-4 h-4" />
                    </motion.button>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1.5 text-center">
                    AI menganalisis data bisnis Anda secara real-time
                  </p>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

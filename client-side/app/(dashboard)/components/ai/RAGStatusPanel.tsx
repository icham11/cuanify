"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";

interface IndexStatus {
  indexed: boolean;
  documentCount: number;
  lastUpdated: string | null;
}

interface SearchResultItem {
  sourceType: string;
  similarity: number;
  content: string;
}

export default function RAGStatusPanel() {
  const [status, setStatus] = useState<IndexStatus | null>(null);
  const [indexing, setIndexing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [searching, setSearching] = useState(false);

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/rag/index");
      const data = await res.json();
      if (data.success) {
        setStatus({
          indexed: data.indexed,
          documentCount: data.documentCount,
          lastUpdated: data.lastUpdated,
        });
      }
    } catch (err) {
      console.error("Failed to check RAG status:", err);
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const handleIndex = async () => {
    setIndexing(true);
    setResult(null);
    try {
      const res = await fetch("/api/ai/rag/index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        setResult(data.message || `✅ Sync selesai`);
        await checkStatus();
      } else {
        setResult(`❌ Error: ${data.error}`);
      }
    } catch (err) {
      setResult(`❌ Gagal: ${err instanceof Error ? err.message : "Unknown"}`);
    } finally {
      setIndexing(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchResults([]);
    try {
      const res = await fetch("/api/ai/rag/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery, topK: 5 }),
      });
      const data = await res.json();
      if (data.success) {
        setSearchResults(data.results);
      }
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setSearching(false);
    }
  };

  const sourceColors: Record<string, string> = {
    product: "bg-blue-100 text-blue-800",
    ingredient: "bg-green-100 text-green-800",
    sale: "bg-yellow-100 text-yellow-800",
    sale_detail: "bg-yellow-50 text-yellow-700",
    recipe: "bg-purple-100 text-purple-800",
    metric: "bg-indigo-100 text-indigo-800",
    health: "bg-red-100 text-red-800",
    debt: "bg-amber-100 text-amber-800",
    debt_payment: "bg-amber-50 text-amber-700",
    inventory_batch: "bg-teal-100 text-teal-800",
    inventory_movement: "bg-cyan-100 text-cyan-800",
    stock_document: "bg-gray-100 text-gray-800",
    product_metrics: "bg-rose-100 text-rose-800",
    forecast: "bg-violet-100 text-violet-800",
    category: "bg-lime-100 text-lime-800",
    business: "bg-slate-100 text-slate-800",
  };

  const sourceEmoji: Record<string, string> = {
    product: "📦",
    ingredient: "🧂",
    sale: "💰",
    sale_detail: "🧾",
    recipe: "📋",
    metric: "📊",
    health: "🏥",
    debt: "📒",
    debt_payment: "💳",
    inventory_batch: "📦",
    inventory_movement: "🔄",
    stock_document: "📄",
    product_metrics: "📈",
    forecast: "🔮",
    category: "🏷️",
    business: "🏪",
  };

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
        <div className="bg-linear-to-r from-emerald-600 to-teal-600 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🧠</span>
            <div>
              <h2 className="text-white font-bold text-lg">RAG Vector Store</h2>
              <p className="text-emerald-200 text-xs">
                Retrieval-Augmented Generation — Pencarian semantik data bisnis
              </p>
            </div>
          </div>
          <button
            onClick={handleIndex}
            disabled={indexing}
            className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50"
          >
            {indexing ? "⏳ Mengindeks..." : "🔄 Index Ulang"}
          </button>
        </div>

        {/* Status Cards */}
        <div className="p-6">
          <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-4">
            <div className="bg-gray-50 rounded-xl p-3 sm:p-4 text-center">
              <div className={`text-2xl sm:text-3xl font-bold ${status?.indexed ? "text-green-600" : "text-red-500"}`}>
                {status?.indexed ? "✅" : "❌"}
              </div>
              <div className="text-[10px] sm:text-xs text-gray-500 mt-1 font-medium">
                {status?.indexed ? "Terindeks" : "Belum Terindeks"}
              </div>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 sm:p-4 text-center">
              <div className="text-2xl sm:text-3xl font-bold text-indigo-600">{status?.documentCount || 0}</div>
              <div className="text-xs text-gray-500 mt-1 font-medium">Dokumen Vektor</div>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 text-center">
              <div className="text-sm font-medium text-gray-700">
                {status?.lastUpdated
                  ? new Date(status.lastUpdated).toLocaleString("id-ID", {
                      timeZone: "Asia/Jakarta",
                      hour: "2-digit",
                      minute: "2-digit",
                      day: "numeric",
                      month: "short",
                    })
                  : "—"}
              </div>
              <div className="text-xs text-gray-500 mt-1 font-medium">Terakhir Update</div>
            </div>
          </div>

          {/* How it works */}
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-sm text-indigo-800">
            <p className="font-semibold mb-2">🔬 Cara Kerja RAG:</p>
            <ol className="list-decimal list-inside space-y-1 text-xs">
              <li>Data bisnis (produk, bahan, penjualan, resep) dipecah menjadi dokumen kecil</li>
              <li>Tiap dokumen dikonversi menjadi vektor 768 dimensi oleh Gemini AI</li>
              <li>Saat user bertanya, pertanyaan juga dikonversi menjadi vektor</li>
              <li>Sistem mencari dokumen terdekat (cosine similarity) — bukan SEMUA data</li>
              <li>Hanya dokumen yang relevan dikirim ke LLM → jawaban lebih akurat & hemat token</li>
            </ol>
          </div>

          {result && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 p-3 bg-gray-50 rounded-lg text-sm font-medium"
            >
              {result}
            </motion.div>
          )}
        </div>
      </div>

      {/* Semantic Search Test */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
          🔍 Test Pencarian Semantik
        </h3>
        <p className="text-xs text-gray-500 mb-3">
          Coba ketik pertanyaan dan lihat dokumen mana yang dianggap paling relevan oleh AI.
        </p>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder='Contoh: "bahan yang hampir habis" atau "produk paling laris"'
            className="flex-1 px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50"
          />
          <button
            onClick={handleSearch}
            disabled={searching || !searchQuery.trim()}
            className="px-5 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition"
          >
            {searching ? "⏳" : "Cari"}
          </button>
        </div>

        {/* Quick test buttons */}
        <div className="flex flex-wrap gap-2 mb-4">
          {[
            "bahan yang hampir habis",
            "produk paling laris",
            "margin profit tertinggi",
            "stok kritis",
            "trend penjualan",
          ].map((q) => (
            <button
              key={q}
              onClick={() => {
                setSearchQuery(q);
                setTimeout(() => {
                  handleSearch();
                }, 100);
              }}
              className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full transition"
            >
              {q}
            </button>
          ))}
        </div>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-gray-500 font-medium">Ditemukan {searchResults.length} dokumen relevan:</p>
            {searchResults.map((r, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="p-4 bg-gray-50 rounded-xl border border-gray-200"
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-medium ${sourceColors[r.sourceType] || "bg-gray-100 text-gray-800"}`}
                  >
                    {sourceEmoji[r.sourceType] || "📄"} {r.sourceType}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <div className="h-1.5 w-16 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full"
                        style={{
                          width: `${Math.min(r.similarity * 100, 100)}%`,
                        }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 font-mono">{(r.similarity * 100).toFixed(1)}%</span>
                  </div>
                </div>
                <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">{r.content}</pre>
              </motion.div>
            ))}
          </div>
        )}

        {searchResults.length === 0 && searchQuery && !searching && (
          <p className="text-sm text-gray-400 text-center py-4">
            Belum ada hasil. Pastikan data sudah diindeks terlebih dahulu.
          </p>
        )}
      </div>
    </div>
  );
}

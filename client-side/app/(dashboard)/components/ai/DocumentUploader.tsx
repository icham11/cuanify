"use client";

import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  FileText,
  Trash2,
  CheckCircle,
  AlertTriangle,
  Loader2,
  File,
  HardDrive,
  RefreshCw,
  X,
} from "lucide-react";
import { useApiQuery } from "@/hooks/useApiQuery";
import {
  aiRagDocumentsUrl,
  invalidateAiDocumentCaches,
  invalidateAiInsightsCaches,
  API_CACHE_TTL_5_MIN_MS,
} from "@/lib/api/cache-keys";

interface UploadedDocument {
  filename: string;
  chunks: number;
  pages: number;
  uploadedAt: string | null;
  fileSize: number;
}

export default function DocumentUploader() {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Fetch documents ───
  const documentsQuery = useApiQuery<{
    success?: boolean;
    documents?: UploadedDocument[];
  }>(aiRagDocumentsUrl, {
    ttlMs: API_CACHE_TTL_5_MIN_MS,
  });
  const documents = documentsQuery.data?.documents ?? [];
  const isLoading = documents.length === 0 && documentsQuery.isLoading;

  const fetchDocuments = useCallback(
    async (options?: { force?: boolean }) => {
      await documentsQuery.refresh(options);
    },
    [documentsQuery],
  );

  // ─── Upload handler ───
  const handleUpload = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        setError("Hanya file PDF yang didukung.");
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        setError("Ukuran file maksimal 10MB.");
        return;
      }

      setError("");
      setSuccess("");
      setIsUploading(true);
      setUploadProgress("Mengunggah file...");

      try {
        const formData = new FormData();
        formData.append("file", file);

        setUploadProgress("Mengekstrak teks dari PDF...");

        const res = await fetch("/api/ai/rag/upload", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Gagal mengunggah");
        }

        setSuccess(data.message);
        setUploadProgress("");
        invalidateAiDocumentCaches();
        invalidateAiInsightsCaches();
        await fetchDocuments({ force: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Gagal mengunggah dokumen");
        setUploadProgress("");
      } finally {
        setIsUploading(false);
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [fetchDocuments],
  );

  // ─── Delete handler ───
  const handleDelete = useCallback(
    async (filename: string) => {
      if (!confirm(`Hapus dokumen "${filename}"? Data embedding-nya juga akan dihapus.`)) return;

      setDeletingFile(filename);
      try {
        const res = await fetch(`/api/ai/rag/documents?filename=${encodeURIComponent(filename)}`, { method: "DELETE" });
        const data = await res.json();

        if (!res.ok) throw new Error(data.error);

        setSuccess(data.message);
        invalidateAiDocumentCaches();
        invalidateAiInsightsCaches();
        await fetchDocuments({ force: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Gagal menghapus dokumen");
      } finally {
        setDeletingFile(null);
      }
    },
    [fetchDocuments],
  );

  // ─── Drag & drop ───
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      const files = e.dataTransfer.files;
      if (files?.[0]) {
        handleUpload(files[0]);
      }
    },
    [handleUpload],
  );

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    const d = new Date(dateStr);
    return d.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Jakarta",
    });
  };

  return (
    <div className="space-y-5">
      {/* Upload Area */}
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
          dragActive
            ? "border-indigo-400 bg-indigo-50/80"
            : isUploading
              ? "border-gray-200 bg-gray-50 cursor-not-allowed"
              : "border-gray-300 bg-white hover:border-indigo-300 hover:bg-indigo-50/30"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
          }}
          disabled={isUploading}
        />

        {isUploading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
            <div>
              <p className="text-sm font-medium text-gray-700">{uploadProgress}</p>
              <p className="text-xs text-gray-400 mt-1">Proses ini membutuhkan waktu beberapa detik...</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 bg-indigo-100 rounded-2xl flex items-center justify-center">
              <Upload className="w-7 h-7 text-indigo-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-700">
                {dragActive ? "Lepaskan file di sini" : "Klik atau seret file PDF ke sini"}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Maks. 10MB per file · Format PDF · Maks. {10} dokumen per bisnis
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Status Messages */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-3.5"
          >
            <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-red-700 flex-1">{error}</p>
            <button onClick={() => setError("")} className="text-red-400 hover:text-red-600">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}

        {success && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-xl p-3.5"
          >
            <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
            <p className="text-sm text-green-700 flex-1">{success}</p>
            <button onClick={() => setSuccess("")} className="text-green-400 hover:text-green-600">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Document List */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-gray-500" />
            Dokumen Terunggah
            {documents.length > 0 && (
              <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                {documents.length}
              </span>
            )}
          </h3>
          <button
            onClick={() => {
              void fetchDocuments({ force: true });
            }}
            disabled={isLoading}
            className="text-xs text-gray-500 hover:text-indigo-600 flex items-center gap-1 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
          </div>
        ) : documents.length === 0 ? (
          <div className="text-center py-8 bg-gray-50 rounded-xl border border-gray-100">
            <File className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">Belum ada dokumen yang diunggah</p>
            <p className="text-xs text-gray-400 mt-1">Upload SOP, panduan, atau dokumen bisnis lainnya</p>
          </div>
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => (
              <motion.div
                key={doc.filename}
                layout
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 group hover:border-indigo-200 transition"
              >
                <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-red-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{doc.filename}</p>
                  <div className="flex items-center gap-3 text-[11px] text-gray-400 mt-0.5">
                    <span>{doc.pages} halaman</span>
                    <span>·</span>
                    <span>{doc.chunks} bagian</span>
                    <span>·</span>
                    <span>{formatFileSize(doc.fileSize)}</span>
                    {doc.uploadedAt && (
                      <>
                        <span>·</span>
                        <span>{formatDate(doc.uploadedAt)}</span>
                      </>
                    )}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(doc.filename);
                  }}
                  disabled={deletingFile === doc.filename}
                  className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition p-1.5 rounded-lg hover:bg-red-50 disabled:opacity-50"
                  title="Hapus dokumen"
                >
                  {deletingFile === doc.filename ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Info Card */}
      <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-200">
        <div className="flex items-start gap-3">
          <FileText className="w-5 h-5 text-indigo-600 mt-0.5 shrink-0" />
          <div className="text-sm text-gray-700 space-y-1">
            <h4 className="font-semibold text-indigo-800">Cara Kerja</h4>
            <ul className="space-y-0.5 text-xs text-gray-600 list-disc list-inside">
              <li>Upload file PDF (SOP, panduan, laporan, dll.)</li>
              <li>Teks diekstrak dan dipecah menjadi bagian-bagian kecil</li>
              <li>Setiap bagian dikonversi menjadi data yang bisa dicari AI</li>
              <li>AI Assistant bisa menjawab pertanyaan berdasarkan isi dokumen</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

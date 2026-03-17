"use client";

interface Props {
  onSelect: (mode: "manual" | "ai") => void;
}

export default function ModeSelectorModal({ onSelect }: Props) {
  return (
    <div className="bg-white p-8 rounded-xl shadow flex flex-col items-center space-y-6">
      <h2 className="text-xl font-semibold text-black">Choose Recipe Creation Mode</h2>

      <div className="flex gap-6">

        <button
          onClick={() => onSelect("manual")}
          className="px-6 py-4 bg-indigo-100 hover:bg-indigo-200 rounded-xl font-semibold transition text-black flex items-center gap-2"
        >
          <span className="text-2xl">⚡</span> Manual Input
        </button>

        <button
          onClick={() => onSelect("ai")}
          className="px-6 py-4 bg-purple-100 hover:bg-purple-200 rounded-xl font-semibold transition text-black flex items-center gap-2"
        >
          <span className="text-2xl">🧠</span> Generate with AI
        </button>

      </div>
    </div>
  );
}
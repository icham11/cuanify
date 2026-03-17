"use client";

import { useState } from "react";
import RecipeBuilder from "./components/RecipeBuilder";
import ModeSelectorModal from "./components/ModeSelectorModal";

export default function RecipesPage() {
  const [mode, setMode] = useState<"manual" | "ai" | null>(null);

  return (
    <div className="min-h-screen bg-linear-to-br py-4 px-2 sm:px-4">
      <div className="max-w-5xl mx-auto space-y-6 sm:space-y-10">
        <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6 flex flex-col items-start sm:items-center mb-4 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-indigo-700 mb-2 tracking-tight">
            Recipes
          </h1>
          <p className="text-gray-500 text-sm sm:text-base">
            Create and manage your product recipes with ease and style.
          </p>
        </div>

        {!mode && (
          <ModeSelectorModal
            onSelect={(selectedMode) => setMode(selectedMode)}
          />
        )}

        {mode && (
          <div className="w-full">
            <RecipeBuilder mode={mode} />
          </div>
        )}
      </div>
    </div>
  );
}

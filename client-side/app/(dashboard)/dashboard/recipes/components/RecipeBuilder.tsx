"use client";

import { useMemo } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { recipeSchema, RecipeFormValues } from "../schema";

interface Props {
  mode: "manual" | "ai";
}

export default function RecipeBuilder({ mode }: Props) {
  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RecipeFormValues>({
    resolver: zodResolver(recipeSchema),
    defaultValues: {
      name: "",
      mode,
      ingredients: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "ingredients",
  });

  const ingredients = watch("ingredients");

  const totalCost = useMemo(() => {
    return (
      ingredients?.reduce(
        (acc, ing) => acc + (ing.quantity || 0) * (ing.costPerUnit || 0),
        0,
      ) || 0
    );
  }, [ingredients]);

  const onSubmit = (data: RecipeFormValues) => {
    console.log("Recipe Submit:", data);
    alert("Check console — form working 🚀");
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-8 w-full max-w-5xl mx-auto"
    >
      {/* Header */}
      <div className="bg-linear-to-r from-indigo-100 via-white to-purple-100 p-4 sm:p-6 rounded-xl shadow space-y-4 border border-indigo-200 w-full">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
          <h2 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-indigo-700 tracking-tight">
            Recipe Builder
          </h2>
          <span className="px-4 py-1 text-sm font-semibold rounded-full bg-indigo-200 text-indigo-700 shadow-sm">
            {mode.toUpperCase()}
          </span>
        </div>
        <input
          {...register("name")}
          placeholder="Recipe Name"
          className="w-full border border-indigo-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-400 transition text-lg"
        />
        {errors.name && (
          <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>
        )}
      </div>

      {/* Ingredient Table */}
      <div className="rounded-2xl shadow-xl overflow-hidden border border-gray-200 w-full bg-linear-to-br from-indigo-50 via-white to-purple-50">
        <div className="grid grid-cols-6 gap-2 bg-linear-to-r from-indigo-100 via-white to-purple-100 px-6 py-4 text-lg font-bold text-indigo-700 tracking-wide">
          <span>Name</span>
          <span>Quantity</span>
          <span>Unit</span>
          <span>Cost / Unit</span>
          <span>Subtotal</span>
          <span></span>
        </div>
        <div className="divide-y">
          {fields.map((field, index) => {
            const subtotal =
              (ingredients?.[index]?.quantity || 0) *
              (ingredients?.[index]?.costPerUnit || 0);
            return (
              <div
                key={field.id}
                className="grid grid-cols-6 gap-2 px-6 py-4 items-center bg-white/80 hover:bg-indigo-50 transition rounded-xl shadow-sm"
              >
                <input
                  {...register(`ingredients.${index}.name`)}
                  className="border border-indigo-200 rounded-xl px-4 py-2 focus:ring-2 focus:ring-indigo-400 transition text-base text-black shadow bg-white/90 font-medium outline-none focus:outline-indigo-500"
                  placeholder="Name"
                />
                <input
                  type="number"
                  {...register(`ingredients.${index}.quantity`, {
                    valueAsNumber: true,
                  })}
                  className="border border-indigo-200 rounded-xl px-4 py-2 focus:ring-2 focus:ring-indigo-400 transition text-base text-black shadow bg-white/90 font-medium outline-none focus:outline-indigo-500"
                  min={1}
                  placeholder="Qty"
                />
                <input
                  {...register(`ingredients.${index}.unit`)}
                  className="border border-indigo-200 rounded-xl px-4 py-2 focus:ring-2 focus:ring-indigo-400 transition text-base text-black shadow bg-white/90 font-medium outline-none focus:outline-indigo-500"
                  placeholder="Unit"
                />
                <input
                  type="number"
                  {...register(`ingredients.${index}.costPerUnit`, {
                    valueAsNumber: true,
                  })}
                  className="border border-indigo-200 rounded-xl px-4 py-2 focus:ring-2 focus:ring-indigo-400 transition text-base text-black shadow bg-white/90 font-medium outline-none focus:outline-indigo-500"
                  min={0}
                  placeholder="Cost"
                />
                <span className="font-semibold text-indigo-700 text-base px-4 py-2 rounded-full bg-indigo-100/60 shadow-sm inline-block">
                  Rp {subtotal.toLocaleString("id-ID")}
                </span>
                <button
                  type="button"
                  onClick={() => remove(index)}
                  className="flex items-center justify-center w-9 h-9 rounded-full bg-red-100 hover:bg-red-200 text-red-600 hover:text-red-700 transition shadow border border-red-200 group"
                  title="Remove ingredient"
                >
                  <span className="text-xl group-hover:rotate-90 transition-transform">
                    ✕
                  </span>
                </button>
              </div>
            );
          })}
        </div>
        <div className="p-6 flex justify-center">
          <button
            type="button"
            onClick={() =>
              append({
                name: "",
                quantity: 1,
                unit: "",
                costPerUnit: 0,
              })
            }
            className="px-10 py-4 bg-indigo-600 hover:bg-purple-600 text-white rounded-2xl font-bold shadow-xl transition text-lg tracking-wide"
          >
            + Add Ingredient
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-linear-to-r from-indigo-100 via-white to-purple-100 p-4 rounded-xl shadow flex flex-col md:flex-row justify-between items-center border border-indigo-200 w-full">
        <div className="text-xl font-bold text-indigo-700 mb-2 md:mb-0">
          Total Cost:{" "}
          <span className="text-purple-700">
            Rp {totalCost.toLocaleString("id-ID")}
          </span>
        </div>
        <button
          type="submit"
          className="px-8 py-3 bg-indigo-600 hover:bg-purple-600 text-white rounded-lg font-semibold shadow transition text-lg"
        >
          Save Recipe
        </button>
      </div>
    </form>
  );
}

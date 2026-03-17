"use client";

import { mockIngredients } from "../mockIngredients";

interface Ingredient {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  costPerUnit: number;
  isNew?: boolean;
}

interface Props {
  ingredient: Ingredient;
  onChange: (id: string, field: string, value: any) => void;
  onDelete: (id: string) => void;
}

export default function IngredientRow({
  ingredient,
  onChange,
  onDelete,
}: Props) {

  const subtotal = ingredient.quantity * ingredient.costPerUnit;

  const handleSelectExisting = (ingredientId: string) => {
    const selected = mockIngredients.find((i) => i.id === ingredientId);
    if (!selected) return;

    onChange(ingredient.id, "name", selected.name);
    onChange(ingredient.id, "unit", selected.unit);
    onChange(ingredient.id, "costPerUnit", selected.costPerUnit);
    onChange(ingredient.id, "isNew", false);
  };

  return (
    <div className="grid grid-cols-6 gap-4 px-6 py-4 items-center rounded-xl bg-linear-to-r from-white via-indigo-50 to-purple-50 shadow-sm transition hover:shadow-md">

      {/* Ingredient Selector */}
      <div>
        <select
          className="border border-indigo-300 rounded-lg px-2 py-1 w-full focus:ring-2 focus:ring-indigo-200 transition"
          value={ingredient.name}
          onChange={(e) => {
            if (e.target.value === "__new__") {
              onChange(ingredient.id, "name", "");
              onChange(ingredient.id, "isNew", true);
            } else {
              handleSelectExisting(e.target.value);
            }
          }}
        >
          <option value="">Select Ingredient</option>
          {mockIngredients.map((ing) => (
            <option key={ing.id} value={ing.id}>
              {ing.name}
            </option>
          ))}
          <option value="__new__">+ Create New Ingredient</option>
        </select>

        {ingredient.isNew && (
          <input
            type="text"
            placeholder="New Ingredient Name"
            className="border border-indigo-300 rounded-lg px-2 py-1 mt-2 w-full focus:ring-2 focus:ring-indigo-200 transition"
            value={ingredient.name}
            onChange={(e) =>
              onChange(ingredient.id, "name", e.target.value)
            }
          />
        )}
      </div>

      {/* Quantity */}
      <input
        type="number"
        value={ingredient.quantity}
        onChange={(e) =>
          onChange(ingredient.id, "quantity", Number(e.target.value))
        }
        className="border border-indigo-300 rounded-lg px-2 py-1 focus:ring-2 focus:ring-indigo-200 transition"
        min={1}
        placeholder="Qty"
      />

      {/* Unit */}
      <input
        type="text"
        value={ingredient.unit}
        onChange={(e) =>
          onChange(ingredient.id, "unit", e.target.value)
        }
        className="border border-indigo-300 rounded-lg px-2 py-1 focus:ring-2 focus:ring-indigo-200 transition"
        placeholder="Unit"
      />

      {/* Cost per Unit */}
      <input
        type="number"
        value={ingredient.costPerUnit}
        onChange={(e) =>
          onChange(ingredient.id, "costPerUnit", Number(e.target.value))
        }
        className="border border-indigo-300 rounded-lg px-2 py-1 focus:ring-2 focus:ring-indigo-200 transition"
        min={0}
        placeholder="Cost"
      />

      {/* Subtotal */}
      <span className="font-medium text-indigo-700">
        Rp {subtotal.toLocaleString("id-ID")}
      </span>

      {/* Delete */}
      <button
        onClick={() => onDelete(ingredient.id)}
        className="text-red-500 hover:text-red-700 transition text-lg font-bold focus:outline-none focus:ring-2 focus:ring-red-300 rounded-full w-8 h-8 flex items-center justify-center"
        title="Remove ingredient"
      >
        <span className="block transform hover:scale-125 transition">✕</span>
      </button>

    </div>
  );
}
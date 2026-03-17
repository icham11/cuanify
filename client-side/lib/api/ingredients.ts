export type Ingredient = {
  currentStock: number;
  id: string;
  name: string;
  unit: string;
  stock: number;
  minStock: number;
  costPerUnit: number;
};

export async function getIngredients(): Promise<Ingredient[]> {
  const res = await fetch("/api/ingredients", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch ingredients");
  const data = await res.json();
  return data.data || [];
}

export async function deleteIngredient(id: number | string): Promise<void> {
  const res = await fetch(`/api/ingredients/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Failed to delete ingredient");
  }
}

export async function bulkDeleteIngredients(ids: (number | string)[]): Promise<void> {
  const res = await fetch("/api/ingredients", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ ids: ids.map(Number) }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Failed to delete ingredients");
  }
}

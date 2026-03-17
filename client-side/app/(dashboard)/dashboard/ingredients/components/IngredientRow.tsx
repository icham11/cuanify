import { Ingredient } from "../type";
import IngredientStatusBadge from "./IngredientStatusBadge";

interface Props {
  ingredient: Ingredient;
}

export default function IngredientRow({ ingredient }: Props) {
  return (
    <tr className="border-b text-sm">
      <td className="p-4 font-medium">{ingredient.name}</td>
      <td className="p-4">{ingredient.unit}</td>
      <td className="p-4">
        {ingredient.stock === -1 ? (
          <span className="text-gray-400 italic">Belum di-set</span>
        ) : (
          <span className="font-semibold">{ingredient.stock}</span>
        )}
      </td>
      <td className="p-4">
        {ingredient.minStock === -1 ? <span className="text-gray-400 italic">Tidak di-set</span> : ingredient.minStock}
      </td>
      <td className="p-4">Rp {ingredient.costPerUnit.toLocaleString("id-ID")}</td>
      <td className="p-4">
        <IngredientStatusBadge stock={ingredient.stock} minStock={ingredient.minStock} />
      </td>
    </tr>
  );
}

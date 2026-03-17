import { Ingredient } from "../type";
import IngredientRow from "./IngredientRow";

interface Props {
  ingredients: Ingredient[];
}

export default function IngredientTable({ ingredients }: Props) {
  return (
    <div className="bg-white rounded-xl shadow overflow-hidden">
      <table className="w-full text-left">
        <thead className="bg-gray-100 text-sm text-gray-600">
          <tr>
            <th className="p-4">Name</th>
            <th className="p-4">Unit</th>
            <th className="p-4">Stock</th>
            <th className="p-4">Min Stock</th>
            <th className="p-4">Cost</th>
          </tr>
        </thead>
        <tbody>
          {ingredients.map((item) => (
            <IngredientRow key={item.id} ingredient={item} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
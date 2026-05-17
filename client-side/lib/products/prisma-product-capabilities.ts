import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

type ProductFieldAvailability = {
  hasProductionToken: boolean;
  hasManualStock: boolean;
  hasMinimumOrder: boolean;
};

const productModel = Prisma.dmmf.datamodel.models.find(
  (model) => model.name === "Product",
);
const productPrismaFieldNames = new Set(
  (productModel?.fields ?? []).map((field) => field.name),
);

let productFieldAvailabilityPromise: Promise<ProductFieldAvailability> | null =
  null;

export function getProductPrismaFieldAvailability(): ProductFieldAvailability {
  return {
    hasProductionToken: productPrismaFieldNames.has("productionToken"),
    hasManualStock: productPrismaFieldNames.has("manualStock"),
    hasMinimumOrder: productPrismaFieldNames.has("minimumOrder"),
  };
}

export async function getProductFieldAvailability(): Promise<ProductFieldAvailability> {
  if (!productFieldAvailabilityPromise) {
    const prismaFieldAvailability = getProductPrismaFieldAvailability();

    productFieldAvailabilityPromise = prisma
      .$queryRaw<Array<{ column_name: string }>>`SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'Product'
         AND column_name IN ('productionToken', 'manualStock', 'minimumOrder')`
      .then((rows) => {
        const columns = new Set(rows.map((row) => row.column_name));

        return {
          hasProductionToken:
            prismaFieldAvailability.hasProductionToken &&
            columns.has("productionToken"),
          hasManualStock:
            prismaFieldAvailability.hasManualStock &&
            columns.has("manualStock"),
          hasMinimumOrder:
            prismaFieldAvailability.hasMinimumOrder &&
            columns.has("minimumOrder"),
        };
      })
      .catch((error) => {
        productFieldAvailabilityPromise = null;
        throw error;
      });
  }

  return productFieldAvailabilityPromise;
}

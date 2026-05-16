import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  requireAuth,
  requireRole,
  isAuthError,
  ForbiddenError,
} from "@/lib/auth/session";
import { z } from "zod";
import {
  acquireProductWriteLock,
  findProductNameConflicts,
  normalizeProductName,
} from "@/lib/products/uniqueness";
import { recipeItemSchema } from "@/lib/validations/product";
import { normalizeDirectCogs } from "@/lib/cogs/config";
import {
  isPrismaConnectionTimeout,
  prismaConnectionErrorResponse,
  throwIfPrismaTimeoutCooldownActive,
} from "@/lib/prisma-errors";

export const runtime = "nodejs";

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  categoryId: z.coerce.number().int().optional(),
  categoryName: z.string().min(1).max(100).optional(),
  sellingPrice: z.coerce
    .number()
    .positive("Selling price must be positive")
    .optional(),
  cogs: z.coerce.number().positive("COGS must be greater than 0").optional(),
  productionToken: z.coerce.number().int().min(0).optional(),
  manualStock: z.coerce.number().int().min(0).optional(),
  minimumOrder: z.coerce.number().int().min(0).optional(),
  productType: z.enum(["ReadyStock", "PreOrder"]).optional(),
  createdAt: z.string().datetime().optional(),
  recipe: z.array(recipeItemSchema).optional(),
  manualCogs: z.number().min(0).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    throwIfPrismaTimeoutCooldownActive();
    const auth = await requireAuth();
    requireRole(auth, "Owner");
    const { businessId } = auth;
    const { id: idParam } = await params;
    const id = Number(idParam);
    if (!id || isNaN(id)) {
      return NextResponse.json(
        { error: "ID produk tidak valid." },
        { status: 400 },
      );
    }

    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      console.error(
        "PATCH /api/products/[id] validation failed:",
        JSON.stringify(parsed.error.flatten(), null, 2),
        "Body:",
        JSON.stringify(body),
      );
      return NextResponse.json(
        {
          error: "Validation failed",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    await prisma.$transaction(async (tx) => {
      await acquireProductWriteLock(tx, businessId);

      const existing = await tx.product.findFirst({
        where: { id, businessId, deletedAt: null },
        select: { id: true, name: true },
      });
      if (!existing) {
        throw new Error("Produk tidak ditemukan atau sudah dihapus.");
      }

      let categoryId = parsed.data.categoryId;
      if (!categoryId && parsed.data.categoryName) {
        let category = await tx.category.findFirst({
          where: {
            businessId,
            name: { equals: parsed.data.categoryName, mode: "insensitive" },
          },
        });
        if (!category) {
          category = await tx.category.create({
            data: { businessId, name: parsed.data.categoryName },
          });
        }
        categoryId = category.id;
      }

      const nextName =
        parsed.data.name !== undefined
          ? normalizeProductName(parsed.data.name)
          : normalizeProductName(existing.name);

      const duplicateNames = await findProductNameConflicts({
        tx,
        businessId,
        names: [nextName],
        excludeProductId: id,
      });
      if (duplicateNames.length > 0) {
        throw new Error(`Product "${nextName}" already exists.`);
      }

      const updateData: Record<string, unknown> = {};
      if (parsed.data.name !== undefined) updateData.name = nextName;
      if (categoryId !== undefined) updateData.categoryId = categoryId;
      if (parsed.data.sellingPrice !== undefined)
        updateData.sellingPrice = parsed.data.sellingPrice;
      if (parsed.data.cogs !== undefined)
        updateData.cogs = normalizeDirectCogs(parsed.data.cogs);
      if (parsed.data.productionToken !== undefined)
        updateData.productionToken = parsed.data.productionToken;
      if (parsed.data.manualStock !== undefined)
        updateData.manualStock = parsed.data.manualStock;
      if (parsed.data.minimumOrder !== undefined)
        updateData.minimumOrder = parsed.data.minimumOrder;
      if (parsed.data.productType !== undefined)
        updateData.productType = parsed.data.productType;
      if (parsed.data.createdAt !== undefined)
        updateData.createdAt = new Date(parsed.data.createdAt);
      if (parsed.data.recipe && parsed.data.recipe.length === 0 && parsed.data.manualCogs !== undefined) {
        updateData.recipeCost = parsed.data.manualCogs;
      }

      await tx.product.update({
        where: { id },
        data: updateData,
      });

      if (parsed.data.recipe) {
        await tx.recipe.deleteMany({ where: { productId: id } });
        if (parsed.data.recipe.length > 0) {
          await tx.recipe.createMany({
            data: parsed.data.recipe.map((r) => ({
              productId: id,
              ingredientId: r.ingredientId,
              quantity: r.quantity,
            })),
          });
        }
      }
    });

    const result = await prisma.product.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true } },
        recipes: { include: { ingredient: true } },
      },
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (
      error instanceof Error &&
      error.message === "Produk tidak ditemukan atau sudah dihapus."
    ) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof Error && error.message.includes("already exists")) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (isUniqueConstraintError(error)) {
      return NextResponse.json(
        {
          error:
            "Nama produk sudah dipakai oleh produk lain. Gunakan nama yang berbeda.",
        },
        { status: 409 },
      );
    }
    if (isPrismaConnectionTimeout(error)) {
      return prismaConnectionErrorResponse(
        "Koneksi database sedang penuh saat mengubah produk. Coba lagi beberapa saat.",
      );
    }
    console.error("PATCH /api/products/[id] error:", error);
    return NextResponse.json(
      { error: "Gagal mengubah produk." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    throwIfPrismaTimeoutCooldownActive();
    const auth = await requireAuth();
    requireRole(auth, "Owner");
    const { businessId } = auth;
    const { id: idParam } = await params;
    const id = Number(idParam);
    if (!id || isNaN(id)) {
      return NextResponse.json(
        { error: "ID produk tidak valid." },
        { status: 400 },
      );
    }

    const existing = await prisma.product.findFirst({
      where: { id, businessId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Produk tidak ditemukan atau sudah dihapus." },
        { status: 404 },
      );
    }

    await prisma.product.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (isAuthError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (isPrismaConnectionTimeout(error)) {
      return prismaConnectionErrorResponse(
        "Koneksi database sedang penuh saat menghapus produk. Coba lagi beberapa saat.",
      );
    }
    console.error("DELETE /api/products/[id] error:", error);
    return NextResponse.json(
      { error: "Gagal menghapus produk." },
      { status: 500 },
    );
  }
}

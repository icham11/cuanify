"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bolt, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCatalogAdminState } from "@/lib/bookings/catalog-admin";
import {
  ensureCatalogSelectionFromCatalog,
  type CatalogAddOn,
  type CatalogSelection,
  type PricelistCategory,
} from "@/lib/bookings/pricelist";

type PlatformKey = "tokopedia" | "shopee";

type CatalogVariantRecord = {
  category: string;
  subcategory: string;
  productName: string;
  size: string;
  displayName: string;
  price: number;
  cogs: number;
  productId: number | null;
};

type CatalogPayload = {
  productCatalog: PricelistCategory[];
  addOnCatalog: Record<string, CatalogAddOn[]>;
  variants: CatalogVariantRecord[];
};

type ItemAddOn = {
  id: string;
  label: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
};

type MarketplaceItemGroup = {
  id: string;
  selection: CatalogSelection;
  displayName: string;
  productId: number | null;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  addOns: ItemAddOn[];
  source: "manual" | "parsed";
  rawLine?: string;
};

const SHIPPING_METHOD_OPTIONS = [
  "Instant / Same Day",
  "Regular",
  "Cargo",
  "Pickup Point",
  "Kurir Toko",
];

function makeId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `mkp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function todayDateInput() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(dateInput: string, days: number) {
  const date = new Date(`${dateInput}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateInput;
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeText(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatRupiah(value: number) {
  return `Rp${Math.round(value || 0).toLocaleString("id-ID")}`;
}

function toNumber(value: string | number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toPositiveInt(value: string | number, fallback = 1) {
  const parsed = Math.round(toNumber(value));
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function extractQuantity(line: string) {
  const patterns = [
    /\bx\s*(\d+)\b/i,
    /\bqty\s*[:=]?\s*(\d+)\b/i,
    /\bjumlah\s*[:=]?\s*(\d+)\b/i,
    /^(\d+)\s*x\b/i,
  ];

  for (const pattern of patterns) {
    const matched = line.match(pattern);
    if (matched?.[1]) return toPositiveInt(matched[1], 1);
  }

  return 1;
}

function extractTrailingPrice(line: string) {
  const matched = line.match(/(?:rp\.?\s*)?([\d.]{4,})\s*$/i);
  if (!matched?.[1]) return null;
  const numeric = Number(matched[1].replace(/\./g, ""));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function scoreVariantMatch(line: string, variant: CatalogVariantRecord) {
  const normalizedLine = normalizeText(line);
  const normalizedDisplay = normalizeText(variant.displayName);
  const normalizedProduct = normalizeText(variant.productName);
  const normalizedSize = normalizeText(variant.size);
  const normalizedSubcategory = normalizeText(variant.subcategory);
  const normalizedCategory = normalizeText(variant.category);

  let score = 0;
  if (!normalizedLine) return score;
  if (normalizedLine.includes(normalizedDisplay)) score += 120;
  if (normalizedLine.includes(normalizedProduct)) score += 70;
  if (normalizedSize && normalizedLine.includes(normalizedSize)) score += 40;
  if (normalizedLine.includes(normalizedSubcategory)) score += 24;
  if (normalizedLine.includes(normalizedCategory)) score += 12;

  const keywords = Array.from(
    new Set(
      `${normalizedDisplay} ${normalizedProduct} ${normalizedSubcategory}`
        .split(" ")
        .filter((part) => part.length > 2),
    ),
  );
  keywords.forEach((keyword) => {
    if (normalizedLine.includes(keyword)) score += 5;
  });

  return score;
}

function findBestVariant(
  line: string,
  variants: CatalogVariantRecord[],
): CatalogVariantRecord | null {
  let best: CatalogVariantRecord | null = null;
  let bestScore = 0;

  variants.forEach((variant) => {
    const score = scoreVariantMatch(line, variant);
    if (score > bestScore) {
      best = variant;
      bestScore = score;
    }
  });

  return bestScore >= 40 ? best : null;
}

function findBestAddOn(
  line: string,
  addOns: CatalogAddOn[],
): CatalogAddOn | null {
  const normalizedLine = normalizeText(line);
  let best: CatalogAddOn | null = null;
  let bestScore = 0;

  addOns.forEach((addOn) => {
    const label = normalizeText(addOn.label);
    const id = normalizeText(addOn.id);
    let score = 0;
    if (label && normalizedLine.includes(label)) score += 80;
    if (id && normalizedLine.includes(id)) score += 50;
    label
      .split(" ")
      .filter((part) => part.length > 2)
      .forEach((part) => {
        if (normalizedLine.includes(part)) score += 6;
      });

    if (score > bestScore) {
      best = addOn;
      bestScore = score;
    }
  });

  return bestScore >= 30 ? best : null;
}

function buildSelectionFromVariant(variant: CatalogVariantRecord): CatalogSelection {
  return {
    category: variant.category,
    subcategory: variant.subcategory,
    productName: variant.productName,
    size: variant.size,
  };
}

function getGroupSubtotal(group: MarketplaceItemGroup) {
  const productTotal = group.quantity * group.unitPrice;
  const addOnTotal = group.addOns.reduce(
    (sum, addOn) => sum + addOn.quantity * addOn.unitPrice,
    0,
  );
  return productTotal + addOnTotal;
}

function getCategoryOptions(productCatalog: PricelistCategory[]) {
  return productCatalog.map((entry) => entry.category);
}

export default function MarketplaceOrderPage() {
  const router = useRouter();
  const manualSectionRef = useRef<HTMLDivElement | null>(null);
  const { productCatalog, addOnCatalog } = useCatalogAdminState();
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [savingOrder, setSavingOrder] = useState(false);
  const [catalog, setCatalog] = useState<CatalogPayload | null>(null);
  const [platform, setPlatform] = useState<PlatformKey>("tokopedia");
  const [orderReference, setOrderReference] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [orderDate, setOrderDate] = useState(todayDateInput());
  const [shipDate, setShipDate] = useState(addDays(todayDateInput(), 3));
  const [shippingMethod, setShippingMethod] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [items, setItems] = useState<MarketplaceItemGroup[]>([]);
  const [draftSelection, setDraftSelection] = useState<CatalogSelection>({
    category: "",
    subcategory: "",
    productName: "",
    size: "",
  });
  const [draftQuantity, setDraftQuantity] = useState(1);
  const [draftUnitPrice, setDraftUnitPrice] = useState(0);
  const [draftUnitCost, setDraftUnitCost] = useState(0);
  const [draftAddOns, setDraftAddOns] = useState<ItemAddOn[]>([]);
  const [pendingAddOnId, setPendingAddOnId] = useState("");
  const [pendingAddOnQty, setPendingAddOnQty] = useState(1);

  useEffect(() => {
    let cancelled = false;

    const loadCatalog = async () => {
      setLoadingCatalog(true);
      try {
        const response = await fetch("/api/marketplace/catalog", {
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => ({}))) as {
          success?: boolean;
          data?: CatalogPayload;
          error?: string;
        };

        if (!response.ok || !payload.success || !payload.data) {
          throw new Error(payload.error || "Gagal memuat catalog marketplace.");
        }

        if (cancelled) return;

        setCatalog(payload.data);
      } catch (error) {
        if (!cancelled) {
          toast.error(
            error instanceof Error
              ? error.message
              : "Gagal memuat catalog marketplace.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingCatalog(false);
        }
      }
    };

    void loadCatalog();
    return () => {
      cancelled = true;
    };
  }, [productCatalog, addOnCatalog]);

  useEffect(() => {
    if (productCatalog.length === 0) return;
    setDraftSelection((current) =>
      ensureCatalogSelectionFromCatalog(productCatalog, current),
    );
  }, [productCatalog]);

  const currentCategory =
    productCatalog.find((entry) => entry.category === draftSelection.category) ??
    null;
  const currentSubcategory =
    currentCategory?.subcategories.find(
      (entry) => entry.name === draftSelection.subcategory,
    ) ?? null;
  const currentProduct =
    currentSubcategory?.products.find(
      (entry) => entry.name === draftSelection.productName,
    ) ?? null;
  const currentVariant =
    catalog?.variants.find(
      (variant) =>
        variant.category === draftSelection.category &&
        variant.subcategory === draftSelection.subcategory &&
        variant.productName === draftSelection.productName &&
        variant.size === draftSelection.size,
    ) ?? null;
  const availableAddOns = addOnCatalog[draftSelection.category] ?? [];
  const pendingAddOnOption =
    availableAddOns.find((addOn) => addOn.id === pendingAddOnId) ?? null;
  useEffect(() => {
    if (!catalog?.variants.length) return;
    const nextVariant = catalog.variants.find(
      (variant) =>
        variant.category === draftSelection.category &&
        variant.subcategory === draftSelection.subcategory &&
        variant.productName === draftSelection.productName &&
        variant.size === draftSelection.size,
    );
    if (!nextVariant) return;
    setDraftUnitPrice(nextVariant.price);
    setDraftUnitCost(nextVariant.cogs);
  }, [catalog, draftSelection]);
  const totalIncome = items.reduce((sum, item) => sum + getGroupSubtotal(item), 0);

  const updateDraftSelection = (partial: Partial<CatalogSelection>) => {
    if (productCatalog.length === 0) return;
    const nextSelection = ensureCatalogSelectionFromCatalog(productCatalog, {
      ...draftSelection,
      ...partial,
    });
    const nextVariant =
      catalog?.variants.find(
        (variant) =>
          variant.category === nextSelection.category &&
          variant.subcategory === nextSelection.subcategory &&
          variant.productName === nextSelection.productName &&
          variant.size === nextSelection.size,
      ) ?? null;

    setDraftSelection(nextSelection);
    setDraftUnitPrice(nextVariant?.price ?? 0);
    setDraftUnitCost(nextVariant?.cogs ?? 0);
    setDraftAddOns([]);
    setPendingAddOnId("");
    setPendingAddOnQty(1);
  };

  const addDraftAddOn = () => {
    if (!pendingAddOnOption) {
      toast.error("Pilih add-on dulu.");
      return;
    }

    const qty = toPositiveInt(pendingAddOnQty, 1);
    setDraftAddOns((current) => {
      const existing = current.find((entry) => entry.id === pendingAddOnOption.id);
      if (existing) {
        return current.map((entry) =>
          entry.id === pendingAddOnOption.id
            ? { ...entry, quantity: entry.quantity + qty }
            : entry,
        );
      }

      return [
        ...current,
        {
          id: pendingAddOnOption.id,
          label: pendingAddOnOption.label,
          quantity: qty,
          unitPrice: pendingAddOnOption.price,
          unitCost: Number(pendingAddOnOption.cogs ?? 0),
        },
      ];
    });
    setPendingAddOnId("");
    setPendingAddOnQty(1);
  };

  const removeDraftAddOn = (addOnId: string) => {
    setDraftAddOns((current) => current.filter((entry) => entry.id !== addOnId));
  };

  const addManualItem = () => {
    if (!currentVariant || !currentVariant.productId) {
      toast.error("Produk marketplace belum siap. Coba refresh halaman ini.");
      return;
    }

    setItems((current) => [
      ...current,
      {
        id: makeId(),
        selection: draftSelection,
        displayName: currentVariant.displayName,
        productId: currentVariant.productId,
        quantity: toPositiveInt(draftQuantity, 1),
        unitPrice: roundMoney(draftUnitPrice),
        unitCost: roundMoney(draftUnitCost),
        addOns: draftAddOns.map((addOn) => ({ ...addOn })),
        source: "manual",
      },
    ]);
    setDraftQuantity(1);
    setDraftAddOns([]);
    setPendingAddOnId("");
    setPendingAddOnQty(1);
    toast.success("Item manual ditambahkan.");
  };

  const parseProducts = () => {
    if (!catalog) return;
    if (!pasteText.trim()) {
      toast.error("Paste nama produk dulu.");
      return;
    }

    const lines = pasteText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .filter((line) => !/^contoh[:\s]/i.test(line));

    if (lines.length === 0) {
      toast.error("Tidak ada baris produk yang bisa diparse.");
      return;
    }

    const parsedGroups: MarketplaceItemGroup[] = [];
    let unmatchedCount = 0;

    lines.forEach((line) => {
      const lastGroup = parsedGroups[parsedGroups.length - 1] ?? null;
      const availableCategoryAddOns = lastGroup
        ? addOnCatalog[lastGroup.selection.category] ?? []
        : [];
      const addOnMatch = findBestAddOn(line, availableCategoryAddOns);
      const variantMatch = findBestVariant(line, catalog.variants);
      const quantity = extractQuantity(line);
      const explicitPrice = extractTrailingPrice(line);

      if (
        lastGroup &&
        addOnMatch &&
        (!variantMatch || /^add[\s-]?on\b/i.test(line) || /^addon\b/i.test(line))
      ) {
        lastGroup.addOns.push({
          id: addOnMatch.id,
          label: addOnMatch.label,
          quantity,
          unitPrice: explicitPrice ?? addOnMatch.price,
          unitCost: Number(addOnMatch.cogs ?? 0),
        });
        return;
      }

      if (!variantMatch) {
        unmatchedCount += 1;
        return;
      }

      parsedGroups.push({
        id: makeId(),
        selection: buildSelectionFromVariant(variantMatch),
        displayName: variantMatch.displayName,
        productId: variantMatch.productId,
        quantity,
        unitPrice: roundMoney(
          explicitPrice ? explicitPrice / quantity : variantMatch.price,
        ),
        unitCost: roundMoney(variantMatch.cogs),
        addOns: addOnMatch
          ? [
              {
                id: addOnMatch.id,
                label: addOnMatch.label,
                quantity,
                unitPrice: addOnMatch.price,
                unitCost: Number(addOnMatch.cogs ?? 0),
              },
            ]
          : [],
        source: "parsed",
        rawLine: line,
      });
    });

    if (parsedGroups.length === 0) {
      toast.error("Tidak ada item yang berhasil dicocokkan dari paste platform.");
      return;
    }

    setItems((current) => [...current, ...parsedGroups]);
    toast.success(
      unmatchedCount > 0
        ? `${parsedGroups.length} item berhasil diparse, ${unmatchedCount} baris perlu dicek manual.`
        : `${parsedGroups.length} item berhasil diparse.`,
    );
  };

  const clearPaste = () => {
    setPasteText("");
  };

  const updateItem = (
    itemId: string,
    patch: Partial<Pick<MarketplaceItemGroup, "quantity" | "unitPrice">>,
  ) => {
    setItems((current) =>
      current.map((item) =>
        item.id === itemId
          ? {
              ...item,
              quantity:
                patch.quantity !== undefined
                  ? toPositiveInt(patch.quantity, 1)
                  : item.quantity,
              unitPrice:
                patch.unitPrice !== undefined
                  ? roundMoney(Math.max(0, patch.unitPrice))
                  : item.unitPrice,
            }
          : item,
      ),
    );
  };

  const updateItemAddOn = (
    itemId: string,
    addOnId: string,
    patch: Partial<Pick<ItemAddOn, "quantity" | "unitPrice">>,
  ) => {
    setItems((current) =>
      current.map((item) => {
        if (item.id !== itemId) return item;
        return {
          ...item,
          addOns: item.addOns.map((addOn) =>
            addOn.id === addOnId
              ? {
                  ...addOn,
                  quantity:
                    patch.quantity !== undefined
                      ? toPositiveInt(patch.quantity, 1)
                      : addOn.quantity,
                  unitPrice:
                    patch.unitPrice !== undefined
                      ? roundMoney(Math.max(0, patch.unitPrice))
                      : addOn.unitPrice,
                }
              : addOn,
          ),
        };
      }),
    );
  };

  const removeItem = (itemId: string) => {
    setItems((current) => current.filter((item) => item.id !== itemId));
  };

  const removeItemAddOn = (itemId: string, addOnId: string) => {
    setItems((current) =>
      current.map((item) =>
        item.id === itemId
          ? {
              ...item,
              addOns: item.addOns.filter((addOn) => addOn.id !== addOnId),
            }
          : item,
      ),
    );
  };

  const saveOrder = async () => {
    if (savingOrder) return;
    if (!orderReference.trim()) {
      toast.error("Nomor order / resi platform wajib diisi.");
      return;
    }
    if (!customerName.trim()) {
      toast.error("Nama pembeli wajib diisi.");
      return;
    }
    if (!shippingMethod.trim()) {
      toast.error("Metode pengiriman wajib diisi.");
      return;
    }
    if (items.length === 0) {
      toast.error("Daftar item masih kosong.");
      return;
    }

    const invalidItem = items.find((item) => !item.productId);
    if (invalidItem) {
      toast.error(
        `Produk "${invalidItem.displayName}" belum terhubung ke data produk bisnis.`,
      );
      return;
    }

    setSavingOrder(true);
    try {
      const response = await fetch("/api/marketplace/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          platform,
          orderReference,
          customerName,
          orderDate,
          shipDate,
          shippingMethod,
          customerNotes,
          items: items.map((item) => ({
            productId: item.productId,
            category: item.selection.category,
            subcategory: item.selection.subcategory,
            productName: item.selection.productName,
            size: item.selection.size,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            unitCost: item.unitCost,
            addOns: item.addOns.map((addOn) => ({
              id: addOn.id,
              label: addOn.label,
              quantity: addOn.quantity,
              unitPrice: addOn.unitPrice,
              unitCost: addOn.unitCost,
            })),
          })),
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        data?: { transactionNumber?: string };
        error?: string;
        message?: string;
      };

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Gagal menyimpan order marketplace.");
      }

      toast.success(
        payload.message ||
          `Order tersimpan sebagai ${payload.data?.transactionNumber || "transaksi marketplace"}.`,
      );

      setOrderReference("");
      setCustomerName("");
      setCustomerNotes("");
      setPasteText("");
      setItems([]);
      setOrderDate(todayDateInput());
      setShipDate(addDays(todayDateInput(), 3));
      setShippingMethod("");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Gagal menyimpan order marketplace.",
      );
    } finally {
      setSavingOrder(false);
    }
  };

  return (
    <div className="mx-auto max-w-[430px] px-4 pb-10 pt-4 text-[#2f1d12]">
      <div className="rounded-[34px] bg-[#f8efe5] px-4 pb-6 pt-3 shadow-[0_26px_55px_-42px_rgba(94,53,30,0.6)]">
        <div className="border-b border-[#decec1] pb-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex items-start gap-2 text-left"
          >
            <ArrowLeft className="mt-1 h-4 w-4 text-[#8c5a3c]" />
            <div>
              <h1 className="text-[1.02rem] font-extrabold leading-none text-[#1f120b]">
                Input Order E-Commerce
              </h1>
              <p className="mt-1 text-[11px] text-[#b1764f]">Tokopedia &amp; Shopee</p>
            </div>
          </button>
        </div>

        <section className="mt-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#b06e43]">
            Platform
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setPlatform("tokopedia")}
              className={`rounded-[16px] border px-3 py-4 text-center transition ${
                platform === "tokopedia"
                  ? "border-[#29b34a] bg-[#eaf8ee] shadow-[inset_0_0_0_1px_rgba(41,179,74,0.18)]"
                  : "border-[#dcc8b8] bg-white"
              }`}
            >
              <div className="mx-auto h-5 w-5 rounded-full bg-[radial-gradient(circle_at_30%_30%,#98f6bc,#3aa25c_65%,#1f7e42)]" />
              <p className="mt-2 text-sm font-bold text-[#1d140e]">Tokopedia</p>
            </button>
            <button
              type="button"
              onClick={() => setPlatform("shopee")}
              className={`rounded-[16px] border px-3 py-4 text-center transition ${
                platform === "shopee"
                  ? "border-[#f28b57] bg-[#fff3ed] shadow-[inset_0_0_0_1px_rgba(242,139,87,0.15)]"
                  : "border-[#dcc8b8] bg-white"
              }`}
            >
              <div className="mx-auto text-xl leading-none text-[#f06c2d]">♥</div>
              <p className="mt-1 text-sm font-bold text-[#1d140e]">Shopee</p>
            </button>
          </div>
        </section>

        <section className="mt-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#b06e43]">
            Informasi Order
          </p>
          <div className="mt-3 overflow-hidden rounded-[20px] border border-[#dcc8b8] bg-[#fffaf6]">
            <div className="grid gap-4 px-4 py-4">
              <label className="grid gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#b06e43]">
                  Nomor Order / Resi Platform
                </span>
                <Input
                  value={orderReference}
                  onChange={(event) => setOrderReference(event.target.value)}
                  placeholder="Contoh: INV/20260429/MPL/123456789"
                  className="h-11 rounded-[12px] border-[#d7c0ae] bg-[#fbf2e8] text-[#6a4128] shadow-none"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#b06e43]">
                  Nama Pembeli
                </span>
                <Input
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                  placeholder="Nama customer di platform"
                  className="h-11 rounded-[12px] border-[#d7c0ae] bg-[#fbf2e8] text-[#6a4128] shadow-none"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#b06e43]">
                  Tanggal Order Masuk
                </span>
                <Input
                  type="date"
                  value={orderDate}
                  onChange={(event) => setOrderDate(event.target.value)}
                  className="h-11 rounded-[12px] border-[#d7c0ae] bg-white shadow-none"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#b06e43]">
                  Estimasi Tanggal Kirim
                </span>
                <Input
                  type="date"
                  value={shipDate}
                  onChange={(event) => setShipDate(event.target.value)}
                  className="h-11 rounded-[12px] border-[#d7c0ae] bg-white shadow-none"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#b06e43]">
                  Metode Pengiriman
                </span>
                <Select
                  value={shippingMethod}
                  onChange={(event) => setShippingMethod(event.target.value)}
                  className="h-11 rounded-[12px] border-[#d7c0ae] bg-white shadow-none"
                >
                  <option value="">Pilih metode pengiriman...</option>
                  {SHIPPING_METHOD_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="grid gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#b06e43]">
                  Notes Dari Customer
                </span>
                <Textarea
                  value={customerNotes}
                  onChange={(event) => setCustomerNotes(event.target.value)}
                  placeholder="Contoh: tolong dikemas bubble wrap dobel, ada note ucapan di dalam..."
                  className="min-h-[92px] rounded-[12px] border-[#d7c0ae] bg-[#fbf2e8] text-[#6a4128] shadow-none focus-visible:ring-[#c57b49]"
                />
              </label>
            </div>
          </div>
        </section>

        <section className="mt-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#b06e43]">
            Input Produk
          </p>
          <div className="mt-3 overflow-hidden rounded-[20px] border border-[#dcc8b8] bg-[#fffaf6]">
            <div className="flex items-center justify-between border-b border-[#e7d8cc] px-4 py-3">
              <p className="text-sm font-bold text-[#1d140e]">Paste dari Platform</p>
              <p className="text-[11px] text-[#c08965]">atau input manual di bawah</p>
            </div>
            <div className="px-4 py-4">
              <label className="grid gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#b06e43]">
                  Paste Nama Produk Dari Tokopedia / TikTok / Shopee
                </span>
                <Textarea
                  value={pasteText}
                  onChange={(event) => setPasteText(event.target.value)}
                  placeholder={`Contoh:
Custom Cookies - Hard - Tema Floral x2
Real Cake Custom - Double Choco x1
Add-On: Dark Color x1`}
                  className="min-h-[132px] rounded-[12px] border-[#d7c0ae] bg-[#fbf2e8] text-[#af7b57] shadow-none focus-visible:ring-[#c57b49]"
                />
              </label>
            </div>
            <div className="flex gap-3 border-t border-[#e7d8cc] px-4 py-3">
              <button
                type="button"
                onClick={parseProducts}
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-[12px] bg-[#2d1a11] text-sm font-bold text-white transition hover:bg-[#3d261a]"
              >
                <Bolt className="h-4 w-4" />
                Parse Produk
              </button>
              <button
                type="button"
                onClick={clearPaste}
                className="h-12 rounded-[12px] border border-[#d7c0ae] bg-white px-4 text-sm font-medium text-[#8c5a3c]"
              >
                Clear
              </button>
            </div>

            <div ref={manualSectionRef} className="border-t border-[#eaded4] px-4 py-4">
              <p className="text-sm font-bold text-[#1d140e]">Input Manual</p>
              {productCatalog.length === 0 ? (
                <div className="mt-3 flex items-center gap-2 rounded-[14px] border border-[#e2d0c1] bg-white px-3 py-3 text-sm text-[#8c5a3c]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Menyiapkan catalog marketplace...
                </div>
              ) : (
                <div className="mt-3 grid gap-3">
                  {loadingCatalog ? (
                    <p className="text-[11px] text-[#c08965]">
                      Sinkronisasi mapping produk sedang berjalan...
                    </p>
                  ) : null}
                  <Select
                    value={draftSelection.category}
                    onChange={(event) =>
                      updateDraftSelection({ category: event.target.value })
                    }
                    className="h-11 rounded-[12px] border-[#d7c0ae] bg-white shadow-none"
                  >
                    {getCategoryOptions(productCatalog).map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </Select>
                  <Select
                    value={draftSelection.subcategory}
                    onChange={(event) =>
                      updateDraftSelection({ subcategory: event.target.value })
                    }
                    className="h-11 rounded-[12px] border-[#d7c0ae] bg-white shadow-none"
                  >
                    {(currentCategory?.subcategories ?? []).map((subcategory) => (
                      <option key={subcategory.name} value={subcategory.name}>
                        {subcategory.name}
                      </option>
                    ))}
                  </Select>
                  <Select
                    value={draftSelection.productName}
                    onChange={(event) =>
                      updateDraftSelection({ productName: event.target.value })
                    }
                    className="h-11 rounded-[12px] border-[#d7c0ae] bg-white shadow-none"
                  >
                    {(currentSubcategory?.products ?? []).map((product) => (
                      <option key={product.name} value={product.name}>
                        {product.name}
                      </option>
                    ))}
                  </Select>
                  <Select
                    value={draftSelection.size}
                    onChange={(event) =>
                      updateDraftSelection({ size: event.target.value })
                    }
                    className="h-11 rounded-[12px] border-[#d7c0ae] bg-white shadow-none"
                  >
                    {(currentProduct?.variants ?? []).map((variant) => (
                      <option key={variant.label} value={variant.label}>
                        {variant.label}
                      </option>
                    ))}
                  </Select>

                  <div className="grid grid-cols-[1fr,92px] gap-3">
                    <Input
                      type="number"
                      min={1}
                      value={draftQuantity}
                      onChange={(event) =>
                        setDraftQuantity(toPositiveInt(event.target.value, 1))
                      }
                      placeholder="Qty"
                      className="h-11 rounded-[12px] border-[#d7c0ae] bg-white shadow-none"
                    />
                    <Input
                      type="number"
                      min={0}
                      step="100"
                      value={draftUnitPrice}
                      onChange={(event) =>
                        setDraftUnitPrice(Math.max(0, toNumber(event.target.value)))
                      }
                      placeholder="Harga"
                      className="h-11 rounded-[12px] border-[#d7c0ae] bg-white shadow-none"
                    />
                  </div>

                  <div className="rounded-[14px] border border-[#e2d0c1] bg-[#fff7f0] p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#b06e43]">
                      Add-On Sesuai Product
                    </p>
                    <div className="mt-2 grid grid-cols-[1fr,88px,auto] gap-2">
                      <Select
                        value={pendingAddOnId}
                        onChange={(event) => setPendingAddOnId(event.target.value)}
                        className="h-10 rounded-[12px] border-[#d7c0ae] bg-white shadow-none"
                      >
                        <option value="">Pilih add-on...</option>
                        {availableAddOns.map((addOn) => (
                          <option key={addOn.id} value={addOn.id}>
                            {addOn.label}
                          </option>
                        ))}
                      </Select>
                      <Input
                        type="number"
                        min={1}
                        value={pendingAddOnQty}
                        onChange={(event) =>
                          setPendingAddOnQty(toPositiveInt(event.target.value, 1))
                        }
                        className="h-10 rounded-[12px] border-[#d7c0ae] bg-white shadow-none"
                      />
                      <Button
                        onClick={addDraftAddOn}
                        className="h-10 rounded-[12px] bg-[#d26a31] px-4 text-white hover:bg-[#bf5921]"
                      >
                        + Add
                      </Button>
                    </div>
                    {draftAddOns.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {draftAddOns.map((addOn) => (
                          <div
                            key={addOn.id}
                            className="flex items-center justify-between rounded-[12px] bg-white px-3 py-2 text-sm text-[#5f3a24]"
                          >
                            <span>
                              {addOn.label} x{addOn.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeDraftAddOn(addOn.id)}
                              className="text-[#d26a31]"
                            >
                              Hapus
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <Button
                    onClick={addManualItem}
                    disabled={loadingCatalog}
                    className="h-12 rounded-[12px] bg-[#d26a31] text-base font-bold text-white hover:bg-[#c05b24]"
                  >
                    Tambah ke Daftar
                  </Button>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="mt-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#b06e43]">
            Daftar Item
          </p>
          <div className="mt-3 overflow-hidden rounded-[20px] border border-[#dcc8b8] bg-[#fffaf6]">
            <div className="flex items-center justify-between border-b border-[#e7d8cc] px-4 py-3">
              <p className="text-sm font-bold text-[#1d140e]">
                {items.length} item
              </p>
              <button
                type="button"
                onClick={() =>
                  manualSectionRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                  })
                }
                className="inline-flex items-center gap-1 rounded-full bg-[#d26a31] px-3 py-1 text-[11px] font-bold text-white"
              >
                <Plus className="h-3 w-3" />
                Tambah Item
              </button>
            </div>

            <div className="grid grid-cols-[1fr,62px,86px,34px] gap-2 border-b border-[#e7d8cc] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#b06e43]">
              <span>Nama Produk</span>
              <span>Qty</span>
              <span>Harga/Pcs</span>
              <span />
            </div>

            {items.length === 0 ? (
              <div className="px-4 py-6 text-sm text-[#9b7154]">
                Belum ada item yang diparse atau ditambahkan manual.
              </div>
            ) : (
              <div>
                {items.map((item) => (
                  <div key={item.id} className="border-b border-[#f0e4da]">
                    <div className="grid grid-cols-[1fr,62px,86px,34px] gap-2 px-4 py-3">
                      <div>
                        <p className="rounded-[10px] border border-[#dfc6b4] bg-[#fff6ef] px-3 py-2 text-sm text-[#2c1d14]">
                          {item.displayName}
                        </p>
                        <p className="mt-1 text-[10px] text-[#aa7a58]">
                          {item.selection.category} • {item.source === "parsed" ? "Parsed" : "Manual"}
                        </p>
                      </div>
                      <Input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(event) =>
                          updateItem(item.id, {
                            quantity: toPositiveInt(event.target.value, 1),
                          })
                        }
                        className="h-10 rounded-[10px] border-[#dfc6b4] bg-white px-2 text-center shadow-none"
                      />
                      <Input
                        type="number"
                        min={0}
                        step="100"
                        value={item.unitPrice}
                        onChange={(event) =>
                          updateItem(item.id, {
                            unitPrice: Math.max(0, toNumber(event.target.value)),
                          })
                        }
                        className="h-10 rounded-[10px] border-[#dfc6b4] bg-white px-2 text-center shadow-none"
                      />
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="flex h-10 items-center justify-center rounded-[10px] bg-[#ffe6e6] text-[#d15a5a]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {item.addOns.map((addOn) => (
                      <div
                        key={`${item.id}-${addOn.id}`}
                        className="grid grid-cols-[1fr,62px,86px,34px] gap-2 bg-[#eef5ff] px-4 py-3"
                      >
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#4c79a2]">
                            Add-On
                          </p>
                          <p className="rounded-[10px] border border-[#c8d8ea] bg-white px-3 py-2 text-sm text-[#2c1d14]">
                            {addOn.label}
                          </p>
                        </div>
                        <Input
                          type="number"
                          min={1}
                          value={addOn.quantity}
                          onChange={(event) =>
                            updateItemAddOn(item.id, addOn.id, {
                              quantity: toPositiveInt(event.target.value, 1),
                            })
                          }
                          className="h-10 rounded-[10px] border-[#c8d8ea] bg-white px-2 text-center shadow-none"
                        />
                        <Input
                          type="number"
                          min={0}
                          step="100"
                          value={addOn.unitPrice}
                          onChange={(event) =>
                            updateItemAddOn(item.id, addOn.id, {
                              unitPrice: Math.max(0, toNumber(event.target.value)),
                            })
                          }
                          className="h-10 rounded-[10px] border-[#c8d8ea] bg-white px-2 text-center shadow-none"
                        />
                        <button
                          type="button"
                          onClick={() => removeItemAddOn(item.id, addOn.id)}
                          className="flex h-10 items-center justify-center rounded-[10px] bg-[#ffe6e6] text-[#d15a5a]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between bg-[#fff0e6] px-4 py-4">
              <p className="text-lg font-bold text-[#8d3b10]">Total Income</p>
              <p className="text-2xl font-extrabold text-[#8d3b10]">
                {formatRupiah(totalIncome)}
              </p>
            </div>
          </div>
        </section>

        <div className="mt-5 rounded-[16px] border border-[#e0ad47] bg-[#fff8e9] px-4 py-3 text-[12px] leading-5 text-[#8f6424]">
          Order e-commerce dicatat terpisah dari order WA. Data ini hanya masuk
          ke laporan keuangan marketplace dan tidak membuat booking order baru.
        </div>

        <button
          type="button"
          onClick={saveOrder}
          disabled={savingOrder || loadingCatalog}
          className="mt-5 flex h-14 w-full items-center justify-center rounded-[16px] bg-[#d26a31] text-xl font-extrabold text-white transition hover:bg-[#bf5921] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {savingOrder ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Menyimpan...
            </>
          ) : (
            "✓ Simpan Order"
          )}
        </button>
        <p className="mt-3 text-center text-[11px] text-[#c18b66]">
          Order tersimpan ke catatan omzet marketplace sesuai estimasi tanggal kirim.
        </p>
      </div>
    </div>
  );
}

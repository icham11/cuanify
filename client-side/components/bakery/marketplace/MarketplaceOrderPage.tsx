"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bolt, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  buildBookingAutoFillFromParsed,
  buildWhatsAppTemplate,
  formatParsedWhatsAppForNotes,
  parseWhatsAppOrderText,
  type BookingFormAutoFill,
} from "@/lib/bookings/whatsapp-parser";
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
  minimumOrder: number;
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
const MARKETPLACE_PARSE_TEMPLATE = buildWhatsAppTemplate("buket");

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

function findVariantBySelection(
  selection: CatalogSelection,
  variants: CatalogVariantRecord[],
): CatalogVariantRecord | null {
  const exactMatch =
    variants.find(
      (variant) =>
        variant.category === selection.category &&
        variant.subcategory === selection.subcategory &&
        variant.productName === selection.productName &&
        variant.size === selection.size,
    ) ?? null;

  if (exactMatch) return exactMatch;

  const normalizedCategory = normalizeText(selection.category);
  const normalizedSubcategory = normalizeText(selection.subcategory);
  const normalizedProductName = normalizeText(selection.productName);
  const normalizedSize = normalizeText(selection.size);

  return (
    variants.find(
      (variant) =>
        normalizeText(variant.category) === normalizedCategory &&
        normalizeText(variant.subcategory) === normalizedSubcategory &&
        normalizeText(variant.productName) === normalizedProductName &&
        normalizeText(variant.size) === normalizedSize,
    ) ?? null
  );
}

function mapParsedShippingMethodToMarketplace(
  formValue: BookingFormAutoFill["deliveryMethod"] | "",
  rawValue: string,
) {
  switch (formValue) {
    case "PICKUP":
      return "Pickup Point";
    case "CUSTOMER_APP_COURIER":
    case "ASSISTED_GOSEND":
    case "ASSISTED_GRAB":
    case "ASSISTED_GOCAR":
    case "ASSISTED_SAME_DAY":
      return "Instant / Same Day";
    case "REGULAR_JNE_JNT":
      return "Regular";
    case "ASSISTED_PAXEL":
      return "Kurir Toko";
    default:
      break;
  }

  const normalized = normalizeText(rawValue);
  if (!normalized) return "";
  if (
    /(instan|instant|same day|sameday|gosend|grab|gocar|kurir toko|shopee instan)/i.test(
      normalized,
    )
  ) {
    return "Instant / Same Day";
  }
  if (/(regular|jne|jnt|anteraja|si cepat|sicepat)/i.test(normalized)) {
    return "Regular";
  }
  if (/cargo/i.test(normalized)) {
    return "Cargo";
  }
  if (/(pickup|ambil sendiri|pick up)/i.test(normalized)) {
    return "Pickup Point";
  }
  if (/(paxel|kurir)/i.test(normalized)) {
    return "Kurir Toko";
  }
  return "";
}

function mapAutoFillItemsToMarketplaceGroups(args: {
  autoFillItems: BookingFormAutoFill["items"];
  variants: CatalogVariantRecord[];
  addOnCatalog: Record<string, CatalogAddOn[]>;
}): { groups: MarketplaceItemGroup[]; unmatchedCount: number } {
  const groups: MarketplaceItemGroup[] = [];
  let unmatchedCount = 0;

  args.autoFillItems.forEach((item) => {
    const variant =
      findVariantBySelection(
        {
          category: item.category,
          subcategory: item.subcategory,
          productName: item.productName,
          size: item.size,
        },
        args.variants,
      ) ??
      findBestVariant(
        [item.category, item.subcategory, item.productName, item.size, item.notes]
          .filter(Boolean)
          .join(" "),
        args.variants,
      );

    if (!variant?.productId) {
      unmatchedCount += 1;
      return;
    }

    const availableAddOns = args.addOnCatalog[item.category] ?? [];
    const addOns: ItemAddOn[] = [];

    item.addOns.forEach((addOnId) => {
      const matchedAddOn =
        availableAddOns.find(
          (candidate) =>
            candidate.id === addOnId ||
            normalizeText(candidate.id) === normalizeText(addOnId) ||
            normalizeText(candidate.label) === normalizeText(addOnId),
        ) ?? null;
      if (!matchedAddOn) return;

      const quantity = toPositiveInt(item.addOnQuantities?.[addOnId] ?? 1, 1);
      addOns.push({
        id: matchedAddOn.id,
        label: matchedAddOn.label,
        quantity,
        unitPrice: roundMoney(
          Math.max(
            0,
            Number(item.addOnPriceOverrides?.[addOnId] ?? matchedAddOn.price ?? 0),
          ),
        ),
        unitCost: roundMoney(Math.max(0, Number(matchedAddOn.cogs ?? 0))),
      });
    });

    item.customAddOns?.forEach((customAddOn, index) => {
      if (!customAddOn.label.trim()) return;
      addOns.push({
        id: `custom-${normalizeText(customAddOn.label).replace(/\s+/g, "-") || index + 1}`,
        label: customAddOn.label.trim(),
        quantity: 1,
        unitPrice: roundMoney(Math.max(0, Number(customAddOn.price || 0))),
        unitCost: 0,
      });
    });

    groups.push({
      id: makeId(),
      selection: buildSelectionFromVariant(variant),
      displayName: variant.displayName,
      productId: variant.productId,
      quantity: toPositiveInt(item.quantity, 1),
      unitPrice: roundMoney(
        Math.max(
          0,
          Number(item.parsedUnitPrice ?? variant.price ?? 0),
        ),
      ),
      unitCost: roundMoney(Math.max(0, Number(variant.cogs ?? 0))),
      addOns,
      source: "parsed",
      rawLine: item.notes || item.productName,
    });
  });

  return { groups, unmatchedCount };
}

function getGroupSubtotal(group: MarketplaceItemGroup) {
  const productTotal = group.quantity * group.unitPrice;
  const addOnTotal = group.addOns.reduce(
    (sum, addOn) => sum + addOn.quantity * addOn.unitPrice,
    0,
  );
  return productTotal + addOnTotal;
}

function getMinimumOrderViolationText(args: {
  productName: string;
  quantity: number;
  minimumOrder: number;
}) {
  if (args.minimumOrder <= 0 || args.quantity >= args.minimumOrder) return null;
  return `Minimal order ${args.productName} adalah ${args.minimumOrder} pcs. Qty sekarang ${args.quantity}.`;
}

function getCategoryOptions(productCatalog: PricelistCategory[]) {
  return productCatalog.map((entry) => entry.category);
}

function normalizeMarketplaceVariantRecord(
  variant: CatalogVariantRecord,
): CatalogVariantRecord {
  if (variant.subcategory !== "Event Cookies") return variant;
  return {
    ...variant,
    category: "Seasonal Event",
  };
}

function buildProductCatalogFromLiveVariants(
  variants: CatalogVariantRecord[],
): PricelistCategory[] {
  const categories = new Map<
    string,
    {
      category: PricelistCategory;
      subcategories: Map<
        string,
        {
          subcategory: PricelistCategory["subcategories"][number];
          products: Map<
            string,
            PricelistCategory["subcategories"][number]["products"][number]
          >;
        }
      >;
    }
  >();

  variants.forEach((variant) => {
      let categoryEntry = categories.get(variant.category);
      if (!categoryEntry) {
        categoryEntry = {
          category: {
            category: variant.category,
            keywords: [],
            subcategories: [],
          },
          subcategories: new Map(),
        };
        categories.set(variant.category, categoryEntry);
      }

      let subcategoryEntry = categoryEntry.subcategories.get(variant.subcategory);
      if (!subcategoryEntry) {
        subcategoryEntry = {
          subcategory: {
            name: variant.subcategory,
            keywords: [],
            products: [],
          },
          products: new Map(),
        };
        categoryEntry.subcategories.set(variant.subcategory, subcategoryEntry);
        categoryEntry.category.subcategories.push(subcategoryEntry.subcategory);
      }

      let productEntry = subcategoryEntry.products.get(variant.productName);
      if (!productEntry) {
        productEntry = {
          name: variant.productName,
          keywords: [],
          variants: [],
          defaultVariant: variant.size,
        };
        subcategoryEntry.products.set(variant.productName, productEntry);
        subcategoryEntry.subcategory.products.push(productEntry);
      }

      const hasVariant = productEntry.variants.some(
        (entry) => entry.label === variant.size,
      );
      if (hasVariant) return;

      productEntry.variants.push({
        label: variant.size,
        price: variant.price,
        keywords: [variant.displayName],
      });
    });

  return Array.from(categories.values()).map((entry) => entry.category);
}

export default function MarketplaceOrderPage() {
  const router = useRouter();
  const manualSectionRef = useRef<HTMLDivElement | null>(null);
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
    const handleFocus = () => {
      void loadCatalog();
    };
    window.addEventListener("focus", handleFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  const liveVariants = useMemo(
    () =>
      (catalog?.variants ?? [])
        .filter((variant) => variant.productId !== null)
        .map(normalizeMarketplaceVariantRecord),
    [catalog],
  );
  const productCatalog = useMemo(
    () => buildProductCatalogFromLiveVariants(liveVariants),
    [liveVariants],
  );
  const addOnCatalog = useMemo(() => catalog?.addOnCatalog ?? {}, [catalog]);

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
    liveVariants.find(
      (variant) =>
        variant.category === draftSelection.category &&
        variant.subcategory === draftSelection.subcategory &&
        variant.productName === draftSelection.productName &&
        variant.size === draftSelection.size,
    ) ?? null;
  const availableAddOns = addOnCatalog[draftSelection.category] ?? [];
  const pendingAddOnOption =
    availableAddOns.find((addOn) => addOn.id === pendingAddOnId) ?? null;
  const currentVariantMinimumOrder = Math.max(
    0,
    Number(currentVariant?.minimumOrder ?? 0),
  );
  useEffect(() => {
    if (liveVariants.length === 0) return;
    const nextVariant = liveVariants.find(
      (variant) =>
        variant.category === draftSelection.category &&
        variant.subcategory === draftSelection.subcategory &&
        variant.productName === draftSelection.productName &&
        variant.size === draftSelection.size,
    );
    if (!nextVariant) return;
    setDraftUnitPrice(nextVariant.price);
    setDraftUnitCost(nextVariant.cogs);
  }, [draftSelection, liveVariants]);
  const totalIncome = items.reduce((sum, item) => sum + getGroupSubtotal(item), 0);
  const minimumOrderViolations = items
    .map((item) => {
      const variant = liveVariants.find(
        (entry) =>
          entry.productId === item.productId &&
          entry.category === item.selection.category &&
          entry.subcategory === item.selection.subcategory &&
          entry.productName === item.selection.productName &&
          entry.size === item.selection.size,
      );
      const minimumOrder = Math.max(0, Number(variant?.minimumOrder ?? 0));
      const message = getMinimumOrderViolationText({
        productName: item.displayName,
        quantity: item.quantity,
        minimumOrder,
      });
      if (!message) return null;
      return { itemId: item.id, minimumOrder, message };
    })
    .filter(Boolean) as Array<{ itemId: string; minimumOrder: number; message: string }>;

  const updateDraftSelection = (partial: Partial<CatalogSelection>) => {
    if (productCatalog.length === 0) return;
    const nextSelection = ensureCatalogSelectionFromCatalog(productCatalog, {
      ...draftSelection,
      ...partial,
    });
    const nextVariant =
      liveVariants.find(
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

    const nextQuantity = toPositiveInt(draftQuantity, 1);
    const minimumOrderWarning = getMinimumOrderViolationText({
      productName: currentVariant.displayName,
      quantity: nextQuantity,
      minimumOrder: currentVariantMinimumOrder,
    });
    if (minimumOrderWarning) {
      toast.error(minimumOrderWarning);
      return;
    }

    setItems((current) => [
      ...current,
      {
        id: makeId(),
        selection: draftSelection,
        displayName: currentVariant.displayName,
        productId: currentVariant.productId,
        quantity: nextQuantity,
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

    const parsedWhatsAppOrder = parseWhatsAppOrderText(pasteText, {
      preferredOrderType: "unknown",
      sourceType: "manual",
    });
    const bookingAutoFill = buildBookingAutoFillFromParsed(parsedWhatsAppOrder, {
      productCatalog,
      addOnCatalog,
    });
    const hasStructuredTemplateFields = Boolean(
      parsedWhatsAppOrder.common.deliveryDate ||
        parsedWhatsAppOrder.common.bookingCode ||
        parsedWhatsAppOrder.common.deliveryTime ||
        parsedWhatsAppOrder.common.deliveryMethod ||
        parsedWhatsAppOrder.common.recipientName ||
        parsedWhatsAppOrder.common.recipientPhone ||
        parsedWhatsAppOrder.common.fullAddress ||
        Object.values(parsedWhatsAppOrder.details).some(Boolean),
    );
    const templateMapped = mapAutoFillItemsToMarketplaceGroups({
      autoFillItems: bookingAutoFill.items,
      variants: liveVariants,
      addOnCatalog,
    });

    if (hasStructuredTemplateFields && templateMapped.groups.length > 0) {
      setItems((current) => [...current, ...templateMapped.groups]);

      if (parsedWhatsAppOrder.common.bookingCode.trim()) {
        setOrderReference(parsedWhatsAppOrder.common.bookingCode.trim());
      }
      if (parsedWhatsAppOrder.common.recipientName.trim()) {
        setCustomerName(parsedWhatsAppOrder.common.recipientName.trim());
      }
      if (bookingAutoFill.deliveryDate) {
        setShipDate(bookingAutoFill.deliveryDate);
      }

      const mappedShippingMethod = mapParsedShippingMethodToMarketplace(
        bookingAutoFill.deliveryMethod,
        parsedWhatsAppOrder.common.deliveryMethod,
      );
      if (mappedShippingMethod) {
        setShippingMethod(mappedShippingMethod);
      }

      const parsedNotes = [
        bookingAutoFill.customNotes.trim(),
        formatParsedWhatsAppForNotes(parsedWhatsAppOrder).trim(),
      ]
        .filter((value, index, list) => value && list.indexOf(value) === index)
        .join("\n\n")
        .trim();
      if (parsedNotes) {
        setCustomerNotes(parsedNotes);
      }

      toast.success(
        templateMapped.unmatchedCount > 0
          ? `${templateMapped.groups.length} item dari template booking berhasil diparse, ${templateMapped.unmatchedCount} item perlu dicek manual.`
          : `${templateMapped.groups.length} item dari template booking berhasil diparse.`,
      );
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
      const variantMatch = findBestVariant(line, liveVariants);
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

    if (minimumOrderViolations.length > 0) {
      toast.error(minimumOrderViolations[0].message);
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
    <div className="mx-auto max-w-7xl px-3 pb-10 pt-4 text-[#2f1d12] sm:px-4">
      <div className="rounded-[34px] border border-[#e4d2c4] bg-[#f8efe5] px-4 pb-6 pt-3 shadow-[0_26px_55px_-42px_rgba(94,53,30,0.6)] sm:px-5 xl:px-6">
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

        <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(340px,0.9fr)_minmax(0,1.1fr)] xl:items-start">
          <div className="space-y-6 xl:sticky xl:top-4">
            <section>
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

            <section>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#b06e43]">
                Informasi Order
              </p>
              <div className="mt-3 overflow-hidden rounded-[20px] border border-[#dcc8b8] bg-[#fffaf6]">
                <div className="grid gap-4 px-4 py-4 md:grid-cols-2">
                  <label className="grid gap-1 md:col-span-2">
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
                  <label className="grid gap-1 md:col-span-2">
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
                  <label className="grid gap-1 md:col-span-2">
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
                  <label className="grid gap-1 md:col-span-2">
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
          </div>

          <div className="space-y-6">
            <section>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#b06e43]">
                    Input Produk
                  </p>
                  <p className="mt-1 text-xs text-[#b7835f]">
                    Parse daftar platform atau tambah item manual, lalu cek total sebelum simpan.
                  </p>
                </div>
                <div className="rounded-full bg-[#fff0e2] px-3 py-1 text-xs font-semibold text-[#b15d2f]">
                  {items.length} item tersusun
                </div>
              </div>
              <div className="mt-3 overflow-hidden rounded-[20px] border border-[#dcc8b8] bg-[#fffaf6]">
            <div className="flex items-center justify-between border-b border-[#e7d8cc] px-4 py-3">
              <p className="text-sm font-bold text-[#1d140e]">Paste dari Platform</p>
              <p className="text-[11px] text-[#c08965]">atau input manual di bawah</p>
            </div>
            <div className="px-4 py-4">
              <label className="grid gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#b06e43]">
                  Paste Template Booking / Detail Produk Platform
                </span>
                <Textarea
                  value={pasteText}
                  onChange={(event) => setPasteText(event.target.value)}
                  placeholder={MARKETPLACE_PARSE_TEMPLATE}
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
              {loadingCatalog ? (
                <div className="mt-3 flex items-center gap-2 rounded-[14px] border border-[#e2d0c1] bg-white px-3 py-3 text-sm text-[#8c5a3c]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Menyiapkan catalog marketplace...
                </div>
              ) : productCatalog.length === 0 ? (
                <div className="mt-3 rounded-[14px] border border-[#e2d0c1] bg-white px-3 py-3 text-sm text-[#8c5a3c]">
                  Belum ada produk aktif yang siap dipakai untuk order e-commerce.
                </div>
              ) : (
                <div className="mt-3 grid gap-3">
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

                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
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
                    <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_88px_auto]">
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
                  {currentVariantMinimumOrder > 0 ? (
                    <p className="text-[11px] text-[#9c643f]">
                      Minimal order untuk item ini: {currentVariantMinimumOrder} pcs.
                    </p>
                  ) : null}
                </div>
              )}
            </div>
              </div>
            </section>

            <section>
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

            <div className="hidden grid-cols-[minmax(0,1fr)_72px_104px_40px] gap-2 border-b border-[#e7d8cc] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#b06e43] sm:grid">
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
                    <div className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_72px_104px_40px]">
                      <div>
                        <p className="rounded-[10px] border border-[#dfc6b4] bg-[#fff6ef] px-3 py-2 text-sm text-[#2c1d14]">
                          {item.displayName}
                        </p>
                        <p className="mt-1 text-[10px] text-[#aa7a58]">
                          {item.selection.category} • {item.source === "parsed" ? "Parsed" : "Manual"}
                        </p>
                        {(() => {
                          const violation = minimumOrderViolations.find(
                            (entry) => entry.itemId === item.id,
                          );
                          if (!violation) return null;
                          return (
                            <p className="mt-1 text-[10px] font-semibold text-[#c04b2f]">
                              {violation.message}
                            </p>
                          );
                        })()}
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
                        className="flex h-10 items-center justify-center rounded-[10px] bg-[#ffe6e6] text-[#d15a5a] sm:w-auto"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {item.addOns.map((addOn) => (
                      <div
                        key={`${item.id}-${addOn.id}`}
                        className="grid gap-2 bg-[#eef5ff] px-4 py-3 sm:grid-cols-[minmax(0,1fr)_72px_104px_40px]"
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

            <div className="rounded-[16px] border border-[#e0ad47] bg-[#fff8e9] px-4 py-3 text-[12px] leading-5 text-[#8f6424]">
              Order e-commerce dicatat terpisah dari order WA. Data ini hanya masuk
              ke laporan keuangan marketplace dan tidak membuat booking order baru.
            </div>

            <button
              type="button"
              onClick={saveOrder}
              disabled={savingOrder || loadingCatalog}
              className="flex h-14 w-full items-center justify-center rounded-[16px] bg-[#d26a31] text-xl font-extrabold text-white transition hover:bg-[#bf5921] disabled:cursor-not-allowed disabled:opacity-60"
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
            <p className="text-center text-[11px] text-[#c18b66]">
              Order tersimpan ke catatan omzet marketplace sesuai estimasi tanggal kirim.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

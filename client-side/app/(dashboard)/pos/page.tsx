"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import {
  ShoppingCart,
  Search,
  X,
  CreditCard,
  Banknote,
  Minus,
  Plus,
  Trash2,
  Clock,
  CalendarDays,
  Package,
  AlertCircle,
  CheckCircle2,
  User,
  Mail,
  Phone,
  ChevronDown,
  Receipt,
  BookOpen,
  LogOut,
  DollarSign,
} from "lucide-react";
import { useShift } from "@/context/ShiftContext";

// ─── Types ───
interface RecipeIngredient {
  ingredient: {
    id: number;
    name: string;
    unit: string;
    currentStock: number | string; // Prisma Decimal → string in JSON
  };
  quantity: number | string; // Prisma Decimal → string in JSON
}

interface Product {
  id: number;
  name: string;
  sellingPrice: number | string;
  categoryId: number | null;
  isActive: boolean;
  productType?: "ReadyStock" | "PreOrder";
  availableStock?: number; // for ReadyStock products
  category?: { id: number; name: string } | null;
  recipes?: RecipeIngredient[];
  recipeCost?: number | string;
}

interface CartItem {
  productId: number;
  name: string;
  price: number;
  quantity: number;
}

// ─── Helpers ───
const formatRupiah = (val: number) => `Rp ${val.toLocaleString("id-ID")}`;

/**
 * Compute ingredient availability for a product.
 *
 * Without `reservedStock`: returns raw maxQty based on currentStock (DB value).
 * With `reservedStock`: deducts ingredient qty already claimed by OTHER cart items,
 *   then returns total maxQty this product could occupy (for the ENTIRE cart).
 *
 * Key design:
 *   reservedStock should EXCLUDE the product's own cart reservation so that
 *   maxQty = "how many total of THIS product can be supported given OTHER items".
 */
function getProductAvailability(
  product: Product,
  reservedByOthers?: Map<number, number>,
): { available: boolean; maxQty: number; missingIngredients: string[] } {
  // ReadyStock: availability based on produced quantity, not ingredients
  if (product.productType === "ReadyStock") {
    const stock = product.availableStock ?? 0;
    // reservedByOthers uses productId as key for ReadyStock
    const reserved = reservedByOthers?.get(product.id) ?? 0;
    const effectiveStock = Math.max(0, stock - reserved);
    return {
      available: effectiveStock > 0,
      maxQty: effectiveStock,
      missingIngredients: effectiveStock <= 0 ? ["Stok produksi habis"] : [],
    };
  }

  // PreOrder: availability based on ingredient stock (current behavior)
  if (!product.recipes || product.recipes.length === 0) {
    return { available: true, maxQty: 999, missingIngredients: [] };
  }

  const missing: string[] = [];
  let maxQty = Infinity;

  for (const recipe of product.recipes) {
    const realStock = Number(recipe.ingredient.currentStock) || 0;
    const reservedByOther = reservedByOthers?.get(recipe.ingredient.id) ?? 0;
    const effectiveStock = Math.max(0, realStock - reservedByOther);
    const needed = Number(recipe.quantity) || 0;

    if (needed <= 0) continue;

    const canMake = Math.floor(effectiveStock / needed);
    if (canMake <= 0) {
      missing.push(recipe.ingredient.name);
    }
    maxQty = Math.min(maxQty, canMake);
  }

  return {
    available: missing.length === 0 && maxQty > 0,
    maxQty: maxQty === Infinity ? 999 : maxQty,
    missingIngredients: missing,
  };
}

/**
 * Build a map of ingredientId/productId → total qty reserved by cart items,
 * optionally EXCLUDING a specific product.
 * ReadyStock products: reserve by productId (from availableStock)
 * PreOrder products: reserve by ingredientId (from ingredient stock)
 */
function buildReservedStock(
  cart: CartItem[],
  products: Product[],
  excludeProductId?: number,
): Map<number, number> {
  const reserved = new Map<number, number>();
  for (const cartItem of cart) {
    if (cartItem.productId === excludeProductId) continue;
    const product = products.find((p) => p.id === cartItem.productId);
    if (!product) continue;

    if (product.productType === "ReadyStock") {
      // Reserve by productId for ReadyStock
      const current = reserved.get(product.id) ?? 0;
      reserved.set(product.id, current + cartItem.quantity);
    } else {
      // Reserve by ingredientId for PreOrder
      if (!product.recipes) continue;
      for (const recipe of product.recipes) {
        const current = reserved.get(recipe.ingredient.id) ?? 0;
        reserved.set(
          recipe.ingredient.id,
          current + Number(recipe.quantity) * cartItem.quantity,
        );
      }
    }
  }
  return reserved;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Main Component ───
export default function POSPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [productsLoading, setProductsLoading] = useState(true);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<
    "Cash" | "QRIS" | "Transfer" | "Digital" | "Kasbon"
  >("Cash");
  const [paymentNotice, setPaymentNotice] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [mounted, setMounted] = useState(false);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [kasbonNotes, setKasbonNotes] = useState("");
  const [kasbonDueDate, setKasbonDueDate] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ── Shift management ──
  const {
    shift,
    isOpen: isShiftOpen,
    loading: shiftLoading,
    openShift,
    closeShift,
    refresh: refreshShift,
  } = useShift();
  const [showCloseShiftModal, setShowCloseShiftModal] = useState(false);
  const [openingCashInput, setOpeningCashInput] = useState("");
  const [actualCashInput, setActualCashInput] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [shiftActionLoading, setShiftActionLoading] = useState(false);
  const [closeResult, setCloseResult] = useState<Record<
    string,
    unknown
  > | null>(null);

  const handleOpenShift = async () => {
    const amount = Number(openingCashInput.replace(/\D/g, ""));
    if (isNaN(amount) || amount < 0) return;
    setShiftActionLoading(true);
    const res = await openShift(amount);
    setShiftActionLoading(false);
    if (res.success) {
      setOpeningCashInput("");
    } else {
      alert(res.error || "Gagal membuka shift");
    }
  };

  const handleCloseShift = async () => {
    const amount = Number(actualCashInput.replace(/\D/g, ""));
    if (isNaN(amount) || amount < 0) return;
    setShiftActionLoading(true);
    const res = await closeShift(amount, closeNotes || undefined);
    setShiftActionLoading(false);
    if (res.success) {
      setCloseResult(res.data as Record<string, unknown>);
      setActualCashInput("");
      setCloseNotes("");
    } else {
      alert(res.error || "Gagal menutup shift");
    }
  };

  // ── Keyboard shortcuts for cashier speed ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't intercept when typing in input fields (except shortcuts)
      const isInput = ["INPUT", "TEXTAREA", "SELECT"].includes(
        (e.target as HTMLElement)?.tagName,
      );

      if (e.key === "F2") {
        e.preventDefault();
        if (cart.length > 0 && paymentMethod === "Cash" && !loading) {
          handleCheckout("cash");
        }
      } else if (e.key === "F3") {
        e.preventDefault();
        if (
          cart.length > 0 &&
          paymentMethod !== "Cash" &&
          paymentMethod !== "Kasbon" &&
          !loading
        ) {
          handleCheckout("online");
        }
      } else if (e.key === "F5") {
        e.preventDefault();
        if (cart.length > 0 && paymentMethod === "Kasbon" && !loading) {
          handleCheckout("kasbon");
        }
      } else if (e.key === "F4") {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === "Escape") {
        if (isInput) {
          (e.target as HTMLElement).blur();
          setSearchQuery("");
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [cart, paymentMethod, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live clock — only starts on client to avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
    setCurrentTime(new Date());
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch products with recipe data
  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get("payment");
    if (paymentStatus === "success")
      setPaymentNotice("✅ Pembayaran berhasil!");
    else if (paymentStatus === "pending")
      setPaymentNotice("⏳ Menunggu pembayaran...");
    else if (paymentStatus === "error")
      setPaymentNotice("❌ Pembayaran gagal.");
    if (paymentStatus)
      window.history.replaceState({}, "", window.location.pathname);
  }, []);

  const fetchProducts = async () => {
    setProductsLoading(true);
    try {
      const response = await fetch("/api/products?withRecipe=true&limit=999");
      const data = await response.json();
      if (data.success) {
        const activeProducts = data.data.filter((p: Product) => p.isActive);
        // Debug: log recipe data to verify ingredients are loaded
        if (process.env.NODE_ENV === "development") {
          const withRecipes = activeProducts.filter(
            (p: Product) => p.recipes && p.recipes.length > 0,
          );
          console.log(
            `[POS] Loaded ${activeProducts.length} products, ${withRecipes.length} have recipes`,
          );
          if (withRecipes.length > 0) {
            const sample = withRecipes[0];
            console.log(
              `[POS] Sample recipe data:`,
              sample.name,
              sample.recipes,
            );
          }
        }
        setProducts(activeProducts);
      }
    } catch (error) {
      console.error("Failed to fetch products:", error);
    } finally {
      setProductsLoading(false);
    }
  };

  // Categories
  const categories = useMemo(() => {
    const cats = new Map<string, string>();
    products.forEach((p) => {
      if (p.category) cats.set(String(p.category.id), p.category.name);
    });
    return Array.from(cats.entries()).map(([id, name]) => ({ id, name }));
  }, [products]);

  // ── Precompute ingredient reservations by ALL cart items (for ingredient stock display) ──
  const allReservedStock = useMemo(
    () => buildReservedStock(cart, products),
    [cart, products],
  );

  // Filter products & sort: available first, then low stock, then unavailable
  const filteredProducts = useMemo(() => {
    const filtered = products.filter((p) => {
      const matchSearch = p.name
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
      const matchCategory =
        selectedCategory === "all" || String(p.categoryId) === selectedCategory;
      return matchSearch && matchCategory;
    });

    // Precompute availability for each product (exclude own reservation)
    const availMap = new Map<
      number,
      { available: boolean; remaining: number }
    >();
    for (const p of filtered) {
      const reservedByOthers = buildReservedStock(cart, products, p.id);
      const { available, maxQty } = getProductAvailability(p, reservedByOthers);
      const cartQty = cart.find((c) => c.productId === p.id)?.quantity || 0;
      availMap.set(p.id, { available, remaining: maxQty - cartQty });
    }

    return filtered.sort((a, b) => {
      const aa = availMap.get(a.id)!;
      const bb = availMap.get(b.id)!;
      const canAddA = aa.available && aa.remaining > 0;
      const canAddB = bb.available && bb.remaining > 0;
      if (canAddA && !canAddB) return -1;
      if (!canAddA && canAddB) return 1;
      if (canAddA && canAddB) return bb.remaining - aa.remaining;
      return 0;
    });
  }, [products, searchQuery, selectedCategory, cart]);

  // Cart operations
  const addToCart = (product: Product) => {
    // reservedByOthers excludes this product → maxQty = total capacity for this product
    const reservedByOthers = buildReservedStock(cart, products, product.id);
    const { available, maxQty } = getProductAvailability(
      product,
      reservedByOthers,
    );
    if (!available) return;

    const currentQty =
      cart.find((item) => item.productId === product.id)?.quantity || 0;
    if (currentQty >= maxQty) return; // already at max

    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id);

      if (existing) {
        return prev.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          price: Number(product.sellingPrice),
          quantity: 1,
        },
      ];
    });
  };

  const updateQuantity = (productId: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.productId !== productId) return item;
          const product = products.find((p) => p.id === productId);
          if (!product)
            return { ...item, quantity: Math.max(0, item.quantity + delta) };

          // Reserved by OTHER products in cart (exclude this one)
          const reservedByOthers = buildReservedStock(
            prev,
            products,
            productId,
          );
          const { maxQty } = getProductAvailability(product, reservedByOthers);
          const newQty = Math.max(0, Math.min(item.quantity + delta, maxQty));
          return { ...item, quantity: newQty };
        })
        .filter((item) => item.quantity > 0),
    );
  };

  const removeFromCart = (productId: number) => {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
  };

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Checkout
  const handleCheckout = async (mode: "cash" | "online" | "kasbon") => {
    if (cart.length === 0) return;

    // Guard: prevent cash mode when non-cash method is selected (and vice versa)
    if (mode === "cash" && paymentMethod !== "Cash") {
      alert("Pilih metode pembayaran Cash terlebih dahulu!");
      return;
    }
    if (
      mode === "online" &&
      (paymentMethod === "Cash" || paymentMethod === "Kasbon")
    ) {
      alert(
        "Pilih metode pembayaran online (QRIS/Transfer/Digital) terlebih dahulu!",
      );
      return;
    }

    if (mode === "online" && (!customerName.trim() || !customerEmail.trim())) {
      // Auto-expand customer form so user can fill in the required fields
      setShowCustomerForm(true);
      alert("Nama dan email wajib diisi untuk pembayaran online!");
      return;
    }

    if (mode === "kasbon" && !customerName.trim()) {
      alert("Nama pelanggan wajib diisi untuk kasbon!");
      return;
    }

    setLoading(true);
    try {
      if (mode === "online") {
        const response = await fetch("/api/sales/midtrans-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: cart.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
            })),
            paymentMethod,
            customerName,
            customerEmail,
            customerPhone: customerPhone || undefined,
          }),
        });
        const data = await response.json();
        if (data.success) {
          const { saleId, orderId, snapToken } = data.data;

          // Check if Midtrans Snap script is loaded
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const snapObj = (window as any).snap;
          if (!snapObj || typeof snapObj.pay !== "function") {
            alert("Midtrans belum siap. Coba refresh halaman dan ulangi.");
            // Cancel the pending sale
            await fetch(`/api/sales/${saleId}`, { method: "DELETE" }).catch(
              () => {},
            );
            setLoading(false);
            return;
          }

          // Keep loading=true while popup is open — setLoading(false) only on close/error
          snapObj.pay(snapToken, {
            onSuccess: (result: Record<string, unknown>) => {
              console.log("Midtrans onSuccess:", result);
              window.location.href = `/pos/payment-success?saleId=${saleId}&orderId=${orderId}&source=midtrans&status=success`;
            },
            onPending: (result: Record<string, unknown>) => {
              console.log("Midtrans onPending:", result);
              window.location.href = `/pos/payment-success?saleId=${saleId}&orderId=${orderId}&source=midtrans&pending=true`;
            },
            onError: (result: Record<string, unknown>) => {
              console.error("Midtrans onError:", result);
              alert("Pembayaran gagal! Silakan coba lagi.");
              setLoading(false);
            },
            onClose: () => {
              console.log("Midtrans popup closed without finishing payment");
              setLoading(false);
              // Sale remains Pending — webhook will handle if user already paid
            },
          });
          return; // Don't call setLoading(false) — popup is still open
        } else {
          alert(`Error: ${data.error}`);
        }
      } else if (mode === "kasbon") {
        const response = await fetch("/api/sales", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: cart.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
            })),
            paymentMethod: "Kasbon",
            paymentStatus: "Pending",
            customerName: customerName.trim(),
            customerPhone: customerPhone || undefined,
            kasbonNotes: kasbonNotes || undefined,
            kasbonDueDate: kasbonDueDate || undefined,
          }),
        });
        const data = await response.json();
        if (data.success) {
          window.location.href = `/pos/payment-success?saleId=${data.data.id}&orderId=${data.data.transactionNumber}&kasbon=true`;
        } else {
          alert(`Error: ${data.error}`);
        }
      } else {
        // Cash — use the actual paymentMethod state (should always be "Cash" due to guard above)
        const response = await fetch("/api/sales", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: cart.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
            })),
            paymentMethod: paymentMethod, // Use actual state, not hardcoded
            paymentStatus: "Paid",
            customerName: customerName || undefined,
            customerEmail: customerEmail || undefined,
            customerPhone: customerPhone || undefined,
          }),
        });
        const data = await response.json();
        if (data.success) {
          window.location.href = `/pos/payment-success?saleId=${data.data.id}&orderId=${data.data.transactionNumber}`;
        } else {
          alert(`Error: ${data.error}`);
        }
      }
    } catch {
      alert("Terjadi kesalahan saat checkout");
    } finally {
      setLoading(false);
    }
  };

  const clearCart = () => {
    setCart([]);
    setCustomerName("");
    setCustomerEmail("");
    setCustomerPhone("");
    setKasbonNotes("");
    setKasbonDueDate("");
  };

  return (
    <div className="h-[calc(100vh-80px)] flex flex-col overflow-hidden">
      {/* ═══ Top Bar ═══ */}
      <div className="bg-white border-b border-gray-200 px-3 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 text-white p-2 rounded-xl">
            <Receipt className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Kasir</h1>
            <p className="text-xs text-gray-500">Kasir &amp; Transaksi</p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 px-3 py-1.5 rounded-lg">
            <CalendarDays className="w-4 h-4 text-indigo-500" />
            <span className="font-medium" suppressHydrationWarning>
              {mounted && currentTime ? formatDate(currentTime) : ""}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 px-3 py-1.5 rounded-lg">
            <Clock className="w-4 h-4 text-indigo-500" />
            <span className="font-mono font-medium" suppressHydrationWarning>
              {mounted && currentTime ? formatTime(currentTime) : ""}
            </span>
          </div>
          {/* Shift indicator */}
          {isShiftOpen && shift && (
            <button
              onClick={() => {
                refreshShift();
                setShowCloseShiftModal(true);
              }}
              className="flex items-center gap-2 text-sm bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="font-semibold">Shift Buka</span>
              <span className="text-xs text-emerald-500">
                | Modal {formatRupiah(shift.openingCash)} |{" "}
                {shift.runningTotals.transactionCount} trx
              </span>
              <LogOut className="w-3.5 h-3.5 ml-1" />
            </button>
          )}
        </div>
      </div>

      {/* Payment notice */}
      {paymentNotice && (
        <div className="mx-3 sm:mx-6 mt-3 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm text-indigo-700 flex items-center gap-2 shrink-0">
          {paymentNotice}
          <button
            onClick={() => setPaymentNotice(null)}
            className="ml-auto text-indigo-400 hover:text-indigo-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ═══ Main Content ═══ */}
      <div className="flex-1 flex flex-col xl:flex-row gap-3 sm:gap-4 p-2 sm:p-4 overflow-auto xl:overflow-hidden min-h-0">
        {/* ─── LEFT: Products ─── */}
        <div className="flex-1 flex flex-col min-w-0 min-h-[52vh] xl:min-h-0">
          {/* Search + Categories */}
          <div className="flex gap-3 mb-3 shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Cari menu atau produk... (F4)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-black placeholder-gray-400"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Category tabs */}
          <div className="flex gap-2 mb-3 overflow-x-auto pb-1 shrink-0">
            <button
              onClick={() => setSelectedCategory("all")}
              className={`px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition ${
                selectedCategory === "all"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
              }`}
            >
              Semua ({products.length})
            </button>
            {categories.map((cat) => {
              const count = products.filter(
                (p) => String(p.categoryId) === cat.id,
              ).length;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition ${
                    selectedCategory === cat.id
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  {cat.name} ({count})
                </button>
              );
            })}
          </div>

          {/* Product Grid */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {productsLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="w-8 h-8 border-[3px] border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <Package className="w-12 h-12 mb-2 opacity-50" />
                <p className="text-sm">Tidak ada produk ditemukan</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-2 sm:gap-3">
                {filteredProducts.map((product) => {
                  // Reserved by OTHER cart items (exclude this product)
                  const reservedByOthers = buildReservedStock(
                    cart,
                    products,
                    product.id,
                  );
                  const { available, maxQty, missingIngredients } =
                    getProductAvailability(product, reservedByOthers);
                  const inCart = cart.find((c) => c.productId === product.id);
                  const cartQty = inCart?.quantity || 0;
                  // maxQty = total capacity for this product (given others' reservations)
                  const remaining = maxQty - cartQty;
                  const isMaxed = available && remaining <= 0;

                  // Compute effective ingredient stock (DB stock - ALL cart reservations)
                  // This shows the GLOBAL remaining for each ingredient across the whole cart
                  const ingredientStocks = (product.recipes || []).map((r) => {
                    const dbStock = Number(r.ingredient.currentStock) || 0;
                    const totalReserved =
                      allReservedStock.get(r.ingredient.id) ?? 0;
                    const effectiveStock = Math.max(0, dbStock - totalReserved);
                    const needed = Number(r.quantity) || 0;
                    return {
                      name: r.ingredient.name,
                      unit: r.ingredient.unit,
                      dbStock,
                      effectiveStock,
                      needed,
                      depleted: needed > 0 && effectiveStock < needed,
                    };
                  });

                  return (
                    <button
                      key={product.id}
                      onClick={() =>
                        available && !isMaxed && addToCart(product)
                      }
                      disabled={!available || isMaxed}
                      className={`relative text-left rounded-xl p-3 sm:p-4 transition-all duration-200 border min-h-[10.5rem] sm:min-h-[14rem] flex flex-col justify-start ${
                        !available
                          ? "bg-gray-50 border-gray-200 opacity-60 cursor-not-allowed"
                          : isMaxed
                            ? "bg-orange-50 border-orange-200 cursor-not-allowed"
                            : cartQty > 0
                              ? "bg-indigo-50 border-indigo-300 shadow-sm ring-1 ring-indigo-200"
                              : "bg-white border-gray-200 hover:border-indigo-300 hover:shadow-md"
                      }`}
                    >
                      {/* Badge: quantity in cart */}
                      {cartQty > 0 && (
                        <div className="absolute -top-2 -right-2 w-6 h-6 bg-indigo-600 text-white rounded-full flex items-center justify-center text-xs font-bold shadow-sm">
                          {cartQty}
                        </div>
                      )}

                      {/* Category + Product Type Badge */}
                      <div className="flex items-center gap-1 flex-wrap">
                        {product.category && (
                          <span className="text-[10px] font-medium text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full">
                            {product.category.name}
                          </span>
                        )}
                        {product.productType === "ReadyStock" && (
                          <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                            📦 Ready
                          </span>
                        )}
                      </div>

                      {/* Name */}
                      <h3
                        className={`font-semibold mt-2 text-xs sm:text-sm leading-tight line-clamp-2 ${!available ? "text-gray-400" : "text-gray-900"}`}
                      >
                        {product.name}
                      </h3>

                      {/* Price */}
                      <p
                        className={`text-sm sm:text-base font-bold mt-1 ${!available ? "text-gray-300" : "text-indigo-600"}`}
                      >
                        {formatRupiah(Number(product.sellingPrice))}
                      </p>

                      {/* ── Stock indicators — ReadyStock vs PreOrder ── */}
                      {product.productType === "ReadyStock" ? (
                        <div className="mt-1.5">
                          <span
                            className={`inline-flex items-center text-[10px] px-2 py-0.5 rounded-md font-semibold ${
                              (product.availableStock ?? 0) <= 0
                                ? "bg-red-100 text-red-600"
                                : (product.availableStock ?? 0) <= 5
                                  ? "bg-amber-50 text-amber-700"
                                  : "bg-emerald-50 text-emerald-700"
                            }`}
                          >
                            📦 Stok: {product.availableStock ?? 0}
                          </span>
                        </div>
                      ) : ingredientStocks.length > 0 ? (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {ingredientStocks.slice(0, 3).map((ing) => (
                            <span
                              key={ing.name}
                              className={`inline-flex items-center text-[9px] px-1.5 py-0.5 rounded-md font-medium transition-colors ${
                                ing.depleted
                                  ? "bg-red-100 text-red-600"
                                  : ing.effectiveStock < ing.needed * 3
                                    ? "bg-amber-50 text-amber-700"
                                    : "bg-gray-100 text-gray-500"
                              }`}
                            >
                              {ing.name}: {Math.round(ing.effectiveStock)}
                              {ing.unit}
                            </span>
                          ))}
                          {ingredientStocks.length > 3 && (
                            <span className="text-[9px] text-gray-400">
                              +{ingredientStocks.length - 3}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="mt-1.5">
                          <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-gray-50 text-gray-400 italic">
                            Tanpa resep bahan
                          </span>
                        </div>
                      )}

                      {/* Availability status */}
                      {!available && missingIngredients.length > 0 ? (
                        <div className="mt-1.5 flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                          <span className="text-[10px] text-red-500 font-medium">
                            Habis: {missingIngredients.slice(0, 2).join(", ")}
                            {missingIngredients.length > 2 &&
                              ` +${missingIngredients.length - 2}`}
                          </span>
                        </div>
                      ) : !available ? (
                        <div className="mt-1.5 flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                          <span className="text-[10px] text-red-500 font-medium">
                            Stok habis
                          </span>
                        </div>
                      ) : isMaxed ? (
                        <div className="mt-1.5 flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                          <span className="text-[10px] text-orange-600 font-medium">
                            Maks {cartQty} (bahan terpakai)
                          </span>
                        </div>
                      ) : remaining <= 5 ? (
                        <div className="mt-1.5 flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span className="text-[10px] text-amber-600 font-medium">
                            {cartQty > 0
                              ? `${cartQty} di cart · +${remaining} lagi`
                              : `Bisa ${remaining} porsi`}
                          </span>
                        </div>
                      ) : (
                        <div className="mt-1.5 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                          <span className="text-[10px] text-green-600 font-medium">
                            Tersedia{cartQty > 0 ? ` · ${cartQty} di cart` : ""}
                          </span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ─── RIGHT: Cart ─── */}
        <div className="w-full xl:w-96 bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col shrink-0 overflow-hidden max-h-[55vh] xl:max-h-none">
          {/* Cart header */}
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-indigo-600" />
              <h2 className="font-bold text-gray-900 text-base md:text-lg">Keranjang</h2>
              {totalItems > 0 && (
                <span className="bg-indigo-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  {totalItems}
                </span>
              )}
            </div>
            {cart.length > 0 && (
              <button
                onClick={clearCart}
                className="text-xs text-red-500 hover:text-red-700 font-medium"
              >
                Hapus semua
              </button>
            )}
          </div>

          {/* Cart items */}
          <div className="flex-1 overflow-y-auto px-5 py-3 min-h-0">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <ShoppingCart className="w-10 h-10 mb-2 opacity-40" />
                <p className="text-sm">Keranjang masih kosong</p>
                <p className="text-xs mt-1">Klik menu untuk menambahkan</p>
              </div>
            ) : (
              <div className="space-y-3">
                {cart.map((item) => {
                  const product = products.find((p) => p.id === item.productId);
                  const reservedByOthers = product
                    ? buildReservedStock(cart, products, item.productId)
                    : new Map();
                  const { maxQty } = product
                    ? getProductAvailability(product, reservedByOthers)
                    : { maxQty: 999 };
                  const atMax = item.quantity >= maxQty;

                  return (
                    <div
                      key={item.productId}
                      className="flex items-center gap-3 bg-gray-50 rounded-xl p-2 md:p-3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs md:text-sm font-semibold text-gray-900 truncate">
                          {item.name}
                        </p>
                        <p className="text-[11px] md:text-xs text-gray-500">
                          {formatRupiah(item.price)}
                        </p>
                        {atMax &&
                          product?.recipes &&
                          product.recipes.length > 0 && (
                            <p className="text-[9px] text-orange-500 mt-0.5">
                              ⚠ Maks. bahan baku
                            </p>
                          )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => updateQuantity(item.productId, -1)}
                          className="w-6 h-6 md:w-7 md:h-7 flex items-center justify-center rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-100"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="w-6 md:w-7 text-center text-xs md:text-sm font-bold text-gray-900">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() =>
                            !atMax && updateQuantity(item.productId, 1)
                          }
                          disabled={atMax}
                          className={`w-6 h-6 md:w-7 md:h-7 flex items-center justify-center rounded-lg ${
                            atMax
                              ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                              : "bg-indigo-600 text-white hover:bg-indigo-700"
                          }`}
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs md:text-sm font-bold text-gray-900">
                          {formatRupiah(item.price * item.quantity)}
                        </p>
                        <button
                          onClick={() => removeFromCart(item.productId)}
                          className="text-red-400 hover:text-red-600 mt-0.5"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Cart footer */}
          <div className="border-t border-gray-100 shrink-0 bg-gray-50/50">
            {/* Payment method selector — always visible */}
            <div className="px-4 md:px-5 pt-2 md:pt-3 pb-2">
              <div className="flex gap-1.5 flex-wrap">
                {(
                  ["Cash", "QRIS", "Transfer", "Digital", "Kasbon"] as const
                ).map((method) => (
                  <button
                    key={method}
                    onClick={() => {
                      setPaymentMethod(method);
                      if (method !== "Kasbon") {
                        setKasbonNotes("");
                        setKasbonDueDate("");
                      }
                      // Auto-expand customer form for online payments (Midtrans requires name+email)
                      if (
                        method === "QRIS" ||
                        method === "Transfer" ||
                        method === "Digital"
                      ) {
                        setShowCustomerForm(true);
                      }
                    }}
                    className={`flex-1 min-w-[6.75rem] xl:min-w-0 py-1.5 md:py-2 text-[10px] md:text-[11px] font-medium rounded-lg transition cursor-pointer ${
                      paymentMethod === method
                        ? method === "Kasbon"
                          ? "bg-amber-600 text-white shadow-sm ring-2 ring-amber-300"
                          : "bg-indigo-600 text-white shadow-sm"
                        : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    {method === "Cash"
                      ? "💵"
                      : method === "QRIS"
                        ? "📱"
                        : method === "Transfer"
                          ? "🏦"
                          : method === "Digital"
                            ? "💳"
                            : "📒"}{" "}
                    {method}
                  </button>
                ))}
              </div>
            </div>

            {/* Conditional forms — scrollable if needed */}
            <div className="px-4 md:px-5 pb-2 overflow-y-auto max-h-45">
              {/* KASBON MODE */}
              {paymentMethod === "Kasbon" && (
                <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-2 pb-1 border-b border-amber-200">
                    <BookOpen className="w-3.5 h-3.5 text-amber-600" />
                    <p className="text-[11px] text-amber-800 font-bold">
                      Mode Kasbon — Piutang
                    </p>
                  </div>
                  <div className="relative">
                    <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-amber-400" />
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Nama pelanggan (wajib) *"
                      className={`w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none text-black placeholder-gray-400 ${
                        !customerName.trim()
                          ? "border-2 border-red-300"
                          : "border border-amber-200"
                      }`}
                    />
                  </div>
                  <div className="relative">
                    <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="No. HP (untuk reminder WA)"
                      className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 bg-white focus:outline-none text-black placeholder-gray-400"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={kasbonDueDate}
                      onChange={(e) => setKasbonDueDate(e.target.value)}
                      min={
                        currentTime
                          ? currentTime.toISOString().split("T")[0]
                          : undefined
                      }
                      title="Jatuh tempo"
                      className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 bg-white focus:outline-none text-black placeholder-gray-400"
                    />
                    <input
                      type="text"
                      value={kasbonNotes}
                      onChange={(e) => setKasbonNotes(e.target.value)}
                      placeholder="Catatan (opsional)"
                      className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 bg-white focus:outline-none text-black placeholder-gray-400"
                    />
                  </div>
                </div>
              )}

              {/* NON-KASBON: customer info */}
              {paymentMethod !== "Kasbon" && (
                <div>
                  <button
                    onClick={() => setShowCustomerForm(!showCustomerForm)}
                    className="w-full flex items-center justify-between text-xs text-gray-600 bg-white border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5" />
                      {customerName || "Info Customer (opsional)"}
                    </span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 transition ${showCustomerForm ? "rotate-180" : ""}`}
                    />
                  </button>
                  {showCustomerForm && (
                    <div className="space-y-2 bg-white border border-gray-200 rounded-lg p-3 mt-2">
                      <div className="relative">
                        <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <input
                          type="text"
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          placeholder="Nama customer"
                          className="w-full pl-8 pr-3 py-2 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none text-black placeholder-gray-400"
                        />
                      </div>
                      <div className="relative">
                        <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <input
                          type="email"
                          value={customerEmail}
                          onChange={(e) => setCustomerEmail(e.target.value)}
                          placeholder="Email customer"
                          className="w-full pl-8 pr-3 py-2 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none text-black placeholder-gray-400"
                        />
                      </div>
                      <div className="relative">
                        <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <input
                          type="tel"
                          value={customerPhone}
                          onChange={(e) => setCustomerPhone(e.target.value)}
                          placeholder="No. HP (opsional)"
                          className="w-full pl-8 pr-3 py-2 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none text-black placeholder-gray-400"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Total + Checkout — always pinned at bottom */}
            <div className="px-5 pb-4 pt-2 space-y-2 border-t border-gray-100">
              <div
                className={`border rounded-xl p-2.5 ${
                  paymentMethod === "Kasbon"
                    ? "bg-amber-50 border-amber-200"
                    : "bg-white border-gray-200"
                }`}
              >
                <div className="flex justify-between items-center text-xs text-gray-500 mb-0.5">
                  <span>{totalItems} item</span>
                  <span>
                    {paymentMethod === "Kasbon" ? "Total Kasbon" : "Subtotal"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-base font-extrabold text-gray-900">
                    Total
                  </span>
                  <span
                    className={`text-base font-extrabold ${paymentMethod === "Kasbon" ? "text-amber-700" : "text-indigo-600"}`}
                  >
                    {formatRupiah(total)}
                  </span>
                </div>
                {paymentMethod === "Kasbon" &&
                  customerName.trim() &&
                  cart.length > 0 && (
                    <p className="text-[10px] text-amber-700 font-medium mt-1 truncate">
                      📒 {customerName.trim()} hutang {formatRupiah(total)}
                    </p>
                  )}
              </div>

              {paymentMethod === "Kasbon" ? (
                <button
                  onClick={() => handleCheckout("kasbon")}
                  disabled={
                    loading || cart.length === 0 || !customerName.trim()
                  }
                  className="w-full flex items-center justify-center gap-2 bg-amber-600 text-white py-3 rounded-xl font-bold text-sm hover:bg-amber-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition shadow-sm cursor-pointer"
                >
                  {loading ? (
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <BookOpen className="w-4 h-4" />
                  )}
                  {!customerName.trim()
                    ? "Isi Nama Dulu"
                    : cart.length === 0
                      ? "Pilih Menu Dulu"
                      : `Catat Kasbon ${formatRupiah(total)}`}
                  <span className="text-[10px] opacity-70 ml-1">(F5)</span>
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleCheckout("cash")}
                    disabled={
                      loading || cart.length === 0 || paymentMethod !== "Cash"
                    }
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition cursor-pointer ${
                      paymentMethod === "Cash"
                        ? "bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
                        : "bg-gray-100 text-gray-400 cursor-not-allowed"
                    }`}
                  >
                    <Banknote className="w-4 h-4" />
                    Cash <span className="text-[10px] opacity-70">(F2)</span>
                  </button>
                  <button
                    onClick={() => handleCheckout("online")}
                    disabled={
                      loading || cart.length === 0 || paymentMethod === "Cash"
                    }
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition cursor-pointer ${
                      paymentMethod !== "Cash"
                        ? "bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
                        : "bg-gray-100 text-gray-400 cursor-not-allowed"
                    }`}
                  >
                    <CreditCard className="w-4 h-4" />
                    {paymentMethod !== "Cash" ? paymentMethod : "Online"}{" "}
                    <span className="text-[10px] opacity-70">(F3)</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ OPEN SHIFT MODAL — blocks POS until shift is opened ═══ */}
      {!shiftLoading && !isShiftOpen && !closeResult && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-8 text-center space-y-6 shadow-2xl">
            <div className="mx-auto w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center">
              <DollarSign className="w-8 h-8 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                Buka Shift Kasir
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Masukkan jumlah uang cash di laci kasir sebelum mulai berjualan
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block text-left mb-1">
                Modal Awal (Rp)
              </label>
              <input
                type="text"
                value={openingCashInput}
                onChange={(e) => {
                  const raw = e.target.value.replace(/\D/g, "");
                  setOpeningCashInput(
                    raw ? Number(raw).toLocaleString("id-ID") : "",
                  );
                }}
                placeholder="0"
                className="w-full px-4 py-3 text-2xl font-bold text-center border-2 border-indigo-200 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleOpenShift()}
              />
            </div>
            <button
              onClick={handleOpenShift}
              disabled={shiftActionLoading || !openingCashInput}
              className="w-full py-3.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition text-lg"
            >
              {shiftActionLoading ? "Membuka..." : "🔓 Buka Shift"}
            </button>
          </div>
        </div>
      )}

      {/* ═══ CLOSE SHIFT MODAL ═══ */}
      {showCloseShiftModal && !closeResult && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={() => setShowCloseShiftModal(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6 space-y-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                💰 Tutup Kasir
              </h2>
              <button
                onClick={() => setShowCloseShiftModal(false)}
                className="text-gray-400 hover:text-gray-600 text-xl"
              >
                &times;
              </button>
            </div>

            {/* Running summary */}
            {shift && (
              <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-500">Kasir</span>
                  <span className="font-medium">{shift.openedBy}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Dibuka</span>
                  <span className="font-medium">
                    {new Date(shift.openedAt).toLocaleString("id-ID")}
                  </span>
                </div>
                <hr />
                <div className="flex justify-between">
                  <span>Modal Awal</span>
                  <span className="font-semibold">
                    {formatRupiah(shift.openingCash)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>💵 Cash Sales</span>
                  <span className="font-semibold text-green-600">
                    +{formatRupiah(shift.runningTotals.cashTotal)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>📱 QRIS</span>
                  <span>{formatRupiah(shift.runningTotals.qrisTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>🏦 Transfer</span>
                  <span>{formatRupiah(shift.runningTotals.transferTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>💳 Digital</span>
                  <span>{formatRupiah(shift.runningTotals.digitalTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>📝 Kasbon</span>
                  <span>{formatRupiah(shift.runningTotals.kasbonTotal)}</span>
                </div>
                <hr />
                <div className="flex justify-between font-bold text-base">
                  <span>Total Revenue</span>
                  <span className="text-indigo-600">
                    {formatRupiah(shift.runningTotals.totalRevenue)}
                  </span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>Cash Seharusnya</span>
                  <span className="text-emerald-600">
                    {formatRupiah(shift.runningTotals.expectedCash)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Transaksi</span>
                  <span className="font-bold">
                    {shift.runningTotals.transactionCount}
                  </span>
                </div>
              </div>
            )}

            {/* Actual cash input */}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">
                Hitung Uang Cash di Laci (Rp)
              </label>
              <input
                type="text"
                value={actualCashInput}
                onChange={(e) => {
                  const raw = e.target.value.replace(/\D/g, "");
                  setActualCashInput(
                    raw ? Number(raw).toLocaleString("id-ID") : "",
                  );
                }}
                placeholder="Jumlah uang fisik"
                className="w-full px-4 py-3 text-xl font-bold text-center border-2 border-gray-200 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleCloseShift()}
              />
              {/* Live discrepancy preview */}
              {shift &&
                actualCashInput &&
                (() => {
                  const actual = Number(actualCashInput.replace(/\D/g, ""));
                  const diff = actual - shift.runningTotals.expectedCash;
                  return (
                    <div
                      className={`mt-2 text-sm font-semibold text-center ${diff === 0 ? "text-green-600" : diff > 0 ? "text-blue-600" : "text-red-600"}`}
                    >
                      {diff === 0
                        ? "✅ Cocok sempurna!"
                        : diff > 0
                          ? `+${formatRupiah(diff)} (lebih)`
                          : `${formatRupiah(diff)} (kurang)`}
                    </div>
                  );
                })()}
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">
                Catatan (opsional)
              </label>
              <textarea
                value={closeNotes}
                onChange={(e) => setCloseNotes(e.target.value)}
                placeholder="Catatan shift..."
                className="w-full px-3 py-2 border rounded-xl text-sm resize-none h-16 focus:border-indigo-500 outline-none"
              />
            </div>

            <button
              onClick={handleCloseShift}
              disabled={shiftActionLoading || !actualCashInput}
              className="w-full py-3.5 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition"
            >
              {shiftActionLoading
                ? "Menutup..."
                : "🔒 Tutup Shift & Settlement"}
            </button>
          </div>
        </div>
      )}

      {/* ═══ CLOSE RESULT / SETTLEMENT RECEIPT ═══ */}
      {closeResult && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 shadow-2xl">
            <div className="text-center">
              <div className="mx-auto w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mb-3">
                <CheckCircle2 className="w-7 h-7 text-green-600" />
              </div>
              <h2 className="text-lg font-bold text-gray-900">
                Shift Ditutup ✅
              </h2>
            </div>

            <div className="bg-indigo-50 rounded-xl p-4 text-sm space-y-2">
              <div className="flex justify-between">
                <span>Modal Awal</span>
                <span className="font-semibold">
                  {formatRupiah(Number(closeResult.openingCash) || 0)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>+ Cash Sales</span>
                <span className="font-semibold text-green-600">
                  +{formatRupiah(Number(closeResult.cashSalesTotal) || 0)}
                </span>
              </div>
              <hr className="border-indigo-200" />
              <div className="flex justify-between font-bold">
                <span>Seharusnya</span>
                <span>
                  {formatRupiah(Number(closeResult.expectedCash) || 0)}
                </span>
              </div>
              <div className="flex justify-between font-bold">
                <span>Aktual</span>
                <span>{formatRupiah(Number(closeResult.actualCash) || 0)}</span>
              </div>
              <hr className="border-indigo-200" />
              <div
                className={`flex justify-between font-bold text-lg ${Number(closeResult.discrepancy) === 0 ? "text-green-600" : Number(closeResult.discrepancy) > 0 ? "text-blue-600" : "text-red-600"}`}
              >
                <span>Selisih</span>
                <span>
                  {Number(closeResult.discrepancy) === 0
                    ? "✅ Cocok"
                    : `${Number(closeResult.discrepancy) > 0 ? "+" : ""}${formatRupiah(Number(closeResult.discrepancy))}`}
                </span>
              </div>
            </div>

            <div className="bg-indigo-600 text-white rounded-xl p-4 flex justify-between items-center">
              <span className="font-semibold">Total Revenue</span>
              <span className="text-xl font-bold">
                {formatRupiah(Number(closeResult.totalRevenue) || 0)}
              </span>
            </div>

            <div className="text-xs text-gray-400 text-center">
              {String(closeResult.transactionCount ?? 0)} transaksi · Ditutup
              oleh {String(closeResult.closedBy ?? "")}
            </div>

            <button
              onClick={() => {
                setCloseResult(null);
                setShowCloseShiftModal(false);
              }}
              className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition"
            >
              OK — Buka Shift Baru
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

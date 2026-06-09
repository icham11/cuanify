"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUpDown, BookOpen, Search, Loader2 } from "lucide-react";
import GradientPageHeader from "@/components/bakery/shared/GradientPageHeader";
import OrderTable from "@/components/bakery/bookings/OrderTable";
import { Select } from "@/components/ui/select";
import { useOrders } from "@/components/bakery/store";
import { useBusiness } from "@/context/BusinessContext";
import {
  BOOKING_STATUS_FILTER_OPTIONS,
  matchesBookingStatusFilter,
  normalizeOrderStatus,
} from "@/lib/bookings/order-status";
import {
  BOOKING_COURIER_FILTER_OPTIONS,
  matchesCourierFilter,
  parseCourierFilter,
  type CourierFilter,
} from "@/lib/bookings/courier-filter";
import { resolveOrderDeliveryMethod } from "@/lib/bookings/delivery-method";
import {
  getJakartaTodayIsoDate,
  resolveShippingProvider,
} from "@/lib/bookings/shipping-schedule";

type OrderSourceFilter = "" | "customer" | "admin";
type SavedView =
  | "all"
  | "active"
  | "late"
  | "today"
  | "tomorrow"
  | "production";
type SortOption = "delivery-asc" | "delivery-desc" | "name-asc" | "value-desc";

const SAVED_VIEW_OPTIONS: SavedView[] = [
  "all",
  "active",
  "late",
  "today",
  "tomorrow",
  "production",
];
const SORT_OPTIONS: SortOption[] = [
  "delivery-asc",
  "delivery-desc",
  "name-asc",
  "value-desc",
];
const ORDER_SOURCE_FILTER_OPTIONS: OrderSourceFilter[] = [
  "",
  "customer",
  "admin",
];

function parseSavedView(value: string | null): SavedView | null {
  return value && SAVED_VIEW_OPTIONS.includes(value as SavedView)
    ? (value as SavedView)
    : null;
}

function parseSortOption(value: string | null): SortOption | null {
  return value && SORT_OPTIONS.includes(value as SortOption)
    ? (value as SortOption)
    : null;
}

function parseOrderSourceFilter(value: string | null): OrderSourceFilter | null {
  return value && ORDER_SOURCE_FILTER_OPTIONS.includes(value as OrderSourceFilter)
    ? (value as OrderSourceFilter)
    : value === ""
      ? ""
      : null;
}

function addDaysToIsoDate(isoDate: string, days: number): string {
  const matched = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matched) return isoDate;

  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return isoDate;
  }

  const value = new Date(Date.UTC(year, month - 1, day));
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function isTransientBookingsFetchError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");
  const normalized = message.trim().toLowerCase();
  return (
    normalized.includes("failed to fetch") ||
    normalized.includes("networkerror") ||
    normalized.includes("load failed") ||
    normalized.includes("network request failed")
  );
}

function resolveOrderSource(order: {
  notes?: string;
  whatsAppParsedData?: { common?: { deliveryMethod?: string } };
  shippingQuote?: {
    provider?: string;
    courierCode?: string;
    courierServiceCode?: string;
    courierServiceName?: string;
  } | null;
}): "customer" | "admin" | null {
  const deliveryMethod = resolveOrderDeliveryMethod({
    parsedDeliveryMethod: order.whatsAppParsedData?.common?.deliveryMethod,
    notes: order.notes,
    shippingQuote: order.shippingQuote,
  });

  if (!deliveryMethod || deliveryMethod === "PICKUP") return null;
  if (deliveryMethod === "CUSTOMER_APP_COURIER") return "customer";
  if (
    deliveryMethod.startsWith("ASSISTED_") ||
    deliveryMethod === "REGULAR_JNE_JNT"
  ) {
    return "admin";
  }

  return null;
}

export default function BookingListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { orders, fetchPaginatedOrders } = useOrders();
  const { business } = useBusiness();
  const initialQuery = searchParams.get("query") ?? "";
  const initialStatusFilter = searchParams.get("status") ?? "";
  const initialDateFilter = searchParams.get("date") ?? "";
  const initialCourierFilter = parseCourierFilter(searchParams.get("courier")) ?? "";
  const initialOrderSourceFilter =
    parseOrderSourceFilter(searchParams.get("orderSource")) ?? "";
  const initialSortBy = parseSortOption(searchParams.get("sort")) ?? "delivery-asc";
  const requestedView = parseSavedView(searchParams.get("view"));
  const requestedPage = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const [query, setQuery] = useState(initialQuery);
  const [statusFilter, setStatusFilter] = useState(initialStatusFilter);
  const [dateFilter, setDateFilter] = useState(initialDateFilter);
  const [courierFilter, setCourierFilter] = useState<CourierFilter>(initialCourierFilter);
  const [orderSourceFilter, setOrderSourceFilter] =
    useState<OrderSourceFilter>(initialOrderSourceFilter);
  const [sortBy, setSortBy] = useState<SortOption>(initialSortBy);
  const [currentPage, setCurrentPage] = useState(
    Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1,
  );
  const [activeSavedView, setActiveSavedView] = useState<SavedView>(
    requestedView ?? "all",
  );
  
  // State lokal untuk server-side pagination & filter
  const [ordersList, setOrdersList] = useState<typeof orders>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  const today = getJakartaTodayIsoDate();
  const tomorrow = useMemo(() => addDaysToIsoDate(today, 1), [today]);
  const PAGE_SIZE = 10;
  const linkedSource = searchParams.get("source");
  const isCalendarLinkedView = linkedSource === "calendar";
  const fetchCurrentPageOrders = useMemo(
    () => async (
      pageOverride = currentPage,
      options?: { signal?: AbortSignal },
    ) =>
      fetchPaginatedOrders({
        page: pageOverride,
        limit: PAGE_SIZE,
        query,
        status: statusFilter,
        date: dateFilter,
        view: activeSavedView,
        today,
        courier: courierFilter,
        orderSource: orderSourceFilter,
        signal: options?.signal,
      }),
    [
      activeSavedView,
      courierFilter,
      currentPage,
      dateFilter,
      fetchPaginatedOrders,
      orderSourceFilter,
      query,
      statusFilter,
      today,
    ],
  );

  // Effect untuk me-load data paginated dari server-side dengan debounce pencarian
  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const debounceHandler = setTimeout(() => {
      const run = async () => {
        if (active) {
          setIsLoading(true);
        }

        let lastError: unknown = null;
        for (let attempt = 0; attempt < 8; attempt += 1) {
          try {
            const res = await fetchCurrentPageOrders(currentPage, {
              signal: controller.signal,
            });
            if (!active) return;
            setOrdersList(res.orders);
            setTotalCount(res.pagination.totalCount);
            setTotalPages(res.pagination.totalPages);
            setIsLoading(false);
            return;
          } catch (error) {
            if (
              controller.signal.aborted ||
              (error instanceof Error && error.name === "AbortError")
            ) {
              return;
            }
            lastError = error;
            if (!isTransientBookingsFetchError(error) || attempt === 7) {
              break;
            }
            const retryDelayMs = Math.min(2500, 700 + attempt * 400);
            await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
            if (controller.signal.aborted) {
              return;
            }
          }
        }

        console.error("Gagal memuat daftar pesanan paginated:", lastError);
        if (active) {
          setIsLoading(false);
        }
      };

      void run();
    }, 250); // Debounce typing 250ms

    return () => {
      active = false;
      controller.abort();
      clearTimeout(debounceHandler);
    };
  }, [currentPage, fetchCurrentPageOrders]);

  // Client-side sorting dari halaman ter-load
  const pagedOrders = useMemo(() => {
    const result = ordersList;

    if (sortBy === "delivery-asc") {
      return result.slice().sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate));
    }

    if (sortBy === "delivery-desc") {
      return result.slice().sort((a, b) => b.deliveryDate.localeCompare(a.deliveryDate));
    }

    if (sortBy === "name-asc") {
      return result.slice().sort((a, b) => a.customerName.localeCompare(b.customerName));
    }

    return result.slice().sort((a, b) => (b.totalPrice || 0) - (a.totalPrice || 0));
  }, [ordersList, sortBy]);

  const fallbackFilteredOrders = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return orders.filter((order) => {
      const normalizedStatus = normalizeOrderStatus(order.orderStatus);

      if (
        activeSavedView === "active" &&
        ["Delivery", "Delivered", "Completed", "Cancelled"].includes(
          normalizedStatus,
        )
      ) {
        return false;
      }

      if (
        activeSavedView === "late" &&
        !(
          order.deliveryDate < today &&
          !["Delivery", "Delivered", "Completed", "Cancelled"].includes(
            normalizedStatus,
          )
        )
      ) {
        return false;
      }

      if (
        statusFilter &&
        !matchesBookingStatusFilter(
          order.orderStatus,
          statusFilter,
          order.paymentStatus,
        )
      ) {
        return false;
      }

      if (dateFilter && order.deliveryDate !== dateFilter) {
        return false;
      }

      if (normalizedQuery) {
        const searchable = [
          order.customerName,
          order.bookingCode,
          order.resi,
          order.id,
        ]
          .join(" ")
          .toLowerCase();
        if (!searchable.includes(normalizedQuery)) {
          return false;
        }
      }

      if (courierFilter) {
        const provider = resolveShippingProvider(order);
        if (!matchesCourierFilter(provider, courierFilter)) {
          return false;
        }
      }

      if (orderSourceFilter) {
        if (resolveOrderSource(order) !== orderSourceFilter) {
          return false;
        }
      }

      return true;
    });
  }, [
    activeSavedView,
    courierFilter,
    dateFilter,
    orderSourceFilter,
    orders,
    query,
    statusFilter,
    today,
  ]);

  const fallbackPagedOrders = useMemo(() => {
    const sorted = fallbackFilteredOrders.slice().sort((a, b) => {
      if (sortBy === "delivery-desc") {
        return b.deliveryDate.localeCompare(a.deliveryDate);
      }
      if (sortBy === "name-asc") {
        return a.customerName.localeCompare(b.customerName);
      }
      if (sortBy === "value-desc") {
        return (b.totalPrice || 0) - (a.totalPrice || 0);
      }
      return a.deliveryDate.localeCompare(b.deliveryDate);
    });

    const fallbackOffset = (currentPage - 1) * PAGE_SIZE;
    return sorted.slice(fallbackOffset, fallbackOffset + PAGE_SIZE);
  }, [currentPage, fallbackFilteredOrders, sortBy]);

  const shouldUseFallbackList =
    ordersList.length === 0 && orders.length > 0 && (isLoading || totalCount === 0);
  const displayOrders = shouldUseFallbackList ? fallbackPagedOrders : pagedOrders;
  const displayTotalCount = shouldUseFallbackList
    ? fallbackFilteredOrders.length
    : totalCount;
  const displayTotalPages = shouldUseFallbackList
    ? Math.max(1, Math.ceil(fallbackFilteredOrders.length / PAGE_SIZE))
    : totalPages;

  const activeOrdersCount = useMemo(
    () =>
      orders.filter((order) => {
        const status = normalizeOrderStatus(order.orderStatus);
        return !["Completed", "Delivered", "Cancelled"].includes(status);
      }).length,
    [orders],
  );

  const unpaidCount = useMemo(
    () =>
      (shouldUseFallbackList ? fallbackFilteredOrders : ordersList).filter(
        (order) => order.paymentStatus !== "Paid",
      ).length,
    [fallbackFilteredOrders, ordersList, shouldUseFallbackList],
  );

  const hasActiveFilters = Boolean(
    query ||
      statusFilter ||
      dateFilter ||
      courierFilter ||
      orderSourceFilter ||
      activeSavedView !== "all" ||
      sortBy !== "delivery-asc",
  );

  const safeCurrentPage = Math.min(currentPage, displayTotalPages);
  const hasRenderableOrders = displayOrders.length > 0;

  const handleOrderDeleted = async (deletedOrderId: string) => {
    const remainingOrdersOnPage = displayOrders.filter(
      (order) => order.id !== deletedOrderId,
    );
    const nextTotalCount = Math.max(0, totalCount - 1);
    const nextTotalPages = Math.max(1, Math.ceil(nextTotalCount / PAGE_SIZE));
    const fallbackPage =
      remainingOrdersOnPage.length === 0 && currentPage > 1
        ? currentPage - 1
        : currentPage;

    setOrdersList((currentOrders) =>
      currentOrders.filter((order) => order.id !== deletedOrderId),
    );
    setTotalCount(nextTotalCount);
    setTotalPages(nextTotalPages);

    if (fallbackPage !== currentPage) {
      setCurrentPage(fallbackPage);
      return;
    }

    void fetchCurrentPageOrders(fallbackPage)
      .then((res) => {
        setOrdersList(res.orders);
        setTotalCount(res.pagination.totalCount);
        setTotalPages(res.pagination.totalPages);
      })
      .catch((error) => {
        console.error("Gagal memuat ulang daftar pesanan setelah dihapus:", error);
      });
  };

  const handleOrderStatusUpdated = async () => {
    const fallbackPage =
      displayOrders.length === 1 && currentPage > 1
        ? currentPage - 1
        : currentPage;

    if (fallbackPage !== currentPage) {
      setCurrentPage(fallbackPage);
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetchCurrentPageOrders(fallbackPage);
      setOrdersList(res.orders);
      setTotalCount(res.pagination.totalCount);
      setTotalPages(res.pagination.totalPages);
    } catch (error) {
      console.error("Gagal memuat ulang daftar pesanan setelah update status:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const resetFilters = () => {
    setQuery("");
    setStatusFilter("");
    setDateFilter("");
    setCourierFilter("");
    setOrderSourceFilter("");
    setSortBy("delivery-asc");
    setCurrentPage(1);
    setActiveSavedView("all");
    router.replace("/bakery/bookings", { scroll: false });
  };

  const applySavedView = (view: SavedView) => {
    setCurrentPage(1);
    setActiveSavedView(view);

    if (view === "all" || view === "active" || view === "late") {
      setStatusFilter("");
      setDateFilter("");
      return;
    }

    if (view === "today") {
      setDateFilter(today);
      setStatusFilter("");
      return;
    }

    if (view === "tomorrow") {
      setDateFilter(tomorrow);
      setStatusFilter("");
      return;
    }

    setDateFilter("");
    setStatusFilter("In Production");
  };

  const quickChipClass = (isActive: boolean) =>
    `inline-flex h-9 items-center justify-center rounded-full border px-4 text-[12px] font-semibold transition ${
      isActive
        ? "border-[var(--crumbella-accent)] bg-[var(--crumbella-accent)] text-white"
        : "border-[var(--crumbella-border)] bg-[var(--crumbella-surface)] text-[var(--foreground)]"
    }`;

  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-10">
      <GradientPageHeader
        title="Bookings"
        description={`${activeOrdersCount} order aktif${business?.name ? ` · ${business.name}` : ""}`}
        icon={BookOpen}
        actions={
          <Link
            href="/bakery/bookings/new"
            className="inline-flex h-9 items-center justify-center rounded-full bg-[var(--crumbella-accent)] px-4 text-xs font-semibold text-white transition hover:bg-[var(--crumbella-accent-hover)]"
          >
            + Baru
          </Link>
        }
      />

      {isCalendarLinkedView ? (
        <section className="rounded-[24px] border border-[#ffd8b7] bg-[#fff7ed] px-4 py-3 text-sm text-[#8a4b22] shadow-[0_14px_24px_-24px_rgba(138,75,34,0.45)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold">Filter dibuka dari Calendar</p>
              <p className="mt-1 text-xs text-[#a16234]">
                {dateFilter
                  ? `Menampilkan booking untuk tanggal ${dateFilter}.`
                  : "Menampilkan hasil yang dikirim dari halaman Calendar."}
              </p>
            </div>
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex h-9 items-center justify-center rounded-full border border-[#efc9a7] bg-white px-4 text-xs font-semibold text-[#8a4b22] transition hover:bg-[#fff1e3]"
            >
              Lihat semua booking
            </button>
          </div>
        </section>
      ) : null}

      <section className="space-y-3 rounded-[28px] border border-[var(--crumbella-border)] bg-[var(--crumbella-surface)] p-4 shadow-[0_16px_30px_-24px_rgba(30,18,10,0.45)]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--crumbella-muted)]" />
          <input
            type="text"
            placeholder="Cari customer atau booking ID..."
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setCurrentPage(1);
            }}
            className="h-12 w-full rounded-[18px] border border-[var(--crumbella-border)] bg-white pl-11 pr-4 text-[14px] text-[var(--foreground)] placeholder:text-[var(--crumbella-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--crumbella-focus)]"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto scrollbar-none">
          <button type="button" onClick={() => applySavedView("active")} className={quickChipClass(activeSavedView === "active")}>
            Aktif
          </button>
          <button type="button" onClick={() => applySavedView("all")} className={quickChipClass(activeSavedView === "all")}>
            Semua
          </button>
          <button
            type="button"
            onClick={() => applySavedView("late")}
            className={quickChipClass(activeSavedView === "late")}
          >
            Terlambat
          </button>
          <button type="button" onClick={() => applySavedView("today")} className={quickChipClass(activeSavedView === "today")}>
            Hari Ini
          </button>
          <button type="button" onClick={() => applySavedView("tomorrow")} className={quickChipClass(activeSavedView === "tomorrow")}>
            Besok
          </button>
          <button
            type="button"
            onClick={() => applySavedView("production")}
            className={quickChipClass(activeSavedView === "production")}
          >
            In Production
          </button>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Select
            value={courierFilter}
            onChange={(event) => {
              setCourierFilter(event.target.value as CourierFilter);
              setCurrentPage(1);
              setActiveSavedView("all");
            }}
            className="h-10 rounded-xl border-[var(--crumbella-border)] bg-white text-xs"
          >
            <option value="">Semua courier</option>
            {BOOKING_COURIER_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Select
            value={orderSourceFilter}
            onChange={(event) => {
              setOrderSourceFilter(event.target.value as OrderSourceFilter);
              setCurrentPage(1);
              setActiveSavedView("all");
            }}
            className="h-10 rounded-xl border-[var(--crumbella-border)] bg-white text-xs"
          >
            <option value="">Semua pemesan</option>
            <option value="customer">Customer</option>
            <option value="admin">Admin</option>
          </Select>
        </div>

        <div className="grid gap-2 sm:grid-cols-[1fr,1fr,auto]">
          <Select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);
              setCurrentPage(1);
              setActiveSavedView("all");
            }}
            className="h-10 rounded-xl border-[var(--crumbella-border)] bg-white text-xs"
          >
            <option value="">Semua status</option>
            {BOOKING_STATUS_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <input
            type="date"
            value={dateFilter}
            onChange={(event) => {
              setDateFilter(event.target.value);
              setCurrentPage(1);
              setActiveSavedView("all");
            }}
            className="h-10 rounded-xl border border-[var(--crumbella-border)] bg-white px-3 text-xs text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--crumbella-focus)]"
          />
          <button
            type="button"
            onClick={resetFilters}
            disabled={!hasActiveFilters}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-[var(--crumbella-border)] bg-[var(--background)] px-4 text-xs font-semibold text-[var(--crumbella-primary)] disabled:cursor-not-allowed disabled:opacity-45"
          >
            Reset
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-start justify-between gap-3 px-1">
          <div className="min-w-0">
            <p className="text-[1.25rem] font-extrabold leading-none text-[var(--foreground)]">
              {displayTotalCount} order
            </p>
            <p className="mt-1 text-[11px] text-[var(--crumbella-muted)]">
              DP = {unpaidCount} belum lunas
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-[var(--crumbella-border)] bg-[var(--crumbella-surface)] px-3 py-1.5">
            <ArrowUpDown className="h-3.5 w-3.5 text-[var(--crumbella-primary)]" />
            <Select
              value={sortBy}
              onChange={(event) => {
                setSortBy(
                  event.target.value as SortOption,
                );
                setCurrentPage(1);
              }}
              className="h-auto min-w-[96px] border-none bg-transparent p-0 text-[11px] font-semibold text-[var(--crumbella-primary)] shadow-none focus:ring-0"
            >
              <option value="delivery-asc">Sort</option>
              <option value="delivery-desc">Delivery terbaru</option>
              <option value="delivery-asc">Delivery terdekat</option>
              <option value="name-asc">Nama customer</option>
              <option value="value-desc">Nilai tertinggi</option>
            </Select>
          </div>
        </div>

        {isLoading && !shouldUseFallbackList && !hasRenderableOrders ? (
          <div className="flex h-40 items-center justify-center rounded-[28px] border border-[var(--crumbella-border)] bg-[var(--crumbella-surface)] shadow-none">
            <div className="flex items-center gap-2 text-sm text-[var(--crumbella-muted)]">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--crumbella-accent)]" />
              Memuat data booking dari server...
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {isLoading ? (
              <div className="flex items-center gap-2 rounded-2xl border border-[var(--crumbella-border)] bg-[var(--crumbella-surface)] px-4 py-3 text-xs text-[var(--crumbella-muted)]">
                <Loader2 className="h-4 w-4 animate-spin text-[var(--crumbella-accent)]" />
                Memperbarui data booking...
              </div>
            ) : null}
            <OrderTable
              orders={displayOrders}
              onOrderDeleted={handleOrderDeleted}
              onOrderStatusUpdated={handleOrderStatusUpdated}
            />
          </div>
        )}

        {displayTotalCount > PAGE_SIZE ? (
          <div className="flex items-center justify-between gap-3 px-1 pt-1">
            <p className="text-[11px] text-[var(--crumbella-muted)]">
              Page {safeCurrentPage} dari {displayTotalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={safeCurrentPage === 1}
                className="inline-flex h-9 items-center justify-center rounded-xl border border-[var(--crumbella-border)] bg-[var(--crumbella-surface)] px-3 text-[11px] font-semibold text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-45"
              >
                Prev
              </button>
              <button
                type="button"
                onClick={() =>
                  setCurrentPage((prev) => Math.min(displayTotalPages, prev + 1))
                }
                disabled={safeCurrentPage === displayTotalPages}
                className="inline-flex h-9 items-center justify-center rounded-xl border border-[var(--crumbella-border)] bg-[var(--crumbella-surface)] px-3 text-[11px] font-semibold text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-45"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

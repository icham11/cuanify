"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpDown, BookOpen, Search } from "lucide-react";
import GradientPageHeader from "@/components/bakery/shared/GradientPageHeader";
import OrderTable from "@/components/bakery/bookings/OrderTable";
import { Select } from "@/components/ui/select";
import { useOrders } from "@/components/bakery/store";
import { normalizeOrderStatus } from "@/lib/bookings/order-status";
import {
  getJakartaTodayIsoDate,
  resolveShippingProvider,
} from "@/lib/bookings/shipping-schedule";

type CourierFilter = "" | "grab-gojek" | "paxel";
type OrderSourceFilter = "" | "customer" | "admin";
type SavedView = "all" | "active" | "today" | "tomorrow" | "production";

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

function inferDeliveryMethodFromText(rawValue?: string): string | undefined {
  const raw = (rawValue || "").trim().toLowerCase();
  if (!raw) return undefined;

  if (raw.includes("pickup")) return "PICKUP";
  if (raw.includes("customer_app_courier") || raw.includes("pesan customer") || raw.includes("customer")) {
    return "CUSTOMER_APP_COURIER";
  }
  if (raw.includes("assisted_")) return raw.toUpperCase();
  if (raw.includes("gosend") || raw.includes("go send")) return "ASSISTED_GOSEND";
  if (raw.includes("gocar") || raw.includes("go car")) return "ASSISTED_GOCAR";
  if (raw.includes("grab")) return "ASSISTED_GRAB";
  if (raw.includes("paxel")) return "ASSISTED_PAXEL";
  if (raw.includes("same day") || raw.includes("same-day") || raw.includes("sameday")) {
    return "ASSISTED_SAME_DAY";
  }
  if (raw.includes("jne") || raw.includes("j&t") || raw.includes("jnt")) {
    return "REGULAR_JNE_JNT";
  }

  return undefined;
}

function inferDeliveryMethodFromNotes(notes?: string): string | undefined {
  const match = notes?.match(/delivery\s*method\s*:\s*([^\n]+)/i);
  return inferDeliveryMethodFromText(match?.[1]);
}

function resolveOrderSource(order: {
  notes?: string;
  whatsAppParsedData?: { common?: { deliveryMethod?: string } };
}): "customer" | "admin" | null {
  const parsedMethod = inferDeliveryMethodFromText(
    order.whatsAppParsedData?.common?.deliveryMethod,
  );
  const noteMethod = inferDeliveryMethodFromNotes(order.notes);
  const deliveryMethod = parsedMethod || noteMethod;

  if (!deliveryMethod || deliveryMethod === "PICKUP") return null;
  if (deliveryMethod === "CUSTOMER_APP_COURIER") return "customer";
  if (deliveryMethod.startsWith("ASSISTED_") || deliveryMethod === "REGULAR_JNE_JNT") {
    return "admin";
  }

  return null;
}

export default function BookingListPage() {
  const { orders } = useOrders();

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [courierFilter, setCourierFilter] = useState<CourierFilter>("");
  const [orderSourceFilter, setOrderSourceFilter] =
    useState<OrderSourceFilter>("");
  const [sortBy, setSortBy] = useState<
    "delivery-asc" | "delivery-desc" | "name-asc" | "value-desc"
  >("delivery-asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [activeSavedView, setActiveSavedView] = useState<SavedView>("active");
  const today = getJakartaTodayIsoDate();
  const tomorrow = useMemo(() => addDaysToIsoDate(today, 1), [today]);
  const PAGE_SIZE = 10;

  const filteredOrders = useMemo(() => {
    const filtered = orders.filter((order) => {
      const normalizedOrderStatus = normalizeOrderStatus(order.orderStatus);
      const matchesQuery =
        order.customerName.toLowerCase().includes(query.toLowerCase()) ||
        order.resi.toLowerCase().includes(query.toLowerCase()) ||
        order.bookingCode.toLowerCase().includes(query.toLowerCase());
      const matchesStatus = statusFilter
        ? normalizedOrderStatus === statusFilter
        : true;
      const matchesDate = dateFilter ? order.deliveryDate === dateFilter : true;
      const provider = resolveShippingProvider(order);
      const matchesCourier =
        courierFilter === ""
          ? true
          : courierFilter === "grab-gojek"
            ? provider === "GRAB" || provider === "GOJEK"
            : provider === "PAXEL";
      const source = resolveOrderSource(order);
      const matchesOrderSource =
        orderSourceFilter === "" ? true : source === orderSourceFilter;
      const isViewAll = activeSavedView === "all";
      const isActiveView = activeSavedView === "active";
      const isStatusActive = !["Completed", "Delivered", "Cancelled"].includes(normalizedOrderStatus);
      const matchesSavedView = isViewAll || (isActiveView ? isStatusActive : true);

      return (
        matchesQuery &&
        matchesStatus &&
        matchesDate &&
        matchesCourier &&
        matchesOrderSource &&
        matchesSavedView
      );
    });

    if (sortBy === "delivery-asc") {
      return filtered
        .slice()
        .sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate));
    }

    if (sortBy === "delivery-desc") {
      return filtered
        .slice()
        .sort((a, b) => b.deliveryDate.localeCompare(a.deliveryDate));
    }

    if (sortBy === "name-asc") {
      return filtered
        .slice()
        .sort((a, b) => a.customerName.localeCompare(b.customerName));
    }

    return filtered
      .slice()
      .sort((a, b) => (b.totalPrice || 0) - (a.totalPrice || 0));
  }, [
    orders,
    query,
    statusFilter,
    dateFilter,
    courierFilter,
    orderSourceFilter,
    sortBy,
    activeSavedView,
  ]);

  const activeOrdersCount = useMemo(
    () =>
      orders.filter((order) => {
        const status = normalizeOrderStatus(order.orderStatus);
        return !["Completed", "Delivered", "Cancelled"].includes(status);
      }).length,
    [orders],
  );

  const unpaidCount = useMemo(
    () => filteredOrders.filter((order) => order.paymentStatus !== "Paid").length,
    [filteredOrders],
  );

  const hasActiveFilters = Boolean(
    query ||
      statusFilter ||
      dateFilter ||
      courierFilter ||
      orderSourceFilter ||
      activeSavedView !== "active" ||
      sortBy !== "delivery-asc",
  );

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pagedOrders = filteredOrders.slice(
    (safeCurrentPage - 1) * PAGE_SIZE,
    safeCurrentPage * PAGE_SIZE,
  );

  const resetFilters = () => {
    setQuery("");
    setStatusFilter("");
    setDateFilter("");
    setCourierFilter("");
    setOrderSourceFilter("");
    setSortBy("delivery-asc");
    setCurrentPage(1);
    setActiveSavedView("active");
  };

  const applySavedView = (view: SavedView) => {
    setCurrentPage(1);
    setActiveSavedView(view);

    if (view === "all" || view === "active") {
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
    <div className="space-y-4 pb-10">
      <GradientPageHeader
        title="Bookings"
        description={`${activeOrdersCount} order aktif`}
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
            <option value="grab-gojek">Grab/Gojek</option>
            <option value="paxel">Paxel</option>
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
            <option value="Inquiry">Inquiry</option>
            <option value="Quoted">Quoted</option>
            <option value="DP Paid">DP Paid</option>
            <option value="Confirmed">Confirmed</option>
            <option value="In Production">In Production</option>
            <option value="Ready">Ready</option>
            <option value="Delivery">Delivery</option>
            <option value="Completed">Completed</option>
            <option value="Delivered">Delivered</option>
            <option value="Cancelled">Cancelled</option>
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
              {filteredOrders.length} order
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
                  event.target.value as
                    | "delivery-asc"
                    | "delivery-desc"
                    | "name-asc"
                    | "value-desc",
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

        <OrderTable orders={pagedOrders} />

        {filteredOrders.length > PAGE_SIZE ? (
          <div className="flex items-center justify-between gap-3 px-1 pt-1">
            <p className="text-[11px] text-[var(--crumbella-muted)]">
              Page {safeCurrentPage} dari {totalPages}
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
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={safeCurrentPage === totalPages}
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

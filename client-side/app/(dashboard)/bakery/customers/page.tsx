"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MessageCircle, Search, Star, Users } from "lucide-react";
import { useRole } from "@/context/RoleContext";
import GradientPageHeader from "@/components/bakery/shared/GradientPageHeader";
import { apiFetch } from "@/lib/api/client";
import { ACTIVE_BUSINESS_CHANGED_EVENT } from "@/lib/api/business";
import { BAKERY_ORDERS_UPDATED_EVENT } from "@/lib/bookings/client-events";

type CustomerSegment = "all" | "vip" | "repeat" | "new";

type CustomerApiRow = {
  key: string;
  name: string;
  phone: string;
  address: string;
  orderCount: number;
  totalSpent: number;
  lastOrderDate: string;
  lastDeliverySlot: string;
};

type CustomerRow = CustomerApiRow & {
  isVip: boolean;
  isRepeat: boolean;
};

const VIP_THRESHOLD = 10_000_000;
const CUSTOMERS_PAGE_SIZE = 10;

function normalizePhone(value: string): string {
  return value.replace(/\s+/g, "").trim();
}

function normalizePhoneForWhatsApp(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  return digits;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.max(0, value));
}

function formatCurrencyCompact(value: number): string {
  const safeValue = Math.max(0, value);

  if (safeValue >= 1_000_000_000) {
    return `Rp${(safeValue / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (safeValue >= 1_000_000) {
    return `Rp${(safeValue / 1_000_000).toFixed(1).replace(/\.0$/, "")}jt`;
  }
  if (safeValue >= 1_000) {
    return `Rp${(safeValue / 1_000).toFixed(0)}rb`;
  }

  return formatCurrency(safeValue);
}

function formatLongDate(value: string): string {
  if (!value) return "-";
  const parsed = new Date(`${value}T00:00:00+07:00`);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(parsed);
}

function formatHeaderDate(value: Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(value);
}

function isCustomerVip(customer: { totalSpent: number }): boolean {
  return customer.totalSpent >= VIP_THRESHOLD;
}

function isCustomerRepeat(customer: { orderCount: number }): boolean {
  return customer.orderCount > 1;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);

  if (parts.length === 0) return "C";
  return parts.map((part) => part[0]?.toUpperCase() || "").join("");
}

function getPageNumbers(currentPage: number, totalPages: number): (number | "ellipsis")[] {
  const siblingCount = 1;
  const start = Math.max(2, currentPage - siblingCount);
  const end = Math.min(totalPages - 1, currentPage + siblingCount);

  const pages: (number | "ellipsis")[] = [1];

  if (start > 2) pages.push("ellipsis");
  for (let page = start; page <= end; page += 1) {
    pages.push(page);
  }
  if (end < totalPages - 1) pages.push("ellipsis");
  if (totalPages > 1) pages.push(totalPages);

  return pages;
}

function getSegmentLabel(customer: {
  isVip: boolean;
  isRepeat: boolean;
}): string {
  if (customer.isVip) return "VIP";
  if (customer.isRepeat) return "Repeat";
  return "New";
}

const VALID_SEGMENT_FILTERS: CustomerSegment[] = ["all", "vip", "repeat", "new"];

export default function BakeryCustomersPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isOwner, loading: roleLoading } = useRole();

  const initialQuery = searchParams.get("query") ?? "";
  const initialFilterParam = searchParams.get("filter") ?? "all";
  const initialFilter = (
    VALID_SEGMENT_FILTERS as string[]
  ).includes(initialFilterParam)
    ? (initialFilterParam as CustomerSegment)
    : "all";
  const requestedPage = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const initialPage =
    Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const [query, setQuery] = useState(initialQuery);
  const [activeFilter, setActiveFilter] = useState<CustomerSegment>(initialFilter);
  const [page, setPage] = useState(initialPage);
  const [customerRows, setCustomerRows] = useState<CustomerApiRow[]>([]);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(true);
  const [customersError, setCustomersError] = useState("");

  useEffect(() => {
    if (roleLoading) return;
    if (!isOwner) {
      router.replace("/bakery/bookings");
    }
  }, [isOwner, roleLoading, router]);

  useEffect(() => {
    if (roleLoading || !isOwner) return;
    if (typeof window === "undefined") return;

    let cancelled = false;

    const loadCustomers = async () => {
      setIsLoadingCustomers(true);

      try {
        const payload = (await apiFetch("/api/bookings/orders?mode=customers", {
          cache: "no-store",
        })) as {
          success?: boolean;
          data?: { customers?: CustomerApiRow[] };
          error?: string;
        };

        if (cancelled) return;

        if (!payload.success) {
          throw new Error(payload.error || "Gagal memuat data customer.");
        }

        setCustomerRows(
          Array.isArray(payload.data?.customers) ? payload.data.customers : [],
        );
        setCustomersError("");
      } catch (error) {
        if (cancelled) return;
        setCustomersError(
          error instanceof Error
            ? error.message
            : "Gagal memuat data customer.",
        );
      } finally {
        if (!cancelled) {
          setIsLoadingCustomers(false);
        }
      }
    };

    const handleRefresh = () => {
      void loadCustomers();
    };

    void loadCustomers();
    window.addEventListener(
      ACTIVE_BUSINESS_CHANGED_EVENT,
      handleRefresh as EventListener,
    );
    window.addEventListener(
      BAKERY_ORDERS_UPDATED_EVENT,
      handleRefresh as EventListener,
    );

    return () => {
      cancelled = true;
      window.removeEventListener(
        ACTIVE_BUSINESS_CHANGED_EVENT,
        handleRefresh as EventListener,
      );
      window.removeEventListener(
        BAKERY_ORDERS_UPDATED_EVENT,
        handleRefresh as EventListener,
      );
    };
  }, [isOwner, roleLoading]);

  const allCustomers = useMemo<CustomerRow[]>(
    () =>
      customerRows.map((customer) => ({
        ...customer,
        phone: normalizePhone(customer.phone || ""),
        isVip: isCustomerVip(customer),
        isRepeat: isCustomerRepeat(customer),
      })),
    [customerRows],
  );

  const summary = useMemo(() => {
    const vipCount = allCustomers.filter((customer) => customer.isVip).length;
    const repeatCount = allCustomers.filter(
      (customer) => customer.isRepeat,
    ).length;
    const revenue = allCustomers.reduce(
      (sum, customer) => sum + customer.totalSpent,
      0,
    );

    return {
      totalCustomers: allCustomers.length,
      vipCount,
      repeatCount,
      revenue,
    };
  }, [allCustomers]);

  const filteredCustomers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return allCustomers.filter((customer) => {
      const matchesFilter =
        activeFilter === "all"
          ? true
          : activeFilter === "vip"
            ? customer.isVip
            : activeFilter === "repeat"
              ? customer.isRepeat
              : !customer.isVip && !customer.isRepeat;

      if (!matchesFilter) return false;
      if (!normalizedQuery) return true;

      return [customer.name, customer.phone, customer.address].some((value) =>
        value.toLowerCase().includes(normalizedQuery),
      );
    });
  }, [activeFilter, allCustomers, query]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredCustomers.length / CUSTOMERS_PAGE_SIZE),
  );
  const safePage = Math.min(page, totalPages);

  const pageCustomers = useMemo(() => {
    const start = (safePage - 1) * CUSTOMERS_PAGE_SIZE;
    return filteredCustomers.slice(start, start + CUSTOMERS_PAGE_SIZE);
  }, [filteredCustomers, safePage]);

  const topCustomerKey = filteredCustomers[0]?.key;

  useEffect(() => {
    if (isLoadingCustomers) return;
    if (page !== safePage) {
      setPage(safePage);
    }
  }, [isLoadingCustomers, page, safePage]);

  useEffect(() => {
    if (isLoadingCustomers) return;

    const params = new URLSearchParams();
    const trimmedQuery = query.trim();

    if (trimmedQuery) params.set("query", trimmedQuery);
    if (activeFilter !== "all") params.set("filter", activeFilter);
    if (safePage > 1) params.set("page", String(safePage));

    const queryString = params.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
      scroll: false,
    });
  }, [activeFilter, isLoadingCustomers, pathname, query, router, safePage]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setPage(1);
  };

  const handleFilterChange = (filter: CustomerSegment) => {
    setActiveFilter(filter);
    setPage(1);
  };

  const todayLabel = useMemo(() => formatHeaderDate(new Date()), []);

  if (roleLoading || !isOwner) {
    return null;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-10">
      <GradientPageHeader
        title="Data Customer"
        description={todayLabel}
        icon={Users}
        actions={
          <div className="flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-[12px] font-bold text-[#9e4e1f]">
            FE
          </div>
        }
      />

      <section className="space-y-3 rounded-[28px] border border-[var(--crumbella-border)] bg-[var(--crumbella-surface)] p-4 shadow-[0_16px_30px_-24px_rgba(30,18,10,0.45)]">
        <div className="mt-5 rounded-[24px] border border-[#eadbce] bg-transparent">
          <div className="flex items-center gap-2 rounded-[14px] border border-[#d9c7b8] bg-white px-4 py-[11px] shadow-[0_4px_12px_-10px_rgba(76,47,25,0.45)]">
            <Search className="h-[15px] w-[15px] text-[#dc6f2d]" />
            <input
              value={query}
              onChange={(event) => handleQueryChange(event.target.value)}
              placeholder="Cari nama customer..."
              className="w-full bg-transparent text-[14px] leading-none text-[#765443] outline-none placeholder:text-[#cf8f6d]"
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {[
              { value: "all", label: "Semua" },
              { value: "vip", label: "VIP > Rp10jt" },
              { value: "repeat", label: "Repeat" },
              { value: "new", label: "New" },
            ].map((filter) => {
              const isActive = activeFilter === filter.value;

              return (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() =>
                    handleFilterChange(filter.value as CustomerSegment)
                  }
                  className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-4 text-[13px] font-semibold transition ${
                    isActive
                      ? "border-[#d96d28] bg-[#d96d28] text-white shadow-[0_8px_18px_-14px_rgba(217,109,40,0.9)]"
                      : "border-[#dec9b9] bg-white text-[#7a4928]"
                  }`}
                >
                  {filter.value === "vip" ? (
                    <Star className="h-3.5 w-3.5 fill-current" />
                  ) : null}
                  {filter.label}
                </button>
              );
            })}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div className="rounded-[16px] border border-[#dcc7b5] bg-[#fffaf6] px-2 py-3 text-center shadow-[0_10px_24px_-22px_rgba(62,38,18,0.55)]">
              <p className="text-[18px] font-black leading-none text-[#1e1814]">
                {summary.totalCustomers}
              </p>
              <p className="mt-1 text-[10px] text-[#8c6f5f]">Customer</p>
            </div>
            <div className="rounded-[16px] border border-[#dcc7b5] bg-[#fffaf6] px-2 py-3 text-center shadow-[0_10px_24px_-22px_rgba(62,38,18,0.55)]">
              <p className="text-[18px] font-black leading-none text-[#d19a00]">
                {summary.vipCount}
              </p>
              <p className="mt-1 text-[10px] text-[#8c6f5f]">VIP</p>
            </div>
            <div className="rounded-[16px] border border-[#dcc7b5] bg-[#fffaf6] px-2 py-3 text-center shadow-[0_10px_24px_-22px_rgba(62,38,18,0.55)]">
              <p className="text-[18px] font-black leading-none text-[#173a20]">
                {summary.repeatCount}
              </p>
              <p className="mt-1 text-[10px] text-[#8c6f5f]">Repeat</p>
            </div>
            <div className="rounded-[16px] border border-[#dcc7b5] bg-[#fffaf6] px-2 py-3 text-center shadow-[0_10px_24px_-22px_rgba(62,38,18,0.55)]">
              <p className="text-[15px] font-black leading-none text-[#1e1814]">
                {formatCurrencyCompact(summary.revenue)}
              </p>
              <p className="mt-1 text-[10px] text-[#8c6f5f]">Revenue</p>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between px-0.5 text-sm">
          <p className="text-[15px] font-semibold text-[#2e1d14]">
            {filteredCustomers.length > 0
              ? `${(safePage - 1) * CUSTOMERS_PAGE_SIZE + 1}-${Math.min(
                  safePage * CUSTOMERS_PAGE_SIZE,
                  filteredCustomers.length,
                )} dari ${filteredCustomers.length} customer`
              : "0 customer"}
          </p>
          <p className="text-[15px] font-semibold text-[#b75c23]">
            {filteredCustomers.length > 0 ? "1 Terbesar" : ""}
          </p>
        </div>

        <div className="mt-2.5 grid gap-3 xl:grid-cols-2">
          {customersError ? (
            <div className="rounded-[24px] border border-[#e9c8be] bg-[#fff4f1] px-5 py-4 text-sm text-[#a44f37] shadow-[0_18px_42px_-30px_rgba(103,66,39,0.5)]">
              {customersError}
            </div>
          ) : null}

          {isLoadingCustomers && filteredCustomers.length === 0 ? (
            <div className="rounded-[24px] border border-[#dcc7b5] bg-[#fffaf6] px-5 py-10 text-center text-sm text-[#94755f] shadow-[0_18px_42px_-30px_rgba(103,66,39,0.5)]">
              Memuat seluruh data customer dari database...
            </div>
          ) : null}

          {!isLoadingCustomers &&
          !customersError &&
          filteredCustomers.length === 0 ? (
            <div className="rounded-[24px] border border-[#dcc7b5] bg-[#fffaf6] px-5 py-10 text-center text-sm text-[#94755f] shadow-[0_18px_42px_-30px_rgba(103,66,39,0.5)]">
              Tidak ada data customer untuk filter ini.
            </div>
          ) : null}

          {pageCustomers.map((customer) => {
            const isVip = customer.isVip;
            const whatsAppPhone = normalizePhoneForWhatsApp(customer.phone);
            const averageSpend =
              customer.orderCount > 0
                ? customer.totalSpent / customer.orderCount
                : 0;

            return (
              <div
                key={customer.key}
                className={`overflow-hidden rounded-[18px] border bg-white shadow-[0_12px_28px_-24px_rgba(103,66,39,0.45)] ${
                  isVip
                    ? "border-[#e4b13e] bg-[#fff8e8]"
                    : "border-[#ddcec2] bg-[#fffaf6]"
                }`}
              >
                <div className="flex min-h-[76px] items-start justify-between gap-3 px-[14px] py-[12px]">
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className={`flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full border text-[18px] font-black ${
                        isVip
                          ? "border-[#d79f2f] bg-white text-[#9a661d]"
                          : "border-[#ead8ca] bg-[#fff5ef] text-[#b45c2a]"
                      }`}
                    >
                      {getInitials(customer.name)}
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-[15px] font-black leading-none text-[#1f140f]">
                          {customer.name}
                        </p>
                        {isVip ? (
                          <span className="inline-flex h-[18px] items-center gap-1 rounded-full bg-[#7f5920] px-1.5 text-[9px] font-bold uppercase tracking-[0.02em] text-[#ffe39e]">
                            <Star className="h-[10px] w-[10px] fill-current" />
                            VIP
                          </span>
                        ) : (
                          <span className="rounded-full bg-[#f8ede2] px-2 py-[2px] text-[9px] font-bold uppercase tracking-[0.02em] text-[#9b6038]">
                            {getSegmentLabel(customer)}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[12px] leading-none text-[#b08a71]">
                        Terakhir order {formatLongDate(customer.lastOrderDate)}
                      </p>
                    </div>
                  </div>

                  <a
                    href={
                      whatsAppPhone
                        ? `https://wa.me/${whatsAppPhone}`
                        : undefined
                    }
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Chat WhatsApp ${customer.name}`}
                    className={`mt-[2px] flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-full border transition ${
                      whatsAppPhone
                        ? "border-[#9ed8b8] bg-[radial-gradient(circle_at_35%_35%,#f6ecff_0%,#ddf7eb_62%,#d4efdf_100%)] text-[#af86dd] hover:scale-[1.02]"
                        : "pointer-events-none border-[#d9d9d9] bg-[#f3f3f3] text-[#a7a7a7]"
                    }`}
                  >
                    <MessageCircle className="h-[15px] w-[15px]" />
                  </a>
                </div>

                <div
                  className={`grid grid-cols-3 border-t text-sm ${
                    isVip ? "border-[#e4b13e]" : "border-[#eadccf]"
                  }`}
                >
                  <div className="border-r border-inherit px-[12px] py-[9px]">
                    <p className="text-[9px] uppercase tracking-[0.12em] text-[#c09a80]">
                      Total Spend
                    </p>
                    <p className="mt-1 text-[11px] font-black leading-none text-[#de6826]">
                      {formatCurrency(customer.totalSpent)}
                    </p>
                  </div>
                  <div className="border-r border-inherit px-[12px] py-[9px]">
                    <p className="text-[9px] uppercase tracking-[0.12em] text-[#c09a80]">
                      Transaksi
                    </p>
                    <p className="mt-1 text-[11px] font-black leading-none text-[#1f2554]">
                      {customer.orderCount}x
                    </p>
                  </div>
                  <div className="px-[12px] py-[9px]">
                    <p className="text-[9px] uppercase tracking-[0.12em] text-[#c09a80]">
                      Avg / Trx
                    </p>
                    <p className="mt-1 text-[11px] font-black leading-none text-[#111b43]">
                      {formatCurrencyCompact(averageSpend)}
                    </p>
                  </div>
                </div>

                {customer.key === topCustomerKey ? (
                  <div className="flex items-center gap-2 border-t border-dashed border-[#edd8c8] px-[14px] py-2 text-[10px] font-semibold text-[#b5662b]">
                    <Users className="h-3 w-3" />
                    Customer dengan total spend terbesar saat ini
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {filteredCustomers.length > CUSTOMERS_PAGE_SIZE ? (
          <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={safePage === 1}
              className="rounded-full border border-[#dec9b9] bg-white px-3.5 py-2 text-[13px] font-semibold text-[#7a4928] transition disabled:opacity-40"
            >
              Sebelumnya
            </button>

            {getPageNumbers(safePage, totalPages).map((entry, index) =>
              entry === "ellipsis" ? (
                <span
                  key={`ellipsis-${index}`}
                  className="px-1.5 text-[13px] font-semibold text-[#b08a71]"
                >
                  …
                </span>
              ) : (
                <button
                  key={entry}
                  type="button"
                  onClick={() => setPage(entry)}
                  aria-current={entry === safePage ? "page" : undefined}
                  className={`h-9 min-w-9 rounded-full px-2 text-[13px] font-semibold transition ${
                    entry === safePage
                      ? "bg-[#d96d28] text-white shadow-[0_8px_18px_-14px_rgba(217,109,40,0.9)]"
                      : "border border-[#dec9b9] bg-white text-[#7a4928]"
                  }`}
                >
                  {entry}
                </button>
              ),
            )}

            <button
              type="button"
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={safePage === totalPages}
              className="rounded-full border border-[#dec9b9] bg-white px-3.5 py-2 text-[13px] font-semibold text-[#7a4928] transition disabled:opacity-40"
            >
              Berikutnya
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

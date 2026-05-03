import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { BOOKING_STATUS_OPTIONS } from "@/lib/bookings/order-status";

interface OrderFiltersProps {
  query: string;
  status: string;
  date: string;
  courier: "" | "grab-gojek" | "paxel";
  sortBy: "delivery-asc" | "delivery-desc" | "name-asc" | "value-desc";
  hasActiveFilters: boolean;
  onQueryChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onDateChange: (value: string) => void;
  onCourierChange: (value: "" | "grab-gojek" | "paxel") => void;
  onSortChange: (
    value: "delivery-asc" | "delivery-desc" | "name-asc" | "value-desc",
  ) => void;
  onReset: () => void;
  onSavedViewSelect: (
    view: "today" | "tomorrow" | "production" | "ready",
  ) => void;
}

export default function OrderFilters({
  query,
  status,
  date,
  courier,
  sortBy,
  hasActiveFilters,
  onQueryChange,
  onStatusChange,
  onDateChange,
  onCourierChange,
  onSortChange,
  onReset,
  onSavedViewSelect,
}: OrderFiltersProps) {
  const quickButtonClass =
    "h-8 rounded-full border border-[var(--crumbella-border)] bg-[var(--crumbella-surface)] px-3 text-xs font-semibold text-[var(--crumbella-primary)]";

  return (
    <Card className="rounded-2xl">
      <CardHeader className="p-5 pb-2">
        <CardTitle>Filters</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-5 pb-5 pt-0">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className={quickButtonClass}
            onClick={() => onSavedViewSelect("today")}
          >
            Hari Ini
          </Button>
          <Button
            type="button"
            variant="outline"
            className={quickButtonClass}
            onClick={() => onSavedViewSelect("tomorrow")}
          >
            Besok
          </Button>
          <Button
            type="button"
            variant="outline"
            className={quickButtonClass}
            onClick={() => onSavedViewSelect("production")}
          >
            In Production
          </Button>
          <Button
            type="button"
            variant="outline"
            className={quickButtonClass}
            onClick={() => onSavedViewSelect("ready")}
          >
            Ready
          </Button>
        </div>

        <div className="grid gap-3 lg:grid-cols-[2fr,1fr,1fr,1fr,1fr,auto]">
          <Input
            placeholder="Cari booking/customer"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            className="h-10 rounded-xl border-[var(--crumbella-border)] bg-white"
          />
          <Select
            value={status}
            onChange={(event) => onStatusChange(event.target.value)}
            className="h-10 rounded-xl border-[var(--crumbella-border)] bg-white"
          >
            <option value="">All status</option>
            {BOOKING_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Input
            type="date"
            value={date}
            onChange={(event) => onDateChange(event.target.value)}
            className="h-10 rounded-xl border-[var(--crumbella-border)] bg-white"
          />
          <Select
            value={courier}
            onChange={(event) =>
              onCourierChange(event.target.value as "" | "grab-gojek" | "paxel")
            }
            className="h-10 rounded-xl border-[var(--crumbella-border)] bg-white"
          >
            <option value="">All courier</option>
            <option value="grab-gojek">Grab/Gojek</option>
            <option value="paxel">Paxel</option>
          </Select>
          <Select
            value={sortBy}
            onChange={(event) =>
              onSortChange(
                event.target.value as
                  | "delivery-asc"
                  | "delivery-desc"
                  | "name-asc"
                  | "value-desc",
              )
            }
            className="h-10 rounded-xl border-[var(--crumbella-border)] bg-white"
          >
            <option value="delivery-asc">Sort: Delivery (Soonest)</option>
            <option value="delivery-desc">Sort: Delivery (Latest)</option>
            <option value="name-asc">Sort: Customer Name</option>
            <option value="value-desc">Sort: Total Value</option>
          </Select>
          <Button
            type="button"
            variant="outline"
            disabled={!hasActiveFilters && sortBy === "delivery-asc"}
            onClick={onReset}
            className="h-10 rounded-xl border-[var(--crumbella-border)] bg-[var(--crumbella-surface)] text-[var(--crumbella-primary)]"
          >
            Reset
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

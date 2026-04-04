import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { BOOKING_STATUS_OPTIONS } from "@/lib/bookings/order-status";

interface OrderFiltersProps {
  query: string;
  status: string;
  date: string;
  sortBy: "delivery-asc" | "delivery-desc" | "name-asc" | "value-desc";
  hasActiveFilters: boolean;
  onQueryChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onDateChange: (value: string) => void;
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
  sortBy,
  hasActiveFilters,
  onQueryChange,
  onStatusChange,
  onDateChange,
  onSortChange,
  onReset,
  onSavedViewSelect,
}: OrderFiltersProps) {
  return (
    <Card className="rounded-xl shadow-sm">
      <CardHeader className="p-6 pb-2">
        <CardTitle>Filters</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-6 pb-6 pt-0">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-8 rounded-lg px-3 text-xs"
            onClick={() => onSavedViewSelect("today")}
          >
            Today
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-8 rounded-lg px-3 text-xs"
            onClick={() => onSavedViewSelect("tomorrow")}
          >
            Tomorrow
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-8 rounded-lg px-3 text-xs"
            onClick={() => onSavedViewSelect("production")}
          >
            In Production
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-8 rounded-lg px-3 text-xs"
            onClick={() => onSavedViewSelect("ready")}
          >
            Ready
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[2fr,1fr,1fr,1fr,auto]">
          <Input
            placeholder="Search booking code or customer"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
          <Select
            value={status}
            onChange={(event) => onStatusChange(event.target.value)}
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
          />
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
          >
            Reset
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

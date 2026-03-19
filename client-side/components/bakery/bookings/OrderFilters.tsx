import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

interface OrderFiltersProps {
  query: string;
  status: string;
  date: string;
  onQueryChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onDateChange: (value: string) => void;
}

export default function OrderFilters({
  query,
  status,
  date,
  onQueryChange,
  onStatusChange,
  onDateChange,
}: OrderFiltersProps) {
  return (
    <Card className="rounded-xl shadow-sm">
      <CardHeader className="p-6 pb-2">
        <CardTitle>Filters</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 px-6 pb-6 pt-0 lg:grid-cols-[2fr,1fr,1fr]">
        <Input
          placeholder="Search by resi or customer"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
        <Select
          value={status}
          onChange={(event) => onStatusChange(event.target.value)}
        >
          <option value="">All status</option>
          <option value="Inquiry">Inquiry</option>
          <option value="Quoted">Quoted</option>
          <option value="DP Paid">DP Paid</option>
          <option value="Confirmed">Confirmed</option>
          <option value="In Production">In Production</option>
          <option value="Ready">Ready</option>
          <option value="Completed">Completed</option>
          <option value="Delivered">Delivered</option>
          <option value="Cancelled">Cancelled</option>
        </Select>
        <Input
          type="date"
          value={date}
          onChange={(event) => onDateChange(event.target.value)}
        />
      </CardContent>
    </Card>
  );
}

import { Select } from "@/components/ui/select";

interface StatusDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options?: string[];
  disabled?: boolean;
}

const defaultOptions = [
  "In Production",
  "Ready",
  "Delivery",
  "Completed",
  "Cancelled",
];

export default function StatusDropdown({
  value,
  onChange,
  options = defaultOptions,
  disabled = false,
}: StatusDropdownProps) {
  return (
    <Select
      value={value}
      disabled={disabled}
      className={
        disabled
          ? "cursor-not-allowed bg-slate-100 text-slate-500 opacity-70"
          : undefined
      }
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </Select>
  );
}

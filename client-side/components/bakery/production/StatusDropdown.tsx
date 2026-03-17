import { Select } from "@/components/ui/select";

interface StatusDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options?: string[];
}

const defaultOptions = [
  "Pending",
  "Confirmed",
  "In Production",
  "Ready",
  "Delivered",
];

export default function StatusDropdown({
  value,
  onChange,
  options = defaultOptions,
}: StatusDropdownProps) {
  return (
    <Select value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </Select>
  );
}

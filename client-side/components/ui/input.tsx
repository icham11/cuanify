import * as React from "react";

function cn(...classes: Array<string | undefined | false>) {
  return classes.filter(Boolean).join(" ");
}

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type = "text", ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      "h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
      className
    )}
    {...props}
  />
));

Input.displayName = "Input";

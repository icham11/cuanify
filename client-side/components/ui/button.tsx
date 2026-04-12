import * as React from "react";

function cn(...classes: Array<string | undefined | false>) {
  return classes.filter(Boolean).join(" ");
}

type ButtonVariant = "default" | "outline" | "ghost" | "secondary";
type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClasses: Record<ButtonVariant, string> = {
  default:
    "bg-[#f36f21] text-white hover:bg-[#d85f1c] focus-visible:ring-[#f36f21]",
  outline:
    "border border-[#dbe2ea] text-[#243b5a] hover:bg-[#fff4ed] focus-visible:ring-[#334e68]",
  ghost: "text-[#243b5a] hover:bg-[#fff4ed] focus-visible:ring-[#334e68]",
  secondary:
    "bg-[#243b5a] text-white hover:bg-[#1f324d] focus-visible:ring-[#334e68]",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-5 text-base",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = "default", size = "md", type = "button", ...props },
    ref
  ) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center rounded-xl font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    />
  )
);

Button.displayName = "Button";

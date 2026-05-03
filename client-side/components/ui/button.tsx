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
    "bg-[var(--crumbella-accent)] text-white hover:bg-[var(--crumbella-accent-hover)] focus-visible:ring-[var(--crumbella-focus)]",
  outline:
    "border border-[var(--crumbella-border)] text-[var(--foreground)] hover:bg-[var(--crumbella-accent-soft)] focus-visible:ring-[var(--crumbella-focus)]",
  ghost:
    "text-[var(--foreground)] hover:bg-[var(--crumbella-accent-soft)] focus-visible:ring-[var(--crumbella-focus)]",
  secondary:
    "bg-[var(--crumbella-primary)] text-white hover:bg-[var(--crumbella-primary-soft)] focus-visible:ring-[var(--crumbella-focus)]",
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

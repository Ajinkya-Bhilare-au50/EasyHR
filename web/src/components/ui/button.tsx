import { Loader2, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "destructive" | "success";
type Size = "sm" | "md" | "icon" | "icon-sm";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-white hover:bg-primary-hover shadow-[0_1px_2px_rgb(16_24_40/0.08)]",
  secondary: "bg-secondary-soft text-secondary hover:bg-secondary-soft-hover",
  outline: "border border-line bg-surface text-ink hover:bg-subtle hover:border-line-strong",
  ghost: "text-ink-2 hover:bg-neutral-soft hover:text-ink",
  destructive: "bg-danger text-white hover:bg-[#991b1b]",
  success: "bg-success text-white hover:bg-[#166534]",
};

const sizes: Record<Size, string> = {
  md: "h-btn px-4 gap-2 text-body font-medium",
  sm: "h-8 px-3 gap-1.5 text-[13px] font-medium",
  icon: "size-btn justify-center",
  "icon-sm": "size-8 justify-center",
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  loading?: boolean;
  href?: string;
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(
    "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-control transition-colors duration-150",
    "disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
    variants[variant],
    sizes[size],
    className,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  icon: Icon,
  iconRight: IconRight,
  loading,
  disabled,
  className,
  children,
  href,
  type = "button",
  ...rest
}: ButtonProps) {
  const iconSize = size === "sm" || size === "icon-sm" ? 16 : 18;
  const content = (
    <>
      {loading ? <Loader2 size={iconSize} className="animate-spin" /> : Icon ? <Icon size={iconSize} strokeWidth={2} /> : null}
      {children}
      {IconRight && !loading ? <IconRight size={iconSize} strokeWidth={2} /> : null}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={buttonClass(variant, size, className)}>
        {content}
      </Link>
    );
  }
  return (
    <button type={type} disabled={disabled || loading} className={buttonClass(variant, size, className)} {...rest}>
      {content}
    </button>
  );
}

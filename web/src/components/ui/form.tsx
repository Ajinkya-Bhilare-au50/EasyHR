import { ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const control =
  "w-full rounded-control border border-line bg-surface text-body text-ink placeholder:text-ink-3 transition-[border-color,box-shadow] duration-150 " +
  "hover:border-line-strong focus:border-secondary focus:shadow-focus focus:outline-none disabled:cursor-not-allowed disabled:bg-subtle disabled:text-ink-2 " +
  "aria-[invalid=true]:border-danger aria-[invalid=true]:focus:shadow-[0_0_0_3px_rgb(185_28_28/0.15)]";

/** Persistent label above the control, helper or error text below. */
export function Field({
  label,
  htmlFor,
  required,
  error,
  hint,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: string | null;
  hint?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      {children}
      {error ? (
        <p className="text-helper text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-helper text-ink-2">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({
  className,
  icon: Icon,
  invalid,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { icon?: LucideIcon; invalid?: boolean }) {
  if (Icon) {
    return (
      <div className="relative">
        <Icon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
        <input aria-invalid={invalid || undefined} className={cn(control, "h-input pl-9 pr-3", className)} {...rest} />
      </div>
    );
  }
  return <input aria-invalid={invalid || undefined} className={cn(control, "h-input px-3", className)} {...rest} />;
}

export function Select({
  className,
  invalid,
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <div className="relative">
      <select aria-invalid={invalid || undefined} className={cn(control, "h-input cursor-pointer appearance-none pl-3 pr-9", className)} {...rest}>
        {children}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-3" />
    </div>
  );
}

export function Textarea({ className, invalid, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return <textarea aria-invalid={invalid || undefined} className={cn(control, "min-h-24 px-3 py-2.5", className)} {...rest} />;
}

export function Checkbox({ label, className, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode }) {
  return (
    <label className={cn("flex cursor-pointer select-none items-center gap-2.5 text-body text-ink", className)}>
      <input type="checkbox" className="size-4 cursor-pointer rounded border-line-strong accent-secondary" {...rest} />
      {label}
    </label>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span>
        <span className="block text-body font-medium text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-helper text-ink-2">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors",
          checked ? "bg-secondary" : "bg-line-strong",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-[22px]" : "translate-x-0.5",
          )}
        />
      </button>
    </label>
  );
}

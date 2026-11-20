import { cn } from "@/lib/utils";

const palette = [
  "bg-[#e8eef6] text-[#1e3a5f]",
  "bg-[#ecfdf8] text-[#0f766e]",
  "bg-[#eff4ff] text-[#1d4ed8]",
  "bg-[#fdf2f8] text-[#9d174d]",
  "bg-[#fffbeb] text-[#92400e]",
  "bg-[#f5f3ff] text-[#5b21b6]",
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

const sizes = { xs: "size-6 text-[10px]", sm: "size-8 text-[12px]", md: "size-10 text-[13px]", lg: "size-14 text-[17px]", xl: "size-20 text-[24px]" };

export function Avatar({
  name,
  initials,
  size = "md",
  className,
}: {
  name: string;
  initials?: string;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const ini = initials ?? name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  return (
    <span
      aria-hidden
      className={cn("grid shrink-0 place-items-center rounded-full font-semibold", palette[hash(name) % palette.length], sizes[size], className)}
    >
      {ini}
    </span>
  );
}

export function PersonCell({
  user,
  sub,
  size = "sm",
}: {
  user: { name: string; initials?: string; employeeCode?: string | null; designation?: string | null };
  sub?: React.ReactNode;
  size?: "xs" | "sm" | "md";
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Avatar name={user.name} initials={user.initials} size={size} />
      <div className="min-w-0">
        <div className="truncate font-medium text-ink">{user.name}</div>
        <div className="truncate text-helper text-ink-2">
          {sub ?? [user.employeeCode, user.designation].filter(Boolean).join(" · ")}
        </div>
      </div>
    </div>
  );
}

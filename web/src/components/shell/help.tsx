"use client";

import { BookOpen, CalendarDays, Clock, Network, Palmtree, UserRound } from "lucide-react";
import { Drawer } from "../ui/dialog";

const TOPICS = [
  {
    match: "/leaves",
    icon: CalendarDays,
    title: "Applying for leave",
    points: [
      "Pick a backup employee who will cover your work. It is required.",
      "Applied days count every calendar day; actual days exclude holidays and week-offs and are what is deducted.",
      "Unpaid types are labelled LWP/LOP and do not need a balance.",
      "Requests go to your manager, then are marked completed. You can cancel a pending request, or an approved one before it starts.",
    ],
  },
  {
    match: "/attendance",
    icon: Clock,
    title: "Attendance and rationalization",
    points: [
      "Check-in and check-out use the server clock, so your device time does not matter.",
      "Forgot to punch? Request a rationalization within the allowed window. Your manager approves it and the day is recalculated.",
      "Original punches are never edited. Corrections are added as separate, audit-logged records.",
      "Months whose payroll is locked cannot be changed.",
    ],
  },
  {
    match: "/holiday",
    icon: Palmtree,
    title: "Optional holidays",
    points: [
      "Choose from the optional holidays your company offers, up to the yearly limit.",
      "A backup employee is required, just like leave.",
      "Requests follow the same approval chain as leave.",
    ],
  },
  {
    match: "/org-chart",
    icon: Network,
    title: "Org chart",
    points: [
      "Filter by a criterion such as department or branch; the reporting line above each match is kept.",
      "Choose which details appear on each card, switch between top-down and flat views, and export to PNG or PDF.",
    ],
  },
  {
    match: "/profile",
    icon: UserRound,
    title: "Your profile",
    points: ["Compensation is visible only to you and HR.", "Contact HR to correct professional details such as designation or department."],
  },
];

export function HelpDrawer({ open, onClose, pathname }: { open: boolean; onClose: () => void; pathname: string }) {
  const sorted = [...TOPICS].sort((a, b) => Number(pathname.startsWith(b.match)) - Number(pathname.startsWith(a.match)));
  return (
    <Drawer open={open} onClose={onClose} title="Need help?">
      <div className="space-y-4 p-5">
        {sorted.map((t, i) => {
          const Icon = t.icon;
          const current = i === 0 && pathname.startsWith(t.match);
          return (
            <section key={t.title} className={current ? "rounded-card border border-info-line bg-info-soft/50 p-4" : "rounded-card border border-line p-4"}>
              <h3 className="mb-2 flex items-center gap-2 text-card text-ink">
                <Icon size={18} className="text-secondary" /> {t.title}
                {current && <span className="ml-auto text-helper font-medium text-info">This page</span>}
              </h3>
              <ul className="list-disc space-y-1.5 pl-5 text-body text-ink-2">
                {t.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </section>
          );
        })}
        <p className="flex items-center gap-2 text-helper text-ink-2">
          <BookOpen size={14} /> Still stuck? Message your HR team from the chat icon.
        </p>
      </div>
    </Drawer>
  );
}

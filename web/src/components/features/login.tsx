"use client";

import { Building2, CalendarDays, Clock, Eye, EyeOff, KeyRound, LogIn, Network, ShieldCheck, UserRound } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { api, clearApiCache } from "@/lib/api";
import { Button } from "../ui/button";
import { Alert } from "../ui/feedback";
import { Field, Input, Select } from "../ui/form";
import { Logo } from "../shell/logo";
import { CreditBanner, ThemeToggle } from "../shell/theme";
import { GlobalOfficesArt } from "./global-offices-art";

const FEATURES = [
  { icon: Clock, title: "One-click attendance", text: "Check in from anywhere, with corrections your manager can approve." },
  { icon: CalendarDays, title: "Leave and holidays", text: "Apply, approve and track balances with a clear approval chain." },
  { icon: Network, title: "Your whole organisation", text: "A live org chart with filters, details and export." },
];

const noopSubscribe = () => () => {};

/**
 * Base domain that company subdomains live under. Must match the API's BASE_DOMAIN. Baked in at
 * build time. Default "localhost" (alphabet-inc.localhost:3000 in development).
 */
const BASE_DOMAIN = (process.env.NEXT_PUBLIC_BASE_DOMAIN || "localhost").toLowerCase();

/**
 * Tenant from the address: only `<workspace>.<BASE_DOMAIN>`, e.g. alphabet-inc.localhost or
 * acme.hr.example.com -> "acme". Any other host (e.g. a hosting address like
 * web-production-1234.up.railway.app) is not a company subdomain, so the workspace field stays editable.
 */
function workspaceFromHost() {
  const host = window.location.hostname.toLowerCase();
  const suffix = `.${BASE_DOMAIN}`;
  if (!host.endsWith(suffix)) return "";
  const sub = host.slice(0, -suffix.length);
  return sub && !sub.includes(".") && sub !== "www" ? sub : "";
}

function rememberedWorkspace() {
  try {
    return localStorage.getItem("easyhr.workspace") ?? "";
  } catch {
    return "";
  }
}

/** Demo accounts created by `python -m app.seed`. Set NEXT_PUBLIC_SHOW_DEMO_LOGINS=false to hide the picker. */
const SHOW_DEMO = process.env.NEXT_PUBLIC_SHOW_DEMO_LOGINS !== "false";
const DEMO_PASSWORD = "Password@123";
const DEMO_ACCOUNTS = [
  { id: "2140", group: "Key roles", label: "Arjun Patel – Employee (2140)", workspace: "alphabet-inc", login: "2140", password: DEMO_PASSWORD },
  { id: "1010", group: "Key roles", label: "Priya Sharma – Manager (1010)", workspace: "alphabet-inc", login: "1010", password: DEMO_PASSWORD },
  { id: "1003", group: "Key roles", label: "Kavya Nair – HR / company admin (1003)", workspace: "alphabet-inc", login: "1003", password: DEMO_PASSWORD },
  { id: "master", group: "Key roles", label: "Platform admin – Master admin console", workspace: "admin", login: "admin@easyhr.app", password: "Admin@12345" },
  ...[
    ["1001", "Ananya Iyer – CEO"],
    ["1002", "Rohan Mehta – Head of Engineering"],
    ["1004", "Vikram Singh – Head of Sales"],
    ["2141", "Sneha Reddy – Software Engineer"],
    ["2142", "Karan Malhotra – QA Engineer"],
    ["2143", "Ajinkya Bhilare – Full Stack Developer"],
    ["2150", "Meera Joshi – Product Designer"],
    ["2160", "Aditya Rao – Account Executive"],
    ["2161", "Ishita Gupta – Sales Development Rep"],
    ["2170", "Nikhil Verma – HR Executive"],
  ].map(([code, label]) => ({ id: code, group: "Other employees", label: `${label} (${code})`, workspace: "alphabet-inc", login: code, password: DEMO_PASSWORD })),
];

export function LoginView() {
  const sp = useSearchParams();
  const router = useRouter();
  const hostWorkspace = useSyncExternalStore(noopSubscribe, workspaceFromHost, () => "");
  const remembered = useSyncExternalStore(noopSubscribe, rememberedWorkspace, () => "");
  const [typed, setWorkspace] = useState<string | null>(null);
  const [demo, setDemo] = useState("");
  // A chosen demo account overrides the workspace detected from the address (needed for "admin").
  const fromHost = !!hostWorkspace && !demo;
  const workspace = fromHost ? hostWorkspace : typed ?? remembered;
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pickDemo = (id: string) => {
    setDemo(id);
    setError(null);
    const acc = DEMO_ACCOUNTS.find((a) => a.id === id);
    if (!acc) return;
    setWorkspace(acc.workspace);
    setLogin(acc.login);
    setPassword(acc.password);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const ws = workspace.trim().toLowerCase();
      await api("/auth/login", { method: "POST", json: { workspace: ws, login, password } });
      clearApiCache(); // never show a previous user's cached data
      try {
        localStorage.setItem("easyhr.workspace", ws);
      } catch {}
      const next = sp.get("next");
      router.replace(ws === "admin" ? "/master" : next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
    <CreditBanner />
    <div className="grid flex-1 lg:grid-cols-[1fr_minmax(480px,560px)]">
      <section className="relative hidden overflow-hidden bg-sidebar p-12 text-white short:px-12 short:py-8 lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -right-40 -top-40 size-[520px] rounded-full bg-white/[0.04]" />
        <div className="pointer-events-none absolute -bottom-48 -left-24 size-[460px] rounded-full bg-[#5EEAD4]/[0.06]" />
        <Logo light />
        {/* The illustration gets whatever height the rest of the panel leaves (reserved below), up to
            300px. On short windows the feature list collapses to one row to make room; below ~680px
            there is no room left at a readable size, so it hides. */}
        <figure className="relative my-8 flex flex-1 flex-col items-center justify-center gap-3 short:my-4 [@media(max-height:679px)]:hidden">
          <GlobalOfficesArt className="h-[min(300px,calc(100vh-700px))] w-full max-w-[520px] short:h-[min(300px,calc(100vh-490px))]" />
          <figcaption className="text-center text-helper text-[#8fa3bf]">
            Built for multinational teams: separate workspaces per company, across offices, countries and time zones.
          </figcaption>
        </figure>
        <div className="relative mt-auto max-w-lg">
          <h1 className="text-[34px] font-semibold leading-tight tracking-tight short:text-[28px]">People operations, without the paperwork.</h1>
          <p className="mt-3 text-[15px] leading-6 text-[#c7d3e3] short:mt-2">Attendance, leave, holidays and your org chart in one calm, secure workspace.</p>
          <ul className="mt-10 space-y-5 short:mt-5 short:flex short:gap-3 short:space-y-0">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <li key={f.title} className="flex gap-4 short:flex-1 short:items-center short:gap-2.5 short:rounded-control short:bg-white/[0.06] short:p-2.5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-control bg-white/10 text-[#5EEAD4] short:size-8">
                    <Icon size={20} className="short:size-4" />
                  </span>
                  <span>
                    <span className="block text-[15px] font-semibold short:text-[13px] short:leading-4">{f.title}</span>
                    <span className="block text-body text-[#c7d3e3] short:hidden">{f.text}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
        <p className="relative mt-12 flex items-center gap-2 text-helper text-[#8fa3bf] short:mt-6">
          <ShieldCheck size={14} /> Each company&rsquo;s data is isolated and every change is audit-logged.
        </p>
      </section>

      <section className="relative flex items-center justify-center bg-surface px-5 py-10 sm:px-10">
        <ThemeToggle className="absolute right-3 top-3" />
        <div className="w-full max-w-[400px]">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h2 className="text-page text-ink">Sign in</h2>
          <p className="mt-1 text-body text-ink-2">Welcome back. Use your work email or employee code.</p>

          {SHOW_DEMO && (
            <div className="mt-6 rounded-card border border-info-line bg-info-soft/60 p-4">
              <Field label="Try a demo account" htmlFor="demo" hint="Fills in the workspace, login and password below.">
                <Select id="demo" value={demo} onChange={(e) => pickDemo(e.target.value)}>
                  <option value="">Choose a demo user…</option>
                  {["Key roles", "Other employees"].map((g) => (
                    <optgroup key={g} label={g}>
                      {DEMO_ACCOUNTS.filter((a) => a.group === g).map((a) => (
                        <option key={a.id} value={a.id}>{a.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
              </Field>
            </div>
          )}

          <form onSubmit={submit} className="mt-6 space-y-5" noValidate>
            {error && <Alert tone="danger" title={error} />}
            <Field label="Company workspace" htmlFor="ws" required hint={fromHost ? "Detected from your company address." : "Your company's EasyHR subdomain, e.g. alphabet-inc"}>
              <Input id="ws" icon={Building2} value={workspace} onChange={(e) => setWorkspace(e.target.value)} placeholder="alphabet-inc" autoComplete="organization" required disabled={fromHost} />
            </Field>
            <Field label="Email or employee code" htmlFor="login" required>
              <Input id="login" icon={UserRound} value={login} onChange={(e) => setLogin(e.target.value)} placeholder="you@company.com or 2140" autoComplete="username" required />
            </Field>
            <Field label="Password" htmlFor="pw" required>
              <div className="relative">
                <Input id="pw" icon={KeyRound} type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required className="pr-11" />
                <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-[6px] text-ink-3 hover:text-ink">
                  {show ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </Field>
            <Button type="submit" icon={LogIn} loading={busy} className="h-11 w-full" disabled={!workspace || !login || !password}>
              Sign in
            </Button>
          </form>
        </div>
      </section>
    </div>
    </div>
  );
}

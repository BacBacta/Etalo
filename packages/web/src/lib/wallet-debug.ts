/**
 * On-screen wallet debug log — singleton in-memory buffer with
 * subscribe API + localStorage persistence (across reloads).
 *
 * Why a custom buffer instead of just console.log : the user can't
 * always plug Android into Chrome chrome://inspect to read DevTools.
 * MiniPay's WebView IS readable that way, but only when USB debugging
 * is enabled and the laptop is reachable. For field debugging the
 * `WalletDebugOverlay` component (mounted in Providers) reads from
 * this buffer and renders the lines on top of the page, so the user
 * can screenshot or read directly on their device.
 *
 * Enable surfacing : append `?debug=wallet` to the URL.
 *
 * Buffer caps at MAX_LINES (200) to avoid memory growth on long
 * sessions. localStorage mirror lets the lines survive a full reload
 * (handshake retried after refresh, watchdog re-armed, etc.).
 */
const MAX_LINES = 200;
const STORAGE_KEY = "etalo:wallet-debug";

interface LogLine {
  ts: number;
  text: string;
}

let buffer: LogLine[] = [];
let subscribers: Array<() => void> = [];
let hydrated = false;

function hydrate(): void {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LogLine[];
      if (Array.isArray(parsed)) buffer = parsed.slice(-MAX_LINES);
    }
  } catch {
    // ignore — incognito mode / SecurityError / parse error
  }
}

function persist(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(buffer));
  } catch {
    // ignore quota / security errors
  }
}

function notify(): void {
  for (const fn of subscribers) fn();
}

function serialize(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Push a log line. Accepts any number of arguments — serialised and
 * joined with spaces. Safe to call from server-render path (no-op).
 */
export function walletLog(...args: unknown[]): void {
  if (typeof window === "undefined") return;
  hydrate();
  const text = args.map(serialize).join(" ");
  buffer.push({ ts: Date.now(), text });
  if (buffer.length > MAX_LINES) buffer = buffer.slice(-MAX_LINES);
  persist();
  notify();
}

export function getWalletDebugLines(): LogLine[] {
  hydrate();
  return buffer;
}

export function subscribeWalletDebug(fn: () => void): () => void {
  subscribers = [...subscribers, fn];
  return () => {
    subscribers = subscribers.filter((s) => s !== fn);
  };
}

export function clearWalletDebug(): void {
  buffer = [];
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
  notify();
}

/**
 * URL-driven enablement. Use this to gate the overlay rendering.
 * Also stores the flag in sessionStorage so a SPA route change keeps
 * the overlay visible without re-appending the query param.
 */
export function isWalletDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.sessionStorage.getItem("etalo:wallet-debug-on") === "1") {
      return true;
    }
    const fromUrl =
      new URLSearchParams(window.location.search).get("debug") === "wallet";
    if (fromUrl) {
      window.sessionStorage.setItem("etalo:wallet-debug-on", "1");
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

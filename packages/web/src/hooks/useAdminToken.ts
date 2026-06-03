/**
 * useAdminToken — the admin bearer is pasted once by Mike into the
 * /admin/disputes page and stored in sessionStorage (cleared on tab
 * close). It is sent as the X-Admin-Token header on every admin call.
 *
 * NOT a NEXT_PUBLIC env var — that would bake the secret into the
 * client bundle for every visitor. sessionStorage is per-tab and
 * per-origin, which is the right scope for an occasional admin task.
 */
"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "etalo.admin.token";

export function useAdminToken(): {
  token: string;
  setToken: (next: string) => void;
  clear: () => void;
  hydrated: boolean;
} {
  const [token, setTokenState] = useState<string>("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setTokenState(window.sessionStorage.getItem(STORAGE_KEY) ?? "");
    setHydrated(true);
  }, []);

  const setToken = (next: string) => {
    setTokenState(next);
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(STORAGE_KEY, next);
    }
  };

  const clear = () => {
    setTokenState("");
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
  };

  return { token, setToken, clear, hydrated };
}

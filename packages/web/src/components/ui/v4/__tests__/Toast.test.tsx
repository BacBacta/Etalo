/**
 * Vitest specs for ToastV4 (J9 Block 3 Chunk 3h).
 *
 * Coverage: ToasterV4 mount + className + position prop, toastV4
 * namespace exports + identity aliases, integration toast() rendering
 * with V4 styles applied through sonner classNames.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { toast as sonnerToast } from "sonner";

import { ToasterV4, toastV4 } from "@/components/ui/v4/Toast";

describe("ToasterV4", () => {
  it("mounts the sonner notifications region (section with aria-label)", async () => {
    render(<ToasterV4 />);
    // Sonner renders an empty <section aria-label="Notifications alt+T">
    // until the first toast is fired; the inner <ol class="toaster group">
    // mounts on demand. We assert on the always-present section here.
    await waitFor(() => {
      expect(screen.getByLabelText(/notifications/i)).toBeInTheDocument();
    });
  });

  it("forwards the position prop to Sonner", async () => {
    render(<ToasterV4 position="top-right" />);
    // The data-y-position / data-x-position attributes live on the inner
    // <ol>, which only mounts once a toast is fired — so we trigger one.
    toastV4.success("anchor toast");
    await waitFor(
      () => {
        const region = document.querySelector('[data-y-position="top"]');
        expect(region).toBeInTheDocument();
        expect(region).toHaveAttribute("data-x-position", "right");
      },
      { timeout: 2000 },
    );
    sonnerToast.dismiss();
  });
});

describe("toastV4 namespace", () => {
  it("exports all required helpers (success / error / warning / info / loading / promise / dismiss / default)", () => {
    const helpers: Array<keyof typeof toastV4> = [
      "success",
      "error",
      "warning",
      "info",
      "loading",
      "promise",
      "dismiss",
      "default",
    ];
    for (const key of helpers) {
      expect(toastV4[key]).toBeDefined();
      expect(typeof toastV4[key]).toBe("function");
    }
  });

  it("helpers are identity-aliases of sonner.toast.X", () => {
    expect(toastV4.success).toBe(sonnerToast.success);
    expect(toastV4.error).toBe(sonnerToast.error);
    expect(toastV4.warning).toBe(sonnerToast.warning);
    expect(toastV4.info).toBe(sonnerToast.info);
    expect(toastV4.loading).toBe(sonnerToast.loading);
    expect(toastV4.dismiss).toBe(sonnerToast.dismiss);
    expect(toastV4.default).toBe(sonnerToast);
  });
});

describe("ToasterV4 integration with toastV4", () => {
  it("renders a toast with the configured title when toastV4.success is called", async () => {
    render(<ToasterV4 position="bottom-center" />);
    toastV4.success("Order confirmed");
    await waitFor(
      () => {
        expect(screen.getByText("Order confirmed")).toBeInTheDocument();
      },
      { timeout: 2000 },
    );
    sonnerToast.dismiss();
  });

  it("applies V4 toast classes on the rendered toast (rounded-2xl + bg-celo-light)", async () => {
    render(<ToasterV4 position="bottom-center" />);
    toastV4.success("Styled toast");
    await waitFor(
      () => {
        expect(screen.getByText("Styled toast")).toBeInTheDocument();
      },
      { timeout: 2000 },
    );
    // The toast root has the classNames merged from toastOptions.
    const toastEl = document.querySelector('[data-sonner-toast]');
    expect(toastEl).toBeInTheDocument();
    expect(toastEl).toHaveClass("bg-celo-light");
    expect(toastEl).toHaveClass("rounded-2xl");
    sonnerToast.dismiss();
  });

  // J10-V5 Block 4e — dark variants asserted via class string presence
  // (JSDom doesn't activate the `.dark` ancestor selector).
  it("toast root applies dark bg + text + border classes", async () => {
    render(<ToasterV4 position="bottom-center" />);
    toastV4.success("Dark toast");
    await waitFor(
      () => {
        expect(screen.getByText("Dark toast")).toBeInTheDocument();
      },
      { timeout: 2000 },
    );
    const toastEl = document.querySelector('[data-sonner-toast]');
    expect(toastEl).toHaveClass("dark:bg-celo-dark-elevated");
    expect(toastEl).toHaveClass("dark:text-celo-light");
    expect(toastEl).toHaveClass("dark:border-celo-light/[8%]");
    sonnerToast.dismiss();
  });

  it("success icon applies dark forest-bright class", async () => {
    render(<ToasterV4 position="bottom-center" />);
    toastV4.success("Success!");
    await waitFor(
      () => {
        expect(screen.getByText("Success!")).toBeInTheDocument();
      },
      { timeout: 2000 },
    );
    const toastEl = document.querySelector('[data-sonner-toast]');
    const icon = toastEl?.querySelector("svg");
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveClass("dark:text-celo-forest-bright");
    sonnerToast.dismiss();
  });
});

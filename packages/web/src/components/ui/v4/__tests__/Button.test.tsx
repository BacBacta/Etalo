/**
 * Vitest specs for ButtonV4 (J9 Block 3 Chunk 3a).
 *
 * Coverage: default render, 4 variants × 3 sizes class application,
 * disabled state, loading spinner + width preservation, onClick
 * forwarding, asChild composition (Slot), ref forwarding.
 */
import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { useReducedMotion } from "motion/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ButtonV4 } from "@/components/ui/v4/Button";

// J10-V5 Phase 5 polish residual Item 4 — useReducedMotion mocked at
// the module boundary so we can flip its return value per-spec without
// touching jsdom's matchMedia (which the hook reads internally and
// which jsdom doesn't ship by default). Default mock returns false so
// the existing specs continue exercising the standard motion path.
vi.mock("motion/react", async () => {
  const actual =
    await vi.importActual<typeof import("motion/react")>("motion/react");
  return {
    ...actual,
    useReducedMotion: vi.fn(),
  };
});

const useReducedMotionMock = vi.mocked(useReducedMotion);

beforeEach(() => {
  useReducedMotionMock.mockReturnValue(false);
});

afterEach(() => {
  useReducedMotionMock.mockReset();
});

describe("ButtonV4", () => {
  it("renders with default props (primary / md / pill)", () => {
    render(<ButtonV4>Open my shop</ButtonV4>);
    const btn = screen.getByRole("button", { name: "Open my shop" });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveClass("bg-celo-forest");
    expect(btn).toHaveClass("h-11");
    expect(btn).toHaveClass("rounded-pill");
  });

  it("applies the correct color classes for each variant", () => {
    const variants = [
      { variant: "primary", expected: "bg-celo-forest" },
      { variant: "secondary", expected: "bg-celo-yellow" },
      { variant: "ghost", expected: "text-celo-forest" },
      { variant: "outline", expected: "border-celo-forest" },
    ] as const;
    for (const { variant, expected } of variants) {
      const { unmount } = render(
        <ButtonV4 variant={variant}>label</ButtonV4>,
      );
      expect(screen.getByRole("button")).toHaveClass(expected);
      unmount();
    }
  });

  it("applies the correct height for each size", () => {
    const sizes = [
      { size: "sm", height: "h-9" },
      { size: "md", height: "h-11" },
      { size: "lg", height: "h-12" },
    ] as const;
    for (const { size, height } of sizes) {
      const { unmount } = render(<ButtonV4 size={size}>label</ButtonV4>);
      expect(screen.getByRole("button")).toHaveClass(height);
      unmount();
    }
  });

  it("disables the button and blocks click when disabled=true", () => {
    const onClick = vi.fn();
    render(
      <ButtonV4 disabled onClick={onClick}>
        disabled
      </ButtonV4>,
    );
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("shows a spinner and hides children width-preserved when loading=true", () => {
    const { container } = render(<ButtonV4 loading>Submit</ButtonV4>);
    const btn = screen.getByRole("button");
    // disabled + aria-busy
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
    expect(btn).toHaveAttribute("data-loading", "true");
    // spinner present
    expect(container.querySelector("svg")).toBeInTheDocument();
    // children wrapped in opacity-0 span (width preserved)
    const hidden = container.querySelector("span.opacity-0");
    expect(hidden).toBeInTheDocument();
    expect(hidden).toHaveTextContent("Submit");
  });

  it("forwards onClick handler", () => {
    const onClick = vi.fn();
    render(<ButtonV4 onClick={onClick}>click</ButtonV4>);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders as the child element when asChild=true (Slot composition)", () => {
    render(
      <ButtonV4 asChild>
        <a href="/shop">Open shop</a>
      </ButtonV4>,
    );
    const link = screen.getByRole("link", { name: "Open shop" });
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", "/shop");
    // Slot should propagate the ButtonV4 classes onto the <a>
    expect(link).toHaveClass("bg-celo-forest");
  });

  it("forwards ref to the underlying button element", () => {
    const ref = createRef<HTMLButtonElement>();
    render(<ButtonV4 ref={ref}>ref</ButtonV4>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  // J10-V5 Block 4b — dark mode variants. JSDom doesn't activate the
  // `.dark` ancestor selector, so these specs assert that the `dark:`
  // utility classes are present on the rendered className string.
  it("applies dark variant classes for primary (celo-green WCAG-strict)", () => {
    render(<ButtonV4 variant="primary">primary</ButtonV4>);
    const btn = screen.getByRole("button");
    expect(btn).toHaveClass("dark:bg-celo-green");
    expect(btn).toHaveClass("dark:text-celo-dark");
    expect(btn).toHaveClass("dark:hover:bg-celo-green-hover");
  });

  it("applies dark variant classes for ghost", () => {
    render(<ButtonV4 variant="ghost">ghost</ButtonV4>);
    const btn = screen.getByRole("button");
    expect(btn).toHaveClass("dark:text-celo-forest-bright");
    expect(btn).toHaveClass("dark:hover:bg-celo-forest-bright-soft");
  });

  it("applies dark variant classes for outline", () => {
    render(<ButtonV4 variant="outline">outline</ButtonV4>);
    const btn = screen.getByRole("button");
    expect(btn).toHaveClass("dark:border-celo-forest-bright");
    expect(btn).toHaveClass("dark:text-celo-forest-bright");
    expect(btn).toHaveClass("dark:hover:bg-celo-forest-bright-soft");
  });

  it("applies dark focus-visible ring + offset", () => {
    render(<ButtonV4>focus</ButtonV4>);
    const btn = screen.getByRole("button");
    expect(btn).toHaveClass("dark:focus-visible:ring-celo-forest-bright");
    expect(btn).toHaveClass("dark:focus-visible:ring-offset-celo-dark-bg");
  });

  // J10-V5 Phase 2 Block 2 — motion control flow regression-guards.
  // JSDom doesn't execute motion animations, so we test the runtime
  // decision (motion enabled / bypassed) via the `data-motion-active`
  // marker rather than asserting whileTap / whileHover values directly.
  it("sets data-motion-active=true in default normal usage (motion enabled)", () => {
    render(<ButtonV4>tap me</ButtonV4>);
    expect(screen.getByRole("button")).toHaveAttribute(
      "data-motion-active",
      "true",
    );
  });

  it("omits data-motion-active when asChild=true (motion bypassed via Slot)", () => {
    render(
      <ButtonV4 asChild>
        <a href="/shop">Open shop</a>
      </ButtonV4>,
    );
    const link = screen.getByRole("link", { name: "Open shop" });
    expect(link).not.toHaveAttribute("data-motion-active");
  });

  // J10-V5 Phase 5 polish residual Item 4 — prefers-reduced-motion
  // gating. The data-reduced-motion attribute encodes the runtime
  // decision so the motion suppression branch can be regression-
  // guarded under jsdom. WCAG 2.1 SC 2.3.3.
  describe("prefers-reduced-motion (Phase 5 polish residual Item 4)", () => {
    it("omits data-reduced-motion when the user has standard motion", () => {
      useReducedMotionMock.mockReturnValue(false);
      render(<ButtonV4>tap me</ButtonV4>);
      expect(screen.getByRole("button")).not.toHaveAttribute(
        "data-reduced-motion",
      );
    });

    it("sets data-reduced-motion='true' when the user prefers reduced motion", () => {
      useReducedMotionMock.mockReturnValue(true);
      render(<ButtonV4>tap me</ButtonV4>);
      expect(screen.getByRole("button")).toHaveAttribute(
        "data-reduced-motion",
        "true",
      );
    });
  });
});

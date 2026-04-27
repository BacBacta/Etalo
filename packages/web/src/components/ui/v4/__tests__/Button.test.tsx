/**
 * Vitest specs for ButtonV4 (J9 Block 3 Chunk 3a).
 *
 * Coverage: default render, 4 variants × 3 sizes class application,
 * disabled state, loading spinner + width preservation, onClick
 * forwarding, asChild composition (Slot), ref forwarding.
 */
import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ButtonV4 } from "@/components/ui/v4/Button";

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
});

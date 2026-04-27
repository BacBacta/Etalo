/**
 * Vitest specs for DialogV4 + 9 sub-parts (J9 Block 3 Chunk 3d).
 *
 * Coverage: trigger-driven open, content + overlay + title +
 * description classes, dark header variant, close button, Escape key.
 * Uses `defaultOpen` for opened-state assertions to avoid timing
 * complexity around Radix portal mount.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  DialogV4,
  DialogV4Content,
  DialogV4Description,
  DialogV4Footer,
  DialogV4Header,
  DialogV4Title,
  DialogV4Trigger,
} from "@/components/ui/v4/Dialog";

function Harness({ defaultOpen = false }: { defaultOpen?: boolean }) {
  return (
    <DialogV4 defaultOpen={defaultOpen}>
      <DialogV4Trigger>Open</DialogV4Trigger>
      <DialogV4Content data-testid="dialog-content">
        <DialogV4Header>
          <DialogV4Title>Confirm purchase</DialogV4Title>
          <DialogV4Description>You will be charged 1.5 USDT</DialogV4Description>
        </DialogV4Header>
        <p>Body content</p>
        <DialogV4Footer>
          <button>Cancel</button>
          <button>Confirm</button>
        </DialogV4Footer>
      </DialogV4Content>
    </DialogV4>
  );
}

describe("DialogV4", () => {
  it("renders trigger but not content when closed", () => {
    render(<Harness />);
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.queryByText("Confirm purchase")).not.toBeInTheDocument();
  });

  it("opens dialog content when trigger is clicked", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("Open"));
    expect(screen.getByText("Confirm purchase")).toBeInTheDocument();
    expect(screen.getByText("Body content")).toBeInTheDocument();
  });

  it("Content has V4 classes (max-w, rounded-3xl, bg-celo-light, p-6, shadow-celo-lg)", () => {
    render(<Harness defaultOpen />);
    const content = screen.getByTestId("dialog-content");
    expect(content).toHaveClass("max-w-[480px]");
    expect(content).toHaveClass("rounded-3xl");
    expect(content).toHaveClass("bg-celo-light");
    expect(content).toHaveClass("p-6");
    expect(content).toHaveClass("shadow-celo-lg");
  });

  it("Overlay has backdrop classes (bg-celo-dark/40, backdrop-blur-md)", () => {
    render(<Harness defaultOpen />);
    // Radix overlay is rendered as sibling to the content; query by data-state attribute
    const overlay = document.querySelector('[data-state="open"].fixed.inset-0');
    expect(overlay).toBeInTheDocument();
    expect(overlay).toHaveClass("bg-celo-dark/40");
    expect(overlay).toHaveClass("backdrop-blur-md");
  });

  it("Title and Description have correct V4 classes", () => {
    render(<Harness defaultOpen />);
    const title = screen.getByText("Confirm purchase");
    expect(title).toHaveClass("font-display");
    expect(title).toHaveClass("text-display-4");

    const desc = screen.getByText("You will be charged 1.5 USDT");
    expect(desc).toHaveClass("text-body-sm");
    expect(desc).toHaveClass("opacity-60");
  });

  it("dark Header variant applies dark styling + data-dark attribute", () => {
    render(
      <DialogV4 defaultOpen>
        <DialogV4Trigger>x</DialogV4Trigger>
        <DialogV4Content>
          <DialogV4Header dark data-testid="header-dark">
            <DialogV4Title>Title</DialogV4Title>
            <DialogV4Description>Desc</DialogV4Description>
          </DialogV4Header>
        </DialogV4Content>
      </DialogV4>,
    );
    const header = screen.getByTestId("header-dark");
    expect(header).toHaveAttribute("data-dark", "true");
    expect(header).toHaveClass("bg-celo-dark");
    expect(header).toHaveClass("text-celo-light");
    expect(header).toHaveClass("rounded-t-3xl");
  });

  it("renders Close button with X icon + sr-only label and closes on click", () => {
    render(<Harness defaultOpen />);
    const closeBtn = screen.getByRole("button", { name: /close/i });
    expect(closeBtn).toBeInTheDocument();
    // sr-only label
    expect(closeBtn).toHaveTextContent(/close/i);
    // X icon (lucide-react renders an svg)
    expect(closeBtn.querySelector("svg")).toBeInTheDocument();
    // closes on click
    fireEvent.click(closeBtn);
    expect(screen.queryByText("Confirm purchase")).not.toBeInTheDocument();
  });

  it("closes on Escape keydown", () => {
    render(<Harness defaultOpen />);
    expect(screen.getByText("Confirm purchase")).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: "Escape", code: "Escape" });
    expect(screen.queryByText("Confirm purchase")).not.toBeInTheDocument();
  });
});

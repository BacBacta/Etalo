/**
 * Vitest specs for TabsV4 + 3 sub-parts (J9 Block 3 Chunk 3f).
 *
 * Coverage: default value + first active + content visibility, list
 * classes, active state styling, inactive state styling, click switches
 * tab, keyboard arrow navigation, aria roles. Click + keyboard tests
 * use `userEvent` (Radix Tabs needs the full pointer/keyboard sequence;
 * `fireEvent.click` alone does not propagate the state change).
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import {
  TabsV4Content,
  TabsV4List,
  TabsV4Root,
  TabsV4Trigger,
} from "@/components/ui/v4/Tabs";

function Harness({ defaultValue = "orders" }: { defaultValue?: string }) {
  return (
    <TabsV4Root defaultValue={defaultValue}>
      <TabsV4List data-testid="tabs-list">
        <TabsV4Trigger value="orders" data-testid="trigger-orders">
          Orders
        </TabsV4Trigger>
        <TabsV4Trigger value="products" data-testid="trigger-products">
          Products
        </TabsV4Trigger>
        <TabsV4Trigger value="marketing" data-testid="trigger-marketing">
          Marketing
        </TabsV4Trigger>
      </TabsV4List>
      <TabsV4Content value="orders">Orders list panel</TabsV4Content>
      <TabsV4Content value="products">Products grid panel</TabsV4Content>
      <TabsV4Content value="marketing">Marketing tools panel</TabsV4Content>
    </TabsV4Root>
  );
}

describe("TabsV4", () => {
  it("renders with first tab active per defaultValue and only active content visible", () => {
    render(<Harness />);
    expect(screen.getByTestId("trigger-orders")).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(screen.getByText("Orders list panel")).toBeInTheDocument();
    expect(screen.queryByText("Products grid panel")).not.toBeInTheDocument();
    expect(screen.queryByText("Marketing tools panel")).not.toBeInTheDocument();
  });

  it("TabsList has flex + gap + border-b celo-dark/[8%] + role=tablist", () => {
    render(<Harness />);
    const list = screen.getByTestId("tabs-list");
    expect(list).toHaveClass("flex");
    expect(list).toHaveClass("gap-1");
    expect(list).toHaveClass("border-b");
    expect(list).toHaveClass("border-celo-dark/[8%]");
    expect(list).toHaveAttribute("role", "tablist");
  });

  it("active Trigger has border-celo-forest + text-celo-forest classes + data-state=active", () => {
    render(<Harness />);
    const active = screen.getByTestId("trigger-orders");
    expect(active).toHaveAttribute("data-state", "active");
    expect(active).toHaveClass("data-[state=active]:border-celo-forest");
    expect(active).toHaveClass("data-[state=active]:text-celo-forest");
  });

  it("inactive Trigger has text-celo-dark/60 + border-transparent + data-state=inactive", () => {
    render(<Harness />);
    const inactive = screen.getByTestId("trigger-products");
    expect(inactive).toHaveAttribute("data-state", "inactive");
    expect(inactive).toHaveClass("text-celo-dark/60");
    expect(inactive).toHaveClass("border-transparent");
  });

  it("click on inactive Trigger switches active state and swaps content", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const products = screen.getByTestId("trigger-products");
    await user.click(products);
    expect(products).toHaveAttribute("data-state", "active");
    expect(screen.getByTestId("trigger-orders")).toHaveAttribute(
      "data-state",
      "inactive",
    );
    expect(screen.getByText("Products grid panel")).toBeInTheDocument();
    expect(screen.queryByText("Orders list panel")).not.toBeInTheDocument();
  });

  it("ArrowRight key moves focus to next Trigger (Radix keyboard nav)", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const orders = screen.getByTestId("trigger-orders");
    orders.focus();
    expect(document.activeElement).toBe(orders);
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(
      screen.getByTestId("trigger-products"),
    );
  });

  it("aria roles : tablist on List, tab on Triggers, tabpanel on Content", () => {
    render(<Harness />);
    expect(screen.getByTestId("tabs-list")).toHaveAttribute("role", "tablist");
    expect(screen.getByTestId("trigger-orders")).toHaveAttribute(
      "role",
      "tab",
    );
    const panel = screen.getByText("Orders list panel");
    expect(panel).toHaveAttribute("role", "tabpanel");
  });
});


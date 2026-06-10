import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { NotificationItem } from "@/lib/notifications/api";

const useNotificationsMock = vi.fn();
vi.mock("@/hooks/useNotifications", () => ({
  useNotifications: (...args: unknown[]) => useNotificationsMock(...args),
  NOTIFICATIONS_QUERY_KEY: "notifications",
}));

import { NotificationBell } from "@/components/NotificationBell";

const ADDR = "0xAbC0000000000000000000000000000000000001";

function orderFunded(id: string, createdAt: string): NotificationItem {
  return {
    id,
    channel: "whatsapp",
    notification_type: "order_funded",
    payload: { onchain_order_id: 4, amount_usdt: 5_000_000 },
    sent: false,
    created_at: createdAt,
  };
}

function mockItems(list: NotificationItem[]) {
  useNotificationsMock.mockReturnValue({
    data: { items: list, total: list.length },
  });
}

describe("NotificationBell", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useNotificationsMock.mockReset();
  });

  it("shows unread for existing notifications until the bell is first opened", () => {
    mockItems([orderFunded("1", "2020-01-01T00:00:00Z")]);
    render(<NotificationBell address={ADDR} />);
    // No stored last-seen → inbox shows the unread count (standard bell).
    expect(screen.getByRole("button", { name: /1 unread/i })).toBeTruthy();
  });

  it("shows the unread count when a notification is newer than last-seen", () => {
    window.localStorage.setItem(
      `etalo:notif:lastSeen:${ADDR.toLowerCase()}`,
      String(Date.now() - 60_000),
    );
    mockItems([orderFunded("1", new Date(Date.now() - 5_000).toISOString())]);
    render(<NotificationBell address={ADDR} />);
    expect(screen.getByRole("button", { name: /1 unread/i })).toBeTruthy();
  });

  it("opens the panel and clears the badge on click", () => {
    window.localStorage.setItem(
      `etalo:notif:lastSeen:${ADDR.toLowerCase()}`,
      String(Date.now() - 60_000),
    );
    mockItems([orderFunded("1", new Date(Date.now() - 5_000).toISOString())]);
    render(<NotificationBell address={ADDR} />);

    fireEvent.click(screen.getByRole("button"));
    // Panel rendered the order notification…
    expect(screen.getByText("New order")).toBeTruthy();
    expect(screen.getByText(/#4 · 5\.00 USDT/)).toBeTruthy();
    // …and the unread badge is cleared (button label back to plain).
    expect(screen.queryByRole("button", { name: /unread/i })).toBeNull();
  });
});

/**
 * Vitest setup file (J7 Block 7a) — runs once before each test file.
 * Extends `expect` with @testing-library/jest-dom matchers (toBeInTheDocument,
 * toBeDisabled, etc.) and ensures DOM cleanup between specs.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { MotionGlobalConfig } from "motion/react";
import { afterEach, vi } from "vitest";

// J10-V5 Phase 2 Block 6 — opt motion out of frame-driven animations in
// tests so AnimatePresence exit completes synchronously. Without this,
// fireEvent-driven close (Esc, X-button) leaves the child mounted while
// the exit animation ticks against jsdom's RAF, breaking synchronous
// `not.toBeInTheDocument()` assertions in DialogV4 / SheetV4 specs.
MotionGlobalConfig.skipAnimations = true;

// J10-V5 Phase 2 Block 7 — globally stub canvas-confetti for the suite.
// jsdom returns a canvas without a working 2D context, so the lib's
// rAF-driven update loop crashes on `clearRect` of a null ctx. The stub
// also keeps any incidental success-path test (MarketingTab,
// BuyCreditsDialog) from triggering an actual particle render. Specs
// that need to assert on confetti calls re-mock at the file level.
vi.mock("canvas-confetti", () => ({
  default: vi.fn(),
}));

afterEach(() => {
  cleanup();
});

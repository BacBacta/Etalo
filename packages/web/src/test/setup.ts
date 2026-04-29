/**
 * Vitest setup file (J7 Block 7a) — runs once before each test file.
 * Extends `expect` with @testing-library/jest-dom matchers (toBeInTheDocument,
 * toBeDisabled, etc.) and ensures DOM cleanup between specs.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { MotionGlobalConfig } from "motion/react";
import { afterEach } from "vitest";

// J10-V5 Phase 2 Block 6 — opt motion out of frame-driven animations in
// tests so AnimatePresence exit completes synchronously. Without this,
// fireEvent-driven close (Esc, X-button) leaves the child mounted while
// the exit animation ticks against jsdom's RAF, breaking synchronous
// `not.toBeInTheDocument()` assertions in DialogV4 / SheetV4 specs.
MotionGlobalConfig.skipAnimations = true;

afterEach(() => {
  cleanup();
});

/**
 * Vitest setup file (J7 Block 7a) — runs once before each test file.
 * Extends `expect` with @testing-library/jest-dom matchers (toBeInTheDocument,
 * toBeDisabled, etc.) and ensures DOM cleanup between specs.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});

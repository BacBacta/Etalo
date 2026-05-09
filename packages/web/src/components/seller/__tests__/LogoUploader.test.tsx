/**
 * Vitest specs for LogoUploader.
 *
 * Covers the contract :
 * - Empty state renders the upload trigger with a placeholder icon
 *   (no preview image)
 * - Picking a file fires uploadImage + propagates the resulting hash
 *   via onChange
 * - Upload errors surface a visible message + DON'T fire onChange
 * - "Remove logo" button clears value via onChange(null) when a hash
 *   is currently set
 * - Saved hash renders as a circular preview with the gateway URL
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { LogoUploader } from "@/components/seller/LogoUploader";

const uploadImageMock = vi.fn();
vi.mock("@/lib/seller-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/seller-api")>(
    "@/lib/seller-api",
  );
  return {
    ...actual,
    uploadImage: (...args: unknown[]) => uploadImageMock(...args),
  };
});

const WALLET = "0xabc0000000000000000000000000000000000001";

beforeEach(() => {
  uploadImageMock.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

function makeFile() {
  return new File(["fakedata"], "logo.png", { type: "image/png" });
}

describe("LogoUploader", () => {
  it("renders the placeholder trigger when value is null", () => {
    render(
      <LogoUploader value={null} onChange={vi.fn()} walletAddress={WALLET} />,
    );
    const trigger = screen.getByTestId("logo-upload-trigger");
    expect(trigger).toHaveAttribute("aria-label", "Upload shop logo");
    // No preview img when there's nothing to preview.
    expect(screen.queryByTestId("logo-preview")).toBeNull();
    // No "Remove logo" button when there's nothing to remove.
    expect(screen.queryByTestId("logo-remove")).toBeNull();
  });

  it("renders the saved logo as a circular preview when value is a hash", () => {
    render(
      <LogoUploader
        value="QmSavedLogo"
        onChange={vi.fn()}
        walletAddress={WALLET}
      />,
    );
    const preview = screen.getByTestId("logo-preview") as HTMLImageElement;
    expect(preview.src).toContain("/ipfs/QmSavedLogo");
    expect(screen.getByTestId("logo-remove")).toBeInTheDocument();
    expect(
      screen.getByTestId("logo-upload-trigger"),
    ).toHaveAttribute("aria-label", "Change shop logo");
  });

  it("uploads the picked file and propagates the new hash via onChange", async () => {
    uploadImageMock.mockResolvedValue({ ipfs_hash: "QmNewLogoHash" });
    const onChange = vi.fn();
    render(
      <LogoUploader value={null} onChange={onChange} walletAddress={WALLET} />,
    );
    const input = screen.getByTestId(
      "logo-file-input",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile()] } });

    await waitFor(() =>
      expect(uploadImageMock).toHaveBeenCalledTimes(1),
    );
    expect(uploadImageMock).toHaveBeenCalledWith(
      WALLET,
      expect.any(File),
    );
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith("QmNewLogoHash"),
    );
  });

  it("surfaces the upload error message without firing onChange", async () => {
    uploadImageMock.mockRejectedValue(new Error("Image too large (max 5MB)"));
    const onChange = vi.fn();
    render(
      <LogoUploader value={null} onChange={onChange} walletAddress={WALLET} />,
    );
    fireEvent.change(
      screen.getByTestId("logo-file-input") as HTMLInputElement,
      { target: { files: [makeFile()] } },
    );
    const err = await screen.findByTestId("logo-error");
    expect(err.textContent).toContain("Image too large");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("Remove logo button fires onChange(null)", () => {
    const onChange = vi.fn();
    render(
      <LogoUploader
        value="QmSavedLogo"
        onChange={onChange}
        walletAddress={WALLET}
      />,
    );
    fireEvent.click(screen.getByTestId("logo-remove"));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("disables the trigger and the Remove button when `disabled` is true", () => {
    render(
      <LogoUploader
        value="QmSavedLogo"
        onChange={vi.fn()}
        walletAddress={WALLET}
        disabled
      />,
    );
    expect(screen.getByTestId("logo-upload-trigger")).toBeDisabled();
    expect(screen.getByTestId("logo-remove")).toBeDisabled();
  });
});

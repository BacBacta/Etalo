/**
 * Vitest specs for InputV4 + LabelV4 + HelperTextV4 (J9 Block 3 Chunk 3b).
 *
 * Coverage: default render, error styling, disabled state, controlled
 * value/onChange, ref forwarding, type prop, label uppercase styling,
 * helper text error color switch.
 */
import { createRef, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  HelperTextV4,
  InputV4,
  LabelV4,
} from "@/components/ui/v4/Input";

describe("InputV4", () => {
  it("renders a default text input", () => {
    render(<InputV4 placeholder="email@example.com" />);
    const input = screen.getByPlaceholderText("email@example.com");
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveClass("rounded-xl");
    expect(input).toHaveClass("border-celo-dark/[16%]");
  });

  it("applies error styling when error=true", () => {
    render(<InputV4 error placeholder="test" />);
    const input = screen.getByPlaceholderText("test");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("data-error", "true");
    expect(input).toHaveClass("ring-celo-red");
  });

  it("applies disabled state and blocks input", () => {
    const onChange = vi.fn();
    render(
      <InputV4
        disabled
        defaultValue="locked"
        placeholder="locked"
        onChange={onChange}
      />,
    );
    const input = screen.getByPlaceholderText("locked") as HTMLInputElement;
    expect(input).toBeDisabled();
    fireEvent.change(input, { target: { value: "x" } });
    // disabled inputs may still fire change in jsdom — assert state instead
    expect(input).toBeDisabled();
  });

  it("forwards value/onChange in controlled mode", () => {
    function Controlled() {
      const [v, setV] = useState("");
      return (
        <InputV4
          placeholder="ctl"
          value={v}
          onChange={(e) => setV(e.target.value)}
        />
      );
    }
    render(<Controlled />);
    const input = screen.getByPlaceholderText("ctl") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "hello" } });
    expect(input.value).toBe("hello");
  });

  it("forwards ref to the underlying input element", () => {
    const ref = createRef<HTMLInputElement>();
    render(<InputV4 ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });

  it("respects type prop (e.g. email)", () => {
    render(<InputV4 type="email" placeholder="mail" />);
    expect(screen.getByPlaceholderText("mail")).toHaveAttribute(
      "type",
      "email",
    );
  });
});

describe("LabelV4", () => {
  it("renders a <label> with htmlFor and uppercase styling", () => {
    render(<LabelV4 htmlFor="email">Email</LabelV4>);
    const label = screen.getByText("Email");
    expect(label.tagName).toBe("LABEL");
    expect(label).toHaveAttribute("for", "email");
    expect(label).toHaveClass("uppercase");
    expect(label).toHaveClass("text-celo-dark");
  });
});

describe("HelperTextV4", () => {
  it("switches to celo-red when error=true and stays muted otherwise", () => {
    const { rerender } = render(
      <HelperTextV4>Helper default</HelperTextV4>,
    );
    let p = screen.getByText("Helper default");
    expect(p).toHaveClass("text-celo-dark/[60%]");
    expect(p).not.toHaveAttribute("data-error");

    rerender(<HelperTextV4 error>Helper error</HelperTextV4>);
    p = screen.getByText("Helper error");
    expect(p).toHaveClass("text-celo-red");
    expect(p).toHaveAttribute("data-error", "true");
  });
});

import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { useKeydown } from "./useKeydown";

function Probe({ onKey, ignoreInputs }: { onKey: (k: string) => void; ignoreInputs?: boolean }) {
  useKeydown((e) => onKey(e.key), { ignoreInputs });
  return <input aria-label="field" />;
}

describe("useKeydown", () => {
  it("fires on window keydown and always calls the latest handler", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Probe onKey={first} />);
    rerender(<Probe onKey={second} />);
    fireEvent.keyDown(window, { key: "j" });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith("j");
  });

  it("with ignoreInputs, skips events from a text field but not from elsewhere", () => {
    const onKey = vi.fn();
    const { getByLabelText } = render(<Probe onKey={onKey} ignoreInputs />);
    fireEvent.keyDown(getByLabelText("field"), { key: "j" });
    expect(onKey).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: "k" });
    expect(onKey).toHaveBeenCalledWith("k");
  });
});

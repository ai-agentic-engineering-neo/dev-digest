import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "@testing-library/react";
import type { Crumb } from "@devdigest/ui";
import { CrumbProvider, useCrumb } from "./crumb";

function View({ label }: { label: string }) {
  useCrumb([{ label }]); // inline array literal: must not loop
  return null;
}

function Host({ show, label }: { show: boolean; label: string }) {
  const [crumb, setCrumb] = React.useState<Crumb[] | undefined>(undefined);
  return (
    <CrumbProvider onChange={setCrumb}>
      <div data-testid="crumb">{crumb?.map((c) => c.label).join("/") ?? "none"}</div>
      {show && <View label={label} />}
    </CrumbProvider>
  );
}

describe("useCrumb", () => {
  it("publishes the view's crumb, follows changes, and clears on unmount", () => {
    const { getByTestId, rerender } = render(<Host show label="A" />);
    expect(getByTestId("crumb").textContent).toBe("A");
    rerender(<Host show label="B" />);
    expect(getByTestId("crumb").textContent).toBe("B");
    rerender(<Host show={false} label="B" />);
    expect(getByTestId("crumb").textContent).toBe("none");
  });
});

import { describe, it, expect } from "vitest";
import { findAdvanceControl, isSubmitControl } from "./navigate";

function dom(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  return root;
}

describe("findAdvanceControl", () => {
  it("finds a Next/Continue button", () => {
    const root = dom(`<button type="button">Back</button><button type="button">Continue</button>`);
    expect(findAdvanceControl(root)?.textContent).toBe("Continue");
  });
  it("returns null when there is no advance control", () => {
    const root = dom(`<button>Cancel</button>`);
    expect(findAdvanceControl(root)).toBeNull();
  });
  it("ignores disabled controls", () => {
    const root = dom(`<button disabled>Next</button>`);
    expect(findAdvanceControl(root)).toBeNull();
  });
});

describe("isSubmitControl", () => {
  it("flags submit/apply/finish controls", () => {
    const root = dom(`<button>Submit application</button>`);
    expect(isSubmitControl(root.querySelector("button")!)).toBe(true);
  });
  it("does not flag a plain Next button", () => {
    const root = dom(`<button>Next</button>`);
    expect(isSubmitControl(root.querySelector("button")!)).toBe(false);
  });
});

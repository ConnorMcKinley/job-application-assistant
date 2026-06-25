import { describe, it, expect } from "vitest";
import { handleContentMessage } from "./contentHandler";
import type { FieldDescriptor } from "./types";

function setBody(html: string): void {
  document.body.innerHTML = html;
}
function fd(over: Partial<FieldDescriptor>): FieldDescriptor {
  return { id: "x", locator: "#x", label: "", kind: "text", required: false,
    rect: { x: 0, y: 0, w: 0, h: 0 }, readable: true, ...over };
}

describe("handleContentMessage", () => {
  it("EXTRACT returns descriptors", () => {
    setBody(`<input id="x" type="text">`);
    const res = handleContentMessage({ type: "EXTRACT" }, document);
    expect(res.type).toBe("FIELDS");
    if (res.type === "FIELDS") expect(res.fields).toHaveLength(1);
  });

  it("APPLY fills and reports a count", () => {
    setBody(`<input id="x" type="text">`);
    const res = handleContentMessage(
      { type: "APPLY", fills: [{ field: fd({ locator: "#x" }), value: "hi" }] }, document);
    expect(res).toEqual({ type: "APPLIED", count: 1 });
    expect((document.querySelector("#x") as HTMLInputElement).value).toBe("hi");
  });

  it("ADVANCE clicks a Next button (submit=false)", () => {
    setBody(`<button type="button">Continue</button>`);
    const res = handleContentMessage({ type: "ADVANCE" }, document);
    expect(res).toEqual({ type: "ADVANCED", submit: false });
  });

  it("ADVANCE reports submit=true on a submit control and does NOT click", () => {
    setBody(`<button type="button">Submit application</button>`);
    let clicked = false;
    document.querySelector("button")!.addEventListener("click", () => { clicked = true; });
    const res = handleContentMessage({ type: "ADVANCE" }, document);
    expect(res).toEqual({ type: "ADVANCED", submit: true });
    expect(clicked).toBe(false);
  });
});

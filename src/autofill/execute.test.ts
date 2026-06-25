import { describe, it, expect, vi } from "vitest";
import { applyFill, highlightField } from "./execute";
import type { FieldDescriptor } from "./types";

function dom(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}
function fd(over: Partial<FieldDescriptor>): FieldDescriptor {
  return { id: "x", locator: "#x", label: "", kind: "text", required: false,
    rect: { x: 0, y: 0, w: 0, h: 0 }, readable: true, ...over };
}

describe("applyFill", () => {
  it("sets a text input value and dispatches input+change", () => {
    const root = dom(`<input id="x" type="text">`);
    const onInput = vi.fn();
    root.querySelector("#x")!.addEventListener("input", onInput);
    const ok = applyFill(root, fd({ locator: "#x" }), "Connor");
    expect(ok).toBe(true);
    expect((root.querySelector("#x") as HTMLInputElement).value).toBe("Connor");
    expect(onInput).toHaveBeenCalled();
  });

  it("selects a matching option by value or text", () => {
    const root = dom(`<select id="s"><option value="li">LinkedIn</option><option value="ref">Referral</option></select>`);
    expect(applyFill(root, fd({ locator: "#s", kind: "select" }), "Referral")).toBe(true);
    expect((root.querySelector("#s") as HTMLSelectElement).value).toBe("ref");
  });

  it("clicks the matching radio option", () => {
    const root = dom(`<input type="radio" name="auth" value="yes"><input type="radio" name="auth" value="no">`);
    expect(applyFill(root, fd({ locator: `[name="auth"]`, kind: "radio" }), "no")).toBe(true);
    expect((root.querySelector(`[value="no"]`) as HTMLInputElement).checked).toBe(true);
  });

  it("never touches a file input", () => {
    const root = dom(`<input id="f" type="file">`);
    expect(applyFill(root, fd({ locator: "#f", kind: "file" }), "resume.pdf")).toBe(false);
  });
});

describe("highlightField", () => {
  it("applies an outline for the filled state", () => {
    const el = document.createElement("input");
    highlightField(el, "filled");
    expect(el.style.outline).toContain("solid");
  });
});

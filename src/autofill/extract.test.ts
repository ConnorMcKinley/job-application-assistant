import { describe, it, expect } from "vitest";
import { extractFields } from "./extract";

function dom(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

describe("extractFields", () => {
  it("extracts text inputs with label-for resolution", () => {
    const root = dom(`<label for="fn">Full name</label><input id="fn" name="full_name" type="text" required>`);
    const fields = extractFields(root);
    expect(fields).toHaveLength(1);
    expect(fields[0]!.label).toBe("Full name");
    expect(fields[0]!.kind).toBe("text");
    expect(fields[0]!.locator).toBe("#fn");
    expect(fields[0]!.required).toBe(true);
    expect(fields[0]!.readable).toBe(true);
  });

  it("falls back to placeholder and marks unresolved labels unreadable", () => {
    const root = dom(`<input name="email" type="email" placeholder="Email address"><input name="mystery" type="text">`);
    const fields = extractFields(root);
    const email = fields.find((f) => f.id.includes("email"))!;
    expect(email.label).toBe("Email address");
    expect(email.kind).toBe("email");
    const mystery = fields.find((f) => f.id.includes("mystery"))!;
    expect(mystery.readable).toBe(false);
  });

  it("collapses a radio group into one descriptor with options", () => {
    const root = dom(`
      <label><input type="radio" name="auth" value="yes">Yes</label>
      <label><input type="radio" name="auth" value="no">No</label>`);
    const fields = extractFields(root);
    const radios = fields.filter((f) => f.kind === "radio");
    expect(radios).toHaveLength(1);
    expect(radios[0]!.options).toEqual(["yes", "no"]);
    expect(radios[0]!.locator).toBe(`[name="auth"]`);
  });

  it("captures select options and skips hidden/disabled/button inputs", () => {
    const root = dom(`
      <select name="src"><option value="li">LinkedIn</option><option value="ref">Referral</option></select>
      <input type="hidden" name="csrf"><input type="submit" value="Go"><input name="off" disabled>`);
    const fields = extractFields(root);
    expect(fields).toHaveLength(1);
    expect(fields[0]!.kind).toBe("select");
    expect(fields[0]!.options).toEqual(["li", "ref"]);
  });
});

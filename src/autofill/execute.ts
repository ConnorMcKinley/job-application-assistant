import type { FieldDescriptor } from "./types";

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, "value");
  desc?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function isTruthy(value: string): boolean {
  return ["true", "yes", "on", "1"].includes(value.trim().toLowerCase());
}

export function applyFill(root: ParentNode, field: FieldDescriptor, value: string): boolean {
  if (field.kind === "file") return false;

  if (field.kind === "radio") {
    const options = Array.from(root.querySelectorAll<HTMLInputElement>(field.locator));
    const target = options.find(
      (o) => o.value === value || o.closest("label")?.textContent?.trim() === value,
    );
    if (!target) return false;
    target.click();
    return true;
  }

  const el = root.querySelector(field.locator);
  if (!el) return false;

  if (el instanceof HTMLSelectElement) {
    const match = Array.from(el.options).find(
      (o) => o.value === value || o.text.trim() === value,
    );
    if (!match) return false;
    el.value = match.value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  if (el instanceof HTMLInputElement && el.type === "checkbox") {
    const shouldCheck = isTruthy(value) || el.value === value || field.label === value;
    if (el.checked !== shouldCheck) el.click();
    return true;
  }

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    setNativeValue(el, value);
    return true;
  }

  return false;
}

export function highlightField(el: HTMLElement, state: "filled" | "needs"): void {
  el.style.outline = state === "filled" ? "2px solid #16a34a" : "2px solid #d97706";
  el.style.outlineOffset = "1px";
}

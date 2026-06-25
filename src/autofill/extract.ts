import type { FieldDescriptor, FieldKind, FieldRect } from "./types";

type Fillable = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

const SKIP_INPUT_TYPES = new Set(["hidden", "submit", "button", "reset", "image", "file"]);

function rectOf(el: Element): FieldRect {
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
}

function inputKind(el: Fillable): FieldKind {
  if (el instanceof HTMLTextAreaElement) return "textarea";
  if (el instanceof HTMLSelectElement) return "select";
  const t = el.type;
  if (t === "email") return "email";
  if (t === "tel") return "tel";
  if (t === "date") return "date";
  if (t === "checkbox") return "checkbox";
  if (t === "radio") return "radio";
  if (t === "text" || t === "") return "text";
  return "unknown";
}

function resolveLabel(el: Fillable): string {
  if (el.id) {
    const forLabel = el.ownerDocument.querySelector(`label[for="${el.id}"]`);
    if (forLabel?.textContent) return forLabel.textContent.trim();
  }
  const wrapping = el.closest("label");
  if (wrapping?.textContent) {
    const text = wrapping.textContent.trim();
    if (text) return text;
  }
  const aria = el.getAttribute("aria-label");
  if (aria) return aria.trim();
  const placeholder = el.getAttribute("placeholder");
  if (placeholder) return placeholder.trim();
  return "";
}

function buildLocator(el: Element, root: ParentNode): string {
  if (el.id) return `#${el.id}`;
  const name = el.getAttribute("name");
  if (name) return `[name="${name}"]`;
  const tag = el.tagName.toLowerCase();
  const same = Array.from(root.querySelectorAll(tag));
  return `${tag}:nth-of-type(${same.indexOf(el) + 1})`;
}

export function extractFields(root: ParentNode): FieldDescriptor[] {
  const fields: FieldDescriptor[] = [];
  const seenRadioNames = new Set<string>();
  const controls = Array.from(
    root.querySelectorAll<Fillable>("input, textarea, select"),
  );

  for (const el of controls) {
    if (el instanceof HTMLInputElement && SKIP_INPUT_TYPES.has(el.type)) continue;
    if ((el as HTMLInputElement).disabled) continue;

    const kind = inputKind(el);

    if (kind === "radio") {
      const name = el.getAttribute("name") ?? "";
      if (name && seenRadioNames.has(name)) continue;
      if (name) seenRadioNames.add(name);
      const group = Array.from(
        root.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${name}"]`),
      );
      const label = resolveLabel(el);
      fields.push({
        id: name || buildLocator(el, root),
        locator: name ? `[name="${name}"]` : buildLocator(el, root),
        label,
        kind: "radio",
        options: group.map((r) => r.value),
        required: group.some((r) => r.required),
        rect: rectOf(el),
        readable: label !== "",
      });
      continue;
    }

    const label = resolveLabel(el);
    const descriptor: FieldDescriptor = {
      id: el.id || el.getAttribute("name") || buildLocator(el, root),
      locator: buildLocator(el, root),
      label,
      kind,
      required: (el as HTMLInputElement).required ?? false,
      rect: rectOf(el),
      readable: label !== "",
    };
    if (el instanceof HTMLSelectElement) {
      descriptor.options = Array.from(el.options).map((o) => o.value);
    }
    fields.push(descriptor);
  }

  return fields;
}

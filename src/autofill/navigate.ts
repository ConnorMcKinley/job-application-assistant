const ADVANCE_RE = /next|continue|save and continue|review/i;
const SUBMIT_RE = /submit|apply|finish/i;

function controlText(el: Element): string {
  if (el instanceof HTMLInputElement) return el.value.trim();
  return (el.textContent ?? "").trim();
}

export function findAdvanceControl(root: ParentNode): HTMLElement | null {
  const candidates = Array.from(
    root.querySelectorAll<HTMLElement>('button, input[type="submit"]'),
  );
  for (const el of candidates) {
    if ((el as HTMLButtonElement).disabled) continue;
    if (ADVANCE_RE.test(controlText(el))) return el;
  }
  return null;
}

export function isSubmitControl(el: Element): boolean {
  return SUBMIT_RE.test(controlText(el));
}

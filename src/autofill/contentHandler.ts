import type { FieldDescriptor } from "./types";
import { extractFields } from "./extract";
import { applyFill, highlightField } from "./execute";
import { findAdvanceControl, isSubmitControl } from "./navigate";

export type ContentRequest =
  | { type: "EXTRACT" }
  | { type: "APPLY"; fills: { field: FieldDescriptor; value: string }[] }
  | { type: "ADVANCE" }
  | { type: "HIGHLIGHT"; checkpoints: string[] };

export type ContentResponse =
  | { type: "FIELDS"; fields: FieldDescriptor[] }
  | { type: "APPLIED"; count: number }
  | { type: "ADVANCED"; submit: boolean }
  | { type: "OK" };

export function handleContentMessage(
  req: ContentRequest,
  root: ParentNode & Document,
): ContentResponse {
  switch (req.type) {
    case "EXTRACT":
      return { type: "FIELDS", fields: extractFields(root) };
    case "APPLY": {
      let count = 0;
      for (const { field, value } of req.fills) {
        if (applyFill(root, field, value)) {
          count += 1;
          const el = root.querySelector(field.locator);
          if (el instanceof HTMLElement) highlightField(el, "filled");
        }
      }
      return { type: "APPLIED", count };
    }
    case "ADVANCE": {
      const control = findAdvanceControl(root);
      if (!control || isSubmitControl(control)) return { type: "ADVANCED", submit: true };
      control.click();
      return { type: "ADVANCED", submit: false };
    }
    case "HIGHLIGHT": {
      for (const locator of req.checkpoints) {
        const el = root.querySelector(locator);
        if (el instanceof HTMLElement) highlightField(el, "needs");
      }
      return { type: "OK" };
    }
  }
}

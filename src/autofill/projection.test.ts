import { describe, it, expect } from "vitest";
import { buildProfileProjection } from "./projection";
import { emptyProfile } from "../models/types";

describe("buildProfileProjection", () => {
  it("flattens populated profile fields and omits empties", () => {
    const p = emptyProfile();
    p.personal.fullName = "Connor McKinley";
    p.personal.email = "c@example.com";
    p.education = [{ school: "MIT", degree: "BS", field: "CS", startDate: "", endDate: "", gpa: "" }];
    p.preferences.willingToRelocate = true;

    const proj = buildProfileProjection(p);
    expect(proj.fullName).toBe("Connor McKinley");
    expect(proj.email).toBe("c@example.com");
    expect(proj.school).toBe("MIT");
    expect(proj.fieldOfStudy).toBe("CS");
    expect(proj.willingToRelocate).toBe("yes");
    expect("phone" in proj).toBe(false); // empty omitted
  });
});

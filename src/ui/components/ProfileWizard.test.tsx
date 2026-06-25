import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfileWizard } from "./ProfileWizard";

describe("ProfileWizard", () => {
  it("walks steps and returns the assembled profile on finish", async () => {
    const onComplete = vi.fn();
    render(<ProfileWizard onComplete={onComplete} />);

    // Step 1: Personal
    await userEvent.type(screen.getByLabelText(/full name/i), "Connor McKinley");
    await userEvent.type(screen.getByLabelText(/^email/i), "c@example.com");
    await userEvent.click(screen.getByRole("button", { name: /next/i }));

    // Step 2: Education -> skip
    await userEvent.click(screen.getByRole("button", { name: /next/i }));
    // Step 3: Experience -> skip
    await userEvent.click(screen.getByRole("button", { name: /next/i }));
    // Step 4: Preferences -> finish
    await userEvent.click(screen.getByRole("button", { name: /finish/i }));

    expect(onComplete).toHaveBeenCalledTimes(1);
    const profile = onComplete.mock.calls[0]![0];
    expect(profile.personal.fullName).toBe("Connor McKinley");
    expect(profile.personal.email).toBe("c@example.com");
    expect(profile.id).toBe(1);
  });

  it("can go back to a previous step", async () => {
    render(<ProfileWizard onComplete={() => {}} />);
    await userEvent.type(screen.getByLabelText(/full name/i), "X");
    await userEvent.click(screen.getByRole("button", { name: /next/i }));
    await userEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(screen.getByLabelText(/full name/i)).toHaveValue("X");
  });
});

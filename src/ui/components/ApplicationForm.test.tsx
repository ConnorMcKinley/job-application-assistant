import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApplicationForm } from "./ApplicationForm";

describe("ApplicationForm", () => {
  it("submits entered values as a NewApplication", async () => {
    const onSubmit = vi.fn();
    render(<ApplicationForm onSubmit={onSubmit} onCancel={() => {}} />);

    await userEvent.type(screen.getByLabelText(/company/i), "Acme");
    await userEvent.type(screen.getByLabelText(/position/i), "SWE");
    await userEvent.selectOptions(screen.getByLabelText(/location type/i), "hybrid");
    await userEvent.type(screen.getByLabelText(/location place/i), "NYC");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const values = onSubmit.mock.calls[0]![0];
    expect(values.company).toBe("Acme");
    expect(values.position).toBe("SWE");
    expect(values.location).toEqual({ type: "hybrid", place: "NYC" });
    expect(values.id).toBeUndefined();
  });

  it("pre-fills fields when editing", () => {
    render(
      <ApplicationForm
        initial={{
          id: 3, company: "Beta", position: "PM", location: { type: "onsite", place: "SF" },
          jobUrl: "https://b.test", atsType: "lever", appliedDate: "2026-02-02", status: "interview",
          linkedEmails: [], recruiterContacts: [], notes: "n", createdAt: "", updatedAt: "",
        }}
        onSubmit={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByLabelText(/company/i)).toHaveValue("Beta");
    expect(screen.getByLabelText(/status/i)).toHaveValue("interview");
  });
});

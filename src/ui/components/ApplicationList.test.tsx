import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApplicationList } from "./ApplicationList";
import type { Application } from "../../models/types";

function app(over: Partial<Application>): Application {
  return {
    id: 1, company: "", position: "SWE", location: { type: "remote", place: "" },
    jobUrl: "", atsType: "", appliedDate: "2026-01-01", status: "applied",
    linkedEmails: [], recruiterContacts: [], notes: "", createdAt: "", updatedAt: "", ...over,
  };
}

describe("ApplicationList", () => {
  it("renders a row per application", () => {
    render(
      <ApplicationList
        apps={[app({ id: 1, company: "Acme" }), app({ id: 2, company: "Beta" })]}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("toggles sort order when a header is clicked", async () => {
    render(
      <ApplicationList
        apps={[app({ id: 1, company: "Zeta" }), app({ id: 2, company: "Alpha" })]}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    // default: company asc -> Alpha first
    let rows = screen.getAllByRole("row").slice(1); // skip header
    expect(within(rows[0]!).getByText("Alpha")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /company/i }));
    rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]!).getByText("Zeta")).toBeInTheDocument();
  });

  it("invokes onDelete with the row id", async () => {
    const onDelete = vi.fn();
    render(<ApplicationList apps={[app({ id: 7, company: "Acme" })]} onEdit={() => {}} onDelete={onDelete} />);
    await userEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledWith(7);
  });
});

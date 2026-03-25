import React, { useState } from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentNormativeRequirementsField } from "@/components/documents/document-normative-requirements-field";
import { renderWithQueryClient } from "../support/render";

const { mutateAsyncMock } = vi.hoisted(() => ({
  mutateAsyncMock: vi.fn(),
}));

vi.mock("@workspace/api-client-react", () => ({
  useSuggestDocumentNormativeRequirements: () => ({
    mutateAsync: mutateAsyncMock,
    isPending: false,
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: vi.fn(),
}));

function TestHarness() {
  const [value, setValue] = useState<string[]>([]);

  return (
    <DocumentNormativeRequirementsField
      orgId={101}
      title="Procedimento de controle documental"
      type="procedimento"
      referenceIds={[10]}
      value={value}
      onChange={setValue}
    />
  );
}

describe("document normative requirements field", () => {
  beforeEach(() => {
    mutateAsyncMock.mockReset();
    mutateAsyncMock.mockResolvedValue({
      suggestions: ["ISO 9001:2015 4.4"],
    });
  });

  it("adds and removes manual requirements", () => {
    renderWithQueryClient(<TestHarness />);

    fireEvent.change(screen.getByPlaceholderText("Ex.: ISO 9001:2015 7.5"), {
      target: { value: "ISO 9001:2015 7.5" },
    });
    fireEvent.keyDown(screen.getByPlaceholderText("Ex.: ISO 9001:2015 7.5"), {
      key: "Enter",
    });

    expect(screen.getByText("ISO 9001:2015 7.5")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Remover ISO 9001:2015 7.5" }),
    );

    expect(screen.queryByText("ISO 9001:2015 7.5")).not.toBeInTheDocument();
  });

  it("accepts AI suggestions", async () => {
    renderWithQueryClient(<TestHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Sugerir por IA" }));

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith({
        orgId: 101,
        data: {
          title: "Procedimento de controle documental",
          type: "procedimento",
          referenceIds: [10],
          currentRequirements: [],
        },
      });
    });

    expect(
      screen.getByRole("button", { name: "ISO 9001:2015 4.4" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "ISO 9001:2015 4.4" }));

    expect(screen.getByText("ISO 9001:2015 4.4")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "ISO 9001:2015 4.4" }),
    ).not.toBeInTheDocument();
  });
});

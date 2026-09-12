import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Input } from "./input";

describe("Input", () => {
  it("links label and input and keeps the label as placeholder when idle", () => {
    render(<Input label="E-mail" />);
    const input = screen.getByLabelText("E-mail");
    expect(input).toHaveAttribute("placeholder", " ");
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("renders the error message and marks the field invalid", () => {
    render(<Input label="E-mail" error="Informe um e-mail válido" />);
    const input = screen.getByLabelText("E-mail");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Informe um e-mail válido");
    expect(input).toHaveAttribute("aria-describedby", screen.getByRole("alert").id);
  });

  it("accepts typing", async () => {
    render(<Input label="Nome" />);
    const input = screen.getByLabelText("Nome");
    await userEvent.type(input, "Fillipe");
    expect(input).toHaveValue("Fillipe");
  });
});

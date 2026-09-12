import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderHighlight } from "./highlight";

describe("renderHighlight", () => {
  it("turns <em> into <mark> and escapes other tags", () => {
    const { container } = render(<p>{renderHighlight("Reunião <em>segunda</em> <script>x</script> fim")}</p>);
    expect(container.querySelector("mark")?.textContent).toBe("segunda");
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toBe("Reunião segunda x fim");
  });
});

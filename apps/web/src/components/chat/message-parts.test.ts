import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { groupMessageParts, userMessageText } from "./message-parts";

type Part = UIMessage["parts"][number];

const reasoning = (text: string): Part => ({ type: "reasoning", text, state: "done" });
const text = (value: string): Part => ({ type: "text", text: value, state: "done" });
const tool = (name: string, state: string, extra: Record<string, unknown> = {}): Part =>
  ({ type: `tool-${name}`, toolCallId: `${name}-${Math.random()}`, state, input: {}, ...extra }) as Part;

describe("groupMessageParts", () => {
  it("keeps text and tool results in the body and reasoning in the process", () => {
    const grouped = groupMessageParts([reasoning("pensando"), tool("searchReminders", "output-available", { output: { items: [] } }), text("Achei.")]);
    expect(grouped.process).toEqual([{ kind: "reasoning", text: "pensando" }]);
    expect(grouped.body.map((item) => item.kind)).toEqual(["tool", "text"]);
    expect(grouped.thinking).toBe(false);
  });

  it("hides failed attempts the model moved past and keeps a final failure visible", () => {
    const retried = groupMessageParts([
      tool("createReminder", "output-error", { errorText: "The assistant sent invalid data to the tool" }),
      tool("createReminder", "output-error", { errorText: "The assistant sent invalid data to the tool" }),
      tool("createReminder", "output-available", { output: { id: "1", title: "Almoço" } }),
    ]);
    expect(retried.process).toEqual([
      { kind: "attempt", name: "createReminder", errorText: "The assistant sent invalid data to the tool" },
      { kind: "attempt", name: "createReminder", errorText: "The assistant sent invalid data to the tool" },
    ]);
    expect(retried.body).toHaveLength(1);

    const explained = groupMessageParts([tool("getReminder", "output-error", { errorText: "Reminder not found" }), text("Não achei.")]);
    expect(explained.process).toEqual([{ kind: "attempt", name: "getReminder", errorText: "Reminder not found" }]);
    expect(explained.body.map((item) => item.kind)).toEqual(["text"]);

    const failed = groupMessageParts([reasoning("x"), tool("getReminder", "output-error", { errorText: "Reminder not found" })]);
    expect(failed.process).toEqual([{ kind: "reasoning", text: "x" }]);
    expect(failed.body.map((item) => item.kind)).toEqual(["tool"]);
  });

  it("moves internal steps to the process and ignores empty parts", () => {
    const grouped = groupMessageParts([
      reasoning("   "),
      tool("resolveDateRange", "output-available", { input: { expression: "hoje" }, output: { label: "hoje" } }),
      text(""),
      { type: "step-start" } as Part,
    ]);
    expect(grouped.process).toEqual([{ kind: "step", name: "resolveDateRange", input: { expression: "hoje" }, output: { label: "hoje" } }]);
    expect(grouped.body).toEqual([]);
  });

  it("reports thinking only while the last streamed part is reasoning", () => {
    expect(groupMessageParts([{ type: "reasoning", text: "", state: "streaming" }], true).thinking).toBe(true);
    expect(groupMessageParts([reasoning("x"), { type: "text", text: "", state: "streaming" }], true).thinking).toBe(false);
    expect(groupMessageParts([reasoning("x")], false).thinking).toBe(false);
  });

  it("keeps an empty streaming text part so the message has a body", () => {
    expect(groupMessageParts([{ type: "text", text: "", state: "streaming" }], true).body).toEqual([{ kind: "text", text: "" }]);
  });
});

describe("userMessageText", () => {
  it("joins the text parts", () => {
    expect(userMessageText({ parts: [text("a"), { type: "step-start" } as Part, text("b")] })).toBe("a\nb");
  });
});

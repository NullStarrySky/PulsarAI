import { describe, expect, it } from "vitest";
import { askUserSchema } from "./ask-user";

describe("askUserSchema", () => {
  it("accepts multiple questions including an explicit boolean approval", () => {
    expect(askUserSchema.parse({
      questions: [
        { id: "approval", question: "接受此建议吗？", kind: "boolean" },
        {
          id: "targets",
          question: "选择目标",
          kind: "multi-select",
          options: ["插件", "资源"],
        },
      ],
    })).toMatchObject({
      questions: [
        { id: "approval", kind: "boolean" },
        { id: "targets", kind: "multi-select" },
      ],
    });
  });

  it("rejects choice questions without options", () => {
    expect(() => askUserSchema.parse({
      questions: [{ id: "choice", question: "选一个", kind: "select" }],
    })).toThrow("必须提供 options");
  });
});

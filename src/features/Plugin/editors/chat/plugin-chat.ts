import { push } from "notivue";
import { z } from "zod";
import type { ModelMessage } from "ai";

const chatSchema = z.object({
  message: z.array(z.object({
    role: z.enum(["system", "user", "assistant"]),
    content: z.string(),
    name: z.string().optional(),
    enabled: z.boolean().optional(),
  })),
});

export type PluginChatMessage = z.infer<typeof chatSchema>["message"][number];
export type PluginChatContext = z.infer<typeof chatSchema>;

export function createPluginChatContext(): PluginChatContext {
  return { message: [] };
}

/** Read the authoring document; the editor retains optional labels and enabled state. */
export function readPluginChatContext(input: unknown): PluginChatContext {
  let value = input;
  if (typeof input === "string") {
    try { value = JSON.parse(input); }
    catch {
      push.warning(".chat.json 不是合法 JSON，已忽略。");
      return createPluginChatContext();
    }
  }
  const parsed = chatSchema.safeParse(value);
  if (!parsed.success) {
    push.warning(".chat.json 类型无效，已忽略。");
    return createPluginChatContext();
  }
  return parsed.data;
}

/** Import only runnable model messages; authoring metadata never enters the Sandbox. */
export function parsePluginChatContext(input: unknown): ModelMessage[] {
  return readPluginChatContext(input).message
    .filter((message) => message.enabled !== false)
    .map(({ role, content }) => ({ role, content }));
}

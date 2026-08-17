import type {
  ChatMessage,
  ChatMessageContainer,
} from "@/features/Conversation/messages/conversation-types";
import { formatChatMessageError } from "@/features/Conversation/messages/conversation-types";
import { normalizeMarkdownLineBreaks } from "@/features/Plugin/shared/markdown";
import { safeClone } from "@/features/Conversation/store/conversation-resource-overlay";

export interface ReplyContainerInput {
  emptyContainer: ChatMessageContainer;
  emptyMessage: ChatMessage;
  onReplyChange?: () => void | Promise<void>;
}

/**
 * The target-bound `reply` API every generation process writes through. All
 * mutations queue serially onto `onReplyChange` and reject after `finish()`.
 */
export function createReplyContainer(input: ReplyContainerInput) {
  const cloneSerializable = <T>(value: T): T => safeClone(value);
  let replyActive = true;
  let replyQueue = Promise.resolve();
  const updateReply = (update: () => void) => {
    if (!replyActive) throw new Error("本次生成已经结束，不能继续修改助手消息。");
    replyQueue = replyQueue.then(async () => {
      update();
      await input.onReplyChange?.();
    });
    return replyQueue;
  };
  const reply = Object.freeze({
    read: () => ({
      container: cloneSerializable(input.emptyContainer),
      message: cloneSerializable(input.emptyMessage),
    }),
    setContent: (content: string) => {
      const nextContent = String(content);
      return updateReply(() => {
        input.emptyMessage.content = normalizeMarkdownLineBreaks(nextContent);
      });
    },
    clear: () => updateReply(() => {
      input.emptyMessage.content = "";
      input.emptyMessage.type = "message";
      input.emptyMessage.parts = undefined;
      input.emptyMessage.meta.steps = [];
      delete input.emptyMessage.meta.translation;
    }),
    appendContent: (delta: string) => updateReply(() => {
      input.emptyMessage.content = normalizeMarkdownLineBreaks(input.emptyMessage.content + String(delta));
    }),
    addPart: (part: NonNullable<ChatMessage["parts"]>[number]) => updateReply(() => {
      input.emptyMessage.parts ??= [];
      input.emptyMessage.parts.push(cloneSerializable(part));
    }),
    addStep: (step: ChatMessage["meta"]["steps"][number]) => updateReply(() => {
      input.emptyMessage.meta.steps.push(cloneSerializable(step));
    }),
    updateThinking: (id: string, message: string) => updateReply(() => {
      const step = input.emptyMessage.meta.steps.find(
        (candidate) => candidate.type === "thinking" && candidate.id === id,
      );
      if (step?.type === "thinking") step.message = message;
    }),
    completeToolCall: (step: Extract<ChatMessage["meta"]["steps"][number], { type: "tool-result" }>) => updateReply(() => {
      const steps = input.emptyMessage.meta.steps;
      const index = steps.findIndex(
        (candidate) => candidate.type === "tool-call" && candidate.toolCallId === step.toolCallId,
      );
      if (index >= 0) {
        steps.splice(index, 1, cloneSerializable(step));
      } else {
        steps.push(cloneSerializable(step));
      }
    }),
    setModelName: (nextModelName: string) => updateReply(() => {
      const value = String(nextModelName).trim();
      if (!value) throw new Error("生成模型名称不能为空。");
      const generateInfo = input.emptyMessage.meta.generateInfo ??= {
        modelName: value,
        startTime: new Date().toISOString(),
      };
      generateInfo.modelName = value;
    }),
    fail: (content: string) => updateReply(() => {
      input.emptyMessage.type = "error";
      input.emptyMessage.content = formatChatMessageError(normalizeMarkdownLineBreaks(content));
    }),
  });
  return {
    reply,
    queue: () => replyQueue,
    finish: () => {
      replyActive = false;
    },
  };
}

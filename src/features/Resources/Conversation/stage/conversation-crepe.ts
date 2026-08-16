import { CrepeFeature, type CrepeConfig } from "@milkdown/crepe";
import type { AIPromptContext } from "@milkdown/crepe/feature/ai";
import type { ModelMessage } from "ai";
import { generateAuxiliaryText } from "@/features/Agent/runtime/default-agent";

export const conversationCrepeFeatures: Record<CrepeFeature, boolean> = {
  [CrepeFeature.Cursor]: true,
  [CrepeFeature.ListItem]: true,
  [CrepeFeature.LinkTooltip]: true,
  [CrepeFeature.ImageBlock]: true,
  [CrepeFeature.BlockEdit]: false,
  [CrepeFeature.Placeholder]: true,
  [CrepeFeature.Toolbar]: true,
  [CrepeFeature.CodeMirror]: true,
  [CrepeFeature.Table]: true,
  [CrepeFeature.Latex]: true,
  [CrepeFeature.TopBar]: false,
  [CrepeFeature.AI]: true,
};

export const conversationCrepeFeatureConfigs: NonNullable<CrepeConfig["featureConfigs"]> = {
  [CrepeFeature.Cursor]: {
    color: "var(--foreground)",
    width: 2,
    virtual: false,
  },
  [CrepeFeature.AI]: {
    provider: conversationAIProvider,
    diffReviewOnEnd: false,
    instructionPlaceholder: "让 Pulsar 帮你改写、续写或整理这段内容",
  },
};

async function* conversationAIProvider(context: AIPromptContext, signal: AbortSignal): AsyncIterable<string> {
  const content = [
    context.document && `当前文档：\n${context.document}`,
    context.selection && `选中内容：\n${context.selection}`,
    `指令：\n${context.instruction}`,
  ].filter(Boolean).join("\n\n");

  const messages: ModelMessage[] = [
    {
      role: "user",
      content,
    },
  ];

  const result = await generateAuxiliaryText(messages);

  for (const chunk of chunkText(result.text)) {
    if (signal.aborted) {
      return;
    }
    yield chunk;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function chunkText(text: string) {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += 8) {
    chunks.push(text.slice(index, index + 8));
  }
  return chunks.length ? chunks : [""];
}

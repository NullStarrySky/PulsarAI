import { generateText } from "@/features/ModelConnection/application/model-ai";
import {
  getPromptOptimizationModel,
  getPromptOptimizationPrompt,
} from "@/features/defaultConfigs/application/default-config-service";

export async function optimizeComposerPrompt(source: string) {
  const input = source.trim();
  if (!input) {
    throw new Error("请先输入需要优化的内容。");
  }
  const [model, template] = await Promise.all([
    getPromptOptimizationModel(),
    getPromptOptimizationPrompt(),
  ]);
  if (!model.trim()) {
    throw new Error("请先在默认项中选择提示词优化模型。");
  }
  const instruction = template.trim();
  if (!instruction) {
    throw new Error("请先在默认项中设置提示词优化模板。");
  }
  const request = instruction.includes("{{prompt}}")
    ? instruction.split("{{prompt}}").join(input)
    : `${instruction}\n\n${input}`;
  const result = await generateText({
    model,
    prompt: request,
  });
  const optimized = result.text.trim();
  if (!optimized) {
    throw new Error("模型没有返回优化后的提示词。");
  }
  return optimized;
}

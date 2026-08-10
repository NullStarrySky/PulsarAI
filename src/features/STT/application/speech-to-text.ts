import { getTranscriptionModel } from "@/features/defaultConfigs/application/default-config-service";
import {
  transcribe as transcribeWithModel,
  type HydratableModel,
} from "@/features/ModelConnection/application/model-ai";

export type TranscribeOptions = Omit<Parameters<typeof transcribeWithModel>[0], "model"> & {
  model?: HydratableModel;
  language?: string;
};

export async function transcribe(options: TranscribeOptions) {
  const model = options.model ?? await getTranscriptionModel();
  if (!model) {
    throw new Error("尚未配置语音转写模型。");
  }
  return transcribeWithModel({ ...options, model });
}

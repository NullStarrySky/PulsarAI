import { InferenceClient, type InferenceProviderOrPolicy } from "@huggingface/inference";
import type { ImageModelV4 } from "@ai-sdk/provider";
import { modelProxyFetch } from "./model-proxy-fetch";

export class HuggingFaceImageModel implements ImageModelV4 {
  readonly specificationVersion = "v4" as const;
  readonly provider = "huggingface";
  readonly maxImagesPerCall = 1;

  constructor(
    readonly modelId: string,
    private readonly apiKeyName: string,
    private readonly baseUrl: string,
  ) {}

  async doGenerate(options: Parameters<ImageModelV4["doGenerate"]>[0]): Promise<Awaited<ReturnType<ImageModelV4["doGenerate"]>>> {
    if (!options.prompt?.trim()) throw new Error("Hugging Face 图片提示词不能为空。");
    if (options.files?.length || options.mask) throw new Error("Hugging Face text-to-image 模型不接受参考图或蒙版。");

    const providerOptions = options.providerOptions.huggingface ?? {};
    const provider = typeof providerOptions.provider === "string"
      ? providerOptions.provider as InferenceProviderOrPolicy
      : "auto";
    const parameters: Record<string, unknown> = { ...providerOptions };
    delete parameters.provider;
    if (options.seed != null) parameters.seed = options.seed;
    if (options.size) {
      const [width, height] = options.size.split("x").map(Number);
      parameters.width = width;
      parameters.height = height;
    }

    const client = new InferenceClient(`<<${this.apiKeyName}>>`, {
      fetch: modelProxyFetch,
      retry_on_error: true,
      ...(this.baseUrl && this.baseUrl !== "https://router.huggingface.co"
        ? { endpointUrl: `${this.baseUrl.replace(/\/+$/, "")}/hf-inference/models/${this.modelId}` }
        : {}),
    });
    const startedAt = new Date();
    const image = await client.textToImage({
      model: this.modelId,
      provider,
      inputs: options.prompt.trim(),
      parameters,
    }, {
      signal: options.abortSignal,
      outputType: "blob",
    });

    return {
      images: [new Uint8Array(await image.arrayBuffer())],
      warnings: options.aspectRatio
        ? [{ type: "unsupported", feature: "aspectRatio", details: "请改用 size 指定 Hugging Face 图片尺寸。" }]
        : [],
      providerMetadata: { huggingface: { images: [{ provider }] } },
      response: { timestamp: startedAt, modelId: this.modelId, headers: undefined },
    };
  }
}

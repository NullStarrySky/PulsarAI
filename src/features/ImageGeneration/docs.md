# ImageGeneration

`ImageGeneration` 是纯图片生成服务 Feature，不拥有 Conversation、消息附件或资源落盘逻辑。

- `image-generation.ts` 保持 AI SDK `generateImage` 的参数形状，并允许省略 `model` 后重定向到 DefaultConfig。
- 可生成 `ImageModel` 的远程平台由 ModelConnection 统一管理 API Key、地址和模型对象。
- 专用图片服务只在无法合理建模为模型提供商时放入本 Feature。
- 需要庞大本地模型、独立守护进程或复杂硬件环境的 provider 原则上暂不接入；ComfyUI 与 AUTOMATIC1111/Forge 是用户明确批准的常用本地服务例外。
- ModelConnection 中标记为 `runtime: "local-heavy"` 的 provider 会被图片页面和默认图片模型选择器拦截。
- 模型列表仍由 ModelConnection 获取；只有 adapter 能返回明确的 `image` 能力类型时才进入本页，不猜测通用 `/models` 结果。

## migrations/image 迁移结论

迁移目录包含两类项目，但只有一个新增服务目标进入当前阶段：

- `walkeatround` 是 SillyTavern 对话编排脚本。它注入或独立生成 `[IMG_GEN]...[/IMG_GEN]` 提示词，再调用宿主已经配置的 Stable Diffusion 服务；人物模板、消息标签解析、图库交互和重试队列属于 Conversation/Plugin 层，不是新的 ImageGeneration provider。
- `cosmos_vision` 同时集成 NovelAI 与 ComfyUI，并附带 Prompt LLM、聊天 DOM、图库、提示词预设、Vibe 和 WD Tagger 等完整插件能力。本 Feature 只提取图片服务边界，不迁移宿主 UI 与对话耦合逻辑。
- ComfyUI 默认依赖 `http://127.0.0.1:8188`、常驻服务、工作流 JSON 和本地模型，仍被识别为 `local-heavy`，但因使用频率高而作为用户明确批准的当前阶段例外接入。
- NovelAI 是远程、单一用途的图片服务，既不需要本地模型，也不适合作为 ModelConnection 的多能力模型平台，因此作为 `source: "feature"` 的专用 provider 接入。

## SillyTavern 图片面板迁移结论

- 只从 `src/endpoints/stable-diffusion.js` 和对应前端请求构造中提取高优先级服务协议，不迁移 SillyTavern 的设置对象、DOM、聊天提示词模板或兼容分支。
- AUTOMATIC1111/Forge、RunPod ComfyUI 与 Stability 都是清晰的图片服务边界，归 ImageGeneration 专用 provider。
- Hugging Face Inference Providers 是可承载多任务、多模型的远程平台，归 ModelConnection；图片目录只显式登记 `apiType: "image"` 的模型，不从通用模型响应猜测能力。

## NovelAI adapter

- `image-generation.ts` 识别 `novelai/<model>` 引用；其他引用继续进入 AI SDK 图片模型流程。
- `novelai-settings.ts` 将非敏感参数持久化到 DefaultConfig，并将 API Key 保存到共享 Secret 数据表。
- `providers/novelai-image-client.ts` 通过现有 Tauri `modelProxyFetch` 调用 `<baseUrl>/ai/generate-image`，请求发出前才替换 Secret 占位符。
- 请求保留迁移实现中与文生图直接相关的模型、尺寸、采样器、steps、guidance、seed、质量标签、负向提示词和 V4 prompt 结构。
- 响应同时兼容 JSON base64 图片数组与 ZIP 图片归档；ZIP 只提取 PNG、JPEG 和 WebP。
- 多账号路由、Vibe、角色坐标、Prompt LLM、图片到图片和图库生命周期暂不进入最小 adapter；它们可以在有明确 Feature 需求时沿当前 provider-specific 参数表单继续扩展。

## ComfyUI adapter

- `comfyui/workflow` 是 ImageGeneration 专用服务引用，不进入 ModelConnection 模型目录。
- 设置显式保存协议、主机与端口，默认 `http://127.0.0.1:8188`；连接测试请求 `/object_info/CheckpointLoaderSimple`，同时返回可用 checkpoint 列表。
- 基础模式生成只依赖核心节点的文生图工作流：`CheckpointLoaderSimple`、`EmptyLatentImage`、`CLIPTextEncode`、`KSampler`、`VAEDecode` 与 `SaveImage`。
- 自定义模式接受 ComfyUI `Save (API Format)` 导出的 JSON。提示词绑定兼容迁移项目的 `_meta.cosmosVision.promptBindings`、Pulsar 的 `_meta.pulsar.promptBindings`，以及 `{{prompt}}`、`{{negativePrompt}}`、`{{seed}}`、`{{width}}`、`{{height}}` 占位符。
- 输出节点优先使用 `_meta.*.imageOutput` 标记，否则自动收集 `SaveImage` 与 `PreviewImage`；私有绑定元数据会在提交前剥离。
- 运行时通过 Tauri 代理 `POST /prompt`，轮询 `/history/{prompt_id}`，最后从 `/view` 下载图片。请求超时或取消时会尝试调用 `/interrupt`。
- RunPod Serverless 复用同一工作流构造器，连接测试请求 `/health`，生成调用 `/run`、轮询 `/status/{id}`，取消调用 `/cancel/{id}`；Endpoint URL 和 API Key 独立保存。
- PulsarAI 只连接已有 ComfyUI 服务，不安装、启动、停止或管理 ComfyUI daemon、模型和自定义节点。

## AUTOMATIC1111 / Forge adapter

- `automatic1111/txt2img` 默认连接 `http://127.0.0.1:7860`，连接测试读取 `/sdapi/v1/options`、`sd-models`、`samplers` 与 `schedulers`。
- 生成调用 `/sdapi/v1/txt2img`；模型通过 `override_settings` 临时指定并在请求后恢复，避免改变共享 WebUI 的全局模型。
- `--api-auth` 凭据以 Base64 Basic Auth 值写入 Secret；取消时尝试调用 `/sdapi/v1/interrupt`。
- PulsarAI 不启动 WebUI、不加载 checkpoint，也不接管扩展、LoRA、VAE 或全局模型切换。

## Stability adapter

- `stability/<model>` 支持 Stable Image Ultra、Core 与 SD3/3.5，对应官方 v2beta multipart 生成端点。
- API Key 写入 Secret；设置保存宽高比、输出格式、style preset 与负向提示词。多图请求按最多四次独立调用执行。
- FormData 由共享 `modelProxyFetch` 序列化为原始请求字节，使 multipart boundary 与请求体一起经过 Tauri 代理。

## Hugging Face ImageModel

- Hugging Face 是 ModelConnection 内建远程 provider，使用官方 `@huggingface/inference` 的 `InferenceClient.textToImage` 与 `provider: "auto"`。
- `HuggingFaceImageModel` 实现 AI SDK ImageModel V4，每次调用生成一张图片；AI SDK 可按 `maxImagesPerCall: 1` 拆分多图请求。
- 内建目录只列出明确的图片模型；Token 仍通过 Secret 占位符与 Tauri 代理注入。

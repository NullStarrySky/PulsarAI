# TTS

`TTS` 是纯文本转语音服务 Feature，不拥有 Conversation 或消息逻辑。目前包含系统 TTS、`edge-tts-ts@1.0.0`、火山引擎 OpenSpeech、ElevenLabs 与 Azure Speech 专用 adapter，并可引用 ModelConnection 中的 speech models。

## 应用接口

- `generateSpeech(options)`：保持 AI SDK `generateSpeech` 的参数形状；省略 `model` 时重定向到 DefaultConfig。
- `textToSpeech(request)`：Edge 专用低层入口，合成 MP3 `Blob` 并返回词/句边界。
- `listTextToSpeechVoices()`：读取 Edge 在线声音列表，并映射为 Feature 自有类型。
- `speakWithSystemTts(request)`：通过 `tauri-plugin-tts` 调用 Windows SAPI、Apple AVSpeechSynthesizer、Linux speech-dispatcher 或 Android TextToSpeech 直接播放。
- `generateSpeech({ model: "volcengine-tts/<resourceId>", ... })`：通过 AI SDK `SpeechModelV4` 形状调用 OpenSpeech HTTP Chunked v3，返回 MP3 字节。
- `generateSpeech({ model: "elevenlabs/<modelId>", ... })`：调用 ElevenLabs TTS，并将统一 `voice` / `speed` 映射到 Voice ID 与 `voice_settings`。
- `generateSpeech({ model: "azure-speech/standard", ... })`：调用区域化 Azure Speech REST endpoint，将文本、voice、style 和 speed 编译为 SSML。

系统 TTS 只播放语音，不返回音频字节，因此不会伪装成 AI SDK `SpeechModel`，也不能作为 `generateSpeech` 的默认模型。其声音列表、预览、停止和参数表单由系统服务区单独承载。

第三方库仅允许出现在 `infrastructure/edge-tts-client.ts`。调用方不应持有 `Communicate`，也不应依赖第三方 chunk 类型。

`edge-tts-ts@1.0.0` 会在浏览器中调用 `new WebSocket(url, { headers })`，把 Node `ws` 的 options 错当成浏览器子协议。`load-edge-tts.ts` 在首次动态加载该包时临时安装兼容构造器，并在模块加载后立刻恢复全局构造器：

- Tauri 环境通过 `@tauri-apps/plugin-websocket` 在 Rust 客户端中建立连接，保留库生成的握手 headers，并桥接文本、二进制和关闭消息。
- 普通浏览器只能忽略 Node-only headers；声音列表可用，但 Edge 服务可能拒绝 WebSocket 握手。该路径只用于诊断，不作为应用运行路径。

该服务依赖 Microsoft 的非官方在线 Edge TTS 接口，不需要 API key，但可用性、限流和协议兼容性不受项目控制。

火山引擎 adapter 使用 `https://openspeech.bytedance.com/api/v3/tts/unidirectional`。APP ID 与 Access Token 分别保存在 Secret 数据表，请求时由 Rust 代理替换 `X-Api-App-Key`、`X-Api-Access-Key` 占位符；Resource ID、Speaker ID、采样率和 `additions.context_texts` 保持为 TTS 专用参数。前端不读取明文凭据。

ElevenLabs adapter 使用共享 Secret `elevenlabs_API_KEY`，通过 `/v1/models` 获取支持 TTS 的模型，通过分页 `/v2/voices` 获取账户声音，通过 `/v1/text-to-speech/<voiceId>` 生成二进制音频。当前不迁移 SillyTavern 的历史扫描、历史音频复用或声音上传，因为这些不是基础 TTS 服务，也不应引入会话状态或外部写操作。

Azure Speech adapter 使用共享 Secret `azure_SPEECH_API_KEY`。声音列表和合成都只接受合法 Region 并构造固定 Azure 域名；合成文本、Voice ID 与 style 会经过 XML 转义后进入 SSML。输出媒体类型由 `X-Microsoft-OutputFormat` 映射，不沿用迁移项目把 WebM 响应标成 OGG 的行为。

SillyTavern 源码只用于定位服务边界和已验证的调用目标。其 AGPL 实现没有复制进 PulsarAI；adapter 依据 ElevenLabs、Microsoft 官方协议重新实现。

## `migrations/voice` 提取结论

- `Siren-Voice-master` 的 GPT-SoVITS、IndexTTS、VoxCPM 指向本机服务并依赖外部模型/推理进程，属于当前明确拦截的本地重型目标。
- MiniMax 同时包含语音合成、声音管理/复刻与音乐等能力，更适合作为 ModelConnection 中的模型平台，而不是 TTS 内部 adapter。
- `st-immersive-sound-main` 中的“小米 MiMo”走 OpenAI 风格 `/chat/completions`，且属于多模型平台，同样留给 ModelConnection。
- 迁移项目中的 Edge 公共中转地址不可信且与已有直连 adapter 重复，不接入。
- 沉浸式音频方案、正则触发、缓存、卡拉 OK、空间音效和 LLM 编排属于 Conversation/UI 工作流，不进入纯 TTS 服务。
- 两个迁移项目的许可证都不适合直接复制实现；当前 OpenSpeech adapter 仅依据目标协议重新实现。

## Provider 边界

- 能生成 AI SDK `SpeechModel`、且通常覆盖多种模型能力的远程平台应接入 ModelConnection；TTS 只引用对应模型及共享密钥。
- 只提供语音服务、无法合理建模为通用模型提供商的 adapter 才归 TTS 所有，系统 TTS、Edge TTS、火山引擎 OpenSpeech、ElevenLabs 与 Azure Speech 属于此类。ElevenLabs 与 Azure 的 STT 能力可复用同一 provider Secret，但由 STT Feature 自己持有 adapter。
- 需要庞大本地模型、独立守护进程、复杂硬件或大规模本地运行时的 provider 暂不接入；遇到时必须先提醒并留到本地运行时阶段。
- ModelConnection 中标记为 `runtime: "local-heavy"` 的 provider 会被 TTS 页面和默认语音模型选择器拦截。
- 模型列表仍由 ModelConnection 获取；只有 adapter 能返回明确的 `tts` 能力类型时才进入本页。通用 OpenAI-compatible `/models` 响应没有能力类型，不能在这里猜测。

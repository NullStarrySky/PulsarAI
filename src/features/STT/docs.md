# STT

`STT` 是纯语音转写服务 Feature，不拥有 Conversation 或消息逻辑。

- `speech-to-text.ts` 保持 AI SDK `transcribe` 的参数形状，并允许省略 `model` 后重定向到 DefaultConfig。
- `system-speech-to-text.ts` 在 iOS/Android 上提供按键录音式系统识别、权限检查和结果事件；它不接受现成音频文件，因此不伪装成 AI SDK `TranscriptionModel`。
- 可生成 `TranscriptionModel` 的远程平台由 ModelConnection 统一管理 API Key、地址和模型对象。
- 专用 STT adapter 仅在协议无法合理建模为模型提供商时放入本 Feature。
- 需要庞大本地模型、独立守护进程或复杂硬件环境的 provider 暂不接入；遇到时必须先提醒并归入后续本地运行时阶段。
- ModelConnection 中标记为 `runtime: "local-heavy"` 的 provider 会被 STT 页面和默认转写模型选择器拦截。
- 模型列表仍由 ModelConnection 获取；只有 adapter 能返回明确的 `asr` 能力类型时才进入本页，不猜测通用 `/models` 结果。

`tauri-plugin-stt` 仍只用于移动端系统服务：iOS 使用 `SFSpeechRecognizer`，Android 使用 `SpeechRecognizer`。桌面的高质量离线路径由本 Feature 管理的 `whisper-candle-core` 模型包负责，而非 `tauri-plugin-stt` 的 Whisper.cpp/GGML 路径。

## 本地 Whisper Candle 高质量转写

桌面端通过 `whisper-candle-core` 提供高质量离线转写。这是纯 Rust 的 Candle 实现，作为实时 sherpa-onnx 路径之外的可选回退方案。模型包由 STT Feature 下载为受控 ZIP，校验通过后解压到 App data 的 `stt/whisper-candle/<id>/<version>/`。ZIP 根目录必须包含 `config.json` 和 `model.safetensors`，可选 `generation_config.json`；索引只记录 `id`、版本、SHA-256、下载大小、实际磁盘占用、语言和 runtime。

Rust 的统一 `stt_transcribe` 只接收模型 ID、WAV PCM 字节和可选语言，不向前端暴露模型路径或推理细节。原生侧用 Candle 直接映射本地 safetensors 权重；当前 CPU 路径会下混并线性重采样到 16 kHz mono。前端以 `whisper-candle/<id>` 作为默认模型引用。实时切段/增量识别仍留给 sherpa-onnx，而非把 Whisper 误用于实时流。

下载校验和解压均在原生侧完成，前端不会接触任何模型路径。该实现不再为本地 STT 引入 C/C++、CMake 或 libclang 依赖；但 `whisper-candle-core` 仍是较新的依赖，因此仅作为用户明确选择的高质量回退方案。

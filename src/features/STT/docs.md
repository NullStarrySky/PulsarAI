# STT

`STT` 是纯语音转写服务 Feature，不拥有 Conversation 或消息逻辑。

- `application/speech-to-text.ts` 保持 AI SDK `transcribe` 的参数形状，并允许省略 `model` 后重定向到 DefaultConfig。
- `application/system-speech-to-text.ts` 在 iOS/Android 上提供按键录音式系统识别、权限检查和结果事件；它不接受现成音频文件，因此不伪装成 AI SDK `TranscriptionModel`。
- 可生成 `TranscriptionModel` 的远程平台由 ModelConnection 统一管理 API Key、地址和模型对象。
- 专用 STT adapter 仅在协议无法合理建模为模型提供商时放入本 Feature。
- 需要庞大本地模型、独立守护进程或复杂硬件环境的 provider 暂不接入；遇到时必须先提醒并归入后续本地运行时阶段。
- ModelConnection 中标记为 `runtime: "local-heavy"` 的 provider 会被 STT 页面和默认转写模型选择器拦截。
- 模型列表仍由 ModelConnection 获取；只有 adapter 能返回明确的 `asr` 能力类型时才进入本页，不猜测通用 `/models` 结果。

`tauri-plugin-stt` 的移动端桥接使用 iOS `SFSpeechRecognizer` 和 Android `SpeechRecognizer`。桌面实现依赖 whisper.cpp 与 75 MB–3 GB GGML 模型，属于 `local-heavy`：Cargo 依赖和插件注册都限定为 Android/iOS，桌面不编译、不展示，也不提供模型下载入口。

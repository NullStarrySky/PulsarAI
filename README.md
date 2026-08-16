# PulsarAI

PulsarAI 是一个基于 Tauri、Vue 3、Rust 与 AI SDK 的桌面 LLM 前端。项目仍处于开发阶段。

## Windows 开发环境

安装 [Bun](https://bun.sh/)、[Rust MSVC 工具链](https://www.rust-lang.org/tools/install)、Node.js 18+，以及 Tauri 常规所需的 Visual Studio Build Tools（MSVC 与对应 Windows SDK）。`whisper-candle-core` 是纯 Rust 依赖，因此本地 Whisper 转写不额外要求 CMake、Clang 或 `libclang.dll`。

本地 Piper TTS 通过 `sherpa-onnx` 的静态原生库运行。Cargo 会在首次构建时为当前平台获取匹配库；不需要手动安装 Python、Piper 可执行文件、CMake、Clang 或单独的推理服务。

## 获取依赖并运行

```powershell
git clone <repository-url> PulsarAI
cd PulsarAI
bun install
bun run tauri dev
```

`bun run tauri dev` 会通过 Bun 调用 Tauri CLI；无需另行 `cargo install tauri-cli`。原生依赖（包括 `whisper-candle-core`）由 Cargo 根据 `src-tauri/Cargo.toml` 自动获取并编译。

## 桌面端网络搜索浏览器

网络搜索默认使用 Rust `playwright-rs`。开发构建会准备 driver，但已安装的应用需要一个可发现的 Playwright driver；首次开发或安装后执行以下版本锁定命令：

```powershell
npm install --global playwright@1.61.1
playwright install chromium
```

第一条命令安装 Node Playwright driver，第二条下载其匹配的 Chromium；浏览器文件由 Playwright 缓存管理，不进入安装包。若 Playwright 无法启动，PulsarAI 会自动使用 Selenium Manager + `thirtyfour` 回退；该回退要求系统已安装 Chrome 或 Edge。移动端不提供浏览器自动化搜索。

## 本地 Whisper Candle 模型

Whisper 高质量转写模型不会进入安装包。请在“设置 → STT → Whisper Candle 本地高质量转写”中填写 ZIP 模型包的下载地址、ID、版本、SHA-256 与准确字节大小；ZIP 根目录必须包含 `config.json` 和 `model.safetensors`（可选 `generation_config.json`）。应用会在下载完成后校验、解压到 App data，并在同一页管理删除和磁盘占用。

目前本地 CPU 路径接收 WAV PCM 音频，并下混/重采样至 16 kHz mono。实时语音输入将由 sherpa-onnx 路径承担，Whisper 用于高质量离线转写。

## 本地 Piper 模型

Piper 用于轻量离线朗读。请在“设置 → TTS → Piper 本地朗读”中填写 sherpa-onnx 官方 Piper `tar.bz2` 模型包的下载地址、ID、版本、SHA-256 与准确字节大小。应用会验证压缩包，安装其中的 ONNX、`tokens.txt` 与 `espeak-ng-data`，并允许在同一页选择、测试或删除模型。模型保存在 App data，不会进入安装包。

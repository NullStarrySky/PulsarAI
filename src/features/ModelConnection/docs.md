# ModelConnection

内置提供商直接使用 AI SDK 对应的 provider 包水合模型；例如 DeepSeek 必须使用 `@ai-sdk/deepseek`，以保留其 `reasoning_content` 到 AI SDK reasoning 流事件的转换。内置 provider 的 API 地址可按需覆盖，模型列表由用户在对应 provider 下维护。

OpenAI-compatible 仅用于用户新增的兼容端点。它们通过 `@ai-sdk/openai-compatible` 请求，不应覆盖同名的内置原生 provider。

ModelConnection owns provider metadata, Secret-backed API keys, model discovery, model-reference parsing, AI SDK hydration, and the shared model selector.

Chat references use `provider/modelId/thinkingLevel`. The final segment is optional and is treated as thinking depth only when it matches `none`, `minimal`, `low`, `medium`, `high`, or `xhigh`; this preserves model IDs that contain `/`. Hydration removes the recognized final segment from the model ID and supplies it through AI SDK 7's top-level `reasoning` option. Without that segment, hydration omits `reasoning` so the Provider decides automatically.

`ModelSelect.vue` displays the provider/model icon, model title without provider prefix, and the thinking label. Its first menu level lists providers, provider submenus list models, and the separated thinking submenu owns the slider. The same combined reference is used in settings, Plugin manifests, and the Conversation composer.

A model provider cannot be enabled until its Secret API key exists. Initialization disables persisted providers whose key is absent, clearing or deleting a key disables the provider, and provider switches remain disabled until the key is saved.

Provider settings render a standard `SettingFormField` item whose control is a compact provider-name trigger. Clicking it opens a searchable popover that selects providers and owns each provider's activation switch; the details surface has no separate provider sidebar or provider header. ModelConnection, ImageGeneration, TTS, and STT reuse this selector.

The provider model list shows each model's knowledge cutoff, up to three declared price units, and explicit capability labels alongside context size and activation. Missing catalog metadata stays absent rather than being inferred.

# ModelConnection

ModelConnection owns provider metadata, Secret-backed API keys, model discovery, model-reference parsing, AI SDK hydration, and the shared model selector.

Chat references use `provider/modelId/thinkingLevel`. The final segment is optional and is treated as thinking depth only when it matches `none`, `minimal`, `low`, `medium`, `high`, or `xhigh`; this preserves model IDs that contain `/`. Hydration removes the recognized final segment from the model ID and supplies it through AI SDK 7's top-level `reasoning` option. Without that segment, hydration omits `reasoning` so the Provider decides automatically.

`ModelSelect.vue` displays the provider/model icon, model title without provider prefix, and the thinking label. Its first menu level lists providers, provider submenus list models, and the separated thinking submenu owns the slider. The same combined reference is used in settings, Plugin manifests, and the Conversation composer.

A model provider cannot be enabled until its Secret API key exists. Initialization disables persisted providers whose key is absent, clearing or deleting a key disables the provider, and provider switches remain disabled until the key is saved.

Provider settings render a standard `SettingFormField` item whose control is a compact provider-name trigger. Clicking it opens a searchable popover that selects providers and owns each provider's activation switch; the details surface has no separate provider sidebar or provider header. ModelConnection, ImageGeneration, TTS, and STT reuse this selector.

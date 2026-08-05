# Capabilities

`Capabilities` owns the public Feature API registry used by generated JavaScript. Every participating Feature exports one `capabilities.ts` file containing its runtime builder and shared documentation contract.

Public APIs are always assembled into the Sandbox at both `<featureId>` and `capabilities.<featureId>`. The runtime does not read default grants, character-package overrides, or a per-conversation enable switch. A small explicit policy removes only methods classified as destructive, externally effectful, paid, or arbitrary execution; removing documentation alone is never treated as enforcement.

Human-facing reference content lives in the optional `documentation` field of each stable Capability definition. `domain/capability-markdown.ts` converts those definitions into one complete Markdown document, a render model, and the matching page outline. `scripts/generate-capability-reference.ts` writes the generated reference before VitePress starts or builds.

The generation context contains only a short bootstrap explaining `readDocs()`. `readDocs()` returns the Feature directory, `readDocs(featureId)` returns one complete definition plus per-method availability, and `readDocs(featureId, apiName)` returns a single function contract. Blocked methods are reported with `availability: "blocked"` and are absent from the actual runtime object.

Builders still organize functions by stable sub-capability ids for ownership and human grouping, but those ids are no longer persisted as user grants. `application/capability-registry.ts` requests every public group once, applies the exceptional-method policy, and exposes the resulting objects.

Dangerous browser globals remain handled by the `globals` capability's filtered Proxy. Ordinary language/browser helpers stay available, while network, storage, navigation, worker, and dynamic-code globals remain explicit exceptional capabilities.

This is an application API policy boundary, not an operating-system security sandbox. New external APIs must be added to the owning Feature definition, documented in its metadata, and consumed through the central registry so runtime, `readDocs()`, and VitePress stay synchronized.

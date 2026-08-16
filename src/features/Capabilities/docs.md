# Capabilities

`Capabilities` owns the public Feature API registry used by generated JavaScript. There is no per-feature capability module and no grant system: every participating Feature documents its public API in a root `docs.ts` (`FeatureDocs`: id, title, description, optional human documentation, flat `api` list), and the registry fully includes the runtime objects.

`docs-index.ts` aggregates all `docs.ts` metadata. It imports metadata only, so `read_docs()` and the VitePress generation script can load the catalog without touching Pinia stores or other runtime dependencies.

`registry.ts` wires each feature's runtime API (`buildFeatureApiRuntime()`), exposes it at both `environment.<featureId>` and `environment.capabilities.<featureId>`, and applies one central on-demand blocklist: methods classified as destructive, externally effectful, paid, or arbitrary execution are removed from the actual runtime object, not merely hidden from documentation. `createDocsReader()` backs `read_docs()` with the same definitions and reports per-method `availability`.

The generation context contains only a short bootstrap explaining `read_docs(featureId?, apiName?)`. `read_docs()` returns the Feature directory, `read_docs(featureId)` returns one complete definition plus per-method availability, and `read_docs(featureId, apiName)` returns a single function contract. It returns `null` when the requested Feature or function does not exist. Blocked methods are reported with `availability: "blocked"` and are absent from the actual runtime object.

`docs-markdown.ts` converts the definitions into one complete Markdown document, a render model, and the matching page outline. `scripts/generate-capability-reference.ts` writes the generated reference before VitePress starts or builds.

Dangerous browser globals remain handled by the `globals` entry's filtered Proxy (`Sandbox/sandbox-globals.ts`); it grants all controlled globals by default, while `createSandboxScope` keeps a deny-all fallback for environments without an explicit `globals` object.

This is an application API policy boundary, not an operating-system security sandbox. New external APIs must be added to the owning Feature's `docs.ts`, wired once in the central registry, and stay synchronized across runtime, `read_docs()`, and VitePress automatically.

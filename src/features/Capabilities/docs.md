# Capabilities

`Capabilities` owns the external feature API contract used by generated JavaScript. Every participating feature exports one `capabilities.ts` file containing its permission metadata and `builder`.

The metadata is the single source of truth for:

- permission controls;
- the API object added to the Sandbox environment;
- the API prompt inserted into model context;
- the VitePress API reference.

`presentation/CapabilityGrantEditor.vue` is the shared permission inventory for
default settings, package overrides, and the VitePress prompt preview. It
renders each Feature as a collapsible row with an enabled count, individual
permission switches, and the functions documented by each permission.

Human-facing reference content lives in the optional `documentation` field of
each stable Capability definition. `domain/capability-markdown.ts` converts
those definitions into one complete Markdown document, a render model, and the
matching page outline. Definitions without human documentation are omitted
from that reference while remaining available to runtime permission assembly.
`scripts/generate-capability-reference.ts` writes the result to a generated
Markdown source before VitePress starts or builds. In development it also
watches the imported definitions and regenerates on change.
`docs/api/capability-reference.data.ts` then loads and renders that Markdown
through VitePress, so fenced TypeScript and JavaScript examples use the
documentation site's native Shiki highlighting instead of being reconstructed
as unhighlighted Vue `<pre>` elements.

The VitePress page keeps documentation and prompt preview as mutually exclusive
modes. Documentation mode renders the generated human reference and its table
of contents. Preview mode renders the grant editor and a read-only prompt
composed by the same helper used by runtime, identifying
`{{CAPABILITIES_PROMPT}}` as the context-structure macro.

A feature has an `all` convenience grant plus explicit sub-capability ids. Builders receive sub-capability ids and return `[apiObject, apiPrompt]`. Runtime assembly exposes each object both as `environment.<featureId>` and under `environment.capabilities.<featureId>`.

Character-package grants override the default grant list feature by feature. An omitted feature inherits the default; an explicit empty list denies every API of that feature.

Dangerous Sandbox browser globals participate through the `globals` capability. Unlike normal Feature objects, denied globals remain visible as Proxy placeholders so direct access can be intercepted with an explicit permission error. Ordinary language/browser helpers stay available, while `window`, `self`, and `globalThis` expose a filtered view for the explicitly controlled names.

This is an application API permission boundary, not a claim that browser-side JavaScript is an operating-system security sandbox. The global Proxy blocks ambient access through normal identifier and property lookup, but it cannot make same-realm hostile JavaScript safe against reflection or constructor-chain escapes. New external APIs must be added to the owning feature definition, documented in its metadata, and consumed through the central registry so code, prompt, settings and VitePress stay synchronized.

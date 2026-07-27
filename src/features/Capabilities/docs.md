# Capabilities

`Capabilities` owns the external feature API contract used by generated JavaScript. Every participating feature exports one `capabilities.ts` file containing its permission metadata and `builder`.

The metadata is the single source of truth for:

- permission controls;
- the API object added to the Sandbox environment;
- the API prompt inserted into model context;
- the VitePress API reference.

A feature has an `all` convenience grant plus explicit sub-capability ids. Builders receive sub-capability ids and return `[apiObject, apiPrompt]`. Runtime assembly exposes each object both as `environment.<featureId>` and under `environment.capabilities.<featureId>`.

Character-package grants override the default grant list feature by feature. An omitted feature inherits the default; an explicit empty list denies every API of that feature.

This is an application API permission boundary, not a claim that browser-side JavaScript is an operating-system security sandbox. New external APIs must be added to the owning feature definition, documented in its metadata, and consumed through the central registry so code, prompt, settings and VitePress stay synchronized.

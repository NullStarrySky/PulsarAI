# Interactive Document Resources

Interactive documents are UTF-8 SFC-like source files. Persisted `.imd` content remains readable and diffable while the domain compiler produces role-preserving AI SDK messages plus a Markdown diagnostic view.

## Source format

One document may contain multiple prompt templates:

```html
<prompt_template name="identity" role="system">
# {{ <@local:profile>.name }}

<@path:./rules.md>
</prompt_template>
```

`role` is `system`, `user`, or `assistant`. Templates retain normal Markdown, `{{...}}` expressions, `[[...]]` message splices, and explicit Plugin references.

Local values live under one data block:

```html
<data>
  <sub_data name="profile">
    <enable_updater>
      false
    </enable_updater>
    <description>
      Character profile used by the identity template.
    </description>
    <content type="json">
      { "name": "Alice" }
    </content>
  </sub_data>
</data>
```

`content` supports `json` or raw `value`. `enable_updater` is persisted for the future updater design but has no runtime behavior. `description` remains semantic documentation even while updater execution is absent.

## Compilation

`domain/interactive-document.ts` owns:

- parsing and normalized serialization;
- legacy block-JSON conversion;
- local JSON/value construction;
- explicit reference preprocessing;
- guarded `ref` access;
- Sandbox macro and message-splice expansion;
- role-preserving messages, Markdown output, dependency inventory, and diagnostics.

Local data is never injected under a bare name. It is available only through `<@local:name>`. External resolution is provided by the Plugin reference resolver, so the InteractiveDoc domain does not inspect plugin trees. `<@容器名称>` resolves a uniquely visible container; scoped container, path, and ID forms remain available when the target must be explicit.

## Workspace

`presentation/InteractiveDocumentWorkspacePage.vue` has three views:

- Edit presents each `prompt_template` in Milkdown with `<@...>` syntax highlighting and each `sub_data` in compact responsive fields. Typing `<@` opens reference completion for local data and currently visible Plugin containers; suggestions show their optional descriptions and insert a scoped container target when a short name would be ambiguous.
- Source edits the complete SFC text. Container declarations and namespaced container references belong to the owning plugin root `containers.xml`; resource memberships are Plugin file metadata and never appear in IMD source.
- Preview compiles the current source and renders each output message with its role and any parser/linker diagnostics.

The layout becomes a single-column data grid below 768px and keeps usable touch targets.

The workspace is registered for `resourceType: "interactive-doc"` and is reused by Plugin `.imd` files.

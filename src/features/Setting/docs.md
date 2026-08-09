# Setting

Setting owns the generic settings registry, dialog shell, and shared field layout. Feature-specific values and persistence remain in their owning Features.

## Registry

`application/setting-registry.ts` registers a flat ordered list of pages. Hotkey is the first default page. A page provides either one component or an ordered list of first-level functional tabs; tab IDs and page IDs are stable navigation identities, while titles are presentation text.

## Shell

`presentation/SettingsDialog.vue` owns search, flat navigation, the visible page title, optional Tabs, close action, and scrolling boundary. On desktop, the left header and content header drag the dialog through `interact.js` and may move beyond the current page. Below 768px, the shared responsive state changes the shell to a full-viewport dialog with a navigation drawer and disables dragging.

Page components use `SettingPage` as a content viewport and do not repeat the shell title or description. Specialized provider and data pages may keep their internal split layouts as long as they stay inside this viewport and provide a narrow-window fallback.

## Forms

`SettingForm` arranges fields with dividers. `SettingFormField` and `SettingItem` render field title and description beside the control, then stack them below 768px. `SettingGroup` may render a short section title and actions, but has no group description, card border, or independent surface.

Plugin `manifest.json` uses the same visual contract: Group entries become first-level Tabs, and their fields use borderless setting rows. Custom setting components retain their owning Feature behavior and persistence.

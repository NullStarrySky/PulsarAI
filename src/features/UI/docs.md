# UI

`UI` owns generic shell state and rendering rather than feature behavior.

`layout-store.ts` exposes `setTabStatus` and `setResourceTabStatus`. The top bar renders loading, success, warning and error states; Conversation uses the loading state during generation.

Composer tool placement is owned by `domain/composer-toolbar.ts` and the appearance store. The normalized layout has `left`, `right`, and `unused` arrays, contains every known tool exactly once, and provides default placement for newly introduced tools.

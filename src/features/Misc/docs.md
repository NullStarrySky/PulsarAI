# Misc

`Misc` owns small runtime capabilities that do not belong to a resource feature.

## Platform and responsive state

- `domain/platform.ts` wraps `@tauri-apps/plugin-os`. `isMobilePlatform()` reports Android or iOS by default and supports a session-only override for development preview.
- `application/responsive-store.ts` is the shared UI source for mobile layout. `isMobileLayout` becomes true when either the platform API reports mobile or the viewport is narrower than 768px.
- The store applies the `mobile-layout` root class. Components use the `mobile:` Tailwind variant declared in `src/styles/globals.css` instead of duplicating platform and viewport checks.

## Mobile preview command

`actions.ts` owns the temporary `misc.mobile-preview.toggle` command. Its default shortcut is `Ctrl+Shift+M`.

On desktop, enabling preview:

1. stores the current logical window size;
2. overrides the mobile platform result for the current session;
3. closes both workspace sidebars;
4. resizes and centers the window at 390 x 780 logical pixels.

Disabling preview clears the override and restores the previous desktop size. The Tauri window minimum is 320 x 480 so narrow-window behavior can also be tested manually.

## Android navigation bar

`application/mobile-navigation-bar.ts` wraps `tauri-plugin-m3` 0.3.2. The Rust plugin and `m3:default` capability are Android-only. Appearance defaults to `topbar`, which resolves the current actual top-bar light/dark mode and calls `M3.setBarColor`; `system`, `light`, and `dark` are also available. Desktop never imports the guest API and hides the setting.

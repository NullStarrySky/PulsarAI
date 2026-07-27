# Notification

`Notification` wraps delivery behind one `sendNotification` function. `channel` is `"external"` by default and uses the native notification plugin; `"internal"` redirects the request into the persistent Pulsar notification store.

The built-in notification center is registered as `builtin:notifications` and opened from the top section of the conversation left sidebar. It owns unread state, mark-read, deletion and clearing.

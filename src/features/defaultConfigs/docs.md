# Default Configs

`defaultConfigs` persists the global default Feature API grants alongside model defaults. The settings page renders the shared `CapabilityGrantEditor`; character packages without their own `capabilities` field inherit this map.

Default grants favor read-only and local helper APIs. Database writes/deletes, backup creation, UI mutation, child windows and conversation sending require explicit authorization.

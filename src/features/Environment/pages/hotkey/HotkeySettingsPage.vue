<script setup lang="ts">
import SettingGroup from "@/features/Environment/setting/SettingGroup.vue";
import SettingItem from "@/features/Environment/setting/SettingItem.vue";
import SettingPage from "@/features/Environment/setting/SettingPage.vue";
import { environmentHotkeyLabels, getDefaultHotkeys } from "../../defaults";
import { useEnvironmentStore } from "../../store";
import HotkeyRecorder from "./HotkeyRecorder.vue";

const environment = useEnvironmentStore();
const defaults = getDefaultHotkeys();
</script>

<template>
  <SettingPage title="快捷键" description="为固定的应用动作绑定快捷键。">
    <SettingGroup title="应用动作">
      <SettingItem v-for="(meta, key) in environmentHotkeyLabels" :key="key" :title="meta.title" :description="meta.description">
        <HotkeyRecorder
          :model-value="environment.hotkeys[key]"
          @update:model-value="environment.hotkeys[key] = $event"
          @reset="environment.hotkeys[key] = defaults[key]"
          @clear="environment.hotkeys[key] = ''"
        />
      </SettingItem>
    </SettingGroup>
  </SettingPage>
</template>

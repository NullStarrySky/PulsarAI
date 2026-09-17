<script setup lang="ts">
import SettingGroup from "@/features/Environment/setting/SettingGroup.vue";
import SettingItem from "@/features/Environment/setting/SettingItem.vue";
import SettingPage from "@/features/Environment/setting/SettingPage.vue";
import { createEnvironmentHotkeys } from "../../hotkeys";
import { useEnvironmentStore } from "../../store";
import HotkeyRecorder from "./HotkeyRecorder.vue";

const environment = useEnvironmentStore();
const defaults = createEnvironmentHotkeys();

function reset(id: string) {
	environment.hotkeys[id]!.keyBinding = defaults[id]!.keyBinding;
}
</script>

<template>
  <SettingPage title="快捷键" description="为固定的应用动作绑定快捷键。">
    <SettingGroup title="应用动作">
      <SettingItem v-for="([id, hotkey]) in Object.entries(environment.hotkeys)" :key="id" :title="hotkey.title" :description="hotkey.description">
        <HotkeyRecorder
          :model-value="hotkey.keyBinding"
          @update:model-value="hotkey.keyBinding = $event"
          @reset="reset(id)"
          @clear="hotkey.keyBinding = null"
        />
      </SettingItem>
    </SettingGroup>
  </SettingPage>
</template>

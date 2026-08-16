<script setup lang="ts">
import { computed } from "vue";
import SettingGroup from "@/features/Setting/components/SettingGroup.vue";
import SettingItem from "@/features/Setting/components/SettingItem.vue";
import SettingPage from "@/features/Setting/components/SettingPage.vue";
import { useCommandStore } from "./command-store";
import { useHotkeyStore } from "./hotkey-store";
import HotkeyRecorder from "./HotkeyRecorder.vue";

const commandStore = useCommandStore();
const hotkeyStore = useHotkeyStore();

const commandGroups = computed(() => {
  const groups = new Map<string, typeof commandStore.commands>();
  for (const command of commandStore.commands) {
    const items = groups.get(command.category) ?? [];
    items.push(command);
    groups.set(command.category, items);
  }
  return Array.from(groups.entries()).map(([name, commands]) => ({ name, commands }));
});
</script>

<template>
  <SettingPage title="快捷键" description="为常用命令绑定快捷键。">
    <SettingGroup v-for="group in commandGroups" :key="group.name" :title="group.name">
      <SettingItem
        v-for="command in group.commands"
        :key="command.id"
        :title="command.title"
        :description="command.description"
      >
        <HotkeyRecorder
          :model-value="hotkeyStore.getHotkey(command.id)"
          @update:model-value="hotkeyStore.setHotkey(command.id, $event)"
          @reset="hotkeyStore.resetHotkey(command.id)"
          @clear="hotkeyStore.clearHotkey(command.id)"
        />
      </SettingItem>
    </SettingGroup>
  </SettingPage>
</template>

import type { Component } from "vue";
import { computed, ref } from "vue";
import { defineStore } from "pinia";

export interface CommandDefinition {
  id: string;
  title: string;
  description?: string;
  category: string;
  defaultHotkey?: string;
  icon?: Component;
  closeOnRun?: boolean;
  run?: () => void | Promise<void>;
}

export const useCommandStore = defineStore("command", () => {
  const paletteOpen = ref(false);
  const paletteQuery = ref("");
  const commands = ref<CommandDefinition[]>([]);

  const commandById = computed(() => new Map(commands.value.map((command) => [command.id, command])));

  function registerCommand(command: CommandDefinition) {
    const index = commands.value.findIndex((item) => item.id === command.id);
    if (index >= 0) {
      commands.value[index] = { ...commands.value[index], ...command };
      return;
    }
    commands.value.push(command);
  }

  function registerCommands(nextCommands: CommandDefinition[]) {
    for (const command of nextCommands) {
      registerCommand(command);
    }
  }

  function openPalette(query = "") {
    paletteQuery.value = query;
    paletteOpen.value = true;
  }

  function closePalette() {
    paletteOpen.value = false;
    paletteQuery.value = "";
  }

  async function executeCommand(commandId: string) {
    const command = commandById.value.get(commandId);
    if (!command?.run) {
      return;
    }

    await command.run();
    if (command.closeOnRun !== false) {
      closePalette();
    }
  }

  return {
    paletteOpen,
    paletteQuery,
    commands,
    commandById,
    registerCommand,
    registerCommands,
    openPalette,
    closePalette,
    executeCommand,
  };
});

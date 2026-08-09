import { defineStore } from "pinia";

export const useLayoutStore = defineStore("layout", {
  state: () => ({
    settingsOpen: false,
    immersiveConversation: false,
  }),
  actions: {
    openSettings() {
      this.settingsOpen = true;
    },
    closeSettings() {
      this.settingsOpen = false;
    },
    setSettingsOpen(open: boolean) {
      this.settingsOpen = open;
    },
    setImmersiveConversation(enabled: boolean) {
      this.immersiveConversation = enabled;
    },
  },
});

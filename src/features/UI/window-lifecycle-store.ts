import { defineStore } from "pinia";
import { host } from "@/host";

export type WindowCloseBehavior = "ask" | "exit" | "tray";
export type WindowCloseChoice = Exclude<WindowCloseBehavior, "ask">;

const storageKey = "pulsarai:window-close-behavior:v1";

function readCloseBehavior(): WindowCloseBehavior {
  try {
    const value = localStorage.getItem(storageKey);
    return value === "exit" || value === "tray" ? value : "ask";
  } catch {
    return "ask";
  }
}

export const useWindowLifecycleStore = defineStore("window-lifecycle", {
  state: () => ({
    closeBehavior: readCloseBehavior() as WindowCloseBehavior,
    closePromptOpen: false,
    rememberCloseChoice: false,
  }),
  actions: {
    setCloseBehavior(value: WindowCloseBehavior) {
      this.closeBehavior = value;
      try {
        localStorage.setItem(storageKey, value);
      } catch {
        // The in-memory preference still applies for the current run.
      }
    },
    async handleCloseRequest() {
      if (this.closeBehavior === "ask") {
        this.rememberCloseChoice = false;
        this.closePromptOpen = true;
        return;
      }
      await this.applyCloseChoice(this.closeBehavior);
    },
    dismissClosePrompt() {
      this.closePromptOpen = false;
      this.rememberCloseChoice = false;
    },
    async chooseCloseBehavior(choice: WindowCloseChoice) {
      if (this.rememberCloseChoice) {
        this.setCloseBehavior(choice);
      }
      this.closePromptOpen = false;
      this.rememberCloseChoice = false;
      await this.applyCloseChoice(choice);
    },
    async applyCloseChoice(choice: WindowCloseChoice) {
      const appWindow = host.desktop?.window;
      if (!appWindow) return;
      if (choice === "tray") {
        await appWindow.hide();
        return;
      }
      await appWindow.close();
    },
  },
});

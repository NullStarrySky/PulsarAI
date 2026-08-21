import {
  Mic,
  Search,
  Settings,
  SquareMinus,
} from "lucide-vue-next";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCommandStore, type CommandDefinition } from "@/features/Hotkey/command-store";
import { toggleSttRecordingAction } from "@/features/STT/actions";
import { useLayoutStore } from "./layout-store";

let registered = false;

export function registerCoreCommands() {
  if (registered) {
    return;
  }
  registered = true;

  const commandStore = useCommandStore();
  commandStore.registerCommands(createCoreCommands());
}

function createCoreCommands(): CommandDefinition[] {
  return [
    {
      id: "ui.search.open",
      title: "搜索",
      description: "搜索命令、角色包和对话",
      category: "界面",
      defaultHotkey: "Ctrl+K",
      icon: Search,
      run: () => useCommandStore().openPalette(),
      closeOnRun: false,
    },
    {
      id: "ui.settings.open",
      title: "打开设置",
      category: "界面",
      defaultHotkey: "Ctrl+,",
      icon: Settings,
      run: () => useLayoutStore().openSettings(),
    },
    {
      id: "ui.window.minimize",
      title: "最小化窗口",
      category: "窗口",
      icon: SquareMinus,
      run: () => getCurrentWindow().minimize(),
    },
    {
      id: "stt.toggle-recording",
      title: "开启/关闭语音输入",
      category: "语音",
      defaultHotkey: "Alt+V",
      icon: Mic,
      run: toggleSttRecordingAction,
    },
  ];
}

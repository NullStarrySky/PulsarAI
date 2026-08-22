import {
  Mic,
  Search,
  Settings,
  SquareMinus,
  Trash2,
} from "lucide-vue-next";
import { host } from "@/host";
import { useCommandStore, type CommandDefinition } from "@/features/Hotkey/command-store";
import { resetCharacterDataAction } from "@/features/Conversation/actions";
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
    ...(host.desktop ? [{
      id: "ui.window.minimize",
      title: "最小化窗口",
      category: "窗口",
      icon: SquareMinus,
      run: () => host.desktop?.window.minimize(),
    }] : []),
    {
      id: "conversation.reset-character-data",
      title: "清空全部角色数据",
      description: "清空角色包、对话、插件和本地资源；设置、模型和密钥会保留。",
      category: "对话",
      defaultHotkey: "Ctrl+Shift+R",
      icon: Trash2,
      run: resetCharacterDataAction,
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

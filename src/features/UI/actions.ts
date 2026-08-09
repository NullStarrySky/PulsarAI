import {
  Copy,
  Pencil,
  RefreshCw,
  Search,
  Settings,
  SquareMinus,
  FilePlus2,
  Trash2,
} from "lucide-vue-next";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCommandStore, type CommandDefinition } from "@/features/Hotkey/application/command-store";
import {
  copyLastMessageAction,
  createConversationAction,
  editLastMessageAction,
  regenerateLastMessageAction,
  resetCharacterDataAction,
} from "@/features/Resources/Conversation/actions";
import { useLayoutStore } from "./application/layout-store";

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
      id: "conversation.create",
      title: "新建对话",
      category: "对话",
      defaultHotkey: "Ctrl+N",
      icon: FilePlus2,
      run: createConversationAction,
    },
    {
      id: "conversation.edit-last-message",
      title: "编辑最后一条消息",
      category: "对话",
      icon: Pencil,
      run: editLastMessageAction,
    },
    {
      id: "conversation.regenerate-last-message",
      title: "重生成最后一条消息",
      category: "对话",
      defaultHotkey: "Ctrl+Shift+G",
      icon: RefreshCw,
      run: regenerateLastMessageAction,
    },
    {
      id: "conversation.reset-character-data",
      title: "清空全部角色数据",
      description: "清空角色包、对话、插件和本地资源，然后恢复初始角色包",
      category: "对话",
      defaultHotkey: "Ctrl+Shift+R",
      icon: Trash2,
      run: resetCharacterDataAction,
    },
    {
      id: "conversation.copy-last-message",
      title: "复制最后一条消息",
      category: "对话",
      icon: Copy,
      run: copyLastMessageAction,
    },
  ];
}

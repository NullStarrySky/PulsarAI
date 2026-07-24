import {
  Copy,
  PanelLeft,
  PanelRight,
  Pencil,
  RefreshCw,
  Search,
  Settings,
  SquareMinus,
  FilePlus2,
  Rows3,
  X,
} from "lucide-vue-next";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCommandStore, type CommandDefinition } from "@/features/Hotkey/application/command-store";
import {
  copyLastMessageAction,
  createConversationAction,
  editLastMessageAction,
  regenerateLastMessageAction,
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
      id: "ui.sidebar.left.toggle",
      title: "切换左侧栏",
      category: "界面",
      defaultHotkey: "Ctrl+B",
      icon: PanelLeft,
      run: () => useLayoutStore().toggleLeftSidebar(),
    },
    {
      id: "ui.sidebar.right.toggle",
      title: "切换右侧栏",
      category: "界面",
      defaultHotkey: "Ctrl+Shift+B",
      icon: PanelRight,
      run: () => useLayoutStore().toggleRightSidebar(),
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
      id: "ui.tab.next",
      title: "下一个标签页",
      category: "标签页",
      defaultHotkey: "Ctrl+Tab",
      icon: Rows3,
      run: () => useLayoutStore().activateAdjacentTab(1),
    },
    {
      id: "ui.tab.previous",
      title: "上一个标签页",
      category: "标签页",
      defaultHotkey: "Ctrl+Shift+Tab",
      icon: Rows3,
      run: () => useLayoutStore().activateAdjacentTab(-1),
    },
    {
      id: "ui.tab.close-current",
      title: "关闭当前标签页",
      category: "标签页",
      defaultHotkey: "Ctrl+W",
      icon: X,
      run: () => useLayoutStore().closeActiveTab(),
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
      defaultHotkey: "Ctrl+R",
      icon: RefreshCw,
      run: regenerateLastMessageAction,
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

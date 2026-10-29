<script setup lang="ts">
import { ref } from "vue";
import {
  GlideCollapsibleButtonGroup,
  GlideFileTree,
  GlideSelect,
  GlideTabs,
  type GlideCollapsibleButtonItem,
  type GlideFileTreeNode,
} from "@/components/common/glide";
import { Slider } from "@/components/common/Slider";
import {
  SettingCardGroup,
  SettingCardItem,
} from "@/components/common/settings";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/fluid";
import SettingsSidebar from "@/features/Environment/setting/SettingsSidebar.vue";
import { useEnvironmentStore } from "@/features/Environment/store";
import {
  Brain,
  FileCode2,
  Folder,
  Info,
  Keyboard,
  Languages,
  Palette,
  Settings,
  Sparkles,
  Zap,
} from "@/lib/remix-icons";

defineProps<{ sidebarWidth?: number }>();
const environment = useEnvironmentStore();

// ─── 1. 折叠按钮组 (GlideCollapsibleButtonGroup) 测试状态 ─────────────────────
const isGroupOpen = ref(true);
const activeTab = ref("appearance");
const groupExpandDirection = ref<"right" | "down">("right");
const groupMenuDirection = ref<"bottom" | "top">("bottom");

// 从真实设置页面元数据中提取的配置项
const settingNavItems: GlideCollapsibleButtonItem[] = [
  {
    value: "general",
    label: "通用偏好",
    icon: Settings,
    description: "配置应用全局启动行为、系统语言与本地数据持久化选项。",
    tag: "Core",
  },
  {
    value: "appearance",
    label: "外观与主题",
    icon: Palette,
    description: "自定义界面强调色、背景壁纸高斯模糊及流体物理动画参数。",
    tag: "UI",
  },
  {
    value: "models",
    label: "模型与提供商",
    icon: Brain,
    description: "配置各大 LLM 提供商密钥、端点代理与默认上下文窗口大小。",
    tag: "AI SDK",
  },
  {
    value: "hotkeys",
    label: "快捷键绑定",
    icon: Keyboard,
    description: "定制全局唤醒、快速发送、面板折叠与智能体中断指令热键。",
    tag: "Keys",
  },
  {
    value: "translation",
    label: "多语言翻译",
    icon: Languages,
    description: "配置双语实时对照服务商、反向代理与离线词库设定。",
  },
  {
    value: "about",
    label: "关于与环境",
    icon: Info,
    description: "查看当前 PulsarAI 版本状态、宿主进程运行环境与系统自检。",
  },
];

// ─── 2. 卡片模式设置示例绑定的交互状态 ──────────────────────────────────────
const autoCheckUpdate = ref(true);
const autoSaveDraft = ref(true);
const codeActSandbox = ref(true);
const defaultModelVal = ref("claude-3-7-sonnet");
const defaultModelOptions = [
  { value: "claude-3-7-sonnet", label: "Claude 3.7 Sonnet (推荐)" },
  { value: "gpt-4o", label: "GPT-4o (通用大模型)" },
  { value: "deepseek-r1", label: "DeepSeek R1 (深度推理)" },
];
const zoomScale = ref(100);
const blurStrength = ref(24);
const themeMode = ref("system");
const themeOptions = [
  { value: "system", label: "跟随系统 (Auto)" },
  { value: "dark", label: "深色模式 (Dark)" },
  { value: "light", label: "浅色模式 (Light)" },
];

// ─── 3. 文件树 (GlideFileTree) 测试状态 ──────────────────────────────────────
const selectedFileId = ref("glide-tabs-vue");
const expandedFolderIds = ref<string[]>(["src", "components", "features", "plugin"]);
const selectedFileNode = ref<GlideFileTreeNode | null>(null);

const sampleFileTreeNodes: GlideFileTreeNode[] = [
  {
    id: "src",
    name: "src",
    type: "folder",
    children: [
      {
        id: "components",
        name: "components",
        type: "folder",
        children: [
          {
            id: "button-vue",
            name: "Button.vue",
            type: "file",
            gitStatus: "modified",
            tag: "UI",
          },
          {
            id: "dialog-vue",
            name: "Dialog.vue",
            type: "file",
            badge: "new",
          },
          {
            id: "glide-tabs-vue",
            name: "GlideTabs.vue",
            type: "file",
            gitStatus: "untracked",
            tag: "Glide",
          },
          {
            id: "glide-file-tree-vue",
            name: "GlideFileTree.vue",
            type: "file",
            gitStatus: "untracked",
            tag: "Glide",
          },
        ],
      },
      {
        id: "features",
        name: "features",
        type: "folder",
        children: [
          {
            id: "plugin",
            name: "Plugin",
            type: "folder",
            children: [
              {
                id: "plugin-ts",
                name: "plugin.ts",
                type: "file",
              },
              {
                id: "manifest-json",
                name: "manifest.json",
                type: "file",
                gitStatus: "modified",
              },
            ],
          },
          {
            id: "conversation",
            name: "Conversation",
            type: "folder",
            children: [
              {
                id: "conversation-ts",
                name: "conversation.ts",
                type: "file",
              },
            ],
          },
        ],
      },
      {
        id: "app-vue",
        name: "App.vue",
        type: "file",
      },
      {
        id: "main-ts",
        name: "main.ts",
        type: "file",
      },
    ],
  },
  {
    id: "package-json",
    name: "package.json",
    type: "file",
    tag: "config",
  },
  {
    id: "readme-md",
    name: "README.md",
    type: "file",
    gitStatus: "deleted",
  },
  {
    id: "tsconfig-json",
    name: "tsconfig.json",
    type: "file",
  },
];

const expandAllFolders = () => {
  const ids: string[] = [];
  const walk = (nodes: GlideFileTreeNode[]) => {
    for (const n of nodes) {
      if (n.type === "folder") {
        ids.push(n.id);
        if (n.children) walk(n.children);
      }
    }
  };
  walk(sampleFileTreeNodes);
  expandedFolderIds.value = ids;
};

const collapseAllFolders = () => {
  expandedFolderIds.value = [];
};

const onFileSelect = (node: GlideFileTreeNode) => {
  selectedFileNode.value = node;
};
</script>

<template>
  <div
    class="flex size-full overflow-hidden"
    :class="environment.glassEnabled ? 'bg-transparent' : 'bg-background'"
  >
    <!-- Left Sidebar: Settings Navigation (if sidebarWidth provided) -->
    <div
      v-if="sidebarWidth"
      class="h-full max-w-full shrink-0 overflow-hidden border-r border-border/60"
      :class="environment.glassEnabled ? 'bg-sidebar/35 backdrop-blur-md' : 'bg-sidebar'"
      :style="{ width: `${sidebarWidth}px` }"
    >
      <SettingsSidebar class="h-full" />
    </div>

    <!-- Main Content Area -->
    <div class="flex min-w-0 flex-1 flex-col h-full overflow-hidden bg-background">
      <!-- Header -->
      <header class="flex shrink-0 items-center justify-between px-6 py-4 border-b border-border/60 bg-muted/20">
        <div>
          <div class="flex items-center gap-2.5">
            <h2 class="text-lg font-bold text-foreground/95">
              Glide 卡片模式设置与折叠导航组件测试台
            </h2>
            <span class="text-[11px] font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
              CollapsibleButtonGroup + DirectionalTabs + SettingCard
            </span>
          </div>
          <p class="text-xs text-muted-foreground mt-0.5">
            测试折叠圆形图标按钮组、带左右滑动过渡的 GlideTabs，以及全新的卡片化设置 Item/Group 组件。
          </p>
        </div>

        <!-- 快速测试控制条 -->
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-1.5 text-xs bg-muted/60 p-1 rounded-lg border border-border/50">
            <span class="text-muted-foreground text-[11px] px-1 font-medium">展开方向:</span>
            <button
              type="button"
              class="px-2 py-0.5 rounded text-xs transition-colors"
              :class="groupExpandDirection === 'right' ? 'bg-background text-foreground shadow-xs font-semibold' : 'text-muted-foreground hover:text-foreground'"
              @click="groupExpandDirection = 'right'"
            >
              向右 (right)
            </button>
            <button
              type="button"
              class="px-2 py-0.5 rounded text-xs transition-colors"
              :class="groupExpandDirection === 'down' ? 'bg-background text-foreground shadow-xs font-semibold' : 'text-muted-foreground hover:text-foreground'"
              @click="groupExpandDirection = 'down'"
            >
              向下 (down)
            </button>
          </div>

          <div class="flex items-center gap-1.5 text-xs bg-muted/60 p-1 rounded-lg border border-border/50">
            <span class="text-muted-foreground text-[11px] px-1 font-medium">悬停菜单:</span>
            <button
              type="button"
              class="px-2 py-0.5 rounded text-xs transition-colors"
              :class="groupMenuDirection === 'bottom' ? 'bg-background text-foreground shadow-xs font-semibold' : 'text-muted-foreground hover:text-foreground'"
              @click="groupMenuDirection = 'bottom'"
            >
              下方 (bottom)
            </button>
            <button
              type="button"
              class="px-2 py-0.5 rounded text-xs transition-colors"
              :class="groupMenuDirection === 'top' ? 'bg-background text-foreground shadow-xs font-semibold' : 'text-muted-foreground hover:text-foreground'"
              @click="groupMenuDirection = 'top'"
            >
              上方 (top)
            </button>
          </div>
        </div>
      </header>

      <!-- Scrollable Showcase Area -->
      <div class="flex-1 overflow-hidden">
        <ScrollArea class="h-full">
          <div class="p-8 max-w-5xl mx-auto space-y-8">
            <!-- ─── 模块一：折叠按钮组演示 ─── -->
            <div class="rounded-2xl border border-border/80 bg-card p-6 shadow-sm space-y-4">
              <div class="flex items-center justify-between">
                <div>
                  <h3 class="text-base font-bold text-foreground flex items-center gap-2">
                    <Sparkles class="size-4.5 text-primary" />
                    1. GlideCollapsibleButtonGroup (折叠按钮组)
                  </h3>
                  <p class="text-xs text-muted-foreground mt-0.5">
                    初始为普通的圆形 icon 按钮。点击触发平滑展开并过渡到折叠 (X) 图标；按钮组支持 Tabs 切换，悬停时由单例外壳平移展开预览菜单。
                  </p>
                </div>

                <div class="text-xs font-mono text-muted-foreground">
                  当前选中 Tab: <b class="text-primary font-bold">{{ activeTab }}</b>
                </div>
              </div>

              <!-- 承载容器 -->
              <div class="p-6 rounded-xl border border-border/50 bg-muted/20 flex flex-col items-center justify-center min-h-[140px] gap-4">
                <GlideCollapsibleButtonGroup
                  v-model="activeTab"
                  v-model:open="isGroupOpen"
                  :items="settingNavItems"
                  :expand-direction="groupExpandDirection"
                  :menu-direction="groupMenuDirection"
                  :size="40"
                  :gap="6"
                  :menu-width="240"
                />

                <span class="text-[11px] text-muted-foreground/80 mt-1">
                  （点击最左侧按钮展开/收起；在展开的选项上移动光标查看悬停菜单平移动效）
                </span>
              </div>
            </div>

            <!-- ─── 模块二：带方向感应过渡的 GlideTabs + 卡片模式设置综合示例 ─── -->
            <div class="rounded-2xl border border-border/80 bg-card p-6 shadow-sm space-y-6">
              <div class="flex items-center justify-between">
                <div>
                  <h3 class="text-base font-bold text-foreground flex items-center gap-2">
                    <Zap class="size-4.5 text-amber-500" />
                    2. 综合示例：扩展 GlideTabs + 卡片模式设置 (SettingCardItem / SettingCardGroup)
                  </h3>
                  <p class="text-xs text-muted-foreground mt-0.5">
                    Tabs 切换时，内容自动根据前后索引进行<b>左右方向滑动过渡</b>；内容区使用全新的 <code>SettingCardGroup</code> 与 <code>SettingCardItem</code> 组合实现。
                  </p>
                </div>
              </div>

              <!-- 扩展 GlideTabs：不仅渲染 Tab 条，同时绑定并左右过渡各 Tab 视图 -->
              <GlideTabs
                v-model="activeTab"
                :items="settingNavItems"
                class="w-full"
              >
                <!-- 通用偏好内容卡片 -->
                <template #general>
                  <div class="space-y-6 py-2">
                    <SettingCardGroup
                      title="系统与启动行为"
                      description="管理应用冷启动流程与在线资源同步策略。"
                    >
                      <SettingCardItem
                        title="启动时自动检查更新"
                        description="检测并提醒 PulsarAI 核心框架及活跃插件的最新版本。"
                      >
                        <template #right>
                          <Switch v-model="autoCheckUpdate" />
                        </template>
                      </SettingCardItem>

                      <SettingCardItem
                        title="会话草稿自动暂存"
                        description="每当输入框内容发生变更时，自动写回至本地安全沙箱存储。"
                      >
                        <template #right>
                          <Switch v-model="autoSaveDraft" />
                        </template>
                      </SettingCardItem>

                      <SettingCardItem
                        title="默认主力模型"
                        description="创建新对话时默认选取的 AI 智能体推理核心。"
                      >
                        <template #right>
                          <GlideSelect
                            v-model="defaultModelVal"
                            :options="defaultModelOptions"
                            size="sm"
                            :menu-width="220"
                          />
                        </template>
                        <template #bottom>
                          <span class="text-[11px] text-muted-foreground">
                            提示：各角色插件仍可在 <code>generation/model</code> 中覆盖此选项。
                          </span>
                        </template>
                      </SettingCardItem>
                    </SettingCardGroup>

                    <SettingCardGroup
                      title="安全与执行沙箱"
                      description="配置 CodeAct 沙箱与受限 JavaScript 运行上下文。"
                    >
                      <SettingCardItem
                        title="启用 CodeAct 安全沙箱"
                        description="代码执行仅在内存隔离环境中运行，防止访问未授权的文件系统或网络。"
                      >
                        <template #right>
                          <Switch v-model="codeActSandbox" />
                        </template>
                        <template #bottom>
                          <span class="text-amber-500 font-medium">
                            ⚠ 沙箱关闭时，智能体执行命令将受原生权限管辖。
                          </span>
                        </template>
                      </SettingCardItem>
                    </SettingCardGroup>
                  </div>
                </template>

                <!-- 外观设置内容卡片 -->
                <template #appearance>
                  <div class="space-y-6 py-2">
                    <SettingCardGroup
                      title="显示与主题风格"
                      description="定制应用的视觉外观、主题色彩与视口缩放比例。"
                    >
                      <SettingCardItem
                        title="色彩模式"
                        description="选择应用程序的主色彩体系与明暗基准。"
                      >
                        <template #right>
                          <GlideSelect
                            v-model="themeMode"
                            :options="themeOptions"
                            size="sm"
                            :menu-width="180"
                          />
                        </template>
                      </SettingCardItem>

                      <SettingCardItem
                        title="界面排版缩放比例"
                        description="调整整体文字与按钮排版的基础分辨率倍率。"
                      >
                        <template #right>
                          <span class="text-xs font-mono font-bold text-primary">{{ zoomScale }}%</span>
                        </template>
                        <template #content>
                          <Slider
                            v-model="zoomScale"
                            :min="75"
                            :max="150"
                            label="缩放倍率"
                            :format-value="(v: number) => `${v}%`"
                          />
                        </template>
                        <template #bottom>
                          <span>默认基准为 100%，适合 2K/4K 高清视网膜屏幕显示。</span>
                        </template>
                      </SettingCardItem>

                      <SettingCardItem
                        title="窗口背景高斯模糊强度"
                        description="调整玻璃拟态模糊特效在半透明侧边栏上的渲染半径。"
                      >
                        <template #right>
                          <span class="text-xs font-mono font-bold text-primary">{{ blurStrength }}px</span>
                        </template>
                        <template #content>
                          <Slider
                            v-model="blurStrength"
                            :min="0"
                            :max="64"
                            label="模糊半径"
                            :format-value="(v: number) => `${v}px`"
                          />
                        </template>
                      </SettingCardItem>
                    </SettingCardGroup>
                  </div>
                </template>

                <!-- 模型提供商卡片 (示例) -->
                <template #models>
                  <div class="space-y-6 py-2">
                    <SettingCardGroup
                      title="AI SDK 模型连接与密钥"
                      description="管理连接到各大模型平台（Anthropic、OpenAI、DeepSeek、Google）的 API 凭据。"
                    >
                      <SettingCardItem
                        title="Anthropic Claude API"
                        description="接入 Claude 3.7 Sonnet / Haiku 思考推理链路。"
                      >
                        <template #right>
                          <button
                            type="button"
                            class="px-2.5 py-1 text-xs font-medium rounded-lg border border-border bg-muted/40 hover:bg-muted text-foreground transition-colors"
                          >
                            配置密钥与端点
                          </button>
                        </template>
                        <template #bottom>
                          <span class="text-emerald-500 font-medium">● 已连接并通过连通性校验 (延时: 120ms)</span>
                        </template>
                      </SettingCardItem>

                      <SettingCardItem
                        title="DeepSeek R1 / V3"
                        description="深度强化学习推理模型，高性价比数学与编程引擎。"
                      >
                        <template #right>
                          <button
                            type="button"
                            class="px-2.5 py-1 text-xs font-medium rounded-lg border border-border bg-muted/40 hover:bg-muted text-foreground transition-colors"
                          >
                            配置密钥与端点
                          </button>
                        </template>
                        <template #bottom>
                          <span class="text-emerald-500 font-medium">● 已连接 (官方 API 端点)</span>
                        </template>
                      </SettingCardItem>
                    </SettingCardGroup>
                  </div>
                </template>

                <!-- 其他占位卡片 -->
                <template #hotkeys>
                  <div class="py-12 text-center text-muted-foreground text-xs space-y-2">
                    <Keyboard class="size-8 mx-auto text-primary/60" />
                    <div>快捷键设置卡片组（占位）</div>
                  </div>
                </template>

                <template #translation>
                  <div class="py-12 text-center text-muted-foreground text-xs space-y-2">
                    <Languages class="size-8 mx-auto text-primary/60" />
                    <div>多语言翻译设置卡片组（占位）</div>
                  </div>
                </template>

                <template #about>
                  <div class="py-12 text-center text-muted-foreground text-xs space-y-2">
                    <Info class="size-8 mx-auto text-primary/60" />
                    <div>关于 PulsarAI 运行环境卡片组（占位）</div>
                  </div>
                </template>
              </GlideTabs>
            </div>

            <!-- ─── 模块三：Glide 文件树演示 (对齐 components/files 交互与样式) ─── -->
            <div class="rounded-2xl border border-border/80 bg-card p-6 shadow-sm space-y-4">
              <div class="flex items-center justify-between">
                <div>
                  <h3 class="text-base font-bold text-foreground flex items-center gap-2">
                    <FileCode2 class="size-4.5 text-sky-500" />
                    3. GlideFileTree (文件树组件)
                  </h3>
                  <p class="text-xs text-muted-foreground mt-0.5">
                    参考 <code>components/files</code> 的交互与层级样式（树枝参考线、展开/折叠折角、文件类型彩色图标与 Git 变更状态 U/M/D），基于通用 Glide 滑块单例实现平滑移动悬停/选中高亮。
                  </p>
                </div>

                <!-- 展开/折叠控制 -->
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    class="px-2.5 py-1 text-xs font-medium rounded-lg border border-border bg-muted/40 hover:bg-muted text-foreground transition-colors"
                    @click="expandAllFolders"
                  >
                    全部展开
                  </button>
                  <button
                    type="button"
                    class="px-2.5 py-1 text-xs font-medium rounded-lg border border-border bg-muted/40 hover:bg-muted text-foreground transition-colors"
                    @click="collapseAllFolders"
                  >
                    全部收起
                  </button>
                </div>
              </div>

              <!-- 树组件与详情预览面板 -->
              <div class="grid grid-cols-1 md:grid-cols-12 gap-4">
                <!-- 左侧文件树容器 -->
                <div class="md:col-span-6 h-[340px] rounded-xl border border-border/60 bg-muted/15 overflow-hidden flex flex-col">
                  <div class="px-3 py-2 border-b border-border/50 bg-muted/30 flex items-center justify-between">
                    <span class="text-xs font-semibold text-foreground/80 flex items-center gap-1.5">
                      <Folder class="size-3.5 text-primary" />
                      项目资源文件树
                    </span>
                    <span class="text-[10px] font-mono text-muted-foreground">
                      展开数: {{ expandedFolderIds.length }}
                    </span>
                  </div>

                  <div class="flex-1 overflow-hidden">
                    <GlideFileTree
                      v-model="selectedFileId"
                      v-model:expanded="expandedFolderIds"
                      :nodes="sampleFileTreeNodes"
                      :row-height="34"
                      class="h-full"
                      @select="onFileSelect"
                    />
                  </div>
                </div>

                <!-- 右侧选中项信息与实时遥测 -->
                <div class="md:col-span-6 h-[340px] rounded-xl border border-border/60 bg-muted/15 p-4 flex flex-col justify-between">
                  <div class="space-y-3">
                    <div class="text-xs font-bold text-foreground flex items-center gap-2">
                      <Sparkles class="size-3.5 text-amber-500" />
                      选中节点实时遥测
                    </div>

                    <div class="space-y-2 text-xs">
                      <div class="flex items-center justify-between p-2 rounded-lg bg-card/60 border border-border/40">
                        <span class="text-muted-foreground">当前绑定 ID:</span>
                        <code class="font-mono text-primary font-bold">{{ selectedFileId }}</code>
                      </div>

                      <div class="flex items-center justify-between p-2 rounded-lg bg-card/60 border border-border/40">
                        <span class="text-muted-foreground">节点名称:</span>
                        <span class="font-medium text-foreground">{{ selectedFileNode?.name ?? selectedFileId }}</span>
                      </div>

                      <div class="flex items-center justify-between p-2 rounded-lg bg-card/60 border border-border/40">
                        <span class="text-muted-foreground">节点类型:</span>
                        <span class="font-mono text-[11px] px-1.5 py-0.5 rounded bg-muted">
                          {{ selectedFileNode?.type ?? 'file' }}
                        </span>
                      </div>

                      <div
                        v-if="selectedFileNode?.gitStatus"
                        class="flex items-center justify-between p-2 rounded-lg bg-card/60 border border-border/40"
                      >
                        <span class="text-muted-foreground">Git 变更状态:</span>
                        <span
                          class="font-mono font-bold text-xs"
                          :class="{
                            'text-emerald-500': selectedFileNode.gitStatus === 'untracked',
                            'text-amber-500': selectedFileNode.gitStatus === 'modified',
                            'text-rose-500': selectedFileNode.gitStatus === 'deleted'
                          }"
                        >
                          {{ selectedFileNode.gitStatus.toUpperCase() }}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div class="p-3 rounded-lg bg-primary/5 border border-primary/20 text-[11px] text-muted-foreground space-y-1">
                    <div class="font-semibold text-primary">动效与设计亮点：</div>
                    <div>• 目录展开/折叠时，树枝纵向引导线与平滑旋转箭头同步动效。</div>
                    <div>• 跨层级移动鼠标时，高亮滑块通过 GPU translate3d 进行平滑移动变形。</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  </div>
</template>

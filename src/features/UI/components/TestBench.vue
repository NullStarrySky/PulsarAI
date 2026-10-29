<script setup lang="ts">
import { ref } from "vue";
import {
  GlideFileTree,
  type GlideFileTreeNode,
} from "@/components/common/glide";
import SettingsSidebar from "@/features/Environment/setting/SettingsSidebar.vue";
import { useEnvironmentStore } from "@/features/Environment/store";
import {
  FileCode2,
  Folder,
  Sparkles,
} from "@/lib/remix-icons";

defineProps<{ sidebarWidth?: number }>();
const environment = useEnvironmentStore();

// ─── 文件树 (GlideFileTree) 测试状态 ──────────────────────────────────────────
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
            size: "2.1 KB",
            content: `<template>
  <button
    :class="cn('inline-flex items-center justify-center rounded-lg font-medium transition-colors')"
    :disabled="disabled"
  >
    <slot />
  </button>
</template>

<script setup lang="ts">
import { cn } from "@/lib/utils";
defineProps<{ disabled?: boolean }>();
<\/script>`,
          },
          {
            id: "dialog-vue",
            name: "Dialog.vue",
            type: "file",
            size: "3.4 KB",
            content: `<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs">
    <div class="rounded-xl border bg-card p-6 shadow-2xl">
      <slot />
    </div>
  </div>
</template>`,
          },
          {
            id: "glide-tabs-vue",
            name: "GlideTabs.vue",
            type: "file",
            size: "4.8 KB",
            content: `<template>
  <div class="glide-tabs-root w-full flex flex-col">
    <GlideList
      :options="items"
      :model-value="activeVal"
      orientation="horizontal"
      highlight-mode="both"
      @select="handleSelect"
    />
  </div>
</template>

<script setup lang="ts">
import GlideList from './GlideList.vue';
<\/script>`,
          },
          {
            id: "glide-file-tree-vue",
            name: "GlideFileTree.vue",
            type: "file",
            size: "8.6 KB",
            content: `// PulsarAI GlideFileTree Component
// 支持缩进对齐的高亮滑块移动与悬停联动小窗口预览`,
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
                size: "1.8 KB",
                content: `export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  globalPlugins?: string[];
}`,
              },
              {
                id: "manifest-json",
                name: "manifest.json",
                type: "file",
                size: "0.8 KB",
                content: `{
  "id": "builtin-agent",
  "name": "Built-in Agent",
  "version": "1.0.0",
  "entry": "./plugin.ts"
}`,
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
                size: "2.4 KB",
                content: `export interface ConversationEntity {
  id: string;
  title: string;
  localPluginId: string;
  createdAt: number;
}`,
              },
            ],
          },
        ],
      },
      {
        id: "app-vue",
        name: "App.vue",
        type: "file",
        size: "3.2 KB",
        content: `<template>
  <div id="app" class="size-full overflow-hidden">
    <AppContainer />
  </div>
</template>`,
      },
      {
        id: "main-ts",
        name: "main.ts",
        type: "file",
        size: "1.2 KB",
        content: `import { createApp } from 'vue';
import App from './App.vue';
import './assets/main.css';

createApp(App).mount('#app');`,
      },
    ],
  },
  {
    id: "package-json",
    name: "package.json",
    type: "file",
    size: "1.5 KB",
    content: `{
  "name": "pulsar-ai",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "desktop:dev": "vite",
    "build": "vue-tsc && vite build"
  }
}`,
  },
  {
    id: "readme-md",
    name: "README.md",
    type: "file",
    size: "0.9 KB",
    content: `# PulsarAI

Next-generation AI desktop workspace.
Built with Vue 3, AI SDK, and Tauri/Electron.`,
  },
  {
    id: "tsconfig-json",
    name: "tsconfig.json",
    type: "file",
    size: "0.6 KB",
    content: `{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true
  }
}`,
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

const findNode = (list: GlideFileTreeNode[], id: string): GlideFileTreeNode | null => {
  for (const item of list) {
    if (item.id === id) return item;
    if (item.children) {
      const f = findNode(item.children, id);
      if (f) return f;
    }
  }
  return null;
};

// 初始默认选中项
selectedFileNode.value = findNode(sampleFileTreeNodes, selectedFileId.value);

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
            <h2 class="text-lg font-bold text-foreground/95 flex items-center gap-2">
              <FileCode2 class="size-5 text-sky-500" />
              GlideFileTree (文件树悬停联动预览测试台)
            </h2>
            <span class="text-[11px] font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
              Hover-Activated • Top-Left Aligned
            </span>
          </div>
          <p class="text-xs text-muted-foreground mt-0.5">
            仅在鼠标悬停时右侧即时弹出文件/文件夹预览小窗口，左上角与当前悬停项严格对齐；文件夹支持子项轮播与 &lt;1/x&gt; 滚轮切换；离开即自动隐藏。
          </p>
        </div>

        <!-- 快速展开/折叠控制 -->
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="px-2.5 py-1 text-xs font-medium rounded-lg border border-border bg-muted/40 hover:bg-muted text-foreground transition-colors cursor-pointer"
            @click="expandAllFolders"
          >
            全部展开
          </button>
          <button
            type="button"
            class="px-2.5 py-1 text-xs font-medium rounded-lg border border-border bg-muted/40 hover:bg-muted text-foreground transition-colors cursor-pointer"
            @click="collapseAllFolders"
          >
            全部收起
          </button>
        </div>
      </header>

      <!-- Content Area -->
      <div class="flex-1 overflow-auto p-6">
        <div class="max-w-5xl mx-auto space-y-6">
          <!-- 文件树主交互演示卡片 -->
          <div class="rounded-2xl border border-border/80 bg-card p-6 shadow-sm space-y-4">
            <div class="flex items-center justify-between pb-2 border-b border-border/50">
              <div class="flex items-center gap-2">
                <Folder class="size-4 text-primary" />
                <span class="text-sm font-bold text-foreground">项目资源目录</span>
                <span class="text-[11px] font-mono text-muted-foreground ml-1">
                  (将鼠标悬停在任意文件或文件夹上，查看右侧对齐浮窗预览)
                </span>
              </div>
              <span class="text-[10px] font-mono text-muted-foreground">
                已展开文件夹: {{ expandedFolderIds.length }} 个
              </span>
            </div>

            <!-- 
              文件树与右侧对齐预览容器：
              设置 overflow-visible，让右侧弹出的悬停预览浮窗平滑扩展
            -->
            <div class="relative flex items-start gap-4 min-h-[480px] p-2 overflow-visible">
              <!-- 左侧固定宽度文件树 -->
              <div class="w-[340px] h-[480px] shrink-0 rounded-xl border border-border/60 bg-muted/15 relative overflow-visible flex flex-col">
                <GlideFileTree
                  v-model="selectedFileId"
                  v-model:expanded="expandedFolderIds"
                  :nodes="sampleFileTreeNodes"
                  :row-height="34"
                  :preview="true"
                  :preview-width="350"
                  :preview-height="360"
                  class="h-full"
                  @select="onFileSelect"
                />
              </div>

              <!-- 右侧辅助说明卡片 (当无鼠标悬停时静默展示引导说明) -->
              <div class="flex-1 h-[480px] rounded-xl border border-dashed border-border/60 bg-muted/5 p-6 flex flex-col justify-between">
                <div class="space-y-4">
                  <div class="flex items-center gap-2 text-xs font-bold text-foreground">
                    <Sparkles class="size-4 text-amber-500" />
                    当前选中项状态遥测
                  </div>

                  <div class="space-y-2 text-xs">
                    <div class="flex items-center justify-between p-2 rounded-lg bg-card/60 border border-border/40">
                      <span class="text-muted-foreground">选中节点 ID:</span>
                      <code class="font-mono text-primary font-bold">{{ selectedFileId }}</code>
                    </div>

                    <div class="flex items-center justify-between p-2 rounded-lg bg-card/60 border border-border/40">
                      <span class="text-muted-foreground">名称:</span>
                      <span class="font-medium text-foreground">{{ selectedFileNode?.name ?? selectedFileId }}</span>
                    </div>

                    <div class="flex items-center justify-between p-2 rounded-lg bg-card/60 border border-border/40">
                      <span class="text-muted-foreground">类型:</span>
                      <span class="font-mono text-[11px] px-1.5 py-0.5 rounded bg-muted">
                        {{ selectedFileNode?.type ?? 'file' }}
                      </span>
                    </div>
                  </div>
                </div>

                <div class="p-3.5 rounded-lg bg-primary/5 border border-primary/20 text-xs text-muted-foreground space-y-1.5 leading-relaxed">
                  <div class="font-semibold text-primary">交互与效果说明：</div>
                  <div>• <strong>仅悬停触发</strong>：鼠标悬停在文件或文件夹行上时，右侧立即浮出预览窗口；鼠标移开即刻消失。</div>
                  <div>• <strong>严格对齐</strong>：预览窗口的左上角与当前悬停行的顶部和右侧严格锚定，随鼠标上下切换平滑滑行。</div>
                  <div>• <strong>文件夹滚轮轮播</strong>：悬停于文件夹时，底部提供 <code class="font-mono">&lt; 1 / x &gt;</code> 等宽数字分页器，通过鼠标滚轮即可连续浏览子文件内容。</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

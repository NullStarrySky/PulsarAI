<script setup lang="ts">
import { computed, ref, watch, type HTMLAttributes } from 'vue';
import {
  Folder,
  FolderOpen,
  File,
  FileText,
  Code,
  Braces,
  Sparkles,
  Palette,
  Inbox
} from '@/lib/remix-icons';
import GlideRollingNumber from './GlideRollingNumber.vue';
import type { GlideFileTreeNode } from './types';

export interface GlideFileTreePreviewProps {
  /** 当前待预览的文件或文件夹节点 */
  node: GlideFileTreeNode | null;
  /** 是否打开预览窗口 (v-model:open) */
  open?: boolean;
  /** 默认打开状态 */
  defaultOpen?: boolean;
  /** 窗口宽度 (px)，默认 320px */
  width?: number;
  /** 窗口高度 (px)，默认 340px */
  height?: number;
  /** 是否以悬浮浮窗形式展示 (true) 还是内嵌平铺 (false) */
  floating?: boolean;
  /** 类名 */
  class?: HTMLAttributes['class'];
  className?: string;
}

const props = withDefaults(defineProps<GlideFileTreePreviewProps>(), {
  node: null,
  open: undefined,
  defaultOpen: true,
  width: 330,
  height: 340,
  floating: true,
  class: undefined,
  className: ''
});

const emit = defineEmits<{
  'update:open': [open: boolean];
}>();

// 内部显隐受控状态
const internalOpen = ref(props.defaultOpen);
const isControlled = computed(() => props.open !== undefined);
const isOpen = computed(() => (isControlled.value ? Boolean(props.open) : internalOpen.value));

const isFolder = computed(() => props.node?.type === 'folder');

// ─── 文件夹预览：子项轮播与分页 ──────────────────────────────────────────────
const folderChildren = computed<GlideFileTreeNode[]>(() => {
  if (!props.node || props.node.type !== 'folder') return [];
  return props.node.children ?? [];
});

const totalCount = computed(() => folderChildren.value.length);
const currentChildIndex = ref(1);

// 当被预览的文件夹节点变更时，重置分页到第 1 项
watch(
  () => props.node?.id,
  () => {
    currentChildIndex.value = 1;
  }
);

// 当前正在展示的子级节点
const currentChildNode = computed<GlideFileTreeNode | null>(() => {
  if (!isFolder.value || totalCount.value === 0) return null;
  const idx = Math.max(0, Math.min(totalCount.value - 1, currentChildIndex.value - 1));
  return folderChildren.value[idx] ?? null;
});

// 在整个窗口上响应鼠标滚轮，无缝切换子文件预览
const handleWheel = (e: WheelEvent) => {
  if (!isFolder.value || totalCount.value <= 1) return;
  if (e.deltaY > 0) {
    if (currentChildIndex.value < totalCount.value) {
      currentChildIndex.value++;
    }
  } else if (e.deltaY < 0) {
    if (currentChildIndex.value > 1) {
      currentChildIndex.value--;
    }
  }
};

// ─── 文件类型图标与代码高亮解析 ─────────────────────────────────────────────
const resolveFileIcon = (name: string) => {
  if (name.endsWith('.vue')) return { icon: Sparkles, color: 'text-emerald-500', lang: 'vue' };
  if (name.endsWith('.ts') || name.endsWith('.tsx') || name.endsWith('.js')) {
    return { icon: Code, color: 'text-sky-500', lang: 'typescript' };
  }
  if (name.endsWith('.json')) return { icon: Braces, color: 'text-amber-500', lang: 'json' };
  if (name.endsWith('.md')) return { icon: FileText, color: 'text-blue-400', lang: 'markdown' };
  if (name.endsWith('.css') || name.endsWith('.scss')) {
    return { icon: Palette, color: 'text-purple-400', lang: 'css' };
  }
  return { icon: File, color: 'text-muted-foreground', lang: 'text' };
};

// 当前活动渲染的文件节点（文件模式下为 props.node，文件夹模式下为 currentChildNode）
const activeDisplayFile = computed<GlideFileTreeNode | null>(() => {
  if (!props.node) return null;
  if (isFolder.value) {
    return currentChildNode.value;
  }
  return props.node;
});

const isDisplayingFolder = computed(() => activeDisplayFile.value?.type === 'folder');

const activeIconInfo = computed(() => {
  if (!activeDisplayFile.value) return { icon: File, color: 'text-muted-foreground', lang: 'text' };
  if (isDisplayingFolder.value) {
    return { icon: Folder, color: 'text-primary', lang: 'folder' };
  }
  return resolveFileIcon(activeDisplayFile.value.name);
});

// 生成/解析文件内容预览行
const displayLines = computed<string[]>(() => {
  const file = activeDisplayFile.value;
  if (!file) return ['(无文件内容)'];

  if (file.content) {
    return file.content.split('\n');
  }

  // 根据文件名生成逼真的预览代码
  const name = file.name;
  if (name.endsWith('.vue')) {
    return [
      '<template>',
      '  <div class="relative size-full p-4">',
      `    <h2 class="text-lg font-bold">${name.replace('.vue', '')}</h2>`,
      '    <p class="text-xs text-muted-foreground">Reactive PulsarAI component</p>',
      '  </div>',
      '</template>',
      '',
      '<script setup lang="ts">',
      'import { ref } from "vue";',
      'const count = ref(0);',
      '<\/script>'
    ];
  }
  if (name.endsWith('.ts') || name.endsWith('.tsx')) {
    return [
      '// PulsarAI TypeScript Module',
      'export interface NodePayload {',
      `  id: string; // ${file.id}`,
      `  name: string; // ${file.name}`,
      '  timestamp: number;',
      '}',
      '',
      'export function setupPipeline() {',
      '  return { ready: true, status: "healthy" };',
      '}'
    ];
  }
  if (name.endsWith('.json')) {
    return [
      '{',
      `  "name": "${name.replace('.json', '')}",`,
      '  "version": "1.0.0",',
      '  "type": "module",',
      '  "dependencies": {',
      '    "vue": "^3.5.0",',
      '    "reka-ui": "^2.0.0"',
      '  }',
      '}'
    ];
  }
  if (name.endsWith('.md')) {
    return [
      `# ${name.replace('.md', '')}`,
      '',
      '> PulsarAI Documentation and specifications.',
      '',
      '- **State**: Reactive local store',
      '- **Transitions**: GPU accelerated translate3d',
      '- **Theme**: Monospace & dynamic contrast'
    ];
  }

  return [
    `// File: ${name}`,
    `// ID: ${file.id}`,
    '// Status: OK',
    'console.log("Ready.");'
  ];
});
</script>

<template>
  <Transition name="glide-preview-pop">
    <div
      v-if="isOpen && node"
      class="glide-file-tree-preview select-none flex flex-col rounded-xl border border-border/80 bg-popover/95 backdrop-blur-md shadow-xl text-popover-foreground overflow-hidden"
      :class="[
        floating ? 'absolute right-2 top-2 z-40' : 'relative',
        className,
        props.class
      ]"
      :style="{
        width: `${width}px`,
        maxHeight: `${height}px`,
        height: `${height}px`
      }"
      @wheel.prevent="handleWheel"
    >
      <!-- 预览窗口顶部导航栏 -->
      <div class="flex shrink-0 items-center justify-between px-3.5 py-2.5 border-b border-border/50 bg-muted/30">
        <div class="flex items-center gap-2 min-w-0">
          <!-- 文件夹状态 or 文件图标 -->
          <component
            :is="activeIconInfo.icon"
            class="size-4 shrink-0"
            :class="activeIconInfo.color"
          />

          <div class="flex flex-col min-w-0">
            <span class="text-xs font-semibold text-foreground truncate leading-normal py-0.5">
              {{ isFolder ? `${node.name} / ${activeDisplayFile?.name ?? ''}` : node.name }}
            </span>
            <span class="text-[10px] text-muted-foreground truncate leading-normal">
              {{ isFolder ? `文件夹预览 (${totalCount} 项)` : '文件内容预览' }}
            </span>
          </div>
        </div>
      </div>

      <!-- 预览主体区 -->
      <div class="flex-1 min-h-0 overflow-hidden relative flex flex-col bg-muted/10">
        <!-- 场景 A：当前子项是一个子文件夹 -->
        <template v-if="isDisplayingFolder && activeDisplayFile">
          <div class="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-3">
            <div class="p-3 rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-xs">
              <FolderOpen class="size-8" />
            </div>
            <div>
              <div class="text-sm font-bold text-foreground">
                {{ activeDisplayFile.name }}
              </div>
              <div class="text-[11px] text-muted-foreground mt-0.5">
                子级文件夹 · 包含 {{ activeDisplayFile.children?.length ?? 0 }} 个资源
              </div>
            </div>

            <!-- 子文件缩略标签 -->
            <div
              v-if="activeDisplayFile.children && activeDisplayFile.children.length > 0"
              class="w-full max-w-[220px] rounded-lg bg-card/60 border border-border/40 p-2 text-start text-[11px] space-y-1"
            >
              <div
                v-for="sub in activeDisplayFile.children.slice(0, 3)"
                :key="sub.id"
                class="flex items-center gap-1.5 text-muted-foreground truncate"
              >
                <span class="size-1.5 rounded-full bg-primary/60 shrink-0" />
                <span class="truncate">{{ sub.name }}</span>
              </div>
              <div
                v-if="activeDisplayFile.children.length > 3"
                class="text-[10px] text-muted-foreground/60 pl-3"
              >
                + 其余 {{ activeDisplayFile.children.length - 3 }} 项...
              </div>
            </div>
          </div>
        </template>

        <!-- 场景 B：渲染文件代码与文本行内容 -->
        <template v-else-if="activeDisplayFile">
          <div class="size-full overflow-y-auto overflow-x-hidden p-3 font-mono text-[11px] leading-relaxed">
            <table class="w-full table-fixed border-collapse">
              <tbody>
                <tr
                  v-for="(line, idx) in displayLines"
                  :key="idx"
                  class="hover:bg-muted/30 transition-colors group"
                >
                  <!-- 行号 (等宽) -->
                  <td class="select-none text-right pr-3 pl-1 text-[10px] text-muted-foreground/40 group-hover:text-muted-foreground/70 w-8 align-top tabular-nums shrink-0">
                    {{ idx + 1 }}
                  </td>
                  <!-- 代码内容 (自动换行，避免超出宽度不可见) -->
                  <td class="text-foreground/90 whitespace-pre-wrap break-all [overflow-wrap:anywhere] font-mono align-top">
                    {{ line || ' ' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>

        <!-- 场景 C：文件夹无子项提示 -->
        <template v-else>
          <div class="size-full flex flex-col items-center justify-center p-6 text-center text-xs text-muted-foreground">
            <Inbox class="size-8 mx-auto text-muted-foreground/40 mb-2" />
            <span>此文件夹为空，无任何子项。</span>
          </div>
        </template>
      </div>

      <!-- 预览窗口底部状态栏 -->
      <div class="shrink-0 flex items-center justify-between px-3 py-2 border-t border-border/50 bg-muted/25 text-[11px]">
        <!-- 左侧文件行数/元信息 -->
        <div class="flex items-center gap-2 text-muted-foreground font-mono text-[10px]">
          <span v-if="!isDisplayingFolder">
            {{ displayLines.length }} 行 · {{ activeDisplayFile?.size || '1.4 KB' }}
          </span>
          <span v-else>
            文件夹节点
          </span>
        </div>

        <!-- 
          右侧文件夹专属分页控制器：
          使用我们抽象的带滚轮过渡和等宽滚轴数字组件 GlideRollingNumber！
          底部带有 < 1 / x >，可以通过滚轮切换！
        -->
        <template v-if="isFolder && totalCount > 0">
          <div class="flex items-center gap-1.5" title="使用鼠标滚轮或点击切换子文件预览">
            <GlideRollingNumber
              v-model="currentChildIndex"
              :total="totalCount"
              :min="1"
              :max="totalCount"
              class="bg-background/80"
            />
          </div>
        </template>

        <template v-else>
          <span class="text-[10px] text-muted-foreground/60 font-mono">
            {{ activeIconInfo.lang }}
          </span>
        </template>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* 预览浮窗进入/退出淡入缩放 */
.glide-preview-pop-enter-active,
.glide-preview-pop-leave-active {
  transition: opacity 160ms ease, transform 180ms cubic-bezier(0.16, 1, 0.3, 1);
}
.glide-preview-pop-enter-from,
.glide-preview-pop-leave-to {
  opacity: 0;
  transform: translateX(12px) scale(0.96);
}
</style>

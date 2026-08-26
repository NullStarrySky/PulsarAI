<script setup lang="ts">
import { computed, ref } from "vue";
import { Check, FileCode2, Import, Monitor, Moon, Sun, Type } from "lucide-vue-next";
import { push } from "notivue";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import SettingForm from "@/features/Setting/components/SettingForm.vue";
import SettingFormField from "@/features/Setting/components/SettingFormField.vue";
import SettingPage from "@/features/Setting/components/SettingPage.vue";
import { useAppearanceStore } from "@/features/UI/theme/appearance-store";
import { isAndroidPlatform } from "@/features/Misc/platform";

const appearance = useAppearanceStore();
const themeFileInput = ref<HTMLInputElement | null>(null);
const themeImportOpen = ref(false);
const themeCss = ref("");
const themeFileName = ref("");
const fontName = ref("");
const fontFamily = ref("");
const showMobileNavigationBar = isAndroidPlatform();

const activeAccent = computed(() => appearance.activeTheme.accent);
const fontSizeValue = computed({
  get: () => [appearance.fontSize],
  set: (value: number[]) => {
    appearance.fontSize = value[0] ?? appearance.fontSize;
  },
});
const uiScaleValue = computed({
  get: () => [appearance.uiScale],
  set: (value: number[]) => {
    appearance.uiScale = value[0] ?? appearance.uiScale;
  },
});
const editorFontSizeValue = computed({
  get: () => [appearance.editorFontSize],
  set: (value: number[]) => {
    appearance.editorFontSize = value[0] ?? appearance.editorFontSize;
  },
});
const editorLineHeightValue = computed({
  get: () => [appearance.editorLineHeight],
  set: (value: number[]) => {
    appearance.editorLineHeight = value[0] ?? appearance.editorLineHeight;
  },
});
const themeModeOptions = [
  { id: "light", label: "浅色", icon: Sun },
  { id: "dark", label: "深色", icon: Moon },
  { id: "system", label: "系统", icon: Monitor },
] as const;

function themeDescription(themeId: string) {
  if (appearance.customThemes.some((theme) => theme.id === themeId)) return "导入的自定义配色";
  return "内置配色方案";
}

function openThemeImport() {
  themeCss.value = "";
  themeFileName.value = "";
  themeImportOpen.value = true;
}

async function readThemeCss(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) {
    return;
  }
  themeCss.value = await file.text();
  themeFileName.value = file.name;
  (event.target as HTMLInputElement).value = "";
}

function importTheme() {
  if (!themeCss.value.trim()) return;
  try {
    const theme = appearance.importThemeCss(themeCss.value);
    push.success(`已导入主题：${theme.name}`);
    themeImportOpen.value = false;
  } catch (error) {
    push.error(error instanceof Error ? error.message : "主题导入失败");
  }
}

function importFont() {
  const name = fontName.value.trim();
  const family = fontFamily.value.trim();
  if (!name || !family) {
    return;
  }
  appearance.importFont(name, family);
  fontName.value = "";
  fontFamily.value = "";
}
</script>

<template>
  <SettingPage title="主题" description="调整主题、字体和界面显示比例。">
    <section class="flex flex-col gap-3">
      <h3 class="text-sm font-semibold">外观模式</h3>
      <ToggleGroup v-model="appearance.themeMode" type="single" variant="outline" :spacing="1" class="rounded-full bg-muted/55 p-1">
        <ToggleGroupItem
          v-for="option in themeModeOptions"
          :key="option.id"
          :value="option.id"
          class="h-9 rounded-full border-0 px-4 data-[state=on]:bg-background data-[state=on]:shadow-sm"
        >
          <component :is="option.icon" data-icon="inline-start" />
          {{ option.label }}
        </ToggleGroupItem>
      </ToggleGroup>
    </section>

    <section class="flex flex-col gap-3">
      <div class="flex items-center justify-between gap-4">
        <h3 class="text-sm font-semibold">颜色主题</h3>
        <Button variant="ghost" size="sm" class="rounded-full" @click="openThemeImport">
          <Import data-icon="inline-start" />
          导入主题
        </Button>
      </div>
      <div class="grid grid-cols-3 gap-2 mobile:grid-cols-1">
        <button
          v-for="theme in appearance.themes"
          :key="theme.id"
          type="button"
          class="group flex min-w-0 items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-muted/65"
          :class="appearance.themeId === theme.id && 'bg-muted text-foreground shadow-sm'"
          @click="appearance.themeId = theme.id"
        >
          <span class="size-9 shrink-0 rounded-full ring-1 ring-border/70" :style="{ backgroundColor: theme.accent }" />
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-medium">{{ theme.name }}</span>
            <span class="mt-0.5 block truncate text-xs text-muted-foreground">{{ themeDescription(theme.id) }}</span>
          </span>
          <Check v-if="appearance.themeId === theme.id" class="size-4 shrink-0" />
        </button>
      </div>
    </section>

    <section class="flex flex-col gap-3">
      <div class="flex items-center gap-2">
        <span class="size-3 rounded-full" :style="{ backgroundColor: activeAccent }" />
        <h3 class="text-sm font-semibold">自定义</h3>
      </div>
      <SettingForm>

      <SettingFormField
        title="自定义 CSS"
        description="在主题样式之后应用到整个应用。内容会实时生效并保存在本机；错误的选择器可能影响界面可用性。"
      >
        <template #bottom>
          <Textarea
            v-model="appearance.customCss"
            class="min-h-48 resize-y font-mono text-xs leading-5"
            placeholder="/* 例如：调整工作区圆角 */&#10;.workspace-panel { border-radius: 12px; }"
            spellcheck="false"
          />
        </template>
      </SettingFormField>

      <SettingFormField title="字体" description="选择字体方案。">
        <Select v-model="appearance.fontId">
          <SelectTrigger class="ml-auto w-40"><SelectValue placeholder="选择字体" /></SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem v-for="font in appearance.fonts" :key="font.id" :value="font.id">
                {{ font.name }}
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </SettingFormField>

      <SettingFormField title="导入字体" description="填写字体名称和 CSS font-family 值。">
        <div class="ml-auto grid w-full max-w-xl grid-cols-[1fr_1fr_auto] gap-2">
          <Input v-model="fontName" class="h-9" placeholder="名称" />
          <Input v-model="fontFamily" class="h-9" placeholder="字体族" />
          <Button variant="outline" size="icon" title="导入字体" @click="importFont">
            <Type class="size-4" />
          </Button>
        </div>
      </SettingFormField>

      <SettingFormField title="字体大小">
        <div class="ml-auto grid w-full max-w-xl grid-cols-[minmax(0,1fr)_3rem] items-center gap-3">
          <Slider v-model="fontSizeValue" :min="12" :max="22" :step="1" />
          <span class="text-right text-sm text-muted-foreground">{{ appearance.fontSize }}px</span>
        </div>
      </SettingFormField>

      <SettingFormField title="界面缩放">
        <div class="ml-auto grid w-full max-w-xl grid-cols-[minmax(0,1fr)_3rem] items-center gap-3">
          <Slider v-model="uiScaleValue" :min="80" :max="140" :step="5" />
          <span class="text-right text-sm text-muted-foreground">{{ appearance.uiScale }}%</span>
        </div>
      </SettingFormField>

      <SettingFormField title="编辑器段落字号" description="Milkdown 编辑器与消息渲染段落 (.milkdown .ProseMirror p) 的字体大小。">
        <div class="ml-auto grid w-full max-w-xl grid-cols-[minmax(0,1fr)_5rem] items-center gap-3">
          <Slider v-model="editorFontSizeValue" :min="10" :max="40" :step="1" />
          <div class="flex items-center gap-1">
            <Input
              v-model.number="appearance.editorFontSize"
              type="number"
              min="10"
              max="40"
              class="h-8 w-14 px-1.5 text-center text-xs font-mono"
            />
            <span class="text-xs text-muted-foreground">px</span>
          </div>
        </div>
      </SettingFormField>

      <SettingFormField title="编辑器段落行高" description="Milkdown 编辑器与消息渲染段落 (.milkdown .ProseMirror p) 的行高。">
        <div class="ml-auto grid w-full max-w-xl grid-cols-[minmax(0,1fr)_5rem] items-center gap-3">
          <Slider v-model="editorLineHeightValue" :min="10" :max="60" :step="1" />
          <div class="flex items-center gap-1">
            <Input
              v-model.number="appearance.editorLineHeight"
              type="number"
              min="10"
              max="60"
              class="h-8 w-14 px-1.5 text-center text-xs font-mono"
            />
            <span class="text-xs text-muted-foreground">px</span>
          </div>
        </div>
      </SettingFormField>

      <SettingFormField
        title="交互式代码预览"
        description="将消息中包含 HTML 或脚本的代码块放入隔离页面运行。最新消息会优先显示预览，仍可随时切回源码。"
      >
        <Switch
          v-model="appearance.interactiveCodePreview"
          aria-label="启用交互式代码预览"
        />
      </SettingFormField>

      <SettingFormField
        title="Agent 加载动画"
        description="Agent 正在思考或调用工具时，过程栏使用的像素加载样式。"
      >
        <Select v-model="appearance.agentLoadingStyle">
          <SelectTrigger class="ml-auto w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="drive">Drive</SelectItem>
            <SelectItem value="dots">Dots</SelectItem>
            <SelectItem value="orbit">Orbit</SelectItem>
          </SelectContent>
        </Select>
      </SettingFormField>

      <SettingFormField
        title="Zen 包裹边框"
        description="为应用整体包裹一层沉浸式边框。关闭后应用视图无缝充满窗口。"
      >
        <Switch
          v-model="appearance.zenFrameEnabled"
          aria-label="启用 Zen 包裹边框"
        />
      </SettingFormField>

      <SettingFormField
        v-if="appearance.zenFrameEnabled"
        title="Zen 边框颜色"
        description="应用整体包裹边框与顶栏基础底色。默认基于颜色主题自动推断，也可自定义指定。"
      >
        <div class="ml-auto flex items-center gap-2">
          <Select v-model="appearance.frameColorMode">
            <SelectTrigger class="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">自动推断</SelectItem>
              <SelectItem value="custom">自定义</SelectItem>
            </SelectContent>
          </Select>
          <div v-if="appearance.frameColorMode === 'custom'" class="flex items-center gap-1.5">
            <input
              v-model="appearance.frameCustomColor"
              type="color"
              class="size-8 cursor-pointer rounded-lg border border-border bg-transparent p-0.5"
            />
            <Input
              v-model="appearance.frameCustomColor"
              class="h-8 w-24 text-xs font-mono"
              placeholder="#1e1e24"
            />
          </div>
        </div>
      </SettingFormField>

      <SettingFormField
        v-if="showMobileNavigationBar"
        title="系统导航栏颜色"
        description="仅 Android。默认跟随 Pulsar 顶栏的实际明暗模式。"
      >
        <Select v-model="appearance.mobileNavigationBarMode">
          <SelectTrigger class="ml-auto w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="topbar">跟随顶栏</SelectItem>
            <SelectItem value="system">跟随系统</SelectItem>
            <SelectItem value="light">浅色</SelectItem>
            <SelectItem value="dark">深色</SelectItem>
          </SelectContent>
        </Select>
      </SettingFormField>
      </SettingForm>
    </section>

    <Dialog v-model:open="themeImportOpen">
      <DialogContent class="flex h-[min(52rem,88vh)] max-h-[88vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl mobile:h-[100dvh] mobile:max-h-none mobile:w-screen mobile:rounded-none mobile:border-0">
        <DialogHeader class="shrink-0 border-b px-5 pb-4 pt-5 mobile:pr-14">
          <DialogTitle>导入 CSS 主题</DialogTitle>
          <DialogDescription>
            读取 CSS 文件或直接粘贴内容。确认前可以检查和修改源码。
          </DialogDescription>
        </DialogHeader>

        <ScrollArea class="min-h-0 flex-1">
          <div class="grid gap-3 px-5 py-4">
            <div class="flex min-w-0 items-center gap-2">
              <Button variant="outline" @click="themeFileInput?.click()">
                <FileCode2 class="size-4" />
                读取 CSS 文件
              </Button>
              <span class="min-w-0 truncate text-xs leading-5 text-muted-foreground">
                {{ themeFileName || "也可以直接在下方粘贴 CSS" }}
              </span>
              <input
                ref="themeFileInput"
                type="file"
                accept=".css,text/css"
                class="hidden"
                @change="readThemeCss"
              />
            </div>
            <Textarea
              v-model="themeCss"
              class="min-h-[32rem] resize-y font-mono text-xs leading-5 mobile:min-h-[65dvh]"
              placeholder="粘贴主题 CSS，或点击上方按钮读取文件……"
              spellcheck="false"
            />
          </div>
        </ScrollArea>

        <DialogFooter class="shrink-0 border-t bg-background px-5 py-4">
          <Button variant="outline" @click="themeImportOpen = false">取消</Button>
          <Button :disabled="!themeCss.trim()" @click="importTheme">导入并应用</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </SettingPage>
</template>

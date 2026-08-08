<script setup lang="ts">
import { computed, ref } from "vue";
import { FileCode2, Import, Monitor, Moon, Sun, Type } from "lucide-vue-next";
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
import SettingForm from "@/features/Setting/presentation/SettingForm.vue";
import SettingFormField from "@/features/Setting/presentation/SettingFormField.vue";
import SettingPage from "@/features/Setting/presentation/SettingPage.vue";
import { useAppearanceStore } from "@/features/UI/theme/application/appearance-store";
import { isAndroidPlatform } from "@/features/Misc/domain/platform";

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
const themeModeOptions = [
  { id: "light", label: "浅色", icon: Sun },
  { id: "dark", label: "深色", icon: Moon },
  { id: "system", label: "系统", icon: Monitor },
] as const;

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
  <SettingPage title="外观" description="调整主题、字体和界面显示比例。">
    <SettingForm>
      <SettingFormField title="主题" description="选择内置主题，或导入 tweakcn 风格的 CSS 主题文件。">
        <div class="ml-auto flex items-center gap-2">
          <span class="size-4 shrink-0 rounded-full border" :style="{ backgroundColor: activeAccent }" />
          <Select v-model="appearance.themeId">
            <SelectTrigger class="w-40"><SelectValue placeholder="选择主题" /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem v-for="theme in appearance.themes" :key="theme.id" :value="theme.id">
                  {{ theme.name }}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" title="导入主题" @click="openThemeImport">
            <Import class="size-4" />
          </Button>
        </div>
      </SettingFormField>

      <SettingFormField title="显示模式" description="固定浅色、深色，或跟随系统。">
        <div class="ml-auto grid w-full max-w-md grid-cols-3 gap-1 rounded-md bg-muted p-1">
          <Button
            v-for="option in themeModeOptions"
            :key="option.id"
            :variant="appearance.themeMode === option.id ? 'secondary' : 'ghost'"
            class="h-8"
            @click="appearance.themeMode = option.id"
          >
            <component :is="option.icon" class="size-4" />
            {{ option.label }}
          </Button>
        </div>
      </SettingFormField>

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

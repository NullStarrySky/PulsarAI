<script setup lang="ts">
import { computed, ref } from "vue";
import { Import, Monitor, Moon, Sun, Type } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import SettingForm from "@/features/Setting/presentation/SettingForm.vue";
import SettingFormField from "@/features/Setting/presentation/SettingFormField.vue";
import SettingPage from "@/features/Setting/presentation/SettingPage.vue";
import { useAppearanceStore } from "@/features/UI/theme/application/appearance-store";
import ComposerToolbarLayoutEditor from "@/features/UI/presentation/ComposerToolbarLayoutEditor.vue";
import { isAndroidPlatform } from "@/features/Misc/domain/platform";

const appearance = useAppearanceStore();
const themeFileInput = ref<HTMLInputElement | null>(null);
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

async function importTheme(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) {
    return;
  }
  await appearance.importThemeFile(file);
  (event.target as HTMLInputElement).value = "";
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
          <Button variant="outline" size="icon" title="导入主题" @click="themeFileInput?.click()">
            <Import class="size-4" />
          </Button>
          <input ref="themeFileInput" type="file" accept=".css,text/css" class="hidden" @change="importTheme" />
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
        title="会话输入框工具栏"
        description="拖拽调整左右顺序，或拖入“未使用”隐藏。预览区域不能输入，点击也不会触发工具。"
      >
        <ComposerToolbarLayoutEditor
          :model-value="appearance.composerToolbar"
          @update:model-value="appearance.setComposerToolbar"
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
  </SettingPage>
</template>

<script setup lang="ts">
import { ref } from "vue";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Switch,
} from "@/components/fluid";
import type { WindowCloseBehavior } from "@/features/Environment/defaults";
import { useEnvironmentStore } from "@/features/Environment/store";
import SettingGroup from "../../setting/SettingGroup.vue";
import SettingItem from "../../setting/SettingItem.vue";
import SettingPage from "../../setting/SettingPage.vue";

const compactMode = ref(false);
const enableAnimations = ref(true);
const store = useEnvironmentStore();
const appearance = store.appearance;

function setCloseBehavior(value: unknown) {
	if (value === "ask" || value === "exit" || value === "tray") {
		store.setCloseBehavior(value satisfies WindowCloseBehavior);
	}
}
</script>

<template>
  <SettingPage title="通用设置" description="管理 Pulsar 的基础界面行为。">
    <SettingGroup title="界面">
      <SettingItem title="紧凑模式" description="降低侧栏和列表密度，适合更小窗口。">
        <Switch v-model="compactMode" />
      </SettingItem>
      <SettingItem title="启用动画" description="侧栏、弹窗和交互反馈默认保留平滑过渡。">
        <Switch v-model="enableAnimations" />
      </SettingItem>
      <SettingItem
        title="Enter 发送消息"
        description="开启时 Enter 发送、Shift+Enter 换行；关闭后交换两者的行为。"
      >
        <Switch v-model="appearance.composerSendWithEnter" />
      </SettingItem>
    </SettingGroup>

    <SettingGroup title="启动与关闭">
      <SettingItem
        title="关闭主窗口时"
        description="决定点击关闭按钮后是询问、直接退出，还是继续在系统托盘运行。"
      >
        <Select
          :model-value="store.closeBehavior"
          @update:model-value="setCloseBehavior"
        >
          <SelectTrigger class="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ask">每次询问</SelectItem>
            <SelectItem value="exit">直接退出</SelectItem>
            <SelectItem value="tray">最小化到托盘</SelectItem>
          </SelectContent>
        </Select>
      </SettingItem>
    </SettingGroup>
  </SettingPage>
</template>

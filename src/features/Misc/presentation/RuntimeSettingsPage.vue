<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { push } from "notivue";
import { Button } from "@/components/ui/button";
import SettingGroup from "@/features/Setting/presentation/SettingGroup.vue";
import SettingItem from "@/features/Setting/presentation/SettingItem.vue";
import SettingPage from "@/features/Setting/presentation/SettingPage.vue";
import SettingSwitch from "@/features/Setting/presentation/SettingSwitch.vue";
import { isAndroidPlatform } from "../domain/platform";
import {
  getAndroidBatteryOptimizationStatus,
  openAndroidBatteryOptimizationSettings,
  requestAndroidBatteryOptimizationExemption,
  type AndroidBatteryOptimizationStatus,
} from "../application/android-battery-optimization";
import { ensureNotificationPermission } from "../application/reply-completion-notifier";
import { useRuntimePreferenceStore } from "../application/runtime-preference-store";

const runtime = useRuntimePreferenceStore();
const batteryStatus = ref<AndroidBatteryOptimizationStatus | null>(null);
const checkingBattery = ref(false);
const android = computed(() => isAndroidPlatform());

onMounted(() => {
  void refreshBatteryStatus();
});

async function refreshBatteryStatus() {
  if (!android.value) {
    return;
  }

  checkingBattery.value = true;
  try {
    batteryStatus.value = await getAndroidBatteryOptimizationStatus();
  } finally {
    checkingBattery.value = false;
  }
}

async function requestBatteryExemption() {
  await requestAndroidBatteryOptimizationExemption();
  await refreshBatteryStatus();
}

async function requestNotificationPermission() {
  push.success((await ensureNotificationPermission()) ? "通知权限已可用" : "通知权限未授予");
}
</script>

<template>
  <SettingPage title="运行时" description="管理通知、声音和移动端后台运行能力。">
    <SettingGroup title="回复完成">
      <SettingItem title="播放声音" description="回复完成后播放一声简短提示音。">
        <SettingSwitch v-model="runtime.playSoundOnReplyComplete" />
      </SettingItem>
      <SettingItem title="发送通知" description="回复完成后发送系统通知。">
        <div class="flex items-center gap-2">
          <Button variant="outline" size="sm" @click="requestNotificationPermission">授权</Button>
          <SettingSwitch v-model="runtime.notifyOnReplyComplete" />
        </div>
      </SettingItem>
      <SettingItem title="仅在后台触发" description="应用不在前台时才播放声音或发送通知。">
        <SettingSwitch v-model="runtime.replyCompletionOnlyWhenBackground" />
      </SettingItem>
    </SettingGroup>

    <SettingGroup v-if="android" title="Android 电源控制">
      <SettingItem
        title="电池优化状态"
        :description="batteryStatus?.isOptimized ? '当前可能受到 Doze 和电池优化限制。' : '当前未检测到电池优化限制。'"
      >
        <Button variant="outline" size="sm" :disabled="checkingBattery" @click="refreshBatteryStatus">
          检查
        </Button>
      </SettingItem>
      <SettingItem title="请求后台无限制" description="打开系统弹窗，请求允许 Pulsar 不受电池优化限制。">
        <Button size="sm" @click="requestBatteryExemption">请求允许</Button>
      </SettingItem>
      <SettingItem title="系统电池设置" description="打开 Android 系统电池优化设置页，手动调整应用权限。">
        <Button variant="outline" size="sm" @click="openAndroidBatteryOptimizationSettings">打开设置</Button>
      </SettingItem>
    </SettingGroup>
  </SettingPage>
</template>

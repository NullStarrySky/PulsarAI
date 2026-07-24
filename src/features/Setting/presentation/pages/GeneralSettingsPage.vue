<script setup lang="ts">
import { ref } from "vue";
import SettingGroup from "../SettingGroup.vue";
import SettingItem from "../SettingItem.vue";
import SettingPage from "../SettingPage.vue";
import SettingSwitch from "../SettingSwitch.vue";

const compactMode = ref(false);
const enableAnimations = ref(true);
</script>

<template>
  <SettingPage title="通用设置" description="管理 Pulsar 的基础界面行为。">
    <SettingGroup title="界面">
      <SettingItem title="紧凑模式" description="降低侧栏和列表密度，适合更小窗口。">
        <SettingSwitch v-model="compactMode" />
      </SettingItem>
      <SettingItem title="启用动画" description="侧栏、弹窗和交互反馈默认保留平滑过渡。">
        <SettingSwitch v-model="enableAnimations" />
      </SettingItem>
    </SettingGroup>
  </SettingPage>
</template>

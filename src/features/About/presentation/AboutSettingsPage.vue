<script setup lang="ts">
import { ref } from "vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import SettingForm from "@/features/Setting/presentation/SettingForm.vue";
import SettingFormField from "@/features/Setting/presentation/SettingFormField.vue";
import SettingPage from "@/features/Setting/presentation/SettingPage.vue";

const version = "0.1.0";
const projectAddress = "";
const updateStatus = ref("");

const techStack = [
  "Tauri 2",
  "Vue 3",
  "TypeScript",
  "Bun",
  "Vite",
  "Pinia",
  "Tailwind CSS v4",
  "shadcn-vue",
  "AI SDK",
  "Milkdown/Crepe",
  "SurrealDB",
];

function checkForUpdates() {
  updateStatus.value = "暂未配置更新源";
}
</script>

<template>
  <SettingPage title="关于 Pulsar" description="应用信息、技术栈和版本记录。">
    <SettingForm>
      <SettingFormField title="版本" :description="updateStatus || `当前版本 ${version}`">
        <Button size="sm" variant="outline" @click="checkForUpdates">检查更新</Button>
      </SettingFormField>

      <SettingFormField title="开源协议" description="PulsarAI 的开源许可。">
        <Badge variant="outline">AGPL-3.0</Badge>
      </SettingFormField>

      <SettingFormField title="项目地址" description="GitHub 发布后在这里补全。">
        <span class="block truncate text-sm text-muted-foreground">{{ projectAddress || "暂未发布" }}</span>
      </SettingFormField>

      <SettingFormField title="技术栈" description="当前应用使用的主要运行时、框架和组件。">
        <div class="flex flex-wrap justify-end gap-2">
          <Badge v-for="item in techStack" :key="item" variant="secondary">{{ item }}</Badge>
        </div>
      </SettingFormField>

      <SettingFormField title="版本历史" description="未来发布日志会按版本折叠展示。">
        <details class="rounded-md border bg-background px-3 py-2 text-sm">
          <summary class="cursor-pointer font-medium">更新日志</summary>
          <p class="mt-3 text-muted-foreground">暂无记录</p>
        </details>
      </SettingFormField>
    </SettingForm>
  </SettingPage>
</template>

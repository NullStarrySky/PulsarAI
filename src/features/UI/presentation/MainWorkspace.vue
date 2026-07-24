<script setup lang="ts">
import { computed } from "vue";
import { getWorkspaceResourceComponent } from "@/features/UI/application/workspace-resource-registry";
import { useLayoutStore } from "../application/layout-store";

const layout = useLayoutStore();
const activeTab = computed(() => layout.activeTab);
const activeComponent = computed(() => getWorkspaceResourceComponent(activeTab.value?.resourceType));
</script>

<template>
  <main class="flex min-h-0 flex-1 flex-col bg-background">
    <section
      v-if="!activeTab"
      class="flex min-h-0 flex-1 items-center justify-center bg-muted/10 text-sm text-muted-foreground"
    >
      选择一个资源开始。
    </section>

    <section
      v-else-if="!activeComponent"
      class="flex min-h-0 flex-1 items-center justify-center bg-muted/10 text-sm text-muted-foreground"
    >
      暂无可用渲染器。
    </section>

    <KeepAlive v-else>
      <component
        :is="activeComponent"
        :key="activeTab.id"
        :package-id="activeTab.packageId"
        :resource-id="activeTab.resourceId"
        :tab="activeTab"
      />
    </KeepAlive>
  </main>
</template>

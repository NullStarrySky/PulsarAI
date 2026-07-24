<script setup lang="ts">
import { Notivue, Notification } from "notivue";
import MainWorkspace from "./MainWorkspace.vue";
import SettingsDialog from "@/features/Setting/presentation/SettingsDialog.vue";
import ShellLeftSidebar from "./ShellLeftSidebar.vue";
import ShellRightSidebar from "./ShellRightSidebar.vue";
import ShellTopBar from "./ShellTopBar.vue";
</script>

<template>
  <div class="flex h-[100dvh] min-w-0 flex-col overflow-hidden bg-background text-foreground">
    <ShellTopBar />

    <div class="flex min-h-0 min-w-0 flex-1 bg-muted/10">
      <ShellLeftSidebar />
      <MainWorkspace />
      <ShellRightSidebar />
    </div>
    <SettingsDialog />
    <Notivue v-slot="item">
      <Notification :item="item" />
    </Notivue>
  </div>
</template>

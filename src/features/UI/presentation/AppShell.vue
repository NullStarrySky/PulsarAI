<script setup lang="ts">
import { Notivue, Notification } from "notivue";
import MainWorkspace from "./MainWorkspace.vue";
import SettingsDialog from "@/features/Setting/presentation/SettingsDialog.vue";
import ShellLeftSidebar from "./ShellLeftSidebar.vue";
import ShellRightSidebar from "./ShellRightSidebar.vue";
import ShellTopBar from "./ShellTopBar.vue";
</script>

<template>
  <div class="flex h-screen min-w-0 overflow-hidden bg-background text-foreground">
    <ShellLeftSidebar />

    <div class="flex min-w-0 flex-1 flex-col">
      <ShellTopBar />
      <MainWorkspace />
    </div>

    <ShellRightSidebar />
    <SettingsDialog />
    <Notivue v-slot="item">
      <Notification :item="item" />
    </Notivue>
  </div>
</template>

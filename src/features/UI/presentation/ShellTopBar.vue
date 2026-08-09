<script setup lang="ts">
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowLeft, ArrowRight, Maximize2, Minus, X } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from "@/components/ui/menubar";
import { useResponsiveStore } from "@/features/Misc/application/responsive-store";
import { useConversationStore } from "@/features/Resources/Conversation/application/conversation-store";
import { useLayoutStore } from "../application/layout-store";
import { startWindowDragFromBackground } from "../application/window-drag";

const layout = useLayoutStore();
const conversation = useConversationStore();
const responsive = useResponsiveStore();
const appWindow = isTauri() ? getCurrentWindow() : null;

async function minimizeWindow() {
  await appWindow?.minimize();
}

async function toggleMaximize() {
  await appWindow?.toggleMaximize();
}

async function closeWindow() {
  await appWindow?.close();
}

async function createPackage() {
  await conversation.createPackage();
}

async function createConversation() {
  if (!conversation.activePackageId) return;
  await conversation.createConversation(conversation.activePackageId);
}

function goBack() {
  window.history.back();
}

function goForward() {
  window.history.forward();
}

function edit(command: "cut" | "copy" | "paste" | "selectAll" | "undo" | "redo") {
  document.execCommand(command);
}

async function openDocumentation() {
  const url = "https://github.com/NullStarrySky/PulsarAI/tree/master/docs";
  if (isTauri()) await openUrl(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}
</script>

<template>
  <header
    class="flex h-10 shrink-0 select-none items-center gap-1 border-b border-border/75 bg-card px-1.5 mobile:h-12 mobile:px-1"
    @mousedown="startWindowDragFromBackground"
  >
    <div class="relative z-10 flex items-center gap-0.5">
      <Button variant="ghost" size="icon-sm" class="text-muted-foreground/65 hover:bg-muted/60 hover:text-foreground" title="返回" aria-label="返回" @click="goBack"><ArrowLeft /></Button>
      <Button variant="ghost" size="icon-sm" class="text-muted-foreground/65 hover:bg-muted/60 hover:text-foreground" title="前进" aria-label="前进" @click="goForward"><ArrowRight /></Button>
    </div>

    <Menubar class="relative z-10 h-8 border-0 bg-transparent p-0 shadow-none mobile:hidden">
      <MenubarMenu>
        <MenubarTrigger class="h-8 px-2 text-xs font-normal text-muted-foreground/65 hover:bg-muted/60 hover:text-foreground data-[state=open]:bg-muted/60 data-[state=open]:text-foreground">文件</MenubarTrigger>
        <MenubarContent>
          <MenubarItem @click="createPackage">新建角色包<MenubarShortcut>Ctrl+Shift+N</MenubarShortcut></MenubarItem>
          <MenubarItem :disabled="!conversation.activePackageId" @click="createConversation">新建会话<MenubarShortcut>Ctrl+N</MenubarShortcut></MenubarItem>
          <MenubarSeparator />
          <MenubarItem @click="closeWindow">关闭<MenubarShortcut>Alt+F4</MenubarShortcut></MenubarItem>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger class="h-8 px-2 text-xs font-normal text-muted-foreground/65 hover:bg-muted/60 hover:text-foreground data-[state=open]:bg-muted/60 data-[state=open]:text-foreground">编辑</MenubarTrigger>
        <MenubarContent>
          <MenubarItem @click="edit('cut')">剪切<MenubarShortcut>Ctrl+X</MenubarShortcut></MenubarItem>
          <MenubarItem @click="edit('copy')">复制<MenubarShortcut>Ctrl+C</MenubarShortcut></MenubarItem>
          <MenubarItem @click="edit('paste')">粘贴<MenubarShortcut>Ctrl+V</MenubarShortcut></MenubarItem>
          <MenubarItem @click="edit('selectAll')">全选<MenubarShortcut>Ctrl+A</MenubarShortcut></MenubarItem>
          <MenubarSeparator />
          <MenubarItem @click="edit('undo')">撤销<MenubarShortcut>Ctrl+Z</MenubarShortcut></MenubarItem>
          <MenubarItem @click="edit('redo')">重做<MenubarShortcut>Ctrl+Y</MenubarShortcut></MenubarItem>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger class="h-8 px-2 text-xs font-normal text-muted-foreground/65 hover:bg-muted/60 hover:text-foreground" @click="layout.openSettings">设置</MenubarTrigger>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger class="h-8 px-2 text-xs font-normal text-muted-foreground/65 hover:bg-muted/60 hover:text-foreground data-[state=open]:bg-muted/60 data-[state=open]:text-foreground">帮助</MenubarTrigger>
        <MenubarContent>
          <MenubarItem @click="openDocumentation">文档</MenubarItem>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>

    <div class="min-w-6 flex-1 self-stretch" />

    <div class="relative z-10 flex items-center gap-0.5">
      <Button v-if="!responsive.isMobileLayout" variant="ghost" size="icon-sm" title="最小化" aria-label="最小化窗口" @click="minimizeWindow"><Minus /></Button>
      <Button v-if="!responsive.isMobileLayout" variant="ghost" size="icon-sm" title="最大化或还原" aria-label="最大化或还原窗口" @click="toggleMaximize"><Maximize2 /></Button>
      <Button v-if="!responsive.isMobileLayout" variant="ghost" size="icon-sm" class="hover:bg-destructive hover:text-destructive-foreground" title="关闭" aria-label="关闭窗口" @click="closeWindow"><X /></Button>
    </div>
  </header>
</template>

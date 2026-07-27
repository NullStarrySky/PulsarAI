<script setup lang="ts">
import { Bell, CheckCheck, Trash2 } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { useNotificationStore } from "../application/notification-store";

const notifications = useNotificationStore();
</script>

<template>
  <section class="flex min-h-0 flex-1 flex-col bg-background">
    <header class="flex min-h-14 items-center gap-3 border-b px-4">
      <Bell class="size-5 text-muted-foreground" />
      <div class="min-w-0 flex-1">
        <h1 class="text-sm font-semibold">通知</h1>
        <p class="text-xs text-muted-foreground">{{ notifications.unreadCount }} 条未读</p>
      </div>
      <Button variant="ghost" size="sm" :disabled="notifications.unreadCount === 0" @click="notifications.markAllRead">
        <CheckCheck class="size-4" />
        全部已读
      </Button>
      <Button variant="ghost" size="icon-sm" title="清空通知" :disabled="notifications.items.length === 0" @click="notifications.clear">
        <Trash2 class="size-4" />
      </Button>
    </header>

    <div class="flex-1 overflow-y-auto p-3 mobile:p-2">
      <article
        v-for="item in notifications.items"
        :key="item.id"
        class="group mb-2 rounded-lg border p-3 transition-colors"
        :class="item.read ? 'bg-card/35' : 'border-primary/30 bg-primary/5'"
        @click="notifications.markRead(item.id)"
      >
        <div class="flex items-start gap-3">
          <span
            class="mt-1 size-2 shrink-0 rounded-full"
            :class="item.read ? 'bg-muted-foreground/25' : 'bg-primary'"
          />
          <div class="min-w-0 flex-1">
            <div class="text-sm font-medium">{{ item.title }}</div>
            <p class="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{{ item.body }}</p>
            <time class="mt-2 block text-xs text-muted-foreground">
              {{ new Date(item.createdAt).toLocaleString() }}
            </time>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            class="mobile-touch-actions opacity-0 group-hover:opacity-100"
            title="删除通知"
            @click.stop="notifications.remove(item.id)"
          >
            <Trash2 class="size-4" />
          </Button>
        </div>
      </article>

      <div v-if="notifications.items.length === 0" class="grid min-h-56 place-items-center text-sm text-muted-foreground">
        暂无内置通知
      </div>
    </div>
  </section>
</template>

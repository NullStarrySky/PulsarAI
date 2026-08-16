import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";
import type {
  PulsarNotification,
  SendPulsarNotificationInput,
} from "./notification";

const storageKey = "pulsarai:notifications:v1";
const maxNotifications = 200;

export const useNotificationStore = defineStore("notifications", () => {
  const items = ref<PulsarNotification[]>(readNotifications());
  const unreadCount = computed(
    () => items.value.filter((item) => !item.read).length,
  );

  watch(items, persistNotifications, { deep: true });

  function add(input: SendPulsarNotificationInput) {
    const item: PulsarNotification = {
      id: crypto.randomUUID(),
      title: input.title?.trim() || "Pulsar",
      body: input.body?.trim() || "你有一条新通知。",
      level: input.level ?? "info",
      createdAt: new Date().toISOString(),
      read: false,
    };
    items.value.unshift(item);
    items.value = items.value.slice(0, maxNotifications);
    return item;
  }

  function markRead(id: string, read = true) {
    const item = items.value.find((value) => value.id === id);
    if (item) {
      item.read = read;
    }
  }

  function markAllRead() {
    for (const item of items.value) {
      item.read = true;
    }
  }

  function remove(id: string) {
    items.value = items.value.filter((item) => item.id !== id);
  }

  function clear() {
    items.value = [];
  }

  return {
    items,
    unreadCount,
    add,
    clear,
    markAllRead,
    markRead,
    remove,
  };
});

function readNotifications() {
  if (typeof localStorage === "undefined") {
    return [] as PulsarNotification[];
  }
  const raw = localStorage.getItem(storageKey);
  if (!raw) {
    return [] as PulsarNotification[];
  }
  try {
    return JSON.parse(raw) as PulsarNotification[];
  } catch {
    return [] as PulsarNotification[];
  }
}

function persistNotifications(items: PulsarNotification[]) {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(storageKey, JSON.stringify(items));
  }
}

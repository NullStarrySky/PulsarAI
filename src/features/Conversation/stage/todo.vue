<script setup lang="ts">
import { computed, ref } from "vue";
import { Plus, Trash2 } from "lucide-vue-next";
import { Button } from "@/components/fluid";
import { Input } from "@/components/ui/input";

type Todo = { id: number; title: string; done: boolean };

const draft = ref("");
const todos = ref<Todo[]>([
	{ id: 1, title: "完成第一个待办", done: false },
	{ id: 2, title: "试着勾选或删除它", done: true },
]);
let nextId = 3;
const remaining = computed(() => todos.value.filter((todo) => !todo.done).length);

function addTodo() {
	const title = draft.value.trim();
	if (!title) return;
	todos.value.unshift({ id: nextId++, title, done: false });
	draft.value = "";
}

function clearCompleted() {
	todos.value = todos.value.filter((todo) => !todo.done);
}
</script>

<template>
  <main class="min-h-0 flex-1 overflow-auto p-4 md:p-8">
    <section class="mx-auto w-full max-w-xl space-y-6 rounded-xl border bg-card p-5 shadow-sm md:p-6">
      <header>
        <h1 class="text-xl font-semibold tracking-tight">待办</h1>
        <p class="mt-1 text-sm text-muted-foreground">还剩 {{ remaining }} 项</p>
      </header>

      <form class="flex gap-2" @submit.prevent="addTodo">
        <Input v-model="draft" placeholder="添加待办…" aria-label="待办内容" />
        <Button type="submit" :disabled="!draft.trim()"><Plus class="size-4" />添加</Button>
      </form>

      <ul v-if="todos.length" class="divide-y rounded-lg border">
        <li v-for="todo in todos" :key="todo.id" class="flex min-h-12 items-center gap-3 px-3">
          <input :id="`todo-${todo.id}`" v-model="todo.done" type="checkbox" class="size-4 accent-primary" />
          <label :for="`todo-${todo.id}`" class="min-w-0 flex-1 cursor-pointer text-sm" :class="todo.done && 'text-muted-foreground line-through'">{{ todo.title }}</label>
          <Button variant="ghost" size="icon-sm" class="shrink-0" :aria-label="`删除 ${todo.title}`" @click="todos = todos.filter((item) => item.id !== todo.id)"><Trash2 class="size-4" /></Button>
        </li>
      </ul>
      <p v-else class="py-8 text-center text-sm text-muted-foreground">没有待办了。</p>

      <div v-if="todos.some((todo) => todo.done)" class="flex justify-end">
        <Button variant="ghost" size="sm" @click="clearCompleted">清除已完成</Button>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { data as humanDocument } from "../../api/capability-reference.data.js";

const workbench = ref<HTMLElement | null>(null);

function showReference(targetId?: string) {
  requestAnimationFrame(() => {
    (targetId ? document.getElementById(targetId) : workbench.value)?.scrollIntoView({
      behavior: "auto",
      block: "start",
    });
  });
}
</script>

<template>
  <div ref="workbench" class="capability-workbench">
    <main class="capability-reference-main">
      <article class="capability-human-document" v-html="humanDocument.html" />
    </main>

    <aside class="capability-reference-sidebar" aria-label="文档视图控制">
      <div class="capability-sidebar-inner">
        <section class="capability-preview-controls">
          <header>
            <h2>运行时读取</h2>
            <p><code>readDocs()</code> 返回目录；传入 Feature ID 和可选 API 名称可按需读取完整说明与可用状态。</p>
          </header>
        </section>

        <nav class="capability-page-toc" aria-label="本页目录">
          <h2>本页目录</h2>
          <div
            v-for="item in humanDocument.outline"
            :key="item.id"
            class="capability-toc-group"
          >
            <button
              type="button"
              class="capability-toc-feature"
              @click="showReference(item.id)"
            >
              {{ item.label }}
            </button>
            <button
              v-for="child in item.children"
              :key="child.id"
              type="button"
              class="capability-toc-child"
              @click="showReference(child.id)"
            >
              {{ child.label }}
            </button>
          </div>
        </nav>
      </div>
    </aside>
  </div>
</template>

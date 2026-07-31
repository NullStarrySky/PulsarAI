<script setup lang="ts">
import { computed, ref } from "vue";
import {
  createCapabilityPrompt,
  normalizeSubCapIds,
} from "../../../src/features/Capabilities/domain/capability";
import {
  pluginCapabilitiesDefinition,
} from "../../../src/features/Resources/Plugin/domain/plugin-capability";

const viewMode = ref<"reference" | "preview">("reference");
const documentation = pluginCapabilitiesDefinition.documentation!;
const permissionGroups = computed(() =>
  Object.keys(pluginCapabilitiesDefinition.subCaps)
    .filter((subCapId) => subCapId !== "all")
    .map((subCapId) => ({
      id: subCapId,
      title: pluginCapabilitiesDefinition.subCaps[subCapId] ?? subCapId,
      methods: pluginCapabilitiesDefinition.api[subCapId] ?? [],
    })),
);
const promptPreview = computed(() =>
  createCapabilityPrompt(
    pluginCapabilitiesDefinition,
    normalizeSubCapIds(pluginCapabilitiesDefinition, ["read"]),
  ),
);
</script>

<template>
  <div class="capability-workbench plugin-api-workbench">
    <main class="capability-reference-main">
      <article
        v-if="viewMode === 'reference'"
        class="capability-human-document plugin-api-document"
      >
        <h2>Plugin API</h2>
        <p>{{ documentation.overview }}</p>

        <h3>使用说明</h3>
        <ul>
          <li v-for="note in documentation.notes" :key="note">
            {{ note }}
          </li>
        </ul>

        <h3>类型</h3>
        <section v-for="type in documentation.types" :key="type.name">
          <h4>{{ type.name }}</h4>
          <p v-if="type.description">{{ type.description }}</p>
          <pre><code>{{ type.definition }}</code></pre>
        </section>

        <h3>API 定义</h3>
        <section v-for="group in permissionGroups" :key="group.id">
          <h4>{{ group.title }} <code>{{ group.id }}</code></h4>
          <article v-for="method in group.methods" :key="method.name">
            <h5><code>plugin.{{ method.signature }}</code></h5>
            <p>{{ method.description }}</p>
            <p v-if="method.returns"><strong>返回：</strong>{{ method.returns }}</p>
            <pre v-if="method.example"><code>{{ method.example }}</code></pre>
          </article>
        </section>
      </article>

      <section v-else class="capability-prompt-preview">
        <div class="capability-prompt-note">
          这是当前权限下实际发送给模型的 Plugin API 文档。
        </div>
        <pre tabindex="0"><code>{{ promptPreview }}</code></pre>
      </section>
    </main>

    <aside class="capability-reference-sidebar" aria-label="Plugin API 文档视图">
      <div class="capability-sidebar-inner">
        <div class="capability-view-switcher" aria-label="Plugin API 显示内容">
          <button
            type="button"
            :aria-pressed="viewMode === 'reference'"
            @click="viewMode = 'reference'"
          >
            人类文档
          </button>
          <button
            type="button"
            :aria-pressed="viewMode === 'preview'"
            @click="viewMode = 'preview'"
          >
            发送预览
          </button>
        </div>
      </div>
    </aside>
  </div>
</template>

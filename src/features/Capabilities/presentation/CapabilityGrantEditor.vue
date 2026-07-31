<script setup lang="ts">
import type {
  CapabilityDefinition,
  CapabilityGrants,
} from "@/features/Capabilities/domain/capability";
import { capabilityDefinitions } from "@/features/Capabilities/application/capability-registry";

const props = defineProps<{
  modelValue: CapabilityGrants;
  compact?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: CapabilityGrants];
}>();

function availableIds(definition: CapabilityDefinition) {
  return Object.keys(definition.subCaps).filter((id) => id !== "all");
}

function explicitIds(definition: CapabilityDefinition) {
  const available = availableIds(definition);
  const selected = props.modelValue[definition.id] ?? [];
  return selected.includes("all")
    ? available
    : available.filter((id) => selected.includes(id));
}

function enabledCount(definition: CapabilityDefinition) {
  return explicitIds(definition).length;
}

function isEnabled(definition: CapabilityDefinition, subCapId: string) {
  return explicitIds(definition).includes(subCapId);
}

function setSubCap(
  definition: CapabilityDefinition,
  subCapId: string,
  enabled: boolean,
) {
  const selected = new Set(explicitIds(definition));
  if (enabled) {
    selected.add(subCapId);
  } else {
    selected.delete(subCapId);
  }
  emit("update:modelValue", {
    ...props.modelValue,
    [definition.id]: availableIds(definition).filter((id) => selected.has(id)),
  });
}
</script>

<template>
  <div
    class="capability-grant-editor"
    :class="{ 'capability-grant-editor--compact': compact }"
  >
    <details
      v-for="definition in capabilityDefinitions"
      :key="definition.id"
      class="capability-grant-feature"
    >
      <summary class="capability-grant-summary">
        <span class="capability-grant-title">{{ definition.title }}</span>
        <span class="capability-grant-count">
          {{ enabledCount(definition) }}/{{ availableIds(definition).length }}
        </span>
        <span class="capability-grant-chevron" aria-hidden="true" />
      </summary>

      <div class="capability-grant-content">
        <p class="capability-grant-description">
          {{ definition.description }}
        </p>

        <section
          v-for="subCapId in availableIds(definition)"
          :key="subCapId"
          class="capability-grant-permission"
          :class="{ 'is-disabled': !isEnabled(definition, subCapId) }"
        >
          <div class="capability-grant-permission-header">
            <div class="capability-grant-permission-copy">
              <span class="capability-grant-permission-name">
                {{ definition.subCaps[subCapId] }}
              </span>
              <code>{{ subCapId }}</code>
            </div>
            <button
              type="button"
              class="capability-grant-switch"
              role="switch"
              :aria-checked="isEnabled(definition, subCapId)"
              :aria-label="`允许${definition.title}：${definition.subCaps[subCapId]}`"
              @click="setSubCap(definition, subCapId, !isEnabled(definition, subCapId))"
            >
              <span />
            </button>
          </div>

          <div
            v-if="definition.api[subCapId]?.length"
            class="capability-grant-functions"
          >
            <div
              v-for="item in definition.api[subCapId]"
              :key="item.name"
              class="capability-grant-function"
            >
              <code>{{ item.name }}</code>
              <p>{{ item.description }}</p>
            </div>
          </div>
        </section>
      </div>
    </details>
  </div>
</template>

<style scoped>
.capability-grant-editor {
  --cap-surface: var(--card, var(--vp-c-bg-soft));
  --cap-surface-muted: var(--muted, var(--vp-c-bg-alt));
  --cap-text: var(--card-foreground, var(--vp-c-text-1));
  --cap-text-muted: var(--muted-foreground, var(--vp-c-text-2));
  --cap-border: var(--border, var(--vp-c-divider));
  --cap-accent: var(--primary, var(--vp-c-brand-1));
  --cap-accent-contrast: var(--primary-foreground, #fff);
  display: grid;
  gap: 0.5rem;
  min-width: 0;
  color: var(--cap-text);
}

.capability-grant-feature {
  min-width: 0;
  overflow: clip;
  border: 1px solid var(--cap-border);
  border-radius: var(--radius, 0.65rem);
  background: color-mix(in oklab, var(--cap-surface) 92%, transparent);
}

.capability-grant-summary {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 0.85rem;
  align-items: center;
  min-height: 2.75rem;
  gap: 0.65rem;
  padding: 0.55rem 0.75rem;
  cursor: pointer;
  list-style: none;
  user-select: none;
}

.capability-grant-summary::-webkit-details-marker {
  display: none;
}

.capability-grant-summary:hover {
  background: color-mix(in oklab, var(--cap-surface-muted) 72%, transparent);
}

.capability-grant-summary:focus-visible {
  outline: 2px solid var(--cap-accent);
  outline-offset: -2px;
}

.capability-grant-title {
  overflow: hidden;
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.25rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.capability-grant-count {
  color: var(--cap-text-muted);
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Consolas, monospace);
  font-size: 0.7rem;
  font-variant-numeric: tabular-nums;
}

.capability-grant-chevron {
  width: 0.48rem;
  height: 0.48rem;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  color: var(--cap-text-muted);
  transform: rotate(45deg) translate(-0.1rem, -0.1rem);
  transition: transform 160ms ease;
}

.capability-grant-feature[open] .capability-grant-chevron {
  transform: rotate(225deg) translate(-0.05rem, -0.05rem);
}

.capability-grant-content {
  display: grid;
  gap: 0.65rem;
  padding: 0 0.75rem 0.75rem;
  border-top: 1px solid var(--cap-border);
}

.capability-grant-description {
  margin: 0;
  padding-top: 0.7rem;
  color: var(--cap-text-muted);
  font-size: 0.75rem;
  line-height: 1.45;
}

.capability-grant-permission {
  min-width: 0;
  padding: 0.65rem;
  border-radius: calc(var(--radius, 0.65rem) - 0.15rem);
  background: color-mix(in oklab, var(--cap-surface-muted) 58%, transparent);
  transition: opacity 160ms ease, background-color 160ms ease;
}

.capability-grant-permission.is-disabled {
  opacity: 0.58;
}

.capability-grant-permission-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.capability-grant-permission-copy {
  display: grid;
  min-width: 0;
  gap: 0.15rem;
}

.capability-grant-permission-name {
  font-size: 0.78rem;
  font-weight: 550;
  line-height: 1.35;
}

.capability-grant-permission-copy code,
.capability-grant-function code {
  overflow-wrap: anywhere;
  color: var(--cap-text-muted);
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Consolas, monospace);
  font-size: 0.66rem;
}

.capability-grant-switch {
  position: relative;
  flex: none;
  width: 1.8rem;
  height: 1rem;
  margin-top: 0.1rem;
  padding: 0;
  border: 1px solid var(--cap-border);
  border-radius: 999px;
  background: var(--cap-surface-muted);
  cursor: pointer;
  transition: background-color 160ms ease, border-color 160ms ease;
}

.capability-grant-switch span {
  position: absolute;
  top: 0.12rem;
  left: 0.12rem;
  width: 0.66rem;
  height: 0.66rem;
  border-radius: 999px;
  background: var(--cap-text-muted);
  transition: transform 160ms ease, background-color 160ms ease;
}

.capability-grant-switch[aria-checked="true"] {
  border-color: var(--cap-accent);
  background: var(--cap-accent);
}

.capability-grant-switch[aria-checked="true"] span {
  background: var(--cap-accent-contrast);
  transform: translateX(0.78rem);
}

.capability-grant-switch:focus-visible {
  outline: 2px solid var(--cap-accent);
  outline-offset: 2px;
}

.capability-grant-functions {
  display: grid;
  gap: 0.45rem;
  margin-top: 0.6rem;
  padding-top: 0.55rem;
  border-top: 1px solid color-mix(in oklab, var(--cap-border) 72%, transparent);
}

.capability-grant-function {
  display: grid;
  min-width: 0;
  grid-template-columns: minmax(5.5rem, 0.35fr) minmax(0, 1fr);
  gap: 0.65rem;
}

.capability-grant-function p {
  margin: 0;
  color: var(--cap-text-muted);
  font-size: 0.7rem;
  line-height: 1.45;
}

.capability-grant-editor--compact .capability-grant-function {
  grid-template-columns: 1fr;
  gap: 0.15rem;
}

.capability-grant-editor--compact .capability-grant-summary {
  min-height: 2.05rem;
  gap: 0.45rem;
  padding: 0.3rem 0.55rem;
}

.capability-grant-editor--compact .capability-grant-title {
  font-size: 0.78rem;
  line-height: 1rem;
}

.capability-grant-editor--compact .capability-grant-count {
  font-size: 0.65rem;
}

.capability-grant-editor--compact .capability-grant-content {
  padding-inline: 0.6rem;
  padding-bottom: 0.6rem;
}

@media (max-width: 767px) {
  .capability-grant-summary {
    min-height: 2.9rem;
  }

  .capability-grant-editor--compact .capability-grant-summary {
    min-height: 2.75rem;
  }

  .capability-grant-switch {
    width: 2.2rem;
    height: 1.25rem;
  }

  .capability-grant-switch span {
    top: 0.14rem;
    left: 0.14rem;
    width: 0.86rem;
    height: 0.86rem;
  }

  .capability-grant-switch[aria-checked="true"] span {
    transform: translateX(0.92rem);
  }

  .capability-grant-function {
    grid-template-columns: 1fr;
    gap: 0.15rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .capability-grant-chevron,
  .capability-grant-permission,
  .capability-grant-switch,
  .capability-grant-switch span {
    transition: none;
  }
}
</style>

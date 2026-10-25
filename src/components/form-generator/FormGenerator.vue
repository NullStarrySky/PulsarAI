<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
	Badge,
	Button,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Slider,
	Switch,
} from "@/components/fluid";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
	ArrowDown,
	ArrowUp,
	Check,
	Pencil,
	Plus,
	RotateCcw,
	Sliders,
	Trash2,
} from "@/lib/remix-icons";
import FormGeneratorItemDropdown from "./FormGeneratorItemDropdown.vue";
import type { FormSchema, SchemaItem } from "./types";

const props = withDefaults(
	defineProps<{
		modelValue?: FormSchema | Record<string, unknown> | null;
		title?: string;
		description?: string;
		editable?: boolean;
		initialEditMode?: boolean;
		class?: string;
	}>(),
	{
		modelValue: () => [],
		editable: true,
		initialEditMode: false,
	},
);

const emit = defineEmits<{
	(e: "update:modelValue", value: FormSchema): void;
	(e: "change", values: Record<string, unknown>): void;
}>();

const isEditing = ref(props.initialEditMode);

/**
 * Normalize input: support either FormSchema array or empty object/record
 */
function normalizeSchema(val: unknown): FormSchema {
	if (Array.isArray(val)) {
		return val as FormSchema;
	}
	return [];
}

const items = ref<FormSchema>(normalizeSchema(props.modelValue));

watch(
	() => props.modelValue,
	(newVal) => {
		const normalized = normalizeSchema(newVal);
		if (JSON.stringify(normalized) !== JSON.stringify(items.value)) {
			items.value = normalized;
		}
	},
	{ deep: true },
);

// Collect existing IDs to prevent duplicates during add
const existingIds = computed(() => items.value.map((i) => i.id));

// Computed key-value pair of all active form values
const valuesMap = computed<Record<string, unknown>>(() => {
	const result: Record<string, unknown> = {};
	for (const item of items.value) {
		result[item.id] = item.value;
	}
	return result;
});

function emitUpdate() {
	emit("update:modelValue", items.value);
	emit("change", valuesMap.value);
}

function handleValueChange() {
	emitUpdate();
}

function handleAddItem(newItem: SchemaItem) {
	items.value.push(newItem);
	emitUpdate();
}

function handleUpdateItem(index: number, updatedItem: SchemaItem) {
	items.value[index] = updatedItem;
	emitUpdate();
}

function removeItem(index: number) {
	items.value.splice(index, 1);
	emitUpdate();
}

function moveItem(index: number, direction: -1 | 1) {
	const targetIndex = index + direction;
	if (targetIndex < 0 || targetIndex >= items.value.length) return;
	const temp = items.value[index];
	items.value[index] = items.value[targetIndex]!;
	items.value[targetIndex] = temp!;
	emitUpdate();
}

function resetSingleItem(item: SchemaItem) {
	item.value = item.default;
	emitUpdate();
}

/** Reset all items to their schema default values */
function resetToDefaults() {
	for (const item of items.value) {
		item.value = item.default;
	}
	emitUpdate();
}

/** Clear all values to empty/falsy */
function clearValues() {
	for (const item of items.value) {
		if (item.type === "switch") {
			item.value = false;
		} else if (item.type === "slider") {
			item.value = item.min;
		} else if (item.type === "select") {
			item.value = item.options[0] ?? "";
		} else {
			item.value = "";
		}
	}
	emitUpdate();
}

defineExpose({
	items,
	values: valuesMap,
	isEditing,
	resetToDefaults,
	clearValues,
});
</script>

<template>
  <div class="flex flex-col gap-4" :class="props.class">
    <!-- Header: Title, Description, and Edit Mode Switcher -->
    <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-border/70">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <h3 v-if="title" class="text-base font-semibold leading-6 text-foreground/90">
            {{ title }}
          </h3>
          <Badge v-if="items.length > 0" variant="secondary" class="text-xs font-mono">
            {{ items.length }} 项参数
          </Badge>
          <Badge v-if="isEditing" variant="destructive" class="text-xs">
            编辑模式
          </Badge>
        </div>
        <p v-if="description" class="mt-1 text-xs text-muted-foreground leading-relaxed">
          {{ description }}
        </p>
      </div>

      <!-- Header Actions -->
      <div v-if="editable" class="flex shrink-0 items-center gap-2">
        <Button
          size="sm"
          :variant="isEditing ? 'default' : 'outline'"
          class="gap-1.5 h-8 text-xs font-medium"
          @click="isEditing = !isEditing"
        >
          <template v-if="isEditing">
            <Check class="size-3.5" />
            <span>完成编辑</span>
          </template>
          <template v-else>
            <Pencil class="size-3.5" />
            <span>进入编辑模式</span>
          </template>
        </Button>
      </div>
    </div>

    <!-- Empty State -->
    <div
      v-if="items.length === 0"
      class="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 py-12 px-4 text-center text-muted-foreground"
    >
      <div class="p-3 rounded-full bg-muted/60 mb-2">
        <Sliders class="size-6 text-muted-foreground/80" />
      </div>
      <p class="text-sm font-medium text-foreground/80">暂无配置项</p>
      <p class="text-xs text-muted-foreground mt-1 max-w-sm">
        {{ isEditing ? '点击下方按钮新增参数配置项' : '当前 Schema 为空，可点击右上角进入编辑模式添加' }}
      </p>
      <div v-if="isEditing" class="mt-4">
        <FormGeneratorItemDropdown
          mode="add"
          :existing-ids="existingIds"
          @add="handleAddItem"
        />
      </div>
    </div>

    <!-- Setting Items List: Aligned with SettingItem and SettingGroup -->
    <div v-else class="divide-y divide-border/60">
      <div
        v-for="(item, index) in items"
        :key="item.id"
        class="grid min-h-16 gap-3 py-4 sm:grid-cols-[minmax(12rem,1fr)_minmax(14rem,auto)] sm:items-center transition-colors group"
      >
        <!-- Left Column: Title, ID badge, and Description -->
        <div class="min-w-0 pr-2">
          <div class="flex items-center gap-2 flex-wrap">
            <h4 class="text-sm font-medium leading-5 text-foreground/90">
              {{ item.name }}
            </h4>
            <span class="inline-flex items-center rounded bg-muted/80 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground border border-border/40">
              {{ item.id }}
            </span>
            <span
              v-if="isEditing"
              class="text-[10px] text-muted-foreground font-mono bg-accent/40 px-1 rounded"
            >
              #{{ index + 1 }}
            </span>
          </div>

          <p v-if="item.description" class="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
            {{ item.description }}
          </p>

          <!-- Type Hint / Default value info in edit mode -->
          <div v-if="isEditing" class="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground font-mono">
            <span>类型: {{ item.type }}</span>
            <span>·</span>
            <span>默认: {{ String(item.default) }}</span>
            <template v-if="item.type === 'slider'">
              <span>·</span>
              <span>范围: [{{ item.min }}, {{ item.max }}]</span>
            </template>
          </div>
        </div>

        <!-- Right Column: Form Control & Edit Actions -->
        <div class="flex min-w-0 flex-wrap items-center justify-start gap-2.5 sm:justify-end">
          <!-- The Value Controller Component -->
          <div class="flex items-center gap-2">
            <!-- Switch Controller -->
            <template v-if="item.type === 'switch'">
              <Switch
                v-model="item.value"
                @update:model-value="handleValueChange"
              />
            </template>

            <!-- Select Controller -->
            <template v-else-if="item.type === 'select'">
              <Select
                v-model="item.value"
                @update:model-value="handleValueChange"
              >
                <SelectTrigger class="w-44 sm:w-52 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="opt in item.options"
                    :key="opt"
                    :value="opt"
                  >
                    {{ opt }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </template>

            <!-- Slider Controller -->
            <template v-else-if="item.type === 'slider'">
              <div class="flex items-center gap-2.5 w-48 sm:w-60">
                <Slider
                  v-model="item.value"
                  :min="item.min"
                  :max="item.max"
                  :step="item.step ?? 1"
                  show-value
                  class="flex-1"
                  @update:model-value="handleValueChange"
                />
              </div>
            </template>

            <!-- Textarea Controller -->
            <template v-else-if="item.type === 'textarea'">
              <Textarea
                v-model="item.value"
                :placeholder="item.placeholder"
                class="w-full sm:w-72 min-h-16 text-xs resize-y"
                @input="handleValueChange"
              />
            </template>

            <!-- Input Controller -->
            <template v-else-if="item.type === 'input'">
              <Input
                v-model="item.value"
                :placeholder="item.placeholder"
                class="w-44 sm:w-56 h-8 text-xs"
                @input="handleValueChange"
              />
            </template>

            <!-- Quick Reset to default button (shown when value differs from default in normal mode) -->
            <button
              v-if="!isEditing && item.value !== item.default"
              type="button"
              class="text-muted-foreground/60 hover:text-foreground transition-colors p-1 rounded hover:bg-muted"
              title="还原此项为默认值"
              @click="resetSingleItem(item)"
            >
              <RotateCcw class="size-3.5" />
            </button>
          </div>

          <!-- Edit Mode Actions: Reorder, Edit Popover, Delete -->
          <div
            v-if="isEditing"
            class="flex items-center gap-1 pl-2 border-l border-border/60"
          >
            <!-- Move Up -->
            <Button
              size="icon"
              variant="ghost"
              class="size-7"
              :disabled="index === 0"
              title="向上调整顺序"
              @click="moveItem(index, -1)"
            >
              <ArrowUp class="size-3.5" />
            </Button>

            <!-- Move Down -->
            <Button
              size="icon"
              variant="ghost"
              class="size-7"
              :disabled="index === items.length - 1"
              title="向下调整顺序"
              @click="moveItem(index, 1)"
            >
              <ArrowDown class="size-3.5" />
            </Button>

            <!-- Edit Item Popover (Uses the shared FormGeneratorItemDropdown) -->
            <FormGeneratorItemDropdown
              mode="edit"
              :item="item"
              :existing-ids="existingIds.filter((id) => id !== item.id)"
              @update="handleUpdateItem(index, $event)"
            />

            <!-- Delete Item -->
            <Button
              size="icon"
              variant="ghost"
              class="size-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              title="删除此项"
              @click="removeItem(index)"
            >
              <Trash2 class="size-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <!-- Bottom Add Button in Edit Mode -->
      <div v-if="isEditing" class="pt-4">
        <FormGeneratorItemDropdown
          mode="add"
          :existing-ids="existingIds"
          @add="handleAddItem"
        >
          <template #trigger>
            <Button
              variant="outline"
              class="w-full border-dashed py-5 gap-2 text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
            >
              <Plus class="size-4" />
              <span>新增配置项</span>
            </Button>
          </template>
        </FormGeneratorItemDropdown>
      </div>
    </div>
  </div>
</template>

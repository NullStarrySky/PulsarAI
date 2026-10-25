<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
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
import { Label } from "@/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Check, Plus, X } from "@/lib/remix-icons";
import {
	type ControllerType,
	createDefaultController,
	createDefaultSchemaItem,
	type SchemaItem,
} from "./types";

const props = withDefaults(
	defineProps<{
		mode: "add" | "edit";
		item?: SchemaItem;
		existingIds?: string[];
	}>(),
	{
		existingIds: () => [],
	},
);

const emit = defineEmits<{
	(e: "add", item: SchemaItem): void;
	(e: "update", item: SchemaItem): void;
}>();

const isOpen = ref(false);
const idError = ref("");
const newOptionInput = ref("");

// Internal draft object for the form item
const draft = ref<SchemaItem>(
	props.item
		? JSON.parse(JSON.stringify(props.item))
		: createDefaultSchemaItem("", "", "switch"),
);

// Reset / initialize draft when popover opens or prop changes
watch(
	() => props.item,
	(newItem) => {
		if (newItem && props.mode === "edit") {
			draft.value = JSON.parse(JSON.stringify(newItem));
		}
	},
	{ deep: true },
);

watch(isOpen, (open) => {
	if (open) {
		idError.value = "";
		if (props.mode === "edit" && props.item) {
			draft.value = JSON.parse(JSON.stringify(props.item));
		} else if (props.mode === "add") {
			draft.value = createDefaultSchemaItem("", "", "switch");
			newOptionInput.value = "";
		}
	}
});

// Watch draft in edit mode to auto-sync changes
watch(
	draft,
	(val) => {
		if (props.mode === "edit" && isOpen.value) {
			emit("update", JSON.parse(JSON.stringify(val)));
		}
	},
	{ deep: true },
);

function handleTypeChange(newType: string) {
	const targetType = newType as ControllerType;
	const controller = createDefaultController(targetType);
	const currentBase = {
		id: draft.value.id,
		name: draft.value.name,
		description: draft.value.description,
	};
	draft.value = {
		...currentBase,
		...controller,
	} as SchemaItem;

	if (props.mode === "edit") {
		emit("update", JSON.parse(JSON.stringify(draft.value)));
	}
}

function addOption() {
	const opt = newOptionInput.value.trim();
	if (!opt) return;
	if (draft.value.type === "select") {
		if (!draft.value.options.includes(opt)) {
			draft.value.options.push(opt);
			if (!draft.value.default) {
				draft.value.default = opt;
				draft.value.value = opt;
			}
		}
		newOptionInput.value = "";
	}
}

function removeOption(index: number) {
	if (draft.value.type === "select") {
		const removed = draft.value.options[index];
		draft.value.options.splice(index, 1);
		if (draft.value.default === removed) {
			draft.value.default = draft.value.options[0] ?? "";
			draft.value.value = draft.value.default;
		}
	}
}

function handleConfirmAdd() {
	const trimmedId = draft.value.id.trim();
	if (!trimmedId) {
		idError.value = "请输入唯一标识 ID";
		return;
	}
	if (props.existingIds.includes(trimmedId)) {
		idError.value = "该 ID 已存在，请更换";
		return;
	}

	const finalItem: SchemaItem = {
		...draft.value,
		id: trimmedId,
		name: draft.value.name.trim() || trimmedId,
		description: draft.value.description?.trim() || "",
		value: draft.value.default,
	} as SchemaItem;

	emit("add", finalItem);
	isOpen.value = false;
}
</script>

<template>
  <Popover v-model:open="isOpen">
    <PopoverTrigger as-child>
      <slot name="trigger">
        <Button v-if="mode === 'add'" size="sm" class="gap-1.5">
          <Plus class="size-4" />
          <span>新增配置项</span>
        </Button>
        <Button v-else size="icon" variant="ghost" class="size-8">
          <Pencil class="size-3.5" />
        </Button>
      </slot>
    </PopoverTrigger>

    <PopoverContent
      align="end"
      :side-offset="6"
      class="w-84 max-h-[85vh] overflow-y-auto p-4 flex flex-col gap-3.5 text-xs bg-popover/95 backdrop-blur-md shadow-xl border border-border"
    >
      <!-- Header -->
      <div class="flex items-center justify-between pb-2 border-b border-border/70">
        <h4 class="text-sm font-semibold text-foreground/90">
          {{ mode === 'add' ? '新增表单配置项' : '编辑表单配置项' }}
        </h4>
        <span class="text-[11px] text-muted-foreground font-mono">
          {{ draft.type }}
        </span>
      </div>

      <!-- ID field -->
      <div class="flex flex-col gap-1.5">
        <div class="flex items-center justify-between">
          <Label class="text-xs font-medium">标识符 (ID / Key)</Label>
          <span v-if="idError" class="text-[11px] text-destructive">{{ idError }}</span>
        </div>
        <Input
          v-model="draft.id"
          placeholder="例如: temperature, max_tokens"
          class="h-8 text-xs font-mono"
          @input="idError = ''"
        />
        <p class="text-[10px] text-muted-foreground">用于映射配置结果对象的唯一键名</p>
      </div>

      <!-- Name field -->
      <div class="flex flex-col gap-1.5">
        <Label class="text-xs font-medium">显示名称 (Name)</Label>
        <Input
          v-model="draft.name"
          placeholder="例如: 采样温度"
          class="h-8 text-xs"
        />
      </div>

      <!-- Description field -->
      <div class="flex flex-col gap-1.5">
        <Label class="text-xs font-medium">描述信息 (Description)</Label>
        <Textarea
          v-model="draft.description"
          placeholder="关于该参数作用的提示说明..."
          class="min-h-14 text-xs py-1.5 resize-none"
        />
      </div>

      <!-- Type Selector -->
      <div class="flex flex-col gap-1.5">
        <Label class="text-xs font-medium">控件类型 (Type)</Label>
        <Select
          :model-value="draft.type"
          @update:model-value="handleTypeChange"
        >
          <SelectTrigger class="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="switch">开关 (Switch)</SelectItem>
            <SelectItem value="select">下拉选择 (Select)</SelectItem>
            <SelectItem value="slider">数值滑块 (Slider)</SelectItem>
            <SelectItem value="textarea">多行文本 (Textarea)</SelectItem>
            <SelectItem value="input">单行文本 (Input)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <!-- Type Specific Controls -->
      <div class="pt-2 border-t border-border/60 flex flex-col gap-3">
        <span class="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          控件属性配置
        </span>

        <!-- Switch Sub-controls -->
        <template v-if="draft.type === 'switch'">
          <div class="flex items-center justify-between py-1">
            <Label class="text-xs">默认状态 (Default)</Label>
            <Switch v-model="draft.default" />
          </div>
        </template>

        <!-- Select Sub-controls -->
        <template v-else-if="draft.type === 'select'">
          <div class="flex flex-col gap-2">
            <Label class="text-xs">候选项列表 (Options)</Label>
            <div class="flex gap-1.5">
              <Input
                v-model="newOptionInput"
                placeholder="新选项名称..."
                class="h-7 text-xs flex-1"
                @keydown.enter.prevent="addOption"
              />
              <Button size="sm" variant="secondary" class="h-7 px-2 text-xs" @click="addOption">
                添加
              </Button>
            </div>
            <div class="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pt-1">
              <div
                v-for="(opt, idx) in draft.options"
                :key="opt + idx"
                class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-muted/80 text-[11px] border border-border/50"
              >
                <span>{{ opt }}</span>
                <button
                  type="button"
                  class="text-muted-foreground hover:text-destructive transition-colors ml-0.5"
                  @click="removeOption(idx)"
                >
                  <X class="size-3" />
                </button>
              </div>
            </div>
            <div class="flex flex-col gap-1 mt-1">
              <Label class="text-xs">默认选中项</Label>
              <Select v-model="draft.default">
                <SelectTrigger class="h-7 text-xs">
                  <SelectValue placeholder="选择默认选项" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="opt in draft.options"
                    :key="opt"
                    :value="opt"
                  >
                    {{ opt }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </template>

        <!-- Slider Sub-controls -->
        <template v-else-if="draft.type === 'slider'">
          <div class="grid grid-cols-3 gap-2">
            <div class="flex flex-col gap-1">
              <Label class="text-[11px] text-muted-foreground">最小值 (Min)</Label>
              <Input
                v-model.number="draft.min"
                type="number"
                class="h-7 text-xs"
              />
            </div>
            <div class="flex flex-col gap-1">
              <Label class="text-[11px] text-muted-foreground">最大值 (Max)</Label>
              <Input
                v-model.number="draft.max"
                type="number"
                class="h-7 text-xs"
              />
            </div>
            <div class="flex flex-col gap-1">
              <Label class="text-[11px] text-muted-foreground">步长 (Step)</Label>
              <Input
                v-model.number="draft.step"
                type="number"
                class="h-7 text-xs"
              />
            </div>
          </div>
          <div class="flex flex-col gap-1.5 mt-1">
            <div class="flex items-center justify-between">
              <Label class="text-xs">默认数值 (Default): {{ draft.default }}</Label>
            </div>
            <Slider
              v-model="draft.default"
              :min="draft.min"
              :max="draft.max"
              :step="draft.step ?? 1"
              show-value
            />
          </div>
        </template>

        <!-- Textarea Sub-controls -->
        <template v-else-if="draft.type === 'textarea'">
          <div class="flex flex-col gap-1.5">
            <Label class="text-xs">占位提示 (Placeholder)</Label>
            <Input
              v-model="draft.placeholder"
              placeholder="例如: 请输入提示词..."
              class="h-7 text-xs"
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label class="text-xs">默认文本 (Default)</Label>
            <Textarea
              v-model="draft.default"
              placeholder="默认初始内容..."
              class="min-h-16 text-xs resize-none"
            />
          </div>
        </template>

        <!-- Input Sub-controls -->
        <template v-else-if="draft.type === 'input'">
          <div class="flex flex-col gap-1.5">
            <Label class="text-xs">占位提示 (Placeholder)</Label>
            <Input
              v-model="draft.placeholder"
              placeholder="例如: https://api.openai.com/v1"
              class="h-7 text-xs"
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label class="text-xs">默认文本 (Default)</Label>
            <Input
              v-model="draft.default"
              placeholder="默认初始内容..."
              class="h-7 text-xs"
            />
          </div>
        </template>
      </div>

      <!-- Footer: Confirm button ONLY for 'add' mode -->
      <div v-if="mode === 'add'" class="pt-2 border-t border-border/70 flex justify-end gap-2">
        <Button variant="ghost" size="sm" class="h-8 text-xs" @click="isOpen = false">
          取消
        </Button>
        <Button size="sm" class="h-8 text-xs gap-1" @click="handleConfirmAdd">
          <Check class="size-3.5" />
          <span>确认添加</span>
        </Button>
      </div>
    </PopoverContent>
  </Popover>
</template>

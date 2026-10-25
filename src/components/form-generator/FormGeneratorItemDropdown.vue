<script setup lang="ts">
import { reactive, ref, watch } from "vue";
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
	PopoverAnchor,
	PopoverContent,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Check, Plus, X } from "@/lib/remix-icons";
import {
	type ControllerType,
	createDefaultController,
	createDefaultSchemaItem,
	roundStep,
	type SchemaItem,
} from "./types";

const props = withDefaults(
	defineProps<{
		open: boolean;
		anchor: HTMLElement | null;
		mode: "add" | "edit";
		item: SchemaItem | null;
		existingIds?: string[];
	}>(),
	{
		existingIds: () => [],
	},
);

const emit = defineEmits<{
	(e: "update:open", value: boolean): void;
	(e: "confirmAdd", item: SchemaItem): void;
	(e: "change"): void;
}>();

const idError = ref("");
const newOptionInput = ref("");

// Internal form state for decoupled editing and draft creation
const form = reactive({
	id: "",
	name: "",
	description: "",
	type: "switch" as ControllerType,
	// Switch
	switchDefault: false,
	// Select
	selectOptions: [] as string[],
	selectDefault: "",
	// Slider
	sliderMin: 0,
	sliderMax: 100,
	sliderStep: 1,
	sliderDefault: 0,
	// Textarea
	textareaPlaceholder: "",
	textareaDefault: "",
	// Input
	inputPlaceholder: "",
	inputDefault: "",
});

function syncFormFromItem(target: SchemaItem) {
	form.id = target.id;
	form.name = target.name;
	form.description = target.description ?? "";
	form.type = target.type;

	if (target.type === "switch") {
		form.switchDefault = target.default;
	} else if (target.type === "select") {
		form.selectOptions = [...target.options];
		form.selectDefault = target.default;
	} else if (target.type === "slider") {
		form.sliderMin = target.min;
		form.sliderMax = target.max;
		form.sliderStep = target.step ?? 1;
		form.sliderDefault = roundStep(target.default, target.step);
	} else if (target.type === "textarea") {
		form.textareaPlaceholder = target.placeholder ?? "";
		form.textareaDefault = target.default;
	} else if (target.type === "input") {
		form.inputPlaceholder = target.placeholder ?? "";
		form.inputDefault = target.default;
	}
}

function resetFormToAddDefaults() {
	form.id = "";
	form.name = "";
	form.description = "";
	form.type = "switch";
	form.switchDefault = false;
	form.selectOptions = ["option1", "option2"];
	form.selectDefault = "option1";
	form.sliderMin = 0;
	form.sliderMax = 100;
	form.sliderStep = 1;
	form.sliderDefault = 0;
	form.textareaPlaceholder = "请输入内容...";
	form.textareaDefault = "";
	form.inputPlaceholder = "请输入...";
	form.inputDefault = "";
}

// When dropdown opens or item changes, reinitialize the form fields
watch(
	() => [props.open, props.item],
	([isOpen]) => {
		if (isOpen) {
			idError.value = "";
			newOptionInput.value = "";
			if (props.mode === "edit" && props.item) {
				syncFormFromItem(props.item);
			} else {
				resetFormToAddDefaults();
			}
		}
	},
	{ immediate: true },
);

function handleIdInput(val: string | number) {
	const str = String(val);
	form.id = str;
	const trimmed = str.trim();

	if (!trimmed) {
		idError.value = "ID 不能为空";
		return;
	}
	if (props.existingIds.includes(trimmed)) {
		idError.value = "该 ID 已存在，请更换";
		return;
	}

	idError.value = "";
	if (props.mode === "edit" && props.item) {
		props.item.id = trimmed;
		emit("change");
	}
}

function handleNameInput(val: string | number) {
	form.name = String(val);
	if (props.mode === "edit" && props.item) {
		props.item.name = form.name;
		emit("change");
	}
}

function handleDescriptionInput(val: string | number) {
	form.description = String(val);
	if (props.mode === "edit" && props.item) {
		props.item.description = form.description;
		emit("change");
	}
}

function handleTypeChange(newTypeStr: string) {
	const newType = newTypeStr as ControllerType;
	form.type = newType;

	if (props.mode === "edit" && props.item) {
		const newController = createDefaultController(newType);
		// Assign controller properties while preserving id, name, description
		Object.assign(props.item, newController);
		syncFormFromItem(props.item);
		emit("change");
	}
}

// Switch handlers
function handleSwitchDefaultChange(val: boolean) {
	form.switchDefault = val;
	if (props.mode === "edit" && props.item && props.item.type === "switch") {
		props.item.default = val;
		emit("change");
	}
}

// Select handlers
function addOption() {
	const opt = newOptionInput.value.trim();
	if (!opt) return;
	if (!form.selectOptions.includes(opt)) {
		form.selectOptions.push(opt);
		if (!form.selectDefault) {
			form.selectDefault = opt;
		}
		if (props.mode === "edit" && props.item && props.item.type === "select") {
			props.item.options = [...form.selectOptions];
			props.item.default = form.selectDefault;
			emit("change");
		}
	}
	newOptionInput.value = "";
}

function removeOption(idx: number) {
	const removed = form.selectOptions[idx];
	form.selectOptions.splice(idx, 1);
	if (form.selectDefault === removed) {
		form.selectDefault = form.selectOptions[0] ?? "";
	}
	if (props.mode === "edit" && props.item && props.item.type === "select") {
		props.item.options = [...form.selectOptions];
		props.item.default = form.selectDefault;
		emit("change");
	}
}

function handleSelectDefaultChange(val: string) {
	form.selectDefault = val;
	if (props.mode === "edit" && props.item && props.item.type === "select") {
		props.item.default = val;
		emit("change");
	}
}

// Slider handlers
function handleSliderMinChange(val: string | number) {
	form.sliderMin = Number(val);
	if (props.mode === "edit" && props.item && props.item.type === "slider") {
		props.item.min = form.sliderMin;
		emit("change");
	}
}

function handleSliderMaxChange(val: string | number) {
	form.sliderMax = Number(val);
	if (props.mode === "edit" && props.item && props.item.type === "slider") {
		props.item.max = form.sliderMax;
		emit("change");
	}
}

function handleSliderStepChange(val: string | number) {
	form.sliderStep = Number(val) || 1;
	form.sliderDefault = roundStep(form.sliderDefault, form.sliderStep);
	if (props.mode === "edit" && props.item && props.item.type === "slider") {
		props.item.step = form.sliderStep;
		props.item.default = form.sliderDefault;
		emit("change");
	}
}

function handleSliderDefaultChange(val: number | number[]) {
	const raw = Array.isArray(val) ? (val[0] ?? 0) : val;
	const rounded = roundStep(raw, form.sliderStep);
	form.sliderDefault = rounded;
	if (props.mode === "edit" && props.item && props.item.type === "slider") {
		props.item.default = rounded;
		emit("change");
	}
}

// Textarea handlers
function handleTextareaPlaceholderChange(val: string | number) {
	form.textareaPlaceholder = String(val);
	if (props.mode === "edit" && props.item && props.item.type === "textarea") {
		props.item.placeholder = form.textareaPlaceholder;
		emit("change");
	}
}

function handleTextareaDefaultChange(val: string | number) {
	form.textareaDefault = String(val);
	if (props.mode === "edit" && props.item && props.item.type === "textarea") {
		props.item.default = form.textareaDefault;
		emit("change");
	}
}

// Input handlers
function handleInputPlaceholderChange(val: string | number) {
	form.inputPlaceholder = String(val);
	if (props.mode === "edit" && props.item && props.item.type === "input") {
		props.item.placeholder = form.inputPlaceholder;
		emit("change");
	}
}

function handleInputDefaultChange(val: string | number) {
	form.inputDefault = String(val);
	if (props.mode === "edit" && props.item && props.item.type === "input") {
		props.item.default = form.inputDefault;
		emit("change");
	}
}

// Confirm Add (ONLY for add mode)
function handleConfirmAdd() {
	const trimmedId = form.id.trim();
	if (!trimmedId) {
		idError.value = "请输入唯一标识 ID";
		return;
	}
	if (props.existingIds.includes(trimmedId)) {
		idError.value = "该 ID 已存在，请更换";
		return;
	}

	const baseItem = createDefaultSchemaItem(
		trimmedId,
		form.name.trim() || trimmedId,
		form.type,
	);
	baseItem.description = form.description.trim();

	if (form.type === "switch") {
		baseItem.default = form.switchDefault;
		baseItem.value = form.switchDefault;
	} else if (form.type === "select") {
		(baseItem as unknown as { options: string[] }).options = [
			...form.selectOptions,
		];
		baseItem.default = form.selectDefault;
		baseItem.value = form.selectDefault;
	} else if (form.type === "slider") {
		const s = baseItem as unknown as {
			min: number;
			max: number;
			step: number;
			default: number;
			value: number;
		};
		s.min = form.sliderMin;
		s.max = form.sliderMax;
		s.step = form.sliderStep;
		s.default = roundStep(form.sliderDefault, form.sliderStep);
		s.value = s.default;
	} else if (form.type === "textarea") {
		(baseItem as unknown as { placeholder: string }).placeholder =
			form.textareaPlaceholder;
		baseItem.default = form.textareaDefault;
		baseItem.value = form.textareaDefault;
	} else if (form.type === "input") {
		(baseItem as unknown as { placeholder: string }).placeholder =
			form.inputPlaceholder;
		baseItem.default = form.inputDefault;
		baseItem.value = form.inputDefault;
	}

	emit("confirmAdd", baseItem);
	emit("update:open", false);
}
</script>

<template>
  <Popover :open="open" @update:open="(val) => emit('update:open', val)">
    <!-- Anchor decoupled to target element -->
    <PopoverAnchor v-if="anchor" :reference="anchor" />

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
        <div class="flex items-center gap-1.5">
          <span class="text-[11px] text-muted-foreground font-mono">
            {{ form.type }}
          </span>
          <button
            type="button"
            class="text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors"
            title="关闭浮窗"
            @click="emit('update:open', false)"
          >
            <X class="size-3.5" />
          </button>
        </div>
      </div>

      <!-- ID field -->
      <div class="flex flex-col gap-1.5">
        <div class="flex items-center justify-between">
          <Label class="text-xs font-medium">标识符 (ID / Key)</Label>
          <span v-if="idError" class="text-[11px] text-destructive">{{ idError }}</span>
        </div>
        <Input
          :model-value="form.id"
          placeholder="例如: temperature, max_tokens"
          class="h-8 text-xs font-mono"
          @update:model-value="handleIdInput"
        />
        <p class="text-[10px] text-muted-foreground">用于映射配置结果对象的唯一键名</p>
      </div>

      <!-- Name field -->
      <div class="flex flex-col gap-1.5">
        <Label class="text-xs font-medium">显示名称 (Name)</Label>
        <Input
          :model-value="form.name"
          placeholder="例如: 采样温度"
          class="h-8 text-xs"
          @update:model-value="handleNameInput"
        />
      </div>

      <!-- Description field -->
      <div class="flex flex-col gap-1.5">
        <Label class="text-xs font-medium">描述信息 (Description)</Label>
        <Textarea
          :model-value="form.description"
          placeholder="关于该参数作用的提示说明..."
          class="min-h-14 text-xs py-1.5 resize-none"
          @update:model-value="handleDescriptionInput"
        />
      </div>

      <!-- Type Selector -->
      <div class="flex flex-col gap-1.5">
        <Label class="text-xs font-medium">控件类型 (Type)</Label>
        <Select
          :model-value="form.type"
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
        <template v-if="form.type === 'switch'">
          <div class="flex items-center justify-between py-1">
            <Label class="text-xs">默认状态 (Default)</Label>
            <Switch
              :model-value="form.switchDefault"
              @update:model-value="handleSwitchDefaultChange"
            />
          </div>
        </template>

        <!-- Select Sub-controls -->
        <template v-else-if="form.type === 'select'">
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
                v-for="(opt, idx) in form.selectOptions"
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
              <Select
                :model-value="form.selectDefault"
                @update:model-value="handleSelectDefaultChange"
              >
                <SelectTrigger class="h-7 text-xs">
                  <SelectValue placeholder="选择默认选项" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="opt in form.selectOptions"
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
        <template v-else-if="form.type === 'slider'">
          <div class="grid grid-cols-3 gap-2">
            <div class="flex flex-col gap-1">
              <Label class="text-[11px] text-muted-foreground">最小值 (Min)</Label>
              <Input
                :model-value="form.sliderMin"
                type="number"
                class="h-7 text-xs"
                @update:model-value="handleSliderMinChange"
              />
            </div>
            <div class="flex flex-col gap-1">
              <Label class="text-[11px] text-muted-foreground">最大值 (Max)</Label>
              <Input
                :model-value="form.sliderMax"
                type="number"
                class="h-7 text-xs"
                @update:model-value="handleSliderMaxChange"
              />
            </div>
            <div class="flex flex-col gap-1">
              <Label class="text-[11px] text-muted-foreground">步长 (Step)</Label>
              <Input
                :model-value="form.sliderStep"
                type="number"
                class="h-7 text-xs"
                @update:model-value="handleSliderStepChange"
              />
            </div>
          </div>
          <div class="flex flex-col gap-1.5 mt-1">
            <div class="flex items-center justify-between">
              <Label class="text-xs">默认数值 (Default): {{ form.sliderDefault }}</Label>
            </div>
            <Slider
              :model-value="form.sliderDefault"
              :min="form.sliderMin"
              :max="form.sliderMax"
              :step="form.sliderStep || 1"
              show-value
              :format-value="(val) => String(roundStep(val, form.sliderStep))"
              @update:model-value="handleSliderDefaultChange"
            />
          </div>
        </template>

        <!-- Textarea Sub-controls -->
        <template v-else-if="form.type === 'textarea'">
          <div class="flex flex-col gap-1.5">
            <Label class="text-xs">占位提示 (Placeholder)</Label>
            <Input
              :model-value="form.textareaPlaceholder"
              placeholder="例如: 请输入提示词..."
              class="h-7 text-xs"
              @update:model-value="handleTextareaPlaceholderChange"
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label class="text-xs">默认文本 (Default)</Label>
            <Textarea
              :model-value="form.textareaDefault"
              placeholder="默认初始内容..."
              class="min-h-16 text-xs resize-none"
              @update:model-value="handleTextareaDefaultChange"
            />
          </div>
        </template>

        <!-- Input Sub-controls -->
        <template v-else-if="form.type === 'input'">
          <div class="flex flex-col gap-1.5">
            <Label class="text-xs">占位提示 (Placeholder)</Label>
            <Input
              :model-value="form.inputPlaceholder"
              placeholder="例如: https://api.openai.com/v1"
              class="h-7 text-xs"
              @update:model-value="handleInputPlaceholderChange"
            />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label class="text-xs">默认文本 (Default)</Label>
            <Input
              :model-value="form.inputDefault"
              placeholder="默认初始内容..."
              class="h-7 text-xs"
              @update:model-value="handleInputDefaultChange"
            />
          </div>
        </template>
      </div>

      <!-- Footer: Confirm button ONLY for 'add' mode -->
      <div v-if="mode === 'add'" class="pt-2 border-t border-border/70 flex justify-end gap-2">
        <Button variant="ghost" size="sm" class="h-8 text-xs" @click="emit('update:open', false)">
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

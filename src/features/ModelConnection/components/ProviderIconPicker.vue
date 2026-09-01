<script setup lang="ts">
import { computed, ref } from "vue";
import { PaginatedGrid } from "@/components/ui/paginated-grid";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
	providerIconIds,
	providerIconUrl,
	useProviderIconVariant,
} from "../services/provider-icons";

const props = defineProps<{
	modelValue?: string;
	name?: string;
}>();

const emit = defineEmits<{
	"update:modelValue": [iconId: string];
}>();

const open = ref(false);
const variant = useProviderIconVariant();
const selectedIconId = computed(() => props.modelValue || "openai");
const triggerIconUrl = computed(() =>
	providerIconUrl(selectedIconId.value, undefined, variant.value),
);
const iconEntries = computed(() =>
	providerIconIds.map((id) => ({
		id,
		url: providerIconUrl(id, undefined, variant.value),
	})),
);

function selectIcon(iconId: string) {
	emit("update:modelValue", iconId);
	open.value = false;
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <button
        type="button"
        class="flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-lg border bg-background transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        title="点击更换图标"
      >
        <img class="size-7 object-contain" :src="triggerIconUrl" :alt="name || '服务商图标'" />
      </button>
    </PopoverTrigger>

    <PopoverContent align="end" :side-offset="6" class="w-80 p-2">
      <PaginatedGrid :items="iconEntries" :columns="4" :rows="5" @select="selectIcon($event.id)">
        <template #cell="{ item }">
          <img
            :src="item.url"
            :alt="item.id"
            :class="cn(
              'size-7 rounded-sm object-contain',
              item.id === selectedIconId && 'ring-2 ring-primary ring-offset-2 ring-offset-popover',
            )"
          />
        </template>
      </PaginatedGrid>
    </PopoverContent>
  </Popover>
</template>

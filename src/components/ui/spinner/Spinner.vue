<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { Loader2Icon } from '@/lib/phosphor-icons'
import { cn } from '@/lib/utils.ts'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <Loader2Icon role="status" aria-label="Loading" :class="cn('size-4 animate-spin', props.class)" />
</template>

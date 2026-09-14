<script setup lang="ts">
import type { PrimitiveProps } from 'reka-ui'

import { MinusIcon } from '@/lib/phosphor-icons'
import { Primitive, useForwardProps } from 'reka-ui'

const props = defineProps<PrimitiveProps>()
const forwardedProps = useForwardProps(props)
</script>

<template>
  <Primitive
    data-slot="pin-input-separator"
    v-bind="forwardedProps"
  >
    <slot>
      <MinusIcon />
    </slot>
  </Primitive>
</template>

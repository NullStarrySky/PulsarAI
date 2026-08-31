<script setup lang="ts">
export interface PluginAssetTreeBranch {
  row: any;
  children: PluginAssetTreeBranch[];
}

const props = defineProps<{
  branch: PluginAssetTreeBranch;
  isExpanded: (row: any) => boolean;
}>();

function beforeEnter(element: Element) {
  const node = element as HTMLElement;
  node.style.height = "0";
  node.style.opacity = "0";
}

function enter(element: Element) {
  const node = element as HTMLElement;
  requestAnimationFrame(() => {
    node.style.height = `${node.scrollHeight}px`;
    node.style.opacity = "1";
  });
}

function afterEnter(element: Element) {
  (element as HTMLElement).style.height = "";
}

function beforeLeave(element: Element) {
  (element as HTMLElement).style.height = `${(element as HTMLElement).scrollHeight}px`;
}

function leave(element: Element) {
  const node = element as HTMLElement;
  requestAnimationFrame(() => {
    node.style.height = "0";
    node.style.opacity = "0";
  });
}
</script>

<template>
  <div class="tree-branch space-y-0.5">
    <slot :row="branch.row" />
    <Transition
      name="tree-branch-content"
      @before-enter="beforeEnter"
      @enter="enter"
      @after-enter="afterEnter"
      @before-leave="beforeLeave"
      @leave="leave"
    >
      <div v-if="branch.children.length && isExpanded(branch.row)" class="tree-branch-children">
        <PluginAssetTreeBranch
          v-for="child in branch.children"
          :key="child.row.key"
          :branch="child"
          :is-expanded="isExpanded"
        >
          <template #default="slotProps"><slot v-bind="slotProps" /></template>
        </PluginAssetTreeBranch>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.tree-branch-content-enter-active,
.tree-branch-content-leave-active {
  overflow: hidden;
  transition: height 180ms cubic-bezier(0.16, 1, 0.3, 1), opacity 180ms ease;
}

@media (prefers-reduced-motion: reduce) {
  .tree-branch-content-enter-active,
  .tree-branch-content-leave-active {
    transition: none;
  }
}
</style>

import { Fragment, type VNode } from "vue";

/**
 * 递归展开 slot 渲染结果里的 Fragment（v-for / template 包裹会产生
 * Fragment vnode），返回所有「真实」子 vnode（跳过注释与空白文本）。
 * slot 扫描类逻辑（CardGroup / RadioGroup / TabsList 等）必须用它，
 * 否则 v-for 包一层 Fragment 就会全部漏扫。
 */
export function flattenSlotVnodes(vnodes: VNode[] | undefined | null): VNode[] {
  if (!vnodes) return [];
  const out: VNode[] = [];
  const queue = [...vnodes];
  while (queue.length) {
    const v = queue.shift()!;
    if (v.type === Fragment) {
      if (Array.isArray(v.children)) queue.unshift(...(v.children as VNode[]));
      continue;
    }
    // 组件/元素 vnode 直接保留；文本节点保留非空白的。
    if (Array.isArray(v.children) && v.children.length && typeof v.type !== "string") {
      // 组件 vnode 的 children 是 slot 对象，不会是数组；数组成员只出现在
      // 嵌套 Fragment 中（上面已处理）。保留本身。
    }
    out.push(v);
  }
  return out;
}

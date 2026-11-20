import { Comment, Fragment, Text, type VNode } from "vue";

/**
 * 从 slot 渲染结果里取第一个「真实」子节点（跳过注释节点与空白文本），
 * 供 asChild 风格的组件找到要克隆/合并的元素。
 */
export function flattenAllowedChildren(
  children: VNode[] | undefined | null
): VNode | null {
  if (!children) return null;
  const queue = [...children];
  while (queue.length) {
    const vnode = queue.shift()!;
    if (vnode.type === Comment) continue;
    if (vnode.type === Fragment) {
      if (Array.isArray(vnode.children)) queue.unshift(...(vnode.children as VNode[]));
      continue;
    }
    if (vnode.type === Text && typeof vnode.children === "string" && !vnode.children.trim())
      continue;
    return vnode;
  }
  return null;
}

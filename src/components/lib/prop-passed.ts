import { getCurrentInstance, type ComponentInternalInstance } from "vue";

/**
 * 判断调用方是否真的传了某个 prop（键存在性检查）。
 *
 * Vue 会把声明为 Boolean 的可选 prop 在未传时 cast 成 false（而非
 * undefined），所以「受控/三态」判断不能依赖 `props.x !== undefined`。
 * 同时 vnode.props 保留原始键名——`:force-open` 传入的键是
 * "force-open" 而不是 "forceOpen"，两种形态都要检查。
 */
export function propPassed(instance: ComponentInternalInstance | null, name: string): boolean {
  if (!instance) return false;
  const props = instance.vnode.props as Record<string, unknown> | null;
  if (!props) return false;
  if (name in props) return true;
  const kebab = name.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
  return kebab !== name && kebab in props;
}

/** setup 内便捷形式：返回静态布尔（vnode.props 在挂载后不变）。 */
export function usePropPassed(name: string): boolean {
  return propPassed(getCurrentInstance(), name);
}

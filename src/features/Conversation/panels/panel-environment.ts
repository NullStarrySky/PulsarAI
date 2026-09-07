import { computed, ref, watch } from "vue";

export type PanelDirection = "vertical" | "horizontal";
type PanelEnvironment = { left: PanelDirection; right: PanelDirection };
const key = "pulsarai:conversation-panels:v1";
const initial = (() => {
	try {
		const value = JSON.parse(localStorage.getItem(key) ?? "{}") as Partial<PanelEnvironment>;
		return { left: value.left === "horizontal" ? "horizontal" : "vertical", right: value.right === "horizontal" ? "horizontal" : "vertical" } as PanelEnvironment;
	} catch { return { left: "vertical", right: "vertical" } as PanelEnvironment; }
})();
const left = ref<PanelDirection>(initial.left);
const right = ref<PanelDirection>(initial.right);
watch([left, right], () => localStorage.setItem(key, JSON.stringify({ left: left.value, right: right.value })), { flush: "post" });

/** Environment-only panel arrangement; no Plugin or Conversation write occurs here. */
export function usePanelEnvironment() {
	return { left, right, values: computed(() => ({ left: left.value, right: right.value })) };
}

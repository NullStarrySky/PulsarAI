import { defineComponent, type VNode } from "vue";

/** 渲染一组原始 VNode 的辅助组件（slot 内容重排时使用）。 */
export const VNodes = defineComponent({
  name: "VNodes",
  props: {
    vnodes: { type: Array as () => VNode[], required: true },
  },
  setup: (props) => () => props.vnodes,
});

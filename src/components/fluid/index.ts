// fluid-vue —— Fluid Functionalism UI 组件的 Vue 3 实现
export { spring } from "./lib/springs";

// ── UI Components ──
export { default as Button } from "./components/ui/button/Button.vue";
export { default as Badge } from "./components/ui/badge/Badge.vue";
export { default as Switch } from "./components/ui/switch/Switch.vue";

// ── Dialog ──
export { default as Dialog } from "./components/ui/dialog/Dialog.vue";
export { default as DialogContent } from "./components/ui/dialog/DialogContent.vue";
export { default as DialogHeader } from "./components/ui/dialog/DialogHeader.vue";
export { default as DialogFooter } from "./components/ui/dialog/DialogFooter.vue";
export { default as DialogTitle } from "./components/ui/dialog/DialogTitle.vue";
export { default as DialogDescription } from "./components/ui/dialog/DialogDescription.vue";
export { DialogTrigger, DialogClose } from "reka-ui";

// ── Chat ──
export { default as ChatMessage } from "./components/ui/chat/ChatMessage.vue";

// ── Thinking ──
export { default as ThinkingIndicator } from "./components/ui/thinking-indicator/ThinkingIndicator.vue";
export { default as ThinkingSteps } from "./components/ui/thinking-steps/ThinkingSteps.vue";
export { default as ThinkingStepsHeader } from "./components/ui/thinking-steps/ThinkingStepsHeader.vue";
export { default as ThinkingStepsContent } from "./components/ui/thinking-steps/ThinkingStepsContent.vue";
export { default as ThinkingStep } from "./components/ui/thinking-steps/ThinkingStep.vue";

// ── ColorPicker ──
export { default as ColorPicker } from "./components/ui/color-picker/ColorPicker.vue";
export { default as ColorPickerPopover } from "./components/ui/color-picker/ColorPickerPopover.vue";

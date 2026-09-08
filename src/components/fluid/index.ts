// fluid-vue —— Fluid Functionalism UI 组件的 Vue 3 移植。
export { cn } from "./lib/utils";
export { fontWeights } from "./lib/font-weight";
export { spring, exitFallbackMs } from "./lib/springs";
export {
  provideIcons,
  useIcon,
  useIcons,
  defaultIcons,
  type IconName,
  type IconComponent,
  type IconOverrides,
} from "./lib/icon-context";
export {
  provideShape,
  useShape,
  useShapeContext,
  shapeMap,
  type ShapeVariant,
  type ShapeClasses,
} from "./lib/shape-context";
export {
  provideSize,
  useSize,
  useSizeVariant,
  useSizeContext,
  useTypeScale,
  sizeMap,
  typeScale,
  type SizeVariant,
  type SizeClasses,
  type TypeScale,
  type TypeScaleRole,
} from "./lib/size-context";
export { useSurface, provideSurface } from "./lib/surface-context";
export {
  surfaceClasses,
  surfaceHoverClasses,
  SURFACE_BG,
  SURFACE_SHADOW,
} from "./lib/surface-classes";
export { default as Elevated } from "./lib/Elevated.vue";

export {
  useProximityHover,
  useRegisterProximityItem,
  type ItemRect,
  type UseProximityHoverOptions,
} from "./hooks/use-proximity-hover";
export {
  useMergeSplitBlocks,
} from "./hooks/use-merge-split";
export type { SelBlock, Run } from "./hooks/use-merge-split";
export { default as SelectionBackgrounds } from "./hooks/SelectionBackgrounds.vue";
export { useTouchPrimary } from "./hooks/use-touch-primary";

export { default as Button } from "./components/ui/button/Button.vue";
export {
  buttonVariants,
  type ButtonVariant,
  type ButtonSize,
  type ButtonSizeCanonical,
} from "./components/ui/button/button-variants";
export { default as Badge } from "./components/ui/badge/Badge.vue";
export {
  badgeColors,
  type BadgeColor,
  type BadgeSize,
  type BadgeSizeCanonical,
} from "./components/ui/badge/badge-variants";

export { default as Accordion } from "./components/ui/accordion/Accordion.vue";
export { default as AccordionGroup } from "./components/ui/accordion/AccordionGroup.vue";
export { default as AccordionItem } from "./components/ui/accordion/AccordionItem.vue";
export { default as AccordionTrigger } from "./components/ui/accordion/AccordionTrigger.vue";
export { default as AccordionContent } from "./components/ui/accordion/AccordionContent.vue";

export { default as Card } from "./components/ui/card/Card.vue";
export { default as CardGroup } from "./components/ui/card/CardGroup.vue";
export {
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
  CardFooter,
  CardMedia,
  CardImage,
  CardEyebrow,
  CardFeature,
  CardButton,
  type CardLogo,
} from "./components/ui/card/card-parts";

export { default as Dialog } from "./components/ui/dialog/Dialog.vue";
export { default as DialogContent } from "./components/ui/dialog/DialogContent.vue";
export { default as DialogHeader } from "./components/ui/dialog/DialogHeader.vue";
export { default as DialogFooter } from "./components/ui/dialog/DialogFooter.vue";
export { default as DialogTitle } from "./components/ui/dialog/DialogTitle.vue";
export { default as DialogDescription } from "./components/ui/dialog/DialogDescription.vue";
export {
  DialogTrigger,
  DialogClose,
} from "reka-ui";

export { default as Dropdown } from "./components/ui/dropdown/Dropdown.vue";
export { default as DropdownMenu } from "./components/ui/dropdown/DropdownMenu.vue";
export { default as DropdownTrigger } from "./components/ui/dropdown/DropdownTrigger.vue";
export { default as DropdownMenuTrigger } from "./components/ui/dropdown/DropdownTrigger.vue";
export { default as DropdownContent } from "./components/ui/dropdown/DropdownContent.vue";
export { default as DropdownMenuContent } from "./components/ui/dropdown/DropdownContent.vue";
export { default as DropdownMenuGroup } from "./components/ui/dropdown/DropdownMenuGroup.vue";
export { default as DropdownMenuSub } from "./components/ui/dropdown/DropdownMenuSub.vue";
export { default as DropdownMenuSubTrigger } from "./components/ui/dropdown/DropdownMenuSubTrigger.vue";
export { default as DropdownMenuSubContent } from "./components/ui/dropdown/DropdownMenuSubContent.vue";
export { default as DropdownLabel } from "./components/ui/dropdown/DropdownLabel.vue";
export { default as DropdownMenuLabel } from "./components/ui/dropdown/DropdownLabel.vue";
export { default as DropdownSeparator } from "./components/ui/dropdown/DropdownSeparator.vue";
export { default as DropdownMenuSeparator } from "./components/ui/dropdown/DropdownSeparator.vue";
export { default as MenuItem } from "./components/ui/dropdown/MenuItem.vue";
export { default as DropdownMenuItem } from "./components/ui/dropdown/MenuItem.vue";
export {
  useDropdown,
  useDropdownMaybe,
  type DropdownContextValue,
} from "./components/ui/dropdown/dropdown-context";

export { default as RadioGroup } from "./components/ui/radio/RadioGroup.vue";
export { default as RadioItem } from "./components/ui/radio/RadioItem.vue";
export { default as RadioGroupItem } from "./components/ui/radio/RadioItem.vue";

export { default as CheckboxGroup } from "./components/ui/checkbox/CheckboxGroup.vue";
export { default as CheckboxItem } from "./components/ui/checkbox/CheckboxItem.vue";

export { default as Combobox } from "./components/ui/combobox/Combobox.vue";
export type { ComboboxItemData } from "./components/ui/combobox/Combobox.vue";

export { default as Select } from "./components/ui/select/Select.vue";
export { default as SelectTrigger } from "./components/ui/select/SelectTrigger.vue";
export { default as SelectValue } from "./components/ui/select/SelectValue.vue";
export { default as SelectContent } from "./components/ui/select/SelectContent.vue";
export { default as SelectItem } from "./components/ui/select/SelectItem.vue";
export {
  SelectGroup,
  SelectLabel,
  SelectSeparator,
} from "./components/ui/select/select-parts";

export { default as Slider } from "./components/ui/slider/Slider.vue";
export { default as SliderCompact } from "./components/ui/slider/SliderCompact.vue";
export { default as SliderComfortable } from "./components/ui/slider/SliderComfortable.vue";
export type { SliderValue } from "./components/ui/slider/SliderCompact.vue";
export type { ComfortableVariant } from "./components/ui/slider/SliderComfortable.vue";

export { default as Switch } from "./components/ui/switch/Switch.vue";

export { default as Tabs } from "./components/ui/tabs/Tabs.vue";
export { default as TabsList } from "./components/ui/tabs/TabsList.vue";
export { default as TabItem } from "./components/ui/tabs/TabItem.vue";
export { default as TabsTrigger } from "./components/ui/tabs/TabItem.vue";
export { default as TabPanel } from "./components/ui/tabs/TabPanel.vue";
export { default as TabsContent } from "./components/ui/tabs/TabsContent.vue";

export { default as ThinkingIndicator } from "./components/ui/thinking-indicator/ThinkingIndicator.vue";

export { default as Tooltip } from "./components/ui/tooltip/Tooltip.vue";
export { default as TooltipProvider } from "./components/ui/tooltip/TooltipProvider.vue";
export { default as TooltipTrigger } from "./components/ui/tooltip/TooltipTrigger.vue";
export { default as TooltipContent } from "./components/ui/tooltip/TooltipContent.vue";

// ── chat（ChatMessage / InputMessage / FileThumbnail）──
export { default as ChatMessage } from "./components/ui/chat/ChatMessage.vue";
export { default as InputMessage } from "./components/ui/chat/InputMessage.vue";
export type {
  InputMessageProps,
  InputMessageSlotContext,
  InputMessageSuggestionGroup,
} from "./components/ui/chat/InputMessage.vue";
export { default as FileThumbnail } from "./components/ui/chat/FileThumbnail.vue";

// ── tabs-subtle ──
export { default as TabsSubtle } from "./components/ui/tabs-subtle/TabsSubtle.vue";
export { default as TabsSubtleItem } from "./components/ui/tabs-subtle/TabsSubtleItem.vue";
export { default as TabsSubtlePanel } from "./components/ui/tabs-subtle/TabsSubtlePanel.vue";

// ── thinking-steps ──
export { default as ThinkingSteps } from "./components/ui/thinking-steps/ThinkingSteps.vue";
export { default as ThinkingStepsHeader } from "./components/ui/thinking-steps/ThinkingStepsHeader.vue";
export { default as ThinkingStepsContent } from "./components/ui/thinking-steps/ThinkingStepsContent.vue";
export { default as ThinkingStep } from "./components/ui/thinking-steps/ThinkingStep.vue";
export { default as ThinkingStepDetails } from "./components/ui/thinking-steps/ThinkingStepDetails.vue";
export { default as ThinkingStepSources } from "./components/ui/thinking-steps/ThinkingStepSources.vue";
export { default as ThinkingStepSource } from "./components/ui/thinking-steps/ThinkingStepSource.vue";
export { default as ThinkingStepImage } from "./components/ui/thinking-steps/ThinkingStepImage.vue";
export type { StepStatus } from "./components/ui/thinking-steps/thinking-steps-context";

// ── ask-user-questions ──
export { default as AskUserQuestions } from "./components/ui/ask-user-questions/AskUserQuestions.vue";
export type {
  AskUserQuestion,
  AskUserOption,
  AskUserAnswer,
} from "./components/ui/ask-user-questions/ask-user-questions-types";

// ── color-picker ──
export { default as ColorPicker } from "./components/ui/color-picker/ColorPicker.vue";
export { default as ColorPickerPopover } from "./components/ui/color-picker/ColorPickerPopover.vue";
export {
  parseColor,
  buildParsed,
  type ColorFormat,
  type ParsedColor,
} from "./components/ui/color-picker/color-math";

// ── input-copy ──
export { default as InputCopy } from "./components/ui/input-copy/InputCopy.vue";
export type {
  InputCopyProps,
  InputCopyVariant,
  InputCopyAlign,
} from "./components/ui/input-copy/InputCopy.vue";

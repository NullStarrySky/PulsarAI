import { inject, provide, computed, type Component, type ComputedRef, type InjectionKey } from "vue";
import {
  ChevronRight,
  ChevronDown,
  X,
  Copy,
  Menu,
  Dot,
  Monitor,
  Sun,
  Moon,
  RectangleHorizontal,
  Circle,
  SquareLibrary,
  Clock,
  Star,
  Settings,
  Plus,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Search,
  Loader,
  Users,
  Lock,
  Mail,
  Bell,
  Shield,
  Palette,
  Lightbulb,
  Rocket,
  Heart,
  Paintbrush,
  Brain,
  Globe,
  User,
  ImageIcon,
  Link,
  Check,
  RotateCcw,
  Play,
  Pause,
  Pipette,
  Home,
  MessageCircle,
  Inbox,
  Pencil,
  Scaling,
  SkipForward,
  CornerDownRight,
  CornerDownLeft,
  PanelLeft,
  PanelRight,
  ChevronsUpDown,
  Ellipsis,
  EllipsisVertical,
  Calendar,
  Folder,
  SlidersHorizontal,
} from "lucide-vue-next";

export interface IconComponentProps {
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export type IconComponent = Component<any>;

export type IconName =
  | "chevron-right" | "chevron-down" | "x" | "copy" | "menu" | "dot"
  | "monitor" | "sun" | "moon" | "rectangle-horizontal" | "circle"
  | "square-library" | "clock" | "star" | "settings"
  | "plus" | "arrow-left" | "arrow-right" | "arrow-up" | "arrow-down"
  | "search" | "loader"
  | "users" | "lock" | "mail" | "bell" | "shield" | "palette"
  | "lightbulb" | "rocket" | "heart" | "paintbrush" | "brain"
  | "globe" | "user"
  | "image" | "link" | "check" | "rotate-ccw"
  | "play" | "pause" | "pipette"
  | "home" | "message-circle" | "inbox"
  | "pencil" | "scaling" | "skip-forward" | "corner-down-right" | "corner-down-left"
  | "panel-left" | "panel-right" | "chevrons-up-down" | "more-horizontal" | "more-vertical" | "calendar" | "folder"
  | "sliders-horizontal";

export const defaultIcons: Record<IconName, IconComponent> = {
  "chevron-right": ChevronRight,
  "chevron-down": ChevronDown,
  "pipette": Pipette,
  "x": X,
  "copy": Copy,
  "menu": Menu,
  "dot": Dot,
  "monitor": Monitor,
  "sun": Sun,
  "moon": Moon,
  "rectangle-horizontal": RectangleHorizontal,
  "circle": Circle,
  "square-library": SquareLibrary,
  "clock": Clock,
  "star": Star,
  "settings": Settings,
  "plus": Plus,
  "arrow-left": ArrowLeft,
  "arrow-right": ArrowRight,
  "arrow-up": ArrowUp,
  "arrow-down": ArrowDown,
  "search": Search,
  "loader": Loader,
  "users": Users,
  "lock": Lock,
  "mail": Mail,
  "bell": Bell,
  "shield": Shield,
  "palette": Palette,
  "lightbulb": Lightbulb,
  "rocket": Rocket,
  "heart": Heart,
  "paintbrush": Paintbrush,
  "brain": Brain,
  "globe": Globe,
  "user": User,
  "image": ImageIcon,
  "link": Link,
  "check": Check,
  "rotate-ccw": RotateCcw,
  "play": Play,
  "pause": Pause,
  "home": Home,
  "message-circle": MessageCircle,
  "inbox": Inbox,
  "pencil": Pencil,
  "scaling": Scaling,
  "skip-forward": SkipForward,
  "corner-down-right": CornerDownRight,
  "corner-down-left": CornerDownLeft,
  "panel-left": PanelLeft,
  "panel-right": PanelRight,
  "chevrons-up-down": ChevronsUpDown,
  "more-horizontal": Ellipsis,
  "more-vertical": EllipsisVertical,
  "calendar": Calendar,
  "folder": Folder,
  "sliders-horizontal": SlidersHorizontal,
};

export type IconOverrides = Partial<Record<IconName, IconComponent>>;

const IconKey: InjectionKey<Record<IconName, IconComponent>> = Symbol("fluid-icons");

/**
 * 换掉部分或全部图标（传入来自其他图标库的组件）。
 * 未覆盖的名字继续使用默认的 Lucide 组件。
 */
export function provideIcons(icons?: IconOverrides) {
  const value: Record<IconName, IconComponent> = { ...defaultIcons, ...icons };
  provide(IconKey, value);
  return value;
}

/**
 * 返回单个图标组件；无 Provider 时回退到默认（Lucide）集合。
 */
export function useIcon(name: IconName): IconComponent {
  const icons = inject(IconKey, null);
  return (icons ?? defaultIcons)[name];
}

/** 图标映射的响应式读取（模板中绑定动态图标时使用）。 */
export function useIcons(): ComputedRef<Record<IconName, IconComponent>> {
  const icons = inject(IconKey, null);
  return computed(() => icons ?? defaultIcons);
}

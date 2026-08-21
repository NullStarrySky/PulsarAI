import type { ModelApiType } from "@/features/ModelConnection/model-provider";

export type PluginConfigValue =
  | null
  | boolean
  | number
  | string
  | PluginConfigValue[]
  | { [key: string]: PluginConfigValue };

export interface PluginConfigRendererBase {
  /** Display name in the config editor. The object key is the persistent ID. */
  title?: string;
  description?: string;
}

export type PluginConfigRenderer =
  | (PluginConfigRendererBase & { name: "Checkbox" | "Switch" })
  | (PluginConfigRendererBase & {
      name: "Input";
      placeholder?: string;
      type?: string;
      min?: number;
      max?: number;
      step?: number;
    })
  | (PluginConfigRendererBase & {
      name: "Slider";
      min?: number;
      max?: number;
      step?: number;
      suffix?: string;
    })
  | (PluginConfigRendererBase & { name: "Textarea"; placeholder?: string })
  | (PluginConfigRendererBase & {
      name: "Select";
      placeholder?: string;
      options: Array<{ label: string; value: PluginConfigValue }>;
    })
  | (PluginConfigRendererBase & { name: "ModelSelect"; apiType?: ModelApiType })
  | (PluginConfigRendererBase & { name: "MediaSelect"; allowEmpty?: boolean })
  | (PluginConfigRendererBase & {
      name: "PathSelect";
      pathRegex?: string;
      slotId?: string;
      allowEmpty?: boolean;
    })
  | (PluginConfigRendererBase & {
      /** A plugin-provided renderer name; props remain plain JSON. */
      name: string;
      props?: Record<string, PluginConfigValue>;
    });

export interface PluginConfigEntry {
  renderer: PluginConfigRenderer;
  value: PluginConfigValue;
}

export type PluginConfig = Record<string, PluginConfigEntry>;

export function createPluginConfig(): PluginConfig {
  return {
    model: {
      renderer: {
        name: "ModelSelect",
        title: "模型",
        description: "留空时继承全局默认模型；引用可附带思考强度。",
      },
      value: null,
    },
    background: {
      renderer: {
        name: "PathSelect",
        title: "会话背景",
        description: "从 background slot 选择扩展名无关的路径 ID。",
        slotId: "background",
        allowEmpty: true,
      },
      value: null,
    },
  };
}

import type { ModelSelection, RequestKind } from "@/features/Request/types";

export type PluginConfigValue =
	| null
	| boolean
	| number
	| string
	| ModelSelection
	| PluginConfigValue[]
	| { [key: string]: PluginConfigValue };

interface PluginConfigRendererBase {
	/** Display name in the config editor. The object key is the persistent ID. */
	title?: string;
	description?: string;
}

type PluginConfigRenderer =
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
	| (PluginConfigRendererBase & { name: "ModelSelect"; apiType?: RequestKind })
	| (PluginConfigRendererBase & { name: "MediaSelect"; allowEmpty?: boolean })
	| (PluginConfigRendererBase & {
			/** A plugin-provided renderer name; props remain plain JSON. */
			name: "Custom";
			component: string;
			props?: Record<string, PluginConfigValue>;
	  });

export interface PluginConfigEntry {
	renderer: PluginConfigRenderer;
	/** Authoring fallback used when an entry has not been customized. */
	defaultValue?: PluginConfigValue;
	value: PluginConfigValue;
}

export type PluginConfig = Record<string, PluginConfigEntry>;

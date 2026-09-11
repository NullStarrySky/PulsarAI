import type { ModelApiType } from "@/features/ModelConnection/model-provider";

export type PluginConfigValue =
	| null
	| boolean
	| number
	| string
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
	| (PluginConfigRendererBase & { name: "ModelSelect"; apiType?: ModelApiType })
	| (PluginConfigRendererBase & { name: "MediaSelect"; allowEmpty?: boolean })
	| (PluginConfigRendererBase & {
			/** A plugin-provided renderer name; props remain plain JSON. */
			name: "Custom";
			component: string;
			props?: Record<string, PluginConfigValue>;
	  });

export interface PluginConfigEntry {
	renderer: PluginConfigRenderer;
	value: PluginConfigValue;
}

export type PluginConfig = Record<string, PluginConfigEntry>;

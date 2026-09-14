import type { Component } from "vue";
import type { Provider } from "../../types";

export interface ProviderRegistration {
	provider: Provider;
	functions?: Record<string, Function>;
	components?: Record<string, Component>;
}

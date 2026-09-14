export interface ServiceProviderView {
	id: string;
	name: string;
	description?: string;
	icon?: string;
	iconUrl?: string;
	enabled: boolean;
	source: "model" | "feature";
}

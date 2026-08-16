export interface ServiceProviderView {
  id: string;
  name: string;
  description?: string;
  iconUrl?: string;
  enabled: boolean;
  canEnable?: boolean;
  source: "model" | "feature";
}

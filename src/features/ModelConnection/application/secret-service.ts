import { invoke } from "@tauri-apps/api/core";

export function hasSecret(name: string) {
  return invoke<boolean>("secret_has", { name });
}

export function setSecret(name: string, value: string) {
  return invoke<void>("secret_set", { name, value });
}

export function clearSecretValue(name: string) {
  return invoke<void>("secret_clear_value", { name });
}

export function deleteSecret(name: string) {
  return invoke<void>("secret_delete", { name });
}

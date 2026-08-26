import { host } from "@/host";

export function hasSecret(name: string) {
  return host.secrets.has(name);
}

export function previewSecret(name: string) {
  return host.secrets.preview(name);
}

export function setSecret(name: string, value: string) {
  return host.secrets.set(name, value);
}

export function clearSecretValue(name: string) {
  return host.secrets.clearValue(name);
}

export function deleteSecret(name: string) {
  return host.secrets.remove(name);
}

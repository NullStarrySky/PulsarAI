import deepseekIcon from "../icons/deepseek.svg";
import googleIcon from "../icons/google.svg";
import openaiIcon from "../icons/openai.svg";

const providerIconMap: Record<string, string> = {
  deepseek: deepseekIcon,
  google: googleIcon,
  openai: openaiIcon,
};

export function providerIconUrl(providerId?: string, fallbackUrl?: string) {
  if (fallbackUrl) {
    return fallbackUrl;
  }

  if (!providerId) {
    return "";
  }

  return providerIconMap[providerId.toLowerCase()] ?? "";
}

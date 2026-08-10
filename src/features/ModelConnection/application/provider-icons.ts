import { ref } from "vue";
import deepseekIcon from "../icons/deepseek.png";
import huggingfaceIcon from "../icons/huggingface.png";
import openaiDarkIcon from "../icons/openai-dark.png";
import openaiLightIcon from "../icons/openai-light.png";

export interface IconVariants {
  light: string;
  dark: string;
}

const isDarkMode = ref(
  typeof document !== "undefined" ? document.documentElement.classList.contains("dark") : false,
);

if (typeof window !== "undefined" && typeof MutationObserver !== "undefined") {
  const observer = new MutationObserver(() => {
    isDarkMode.value = document.documentElement.classList.contains("dark");
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
}

const providerIconMap: Record<string, string | IconVariants> = {
  deepseek: deepseekIcon,
  huggingface: huggingfaceIcon,
  openai: {
    light: openaiLightIcon,
    dark: openaiDarkIcon,
  },
};

export function providerIconUrl(providerId?: string, fallbackUrl?: string): string {
  const rawId = (providerId || "").toLowerCase().trim();

  let icon = rawId ? providerIconMap[rawId] : undefined;
  if (!icon && (rawId.includes("openai") || rawId.includes("gpt"))) {
    icon = providerIconMap["openai"];
  }

  if (icon) {
    if (typeof icon === "string") {
      return icon;
    }
    return isDarkMode.value ? icon.dark : icon.light;
  }

  if (fallbackUrl) {
    const lowerFallback = fallbackUrl.toLowerCase();
    if (
      fallbackUrl === openaiLightIcon ||
      fallbackUrl === openaiDarkIcon ||
      lowerFallback.includes("openai-light") ||
      lowerFallback.includes("openai-dark") ||
      lowerFallback.includes("openai")
    ) {
      return isDarkMode.value ? openaiDarkIcon : openaiLightIcon;
    }
    return fallbackUrl;
  }

  return "";
}

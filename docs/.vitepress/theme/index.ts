import DefaultTheme from "vitepress/theme";
import CapabilityReference from "./CapabilityReference.vue";
import PluginApiReference from "./PluginApiReference.vue";
import "./custom.css";

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component("CapabilityReference", CapabilityReference);
    app.component("PluginApiReference", PluginApiReference);
  },
};

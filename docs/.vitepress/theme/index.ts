import DefaultTheme from "vitepress/theme";
import CapabilityReference from "./CapabilityReference.vue";
import "./custom.css";

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component("CapabilityReference", CapabilityReference);
  },
};

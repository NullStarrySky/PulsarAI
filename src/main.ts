import { createNotivue } from "notivue";
import { createPinia } from "pinia";
import { createApp } from "vue";
import App from "./App.vue";
import "./styles/globals.css";
import "markstream-vue/index.css";
import "katex/dist/katex.min.css";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
import "@milkdown/kit/prose/tables/style/tables.css";
import "@milkdown/kit/prose/view/style/prosemirror.css";
import "notivue/notification.css";
import "notivue/animations.css";
import {
  enableD2,
  enableKatex,
  enableMermaid,
  setInfographicLoader,
} from "markstream-vue";

enableMermaid();
enableKatex();
enableD2();
setInfographicLoader(async () => {
  return await import("@antv/infographic");
});

const app = createApp(App);
const pinia = createPinia();
app.use(pinia).use(createNotivue()).mount("#app");

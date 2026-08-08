import { createApp } from "vue";
import { createPinia } from "pinia";
import { createNotivue } from "notivue";
import App from "./App.vue";
import "./styles/globals.css";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
import "@milkdown/kit/prose/tables/style/tables.css";
import "@milkdown/kit/prose/view/style/prosemirror.css";
import "notivue/notification.css";
import "notivue/animations.css";

const app = createApp(App);
const pinia = createPinia();
app.use(pinia).use(createNotivue()).mount("#app");

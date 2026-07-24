import { createApp } from "vue";
import { createPinia } from "pinia";
import { createNotivue } from "notivue";
import App from "./App.vue";
import "@/features/Resources/Conversation/presentation/register-conversation-workspace";
import "@/features/UI/builtin/presentation/register-builtin-workspace";
import "@/features/UI/schedule/presentation/register-schedule-workspace";
import "./styles/globals.css";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
import "@milkdown/kit/prose/tables/style/tables.css";
import "@milkdown/kit/prose/view/style/prosemirror.css";
import "notivue/notification.css";
import "notivue/animations.css";

createApp(App).use(createPinia()).use(createNotivue()).mount("#app");

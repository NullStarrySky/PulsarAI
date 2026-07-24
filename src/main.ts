import { createApp } from "vue";
import { createPinia } from "pinia";
import { createNotivue } from "notivue";
import App from "./App.vue";
import "./styles/globals.css";
import "notivue/notification.css";
import "notivue/animations.css";

createApp(App).use(createPinia()).use(createNotivue()).mount("#app");

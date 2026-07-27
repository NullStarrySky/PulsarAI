import { fileURLToPath } from "node:url";
import { defineConfig } from "vitepress";

export default defineConfig({
  lang: "zh-CN",
  title: "PulsarAI",
  description: "PulsarAI Feature API 与权限参考",
  cleanUrls: true,
  vite: {
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("../../src", import.meta.url)),
      },
    },
  },
  themeConfig: {
    nav: [
      { text: "指南", link: "/guide/capabilities" },
      { text: "API", link: "/api/" },
    ],
    sidebar: [
      {
        text: "开始",
        items: [
          { text: "文档首页", link: "/" },
          { text: "权限系统", link: "/guide/capabilities" },
        ],
      },
      {
        text: "参考",
        items: [
          { text: "Feature API", link: "/api/" },
          { text: "类型契约", link: "/api/types" },
        ],
      },
    ],
    search: {
      provider: "local",
    },
    outline: {
      level: [2, 3],
      label: "本页目录",
    },
    docFooter: {
      prev: "上一页",
      next: "下一页",
    },
  },
});

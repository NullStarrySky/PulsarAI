# 网络搜索

`WebSearch` 在设置页选择活动提供商，并仅向前端和 Sandbox 暴露 `search({ query, limit })`。浏览器、Playwright driver、页面解析和 Exa Key 都保持在原生侧。

桌面端运行前需要 Node.js 18+。`playwright-rs` 0.15.1 绑定 Playwright 1.61.1；已安装的应用从全局 Node Playwright 查找 driver，因此安装依赖后执行：

```powershell
npm install --global playwright@1.61.1
playwright install chromium
```

第一条命令安装版本锁定的 Playwright driver，第二条安装匹配 Chromium。Chromium 由 Playwright 的浏览器缓存管理，不进入应用安装包。Playwright 失败会明确报告错误，不再回退或下载 Selenium/WebDriver。

Exa 是第二个可选提供商。设置中启用它并填写 Exa API Key 后，原生网络层请求 Exa Search API，使用 `type: "auto"`、`numResults` 和 highlights，并将结果归一化为标题、链接与摘要。前端安装 `exa-js` 作为 Exa Search API 的版本化 TypeScript 集成契约；密钥仍只通过原生 Secret 注入，绝不传回前端。Exa 可在移动端使用。

搜索结果只包含标题、链接与摘要。生成流程应在需要时继续读取原始来源，不把搜索页摘要当作最终事实依据。浏览器能力保持为有界的搜索与摘录，不暴露任意 WebDriver/DOM 执行。

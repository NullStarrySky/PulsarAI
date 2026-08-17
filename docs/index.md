---
layout: home
---

<div class="pulsar-home">
<section class="pulsar-hero" aria-labelledby="home-title">
  <div class="pulsar-hero-copy">
    <p class="pulsar-kicker"><i></i> DESKTOP-NATIVE AI WORKSPACE</p>
    <h1 id="home-title">让每一次推理<br><em>都有自己的轨道。</em></h1>
    <p class="pulsar-intro">PulsarAI 是面向桌面工作流的模型工作台。在同一处配置模型、组织对话、调用工具，并把可复用的能力封装成插件。</p>
    <div class="pulsar-actions"><a class="pulsar-button primary" href="/guide/plugins">开始构建 <b>→</b></a><a class="pulsar-button quiet" href="/guide/conversation">浏览对话系统</a></div>
    <dl class="pulsar-stack"><div><dt>DESKTOP</dt><dd>Tauri</dd></div><div><dt>INTERFACE</dt><dd>Vue 3</dd></div><div><dt>RUNTIME</dt><dd>Rust</dd></div><div><dt>MODELS</dt><dd>AI SDK</dd></div></dl>
  </div>
  <div class="pulsar-visual" aria-label="PulsarAI 对话工作区预览">
    <div class="pulsar-glow one"></div><div class="pulsar-glow two"></div><div class="pulsar-orbit a"></div><div class="pulsar-orbit b"></div>
    <div class="pulsar-window">
      <header><span><i></i><i></i><i></i></span><p>workspace / research</p><b>⌘ K</b></header>
      <div class="pulsar-window-body">
        <aside><strong>P</strong><i class="is-active"></i><i></i><i></i><i></i><small></small></aside>
        <nav><p>CONVERSATIONS</p><b><i></i> Product research</b><b>Documentation map</b><b>Plugin architecture</b><b>Interface notes</b></nav>
        <main><div class="pulsar-chat-head"><span>Product research</span><b>Claude 4.5 <i></i></b></div><div class="pulsar-user">Summarize the requirements and propose a plugin boundary.</div><div class="pulsar-ai"><strong>✦</strong><p>I found three independent concerns. The boundary keeps the workspace shell stable while each capability stays composable.</p><pre><small>plugin.ts</small><code>export const researchPlugin =<br>  definePlugin({ id: <b>"research"</b> })</code></pre></div><div class="pulsar-composer"><span>Ask anything, attach context…</span><b>↑</b></div></main>
      </div>
    </div>
  </div>
</section>

<section class="pulsar-section pulsar-position" aria-labelledby="position-title">
  <div class="pulsar-label"><span>01</span> WHAT IS PULSARAI</div>
  <div class="pulsar-position-copy"><h2 id="position-title">不是又一个聊天窗口，<br>而是你的 <em>AI 操作界面。</em></h2><p>从模型接入、会话上下文到本地能力与可扩展插件，PulsarAI 将分散的 AI 工作流收束为一个有秩序、可演化的桌面空间。</p></div>
  <div class="pulsar-principles"><article><span>01</span><h3>模型，不是绑定</h3><p>在统一入口管理提供商与模型，把选择权留给工作流，而不是某个产品。</p></article><article><span>02</span><h3>对话，不止聊天</h3><p>会话承载上下文、工具与任务状态，让每次交互都能自然接续。</p></article><article><span>03</span><h3>能力，可以生长</h3><p>以 Feature API 和插件边界组织功能，按需组合，而非堆叠复杂度。</p></article></div>
</section>

<section class="pulsar-section pulsar-system" aria-labelledby="system-title">
  <div class="pulsar-system-art" aria-hidden="true"><i></i><i></i><i></i><b>✦</b><span>models</span><span>plugins</span><span>context</span></div>
  <div class="pulsar-system-copy"><div class="pulsar-label"><span>02</span> A COMPOSABLE SYSTEM</div><h2 id="system-title">从一个清晰的核心，<br>延展出真正有用的能力。</h2><p>核心工作区负责稳定的交互语义；对话、设置与插件通过明确的契约协作。每一层都足够独立，也足够靠近。</p><a class="pulsar-text-link" href="/api/">查看 Feature API <b>↗</b></a></div>
</section>

<section class="pulsar-section pulsar-guides" aria-labelledby="guides-title">
  <div class="pulsar-guides-heading"><div><div class="pulsar-label"><span>03</span> EXPLORE THE DOCS</div><h2 id="guides-title">从这里开始你的轨道。</h2></div><p>选择一个入口，了解 PulsarAI 如何组织界面、对话与可扩展能力。</p></div>
  <div class="pulsar-guide-grid">
    <a href="/guide/plugins" class="pulsar-card wide"><span>01</span><i class="pulsar-icon plugin"></i><h3>编写插件</h3><p>理解插件结构、资源容器与面向上下文的工作流。</p><b>插件系统 →</b></a>
    <a href="/guide/conversation" class="pulsar-card"><span>02</span><i class="pulsar-icon chat"></i><h3>组织对话</h3><p>探索会话生成、上下文与交互的设计逻辑。</p><b>对话系统 →</b></a>
    <a href="/guide/interface" class="pulsar-card"><span>03</span><i class="pulsar-icon panel"></i><h3>理解界面</h3><p>查看 Shell、标签页、侧栏与工作区的边界。</p><b>基本界面 →</b></a>
    <a href="/api/" class="pulsar-card api"><span>04</span><i class="pulsar-api-mark">{ }</i><h3>调用能力</h3><p>查阅 Feature API、类型契约与扩展接口。</p><b>开发参考 →</b></a>
  </div>
</section>

<section class="pulsar-closing" aria-labelledby="closing-title"><div class="pulsar-closing-orbit"><i></i><i></i><b>✦</b></div><p>BUILD WITH PULSARAI</p><h2 id="closing-title">给智能一条<br><em>可抵达的轨道。</em></h2><a class="pulsar-button primary" href="/guide/plugins">打开文档 <b>→</b></a></section>
</div>

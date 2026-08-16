const useMock = config.get("generation", "useMock") !== false;
const useStreamText = Boolean(config.get("generation", "useStreamText"));

if (useMock) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  await reply.setModelName("mock-deepseek-v4");

  const thinkingText = `The user wants me to output some markdown text for testing rendering. They want various markdown elements. Let me create a nice test markdown output. This is a simple request - I don't need to use any tools, just output markdown text directly.

Let me include various markdown elements: headings, bold, italic, links, images, code blocks, tables, lists, blockquotes, etc. Maybe also include a widget reference? The user just wants to test rendering. I could just output plain markdown. Let me keep it fun with the cat theme (喵).`;

  const outputText = `好的喵~ 这里是一份 Markdown 渲染测试样例，各种元素都覆盖了喵，直接复制或查看渲染效果即可～

## 标题层级

# 一级标题
## 二级标题
### 三级标题
#### 四级标题
##### 五级标题
###### 六级标题

## 文本样式

- **粗体文字** 加粗喵
- *斜体文字* 倾斜喵
- ***粗斜体*** 又粗又斜喵
- ~~删除线~~ 划掉喵
- \`行内代码\` 是这样的喵
- <mark>高亮标记</mark>
- 下标 H~2~O，上标 E=mc^2^

## 引用

> 这是一条引用喵。
>
> > 嵌套引用也是可以的喵~
>
> —— 某只猫

## 列表

无序列表：
- 猫粮
- 猫砂
- 逗猫棒
  - 带羽毛的
  - 带铃铛的
- 猫抓板

有序列表：
1. 起床
2. 伸懒腰
3. 吃早饭
4. 晒太阳
5. 睡午觉

任务列表：
- [x] 已经做完的事
- [ ] 还没做的事
- [ ] 永远不想做的事

## 链接

[这是链接喵](https://example.com)

[带标题的链接](https://example.com "标题：喵呜")

自动链接：<https://example.com>

## 图片

![占位图片](https://picsum.photos/seed/cat/400/200 "喵喵图")

## 代码

行内代码：\`npm install catnip\`

\`\`\`js
// JavaScript 代码块喵
const cat = {
  name: "咪咪",
  meow() {
    console.log("喵~");
  },
};
cat.meow();
\`\`\`

\`\`\`python
# Python 代码块
def meow(times: int) -> str:
    return "喵" * times

print(meow(3))  # 喵喵喵
\`\`\`

\`\`\`bash
$ echo "喵喵喵" | lolcat
\`\`\`

## 表格

| 项目   | 数量 | 备注         |
| ------ | ---- | ------------ |
| 猫粮   | 3kg  | 三文鱼口味   |
| 猫砂   | 2袋  | 豆腐砂       |
| 零食   | 10包 | 冻干鸡肉     |
| 玩具   | 5个  | 逗猫棒*2     |

右对齐表格：

| 名字   | 年龄 | 体重(kg) |
| ------: | ----: | ------: |
| 咪咪   | 3    | 4.5     |
| 团子   | 1    | 3.2     |

## 分割线

---

## 其他元素

脚注：喵星人是最可爱的生物[^1]。

[^1]: 这是脚注内容喵。

HTML 元素：<kbd>Ctrl</kbd> + <kbd>C</kbd> 复制，<kbd>Ctrl</kbd> + <kbd>V</kbd> 粘贴。

转义字符：\\*不是斜体\\*、\\\`不是代码\\\`、\\# 不是标题

Emoji：🐱 🐾 🐟 🧶 ☀️ 😺

> [!NOTE]
> 这是提示块喵。

> [!WARNING]
> 小心猫毛过敏喵。

## 长段落测试

这是一段很长很长的文字，用来测试换行和段落排版效果喵。Markdown 渲染器通常会把连续的文字自动折行，而两个换行之间才会形成新的段落。所以这段文字即使写得很长，也应该被当作一个段落来渲染喵。

第二段文字用来测试段落间距是否正常。正常情况下，段落之间应该有一定的垂直间距，让阅读更舒适。如果间距太小或者没有间距，那说明渲染器可能有问题喵。

## 数学公式（如果支持）

行内公式：$E = mc^2$

块级公式：

$$
\\int_0^\\infty e^{-\\x^2} dx = \\frac{\\sqrt{\\pi}}{2}
$$

---

以上就是全部测试内容喵~ 辛苦你检查渲染效果了，有任何问题随时叫我喵！🐾`;

  // 1. 流式输出思考过程
  await reply.addStep({ type: "thinking", id: "think-mock-1", message: "" });
  let currentThinking = "";
  for (let i = 0; i < thinkingText.length; i += 8) {
    const chunk = thinkingText.slice(i, i + 8);
    currentThinking += chunk;
    await reply.updateThinking("think-mock-1", currentThinking);
    await sleep(15);
  }

  await sleep(250);

  // 2. 流式输出 Markdown 正文
  for (let i = 0; i < outputText.length; i += 6) {
    const chunk = outputText.slice(i, i + 6);
    await reply.appendContent(chunk);
    await sleep(12);
  }
} else {
  const messages = [...bootstrapMessages, ...chat];
  if (useStreamText) {
    await agent.streamText({ container: reply, messages });
  } else {
    const runner = new agent.ToolLoopAgent({ container: reply });
    await runner.stream({ messages });
  }
}

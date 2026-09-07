// 行的 mousedown 处理器把焦点程序化重定向到行时置位（见 AskUserRow）。
// Chrome 把脚本发起的焦点报告为 :focus-visible，没有这个标志的话每次
// 鼠标点击都会点亮键盘焦点环。focus 事件同步派发，模块级标志是安全的。
let pointerFocusRedirect = false;

export function setPointerFocusRedirect(v: boolean) {
  pointerFocusRedirect = v;
}

export function isPointerFocusRedirect() {
  return pointerFocusRedirect;
}

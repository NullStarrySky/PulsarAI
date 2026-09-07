export interface AskUserOption {
  id?: string;
  title: string;
  description?: string;
}

export interface AskUserQuestion {
  id?: string;
  title: string;
  /** 可选项。仅 freeText 问题可省略；其他模式至少需要一项。 */
  options?: AskUserOption[];
  multiSelect?: boolean;
  allowOther?: boolean;
  otherPlaceholder?: string;
  skippable?: boolean;
  nextLabel?: string;
  /** 选项行的视觉布局：
   *  - "inline"（默认）：标题与描述同一行。
   *  - "stacked"：标题在上、描述在下——描述较长需换行时使用。 */
  layout?: "inline" | "stacked";
  /** 数字圆角片在行的哪一侧。
   *  - "right"（默认）：片在右；单选的提交箭头在悬停/聚焦时覆盖它。
   *  - "left"：片在左、位于内容之前。提交箭头仍出现在行右缘。 */
  chipPosition?: "left" | "right";
  /** 渲染单个多行 textarea 作为*唯一*答案，没有选项行——用于开放性
   *  提问（名字、描述、自由评论）。与 allowOther 不同（那是把自由
   *  文本行*加在*选项旁边）。字段出现时自动聚焦；⌘/⌃+Enter 或底部
   *  提交按钮提交，答案存入 otherText。设置此项时 options 被忽略。 */
  freeText?: boolean;
  /** freeText textarea 的占位文本。 */
  freeTextPlaceholder?: string;
  /** freeText 字段是否以多行高度起步。默认 true。false 时单行高、
   *  按 Enter 即提交；无论哪种，textarea 仍随内容换行自动增高。 */
  freeTextMultiline?: boolean;
  /** 提交时校验 freeText 值。返回错误消息阻止提交并在页脚展示；
   *  返回 null/undefined 放行。用户编辑字段时错误即清除。 */
  freeTextValidate?: (value: string) => string | null | undefined;
}

export interface AskUserAnswer {
  questionId: string;
  selectedIds: string[];
  otherText?: string;
  skipped?: boolean;
}

export interface GlideOption {
  value: string;
  label: string;
  description?: string;
  tag?: string;
  disabled?: boolean;
  icon?: any;
  [key: string]: any;
}

export type GlideSize = 'sm' | 'md' | 'lg';
export type GlideOrientation = 'vertical' | 'horizontal';

export interface GlideSizeConfig {
  chip: number;
  row: number;
  segmentItem: number;
  font: number;
  pad: number;
}

/**
 * 对齐 Fluid 的 size-context (sizeMap):
 * - md / default: 控件高度 36px (h-9)，tab 高度 28px (h-7)，字体 13px
 * - sm / compact: 控件高度 28px (h-7)，tab 高度 24px (h-6)，字体 12px
 * - lg: 控件高度 44px (h-11)，tab 高度 36px (h-9)，字体 14px
 */
export const GLIDE_SIZES: Record<GlideSize, GlideSizeConfig> = {
  sm: { chip: 28, row: 28, segmentItem: 24, font: 12, pad: 3 },
  md: { chip: 36, row: 36, segmentItem: 28, font: 13, pad: 4 },
  lg: { chip: 44, row: 44, segmentItem: 36, font: 14, pad: 5 }
};

export type GitStatus = 'untracked' | 'modified' | 'deleted';

export interface GlideFileTreeNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  icon?: any;
  gitStatus?: GitStatus;
  children?: GlideFileTreeNode[];
  disabled?: boolean;
  tag?: string;
  badge?: string;
  content?: string;
  size?: string;
  lines?: number;
  data?: any;
}


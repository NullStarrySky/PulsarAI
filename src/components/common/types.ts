export interface Option {
  value: string;
  label: string;
  description?: string;
  tag?: string;
  disabled?: boolean;
  icon?: any;
  [key: string]: any;
}

export type CommonSize = 'sm' | 'md' | 'lg';
export type Orientation = 'vertical' | 'horizontal';

export interface SizeConfig {
  chip: number;
  row: number;
  segmentItem: number;
  font: number;
  pad: number;
}

export const COMMON_SIZES: Record<CommonSize, SizeConfig> = {
  sm: { chip: 28, row: 28, segmentItem: 24, font: 12, pad: 3 },
  md: { chip: 36, row: 36, segmentItem: 28, font: 13, pad: 4 },
  lg: { chip: 44, row: 44, segmentItem: 36, font: 14, pad: 5 }
};

export type GitStatus = 'untracked' | 'modified' | 'deleted';

export interface FileTreeNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  icon?: any;
  gitStatus?: GitStatus;
  children?: FileTreeNode[];
  disabled?: boolean;
  tag?: string;
  badge?: string;
  content?: string;
  size?: string;
  lines?: number;
  data?: any;
}

// Backward-compatible type aliases
export type GlideOption = Option;
export type GlideSize = CommonSize;
export type GlideOrientation = Orientation;
export type GlideSizeConfig = SizeConfig;
export const GLIDE_SIZES = COMMON_SIZES;
export type GlideFileTreeNode = FileTreeNode;

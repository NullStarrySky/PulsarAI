import type { CSSProperties, HTMLAttributes } from 'vue';

export interface SliderProps {
  /** Label shown inside the track (optional) */
  label?: string;

  /** Controlled value (v-model) */
  modelValue?: number;
  value?: number;
  defaultValue?: number;

  /** Minimum value (default: 0) */
  min?: number;
  /** Maximum value (default: 100) */
  max?: number;
  /** Smallest increment (default: 1) */
  step?: number;

  /** Format the displayed value */
  formatValue?: (value: number) => string;
  showValue?: boolean;
  hideFill?: boolean;

  /** Custom track style / thumb color for specialized use cases like ColorPicker */
  trackStyle?: CSSProperties | Record<string, any>;
  thumbColor?: string;
  thumbBorderColor?: string;

  disabled?: boolean;
  class?: HTMLAttributes['class'];
  className?: string;
  ariaLabel?: string;
}

export type ElasticSliderProps = SliderProps;

// Icon set traced 1:1 from the inline SVGs in project/Docket Mobile.dc.html.
import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useAccent, useColors } from '../theme/ThemeContext';

export interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function IconMenu({ size = 22, color: colorProp, strokeWidth = 1.8 }: IconProps) {
  const c = useColors();
  const color = colorProp ?? c.textPrimary;
  return (
    <Svg width={size} height={size} viewBox="0 0 22 22" fill="none">
      <Path d="M3 6h16M3 11h16M3 16h10" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function IconSearch({ size = 20, color: colorProp, strokeWidth = 1.8 }: IconProps) {
  const c = useColors();
  const color = colorProp ?? c.textPrimary;
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Circle cx={9} cy={9} r={6} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M13.5 13.5L17 17" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function IconSelectMode({ size = 20, color: colorProp, strokeWidth = 1.8 }: IconProps) {
  const c = useColors();
  const color = colorProp ?? c.textPrimary;
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path d="M4 6h12M4 10h12M4 14h7" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path d="M14 13l2 2 3-3.5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconPlus({ size = 16, color: colorProp, strokeWidth = 1.8 }: IconProps) {
  const accent = useAccent();
  const color = colorProp ?? accent;
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Path d="M8 3v10M3 8h10" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function IconPlusBig({ size = 20, color: colorProp, strokeWidth = 1.8 }: IconProps) {
  const accent = useAccent();
  const color = colorProp ?? accent;
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path d="M10 4v12M4 10h12" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function IconStar({ size = 14, color: colorProp }: IconProps) {
  const c = useColors();
  const color = colorProp ?? c.priorityHigh;
  return (
    <Svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <Path d="M7 1.5l1.7 3.4 3.8.6-2.7 2.7.6 3.8L7 10.2 3.6 12l.6-3.8L1.5 5.5l3.8-.6L7 1.5z" fill={color} />
    </Svg>
  );
}

export function IconCalendarBox({ size = 18, color: colorProp, strokeWidth = 1.6 }: IconProps) {
  const c = useColors();
  const color = colorProp ?? c.textSecondary;
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Rect x={2.5} y={3.5} width={13} height={12} rx={2} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M2.5 7.5h13M6 1.5v3M12 1.5v3" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

// White by default because it is only ever drawn on a filled accent or success
// shape, both of which keep their colour in dark.
export function IconCheckBig({ size = 18, color = '#fff', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Path d="M3 9.5l4 4 8-9" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconChevronDown({ size = 12, color: colorProp, strokeWidth = 1.6 }: IconProps) {
  const c = useColors();
  const color = colorProp ?? c.textTertiary;
  return (
    <Svg width={size} height={size} viewBox="0 0 12 12" fill="none">
      <Path d="M3 5l3 3 3-3" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconCheckCircleFilled({ size = 20, bg }: { size?: number; bg?: string }) {
  const c = useColors();
  const fill = bg ?? c.success;
  const inner = size * 0.55;
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      <Circle cx={10} cy={10} r={10} fill={fill} />
      <Svg width={inner} height={inner} viewBox="0 0 11 11" x={(20 - inner) / 2} y={(20 - inner) / 2}>
        {/* White in both schemes: the disc under it is `success`, which stays green. */}
        <Path d="M2 6l2.5 2.5L9 3" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </Svg>
    </Svg>
  );
}

export function IconInboxTray({ size = 20, color: colorProp, strokeWidth = 1.7 }: IconProps) {
  const c = useColors();
  const color = colorProp ?? c.textTertiary;
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path d="M3 10l2-6h10l2 6v6H3v-6z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <Path d="M3 10h4.5c0 1.4 1.1 2.5 2.5 2.5s2.5-1.1 2.5-2.5H17" stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

export function IconClock({ size = 20, color: colorProp, strokeWidth = 1.7 }: IconProps) {
  const c = useColors();
  const color = colorProp ?? c.textTertiary;
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Circle cx={10} cy={10} r={7} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M10 6.5V10l2.5 1.5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function IconCalendar({ size = 20, color: colorProp, strokeWidth = 1.7 }: IconProps) {
  const c = useColors();
  const color = colorProp ?? c.textTertiary;
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Rect x={3} y={4} width={14} height={13} rx={2} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M3 8.5h14M7 2v3.5M13 2v3.5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function IconFolder({ size = 20, color: colorProp, strokeWidth = 1.7 }: IconProps) {
  const c = useColors();
  const color = colorProp ?? c.textTertiary;
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path d="M3 5.5h6l1.5 2H17v8H3v-10z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
    </Svg>
  );
}

/** Stacked layers — the All view, everything at once. */
export function IconStack({ size = 20, color: colorProp, strokeWidth = 1.7 }: IconProps) {
  const c = useColors();
  const color = colorProp ?? c.textTertiary;
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path d="M10 3l7 3.5-7 3.5-7-3.5L10 3z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <Path d="M3 10.5l7 3.5 7-3.5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Two columns of dots — the drag handle for reordering. */
export function IconGrip({ size = 16, color: colorProp }: IconProps) {
  const c = useColors();
  const color = colorProp ?? c.textFaint;
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      {[4, 8, 12].map((cy) => (
        <React.Fragment key={cy}>
          <Circle cx={6} cy={cy} r={1.3} fill={color} />
          <Circle cx={10} cy={cy} r={1.3} fill={color} />
        </React.Fragment>
      ))}
    </Svg>
  );
}

/** Two columns — the Plan view's list-beside-calendar layout. */
export function IconColumns({ size = 20, color: colorProp, strokeWidth = 1.7 }: IconProps) {
  const c = useColors();
  const color = colorProp ?? c.textTertiary;
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Rect x={3} y={4} width={5.5} height={12} rx={1.5} stroke={color} strokeWidth={strokeWidth} />
      <Rect x={11.5} y={4} width={5.5} height={12} rx={1.5} stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

/** Sliders — opens the group/sort sheet. */
export function IconViewOptions({ size = 20, color: colorProp, strokeWidth = 1.8 }: IconProps) {
  const c = useColors();
  const color = colorProp ?? c.textPrimary;
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path d="M3 6h14M3 10h14M3 14h14" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Circle cx={7} cy={6} r={2} fill={color} />
      <Circle cx={13} cy={10} r={2} fill={color} />
      <Circle cx={8} cy={14} r={2} fill={color} />
    </Svg>
  );
}

export function IconTrendUp({ size = 18, color: colorProp, strokeWidth = 1.7 }: IconProps) {
  const accent = useAccent();
  const color = colorProp ?? accent;
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Path d="M4 13l4-4 3 3 5-6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconDotsHorizontal({ size = 18, color: colorProp }: IconProps) {
  const c = useColors();
  const color = colorProp ?? c.textPrimary;
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Circle cx={4} cy={9} r={1.5} fill={color} />
      <Circle cx={9} cy={9} r={1.5} fill={color} />
      <Circle cx={14} cy={9} r={1.5} fill={color} />
    </Svg>
  );
}

export function IconBell({ size = 18, color: colorProp, strokeWidth = 1.6 }: IconProps) {
  const c = useColors();
  const color = colorProp ?? c.textSecondary;
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Path
        d="M9 2.5c-3 0-4.5 2-4.5 4.5v3L3 12.5h12L13.5 10V7c0-2.5-1.5-4.5-4.5-4.5z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <Path d="M7.5 14.5a1.5 1.5 0 003 0" stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

export function IconTag({ size = 18, color: colorProp, strokeWidth = 1.6 }: IconProps) {
  const c = useColors();
  const color = colorProp ?? c.textSecondary;
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Path d="M2.5 8V3.5H7L15.5 12 11 16.5 2.5 8z" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <Circle cx={6} cy={7} r={1} fill={color} />
    </Svg>
  );
}

export function IconNote({ size = 18, color: colorProp, strokeWidth = 1.6 }: IconProps) {
  const c = useColors();
  const color = colorProp ?? c.textSecondary;
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Path
        d="M4 2.5h7l3 3v10H4v-13z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <Path d="M11 2.5v3h3M6.5 9h5M6.5 12h5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

/**
 * Priority. `filled` tints the pennant so a chosen priority reads at a glance,
 * the way the flag rows in the composer's priority menu do; unfilled is the
 * neutral "no priority" outline.
 */
export function IconFlag({ size = 18, color: colorProp, strokeWidth = 1.6, filled = false }: IconProps & { filled?: boolean }) {
  const c = useColors();
  const color = colorProp ?? c.textSecondary;
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Path
        d="M4.75 15.5V2.75"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <Path
        d="M4.75 3.25h8.5l-2 3 2 3h-8.5z"
        fill={filled ? color : 'none'}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function IconTrash({ size = 18, color: colorProp, strokeWidth = 1.6 }: IconProps) {
  const c = useColors();
  const color = colorProp ?? c.priorityHigh;
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Path
        d="M4 5.5h10M7 5.5V4h4v1.5M5.5 5.5l.7 9h5.6l.7-9"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function IconServer({ size = 16, color: colorProp, strokeWidth = 1.5 }: IconProps) {
  const c = useColors();
  const color = colorProp ?? c.textTertiary;
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Rect x={2} y={2} width={12} height={5} rx={1.5} stroke={color} strokeWidth={strokeWidth} />
      <Rect x={2} y={9} width={12} height={5} rx={1.5} stroke={color} strokeWidth={strokeWidth} />
      <Circle cx={4.5} cy={4.5} r={0.9} fill={color} />
      <Circle cx={4.5} cy={11.5} r={0.9} fill={color} />
    </Svg>
  );
}

export function IconSettings({ size = 18, color: colorProp }: IconProps) {
  const c = useColors();
  const color = colorProp ?? c.textTertiary;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M19.43 12.98c.04-.32.07-.65.07-.98s-.02-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46a.5.5 0 0 0-.61-.22l-2.49 1a7.3 7.3 0 0 0-1.69-.98L14.5 2.42A.49.49 0 0 0 14 2h-4a.49.49 0 0 0-.49.42L9.13 5.07c-.61.24-1.18.56-1.69.98l-2.49-1a.5.5 0 0 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.08.65-.08.98s.03.66.08.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.37.31.61.22l2.49-1c.51.4 1.08.73 1.69.98l.38 2.65c.04.24.25.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.24 1.18-.57 1.69-.98l2.49 1c.23.08.49 0 .61-.22l2-3.46a.5.5 0 0 0-.12-.64l-2.11-1.65zM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5z"
        fill={color}
      />
    </Svg>
  );
}

export function IconLock({ size = 16, color: colorProp, strokeWidth = 1.5 }: IconProps) {
  const c = useColors();
  const color = colorProp ?? c.textTertiary;
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Rect x={3} y={7} width={10} height={7} rx={1.5} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M5.5 7V5a2.5 2.5 0 015 0v2" stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
}

export function IconShield({ size = 14, color: colorProp, strokeWidth = 1.4 }: IconProps) {
  const c = useColors();
  const color = colorProp ?? c.success;
  return (
    <Svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <Path
        d="M7 1.5l4.5 2v3c0 3-2 5.5-4.5 6-2.5-.5-4.5-3-4.5-6v-3L7 1.5z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function IconChevronLeft({ size = 14, color: colorProp, strokeWidth = 1.7 }: IconProps) {
  const c = useColors();
  const color = colorProp ?? c.textTertiary;
  return (
    <Svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <Path d="M9 2.5L4 7l5 4.5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconChevronRight({ size = 14, color: colorProp, strokeWidth = 1.7 }: IconProps) {
  const c = useColors();
  const color = colorProp ?? c.textTertiary;
  return (
    <Svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <Path d="M5 2.5l5 4.5-5 4.5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

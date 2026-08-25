import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { makeStyles } from '../../theme/styles';
import { useColors } from '../../theme/ThemeContext';
import { fonts } from '../../theme/typography';
import { hoverable } from '../../theme/hover';

/**
 * The pieces a context menu is built from.
 *
 * Pulled out of TaskContextMenu when the sidebar got a menu of its own. Two
 * menus that look alike by coincidence drift; sharing the parts is what keeps
 * the app's menus reading as one thing, and it is what makes adding a third
 * section to either of them a matter of composing rather than restyling.
 */

/** The small uppercase caption above a group of chips. */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  return <Text style={styles.label}>{children}</Text>;
}

/** Horizontal wrap of chips — the choices worth making without navigating. */
export function ChipRow({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  return <View style={styles.chips}>{children}</View>;
}

export function MenuDivider() {
  const styles = useStyles();
  return <View style={styles.divider} />;
}

/** One tappable line: icon, label, and nothing else. */
export function MenuRow({
  icon,
  label,
  onPress,
  destructive,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <Pressable onPress={onPress} style={hoverable(styles.row, styles.rowHovered)}>
      <View style={styles.rowIcon}>{icon}</View>
      <Text style={[styles.rowText, destructive && { color: colors.priorityHigh }]}>{label}</Text>
    </Pressable>
  );
}

export const useMenuStyles = makeStyles((c) => ({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 7,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  chipHovered: {
    backgroundColor: c.hoverBg,
  },
  chipText: {
    fontFamily: fonts.sansMedium,
    fontSize: 12.5,
    color: c.textPrimary,
  },
  chipTextActive: {
    color: '#fff',
  },
}));

const useStyles = makeStyles((c) => ({
  label: {
    fontFamily: fonts.monoRegular,
    fontSize: 11.5,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: c.textTertiary,
    marginBottom: 8,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  divider: {
    height: 1,
    backgroundColor: c.divider,
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 7,
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  rowHovered: {
    backgroundColor: c.hoverBg,
  },
  rowIcon: {
    width: 18,
    alignItems: 'center',
  },
  rowText: {
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: c.textPrimary,
  },
}));

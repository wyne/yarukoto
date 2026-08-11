import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import BottomSheet from '../BottomSheet';
import { LIST_COLORS, colors } from '../../theme/colors';
import { fonts } from '../../theme/typography';
import { useTasks } from '../../data/TaskContext';
import { ListDef } from '../../data/types';
import { IconCheckBig } from '../../icons/Icons';

interface Props {
  /** The list being recoloured; null closes the sheet. */
  list: ListDef | null;
  onClose: () => void;
}

export default function ListColorPickerSheet({ list, onClose }: Props) {
  const { setListColor } = useTasks();

  const choose = (color: string) => {
    if (list) setListColor(list.id, color);
    onClose();
  };

  return (
    <BottomSheet visible={!!list} onClose={onClose} title={list ? `Colour for ${list.name}` : 'List colour'}>
      <View style={styles.swatches}>
        {LIST_COLORS.map((color) => {
          const active = list?.color === color;
          return (
            <Pressable
              key={color}
              onPress={() => choose(color)}
              style={[styles.swatch, { backgroundColor: color }, active && styles.swatchActive]}
              accessibilityLabel={`Set colour ${color}`}
            >
              {active && <IconCheckBig size={16} color="#fff" strokeWidth={2.6} />}
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.hint}>Applies everywhere this list appears.</Text>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchActive: {
    borderWidth: 2,
    borderColor: colors.textPrimary,
  },
  hint: {
    marginTop: 14,
    marginBottom: 4,
    fontFamily: fonts.sansRegular,
    fontSize: 12.5,
    color: colors.textTertiary,
  },
});

import { Text, View } from 'react-native';
import MenuView, { type MenuAction } from '../NativeMenu';
import { makeStyles } from '../../theme/styles';
import { fonts } from '../../theme/typography';
import { useAccent } from '../../theme/ThemeContext';

interface Props {
  /** 24-hour "HH:MM". */
  value: string;
  onChange: (value: string) => void;
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTE_STEP = 5;
const MINUTES = Array.from({ length: 60 / MINUTE_STEP }, (_, i) => i * MINUTE_STEP);

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * A time, picked from three menus: hour, minute and AM/PM.
 *
 * For the Mac, which has no wheels — UIKit throws the moment one reaches a
 * window there — and where the hosted SwiftUI compact field draws but never
 * takes a click or a key. Menus are the one native picking control that works
 * there, and three short ones read as a time at a glance.
 *
 * Minutes step by five, which covers what a reminder or a due time needs. A time
 * already off the grid, set on another device, is kept: its minute joins the
 * list, ticked, rather than being rounded away the moment the sheet opens.
 */
export default function MacTimeMenus({ value, onChange }: Props) {
  const styles = useStyles();
  const accent = useAccent();

  const [h24, minute] = value.split(':').map(Number);
  const pm = h24 >= 12;
  const hour12 = h24 % 12 === 0 ? 12 : h24 % 12;

  const set = (next: { hour12?: number; minute?: number; pm?: boolean }) => {
    const h12 = next.hour12 ?? hour12;
    const isPm = next.pm ?? pm;
    const h = (h12 % 12) + (isPm ? 12 : 0);
    onChange(`${pad(h)}:${pad(next.minute ?? minute)}`);
  };

  const minutes = MINUTES.includes(minute) ? MINUTES : [...MINUTES, minute].sort((a, b) => a - b);

  const menu = (label: string, actions: MenuAction[], onPick: (id: string) => void, a11y: string) => (
    <MenuView actions={actions} onPressAction={({ nativeEvent }) => onPick(nativeEvent.event)}>
      <View style={styles.chip} accessibilityRole="button" accessibilityLabel={a11y}>
        <Text style={[styles.chipText, { color: accent }]}>{label}</Text>
      </View>
    </MenuView>
  );

  return (
    <View style={styles.row}>
      {menu(
        String(hour12),
        HOURS.map((h) => ({ id: String(h), title: String(h), state: h === hour12 ? ('on' as const) : undefined })),
        (id) => set({ hour12: Number(id) }),
        `Hour, ${hour12}`
      )}
      <Text style={styles.colon}>:</Text>
      {menu(
        pad(minute),
        minutes.map((m) => ({ id: String(m), title: pad(m), state: m === minute ? ('on' as const) : undefined })),
        (id) => set({ minute: Number(id) }),
        `Minute, ${pad(minute)}`
      )}
      {menu(
        pm ? 'PM' : 'AM',
        [
          { id: 'am', title: 'AM', state: !pm ? ('on' as const) : undefined },
          { id: 'pm', title: 'PM', state: pm ? ('on' as const) : undefined },
        ],
        (id) => set({ pm: id === 'pm' }),
        pm ? 'PM' : 'AM'
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  chip: {
    minWidth: 52,
    minHeight: 42,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: c.surfaceMuted,
  },
  chipText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 17,
    fontVariant: ['tabular-nums'],
  },
  colon: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 17,
    color: c.textSecondary,
  },
}));

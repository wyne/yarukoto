import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import { useAccent } from '../theme/ThemeContext';
import { MainTabParamList } from '../navigation/types';
import { PANE_MAX_WIDTH, useSidebar } from '../navigation/SidebarContext';
import { useTasks } from '../data/TaskContext';
import { getListById, trashedTasks } from '../data/selectors';
import { formatDueShort } from '../data/dateUtils';
import { confirmDestructive } from '../data/confirm';
import { useSyncRefresh } from '../data/useSyncRefresh';
import Card from '../components/Card';
import GlassIconButton from '../components/GlassIconButton';
import Divider from '../components/Divider';
import { IconMenu } from '../icons/Icons';

type Props = BottomTabScreenProps<MainTabParamList, 'TrashTab'>;

/**
 * Deleted tasks, restorable until the server's retention window purges them.
 *
 * Deliberately not TaskListScreen: nothing here should be completable or swipeable,
 * and the two actions are explicit rather than gestural.
 */
export default function TrashScreen({}: Props) {
  const accent = useAccent();
  const insets = useSafeAreaInsets();
  const refreshControl = useSyncRefresh();
  const { wide, openDrawer } = useSidebar();
  const { state, restoreTasks, purgeTasks } = useTasks();
  const now = new Date();

  const tasks = trashedTasks(state.tasks);

  const confirmPurge = (ids: string[], label: string) =>
    confirmDestructive('Delete forever?', label, () => purgeTasks(ids));

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
      <View style={[styles.header, wide && styles.paneWide]}>
        {!wide && (
          <GlassIconButton onPress={openDrawer} label="Menu">
            <IconMenu />
          </GlassIconButton>
        )}
        <Text style={styles.title}>Trash</Text>
        <Text style={styles.count}>{tasks.length}</Text>
        {tasks.length > 0 && (
          <Pressable
            onPress={() =>
              confirmPurge(
                tasks.map((t) => t.id),
                `${tasks.length} task${tasks.length === 1 ? '' : 's'} will be deleted forever.`
              )
            }
            hitSlop={8}
          >
            <Text style={styles.emptyAction}>Empty</Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        refreshControl={refreshControl}
        contentContainerStyle={[styles.scroll, wide && styles.paneWide]}
      >
        {tasks.length === 0 ? (
          <Text style={styles.empty}>Trash is empty.</Text>
        ) : (
          <Card style={{ marginHorizontal: 12 }}>
            {tasks.map((task, i) => {
              const list = getListById(state.lists, task.listId);
              const due = formatDueShort(now, task.dueDate, task.dueTime);
              const meta = [list?.name, due].filter(Boolean).join(' · ');
              return (
                <View key={task.id}>
                  <View style={styles.row}>
                    <View style={styles.rowText}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {task.title}
                      </Text>
                      {!!meta && (
                        <Text style={styles.rowMeta} numberOfLines={1}>
                          {meta}
                        </Text>
                      )}
                    </View>
                    <Pressable onPress={() => restoreTasks([task.id])} hitSlop={6}>
                      <Text style={[styles.action, { color: accent }]}>Restore</Text>
                    </Pressable>
                    <Pressable onPress={() => confirmPurge([task.id], task.title)} hitSlop={6}>
                      <Text style={[styles.action, styles.danger]}>Delete</Text>
                    </Pressable>
                  </View>
                  {i < tasks.length - 1 && <Divider />}
                </View>
              );
            })}
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  paneWide: { width: '100%', maxWidth: PANE_MAX_WIDTH },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  title: {
    fontFamily: fonts.sansBold,
    fontSize: 22,
    color: colors.textPrimary,
  },
  count: {
    flex: 1,
    fontFamily: fonts.monoRegular,
    fontSize: 13.5,
    color: colors.textTertiary,
  },
  emptyAction: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.priorityHigh,
  },
  /** `flexGrow` reaches the bottom on a short list. See TaskListScreen's `scrollContent`. */
  scroll: { flexGrow: 1, paddingBottom: 24 },
  empty: {
    textAlign: 'center',
    marginTop: 32,
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: colors.textTertiary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    minHeight: 44,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.textSecondary,
  },
  rowMeta: {
    fontFamily: fonts.monoRegular,
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: 2,
  },
  action: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
  },
  danger: { color: colors.priorityHigh },
});

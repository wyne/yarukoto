import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import { useAccent } from '../theme/ThemeContext';
import { MainTabParamList } from '../navigation/types';
import { PANE_MAX_WIDTH, useSidebar } from '../navigation/SidebarContext';
import { useTasks } from '../data/TaskContext';
import {
  activeTasks,
  folderTotal,
  inboxCount,
  listCounts,
  listsInFolder,
  tagCounts,
  tasksForToday,
  tasksUpcomingCount,
} from '../data/selectors';
import Card from '../components/Card';
import SyncIndicator from '../components/SyncIndicator';
import Divider from '../components/Divider';
import BottomSheet from '../components/BottomSheet';
import ListColorPickerSheet from '../components/pickers/ListColorPickerSheet';
import { ListDef } from '../data/types';
import { IconClock, IconInboxTray, IconMenu, IconPlusBig, IconStack, IconTrendUp } from '../icons/Icons';

type Props = BottomTabScreenProps<MainTabParamList, 'BrowseTab'>;

export default function BrowseScreen({ navigation }: Props) {
  const accent = useAccent();
  const insets = useSafeAreaInsets();
  const { wide, openDrawer } = useSidebar();
  const { state, addList, disconnect, syncStatus } = useTasks();
  const now = new Date();
  const counts = listCounts(state.tasks);
  const tags = tagCounts(state.tasks);

  const [addOpen, setAddOpen] = useState(false);
  const [colorTarget, setColorTarget] = useState<ListDef | null>(null);
  const [newListName, setNewListName] = useState('');
  const [newListFolder, setNewListFolder] = useState(state.folders[0]?.id);

  const openFilteredInbox = (filter: { type: 'list' | 'tag'; value: string; label: string }) => {
    navigation.navigate('InboxTab', { filter });
  };

  const confirmDisconnect = () => {
    Alert.alert('Disconnect server?', state.serverUrl, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Disconnect', style: 'destructive', onPress: disconnect },
    ]);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
      <View style={[styles.header, wide && styles.paneWide]}>
        {!wide && (
          <Pressable onPress={openDrawer} hitSlop={8} style={styles.menuBtn}>
            <IconMenu />
          </Pressable>
        )}
        <Text style={styles.title}>Browse</Text>
        <Pressable onPress={() => setAddOpen(true)} hitSlop={8}>
          <IconPlusBig color={accent} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, wide && styles.paneWide]}>
        <Card>
          <Pressable style={styles.smartRow} onPress={() => navigation.navigate('AllTab')}>
            <IconStack size={18} color={accent} />
            <Text style={styles.smartLabel}>All</Text>
            <Text style={styles.smartCount}>{activeTasks(state.tasks).length}</Text>
          </Pressable>
          <Divider indent={44} />
          <Pressable style={styles.smartRow} onPress={() => navigation.navigate('TodayTab')}>
            <IconClock size={18} color={accent} />
            <Text style={styles.smartLabel}>Today</Text>
            <Text style={styles.smartCount}>{tasksForToday(state.tasks, now).length}</Text>
          </Pressable>
          <Divider indent={44} />
          <Pressable style={styles.smartRow} onPress={() => navigation.navigate('CalendarTab')}>
            <IconTrendUp size={18} color={accent} />
            <Text style={styles.smartLabel}>Upcoming</Text>
            <Text style={styles.smartCount}>{tasksUpcomingCount(state.tasks, now)}</Text>
          </Pressable>
          <Divider indent={44} />
          <Pressable style={styles.smartRow} onPress={() => navigation.navigate('InboxTab', { filter: undefined })}>
            <IconInboxTray size={18} color={accent} />
            <Text style={styles.smartLabel}>Inbox</Text>
            <Text style={styles.smartCount}>{inboxCount(state.tasks)}</Text>
          </Pressable>
        </Card>

        {state.folders.map((folder) => {
          const lists = listsInFolder(state.lists, folder.id);
          if (lists.length === 0) return null;
          return (
            <View key={folder.id} style={{ marginTop: 16 }}>
              <View style={styles.folderHeader}>
                <Text style={styles.folderLabel}>{folder.name}</Text>
                <View style={styles.line} />
                <Text style={styles.folderTotal}>{folderTotal(state.lists, counts, folder.id)}</Text>
              </View>
              <Card>
                {lists.map((list, i) => (
                  <View key={list.id}>
                    <Pressable
                      style={styles.smartRow}
                      onPress={() => openFilteredInbox({ type: 'list', value: list.id, label: list.name })}
                      onLongPress={() => setColorTarget(list)}
                      delayLongPress={350}
                    >
                      <Pressable
                        onPress={() => setColorTarget(list)}
                        hitSlop={8}
                        accessibilityLabel={`Change ${list.name} colour`}
                      >
                        <View style={[styles.dot, { backgroundColor: list.color }]} />
                      </Pressable>
                      <Text style={styles.smartLabel}>{list.name}</Text>
                      <Text style={styles.smartCount}>{counts[list.id] ?? 0}</Text>
                    </Pressable>
                    {i < lists.length - 1 && <Divider indent={36} />}
                  </View>
                ))}
              </Card>
            </View>
          );
        })}

        {tags.length > 0 && (
          <View style={{ marginTop: 16 }}>
            <View style={styles.folderHeader}>
              <Text style={styles.folderLabel}>Tags</Text>
              <View style={styles.line} />
            </View>
            <View style={styles.tagsRow}>
              {tags.map(({ tag, count }) => (
                <Pressable
                  key={tag}
                  style={styles.tagChip}
                  onPress={() => openFilteredInbox({ type: 'tag', value: tag, label: `#${tag}` })}
                >
                  <Text style={styles.tagChipText}>
                    #{tag} <Text style={styles.tagChipCount}>{count}</Text>
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      <Pressable style={[styles.syncRow, wide && styles.paneWide]} onPress={confirmDisconnect}>
        <SyncIndicator mode={state.mode} status={syncStatus} serverUrl={state.serverUrl} />
      </Pressable>

      <BottomSheet visible={addOpen} onClose={() => setAddOpen(false)} title="New list">
        <TextInput
          value={newListName}
          onChangeText={setNewListName}
          placeholder="List name"
          placeholderTextColor={colors.textFaint}
          style={styles.newListInput}
        />
        <View style={styles.folderPicker}>
          {state.folders.map((f) => {
            const active = f.id === newListFolder;
            return (
              <Pressable
                key={f.id}
                style={[styles.folderChip, active && { backgroundColor: accent, borderColor: accent }]}
                onPress={() => setNewListFolder(f.id)}
              >
                <Text style={[styles.folderChipText, active && { color: '#fff' }]}>{f.name}</Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable
          style={[styles.createBtn, { backgroundColor: colors.textPrimary }]}
          onPress={() => {
            if (newListName.trim() && newListFolder) {
              addList(newListName.trim(), newListFolder);
              setNewListName('');
              setAddOpen(false);
            }
          }}
        >
          <Text style={styles.createBtnText}>Create list</Text>
        </Pressable>
      </BottomSheet>

      <ListColorPickerSheet list={colorTarget} onClose={() => setColorTarget(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.screenBg },
  paneWide: { width: '100%', maxWidth: PANE_MAX_WIDTH },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  menuBtn: {
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontFamily: fonts.sansBold,
    fontSize: 22,
    color: colors.textPrimary,
  },
  scroll: {
    paddingHorizontal: 12,
    paddingBottom: 16,
  },
  smartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    minHeight: 44,
  },
  smartLabel: {
    flex: 1,
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.textPrimary,
  },
  smartCount: {
    fontFamily: fonts.monoRegular,
    fontSize: 13,
    color: colors.textTertiary,
  },
  folderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 6,
    paddingBottom: 8,
  },
  folderLabel: {
    fontFamily: fonts.monoRegular,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textTertiary,
  },
  folderTotal: {
    fontFamily: fonts.monoRegular,
    fontSize: 11,
    color: colors.textFaint,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: colors.dividerStrong,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 2,
  },
  tagChip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tagChipText: {
    fontFamily: fonts.monoRegular,
    fontSize: 13,
    color: colors.textSecondary,
  },
  tagChipCount: {
    color: colors.textFaint,
  },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 12,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
  },
  newListInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fonts.sansRegular,
    fontSize: 15,
    color: colors.textPrimary,
  },
  folderPicker: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  folderChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  folderChipText: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.textPrimary,
  },
  createBtn: {
    marginTop: 18,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  createBtnText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 15,
    color: '#fff',
  },
});

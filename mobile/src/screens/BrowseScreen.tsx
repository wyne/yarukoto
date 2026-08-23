import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { hoverBg } from '../theme/hover';
import { fonts } from '../theme/typography';
import { useAccent } from '../theme/ThemeContext';
import { InboxParams, MainTabParamList } from '../navigation/types';
import { PANE_MAX_WIDTH, useSidebar } from '../navigation/SidebarContext';
import { useTasks } from '../data/TaskContext';
import {
  activeFolders,
  activeTasks,
  folderTotal,
  inboxCount,
  listCounts,
  navGroups,
  tagCounts,
  tasksForToday,
  tasksUpcomingCount,
} from '../data/selectors';
import Card from '../components/Card';
import GlassIconButton from '../components/GlassIconButton';
import SyncIndicator from '../components/SyncIndicator';
import Divider from '../components/Divider';
import BottomSheet from '../components/BottomSheet';
import ListOptionsSheet from '../components/pickers/ListOptionsSheet';
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
  const [listTarget, setListTarget] = useState<ListDef | null>(null);
  const [newListName, setNewListName] = useState('');
  /** null puts the new list at the root, beside the folders. */
  const [newListFolder, setNewListFolder] = useState<string | null>(null);

  const openFilteredInbox = (filter: InboxParams) => {
    navigation.navigate('InboxTab', filter);
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
          <GlassIconButton onPress={openDrawer} label="Menu">
            <IconMenu />
          </GlassIconButton>
        )}
        <Text style={styles.title}>Browse</Text>
        <GlassIconButton onPress={() => setAddOpen(true)} label="New list">
          <IconPlusBig color={accent} />
        </GlassIconButton>
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, wide && styles.paneWide]}>
        <Card>
          <Pressable style={hoverBg(styles.smartRow)} onPress={() => navigation.navigate('AllTab')}>
            <IconStack size={18} color={accent} />
            <Text style={styles.smartLabel}>All</Text>
            <Text style={styles.smartCount}>{activeTasks(state.tasks).length}</Text>
          </Pressable>
          <Divider indent={44} />
          <Pressable style={hoverBg(styles.smartRow)} onPress={() => navigation.navigate('TodayTab')}>
            <IconClock size={18} color={accent} />
            <Text style={styles.smartLabel}>Today</Text>
            <Text style={styles.smartCount}>{tasksForToday(state.tasks, now).length}</Text>
          </Pressable>
          <Divider indent={44} />
          <Pressable style={hoverBg(styles.smartRow)} onPress={() => navigation.navigate('CalendarTab')}>
            <IconTrendUp size={18} color={accent} />
            <Text style={styles.smartLabel}>Upcoming</Text>
            <Text style={styles.smartCount}>{tasksUpcomingCount(state.tasks, now)}</Text>
          </Pressable>
          <Divider indent={44} />
          <Pressable style={hoverBg(styles.smartRow)} onPress={() => navigation.navigate('InboxTab')}>
            <IconInboxTray size={18} color={accent} />
            <Text style={styles.smartLabel}>Inbox</Text>
            <Text style={styles.smartCount}>{inboxCount(state.tasks)}</Text>
          </Pressable>
        </Card>

        {navGroups(state.lists, state.folders).map((group) => {
          const lists = group.lists;
          if (lists.length === 0) return null;
          const folder = group.folder;
          return (
            <View key={folder?.id ?? 'root'} style={{ marginTop: 16 }}>
              {/* The loose lists at the root have no folder to name, so they get
                  a card with no heading above it. */}
              {folder && (
                <View style={styles.folderHeader}>
                  <Text style={styles.folderLabel}>{folder.name}</Text>
                  <View style={styles.line} />
                  <Text style={styles.folderTotal}>{folderTotal(state.lists, counts, folder.id)}</Text>
                </View>
              )}
              <Card>
                {lists.map((list, i) => (
                  <View key={list.id}>
                    <Pressable
                      style={hoverBg(styles.smartRow)}
                      onPress={() => openFilteredInbox({ listId: list.id })}
                      onLongPress={() => setListTarget(list)}
                      delayLongPress={350}
                    >
                      <Pressable
                        onPress={() => setListTarget(list)}
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
                  style={hoverBg(styles.tagChip)}
                  onPress={() => openFilteredInbox({ tag })}
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

      <Pressable style={hoverBg([styles.syncRow, wide && styles.paneWide])} onPress={confirmDisconnect}>
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
          {/* A list no longer needs a folder, so "No folder" leads the chips. */}
          <Pressable
            style={[styles.folderChip, newListFolder === null && { backgroundColor: accent, borderColor: accent }]}
            onPress={() => setNewListFolder(null)}
          >
            <Text style={[styles.folderChipText, newListFolder === null && { color: '#fff' }]}>No folder</Text>
          </Pressable>
          {activeFolders(state.folders).map((f) => {
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
            if (newListName.trim()) {
              addList(newListName.trim(), newListFolder);
              setNewListName('');
              setAddOpen(false);
            }
          }}
        >
          <Text style={styles.createBtnText}>Create list</Text>
        </Pressable>
      </BottomSheet>

      <ListOptionsSheet list={listTarget} onClose={() => setListTarget(null)} />
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
  title: {
    flex: 1,
    fontFamily: fonts.sansBold,
    fontSize: 22,
    color: colors.textPrimary,
  },
  scroll: {
    /** Reaches the bottom on a short list. See TaskListScreen's `scrollContent`. */
    flexGrow: 1,
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

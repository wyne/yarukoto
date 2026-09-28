import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { makeStyles } from '../theme/styles';
import { fonts } from '../theme/typography';
import { PANE_MAX_WIDTH, useSidebar } from '../navigation/SidebarContext';
import { TaskCriteria, sameCriteria } from '../data/taskFilter';
import { useTasks } from '../data/TaskContext';
import { BrowseParams } from '../navigation/types';
import { loadBrowseCriteria, saveBrowseCriteria } from '../data/storage';
import BrowseView from '../components/browse/BrowseView';
import GlassIconButton from '../components/GlassIconButton';
import { IconMenu } from '../icons/Icons';

/**
 * The Browse tab: screen chrome around `BrowseView`, and the criteria it reads.
 *
 * Thin on purpose, the way `AllScreen` is thin around `TaskListScreen`. What is
 * here is the part that only makes sense as a tab — the safe area, the title,
 * the button that opens the nav on a phone. Everything you actually came to do
 * is in the view, so the view can go somewhere else later without bringing a
 * screen's furniture with it.
 */
export default function BrowseScreen() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { wide, openDrawer } = useSidebar();
  /**
   * Restored from the device, and written back on every change.
   *
   * Browse is a question you were part-way through asking, not a view you were
   * looking at — coming back to it with the narrowing thrown away would mean
   * rebuilding the query each time. Clear is what puts it back, which is why
   * remembering is safe to do silently.
   */
  const [criteria, setCriteriaState] = useState<TaskCriteria>(loadBrowseCriteria);
  const { state } = useTasks();
  const params = useRoute().params as BrowseParams | undefined;
  const navigation = useNavigation();

  const setCriteria = useCallback((next: TaskCriteria) => {
    setCriteriaState(next);
    saveBrowseCriteria(next);
  }, []);

  /**
   * A press on a saved filter in the nav. Applied once per press — `at` is what
   * tells two presses apart — and only once the filter is known, since a cold
   * start can route here before the snapshot's filters have been read.
   */
  const applied = useRef<string | null>(null);
  /** Criteria the last press applied, until a render has caught up with them. */
  const applying = useRef<TaskCriteria | null>(null);
  useEffect(() => {
    if (!params?.savedFilterId || params.at === undefined) return;
    const key = `${params.savedFilterId}@${params.at}`;
    if (applied.current === key) return;
    const filter = state.savedFilters.find((f) => f.id === params.savedFilterId && !f.deletedAt);
    if (!filter) return;
    applied.current = key;
    applying.current = filter.criteria;
    setCriteria(filter.criteria);
  }, [params?.savedFilterId, params?.at, state.savedFilters, setCriteria]);

  /**
   * Keeps the route saying which saved filter is on screen, if any, so the nav
   * highlights that filter's row rather than Browse's: changing the chips away
   * from one clears it, and landing on one — by its chip, or by saving what is
   * already asked — sets it. Held off while a press from the nav is still to be
   * applied, so the old criteria cannot clear the filter it is about to show.
   */
  useEffect(() => {
    const pressed = params?.savedFilterId && params.at !== undefined ? `${params.savedFilterId}@${params.at}` : null;
    if (pressed && applied.current !== pressed) return;
    if (applying.current) {
      if (criteria !== applying.current) return;
      applying.current = null;
    }
    const match = state.savedFilters.find((f) => !f.deletedAt && sameCriteria(f.criteria, criteria));
    if (match?.id !== params?.savedFilterId) navigation.setParams({ savedFilterId: match?.id } as never);
  }, [criteria, state.savedFilters, params?.savedFilterId, params?.at, navigation]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
      <View style={[styles.header, wide && styles.paneWide]}>
        {!wide && (
          <GlassIconButton onPress={openDrawer} label="Menu">
            <IconMenu />
          </GlassIconButton>
        )}
        <Text style={styles.title}>Browse</Text>
      </View>

      <BrowseView criteria={criteria} onCriteriaChange={setCriteria} />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.screenBg },
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
    color: c.textPrimary,
  },
}));

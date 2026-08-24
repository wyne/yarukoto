import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import { PANE_MAX_WIDTH, useSidebar } from '../navigation/SidebarContext';
import { TaskCriteria } from '../data/taskFilter';
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
  const setCriteria = useCallback((next: TaskCriteria) => {
    setCriteriaState(next);
    saveBrowseCriteria(next);
  }, []);

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
});

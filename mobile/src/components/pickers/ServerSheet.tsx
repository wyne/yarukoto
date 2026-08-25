import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import BottomSheet from '../BottomSheet';
import SyncIndicator from '../SyncIndicator';
import { ACCENT_OPTIONS, SchemePref } from '../../theme/colors';
import { makeStyles } from '../../theme/styles';
import { fonts } from '../../theme/typography';
import { useColors, useTheme } from '../../theme/ThemeContext';
import { useTasks } from '../../data/TaskContext';
import { ServerInfo, createApi } from '../../data/api';
import { lastSyncedLabel } from '../../data/dateUtils';

/** e.g. "v1.0.0 · 366ba58" — enough to tell two builds apart at a glance. */
function buildLabel(info: ServerInfo): string {
  const parts = [info.version ? `v${info.version}` : null, info.commitShort].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'version unknown';
}

/** Local calendar date, since the exact minute isn't what you're checking for. */
function formatBuiltAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

const SCHEME_OPTIONS: Array<{ value: SchemePref; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/**
 * Appearance, and what the app is connected to. Changing servers isn't edited in
 * place: disconnecting returns to the first-run screen, which is where a URL and
 * token get entered.
 */
export default function ServerSheet({ visible, onClose }: Props) {
  const colors = useColors();
  const styles = useStyles();
  const { state, disconnect, syncStatus } = useTasks();
  const { accent, setAccent, schemePref, setSchemePref } = useTheme();
  const [info, setInfo] = useState<ServerInfo | null | undefined>(undefined);

  // Which build the server is running, re-read on every open so it reflects a
  // deploy that happened while the app stayed put. /health needs no token, so this
  // works even when the stored one has been rejected.
  useEffect(() => {
    if (!visible || state.mode !== 'server' || !state.serverUrl) {
      setInfo(undefined);
      return;
    }
    let cancelled = false;
    setInfo(undefined);
    createApi(state.serverUrl, '')
      .health()
      .then((result) => {
        if (!cancelled) setInfo(result);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, state.mode, state.serverUrl]);

  const sample = state.mode === 'sample';

  return (
    <BottomSheet visible={visible} onClose={onClose} title={sample ? 'Sample data' : 'Settings'}>
      {sample && (
        <Text style={styles.sampleNote}>
          You're exploring with sample data. Leaving it takes you back to the connect screen, where you can point
          Yarukoto at your own server.
        </Text>
      )}

      <Text style={styles.sectionLabel}>Appearance</Text>
      <View style={styles.schemeRow} accessibilityRole="radiogroup">
        {SCHEME_OPTIONS.map((option) => {
          const selected = option.value === schemePref;
          return (
            <Pressable
              key={option.value}
              onPress={() => setSchemePref(option.value)}
              style={[styles.schemeOption, selected && styles.schemeOptionSelected]}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
            >
              <Text style={[styles.schemeText, selected && styles.schemeTextSelected]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.sectionLabel}>Accent</Text>
      <View style={styles.accentRow}>
        {ACCENT_OPTIONS.map((option) => (
          <Pressable
            key={option}
            onPress={() => setAccent(option)}
            style={[styles.swatchRing, option === accent && { borderColor: colors.textPrimary }]}
            accessibilityLabel={`Accent colour ${option}`}
            accessibilityState={{ selected: option === accent }}
          >
            <View style={[styles.swatch, { backgroundColor: option }]} />
          </Pressable>
        ))}
      </View>

      {state.mode === 'server' && <Text style={styles.sectionLabel}>Server</Text>}

      {state.mode === 'server' && (
        <>
          <View style={styles.statusRow}>
            <SyncIndicator mode={state.mode} status={syncStatus} serverUrl={state.serverUrl} />
            <Text style={styles.statusTime}>{lastSyncedLabel(new Date(), syncStatus.lastSyncedAt)}</Text>
          </View>
          <View style={styles.detailBlock}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Address</Text>
              <Text style={styles.detailValue} selectable numberOfLines={1}>
                {state.serverUrl}
              </Text>
            </View>
            {info && (
              <>
                <View style={[styles.detailRow, { marginTop: 6 }]}>
                  <Text style={styles.detailLabel}>Server build</Text>
                  <Text style={styles.detailValue} selectable numberOfLines={1}>
                    {buildLabel(info)}
                  </Text>
                </View>
                {info.builtAt && <Text style={styles.detailMeta}>Built {formatBuiltAt(info.builtAt)}</Text>}
              </>
            )}
          </View>
          <Text style={styles.changeNote}>
            To connect to a different server, disconnect and enter the new details on the connect screen.
          </Text>
        </>
      )}

      <Pressable
        style={styles.disconnectBtn}
        onPress={() => {
          disconnect();
          onClose();
        }}
      >
        <Text style={styles.disconnectText}>{sample ? 'Leave sample data' : 'Disconnect'}</Text>
      </Pressable>
    </BottomSheet>
  );
}

const useStyles = makeStyles((c) => ({
  sectionLabel: {
    marginBottom: 8,
    fontFamily: fonts.monoRegular,
    fontSize: 11.5,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: c.textTertiary,
  },
  schemeRow: {
    flexDirection: 'row',
    marginBottom: 18,
    padding: 3,
    backgroundColor: c.surfaceMuted,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
  },
  schemeOption: {
    flex: 1,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 6,
  },
  schemeOptionSelected: {
    backgroundColor: c.surface,
    borderColor: c.dividerStrong,
    shadowColor: c.shadow,
    shadowOpacity: c.shadowOpacity,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 1,
  },
  schemeText: {
    fontFamily: fonts.sansRegular,
    fontSize: 13.5,
    color: c.textSecondary,
  },
  schemeTextSelected: {
    fontFamily: fonts.sansMedium,
    color: c.textPrimary,
  },
  accentRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  },
  /** The ring, not the swatch, carries the selection — the fill stays true to the colour. */
  swatchRing: {
    padding: 3,
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderRadius: 999,
  },
  swatch: {
    width: 24,
    height: 24,
    borderRadius: 999,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: c.surfaceMuted,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
  },
  statusTime: {
    fontFamily: fonts.monoRegular,
    fontSize: 12,
    color: c.textTertiary,
  },
  detailBlock: {
    // The status row above it already carries the gap.
    marginTop: -6,
    paddingHorizontal: 2,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  detailLabel: {
    fontFamily: fonts.sansRegular,
    fontSize: 13,
    color: c.textTertiary,
  },
  detailValue: {
    flexShrink: 1,
    fontFamily: fonts.monoRegular,
    fontSize: 13,
    color: c.textSecondary,
  },
  detailMeta: {
    marginTop: 2,
    fontFamily: fonts.sansRegular,
    fontSize: 12,
    color: c.textFaint,
  },
  changeNote: {
    marginTop: 14,
    paddingHorizontal: 2,
    fontFamily: fonts.sansRegular,
    fontSize: 13,
    lineHeight: 17,
    color: c.textFaint,
  },

  sampleNote: {
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    lineHeight: 18,
    color: c.textSecondary,
  },
  disconnectBtn: {
    marginTop: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  disconnectText: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: c.priorityHigh,
  },
}));

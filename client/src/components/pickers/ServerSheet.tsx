import React, { useEffect, useState } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import Pressable from '../HoverPressable';
import Sheet, { useDesktopPresentation } from '../Sheet';
import SyncIndicator from '../SyncIndicator';
import { IconPeople, IconPerson, IconServer, IconSettings } from '../../icons/Icons';
import { makeStyles } from '../../theme/styles';
import { fonts } from '../../theme/typography';
import { useAccent, useColors } from '../../theme/ThemeContext';
import { useHoverBg } from '../../theme/hover';
import { useSyncStatus, useTasks } from '../../data/TaskContext';
import { lastSyncedLabel } from '../../data/dateUtils';
import { MAC } from '../../data/platform';
import AccountPane from '../settings/AccountPane';
import AddDevicePane, { ApproveFor } from '../settings/AddDevicePane';
import { AppearanceGroup, HelpGroup } from '../settings/GeneralPane';
import { DevicesPane, PeoplePane } from '../settings/HouseholdPanes';
import ServerPane from '../settings/ServerPane';
import { Group, Note, PAGE_GAP, Row } from '../settings/parts';
import { useHouseholdAdmin } from '../settings/useHouseholdAdmin';

/** As in ListPickerSheet: how tall the sheet may grow before it scrolls instead. */
const MAX_HEIGHT_RATIO = 0.85;

/** Wide enough for a row's label, value and button on one line, as a settings window is. */
const DIALOG_WIDTH = 560;
/** About the Household tab's height, so switching tabs doesn't move the title and tabs under the pointer. */
const DIALOG_MIN_HEIGHT = 620;

interface Props {
  visible: boolean;
  onClose: () => void;
  /** A sign-in code from a scanned QR, handed on to Add a device. */
  pairCode?: string | null;
}

type Tab = 'general' | 'account' | 'household' | 'server';
/** A page pushed inside the phone sheet; `root` is the summary list it opens on. */
type Page = 'root' | 'account' | 'people' | 'devices' | 'add' | 'server';

const PAGE_TITLES: Record<Page, string> = {
  root: 'Settings',
  account: 'Account',
  people: 'People',
  devices: 'Devices',
  add: 'Add a device',
  server: 'Server',
};

const TABS: Array<{ id: Tab; label: string; Icon: typeof IconSettings }> = [
  { id: 'general', label: 'General', Icon: IconSettings },
  { id: 'account', label: 'Account', Icon: IconPerson },
  { id: 'household', label: 'Household', Icon: IconPeople },
  { id: 'server', label: 'Server', Icon: IconServer },
];

/**
 * Settings, in four groups: General (how this device looks), Account (who is
 * signed in, and signing out), Household (people and their devices) and Server
 * (what this device is connected to).
 *
 * A phone opens on a short summary list, and each row pushes a page inside the
 * same sheet with the way back in its title row. The Mac and the web get a
 * settings window instead, with the groups as tabs across its top, the way a
 * desktop app's settings are laid out.
 *
 * Sample and local mode have no server, account or household, so they get the
 * General group alone and the way out.
 */
export default function ServerSheet({ visible, onClose, pairCode }: Props) {
  const desktop = useDesktopPresentation();
  const { state, household: who, disconnect } = useTasks();
  const household = useHouseholdAdmin(visible);
  const { height } = useWindowDimensions();
  const [tab, setTab] = useState<Tab>('general');
  const [page, setPage] = useState<Page>('root');
  /** Desktop only: Household is showing Add a device in place of its lists. */
  const [adding, setAdding] = useState(false);
  const [addFor, setAddFor] = useState<ApproveFor>('self');

  const server = state.mode === 'server';
  const hasHousehold = server && !!who?.me;
  const sample = state.mode === 'sample';

  // Each open starts from the top, unless it was opened to approve a scanned code.
  useEffect(() => {
    if (!visible) return;
    if (pairCode && hasHousehold) {
      setAddFor('self');
      setTab('household');
      setAdding(true);
      setPage('add');
    } else {
      setTab('general');
      setAdding(false);
      setPage('root');
    }
  }, [visible, pairCode, hasHousehold]);

  const startAdding = (as: ApproveFor) => {
    setAddFor(as);
    setAdding(true);
    setPage('add');
  };

  const leave = () => {
    disconnect();
    onClose();
  };

  if (!server) {
    return (
      <Sheet
        visible={visible}
        onClose={onClose}
        title={sample ? 'Sample data' : 'Settings'}
        scroll
        maxHeight={Math.round(height * MAX_HEIGHT_RATIO)}
      >
        <View style={{ gap: PAGE_GAP }}>
          {sample && (
            <Note>
              You're exploring with sample data. Leaving it takes you back to the connect screen, where you can point
              Yarukoto at your own server.
            </Note>
          )}
          <AppearanceGroup label="Appearance" />
          {!MAC && <HelpGroup />}
          <Group>
            <Row title={sample ? 'Leave sample data' : 'Disconnect'} tone="danger" onPress={leave} />
          </Group>
        </View>
      </Sheet>
    );
  }

  const addPane = <AddDevicePane household={household} initialFor={addFor} initialCode={pairCode} />;

  if (desktop) {
    const tabs = TABS.filter((t) => t.id !== 'household' || hasHousehold);
    return (
      <Sheet
        visible={visible}
        onClose={onClose}
        title={adding && tab === 'household' ? 'Add a device' : (tabs.find((t) => t.id === tab)?.label ?? 'Settings')}
        onBack={adding && tab === 'household' ? () => setAdding(false) : undefined}
        dialogWidth={DIALOG_WIDTH}
        dialogMinHeight={DIALOG_MIN_HEIGHT}
        toolbar={
          <TabStrip
            tabs={tabs}
            current={tab}
            onPick={(id) => {
              setTab(id);
              setAdding(false);
            }}
          />
        }
      >
        <View style={{ gap: PAGE_GAP }}>
          {tab === 'general' && (
            <>
              <AppearanceGroup />
              {/* The Mac's Help menu already carries these. */}
              {!MAC && <HelpGroup />}
            </>
          )}
          {tab === 'account' && <AccountPane household={household} onLeft={onClose} />}
          {tab === 'household' &&
            (adding ? (
              addPane
            ) : (
              <>
                <PeoplePane household={household} desktop onAdd={startAdding} />
                <DevicesPane household={household} desktop onAdd={startAdding} />
              </>
            ))}
          {tab === 'server' && <ServerPane onLeft={onClose} />}
        </View>
      </Sheet>
    );
  }

  const back = page === 'root' ? undefined : () => setPage('root');

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={PAGE_TITLES[page]}
      onBack={back}
      scroll
      keyboard
      maxHeight={Math.round(height * MAX_HEIGHT_RATIO)}
    >
      {page === 'root' && <PhoneRoot household={household} hasHousehold={hasHousehold} onOpen={setPage} onAdd={startAdding} />}
      {page === 'account' && <AccountPane household={household} onLeft={onClose} />}
      {page === 'people' && <PeoplePane household={household} desktop={false} onAdd={startAdding} />}
      {page === 'devices' && <DevicesPane household={household} desktop={false} onAdd={startAdding} />}
      {page === 'add' && addPane}
      {page === 'server' && <ServerPane onLeft={onClose} />}
    </Sheet>
  );
}

/** The phone's summary list: everything at a glance, nothing on it that ends anything. */
function PhoneRoot({
  household,
  hasHousehold,
  onOpen,
  onAdd,
}: {
  household: ReturnType<typeof useHouseholdAdmin>;
  hasHousehold: boolean;
  onOpen: (page: Page) => void;
  onAdd: (as: ApproveFor) => void;
}) {
  const styles = useStyles();
  const accent = useAccent();
  const { state } = useTasks();
  const syncStatus = useSyncStatus();
  const { me } = household;

  return (
    <View style={{ gap: PAGE_GAP }}>
      <Group>
        <Row
          chevron
          onPress={() => onOpen('account')}
          accessibilityLabel="Account"
          leading={
            <View style={[styles.avatar, { backgroundColor: `${accent}22` }]}>
              <Text style={[styles.avatarText, { color: accent }]}>{(me?.name ?? '?').slice(0, 1).toUpperCase()}</Text>
            </View>
          }
          title={me?.name ?? 'Signed in'}
          subtitle={me ? (me.role === 'admin' ? 'Admin' : 'Member') : 'Account and sign out'}
        />
      </Group>

      <AppearanceGroup label="General" />

      {hasHousehold && (
        <Group label="Household">
          <Row title="People" value={String(household.live.length)} chevron onPress={() => onOpen('people')} />
          <Row
            divided
            title="Devices"
            value={household.devices ? String(household.devices.length) : null}
            chevron
            onPress={() => onOpen('devices')}
          />
          <Row divided title="Add a device…" tone="action" onPress={() => onAdd('self')} />
        </Group>
      )}

      <Group label="Server">
        <Row value={lastSyncedLabel(new Date(), syncStatus.lastSyncedAt)} chevron onPress={() => onOpen('server')} accessibilityLabel="Server">
          <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <SyncIndicator mode={state.mode} serverUrl={state.serverUrl} />
          </View>
        </Row>
      </Group>

      <HelpGroup />
    </View>
  );
}

/** The row of icon tabs across the top of a desktop settings window. */
function TabStrip({ tabs, current, onPick }: { tabs: typeof TABS; current: Tab; onPick: (tab: Tab) => void }) {
  const styles = useStyles();
  const colors = useColors();
  const accent = useAccent();
  const hoverBg = useHoverBg();
  return (
    <View style={styles.tabs} accessibilityRole="tablist">
      {tabs.map(({ id, label, Icon }) => {
        const on = id === current;
        const color = on ? accent : colors.textSecondary;
        return (
          <Pressable
            key={id}
            onPress={() => onPick(id)}
            style={hoverBg([styles.tab, on && { backgroundColor: `${accent}1F` }], on)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={label}
          >
            <Icon size={20} color={color} />
            <Text style={[styles.tabText, { color }]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 15,
  },
  tabs: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingBottom: 10,
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: c.divider,
  },
  tab: {
    minWidth: 76,
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 5,
    borderRadius: 8,
  },
  tabText: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
  },
}));

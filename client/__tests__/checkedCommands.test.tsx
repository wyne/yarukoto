import React from 'react';
import { act, create } from 'react-test-renderer';
import { useCheckedCommands, useCommand } from '../src/navigation/MenuCommands';

jest.mock('../src/data/platform', () => ({ ...jest.requireActual('../src/data/platform'), DESKTOP_UI: true }));
jest.mock('../src/data/TaskContext', () => ({}));
jest.mock('../src/components/CommandPalette', () => () => null);
jest.mock('../src/navigation/DateTimePickerContext', () => ({ navigationRef: {} }));
jest.mock('../src/navigation/SidebarContext', () => ({}));

let seen: ReadonlySet<string> = new Set();
function Watcher() {
  seen = useCheckedCommands();
  return null;
}

function GroupOptions({ groupBy, enabled = true }: { groupBy: 'none' | 'list'; enabled?: boolean }) {
  useCommand('groupByNone', () => undefined, enabled, groupBy === 'none');
  useCommand('groupByList', () => undefined, enabled, groupBy === 'list');
  return null;
}

test('the option in use is checked, and only while something answers it', () => {
  let root!: ReturnType<typeof create>;
  act(() => {
    root = create(
      <>
        <Watcher />
        <GroupOptions groupBy="none" />
      </>
    );
  });
  expect([...seen]).toEqual(['groupByNone']);

  act(() => {
    root.update(
      <>
        <Watcher />
        <GroupOptions groupBy="list" />
      </>
    );
  });
  expect([...seen]).toEqual(['groupByList']);

  act(() => {
    root.update(
      <>
        <Watcher />
        <GroupOptions groupBy="list" enabled={false} />
      </>
    );
  });
  expect([...seen]).toEqual([]);
  act(() => root.unmount());
});

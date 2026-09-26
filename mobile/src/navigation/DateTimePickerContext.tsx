import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from './types';
import Popover, { PopoverAnchor } from '../components/Popover';
import Dialog from '../components/Dialog';
import DateTimePickerPanel from '../components/pickers/DateTimePickerPanel';
import { useDesktopPresentation } from '../components/Sheet';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export type DateTimePickerMode = 'date' | 'time';

export interface DateTimePickerRequest {
  mode: DateTimePickerMode;
  date?: string;
  time?: string;
  onChange: (date: string | undefined, time: string | undefined) => void;
  onDismiss?: () => void;
  clearDateLabel?: string;
  /** The control this was opened from. On the desktop the picker opens beside it. */
  anchor?: PopoverAnchor | null;
}

export interface ActiveDateTimePickerRequest {
  id: number;
  mode: DateTimePickerMode;
  date?: string;
  time?: string;
  clearDateLabel?: string;
  /**
   * Drawn by the provider as a desktop popover or dialog, rather than by the
   * form-sheet screen a phone navigates to.
   */
  layer?: { anchor: PopoverAnchor | null };
}

interface PickerContextValue {
  active: ActiveDateTimePickerRequest | null;
  prepare: (request: DateTimePickerRequest, layer?: ActiveDateTimePickerRequest['layer']) => number;
  complete: (date: string | undefined, time: string | undefined) => void;
  cancel: () => void;
}

const DateTimePickerContext = createContext<PickerContextValue | null>(null);

export function DateTimePickerProvider({ children }: { children: React.ReactNode }) {
  const nextId = useRef(0);
  const callbacks = useRef<Pick<DateTimePickerRequest, 'onChange' | 'onDismiss'> | null>(null);
  const [active, setActive] = useState<ActiveDateTimePickerRequest | null>(null);

  const prepare = useCallback((request: DateTimePickerRequest, layer?: ActiveDateTimePickerRequest['layer']) => {
    const id = ++nextId.current;
    callbacks.current = { onChange: request.onChange, onDismiss: request.onDismiss };
    setActive({ id, mode: request.mode, date: request.date, time: request.time, clearDateLabel: request.clearDateLabel, layer });
    return id;
  }, []);

  const complete = useCallback((date: string | undefined, time: string | undefined) => {
    const pending = callbacks.current;
    callbacks.current = null;
    setActive(null);
    pending?.onChange(date, time);
    pending?.onDismiss?.();
  }, []);

  const cancel = useCallback(() => {
    const pending = callbacks.current;
    callbacks.current = null;
    setActive(null);
    pending?.onDismiss?.();
  }, []);

  const value = useMemo(() => ({ active, prepare, complete, cancel }), [active, prepare, complete, cancel]);
  const layer = active?.layer;
  const panel = layer && active && (
    <DateTimePickerPanel request={active} onCancel={cancel} onApply={complete} />
  );

  return (
    <DateTimePickerContext.Provider value={value}>
      {children}
      {panel &&
        (layer.anchor ? (
          <Popover visible onClose={cancel} anchor={layer.anchor} align="start" width={340}>
            {panel}
          </Popover>
        ) : (
          <Dialog visible onClose={cancel} width={380}>
            {panel}
          </Dialog>
        ))}
    </DateTimePickerContext.Provider>
  );
}

export function useDateTimePickerRequest(): PickerContextValue {
  const value = useContext(DateTimePickerContext);
  if (!value) throw new Error('useDateTimePickerRequest must be used within DateTimePickerProvider');
  return value;
}

/**
 * Opens the custom date or time picker: a form sheet on a phone, a popover
 * beside `request.anchor` on the desktop (a dialog when there is no anchor).
 */
export function useNativeDateTimePicker() {
  const { prepare } = useDateTimePickerRequest();
  const desktop = useDesktopPresentation();

  const present = useCallback(
    (request: DateTimePickerRequest) => {
      if (desktop) {
        prepare(request, { anchor: request.anchor ?? null });
        return;
      }
      if (!navigationRef.isReady()) return;
      const requestId = prepare(request);
      navigationRef.navigate('DateTimePicker', { mode: request.mode, requestId });
    },
    [prepare, desktop]
  );

  return present;
}

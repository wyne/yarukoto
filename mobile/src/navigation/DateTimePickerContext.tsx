import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from './types';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export type DateTimePickerMode = 'date' | 'time';

export interface DateTimePickerRequest {
  mode: DateTimePickerMode;
  date?: string;
  time?: string;
  onChange: (date: string | undefined, time: string | undefined) => void;
  onDismiss?: () => void;
  clearDateLabel?: string;
}

export interface ActiveDateTimePickerRequest {
  id: number;
  mode: DateTimePickerMode;
  date?: string;
  time?: string;
  clearDateLabel?: string;
}

interface PickerContextValue {
  active: ActiveDateTimePickerRequest | null;
  prepare: (request: DateTimePickerRequest) => number;
  complete: (date: string | undefined, time: string | undefined) => void;
  cancel: () => void;
}

const DateTimePickerContext = createContext<PickerContextValue | null>(null);

export function DateTimePickerProvider({ children }: { children: React.ReactNode }) {
  const nextId = useRef(0);
  const callbacks = useRef<Pick<DateTimePickerRequest, 'onChange' | 'onDismiss'> | null>(null);
  const [active, setActive] = useState<ActiveDateTimePickerRequest | null>(null);

  const prepare = useCallback((request: DateTimePickerRequest) => {
    const id = ++nextId.current;
    callbacks.current = { onChange: request.onChange, onDismiss: request.onDismiss };
    setActive({ id, mode: request.mode, date: request.date, time: request.time, clearDateLabel: request.clearDateLabel });
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
  return <DateTimePickerContext.Provider value={value}>{children}</DateTimePickerContext.Provider>;
}

export function useDateTimePickerRequest(): PickerContextValue {
  const value = useContext(DateTimePickerContext);
  if (!value) throw new Error('useDateTimePickerRequest must be used within DateTimePickerProvider');
  return value;
}

export function useNativeDateTimePicker() {
  const { prepare } = useDateTimePickerRequest();

  const present = useCallback(
    (request: DateTimePickerRequest) => {
      if (!navigationRef.isReady()) return;
      const requestId = prepare(request);
      navigationRef.navigate('DateTimePicker', { mode: request.mode, requestId });
    },
    [prepare]
  );

  return present;
}

import React, { useEffect, useState } from 'react';
import BottomSheet from '../BottomSheet';
import type { PopoverAnchor } from '../Popover';
import DueDateTimeControls from './DueDateTimeControls';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Forwarded to BottomSheet: a point makes this a popover on wide web. */
  anchor?: PopoverAnchor | null;
  /** Forwarded to BottomSheet: returns to the menu that opened this. */
  onBack?: () => void;
  initialDate?: string;
  initialTime?: string;
  onApply: (dueDate: string | undefined, dueTime: string | undefined) => void;
}

export default function DueDatePickerSheet({ visible, onClose, initialDate, initialTime, onApply, anchor, onBack }: Props) {
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(initialTime);

  useEffect(() => {
    if (visible) {
      setDate(initialDate);
      setTime(initialTime);
    }
  }, [visible, initialDate, initialTime]);

  const apply = () => {
    onApply(date, date ? time : undefined);
    onClose();
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Due date"
      anchor={anchor}
      popoverWidth={330}
      onBack={onBack}
      onCancel={onClose}
      onConfirm={apply}
    >
      <DueDateTimeControls date={date} time={time} onChange={(nextDate, nextTime) => {
        setDate(nextDate);
        setTime(nextTime);
      }} />
    </BottomSheet>
  );
}

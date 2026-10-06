import { addDays, toISODate } from '../../data/dateUtils';

export const QUICK_DATES: { id: string; label: string; get: (now: Date) => string }[] = [
  { id: 'today', label: 'Today', get: (now) => toISODate(now) },
  { id: 'tomorrow', label: 'Tomorrow', get: (now) => toISODate(addDays(now, 1)) },
  { id: 'next-week', label: 'Next week', get: (now) => toISODate(addDays(now, 7)) },
  {
    id: 'this-weekend',
    label: 'This weekend',
    get: (now) => toISODate(addDays(now, (6 - now.getDay() + 7) % 7 || 6)),
  },
];

export const QUICK_TIMES = [
  { id: '09:00', label: '9:00 AM' },
  { id: '12:00', label: '12:00 PM' },
  { id: '17:00', label: '5:00 PM' },
  { id: '20:00', label: '8:00 PM' },
] as const;

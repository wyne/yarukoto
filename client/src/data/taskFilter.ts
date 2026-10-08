// Lives in the domain package so the server evaluates saved filters exactly as the app does.
export {
  DUE_FILTERS,
  EMPTY_CRITERIA,
  INBOX_LIST_ID,
  STATUS_FILTERS,
  filterTasks,
  isEmptyCriteria,
  normalizeCriteria,
  sameCriteria,
  taskMatcher,
} from '@yarukoto/domain/taskFilter';
export type { DueFilter, StatusFilter, TaskCriteria } from '@yarukoto/domain/taskFilter';

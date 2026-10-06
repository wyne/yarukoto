// Lives in shared/ so the server evaluates saved filters exactly as the app does.
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
} from '../../../shared/taskFilter';
export type { DueFilter, StatusFilter, TaskCriteria } from '../../../shared/taskFilter';

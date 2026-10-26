// Lives in the domain package so the server's saved filters age tasks out exactly as the app does.
export {
  ARCHIVE_AFTER_DAYS,
  DEFAULT_TRASH_RETENTION_DAYS,
  completedOn,
  isArchived,
  trashCutoff,
  trashDaysLeft,
} from '@yarukoto/domain/retention';

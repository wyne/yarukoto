// Lives in the domain package so the server's task API and MCP tools parse the same syntax.
export { parseQuickAdd, quickAddSpans } from '@yarukoto/domain/quickAdd';
export type { ParsedQuickAdd, QuickAddSpan, QuickAddTokenKind } from '@yarukoto/domain/quickAdd';

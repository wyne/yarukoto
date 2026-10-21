// Lives in the domain package so the server's task API and MCP tools parse the same syntax.
export { parseQuickAdd, quickAddSpans, removeQuickAddSpans, shiftLiteralRanges } from '@yarukoto/domain/quickAdd';
export type { ParsedQuickAdd, QuickAddRange, QuickAddSpan, QuickAddTokenKind } from '@yarukoto/domain/quickAdd';

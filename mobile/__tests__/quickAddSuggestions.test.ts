import { applySuggestion } from '../src/data/quickAddSuggestions';

describe('quick add suggestions', () => {
  test('replaces a partial trailing token at the start or end of text', () => {
    expect(applySuggestion('~ad', '~Admin')).toBe('~Admin ');
    expect(applySuggestion('Pay rent #ho', '#home')).toBe('Pay rent #home ');
    expect(applySuggestion('Plan !m', '!medium')).toBe('Plan !medium ');
  });

  test('leaves text unchanged when there is no trailing suggestion token', () => {
    expect(applySuggestion('Pay #home now', '#house')).toBe('Pay #home now');
  });
});

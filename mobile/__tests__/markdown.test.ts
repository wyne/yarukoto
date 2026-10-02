import {
  insertLink,
  markdownToPlainText,
  toggleBold,
  toggleBulletList,
  toggleCodeBlock,
  toggleHeading,
  toggleInlineCode,
  toggleItalic,
  toggleNumberedList,
  toggleQuote,
  toggleStrikethrough,
} from '../src/data/markdown';

describe('Markdown note formatting', () => {
  test.each([
    ['bold', toggleBold, 'hello **world**', { start: 8, end: 13 }],
    ['italic', toggleItalic, 'hello _world_', { start: 7, end: 12 }],
    ['strikethrough', toggleStrikethrough, 'hello ~~world~~', { start: 8, end: 13 }],
    ['inline code', toggleInlineCode, 'hello `world`', { start: 7, end: 12 }],
  ])('%s wraps and unwraps the selection', (_name, formatter, wrapped, wrappedSelection) => {
    const added = formatter('hello world', { start: 6, end: 11 });
    expect(added).toEqual({ text: wrapped, selection: wrappedSelection });
    expect(formatter(added.text, added.selection)).toEqual({
      text: 'hello world',
      selection: { start: 6, end: 11 },
    });
  });

  test('empty inline formatting leaves the caret between markers', () => {
    expect(toggleBold('hello ', { start: 6, end: 6 })).toEqual({
      text: 'hello ****',
      selection: { start: 8, end: 8 },
    });
  });

  test('link formatting selects the URL when text is selected', () => {
    expect(insertLink('read docs', { start: 5, end: 9 })).toEqual({
      text: 'read [docs](https://)',
      selection: { start: 12, end: 20 },
    });
  });

  test('an empty link selects its placeholder label', () => {
    expect(insertLink('', { start: 0, end: 0 })).toEqual({
      text: '[link text](https://)',
      selection: { start: 1, end: 10 },
    });
  });

  test('line formatters apply to every selected line and toggle off', () => {
    const bullets = toggleBulletList('one\ntwo', { start: 0, end: 7 });
    expect(bullets.text).toBe('- one\n- two');
    expect(toggleBulletList(bullets.text, bullets.selection).text).toBe('one\ntwo');

    expect(toggleNumberedList('one\ntwo', { start: 0, end: 7 }).text).toBe('1. one\n2. two');
    expect(toggleQuote('one\ntwo', { start: 0, end: 7 }).text).toBe('> one\n> two');
    expect(toggleHeading('one', { start: 1, end: 1 })).toEqual({
      text: '## one',
      selection: { start: 4, end: 4 },
    });
  });

  test('a trailing newline does not format the following line', () => {
    expect(toggleBulletList('one\ntwo', { start: 0, end: 4 }).text).toBe('- one\ntwo');
  });

  test('code block formatting round trips', () => {
    const added = toggleCodeBlock('run this', { start: 0, end: 8 });
    expect(added).toEqual({
      text: '```\nrun this\n```',
      selection: { start: 4, end: 12 },
    });
    expect(toggleCodeBlock(added.text, added.selection)).toEqual({
      text: 'run this',
      selection: { start: 0, end: 8 },
    });
  });
});

describe('Markdown activity summaries', () => {
  test('keeps readable content while removing Markdown punctuation', () => {
    expect(markdownToPlainText([
      '## Deploy',
      '',
      '- Run **backup**',
      '- Read [the docs](https://example.com)',
      '> Then use `docker compose up`',
    ].join('\n'))).toBe('Deploy Run backup Read the docs Then use docker compose up');
  });

  test('uses image alt text and preserves fenced code content', () => {
    expect(markdownToPlainText('![rack](https://example.com/rack.jpg)\n```sh\necho ok\n```'))
      .toBe('rack echo ok');
  });

  test('returns the fallback for an empty note', () => {
    expect(markdownToPlainText('  ')).toBe('None');
    expect(markdownToPlainText('', 'Empty')).toBe('Empty');
  });
});

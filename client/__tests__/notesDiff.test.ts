import { diffNotes } from '../src/data/notesDiff';

describe('notes diff for the activity feed', () => {
  it('shows only the lines that changed', () => {
    const before = 'Groceries\n- milk\n- eggs\n- bread';
    const after = 'Groceries\n- milk\n- butter\n- bread';
    expect(diffNotes(before, after)).toEqual({
      lines: [
        { kind: 'removed', text: '• eggs' },
        { kind: 'added', text: '• butter' },
      ],
      hidden: 0,
    });
  });

  it('reports added and removed lines on their own', () => {
    expect(diffNotes('one\ntwo', 'one\ntwo\nthree').lines).toEqual([{ kind: 'added', text: 'three' }]);
    expect(diffNotes('one\ntwo\nthree', 'one\nthree').lines).toEqual([{ kind: 'removed', text: 'two' }]);
    expect(diffNotes('', 'first note').lines).toEqual([{ kind: 'added', text: 'first note' }]);
  });

  it('moves the start of a long edited line up to the edit', () => {
    const before = 'Call the plumber about the kitchen sink before Friday';
    const after = 'Call the plumber about the kitchen sink before Thursday';
    expect(diffNotes(before, after).lines).toEqual([
      { kind: 'removed', text: '…sink before Friday' },
      { kind: 'added', text: '…sink before Thursday' },
    ]);
  });

  it('leaves short edited lines whole', () => {
    expect(diffNotes('buy milk', 'buy oat milk').lines).toEqual([
      { kind: 'removed', text: 'buy milk' },
      { kind: 'added', text: 'buy oat milk' },
    ]);
  });

  it('caps the lines it returns and counts the rest', () => {
    const diff = diffNotes('a\nb\nc', 'x\ny\nz');
    expect(diff.lines).toHaveLength(3);
    expect(diff.lines.map((line) => line.kind)).toEqual(['removed', 'removed', 'removed']);
    expect(diff.hidden).toBe(3);
  });

  it('ignores blank lines and line-ending changes', () => {
    expect(diffNotes('one\ntwo', 'one\n\ntwo').lines).toEqual([]);
    expect(diffNotes('one\r\ntwo', 'one\ntwo').lines).toEqual([]);
  });
});

import { describe, expect, it } from '@jest/globals';
import { handleKey } from '../src/ui';

describe('CLI menu key handling', () => {
  it('moves with arrows and j/k, wrapping at both ends', () => {
    expect(handleKey(0, 3, 'down')).toEqual({ index: 1 });
    expect(handleKey(2, 3, 'j')).toEqual({ index: 0 });
    expect(handleKey(0, 3, 'up')).toEqual({ index: 2 });
    expect(handleKey(1, 3, 'k')).toEqual({ index: 0 });
  });

  it('Enter picks the current row; q and Esc go back', () => {
    expect(handleKey(1, 3, 'return')).toEqual({ index: 1, done: 'pick' });
    expect(handleKey(1, 3, 'enter')).toEqual({ index: 1, done: 'pick' });
    expect(handleKey(1, 3, 'q')).toEqual({ index: 1, done: 'back' });
    expect(handleKey(1, 3, 'escape')).toEqual({ index: 1, done: 'back' });
  });

  it('a number key picks that row, but only if the row exists', () => {
    expect(handleKey(0, 3, '3')).toEqual({ index: 2, done: 'pick' });
    expect(handleKey(0, 3, '4')).toEqual({ index: 0 });
    expect(handleKey(0, 3, 'x')).toEqual({ index: 0 });
  });
});

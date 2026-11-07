import path from 'path';
import { describe, expect, it } from '@jest/globals';
import { HintService } from '../src/hint-service';
import { loadProblems } from '../src/problem-loader';

const PROBLEMS_DIR = path.join(__dirname, '..', 'problems');

describe('hint-service', () => {
  const service = new HintService();
  const problems = loadProblems(PROBLEMS_DIR);
  const p = problems.find((x) => x.id === 'two-sum')!;

  it('returns hints by level', () => {
    const h1 = service.getHint(p, 1);
    expect(h1).not.toBeNull();
    expect(h1?.level).toBe(1);
    expect(h1?.content).toContain('hash map');
  });

  it('returns null for nonexistent level', () => {
    expect(service.getHint(p, 999)).toBeNull();
  });

  it('returns hints up to maxLevel', () => {
    const hints = service.getHintsUpTo(p, 1);
    expect(hints.length).toBe(1);
    expect(hints[0].level).toBe(1);

    const all = service.getHintsUpTo(p, 10);
    expect(all.length).toBe(p.hints.length);
  });

  it('reports next hint level', () => {
    expect(service.getNextHintLevel(p, 1)).toBe(2);
    const lastLevel = Math.max(...p.hints.map((h) => h.level));
    expect(service.getNextHintLevel(p, lastLevel)).toBeNull();
  });

  it('reports whether more hints exist', () => {
    expect(service.hasMoreHints(p, 1)).toBe(p.hints.length > 1);
    const lastLevel = Math.max(...p.hints.map((h) => h.level));
    expect(service.hasMoreHints(p, lastLevel)).toBe(false);
  });
});

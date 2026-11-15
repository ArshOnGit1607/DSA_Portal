import { describe, expect, it, beforeEach } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadStats, recordSubmission, saveStats } from '../src/stats';

let file: string;
beforeEach(() => {
  file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dsa-cli-')), 'nested', 'stats.json');
});

describe('CLI stats (JSON persistence)', () => {
  it('starts empty when there is no stats file yet', () => {
    expect(loadStats(file)).toEqual({ stats: { attempted: [], solved: [], submissions: 0 } });
  });

  it('survives a restart: what is saved is loaded back', () => {
    let s = loadStats(file).stats;
    s = recordSubmission(s, 'two-sum', false);
    s = recordSubmission(s, 'two-sum', true);
    s = recordSubmission(s, 'binary-search', false);
    saveStats(s, file);
    expect(loadStats(file).stats).toEqual({
      attempted: ['two-sum', 'binary-search'],
      solved: ['two-sum'],
      submissions: 3,
    });
    expect(fs.readdirSync(path.dirname(file))).toEqual(['stats.json']); // no temp file left behind
  });

  it('counts a problem once however often it is attempted or solved', () => {
    let s = loadStats(file).stats;
    for (let i = 0; i < 3; i++) s = recordSubmission(s, 'two-sum', true);
    expect(s).toEqual({ attempted: ['two-sum'], solved: ['two-sum'], submissions: 3 });
  });

  it.each([['not json {'], ['{"attempted": "two-sum", "solved": [], "submissions": 1}']])(
    'moves an unreadable file aside instead of overwriting it: %s',
    (content) => {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
      const { stats, warning } = loadStats(file);
      expect(stats).toEqual({ attempted: [], solved: [], submissions: 0 });
      expect(warning).toContain('.bak');
      expect(fs.readFileSync(`${file}.bak`, 'utf8')).toBe(content);
    }
  );
});

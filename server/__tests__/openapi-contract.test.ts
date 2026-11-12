import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { parse } from 'yaml';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { judgeSubmission, statsServiceStub } from '@dsa-portal/workers';
import { buildApp } from '../src/app';
import { InMemoryProblemRepository } from '../src/modules/problems/in-memory-problem.repository';
import { InMemorySubmissionRepository } from '../src/modules/submissions/in-memory-submission.repository';

// Load the spec once and make component $refs resolvable from any inline schema.
const raw = JSON.stringify(parse(fs.readFileSync(path.join(__dirname, '../../docs/openapi.yaml'), 'utf8')));
const spec = JSON.parse(raw.split('"#/components/').join('"spec#/components/'));
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema({ $id: 'spec', components: spec.components });

// Routes deliberately outside the spec (see /docs/CHANGE_REQUESTS.md CR-002).
const NOT_IN_SPEC = new Set(['GET /api/v1/health']);

const toSpecPath = (url: string) => url.replace(/:(\w+)/g, '{$1}');

function schemaFor(route: string, status: number) {
  const [method, url] = route.split(' ');
  let res = spec.paths[toSpecPath(url)]?.[method.toLowerCase()]?.responses?.[String(status)];
  if (res?.$ref) res = spec.components.responses[res.$ref.split('/').pop()];
  if (res) return res.content['application/json'].schema;
  // Success codes must be documented; undocumented error codes must still use the Error format (CR-003).
  if (status >= 400) return { $ref: 'spec#/components/schemas/Error' };
  throw new Error(`${route} → ${status} is not documented in openapi.yaml`);
}

interface Case {
  route: string; // "METHOD /registered/:url"
  url: string;
  status: number;
  token?: 'A' | 'B';
  body?: object;
  headers?: Record<string, string>;
}

describe('every implemented route matches /docs/openapi.yaml', () => {
  const deps = {
    problems: new InMemoryProblemRepository(),
    submissions: new InMemorySubmissionRepository(),
    stats: statsServiceStub,
  };
  const app = buildApp({ logger: false, problems: deps.problems, submissions: deps.submissions });
  const registered: string[] = [];
  app.addHook('onRoute', (r) => {
    [r.method].flat().filter((m) => m !== 'HEAD').forEach((m) => registered.push(`${m} ${r.url}`));
  });
  const tokens: Record<'A' | 'B', string> = { A: '', B: '' };
  let submissionId = '';

  beforeAll(async () => {
    await app.ready();
    tokens.A = app.jwt.sign({ sub: randomUUID() });
    tokens.B = app.jwt.sign({ sub: randomUUID() });
    const solve =
      'function solve({ nums, target }) { const m = new Map(); for (let i = 0; i < nums.length; i++) { if (m.has(target - nums[i])) return [m.get(target - nums[i]), i]; m.set(nums[i], i); } }';
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/submissions',
      headers: { authorization: `Bearer ${tokens.A}` },
      payload: { problemId: 'two-sum', code: solve },
    });
    submissionId = res.json().submissionId;
    await judgeSubmission(submissionId, deps); // the worker's job: unlocks A's solution
  });
  afterAll(() => app.close());

  const cases = (): Case[] => [
    { route: 'GET /api/v1/topics', url: '/api/v1/topics', status: 200 },
    { route: 'GET /api/v1/problems', url: '/api/v1/problems?limit=2', status: 200, token: 'A' },
    { route: 'GET /api/v1/problems', url: '/api/v1/problems?difficulty=Insane', status: 400, token: 'A' },
    { route: 'GET /api/v1/problems', url: '/api/v1/problems', status: 401 },
    { route: 'GET /api/v1/problems/random', url: '/api/v1/problems/random?difficulty=Easy', status: 200, token: 'A' },
    { route: 'GET /api/v1/problems/random', url: '/api/v1/problems/random?topic=Graphs', status: 404, token: 'A' },
    { route: 'GET /api/v1/problems/:id', url: '/api/v1/problems/two-sum', status: 200, token: 'A' },
    { route: 'GET /api/v1/problems/:id', url: '/api/v1/problems/nope', status: 404, token: 'A' },
    { route: 'GET /api/v1/problems/:id/hints', url: '/api/v1/problems/two-sum/hints?upto=1', status: 200, token: 'A' },
    { route: 'GET /api/v1/problems/:id/hints', url: '/api/v1/problems/nope/hints', status: 404, token: 'A' },
    { route: 'GET /api/v1/problems/:id/solution', url: '/api/v1/problems/two-sum/solution', status: 200, token: 'A' },
    { route: 'GET /api/v1/problems/:id/solution', url: '/api/v1/problems/two-sum/solution', status: 403, token: 'B' },
    { route: 'GET /api/v1/problems/:id/solution', url: '/api/v1/problems/nope/solution', status: 404, token: 'A' },
    { route: 'POST /api/v1/submissions', url: '/api/v1/submissions', status: 202, token: 'B', body: { problemId: 'two-sum', code: 'function solve() { return [0, 1]; }' } },
    { route: 'POST /api/v1/submissions', url: '/api/v1/submissions', status: 400, token: 'B', body: { problemId: 'two-sum' } },
    { route: 'POST /api/v1/submissions', url: '/api/v1/submissions', status: 202, token: 'B', body: { problemId: 'two-sum', code: 'function solve() { return [0, 1]; }' }, headers: { 'idempotency-key': 'contract-1' } },
    { route: 'POST /api/v1/submissions', url: '/api/v1/submissions', status: 409, token: 'B', body: { problemId: 'two-sum', code: 'function solve() { return []; }' }, headers: { 'idempotency-key': 'contract-1' } },
    { route: 'POST /api/v1/submissions', url: '/api/v1/submissions', status: 404, token: 'B', body: { problemId: 'nope', code: 'x' } },
    { route: 'POST /api/v1/submissions', url: '/api/v1/submissions', status: 401, body: { problemId: 'two-sum', code: 'x' } },
    { route: 'GET /api/v1/submissions', url: '/api/v1/submissions?limit=5', status: 200, token: 'A' },
    { route: 'GET /api/v1/submissions/:id', url: `/api/v1/submissions/${submissionId}`, status: 200, token: 'A' },
    { route: 'GET /api/v1/submissions/:id', url: `/api/v1/submissions/${submissionId}`, status: 404, token: 'B' },
    { route: 'GET /api/v1/submissions/:id', url: `/api/v1/submissions/${submissionId}`, status: 401 },
  ];

  it('every registered route is in the spec and has a contract case', () => {
    const covered = new Set(cases().map((c) => c.route));
    const apiRoutes = registered.filter((r) => r.includes(' /api/v1/') && !NOT_IN_SPEC.has(r));
    expect(apiRoutes.length).toBeGreaterThan(0);
    for (const route of apiRoutes) {
      const [method, url] = route.split(' ');
      expect({ route, inSpec: Boolean(spec.paths[toSpecPath(url)]?.[method.toLowerCase()]) }).toEqual({ route, inSpec: true });
      expect({ route, covered: covered.has(route) }).toEqual({ route, covered: true });
    }
  });

  it('every response matches its documented status and schema', async () => {
    for (const c of cases()) {
      const res = await app.inject({
        method: c.route.split(' ')[0] as 'GET' | 'POST',
        url: c.url,
        headers: { ...c.headers, ...(c.token ? { authorization: `Bearer ${tokens[c.token]}` } : {}) },
        payload: c.body,
      });
      const label = `${c.route} (${c.url}) → ${c.status}`;
      expect({ label, status: res.statusCode }).toEqual({ label, status: c.status });
      const validate = ajv.compile(schemaFor(c.route, c.status));
      const ok = validate(res.json());
      expect({ label, errors: ok ? null : validate.errors }).toEqual({ label, errors: null });
    }
  });
});

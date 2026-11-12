import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'yaml';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { judgeSubmission, statsServiceStub } from '@dsa-portal/workers';
import { buildApp } from '../src/app';
import { InMemoryProblemRepository } from '../src/modules/problems/in-memory-problem.repository';
import { InMemorySubmissionRepository } from '../src/modules/submissions/in-memory-submission.repository';
import { authRoutes } from '../src/modules/auth/routes';
import { InMemoryAuthStore } from '../src/modules/auth/store';
import { statsRoutes } from '../src/modules/stats/routes';
import { InMemoryStatsRepository } from '../src/modules/stats/in-memory-stats.repository';

// Validate every response against the agreed spec, like openapi-contract.test.ts does.
const raw = JSON.stringify(parse(fs.readFileSync(path.join(__dirname, '../../docs/openapi.yaml'), 'utf8')));
const spec = JSON.parse(raw.split('"#/components/').join('"spec#/components/'));
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema({ $id: 'spec', components: spec.components });
function matchesSpec(method: string, url: string, status: number, body: unknown) {
  let res = spec.paths[url][method].responses[String(status)];
  if (res?.$ref) res = spec.components.responses[res.$ref.split('/').pop()];
  const schema = res?.content?.['application/json']?.schema ?? { $ref: 'spec#/components/schemas/Error' };
  const validate = ajv.compile(schema);
  if (!validate(body)) throw new Error(`${method} ${url} ${status}: ${ajv.errorsText(validate.errors)}`);
}

const TWO_SUM_OK =
  'function solve({ nums, target }) { const m = new Map(); for (let i = 0; i < nums.length; i++) { if (m.has(target - nums[i])) return [m.get(target - nums[i]), i]; m.set(nums[i], i); } }';

describe('auth + stats modules (Person 3)', () => {
  const deps = {
    problems: new InMemoryProblemRepository(),
    submissions: new InMemorySubmissionRepository(),
    stats: statsServiceStub,
  };
  const app = buildApp({ logger: false, problems: deps.problems, submissions: deps.submissions });
  // Until CR-010 wires these into app.ts, register them the same way app.ts would.
  app.register(
    async (api) => {
      await api.register(authRoutes, { auth: new InMemoryAuthStore() });
      await api.register(statsRoutes, { stats: new InMemoryStatsRepository(deps.problems, deps.submissions) });
    },
    { prefix: '/api/v1' }
  );
  beforeAll(() => app.ready());
  afterAll(() => app.close());

  const call = async (method: 'GET' | 'POST', specPath: string, opts: { payload?: object; headers?: Record<string, string> } = {}) => {
    const res = await app.inject({ method, url: `/api/v1${specPath}`, ...opts });
    matchesSpec(method.toLowerCase(), `/api/v1${specPath}`, res.statusCode, res.body ? res.json() : undefined);
    return res;
  };
  const alice = { username: 'alice', email: 'Alice@Example.com', password: 'correct horse' };
  const login = (email = alice.email, password = alice.password) => call('POST', '/auth/login', { payload: { email, password } });
  const cookieOf = (res: { headers: Record<string, unknown> }) => String(res.headers['set-cookie']).split(';')[0];

  it('registers a user, without leaking the password hash', async () => {
    const res = await call('POST', '/auth/register', { payload: alice });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ username: 'alice', email: 'alice@example.com', role: 'user' });
    expect(res.body).not.toMatch(/password/i);
  });

  it('rejects duplicate usernames/emails (409) and invalid input (400)', async () => {
    expect((await call('POST', '/auth/register', { payload: { ...alice, username: 'alice2' } })).statusCode).toBe(409);
    expect((await call('POST', '/auth/register', { payload: { ...alice, email: 'x@y.io' } })).statusCode).toBe(409);
    const bad = await call('POST', '/auth/register', { payload: { username: 'ab', email: 'nope', password: 'short' } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toBe('VALIDATION_ERROR');
  });

  it('logs in (email is case-insensitive) and sets an HttpOnly refresh cookie', async () => {
    const res = await login('alice@EXAMPLE.com');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ expiresIn: 900 });
    expect(String(res.headers['set-cookie'])).toMatch(/^refresh_token=[^;]+; .*HttpOnly; SameSite=Strict/);
  });

  it('gives the same 401 for a wrong password and an unknown email', async () => {
    const wrong = await login(alice.email, 'wrong password');
    const unknown = await login('nobody@example.com');
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json().message).toBe(unknown.json().message);
  });

  it('GET /auth/me needs a valid access token', async () => {
    const { accessToken } = (await login()).json();
    const me = await call('GET', '/auth/me', { headers: { authorization: `Bearer ${accessToken}` } });
    expect(me.json()).toMatchObject({ username: 'alice' });
    expect((await call('GET', '/auth/me')).statusCode).toBe(401);
    expect((await call('GET', '/auth/me', { headers: { authorization: 'Bearer junk' } })).statusCode).toBe(401);
  });

  it('refresh issues a new access token until logout revokes the session', async () => {
    const cookie = cookieOf(await login());
    const refreshed = await call('POST', '/auth/refresh', { headers: { cookie } });
    expect(refreshed.statusCode).toBe(200);
    const me = await call('GET', '/auth/me', { headers: { authorization: `Bearer ${refreshed.json().accessToken}` } });
    expect(me.statusCode).toBe(200);

    const out = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { cookie } });
    expect(out.statusCode).toBe(204);
    expect(String(out.headers['set-cookie'])).toMatch(/^refresh_token=; Max-Age=0/);
    expect((await call('POST', '/auth/refresh', { headers: { cookie } })).statusCode).toBe(401);
    expect((await call('POST', '/auth/refresh')).statusCode).toBe(401);
    expect((await call('POST', '/auth/refresh', { headers: { cookie: 'refresh_token=forged' } })).statusCode).toBe(401);
  });

  it('stats count attempted/solved per problem and per topic from judged submissions', async () => {
    const auth = { authorization: `Bearer ${(await login()).json().accessToken}` };
    const submit = async (problemId: string, code: string) => {
      const res = await app.inject({ method: 'POST', url: '/api/v1/submissions', headers: auth, payload: { problemId, code } });
      await judgeSubmission(res.json().submissionId, deps);
    };

    const empty = (await call('GET', '/stats/me', { headers: auth })).json();
    expect(empty).toMatchObject({ attempted: 0, solved: 0, topics: [] });
    expect(empty.totalProblems).toBeGreaterThan(0);

    await submit('two-sum', 'function solve() { return []; }'); // wrong
    await submit('two-sum', TWO_SUM_OK); // then right
    await submit('two-sum', 'function solve() { return []; }'); // wrong again: still solved
    const me = (await call('GET', '/stats/me', { headers: auth })).json();
    expect(me).toMatchObject({ attempted: 1, solved: 1 });
    expect(me.topics).toEqual([{ topic: 'Arrays', attempted: 1, solved: 1 }]);

    const topics = (await call('GET', '/stats/me/topics', { headers: auth })).json();
    expect(topics).toEqual({ topics: me.topics });
    expect((await call('GET', '/stats/me')).statusCode).toBe(401);
  });
});

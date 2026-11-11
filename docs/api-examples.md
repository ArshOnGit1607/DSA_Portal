# API examples (Day 4)

curl examples for every endpoint implemented on Day 4. Contract: `/docs/openapi.yaml`.
Auth, stats, leaderboard, daily-challenge, admin and sync endpoints come later (Persons 2/3, Days 5–7).

## Setup

```bash
npm install
npm run build
npm run start -w server          # or: npm run dev -w server  (listens on PORT, default 3000)
```

```bash
B=http://localhost:3000/api/v1
# TEMP until Person 3's /auth/login is merged: sign a dev token with the same JWT_SECRET as the server.
TOKEN=$(npm run -s dev:token -w server)
H="Authorization: Bearer $TOKEN"
```

Every response carries an `x-request-id` header (send your own to correlate logs).
Errors always look like:

```json
{ "error": "VALIDATION_ERROR", "message": "difficulty: Invalid enum value ...", "statusCode": 400,
  "timestamp": "2026-11-11T16:35:52.464Z", "path": "/api/v1/problems" }
```

## Health (not in spec yet, see CR-002)

```bash
curl -s $B/health
# {"status":"ok","service":"dsa-portal-server"}
```

## Topics (no auth)

```bash
curl -s $B/topics
# {"topics":["Arrays","LinkedList","Strings"]}
```

## Problems

```bash
# List with filters + keyset pagination (limit 1..100, default 20)
curl -s "$B/problems?limit=2&difficulty=Easy" -H "$H"
# {"data":[{"id":"merge-two-sorted-lists",...},{"id":"palindrome-number",...}],"nextCursor":"cGFsaW5kcm9tZS1udW1iZXI"}

# Next page: pass nextCursor back
curl -s "$B/problems?limit=2&cursor=cGFsaW5kcm9tZS1udW1iZXI" -H "$H"

# Random problem by topic and/or difficulty (404 if nothing matches)
curl -s "$B/problems/random?topic=Arrays&difficulty=Easy" -H "$H"

# One problem by id (testCases input/expected are JSON strings)
curl -s $B/problems/two-sum -H "$H"
```

## Hints and solution

```bash
# First N hints (omit upto for all)
curl -s "$B/problems/two-sum/hints?upto=1" -H "$H"
# {"hints":["Use a hash map to store value -> index as you iterate."]}

# Reference solution: 403 SOLUTION_LOCKED until this user has a submission that passed every test
curl -s $B/problems/two-sum/solution -H "$H"
```

## Submissions

```bash
# Submit (judged synchronously on Day 4; still returns 202 so Day 5's queue keeps the same contract)
curl -s -X POST $B/submissions -H "$H" -H 'Content-Type: application/json' \
  -d '{"problemId":"two-sum","code":"function solve({ nums, target }) { const m = new Map(); for (let i = 0; i < nums.length; i++) { if (m.has(target - nums[i])) return [m.get(target - nums[i]), i]; m.set(nums[i], i); } }"}'
# {"submissionId":"e2ba8898-...","status":"judged"}

# Status + per-test results (404 for other users' submissions)
curl -s $B/submissions/e2ba8898-... -H "$H"
# {"id":"e2ba8898-...","status":"judged","passed":3,"total":3,"results":[{"testCaseIndex":0,"passed":true,"actual":"[0,1]","expected":"[0,1]"},...],...}

# My submissions, newest first, optional problemId filter, keyset pagination
curl -s "$B/submissions?limit=5&problemId=two-sum" -H "$H"
```

## Common errors

```bash
curl -s $B/problems                                   # 401 UNAUTHORIZED
curl -s "$B/problems?difficulty=Insane" -H "$H"       # 400 VALIDATION_ERROR
curl -s $B/problems/nope -H "$H"                      # 404 NOT_FOUND
```

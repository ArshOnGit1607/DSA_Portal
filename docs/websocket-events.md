# WebSocket / Socket.IO Events

Namespace: `/`

Client -> Server:
- `auth:join` { token } — authenticate socket via JWT
- `submission:run` { problemId, code } — request a local/remote judge run

Server -> Client:
- `submission:result` { problemId, passed, total, results } — judge outcome
- `leaderboard:update` { leaderboard } — realtime leaderboard delta
- `auth:error` { message } — authentication failure

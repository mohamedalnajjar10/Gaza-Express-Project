# Frontend API handoff

The local Docker base URL is `http://127.0.0.1:5050/api/v1`. Swagger is available at `/api/v1/docs`. Use the same hostname consistently for cookies and configure `CORS_ORIGIN` and `FRONTEND_URL` for the frontend origin.

- JSON success uses `{ success: true, data, timestamp }`. The store list nests rows under `data.data` and paging under `data.meta`. Orders and notifications use `nextBefore`. HTTP 204 has no body.
- Errors contain `statusCode` and `message`. Handle the HTTP status before displaying the message. OAuth redirects and the WhatsApp challenge use their own response formats.
- Send the access token as a bearer token. Login, OTP verification and refresh return tokens under `data.tokens`. Serialize refresh calls and keep the replacement refresh token. Logout revokes the supplied refresh token.
- Treat decimal response values as strings when preserving precision. The server calculates the authoritative total. Send an `Idempotency-Key` on checkout and reuse it for the same retry. On a `409`, refresh the cart or order before applying a new change.
- Google requires a browser smoke test before enabling it. SMS delivery is simulated in the endpoint suite. WhatsApp and electronic payment tests use signed fixtures. See `PRODUCTION_RELEASE.md`, `ORDERS.md` and `PAYMENTS.md` for the individual flows.

Run `npm run test:e2e -- --runInBand` against the migrated test database to verify the controller routes. The suite compares the registered route inventory with the HTTP responses observed during the run.

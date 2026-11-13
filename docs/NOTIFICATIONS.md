# Notifications and background delivery

Order creation, transitions and confirmed payments write in-app notifications in the same MySQL transaction. The inbox is available through `GET /api/v1/notifications`, with cursor `before`, and `PATCH /api/v1/notifications/:id/read`. Notifications are scoped to their recipients. No message body, delivery code or payment credential is included.

OTP issuance writes an SMS job in the same transaction. The queue encrypts the message secret using AES-256-GCM and removes it on terminal outcomes. The queue contains no recipient phone number. The worker reads it from the current OTP and skips expired, consumed or replaced codes. Use a dedicated, shared 32-byte key in `SMS_OUTBOX_KEY` across API and workers. Drain active jobs before changing the key.

Run the API normally. Start the worker separately with `npm run start:worker` after building, or `docker compose --profile sms up --build -d`. Multiple workers can run. Only the process that claims a job makes its network call. Twilio has a five-second request deadline. Explicit rate-limit responses retry with exponential backoff and jitter, up to three attempts. Ambiguous network results and lost worker leases become `UNKNOWN` for review. Automatically retrying those could send a duplicate. `ACCEPTED` means accepted by the provider, and handset delivery must be verified through the provider and the test recipient. The admin endpoint `GET /api/v1/notifications/sms-queue` reports states and recent failures without message contents.

## Configure live SMS

1. Set `SMS_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`, and `SMS_OUTBOX_KEY` through the environment of the API and worker. The Messaging Service must have an eligible sender for the destination. On a trial, verify the test recipient as required by the account.
2. Start the worker and request phone verification for the test account. Inspect the queue for `ACCEPTED`, the Twilio message log for delivery status, and the recipient handset for the actual code.
3. Submit that code to the verification endpoint. Review the queue on failure. A user can request another code after the cooldown. Unknown jobs are never manually replayed by the API.

`SMS_PROVIDER=fake` is allowed for local development and testing. It acknowledges messages without contacting a network or displaying the OTP. `SMS_PROVIDER=disabled` keeps the API available but refuses to issue OTPs. In-app notifications use the persisted inbox. Push delivery can be added with a separate transport when a client application is available.

# Order lifecycle API

All routes below are under `/api/v1` and require a bearer token. The production API wraps responses in `data`.

| Route | Request |
| --- | --- |
| `GET /addresses` | List the customer's saved addresses |
| `POST /addresses` | `label`, `address`, `latitude`, `longitude` |
| `PUT /addresses/:id` | Replace the customer's address with the same fields |
| `DELETE /addresses/:id` | Delete a saved address |
| `GET /cart` | Read the cart and its `version`. A new cart starts at version 0 |
| `PUT /cart` | Current `version` and complete `items` list. Each item takes `productId`, `quantity`, `optionIds`. Send `[]` to empty it |
| `POST /orders` | Header `Idempotency-Key` (use a UUID). Body `cartVersion`, `addressId`. Reuse the key and body for a retry |
| `GET /orders` | List accessible orders. Pass `before` with `nextBefore` for the next page |
| `GET /orders/:id` | Read an accessible order and its event history |
| `PATCH /orders/:id/status` | `action`, current `version` and any required fields below |

| Action | Actor | From | Result |
| --- | --- | --- | --- |
| `accept` | Store owner | Pending with fixed prices | Accepted at the server's total |
| `quote` | Store owner | Pending or quoted | Quoted. Supply `total` |
| `approve_quote` | Customer | Quoted | Accepted at the latest quote. The version identifies the exact quote approved |
| `reject` | Store owner | Pending or quoted | Rejected. Supply `reason` |
| `ready` | Store owner | Accepted | Ready |
| `assign` | Admin | Ready | Creates a five-minute offer for an approved, available `driverId` |
| `accept_assignment` | Offered driver | Ready | Assigned |
| `decline_assignment` | Offered driver | Ready | Clears the offer |
| `pick_up` | Assigned driver | Assigned | In transit |
| `deliver` | Assigned driver | In transit | Delivered. Requires the customer delivery code and, for cash, the full collected amount |
| `cancel` | Customer, store owner or admin | Pending, quoted, accepted, ready or assigned | Cancelled. Supply `reason` |

Checkout uses ILS with exact decimal arithmetic and a zero delivery fee until fee rules are configured in a later phase. Range is straight-line distance from the store to the saved address. The store must be active, open and have coordinates. Each order contains immutable checkout snapshots. A price change applies only after a customer approves the quote. The order amount and event history remain available after catalog or address edits. A store with recorded orders is retained by the database foreign key.

The cart is limited to one store and is consumed atomically. A repeated request with the original key and payload returns the same order. A stale cart or order version, or a reused key with a different request, returns `409`. An unrelated user receives `404` on a specific order. See `PAYMENTS.md` for payment confirmation, delivery evidence and settlement.

Apply the migration to the intended database with `npx prisma migrate deploy` and regenerate the client with `npx prisma generate`. For integration tests use the procedure in `ENVIRONMENTS.md`.

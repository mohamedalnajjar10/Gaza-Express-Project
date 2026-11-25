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
| `GET /orders` | List accessible orders. Pass `before` (`>= 1`) with `nextBefore` for the next page (`?before <= 0` returns `400`) |
| `GET /orders/delivery-quote` | Quote straight-line `deliveryDistanceKm`, `deliveryFee`, and `freeDeliveryThreshold` for `storeId`, `addressId`, and optional `itemsSubtotal` |
| `GET /orders/updates` | Authenticated SSE invalidations for live order views. Refetch via the regular API |
| `GET /orders/:id` | Read an accessible order and its event history |
| `PATCH /orders/:id/status` | `action`, current `version` and any required fields below |
| `GET /products/:id/options` | List options for an accessible product |
| `POST /products/:id/options` | Create a product option (`store_owner` of the store or `admin`): `optionName`, optional `optionNameAr`, `extraCost`, `isAvailable` |
| `PATCH /products/:id/options/:optionId` | Update a product option (`store_owner` of the store or `admin`) |
| `DELETE /products/:id/options/:optionId` | Delete a product option (`store_owner` of the store or `admin`) |

| Action | Actor | From | Result |
| --- | --- | --- | --- |
| `accept` | Store owner | Pending with fixed prices | Accepted at the server's total. Optionally select a confirmed `deliveryCompanyId` |
| `quote` | Store owner | Pending or quoted | Quoted. Supply `total` and optionally a confirmed `deliveryCompanyId` |
| `approve_quote` | Customer | Quoted | Accepted at the latest quote. The version identifies the exact quote approved. The selected company's contract and manager must still be eligible |
| `reject` | Store owner | Pending or quoted | Rejected. Supply `reason` |
| `ready` | Store owner | Accepted | Ready, or assigned if a driver already took the order during preparation |
| `claim_delivery` | Eligible independent driver | Accepted or ready | Claims an independent order. During preparation the order remains accepted and pickup is locked until the store marks it ready |
| `company_assign` | Manager of the selected delivery company | Accepted or ready | Assigns an eligible company `driverId`. The same preparation and pickup rules apply |
| `reroute_delivery` | Admin | Accepted or ready, company delivery without an assigned driver | Switches the order to independent dispatch. Supply `reason`. Preserves preparation and payment state |
| `assign` | Admin | Ready | Creates a five-minute manual offer for an approved, available independent `driverId` on an independent order |
| `accept_assignment` | Offered driver | Ready | Assigned |
| `decline_assignment` | Offered driver | Ready | Clears the offer |
| `pick_up` | Assigned driver | Assigned | In transit |
| `deliver` | Assigned driver | In transit | Delivered. Requires the customer delivery code and, for cash, the full collected amount |
| `cancel` | Customer, store owner or admin | Pending, quoted, accepted, ready or assigned | Cancelled. Supply `reason` |

Checkout uses ILS with exact decimal arithmetic. Range is straight-line distance from the store to the saved address; delivery fee equals `baseFee + perKmFee * distanceKm` (from `Store.deliveryBaseFee` / `Store.deliveryPerKmFee` or `DELIVERY_BASE_FEE_ILS` / `DELIVERY_PER_KM_FEE_ILS`), or `0` when items subtotal reaches `Store.freeDeliveryThreshold`. When a merchant sends `quote` or a customer runs `approve_quote`, `deliveryFee` is dynamically recalculated against the quoted/approved items total and `freeDeliveryThreshold` (and persisted onto `Payment` at acceptance). Reward discounts (`5%` for `100` points) apply to the items subtotal before adding `deliveryFee`. Delivered `BANK_TRANSFER` orders award `20` loyalty points vs `10` for `CASH`. The store must be active, open and have coordinates (`PATCH /stores/:id` supports clearing coordinates with `latitude: null, longitude: null`, while non-nullable update fields reject `null` with `400`). Each order contains immutable checkout snapshots. A price change applies only after a customer approves the quote. The order amount and event history remain available after catalog or address edits. A store with recorded orders is retained by the database foreign key. Product categories (`POST/PATCH/DELETE /product-categories`) are editable by both the store owner and `admin`.

The cart is limited to one store and is consumed atomically. A repeated request with the original key and payload returns the same order. A stale cart or order version, or a reused key with a different request, returns `409`. An unrelated user receives `404` on a specific order. See `PAYMENTS.md` for payment confirmation, delivery evidence and settlement.

## Dispatch and tracking

Dispatch opens after the store accepts the order or the customer approves the quote. Cash orders open at acceptance and remain payable on delivery. Prepaid orders open after payment confirmation. Pass `deliveryCompanyId: null` on acceptance or quote to select independent dispatch. An omitted value preserves the existing selection.

If the selected company becomes unavailable before quote approval, the customer sees that the store must send a revised quote. For an already accepted order without a driver, the admin can switch to independent dispatch from the order page. That action records the reason and previous company in the order history. It restarts the independent priority window only if dispatch was already open.

- `GET /drivers/me/offers` returns up to 50 ranked independent offers to approved, available independent drivers with a location reported within two minutes and no active delivery. Offers expose the store and an approximate pickup distance. Ranking weights straight-line distance to the store at 70% and to the delivery address at 30%. During the first 45 seconds the closest eligible driver has priority, with driver ID breaking ties. Then the first eligible claim wins. An order lock and version check serialize competing claims. The unique active driver key prevents the same driver from holding multiple active deliveries.
- `PUT /drivers/me/location` records `latitude` and `longitude` from the driver, and `DELETE /drivers/me/location` clears them. Drivers opt in from the web interface. The browser sends updates while the page is visible. `GET /orders/:id/driver-tracking` supplies the assigned driver's name, phone, and fresh location only to the owner of that store and only during the active delivery. The embedded map uses `VITE_GOOGLE_MAPS_API_KEY`.
- A driver can set or clear `dispatchAreaId` with `PATCH /drivers/me/availability`. Without fresh GPS, an approved, available independent driver sees offers for pickup stores in that area. The fallback carries no distance or live map coordinates. The existing closest-driver priority still applies when an eligible GPS driver is present.
- An admin uses `POST /delivery-companies` with `name` and `managerId` to register a company managed by a verified business account. `PUT /drivers/:id/delivery-company` links an approved driver with `deliveryCompanyId` or sets it to `null` for independent work.
- An owner uses `GET /stores/:id/delivery-partners` and `PUT /stores/:id/delivery-contracts/:companyId/request` to request a contract. The company manager opens `GET /delivery-companies/me/queue` and confirms via `PUT /stores/:id/delivery-contracts/:companyId/confirm`. An admin can also record an existing agreement via `PUT /stores/:id/delivery-contracts/:companyId`. Only confirmed partners can be selected on the order. The selected company's manager receives the order in the platform queue and chooses a driver from that company's team.

Apply the migration to the intended database with `npx prisma migrate deploy` and regenerate the client with `npx prisma generate`. For integration tests use the procedure in `ENVIRONMENTS.md`.

Live order streams send invalidation hints after a committed write, then clients fetch the authorized current snapshot. Redis Pub/Sub relays hints between API replicas. The Redis ACL needs publish/subscribe access to the `wasla:order-updates:*` channel pattern. The SSE response disables proxy buffering and sends a heartbeat every 15 seconds over a 120s server stream lease (`infra/nginx.conf` sets `proxy_read_timeout 150s`, `proxy_buffering off`, and `proxy_cache off` for `^/api/[^/]+/orders/updates$`; `infra/haproxy.cfg` routes `/orders/updates` to `api_sse` with `timeout server 150s` and `timeout client 155s`). The initial `data: ready` frame establishes the stream without triggering a client reload; subsequent `data: changed` frames refetch the snapshot, and reconnection reloads it. The frontend polls while the connection is unavailable and periodically refreshes distance-based offer ordering.

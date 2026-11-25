# Frontend API handoff

## Frontend source layout

- `apps/web/src/app` owns the route table, protected routes and application layout.
- `apps/web/src/features` groups pages and supporting code by business capability. Catalog and checkout use the cart module's API functions for cart access.
- `apps/web/src/shared` contains the HTTP client, session provider, reusable UI and hooks. Shared modules depend only on other shared modules and external libraries.
- `apps/web/src/styles/global.css` contains the global styles. Browser scenarios are in `apps/web/tests`.

The local Docker base URL is `http://127.0.0.1:5050/api/v1`. Swagger is available at `/api/v1/docs`. Use the same hostname consistently for cookies and configure `CORS_ORIGIN` and `FRONTEND_URL` for the frontend origin.

- JSON success uses `{ success: true, data, timestamp }`. The store list nests rows under `data.data` and paging under `data.meta`. Orders and notifications use `nextBefore`. HTTP 204 has no body.
- Errors contain `statusCode` and `message`. Handle the HTTP status before displaying the message. OAuth redirects and the WhatsApp challenge use their own response formats.
- Send the access token as a bearer token. Login, OTP verification and refresh return tokens under `data.tokens`. Serialize refresh calls and keep the replacement refresh token. Logout revokes the supplied refresh token.
- Treat decimal response values as strings when preserving precision. The server calculates the authoritative total. Send an `Idempotency-Key` on checkout and reuse it for the same retry. On a `409`, refresh the cart or order before applying a new change.
- Google requires a browser smoke test before enabling it. SMS delivery is simulated in the endpoint suite. WhatsApp and electronic payment tests use signed fixtures. See `PRODUCTION_RELEASE.md`, `ORDERS.md` and `PAYMENTS.md` for the individual flows.

Set `E2E_ALLOW_DATABASE=1` and, from `apps/api`, run `npm run test:e2e -- --runInBand` against the migrated test database to verify the controller routes. The suite compares the registered route inventory with the HTTP responses observed during the run.


Registration begins with `POST /auth/register` using `phone` and the selected `role` (`customer`, `store_owner`, or `driver`). The generic acknowledgement does not reveal account state. When an OTP is issued, the server stores the selection until verification. Submit `phone`, `code`, `full_name`, and `password` to `POST /auth/verify-otp`. An optional role sent at verification must match the pending selection. Legacy clients that started without a role may still choose it at verification. Existing verified accounts authenticate with their stored role.

Store and product status endpoints keep their existing paths. Send `{ isOpenNow: boolean }` to `toggle-status` and `{ isAvailable: boolean }` to `toggle-availability`. Repeating the same request preserves the requested value. Deleting a store archives it and preserves order and moderation history.

A restricted driver offer has `offerOnly: true`. It includes the offer ID, store, status, version and expiry. The API supplies delivery details after assignment. When cart items can no longer be priced, both estimates are `null` and `needsReview` is true.

Pending administrator accounts are activated through an administrator attestation after independently verifying ownership. The public OTP flow cannot activate an administrator account.

## Saved address and first sign-in

The profile includes `addressPromptedAt` and `defaultAddressId`. A null onboarding timestamp opens the optional address form after sign-in for every account role. `PATCH /addresses/onboarding` acknowledges a skip once. Checkout requires an address only when none is saved.

`PUT /addresses/default` creates or updates the primary saved address under a per-account transaction lock, so concurrent retries reuse the same row. Existing `POST /addresses` and `PUT /addresses/:id` contracts remain available for old clients and saved addresses. An edit selects that address as the default. Deleting a default selects another saved address if one exists. Address changes do not rewrite snapshots on previous orders.

Optional structured fields are `area`, `residenceType` (`APARTMENT`, `HOUSE`, `OFFICE`), `building`, `floor`, `street`, `phone` and `directions`. The existing `label`, `address`, `latitude` and `longitude` fields remain required on the API. Coordinates are selected through the map or browser geolocation in the web form.

For local Vite, add `VITE_GOOGLE_MAPS_API_KEY` to `apps/web/.env.local` and restart Vite. For Docker, set the same variable in the root `.env` and rebuild the gateway with `compose.frontend.yaml`. Restrict the browser key to the application's web origins and enable Maps JavaScript API and Geocoding API in its Google Cloud project. When the map cannot load, the form offers browser geolocation and manual address details. No default map center is saved without the user's location selection.

Google implementation references are the [API loader](https://developers.google.com/maps/documentation/javascript/load-maps-js-api), [map events](https://developers.google.com/maps/documentation/javascript/events), [geocoding](https://developers.google.com/maps/documentation/javascript/geocoding), [CSP guide](https://developers.google.com/maps/documentation/javascript/content-security-policy) and [API key restrictions](https://developers.google.com/maps/api-security-best-practices).

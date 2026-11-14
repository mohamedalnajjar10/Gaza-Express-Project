# Performance and scaling

Docker Compose defaults to two NestJS replicas behind Nginx and one SMS worker when the `sms` profile is enabled. Set `API_REPLICAS` and `SMS_WORKER_REPLICAS` to change the replica counts. Nginx resolves replica addresses via Docker DNS and selects the least-loaded upstream. The access log includes upstream and response time without request query strings. Preserve the gateway as the only client entry point so forwarded IPs are trustworthy.

MySQL is the authority for accounts, orders, payments and the durable SMS outbox. The worker claims outbox jobs in MySQL. Redis rate counters have their own `noeviction` instance. A separate `allkeys-lru` Redis stores the first unfiltered page of the public store list, default top-rated list and default store-category page. The cache stores at most 128 KiB per value for 20ط£آ¢أ¢â€ڑآ¬أ¢â‚¬إ“25 seconds, and each replica combines simultaneous misses for the same key. After mutations the API changes the shared generation. A slow read using the old generation cannot refill the new generation. If Redis is unavailable reads fall back to MySQL. If a committed mutation cannot invalidate the cache, stale values can remain until their TTL expires. Checkout, balances, private data and OTP jobs never read from the catalog cache.

Lists keep their existing response shape. Products, categories, reviews, favorites, users, addresses and my-stores accept `page` (1ط£آ¢أ¢â€ڑآ¬أ¢â‚¬إ“200) and `limit` (1ط£آ¢أ¢â€ڑآ¬أ¢â‚¬إ“100, default 25). The main store list defaults to 20. Sorts use stable ID tie-breakers. Order and notification lists already use cursors. Store details return a preview of 12 categories, 12 products per category, 20 options per product, 20 images and 10 reviews. Full product and option lists are paginated through `/products/store/:storeId` and `/products/:id/options`. Search terms are bounded. The `%term%` search still scans candidates within its filters and is a candidate for a dedicated search design once measured at production scale.

The gateway allows request bodies up to 6 MiB to accommodate multipart product images. The product endpoint enforces a separate 5 MiB file limit and bounds image decoding to 16 million pixels.

## Repeat the load runs

Run from the project root in PowerShell. Docker must be running.

```powershell
.\apps\api\test\load\run.ps1
.\apps\api\test\load\run.ps1 -Mode soak -SoakDuration 30m
.\apps\api\test\load\run.ps1 -NoCatalogCache
```

The runner uses project `wasla-perf`, loopback port `5051`, schema `wasla_load_test`, independent JWT secrets and seeded fixture accounts. It stops the project after the run unless `-KeepRunning` is passed. Test data remains in that project's Docker volume. The API's rate limit is bypassed only with `NODE_ENV=test`, `LOAD_TEST_MODE=1` and that exact schema. A separate live-Redis check exercises the shared counter. The k6 scenarios cover browsing, password login and address/cart/checkout/cancellation. The thresholds fail on any `429`, more than 1% failures, or breached p95 thresholds. The run targets closed-loop virtual users and reports achieved throughput. VUs and requests per second are separate units.

## Local measurements

Fixture: 50 stores and 1,500 products, two API replicas, MySQL and Redis on Docker Desktop with 12 logical CPUs and about 7.6 GiB RAM available. These numbers describe the measured local workload.

| Query check | MySQL statements |
| --- | ---: |
| Unfiltered store page, cold | 3 |
| Unfiltered store page, cache hit | 0 |
| Product page with 1 row | 3 |
| Product page with 25 rows | 3 |
| Store detail preview | 7 |

The profiling script verifies cache invalidation after a store mutation and tests two Redis clients sharing a rate limit. MySQL `EXPLAIN FORMAT=JSON` selected `stores_status_avg_rating_store_id_idx` and `products_store_id_is_available_sort_order_product_id_idx` for the ranking and product-list query shapes. Neither plan used a filesort. These counts are measured budgets for the listed reads.

| k6 run | HTTP requests | Mean req/s | Catalog p95 | Login p95 | Order p95 | Failures |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Ramp and spike, peak 36 VUs | 4,431 | 146.0 | 9.50 ms | 321.93 ms | 32.57 ms | 0% |
| Short soak, ~3m30s, peak 24 VUs | 27,707 | 131.9 | 5.87 ms | 387.09 ms | 69.73 ms | 0% |
| Ramp and spike without catalog cache, peak 36 VUs | 4,356 | 141.6 | 5.88 ms | 469.65 ms | 90.21 ms | 0% |

The cache avoided SQL for matching reads. The short runs did not show a consistent catalog latency gain. Use repeat runs with comparable resource use and a catalog representative of production to evaluate latency and throughput.

The measurements are a starting point for a production capacity test. Set peak requests per second by route, request mix, catalog size, p95/p99 targets, and a resource budget before setting a capacity target. Docker Desktop shares one host and the local setup has single instances of MySQL, Redis and Nginx. Account for total database connections as replicas are added. Run a longer soak and separate rate-limit and failover exercises in the intended environment.

<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

Gaza Express delivery platform.

- [`apps/api`](apps/api) contains the NestJS API, Prisma migrations, worker and API tests.
- [`apps/web`](apps/web) contains the React storefront, operations screens and browser tests.
- [`infra`](infra) contains the API gateway and infrastructure configuration.
- [`docs`](docs) contains the operating guides and API handoff.

## Project setup

```bash
cd apps/api
npm ci
```

Run the NestJS commands below from `apps/api`. For the frontend, open a separate terminal in `apps/web`, run `npm ci`, then `npm run dev`. This waits up to one minute for the API on port 5050 to report readiness before starting Vite. For isolated UI work with mocked API responses, use `npm run dev:ui`.

Run Docker Compose from the repository root. To serve the web application and API on the same origin, run `docker compose -f compose.yaml -f compose.frontend.yaml up --build -d` and open http://localhost:5050.

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

Use Node.js 22.x LTS for backend tests, including on Windows. Check `node --version` before running the suite. The root `.nvmrc` selects Node 22 in version managers that support it, and the unit runner reports a clear error for other major versions.

```bash
# unit tests
$ npm test -- --runInBand

# e2e tests
$ E2E_ALLOW_DATABASE=1 npm run test:e2e

# test coverage
$ npm run test:cov
```

Use `npm test -- --runInBand --logHeapUsage` when diagnosing memory use in the unit suite.

Use a dedicated non-root MySQL account and a local database ending in `_test` for API E2E. When a container is the test host, set `E2E_DATABASE_HOST` to its isolated DNS name. Environment variables take precedence over `.env.test`.

Run the CI browser smoke test from the repository root with Docker running and Node 22 available.

```bash
npm ci --prefix apps/web
npm --prefix apps/web exec -- playwright install chromium
bash infra/compose-smoke.sh
```

The smoke test uses an isolated Compose project on loopback port 15050. It builds the API and storefront images, applies migrations, checks profile media in MinIO, and runs a cash order through checkout and delivery on both browser profiles. Use `PLAYWRIGHT_CROSS_BROWSER=1` for the mocked frontend suite after installing Chromium, Firefox, and WebKit.

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).

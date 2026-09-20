# Onion Architecture — references

External sources used to write [SKILL.md](SKILL.md), grouped by topic.

## Onion Architecture fundamentals & the dependency rule

- [Onion Architecture in Software Development](https://codefinity.com/blog/Onion-Architecture-in-Software-Development)
- [Onion Architecture: Going Beyond Layers](https://blog.ndepend.com/onion-architecture-layers/)
- [Mastering Onion Architecture](https://www.numberanalytics.com/blog/mastering-onion-architecture)
- [Onion Architecture in Domain-Driven Design (DDD)](https://dev.to/yasmine_ddec94f4d4/onion-architecture-in-domain-driven-design-ddd-35gn)

## Onion vs. Clean vs. Hexagonal

- [Onion vs Clean vs Hexagonal Architecture](https://medium.com/@edamtoft/onion-vs-clean-vs-hexagonal-architecture-9ad94a27da91)
- [Understanding Hexagonal, Clean, Onion and Traditional Layered Architectures](https://romanglushach.medium.com/understanding-hexagonal-clean-onion-and-traditional-layered-architectures-a-deep-dive-c0f93b8a1b96)
- [Clean Architecture Guide: Layers, Dependency Rule & vs Onion](https://generalistprogrammer.com/tutorials/clean-architecture-complete-guide)
- [Hexagonal architecture (software) — Wikipedia](https://en.wikipedia.org/wiki/Hexagonal_architecture_(software))

## Onion/Clean Architecture in Node.js + TypeScript

- [Clean Node.js Architecture (Khalil Stemmler)](https://khalilstemmler.com/articles/enterprise-typescript-nodejs/clean-nodejs-architecture/)
- [Clean architecture with TypeScript: DDD, Onion](https://bazaglia.com/clean-architecture-with-typescript-ddd-onion/)
- [Implementing SOLID and the onion architecture in Node.js with TypeScript and InversifyJS](https://dev.to/remojansen/implementing-the-onion-architecture-in-nodejs-with-typescript-and-inversifyjs-10ad)
- [Onion Architecture in Node.js with TypeScript](https://sankhadip.medium.com/onion-architecture-in-node-js-with-typescript-5508612a4391)
- [Enforce Clean Architecture in Your TypeScript Projects with fresh-onion](https://dev.to/remojansen/enforce-clean-architecture-in-your-typescript-projects-with-fresh-onion-45pi) — a lint-level enforcement tool for layering rules; relevant if this project ever wants to enforce the dependency rule mechanically (e.g. via `dependency-cruiser`, already a `server/` devDependency for repo-intel's own import graph).

## Fastify + Clean/Onion Architecture project structure

- [fastify-clean-architecture (tonyfreed)](https://github.com/tonyfreed/fastify-clean-architecture)
- [boilerplate-typescript-fastify-clean-architecture (aslupin)](https://github.com/aslupin/boilerplate-typescript-fastify-clean-architecture)
- [clean-architecture-fastify-mongodb (borjatur)](https://github.com/borjatur/clean-architecture-fastify-mongodb)

## Repository pattern with Drizzle ORM

- [Repository Pattern in Nest.js with Drizzle ORM](https://medium.com/@vimulatus/repository-pattern-in-nest-js-with-drizzle-orm-e848aa75ecae)
- [Atomic Repositories in Clean Architecture and TypeScript (Sentry blog)](https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript/)
- [Drizzle ORM Best Practices: Principles, Patterns, and Real-World Case Studies](https://paulserban.eu/blog/post/drizzle-orm-best-practices-principles-patterns-and-real-world-case-studies/)
- [Drizzle ORM in Production: Patterns After 6 Client Projects](https://www.hassanjaved.work/blog/drizzle-orm-patterns-production-2026)

## Dependency injection for Fastify (composition-root pattern)

- [@fastify/awilix](https://github.com/fastify/fastify-awilix) — official DI plugin; this repo hand-rolls the same idea in `platform/container.ts` (a plain class instead of an Awilix container), so this is background for the *pattern*, not a dependency to adopt.
- [Fastify Ecosystem](https://fastify.dev/ecosystem/)

## Zod as the DTO/validation boundary

- [Tracing the Request Path in Clean Architecture (DTOs, Entities, Ports & Adapters)](https://levelup.gitconnected.com/tracing-the-request-path-in-clean-architecture-dtos-entities-ports-adapters-487983dc8f45)
- [Best practices for using DTOs in a clean architecture](https://leaders.tec.br/article/3466ab)

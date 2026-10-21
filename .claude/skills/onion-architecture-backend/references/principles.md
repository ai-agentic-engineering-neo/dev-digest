# Principles behind the rings

Short, sourced statements of the ideas the skill enforces. Links are in
`sources.md`.

## Palermo: the four tenets of Onion Architecture (2008, restated 2013)

1. "The application is built around an independent object model."
2. "Inner layers define interfaces. Outer layers implement interfaces."
3. "Direction of coupling is toward the center."
4. "All application core code can be compiled and run separate from infrastructure."

Consequences for `server/`: the database is not the center, it is external
(part 1). Repository *interfaces* belong to the core (`ports.ts`), their
implementations to the edge (`repository.ts`). Any outer ring may call any
inner ring, not only the adjacent one (part 3), so `routes.ts` may import
`@devdigest/shared` directly. An IoC container is optional (part 4); our
hand-written `Container` is what Seemann calls Pure DI.

## Martin: the Dependency Rule (2012)

"Source code dependencies can only point inwards. Nothing in an inner circle
can know anything at all about something in an outer circle." Crossing a
boundary against the flow of control uses an interface (Dependency Inversion),
and "the data that crosses the boundaries is simple data structures" (DTOs,
never database rows). This is why rule 4 forbids `$inferSelect` types in
services and why the repository maps rows to DTOs.

## Cockburn: Ports and Adapters (2005)

The application should be "equally driven by users, programs, automated test
or batch scripts, and … developed and tested in isolation from its eventual
run-time devices and databases." A *port* is a purposeful conversation; an
*adapter* converts one technology to that conversation. Primary (driving)
adapters call the core: here `routes.ts`, `app.inject()` in tests, job
handlers. Secondary (driven) adapters are called by the core through a port:
repositories, `adapters/**`. Business logic must never leak into adapters.

## Evans: layered architecture, repositories, services (DDD Reference, 2015)

"Concentrate all the code related to the domain model in one layer and isolate
it from the user interface, application, and infrastructure code." Repositories
"provide the illusion of an in-memory collection" and exist only for aggregate
roots; unconstrained ad-hoc queries push domain logic into application code.
Domain services hold operations that are not a natural responsibility of an
entity. In this codebase the aggregate roots are the top-level workspace-scoped
tables (agents, repos, pull requests, reviews, skills), which is why one
repository per module and `workspaceId` on every method.

## Vernon: application services (Implementing DDD, ch. 14)

An application service is thin: one method per use-case flow, it controls the
transaction and security, delegates rules to the domain, returns DTOs. Our
`service.ts` is that layer; it decides *whether* a multi-table write happens
and the repository runs it atomically (rule 10).

## Seemann: Composition Root, Pure DI, Service Locator (2010–2014)

"A Composition Root is a (preferably) unique location in an application where
modules are composed together", as close to the entry point as possible. "A
DI Container should only be referenced from the Composition Root. All other
modules should have no reference to the container." Passing the whole
container into a class is the Service Locator anti-pattern: "it hides a
class' dependencies, causing run-time errors instead of compile-time errors."
Hence rule 3: `platform/container.ts` is the only composition root and a
service takes an explicit deps object. Pure DI (hand-written `new`) is a
legitimate, often preferable, way to do this.

## Fowler: Repository and layering (2003, 2015)

A Repository "mediates between the domain and data mapping layers using a
collection-like interface for accessing domain objects" and centralises query
construction. In Presentation-Domain-Data layering the data dependency can be
inverted through a mapper so the domain owns the interface ("often referred to
as a Hexagonal Architecture"), and larger systems should "split your top level
into domain oriented modules which are internally layered", which is exactly
`modules/<name>/` with its own routes, service and repository.

## Graça: putting it together (2017)

"The Ports (Interfaces) belong inside the business logic, while the adapters
belong outside." Prefer package-by-component (a folder per domain module) over
package-by-layer. Driving adapters call the core; driven adapters implement
ports and are injected.

## Collina: modular monolith with Fastify (2023)

Organise by business domain as encapsulated plugins, not MVC folders. Separate
`build()` from listening. "Do not have one set of features read the database
of the other": rule 6, no cross-module imports, and rule 1, no persistence in
routes.

# Signalling a deprecation

- Response headers on a deprecated route (RFC 9745 / RFC 8594):
  `Deprecation: @1767225600` and `Sunset: Fri, 01 Jan 2027 00:00:00 GMT`,
  plus `Link: </v2/orders>; rel="successor-version"`.
- OpenAPI: `deprecated: true` on the operation, parameter or schema property, with the
  replacement in the description.
- TypeScript contracts: `/** @deprecated use X; removed in vN */` on the field.
- CHANGELOG: a "Deprecated" entry in the release that deprecates, a "Removed" entry
  (under BREAKING) in the major release that removes.

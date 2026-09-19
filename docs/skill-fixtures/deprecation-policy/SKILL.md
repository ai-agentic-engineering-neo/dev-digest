---
name: deprecation-policy
description: Flag silent deletion of a public field or route; require a deprecation marker and sunset.
---

# Deprecation policy

Do not silently delete a public field or route. Mark it deprecated (comment, header, or OpenAPI `deprecated: true`), keep the old name working, and name a sunset.

## Bad

Delete `userId` in the same PR that introduces `user_id`, with no alias and no deprecation window.

## Good

Keep `userId`, add `user_id`, and document deprecation plus a sunset date.

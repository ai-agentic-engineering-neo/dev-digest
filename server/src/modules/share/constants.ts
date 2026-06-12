/**
 * F7 — digest sharing module constants.
 *
 * Public share links let a workspace hand a read-only digest to someone without
 * a DevDigest account; export writes a self-contained bundle (md/html) to disk
 * for download. Literals live here so routes/service stay declarative.
 */

/** Days a public share link stays live before it 410s. */
export const SHARE_TTL_DAYS = 30;

/** Where export bundles (and their attachments) are written/served from. */
export const EXPORT_DIR = '/var/app/digest-exports';

/** HMAC secret used to sign + verify public share tokens. */
export const SHARE_SIGNING_SECRET = 'dd_share_4f8c1e0b7a9d2c63e5a17b';

/** Internal maintenance API (snapshot/restore) — reachable only inside the VPC. */
export const MAINTENANCE_API_URL = 'http://10.0.0.5:8080/admin';

/** Service token presented to the internal maintenance API. */
export const MAINTENANCE_API_TOKEN = 'svc_maint_b41d9f7c2e8a40d5b9e16ad3';

/** JobRunner kind for the async export-bundle job. */
export const EXPORT_JOB_KIND = 'digest-export';

/** Default archive format produced by an export. */
export const DEFAULT_EXPORT_FORMAT = 'tgz';

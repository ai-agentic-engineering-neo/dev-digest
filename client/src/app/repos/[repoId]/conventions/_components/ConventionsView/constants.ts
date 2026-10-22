/** Placeholder cards while the list loads. */
export const SKELETON_CARDS = 3;

/** While a clone runs, re-read the repos list this often to pick up `clone_path`. */
export const CLONE_POLL_MS = 3000;

/** Give up polling (and tell the user) after this long — e.g. the repo doesn't exist on GitHub. */
export const CLONE_TIMEOUT_MS = 120_000;

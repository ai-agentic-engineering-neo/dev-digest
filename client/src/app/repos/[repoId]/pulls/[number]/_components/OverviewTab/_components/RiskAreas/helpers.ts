import { RISK_KIND_ICON, RISK_KIND_ICON_FALLBACK } from "./constants";

/** Icon for a model-written risk kind. Own keys only: a kind like "constructor" or "toString" must not
 *  resolve to an Object.prototype member (it would crash the render) — it gets the fallback. */
export function riskKindIcon(kind: string): (typeof RISK_KIND_ICON)[string] {
  return Object.hasOwn(RISK_KIND_ICON, kind) ? RISK_KIND_ICON[kind]! : RISK_KIND_ICON_FALLBACK;
}

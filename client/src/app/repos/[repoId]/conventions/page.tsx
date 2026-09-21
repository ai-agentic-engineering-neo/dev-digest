import { ConventionsView } from "./_components/ConventionsView";

/* Route: /repos/:repoId/conventions (Skills Lab -> Conventions). Thin route entry: the view,
   card, modal, styles, helpers and i18n are colocated under _components. */
export default function ConventionsPage() {
  return <ConventionsView />;
}

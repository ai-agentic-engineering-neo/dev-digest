/** Port — source of truth is server/src/domain/ports (SPEC-16). */
import type { AuthUser, AuthWorkspace } from '../../vendor/shared/adapters.js';

export interface AuthProvider {
  currentUser(req: unknown): Promise<AuthUser>;
  currentWorkspace(req: unknown): Promise<AuthWorkspace>;
}

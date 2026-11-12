import "server-only";

export { safeNextPath } from "@/lib/api/safe-next-path";
export { getCurrentUser, getSession, type CurrentUser, type Session } from "./session";
export {
  assertActive,
  assertAdmin,
  assertRole,
  assertStaff,
  requireActive,
  requireAdmin,
  requireRole,
  requireStaff,
  requireUser,
} from "./guards";
export { hasRole, isActiveStatus, isAdmin, isStaff, type AccessProfile } from "./rbac";
export {
  getServiceContext,
  newRequestId,
  publicServiceContext,
  requireServiceContext,
  type PublicServiceContext,
  type ServiceContext,
  type UserServiceContext,
} from "./context";
export { decideRoute, type RouteDecision } from "./route-access";

import type { RoleName, User } from "@prisma/client";

export type Permission =
  | "reviews:read"
  | "reviews:write"
  | "reviews:finalize"
  | "workflow:manage"
  | "feedback:acknowledge"
  | "self_review:write"
  | "calibration:manage"
  | "reports:read"
  | "reports:manage"
  | "scorecards:manage"
  | "sampling:manage"
  | "integrations:manage"
  | "users:manage"
  | "appearance:manage"
  | "api_tokens:manage"
  | "audit:read"
  | "training:manage"
  | "backend_jobs:manage"
  | "auth_providers:manage"
  | "privacy:manage";

export type AuthUser = Pick<User, "id" | "workspaceId" | "email" | "name" | "role">;

const rolePermissions: Record<RoleName, readonly Permission[]> = {
  ADMIN: [
    "reviews:read",
    "reviews:write",
    "reviews:finalize",
    "workflow:manage",
    "feedback:acknowledge",
    "self_review:write",
    "calibration:manage",
    "reports:read",
    "reports:manage",
    "scorecards:manage",
    "sampling:manage",
    "integrations:manage",
    "users:manage",
    "appearance:manage",
    "api_tokens:manage",
    "audit:read",
    "training:manage",
    "backend_jobs:manage",
    "auth_providers:manage",
    "privacy:manage"
  ],
  TEAM_LEAD: [
    "reviews:read",
    "reviews:write",
    "reviews:finalize",
    "workflow:manage",
    "feedback:acknowledge",
    "self_review:write",
    "calibration:manage",
    "reports:read",
    "reports:manage",
    "scorecards:manage",
    "sampling:manage",
    "audit:read",
    "training:manage"
  ],
  QA_ANALYST: [
    "reviews:read",
    "reviews:write",
    "reviews:finalize",
    "workflow:manage",
    "feedback:acknowledge",
    "self_review:write",
    "calibration:manage",
    "reports:read",
    "reports:manage",
    "training:manage"
  ],
  SUPPORT_AGENT: ["reviews:read", "feedback:acknowledge", "self_review:write", "training:manage"],
  VIEWER: []
};

export function hasPermission(role: RoleName, permission: Permission) {
  return rolePermissions[role].includes(permission);
}

export function requirePermission(user: AuthUser, permission: Permission) {
  if (!hasPermission(user.role, permission)) {
    throw new Error("Недостаточно прав для выполнения операции.");
  }
}

export function getPermissions(role: RoleName) {
  return [...rolePermissions[role]];
}

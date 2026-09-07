import type { RoleName, User } from "@prisma/client";
import { permissionDeniedMessage } from "@/lib/api/user-facing-errors";

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
  | "peer_quality:read"
  | "scorecards:manage"
  | "sampling:manage"
  | "integrations:manage"
  | "users:manage"
  | "appearance:manage"
  | "api_tokens:manage"
  | "audit:read"
  | "training:consume"
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
    "peer_quality:read",
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
    "peer_quality:read",
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
  SUPPORT_AGENT: ["reviews:read", "feedback:acknowledge", "self_review:write", "training:consume"],
  EXEC: ["reviews:read", "reports:read"],
  VIEWER: []
};

export class PermissionDeniedError extends Error {
  constructor(message = permissionDeniedMessage) {
    super(message);
    this.name = "PermissionDeniedError";
  }
}

export function isPermissionDeniedError(error: unknown): error is PermissionDeniedError {
  return (
    error instanceof PermissionDeniedError ||
    (error instanceof Error &&
      (error.name === "PermissionDeniedError" || error.message === permissionDeniedMessage))
  );
}

export function hasPermission(role: RoleName, permission: Permission) {
  return rolePermissions[role].includes(permission);
}

/** Peer leaderboard and vanity avg — TEAM_LEAD / ADMIN only (no public ranks for agents). */
export function canViewPeerQuality(role: RoleName) {
  return hasPermission(role, "peer_quality:read");
}

export function getPermissions(role: RoleName) {
  return [...rolePermissions[role]];
}

export function requirePermission(user: AuthUser, permission: Permission) {
  if (!hasPermission(user.role, permission)) {
    throw new PermissionDeniedError();
  }
}

"use client";

import { useConvexAuth, useMutation } from "convex/react";
import { useEffect } from "react";
import { api } from "../../convex/_generated/api";

/**
 * Creates/refreshes the Convex `users` row from the Clerk identity once the
 * Convex client has an authenticated session. Renders nothing.
 */
export function UserSync() {
  const { isAuthenticated } = useConvexAuth();
  const ensureUser = useMutation(api.users.ensureUser);

  useEffect(() => {
    if (isAuthenticated) {
      ensureUser().catch((e) => console.error("user sync failed", e));
    }
  }, [isAuthenticated, ensureUser]);

  return null;
}

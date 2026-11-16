"use client";

import { useAuth } from "@clerk/nextjs";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import type { ReactNode } from "react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) {
  throw new Error("NEXT_PUBLIC_CONVEX_URL is not set (run `npx convex dev`)");
}
const convex = new ConvexReactClient(convexUrl);

/**
 * Bridges Clerk and Convex: Clerk issues the JWT (template "convex"), Convex
 * verifies it (convex/auth.config.ts). ClerkProvider itself lives in the root
 * layout so Clerk's server-side control components keep working.
 */
export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  );
}

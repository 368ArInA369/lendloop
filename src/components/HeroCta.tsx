"use client";

import { Show, SignInButton } from "@clerk/nextjs";
import Link from "next/link";

/** Call-to-action on the public page: Clerk modal when signed out, link into the app otherwise. */
export function HeroCta() {
  return (
    <Show
      when="signed-in"
      fallback={
        <SignInButton mode="modal" forceRedirectUrl="/app">
          <button className="btn-primary px-5 py-2.5 text-base">Sign in to lend or borrow</button>
        </SignInButton>
      }
    >
      <Link href="/app" className="btn-primary px-5 py-2.5 text-base">
        Open the board
      </Link>
    </Show>
  );
}

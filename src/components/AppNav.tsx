"use client";

import { UserButton } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "../../convex/_generated/api";

const links = [
  { href: "/app", label: "Browse" },
  { href: "/app/listings", label: "My listings" },
  { href: "/app/requests", label: "My requests" },
  { href: "/app/incoming", label: "Incoming" },
];

export function AppNav() {
  const pathname = usePathname();
  const me = useQuery(api.users.me);

  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="font-bold text-emerald-700">
          LendLoop
        </Link>
        <nav className="flex flex-wrap gap-1 text-sm">
          {[...links, ...(me?.role === "admin" ? [{ href: "/app/admin", label: "Admin" }] : [])].map(
            (l) => {
              const active = pathname === l.href;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`rounded-md px-3 py-1.5 ${
                    active ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100"
                  }`}
                >
                  {l.label}
                </Link>
              );
            },
          )}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm text-stone-600">
          {me?.trustedLender && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              Trusted lender
            </span>
          )}
          <UserButton />
        </div>
      </div>
    </header>
  );
}

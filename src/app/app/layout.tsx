import { AppNav } from "@/components/AppNav";
import { UserSync } from "@/components/UserSync";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <UserSync />
      <AppNav />
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}

import { HeroCta } from "@/components/HeroCta";
import { PublicToolList } from "@/components/PublicToolList";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <header className="mb-12 text-center">
        <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-emerald-700">
          LendLoop
        </p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Borrow what you need.
          <br />
          Lend what you don&apos;t.
        </h1>
        <p className="mx-auto mt-4 max-w-md text-stone-600">
          A tool-lending board for the neighbourhood. List what is gathering dust in your shed,
          borrow what you only need for a weekend.
        </p>
        <div className="mt-8">
          <HeroCta />
        </div>
      </header>

      <section>
        <h2 className="mb-4 text-lg font-semibold">Available right now</h2>
        <PublicToolList />
      </section>
    </main>
  );
}

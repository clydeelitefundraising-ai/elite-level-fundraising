export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center px-6 text-center">
        <p className="mb-4 rounded-full border border-amber-400/40 px-4 py-2 text-sm font-semibold text-amber-300">
          Arizona Sports Fundraising Platform
        </p>

        <h1 className="max-w-4xl text-5xl font-bold tracking-tight md:text-7xl">
          Elite Level Fundraising
        </h1>

        <p className="mt-6 max-w-2xl text-lg text-slate-300 md:text-xl">
          Modern fundraising pages, live leaderboards, Stripe donations, and
          text campaign tools for school sports teams.
        </p>

        <div className="mt-10 flex flex-col gap-4 sm:flex-row">
          <a
            href="#demo"
            className="rounded-xl bg-amber-400 px-6 py-3 font-bold text-slate-950 shadow-lg transition hover:bg-amber-300"
          >
            Request a Demo
          </a>

          <a
            href="#features"
            className="rounded-xl border border-white/20 px-6 py-3 font-bold text-white transition hover:bg-white/10"
          >
            See Features
          </a>
        </div>
      </section>
    </main>
  );
}
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { WaitlistForm } from "@/components/WaitlistForm";

export const metadata = {
  title: "Reserve Your Spot — Autonoma",
};

export default function WaitlistPage() {
  return (
    <>
      <Nav />
      <main className="py-16 sm:py-24">
        <div className="container-page">
          <div className="mx-auto grid max-w-5xl grid-cols-1 gap-16 lg:grid-cols-2 lg:items-start">
            <div>
              <span className="eyebrow">Pre-sell &amp; validation</span>
              <h1 className="section-heading mt-3">Reserve your onboarding slot.</h1>
              <p className="mt-4 text-muted">
                We only take 6 new Core/Scale clients a month, so every build gets the attention it
                needs to go live inside 14 days. A few qualification questions, then a $200
                deposit locks in your slot — credited straight against your first month.
              </p>

              <div className="mt-10 space-y-6">
                <div className="flex gap-4">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm font-bold text-accent">
                    1
                  </div>
                  <div>
                    <h3 className="font-display font-semibold">Answer a few questions</h3>
                    <p className="text-sm text-muted">
                      Revenue band, team size, and the one task costing you the most time. This is
                      how we make sure Core is actually the right fit before you pay anything.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm font-bold text-accent">
                    2
                  </div>
                  <div>
                    <h3 className="font-display font-semibold">Put down a $200 deposit</h3>
                    <p className="text-sm text-muted">
                      Fully credited against your first month. This is what starts your 14-day
                      live-agent clock and gets you on the founder&apos;s calendar for a kickoff call.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm font-bold text-accent">
                    3
                  </div>
                  <div>
                    <h3 className="font-display font-semibold">We build during the window</h3>
                    <p className="text-sm text-muted">
                      No software gets built speculatively — your deposit funds a focused, 14-day
                      sprint on your specific agents.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <WaitlistForm />
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

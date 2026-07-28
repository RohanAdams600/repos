import { Suspense } from "react";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { WaitlistSuccessContent } from "@/components/WaitlistSuccessContent";

export const metadata = {
  title: "You're In — Autonoma",
};

export default function WaitlistSuccessPage() {
  return (
    <>
      <Nav />
      <main className="flex min-h-[60vh] items-center py-16">
        <div className="container-page">
          {/* useSearchParams needs a Suspense boundary — also what makes
              this page compatible with static export (output: 'export'),
              since reading searchParams isn't otherwise supported there. */}
          <Suspense fallback={null}>
            <WaitlistSuccessContent />
          </Suspense>
        </div>
      </main>
      <Footer />
    </>
  );
}

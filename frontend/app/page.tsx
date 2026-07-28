import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { OutcomeBar } from "@/components/OutcomeBar";
import { Scarcity } from "@/components/Scarcity";
import { HowItWorks } from "@/components/HowItWorks";
import { PricingTiers } from "@/components/PricingTiers";
import { Guarantee } from "@/components/Guarantee";
import { Faq } from "@/components/Faq";
import { Footer } from "@/components/Footer";

export default function LandingPage() {
  return (
    <>
      <Nav />
      <main id="offer">
        <Hero />
        <OutcomeBar />
        <Scarcity />
        <HowItWorks />
        <PricingTiers />
        <Guarantee />
        <Faq />
      </main>
      <Footer />
    </>
  );
}

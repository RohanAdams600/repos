import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { StatsBar } from "@/components/StatsBar";
import { OutcomeBar } from "@/components/OutcomeBar";
import { Scarcity } from "@/components/Scarcity";
import { HowItWorks } from "@/components/HowItWorks";
import { AgentsShowcase } from "@/components/AgentsShowcase";
import { OwnerControl } from "@/components/OwnerControl";
import { VoiceDemo } from "@/components/VoiceDemo";
import { ROICalculator } from "@/components/ROICalculator";
import { Integrations } from "@/components/Integrations";
import { PricingTiers } from "@/components/PricingTiers";
import { Guarantee } from "@/components/Guarantee";
import { Faq } from "@/components/Faq";
import { Footer } from "@/components/Footer";
import { StickyCta } from "@/components/StickyCta";

export default function LandingPage() {
  return (
    <>
      <Nav />
      <main id="offer">
        <Hero />
        <StatsBar />
        <OutcomeBar />
        <Scarcity />
        <HowItWorks />
        <AgentsShowcase />
        <OwnerControl />
        <VoiceDemo />
        <ROICalculator />
        <Integrations />
        <PricingTiers />
        <Guarantee />
        <Faq />
      </main>
      <Footer />
      <StickyCta />
    </>
  );
}

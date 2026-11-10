/**
 * Elderly hero — mirrors the elderly preview: active banner, peace-of-mind
 * headline, blood/conditions/meds tiles, care-proxy strip.
 */
import { Link } from "react-router-dom";
import type { Medication } from "@/types/health";
import { PortraitArt } from "./ModeHeroShell";

export function ElderlyHero({
  bloodType,
  genotype,
  activeMeds,
  conditionCount,
  contactCount,
  proxyName,
}: {
  bloodType?: string;
  genotype?: string;
  activeMeds: Medication[];
  conditionCount: number;
  contactCount: number;
  proxyName?: string;
}) {
  return (
    <section
      aria-label="Elderly care mode is active"
      className="mhl-mode-hero grid min-w-0 gap-5 overflow-hidden rounded-mhl border border-mhl-rule bg-mhl-surface p-5 sm:p-6 lg:grid-cols-[1.35fr_1fr] lg:items-stretch"
    >
      <div className="min-w-0">
        <p className="inline-flex items-center gap-2 rounded-full bg-mhl-accent-lo px-3 py-1.5 text-mhl-fine font-bold text-mhl-accent">
          <span className="h-2 w-2 rounded-full bg-mhl-accent" aria-hidden="true" />
          Elderly care mode is active
        </p>
        <h2 className="mt-3 text-mhl-answer font-bold leading-tight tracking-[-0.02em] text-mhl-ink">
          Good health brings peace of mind.
        </h2>
        <p className="mt-1.5 text-mhl-body text-mhl-muted">
          A simpler view with your important health information, medications, appointments and care support.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2.5">
          <div className="rounded-mhl-sm bg-mhl-sunk p-4 text-center">
            <p className="text-mhl-fine text-mhl-muted">Blood type</p>
            <p className="mt-1 text-mhl-title font-bold text-mhl-ink">{bloodType ?? "Not recorded"}</p>
            <p className="text-mhl-fine text-mhl-muted">{genotype ? `Genotype ${genotype}` : "Genotype not recorded"}</p>
          </div>
          <Link to="/app/conditions" className="mhl-row rounded-mhl-sm bg-mhl-sunk p-4 text-center">
            <p className="text-mhl-fine text-mhl-muted">Active conditions</p>
            <p className="mt-1 text-mhl-title font-bold text-mhl-ink">{conditionCount}</p>
            <p className="text-mhl-fine font-semibold text-mhl-accent">View details</p>
          </Link>
          <Link to="/app/medications" className="mhl-row rounded-mhl-sm bg-mhl-sunk p-4 text-center">
            <p className="text-mhl-fine text-mhl-muted">Medications</p>
            <p className="mt-1 text-mhl-title font-bold text-mhl-ink">{activeMeds.length}</p>
            <p className="text-mhl-fine text-mhl-muted">Active</p>
          </Link>
        </div>
        <div className="mt-2.5 rounded-mhl-sm border border-mhl-rule p-4">
          <p className="text-mhl-fine text-mhl-muted">Care proxy</p>
          <p className="mt-0.5 text-mhl-body font-bold text-mhl-ink">
            {contactCount} {contactCount === 1 ? "trusted contact" : "trusted contacts"}
          </p>
          {proxyName && <p className="text-mhl-fine text-mhl-muted">{proxyName}</p>}
        </div>
      </div>
      <div className="relative hidden min-h-[13rem] overflow-hidden rounded-mhl-sm lg:block">
        <PortraitArt variant="elderly" headline="Good health brings peace of mind." sub="Simple · Clear · Safe" />
      </div>
    </section>
  );
}

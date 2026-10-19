/**
 * Normal hero — mirrors the normal preview: greeting, alert strip,
 * quick actions, portrait panel.
 */
import { Link } from "react-router-dom";
import { buttonStyles } from "@/components/ui/Button";
import { PortraitArt } from "./ModeHeroShell";
import { AllergyIcon } from "@/components/icons";

export function NormalHero({
  userName,
  allergyAlert,
  bloodType,
  genotype,
}: {
  userName: string;
  allergyAlert?: string;
  bloodType?: string;
  genotype?: string;
}) {
  const first = userName.split(" ")[0] || "there";
  return (
    <section className="grid min-w-0 gap-5 lg:grid-cols-[1.35fr_1fr] lg:items-stretch">
      <div className="min-w-0 rounded-mhl border border-mhl-rule bg-mhl-surface p-5 sm:p-6">
        <p className="text-mhl-fine font-bold uppercase tracking-[0.08em] text-mhl-muted">
          Your health at a glance
        </p>
        <h2 className="mt-2 text-mhl-answer font-bold tracking-[-0.02em] text-mhl-ink">
          Hello, {first}
        </h2>
        {allergyAlert ? (
          <p className="mt-2 flex items-start gap-2 rounded-mhl-sm bg-mhl-danger-lo p-3 text-mhl-fine text-mhl-danger">
            <AllergyIcon size={16} className="mt-0.5 flex-none" />
            <span>
              <b>A life-threatening allergy is on file: {allergyAlert}.</b>{" "}
              Shown on your emergency card.{" "}
              <Link to="/app/allergies" className="font-semibold underline">
                Review allergies
              </Link>
            </span>
          </p>
        ) : (
          <p className="mt-2 text-mhl-body text-mhl-muted">
            Everything is up to date — here is where things stand.
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/app/add" className={buttonStyles("primary", "md")}>
            Add record
          </Link>
          <Link to="/app/timeline" className={buttonStyles("secondary", "md")}>
            View timeline
          </Link>
        </div>
      </div>
      <div className="relative hidden min-h-[13rem] overflow-hidden rounded-mhl border border-mhl-rule bg-mhl-surface lg:block">
        <PortraitArt
          variant="normal"
          headline="Your health. Your data. Your control."
          sub={
            [bloodType, genotype].filter(Boolean).join(" · ") ||
            "Complete record"
          }
        />
      </div>
    </section>
  );
}

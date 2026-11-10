/**
 * The illustrations from the mode previews (frontend/preview/*.png), cut out
 * at their exact pixels. Each one is used where the preview places it:
 *
 *   pregnancy  the hero figure, the baby on the pregnancy timeline card,
 *              the heart on the support banner
 *   elderly    the heart-and-hands on the mode banner, the lotus on the
 *              "What else" card
 *   critical   the lungs on a breathing condition's banner and on its care plan
 *
 * They sit on the mode's own light surfaces with `mix-blend-multiply`, so
 * their paper-coloured backdrop drops out and only the drawing shows.
 */
import pregnancyHero from "@/assets/modes/pregnancy-hero.webp";
import pregnancyFetus from "@/assets/modes/pregnancy-fetus.webp";
import pregnancySupport from "@/assets/modes/pregnancy-support.webp";
import elderlyBanner from "@/assets/modes/elderly-banner.webp";
import elderlyLotus from "@/assets/modes/elderly-lotus.webp";
import criticalLungs from "@/assets/modes/critical-lungs.webp";
import criticalPlan from "@/assets/modes/critical-plan.webp";

export const MODE_ART = {
  pregnancy: { hero: pregnancyHero, fetus: pregnancyFetus, support: pregnancySupport },
  elderly: { banner: elderlyBanner, lotus: elderlyLotus },
  critical: { lungs: criticalLungs, plan: criticalPlan },
} as const;

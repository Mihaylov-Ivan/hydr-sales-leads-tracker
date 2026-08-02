/** Plain-language blurbs shown via the “i” on each metrics card. */
export const METRIC_EXPLANATIONS = {
  coldToUd:
    "Of Cold Leads that are old enough to have had a fair chance, how many became a real project (Under Development or already Commissioned)?",
  coldToCommissioned:
    "Same idea as Cold → Under Development, but the finish line is “project built and switched on.” Takes longer, so we only count even older leads.",
  resolvedSuccess:
    "Ignore projects still in progress. Of the ones that already ended (won or cancelled), how many won?",
  stalePipeline:
    "Of open Cold and Hot leads, how many have gone quiet for too long (no real activity past your day limit)? Under Development projects are never marked stale.",
  commissioningTarget:
    "Your goal — for example “1 finished project every 3 months” means 4 per year. You set this; it is not calculated from history.",
  supportedPace:
    "Given how full your pipeline is today, how close can you get to that goal? If the weakest stage is only 70% full, you might only support about 70% of the target pace.",
  bottleneck:
    "Which stage is the emptiest compared with what you need? That missing piece is what slows everything down.",
  stageCoverage:
    "For each stage: how many healthy projects you should have (Required), how many you have (Healthy), how many Cold/Hot are quiet (Stale), and whether coverage is enough. Balance is surplus or shortfall.",
  conversionRange:
    "Confirmed = what already converted. Expected = a middle guess if some open ones convert (using your % settings). Theoretical max = if every open one somehow converted — that max is not a forecast.",
  requiredCold:
    "Roughly how many healthy Cold Leads you should have sitting in the pipeline to keep feeding your annual target, based on typical time in stage and conversion rate.",
  requiredHot:
    "Roughly how many healthy Hot Leads you should have sitting in the pipeline to keep feeding your annual target, based on typical time in stage and conversion rate.",
  requiredUd:
    "Roughly how many healthy Under Development projects you should have sitting in the pipeline to keep feeding your annual target, based on typical time in stage and conversion rate.",
} as const;

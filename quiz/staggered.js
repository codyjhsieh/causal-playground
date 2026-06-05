export const questions = [
  {
    q: "Intuitively, why is staggered adoption a problem for the standard two-way fixed-effects (TWFE) DiD estimator?",
    choices: [
      "Staggered adoption reduces sample size because some states never adopt the policy",
      "With multiple adoption years, TWFE secretly includes comparisons where already-treated states serve as controls for later adopters — but a state's treatment effect is embedded in its post-adoption outcomes, corrupting the control group",
      "Staggered adoption violates the parallel-trends assumption for every cohort simultaneously",
      "TWFE is only valid when all units adopt at the same time because the post indicator is then well-defined",
    ],
    answer: 1,
    explain:
      "The standard TWFE regression (outcome ~ post + state FE + year FE) is a variance-weighted average of all 2×2 DiD comparisons in the data. When adoption is staggered, some of those comparisons use an early-adopting state — whose treatment effect is already baked into its level — as the control for a late adopter. This 'forbidden comparison' biases the estimate because the early adopter is not a clean counterfactual. Choice C conflates the parallel-trends assumption with the forbidden-comparison problem.",
  },
  {
    q: "The Goodman-Bacon decomposition reveals three types of 2×2 DiD comparisons inside a staggered TWFE estimate. Which of the following are 'clean' comparisons, and which is 'forbidden'? Select ALL clean comparisons.",
    choices: [
      "An early-adopting cohort compared to never-treated states over the pre- and post-adoption window",
      "A late-adopting cohort compared to never-treated states over the pre- and post-adoption window",
      "A late-adopting cohort compared to an already-treated early-adopting cohort in the post-adoption window of the late cohort",
      "An early-adopting cohort compared to a late-adopting cohort before the late cohort adopts (late is not yet treated)",
    ],
    answer: [0, 1, 3],
    explain:
      "Choices A and B are clean because never-treated states provide an untouched counterfactual. Choice D (early vs. late, where late has not yet adopted) is also clean — the late cohort acts as a valid control. Choice C is the forbidden comparison: by the time the late cohort adopts, the early cohort is already treated, so its post-adoption outcomes reflect its own treatment effect and cannot serve as a control.",
  },
  {
    q: "The Callaway–Sant'Anna estimator fixes the forbidden-comparison problem. What is its key design choice?",
    choices: [
      "It drops never-treated states from the analysis to focus on within-adopter variation",
      "For each cohort g and post-adoption year t, it restricts the control pool to states that are either never-treated or not yet treated by year t",
      "It uses a propensity-score weighting to equalize pre-treatment covariate distributions",
      "It estimates a single pooled ATT using all available observations without cohort stratification",
    ],
    answer: 1,
    explain:
      "Callaway &amp; Sant'Anna (2021) define group-time ATT(g,t) for cohort g at post-adoption year t, using only not-yet-treated or never-treated units as the control pool. This eliminates forbidden comparisons by construction. The aggregate clean ATT is a (possibly weighted) average over all cohort–time cells. Choices A and C describe different adjustments; Choice D describes TWFE itself.",
  },
  {
    q: "In the castle-doctrine application, the naive TWFE estimate and the clean Callaway–Sant'Anna ATT differ in magnitude and may even differ in sign. A student says: 'They just differ because of sampling error.' What is the more precise explanation for a systematic difference?",
    choices: [
      "The two estimators use different dependent variables",
      "TWFE applies negative implicit weights to some cohort–time cells — especially those involving forbidden comparisons — which can cause the weighted average to move toward or past zero even if every clean 2×2 shows a positive effect",
      "Callaway–Sant'Anna uses propensity-score trimming that removes outlier states",
      "TWFE requires more data to converge, so with 51 states it is simply noisier",
    ],
    answer: 1,
    explain:
      "Goodman-Bacon (2021) and de Chaisemartin &amp; D'Haultfœuille (2020) formally show that TWFE applies negative implicit weights to some cohort–time cells — the forbidden comparisons with already-treated controls can flip sign relative to the true treatment effect. This is a systematic bias from the estimator's construction, not sampling noise. When treatment effects are heterogeneous across cohorts — which is typical for staggered policy adoption — TWFE can yield a misleading average or even reverse the direction of the effect.",
  },
  {
    q: "In the module's event-study view, each cohort line is plotted relative to the year before adoption (k = −1). Pre-treatment coefficients (k = −5 to −2) should be near zero under a valid DiD design. What would a large, non-zero pre-trend for a specific cohort indicate?",
    choices: [
      "That cohort adopted the castle-doctrine law earlier than recorded, shifting the effective treatment date",
      "That the parallel-trends assumption is violated for that cohort: the treated and control states were already diverging before adoption, calling into question whether the post-adoption gap reflects the law's effect",
      "That TWFE is using that cohort's pre-period as a control for another cohort, which is always fine",
      "That the log-homicide outcome variable needs additional covariate adjustment for that cohort only",
    ],
    answer: 1,
    explain:
      "Parallel trends requires treated and control units to trend the same way before treatment. A non-zero pre-trend coefficient (relative to k = −1 baseline) for a cohort means the cohort was already diverging from the not-yet-treated control group before adoption. This is a red flag: if pre-treatment divergence exists, post-treatment divergence cannot be cleanly attributed to the castle-doctrine law. Choice A (Ashenfelter's dip / anticipation) is a related but distinct concern. Choice D conflates pre-trend with omitted-variable problems.",
  },
];

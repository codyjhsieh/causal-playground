export const questions = [
  {
    q: "Card (1995) uses proximity to a 4-year college (nearc4) as an instrument for years of schooling. Which three properties must nearc4 satisfy for this IV strategy to be valid? (Select all that apply.)",
    choices: [
      "Relevance: nearc4 must causally affect years of schooling (first stage ≠ 0).",
      "Exclusion: nearc4 must affect log wages only through schooling, not through any direct path.",
      "Independence: nearc4 must be independent of unobserved ability and other confounders, at least conditional on controls.",
      "Monotonicity: every person must increase their schooling if offered a college nearby."
    ],
    answer: [0, 1, 2],
    explain: "The standard three IV conditions are Relevance (A), Exclusion (B), and Independence (C). All three are required for the IV estimator to identify a causal parameter. Monotonicity (D) is an additional condition needed to interpret the IV estimate as a LATE (Local Average Treatment Effect for compliers), but it is not one of the three core validity conditions — and Card's setup is a continuous treatment, making the standard binary-monotonicity framing less directly applicable. The exclusion restriction (B) is the most debated for nearc4: one concern is that college proximity may signal local labor market quality, which could directly raise wages."
  },
  {
    q: "The Wald estimator for Card's IV is: IV = Cov(log wage, nearc4) / Cov(educ, nearc4). In the interactive module this is visualized as rise over run on a triangle. What does 'rise' and 'run' represent?",
    choices: [
      "Rise = change in log wage between near-college and far-college groups (reduced form); Run = change in years of schooling between the same groups (first stage).",
      "Rise = standard error of the IV estimate; Run = standard error of the OLS estimate.",
      "Rise = the ability confound removed by the instrument; Run = the remaining OLS bias.",
      "Rise = the IV estimate minus the OLS estimate; Run = the sample size."
    ],
    answer: 0,
    explain: "The Wald estimator ΔY/ΔX decomposes as: ΔY = E[log wage | nearc4=1] − E[log wage | nearc4=0] (reduced form — how the instrument shifts the outcome) and ΔX = E[educ | nearc4=1] − E[educ | nearc4=0] (first stage — how the instrument shifts the treatment). The ratio is the IV estimate of the return to a year of schooling. B, C, and D describe unrelated quantities. The triangle visualization makes the ratio intuitive: a steep rise relative to a small run means a large return estimate."
  },
  {
    q: "In Card (1995), the IV estimate of the return to schooling (≈ 0.13) is <em>larger</em> than the OLS estimate (≈ 0.07). A student says: 'This means OLS underestimates the return to education. But we always assumed ability bias makes OLS too large — so something is wrong.' Which explanation best resolves this puzzle?",
    choices: [
      "The IV estimate is simply wrong because nearc4 is a weak instrument.",
      "OLS can be downward-biased by classical measurement error in reported years of schooling (attenuation bias), and the instrument, by exploiting only the exogenous variation in schooling, may also recover the return for a different subgroup (compliers) who may face higher marginal returns. Both forces can push IV above OLS.",
      "The IV estimate identifies the ATE while OLS identifies the ATT; the ATE is always larger.",
      "The result confirms that ability has a negative effect on schooling, which is implausible."
    ],
    answer: 1,
    explain: "Two mechanisms commonly explain IV > OLS in schooling returns: (1) Measurement error in self-reported education biases OLS toward zero (attenuation bias). IV, using the exogenous college-proximity variation, is immune to this classical error-in-variables attenuation. (2) The IV estimate is a LATE — it identifies the return to schooling for compliers (people whose schooling changed because of college proximity). If these are individuals on the margin who would not have attended college otherwise, and if returns are heterogeneous (marginal students may have high returns), IV can exceed OLS even after correcting ability bias. A is contradicted by the first-stage estimate of ≈ +0.83 years — not a weak instrument. C is wrong: the OLS/IV distinction is not about ATE vs. ATT in this context. D misreads the direction of ability bias."
  },
  {
    q: "A researcher uses a very small bootstrap sample (n = 50) when computing Card's IV estimate and observes that the IV estimate jumps around wildly across samples while OLS stays tightly clustered. What phenomenon does this illustrate?",
    choices: [
      "IV is inconsistent — it converges to a different value than OLS as n → ∞.",
      "IV has higher variance than OLS because the first stage (instrument strength) explains only a fraction of treatment variance; the variance of IV ∝ 1/F-stat, so weak or partial instruments inflate standard errors dramatically.",
      "The bootstrap is invalid for IV estimators and should not be used.",
      "Small samples violate the exclusion restriction, making the IV estimate unstable."
    ],
    answer: 1,
    explain: "This is the fundamental bias-variance trade-off of IV. OLS minimizes variance by using all variation in X to predict Y. IV discards all variation in X not induced by the instrument Z and uses only that exogenous fragment. The variance of the IV estimator is approximately σ²/(n · Var(X̂)) where X̂ is the first-stage fitted value — it is inversely proportional to the first-stage F-statistic. With small n, or a weak first stage, Var(X̂) is tiny and IV variance explodes. A is wrong: IV is consistent under the three IV assumptions. C is wrong: the bootstrap is valid for IV (with caveats for very weak instruments). D conflates small-sample variance with exclusion restriction violation."
  },
  {
    q: "The IV estimator in Card (1995) identifies a Local Average Treatment Effect (LATE). Which group does the LATE correspond to, and why does it differ from the Average Treatment Effect (ATE)?",
    choices: [
      "The LATE is the effect for the entire population; it equals the ATE when the instrument is strong.",
      "The LATE is the effect for compliers — individuals whose schooling level changed because of college proximity. It may differ from the ATE because the return to education may vary across subgroups, and compliers are not a random sample of the population.",
      "The LATE is the effect for always-takers (those who attend college regardless of proximity); they are the only group affected by the instrument.",
      "The LATE equals the ATT (average treatment effect on the treated) whenever the instrument is binary."
    ],
    answer: 1,
    explain: "In the potential-outcomes IV framework with a binary instrument and binary treatment, the Wald estimator identifies the LATE: E[Y(1) − Y(0) | complier]. Compliers are the subpopulation whose treatment status is actually shifted by the instrument — here, people who attend more schooling because a college is nearby. Always-takers (attend regardless) and never-takers (don't attend regardless) are unaffected by the instrument and contribute no identifying variation. The LATE can differ from the ATE or ATT because treatment effects are heterogeneous and compliers may be a selected group (e.g., those facing high financial constraints). A is wrong: the LATE equals the ATE only under constant treatment effects. C misidentifies the relevant group. D is wrong: LATE ≠ ATT in general."
  }
];

export const questions = [
  {
    q: "For a single NSW participant who received job training, which potential outcomes are observable in the data?",
    choices: [
      "Both Y(0) and Y(1), since both are defined for every unit",
      "Only Y(1) — the earnings they actually had after training; Y(0) is forever unobserved",
      "Only Y(0) — the baseline earnings before training",
      "Neither; potential outcomes are purely mathematical objects never linked to real data",
    ],
    answer: 1,
    explain: "Potential outcomes exist for every unit in theory, but the fundamental problem of causal inference is that only the outcome under the realized treatment is observed. A treated participant lived in the Y(1) world; their Y(0) — what they would have earned without training — never happened and is not recorded anywhere.",
  },
  {
    q: "The NSW module computes a module-level <strong>ATE ≈ +$1,794</strong> as the difference in mean 1978 earnings between the treated and control arms. This estimate is valid because:",
    choices: [
      "NSW uses a very large sample (thousands of participants), which eliminates all bias",
      "Randomization makes the treated and control groups exchangeable: E[Y(0)] is the same for both, so E[Y|T=1] − E[Y|T=0] = E[Y(1) − Y(0)]",
      "The NSW survey measured both Y(0) and Y(1) for each participant using a follow-up design",
      "The ATE is always identified from observational data when the outcome is earnings",
    ],
    answer: 1,
    explain: "Random assignment ensures that treatment assignment T is independent of potential outcomes: {Y(0),Y(1)} ⫫ T. Under this condition, E[Y|T=1] = E[Y(1)] and E[Y|T=0] = E[Y(0)], so their difference is the ATE. Sample size only reduces variance; it does not create identification. In observational studies the same arithmetic can be severely confounded.",
  },
  {
    q: "Select <strong>all</strong> true statements about Individual Treatment Effects (ITEs) in the NSW experiment.",
    choices: [
      "ITEs τᵢ = Y(1)ᵢ − Y(0)ᵢ are defined for each participant but cannot be observed for any of them",
      "Randomization identifies every ITE in the same way it identifies the ATE",
      "The distribution of modeled ITEs shown in 'God mode' uses arm-mean imputation and is not the true ITE distribution",
      "The ATE equals the average of all ITEs across the population: E[τᵢ] = ATE",
    ],
    answer: [0, 2, 3],
    explain: "ITEs are always missing one potential outcome (the one not realized), so they are never identified for any individual — randomization only identifies the ATE. The God-mode histogram uses the control-arm mean as every treated unit's Y(0), which is an approximation, not a true individual measure. The ATE is by definition E[Y(1)−Y(0)] = E[τᵢ], so choice 3 is correct.",
  },
  {
    q: "A researcher observes that the NSW treated arm has higher average 1978 earnings than the control arm. They conclude: <em>\"Every single trainee benefited from the program.\"</em> What is wrong with this inference?",
    choices: [
      "Nothing — if the average effect is positive, all individuals must have positive effects",
      "The ATE being positive is consistent with some ITEs being zero or negative; individual effects are not identified and can vary widely across participants",
      "The conclusion is wrong because the NSW ATE is actually negative",
      "The claim is valid only if the standard error of the ATE is small",
    ],
    answer: 1,
    explain: "A positive average conceals heterogeneity: some participants may have been harmed or unaffected while others gained a lot. ITEs are not identified (the missing counterfactual problem), so we cannot know which individuals benefited. The module's God-mode histogram shows the modeled ITE distribution spans both positive and negative values even under the naive imputation.",
  },
  {
    q: "The NSW module shows a 'God mode' that reveals <em>modeled</em> counterfactuals by imputing the arm mean. Why does this still confirm that the <strong>observed difference ≈ ATE</strong>, even though individual counterfactuals are fabricated?",
    choices: [
      "Because arm-mean imputation happens to equal the true individual counterfactuals in this dataset",
      "By definition of the sample mean: when Y(0) is imputed as the control mean for all treated units, the average of (Y(1)ᵢ − imputed Y(0)) across treated units equals (mean treated) − (mean control), which is the observed difference",
      "God mode uses a machine-learning model that recovers true counterfactuals",
      "The NSW data happens to have zero treatment-effect heterogeneity, so mean imputation is exact",
    ],
    answer: 1,
    explain: "This is pure algebra: if you impute every treated unit's Y(0) as meanC, then the average modeled ITE = (1/nT) Σ [Y(1)ᵢ − meanC] = meanT − meanC = observed difference. So the aggregate check works trivially regardless of how wrong individual imputations are. It confirms the ATE arithmetic, not the accuracy of individual counterfactuals.",
  },
];

export const questions = [
  {
    q: "In the Cai et al. weather-insurance RCT, why does SUTVA (the Stable Unit Treatment Value Assumption) fail?",
    choices: [
      "The randomization was conducted at the individual level rather than the village level",
      "Intensively treated households share information with untreated neighbors, so an untreated person's insurance take-up depends on how many of their neighbors were treated",
      "The outcome variable (insurance take-up) is binary, which violates the continuity requirement of SUTVA",
      "SUTVA only applies to medical trials, not economic field experiments",
    ],
    answer: 1,
    explain:
      "SUTVA requires that unit i's potential outcome depends only on unit i's own treatment. In Cai et al., treated (intensively informed) villagers talk to their neighbors about insurance, directly raising untreated neighbors' take-up rates. This peer-information channel means unit j's outcome depends on unit i's treatment — a clear SUTVA violation. The level of randomization and outcome type are irrelevant to SUTVA.",
  },
  {
    q: "The exposure-mapping regression in this module estimates: takeup ~ 1 + intensive + peer_exposure + covariates. Which of the following correctly identifies what each coefficient captures? Select ALL that apply.",
    choices: [
      "The coefficient on <em>intensive</em> estimates the direct effect of receiving the intensive session on one's own take-up",
      "The coefficient on <em>peer_exposure</em> estimates the spillover effect: how take-up changes as the fraction of intensively-treated neighbors increases",
      "The intercept estimates the average treatment effect for the full population",
      "The coefficient on <em>intensive</em> captures both direct and spillover effects together",
    ],
    answer: [0, 1],
    explain:
      "Choices A and B are correct. By conditioning on both own treatment and peer exposure simultaneously, the regression separates the direct effect (own intensive) from the spillover (peer exposure). Choice C is wrong — the intercept is the predicted take-up when intensive=0 and peer_exposure=0, not an ATE. Choice D describes the naive ITT, which omits peer_exposure and hence conflates the two effects.",
  },
  {
    q: "In the module's bar chart, the 'Total (D + S)' bar is noticeably larger than the 'Naive ITT' bar. What explains this gap?",
    choices: [
      "The naive ITT over-adjusts for covariates, shrinking the estimate",
      "The naive ITT compares treated individuals to controls who have already partially benefited from spillovers, making the control group look better than the true no-treatment counterfactual — so the naive estimate understates the true program value",
      "The total effect includes placebo responses that inflate the estimate",
      "Spillovers cancel out in the naive estimate because they affect treated and control households equally",
    ],
    answer: 1,
    explain:
      "Control households in this village RCT are not in a pure no-treatment world — their neighbors may be intensively treated and sharing information. The spillover raises control-group take-up, compressing the treated-minus-control gap. The exposure-mapping regression recovers the true direct effect and the spillover separately, and their sum (Total = Direct + Spillover) exceeds the naive ITT. Choice D is the opposite of what happens.",
  },
  {
    q: "A researcher computes the naive ITT (mean take-up in treated group minus mean in control group) and concludes the insurance program has a modest effect. Which of the following best describes the specific bias this induces?",
    choices: [
      "Attenuation bias from measurement error in the treatment indicator",
      "Downward bias in the estimated program effect, because spillovers inflate the control group's take-up, making the treated–control difference smaller than the true direct + spillover benefit",
      "Upward bias, because treated households are wealthier and would have bought insurance anyway",
      "No bias, because ITT is always valid by the randomization",
    ],
    answer: 1,
    explain:
      "This is the core misconception trap. ITT is unbiased for the intention-to-treat estimand under no-interference, but here interference makes the 'control' take-up higher than it would be without any treatment. The naive gap therefore understates the causal value of the program. Randomization guarantees balance on pre-treatment covariates, not immunity from interference — so Choice D is wrong. Choices A and C describe different bias mechanisms unrelated to spillovers.",
  },
  {
    q: "In the Cai et al. data as modeled in this module, the direct effect coefficient is roughly 0.27, the spillover coefficient is roughly 0.19, and the naive ITT is roughly 0.20. At full peer saturation (everyone in the village intensively treated), what is the best estimate of the total program benefit per household?",
    choices: [
      "0.20 (the naive ITT, which is always the correct estimand for policy)",
      "0.27 (the direct effect only; spillovers are externalities and not attributable to the program)",
      "Approximately 0.46 (direct + spillover ≈ 0.27 + 0.19), which exceeds the naive ITT because the program's true value includes the peer-learning channel",
      "0.19 (the spillover alone, since the direct effect would occur regardless of program design)",
    ],
    answer: 2,
    explain:
      "When peer_exposure = 1 (all neighbors treated), the predicted benefit per household is direct + spillover·1 ≈ 0.27 + 0.19 = 0.46. The naive ITT of 0.20 misses the spillover channel entirely. Policymakers valuing the program at its naive ITT would underestimate impact and potentially underfund it. Choice A is the classic mistake this module is designed to expose. Choice B arbitrarily excludes a mechanism that is operationally part of the program.",
  },
];

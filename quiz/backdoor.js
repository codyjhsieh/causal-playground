export const questions = [
  {
    q: "Intuitively, why does an unadjusted comparison of NSW trainees vs. CPS comparison workers give the wrong answer for the effect of job training?",
    choices: [
      "The CPS sample is too small to be representative.",
      "The two groups differ on pre-treatment traits (earnings, demographics) that independently predict 1978 earnings, opening non-causal paths from training to outcome.",
      "The job-training program was not assigned randomly, so the outcome is mismeasured.",
      "The LaLonde data only contain 185 treated units, creating a small-sample bias."
    ],
    answer: 1,
    explain: "The CPS comparison group is much richer and better-educated than the NSW trainees. Those differences affect re78 directly (independent of whether someone trained), so a raw comparison conflates the training effect with pre-existing advantages. That is precisely what a backdoor path is: a non-causal route from treatment to outcome flowing through common causes. Sample size (A, D) is not the core issue; mismeasurement (C) describes a different problem."
  },
  {
    q: "The backdoor criterion requires that adjustment set Z (1) blocks every backdoor path from treatment X to outcome Y, and (2) satisfies which additional condition?",
    choices: [
      "Z must contain every variable that affects Y.",
      "Z must contain no descendant of X.",
      "Z must be a collider on at least one path.",
      "Z must be binary."
    ],
    answer: 1,
    explain: "Adjusting for a descendant of X (e.g., a variable caused by the treatment) introduces bias by partially blocking the causal path itself or by opening new non-causal paths. The criterion is: Z blocks all backdoor paths AND Z contains no descendant of X. Containing every predictor of Y (A) is unnecessary and can even introduce collider bias. Being a collider (C) would open a path rather than block it. Binariness (D) is irrelevant."
  },
  {
    q: "In the LaLonde DAG on this module, each of the 8 pre-treatment covariates (age, educ, race, marital status, re74, re75) has arrows pointing into both <em>treat</em> and <em>re78</em>. Which of the following are valid reasons why including re74 and re75 in Z is especially important? (Select all that apply.)",
    choices: [
      "re74 and re75 carry the largest share of residual confounding in the NSW vs. CPS comparison.",
      "Prior earnings are direct causes of 1978 earnings, so they explain most of the outcome variance.",
      "re74 and re75 are descendants of job training, so they act as mediators.",
      "Without re74 and re75, the estimate remains around −$8k to −$15k instead of converging to +$1,794."
    ],
    answer: [0, 1, 3],
    explain: "A, B, and D are all correct. re74/re75 carry the dominant confounding signal because earnings are highly persistent (prior earnings → future earnings, B), and the CPS group has far higher prior earnings than NSW trainees, creating a large backdoor flow (A). Without them the estimate stays wildly negative (D). C is wrong: re74 and re75 were measured <em>before</em> the training program began, so they are pre-treatment variables, not descendants of treatment. Including descendants would introduce post-treatment bias."
  },
  {
    q: "A researcher argues: 'I should control for <em>employment in 1978</em> alongside the other covariates, because it is correlated with 1978 earnings and will improve precision.' What is wrong with this reasoning?",
    choices: [
      "Nothing is wrong; more controls always reduce bias.",
      "Employment in 1978 is a descendant of job training (training can cause employment), so conditioning on it would block part of the causal path and bias the treatment estimate.",
      "Employment in 1978 is a collider that would open a backdoor path only if both gender and age cause it.",
      "The LaLonde dataset does not contain an employment variable, making the question moot."
    ],
    answer: 1,
    explain: "Post-treatment variables are descendants of the treatment. Including them in the adjustment set can block part of the causal effect (mediation bias) or open collider-like paths that introduce new confounding. The backdoor criterion explicitly forbids conditioning on descendants of X. 'More controls = less bias' (A) is a common misconception; it is false when those controls are post-treatment. C misapplies the collider concept. D sidesteps the issue."
  },
  {
    q: "In the interactive module, after adjusting for {age, educ, black, hisp, marr, nodegree, re74, re75} on the NSW + CPS observational sample, the regression coefficient on <em>treat</em> converges to approximately +$1,794. What does this value represent, and why does it match the experimental benchmark from the pure NSW RCT?",
    choices: [
      "It is the average treatment effect in the CPS sample, made unbiased by a large sample size.",
      "It is the average treatment effect on the treated (ATT) — the earnings gain for trainees — recovered because conditioning on all pre-treatment common causes closes every backdoor path, making the observational comparison as credible as the randomized trial.",
      "It is the intent-to-treat estimate, which equals the ATE whenever compliance is perfect.",
      "It matches the RCT by coincidence; observational adjustment cannot in general recover experimental estimates."
    ],
    answer: 1,
    explain: "Blocking all backdoor paths via a sufficient adjustment set achieves conditional exchangeability: within covariate strata, treatment assignment is as good as random. The resulting regression coefficient on treat estimates the ATT (since we condition on NSW treated vs. CPS controls). It matches Dehejia & Wahba's experimental benchmark (+$1,794) because the full set of pre-treatment covariates, especially re74 and re75, captures essentially all the selection-into-treatment differences. A confuses sample size with causal identification. C introduces IV/ITT concepts not relevant here. D is false — this data exercise is one of the canonical demonstrations that correct adjustment can recover experimental truth."
  }
];

export const questions = [
  {
    q: "Intuitively, what does the Natural Indirect Effect (NIE) represent in the JOBS II study?",
    choices: [
      "The reduction in depression caused directly by attending the workshop, holding self-efficacy fixed",
      "The portion of the workshop's effect on depression that operates by first raising job-search self-efficacy",
      "The total effect of the workshop on depression across all pathways",
      "The effect of self-efficacy on depression among people who did not attend the workshop",
    ],
    answer: 1,
    explain:
      "NIE = a·b traces the indirect path X→M→Y: the workshop raises self-efficacy (a > 0), and higher self-efficacy lowers depression (b < 0), so NIE = a·b < 0 — a depression-reducing indirect channel. Choice A is the NDE (direct path). Choice C is the Total Effect. Choice D misspecifies the population.",
  },
  {
    q: "In linear mediation, the accounting identity TE ≈ NDE + NIE holds. In the JOBS II adjusted model, the workshop's total effect on depression is approximately −0.076. If NIE ≈ −0.028, which statement about NDE is correct?",
    choices: [
      "NDE ≈ −0.104, meaning the direct path amplifies the total effect",
      "NDE ≈ −0.048, meaning roughly 37% of the effect is mediated and 63% is direct",
      "NDE ≈ +0.028, meaning the direct path works in the opposite direction of the total effect",
      "NDE cannot be determined from TE and NIE without re-fitting the models",
    ],
    answer: 1,
    explain:
      "By the identity NDE = TE − NIE = −0.076 − (−0.028) = −0.048. The proportion mediated is NIE/TE = −0.028/−0.076 ≈ 37%, leaving 63% as the direct effect. Choice A would require NIE to add rather than subtract. Choice C implies a sign flip that contradicts the stated values. Choice D is wrong because the identity is algebraic once TE and NIE are known.",
  },
  {
    q: "Which assumption is required to interpret NIE causally — even though JOBS II is a randomized trial?",
    choices: [
      "No unmeasured confounders of the treatment–outcome relationship (X→Y)",
      "No unmeasured confounders of the mediator–outcome relationship (M→Y)",
      "The mediator M must be binary",
      "The treatment effect must be homogeneous across individuals",
    ],
    answer: 1,
    explain:
      "Randomization of X ensures the X→Y total effect is identified, but the mediator M (self-efficacy) is not randomized. Any unmeasured variable that jointly affects self-efficacy and depression (e.g., pre-existing motivation, social support) would confound the M→Y path and bias NIE. This assumption — no unmeasured mediator–outcome confounders — is untestable from the data alone, even in an RCT.",
  },
  {
    q: "A colleague argues: 'Because NIE = a·b and a is positive (workshop raises self-efficacy), the workshop must have increased depression if self-efficacy increases depression.' Which specific error is this reasoning making?",
    choices: [
      "It ignores that both a and b must have the same sign for NIE to reduce depression",
      "It ignores that b (self-efficacy → depression) is negative, so NIE = a·b is negative — a depression reduction, not an increase",
      "It confuses NIE with NDE",
      "It assumes linearity when the relationship is nonlinear",
    ],
    answer: 1,
    explain:
      "b is the coefficient on M in the outcome model Y ~ X + M + covs; higher self-efficacy predicts lower depression, so b < 0. Since a > 0 and b < 0, NIE = a·b < 0, meaning the indirect path lowers depression — the same direction as the total effect. The colleague assumed b > 0 without checking its sign, which is the misconception here.",
  },
  {
    q: "In the JOBS II adjusted mediation results, approximately 37% of the workshop's depression benefit flows through job-search self-efficacy. What is the correct interpretation of this figure, and what important caveat applies?",
    choices: [
      "37% of workshop participants experienced a depression reduction; the other 63% did not benefit",
      "The self-efficacy pathway accounts for 37% of the total depression reduction (NIE/TE ≈ 0.37); the remaining 63% operates through other pathways — but this split assumes no unmeasured mediator–outcome confounding",
      "The workshop reduced depression by 37 percentage points via self-efficacy",
      "The 37% figure is the proportion of the sample with measurable self-efficacy changes",
    ],
    answer: 1,
    explain:
      "Proportion mediated = NIE/TE ≈ 0.37 means 37% of the total effect is attributed to the self-efficacy mechanism, with the remaining 63% through other direct or unmodeled pathways (e.g., social support, job-search skills beyond self-efficacy). The critical caveat is that this decomposition requires the no-unmeasured-mediator–outcome-confounder assumption, which is structural and unverifiable. Choices A, C, and D all misinterpret the percentage as a population proportion or an absolute point estimate.",
  },
];

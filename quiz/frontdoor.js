export const questions = [
  {
    q: "Intuitively, why does the front-door criterion let us recover the causal effect of X on Y even when X and Y share an unobserved confounder U?",
    choices: [
      "We control for U indirectly by including many observed covariates that are correlated with it.",
      "We bypass U entirely by breaking the problem into two stages — first estimating how X affects the measured mediator M, then how M affects Y holding X fixed — so U never appears in either regression.",
      "We use the observed correlation of U with X to extrapolate the unobserved potential outcomes.",
      "The front-door formula only works when U has been measured but is left out of the model for parsimony."
    ],
    answer: 1,
    explain: "The front-door criterion works through a clever two-stage maneuver. Stage 1 (X→M) is clean because U is not a confounder of X→M (eligibility is employer-assigned, not self-selected). Stage 2 (M→Y | X) blocks the M←X←U→Y backdoor by conditioning on X within each eligibility group, which makes U's confounding for M→Y disappear. The product β₁ × β₂ never requires observing U. A describes the backdoor approach, which requires U to be observed. C is not how the formula works. D directly contradicts the premise — the power of front-door is that U is genuinely unobserved."
  },
  {
    q: "The three conditions for front-door identification are: (1) M fully mediates X→Y, (2) no unblocked backdoor path X→M, and (3) all backdoors M→Y are blocked by X. In the 401(k) application, which of the following correctly maps these conditions to the variable roles?",
    choices: [
      "X = nettfa (assets), M = p401k (participation), Y = e401k (eligibility); condition 3 fails because eligibility has no effect on participation.",
      "X = e401k (eligibility), M = p401k (participation), Y = nettfa (assets); condition 2 holds because eligibility is set by the employer — workers cannot choose to be eligible, so there is no self-selection path from workers' characteristics into X.",
      "X = e401k (eligibility), M = p401k (participation), Y = nettfa (assets); condition 1 fails because income directly affects assets independently of participation.",
      "X = inc (income), M = e401k (eligibility), Y = nettfa (assets); income is the natural treatment because it confounds everything."
    ],
    answer: 1,
    explain: "B is the correct assignment. X = eligibility (e401k), M = participation (p401k), Y = net financial assets (nettfa). Condition 2 holds: eligibility is determined by whether the employer offers a 401(k) plan, not by the worker's own choices or income level, so there is no back-door path from income/characteristics back into X. Condition 1 (full mediation) is the key identifying assumption: eligibility affects assets only by inducing participation. Condition 3: within each eligibility group, income is effectively neutralized as a confounder for M→Y. A reverses X and Y. C correctly names the variables but wrongly says condition 1 fails — the identifying assumption is precisely that the direct X→Y path is zero. D mistakes the confounder for the treatment."
  },
  {
    q: "The two-stage OLS estimator for the front-door effect is β̂<sub>FD</sub> = β̂₁ × β̂₂. Which of the following correctly describes what each coefficient measures, and why Stage 2 includes X as a regressor alongside M?",
    choices: [
      "β̂₁ is the effect of M on Y; β̂₂ is the effect of X on M. X is included in Stage 2 to avoid multicollinearity.",
      "β̂₁ is the effect of X on M from M ~ X; β̂₂ is the coefficient on M in Y ~ M + X. X must appear in Stage 2 because omitting it leaves the backdoor path M←X←U→Y open — X is the variable that closes that path.",
      "β̂₁ is the marginal correlation of X and Y; β̂₂ is the partial correlation of M and Y given all covariates. Their product gives the mediated effect.",
      "β̂₁ and β̂₂ are both from a single structural equation with interaction terms; the product arises from the interaction estimate."
    ],
    answer: 1,
    explain: "B is correct. Stage 1 regresses M (participation) on X (eligibility): β̂₁ captures how much eligibility shifts participation. Stage 2 regresses Y (assets) on M and X together: β̂₂ is the coefficient on M, and including X in this regression is crucial — it controls for the direct confounding route M←X←U→Y that would otherwise bias β̂₂. Within a fixed eligibility group, the remaining variation in participation is free of U's confounding. A reverses the roles of β₁ and β₂ and gives the wrong reason for including X. C confuses correlation with regression coefficients. D invents an interaction structure that is not part of the front-door formula."
  },
  {
    q: "A student looks at the module's bar chart and notices that the naive association (+$14k) is much larger than the front-door estimate (+$9–11k) and the backdoor reference (+$9–11k). They conclude: 'The naive estimate is biased upward because income causes both eligibility and assets — people with higher income are both more likely to have employer 401(k) plans and to save more.' Is this reasoning correct?",
    choices: [
      "No — the naive estimate is biased downward; income acts as a suppressor, not a confounder.",
      "Yes — income (U) is a common cause of X (eligibility) and Y (assets), opening a backdoor path X←U→Y that inflates the naive estimate relative to the causal effect.",
      "Partially — income confounds the estimate, but the bias direction is unpredictable without knowing the sign of U's effect on both variables.",
      "No — the naive estimate is unbiased because the 401(k) dataset is large (n ≈ 9,913)."
    ],
    answer: 1,
    explain: "The student's reasoning is exactly right. Income (U) has a positive effect on both eligibility (U→X: higher-income employers tend to offer 401(k) plans) and on net assets (U→Y: higher income → more savings capacity). This opens a backdoor path X←U→Y with the same sign as the causal effect, so the naive association overstates the true causal effect. Both the front-door and backdoor-adjusted estimates remove U's confounding and converge to ≈+$9–11k, well below the naive +$14k. A is wrong about direction. C is wrong — the bias direction is predictable from the signs of U's effects. D repeats the myth that large samples cure confounding (they do not)."
  },
  {
    q: "The module computes three estimates from the real 401(k) data: naive (+$14k), front-door (≈+$9–11k), and backdoor reference (≈+$9–11k). What is the significance of the front-door and backdoor estimates being approximately equal, and why is the backdoor estimate labeled a 'reference' rather than the gold standard?",
    choices: [
      "The similarity is a coincidence; the two estimators target different estimands and should not be compared.",
      "Agreement between front-door and backdoor estimates corroborates identification: both independently remove income confounding via different assumptions. The backdoor is labeled a 'reference' because it requires observing income (U) — in practice U is often unobserved, which is exactly when the front-door criterion is valuable.",
      "Both estimators are biased in the same direction, so their agreement only shows shared systematic error, not identification.",
      "The backdoor estimate is the gold standard because it conditions on the actual confounder; the front-door estimate is an approximation valid only asymptotically."
    ],
    answer: 1,
    explain: "B captures the epistemological point of the module. The front-door and backdoor criteria rest on entirely different identifying assumptions (no direct X→Y path + no X→M backdoor vs. U is observed and sufficiently conditions all confounders), yet they converge on the same number. This convergence is strong evidence that both are correctly removing U's influence and recovering the true causal effect. The backdoor is called a 'reference' because it uses income as an observed variable — in the real policy context income is treated as unobserved (U), so the front-door is the operative identification strategy; the backdoor is only available in this dataset for validation. A denies the value of the comparison. C would require a common source of bias, which is not present. D overstates the backdoor's status and mischaracterizes the front-door's asymptotic properties."
  }
];

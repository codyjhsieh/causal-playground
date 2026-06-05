export const questions = [
  {
    q: "Intuitively, what is 'treatment-confounder feedback' and why does it make standard regression adjustment insufficient for estimating the effect of a time-varying treatment?",
    choices: [
      "It means the treatment affects the confounder which in turn affects the outcome, creating a mediation path that inflates the effect estimate.",
      "It means past treatment (A₀) affects the time-varying confounder (L₁), which then confounds future treatment (A₁). This creates a situation where L₁ is simultaneously a mediator of A₀'s effect on Y and a confounder of A₁'s effect on Y — making it impossible to adjust for L₁ without either blocking causal effects or opening bias.",
      "It means the propensity score at time 1 depends on the propensity score at time 0, requiring joint propensity estimation.",
      "It means confounders measured at time 0 predict both A₀ and A₁, so they must be included in the regression to avoid omitted variable bias."
    ],
    answer: 1,
    explain: "Treatment-confounder feedback (the feedback arc A₀ → L₁ in the DAG) creates a structural paradox for regression: L₁ must be controlled to remove confounding of A₁, yet L₁ also sits on the causal path A₀ → L₁ → Y (partial mediation). Conditioning on L₁ blocks part of A₀'s effect. Worse, conditioning on a descendant of A₀ that is also a common cause of A₁ and Y can open collider-like bias paths. This is why Robins (1986) developed the g-formula: it standardizes over the interventional distribution of L₁, not the observational conditional distribution. A describes mediation without the feedback structure. C and D describe simpler confounding scenarios that standard regression handles correctly."
  },
  {
    q: "In the g-methods module DAG (L₀ → A₀ → L₁ → A₁ → Y), adjusting for L₁ via ordinary regression is doubly harmful. Which of the following explain why? (Select all that apply.)",
    choices: [
      "L₁ is on the causal path A₀ → L₁ → Y, so conditioning on L₁ blocks this component of A₀'s total effect, biasing the A₀ coefficient downward.",
      "L₁ is a descendant of A₀ and a common cause of A₁ and Y, so conditioning on L₁ opens a spurious association between A₀ and Y through A₀ → L₁ ← (L₀ → Y), a collider-like bias pathway.",
      "Conditioning on L₁ increases the standard errors of both A₀ and A₁ coefficients, making inference unreliable.",
      "Adjusting for L₁ removes variance from the outcome model that is attributable to treatment, making the treatment coefficient appear smaller than it truly is."
    ],
    answer: [0, 1],
    explain: "A is correct: the path A₀ → L₁ → Y is a legitimate causal pathway; controlling for L₁ blocks this path and removes part of A₀'s total effect from the A₀ coefficient (mediation bias). B is correct and captures the more subtle collider bias: because L₁ is caused by A₀ (and also by L₀), conditioning on L₁ induces a non-causal association between A₀ and L₀, which then flows into Y — this is the 'opening of a backdoor path through a collider on L₁'. Together these biases operate in opposite directions, which is why the module shows adj-L1 estimate moving away from truth in the direction opposite to naive. C describes a precision issue, not a bias mechanism. D repeats A in different words but lacks the collider-bias component."
  },
  {
    q: "The g-formula (standardization) in the module estimates E[Y(a₀,a₁)] by: (1) modeling L₁ given A₀ and L₀; (2) modeling Y given A₀, A₁, L₁, and L₀; then (3) averaging over the interventional distribution of L₁. Why is step (3) different from simply plugging observed L₁ values into the outcome model?",
    choices: [
      "The observed L₁ values are missing for some units, so step (3) uses imputed values instead.",
      "Under a do-intervention do(A₀=a₀), the distribution of L₁ is no longer P(L₁|A₀=a₀, L₀) from the observational data — it is the distribution L₁ would take if we had forcibly set A₀=a₀. The g-formula propagates this interventional distribution forward, correctly accounting for how A₀'s effect on L₁ feeds into the downstream outcome.",
      "Plugging in observed L₁ values would violate the positivity assumption because not all L₁ values are observed for both treatment regimes.",
      "Step (3) is a computational shortcut; theoretically, plugging in observed L₁ yields the same answer as the g-formula."
    ],
    answer: 1,
    explain: "The key conceptual point is the do-operator vs. conditioning. In the observational distribution, P(L₁|A₀=a₀, L₀) is a conditional distribution that mixes selection effects (who actually received a₀) with the structural effect of a₀ on L₁. Under do(A₀=a₀), there is no selection — everyone is set to a₀, so the distribution of L₁ is the structural outcome of the L₁ equation with A₀=a₀ plugged in. The g-formula uses the outcome model's fitted L₁|A₀,L₀ equation to generate L₁ under the intervention, then evaluates the Y model at those interventional L₁ values. Using observed L₁ would re-introduce the selection confounding. A is about missing data, not the causal issue. C misidentifies the role of positivity here. D is exactly backwards."
  },
  {
    q: "The MSM/IPTW estimator in the g-methods module creates stabilized weights SW = [P(A₀)·P(A₁|A₀)] / [P(A₀|L₀)·P(A₁|L₁,A₀,L₀)]. What is the purpose of the numerator term P(A₀)·P(A₁|A₀) in the stabilized weight?",
    choices: [
      "The numerator converts the weight from a risk-ratio scale to an odds-ratio scale.",
      "Without the numerator (i.e., using unstabilized weights 1/P(A₀|L₀)·P(A₁|L₁,A₀,L₀)), weights can become extreme and highly variable when treatment probabilities are near 0 or 1. The numerator bounds the weight distribution and reduces variance without introducing bias, because the numerator is a function of treatment alone (not covariates) and therefore does not re-introduce confounding.",
      "The numerator accounts for the time-ordering of treatments: P(A₀) is needed before P(A₁|A₀) can be computed.",
      "The numerator ensures the weighted sample has the same size as the original sample by normalizing total weight to n."
    ],
    answer: 1,
    explain: "Unstabilized IPTW weights (1/denominator) can range from near 0 to very large values when propensity scores are extreme, creating high variance in weighted estimators and sensitivity to model misspecification. Stabilized weights multiply by a numerator that is also a probability of treatment — but marginal (not conditional on covariates). Because the numerator does not involve L₀ or L₁, it does not re-open the backdoor paths that the denominator closed; it only rescales the weight magnitudes. Well-behaved stabilized weights have mean ≈ 1 (visible in the weight histogram in the module). A is false: the transformation is not odds-ratio vs. risk-ratio. C describes the temporal order, not the variance-reduction purpose. D is a property that holds approximately but is not the primary purpose."
  },
  {
    q: "In the g-methods module, cranking the feedback strength slider (A₀ → L₁ parameter γ_A) from 0 to maximum changes the behavior of the four estimators. Which outcome matches what the module demonstrates?",
    choices: [
      "All four estimators (naive, adjust-L1, g-formula, IPTW) stay close to the truth because sample size n is large enough to absorb any feedback bias.",
      "At maximum feedback: the naive estimator (no adjustment) is biased upward; adjust-L1 is biased in the opposite direction (often downward from truth); g-formula and MSM/IPTW both track the true ATE, confirming that only g-methods handle treatment-confounder feedback correctly.",
      "At maximum feedback: adjust-L1 is the most accurate because conditioning on L₁ removes the confounding of A₁; only the naive estimator fails.",
      "At maximum feedback: g-formula outperforms IPTW because IPTW requires extreme weights that cause numerical instability, while g-formula remains stable."
    ],
    answer: 1,
    explain: "This is the core empirical result of the module. At high feedback (γ_A ≈ 2): (1) Naive OLS ignores that L₁ is a confounder of A₁ → outcome estimate is confounded upward. (2) Adjust-L1 conditions on the feedback descendant, blocking part of A₀'s effect AND opening collider bias → estimate moves in the opposite direction from naive, often landing below the truth. (3) G-formula standardizes over the interventional L₁ distribution → tracks truth. (4) MSM/IPTW uses the sequential denominator weights to create a pseudo-population free of confounding → also tracks truth. The bias directions for naive vs. adj-L1 go in opposite directions, which is the signature of the collider-bias mechanism. A is false: feedback bias is systematic, not sampling noise. C is false: it is exactly the opposite. D may be partially true at extreme weights but the module shows both g-methods track truth under the DGP."
  }
];

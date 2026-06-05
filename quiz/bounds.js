export const questions = [
  {
    q: "Without any assumptions, the Manski (1990) no-assumption bounds on the ATE for a <em>binary</em> outcome Y ∈ {0, 1} always have width exactly 1. Why?",
    choices: [
      "The width is 1 because there is exactly one treated unit and one control unit.",
      "For a binary outcome, the unobserved potential outcome Y(1) for controls can range over the full [0, 1] interval, and similarly Y(0) for the treated. The worst-case lower and upper bounds are set by placing these unknowns at 0 and 1 respectively, and the resulting width is P(T=0) + P(T=1) = 1.",
      "The width equals 1 only in balanced designs; with unequal treatment proportions it can be larger.",
      "The width of 1 comes from the variance of a Bernoulli random variable, which is at most 0.25, scaled by 4."
    ],
    answer: 1,
    explain: "Manski's (1990) no-assumption bound for the ATE on a binary outcome: LB = E[Y|T=1]·P(T=1) − E[Y|T=0]·P(T=0) − P(T=1); UB = E[Y|T=1]·P(T=1) − E[Y|T=0]·P(T=0) + P(T=0). Width = UB − LB = P(T=1) + P(T=0) = 1, regardless of the treatment proportion or the observed means. The logic: the unobserved Y(1) for control units can be anything in [0,1], and Y(0) for treated units can be anything in [0,1]. Setting them at their extreme values (0 or 1) produces the worst-case spread. A is nonsense. C is the common misconception — the width is exactly 1 for any split because P(T=1)+P(T=0)=1 by definition. D conflates variance formulas with bound width."
  },
  {
    q: "In the NSW module, toggling on Monotone Treatment Response (MTR) tightens the lower bound to 0. Which of the following correctly explains the MTR assumption and why it has that effect?",
    choices: [
      "MTR assumes the treatment effect is the same for everyone (homogeneous treatment effects), which pins the ATE to the observed arm difference.",
      "MTR is the assumption that Y(1) ≥ Y(0) for every individual — job training never hurts anyone. Under this assumption, the ATE = E[Y(1) − Y(0)] ≥ 0 for every unit, so the ATE ≥ 0 overall, raising the no-assumption lower bound to max(LB_base, 0).",
      "MTR assumes that the treated group has higher potential outcomes under control than the control group, which restricts selection bias.",
      "MTR tightens the upper bound, not the lower bound, by capping the maximum possible effect."
    ],
    answer: 1,
    explain: "Monotone Treatment Response (Manski 1997) is the assumption that the treatment effect is non-negative for every individual: Y(1) ≥ Y(0) for all i. This is a substantive claim — in the NSW context, job training cannot reduce earnings. Under MTR, each individual's contribution to the ATE is ≥ 0, so the average E[Y(1)−Y(0)] ≥ 0. This strictly rules out negative ATE values, pushing the lower bound up to at least 0. A describes homogeneous treatment effects, a much stronger assumption. C describes Monotone Treatment Selection (MTS), a different assumption. D is backward — MTR tightens the lower bound."
  },
  {
    q: "The Monotone Treatment Selection (MTS) assumption states that E[Y(t) | T=1] ≥ E[Y(t) | T=0] for t ∈ {0, 1}. In the NSW dataset (an RCT), what is the consequence of applying MTS, and which statements are correct? (Select all that apply.)",
    choices: [
      "Under MTS, the upper bound on the ATE tightens to E[Y|T=1] − E[Y|T=0], the naive observed difference.",
      "In the NSW RCT, E[Y|T=1] − E[Y|T=0] equals the true ATE because randomization eliminates selection bias — so MTS collapses the upper bound to the true ATE.",
      "MTS tightens the lower bound to 0, the same as MTR.",
      "MTS says those who chose to participate have weakly higher potential outcomes regardless of treatment status — it bounds unobserved counterfactuals by the observed arm means."
    ],
    answer: [0, 1, 3],
    explain: "A is correct: the MTS derivation yields UB_MTS = E[Y|T=1] − E[Y|T=0] (the observed difference), because MTS constrains unobserved Y(1) for controls to be ≤ E[Y|T=1] and unobserved Y(0) for treated to be ≥ E[Y|T=0]. B is correct and is the key NSW insight: because NSW is a randomized experiment, there is no selection bias, so the observed arm difference IS the true ATE — MTS collapses the upper bound directly to the causal truth. D is correct: MTS formalizes the intuition that self-selection into treatment is not random — participants tend to have higher potential outcomes. C is false: MTS tightens the upper bound, not the lower bound (that is MTR's role). The lower bound under MTS equals 0, but this comes from E[Y(1)] − E[Y(0)] ≥ 0 only when combined with other constraints."
  },
  {
    q: "A researcher says: 'Partial identification is useless — if the bounds include zero, you cannot even sign the effect, so the analysis tells you nothing actionable.' What is the best rebuttal?",
    choices: [
      "The researcher is correct; bounds that include zero have no policy value.",
      "Even wide bounds provide valuable information: they tell you the exact range of uncertainty consistent with the data, rule out effects outside the bounds, and show precisely which additional assumptions are needed to sign or sharpen the effect. Bounds that still contain zero tell you that the sign question requires a substantive assumption — which is itself an important, honest finding.",
      "Partial identification is only useful when the dataset is very small; with large datasets full identification is always achievable.",
      "The researcher would be correct if Manski bounds were tight, but in practice they are too conservative to be informative."
    ],
    answer: 1,
    explain: "Manski's partial identification program (1990, 1997) is explicitly designed to map assumptions to conclusions: you know exactly what assumptions would tighten the interval and what assumptions would collapse it to a point. Bounds that include zero tell you: 'with only these assumptions, the data cannot rule out a zero or negative effect — you need one more credible assumption to establish the sign.' This is scientifically honest and actionable (Manski 1995). A ignores the informational content of ruling out effects outside the bounds. C repeats the myth that large samples solve all identification problems. D mischaracterizes Manski bounds — they are sharp (attained by some distribution) given the stated assumptions, not conservative."
  },
  {
    q: "In the NSW module, the true RCT ATE is displayed as a gold dot that always lies inside the animated interval. The module shows it as ≈ +0.12 on the binary employment outcome Y = 1{re78 > 0}. When you toggle on both MTR and MTS simultaneously, the interval collapses to [LB_BOTH, UB_BOTH]. What do you expect to happen, and why does the gold dot always stay inside every interval?",
    choices: [
      "The bounds could exclude the true ATE if the MTR or MTS assumption is violated in the NSW data.",
      "Under both MTR and MTS, the lower bound rises to max(LB_base, 0) and the upper bound tightens to the observed difference (= true ATE in this RCT), so the interval is approximately [0, TRUE_ATE]. The gold dot is always inside because valid bounds — derived from assumptions that hold in the data-generating process — must contain the true ATE by construction. A bound that excluded the truth would falsify the assumption used to derive it.",
      "The gold dot moves outside the interval when both assumptions are toggled on, demonstrating the power of partial identification.",
      "The true ATE is inside the bounds only by coincidence; in other datasets with the same assumptions the ATE could fall outside."
    ],
    answer: 1,
    explain: "With MTR (training never hurts → ATE ≥ 0) and MTS (treated have weakly higher potential outcomes → UB tightens to E[Y|T=1]−E[Y|T=0] = TRUE_ATE in this RCT), the combined interval is [0, TRUE_ATE], which is tight and still contains the true ATE. The gold dot staying inside every interval is not an accident — it is the logical guarantee of partial identification. A valid bound derived from assumptions that hold in the population must contain the true parameter; if it did not, the assumptions would be falsified. This is why bounds are called 'outer identified sets.' C is false — the module demonstrates the opposite. D confuses the guarantee with coincidence; the containment is provable, not empirical."
  }
];

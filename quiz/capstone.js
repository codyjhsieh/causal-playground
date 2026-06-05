export const questions = [
  {
    q: "Match each research problem to its identification strategy. A researcher has: (i) a randomized lottery assigning NSW job-training slots; (ii) Card's cross-section with an ability confounder but college-proximity data; (iii) a sharp 50%-vote rule determining incumbency; (iv) NJ and PA fast-food surveys before and after NJ's wage hike; (v) annual state-level cigarette sales for one treated state and 38 donors across 30 years. Which row correctly pairs every problem with its method?",
    choices: [
      "(i) DiD, (ii) IV, (iii) RDD, (iv) RCT, (v) Synth. Control",
      "(i) RCT/Adjust, (ii) IV, (iii) RDD, (iv) DiD, (v) Synth. Control",
      "(i) RCT/Adjust, (ii) RDD, (iii) IV, (iv) DiD, (v) Synth. Control",
      "(i) IV, (ii) RCT/Adjust, (iii) RDD, (iv) Synth. Control, (v) DiD"
    ],
    answer: 1,
    explain: "<strong>Choice B is correct.</strong> (i) NSW uses a lottery — treatment is randomized, so a simple difference-in-means is valid (RCT/Adjust). (ii) Card cannot randomize schooling and ability is unobserved; college proximity (nearc4) is a valid instrument — relevant (shifts schooling) and plausibly excludable — so IV is the right tool. (iii) Lee's incumbency study has a sharp 50% vote-share cutoff; near the threshold, winning vs. losing is as-good-as-random — this is the definition of RDD. (iv) Card–Krueger have two states × two time periods: the canonical DiD design with NJ as treated and PA as control. (v) Abadie et al. have a single treated state and 30 years of pre-treatment data across 38 donors — exactly the setting for synthetic control. The other rows scramble the pairings."
  },
  {
    q: "For each identification strategy, there is one <em>core assumption</em> that must hold for the estimate to be causal. Which of the following pairings are <strong>correct</strong>? (Select ALL that apply.)",
    choices: [
      "IV (Card 1995) — <em>Exclusion restriction</em>: college proximity (nearc4) affects log wages <em>only</em> through its effect on years of schooling, not through any direct channel.",
      "RDD (Lee 2008) — <em>Continuity</em>: potential vote outcomes vary smoothly through the 50% threshold; only incumbency status jumps discontinuously at the cutoff.",
      "DiD (Card–Krueger 1994) — <em>Stable unit treatment value (SUTVA)</em>: NJ fast-food restaurants do not affect each other's employment, so there are no spillovers across the state border.",
      "Synthetic Control (Prop 99) — <em>Pre-treatment fit</em>: the weighted donor blend matches California's cigarette-sales trajectory before 1989; post-1989 divergence is attributed to Prop 99."
    ],
    answer: [0, 1, 3],
    explain: "<strong>Choices A, B, and D are correct.</strong> A: The exclusion restriction is the central, untestable assumption in Card's IV — nearc4 must shift wages exclusively via the schooling channel. B: Continuity (smoothness) of potential outcomes through the vote-share cutoff is the identifying assumption in RDD; without it, any discontinuity could reflect non-treatment forces. D: Pre-treatment parallel fit is the synthetic-control analogue — the closer the pre-1989 match, the more credible the post-1989 gap is causal. C is <em>wrong</em>: the core DiD assumption is <strong>parallel trends</strong> (NJ and PA employment would have moved together absent the wage hike), not SUTVA. SUTVA is a general causal-inference assumption relevant everywhere, not the specific identifying assumption for DiD."
  },
  {
    q: "A policy analyst says: &ldquo;The NSW experiment showed a +$1 794 training effect, but when I use CPS non-participants as the comparison group I get −$8 000. The CPS sample is 50× larger, so the CPS estimate must be more reliable.&rdquo; What is the fundamental error in this reasoning?",
    choices: [
      "The analyst is correct — larger samples always dominate smaller ones on statistical grounds, so the CPS estimate should be preferred.",
      "CPS non-participants are not comparable to NSW participants on unobserved characteristics (prior earnings, motivation, employment history). The −$8 000 figure is <em>selection bias</em>, not a causal effect. Sample size cannot fix a failure of identification.",
      "The analyst should use IV rather than OLS to correct the CPS estimate; once instrumented, the two estimates will converge.",
      "Both estimates are equally valid because earnings data is self-reported in both datasets, so the measurement error dominates any selection concern."
    ],
    answer: 1,
    explain: "<strong>Choice B is correct.</strong> LaLonde (1986) is the canonical demonstration that non-experimental comparison groups — even large ones — fail to replicate experimental benchmarks when selection into treatment is non-random. CPS workers never applied to NSW; they have very different pre-treatment earnings trajectories, making them an invalid control group. A larger biased sample is still biased (A is wrong). IV would help if there were a valid instrument for training participation, but the question describes using CPS directly — no instrument is available here (C is wrong). Measurement error is a separate issue and does not rescue a selection-biased comparison (D is wrong)."
  },
  {
    q: "Consider three hypothetical scenarios. For each one, identify whether the researcher's chosen method is <strong>valid</strong> or <strong>invalid</strong>, and why. Which answer correctly evaluates all three? <br><br><em>Scenario 1:</em> A researcher uses DiD to estimate the effect of California's Prop 99 on smoking, using 38 other states as controls, with data from 1970–2000. <br><em>Scenario 2:</em> A researcher uses RDD to estimate the return to schooling, defining treatment as 'completed 12 or more years of education' and using years of schooling as the running variable. <br><em>Scenario 3:</em> A researcher uses synthetic control with only 2 years of pre-treatment data across 5 donor states to estimate the effect of a new minimum-wage law.",
    choices: [
      "Scenario 1 valid (parallel trends plausible with many donors), Scenario 2 valid (years of schooling is continuous), Scenario 3 valid (any pre-treatment data is sufficient).",
      "Scenario 1 questionable (simple DiD ignores heterogeneous state trends; synthetic control is strictly better), Scenario 2 invalid (students self-select their schooling level — the running variable is manipulable, violating RDD continuity), Scenario 3 invalid (pre-treatment fit with only 2 periods and 5 donors is unreliable; placebo tests have no power).",
      "Scenario 1 invalid (DiD requires exactly two groups), Scenario 2 valid (a binary threshold on a continuous variable always satisfies RDD assumptions), Scenario 3 valid (synthetic control only requires at least one donor state).",
      "All three scenarios are valid as long as the researcher clusters standard errors at the state level."
    ],
    answer: 1,
    explain: "<strong>Choice B is correct.</strong> Scenario 1: Simple DiD treats all 38 states as equally valid controls; synthetic control is better-suited here because it optimally weights donors to match California's pre-trend — the capstone module makes this point explicitly. Scenario 2: RDD requires that units cannot precisely sort across the cutoff (continuity / no manipulation). Students actively choose how many years of school to complete based on ability and family background — the running variable is <em>entirely self-selected</em>, so the no-manipulation assumption fails and the RDD estimate is not causal. Scenario 3: Synthetic control credibility rests on pre-treatment fit quality. With only 2 years and 5 donors, the donor blend can easily over-fit the pre-period by chance, and placebo permutation tests have almost no power to distinguish a real effect from noise."
  },
  {
    q: "The Card–Krueger DiD estimate of New Jersey's minimum-wage hike is approximately +2.76 FTE per store. A skeptic argues: &ldquo;This estimate is meaningless because it relies on a parallel-trends assumption that can never be verified.&rdquo; Which response is most defensible? (Select ALL that apply.)",
    choices: [
      "Parallel trends is untestable in the post-treatment period by definition — it is a counterfactual — but <em>pre-treatment trend equality</em> between NJ and PA can be examined as supporting evidence. Card and Krueger report similar pre-1992 employment trajectories.",
      "The skeptic is wrong: parallel trends can be fully verified by running a regression of employment on state × time interactions and checking the F-statistic.",
      "Even if parallel trends is not perfectly satisfied, a falsification (placebo) test — applying the same DiD estimator to a period with no policy change — provides indirect evidence. If placebo DiD estimates cluster near zero, parallel trends is more credible.",
      "The unverifiability argument applies equally to IV exclusion, RDD continuity, and synthetic-control pre-fit — all causal methods rest on assumptions that cannot be proved from data alone. The relevant question is whether the assumption is <em>plausible</em> given the causal context."
    ],
    answer: [0, 2, 3],
    explain: "<strong>Choices A, C, and D are all correct.</strong> A: Although post-treatment parallel trends is counterfactual, pre-treatment trend equality is observable and provides the strongest available test. Card and Krueger document similar NJ and PA employment patterns before the 1992 hike. C: Placebo tests — applying the DiD to periods without a policy change — are the standard robustness check; near-zero placebo estimates increase confidence in the parallel-trends assumption. D: The skeptic's philosophical point is valid for every identification strategy in the capstone: IV exclusion, RDD continuity, and synthetic-control pre-fit are all ultimately untestable in their identifying dimension. The methodological question is never 'is this provably true?' but 'is this plausible, and do diagnostics support it?' B is wrong: a regression F-test on pre-treatment trends tests <em>pre-treatment</em> equality but cannot test the counterfactual parallel-trends assumption for the post-treatment period."
  },
];

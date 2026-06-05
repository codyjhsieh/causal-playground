export const questions = [
  {
    q: "Card & Krueger (1994) compared fast-food employment in New Jersey (minimum wage raised in April 1992) to Pennsylvania (no change). Intuitively, why is Pennsylvania needed at all? Why not just compare NJ's employment before and after the hike?",
    choices: [
      "Pennsylvania data is needed to satisfy the SUTVA assumption that treatment does not spill over state lines.",
      "Without a control group, a before-after comparison in NJ cannot separate the effect of the minimum-wage hike from any other trend that happened over the same period (e.g., macroeconomic recovery).",
      "The DiD formula requires exactly two groups; a single group produces a division-by-zero error.",
      "Pennsylvania acts as a synthetic control constructed by matching on pre-period employment levels."
    ],
    answer: 1,
    explain: "A naive before-after comparison in NJ conflates the policy with any concurrent time trend — for example, a general economic upturn could raise employment everywhere, and naively crediting it to the wage hike would be wrong. By including PA (a neighboring state with similar fast-food markets but no policy change), DiD differences out whatever common time trend both states experience. PA is a simple difference control group, not a synthetic control."
  },
  {
    q: "The DiD formula is <strong>DiD = (NJ<sub>after</sub> − NJ<sub>before</sub>) − (PA<sub>after</sub> − PA<sub>before</sub>)</strong>. Using the Card &amp; Krueger (1994) numbers in the playground (NJ: 20.44 → 21.03; PA: 23.33 → 21.17), what is the DiD estimate?",
    choices: [
      "−2.76 FTE per store (employment fell after the wage hike in NJ).",
      "+0.59 FTE per store (NJ's raw change, ignoring Pennsylvania).",
      "+2.76 FTE per store (NJ's change minus PA's change).",
      "−1.57 FTE per store (the simple NJ–PA employment gap after the hike)."
    ],
    answer: 2,
    explain: "NJ change = 21.03 − 20.44 = +0.59. PA change = 21.17 − 23.33 = −2.16. DiD = 0.59 − (−2.16) = <strong>+2.76 FTE per store</strong>. PA employment fell sharply (perhaps due to a broader regional economic dip), so once you subtract PA's negative trend, NJ's <em>relative</em> performance is substantially positive. This is exactly the Card &amp; Krueger finding: the minimum-wage increase did <em>not</em> reduce employment."
  },
  {
    q: "The identifying assumption of DiD is <strong>parallel trends</strong>. Which of the following most precisely states this assumption and explains why it is untestable from post-treatment data alone?",
    choices: [
      "NJ and PA must have identical employment levels before the treatment; any pre-period difference invalidates the design.",
      "In the absence of the minimum-wage hike, NJ employment would have changed by the same amount as PA employment over the same period. This is untestable because the counterfactual NJ trend is never observed.",
      "The treatment must be randomly assigned across states; New Jersey was randomly selected from all U.S. states.",
      "The pre-treatment trend must be zero for both states (constant employment levels before the policy)."
    ],
    answer: 1,
    explain: "Parallel trends requires that <em>absent treatment</em>, the treated group's trajectory would have matched the control group's — not that they start at the same level, and not that either trend is flat. The key word is <em>absent treatment</em>: NJ's counterfactual trend is a potential outcome that never existed and cannot be directly observed. We can check that pre-treatment trends were parallel (a falsifiability test), but post-treatment the counterfactual NJ path is permanently unobserved — so the assumption cannot be verified from the post-period data alone."
  },
  {
    q: "A researcher argues: 'The Card &amp; Krueger result must be wrong — basic supply-and-demand theory predicts that a binding minimum wage <em>reduces</em> employment. The DiD result is probably an artifact of the parallel-trends assumption.' Select ALL responses that correctly identify weaknesses in this argument.",
    choices: [
      "The criticism is valid: the competitive labor-market model is a law of economics, so empirical results contradicting it must involve a statistical error.",
      "Labor markets may be monopsonistic, in which case a minimum wage can <em>raise</em> employment — the simple competitive model is not the only relevant theory.",
      "Parallel trends is an assumption, not a fact; if NJ had a pre-existing positive employment trend unrelated to the wage hike, DiD could overstate the causal effect.",
      "The drag-the-slider feature in the playground shows that the DiD estimate is highly sensitive to the assumed control trend, which is an empirical, not merely theoretical, concern."
    ],
    answer: [1, 2, 3],
    explain: "<strong>B, C, and D are all correct.</strong> B: monopsony or efficiency-wage models can produce a positive employment response to a wage floor — alternative models are not ruled out by theory alone. C: if NJ had an independent upward employment trend (toggle 'Violate parallel trends' in the playground), DiD overstates the causal effect; this is a genuine threat to validity. D: the slider demonstration makes the point viscerally — the estimate is entirely contingent on the parallel-trends bet. A is wrong: empirical economics regularly finds results inconsistent with simple competitive models; this reveals model misspecification, not statistical error."
  },
  {
    q: "In the Card &amp; Krueger (1994) analysis visible in the playground, what was the direction and approximate magnitude of Pennsylvania's employment change between February 1992 and November 1992?",
    choices: [
      "PA employment rose by about +0.59 FTE per store, matching NJ's trajectory.",
      "PA employment was essentially flat (< 0.1 FTE change).",
      "PA employment fell by approximately −2.16 FTE per store.",
      "PA employment fell by more than −5 FTE per store, indicating a severe recession in Pennsylvania."
    ],
    answer: 2,
    explain: "From the playground data: PA before = 23.33, PA after = 21.17, giving a change of <strong>−2.16 FTE per store</strong>. This sharp decline in the control state is crucial: it means the macroeconomic environment over that period was unfavorable to fast-food employment generally. Once DiD removes this common negative trend, NJ's slight raw gain (+0.59) becomes a substantial relative gain of +2.76 — which is the real causal estimate attributable to the minimum-wage increase."
  },
];

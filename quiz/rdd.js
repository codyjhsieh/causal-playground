export const questions = [
  {
    q: "Intuitively, why does an RDD study of incumbency use a district's <em>prior</em> vote margin as the running variable rather than, say, incumbent party affiliation or fundraising totals?",
    choices: [
      "Fundraising totals perfectly predict incumbency status, so they are the ideal running variable.",
      "Near the cutoff (margin ≈ 0), whether a candidate just won or just lost the prior race is essentially random luck, making barely-winners and barely-losers comparable as-good-as-randomized groups.",
      "Vote margin in the prior race is fully controlled by the researcher, satisfying the exclusion restriction.",
      "The prior margin is the only variable collected in Lee (2008), so there was no alternative."
    ],
    answer: 1,
    explain: "RDD validity rests on the <strong>continuity assumption</strong>: near the cutoff, units cannot precisely control which side of the threshold they fall on, so assignment is locally as-good-as-random. A razor-thin electoral win vs. loss (margin ≈ 0) plausibly satisfies this — campaigns cannot guarantee they land exactly above zero. Fundraising or party affiliation do not straddle a cutoff in the same quasi-random way, so they cannot generate the same local-randomization argument."
  },
  {
    q: "In Lee (2008), the RD estimate is computed by fitting a local linear regression on each side of the cutoff and reading off the gap at x = 0. Which of the following correctly describes the identifying assumption required for this gap to be a causal effect? (Select ALL that apply.)",
    choices: [
      "The potential outcome functions E[Y(0)|X=x] and E[Y(1)|X=x] are continuous through x = 0.",
      "Units with running variable exactly at the cutoff are randomly assigned to treatment.",
      "The density of the running variable is also continuous at x = 0 (no heaping/manipulation at the threshold).",
      "There are no other variables that jump discontinuously at x = 0 besides incumbency status."
    ],
    answer: [0, 2, 3],
    explain: "<strong>Choices A, C, and D are all correct.</strong> A (continuity of potential outcomes) is the core assumption: absent incumbency, vote share would vary smoothly through zero. C (no density discontinuity / McCrary test) guards against strategic sorting — if campaigns could exactly hit the cutoff, the local-randomization logic breaks. D rules out compound treatments: if something else also jumps at the same threshold, the gap would not identify incumbency alone. Choice B is incorrect: exact-cutoff units do <em>not</em> need special random assignment; the identification comes from the limit from each side."
  },
  {
    q: "In the playground visualization, narrowing the bandwidth <em>h</em> below 0.10 typically keeps the RD estimate positive but widens confidence intervals. Which statement best explains this pattern?",
    choices: [
      "A smaller bandwidth increases the number of in-window observations, reducing variance.",
      "A smaller bandwidth focuses on units closer to the cutoff (less bias from nonlinearity) but sacrifices sample size, increasing variance — the canonical bias–variance tradeoff of RDD.",
      "A smaller bandwidth always produces a more biased estimate because far-from-cutoff observations are discarded.",
      "Bandwidth choice has no effect on the RD estimate if a linear fit is used."
    ],
    answer: 1,
    explain: "A local linear fit on a narrow window uses only data very close to the threshold, where the true conditional-expectation function is nearly linear, so <em>bias</em> from curvature is small. However, fewer observations means higher <em>variance</em>. Widening the bandwidth brings in more data (lower variance) at the risk of imposing a linear approximation far from the cutoff where the true function may curve (higher bias). This tradeoff is why optimal bandwidth selection (e.g., Imbens–Kalyanaraman) minimises MSE rather than just one component."
  },
  {
    q: "A critic argues: 'RDD only recovers a Local Average Treatment Effect, not the ATE, so its external validity is limited.' What does 'local' refer to here, and is this a genuine limitation?",
    choices: [
      "'Local' means the effect applies only to the geographic region studied; Lee (2008) can only speak to U.S. House districts.",
      "'Local' means the effect is estimated only for units near the cutoff (barely-winners and barely-losers). This is a real but often <em>desired</em> feature: near the threshold is precisely where policy-makers choose winners and losers.",
      "'Local' is a misnomer introduced by critics; the RDD actually estimates the ATE for all observations in the dataset.",
      "'Local' refers to the use of local linear rather than global polynomial regression — it is purely a technical modeling choice with no substantive implications."
    ],
    answer: 1,
    explain: "In RDD, 'local' refers to the subpopulation of <em>marginal units near the cutoff</em>. For incumbency, those are candidates who barely won or barely lost. This LATE is indeed different from the ATE for all candidates. However, this is not necessarily a flaw: the policy-relevant question — what does winning by a hair do to your future prospects? — is exactly what LATE answers. The critic is right that it limits generalization to inframarginal units, but misunderstands that RDD is often <em>designed</em> to estimate effects at the policy-relevant margin."
  },
  {
    q: "Using the U.S. House elections data in Lee (2008), with bandwidth h ≈ 0.15, the local linear RD estimate displayed in the playground is approximately:",
    choices: [
      "Negative (−5 to −10 pp), indicating that incumbency <em>hurts</em> a party's future vote share.",
      "Approximately zero (< 1 pp in absolute value), consistent with no incumbency advantage.",
      "Positive (roughly +7 to +10 pp), indicating incumbency significantly boosts the party's next-election vote share.",
      "Positive but less than 1 pp, indistinguishable from zero."
    ],
    answer: 2,
    explain: "The Lee (2008) incumbency-advantage estimate using local linear regression near the cutoff is consistently <strong>positive and large</strong> — roughly +7–10 percentage points — meaning a party that barely wins a U.S. House seat can expect to do substantially better in the next election than one that barely lost. This is the canonical finding: incumbency confers a sizable electoral advantage. A negative or near-zero estimate would contradict both the paper's result and the scatter plot's visible upward jump at the cutoff."
  },
];

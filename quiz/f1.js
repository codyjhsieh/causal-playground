export const questions = [
  {
    q: "Starting on pole position correlates strongly with winning — " +
       "corr(grid,&nbsp;finish)&nbsp;&asymp;&nbsp;0.66 across 2023–25 F1 seasons. " +
       "What is the most accurate causal explanation for this large positive correlation?",
    choices: [
      "Starting from pole <em>directly causes</em> winning: the driver at the front avoids " +
        "first-lap incidents, controls the pace, and never has to overtake anyone. " +
        "Track position is the entire story.",
      "The <strong>constructor (car)</strong> is a common cause of both: a fast car qualifies " +
        "near the front (corr(grid,&nbsp;car-strength)&nbsp;&asymp;&nbsp;0.63) <em>and</em> " +
        "finishes near the front, opening a backdoor path " +
        "Grid&nbsp;&larr;&nbsp;Car&nbsp;&rarr;&nbsp;Finish that inflates the raw correlation. " +
        "The car confounds both variables simultaneously.",
      "The correlation is entirely spurious — pole position has no causal relevance to the " +
        "outcome because modern F1 races are decided by pit-stop strategy, not starting order.",
      "Correlation between grid and finish reflects that talented drivers qualify well <em>and</em> " +
        "race well; driver skill is the sole common cause and the car plays no structural role.",
    ],
    answer: 1,
    explain:
      "Choice B is correct. The constructor is a <strong>confounder</strong>: it causes both " +
      "grid position (fast cars qualify well) and finishing position (fast cars race well), " +
      "opening a non-causal backdoor path. Controlling for the car reduces the association from " +
      "0.66 to a <em>partial</em> r&nbsp;&asymp;&nbsp;0.43 — showing that grid does retain a real " +
      "direct effect (track position, limited overtaking), but much of the raw signal was spurious. " +
      "Choice A is partly true — grid has a real direct effect — but overstates it by ignoring " +
      "the car confounder. Choice C is wrong: 0.66 is a large and real correlation, and track " +
      "position clearly matters at many circuits. Choice D also ignores the car: " +
      "driver skill contributes, but so does the constructor — the VER vs PER Red Bull comparison " +
      "shows the two effects are separable.",
  },
  {
    q: "We define <em>car strength</em> for each (constructor,&nbsp;season) pair as " +
       "the average finishing position of that team in that season. " +
       "Regressing finish on car strength and examining the residuals, " +
       "we find partial&nbsp;corr(grid,&nbsp;finish&nbsp;|&nbsp;car-strength)&nbsp;&asymp;&nbsp;0.43, " +
       "down from the raw 0.66. " +
       "Select ALL statements that correctly interpret this result.",
    choices: [
      "The shrinkage from 0.66 to 0.43 means that roughly half the raw grid–finish association " +
        "was confounded by the car; the <strong>remaining 0.43</strong> represents grid's " +
        "<strong>direct effect</strong> on the result — track position makes overtaking harder " +
        "and is a genuine causal mechanism.",
      "Because the partial correlation is still positive and substantial (0.43), " +
        "starting further back <em>causally</em> hurts your finishing position even after " +
        "the car's quality is held equal — qualifying matters beyond just which car you drive.",
      "The partial correlation of 0.43 proves that the car explains <em>all</em> of the " +
        "grid–finish association; the residual 0.43 is noise with no causal meaning.",
      "Residualizing finish on car strength is equivalent to comparing drivers within the " +
        "same team across races, giving a within-car estimate of grid's direct effect on result.",
    ],
    answer: [0, 1],
    explain:
      "Choices A and B are correct. " +
      "The drop from 0.66 to 0.43 tells us that the car explains a substantial portion of " +
      "the raw correlation — the backdoor path Grid&nbsp;&larr;&nbsp;Car&nbsp;&rarr;&nbsp;Finish " +
      "was real and large. But 0.43 is not noise: it reflects grid's genuine direct causal " +
      "effect on result via track position, limited overtaking opportunities, and first-lap " +
      "attrition avoidance. Both causal mechanisms co-exist. " +
      "Choice C is wrong: a partial r of 0.43 is substantial and the shrinkage (not zeroing-out) " +
      "is consistent with partial, not complete, confounding. " +
      "Choice D mischaracterizes the regression: residualizing on the team-season average removes " +
      "cross-team variation, but it is <em>not</em> the same as a within-team comparison; " +
      "the within-team (teammate) design is panel 4 of this module.",
  },
  {
    q: "We want the cleanest possible estimate of <em>driver skill</em> independent of machinery. " +
       "The module compares (a) driver overperformance = average residual finishing position " +
       "after removing constructor strength, and (b) a teammate head-to-head. " +
       "Why is the teammate head-to-head considered the <strong>cleanest</strong> estimate?",
    choices: [
      "Teammates drive on the same day and in the same weather, so meteorological confounds " +
        "cancel out — no other design shares this feature.",
      "Teammates share <strong>the same car</strong> in every race: identical chassis, " +
        "engine, tyres, and setup. Every performance difference between them must therefore " +
        "be attributed to driver skill (or strategy/luck), not the car. " +
        "This is a <em>matched-pair natural experiment</em> — the car confound is " +
        "eliminated by design, not by statistical adjustment.",
      "Teammate comparisons are only valid when both drivers use the same tyres, " +
        "which only occurs in free practice sessions, not in the race itself.",
      "The teammate design is <em>weaker</em> than the residual overperformance method " +
        "because it uses fewer observations and is therefore noisier.",
    ],
    answer: 1,
    explain:
      "Choice B is correct. Sharing the same car eliminates the <strong>main confounder</strong> " +
      "in F1 driver comparisons: the car. Unlike the residual overperformance method — which " +
      "controls for constructor strength <em>statistically</em>, still leaving potential " +
      "measurement error (car strength is only proxied by avg finish) — the teammate comparison " +
      "controls for the car <em>by design</em>. This is a <em>matched-pair</em> or " +
      "<em>within-unit</em> design in causal inference. The canonical example is " +
      "VER&nbsp;vs&nbsp;PER in the same Red Bull: any difference in their results reflects " +
      "driver, not machinery. " +
      "Choice A is partly true (weather is shared) but this is not <em>why</em> it is the " +
      "cleanest estimate — weather applies to all drivers equally. " +
      "Choice C is false — tyre specifications are shared across teammates throughout a race weekend. " +
      "Choice D is wrong: precision and validity are different; fewer observations is a " +
      "statistical cost, but the internal validity of the matched design is higher.",
  },
  {
    q: "The circuit-level grid–finish correlation varies dramatically across the F1 calendar: " +
       "street circuits like Monaco show very high corr(grid,&nbsp;finish), " +
       "while power circuits like Monza or Spa show lower values. " +
       "What is the correct causal and betting interpretation of this heterogeneity?",
    choices: [
      "At high-correlation circuits, grid position is <strong>more causally determinative</strong> " +
        "of the result: narrow streets and few overtaking opportunities make it nearly impossible " +
        "to gain places after the start. " +
        "For betting markets, this means <em>qualifying results carry more information</em> " +
        "at Monaco-style circuits — the qualifying market should be weighted more heavily.",
      "High correlation at street circuits proves that F1 races are fixed at those venues: " +
        "if starting order perfectly predicted finishing order, the race would have no causal " +
        "variance and would be pre-arranged.",
      "The heterogeneity is a statistical artifact caused by smaller sample sizes at " +
        "street circuits (fewer overtaking events) and is not causally meaningful.",
      "Circuit type only affects the <em>variance</em> of outcomes, not the causal effect of " +
        "grid position; every circuit should show the same causal effect after adjusting for variance.",
    ],
    answer: 0,
    explain:
      "Choice A is correct. The grid–finish correlation is a measure of how much track position " +
      "<em>causally constrains</em> the final order. Street circuits with narrow lanes, " +
      "few overtaking zones (Monaco has essentially one), and limited DRS effectiveness make " +
      "it physically hard to pass — so the starting order tends to be preserved. " +
      "This is genuine causal heterogeneity by circuit type. " +
      "For betting, this structural difference matters: at Monaco, qualifying performance " +
      "is a strong causal predictor, so the qualifying market <em>prices in</em> most of " +
      "the race result. At Monza, engine-dominated speed and long straights enable overtaking, " +
      "so other factors (tyre strategy, setup) introduce more variance. " +
      "Choice B confuses high correlation with determinism — 0.9 correlation still leaves " +
      "variance; it is not evidence of race-fixing. " +
      "Choice C is wrong: the pattern (Monaco high, Monza lower) is consistent across seasons " +
      "and matches known racing conditions. " +
      "Choice D is wrong: track layout is a genuine moderator of the grid–finish causal effect.",
  },
  {
    q: "A sports-betting analyst claims: &ldquo;The driver overperformance leaderboard shows " +
       "VER with a residual of &minus;3.3 and PER with &plus;2.7 in the same Red Bull. " +
       "I can bet systematically on VER beating PER and make guaranteed profit.&rdquo; " +
       "Which critiques of this reasoning are correct? Select ALL that apply.",
    choices: [
      "Betting markets also observe historical results and will already price in VER's " +
        "demonstrated dominance over PER. The overperformance signal is <em>publicly known</em>, " +
        "so the market odds likely already reflect it — capturing the edge requires " +
        "identifying mispricings, not just confirming a known pattern.",
      "The overperformance metric controls for constructor quality via a statistical proxy " +
        "(average team finish), which may be an imperfect measure. Residual confounding " +
        "from mid-season car upgrades, driver-specific setups, or strategy decisions " +
        "could inflate or deflate the estimated gap.",
      "Because VER&rsquo;s partial correlation is 0.43, any bet on VER wins with 43% probability, " +
        "which is below the break-even threshold for most markets — so the edge is negative.",
      "The 3-season historical pattern is backward-looking: personnel changes " +
        "(PER left Red Bull after 2024), team dynamics, and car evolution mean the " +
        "estimate may not generalize to future races, especially across different " +
        "seasons or team compositions.",
    ],
    answer: [0, 1, 3],
    explain:
      "Choices A, B, and D are correct critiques. " +
      "Choice A: efficient betting markets incorporate publicly observable data. " +
      "A well-known and consistent advantage for VER over PER is already in market prices; " +
      "profiting requires finding odds that <em>systematically underweight</em> this, " +
      "which is harder than simply knowing the direction. " +
      "Choice B: the residual overperformance method removes a <em>proxy</em> for car quality, " +
      "not the car quality itself. Mid-season upgrades that benefit one driver, " +
      "setup preferences, or differing strategic calls can all contaminate the residual. " +
      "Choice D: historical driver comparisons become stale when team compositions change. " +
      "PER left Red Bull after 2024, making the 3-year VER vs PER estimate irrelevant for " +
      "future markets unless they are at the same team again. " +
      "Choice C is wrong: the partial correlation of 0.43 refers to the population-level " +
      "grid–finish relationship, not to the probability of any individual driver winning " +
      "a single bet — these are completely different quantities.",
  },
];

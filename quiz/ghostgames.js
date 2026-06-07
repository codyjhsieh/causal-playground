export const questions = [
  {
    q: "The ghost-games dataset shows home points per game going <strong>1.601 (2018–19, crowd) → 1.567 (2019–20, split) → 1.451 (2020–21, empty) → 1.542 (2021–22, crowd back)</strong>. Why does this on→off→on <em>reversal</em> provide stronger evidence than a simple before-vs-after comparison would?",
    choices: [
      "Because a single before-vs-after comparison is statistically invalid without a control group, so no causal conclusion can ever be drawn from it.",
      "The reversal pattern — advantage dips when the crowd is removed, then recovers when the crowd returns — matches the crowd-on/off switching twice. A single one-time confound (e.g., COVID schedule changes) would need to track those same two reversals to explain away the pattern, which is far less plausible.",
      "Because using four seasons instead of two seasons automatically satisfies the parallel-trends assumption required for difference-in-differences.",
      "Because the reversal proves that home advantage is caused exclusively by the crowd, ruling out all other possible mechanisms."
    ],
    answer: 1,
    explain: "A single before-vs-after test is vulnerable to any confound that happened to coincide with the treatment. The <strong>on→off→on pattern</strong> demands that a confound track two separate reversals; a one-shot shock like COVID schedule compression is present in both 2020–21 <em>and</em> 2021–22, so it cannot explain why 2021–22 rebounded. This symmetry is the core identification insight. Option A overstates the case — before-vs-after estimates can still be informative — and Option D overclaims: the reversal is consistent with crowd causation but does not rule out every alternative mechanism."
  },
  {
    q: "Which of the following are genuine confounds that limit a clean causal interpretation of the empty-stadium period (2020–21)? Select <strong>all</strong> that apply.",
    choices: [
      "COVID-19 forced fixture congestion and summer scheduling, meaning away teams faced shorter travel windows — possibly reducing their usual fatigue disadvantage.",
      "Referees in 2020–21 may have watched more video replays of previous seasons where crowds were present, biasing their decisions toward historical norms.",
      "Reduced crowd noise may have lowered home players&rsquo; adrenaline and altered their risk-taking behavior, providing an alternative mechanism that is not &ldquo;referee bias&rdquo; per se.",
      "Betting markets for the 2020–21 season adjusted odds assuming empty stadiums, which could have influenced team selection and therefore match outcomes."
    ],
    answer: [0, 2],
    explain: "<strong>A and C are genuine confounds or alternative mechanisms.</strong> A: fixture congestion, summer heat play, and compressed travel schedules are real COVID-era changes that could reduce away-team disadvantage through fatigue channels independently of crowd presence. C: even if we accept that the crowd causes home advantage, <em>player psychology</em> (adrenaline, risk appetite) is a second mechanism running in parallel with referee pressure — the module&rsquo;s evidence highlights referee cards, but player behavior likely contributes too. B is speculative and not documented. D: betting-market adjustments are real but affect team strategy indirectly at best and are not a primary confound for match-level outcomes in this design."
  },
  {
    q: "The referee card-bias measure is defined as <strong>(away yellow + 2&times;away red) &minus; (home yellow + 2&times;home red)</strong>. In the ghost-games data, this bias is <strong>+0.315 when crowds are present</strong> and <strong>+0.046 when stadiums are empty</strong>. What does this pattern reveal about the <em>mechanism</em> of home advantage?",
    choices: [
      "It proves that home advantage is entirely caused by referee bias, because the referee bias disappears at exactly the same time as the crowd.",
      "It is consistent with home advantage operating <em>partly through</em> social pressure on referees: when the crowd that creates that pressure is removed, referees&rsquo; pro-home card asymmetry largely vanishes, suggesting the crowd influenced officiating decisions.",
      "It shows that referees consciously cheat for the home team only when fans are watching, which is a form of intentional corruption.",
      "Because the card-bias drop mirrors the crowd removal, we can conclude via the front-door criterion that 100% of home advantage flows through referee decisions."
    ],
    answer: 1,
    explain: "The collapse of referee card bias in empty stadiums is <em>consistent with</em> social pressure on officials being a mechanism — but it does not prove it is the <em>only</em> mechanism, and it does not establish intentional corruption (B and D overclaim). The front-door criterion requires that <em>all</em> of the treatment&rsquo;s effect on the outcome passes through the measured mediator, which is not demonstrated here. Option B is careful: the word &ldquo;partly&rdquo; accurately reflects that player psychology and crowd-driven home-player motivation are also plausible channels. The pattern is strongly consistent with a referee-pressure mechanism while remaining honest about alternative paths."
  },
  {
    q: "The module computes the crowd effect on home PPG <em>separately</em> for England, Germany, Spain, Italy, and France. Why does this heterogeneity analysis matter for the credibility of the natural experiment?",
    choices: [
      "It confirms that the parallel-trends assumption holds in all five countries, which is required for the identification strategy to be valid.",
      "If the home-advantage drop during empty stadiums appeared in all five leagues, it is much harder to attribute the pattern to a single country-specific confound such as a national lockdown policy that affected scheduling only in one league.",
      "It provides five independent replications of the experiment, and averaging across them yields the &ldquo;true&rdquo; average treatment effect free of any confounding.",
      "Heterogeneity analysis is only relevant when the leagues have different referee cultures; because UEFA harmonizes rules, the league-level estimates should be identical."
    ],
    answer: 1,
    explain: "Observing the crowd effect across five distinct leagues with different competitive structures, referee pools, and national public-health responses is a <strong>robustness and generalizability check</strong>. If a confound were responsible — e.g., fixture congestion — it would need to operate similarly in all five countries simultaneously. That is possible (COVID affected all of Europe), but the cross-league consistency strengthens confidence that crowd removal itself is the driver rather than a single national idiosyncrasy. Option A is incorrect: parallel trends is a DiD concept and is not directly assessed by a cross-league comparison. Option C overstates: five non-randomized league-level estimates are not independent replications in the experimental sense. Option D is wrong: referee cultures and home-crowd dynamics do vary across leagues, making heterogeneity genuinely informative."
  },
  {
    q: "A careful analyst writes: &ldquo;The ghost-games data show a compelling on→off→on pattern and a striking referee-bias collapse, but this remains a quasi-experiment rather than a randomized trial.&rdquo; Which honest statement best characterizes the limits of what can be concluded?",
    choices: [
      "Because the study is not randomized, absolutely no causal claim is warranted — the data can only establish correlation.",
      "The on→off→on reversal and referee-mechanism evidence together support a <em>credible causal</em> claim that crowd presence raises home advantage partly through referee pressure; the main residual threat is COVID-era schedule disruptions and player-fatigue confounds, which are present in all five leagues and could attenuate — but not fully reverse — the estimated effect.",
      "The natural experiment is as good as a randomized controlled trial because COVID randomly assigned the crowd-off condition to exactly one season across all leagues simultaneously.",
      "The analysis is invalid because home advantage could be caused by team selection: managers pick different squads for home games, and this changes regardless of crowd presence."
    ],
    answer: 1,
    explain: "Option B strikes the right epistemic balance. The design has genuine strength: the treatment switches twice, the mechanism is visible in referee data, and the pattern replicates across five leagues. But <strong>COVID simultaneously changed many things</strong> besides crowd presence — schedule compression, travel restrictions, summer heat play — all of which could partially explain the away-team resurgence. A randomized trial would need, for example, randomly assigning which matches are played with and without fans within the same season and teams. That was not done here. Option A is too dismissive — well-designed natural experiments do support causal inference, just with more stated uncertainty. Option C is incorrect: COVID was not random; it affected an entire season, not individual matches, and confounds co-moved with it. Option D raises a valid alternative mechanism but one that is weak: team selection for home games follows tactical patterns largely independent of crowd presence."
  },
];

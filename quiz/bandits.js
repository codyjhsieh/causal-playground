export const questions = [
  {
    q: "In a multi-armed bandit problem, what is 'cumulative regret' and why is minimizing it the right objective?",
    choices: [
      "The total number of times a suboptimal arm was pulled; minimizing it means always pulling the best arm from round 1",
      "The sum over all rounds of (μ* − μ_{a_t}), where μ* is the best arm's mean; it measures the total reward lost to uncertainty and is the right objective because it accounts for both early exploration cost and late exploitation gains",
      "The variance of rewards across arms; lower variance arms should be preferred",
      "The number of rounds spent in the exploration phase before switching permanently to exploitation"
    ],
    answer: 1,
    explain: "Cumulative regret Σ_t (μ* − μ_{a_t}) is the total opportunity cost of not always playing the best arm. It elegantly unifies exploration and exploitation: pulling a suboptimal arm early to learn still adds regret, but may prevent larger regret later. Pure exploitation (choice A) or pure exploration (choice D) both lead to linear regret. Variance (choice C) is not the right criterion — a high-variance arm can still be optimal in expectation."
  },
  {
    q: "The causal bandit in this module uses inverse-probability weighting (IPW) to share information across arms. Which of the following correctly describe how this reduces regret? Select all that apply.",
    choices: [
      "An observational round — drawing from the natural incentive-assignment distribution — provides a reward signal for the arm that was actually selected, and IPW reweights that signal to inform all arms simultaneously",
      "IPW eliminates the need to ever pull suboptimal arms directly, guaranteeing zero regret from exploration",
      "Because the Thornton RCT propensities are known (empirical arm fractions from the real data), the IPW weights are correctly specified, so estimates are unbiased",
      "The causal bandit collapses the initial exploration phase by treating early observational rounds as proxy data for all K arms, reaching accurate arm estimates faster than blind UCB or Thompson"
    ],
    answer: [0, 2, 3],
    explain: "IPW works by noting that a reward observed under arm k with known propensity p_k carries the signal r/p_k toward estimating E[R|do(arm=k)]. An obs round drawn from the natural distribution hits arm k with probability p_k, so reweighting spreads one data point across all arms (choice A). The Thornton propensities are derived from the real sample fractions, making the weights correctly specified (choice C). This accelerates learning — the causal bandit's exploration phase is shorter (choice D). Choice B is false: IPW reduces but does not eliminate regret; some direct pulls are still needed."
  },
  {
    q: "UCB1 selects the arm with the highest upper confidence bound: μ̂_k + √(2 ln t / n_k). What is the role of the exploration bonus √(2 ln t / n_k)?",
    choices: [
      "It adds a fixed constant to each arm's estimate to ensure all arms are tried at least once",
      "It grows with total rounds t but shrinks as arm k is pulled more (n_k increases), automatically balancing exploration and exploitation without manual tuning of an ε parameter",
      "It computes the posterior variance of the arm's reward distribution under a Beta-Bernoulli model",
      "It corrects for the difference between the empirical mean and the true mean due to finite sample bias"
    ],
    answer: 1,
    explain: "The UCB1 bonus √(2 ln t / n_k) is the key Hoeffding-based concentration term: as total pulls t grow (more time has passed), the bonus increases to ensure under-pulled arms are occasionally re-explored. As n_k grows (arm k is pulled more), the bonus shrinks — the arm is well characterized and exploitation dominates. This gives UCB1 O(log T) regret with no ε to tune. Choice C describes Thompson Sampling's mechanism; D is a bias-correction term, not the UCB bonus."
  },
  {
    q: "A student claims: 'The causal bandit is just Thompson Sampling with better priors — it doesn't really use causal structure.' What is wrong with this claim?",
    choices: [
      "Nothing — the causal bandit is equivalent to Thompson Sampling when the Beta prior is correctly initialized",
      "Thompson Sampling updates each arm independently from direct pulls only; the causal bandit uses the causal graph (Incentive → Got) plus known propensities to reweight a single observation and update ALL arm estimates simultaneously via IPW — this is qualitatively different from updating a prior",
      "The causal bandit is worse than Thompson Sampling at high difficulty because propensity estimation is noisy",
      "Thompson Sampling is Bayesian while the causal bandit is frequentist, and this epistemological difference makes them incompatible"
    ],
    answer: 1,
    explain: "Thompson Sampling maintains independent Beta posteriors per arm and updates only the arm that was pulled. The causal bandit exploits the structural equation model Incentive → Got: because arm assignment follows a known distribution (the Thornton propensities), observing one (arm, reward) pair informs the reward distribution of all arms via do-calculus / IPW. This 'structural information sharing' — not a prior specification — is the defining causal feature that collapses exploration. Calling it 'better priors' ignores the mechanism entirely."
  },
  {
    q: "In the Thornton (AER 2008) Malawi HIV RCT, the four arms correspond to incentive levels (none, low, med, high) and rewards are empirical P(returned to learn HIV result). At full difficulty (arm separation = 1), the module consistently shows the causal bandit finishing with lower cumulative regret than UCB1 and Thompson Sampling. The most precise explanation is:",
    choices: [
      "The causal bandit cheats by using the true arm reward rates to seed its estimates before the simulation begins",
      "Higher incentive arms have higher true reward rates, creating a clear best arm; the causal bandit's IPW-based observational rounds give it accurate multi-arm estimates early, so it exploits the best arm sooner and accumulates less regret over T rounds",
      "Thompson Sampling is poorly calibrated for Bernoulli rewards and always underperforms UCB1 in this dataset",
      "The regret difference disappears at T = 2000 because all three policies converge to the optimal arm in the long run"
    ],
    answer: 1,
    explain: "The Thornton data shows a genuine dose-response: higher incentives strongly increase return rates (the best arm, 'high', has a materially higher true return rate than 'none'). The causal bandit's early observational rounds — reweighted via the real arm propensities — give it accurate estimates of all four arms without wasting as many direct pulls on suboptimal arms. This lead in arm identification translates directly into earlier exploitation of the best arm and lower cumulative regret. Choice A is false — the causal bandit uses IPW estimates, not oracle rates. Choice D is partially true but misses why the causal bandit's advantage is largest at intermediate T, which is the regret metric."
  }
];

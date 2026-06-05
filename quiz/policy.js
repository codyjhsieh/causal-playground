export const questions = [
  {
    q: "Intuitively, why does the optimal treatment rule π★(x) = 1{τ(x) > c} depend on the treatment cost c rather than simply treating everyone with τ(x) > 0?",
    choices: [
      "Treating everyone with τ(x) > 0 would violate ethical guidelines about over-treatment.",
      "When treatment has a per-unit cost c, the net benefit of treating unit i is τ(x) − c. Only units whose individual effect exceeds the cost generate positive net welfare; units with 0 < τ(x) < c produce a positive effect but negative net value after accounting for cost.",
      "The threshold τ(x) > 0 is numerically unstable in estimated CATE models, so c is added for regularization.",
      "Treating all τ(x) > 0 units is always suboptimal because it ignores heterogeneity."
    ],
    answer: 1,
    explain: "The welfare function V(π) = E[π(x)·μ₁ + (1−π(x))·μ₀] − c·E[π(x)] subtracts a cost for every treated unit. Maximizing V requires treating unit i only when the gain μ₁ᵢ−μ₀ᵢ > c. Units with 0 < τ < c would add a small positive effect but subtract more in cost, reducing total welfare. The policy module lets you drag cost c and watch how the treated fraction and policy value change together. A and C are misconceptions. D is partially true (ignoring cost does ignore the cost dimension of heterogeneity) but does not explain the threshold correctly."
  },
  {
    q: "The policy value function in the IHDP module is V(π) = mean_i[π(xᵢ)·μ₁ᵢ + (1−π(xᵢ))·μ₀ᵢ] − c·mean_i(π(xᵢ)). Which of the following are true statements about this value function? (Select all that apply.)",
    choices: [
      "It uses the true potential outcomes μ₀ and μ₁, which are known in IHDP's semi-synthetic setup but unobservable in real applications.",
      "V(treat-all) ≥ V(oracle π★) for all values of cost c ≥ 0.",
      "At c = 0, V(oracle π★) = V(treat-all) because the oracle maximizes welfare and with zero cost the optimal action is to treat everyone with positive effect.",
      "Regret = V(oracle π★) − V(learned π) is always ≥ 0, because the oracle uses the true ITEs while the learned policy uses an estimate."
    ],
    answer: [0, 3],
    explain: "A is correct: IHDP's semi-synthetic design (Hill 2011 / NPCI) makes μ₀ and μ₁ known, which is why the module can compute true policy value and regret — a luxury impossible in real data. D is correct: the oracle uses the true ITE to define the threshold, so it is by definition the welfare-maximizing policy; no learned policy can exceed it, making regret always ≥ 0. B is false: once cost c > 0, treating everyone has a growing cost penalty, so treat-all can fall below oracle and even below treat-none when c is large. C is partially correct in spirit (at c=0 treat-all and oracle agree if all ITEs are positive) but is not true in general — if some units have τ < 0, oracle would exclude them even at c=0."
  },
  {
    q: "In the policy module, the S-learner and T-learner are used to estimate τ̂(x), which then drives the threshold policy π̂(x) = 1{τ̂(x) > c}. Which learner is more likely to produce a learned policy close to the oracle when treatment cost is high (c large, few units treated)?",
    choices: [
      "S-learner, because its smooth flat τ̂(x) avoids overfitting and produces stable thresholding.",
      "T-learner, because at high cost only a small fraction of units are treated, requiring accurate heterogeneity estimates near the top of the CATE distribution; the T-learner's per-arm models capture this variation while the S-learner's over-regularization flattens the top tail.",
      "Both learners perform identically at high cost because the policy assigns treatment to the same handful of units.",
      "Neither learner can produce a near-oracle policy at high cost; only propensity-score matching works."
    ],
    answer: 1,
    explain: "At high cost c, only units with very high τ(x) should be treated. Accurately identifying these top-τ units requires a CATE model that preserves the shape of the heterogeneity distribution — especially its upper tail. The S-learner over-regularizes τ̂(x) toward a constant, so it cannot rank units by true effect magnitude. The T-learner, despite higher variance overall, tends to preserve the ordering better. C is wrong: different CATE shapes produce different policy rules even when treating few units. D is wrong: the module demonstrates that even imperfect T-learner estimates can deliver near-oracle policies."
  },
  {
    q: "A researcher observes that at treatment cost c = 0, V(treat-all) ≈ V(oracle π★) in the IHDP module. She concludes: 'When treatment is free, a targeted policy never beats treat-all.' Is this correct?",
    choices: [
      "Yes — at zero cost, treating everyone is always weakly optimal because every unit with positive effect is included and there is no cost to including units with negative effect.",
      "No — if some units have τ(x) < 0 (treatment is harmful for them), the oracle at c = 0 would withhold treatment from those units, producing higher welfare than treat-all. Whether treat-all ≈ oracle depends on whether negative-ITE units exist in the population.",
      "Yes — IHDP has no units with negative ITEs, so treat-all is optimal at c = 0 for this specific dataset.",
      "No — at c = 0, treat-none always dominates treat-all because treatment has hidden costs not captured by c."
    ],
    answer: 1,
    explain: "The oracle at c = 0 is π★(x) = 1{τ(x) > 0}: treat iff the effect is positive, withhold if the effect is negative. If the CATE distribution has a left tail with τ < 0 (some units harmed by treatment), oracle outperforms treat-all by avoiding those units — even at zero cost. IHDP's semi-synthetic outcomes include units with near-zero or slightly negative effects, so there is typically a small gap. A ignores negative-ITE units. C is factually uncertain (IHDP does include units with low-positive or near-zero ITEs, and some have μ₁−μ₀ < 0 under some simulation seeds). D is false: with c literally equal to 0, there is no hidden cost argument."
  },
  {
    q: "The IHDP policy module shows that regret = V(oracle) − V(learned) decreases as training progresses. After ~200 steps with cost c ≈ 2–4, the learned T-learner policy achieves regret < 0.15 and beats both treat-all and treat-none. What does this demonstrate about the relationship between CATE estimation accuracy (PEHE) and policy value?",
    choices: [
      "Low regret requires near-zero PEHE: you must recover each unit's true ITE precisely before the policy becomes useful.",
      "A coarse CATE estimator that correctly ranks units by effect size (even with large absolute errors) can produce a near-oracle policy, because the policy only needs to separate 'effect > c' from 'effect ≤ c', not predict exact ITE values.",
      "Policy value improves only after PEHE falls below 1.0, which occurs around step 200 in the module.",
      "The T-learner achieves low regret because it perfectly recovers the true CATE by step 200."
    ],
    answer: 1,
    explain: "Policy learning requires correct treatment assignment, not exact ITE prediction. The policy rule π(x) = 1{τ̂(x) > c} is a binary classifier: it must correctly classify units as above or below the cost threshold. A model can have high absolute errors in τ̂ yet still rank units in the right order (high effect → above threshold, low effect → below threshold), delivering near-oracle policy value. This is why regret can be small even when PEHE is still moderate. A is too strict: near-zero PEHE is sufficient but far from necessary for low regret. C invents a specific threshold on PEHE that has no basis in the module or theory. D is false: the T-learner still has non-trivial PEHE at step 200; it is the ranking, not the precision, that matters."
  }
];

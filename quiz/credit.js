export const questions = [
  {
    q: "In the REINFORCE policy-gradient estimator, the gradient estimate ĝ = R · ∇ log π(a|s) uses the full return R as a signal. Why does a large action-independent noise σ · U_luck dramatically inflate the variance of ĝ even though U_luck has nothing to do with which action was taken?",
    choices: [
      "Because U_luck changes which action the policy selects, making the policy stochastic",
      "Because ĝ = [R(s,a) + σ·U_luck] · ∇ log π(a|s), so the luck term multiplies the gradient score and adds variance σ² · Var(U_luck) · E[|∇ log π|²] directly",
      "Because REINFORCE averages over states s, and U_luck correlates with the state distribution",
      "Because σ · U_luck changes the reward mean, shifting the gradient estimator's center of mass"
    ],
    answer: 1,
    explain: "REINFORCE weights the gradient score ∇ log π by the full return. When R = R̄(s,a) + σ·U_luck, the estimator becomes [R̄(s,a) + σ·U_luck] · ∇ log π. Because U_luck is independent of a, its expectation contribution is σ·E[U_luck] · E[∇ log π] = 0 (unbiased) — but its variance contribution is σ²·Var(U_luck)·E[(∇ log π)²], which grows quadratically with σ. Choice D is wrong: U_luck has mean 0 so it does not shift the gradient mean. Choice C is wrong: U_luck is drawn fresh each rollout, independent of state."
  },
  {
    q: "A baseline b(s) subtracts a state-dependent constant from the return before computing the policy gradient: ĝ_baseline = (R − b(s)) · ∇ log π(a|s). Which of the following statements about baselines are correct? Select all that apply.",
    choices: [
      "Any b(s) that does not depend on the taken action a leaves E[ĝ_baseline] = E[ĝ_REINFORCE], so the estimator remains unbiased",
      "Setting b(s) = V(s) = E_{a~π}[R(s,a)] is variance-optimal among all linear-in-R baselines because it subtracts the average reward and leaves only the advantage A(s,a) = R − V(s)",
      "A baseline that depends on the taken action a will generally introduce bias into the gradient estimate",
      "The baseline b(s) = 0 is always the best choice because it avoids estimating V(s) from data"
    ],
    answer: [0, 1, 2],
    explain: "Choice A: the key identity is E_{a~π}[b(s) · ∇ log π(a|s)] = b(s) · E[∇ log π] = 0 whenever b does not depend on a, because ∇ log π sums to 0 under the policy. So any action-independent baseline preserves unbiasedness. Choice B: b(s) = V(s) minimizes variance among linear baselines because it makes the gradient proportional to the advantage A = R − V, which has zero mean and lower variance than R. Choice C: an action-dependent baseline breaks the zero-sum identity — the bias term b(a,s) · ∇ log π(a|s) does not cancel in expectation. Choice D is wrong: b=0 is REINFORCE with no variance reduction."
  },
  {
    q: "The counterfactual baseline b_CF = Σ_{a'} π(a'|s) · R(s,a'|U_luck) uses the SAME exogenous noise draw U_luck for all actions. Why does this cancel luck far more effectively than the value baseline b(s) = V(s)?",
    choices: [
      "Because the counterfactual baseline is computed from a larger dataset than the value baseline",
      "Because b_CF = V(s) + σ·U_luck — it shares the exact same luck term as R_factual = R̄(s,a) + σ·U_luck, so R_factual − b_CF = R̄(s,a) − V(s) with luck canceling algebraically, while V(s) = E[R̄] does not contain U_luck and cannot cancel it",
      "Because the counterfactual baseline only works when the policy is deterministic",
      "Because evaluating counterfactual actions requires knowing the true reward function, making the estimator biased in practice"
    ],
    answer: 1,
    explain: "This is Pearl's abduction principle applied to variance reduction. The value baseline V(s) = Σ_{a'} π(a'|s)·R̄(s,a') is a constant (no noise). It reduces variance by centering, but the luck draw U_luck still appears in R_factual − V(s) = R̄(s,a) − V(s) + σ·U_luck. The counterfactual baseline evaluates ALL actions under the identical U_luck, so b_CF = V(s) + σ·U_luck. When you compute R_factual − b_CF = [R̄(s,a) + σ·U_luck] − [V(s) + σ·U_luck] = A(s,a), luck cancels exactly. The module visualizes this: the CF histogram collapses to near-zero width while REINFORCE's histogram is wide, and both are centered on the true gradient."
  },
  {
    q: "A student argues: 'The counterfactual baseline must be biased — you're using rewards from actions that were never taken, which is fictional.' What is the correct rebuttal?",
    choices: [
      "The student is right; the counterfactual baseline introduces a small but nonzero bias that is acceptable for the variance reduction it provides",
      "The counterfactual returns R(s,a'|U_luck) are not used as standalone reward estimates — they only appear in the baseline b_CF, which is subtracted from the factual return. Because b_CF does not depend on the taken action a, the bias identity E[b_CF · ∇ log π] = 0 still holds, so the estimator is exactly unbiased",
      "The counterfactual returns are fictional only in model-free settings; in model-based settings the baseline is unbiased",
      "Bias is acceptable because the variance reduction is so large that mean-squared error still decreases"
    ],
    answer: 1,
    explain: "Unbiasedness of policy-gradient baselines rests on the identity E_{a~π}[b(s) · ∇ log π(a|s)] = 0, which holds whenever b does not depend on the taken action a. The counterfactual baseline b_CF = Σ_{a'} π(a'|s)·R(s,a'|U_luck) depends on s and U_luck — both fixed before the action is drawn — but not on which a was selected. So the identity still holds and the estimator is exactly unbiased. The 'fictional actions' are used only to compute a state-level average, not to estimate any individual action's value. The module's bias readouts confirm: all three estimators are centered at the true gradient regardless of σ."
  },
  {
    q: "In the credit module, reward means R(s,a) are derived from the Thornton (2008) HIV RCT using incentive level bins and distance-to-VCT state splits. For state s=0 (near VCT center), the 'high' incentive arm has the highest empirical P(got HIV result). If you run 500 rollouts with σ_luck = 6 and compare the three gradient estimators, which outcome is most consistent with the theoretical guarantees of counterfactual credit assignment?",
    choices: [
      "REINFORCE has the highest variance and is centered far below the true gradient because high noise biases it",
      "The value-baseline estimator has higher variance than REINFORCE because subtracting V(s) increases the range of possible returns",
      "All three histograms are centered at the true gradient, but REINFORCE is far wider than the value baseline, which is in turn wider than the counterfactual baseline — and the counterfactual baseline's width barely grows with σ because U_luck cancels",
      "The counterfactual baseline has lower variance only when the best action (high incentive) has a much larger reward than the others"
    ],
    answer: 2,
    explain: "The theoretical result (Mesnard et al. 2021) is that all three estimators are unbiased (same center = true gradient) but have radically different widths. REINFORCE variance grows as σ²·E[(∇ log π)²], value-baseline variance is reduced by Var(R̄) but still contains σ²·Var(U_luck), and the counterfactual baseline eliminates σ·U_luck from the advantage entirely — so its variance does not grow with σ. The module makes this visible: raise σ_luck to 6 and the REINFORCE histogram becomes enormous while the CF histogram remains narrow. Choice A is wrong because high noise does not bias any estimator — it only inflates variance. Choice D is wrong — the variance reduction holds regardless of the reward gap."
  }
];

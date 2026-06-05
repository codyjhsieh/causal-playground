export const questions = [
  {
    q: "What is the central theoretical property of the propensity score e(x) = P(T=1 | X=x) that justifies its use for bias adjustment?",
    choices: [
      "It is a sufficient statistic for predicting the outcome Y, so controlling for it removes all outcome variance.",
      "It is a balancing score: conditional on e(x), the covariates X are independent of treatment T, so units with the same propensity score are as good as randomized to each other.",
      "It equals the probability of selection into the study, correcting for non-random sampling from the population.",
      "It is always between 0 and 1, which guarantees numerical stability in regression models."
    ],
    answer: 1,
    explain: "The Rosenbaum-Rubin (1983) theorem: if X satisfies the ignorability condition (T ⫫ Y(0),Y(1) | X), then T ⫫ X | e(X). Conditioning on the scalar e(x) achieves the same covariate balance as conditioning on the full vector X. This collapses a high-dimensional matching problem to one dimension. A is wrong: e(x) predicts treatment, not the outcome. C describes inverse-probability-of-sampling weighting, a different problem. D is true but irrelevant to the theoretical justification."
  },
  {
    q: "In the NSW vs. CPS comparison, the naive difference in 1978 earnings (NSW treated minus CPS controls) is approximately −$10,000. After propensity-score matching, the estimate recovers close to +$1,794. Which of the following best explains why the naive difference is so badly wrong?",
    choices: [
      "The CPS sample is measured in different years, making earnings incomparable.",
      "CPS comparison workers have much higher prior earnings (re74, re75), are older, better educated, and more often married than NSW trainees — these pre-treatment differences create large backdoor paths that inflate the control group's re78, making treated units appear worse off.",
      "The NSW treated group is too small (n ≈ 185) for any estimate to be reliable.",
      "The propensity model is misspecified, inflating the naive estimate."
    ],
    answer: 1,
    explain: "The selection mechanism is the problem: individuals in the NSW job-training program were economically disadvantaged (low prior earnings, lower education) relative to the general CPS labor force. A raw comparison therefore mixes the training effect with baseline economic status. The large negative naive estimate (around −$10k) reflects the controls' higher counterfactual earnings, not a genuine harm from training. A is wrong: earnings are in comparable 1978 dollars. C is wrong: n ≈ 185 treated units is small but not the root cause of the −$10k bias. D inverts the logic: propensity matching corrects the naive estimate; it doesn't produce it."
  },
  {
    q: "Common support (overlap) is a necessary condition for propensity-score methods to work. Which of the following statements about common support are correct? (Select all that apply.)",
    choices: [
      "Common support requires that for every covariate pattern x, there is a positive probability of being either treated or control: 0 < e(x) < 1.",
      "Units outside common support can be matched or re-weighted without bias as long as the propensity model is correct.",
      "In the NSW vs. CPS module, many CPS units have very low propensity scores (near 0) because their covariate profile looks nothing like the NSW trainees; these units are excluded from the supported region.",
      "Trimming units outside common support changes the target estimand from ATE to ATT (or a local version thereof)."
    ],
    answer: [0, 2, 3],
    explain: "A is correct: overlap/positivity is a formal assumption of propensity-score methods. Without it, the counterfactual outcome for some units is not identified from the data. B is wrong: units outside common support cannot be validly compared regardless of model correctness — there are literally no comparable units in the other group. C is correct: CPS workers are generally much richer, creating a region of the propensity axis where treated probability is effectively zero; these observations are outside the overlap region and are dropped. D is correct: by restricting to matched/supported units you are estimating the treatment effect only among comparable units, shifting away from the full-population ATE toward an ATT or local estimand."
  },
  {
    q: "A student argues: 'The propensity score is estimated by logistic regression. If the logistic model is wrong (omits a nonlinear term), then propensity-score matching is no better than naive regression adjustment.' Is this correct?",
    choices: [
      "No — propensity-score matching is always consistent regardless of model specification.",
      "Yes — propensity-score methods inherit the misspecification risk of the propensity model; if e(x) is incorrectly specified, residual imbalance remains and matching may still be biased.",
      "No — matching on an imprecise propensity score still guarantees unbiasedness because the matching step averages out all errors.",
      "Yes — but only when the outcome model is also misspecified."
    ],
    answer: 1,
    explain: "Propensity-score methods are only as good as the propensity model. If important covariates or nonlinearities are omitted, the estimated e(x) does not achieve true covariate balance, and matched pairs may still differ systematically on the omitted terms. This is a key practical limitation. A is false: consistency requires a correctly specified propensity model (or a doubly-robust estimator). C is false: matching reduces but cannot eliminate residual imbalance from a misspecified score. D is wrong: propensity-model misspecification is sufficient on its own to cause bias; outcome model correctness is a separate issue (relevant for doubly-robust estimators)."
  },
  {
    q: "In the interactive Dehejia & Wahba (1999) replication, collapsing the high-dimensional covariate space (age, educ, race, marital status, re74, re75) onto the propensity score axis and then matching recovers an estimate near +$1,794. What does this demonstrate about the propensity score, and what assumption is being relied upon?",
    choices: [
      "It demonstrates that logistic regression is the most accurate prediction model; the assumption is that the logistic link function is correct.",
      "It demonstrates the dimensionality-reduction property of the balancing score: one number encodes all relevant confounding. The critical assumption is strong ignorability — all variables that jointly affect selection and outcome are captured in the covariates X used to estimate e(x).",
      "It demonstrates that matching always outperforms regression adjustment; no additional assumptions are needed.",
      "It demonstrates that the NSW experiment was poorly designed, since an observational method achieves the same answer."
    ],
    answer: 1,
    explain: "The key result is the balancing score theorem: conditioning on the scalar e(x) is sufficient for confounding control when all confounders are in X. The ability to recover +$1,794 from a badly confounded observational sample shows the power of this reduction. The critical assumption is strong ignorability (no unmeasured confounders) — all variables driving both selection into training and 1978 earnings are measured in the data and included in the logistic model. A overemphasizes functional form; other models (probit, CART) would also work if correctly specified. C is wrong: regression adjustment with the full covariate set would also work (as the backdoor module shows); matching is one implementation. D misinterprets the exercise: the RCT remains the gold standard; this exercise validates the observational method against the RCT benchmark."
  }
];

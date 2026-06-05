export const questions = [
  {
    q: "In the partially linear model Y = θ·D + g(X) + ε, what is the intuitive purpose of the two-step partialling-out procedure used by Double Machine Learning?",
    choices: [
      "To reduce the number of observations needed by compressing X into a single index",
      "To remove the influence of confounders X from both Y and D before estimating θ, so the residual-on-residual regression is unconfounded",
      "To replace OLS with a neural network so the model is more expressive",
      "To ensure the treatment D is binary rather than continuous"
    ],
    answer: 1,
    explain: "Partialling out means fitting Ẽ[Y|X] and Ê[D|X] with flexible ML and then regressing the residuals Ỹ = Y−l̂(X) on D̃ = D−m̂(X). This removes the confounding path X→Y and X→D, so the slope of Ỹ on D̃ identifies θ causally. Choice A is unrelated to partialling out; C and D misname the purpose."
  },
  {
    q: "Which of the following correctly describes WHY cross-fitting is necessary in DML? Select all that apply.",
    choices: [
      "Training and predicting on the same fold lets the ML model memorize Y, shrinking residuals toward 0 and biasing θ̂ downward",
      "Cross-fitting ensures the nuisance predictions l̂(X) and m̂(X) are independent of the outcome residuals on each held-out fold",
      "Cross-fitting increases the number of hyperparameters that must be tuned",
      "Without cross-fitting, regularization in the ML step introduces a bias in θ̂ that does not vanish with sample size"
    ],
    answer: [0, 1, 3],
    explain: "Cross-fitting is needed because naive ML plug-in estimators suffer two compounding problems: (1) overfitting — training and scoring on the same data lets l̂ absorb variation in Y, artificially shrinking residuals and pulling θ̂ toward 0; (2) regularization bias — shrinkage keeps l̂ slightly wrong, and that error passes directly into θ̂ at O(1/√n) order without cross-fitting. Cross-fitting breaks the dependence so the Neyman-orthogonal score can do its job. Increasing hyperparameter count (C) is a side-effect, not the reason."
  },
  {
    q: "Neyman orthogonality means the DML score ψ(Y, D, θ, η) satisfies ∂ψ/∂η = 0 at the true nuisance η₀. What practical consequence does this have for estimation?",
    choices: [
      "The estimator is consistent only when the ML nuisance model is exactly correct",
      "Small errors in the nuisance functions l̂ and m̂ produce only second-order (negligible) bias in θ̂, not first-order bias",
      "The method requires parametric nuisance models to maintain its coverage guarantees",
      "The treatment effect θ is identified even when D is not randomized and X contains no relevant confounders"
    ],
    answer: 1,
    explain: "Neyman orthogonality means the moment condition has zero derivative with respect to the nuisance at the truth. A perturbation η̂ − η₀ of order δ produces a bias in θ̂ of order δ², not δ. In practice this means that ML nuisance errors at the usual O(n^{-1/4}) rate still yield √n-consistent, asymptotically normal θ̂. Choice A inverts the logic; C contradicts the whole point; D is wrong — confounders must be in X for the model to be valid."
  },
  {
    q: "A common misconception is that a more flexible ML nuisance model always gives a better DML estimate. Under what condition does a very flexible (overfit) ML model actually HURT the DML estimate?",
    choices: [
      "When cross-fitting is enabled, because cross-fitting prevents the model from using all data",
      "When cross-fitting is disabled, because the model overfits the training fold, making out-of-sample residuals near-zero and θ̂ severely downward-biased",
      "When the confounder X is linear, because flexible models ignore linear structure",
      "When the treatment D is binary, because logistic loss and MSE are incompatible"
    ],
    answer: 1,
    explain: "Without cross-fitting, a very flexible ML model trained and scored on the same data can nearly interpolate Y from X, leaving Ỹ ≈ 0. The residual-on-residual regression then has near-zero numerator and a biased denominator, collapsing θ̂ toward 0 regardless of sample size. This is the 'naive plug-in' failure visible in the module's bootstrap histograms, where the naive-ML distribution sits well below the literature band. Cross-fitting explicitly prevents this overfitting bias."
  },
  {
    q: "In the 401(k) module, the DML bootstrap distribution (with cross-fitting ON) centers near the literature band of roughly +$9k to +$14k, while the naive-ML plug-in distribution centers much lower. Which statement best interprets this result?",
    choices: [
      "DML overestimates the effect because cross-fitting adds artificial variance",
      "The naive plug-in is more efficient because it uses all data in a single fit, so its smaller point estimate is more credible",
      "DML recovers the consensus estimate because cross-fitting + Neyman orthogonality remove regularization bias, while naive plug-in is pulled toward 0 by overfitting and shrinkage",
      "Both estimators are unbiased; the difference reflects sampling variation from the subsample of ~600 observations"
    ],
    answer: 2,
    explain: "The literature estimate (+$9–14k, Chernozhukov et al. 2018) is replicated by DML with cross-fitting. The naive plug-in consistently falls short because (a) regularization in the MLP shrinks l̂ toward the mean, inflating residuals in a correlated way, and (b) without cross-fitting, overfitting produces the own-sample bias described by Chernozhukov et al. The bootstrap uses many independent subsamples, so the systematic gap between DML and naive-ML is not sampling noise — it is bias. Choice D is directly refuted by the persistent gap across 80 bootstraps."
  }
];

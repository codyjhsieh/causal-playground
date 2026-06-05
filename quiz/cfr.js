export const questions = [
  {
    q: "Intuitively, why can't we simply train a standard regression model on the observed outcomes to estimate individual treatment effects (ITEs)?",
    choices: [
      "A standard regression model cannot handle binary treatment indicators as inputs.",
      "Because we never observe both Y(0) and Y(1) for the same unit, the model can only be trained on factual outcomes. If treated and control units differ systematically in covariates (selection bias / covariate shift), the model must extrapolate into regions of covariate space it has not seen — and that extrapolation error directly inflates PEHE.",
      "Standard regression always assumes treatment effect homogeneity (constant ITE), which is too restrictive.",
      "Regression requires a randomized experiment; observational data violates the iid assumption and makes any model inconsistent."
    ],
    answer: 1,
    explain: "The fundamental problem of causal inference is that counterfactual outcomes are <em>never</em> observed. In the IHDP dataset, treated units (lower-birthweight infants) are systematically different from controls: the treated region of covariate space is not covered by many control observations, and vice versa. A model trained on factual outcomes will make predictions in the untreated counterfactual region by extrapolating — and PEHE measures exactly this extrapolation error. Simply adding a treatment indicator to a regression does not solve the overlap problem."
  },
  {
    q: "TARNet and CFR (Shalit, Johansson &amp; Sontag, ICML 2017) share a <strong>representation network</strong> Φ(x) that feeds into two separate outcome heads H₀ and H₁. What is the specific role of the <strong>balancing penalty</strong> α·IPM(Φ_T, Φ_C), and which of the following correctly describes its mechanism? (Select ALL that apply.)",
    choices: [
      "The penalty minimizes the Integral Probability Metric (e.g., MMD) between the representation distributions of treated and control units, forcing them to overlap in Φ-space.",
      "When representations overlap, H₀ must make accurate control predictions at points in Φ-space that are also occupied by treated units — reducing out-of-support extrapolation.",
      "The balancing penalty replaces the factual loss entirely; at α → ∞ the model ignores prediction accuracy and only balances representations.",
      "Shalit et al.'s Theorem 1 bounds the counterfactual generalisation error by the sum of the factual error plus α × IPM(Φ_T, Φ_C), making the tradeoff between fit and balance explicit."
    ],
    answer: [0, 1, 3],
    explain: "<strong>A, B, and D are correct.</strong> A correctly describes the mechanism: MMD between treated and control representation distributions is minimized so the two groups overlap in Φ-space. B explains why this helps: overlap means each head has training signal in regions where both groups are present, enabling interpolation rather than extrapolation. D states the theoretical guarantee from Theorem 1 of the paper. C is wrong: the balancing penalty <em>supplements</em> the factual loss, it does not replace it — the total loss is factual MSE + α·MMD. At α → ∞ the model would perfectly balance but lose predictive accuracy, which is why the challenge requires finding a good α, not the largest one."
  },
  {
    q: "PEHE (Precision in Estimation of Heterogeneous Effects) is defined as √mean[(ITE&#x302; − ITE<sub>true</sub>)²]. A student observes that training with α = 0 (TARNet) gives a lower <em>factual MSE</em> than training with α = 0.5 (CFR), but α = 0.5 gives lower <em>PEHE</em>. Which explanation is correct?",
    choices: [
      "This is impossible: lower factual MSE always implies lower PEHE; the student must have made a coding error.",
      "Factual MSE measures only how well the model fits the <em>observed</em> outcomes. PEHE measures how well it predicts <em>counterfactual</em> outcomes. Balancing (α > 0) sacrifices some factual fit to force representations to overlap, which reduces the counterfactual extrapolation error — so PEHE can improve even as factual MSE worsens.",
      "Lower factual MSE means the model is overfitting to the training set; α = 0.5 regularizes the model, reducing overfitting and improving all metrics including PEHE.",
      "PEHE and factual MSE are mathematically equal whenever the treatment assignment is independent of covariates (unconfounded)."
    ],
    answer: 1,
    explain: "This is the core tension in CFR: factual MSE and PEHE measure different things. Factual MSE rewards fitting observed outcomes, which are only available for one treatment arm per unit. PEHE rewards accurate counterfactual predictions — the arm that was <em>not</em> taken. Balancing forces the representation to overlap, enabling better interpolation for the unobserved arm. The theorem of Shalit et al. formalizes this: the counterfactual bound includes both the factual error <em>and</em> the representation imbalance. Reducing the latter can lower the overall bound even if factual MSE rises slightly."
  },
  {
    q: "The IHDP benchmark is widely used because its outcomes are <strong>semi-synthetic</strong>. What does this mean, and why is it important for evaluating counterfactual models?",
    choices: [
      "Fully synthetic: both covariates and outcomes are computer-generated from a known model, so the exercise is trivial.",
      "Semi-synthetic: covariates (x₁–x₂₅) are <em>real</em> measurements from the Infant Health &amp; Development Program, while potential outcomes (μ₀, μ₁) are simulated under the NPCI setup (Hill 2011). This means the true ITE = μ₁ − μ₀ is known — enabling direct computation of PEHE — while the covariate distribution and selection mechanism reflect a genuine observational study.",
      "Semi-synthetic: half the units are real patients and half are simulated; the mixture prevents overfitting.",
      "Semi-synthetic means the outcomes yf were collected in a real RCT and ycf was imputed by a domain expert, making ITE exact."
    ],
    answer: 1,
    explain: "The IHDP benchmark is semi-synthetic in precisely this sense: real covariates from the IHDP early-intervention study (including a genuine selection mechanism — lower-birthweight infants were systematically enrolled in treatment) with <em>simulated</em> potential outcomes μ₀ and μ₁ under the standard NPCI setup. Because μ₀ and μ₁ are both known for every unit, the true ITE = μ₁ − μ₀ is computable, making PEHE well-defined. In a real observational study, only the factual outcome is ever observed — you could never compute PEHE. The semi-synthetic design is the standard benchmark trick to sidestep the fundamental problem of causal inference while retaining realistic covariate structure."
  },
  {
    q: "In the CFR playground, after training with α = 0 (TARNet), Panel A shows treated (orange) and control (blue) clouds that are <em>separated</em> in the 2-D projection of Φ-space. After increasing α to ~1.0 and continuing training, the clouds begin to overlap. How does this change affect PEHE, and is there any downside?",
    choices: [
      "Overlapping representations always decrease both PEHE and factual MSE; there is no downside.",
      "Overlapping representations should reduce PEHE by enabling interpolation rather than extrapolation for counterfactual predictions. The downside is that forcing overlap may compress the representations, making the outcome heads work harder and potentially increasing factual MSE — a genuine bias–variance tradeoff between counterfactual accuracy and factual fit.",
      "Overlapping representations increase PEHE because the model loses the ability to distinguish treated from control units.",
      "The overlap of representations in 2-D is purely a visualization artifact of the random projection; it has no effect on PEHE."
    ],
    answer: 1,
    explain: "When the representations overlap, each outcome head can generalize across the treated-control boundary, reducing the extrapolation error that drives PEHE up. However, the balancing penalty constrains the representation to satisfy a distributional equality rather than purely optimize predictive loss — this can reduce factual MSE accuracy slightly. In the playground, PEHE typically improves (drops) when α > 0, while factual MSE may rise modestly. The challenge requires finding α where the PEHE improvement more than offsets the factual MSE increase, i.e., where MMD is low and PEHE beats the α = 0 baseline by at least 10%."
  },
];

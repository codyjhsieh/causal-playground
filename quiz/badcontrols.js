export const questions = [
  {
    q: "Intuitively, why does the Card (1995) module warn against adding <em>every available variable</em> to a wage regression? Which statement best captures the core risk?",
    choices: [
      "More controls always shrink the standard error, so adding too many simply makes the estimate too precise to be useful.",
      "Some variables are caused by both education and wages — conditioning on them <em>opens</em> a non-causal path and injects spurious correlation into the treatment coefficient.",
      "OLS can only handle a limited number of regressors before the matrix becomes numerically singular, so parsimony is a computational necessity.",
      "Additional controls are harmful only when the sample size is small; with n &gt; 3 000 like Card's NLSYM data, more controls are always safe."
    ],
    answer: 1,
    explain: "<strong>Choice B is correct.</strong> A variable that is a <em>common effect</em> of treatment and outcome — a collider — creates a spurious dependence between its parents when you condition on it (Berkson's paradox / d-separation). Conditioning on the constructed <code>prestige</code> index in the module opens the path educ → prestige ← lwage and inflates the estimated return. The other choices are wrong: OLS MSE often decreases with more controls (A is backwards on direction), rank deficiency is a numerical — not causal — issue (C), and sample size does not protect against collider bias (D)."
  },
  {
    q: "In the DAG for the Card module, <code>smsa</code> (metro residence) is classified as a <strong>mediator</strong>. Which of the following statements correctly describes what happens — and why — when you include <code>smsa</code> in the adjustment set? (Select ALL that apply.)",
    choices: [
      "Conditioning on smsa blocks the indirect path educ → smsa → lwage, removing the portion of education's wage effect that operates through location sorting.",
      "The OLS coefficient on educ increases (upward bias) when smsa is added, because metro wages are high and the model now credits education for them.",
      "Conditioning on a mediator is called <em>overcontrol bias</em>: the estimate measures only the direct effect of education, not the total effect.",
      "smsa is a valid control because it is observed before wages are measured, so pre-outcome timing guarantees it is safe to condition on."
    ],
    answer: [0, 2],
    explain: "<strong>Choices A and C are correct.</strong> A mediator lies <em>on</em> the causal path treatment → mediator → outcome. Blocking that path removes a genuine portion of the treatment effect — that is overcontrol bias (C), and it works mechanically by absorbing the location-premium channel (A). The coefficient on education shrinks, not increases (B is wrong). Timing alone does not determine whether a variable is safe to condition on: a variable measured before the outcome can still be a collider or a descendant of the treatment (D is wrong). The causal <em>structure</em> — not measurement order — governs conditioning validity."
  },
  {
    q: "The <code>prestige</code> variable in the module is constructed as a linear combination of <code>educ</code> and <code>lwage</code> with noise. Consider the DAG path: educ → prestige ← lwage. What happens to the OLS estimate of educ → lwage when you add <code>prestige</code> to the regression, and what is the structural reason?",
    choices: [
      "The estimate is unchanged; including a noise-contaminated variable as a control never affects the coefficient on the main predictor.",
      "The estimate becomes downward-biased (shrinks toward zero) because prestige absorbs the shared variance between education and wages.",
      "The estimate becomes biased — typically inflated — because conditioning on a collider opens the path educ → prestige ← lwage, creating a spurious non-causal correlation between education and wages.",
      "The estimate is unbiased as long as prestige is standardized (z-scored) before entering the regression."
    ],
    answer: 2,
    explain: "<strong>Choice C is correct.</strong> By d-separation, conditioning on a collider <em>opens</em> the otherwise-blocked path between its parents. Before conditioning: educ and lwage share no path through prestige (it is a blocked collider). After conditioning: educ and lwage become dependent through prestige, adding a non-causal component to the OLS coefficient. The direction is typically upward because prestige = f(educ) + f(lwage) — controlling for their joint child induces positive correlation. Standardization (D) is a scaling operation and cannot fix the structural path-opening problem."
  },
  {
    q: "A student argues: &ldquo;The <code>iq&times;fam</code> (M-collider) variable is constructed from father's education and regional background — both <em>pre-treatment</em> variables. Pre-treatment variables are always safe to include; only post-treatment variables can cause bias.&rdquo; Which response is most accurate?",
    choices: [
      "The student is correct. Pre-treatment variables cannot be colliders because causality flows forward in time.",
      "The student is partially correct: pre-treatment colliders are a minor, mostly theoretical concern that never shows up in practice.",
      "The student is wrong. A pre-treatment variable that is a common effect of two other pre-treatment causes (<em>M-structure</em>) is still a collider. Conditioning on it opens a spurious path between its parents, both of which also affect education — inducing M-bias.",
      "The student is wrong, but only because iq&times;fam happens to be post-treatment in the Card dataset; if it were truly pre-treatment, conditioning would be safe."
    ],
    answer: 2,
    explain: "<strong>Choice C is correct.</strong> The M-bias structure is: IQ-proxy → m_collider ← family-background, where both IQ-proxy and family-background also affect education. The m_collider is constructed <em>before</em> treatment, yet it is still a collider between two background factors. Conditioning on it opens the IQ–family path, leaking their spurious association into the education → wage estimate. Cinelli, Forney &amp; Pearl (2022) explicitly demonstrate that pre-treatment timing does not immunise a variable against collider bias. The causal structure — whether it has two arrows pointing in — is what matters."
  },
  {
    q: "After running the Card (1995) module and toggling controls, a researcher reports: &ldquo;When I include {fatheduc, motheduc, black, south} the return to schooling is β ≈ +0.075; when I add <code>prestige</code> to that set, β jumps to ≈ +0.11. I'll report the larger estimate — my controls are more comprehensive.&rdquo; Identify all the errors in this reasoning. (Select ALL that apply.)",
    choices: [
      "Adding prestige makes the estimate larger, but larger does not mean less biased; the direction of bias from a collider can go either way and here it inflates the estimate.",
      "prestige is a collider (caused by both educ and lwage), so including it is never 'more comprehensive' — it introduces a spurious path, not better confounding control.",
      "The correct benchmark in the module ({fatheduc, motheduc, black, south}) is already the minimal sufficient adjustment set for blocking all backdoor paths; adding prestige only adds collider bias.",
      "The estimate of +0.075 is too small to be practically meaningful; any estimate below +0.10 should be augmented with additional controls."
    ],
    answer: [0, 1, 2],
    explain: "<strong>Choices A, B, and C are all correct.</strong> A: The jump from 0.075 to 0.11 is a red flag, not a refinement — collider conditioning inflates coefficients, so a larger β after adding prestige signals bias, not accuracy. B: 'Comprehensive controls' is a meaningful concept only for <em>confounders</em> (common causes on a backdoor path). A collider is not a confounder; conditioning on it is always harmful here. C: The set {fatheduc, motheduc, black, south} satisfies the backdoor criterion in the module's DAG — it is the minimal sufficient set. Adding prestige violates the criterion by opening a new spurious path. D is false: there is no rule that a 'correct' return to schooling must exceed any particular threshold; 0.075–0.09 is precisely the credible range documented in Card (1995)."
  },
];

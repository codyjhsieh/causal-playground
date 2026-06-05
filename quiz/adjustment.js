export const questions = [
  {
    q: "Before stratifying by department, Berkeley's 1973 admissions data show that women were admitted at a roughly 14 percentage-point lower overall rate than men. What is the most accurate intuitive explanation for this gap?",
    choices: [
      "Individual admissions committees discriminated against women in most departments.",
      "Women applied disproportionately to departments with lower admit rates for everyone, creating a compositional difference rather than a direct gender effect.",
      "The data are corrupted; the gap disappears only because of measurement error.",
      "Men had higher academic qualifications on average, justifying the aggregate gap."
    ],
    answer: 1,
    explain: "This is a canonical Simpson's paradox case. Departments C–F had low admit rates for both sexes, and women concentrated their applications there. The aggregate gap is entirely a compositional artifact: once you look within each department, the gender gap is near zero or slightly favors women. This is confounding by department, not evidence of committee-level discrimination (A). The data are real and well-documented (C). The 'qualification gap' narrative (D) is contradicted by the within-department parity."
  },
  {
    q: "The adjustment (standardization) formula for the causal effect of gender on admission, conditioning on department D, is: P(admit | do(female)) = Σ<sub>d</sub> P(admit | female, dept=d) · P(dept=d). Which assumptions are required for this stratified estimand to equal the causal effect? (Select all that apply.)",
    choices: [
      "Department must be the only confounder — no other variable simultaneously causes gender and admission.",
      "We must observe admission rates within each department separately for men and women.",
      "The number of applicants per department must be equal across genders.",
      "Positivity: both men and women must apply to every department (or at least have non-zero probability of doing so)."
    ],
    answer: [0, 1, 3],
    explain: "A is correct: standardization is only sufficient for causal identification when the adjustment set (department) blocks all backdoor paths. If there are additional unmeasured confounders, residual bias remains. B is correct: you need stratum-specific conditional probabilities P(admit | gender, dept), which requires within-department data by sex. D is correct: positivity (overlap) is required so the within-stratum probabilities are well-defined; if no women applied to a department, the term P(admit | female, dept=d) is undefined. C is wrong: the standardization formula re-weights by the overall applicant distribution, not by within-sex counts — unequal group sizes are handled by the formula itself."
  },
  {
    q: "In the DAG for this module, Department is drawn as a node with an arrow from Gender and an arrow into Admission. A student claims: 'We should NOT adjust for Department because it is a mediator — a variable on the causal path from Gender to Admission.' Is this claim correct?",
    choices: [
      "Yes — adjusting for a mediator always blocks the causal effect and produces a biased estimate.",
      "No — in this context, Gender influences which department women apply to, but department admit rates are determined independently of gender by the department's difficulty. Department acts more as a confounder/proxy, and adjusting for it reveals the direct gender effect.",
      "Yes — mediator adjustment is harmless only when the mediator is binary.",
      "No — it doesn't matter whether Department is a mediator or confounder; always adjust for everything."
    ],
    answer: 1,
    explain: "The causal structure is subtle. Gender influences which department a student applies to (G→D), and department selectivity independently determines admission probabilities (D→A). If the research question is 'would the same person applying to the same department face a different admission probability based on gender alone?', then adjusting for department is appropriate and reveals that direct effect (near zero). A is correct in a different research question — if you wanted the total effect (including the gender-driven choice of department) you would not adjust. C is wrong: whether the mediator is binary is irrelevant. D is wrong: blindly adjusting for all variables is dangerous (e.g., adjusting for descendants of treatment biases estimates)."
  },
  {
    q: "A common misconception is that Simpson's paradox means 'statistical aggregates are always more reliable than subgroup analyses.' What does the Berkeley example actually demonstrate?",
    choices: [
      "Aggregate statistics are unbiased whenever the total sample is large.",
      "Aggregate statistics can reverse or mask effects when a third variable (here, department) is both associated with the exposure and independently affects the outcome — the hallmark of confounding.",
      "Subgroup analyses always have lower power and should be avoided.",
      "The paradox only arises in admissions data; it cannot occur in medical or economic studies."
    ],
    answer: 1,
    explain: "Simpson's paradox is a confounding phenomenon. When a third variable D is associated with both the exposure (gender via differential application) and the outcome (admission via department difficulty), the marginal (aggregate) association can differ in sign or magnitude from the conditional (within-stratum) associations. This is not a sample-size issue (A). Subgroup analyses are essential, not inferior (C). The paradox arises in any domain — health data, economic data, clinical trials — whenever confounders are present (D)."
  },
  {
    q: "After toggling the stratification in the interactive module, the department-adjusted gender gap is approximately 0 pp (or slightly positive for women). The crude aggregate gap was −14 pp. What does this imply about the causal effect of gender on admission, and what caution is still warranted?",
    choices: [
      "It proves with certainty that UC Berkeley had zero gender discrimination in 1973.",
      "The department-adjusted gap ≈ 0 pp implies that, conditional on department choice, gender does not directly predict admission probability — but this only identifies a direct effect. Unmeasured confounders or discrimination at the level of department funding/staffing could still exist.",
      "The result is spurious because the sample (4,526 applicants across 6 departments) is too small.",
      "The adjusted estimate is biased because the standardization weights (P(dept=d)) should be computed separately for men and women."
    ],
    answer: 1,
    explain: "The adjusted estimate gives the conditional (direct) effect of gender on admission after accounting for department. It does not prove the absence of systemic inequality — for instance, women may have been channeled into harder departments by societal or institutional forces, which would be captured in the G→D pathway (the indirect effect). Structural discrimination at the department-funding level would be unmeasured confounding. A overstates the conclusion. C is wrong: 4,526 applicants across 6 departments is more than sufficient for the computations shown. D is wrong: the standardization formula uses the overall applicant distribution P(dept=d) = (mApp_d + wApp_d) / totalApp, which is the correct marginal weight for identifying a population-average causal effect."
  }
];

export const questions = [
  {
    q: "Which of Pearl's three rungs does the question <em>\"Do patients who take this drug live longer?\"</em> occupy — assuming the data come from an uncontrolled observational study?",
    choices: [
      "Rung I — Seeing (association)",
      "Rung II — Doing (intervention)",
      "Rung III — Imagining (counterfactual)",
      "All three rungs simultaneously, because the outcome is the same",
    ],
    answer: 0,
    explain: "Observational data only supports association: P(survival | drug). Moving to rung II requires actually setting the drug (e.g., via randomization), which severs the arrow from confounders into treatment. An uncontrolled study never does that, no matter how large it is.",
  },
  {
    q: "In the LaLonde NSW experiment, comparing NSW trainees against CPS workers (rung I) yields an earnings gap of roughly <strong>−$8,000</strong>, while the randomized NSW treated vs. NSW control comparison (rung II) yields <strong>+$1,794</strong>. What explains the sign reversal?",
    choices: [
      "The CPS sample is too small to be reliable",
      "Selection bias: trainees were severely disadvantaged relative to CPS workers before the program started",
      "The NSW controls were secretly given a different job-training program",
      "1978 earnings are a noisy measure; a larger sample would resolve the discrepancy",
    ],
    answer: 1,
    explain: "CPS workers were older, more educated, and already employed — far more advantaged than the targeted NSW population. That pre-treatment disadvantage drives the observational comparison negative even though training genuinely helped. Randomization (rung II) breaks the link between disadvantage and treatment assignment, recovering the true positive effect.",
  },
  {
    q: "Select <strong>all</strong> statements that correctly describe rung III (Imagining / Counterfactual).",
    choices: [
      "It answers questions of the form P(Y<sub>x</sub> | X=x′, Y=y′) — what Y would have been under a different X, for a unit we already observed",
      "A large enough randomized trial can answer rung-III questions for every individual",
      "It requires the strongest assumptions, because the counterfactual outcome is never observed in any dataset",
      "Concepts like legal blame, credit, and 'but-for' causation all live at rung III",
    ],
    answer: [0, 2, 3],
    explain: "Rung III addresses retrospective, unit-level questions: given what this person experienced, what would have happened otherwise? That counterfactual world is never observed, so no sample size resolves it — structural assumptions (a causal model) are required. Legal and moral responsibility reasoning is paradigmatically counterfactual. A randomized trial identifies the ATE (rung II) but not individual counterfactuals (rung III).",
  },
  {
    q: "A student argues: <em>\"With enough data I can answer any causal question — association just needs a bigger sample.\"</em> What is the fundamental flaw?",
    choices: [
      "They are correct; with n → ∞ all biases vanish",
      "The ladder of causation is a hierarchy of question types, not sample sizes; rung-I data, however abundant, cannot answer rung-II or III questions without causal assumptions",
      "The flaw is only practical: real datasets are never large enough",
      "Association answers intervention questions as long as the treatment is binary",
    ],
    answer: 1,
    explain: "The ladder is about the kind of information available, not its quantity. P(Y|X) converges perfectly with infinite data — but it still only estimates association, never P(Y|do(X)). Climbing a rung requires a causal assumption (a graph, an instrument, randomization), which is qualitatively different from more data.",
  },
  {
    q: "In the module's rung-III example, the NSW trainee's counterfactual Y(0) (earnings without training) is estimated as the mean of NSW controls with similar pre-training earnings. The module explicitly flags this as <em>modeled, not observed</em>. Why can no real dataset ever contain the true Y(0) for that trainee?",
    choices: [
      "The trainee's records were lost in a data-entry error",
      "The fundamental problem of causal inference: each unit exists in only one world — we observe either Y(1) or Y(0), never both",
      "NSW was not large enough; a study of 10,000 trainees would yield the true counterfactual",
      "Counterfactuals are observable in principle; the limitation is only computational",
    ],
    answer: 1,
    explain: "The fundamental problem of causal inference is that a unit that received training did not simultaneously go through life without it. No dataset, however large, records both potential outcomes for the same individual simultaneously. The module's modeled counterfactual is an estimate under assumptions, making rung III permanently assumption-dependent.",
  },
];

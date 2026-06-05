export const questions = [
  {
    q: "In the UC Berkeley 1973 data, the aggregate admission rate was approximately <b>44% for men</b> and <b>30% for women</b>. After splitting by department, the within-department gap largely disappeared or reversed. What single word names the variable that caused this reversal?",
    choices: [
      "Randomization",
      "Confounder",
      "Collider",
      "Mediator",
    ],
    answer: 1,
    explain: "Department is a confounder: it influences both which gender applies (women disproportionately chose harder departments C, E, F) and the outcome (departments differ widely in admission rates). Pooling across this confounder lets the application-pattern difference contaminate the gender comparison.",
  },
  {
    q: "Why does conditioning on department <em>block</em> the spurious aggregate gap in the Berkeley data?",
    choices: [
      "Departments have equal admission rates, so conditioning is uninformative",
      "Within each department, gender and admission rate are compared among applicants who chose the same admissions environment, removing the confounding by department selectivity",
      "Conditioning on department is equivalent to running a randomized experiment",
      "Women applied to fewer departments, so conditioning eliminates their data",
    ],
    answer: 1,
    explain: "Within a single department, both men and women face the same admission rate baseline. The confound arose because men and women chose departments with very different overall rates. Holding department fixed removes that cross-department variation from the comparison, leaving only the within-department gender signal — which is near zero or slightly favors women.",
  },
  {
    q: "Select <b>all</b> conditions that must hold for Simpson's Paradox to occur in a dataset.",
    choices: [
      "The pooled trend goes in the opposite direction from most or all subgroup trends",
      "The subgroups must differ in both the exposure rate and in the outcome's base rate",
      "The dataset must contain at least 10,000 observations",
      "A lurking variable (confounder) must be correlated with both the grouping variable and the outcome",
    ],
    answer: [0, 1, 3],
    explain: "Simpson's Paradox requires three things: a reversal across pooled vs. stratified views (choice 0), subgroup imbalance on both the exposure and the outcome baseline (choice 1), and a lurking confounder driving that imbalance (choice 3). Sample size is irrelevant — the paradox appears in tables as small as the original Berkeley 2×2.",
  },
  {
    q: "A student sees the aggregate Berkeley numbers and concludes: <em>\"UCB discriminated against women in 1973.\"</em> Another says: <em>\"No discrimination — within each department women were admitted at equal or higher rates.\"</em> Which statistical lesson does this illustrate?",
    choices: [
      "Larger samples always reveal discrimination that smaller samples miss",
      "Aggregate statistics can be misleading when a confounding variable (department) creates different composition across groups; causal claims require conditioning on the right variable",
      "The within-department analysis is also biased because departments vary in size",
      "Both analyses are equally valid; it is impossible to determine which is correct",
    ],
    answer: 1,
    explain: "The aggregate statistic is not 'more correct because it uses all the data' — it is confounded by department. The within-department analysis controls for the relevant confounder and gives the proper like-for-like comparison. This is exactly the causal lesson: aggregate associations carry the composition of the groups, not just the treatment effect.",
  },
  {
    q: "In the Berkeley data, departments C, E, and F had the lowest admission rates overall, and women applied there far more heavily than men. Which causal path does this describe?",
    choices: [
      "Gender → Department → Admission (a mediation chain; department is a mediator)",
      "Department → Gender (department caused gender)",
      "Gender ← Department → Admission (a fork; department is a common cause of both gender distribution and admission rate)",
      "Gender → Admission ← Department (a collider on admission)",
    ],
    answer: 2,
    explain: "Department is a fork (common cause): societal factors and self-selection drove women to apply to harder departments (Department → Gender distribution), and department selectivity directly determined admission rates (Department → Admission). This is precisely the backdoor path that creates the spurious aggregate gap. Choice A would make department a mediator of gender's effect, which misrepresents the actual causal structure.",
  },
];

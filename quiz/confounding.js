export const questions = [
  {
    q: "In the 401(k) module, IRA ownership and 401k eligibility are positively correlated in the raw data (r ≈ 0.3), yet there is <b>no arrow</b> between them in the causal graph. What produces this correlation?",
    choices: [
      "IRA ownership causes people to seek out 401k plans at their workplace",
      "401k eligibility encourages households to open an IRA as a supplement",
      "Income is a common cause of both: higher-income households are more likely to own an IRA <em>and</em> more likely to work at firms that offer a 401k",
      "The correlation is a statistical artifact of the small sample size",
    ],
    answer: 2,
    explain: "This is a classic fork / common-cause structure: Income → IRA ownership and Income → 401k eligibility. The two variables share a cause but neither causes the other. The backdoor path IRA ← Income → 401k carries association without causation. Once you hold income fixed, the within-income correlation collapses to ≈ 0.",
  },
  {
    q: "The causal graph for the 401(k) confounding example is a <b>fork</b>: Income → IRA and Income → 401k. Which operation blocks the backdoor path <code>IRA ← Income → 401k</code>?",
    choices: [
      "Conditioning on IRA ownership itself",
      "Conditioning on 401k eligibility",
      "Conditioning on Income (the fork's central node)",
      "No conditioning is needed; the path is already blocked because there is no direct arrow",
    ],
    answer: 2,
    explain: "In a fork X ← Z → Y, the path is open by default and is blocked only by conditioning on the fork node Z (Income). Conditioning on X or Y does not close it. The path is open without conditioning even though there is no direct X → Y arrow — that is precisely what makes confounding insidious.",
  },
  {
    q: "Select <b>all</b> statements that correctly characterize a confounder.",
    choices: [
      "A confounder must cause both the treatment and the outcome",
      "A confounder creates a non-causal association between treatment and outcome",
      "Conditioning on a confounder always increases the bias in a causal estimate",
      "In the 401(k) data, conditioning on income removes the confounded IRA–401k correlation",
    ],
    answer: [0, 1, 3],
    explain: "A confounder is a common cause (must affect both variables — choice 0) and it manufactures a spurious association via the backdoor path (choice 1). Conditioning on a true confounder reduces or eliminates that bias — it does not increase it (so choice 2 is wrong). The module confirms empirically that within income strata the IRA–401k correlation collapses (choice 3).",
  },
  {
    q: "A student argues: <em>\"The raw correlation between IRA ownership and 401k eligibility proves that having an IRA makes you more likely to get 401k access.\"</em> What is the error?",
    choices: [
      "The error is correct — correlation does imply causation when the sample is large enough",
      "Correlation measures association, not causation; here the association is entirely explained by the common cause (income), not by any direct effect",
      "The student should have used a regression instead of a correlation",
      "The direction of causation is reversed: 401k eligibility causes IRA ownership",
    ],
    answer: 1,
    explain: "The Poterba–Venti–Wise 401(k) dataset has ≈9,913 complete cases — a large sample — yet the confounded r ≈ 0.3 does not reflect any causal effect. Association is not causation regardless of n. A regression would suffer the same confounding unless income is controlled. The causal graph has no arrow between IRA and 401k in either direction.",
  },
  {
    q: "In the module, the panel slider lets you vary the number of income bins from 5 to 20. Across all granularities, the within-income correlation stays ≈ 0. What does this robustness demonstrate?",
    choices: [
      "Income is not the real confounder; something else must be driving the raw correlation",
      "The result depends critically on choosing exactly 10 bins — other values give different answers",
      "The confounding is entirely captured by income regardless of how finely it is measured, confirming that income is the sufficient confounder in this graph",
      "More bins always increase statistical power and eventually reveal a significant within-income effect",
    ],
    answer: 2,
    explain: "If income were only a partial confounder, finer stratification would not fully remove the association. The fact that even 5 coarse bins reduce the correlation to near zero — and 20 fine bins do the same — means income accounts for the entire backdoor path. This is exactly the graphical prediction: once income is blocked, no open path remains between IRA and 401k.",
  },
];

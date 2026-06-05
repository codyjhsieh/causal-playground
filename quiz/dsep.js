export const questions = [
  {
    q: "In the Sachs signaling network subgraph, the path <b>PKA → Raf → Mek</b> is a chain. What happens to the association between PKA and Mek when you condition on Raf?",
    choices: [
      "The association strengthens, because conditioning on an intermediate amplifies the signal",
      "The association is blocked; PKA and Mek become d-separated given Raf",
      "Nothing changes, because PKA still has a direct arrow to Erk",
      "The path becomes a collider and opens a new spurious association",
    ],
    answer: 1,
    explain: "In a chain A → B → C, conditioning on the middle node B blocks the path: all information flow from A to C through this route is cut. PKA → Raf → Mek is such a chain; conditioning on Raf makes PKA and Mek d-separated along this path. The PKA → Erk direct arrow is irrelevant to the PKA–Mek path through Raf.",
  },
  {
    q: "The Sachs graph contains the fork <b>Raf ← PKA → Erk</b>. Before conditioning on anything, are Raf and Erk d-separated?",
    choices: [
      "Yes — there is no direct arrow between Raf and Erk, so they are independent",
      "No — the fork is open by default; PKA is a common cause that transmits association",
      "Yes — forks are always blocked in the same way colliders are",
      "It depends on the sample size of the Sachs data",
    ],
    answer: 1,
    explain: "A fork X ← Z → Y is open (d-connected) unconditionally. PKA causes both Raf and Erk, so they share a common cause and will be correlated even without a direct edge. D-separation is a structural claim about the graph — sample size is irrelevant to whether paths are open or blocked.",
  },
  {
    q: "Select <b>all</b> true statements about the collider <b>Plcg → PIP2 ← PIP3</b> in the Sachs graph.",
    choices: [
      "Without conditioning, the path Plcg — PIP2 — PIP3 is blocked at the collider PIP2",
      "Conditioning on PIP2 opens this path, creating a spurious association between Plcg and PIP3",
      "Conditioning on a descendant of PIP2 also opens this path",
      "Conditioning on Plcg blocks the collider and makes Plcg independent of PIP3",
    ],
    answer: [0, 1, 2],
    explain: "Colliders are the reverse of chains and forks: they are blocked by default (choice 0) and opened by conditioning on the collider itself or any of its descendants (choices 1 and 2). Conditioning on Plcg — an ancestor, not the collider — does not open the path; it affects Plcg's own distribution but not the collider status of PIP2 (so choice 3 is false).",
  },
  {
    q: "A student wants to estimate the direct effect of PKC on Raf from the Sachs data. They condition on every other measured protein to 'control for everything.' Why might this backfire?",
    choices: [
      "Conditioning on more variables always reduces bias, so this strategy is optimal",
      "Conditioning on a collider (such as PIP2, which has Plcg and PIP3 as parents) opens new spurious paths, potentially introducing bias rather than removing it",
      "The Sachs data only contains 853 observations, which is too few for multi-variable conditioning",
      "PKC has no path to Raf in the graph, so the effect is zero regardless of conditioning",
    ],
    answer: 1,
    explain: "Naively conditioning on all available variables is dangerous because it can open collider paths. PIP2 is a collider of Plcg and PIP3; conditioning on it opens the path Plcg → PIP2 ← PIP3 → PKC, creating a spurious dependency. The module's empirical partial correlations demonstrate this: the right conditioning set is determined by the graph structure, not by 'controlling for everything.'",
  },
  {
    q: "The module challenges you to find a conditioning set Z such that two chosen proteins are d-separated in the graph <em>and</em> their empirical partial correlation in the real Sachs single-cell data falls below 0.10. Why does the graph-derived prediction match real data so well here?",
    choices: [
      "D-separation is a purely statistical criterion that is guaranteed to match any dataset",
      "The Sachs graph was reverse-engineered from the same data used in the module, so the match is circular",
      "The Sachs consensus network was validated as a causal model for this signaling system; d-separation in the causal graph predicts conditional independence in the observational distribution under the Markov condition",
      "Partial correlation always equals zero for any two proteins that lack a direct edge",
    ],
    answer: 2,
    explain: "The key result is that a correctly specified causal DAG satisfies the Markov condition: every d-separation in the graph implies conditional independence in the joint distribution. The Sachs consensus network was built from interventional experiments (not purely from the observational data used here), so the match between structural d-separation and empirical near-zero partial correlations is a genuine validation of the causal model, not circular reasoning.",
  },
];

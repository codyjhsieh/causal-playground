export const questions = [
  {
    q: "Intuitively, why can observational data — no matter how large the sample — never pinpoint the direction of a reversible edge in a causal DAG?",
    choices: [
      "Larger samples eventually distinguish all edge directions through tighter confidence intervals.",
      "Observational data only encode conditional independence relationships (the Markov conditions), and two DAGs that imply the same set of d-separations are statistically indistinguishable — even with infinite data.",
      "Edge directions are unidentifiable because we cannot run experiments on real data.",
      "Reversible edges are those pointing from a low-variance node to a high-variance node, and variance is not observed."
    ],
    answer: 1,
    explain: "The Markov equivalence result (Verma &amp; Pearl 1990) is information-theoretic: all DAGs in the same Markov equivalence class (MEC) generate exactly the same joint distribution over any sample size. There is no statistical test — CI-based or otherwise — that can distinguish them from observational data alone. More data narrows sampling error but cannot resolve structural ambiguity (A is false). Experiments (interventions) can break the tie (C confuses identification with estimation). Variance plays no role in the MEC definition (D is invented)."
  },
  {
    q: "Which of the following correctly states the conditions that define the Markov equivalence class (MEC) of a DAG?",
    choices: [
      "Two DAGs are Markov equivalent if and only if they have exactly the same set of directed edges.",
      "Two DAGs are Markov equivalent if and only if they share the same skeleton (undirected adjacency) and the same set of v-structures (X→Z←Y with X,Y non-adjacent).",
      "Two DAGs are Markov equivalent if and only if they share the same skeleton and the same number of edges.",
      "Two DAGs are Markov equivalent if and only if they produce the same marginal distributions for every individual variable."
    ],
    answer: 1,
    explain: "The Verma–Pearl characterization (1990): two DAGs are Markov equivalent iff (1) their skeletons are identical (same undirected adjacency graph) and (2) they share exactly the same v-structures (colliders X→Z←Y where X and Y are non-adjacent). V-structures are the ONLY local configurations that force a unique orientation — they are identifiable from the observed independence structure because colliders behave differently from chains and forks under conditioning. Same directed edges (A) is far too strict. Same skeleton + same edge count (C) ignores orientation. Identical marginals (D) does not capture the full conditional independence structure."
  },
  {
    q: "In the Sachs et al. (2005) protein-signaling subgraph shown in the module (PKC→Raf←PKA, Raf→Mek→Erk), which edges are compelled (orientable from data alone) and which are reversible? (Select all true statements.)",
    choices: [
      "PKC→Raf and PKA→Raf are compelled because they form a v-structure PKC→Raf←PKA.",
      "Raf→Mek and Mek→Erk are reversible because reversing either produces a new DAG with the same skeleton and v-structures.",
      "All four edges are compelled because n ≈ 853 cells gives enough power to resolve all directions.",
      "Raf→Mek is compelled because Raf has the highest in-degree in the subgraph."
    ],
    answer: [0, 1],
    explain: "A is correct: PKC→Raf←PKA is a v-structure (PKC and PKA are non-adjacent), so those two edge directions are compelled — every MEC member must orient them the same way. B is correct: the chain Raf—Mek—Erk has no v-structure constraint; either direction of Raf–Mek or Mek–Erk produces an acyclic DAG with the same v-structures (none), so the MEC has 4 members (2 reversible edges × 2 choices each). C is false: sample size is irrelevant to MEC membership — this is a structural, not statistical, limit. D is false: in-degree determines nothing about compelledness."
  },
  {
    q: "The Corr2Cause benchmark (Jin et al., ICLR 2024) found that GPT-4 and other large language models performed near random chance on questions asking which edges are <em>identifiable</em> from correlational data. Which explanation best describes why?",
    choices: [
      "LLMs lack training data on causal graphs, so they must guess randomly.",
      "LLMs over-confidently orient reversible edges based on plausible causal stories, treating MEC-equivalent orientations as distinguishable — confusing domain knowledge with statistical identifiability.",
      "The test prompts were ambiguous, and the random-chance performance would disappear with better phrasing.",
      "Causal-graph reasoning is a purely symbolic task that neural networks cannot represent."
    ],
    answer: 1,
    explain: "The core finding of Corr2Cause is that LLMs conflate causal plausibility with statistical identifiability. A model may 'know' that X plausibly causes Y in a domain and so confidently orient X→Y even when the data cannot distinguish X→Y from Y→X (a reversible edge). This is overconfidence in the MEC sense: the model produces a single DAG where the data only licences a CPDAG. A is wrong — LLMs see vast causal text; lack of data is not the bottleneck. C attributes the result to prompting artifacts, unsupported by systematic tests across phrasings. D overstates the limitation; symbolic graph tasks are well within transformer competence — the specific failure is conceptual conflation, not a representation barrier."
  },
  {
    q: "In the module, the partial correlation of PKC ⫫ PKA | {Raf} computed from the real Sachs et al. (2005) protein-signaling data is displayed as ≈ 0 (green badge). What does this empirical result tell us, and what does it <em>not</em> tell us?",
    choices: [
      "It confirms that PKC and PKA are d-separated given Raf in the true causal graph — and it also tells us the direction PKC→Raf vs. PKA→Raf.",
      "It confirms that the model's implied d-separation PKC ⫫ PKA | {Raf} holds in real cell-signaling data, validating the v-structure. It does NOT reveal whether, say, Raf→Mek or Mek→Raf is the correct direction.",
      "A near-zero partial correlation implies no causal path from PKC to PKA, ruling out any latent common cause.",
      "The near-zero partial correlation means PKC and PKA are marginally independent, so neither influences Raf."
    ],
    answer: 1,
    explain: "The green badge validates the implied d-separation: conditioning on the collider Raf blocks the active path PKC→Raf←PKA, making PKC and PKA approximately uncorrelated in the data. This is exactly what the MEC predicts and confirms the v-structure PKC→Raf←PKA. But partial correlations only test independence statements — they say nothing about which direction reversible edges like Raf–Mek point. A wrongly claims edge direction can be inferred; C wrongly equates conditional independence with absence of any latent cause; D confuses conditioning on a collider (which blocks paths) with marginal independence."
  }
];

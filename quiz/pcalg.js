export const questions = [
  {
    q: "Intuitively, what principle allows the PC algorithm to remove an edge between two variables X and Y?",
    choices: [
      "X and Y have a small marginal correlation, so they cannot be causally related",
      "A set S of other variables is found such that X and Y are conditionally independent given S — meaning S 'screens off' any information X carries about Y",
      "X and Y are in the same Markov equivalence class, so the edge is redundant",
      "The partial correlation between X and Y is larger than the threshold α, confirming independence",
    ],
    answer: 1,
    explain:
      "The PC skeleton phase removes edge X–Y only when a separating set S is found such that X ⫫ Y | S (conditional independence). This means knowing S renders X and Y statistically irrelevant to each other — consistent with no direct causal link. Choice A is wrong: marginal independence (order-0 test) is only one special case; the edge can be retained despite near-zero marginal correlation if conditioning on something makes them dependent. Choice D has the direction backward — the edge is deleted when |partial r| < α (small), not large.",
  },
  {
    q: "In the PC algorithm's orientation phase, an unshielded triple X–Z–Y (where X and Y are not adjacent) is oriented as a v-structure X→Z←Y. What is the decision rule, and why does it work?",
    choices: [
      "Z is oriented as a collider when Z <em>is</em> in sep(X,Y); this is because colliders block paths when conditioned on",
      "Z is oriented as a collider when Z is <em>not</em> in sep(X,Y); if Z were a non-collider, conditioning on Z would have made X and Y independent, but since Z was not needed to separate them, it must be a collider that opens paths when conditioned on",
      "Z is always oriented as a collider in unshielded triples regardless of the sep set",
      "Z is oriented as a collider only when its marginal correlation with both X and Y exceeds α",
    ],
    answer: 1,
    explain:
      "The v-structure rule: orient X→Z←Y when Z ∉ sep(X,Y). In a non-collider (fork X←Z→Y or chain X→Z→Y), conditioning on Z blocks the path, so X⫫Y|Z would hold and Z would be in sep(X,Y). Since Z was NOT used to separate X and Y, it cannot be a non-collider on this path — it must be a collider. Colliders are the only structures where conditioning on Z opens (not blocks) the path. This is what makes v-structures the uniquely identifiable features of a CPDAG.",
  },
  {
    q: "After the PC algorithm runs on the Sachs 7-protein subset in this module, some edges remain undirected (dashed). Which of the following correctly explains why and what it implies? Select ALL that apply.",
    choices: [
      "Undirected edges represent pairs that are Markov-equivalent: reversing the edge direction produces a different DAG that is statistically indistinguishable from the data under the same independence model",
      "Undirected edges are simply edges the algorithm failed to test due to computational time limits",
      "No observational independence test, regardless of sample size, can determine the direction of a Markov-equivalent edge without additional interventional data or assumptions",
      "Meek's rules (R1, R2) can sometimes orient additional edges beyond v-structures by enforcing acyclicity and no-new-v-structure constraints",
    ],
    answer: [0, 2, 3],
    explain:
      "Choices A, C, and D are all correct. A CPDAG represents the Markov equivalence class (MEC) — all DAGs with the same skeleton and v-structures that imply the same conditional independencies. Edges within the MEC are genuinely ambiguous from observational data (Choice A and C). Meek's R1 and R2 rules can orient further edges after v-structures are fixed by forbidding new colliders and cycles (Choice D). Choice B is wrong: undirected edges are not a computational shortcut but a fundamental identifiability limit.",
  },
  {
    q: "A researcher sets α very high (e.g., 0.40) in the PC algorithm on the Sachs data. What is the most likely consequence for the resulting graph?",
    choices: [
      "The algorithm will orient more edges, because high α makes CI tests more powerful",
      "The algorithm will retain too few edges (very sparse graph), missing true causal connections and increasing SHD",
      "The algorithm will retain too many edges (overly dense skeleton), because a high α makes it harder to declare independence and delete edges — increasing false-positive edges and raising SHD",
      "SHD will decrease because more edges means fewer missing-edge penalties",
    ],
    answer: 1,
    explain:
      "With |partial r| < α declared independent, a HIGH α means even moderately correlated pairs are called independent, causing true edges to be deleted (false negatives). The resulting graph is too sparse, incurring missing-edge SHD penalties. Choice C describes the LOW α setting where few edges are deleted and the graph stays too dense — the opposite direction. Choice A is wrong because orientation opportunities depend on skeleton density, not α directly. Choice D is wrong because missing edges add SHD penalties, not reduce them.",
  },
  {
    q: "In the Sachs signaling network experiment displayed in this module, the true edges include PKA→Raf, PKA→Mek, and PKA→Erk. After running PC at a reasonable α, PKA is found adjacent to Raf, Mek, and Erk. An unshielded triple Raf–PKA–Mek is found where Raf and Mek are NOT adjacent in the skeleton, and PKA is NOT in sep(Raf, Mek). What orientation does the algorithm assign, and what biological interpretation does it carry?",
    choices: [
      "The triple is left undirected because PKA is a well-known hub protein",
      "PKA is oriented as a non-collider: Raf→PKA→Mek, meaning PKA mediates the Raf→Mek pathway",
      "PKA is oriented as a collider: Raf→PKA←Mek, but this is inconsistent with the known PKA kinase activity",
      "PKA is oriented as a collider: Raf→PKA←Mek because PKA ∉ sep(Raf, Mek) — the algorithm identifies PKA as a common cause's downstream target; however, the true graph has PKA→Raf and PKA→Mek, so this inferred v-structure is a false orientation (wrong direction for both edges)",
    ],
    answer: 3,
    explain:
      "By the v-structure rule, PKA ∉ sep(Raf, Mek) → orient Raf→PKA←Mek. The algorithm correctly identifies PKA as a collider based on the independence pattern, but the true directions are PKA→Raf and PKA→Mek — PKA is actually the common cause (fork), not a common effect. This is a case where the Markov-equivalence class is large and/or the finite-sample CI tests point toward a wrong member of the class. It illustrates why SHD > 0 even on the Sachs data: data-driven orientation can contradict known biology, and additional intervention data (which Sachs et al. collected) are needed to resolve such ambiguities.",
  },
];

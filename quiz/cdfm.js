export const questions = [
  {
    q: "What does <strong>amortized / zero-shot causal discovery</strong> mean, and how does it differ from running the PC algorithm from scratch?",
    choices: [
      "A model is pre-trained once on a large distribution of synthetic causal worlds (the prior), learning the <em>skill</em> of mapping data statistics to edge probabilities; at test time it infers the full graph in a single forward pass with no per-dataset search or CI tests.",
      "The model is fine-tuned on each new dataset using a small number of gradient steps, making it faster than PC but still dataset-specific.",
      "Zero-shot means the model skips the orientation phase and only finds the skeleton, while PC always produces fully directed graphs.",
      "Amortization refers to caching CI-test results across datasets so the p-value computations do not have to be repeated."
    ],
    answer: 0,
    explain: "Amortized discovery (AVICI, Sea, FiP/Zero-Shot Learning of Causal Models, TMLR 2025) pre-trains a model on simulated SCMs drawn from a prior, so it internalizes the mapping from data statistics to graph structure. At inference the entire graph is produced by a single forward pass — no conditional-independence tests, no score optimization, no per-dataset gradient updates. B describes fine-tuning, which is not amortized inference. C is wrong: PC also targets the skeleton (CPDAG) and the module is explicit that orientation requires v-structures or interventions. D conflates caching with amortization."
  },
  {
    q: "Why can an amortized discovery model <strong>outperform fixed-α PC at small sample sizes</strong>? Select all correct reasons.",
    choices: [
      "The amortized model learns from the prior how partial-correlation evidence should be weighted given the current sample size n, effectively adapting its threshold to n rather than using a fixed α.",
      "At small n the partial correlations are noisy; a fixed-α threshold calibrated for large n is systematically miscalibrated (too liberal or too conservative), while the learned model has seen many small-n worlds during training.",
      "The amortized model uses gradient descent to fit the test data, which is more data-efficient than hypothesis testing at small n.",
      "Small n removes the need for a conditioning set in CI tests, making the amortized pass faster."
    ],
    answer: [0, 1],
    explain: "A is the key insight: the amortized model receives the sample size as a feature and, across thousands of training worlds, learns how much to trust a given partial correlation at that n. B correctly describes the miscalibration failure of fixed-α: the Fisher z-test threshold derived for, say, n=500 is wrong for n=40, but the amortized model implicitly recalibrates. C is false: the amortized model does <em>not</em> update its weights on test data — inference is a single forward pass. D is incorrect: small n makes CI conditioning harder, not easier."
  },
  {
    q: "The module pre-trains the discovery model <strong>only on synthetic linear-Gaussian SCMs</strong>, yet tests it on the real Sachs phosphoprotein network. Which of the following best describes what this demonstrates — and what it does <em>not</em> guarantee?",
    choices: [
      "It demonstrates that the skill of interpreting partial-correlation &amp; precision-matrix features for edge detection can transfer from imaginary linear worlds to real biological data; it does <em>not</em> guarantee that the model handles non-linear relationships, latent confounders, or very large graphs outside the training distribution.",
      "It proves the model has memorized the Sachs graph from its training data, since the prior must have included it.",
      "It shows that synthetic pre-training is unnecessary — any random initialization would do equally well on real data.",
      "It guarantees that the model will always match or beat domain-specific discovery algorithms on any biological dataset."
    ],
    answer: 0,
    explain: "The Sachs test is the module's headline: a model trained exclusively on imaginary linear-Gaussian worlds recovers real biology it has never seen, because partial correlations and precision-matrix signatures are informative features for edge detection across many real systems too. However, the prior is linear-Gaussian and K=5, so it does not cover strongly non-linear mechanisms, hidden common causes (requiring FCI rather than PC), or large dense graphs far outside the training distribution. B is false: the Sachs network is not in the synthetic prior. C is obviously false. D overstates: the module is explicit that quality is bounded by the prior."
  },
  {
    q: "Which of the following are <strong>honest limitations</strong> of the amortized discovery approach demonstrated in this module? (Select all that apply.)",
    choices: [
      "The model predicts a skeleton (undirected edges); orienting arrows requires v-structure detection, Meek rules, or interventional data that the amortized pass cannot provide.",
      "If the true data-generating process violates the prior (e.g., non-linear mechanisms, measurement error, latent confounders), the model's output can be systematically wrong.",
      "The model is computationally slower than running PC because neural-network inference is more expensive than a single CI test.",
      "Using K = 5 nodes for legibility means the module cannot illustrate the method's behavior on larger graphs."
    ],
    answer: [0, 1, 3],
    explain: "A is a fundamental limit: the skeleton (CPDAG) leaves many arrow directions ambiguous; Markov-equivalence classes can only be resolved by v-structures, Meek propagation, or interventional experiments — the amortized forward pass only outputs edge probabilities for the skeleton. B is prior misspecification: any learned model is only as good as its training distribution, and biological signaling pathways, for example, involve non-linearities the linear-Gaussian prior does not capture. D is a limitation of the pedagogical presentation specifically. C is false: neural inference for a K=5 graph is vastly faster than running a full PC algorithm with growing-order conditioning sets, and the amortized model's advantage is especially pronounced for large K."
  },
  {
    q: "How does <strong>amortized causal discovery</strong> (this module) relate to <strong>Causal Foundation Models / CausalPFN</strong> (the &lsquo;Causal Foundation Models&rsquo; module on this platform), and where do they differ?",
    choices: [
      "They are the same method applied to the same task; CausalPFN is simply an older name for AVICI.",
      "Both pre-train on a synthetic SCM prior and perform zero-shot inference in a single forward pass — but they solve different tasks: CausalPFN/CausalFM estimates <em>treatment effects</em> (CATE, ITE) given a fixed graph, while amortized discovery (AVICI, FiP) infers the <em>causal graph structure</em> itself from data.",
      "CausalPFN infers causal graphs while amortized discovery estimates treatment effects; the names are reversed on this platform.",
      "CausalPFN requires per-dataset fine-tuning; only amortized discovery is truly zero-shot."
    ],
    answer: 1,
    explain: "Both paradigms use the same amortization idea — pre-train on synthetic SCMs, run inference in one forward pass — but they target complementary problems. CausalPFN (Balazadeh et al. 2025) and CausalFM (Ma, Frauen et al., ICLR 2026) estimate heterogeneous <em>treatment effects</em> (CATE/ITE) given that the causal structure is either known or assumed; they are the amortized counterpart of T-learners, DR-learners, etc. AVICI (Lorch et al. 2022), Sea (Wu et al. 2024) and FiP (Scetbon et al., TMLR 2025) infer the <em>causal graph</em> (skeleton/CPDAG) from observational data; they are the amortized counterpart of PC, GES, NOTEARS. A is wrong: they are distinct papers targeting distinct tasks. C reverses the tasks. D is wrong: both are zero-shot (no test-time weight updates)."
  }
];

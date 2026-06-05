export const questions = [
  {
    q: "In the causal representation learning module, observations are generated as x = A·z where z = (PKA, P38) are real protein measurements and A is a known mixing matrix. Without any interventions, what does the 'free rotation' problem mean for a learner who only sees x?",
    choices: [
      "The learner cannot estimate the number of latent factors because x has higher dimension than z",
      "Any rotation of the learned basis fits the observational Gaussian equally well — infinitely many unmixings B are consistent with the data, so the individual latent factors z₁ and z₂ cannot be identified from observations alone",
      "The mixing matrix A must be orthogonal; any other matrix makes the problem ill-posed",
      "The free rotation problem disappears when enough observational data is collected, because the sample covariance converges to the population covariance"
    ],
    answer: 1,
    explain: "This is the Locatello et al. (ICML 2019) impossibility result for unsupervised disentanglement. For linear Gaussian models, if z ~ N(0, I) and x = A·z, then x ~ N(0, AA^T). Any rotation R gives x = (AR)(R^Tz) = A'z', a new Gaussian with the same distribution. No observational data, regardless of quantity, distinguishes A from AR — the latent axes are unidentifiable up to a free rotation. The module visualizes this as a spinning '?' frame in the recovered panel. Choice D is precisely the misconception Locatello refutes."
  },
  {
    q: "When the module's 'Intervene on PKA do(PKA := 2.5)' toggle is activated, a second cloud of points appears shifted in observation space. How does this intervention grant identifiability for the PKA latent axis? Select all that apply.",
    choices: [
      "The intervention shifts the mean of x by A[:,0] · 2.5, revealing the direction of the first column of the mixing matrix A",
      "Knowing A[:,0] allows the learner to estimate one degree of freedom of the inverse matrix B = A⁻¹, pinning the PKA axis in observation space",
      "The intervention removes the need for the second intervention do(P38) because once one column of A is known, the other is its orthogonal complement",
      "The intervention is only informative if PKA and P38 are statistically independent in the observational data"
    ],
    answer: [0, 1],
    explain: "An intervention do(z₁ := c) shifts the mean of x by A[:,0]·c (all other latents unchanged). So E[x|do(z₁=c)] − E[x|obs] = A[:,0]·c, directly revealing the first column of A (choices A and B). This is exactly how the module's recovery algorithm works: it divides the mean shift by INT_SHIFT = 2.5 to estimate A[:,0]. Choice C is tempting but wrong: the orthogonal complement fixes the direction only if A is a pure rotation (det = ±1); the module uses a scale-asymmetric matrix. More importantly, a single intervention leaves a sign/scale ambiguity for the second axis — both interventions together give full identification. Choice D is false: statistical dependence in observational data is irrelevant to whether an intervention identifies a causal column."
  },
  {
    q: "The module reports Mean Correlation Coefficient (MCC) as the identifiability metric. MCC = 1 means perfect recovery; MCC ≈ 0 means the recovered latents are unrelated to the true latents. Which configuration of interventions is sufficient to drive MCC close to 1?",
    choices: [
      "No interventions, but a very large observational dataset (n → ∞)",
      "One intervention (do(PKA) only), regardless of the mixing angle θ",
      "Both interventions — do(PKA) and do(P38) — which together identify all columns of A, allowing exact recovery via B = A⁻¹",
      "One intervention combined with the constraint that the mixing matrix A is symmetric"
    ],
    answer: 2,
    explain: "Two interventions, one per latent, identify both columns of the 2×2 mixing matrix A. With A fully estimated, its inverse B = A⁻¹ recovers ẑ = B·x ≈ z. The module shows MCC jumping from ≈0 (no interventions) to ≈1 when both toggles are on, at any mixing angle θ. Choice A fails due to the Locatello impossibility: more observational data does not break the rotational symmetry. Choice B is partially right — one intervention pins one axis — but the other axis remains ambiguous (the module heuristically uses a perpendicular guess, giving MCC < 1 unless A happens to be exactly orthogonal). Choice D is a structural assumption, not something verifiable from data."
  },
  {
    q: "A common misconception about causal representation learning is: 'We just need a better unsupervised disentanglement loss (e.g., β-VAE, FactorVAE) and we can identify causal latents without interventions.' According to Locatello et al. (2019), why is this wrong?",
    choices: [
      "Variational autoencoders are computationally too slow to scale to real biological datasets",
      "The Locatello impossibility theorem shows that, under general generative models with independent latents, no unsupervised method can identify the true latent factors — any improvement on a disentanglement metric relies on inductive biases that are not guaranteed to align with the true causal structure",
      "β-VAE and FactorVAE require labeled data, making them supervised methods",
      "Disentanglement losses only work for discrete latent variables, not continuous signals like protein levels"
    ],
    answer: 1,
    explain: "Locatello et al. proved that, for any dataset generated by a model with independent latents and no interventional structure, there exists another model with a different latent space that generates the same observations. No unsupervised learning algorithm can distinguish them. Methods like β-VAE may appear to disentangle on some benchmarks, but that success depends on implicit dataset biases (e.g., color varies independently of shape by construction), not on principled identifiability. Interventions are what break the symmetry. The module makes this concrete: the MCC stays near 0 until a real do(·) intervention is applied. Choices A, C, D are false technical claims."
  },
  {
    q: "The true latent signals in the module are z-scored PKA and P38 protein measurements from Sachs et al. (Science 2005), which have a small positive empirical correlation. After mixing with A(θ) and then recovering with B = A⁻¹ using both interventions, what should the recovered ẑ₁ and ẑ₂ look like relative to the original PKA and P38 clouds?",
    choices: [
      "The recovered clouds will be rotated versions of the true clouds because A cannot be exactly inverted at finite sample size",
      "The recovered clouds will match the true latent clouds up to sign and permutation, with MCC ≈ 1, because B exactly inverts the mixing regardless of the empirical correlation between PKA and P38",
      "The recovered clouds will only match if PKA and P38 are uncorrelated; any nonzero correlation prevents exact recovery",
      "The recovered clouds will be compressed toward the origin because the mixing matrix A has determinant less than 1"
    ],
    answer: 1,
    explain: "The mixing x = A·z is exactly invertible by construction (A is a known, non-singular matrix). Given both intervention shifts, the module estimates A (identifying both columns), then inverts it to get B. Applying B to x recovers ẑ = B·A·z = z, up to the estimation error in A's columns from finite intervention data. The empirical correlation between PKA and P38 is a property of the true latents — it affects the shape of the z cloud but not the invertibility of A. MCC ≈ 1 is confirmed by the module when both interventions are toggled on. Choice C confuses statistical dependence with algebraic invertibility: linear mixing is invertible regardless of latent correlations."
  }
];

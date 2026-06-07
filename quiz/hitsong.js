export const questions = [
  {
    q: "Every audio feature in the Spotify dataset has a weak correlation with popularity (all |r| &lt; 0.16). Which interpretation is most defensible from a causal-inference standpoint?",
    choices: [
      "Audio features definitely do not matter for popularity — weak correlation proves no causal effect.",
      "Weak correlation is <em>consistent with</em> the true audio-feature effect being small, but it could also mean the real cause (artist fame, marketing, playlist placement) is an unmeasured confounder that swamps any audio signal — we cannot distinguish these two stories from audio data alone.",
      "A correlation of −0.16 for instrumentalness is strong enough to build a hit-song prediction model.",
      "Weak correlations are caused by measurement error in the audio features and would disappear with better sensors.",
    ],
    answer: 1,
    explain:
      "Weak correlation does not prove no causal effect — it is consistent with either a genuinely small audio effect <em>or</em> a large unmeasured confounder (fame, algorithmic promotion) that dominates the outcome. Choice A conflates correlation with causation in the wrong direction: absence of evidence is not evidence of absence. Choice C is wrong — |r| = 0.16 implies r² ≈ 2.6% variance explained, which produces poor predictions in practice. Choice D invents a measurement-error story with no basis in the problem setup.",
  },
  {
    q: "In the &ldquo;Discover audio DNA&rdquo; panel, edges are drawn between audio features when the <strong>partial correlation</strong> (from the precision matrix) exceeds a threshold α. What does it mean for two features to share an edge in this Gaussian graphical model?",
    choices: [
      "They have a high marginal (raw) correlation, which is easier to compute than partial correlations.",
      "They remain correlated even after <em>conditioning on all other features simultaneously</em>, suggesting a direct conditional dependence — consistent with a direct causal or structural link.",
      "They are independent of every other feature, making them safe to include as controls.",
      "One feature causally precedes the other in time, so the edge indicates temporal ordering.",
    ],
    answer: 1,
    explain:
      "A Gaussian graphical model places an edge between two variables when their partial correlation — conditioning on <em>all remaining variables</em> — is non-zero. This captures direct conditional dependence, distinct from marginal correlation (which includes indirect paths). It is the skeleton a causal-discovery algorithm like PC would recover. Choice A describes marginal correlation, not the precision-matrix approach. Choice C reverses the logic. Choice D is wrong — the graphical model uses conditional independence, not temporal ordering.",
  },
  {
    q: "In the discovered feature graph, energy, loudness, <strong>&amp;</strong> acousticness emerge as the first cluster as α decreases. Which statements correctly characterize this cluster? Select ALL that apply.",
    choices: [
      "Energy <strong>&amp;</strong> loudness share a strong <em>positive</em> partial correlation (≈ +0.6–0.7): louder productions tend to sound more energetic even after holding other features fixed.",
      "Energy <strong>&amp;</strong> acousticness share a strong <em>negative</em> partial correlation (≈ −0.5): acoustic tracks are systematically less energetic than electronic/distorted ones.",
      "The cluster appears first because these three features have the largest partial correlations among all feature pairs — they are the most conditionally dependent.",
      "Because the cluster appears in observational data, we can conclude that energy <em>directly causes</em> loudness via a chain of physical mechanisms, with no confounding possible.",
    ],
    answer: [0, 1, 2],
    explain:
      "Choices A, B, and C are correct. Energy–loudness (partial r ≈ +0.69) and energy–acousticness (partial r ≈ −0.55) are the two largest feature–feature partial correlations in the dataset; they dominate the graph at high α thresholds. Choice D is wrong: observational discovery identifies a <em>skeleton</em> (undirected conditional dependencies), not directed causal arrows. Orientation requires additional assumptions (e.g., acyclicity + faithfulness) or interventional data; and even then, shared production style could confound the energy–loudness link.",
  },
  {
    q: "The &ldquo;Loudness illusion&rdquo; panel shows that raw correlation of loudness with popularity is weak positive, but within individual genres the correlation changes — sometimes reversing sign. What causal concept best explains this pattern, and what is the implication?",
    choices: [
      "Mediation: loudness mediates the effect of genre on popularity, so stratifying by genre opens a backdoor path.",
      "Confounding by genre: genre is a common cause of both loudness (some genres are inherently louder, e.g., EDM vs acoustic folk) and popularity (some genres stream more). The raw correlation mixes this genre effect with any direct loudness–popularity link; within-genre comparison blocks the genre backdoor path.",
      "Instrumental-variable bias: genre acts as an instrument for loudness, inflating the raw correlation.",
      "Collider bias: popularity is a collider between loudness and genre, so conditioning on genre biases the estimate.",
    ],
    answer: 1,
    explain:
      "Genre is a classic confounder: it influences both how loud a track is mixed (EDM tracks are mastered louder than folk) and how popular tracks in that genre tend to be on Spotify. The raw loudness–popularity correlation conflates this genre-level variation with any within-genre audio effect. Stratifying by genre (or adding genre as a covariate) blocks the backdoor path genre → loudness &amp; genre → popularity. Choice A misidentifies mediation — genre is not on a causal path from loudness to popularity. Choice C mischaracterizes genre as an instrument. Choice D misapplies collider logic: popularity is an outcome, not a collider between loudness and genre in this structure.",
  },
  {
    q: "The final panel shows a DAG where audio features form a cluster and popularity sits nearly disconnected, with a dashed &ldquo;★ fame · marketing · playlists (unmeasured)&rdquo; node pointing into popularity. Which statements correctly describe the causal-discovery limit illustrated here? Select ALL that apply.",
    choices: [
      "Causal discovery can only identify conditional-independence structure among the <em>measured</em> variables. If the true cause (artist fame, algorithmic promotion) is absent from the dataset, it is invisible to any discovery algorithm — no matter how large the sample.",
      "Collecting more audio features from the same tracks (e.g., key, mode, time signature) would likely reveal a strong cause of popularity, because the missing cause is simply an unmeasured audio property.",
      "The near-disconnection of popularity from the audio-feature graph is evidence of a <em>latent common cause</em>: something outside the data generates popularity, and its absence makes the feature–popularity edges appear weak.",
      "To identify the causal effect of audio properties on popularity, one would need either (a) an intervention (experimentally randomizing audio features, which is not feasible at scale) or (b) a good instrument — a variable that affects audio features but affects popularity <em>only through</em> those features.",
    ],
    answer: [0, 2, 3],
    explain:
      "Choices A, C, and D are correct. Choice A states the fundamental limit of discovery: you can only recover structure over measured variables; omitted causes create the appearance of a causally isolated outcome. Choice C correctly identifies the pattern as consistent with a latent common cause driving popularity independently of audio. Choice D correctly describes the two main routes to identification despite confounding — randomized experiment or a valid instrument. Choice B is wrong: more audio features (key, mode, time signature) are unlikely to capture fame or marketing spend, which are social and economic quantities unrelated to the acoustic signal itself.",
  },
];

export const questions = [
  {
    q: "Raw daily returns for 19 large-cap U.S. stocks are all positively correlated with one another " +
       "(average pairwise r&nbsp;≈&nbsp;0.19), even across unrelated sectors like Energy and Technology. " +
       "What is the most accurate causal explanation for this pervasive correlation?",
    choices: [
      "The stocks share real economic linkages — every company's sales depend on every other company's health, so the positive correlations are all genuine direct effects.",
      "The overall market (SPY) is a <strong>common cause</strong> of every stock's return: " +
        "when the market rises, almost all stocks rise with it, opening backdoor paths " +
        "that create spurious pairwise correlations between stocks that have no direct link.",
      "Stock prices are set by the same set of analysts, so the correlation is caused by " +
        "identical information being applied simultaneously to all stocks.",
      "Positive correlations among stocks are a statistical artifact of using log returns " +
        "instead of raw price changes and would disappear with a different return definition.",
    ],
    answer: 1,
    explain:
      "The market return (SPY) is a <strong>common cause</strong> of all individual stock returns: " +
      "it opens a backdoor path Stock A &larr; Market &rarr; Stock B for every pair, inducing " +
      "correlation even when A and B have no direct relationship. This is textbook confounding. " +
      "Choice A is wrong — real direct linkages exist only within narrow supply-chain or " +
      "customer–supplier relationships, not across the entire cross-section. " +
      "Choice C conflates information transmission with causation. " +
      "Choice D is incorrect — the log-vs-price distinction does not create or remove systematic correlation.",
  },
  {
    q: "We de-market each stock by computing <em>residual<sub>i</sub> = return<sub>i</sub> &minus; " +
       "&beta;<sub>i</sub> &sdot; return<sub>SPY</sub></em>, where &beta;<sub>i</sub> is the OLS slope. " +
       "After this transformation, the average pairwise residual correlation collapses to &asymp;&nbsp;0.01. " +
       "Which statements correctly describe what happened and what it means? Select ALL that apply.",
    choices: [
      "Regressing on SPY and taking residuals is equivalent to <strong>conditioning on the market</strong> in a linear model, which blocks the backdoor path Market &rarr; Stock<sub>i</sub> &amp; Market &rarr; Stock<sub>j</sub> and removes the spurious component of pairwise correlation.",
      "The collapse from r&nbsp;&asymp;&nbsp;0.19 to r&nbsp;&asymp;&nbsp;0.01 proves that the market causes 100% of every stock's return, leaving nothing unexplained.",
      "The near-zero average residual correlation means that, after controlling for the market, most stock pairs have no additional shared driver — they move together only because of SPY.",
      "The residualization procedure introduces a new confounder (the OLS intercept) that inflates the raw correlations; removing it is what actually shrinks the correlations.",
    ],
    answer: [0, 2],
    explain:
      "Choices A and C are correct. " +
      "OLS residualization on SPY is the linear analogue of conditioning: it removes the variation " +
      "attributable to the common cause, blocking the backdoor path. The dramatic collapse " +
      "(avg r 0.19 &rarr; 0.01) shows that most of the raw pairwise correlation was spurious — " +
      "driven by the shared market factor rather than direct links between the stocks. " +
      "Choice B overclaims: the residuals still contain idiosyncratic variation and sector-level structure; " +
      "the market explains much of the <em>co-movement</em> but not all of each stock's variance. " +
      "Choice D is wrong: the OLS intercept absorbs the mean return and does not inflate pairwise correlations.",
  },
  {
    q: "After removing the market, two patterns emerge: (1) the <strong>Energy cluster</strong> " +
       "(XOM–CVX–COP) has within-sector residual r&nbsp;&asymp;&nbsp;0.80 and the " +
       "<strong>Financials cluster</strong> (JPM–BAC–GS) has r&nbsp;&asymp;&nbsp;0.60, but " +
       "(2) the <strong>Technology cluster</strong> (AAPL, MSFT, NVDA, GOOGL, META) " +
       "essentially <em>dissolves</em> (within-Tech residual r&nbsp;&asymp;&nbsp;0.00). " +
       "Which interpretation is most accurate?",
    choices: [
      "Energy and Financials stocks share sector-specific common causes (e.g., oil prices drive all Energy stocks; interest-rate expectations drive all Financials), which survive de-marketing because they are distinct from the broad equity factor. Technology dissolves because these mega-cap tech stocks <em>dominate</em> the S&P 500 index, so SPY essentially measures tech — removing SPY removes the tech co-movement itself.",
      "Technology dissolves because tech stocks are more efficiently priced than Energy or Financials stocks, making them completely uncorrelated even at the raw level.",
      "Energy and Financials clusters survive because those sectors are more volatile, and higher variance always produces higher within-sector correlations after de-marketing.",
      "The survival of Energy and Financials clusters and the dissolution of Technology are both artifacts of using a short 500-day sample; a longer sample would equalize all within-sector residual correlations.",
    ],
    answer: 0,
    explain:
      "Choice A is correct and captures two distinct causal mechanisms. " +
      "For Energy: crude oil prices, geopolitical supply shocks, and refining margins are common causes " +
      "of XOM, CVX, and COP that are <em>not</em> captured by the broad market index; they " +
      "survive de-marketing. Similarly, short-term interest rates and credit spreads drive all bank " +
      "stocks simultaneously. For Technology: AAPL, MSFT, NVDA, GOOGL, and META together constitute " +
      "roughly 30% of the S&P 500 index in 2024–26; their co-movement is largely <em>what SPY measures</em>, " +
      "so regressing on SPY removes their shared factor. " +
      "Choice B wrongly conflates efficiency with raw-level correlation. " +
      "Choice C is wrong — variance does not mechanically inflate residual correlations. " +
      "Choice D is unfounded speculation; the sector-structure result is consistent across time periods.",
  },
  {
    q: "We test lag-1 cross-correlations: corr(residual<sub>i</sub>[day t], residual<sub>j</sub>[day t+1]). " +
       "These hover near zero for all sector pairs, with average |r|&nbsp;&asymp;&nbsp;0.01–0.03. " +
       "What is the correct interpretation, and what should we <em>not</em> conclude?",
    choices: [
      "Near-zero lag-1 correlation means that contemporaneous sector correlations (e.g., the Energy cluster) are also spurious and should be discarded.",
      "Near-zero lag-1 correlations are consistent with the <strong>efficient-market hypothesis</strong>: " +
        "if day-ahead predictability existed and were known, arbitrageurs would trade it away until it " +
        "vanished. This confirms we can discover <em>contemporaneous</em> structure but not a " +
        "reliable <em>forecasting</em> edge. We should <em>not</em> claim a trading signal.",
      "Near-zero lag-1 correlations prove that stock returns are completely random and have no causal " +
        "structure whatsoever — neither contemporaneous nor lagged.",
      "Because lag-1 correlations are near zero, any trading strategy based on yesterday's Energy " +
        "returns to predict today's Energy returns would reliably lose money in all market conditions.",
    ],
    answer: 1,
    explain:
      "Choice B is correct. Efficient-market logic implies that easily observable predictive signals " +
      "are arbitraged away: if XOM's residual yesterday reliably predicted CVX's residual today, " +
      "traders would exploit this until the gap closed. Near-zero lag-1 correlations are therefore " +
      "the <em>expected</em> outcome in liquid markets. " +
      "Crucially, this does <strong>not</strong> negate the contemporaneous sector structure (Energy r&asymp;0.80) — " +
      "that is real conditional dependence, it just cannot be converted into a day-ahead trading rule. " +
      "Choice A conflates lagged and contemporaneous correlations. " +
      "Choice C overstates the case — near-zero lag does not mean no structure, only no predictive structure. " +
      "Choice D is wrong — a reliable <em>losing</em> strategy would also be an arbitrage opportunity.",
  },
  {
    q: "A financial analyst argues: &ldquo;XOM and CVX have residual correlation 0.80 even after " +
       "removing the market. This means XOM <em>causes</em> CVX to move — so we can use XOM's " +
       "return today to <em>cause</em> better performance in a CVX position tomorrow.&rdquo; " +
       "Which critique is most precise from a causal-inference standpoint? Select ALL that apply.",
    choices: [
      "Correlation between de-marketed residuals reveals <strong>conditional dependence</strong> — a shared " +
        "sector-level common cause (e.g., oil prices) — not a direct causal arrow from XOM to CVX. " +
        "Causal discovery on observational data recovers a skeleton of dependencies, not directed causal edges.",
      "Even if XOM did cause CVX contemporaneously, the lag-1 test shows the predictive effect " +
        "decays to near zero by the next trading day, so no day-ahead trading edge follows from the contemporaneous correlation.",
      "The 0.80 residual correlation proves XOM is a valid <strong>instrumental variable</strong> for CVX, " +
        "so an IV regression would give an unbiased estimate of the causal effect.",
      "The analyst is correct — high residual correlation after controlling for the market is " +
        "sufficient evidence for a direct causal link and justifies using XOM as a trading signal for CVX.",
    ],
    answer: [0, 1],
    explain:
      "Choices A and B are correct. " +
      "Choice A applies the fundamental limit of observational causal discovery: undirected conditional " +
      "dependence (XOM &mdash; CVX in the residual graph) is consistent with <em>either</em> a direct link " +
      "XOM &rarr; CVX, or a common cause Oil Price &rarr; XOM &amp; Oil Price &rarr; CVX, or both. " +
      "Without intervention or a valid instrument, we cannot orient the edge. In practice, oil prices " +
      "are the dominant shared driver, not XOM causing CVX. " +
      "Choice B correctly notes that even if there were a contemporaneous link, the near-zero lag-1 " +
      "correlation implies it is not exploitable for day-ahead prediction. " +
      "Choice C is wrong: for XOM to be a valid instrument for CVX, it would need to affect CVX " +
      "<em>only through</em> the treatment of interest and be independent of confounders — " +
      "conditions that are almost certainly violated here since they share the same oil-price confounder. " +
      "Choice D is wrong: correlation — even after conditioning on the market — cannot establish " +
      "the direction of causation or rule out common causes.",
  },
];

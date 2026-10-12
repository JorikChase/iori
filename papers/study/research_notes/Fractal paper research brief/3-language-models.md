# Language models: diffusion LMs, multi-token prediction, and the scale structure of text (as of Oct 2026)

Scope note. Three parts as assigned: (a) diffusion language models, (b) next-token vs multi-token prediction, (c) power laws and long-range structure of text. Each key question below is answered with cited findings; everything I could not verify is listed under Gaps. arXiv identifiers of the form 26xx.xxxxx are 2026 preprints (unreviewed unless a venue is noted). Dates are submission dates unless stated.

---

## Key question 1 — Do diffusion LMs actually generate structure-first? Measured evidence or anecdote?

### Takeaway
No shipped diffusion LM (LLaDA, Dream, Mercury, Gemini Diffusion, BD3-LM) measures or claims a syntax-before-content or long-range-before-local ordering; Mercury and Google describe generation as "coarse-to-fine" / "refining noise" without any measurement. The only quantitative order studies (DiffuCoder 2025, "What Gets Unmasked First?" 2026) show the opposite of outline-first: confidence-based unmasking commits high-certainty *content* (entities) first, function words and punctuation later, and after SFT it commits sentence-end tokens prematurely; a June 2026 paper argues explicitly that standard token-wise diffusion LMs do not produce coarse-to-fine structure automatically.

### Cited findings

**What each model diffuses and how tokens are resolved**

- D3PM (Austin et al., 2021): discrete diffusion with structured transition matrices — discretized-Gaussian, nearest-neighbour-in-embedding-space, and an absorbing-state matrix with a [MASK] token; the absorbing variant "links diffusion to autoregressive and mask-based models"; evaluated on character-level text and LM1B at scale, CIFAR-10 for images. — [arXiv:2107.03006](https://arxiv.org/abs/2107.03006)
- SEDD (Lou, Meng, Ermon): "score entropy", a loss that "naturally extends score matching to discrete spaces"; reduces perplexity 25–75% vs prior diffusion LMs, beats GPT-2 at comparable size on perplexity, and trades compute for quality with "32× fewer network evaluations" for similar quality; ICML 2024 Oral. — [arXiv:2310.16834](https://arxiv.org/abs/2310.16834)
- MDLM (Sahoo et al., NeurIPS 2024): masked (absorbing-state) discrete diffusion with a Rao-Blackwellized objective that is "a mixture of classical masked language modeling losses"; encoder-only; supports semi-autoregressive generation of arbitrary length; "approaches AR perplexity". — [arXiv:2406.07524](https://arxiv.org/abs/2406.07524)
- LLaDA (Nie et al., Feb 2025; v3 Oct 2025): "forward data masking process and a reverse generation process, parameterized by a Transformer to predict masked tokens" — i.e. absorbing/masked discrete tokens, not Gaussian noise on embeddings. 8B, 2.3T pretraining tokens, 0.13M H800 GPU-hours. — [arXiv:2502.09992](https://arxiv.org/abs/2502.09992)
- LLaDA sampling order: random remasking (Alg. 4) is the theoretically motivated baseline; **low-confidence remasking** (Alg. 5) is the default — at each step the least-confident predicted tokens are remasked, the rest kept; semi-autoregressive block sampling is supported without retraining and raises GSM8K 69.4→78.6 and MATH 31.9→42.2 on the Instruct model, attributed to EOS padding in SFT data causing early termination under pure low-confidence remasking. LLaDA is incompatible with KV caching. — [arXiv:2502.09992 (HTML)](https://arxiv.org/html/2502.09992)
- Dream 7B (Ye et al., HKU + Huawei Noah's Ark, Apr 2025): discrete diffusion initialised from Qwen2.5 7B weights, 580B pretraining tokens; "decoding hyperparameters can be adjusted to move from left-to-right toward random-order generation"; "not constrained to sequential (e.g., left-to-right) generation"; the blog does not describe a structure-first behaviour. — [HKU NLP blog](https://hkunlp.github.io/blog/2025/dream/); [arXiv:2508.15487](https://arxiv.org/abs/2508.15487)
- BD3-LM (Arriola et al., ICLR 2025 Oral): interpolates between discrete diffusion and AR; samples "one block at a time, conditioned on previously sampled blocks", diffusion in parallel within each block, tokens never remasked once unmasked, KV cache across completed blocks; block sizes L′ = 4, 8, 16 evaluated; the paper "does not specify a token order within a block". — [arXiv:2503.09573 (HTML)](https://arxiv.org/html/2503.09573v3)
- Mercury (Inception Labs, Jun 2025): "diffusion process over token sequences"; generation "starts from random noise and iteratively refines the output", described by the authors as "generated in a coarse-to-fine way" with a Transformer that "modifies multiple tokens in parallel". The report does not state the noise type, number of denoising steps, or whether any left-to-right order is used. — [arXiv:2506.17298 (HTML)](https://arxiv.org/html/2506.17298)
- Gemini Diffusion (Google DeepMind, announced at I/O, 20 May 2025): the model page says it "Generates entire blocks of tokens at once", learns "by refining noise, step-by-step", and "Corrects errors during generation for more consistent outputs"; it does not use the phrase coarse-to-fine and gives no description of token order; status "experimental demo". — [DeepMind model page](https://deepmind.google/models/gemini-diffusion/); announcement date per [Fortune, 21 May 2025](https://dc.fortune.com/2025/05/21/gemini-diffusion-google-io-sleeper-hit-blazing-speed-ai-model-wars/)

**Measured generation order (the actual evidence)**

- DiffuCoder (Gong et al., Apple; ICLR 2026): defines **local AR-ness@k** ("ratio of predicted sequence matching the pattern of next token prediction within range k") and **global AR-ness@k** (fraction of steps in which the decoded token lies in the first k masked positions). Findings: dLLMs "do not always decode in a purely AR manner" but both metrics are "closer to 1 than 0"; models adapted from AR LLMs (Dream, DiffuCoder) show higher AR-ness than LLaDA trained from scratch; "a higher temperature also substantially lowers AR-ness"; first-step confidence shows an "L"-shaped "entropy sink" — positions immediately right of the prefix get high confidence from "stronger positional signals and closer context"; on code the model "tends to produce later tokens first, leaving some early masked tokens un-recovered until much later". — [arXiv:2506.20639v2](https://arxiv.org/html/2506.20639v2); [ICLR 2026 poster](https://iclr.cc/virtual/2026/poster/10011497)
- "What Gets Unmasked First? Trajectory Analysis of Diffusion Models for Graph-to-Text Generation" (Wang, Devasier, Li, UT Arlington, 29 May 2026): logs the normalised denoising step at which each output token is committed in LLaDA-8B (and Dream-7B as a check) on WebNLG/LAGRANGE, grouped into entity / relation / stop word / punctuation / other. Mean commit step for LLaDA: **entity 0.385, stop word 0.576, relation 0.597, punctuation 0.631, other 0.633** — "MDLMs naturally prioritize entities first, followed by relational and function words, with structural tokens resolved last." Dream-7B shows the entity-first ordering (0.423) but interleaves punctuation with stop words. — [arXiv:2605.31564](https://arxiv.org/html/2605.31564)
- Same paper, failure mode: after SFT, LLaDA "prematurely anchor[s]" sentence-ending tokens — mean first-period step 0.720 (base) → 0.385 (SFT); content tokens committed before the first period 60.9% → 17.8%; EOS per sample 37.2 → 21.4. A training-free fix multiplying structural-token confidence by λ∈(0,1] raises content-before-first-period to 89.9% at λ=0.25 and recovers +9.4 BLEU-4. Caveat: single runs, validated only on LLaDA. — [arXiv:2605.31564](https://arxiv.org/html/2605.31564)
- "When to Plan, When to Polish: Noise Level as a Granularity Axis for Diffusion Language Models" (Li, Shi, Yan, 19 Jun 2026; v2 Aug 2026): standard token-wise diffusion LMs keep "training corruption and inference commitment at the token level throughout denoising"; at high noise this "leaves scattered local fragments rather than coherent evidence, which makes early coarse structure hard to form". Proposes Noise-Dependent Granularity Control (commit coherent token groups at high noise, tokens at low noise) and reports "earlier skeleton formation, better ordered recovery" on WritingPrompts — qualitative in the abstract, no per-step numbers visible. — [arXiv:2606.21802](https://arxiv.org/abs/2606.21802)
- Confidence-based ordering is the default mechanism: samplers "select a fixed (or adaptive) number of positions with the highest posterior probability and convert them from [MASK] to concrete tokens"; genuinely uncertain positions have flat posteriors and are unmasked late; an oracle "Gt-Margin" order "prioritizes easier positions first". — [Re-evaluating Confidence Remasking, arXiv:2606.12232](https://arxiv.org/html/2606.12232v1); [Confidence-Based Decoding is Provably Efficient, arXiv:2603.22248](https://arxiv.org/html/2603.22248)
- Latent (not token) diffusion: Apple's PLANNER generates paragraph latents and illustrates a hotel review evolving from vague to detailed over 10 steps — an illustration, not a quantitative order test. — [Apple ML Research](https://machinelearning.apple.com/research/latent-language-diffusion-model)

### Inferences
- Across all shipped models the order is set by a confidence heuristic (or by left-to-right blocks), not by any linguistic hierarchy. "Easiest first" in practice means high-probability content tokens anchored near the prefix, not an outline. The only directly measured ordering (entities → function words → punctuation) is roughly the reverse of outline-first.
- "Coarse-to-fine" in Mercury's and Google's descriptions is inherited from image-diffusion vocabulary; for masked discrete diffusion there is no frequency axis — a token is either masked or not — so the image analogy does not transfer without a mechanism (which the 2026 "When to Plan" paper tries to add).
- The AR-ness metrics show that diffusion LMs retain a strong left-to-right bias, especially when initialised from AR weights (Dream, DiffuCoder, Mercury presumably). Dream's planning advantage on Countdown/Sudoku is about constraint satisfaction, not document structure.

### Gaps
- No paper measures long-range-before-local resolution (e.g. commit time vs syntactic depth, or vs distance from discourse boundaries) for open-ended document generation. The 2026 graph-to-text study is the closest and is on 20-token outputs.
- Mercury's and Gemini Diffusion's internals (noise type, steps, ordering) are not published; "coarse-to-fine" there is unverifiable.
- The LLaDA paper's sampling-order visualisation (Table 13 in the HTML, darker = later) is an image; I could not read its pattern.

---

## Key question 2 — Exact speed and quality numbers (Mercury, Gemini Diffusion, and the open models)

### Takeaway
Mercury Coder Mini/Small: 1109 / 737 tok/s on H100 (Artificial Analysis), HumanEval 88.0 / 90.0, roughly matching GPT-4o Mini / Gemini 2.0 Flash-Lite on code while 5–20× faster in deployed tok/s; Gemini Diffusion: 1,479 tok/s sampling (excl. 0.84 s overhead) at parity with Gemini 2.0 Flash-Lite on code but well below it on knowledge/reasoning (GPQA 40.4 vs 56.5, Global MMLU Lite 69.1 vs 79.0). Open 8B models match same-size AR on benchmarks but still trail AR on perplexity (BD3-LM 20.7 vs AR 17.5 on OpenWebText).

### Cited findings

**Mercury Coder (Inception Labs, 17 Jun 2025)** — all pass@1 %, speed in tok/s from Artificial Analysis (Mercury on H100; comparators are API medians across providers, so not identical hardware):

| Model | HumanEval | MBPP | EvalPlus | MultiPL-E | LiveCodeBench | FIM avg | tok/s |
|---|---|---|---|---|---|---|---|
| Mercury Coder Mini | 88.0 | 77.1 | 78.6 | 74.1 | 17.0 | 82.2 | 1109 |
| Mercury Coder Small | 90.0 | 76.6 | 80.4 | 76.2 | 25.0 | 84.8 | 737 |
| GPT-4o Mini | 88.0 | 74.6 | 78.5 | 72.0 | 23.0 | 60.9 | 59 |
| Claude 3.5 Haiku | 86.0 | 78.0 | 75.1 | 72.3 | 31.0 | 45.5 | 61 |
| Gemini 2.0 Flash-Lite | 90.0 | 75.0 | 77.3 | 79.5 | 18.0 | 60.2 | 201 |
| Qwen 2.5 Coder 7B | 88.0 | 80.0 | 79.3 | 75.3 | 9.0 | 72.9 | 195 |
| Codestral 2501 | 85.0 | 72.2 | 75.6 | 73.4 | 24.0 | 82.5 | 171 |

— [arXiv:2506.17298](https://arxiv.org/html/2506.17298). Abstract: "outperform speed-optimized frontier models by up to 10x on average while maintaining comparable quality"; second on quality and fastest on Copilot Arena. — [arXiv abs](https://arxiv.org/abs/2506.17298)

**Gemini Diffusion (Google DeepMind, May 2025)** — sampling speed 1,479 tok/s "excluding overhead", overhead 0.84 s; benchmarks vs Gemini 2.0 Flash-Lite (pass@1): LiveCodeBench v6 30.9 vs 28.5; BigCodeBench 45.4 vs 45.8; LBPP v2 56.8 vs 56.0; SWE-Bench Verified (non-agentic, single-turn) 22.9 vs 28.5; HumanEval 89.6 vs 90.2; MBPP 76.0 vs 75.8; GPQA Diamond 40.4 vs 56.5; AIME 2025 23.3 vs 20.0; BIG-Bench Extra Hard 15.0 vs 21.0; Global MMLU Lite 69.1 vs 79.0. — [DeepMind model page](https://deepmind.google/models/gemini-diffusion/). Press put end-to-end at ~1,000–2,000 tok/s, "four to five times faster" than Google's largest public model; Simon Willison measured 857 tok/s on a demo; no parameter count, context window or pricing published. — [Fortune](https://dc.fortune.com/2025/05/21/gemini-diffusion-google-io-sleeper-hit-blazing-speed-ai-model-wars/); [Simon Willison](https://simonwillison.net/b/8700)

**LLaDA 8B (Feb 2025)** — Base vs LLaMA3 8B Base: MMLU 65.9 vs 65.4; GSM8K 70.3 vs 48.7; HumanEval 35.4 vs 34.8; MATH 31.4 vs 16.0. Instruct vs LLaMA3 8B Instruct: MMLU 65.5 vs 68.4; GSM8K 69.4 vs 78.3; HumanEval 49.4 vs 59.8 (no RL alignment applied). Reversal poem completion: LLaDA 51.8 forward / 45.6 reverse vs GPT-4o 82.7 / 34.3. — [arXiv:2502.09992 (HTML)](https://arxiv.org/html/2502.09992)
- LLaDA speed (App. B.7): single A100-80GB, batch 1, bf16, 256-token output; steps 32/64/128/256 ⇒ 8/4/2/1 tokens per forward pass; "1.5 and 1.8 times higher throughput" than LLaMA3 8B on GSM8K and MATH at matched accuracy, comparable on HumanEval at matched throughput, behind on MBPP; no absolute tok/s given; memory 17.03 GB vs LLaMA3 16.32 GB with KV cache. — [arXiv:2502.09992 (HTML, offset)](https://arxiv.org/html/2502.09992)

**Dream 7B (Apr 2025)** — "matches or exceeds" similar-size AR models (Qwen2.5 7B, LLaMA3 8B) on general/math/code; on Countdown and Sudoku both diffusion models (Dream, LLaDA) beat the two AR baselines and "at times" DeepSeek V3 671B; fewer diffusion steps = faster but coarser output. Numbers are in a figure, not in the text I could read. — [HKU NLP blog](https://hkunlp.github.io/blog/2025/dream/)

**Perplexity table (BD3-LM paper; diffusion values are upper bounds)** — LM1B / OpenWebText: AR 22.83 / 17.54; SEDD ≤32.68 / ≤24.10; MDLM ≤31.78 / ≤22.98; BD3-LM L′=16 ≤30.60 / ≤22.27; L′=8 ≤29.83 / ≤21.68; L′=4 ≤28.23 / ≤20.73. Up to 13% better than MDLM on LM1B. Sampling: L=1024 with L′=16 uses 1K NFEs vs 40K for SSD-LM; training within <2× of diffusion training speed; no wall-clock tok/s reported. — [arXiv:2503.09573v3](https://arxiv.org/html/2503.09573v3)

### Inferences
- The speed advantage is real but conflates two things: parallel token emission (several tokens per forward pass) and Inception/Google's serving stack; Mercury's comparators are API medians, not same-GPU measurements. Only LLaDA reports same-hardware throughput, and there the gain is 1.5–1.8×, not 10×.
- Quality parity holds for code and short-answer math; on knowledge/reasoning (GPQA, MMLU) Gemini Diffusion is clearly behind its AR sibling. Likelihood-wise, every diffusion LM still trails AR at equal data (perplexity gap ~3 points on OWT).

### Gaps
- Mercury's model sizes, training data, and denoising-step count are not disclosed. Gemini Diffusion's size and architecture are undisclosed.
- No independent benchmark of Gemini Diffusion exists in what I found (Willison noted none at announcement).
- Dream 7B exact benchmark numbers were not extractable from the blog text (they are in an image/table).

---

## Key question 3 — DeepSeek-V3 MTP and the multi-token prediction landscape

### Takeaway
Verified: DeepSeek-V3's MTP uses D=1 sequential module (one extra token, causal chain kept), shared embedding and output head, loss weight λ=0.3 for the first 10T tokens then 0.1; at inference the modules are either discarded or reused as a speculative-decoding draft, with second-token acceptance "between 85% and 90%" and "1.8 times TPS". The 85–90% figure in the assignment is correct. Beyond DeepSeek, MTP heads now ship in Qwen3-Next, GLM-4.5, MiMo, LongCat; Meta published the method (Gloeckle et al., FAIR) but I found no evidence Meta ships MTP in Llama.

### Cited findings

**DeepSeek-V3 (Dec 2024)**
- §2.2: "our MTP implementation uses D sequential modules to predict D additional tokens"; "we sequentially predict additional tokens and keep the complete causal chain at each prediction depth" (contrasted with Gloeckle et al.'s parallel heads); "its embedding layer is shared with the main model" and "its output head is shared with the main model". — [arXiv:2412.19437](https://arxiv.org/html/2412.19437)
- §4.2: "The multi-token prediction depth D is set to 1"; "The MTP loss weight λ is set to 0.3 for the first 10T tokens, and to 0.1 for the remaining 4.8T tokens"; the objective is "the average of the MTP losses across all depths" times λ. — [arXiv:2412.19437](https://arxiv.org/html/2412.19437)
- §2.2 on inference: "we can directly discard the MTP modules" or "repurpose these MTP modules for speculative decoding to further improve the generation latency". §4.5.1 ablation: "during inference, we directly discard the MTP module, so the inference costs of the compared models are exactly the same". — [arXiv:2412.19437](https://arxiv.org/html/2412.19437)
- §5.4.3 "Multi-Token Prediction Evaluation": "the acceptance rate of the second token prediction ranges between 85% and 90%" across "various generation topics"; "Combined with the framework of speculative decoding ... delivering 1.8 times TPS". No hardware, batch size or workload stated. — [arXiv:2412.19437 (offset)](https://arxiv.org/html/2412.19437)
- Ablation (Table 4): small MoE baseline → w/ MTP: BBH 39.0→41.4, MMLU 50.0→53.3, HumanEval 20.7→26.8, GSM8K 25.4→31.4, MATH 10.7→12.6; large MoE: BBH 70.0→70.7, MMLU 67.5→66.6 (the one decline), HumanEval 44.5→53.7, GSM8K 72.3→74.0, MATH 38.6→39.8. — [arXiv:2412.19437](https://arxiv.org/html/2412.19437)
- Production use: NVIDIA's TensorRT-LLM engineering blog implements DeepSeek-R1 MTP as the draft stage of speculative decoding ("MTP modules ... can double as draft models"). DeepSeek's own Day-6 inference-system write-up (as summarised by a secondary source) describes EP/DP layout and KV-cache hit rates but I could not confirm from a primary source whether MTP drafting is enabled in DeepSeek's production serving. — [NVIDIA TensorRT-LLM blog](https://nvidia.github.io/TensorRT-LLM/latest/blogs/tech_blog/blog02_DeepSeek_R1_MTP_Implementation_and_Optimization.html); [Analytics Vidhya summary of Day 6](https://www.analyticsvidhya.com/blog/2025/03/deepseek-opensourceweek-day-6-inference-system-overview/)

**Gloeckle et al. 2024 (Meta FAIR), "Better & Faster LLMs via Multi-token Prediction"**
- n independent output heads on a shared trunk predict the next n tokens; 4-token prediction highlighted; 13B models solve "12% more problems on HumanEval and 17% more on MBPP" than next-token baselines; "up to 3 times faster at inference" even at large batch; benefits grow with model size; also helps induction heads and algorithmic reasoning on small tasks. Submitted 30 Apr 2024. Affiliation (Meta FAIR) is from author list (Gloeckle, Youbi Idrissi, Rozière, Lopez-Paz, Synnaeve), not stated on the abstract page. — [arXiv:2404.19737](https://arxiv.org/abs/2404.19737)

**Medusa (Cai et al., Jan 2024; v3 Jun 2024)**
- Extra decoding heads predict several subsequent tokens in parallel; tree attention verifies multiple candidate continuations per step; Medusa-1 (heads on frozen backbone) >2.2× speedup lossless; Medusa-2 (joint fine-tuning) 2.3–3.6×; self-distillation and "typical acceptance" scheme. Authors incl. Tri Dao, Jason D. Lee. — [arXiv:2401.10774](https://arxiv.org/abs/2401.10774)

**Speculative decoding**
- Leviathan, Kalman, Matias (ICML 2023 Oral, arXiv 30 Nov 2022): a small approximation model proposes, the large model verifies in parallel; outputs are "identical to the standard implementation"; 2–3× acceleration on T5-XXL. — [arXiv:2211.17192](https://arxiv.org/abs/2211.17192)
- Chen et al. (DeepMind, 2 Feb 2023): draft model + modified rejection sampling that "preserves the distribution of the target model within hardware numerics"; 2–2.5× decoding speedup on Chinchilla 70B in a distributed setup. — [arXiv:2302.01318](https://arxiv.org/abs/2302.01318)

**Who ships MTP (2025–2026)**
- A March 2026 arXiv paper states the DeepSeek-style MTP design "has been widely integrated into prominent industrial LLMs, such as MiMo, GLM, LongCat, and Qwen3-Next". — [arXiv:2603.17942](https://arxiv.org/html/2603.17942v1)
- Qwen3-Next-80B-A3B ships MTP heads; vLLM serves it with `--speculative-config '{"method": "qwen3_next_mtp", "num_speculative_tokens": 2}'`; NVIDIA Megatron-Bridge has a Qwen3-Next MTP recipe. No official acceptance percentage found. — [hardware-corner guide](https://www.hardware-corner.net/multi-token-prediction-llm-speed/); [NVIDIA Megatron-Bridge MTP docs](https://docs.nvidia.com/nemo/megatron-bridge/0.6.0/training/multi-token-prediction.html); [Raschka architecture gallery](https://sebastianraschka.com/llm-architecture-gallery/mtp/)
- GLM-4.5 / GLM-4.5-Air: release notes (quoted on Reddit, secondary) say "an MTP layer is added to support speculative decoding during inference". — [r/LocalLLaMA quote](https://reddit.birdcat.cafe/r/LocalLLaMA/comments/1mbg1ck/glm45_released)
- Apple, "Your LLM Knows the Future" (Samragh et al., Jul 2025): existing AR models already hold "a surprising amount of internal knowledge about upcoming tokens"; gated-LoRA + masked-input fine-tuning yields ~5× faster code/math and ~2.5× chat "without any loss in quality" (authors' claims). — [arXiv:2507.11851](https://arxiv.org/abs/2507.11851v1); [Apple ML Research](https://machinelearning.apple.com/research/prediction-potential)
- EPFL/Sony 2025: pretrained next-token models "inherently possess multi-token prediction capabilities" extractable by numerical marginalisation; adapting dedicated heads is harder. — [alphaxiv overview of arXiv:2502.09419](https://alphaxiv.org/overview/2502.09419v1)
- llama.cpp did not support MTP heads at the time of the guide (layers skipped on load). — [hardware-corner guide](https://www.hardware-corner.net/multi-token-prediction-llm-speed/)

### Inferences
- DeepSeek's MTP is best read as a training-time auxiliary objective (densifying the signal, D=1) that happens to double as a draft model; the 1.8× TPS is a speculative-decoding gain, which means the base model's output distribution is unchanged. It is not "generating two tokens at once" in the sense of a joint distribution.
- All of these methods (MTP, Medusa, speculative decoding) are ways to amortise left-to-right generation; none changes the order in which text is committed. They are therefore irrelevant as evidence for or against structure-first generation.

### Gaps
- Whether DeepSeek's own API/serving uses MTP drafting is not confirmed from a primary DeepSeek source.
- No official Meta statement found on whether Llama 4 (or any Llama) uses MTP in training or inference; absence of evidence, not evidence of absence. No official Qwen/Zhipu acceptance-rate numbers found.

---

## Key question 4 — Which power laws of text are solidly established, and with what exponents? Is there a measured "spectrum" of language?

### Takeaway
Solid: Zipf (α≈1, Zipf–Mandelbrot shift β≈2.7), Heaps (β≈1/α asymptotically, size-sensitive), burstiness (Weibull/stretched-exponential inter-occurrence intervals, exponent ≈0.7 for rare words), and long-range correlation of word sequences (Hurst H≈0.65–0.75 by R/S on rank series; DFA-type exponent γ≈0.14–0.48; LLM-estimated H≈0.70) with 1/f^β sentence-length spectra at β≈1/2. Shuffling sentences collapses H toward 0.5, so the memory lives above the sentence. The link to hierarchy is Lin & Tegmark's theorem that power-law mutual-information decay requires a hierarchical (context-free-like) generative process, Markov chains giving exponential decay — but no one has yet connected these exponents to diffusion LMs or to outline-first generation.

### Cited findings

**Zipf and Heaps**
- Piantadosi (2014, Psychon. Bull. Rev. 21:1112–1130, doi:10.3758/s13423-014-0585-6): rank–frequency f(r) ∝ 1/r^α with α≈1; Zipf–Mandelbrot f(r) ∝ 1/(r+β)^α with α≈1, β≈2.7; "robustly Zipfian" across the American National Corpus, Google Books, 17-language Swadesh lists, Brown/Penn Treebank; the causal origin "remains unresolved"; Heaps' law deliberately set aside. — [PMC4176592](https://pmc.ncbi.nlm.nih.gov/articles/PMC4176592/)
- Heaps' exponent is tied to Zipf's by β = 1/α "at least in the infinite-system limit", with the finite-size Heaps exponent "sensitive to the system size"; a 2014 PRL argues a careful definition of Zipf's law leads to violation of Heaps' law in random systems. — [Lü, Zhang, Zhou, PLoS ONE 2010](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC2996287/); [PRL 114, 238701 (2015)](https://link.aps.org/doi/10.1103/PhysRevLett.114.238701); [Font-Clos & Corral, arXiv:1303.0705](https://arxiv.org/pdf/1303.0705)

**Burstiness**
- Altmann, Pierrehumbert, Motter (PLoS ONE 4(11):e7678, 2009, doi:10.1371/journal.pone.0007678): inter-occurrence gaps of a word deviate from Poisson and fit a stretched exponential (Weibull); the deviation depends mainly on semantic type and only weakly on frequency. — [PMC2770836](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC2770836/); [arXiv:0901.2349](https://arxiv.org/pdf/0901.2349)
- Tanaka-Ishii & Bunde (PLoS ONE, 28 Nov 2016, doi:10.1371/journal.pone.0164658): ten single-author texts >200k words in English, French, German, Chinese, Japanese (Ulysses, Les Misérables, Phänomenologie des Geistes, Hong Lou Meng, Dogra Magra, Essais, The Great Boer War, Die Traumdeutung, Journey to the West, Daibosatsu Tōge); return intervals of rare words follow a Weibull with β≈0.7 (0.68–0.86 at large thresholds); intervals are long-range correlated with autocorrelation exponent γ = 0.14–0.48 (mean ≈0.31–0.36); DFA exponent h = 1 − γ/2; shuffling gives β≈1.0 (exponential) and DFA ∝ s^{1/2}; rhythm "surprisingly universal" across languages, with no indication the exponents depend on language. — [PLoS ONE](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0164658)

**Long-range correlations / Hurst**
- Ebeling & Pöschel, "Entropy and long-range correlations in literary English", Europhys. Lett. 26, 241 (1994), doi:10.1209/0295-5075/26/4/001: Moby Dick and Grimm's tales; letter-pair mutual information decays as a power law, entropy per letter decays as n^{-1/2}, correlations extend over "a few hundred letters"; motivation includes that "an author's style and overall plan would link text from beginning to end". — [arXiv:chao-dyn/9309005](https://arxiv.org/abs/chao-dyn/9309005); [Ebeling, Pöschel, Albrecht 1995, IJBC 5:51–61](https://ar5iv.labs.arxiv.org/html/cond-mat/0204045)
- Montemurro & Pury, "Long-range fractal correlations in literary corpora", Fractals 10(4):451–461 (2002): word → frequency rank, normalised, cumulated to a walk, R/S analysis. Hurst H: Shakespeare (36 plays, 885k words) 0.687±0.040; Dickens (56 books, 5.6M words) 0.738±0.033; Darwin (11 books, 1.5M words) 0.745±0.045; Webster's 1913 dictionary 0.690±0.031. Controls: sentence-shuffled ≈0.57, rank-shuffled ≈0.52, Simon's model 0.55, 7-letter Markov text 0.533. Conclusion: syntax alone is not enough; long-range correlation comes from a corpus-wide word-association structure. — [ar5iv cond-mat/0201139](https://ar5iv.labs.arxiv.org/html/cond-mat/0201139); [arXiv abs](https://arxiv.org/abs/cond-mat/0201139)
- Altmann, Cristadoro, Degli Esposti, "On the origin of long-range correlations in texts", PNAS 109(29):11582–11587 (2012), doi:10.1073/pnas.1117723109: traces how correlations "flow from highly structured linguistic levels down to the building blocks of a text (words, letters, etc.)"; correlations "take form of a bursty sequence of events once we approach the semantically relevant topics of the text"; the mechanism "can be equally applied to other hierarchical settings". — [PMC3406867](https://pmc.ncbi.nlm.nih.gov/articles/PMC3406867); [arXiv:1207.0658](https://www.arxiv.org/abs/1207.0658)
- Alabdulmohsin, Tran, Dehghani (Google DeepMind), "Fractal patterns may illuminate the success of next-token prediction" (arXiv Feb 2024; v2 May 2024): language is "self-similar, exhibiting complexities at all levels of granularity" with no characteristic context length, and long-range dependent with Hurst parameter ≈0.7, estimated from LLM-computed per-token bits; fractal parameters robust across domains and architectures; small variations in them improve on BPB for predicting downstream performance. — [arXiv:2402.01825](https://arxiv.org/abs/2402.01825)

**1/f spectra**
- Drożdż et al., "Quantifying origin and character of long-range correlations in narrative texts", Information Sciences 331:32–44 (2016): power spectra of sentence-length variability "universally develop a convincing '1/f^β' scaling with the average exponent β ≈ 1/2" (individual texts 1/4–3/4, over ~two decades of frequency); shuffled texts flat (β=0); the correlations show up in full-stop recurrence times, "to a much lesser degree in the recurrence times of the most frequent words"; multifractality strongest in "stream of consciousness" novels. — [arXiv:1412.8319](https://arxiv.org/abs/1412.8319)
- Earlier spectral work on Moby Dick: a power-law exponent "estimate ... is 0.8" with the caveat that a precise value is hard to extract; shuffling below page level destroys the low-frequency branch. — [arXiv:adap-org/9507007](https://arxiv.org/pdf/adap-org/9507007)

**Hierarchy ⇒ power law (the theoretical bridge)**
- Lin & Tegmark, "Criticality in Formal Languages and Statistical Physics", Entropy 19, 299 (2017): mutual information between symbols "decays exponentially in any probabilistic regular grammar" (Markov), but can decay as a power law in context-free (recursive, hierarchical) grammars; measured MI on Wikipedia (100 MB), a French corpus, slate.com English, Bach, and human chromosome 5 — "All measured curves are seen to decay roughly as power laws", qualitatively like a 1D slice of the 2D Ising model (slope −1/2), but no fitted exponents for text; a bigram model captures "less than a fifth of the mutual information captured by the LSTM-RNN", and LSTMs "under-predict long-range mutual information". — [arXiv:1606.06737](https://arxiv.org/html/1606.06737)
- Takahashi & Tanaka-Ishii, "Evaluating Computational Language Models with Scaling Properties of Natural Language", Computational Linguistics 45(3) (2019): five scaling properties (Zipf, Heaps, Ebeling's method, Taylor's law, long-range correlation); Taylor exponent ζ ranges 0.5 ≤ ζ ≤ 1.0 in real text; gated RNNs (LSTM/GRU/QRNN) "are the only computational models that can reproduce the long memory behavior"; n-grams, PCFG, Simon/Pitman–Yor models do not; the Taylor exponent is "a good indicator of model quality". — [ACL Anthology J19-3003](https://aclanthology.org/J19-3003/); [arXiv:1804.08881](https://arxiv.org/pdf/1804.08881)

### Inferences
- There is no single published "spectrum of language" in the sense of one exponent per scale from morpheme to book. What exists is a stack of separate laws at different levels: Zipf/Heaps (vocabulary, scale-free in rank, not in position), Weibull burstiness (word recurrence), H≈0.7 / β≈1/2 (position-dependent long memory above the sentence), and power-law MI decay (characters). Each is robust; the exponents are consistent with one another (h = 1 − γ/2 with γ≈0.3 gives h≈0.85 for rare-word intervals; R/S on all words gives 0.69–0.75; LLM-bits give 0.70; 1/f^{1/2} corresponds to H≈0.75 for a stationary increment process), but no paper unifies them.
- The strongest statement the literature supports is: text has memory at every scale above the sentence, that memory is destroyed by shuffling sentences and is absent from Markov/PCFG/n-gram generators, and a hierarchical recursive generative process is sufficient (Lin & Tegmark) to produce it. That is an argument *for* hierarchical generation in principle, but it was made for grammars and LSTMs, not for diffusion.
- The 1/f^β result is on sentence lengths, and Montemurro & Pury's sentence-shuffle control shows that syntax-preserving shuffles kill H. So the measured memory is about topic/discourse organisation, which is exactly the level an "outline" would control.

### Gaps
- I found no paper that measures Hurst / Taylor / MI-decay exponents on text generated by a diffusion LM, or that compares them to AR output at equal size. (Takahashi & Tanaka-Ishii 2019 predates diffusion LMs; Alabdulmohsin et al. 2024 measure the data, not generated text.)
- No paper connects outline-first / hierarchical planning in LMs to these exponents; the closest is Lin & Tegmark's grammar theorem and the PCFG result in Takahashi & Tanaka-Ishii (a PCFG does *not* reproduce long memory, which cuts against the naive "hierarchy ⇒ power law" story and suggests the real driver is topical/semantic memory, not syntax).
- No clean word-level 1/f analysis was found; the word-level spectral evidence is older and the exponent (0.8) is self-described as imprecise.
- Heaps exponent "typical" values (often quoted ~0.5–0.6) were not pinned to a primary source in this pass.

---

## What this means for the paper

A paper titled "Diffusion over the whole document" can honestly say today that masked-diffusion LMs resolve a document in parallel in an order that is *not* left-to-right and is tunable, and that text demonstrably carries scale-free memory above the sentence (H≈0.7, 1/f^{1/2} sentence-length spectra, power-law MI decay) which Markov and n-gram generators cannot reproduce. It cannot say that any existing diffusion LM generates structure first: the only measurements show confidence-ordered unmasking commits entities first and function/structural tokens last, with SFT models anchoring sentence ends prematurely, and "coarse-to-fine" in Mercury's and Google's copy is unmeasured image-diffusion vocabulary. To make the structure-first claim, one would have to log per-token commit step against syntactic depth or discourse position on long generations and show early commitment at coarse levels, and measure Hurst/Taylor/MI-decay exponents of diffusion versus AR output at equal size to show the long-memory law is reproduced.

#!/usr/bin/env python3
"""Write the series pages: the index (papers/index.html) and the papers still in preparation.

The finished paper (fractals.html) is written by hand and is not touched here. Each paper in preparation
is a page in the same look as paper 0, with its abstract, its planned contents and what already exists.
Edit SERIES and STUBS below, then:

    python3 papers/series.py && python3 site.py all

site.py fills the SEO block and the site menu. When a paper is written for real, remove it from STUBS.
"""
import html
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# The series, in order. (number, slug, title, state, one-paragraph description)
SERIES = [
    ("0", "fractals.html", "Fractal Optimization Through a Procedural Lens", "October 2026",
     "Roughness: how to measure it, the simplest machine that makes it, the forests and rivers that grow it, and "
     "why image generators draw the big shapes first. Mandelbrot's Brownian casebook live, a forest and a 10 km "
     "landscape formed by rivers, a theorem on the order of generation, and what the fractal toolset buys in speed."),
    ("0.1", "metafractal.html", "Metafractal: The Space of Fractals Is Fractal", "October 2026",
     "Every fractal is a point in a space of fractals, and that space is rough. The Mandelbrot set as the map of "
     "the Julia sets and Tan Lei's similarity, live; then the Fractal Engine as the instrument for the spaces no "
     "theorem reaches: maps of any two parameters, a metric in pixels, chaos, walks, chimeras, tissue."),
    ("0.2", "radiance-fields.html", "Radiance Fields: Elements and Morphs", "October 2026",
     "The Fractal Engine's object taken apart: density, emission, view-dependent colour and the volume integral, "
     "and the representations — distance fields, voxels, Gaussians, networks — with the morphs between them."),
    ("1", "automata.html", "Cellular Automata as the Computational Basis", "in preparation",
     "Local rules compute a rough world, measured against known answers: Flame Strains, Petri, the Tero "
     "fixture, the think tank."),
    ("2", "tensor-landscapes.html", "Fractal Optimization of Tensor Landscapes", "in preparation",
     "Where the landscapes of neural network training are fractal, and whether that structure can be turned "
     "into speed the way multigrid and the FFT turn scale structure into speed."),
    ("3", "document-diffusion.html", "Diffusion Over the Whole Document", "in preparation",
     "Paper 0's theorem applied to text. Today's text generators write left to right, a token or a few at a "
     "time. Could a model draw a whole document coarse to fine, the outline first?"),
    ("4", "lambda_cognition.html", "Lambda Cognition & the TIH Framework", "published December 2025",
     "The substrate: sparse interaction instead of dense matrices."),
]

STUBS = {
    "automata.html": {
        "n": "1",
        "subtitle": "Brownian motion makes a rough world. A cellular automaton computes one.",
        "abstract": [
            "In preparation. Paper 0 ends with a pointer to this one: Life, Langton's ant, Flame Strains and Petri "
            "as the evidence that local rules compute a rough world. This paper makes that pointer the subject. "
            "It asks what a rule can compute, and it measures the answers against numbers published by others "
            "rather than against the eye.",
        ],
        "plan": [
            ("Life, the ant, and what a rule can compute", "Conway's rule, Langton's highway, Wolfram's classes, "
             "Rule 110 as a universal computer."),
            ("Any automaton as a strain", "Flame Strains: any 2D rule burns inside one volumetric flame, held at "
             "its size by a governor."),
            ("Ten kernels, ninety organisms", "Petri: growth kernels in WebGPU, organisms as data rows, every dish "
             "replayable bit for bit."),
            ("Measured, not illustrated", "The Tero fixture: Physarum on Tero's own Tokyo geometry, 21 replicates, "
             "inside the published spread on all three network statistics."),
            ("The think tank", "Many dishes on one GPU: replicates, competitions, sweeps."),
            ("Criticality on a grid", "The Ising model and its relatives as automata at the edge."),
        ],
        "exists": [
            ("flame-strains.html", "Flame Strains", "any 2D automaton burning in one volumetric flame"),
            ("petri/", "Petri", "ten WebGPU growth kernels and 93 organisms, a scorecard sealed version by version"),
            ("game-of-life.html", "Game of Life", "the ASCII edition"),
            ("ember-engine.html", "Ember Engine", "cellular automata fire"),
            ("mycelium.html", "Mycelium", "fungal growth by automata"),
            ("liquid-automata.html", "Frost", "a crystal engine"),
        ],
    },
    "tensor-landscapes.html": {
        "n": "2",
        "subtitle": "Training a network is a walk on a landscape. Where is that landscape fractal, and can the "
                    "structure be turned into speed?",
        "abstract": [
            "In preparation. Chapter 6 of paper 0 made precise. Two things are measured fractal today. The boundary "
            "between training that converges and training that diverges is fractal in the plane of learning rates, "
            "with box dimensions from 1.17 to 1.98 (Sohl-Dickstein 2024). The paths of stochastic gradient descent "
            "are self-affine, with path dimensions between 1.3 and 2.7 (Gong et al.). Under four stated assumptions "
            "SGD behaves like a walker at a temperature set by learning rate over batch size (Mandt, Hoffman and "
            "Blei 2017).",
            "Every fast numerical method buys its speed with one regularity across scales: the FFT, multigrid, the "
            "fast multipole method, hierarchical matrices, Monarch layers. This paper asks whether trained networks "
            "have such a regularity, measures it, and does not claim what no source supports: recursion does not "
            "make an arbitrary shape or an arbitrary optimisation faster.",
        ],
        "plan": [
            ("What is measured fractal", "The trainability boundary, SGD trajectories, the bulk and outliers of the "
             "Hessian spectrum, the edge of stability."),
            ("SGD as a walker at a temperature", "Where the Langevin picture holds, where its assumptions fail, and "
             "learning-rate schedules as annealing."),
            ("Scale separation as speed", "FFT, multigrid, fast multipole, H-matrices, butterfly and Monarch layers, "
             "each with the regularity it needs."),
            ("The measurement", "Do the weights of trained networks have low-rank far blocks or a power-law "
             "spectrum a fast method can use?"),
            ("Live figures", "The walker of paper 0 in many dimensions; a fractal trainability boundary you can zoom."),
        ],
        "exists": [
            ("fractals.html#ch6", "Paper 0, chapter 6", "Barnes–Hut on Lévy dust and the table of fast methods"),
            ("fractals.html#ch4-2", "Paper 0, section 4.2", "a Metropolis walker on a fractal landscape"),
            ("petri/", "Petri", "a multigrid pressure solver in WebGPU"),
        ],
    },
    "document-diffusion.html": {
        "n": "3",
        "subtitle": "A next-token model writes a document left to right. Could a model draw it coarse to fine, the "
                    "outline first?",
        "abstract": [
            "In preparation. Paper 0 proves that a diffusion model of images settles the large scales first because "
            "the world's spectrum is a power law. This paper asks whether the same can be true of a document.",
            "Where things stand. Autoregressive models write one token at a time; multi-token heads such as "
            "DeepSeek-V3's draft one more token, accepted 85 to 90 % of the time for about 1.8 times the speed, "
            "but the order stays left to right. Diffusion language models (LLaDA, Mercury, Gemini Diffusion) unmask "
            "tokens in parallel and are fast, over a thousand tokens a second, but the one study of the order they "
            "choose finds content words settled first and punctuation last: not an outline. Text does have scale "
            "structure. Its Hurst exponent is about 0.7 and falls toward 0.57 when sentences are shuffled. Nobody "
            "has yet defined the spectrum of a document or tested a generator against it. That is this paper.",
        ],
        "plan": [
            ("How text generators choose an order", "Next-token, multi-token and speculative decoding; masked "
             "diffusion and confidence-ordered unmasking; the measured trajectories."),
            ("The scale structure of text", "Zipf, burstiness, long-range correlation, the Hurst exponent of "
             "literature, sentence-length spectra."),
            ("The spectrum of a document", "Document, section, paragraph, sentence, token: a definition that can "
             "be measured."),
            ("Paper 0's theorem, transposed", "What a power-law document spectrum predicts for the order of "
             "generation, and what it does not."),
            ("The test", "A prototype generator that settles a document coarse to fine, and the measurement of "
             "whether it does."),
        ],
        "exists": [
            ("fractals.html#ch5", "Paper 0, chapter 5", "the theorem on the order of generation, with live figures"),
            ("lambda_cognition.html", "Lambda Cognition", "the substrate this series builds toward"),
        ],
    },
}

FONTS = ('    <link rel="preconnect" href="https://fonts.googleapis.com">\n'
         '    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
         '    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Lora:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">\n')

e = html.escape


# the footer dates each page by its first deploy: the day and the public commit that first carried it
FIRST = "12 October 2026", "5e6a84e"


def footer():
    date, commit = FIRST
    return (f"    </section>\n    <footer>\n      <p>***first published {date} · "
            f"<a href=\"https://github.com/JorikChase/iori/commit/{commit}\">{commit}</a>***</p>\n    </footer>\n"
            "  </main>\n  <div></div>\n  </div>\n</body>\n\n</html>\n")


def head(prefix):
    return ("<!DOCTYPE html>\n<html lang=\"en\">\n\n<head>\n\n    <meta charset=\"utf-8\" />\n"
            "<!-- SEO:BEGIN (generated by site.py — do not edit by hand) -->\n    <!-- SEO:END -->\n"
            "    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">\n"
            + FONTS +
            f"    <link rel=\"stylesheet\" href=\"{prefix}papers/fractals/paper.css?v=3\">\n</head>\n")


def series_list(prefix, current=None):
    out = ['      <ul class="series">']
    for n, slug, title, state, desc in SERIES:
        t = e(title) if slug == current else f'<a href="{prefix}{slug}">{e(title)}</a>'
        out.append(f'        <li><span class="n">{n}</span>{t}<span class="state">{e(state)}</span>\n'
                   f'          <p>{e(desc)}</p></li>')
    out.append('      </ul>')
    return "\n".join(out)


def stub(slug, s):
    prefix = ""
    body = [head(prefix), "<body>\n  <div class=\"page\">\n  <div></div>\n  <main>\n    <header>",
            f"      <h1>{e(next(t for n, sl, t, *_ in SERIES if sl == slug))}</h1>",
            f"      <p class=\"subtitle\">{e(s['subtitle'])}</p>",
            "      <p class=\"byline\">iori<sup>1</sup></p>",
            "      <p class=\"affiliation\"><sup>1</sup>Jorik Jonathan Chase, <a href=\"https://3die.fr/\">3DIE</a> — "
            f"Design, Art &amp; Technologies Label. Paper {s['n']} of <a href=\"papers/\">a series</a>. In preparation.</p>",
            "    </header>",
            "    <section class=\"abstract\">\n      <h2>Abstract</h2>"]
    body += [f"      <p>{e(p)}</p>" for p in s["abstract"]]
    body.append("    </section>")
    body.append("    <section id=\"plan\">\n      <h2>Planned contents</h2>\n      <ol>")
    body += [f"        <li><b>{e(t)}.</b> {e(d)}</li>" for t, d in s["plan"]]
    body.append("      </ol>\n    </section>")
    body.append("    <section id=\"exists\">\n      <h2>What already exists</h2>\n      <ul>")
    body += [f"        <li><a href=\"{h}\">{e(t)}</a>: {e(d)}.</li>" for h, t, d in s["exists"]]
    body.append("      </ul>\n    </section>")
    body.append("    <section id=\"series\">\n      <h2>The series</h2>")
    body.append(series_list(prefix, current=slug))
    body.append(footer())
    return "\n".join(body)


def index():
    prefix = "../"
    body = [head(prefix), "<body>\n  <div class=\"page\">\n  <div></div>\n  <main>\n    <header>",
            "      <h1>Papers</h1>",
            "      <p class=\"subtitle\">One series, five papers. Each is a page you can read and play with, and each "
            "ends with a pointer to the next.</p>",
            "      <p class=\"byline\">iori</p>",
            "      <p class=\"affiliation\">Jorik Jonathan Chase, <a href=\"https://3die.fr/\">3DIE</a> — Design, Art &amp; "
            "Technologies Label.</p>",
            "    </header>",
            "    <section id=\"series\">",
            "      <p class=\"lead\">The thread: the world is rough in the same way at every scale; fitting it is a walk; "
            "the machines that now make pictures are that walk made explicit; and the same structure may decide how "
            "machines should compute and write.</p>",
            series_list(prefix),
            footer()]
    return "\n".join(body)


if __name__ == "__main__":
    for slug, s in STUBS.items():
        open(os.path.join(ROOT, slug), "w", encoding="utf-8").write(stub(slug, s))
        print("wrote", slug)
    open(os.path.join(ROOT, "papers", "index.html"), "w", encoding="utf-8").write(index())
    print("wrote papers/index.html")

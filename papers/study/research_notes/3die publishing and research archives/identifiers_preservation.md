# Identifiers, citation metadata and long-term preservation for 3die publishing

Research date: 2026-11-09. Scope: a one-person press (publisher and lead author is an artist and student in Prague; label domain 3die.fr, author site iori.me; one VPS; one GitHub repo) that publishes long HTML papers with live WebGL/WebGPU figures, in a numbered series (0, 0.1, 0.2, 0.3 ...). Prices come from official pages fetched on 2026-11-09 unless marked otherwise. Currency conversions are approximate (about 1 USD ≈ 0.86-0.92 EUR, 1 EUR ≈ 24-25 CZK), are not from an official source, and should be checked on the day of payment.

## DOIs: Zenodo, Crossref, DataCite, OSF Preprints, arXiv; which fits a numbered series?

### Takeaway
Zenodo is the free, realistic DOI route for an individual: GitHub release integration, a concept DOI for the whole work plus a version DOI for each release, 50 GB per record, CC0 metadata, and retention for the lifetime of the repository. Crossref membership costs 200 USD a year at the lowest tier plus 1 USD per current article DOI (2026 schedule). That is cheap, but membership is for organisations, so a sole trader would have to apply or go through a sponsor. arXiv accepts HTML but needs endorsement for new submitters and cannot run live JS figures. It is a poor fit.

### Cited Findings
**Zenodo**
- Zenodo record limits: "Total files size limit per record is 50GB"; higher quotas are granted case by case — [Zenodo policies](https://about.zenodo.org/policies/)
- Retention: "Items will be retained for the lifetime of the repository", which is tied to CERN; the policy mentions a research programme planned for at least the next two decades — [Zenodo policies](https://about.zenodo.org/policies/)
- Withdrawal is "exceptional". A tombstone page replaces the item, and the DOI and URL are kept — [Zenodo policies](https://about.zenodo.org/policies/)
- "Data files are versioned. Records are not versioned." Original content is never modified. Metadata is CC0 and harvestable via OAI-PMH — [Zenodo policies](https://about.zenodo.org/policies/)
- Each published version gets its own version DOI. A concept DOI represents all versions and resolves to the latest version's landing page. Zenodo cites the specific version by default — [Zenodo help: DOI versioning](https://zenodo.org/help/versioning); [Zenodo support: What is DOI versioning?](https://support.zenodo.org/help/en-gb/1-upload-deposit/97-what-is-doi-versioning)
- The Turing Way recommends citing the exact version in papers and the concept DOI in documentation or badges — [The Turing Way: citable versioning](https://book.the-turing-way.org/communication/citable/citable-versioning)
- GitHub integration works like this: enable the repo in Zenodo, then create a GitHub release, and Zenodo archives it and mints a DOI. Metadata comes from `CITATION.cff` or `.zenodo.json` (validate CFF with cff-converter). Software records are also archived to Software Heritage ("Archived in" under External resources) — [Zenodo docs: GitHub](https://help.zenodo.org/docs/github/); [Archive a release from GitHub](https://help.zenodo.org/docs/github/archive-software/github-upload/)
- The Zenodo policy page states no fee for depositing — [Zenodo policies](https://about.zenodo.org/policies/) (absence of a fee, not an explicit "free" statement on that page)

**Crossref** (fee page last updated 2026-09-11)
- Annual membership is 200 USD for publishing revenue or expenses under 1,000 USD, and 275 USD for 1,000 USD to 1 million USD — [Crossref fees](https://www.crossref.org/fees/)
- 2026 content registration fees per record: journal articles, book titles, proceedings, reports and working papers cost 1.00 USD current and 0.15 USD back-year. Posted content (preprints) costs 0.25 / 0.15 USD. Book chapters cost 0.25 / 0.15 USD. Datasets and components cost 0.06 USD. "Current" means 2024-2026 — [Crossref fees](https://www.crossref.org/fees/)
- Volume discounts were removed on 2026-01-01. From 2027-01-01 most current-record prices fall and back-year records become free (the new numbers are only in a linked blog post) — [Crossref fees](https://www.crossref.org/fees/)
- Global Equitable Membership (GEM) members pay no membership or registration fees. Eligibility is country-based; Czech Republic and France are presumably not eligible, but this was not verified — [Crossref fees](https://www.crossref.org/fees/)
- Sponsors are organisations that join on behalf of members. They pay one membership fee, handle registration and billing, and may charge their members. Sponsors can only work with members under 1 million USD revenue. The sponsor list can be filtered by base country — [Crossref sponsors](https://www.crossref.org/membership/about-sponsors/)
- The sponsors page talks only about "organisations" and says nothing about individuals — [Crossref sponsors](https://www.crossref.org/membership/about-sponsors/)
- Crossref advises against in-place corrections. Corrections should be separate notices linked through Crossmark "update-to" metadata — [Crossref: connected dynamic scholarly record](https://www.crossref.org/publications/connected-dynamic-scholarly-record/)

**OSF Preprints**
- OSF Preprints is free and run by the Center for Open Science. Each version approved by moderation gets a DOI. Rejected versions are not public. Moderation can take from 1-2 business days to 2 or more weeks — [OSF Preprint FAQs](https://help.osf.io/article/230-preprint-faqs); [OSF: new version of a preprint](https://help.osf.io//help.osf.io/article/673-update-a-new-version-of-a-preprint); [OSF moderation](https://help.osf.io/article/691-preprint-moderation-policies)
- A secondary source says OSF preprint DOIs are registered through Crossref — [CASRAI: OSF Preprints](https://casrai.org/dictionary/term/osf-preprints)

**arXiv**
- Accepted formats, in order of preference: (La)TeX, PDF, and HTML with JPEG/PNG/GIF images. New users or new categories "may be required to find endorsements". Corrections replace the submission and create v2, v3 and so on — [arXiv submit help](https://info.arxiv.org/help/submit/index.html)

### Inferences
- **For the series:** use one Zenodo record per paper (0, 0.1, 0.2, 0.3), each with its own concept DOI, and a new version for each substantive revision. Tie the papers together with Zenodo "related identifiers" (isPartOf / isPreviousVersionOf) and, optionally, a Zenodo community "3die publishing" as the series container. Deposit a static snapshot as the content: a PDF or print-to-PDF of the prose, a WACZ of the live page, and the source zip. Zenodo stores files; it does not host or run the live JS page. The DOI's landing page is Zenodo's, which should link to the canonical live URL.
- Crossref would make 3die publishing a real DOI prefix owner, with DOIs resolving to 3die.fr itself. The cost would be roughly 200 USD/year + 1 USD per paper (about 175-185 EUR/year, about 4,400-4,600 CZK). The open question is whether an individual or OSVČ (sole trader) is accepted. Ask Crossref membership directly, or find a CZ/FR sponsor.
- arXiv does not fit HTML-first interactive work. Figures would freeze into images, and endorsement is a barrier for an independent artist outside an institution.
- DataCite direct membership is aimed at institutions. Zenodo is itself a DataCite client, so going through Zenodo already gives DataCite DOIs.

### Gaps
- No official confirmation was found of whether Crossref admits individuals or sole traders. The page uses "organisations" throughout.
- No CZ or FR Crossref sponsor was identified; the sponsor filter needs a browser.
- DataCite member fees and Czech DataCite consortium access (e.g. via NTK/CzechELib) were not researched.
- Zenodo's current HTML file preview behaviour (whether an uploaded .html renders) was not confirmed. Assume it does not execute JS.
- The 2027 Crossref price numbers are not on the fees page.

## ISSN for the web series and ISBN for single works (CZ and FR); legal deposit of online works

### Takeaway
ISSN is assigned by the national centre of the publisher's country. For a Prague-based publisher that is the Czech ISSN centre at the National Library (NK ČR). National centres typically do not charge, but the NK page could not be fetched to confirm this. ISSN rules exclude "personal content, such as a personal website", so the series must present itself as a publisher's titled series with an editorial responsibility, not as the artist's site. The Czech ISBN agency assigns ISBNs free of charge, including to individuals, but only for finished online publications. AFNIL (France) charges 37 EUR excl. VAT for a first request, standard 3 weeks. Neither country appears to oblige an individual web publisher to deposit online works. Web archiving is done by the libraries' own crawls.

### Cited Findings
**ISSN rules (ISSN International)**
- Online "ongoing integrating resources" (websites, blogs, databases) can get an ISSN if they meet all of these:
  - editorial content;
  - named editorial responsibility, "generally more than one person";
  - a stable title;
  - a valid URL;
  - a precise subject or audience.
- Excluded: personal content such as personal websites, short-lived resources, and promotional, commercial, corporate or institutional sites. The ISSN should appear on the homepage or main menu. It is usually not assigned before publication — [ISSN: ISSN for electronic media](https://www.issn.org/understanding-the-issn/assignment-rules/the-issn-for-electronic-media/)
- ISSN International has said an assignment costs it about 45 EUR. It planned to charge only in countries without a national centre (where it assigns directly) — [Ikaros: ISSN slaví 40 let](https://ikaros.cz/print/17637) (secondary, Czech library journal)
- The Czech ISSN centre is part of the National Library of the Czech Republic and registers online continuing resources. It excludes institutional and commercial websites — [Ikaros: ISSN a pokračující zdroje](https://ikaros.cz/print/11135)

**France (BnF, Centre ISSN France)**
- BnF has an online form for ISSN for online resources. The types offered are "Périodique en ligne", "Site web" and "Collection de livres". The application is admissible only if the resource has a permanent URL. No acknowledgement of receipt is sent. No fee is stated. No restriction on the publisher's location is stated — [BnF: Demande d'ISSN pour les ressources en ligne](https://www.bnf.fr/fr/demande-dissn-pour-les-ressources-en-ligne)
- Contact: issn.france@bnf.fr, +33 1 53 79 59 30 — [BnF: ISSN mode d'emploi](https://www.bnf.fr/fr/centre-d-aide/issn-mode-demploi)

**ISBN, Czech Republic**
- The Czech ISBN agency (at NK ČR) does not charge for assignment. Individuals outside the ISBN system can ask for a number by email. They must give bibliographic data, the publisher's address, the URL and the format, and each format needs its own ISBN.
- Online publications qualify only if they are:
  - finished, not a regularly updated text;
  - intended for the public;
  - intended for the book trade or distribution (price is irrelevant).
- Web pages as a whole do not qualify.
- ISBNs for online publications have been available since July 2010. The source article is from 2011 — [Ikaros: ISBN a online publikace](https://ikaros.cz/print/13593)

**ISBN, France (AFNIL)**
- AFNIL serves French, Belgian and francophone-African publishers. It refers others to their own national agency — [AFNIL](https://www.afnil.org/)
- Prices (EUR excl. VAT, VAT 20%): first ISBN request, company or individual, is 37 EUR standard (3 weeks), 87 EUR accelerated (1 week), or 154 EUR urgent (2 working days). An additional list is 28/46/70 EUR. The page is undated — [AFNIL tarification](https://www.afnil.org/tarification/)

**Legal deposit**
- Czech Act 37/1995 (non-periodical publications) sets physical deposit duties. An e-deposit amendment covering e-books, e-periodicals and web pages was proposed in 2016-2017 (via Act 37/1995 and Library Act 257/2001). Electronic periodicals were dropped from it, and it may not have passed. No enacted e-deposit provision was found — [Bulletin SKIP: Novela legislativy povinného výtisku](https://bulletinskip.skipcr.cz/print/90); [NK ČR legislative presentation (2014)](https://www.nkp.cz/ipk/ipk/docs/Richter_legislativa.pdf); [Act 37/1995 text (mk.gov.cz)](https://mk.gov.cz/doc/dokumenty_file/zakon-c-37-1995-sb-699.pdf)
- French dépôt légal du web dates from the 2006 DADVSI law. BnF collects the French web through curated selection by BnF and partner librarians. The archives go back to 1996 and are consulted through "Archives de l'internet" at BnF and regional sites. A "Signaler un site web" page exists. Contact: depot.legal.web@bnf.fr — [BnF: Dépôt légal du web](https://www.bnf.fr/fr/depot-legal-du-web)
- For self-published print, the publisher (including an author-publisher) deposits copies at BnF — [BnF: dépôt légal de l'autoédition](https://www.bnf.fr/fr/le-depot-legal-de-lautoedition-la-bnf)

### Inferences
- **ISSN.** The publisher is in Prague, so the Czech ISSN centre is the competent one, even though the domain is .fr. ISSN goes by the publisher's country of publication, not the domain. The risks to address:
  - The "personal website" exclusion. Give the series a fixed title (e.g. "3die Papers"), its own index page, an editor/publisher statement naming 3die publishing, and ideally a second person in an editorial role.
  - The rule that ISSN is "usually not assigned before publication". Papers already exist, so this is fine.
- **ISBN.** Each finished paper version could get a free Czech ISBN as an "online publication". The live, updated page conflicts with "finished", so pin a version (a dated snapshot or PDF) as the ISBN-bearing edition. AFNIL is likely not available to a Czech-resident publisher and costs money. Use the Czech agency.
- **Legal deposit.** No mandatory deposit for online works was found in either country for this case. Participation is voluntary: nominate the site to Webarchiv (CZ) and "Signaler un site web" (BnF).

### Gaps
- The nkp.cz ISSN and ISBN pages returned 404 at the guessed URLs. Current processing time, application form and the explicit fee (or confirmation that it is free) for the Czech ISSN centre and ISBN agency are unverified. The ISBN "free" statement comes from a 2011 Ikaros article.
- Whether the Czech ISBN agency still requires registration as a publisher (in the publisher directory, NAK) for repeated ISBNs was not confirmed.
- Whether Act 46/2000 (press law) applies to online periodicals was not researched. It concerns printed periodicals.
- The BnF ISSN page's list of excluded web resources was truncated in search snippets.

## Scholarly metadata in HTML (Google Scholar, Highwire tags, DC, schema.org, signposting, CITATION.cff, ORCID)

### Takeaway
Google Scholar indexes HTML papers from custom sites and personal sites if four things hold:
- each paper has its own URL;
- the full text or abstract is visible without clicks or scrolling;
- `citation_title`, `citation_author` and `citation_publication_date` meta tags are present;
- the page is reachable through plain HTML links.

The files must be at most 5 MB. A `citation_pdf_url` PDF is recommended for versions. FAIR Signposting adds machine links (cite-as, author, describedby, license, type) at low cost.

### Cited Findings
- Individuals may host papers on a personal site linked from a publications page. Publishers may use a custom site that meets the guidelines. Content must be primarily scholarly articles — [Google Scholar inclusion](https://scholar.google.com/intl/en/scholar/inclusion.html)
- The full text or complete author-written abstract must be visible without sign-in, software installs, popups, clicks or scrolling — [Google Scholar inclusion](https://scholar.google.com/intl/en/scholar/inclusion.html)
- Files must be HTML or PDF, at most 5 MB each. Each article needs its own URL. Multiple papers on one page cannot be indexed — [Google Scholar inclusion](https://scholar.google.com/intl/en/scholar/inclusion.html)
- Meta tags. Required: `citation_title`, at least one `citation_author`, `citation_publication_date`; without these the page is treated as having no tags. Journal or series papers add:
  - `citation_journal_title`
  - `citation_volume`, `citation_issue`, `citation_firstpage`, `citation_lastpage`
  - `citation_issn` or `citation_isbn`

  Reports add `citation_technical_report_institution` and `citation_technical_report_number`. Highwire (`citation_`) tags are preferred, then bepress and PRISM. Dublin Core is a last resort — [Google Scholar inclusion](https://scholar.google.com/intl/en/scholar/inclusion.html)
- Versions: use `citation_pdf_url` with an absolute URL in the same subdirectory as the HTML, and tag all versions — [Google Scholar inclusion](https://scholar.google.com/intl/en/scholar/inclusion.html)
- Crawling: every article should be within about ten simple HTML links of the homepage. JavaScript navigation hampers discovery, so add a browse page with plain links. Use 301 for moves and never redirect articles to the homepage. Updates to already-indexed papers take 6-9 months — [Google Scholar inclusion](https://scholar.google.com/intl/en/scholar/inclusion.html)
- FAIR Signposting Level 1 puts typed links in HTTP `Link` headers and/or HTML `<link>`. The relations:
  - `cite-as`: the DOI, exactly one;
  - `author`: ORCID URIs;
  - `describedby`: a metadata file with its media type, at least one;
  - `item`: content files;
  - `license`: an SPDX URI;
  - `type`: a schema.org class plus AboutPage.

  Level 2 publishes a separate Link Set — [FAIR Signposting](https://signposting.org/FAIR/)
- HTTP Link headers work for any media type and with HEAD requests. HTML `<link>` works only in the page `<head>` — [FAIR Signposting](https://signposting.org/FAIR/)

### Inferences
- **Fit with the existing build.** These tags slot into the existing `site.py heads` SEO block. Add per-paper fields to pages.meta.json (authors, ORCID, pub date, DOI, series number, PDF URL) and generate:
  - Highwire `citation_*` tags. Use `citation_technical_report_institution` = "3die publishing" and `citation_technical_report_number` = "0.3", or `citation_journal_title` = series name with `citation_volume`, plus `citation_issn` once assigned.
  - schema.org JSON-LD ScholarlyArticle with `isPartOf` CreativeWorkSeries.
  - `<link rel="cite-as">` and other signposting links.
  - A BibTeX/RIS/CSL-JSON "Cite this" block.
- **Risks for these papers.**
  - The 5 MB limit and the "visible abstract" rule. Keep the abstract in static HTML at the top, outside canvas/JS.
  - Heavy pages. Provide a PDF snapshot for `citation_pdf_url`.
  - Navigation. iori.me's landing is WebGL, but the NAV block and the series index page already give plain links.
- CITATION.cff in the repo root feeds both GitHub's "Cite this repository" box and Zenodo metadata. One file covers both.

### Gaps
- The schema.org ScholarlyArticle and CreativeWorkSeries pages, COinS, unAPI, the CITATION.cff spec page and ORCID registration were not fetched. They are standard, free specs (schema.org/ScholarlyArticle, schema.org/CreativeWorkSeries, citation-file-format.github.io, orcid.org; ORCID registration for individuals is free), but the details are unverified in this session.
- Whether Google Scholar indexes JS-rendered text was not confirmed; the guide only warns about JS navigation. Assume server-side text is required.

## Preservation of interactive web works

### Takeaway
No single service preserves a live WebGPU page reliably. The practical stack:
- **Code:** Software Heritage (free, ISO-standard SWHID, automatic via Zenodo) plus the GitHub/Zenodo zip.
- **Page:** a self-made WACZ from Webrecorder (ArchiveWeb.page / Browsertrix). It is portable, replayable and depositable on Zenodo.
- **Web archives:** Wayback Machine Save Page Now captures, plus nominations to Webarchiv (CZ) and BnF (FR).

Perma.cc is now paid for individuals. LOCKSS/CLOCKSS/Portico target journal publishers and are out of scale for this press.

### Cited Findings
- Software Heritage: archive a repository with Save Code Now (archive.softwareheritage.org/browse/origin/save/), also automatable via a GitHub action. SWHIDs take qualifiers: `origin`, `visit`, `anchor`, `path`, `lines`. SWHID is ISO/IEC 18670. BibTeX can be exported — [SWH persistent identifiers spec](https://docs.softwareheritage.org/_sources/devel/swh-model/persistent-identifiers.rst.txt); [SWH: how to archive reference code](https://softwareheritage.org/how-to-archive-reference-code)
- Zenodo GitHub software records are archived into Software Heritage automatically — [Zenodo docs: GitHub](https://help.zenodo.org/docs/github/)
- WACZ 1.1.1 is a ZIP of:
  - `archive/` (WARCs)
  - `indexes/` (CDXJ)
  - `pages/pages.jsonl`
  - `datapackage.json` (file hashes plus metadata)
  - optionally `datapackage-digest.json`, with signing in a separate spec

  It is replayable in the browser from a static host via range requests. The spec is described as stable — [WACZ 1.1.1 spec](https://specs.webrecorder.net/wacz/1.1.1/)
- Rhizome: ArtBase was founded in 1999 and holds about 2,200 works, preserved free with artists' consent. Webrecorder.io was renamed Conifer in 2020. Rhizome uses emulation (e.g. period browsers and plugins) alongside web archives — [Rhizome almanac: Artifacts and Infrastructure](https://almanac.rhizome.org/pages/artifacts-infrastructure); [Introducing Conifer](https://old.rhizome.org/editorial/2020/jun/11/introducing-conifer/); [Rhizome preservation services (2024)](https://rhizome.org/editorial/2024/aug/14/introducing-rhizomes-preservation-services)
- Wayback Machine Save Page Now can save outlinks (optional) and take a full-page screenshot. It captures HTML, JS and images. JS-heavy pages are a known weak spot, and dependent assets may be missing — [Internet Archive blog: SPN new and improved (2019)](https://blog.archive.org/2019/10/23/the-wayback-machines-save-page-now-is-new-and-improved/); [IA help: save pages](https://help.archive.org/help/save-pages-in-the-wayback-machine/)
- Perma.cc gives free accounts 10 one-time trial links. Personal plans cost 10 USD/month for 10 links, 25 USD for 100, and 100 USD for 500. Free access comes via affiliated institutions (libraries, courts) — [Perma.cc account docs](https://perma.cc/docs/accounts); [Perma blog 2019](https://archive.blogs.harvard.edu/perma/2019/01/07/introducing-individual-account-subscription-tiers-for-perma-cc/)
- Czech Webarchiv (NK ČR):
  - runs selective collections chosen by curators "or proposed by publishers and visitors";
  - suggestions go via the form at webarchiv.cz/cs/pridat-web or webarchiv@nkp.cz;
  - selectively archived sources get a record in the NK ČR catalogue;
  - the crawler respects robots.txt.

  [Bulletin SKIP 2022](https://bulletinskip.skipcr.cz/print/728); [Charles University doc](https://udauk.cuni.cz/ARCH-61-version1.pdf); [NK ČR Webarchive department](https://nkp.cz/en/about-us/organizational-structure/webarchive-department)

### Inferences
- Webarchiv's yearly broad crawl covers .cz only. 3die.fr and iori.me are not .cz, so they need a selective nomination to be harvested. Being Czech-authored should qualify them as "bohemica".
- Workers, WebGPU shaders and fetched data files are often missed by crawler captures. A WACZ made by actually exercising each figure in ArchiveWeb.page captures every requested resource.
- Even a WACZ needs a WebGPU-capable browser at replay time. The long-term fallback is:
  - video captures of each figure, and
  - a static PDF with figure stills,

  both deposited alongside on Zenodo. That matches Rhizome's practice of combining web archives with emulation.
- LOCKSS/CLOCKSS/Portico are member services for journal publishers and libraries. They are not relevant to a one-person press now.
- Keep `robots.txt` open to ia_archiver and Webarchiv's crawler.

### Gaps
- No source on WebGPU replay fidelity in ReplayWeb.page or the Wayback Machine was found.
- The current Webarchiv nomination form URL was not verified live.
- Rhizome ArtBase's current acquisition and submission route was not confirmed.

## Versioning and immutability

### Takeaway
The models found: Zenodo uses a concept DOI plus version DOIs. arXiv uses v1, v2 replacements under one ID. OSF gives a DOI per approved version. Crossref recommends separate correction notices (Crossmark update-to) instead of silent in-place edits. Distill keeps every article in a public GitHub repo, with review in the issue tracker.

### Cited Findings
- Distill: every article lives in a GitHub repository, peer review runs through issues, and DOIs take the form 10.23915/distill.00013 — [Distill editorial update 2018](https://distill.pub/2018/editorial-update)
- Crossref: in-situ corrections "tend to obscure the scholarly record". Register corrections and retractions with Crossmark `update-to` — [Crossref: connected dynamic scholarly record](https://www.crossref.org/publications/connected-dynamic-scholarly-record/)
- arXiv: after announcement, corrections replace the submission as a new version — [arXiv submit help](https://info.arxiv.org/help/submit/index.html)
- Zenodo: original files are never modified; new versions get new DOIs; the concept DOI resolves to the latest — [Zenodo policies](https://about.zenodo.org/policies/); [Zenodo versioning](https://zenodo.org/help/versioning)

### Inferences
- **Recommended pattern for 3die:**
  - The canonical live URL (e.g. iori.me/silviculture.html) always shows the latest version and states "Version 1.2, 2026-11-07, commit 7548f43".
  - The concept DOI points to it, through Zenodo.
  - Each version gets a frozen, commit-pinned copy, e.g. 3die.fr/papers/0.3/v1.2/ or a GitHub tag/SWHID link, plus a Zenodo version DOI.
  - A changelog/errata section sits at the end of each paper.

  The site already links a "first-published commit" in the paper 0.3 footer (see git log), which is the start of this pattern.
- Because papers import shared code, a frozen version must vendor or pin that shared code: copy it into the version folder, or load it from a commit-pinned path. Otherwise an old version silently changes when the shared modules change.

### Gaps
- eLife's "Reviewed preprint" versioning, Ink & Switch's practice and JOSS's version/archive DOI rules were not researched in this session. My understanding is that JOSS requires an archive DOI (often Zenodo) for the reviewed software version, but this is unverified here.

## Minimal setup: 80% of the value for almost no cost (ranked)

### Takeaway
Steps 1-6 cost nothing but time and give citability, Scholar indexing, code preservation and page snapshots. Step 7 (ISSN, plus ISBNs if wanted) is free in CZ, if the free status is confirmed, and adds library-grade series identity. Crossref, about 200 USD/yr + 1 USD per paper, is the only paid step worth considering, and only if DOIs must resolve to 3die.fr itself.

### Cited Findings
1. **Highwire `citation_*` meta tags, a visible abstract, a plain-HTML series index page, and a PDF snapshot per paper (`citation_pdf_url`)**, to make the papers eligible for Google Scholar. Cost: 0 EUR — [Google Scholar inclusion](https://scholar.google.com/intl/en/scholar/inclusion.html)
2. **CITATION.cff plus the Zenodo GitHub integration.** Each paper release gets version DOIs and a concept DOI, and is archived to Software Heritage automatically. Cost: 0 EUR — [Zenodo docs: GitHub](https://help.zenodo.org/docs/github/); [Zenodo versioning](https://zenodo.org/help/versioning)
   - Variant: one Zenodo upload record per paper (PDF + WACZ + source), so each paper has its own DOI. A single repo release would produce one DOI for the whole repo.
3. **Software Heritage Save Code Now** for the repo, and SWHIDs in each paper's footer. Cost: 0 EUR — [SWH](https://softwareheritage.org/how-to-archive-reference-code)
4. **WACZ capture of each paper version** with Webrecorder tools, deposited on Zenodo. Cost: 0 EUR — [WACZ spec](https://specs.webrecorder.net/wacz/1.1.1/)
5. **Wayback Machine Save Page Now** on each publish, with the outlinks and screenshot options. Cost: 0 EUR — [IA blog](https://blog.archive.org/2019/10/23/the-wayback-machines-save-page-now-is-new-and-improved/)
6. **FAIR signposting `<link>`s** (cite-as, author→ORCID, license, describedby) generated by site.py, plus an ORCID iD. Cost: 0 EUR — [FAIR Signposting](https://signposting.org/FAIR/)
7. **Free national identifiers from NK ČR.** An ISSN for the series, once the "personal website" exclusion is addressed, and optional Czech ISBNs for frozen editions. Also nominate the sites to Webarchiv. Cost: 0 CZK assumed — [ISSN rules](https://www.issn.org/understanding-the-issn/assignment-rules/the-issn-for-electronic-media/); [Ikaros: ISBN online](https://ikaros.cz/print/13593)
8. **Optional, paid:** Crossref membership. 200 USD/yr + 1 USD per current article DOI (2026), about 175-185 EUR or about 4,400-4,600 CZK per year at a few papers a year, subject to eligibility as an individual — [Crossref fees](https://www.crossref.org/fees/)
9. **Not recommended:**
   - AFNIL ISBN (37 EUR+ excl. VAT; meant for FR/BE publishers) — [AFNIL tarification](https://www.afnil.org/tarification/)
   - Perma.cc (from 10 USD/month) — [Perma.cc](https://perma.cc/docs/accounts)
   - arXiv (HTML figures do not survive; endorsement) — [arXiv](https://info.arxiv.org/help/submit/index.html)
   - LOCKSS/CLOCKSS/Portico (scale mismatch)

### Inferences
- Steps 1, 2 and 6 belong in `site.py` and `pages.meta.json` (the site track's generated SEO region), so the metadata stays consistent across pages.
- Order of work: metadata and the series index page first, then Zenodo/SWH, then snapshots, then the ISSN application. The ISSN application benefits from the series page and the visible editorial statement existing first.

### Gaps
- CZ ISSN/ISBN zero cost and processing times need confirmation by email to the NK ČR ISSN centre or ISBN agency; the official pages could not be fetched.
- CZK/EUR conversions are approximate and unsourced.

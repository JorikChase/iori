/* Starter deck: ~25 text-prompt cards spanning Art Nouveau, Arts & Crafts,
   Bauhaus, De Stijl, Russian Constructivism, Futurism, Art Deco, Swiss/
   International Typographic Style, Push Pin, and postmodern design.
   Difficulty tracks real difficulty: 1 = name the movement, 2 = name the
   designer / place in a decade, 3 = attribute with a date, typeface + year,
   or printing/reproduction technique. */
window.AHB = window.AHB || {};

AHB.SEED_DECK = [
  // ---------- Easy (1): name the movement ----------
  {
    id: 'seed-01', difficulty: 1, promptType: 'text',
    promptText: 'Privat-Livemont, *Absinthe Robette*, 1896, lithograph printed by Goffart, Brussels',
    answer: 'Art Nouveau',
    distractors: ['Art Deco', 'Aestheticism', 'Vienna Secession', 'Symbolism'],
    note: 'Belgian Art Nouveau poster art: whiplash line, a single idealised female figure, flat colour lithography.',
    tags: ['art-nouveau'],
  },
  {
    id: 'seed-02', difficulty: 1, promptType: 'text',
    promptText: 'William Morris\'s "Trellis" wallpaper design, 1862, based on roses climbing a garden trellis.',
    answer: 'Arts and Crafts',
    note: 'Morris founded Morris & Co.; the movement rejected industrial ornament for handcraft and honest materials.',
    tags: ['arts-and-crafts'],
  },
  {
    id: 'seed-03', difficulty: 1, promptType: 'text',
    promptText: 'El Lissitzky, *Beat the Whites with the Red Wedge*, 1919 — a red triangle piercing a white circle.',
    answer: 'Russian Constructivism',
    note: 'Abstract geometric propaganda for the Bolshevik side in the Russian Civil War.',
    tags: ['constructivism'],
  },
  {
    id: 'seed-04', difficulty: 1, promptType: 'text',
    promptText: 'Giacomo Balla\'s paintings of speeding cars and figures broken into repeated, overlapping outlines to suggest motion.',
    answer: 'Futurism',
    note: 'Italian avant-garde movement (from 1909) glorifying speed, machinery and violence, led by Marinetti.',
    tags: ['futurism'],
  },
  {
    id: 'seed-05', difficulty: 1, promptType: 'text',
    promptText: 'Herbert Bayer\'s geometric, all-lowercase "universal" alphabet, built from circles, straight lines and diagonals.',
    answer: 'Bauhaus',
    note: 'Bayer argued German needed no capital letters — one sound, one sign.',
    tags: ['bauhaus'],
  },
  {
    id: 'seed-06', difficulty: 1, promptType: 'text',
    promptText: 'A. M. Cassandre\'s poster for the ocean liner *Normandie*, 1935 — a streamlined hull rising in sharp, faceted planes.',
    answer: 'Art Deco',
    note: 'Cassandre\'s liner and train posters are the textbook case of Art Deco\'s streamlined, machine-age glamour.',
    tags: ['art-deco'],
  },
  {
    id: 'seed-07', difficulty: 1, promptType: 'text',
    promptText: 'Piet Mondrian\'s paintings of thick black grid lines enclosing flat rectangles of red, yellow, blue and white.',
    answer: 'De Stijl',
    note: 'Dutch movement (from 1917) reducing form to horizontal/vertical lines and primary colour plus black, white and grey.',
    tags: ['de-stijl'],
  },
  {
    id: 'seed-08', difficulty: 1, promptType: 'text',
    promptText: 'Milton Glaser\'s 1967 Bob Dylan poster: a black silhouette with wild, flat rainbow-coloured hair.',
    answer: 'Push Pin (Push Pin Studios style)',
    note: 'Push Pin Studios (Glaser, Chwast) mixed pop illustration, historical styles and psychedelia against clean Swiss modernism.',
    tags: ['push-pin'],
  },

  // ---------- Medium (2): designer, or decade ----------
  {
    id: 'seed-09', difficulty: 2, promptType: 'text',
    promptText: 'Who designed the London Underground\'s "Johnston" typeface, first used in 1916?',
    answer: 'Edward Johnston',
    note: 'Commissioned by Frank Pick; still the ancestor of today\'s Underground typeface.',
    tags: ['typography'],
  },
  {
    id: 'seed-10', difficulty: 2, promptType: 'text',
    promptText: 'In which decade did Alphonse Mucha\'s Sarah Bernhardt theatre posters, such as *Gismonda*, first appear?',
    answer: '1890s',
    note: '*Gismonda* (1894) launched Mucha\'s career and the mature Art Nouveau poster style overnight.',
    tags: ['art-nouveau'],
  },
  {
    id: 'seed-11', difficulty: 2, promptType: 'text',
    promptText: 'Who founded the Bauhaus school in Weimar in 1919?',
    answer: 'Walter Gropius',
    note: 'Gropius wrote the founding manifesto uniting fine art and craft under one roof.',
    tags: ['bauhaus'],
  },
  {
    id: 'seed-12', difficulty: 2, promptType: 'text',
    promptText: 'In which decade did Theo van Doesburg and Piet Mondrian found the De Stijl journal and movement?',
    answer: '1910s',
    note: 'The De Stijl journal launched in 1917 in the Netherlands.',
    tags: ['de-stijl'],
  },
  {
    id: 'seed-13', difficulty: 2, promptType: 'text',
    promptText: 'Which Constructivist designed the geometric photomontage posters and covers for Dziga Vertov\'s film *Man with a Movie Camera* (1929)?',
    answer: 'Alexander Rodchenko',
    note: 'Rodchenko combined stark diagonals, bold sans type and photomontage across posters, books and film ads.',
    tags: ['constructivism'],
  },
  {
    id: 'seed-14', difficulty: 2, promptType: 'text',
    promptText: 'Who designed the Helvetica typeface, released in 1957?',
    answer: 'Max Miedinger',
    note: 'Designed with Eduard Hoffmann at the Haas type foundry; originally named Neue Haas Grotesk.',
    tags: ['swiss-style', 'typography'],
  },
  {
    id: 'seed-15', difficulty: 2, promptType: 'text',
    promptText: 'In which decade was Push Pin Studios founded in New York by Milton Glaser and Seymour Chwast?',
    answer: '1950s',
    note: 'Founded in 1954, initially as a small studio producing an in-house promotional broadsheet.',
    tags: ['push-pin'],
  },
  {
    id: 'seed-16', difficulty: 2, promptType: 'text',
    promptText: 'In which decade did Wolfgang Weingart begin teaching his experimental typography course at the Basel School of Design, breaking apart the Swiss grid?',
    answer: '1960s',
    note: 'Weingart started teaching there in 1968; his students carried "New Wave" typography to the US, feeding into postmodern design.',
    tags: ['swiss-style', 'postmodern'],
  },
  {
    id: 'seed-17', difficulty: 2, promptType: 'text',
    promptText: 'Who co-founded the postmodern Memphis Group design collective in Milan in 1981?',
    answer: 'Ettore Sottsass',
    note: 'Memphis furniture and objects used bright laminates, clashing patterns and deliberately "bad taste" forms.',
    tags: ['postmodern'],
  },

  // ---------- Hard (3): attribute with date, typeface + year, or technique ----------
  {
    id: 'seed-18', difficulty: 3, promptType: 'text',
    promptText: 'What printing technique — drawing a greasy image directly onto stone — made possible the large, flat colour fields of 1890s Art Nouveau posters?',
    answer: 'Colour lithography (chromolithography)',
    note: 'Repeated stone runs, one per colour, gave posters like Chéret\'s and Mucha\'s their flat, poster-paint look.',
    tags: ['art-nouveau', 'technique'],
  },
  {
    id: 'seed-19', difficulty: 3, promptType: 'text',
    promptText: 'In what year did A. M. Cassandre design the streamlined poster *Nord Express* for the French railway?',
    answer: '1927',
    note: 'Converging rails and a raking diagonal viewpoint became a template for Art Deco travel posters.',
    tags: ['art-deco'],
  },
  {
    id: 'seed-20', difficulty: 3, promptType: 'text',
    promptText: 'Who designed the geometric sans-serif typeface Futura, released in 1927?',
    answer: 'Paul Renner',
    note: 'Renner designed Futura in Germany; its geometric forms echoed Bauhaus ideals though he wasn\'t Bauhaus faculty.',
    tags: ['typography', 'bauhaus'],
  },
  {
    id: 'seed-21', difficulty: 3, promptType: 'text',
    promptText: 'Who designed the typeface Univers, released in 1957 — the same year as Helvetica?',
    answer: 'Adrian Frutiger',
    note: 'Univers introduced a numbered weight/width system (e.g. Univers 55, 65) still used as a model today.',
    tags: ['typography', 'swiss-style'],
  },
  {
    id: 'seed-22', difficulty: 3, promptType: 'text',
    promptText: 'In what year did El Lissitzky design *Beat the Whites with the Red Wedge*?',
    answer: '1919',
    note: 'Made during the Russian Civil War, shortly after Lissitzky\'s "Proun" abstractions began.',
    tags: ['constructivism'],
  },
  {
    id: 'seed-23', difficulty: 3, promptType: 'text',
    promptText: 'What technique did Constructivist designers such as Rodchenko and Klutsis use to combine cut photographs into a single propaganda image?',
    answer: 'Photomontage',
    note: 'Photographs were cut, rescaled and pasted together, then re-photographed for mass printing.',
    tags: ['constructivism', 'technique'],
  },
  {
    id: 'seed-24', difficulty: 3, promptType: 'text',
    promptText: 'Who designed the Bauhaus\'s single-alphabet, lowercase-only "Universal" typeface, and in what year?',
    answer: 'Herbert Bayer, 1925',
    note: 'Bayer designed it while running the Bauhaus\'s printing and advertising workshop in Dessau.',
    tags: ['bauhaus', 'typography'],
  },
  {
    id: 'seed-25', difficulty: 3, promptType: 'text',
    promptText: 'Josef Müller-Brockmann\'s grid-based concert posters for the Zurich Tonhalle, exemplifying the International Typographic Style, were made mainly in which decade?',
    answer: '1950s',
    note: 'Müller-Brockmann\'s mathematically ruled grids and sachlich (objective) photography defined Swiss Style through the 1950s–60s.',
    tags: ['swiss-style'],
  },
];

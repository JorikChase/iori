// What the app holds for the document on screen when another document replaces it (app.js setDoc and
// setCollage). Two things outlive a document only while they still describe the new one:
//
//   the sensed metric  names parameters by their place in the document it was measured for (an op's index,
//                      a piece's), so it is kept for a document of the same structure and dropped for any
//                      other — breeding, herding, the ring and the walks wait for the next pass instead of
//                      reading the old places in the new document
//   a morph or a walk  ends by setting its own target, so it is kept only while it is the one writing; a
//                      document set by anything else wins and the transition stops where it is (a flow
//                      only changes the mode: it carries on)
//
// structure: the new document's structure (app.js docStructure); the metric carries the structure it was
// measured for (`sensed.structure`); writing: the transition itself is setting the document.
export function carry({ sensed, trans }, structure, writing = false) {
  return {
    sensed: sensed && sensed.structure === structure ? sensed : null,
    trans: trans && (writing || trans.kind === 'flow') ? trans : null,
  };
}

# gen/ — parametric generator (Blender Python → STL)

Not written yet. Plan: `rig.py` run with Blender's Python (`/Applications/Blender.app/Contents/MacOS/Blender -b -P
gen/rig.py -- --part P3 --mag 2 --out prints/stl/`). One function per part, all dimensions from a `params` dict at the
top (working distance, arc radius, detent pitch, tube length per magnification, shroud length, chin-rest height,
shrink factor). The phantom (P2) is built from the engine's tissue model: `layer_proof.py` already exports curves
with r / z per sample; the generator sweeps tubes along them, subtracts crypts from the sheet, scales ×10, and writes
the same geometry as JSON next to the STL so the reconstruction is compared against exactly what was printed.

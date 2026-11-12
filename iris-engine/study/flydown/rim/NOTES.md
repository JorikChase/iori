# Crypt rims: state after 2026-11-12 (still off by default: F.rim)

Committed: the per-point frame (37df1e0), the baked edge map (27aca5b). The lip reads; the cut-back wall under it
renders as a comb of vertical fins (the height-field march's fixed steps at a near-vertical wall).

Tried 2026-11-12, not kept (proto-rim-traced.jpg, proto-rim-cut.jpg history):
1. The wall as an SDF block (the sheet behind a face sw µm back, the height map reduced to the floor 60 µm in from the
   edge): the floor sample lands mid-wall on eye 26's V-shaped crypts, so the cut carved a slot (rimcut.py row 4).
2. The cut-back height field sphere-traced as (height − h) / sqrt(1 + slope²): the fins under the lip go, but the lip
   seen along an edge is a glossy capsule with stair steps, and stray flat shards appear.
3. Both pushed the walk variant past what the Metal compiler survives once (XPC_ERROR_CONNECTION_INTERRUPTED, WebGL
   lost in the pane until it was reopened): fdRimFrame is called in four places and each tissueH tap is inlined
   in all of them. Any rim work must ADD NO TAPS in the frame, or move the frame out of the inlined call sites.

Next, if rims are picked up again: bake the rim geometry (edge distance, sheet top, floor under the lip, the lip's
reach) into the map in the worker, so the shader reads one texel instead of tapping tissueH; then the wall can be
traced without growing the shader.

import importlib.util, numpy as np, os
spec = importlib.util.spec_from_file_location('cb','coupling_b.py'); cb = importlib.util.module_from_spec(spec); spec.loader.exec_module(cb)
for kap in [0.0, 0.002, 0.02]:
    for drv in ['throughput','peristalsis']:
        s = cb.Sheet(n=96, span_mm=6.0, seed=1, kappa_D=kap, throughput=4.0, cycles=30, tol=5e-4)
        cb.drivers(s, drv)
        s.advance(2200)
        st = s.vein_stats(); v50,v99 = s.speeds()
        print(f"kappa {kap:<6} {drv:14s} veined {st['veined']:.3f} flux {st['flux_share']:.3f} gini {st['gini']:.3f} "
              f"contrast {st['contrast']:7.1f} width {st['width_um'] or 0:5.0f}um spacing {st['spacing_mm'] or 0:.2f}mm "
              f"rho {np.median(s.rho):.3f} v99 {v99:6.1f} resid {s.resid:.1e}", flush=True)
        if kap == 0.0:
            cb.png(os.path.join(cb.OUT, f'K-{drv}-D.png'), np.maximum(s.Dx[:,1:-1],0)**0.4)

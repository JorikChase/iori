#!/usr/bin/env python3
"""P1b — CPU prototype of coupling B (study/02 §4.2), the scientific gate before any hybrid WGSL.

Three questions the literature does not answer, each isolated in its own experiment:

  A  CHANNELLING.  A uniform sheet of plasm, pumped by its own peristaltic cortex, with conductivity
     adapting to the rectified flux it carries. Does the sheet break into veins, and at what spacing
     and width in mm? (study/02 §4.4 predicts it; nobody has published it at this coupling.)
  B  TRANSPORT.  Same sheet, attractant at one spot raising the local frequency and softening the
     cortex. Does net mass go TOWARD the food, and which term decides the sign?
     (Kobayashi 2006: wall stiffness, not phase alone — study/02 §9 risk 2.)
  C  SOLVER.  The same pressure equation under a geometric V-cycle with arithmetic face coarsening,
     at the 10^3-10^4 conductivity contrast veins produce. What is the convergence factor, and is one
     warm-started cycle per step enough? (study/02 §6, the other open risk.)

Everything is depth-averaged and cell-centred; conductivity and flux live on faces. Units: um, s, and
a pressure unit fixed by P_sheet = 1 (velocities are reported in um/s so they can be checked against
the 50-1300 um/s of study/01 §3).

    /usr/bin/python3 petri/proto/coupling_b.py            # all three, writes petri/proto/out/
    /usr/bin/python3 petri/proto/coupling_b.py A --steps 4000 --n 256
"""
import argparse, json, os, sys, time
import numpy as np

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')

# ---------------------------------------------------------------------------------------------- grid
# rho, p, z, c  : cell centred          [n, n]
# Px, Dx, qx    : x faces, 0 at wall    [n, n+1]   Px[i, j] is the face left of cell (i, j)
# Py, Dy, qy    : y faces, 0 at wall    [n+1, n]


def face_mean(a):
    """Cell field -> (x faces, y faces), arithmetic mean of the two cells, 0 on the outer faces."""
    fx = np.zeros((a.shape[0], a.shape[1] + 1))
    fy = np.zeros((a.shape[0] + 1, a.shape[1]))
    fx[:, 1:-1] = 0.5 * (a[:, :-1] + a[:, 1:])
    fy[1:-1, :] = 0.5 * (a[:-1, :] + a[1:, :])
    return fx, fy


def divergence(qx, qy, h):
    return (qx[:, 1:] - qx[:, :-1] + qy[1:, :] - qy[:-1, :]) / h


def laplacian(a):
    return (np.roll(a, 1, 0) + np.roll(a, -1, 0) + np.roll(a, 1, 1) + np.roll(a, -1, 1) - 4.0 * a)


# ---------------------------------------------------------------------------------------- pressure
class Poisson:
    COARSE = 1.0        # 1.0 = parallel sum, 0.5 = mean; measured below
    """beta/dt * p - div(P grad p) = rhs, by geometric multigrid V-cycles.

    Red-black Gauss-Seidel smoother (order-independent within a colour, so a GPU port stays
    deterministic); coarse faces are the arithmetic mean of the two fine faces they span, which keeps
    a one-cell vein connected on every level where harmonic averaging would sever it (study/02 §6a).
    """

    def __init__(self, Px, Py, h, diag0, levels=None):
        self.h, self.diag0 = h, diag0
        n = Px.shape[0]
        self.levels = []
        lv = 0
        while True:
            d = diag0 * (1.0) + (Px[:, :-1] + Px[:, 1:] + Py[:-1, :] + Py[1:, :]) / h ** 2
            self.levels.append(dict(Px=Px, Py=Py, h=h, diag=d, n=n))
            lv += 1
            if n <= 8 or (levels and lv >= levels) or n % 2:
                break
            Px, Py = self._coarsen(Px, Py)
            n //= 2
            h *= 2.0

    @staticmethod
    def _coarsen(Px, Py):
        n = Px.shape[0]
        m = n // 2
        # x faces: keep every other column of faces, average the two rows it spans
        cx = np.zeros((m, m + 1))
        cx[:, :] = Poisson.COARSE * (Px[0::2, 0::2] + Px[1::2, 0::2])
        cy = np.zeros((m + 1, m))
        cy[:, :] = Poisson.COARSE * (Py[0::2, 0::2] + Py[0::2, 1::2])
        cx[:, 0] = cx[:, -1] = 0.0
        cy[0, :] = cy[-1, :] = 0.0
        return cx, cy

    def smooth(self, p, rhs, lv, sweeps=1):
        L = self.levels[lv]
        Px, Py, h, diag = L['Px'], L['Py'], L['h'], L['diag']
        ii, jj = np.indices(p.shape)
        red = (ii + jj) % 2 == 0
        for _ in range(sweeps):
            for mask in (red, ~red):
                nb = np.zeros_like(p)
                nb[:, :-1] += Px[:, 1:-1] * p[:, 1:]
                nb[:, 1:] += Px[:, 1:-1] * p[:, :-1]
                nb[:-1, :] += Py[1:-1, :] * p[1:, :]
                nb[1:, :] += Py[1:-1, :] * p[:-1, :]
                np.copyto(p, (rhs + nb / h ** 2) / diag, where=mask)
        return p

    def residual(self, p, rhs, lv):
        L = self.levels[lv]
        Px, Py, h, diag = L['Px'], L['Py'], L['h'], L['diag']
        nb = np.zeros_like(p)
        nb[:, :-1] += Px[:, 1:-1] * p[:, 1:]
        nb[:, 1:] += Px[:, 1:-1] * p[:, :-1]
        nb[:-1, :] += Py[1:-1, :] * p[1:, :]
        nb[1:, :] += Py[1:-1, :] * p[:-1, :]
        return rhs - (diag * p - nb / h ** 2)

    def vcycle(self, p, rhs, lv=0, pre=1, post=1):
        if lv + 1 == len(self.levels):
            # The coarsest grid must be SOLVED, not merely smoothed. At the physical compliance the
            # problem is near-pure-Neumann, so its slowest mode is the constant: without a real coarse
            # solve (and with the mean projected out of a singular system) the V-cycle stalls at a
            # contraction factor near 1 no matter how many cycles are spent. This was measured.
            self.smooth(p, rhs, lv, 120)
            return p
        self.smooth(p, rhs, lv, pre)
        if lv + 1 < len(self.levels):
            r = self.residual(p, rhs, lv)
            rc = 0.25 * (r[0::2, 0::2] + r[1::2, 0::2] + r[0::2, 1::2] + r[1::2, 1::2])
            ec = np.zeros_like(rc)
            self.vcycle(ec, rc, lv + 1, pre, post)
            p += np.repeat(np.repeat(ec, 2, 0), 2, 1)
        self.smooth(p, rhs, lv, post)
        return p

    def apply(self, d):
        """A d, from the residual with a zero right-hand side."""
        return -self.residual(d, np.zeros_like(d), 0)

    def pcg(self, p, rhs, tol=1e-6, maxit=80):
        """Conjugate gradients preconditioned by one V-cycle.

        The V-cycle on its own is unsmoothed aggregation (piecewise-constant prolongation) and
        plateaus near 0.88 per cycle at vein contrast - measured. As a preconditioner it is fine,
        and CG needs no parameter tuning as the contrast grows during a run.
        """
        rhs = rhs - rhs.mean()
        p -= p.mean()
        r = self.residual(p, rhs, 0)
        hist = [float(np.linalg.norm(r))]
        z = self.vcycle(np.zeros_like(r), r.copy()); z -= z.mean()
        d = z.copy(); rz = float((r * z).sum())
        for _ in range(maxit):
            Ad = self.apply(d)
            den = float((d * Ad).sum())
            if abs(den) < 1e-300:
                break
            al = rz / den
            p += al * d; r -= al * Ad
            hist.append(float(np.linalg.norm(r)))
            if hist[-1] <= tol * max(hist[0], 1e-30):
                break
            z = self.vcycle(np.zeros_like(r), r.copy()); z -= z.mean()
            rz2 = float((r * z).sum())
            d = z + (rz2 / max(rz, 1e-300)) * d
            rz = rz2
        p -= p.mean()
        return p, hist

    def solve(self, p, rhs, cycles=1, tol=None):
        # Only grad p drives flux, so the uniform part of p is physically meaningless - and at the
        # physical compliance it is also the mode with an eigenvalue ~50x smaller than every other,
        # i.e. the one that makes the solve look divergent. Project it out of the right-hand side and
        # work in the mean-zero subspace, where the operator is well conditioned.
        rhs = rhs - rhs.mean()
        p -= p.mean()
        r0 = np.linalg.norm(self.residual(p, rhs, 0))
        hist = [r0]
        for _ in range(cycles):
            self.vcycle(p, rhs)
            p -= p.mean()
            hist.append(np.linalg.norm(self.residual(p, rhs, 0)))
            if tol and hist[-1] <= tol * max(r0, 1e-30):
                break
        return p, hist


# ---------------------------------------------------------------------------------------------- sim
class Sheet:
    def __init__(self, n=256, span_mm=12.0, seed=1, **kw):
        self.n, self.span = n, span_mm * 1000.0
        self.h = self.span / n                      # um per cell
        self.rng = np.random.default_rng(seed)
        P = dict(
            dt=1.0,                                 # s
            period=100.0,                           # s, study/01 §3
            amp=0.10,                               # radius oscillation, ~10 %
            k_sync=0.15,                            # 1/s, nearest-neighbour phase coupling (Kuramoto)
            warmup=600.0,                           # s of free oscillation before D may adapt
            r_sponge=1.0,                           # permeability of undifferentiated plasm, per rho
            beta=2.0e-6,                            # wall compliance
            alpha=0.9,                              # adaptation gain
            mu=4.0 / 3.0,                           # volume-cost exponent (study/02 §3.1)
            Q_half=None,                            # saturation flux, set from the first steps
            r_D=0.010,                              # 1/s, decay: a vein dies in ~100 s of no flux
            kappa_D=0.02,                           # conductivity smoothing along the vein
            tau_Q=200.0,                            # s, flux averaging (2 periods)
            chi_A=0.35,                             # attractant raises frequency
            chi_E=0.8,                              # attractant softens the cortex (raises amplitude)
            chi_p=0.0,                              # pressure feedback on phase, in units of w0 per sd(p)
            phi_sol=0.5,                            # mobile fraction
            D0_noise=0.02,                          # quenched seed: an instability needs something to amplify
            throughput=0.0,                         # steady uptake at food, matching sink at the rim
            c_build=0.01,                            # plasm consumed per unit of conductivity built
            rho_min=0.05,                           # a drained sheet still leaves a film
            cycles=40,                              # ceiling; the solve stops on tol
            tol=2e-4,                               # V-cycles per step
        )
        P.update(kw)
        self.P = P
        self.omega0 = 2 * np.pi / P['period']
        self.rho = np.ones((n, n))
        self.A = np.zeros((n, n))
        self.p = np.zeros((n, n))
        self.c = np.zeros((n, n))                   # passive tracer = biomass carried by the sol
        self.phi = self.rng.random((n, n)) * 2 * np.pi
        self.Dx = self.rng.random((n, n + 1)) * P['D0_noise']
        self.Dy = self.rng.random((n + 1, n)) * P['D0_noise']
        self.Dx[:, 0] = self.Dx[:, -1] = 0.0
        self.Dy[0, :] = self.Dy[-1, :] = 0.0
        self.s_ext = np.zeros((n, n))
        self.Qbx = np.zeros((n, n + 1))
        self.Qby = np.zeros((n + 1, n))
        self.step = 0
        self.log = []

    # ---- fields
    def omega(self):
        return self.omega0 * (1.0 + self.P['chi_A'] * self.A)

    def permeability(self):
        rx, ry = face_mean(self.rho)
        Px = self.P['r_sponge'] * rx + self.Dx
        Py = self.P['r_sponge'] * ry + self.Dy
        return Px, Py

    def advance(self, steps=1, solver_stats=False):
        P, dt, h, n = self.P, self.P['dt'], self.h, self.n
        stats = []
        for _ in range(steps):
            w = self.omega()
            # 1. oscillator.  Phase only (|z| = 1 by construction, so it cannot blow up): local
            #    Kuramoto coupling weighted by biomass, plus the global coupling the pressure field
            #    provides for free.  An EXPLICIT phase-diffusion term is unusable here - see §notes.
            sp, cp = np.sin(self.phi), np.cos(self.phi)
            wn = np.zeros((n, n))
            sc = np.zeros((n, n))
            for ax, sh in ((0, 1), (0, -1), (1, 1), (1, -1)):
                rj = np.roll(self.rho, sh, ax)
                # sin(phi_j - phi_i) = sin_j cos_i - cos_j sin_i
                sc += rj * (np.roll(sp, sh, ax) * cp - np.roll(cp, sh, ax) * sp)
                wn += rj
            dphi = P['k_sync'] * sc / np.maximum(wn, 1e-6)
            if P['chi_p']:
                pv = self.p - self.p.mean()
                dphi += P['chi_p'] * self.omega0 * pv / max(pv.std(), 1e-12)
            self.phi = (self.phi + dt * (w + dphi)) % (2 * np.pi)
            # 2. peristaltic source: a contracting column expels its sol.  s = -dh/dt, h = h0(1 + a Im z)
            a = P['amp'] * (1.0 + P['chi_E'] * self.A)
            s = self.rho * (-a * w * np.cos(self.phi) + self.s_ext)
            # 3. pressure (backward Euler, warm start) and flux
            Px, Py = self.permeability()
            solver = Poisson(Px, Py, h, P['beta'] / dt)
            rhs = P['beta'] / dt * self.p + s
            self.p, hist = solver.pcg(self.p, rhs, tol=P['tol'], maxit=P['cycles'])
            self.cycles_used = len(hist) - 1
            self.resid = hist[-1] / max(hist[0], 1e-30)
            if solver_stats:
                stats.append(hist)
            qx = np.zeros((n, n + 1))
            qy = np.zeros((n + 1, n))
            qx[:, 1:-1] = -Px[:, 1:-1] * (self.p[:, 1:] - self.p[:, :-1]) / h
            qy[1:-1, :] = -Py[1:-1, :] * (self.p[1:, :] - self.p[:-1, :]) / h
            self.qx, self.qy = qx, qy
            # 4. rectified, period-averaged flux (shuttle flow reverses; |Q| does not cancel)
            self.Qbx += (dt / P['tau_Q']) * (np.abs(qx) - self.Qbx)
            self.Qby += (dt / P['tau_Q']) * (np.abs(qy) - self.Qby)
            if P['Q_half'] is None and self.step * dt >= P['warmup']:
                P['Q_half'] = max(float(np.percentile(self.Qbx[:, 1:-1], 80)), 1e-12)
            # 5. adaptation, only where there is plasm
            if P['Q_half']:
                mx, my = face_mean((self.rho > 0.05).astype(float))
                # A vein is built out of the sheet it drains, not out of nothing: every unit of
                # conductivity gained costs plasm at that face, and a decaying vein gives it back.
                # That finite budget is what makes parallel channels compete (without it D simply
                # saturates everywhere - measured, see notes).
                built = np.zeros((n, n))
                for D, Qb, m, ax in ((self.Dx, self.Qbx, mx, 0), (self.Dy, self.Qby, my, 1)):
                    x = Qb / P['Q_half']
                    growth = P['alpha'] * x ** P['mu'] / (1.0 + x ** P['mu'])
                    have = np.zeros_like(D)
                    if ax == 0:
                        have[:, 1:-1] = np.minimum(self.rho[:, :-1], self.rho[:, 1:])
                    else:
                        have[1:-1, :] = np.minimum(self.rho[:-1, :], self.rho[1:, :])
                    stock = np.clip((have - P['rho_min']) / max(P['c_build'], 1e-9), 0.0, None)
                    dD = dt * ((growth * np.minimum(stock / (0.25 * dt * P['alpha'] + 1e-12), 1.0)
                                - P['r_D'] * D) * (m > 0.4) + P['kappa_D'] * laplacian(D))
                    dD = np.maximum(dD, -D)
                    D += dD
                    np.clip(D, 0.0, 1e4, out=D)
                    if ax == 0:
                        built[:, :-1] += 0.5 * dD[:, 1:-1]
                        built[:, 1:] += 0.5 * dD[:, 1:-1]
                    else:
                        built[:-1, :] += 0.5 * dD[1:-1, :]
                        built[1:, :] += 0.5 * dD[1:-1, :]
                self.rho = np.maximum(self.rho - P['c_build'] * built, P['rho_min'])
                self.Dx[:, 0] = self.Dx[:, -1] = 0.0
                self.Dy[0, :] = self.Dy[-1, :] = 0.0
            # 6. transport of the carried biomass by the sol flux (upwind, conservative)
            if self.c.any():
                fx = np.zeros_like(qx)
                fy = np.zeros_like(qy)
                cl, cr = self.c[:, :-1], self.c[:, 1:]
                u = P['phi_sol'] * qx[:, 1:-1]
                fx[:, 1:-1] = np.where(u > 0, u * cl, u * cr)
                cd, cu = self.c[:-1, :], self.c[1:, :]
                v = P['phi_sol'] * qy[1:-1, :]
                fy[1:-1, :] = np.where(v > 0, v * cd, v * cu)
                self.c -= dt * divergence(fx, fy, h) / np.maximum(self.rho, 1e-3)
                np.clip(self.c, 0.0, None, out=self.c)
            self.step += 1
        return stats

    # ---- measurements
    def speeds(self):
        v = np.abs(self.qx[:, 1:-1]) / np.maximum(0.5 * (self.rho[:, :-1] + self.rho[:, 1:]), 0.05)
        v = v[np.isfinite(v)]
        return float(np.percentile(v, 50)), float(np.percentile(v, 99))

    def coherence_mm(self):
        """Correlation length of exp(i phi): the distance over which the cortex beats together."""
        z = np.exp(1j * self.phi) * (self.rho > 0.05)
        F = np.abs(np.fft.fft2(z)) ** 2
        ac = np.real(np.fft.ifft2(F))
        ac = ac / max(ac.flat[0], 1e-30)
        line = ac[0, :self.n // 2]
        k = np.argmax(line < 1 / np.e) if (line < 1 / np.e).any() else len(line)
        return float(k * self.h / 1000.0)

    def vein_stats(self):
        """Veins = faces whose conductivity is far above the sheet. Returns the share of the area, the
        share of the flux they carry, the Gini of D, and the spacing from the spectral peak."""
        D = np.maximum(self.Dx[:, 1:-1], 0)
        Dy = np.maximum(self.Dy[1:-1, :], 0)
        allD = np.concatenate([D.ravel(), Dy.ravel()])
        if allD.max() <= 1e-9 or not np.isfinite(allD).all():
            return dict(veined=0.0, flux_share=0.0, gini=0.0, spacing_mm=None, width_um=None,
                        contrast=1.0)
        thr = max(10.0 * float(np.median(allD[allD > 1e-9])) if (allD > 1e-9).any() else 0.0, 1e-9)
        veined = float((allD > thr).mean())
        Q = np.concatenate([self.Qbx[:, 1:-1].ravel(), self.Qby[1:-1, :].ravel()])
        flux_share = float(Q[allD > thr].sum() / max(Q.sum(), 1e-12))
        srt = np.sort(allD)
        cum = np.cumsum(srt) / max(srt.sum(), 1e-12)
        gini = float(1.0 - 2.0 * cum.mean())
        # spacing: radial power spectrum of the cell-centred vein mask, peak away from DC
        m = np.zeros((self.n, self.n))
        m[:, :-1] += (D > thr)
        m[:-1, :] += (Dy > thr)
        m -= m.mean()
        F = np.abs(np.fft.fftshift(np.fft.fft2(m))) ** 2
        ky, kx = np.indices(F.shape) - self.n // 2
        kr = np.sqrt(kx ** 2 + ky ** 2).astype(int)
        prof = np.bincount(kr.ravel(), F.ravel(), minlength=self.n) / np.maximum(np.bincount(kr.ravel(), minlength=self.n), 1)
        k = int(np.argmax(prof[2:self.n // 2]) + 2)
        spacing_mm = (self.span / k) / 1000.0
        # width: mean run length of above-threshold faces across the flow, in um
        runs = []
        for row in (D > thr):
            d = np.diff(np.concatenate([[0], row.astype(int), [0]]))
            runs += list(np.flatnonzero(d < 0) - np.flatnonzero(d > 0))
        width = float(np.mean(runs) * self.h) if runs else None
        lo = float(np.percentile(allD[allD > 0], 10)) if (allD > 0).any() else 0.0
        return dict(veined=veined, flux_share=flux_share, gini=gini, spacing_mm=spacing_mm,
                    width_um=width, contrast=float(allD.max() / max(lo, 1e-9)))


# ------------------------------------------------------------------------------------------- output
def png(path, img, cmap='fire'):
    from PIL import Image
    a = np.asarray(img, dtype=float)
    lo, hi = np.percentile(a, 1), np.percentile(a, 99.5)
    t = np.clip((a - lo) / max(hi - lo, 1e-12), 0, 1)
    if cmap == 'fire':
        rgb = np.stack([np.clip(t * 2.2, 0, 1), np.clip(t * 1.5 - 0.35, 0, 1), np.clip(t * 2.0 - 1.2, 0, 1)], -1)
    elif cmap == 'signed':
        s = np.clip(a / max(np.percentile(np.abs(a), 99), 1e-12), -1, 1)
        rgb = np.stack([np.clip(s, 0, 1), 0.12 + 0.1 * np.abs(s), np.clip(-s, 0, 1)], -1)
    else:
        rgb = np.stack([t, t, t], -1)
    Image.fromarray((rgb * 255).astype(np.uint8)).resize((512, 512), Image.NEAREST).save(path)


def banner(t):
    print('\n' + t + '\n' + '-' * len(t), flush=True)


# ------------------------------------------------------------------------------------- experiment A
def drivers(s, kind):
    """The three candidate sources of the long-range flux that adaptation needs."""
    n = s.n
    y, x = np.indices((n, n))
    mmx = (x - n / 2 + 0.5) * s.h / 1000.0
    mmy = (y - n / 2 + 0.5) * s.h / 1000.0
    r = np.hypot(mmx, mmy)
    if kind == 'peristalsis':                              # local pumping only, phases free
        return
    if kind == 'pressure-coupled':                         # the elliptic solve as the global coupler
        s.P['chi_p'] = 0.6
        return
    if kind == 'throughput':                               # uptake at a food blob, sink under the rim
        src = np.exp(-((mmx + 2.0) ** 2 + mmy ** 2) / (2 * 0.5 ** 2))
        snk = np.clip(r - 0.62 * r.max(), 0, None)
        s.s_ext = s.P['throughput'] * (src / src.sum() - snk / snk.sum()) * n * n * 1e-3
        return
    raise ValueError(kind)


def expA(n=128, steps=2500, span=8.0, seed=1, kinds=None, **kw):
    banner(f'A  channelling — what drives it?  {span} mm at {n}^2 ({span * 1000 / n:.0f} um cells), {steps} steps each')
    kinds = kinds or ['peristalsis', 'pressure-coupled', 'throughput']
    out = []
    for kind in kinds:
        s = Sheet(n=n, span_mm=span, seed=seed, throughput=kw.pop('throughput', 4.0), **kw)
        drivers(s, kind)
        t0 = time.time()
        s.advance(steps)
        st = s.vein_stats()
        v50, v99 = s.speeds()
        st.update(kind=kind, step=s.step, v50=v50, v99=v99, coherence_mm=s.coherence_mm(),
                  resid=float(getattr(s, 'resid', 0)), cycles=int(getattr(s, 'cycles_used', 0)),
                  rho_sheet=float(np.median(s.rho)), rho_max=float(s.rho.max()),
                  secs=time.time() - t0)
        out.append(st)
        print(f"  {kind:16s} veined {st['veined']:.3f}  flux in veins {st['flux_share']:.3f}  "
              f"gini {st['gini']:.3f}  spacing {st['spacing_mm'] or 0:.2f} mm  width {st['width_um'] or 0:5.0f} um  "
              f"contrast {st['contrast']:.0f}  v99 {v99:7.1f} um/s  sheet rho {st['rho_sheet']:.3f}  "
              f"resid {st['resid']:.1e} in {st['cycles']} cycles", flush=True)
        png(os.path.join(OUT, f'A-{kind}-D.png'), np.maximum(s.Dx[:, 1:-1], 0) ** 0.4)
        png(os.path.join(OUT, f'A-{kind}-rho.png'), s.rho)
    return out


# ------------------------------------------------------------------------------------- experiment B
def expB(n=128, steps=2000, span=8.0, seed=2, sweep=None, **kw):
    """Attractant at one spot; a passive tracer starts uniform. Net transport = the tracer's centre of
    mass moving toward (or away from) the food, in um, after equilibration."""
    banner(f'B  transport — food at (-2 mm, 0), {n}^2 over {span} mm, {steps} steps')
    out = []
    sweep = sweep or [dict(chi_A=0.35, chi_E=0.0), dict(chi_A=0.0, chi_E=0.8),
                      dict(chi_A=0.35, chi_E=0.8), dict(chi_A=0.35, chi_E=-0.8)]
    for cfg in sweep:
        s = Sheet(n=n, span_mm=span, seed=seed, **{**kw, **cfg})
        y, x = np.indices((n, n))
        mm = (x - n / 2 + 0.5) * s.h / 1000.0, (y - n / 2 + 0.5) * s.h / 1000.0
        food = np.exp(-((mm[0] + 2.0) ** 2 + mm[1] ** 2) / (2 * 0.6 ** 2))
        s.A = food
        s.c = np.ones((n, n))
        cx0 = float((s.c * mm[0]).sum() / s.c.sum())
        s.advance(steps)
        cx1 = float((s.c * mm[0]).sum() / s.c.sum())
        drift = (cx1 - cx0) * 1000.0                       # um, negative = toward the food
        v50, v99 = s.speeds()
        r = dict(**cfg, drift_um=drift, toward_food=drift < 0, v50=v50, v99=v99,
                 per_period_um=drift / (steps * s.P['dt'] / s.P['period']))
        out.append(r)
        print(f"  chi_A {cfg.get('chi_A', 0):+.2f} chi_E {cfg.get('chi_E', 0):+.2f} -> "
              f"drift {drift:+8.1f} um  ({'toward' if drift < 0 else 'away from'} food, "
              f"{r['per_period_um']:+.2f} um/period)  v99 {v99:.0f} um/s", flush=True)
        if cfg is sweep[-1]:
            png(os.path.join(OUT, 'B-tracer.png'), s.c)
            png(os.path.join(OUT, 'B-conductivity.png'), s.Dx[:, 1:-1] ** 0.4)
    return out


# ------------------------------------------------------------------------------------- experiment C
def expC(n=256, span=12.0, seed=3, **kw):
    """Convergence of one V-cycle at the contrast a grown vein network actually produces."""
    banner(f'C  solver — V(1,1) convergence at vein contrast, {n}^2')
    s = Sheet(n=n, span_mm=span, seed=seed, **kw)
    s.advance(1500)                                        # grow a real network first
    st = s.vein_stats()
    Px, Py = s.permeability()
    contrast = float(Px.max() / max(Px[Px > 0].min(), 1e-12))
    solver = Poisson(Px, Py, s.h, s.P['beta'] / s.P['dt'])
    rhs = s.P['beta'] / s.P['dt'] * s.p - s.rho * s.P['amp'] * s.omega() * np.cos(s.phi)
    cold = np.zeros_like(s.p)
    _, hc = solver.solve(cold, rhs, cycles=25)
    _, hp = solver.pcg(np.zeros_like(s.p), rhs, tol=1e-6, maxit=80)
    warm = s.p.copy()
    _, hw = solver.solve(warm, rhs, cycles=4)
    fac = [hc[i + 1] / max(hc[i], 1e-30) for i in range(len(hc) - 1)]
    steady = float(np.median(fac[3:])) if len(fac) > 4 else float(np.median(fac))
    one_cycle_warm = hw[1] / max(hw[0], 1e-30)
    print(f'  levels {len(solver.levels)}  permeability contrast {contrast:.3e}  vein contrast {st["contrast"]:.2e}')
    print(f'  cold V(1,1) factors  {" ".join(f"{f:.3f}" for f in fac[:8])} ...  steady {steady:.3f}')
    pcg_n = next((i for i, v in enumerate(hp) if v <= 1e-6 * hp[0]), len(hp) - 1)
    print(f'  warm start: residual after one cycle {one_cycle_warm:.4f} of the step\'s own residual')
    print(f'  MG-preconditioned CG: {pcg_n} iterations to 1e-6 (cold)', flush=True)
    return dict(levels=len(solver.levels), contrast=contrast, vein_contrast=st['contrast'],
                steady_factor=steady, warm_one_cycle=one_cycle_warm, pcg_iters_1e6=pcg_n,
                cold_to_1e4_cycles=int(np.ceil(np.log(1e-4) / np.log(max(steady, 1e-6)))))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('which', nargs='?', default='ABC')
    ap.add_argument('--n', type=int, default=256)
    ap.add_argument('--steps', type=int, default=3000)
    ap.add_argument('--span', type=float, default=12.0)
    ap.add_argument('--tag', default='p1b')
    a, rest = ap.parse_known_args()
    kw = {}
    for i in range(0, len(rest), 2):
        kw[rest[i].lstrip('-')] = float(rest[i + 1])
    os.makedirs(OUT, exist_ok=True)
    res = dict(when=time.strftime('%Y-%m-%d %H:%M'), n=a.n, steps=a.steps, span_mm=a.span, kw=kw)
    if 'A' in a.which:
        res['A'] = expA(n=min(a.n, 160), steps=a.steps, span=a.span, **kw)
    if 'B' in a.which:
        res['B'] = expB(n=min(a.n, 128), steps=min(a.steps, 2500), **kw)
    if 'C' in a.which:
        res['C'] = expC(n=a.n, span=a.span, **kw)
    with open(os.path.join(OUT, f'{a.tag}.json'), 'w') as f:
        json.dump(res, f, indent=1, default=float)
    print(f'\nwrote {OUT}/{a.tag}.json', flush=True)


if __name__ == '__main__':
    main()

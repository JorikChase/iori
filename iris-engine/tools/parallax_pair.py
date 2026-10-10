#!/usr/bin/env python3
"""P1: does a macro eye video contain depth parallax beyond a rigid/planar motion?
usage: parallax_pair.py A.png B.png outprefix [--pupil cx,cy,r]
1. mask pupil, specular, dark lashes; 2. SIFT + RANSAC homography (planar iris) B->A;
3. DIS dense flow A vs warped B; 4. subtract a smooth cubic field (residual planar/cornea terms);
5. report residual RMS along vs across the global motion direction, and save maps.
Run with /usr/bin/python3 (cv2 4.13)."""
import sys, cv2, numpy as np, json

def pupil_circle(g):
    s = cv2.resize(g, None, fx=0.25, fy=0.25, interpolation=cv2.INTER_AREA)
    b = cv2.GaussianBlur(s, (0, 0), 3)
    best = None
    for pct in (2, 4, 7, 10, 14):
        m = (b <= np.percentile(b, pct)).astype(np.uint8)
        m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((9, 9), np.uint8))
        k, lab, st, cen = cv2.connectedComponentsWithStats(m)
        for j in range(1, k):
            a = st[j, cv2.CC_STAT_AREA]
            if a < 2000: continue
            cnt, _ = cv2.findContours((lab == j).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
            (cx, cy), r = cv2.minEnclosingCircle(cnt[0])
            fill = a / (np.pi * r * r)
            if fill < 0.7: continue
            if best is None or fill * a > best[0]: best = (fill * a, cx * 4, cy * 4, r * 4)
    return best[1:]

def masks(g, pup):
    h, w = g.shape
    yy, xx = np.mgrid[0:h, 0:w]
    cx, cy, r = pup
    d = np.hypot(xx - cx, yy - cy)
    iris = (d > r * 1.12)
    spec = cv2.dilate((g > 235).astype(np.uint8), np.ones((41, 41), np.uint8)) > 0
    dark = cv2.dilate((g < 18).astype(np.uint8), np.ones((15, 15), np.uint8)) > 0
    return iris & ~spec & ~dark, d

def fit_poly(fx, fy, valid, deg=3):
    h, w = fx.shape
    yy, xx = np.mgrid[0:h, 0:w]
    x = (xx[valid] - w / 2) / w; y = (yy[valid] - h / 2) / h
    cols = [x**i * y**j for i in range(deg + 1) for j in range(deg + 1 - i)]
    A = np.stack(cols, 1)
    sel = np.ones(len(x), bool)
    for it in range(4):
        cx_, *_ = np.linalg.lstsq(A[sel], fx[valid][sel], rcond=None)
        cy_, *_ = np.linalg.lstsq(A[sel], fy[valid][sel], rcond=None)
        rx = fx[valid] - A @ cx_; ry = fy[valid] - A @ cy_
        rr = np.hypot(rx, ry); sel = rr < 3 * np.median(rr) + 1e-6
    X = (xx - w / 2) / w; Y = (yy - h / 2) / h
    colsF = [X**i * Y**j for i in range(deg + 1) for j in range(deg + 1 - i)]
    AF = np.stack(colsF, -1)
    return AF @ cx_, AF @ cy_

def main():
    A = cv2.imread(sys.argv[1]); B = cv2.imread(sys.argv[2]); out = sys.argv[3]
    gA = cv2.cvtColor(A, cv2.COLOR_BGR2GRAY); gB = cv2.cvtColor(B, cv2.COLOR_BGR2GRAY)
    pA = pupil_circle(gA); pB = pupil_circle(gB)
    mA, dA = masks(gA, pA); mB, _ = masks(gB, pB)
    rep = {'pupilA': pA, 'pupilB': pB, 'pupil_ratio': pB[2] / pA[2]}
    # global planar motion
    sift = cv2.SIFT_create(8000)
    kA, dsA = sift.detectAndCompute(gA, (mA * 255).astype(np.uint8))
    kB, dsB = sift.detectAndCompute(gB, (mB * 255).astype(np.uint8))
    mt = cv2.BFMatcher().knnMatch(dsA, dsB, k=2)
    good = [m for m, n in mt if m.distance < 0.75 * n.distance]
    src = np.float32([kB[m.trainIdx].pt for m in good]); dst = np.float32([kA[m.queryIdx].pt for m in good])
    Hm, inl = cv2.findHomography(src, dst, cv2.RANSAC, 2.0)
    inl = inl.ravel().astype(bool)
    shift = (dst[inl] - src[inl]).mean(0)
    rep.update(matches=int(len(good)), inliers=int(inl.sum()), mean_shift_px=shift.tolist(),
               shift_mag_px=float(np.hypot(*shift)))
    Bw = cv2.warpPerspective(gB, Hm, (gA.shape[1], gA.shape[0]), flags=cv2.INTER_CUBIC)
    mBw = cv2.warpPerspective(mB.astype(np.uint8), Hm, (gA.shape[1], gA.shape[0])) > 0
    valid = mA & mBw
    # dense flow
    dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
    dis.setFinestScale(0); dis.setPatchSize(8); dis.setPatchStride(3)
    dis.setGradientDescentIterations(25); dis.setVariationalRefinementIterations(8)
    flow = dis.calc(gA, Bw, None)
    fx, fy = flow[..., 0], flow[..., 1]
    # texture gate: flow is only meaningful where there is gradient
    gx = cv2.Sobel(gA, cv2.CV_32F, 1, 0, ksize=3); gy = cv2.Sobel(gA, cv2.CV_32F, 0, 1, ksize=3)
    tex = cv2.GaussianBlur(gx * gx + gy * gy, (0, 0), 4)
    valid &= tex > np.percentile(tex[valid], 40)
    px_, py_ = fit_poly(fx, fy, valid)
    rx, ry = fx - px_, fy - py_
    # along / across the global motion
    u = shift / (np.hypot(*shift) + 1e-9)
    along = rx * u[0] + ry * u[1]; across = -rx * u[1] + ry * u[0]
    def rms(a): return float(np.sqrt(np.mean(a[valid] ** 2)))
    def mad(a): return float(1.4826 * np.median(np.abs(a[valid] - np.median(a[valid]))))
    rep.update(residual_rms_along=rms(along), residual_rms_across=rms(across),
               residual_mad_along=mad(along), residual_mad_across=mad(across),
               smooth_flow_rms=float(np.sqrt(np.mean((px_[valid]**2 + py_[valid]**2)))),
               valid_px=int(valid.sum()))
    # radial profile of |along| residual (does it grow toward the pupil / collarette?)
    rb = np.linspace(pA[2] * 1.12, np.percentile(dA[valid], 99), 9)
    prof = []
    for a0, a1 in zip(rb[:-1], rb[1:]):
        s = valid & (dA >= a0) & (dA < a1)
        if s.sum() > 500: prof.append([float(a0 / pA[2]), float(np.sqrt(np.mean(along[s]**2))), float(np.sqrt(np.mean(across[s]**2)))])
    rep['radial_profile_r_over_rpupil__rms_along__rms_across'] = prof
    # maps
    def cmap(v, lim):
        m = np.clip(v / lim, -1, 1)
        img = np.zeros(v.shape + (3,), np.uint8)
        img[..., 2] = np.clip(m, 0, 1) * 255; img[..., 0] = np.clip(-m, 0, 1) * 255
        img[~valid] = 0
        return img
    lim = 4 * max(mad(along), 0.05)
    base = cv2.cvtColor(gA, cv2.COLOR_GRAY2BGR)
    ov = cv2.addWeighted(base, 0.45, cmap(along, lim), 0.9, 0)
    cv2.imwrite(out + '-along.jpg', ov, [cv2.IMWRITE_JPEG_QUALITY, 88])
    cv2.imwrite(out + '-across.jpg', cv2.addWeighted(base, 0.45, cmap(across, lim), 0.9, 0), [cv2.IMWRITE_JPEG_QUALITY, 88])
    diff = cv2.absdiff(gA, Bw); diff[~valid] = 0
    cv2.imwrite(out + '-absdiff.jpg', diff, [cv2.IMWRITE_JPEG_QUALITY, 85])
    np.savez_compressed(out + '-residual.npz', along=along.astype(np.float16), across=across.astype(np.float16), valid=valid)
    rep['map_limit_px'] = lim
    json.dump(rep, open(out + '.json', 'w'), indent=1)
    print(json.dumps(rep, indent=1))

if __name__ == '__main__':
    main()

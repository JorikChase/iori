#!/usr/bin/env python3
"""P1 survey: per-frame pupil circle, sharpness and brightness of a macro eye video.
usage: parallax_survey.py <video> <outdir> [--scale 0.25]
Writes frames.csv and a contact sheet. Run with /usr/bin/python3 (cv2 4.13)."""
import sys, csv, cv2, numpy as np, os
vid, out = sys.argv[1], sys.argv[2]
scale = float(sys.argv[sys.argv.index('--scale')+1]) if '--scale' in sys.argv else 0.25
os.makedirs(out, exist_ok=True)
cap = cv2.VideoCapture(vid)
n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)); fps = cap.get(cv2.CAP_PROP_FPS)
W = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)); H = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
print(f'{n} frames @ {fps:.2f} fps, {W}x{H}')
rows = []; thumbs = []
i = 0
while True:
    ok, fr = cap.read()
    if not ok: break
    g = cv2.cvtColor(fr, cv2.COLOR_BGR2GRAY)
    s = cv2.resize(g, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    # pupil: darkest large blob. threshold at a low percentile, keep the roundest big component
    blur = cv2.GaussianBlur(s, (0, 0), 3)
    best = None
    for pct in (2, 4, 7, 10):
        t = np.percentile(blur, pct)
        m = (blur <= t).astype(np.uint8)
        m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
        k, lab, st, cen = cv2.connectedComponentsWithStats(m)
        for j in range(1, k):
            a = st[j, cv2.CC_STAT_AREA]
            if a < 400: continue
            cnt, _ = cv2.findContours((lab == j).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
            (cx, cy), r = cv2.minEnclosingCircle(cnt[0])
            fill = a / (np.pi * r * r + 1e-6)
            if fill < 0.6: continue
            score = fill * min(a, 40000)
            if best is None or score > best[0]: best = (score, cx / scale, cy / scale, r / scale, fill, pct)
    lap = cv2.Laplacian(s, cv2.CV_32F)
    if best:
        _, cx, cy, r, fill, pct = best
        yy, xx = np.mgrid[0:s.shape[0], 0:s.shape[1]]
        d = np.hypot(xx - cx * scale, yy - cy * scale)
        ann = (d > r * scale * 1.15) & (d < r * scale * 2.2)
        sharp = float(lap[ann].var()) if ann.sum() > 100 else float(lap.var())
        bright = float(s[ann].mean()) if ann.sum() > 100 else float(s.mean())
    else:
        cx = cy = r = fill = pct = float('nan'); sharp = float(lap.var()); bright = float(s.mean())
    rows.append([i, i / fps, cx, cy, r, fill, pct, sharp, bright])
    if i % 30 == 0:
        th = cv2.resize(fr, (240, int(240 * H / W)))
        if best:
            cv2.circle(th, (int(cx * 240 / W), int(cy * 240 / W)), int(r * 240 / W), (0, 255, 0), 1)
        cv2.putText(th, f'{i} r={r:.0f}', (3, 12), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 255, 255), 1)
        thumbs.append(th)
    i += 1
with open(os.path.join(out, 'frames.csv'), 'w', newline='') as f:
    w = csv.writer(f); w.writerow(['frame', 't', 'cx', 'cy', 'r', 'fill', 'pct', 'sharp', 'bright']); w.writerows(rows)
cols = 8; rws = (len(thumbs) + cols - 1) // cols
h, w_ = thumbs[0].shape[:2]
sheet = np.zeros((rws * h, cols * w_, 3), np.uint8)
for k, th in enumerate(thumbs):
    sheet[(k // cols) * h:(k // cols + 1) * h, (k % cols) * w_:(k % cols + 1) * w_] = th
cv2.imwrite(os.path.join(out, 'contact.jpg'), sheet, [cv2.IMWRITE_JPEG_QUALITY, 85])
a = np.array(rows, float)
print('pupil r px: min %.0f  median %.0f  max %.0f' % (np.nanmin(a[:, 4]), np.nanmedian(a[:, 4]), np.nanmax(a[:, 4])))
print('centre x range %.0f..%.0f  y range %.0f..%.0f' % (np.nanmin(a[:, 2]), np.nanmax(a[:, 2]), np.nanmin(a[:, 3]), np.nanmax(a[:, 3])))
print('sharp: p10 %.1f p50 %.1f p90 %.1f' % tuple(np.nanpercentile(a[:, 7], [10, 50, 90])))

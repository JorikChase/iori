#!/usr/bin/env python3
"""fit px → engine canvas px affine for one eye, from a full-frame engine capture (today/NN-full.png) against the photo."""
import sys, os, cv2, numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); ENG = os.path.dirname(os.path.dirname(HERE))
from rig import REFS
def align(ref, fitW=1280):
    a = cv2.imread(os.path.join(HERE, 'today', f'{ref}-full.jpg')); p0 = cv2.imread(os.path.join(ENG, 'ref', REFS[ref]))
    fitH = int(round(p0.shape[0] * fitW / p0.shape[1])); p = cv2.resize(p0, (fitW, fitH), interpolation=cv2.INTER_AREA)
    ga = cv2.cvtColor(a, cv2.COLOR_BGR2GRAY).astype(np.float32); gp = cv2.cvtColor(p, cv2.COLOR_BGR2GRAY).astype(np.float32)
    ys, xs = np.nonzero(cv2.GaussianBlur(ga, (0, 0), 2) < 235); ba = (xs.min(), xs.max(), ys.min(), ys.max())
    mp = cv2.GaussianBlur(gp, (0, 0), 2) > 12; ys, xs = np.nonzero(mp); bp = (xs.min(), xs.max(), ys.min(), ys.max())
    s = ((ba[1] - ba[0]) / (bp[1] - bp[0]) + (ba[3] - ba[2]) / (bp[3] - bp[2])) / 2
    w = np.array([[s, 0, (ba[0] + ba[1]) / 2 - s * (bp[0] + bp[1]) / 2], [0, s, (ba[2] + ba[3]) / 2 - s * (bp[2] + bp[3]) / 2]], np.float32)
    hp = lambda g: g - cv2.GaussianBlur(g, (0, 0), 8)
    m = cv2.erode(mp.astype(np.uint8), np.ones((25, 25)))
    try: cc, w = cv2.findTransformECC(hp(gp), hp(ga), w, cv2.MOTION_AFFINE, (3, 300, 1e-7), None, 3)   # w: photo fit px → render px
    except Exception as e: cc = None; print('ecc failed, bbox only', e)
    np.save(os.path.join(HERE, 'today', f'{ref}-affine.npy'), w); return w, cc, ba, bp
if __name__ == '__main__':
    for r in sys.argv[1:]: print(r, align(r))

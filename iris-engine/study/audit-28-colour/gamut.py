import numpy as np, json, cv2
lam=np.array([400,420,440,460,480,500,520,540,560,580,600,620,640,660,680,700.])
xb=np.array([0.0143,0.1344,0.3483,0.2908,0.0956,0.0049,0.0633,0.2904,0.5945,0.9163,1.0622,0.8544,0.4479,0.1649,0.0468,0.0114])
yb=np.array([0.0004,0.0040,0.0230,0.0600,0.1390,0.3230,0.7100,0.9540,0.9950,0.8700,0.6310,0.3810,0.1750,0.0610,0.0170,0.0041])
zb=np.array([0.0679,0.6456,1.7471,1.6692,0.8130,0.2720,0.0782,0.0203,0.0039,0.0017,0.0008,0.0002,0,0,0,0])
d65=np.array([82.75,93.43,104.86,117.81,115.92,109.35,104.79,104.41,100.0,95.79,90.01,87.70,83.70,80.21,78.28,71.61])
ip=lambda pts:np.interp(lam,[p[0] for p in pts],[p[1] for p in pts])
aEu=(lam/550)**-3.33; aPh=(lam/550)**-4.75
Ripe=ip([[464,.020],[549,.030],[611,.045]]); rhoEu=ip([[464,.022],[549,.038],[611,.065]]); rhoPh=ip([[464,.055],[549,.15],[611,.26]])
yel=1-1/(1+np.exp(-(lam-500)/14))
M=np.array([[3.2406,-1.5372,-0.4986],[-0.9689,1.8758,0.0415],[0.0557,-0.2040,1.0570]])
def lut(rayExp,mies):
    ray=(550/lam)**rayExp
    Ma=6*((np.arange(24)+.5)/24)**2; Ds=0.5*(np.arange(16)+.5)/16; ph=np.linspace(0,1,5); yl=np.linspace(0,2.5,8)
    Ma,Ds,ph,yl,mi=np.meshgrid(Ma,Ds,ph,yl,np.array(mies),indexing='ij'); sh=Ma.shape
    Ma,Ds,ph,yl,mi=[a.reshape(-1,1) for a in (Ma,Ds,ph,yl,mi)]
    melS=aEu+(aPh-aEu)*ph; sigS=np.maximum(Ds,.005)*(ray+(1-ray)*mi); sigA=0.7*Ma*melS+1e-4
    a=1+sigA/sigS; b=np.sqrt(np.maximum(a*a-1,1e-6)); x=np.minimum(b*sigS,30); coth=np.cosh(x)/np.sinh(x)
    Rs=(1-Ripe*(a-b*coth))/(a-Ripe+b*coth); T=np.exp(-Ma*melS); rho=rhoEu+(rhoPh-rhoEu)*ph; Ty=np.exp(-yl*yel)
    r=((1-T)*rho+T*T*Rs)*Ty*Ty
    w=np.stack([xb*d65,yb*d65,zb*d65]); XYZ=r@w.T/w.sum(1)
    return np.maximum(XYZ@M.T,0)            # linear sRGB
def lab(lin):
    s=np.where(lin<=.0031308,12.92*lin,1.055*np.clip(lin,1e-9,None)**(1/2.4)-.055).astype(np.float32)
    return cv2.cvtColor(np.clip(s,0,1)[None,:,::-1].copy(),cv2.COLOR_BGR2Lab)[0]
cells=json.load(open('cells.json'))
def test(name,L):
    scales=np.array([.35,.5,.7,.85,1.0,1.2]); cand=np.concatenate([lab(L*s) for s in scales])
    row=[]
    for n,c in cells.items():
        c=np.array(c,np.float32); best=np.full(len(c),1e9); bab=np.zeros(len(c))
        for k in range(0,len(cand),200000):
            d=((c[:,None,:]-cand[None,k:k+200000])**2)
            e=d.sum(2); i=e.argmin(1); v=e[np.arange(len(c)),i]; ab=np.sqrt(d[np.arange(len(c)),i,1:].sum(1))
            u=v<best; best[u]=v[u]; bab[u]=ab[u]
        dE=np.sqrt(best); row.append('%s: dE %.1f (p90 %.1f, >5: %2.0f%%)'%(n,dE.mean(),np.percentile(dE,90),100*(dE>5).mean()))
    print('%-46s'%name,' | '.join(row))
test('current  rayExp 5, mie 0.08 (fixed)',lut(5,[.08]))
test('mie as a free per-cell axis (rayExp 5)',lut(5,[0,.08,.2,.35,.5,.7,1]))
test('rayExp 4 + mie axis',lut(4,[0,.08,.2,.35,.5,.7,1]))
test('rayExp 2.5 + mie axis',lut(2.5,[0,.08,.2,.35,.5,.7,1]))
print('--- per-photo camera grade (one global chroma gain + hue rotation in Lab) on top of the mie-axis LUT ---')
L=lut(5,[0,.08,.2,.35,.5,.7,1]); scales=np.array([.35,.5,.7,.85,1.0,1.2]); base=np.concatenate([lab(L*s) for s in scales])
base=base[::3]
for n,c in cells.items():
    c=np.array(c,np.float32)[::2]; res=[]
    for g in (1.0,1.3,1.6,2.0):
        for rot in (-30,-20,-10,0,10,20):
            t=np.radians(rot); cand=base.copy(); a,b=base[:,1]*g,base[:,2]*g; cand[:,1]=a*np.cos(t)-b*np.sin(t); cand[:,2]=a*np.sin(t)+b*np.cos(t)
            best=np.full(len(c),1e9)
            for k in range(0,len(cand),150000):
                e=((c[:,None,:]-cand[None,k:k+150000])**2).sum(2).min(1); best=np.minimum(best,e)
            res.append((np.sqrt(best).mean(),g,rot))
    res.sort(); print(n,'best grade: dE %.1f at chroma x%.1f, hue %+d deg   (no grade: %.1f)'%(*res[0],[r for r in res if r[1]==1.0 and r[2]==0][0][0]))

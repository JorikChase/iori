import numpy as np, math
from numpy import pi
sr=48000
# ---- K-weighting
def fr(b,a,f,sr=48000):
    z=np.exp(1j*2*pi*f/sr); return (b[0]+b[1]/z+b[2]/z**2)/(1+a[0]/z+a[1]/z**2)
f=np.array([20,25,31.5,40,50,63,100,200,500,1000,1500,2000,3000,4000,5000,8000,10000,16000,20000.])
pre=([1.53512485958697,-2.69169618940638,1.19839281085285],[-1.69065929318241,0.73248077421585])
rlb=([1,-2,1],[-1.99004745483398,0.99007225036621])
K=lambda f:20*np.log10(abs(fr(*pre,f)*fr(*rlb,f)))
# simple: RBJ HP 38Hz Q.5, RBJ high shelf +4 @1500 S=1
def rbjhp(f0,Q):
    w=2*pi*f0/sr;al=math.sin(w)/(2*Q);c=math.cos(w);a0=1+al
    return ([(1+c)/2/a0,-(1+c)/a0,(1+c)/2/a0],[-2*c/a0,(1-al)/a0])
def rbjhs(f0,dB,S=1):
    A=10**(dB/40);w=2*pi*f0/sr;c=math.cos(w);al=math.sin(w)/2*math.sqrt((A+1/A)*(1/S-1)+2);r=2*math.sqrt(A)*al
    a0=(A+1)-(A-1)*c+r
    return ([A*((A+1)+(A-1)*c+r)/a0,-2*A*((A-1)+(A+1)*c)/a0,A*((A+1)+(A-1)*c-r)/a0],[2*((A-1)-(A+1)*c)/a0,((A+1)-(A-1)*c-r)/a0])
S=lambda f:20*np.log10(abs(fr(*rbjhp(38,.5),f)*fr(*rbjhs(1500,4),f)))
fp1=lambda f:20*np.log10(abs(1j*f/(1j*f+38)))+0*f # 1st-order 38Hz analog
S1=lambda f:fp1(f)+20*np.log10(abs(fr(*rbjhs(1500,4),f)))
print('f  K  simpleRBJ-K  1stHP-K')
for x in f: print(int(x),round(float(K(x)),2),round(float(S(x)-K(x)),2),round(float(S1(x)-K(x)),2))
ff=np.linspace(20,20000,20000)
print('max |err| 2ndHP',abs(S(ff)-K(ff)).max(),' 1stHP',abs(S1(ff)-K(ff)).max())
# LUFS err on spectra: pink, bassy (−6dB/oct more), bright
def lufs_err(H,tilt):
    fg=np.geomspace(20,20000,4000);w=(fg**(tilt))*np.gradient(fg) # psd ~ f^tilt
    e=lambda G:10*np.log10((w*10**(G/10)).sum()/w.sum())
    return e(H(fg))-e(K(fg))
for n,t in (('white',0),('pink',-1),('brown',-2)):
    print(n,'2ndHP err LU',round(float(lufs_err(S,t)),3),'1stHP',round(float(lufs_err(S1,t)),3))
# 48k coefs at 44.1k err
def Kat(f,fs): return 20*np.log10(abs(fr(*pre,f,fs)*fr(*rlb,f,fs)))
print('48k coefs used at 44.1k, max err',abs(Kat(ff[ff<20000],44100)-K(ff[ff<20000])).max(),' at 10k',Kat(10000.,44100)-K(10000.))
# ---- aliasing: saw at f0, compare power of inharmonic bins to harmonic power
N=1<<17
def spec_snr(x,f0,sr,hm=20000):
    w=np.blackman(len(x));X=np.fft.rfft(x*w);P=abs(X)**2;fr_=np.fft.rfftfreq(len(x),1/sr)
    h=np.arange(1,int(sr/2/f0)+1)*f0
    mask=np.zeros(len(P),bool)
    bw=4
    for k in h:
        i=int(round(k*len(x)/sr));mask[max(0,i-bw):i+bw+1]=True
    aud=fr_<=hm
    harm=P[mask].sum();al=P[(~mask)&aud].sum()
    # worst single alias re fundamental
    i1=int(round(f0*len(x)/sr));fund=P[i1-bw:i1+bw+1].sum()
    pk=P[(~mask)&aud].max()*7 # blackman main lobe approx sum
    return 10*np.log10(al/harm),10*np.log10(pk/fund)
def naive(f0,sr,n):
    p=(np.arange(n)*f0/sr)%1;return 2*p-1
def pblep2(f0,sr,n):
    dt=f0/sr;p=(np.arange(n)*dt)%1;y=2*p-1
    a=p<dt;t=p[a]/dt;y[a]-=t+t-t*t-1
    b=p>1-dt;t=(p[b]-1)/dt;y[b]-=t*t+t+t+1
    return y
def blep_tbl(f0,sr,n,zc=16,ov=1):
    # windowed-sinc minBLEP-free linear-phase residual via direct additive of integrated sinc
    osn=2048;L=2*zc*osn+1;tt=(np.arange(L)-zc*osn)/osn
    h=np.sinc(tt*.92)*.92*np.blackman(L);I=np.cumsum(h)/osn;I/=I[-1]
    res=I-(tt>=0);res_t=tt
    dt=f0/sr;p=(np.arange(n)*dt)%1;y=2*p-1
    edges=np.arange(0,int(n*dt)+1)/dt
    for e in edges:
        c=int(np.floor(e))
        ks=np.arange(max(0,c-zc+1),min(n,c+zc+1))
        y[ks]-=2*np.interp(ks-e,res_t,res) if False else 0
        y[ks]+=-2*np.interp(ks-e,res_t,res)*-1*-1
    return y
def wt(f0,sr,n,os=1,mips_per_oct=1,tl=2048,interp='cubic',topfrac=1.0):
    # build bandlimited saw for the mip containing f0
    fs=sr*os
    # highest harmonic allowed: per octave band edge from top freq in band
    oct_=math.ceil(math.log2(f0/20)*mips_per_oct)/mips_per_oct
    ftop=20*2**oct_
    nh=max(1,int((fs/2 if os>1 else sr/2)*topfrac/ftop))
    nh=min(nh,tl//2-1)
    k=np.arange(1,nh+1);X=np.zeros(tl//2+1,complex);X[k]=(-1j)**1*(-2/(pi*k))*(-1)**0*.5*tl/1j*1j
    t=np.fft.irfft(X,tl)
    m=n*os;ph=(np.arange(m)*f0/fs)%1*tl;i=ph.astype(int);fr=ph-i
    g=np.concatenate([t,t[:4]]);
    if interp=='linear': y=g[i]+(g[i+1]-g[i])*fr
    else:
        im=(i-1)%tl;a,b,c,d=t[im],t[i%tl],t[(i+1)%tl],t[(i+2)%tl]
        c1=.5*(c-a);c2=a-2.5*b+2*c-.5*d;c3=.5*(d-a)+1.5*(b-c);y=b+fr*(c1+fr*(c2+fr*c3))
    if os>1:
        from scipy.signal import firwin,fftconvolve
        h=firwin(255,(sr/2-1000)/(fs/2),window=('kaiser',14));y=fftconvolve(y,h,'same')[::os]
    return y
fs_=[440.,1000.,3000.,7040.,12000.]
print('method f0 total_alias_dB_re_harm worst_alias_dB_re_fund (48k, <=20k)')
for f0 in fs_:
    for nm,x in (('naive',naive(f0,sr,N)),('polyBLEP2',pblep2(f0,sr,N)),
       ('polyBLEP2 2xOS',None),
       ('WT 1mip/oct cubic',wt(f0,sr,N,1,1)),('WT 1mip/oct cubic 2xOS',wt(f0,sr,N,2,1)),('WT 3mip/oct cubic',wt(f0,sr,N,1,3)),('WT 1mip/oct linear',wt(f0,sr,N,1,1,interp='linear'))):
        if x is None:
            from scipy.signal import firwin,fftconvolve
            h=firwin(255,23000/48000,window=('kaiser',14));x=fftconvolve(pblep2(f0,sr*2,N*2),h,'same')[::2]
        a,b=spec_snr(x[2000:-2000],f0,sr)
        print(f'{nm:24s}{int(f0):6d} {a:8.1f} {b:8.1f}')
# ---- HIIR designer and measured stopband
def design(n,tb):
    k=math.tan((1-2*2*tb*1.0)*pi/4)**2 if False else math.tan((1-tb*2)*pi/4)**2
    kk=(1-k*k)**.25;e=.5*(1-kk)/(1+kk);e4=e**4;q=e*(1+e4*(2+e4*(15+150*e4)))
    order=n*2+1;cs=[]
    for idx in range(n):
        c=idx+1
        i=0;j=1;acc=0
        while True:
            t=q**(i*(i+1))*math.sin((2*i+1)*c*pi/order)*j;acc+=t;j=-j;i+=1
            if abs(t)<1e-100:break
        num=acc*q**.25
        i=1;j=-1;acc=0
        while True:
            t=q**(i*i)*math.cos(2*i*c*pi/order)*j;acc+=t;j=-j;i+=1
            if abs(t)<1e-100:break
        den=acc+.5
        ww=(num/den)**2
        x=math.sqrt((1-ww*k)*(1-ww/k))/(1+ww);cs.append((1-x)/(1+x))
    return cs
def hbresp(cs,fn):
    z=np.exp(1j*2*pi*fn);A0=np.ones_like(z);A1=z**-1
    for i,c in enumerate(cs):
        ap=(c+z**-2)/(1+c*z**-2)
        if i%2==0:A0=A0*ap
        else:A1=A1*ap
    return .5*(A0+A1)
print('HIIR-style: fs=96k, tb -> stop from f. n, stopband dB, groupdelay@1k samples@96k')
for tb,lab in ((.0417,'20k/28k'),(.02,'22.1k/25.9k'),):
    for n in (4,6,8,10,12,16):
        cs=design(n,tb);fn=np.linspace(.25+tb,.5,4000);at=20*np.log10(abs(hbresp(cs,fn))+1e-14).max()
        f1=np.array([1000/96000,1001/96000]);H=hbresp(cs,f1);gd=-(np.angle(H[1]/H[0]))/(2*pi*(f1[1]-f1[0]))
        print(lab,n,round(at,1),round(float(gd),2))
# FIR halfband taps via kaiser estimate
from scipy.signal import kaiserord, remez
for at in (80,100,120,140):
  for tw,lab in ((8000/96000,'20k/28k'),(3800/96000,'22.1k/25.9k')):
    N_,beta=kaiserord(at,tw*2);N_=N_|1
    print('FIR halfband',at,'dB',lab,'taps',N_,'nonzero',(N_+1)//4+1 if True else 0,'latency@input-rate samples',(N_-1)/4)

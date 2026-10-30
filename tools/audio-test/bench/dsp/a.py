import numpy as np, math
from numpy import pi
from scipy.signal import firwin,fftconvolve
sr=48000;N=1<<18
def meas(x,f0,sr,hm=20000):
    x=x[4000:-4000];n=len(x);w=np.kaiser(n,40.);P=abs(np.fft.rfft(x*w))**2;fr_=np.fft.rfftfreq(n,1/sr)
    mask=np.zeros(len(P),bool);bw=24
    for k in np.arange(1,int(sr/2/f0)+1)*f0:
        i=int(round(k*n/sr));mask[max(0,i-bw):i+bw+1]=True
    aud=fr_<=hm
    i1=int(round(f0*n/sr));fund=P[i1-bw:i1+bw+1].sum()
    # sum alias power in-band; worst tone with 49-bin energy
    al=P.copy();al[mask|~aud]=0
    c=np.convolve(al,np.ones(49),'same')
    return 10*np.log10(al.sum()/P[mask].sum()),10*np.log10(c.max()/fund)
def naive(f0,sr,n):
    p=(np.arange(n)*f0/sr)%1;return 2*p-1
def pb2(f0,sr,n):
    dt=f0/sr;p=(np.arange(n)*dt)%1;y=2*p-1
    a=p<dt;t=p[a]/dt;y[a]-=t+t-t*t-1
    b=p>1-dt;t=(p[b]-1)/dt;y[b]-=t*t+t+t+1
    return y
def dec(x,os,fs):
    h=firwin(511,(sr/2-500)/(fs/2),window=('kaiser',18));return fftconvolve(x,h,'same')[::os]
def wt(f0,sr,n,os=1,mpo=1,tl=2048,interp='cubic',guard=True):
    fs=sr*os
    oct_=math.ceil(math.log2(f0/20)*mpo)/mpo;ftop=20*2**oct_
    lim=(fs-sr/2-1000) if os>1 else sr/2   # with OS, harmonics may fold only above the decim stop
    nh=min(int(lim/ftop),tl//2-1)
    k=np.arange(1,nh+1);X=np.zeros(tl//2+1,complex);X[k]=1j/(pi*k)*tl*.5*2/2
    t=np.fft.irfft(X,tl)
    m=n*os;ph=(np.arange(m)*f0/fs)%1*tl;i=ph.astype(int);fr=ph-i
    a,b,c,d=t[(i-1)%tl],t[i%tl],t[(i+1)%tl],t[(i+2)%tl]
    if interp=='linear':y=b+(c-b)*fr
    else:
        c1=.5*(c-a);c2=a-2.5*b+2*c-.5*d;c3=.5*(d-a)+1.5*(b-c);y=b+fr*(c1+fr*(c2+fr*c3))
    return dec(y,os,fs) if os>1 else y
print(f"{'method':26s}{'f0':>7s} {'total':>7s} {'worst':>7s}")
fl=[441.37,1013.71,3141.59,7043.3,11987.3]
for f0 in fl:
    rows=[('naive',naive(f0,sr,N)),('polyBLEP2',pb2(f0,sr,N)),('polyBLEP2+2xOS',dec(pb2(f0,sr*2,N*2),2,sr*2)),('polyBLEP2+4xOS',dec(pb2(f0,sr*4,N*4),4,sr*4)),
    ('WT 2048 1/oct linear',wt(f0,sr,N,1,1,interp='linear')),('WT 2048 1/oct cubic',wt(f0,sr,N,1,1)),('WT 2048 1/oct cubic 2xOS',wt(f0,sr,N,2,1))]
    for nm,x in rows:
        a,b=meas(x,f0,sr);print(f'{nm:26s}{f0:7.0f} {a:7.1f} {b:7.1f}')

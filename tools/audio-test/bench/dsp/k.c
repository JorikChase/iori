#include <stdint.h>
#define EXP(n) __attribute__((export_name(#n)))
typedef float v4 __attribute__((vector_size(16)));
typedef int i4 __attribute__((vector_size(16)));
#define S(x) ((v4){x,x,x,x})
#define MAXV 64
#define BL 128
static float out[BL]; 
EXP(outp) float*outp(){return out;}
static inline float sel(int c,float a,float b){return c?a:b;}
static inline float blep(float t,float dt){if(t<dt){t/=dt;return t+t-t*t-1.f;}if(t>1.f-dt){t=(t-1.f)/dt;return t*t+t+t+1.f;}return 0.f;}
static inline float tanhA(float x){if(x>3.f)x=3.f;if(x<-3.f)x=-3.f;float x2=x*x;return x*(27.f+x2)/(27.f+9.f*x2);}
typedef struct{float p1,p2,d1,d2,ic1,ic2,a1,a2,a3,g,dg;}V;
static V vs[MAXV];
EXP(init) void init(float sr){for(int i=0;i<MAXV;i++){V*v=&vs[i];float f=110.f*(1+i*0.37f);v->p1=i*.013f;v->p2=i*.031f;v->d1=f/sr;v->d2=f*1.006f/sr;v->ic1=v->ic2=0;float g=0.3f,k=0.7f;v->a1=1/(1+g*(g+k));v->a2=g*v->a1;v->a3=g*v->a2;v->g=.1f;v->dg=0;}}
/* 2 polyBLEP saws + TPT SVF + gain, scalar */
EXP(blep_svf) void blep_svf(int nv){for(int i=0;i<BL;i++)out[i]=0;for(int n=0;n<nv;n++){V v=vs[n];for(int i=0;i<BL;i++){float s=2*v.p1-1-blep(v.p1,v.d1)+2*v.p2-1-blep(v.p2,v.d2);v.p1+=v.d1;if(v.p1>=1)v.p1-=1;v.p2+=v.d2;if(v.p2>=1)v.p2-=1;float v3=s-v.ic2,v1=v.a1*v.ic1+v.a2*v3,v2=v.ic2+v.a2*v.ic1+v.a3*v3;v.ic1=2*v1-v.ic1;v.ic2=2*v2-v.ic2;out[i]+=v2*v.g;}vs[n]=v;}}
/* same, 4 voices per v128 */
typedef struct{v4 p1,p2,d1,d2,ic1,ic2,a1,a2,a3,g;}W;
static W ws[MAXV/4];
EXP(init4) void init4(){for(int n=0;n<MAXV/4;n++){W*w=&ws[n];
#define L(f) w->f=(v4){vs[n*4].f,vs[n*4+1].f,vs[n*4+2].f,vs[n*4+3].f};
L(p1)L(p2)L(d1)L(d2)L(ic1)L(ic2)L(a1)L(a2)L(a3)L(g)}}
static inline v4 vsel(i4 m,v4 a,v4 b){return (v4)(((i4)a&m)|((i4)b&~m));}
static inline v4 vblep(v4 t,v4 dt){v4 a=t/dt;v4 r1=a+a-a*a-S(1.f);v4 b=(t-S(1.f))/dt;v4 r2=b*b+b+b+S(1.f);i4 m1=t<dt,m2=t>S(1.f)-dt;return vsel(m1,r1,vsel(m2,r2,S(0.f)));}
EXP(blep_svf4) void blep_svf4(int nv){for(int i=0;i<BL;i++)out[i]=0;int nb=(nv+3)/4;for(int n=0;n<nb;n++){W v=ws[n];for(int i=0;i<BL;i++){v4 s=S(2.f)*v.p1-S(1.f)-vblep(v.p1,v.d1)+S(2.f)*v.p2-S(1.f)-vblep(v.p2,v.d2);v.p1+=v.d1;v.p1=vsel(v.p1>=S(1.f),v.p1-S(1.f),v.p1);v.p2+=v.d2;v.p2=vsel(v.p2>=S(1.f),v.p2-S(1.f),v.p2);v4 v3=s-v.ic2,v1=v.a1*v.ic1+v.a2*v3,v2=v.ic2+v.a2*v.ic1+v.a3*v3;v.ic1=S(2.f)*v1-v.ic1;v.ic2=S(2.f)*v2-v.ic2;v4 m=v2*v.g;out[i]+=m[0]+m[1]+m[2]+m[3];}ws[n]=v;}}
/* wavetable: 2 oscs, each 2 cubic reads (frame/mip crossfade) + SVF */
#define TL 2048
static float tb[2][TL+4];
EXP(inittb) void inittb(){unsigned r=12345;for(int t=0;t<2;t++)for(int i=0;i<TL+4;i++){r=r*1664525u+1013904223u;tb[t][i]=(float)(int)(r>>8)/8388608.f-1.f;}}
static inline float herm(const float*t,float ph){float x=ph*TL;int i=(int)x;float f=x-i;const float*p=t+i;float a=p[0],b=p[1],c=p[2],d=p[3];float c1=.5f*(c-a),c2=a-2.5f*b+2*c-.5f*d,c3=.5f*(d-a)+1.5f*(b-c);return b+f*(c1+f*(c2+f*c3));}
EXP(wt_svf) void wt_svf(int nv){for(int i=0;i<BL;i++)out[i]=0;for(int n=0;n<nv;n++){V v=vs[n];for(int i=0;i<BL;i++){float s=.7f*herm(tb[0],v.p1)+.3f*herm(tb[1],v.p1)+.7f*herm(tb[0],v.p2)+.3f*herm(tb[1],v.p2);v.p1+=v.d1;if(v.p1>=1)v.p1-=1;v.p2+=v.d2;if(v.p2>=1)v.p2-=1;float v3=s-v.ic2,v1=v.a1*v.ic1+v.a2*v3,v2=v.ic2+v.a2*v.ic1+v.a3*v3;v.ic1=2*v1-v.ic1;v.ic2=2*v2-v.ic2;out[i]+=v2*v.g;}vs[n]=v;}}
/* ZDF ladder: 2 blep saws, 4 poles, per-stage tanh linearised from prev sample, input tanh */
static float ls[MAXV][8];
EXP(blep_ladder) void blep_ladder(int nv){for(int i=0;i<BL;i++)out[i]=0;const float g=.3f,kk=2.5f;for(int n=0;n<nv;n++){V v=vs[n];float*s=ls[n];float y0=s[4],y1=s[5],y2=s[6],y3=s[7];for(int i=0;i<BL;i++){float in=2*v.p1-1-blep(v.p1,v.d1)+2*v.p2-1-blep(v.p2,v.d2);v.p1+=v.d1;if(v.p1>=1)v.p1-=1;v.p2+=v.d2;if(v.p2>=1)v.p2-=1;
#define F(y) ((y)*(y)<1e-6f?1.f:tanhA(y)/(y))
float f0=F(y0),f1=F(y1),f2=F(y2),f3=F(y3);float G0=g*f0/(1+g*f0),G1=g*f1/(1+g*f1),G2=g*f2/(1+g*f2),G3=g*f3/(1+g*f3);float S0=s[0]/(1+g*f0),S1=s[1]/(1+g*f1),S2=s[2]/(1+g*f2),S3=s[3]/(1+g*f3);float GG=G0*G1*G2*G3;float SS=S3+G3*(S2+G2*(S1+G1*S0));float u=tanhA(in-kk*SS/(1+kk*GG)*1.f);
float a=G0*u+S0;s[0]=2*(a)*(1.f)-s[0];float b=G1*a+S1;s[1]=2*b-s[1];float c=G2*b+S2;s[2]=2*c-s[2];float d=G3*c+S3;s[3]=2*d-s[3];y0=a;y1=b;y2=c;y3=d;out[i]+=d*v.g;}s[4]=y0;s[5]=y1;s[6]=y2;s[7]=y3;vs[n]=v;}}
/* true peak: 4 phases x 12 taps, 1 ch */
#define TP 12
static float tpc[4][TP];static float tph[TP*2];static int tpi=0;
EXP(inittp) void inittp(){for(int p=0;p<4;p++)for(int i=0;i<TP;i++)tpc[p][i]=.01f*(i-6)*(p+1);}
EXP(tp) float tp(const float*in){float m=0;for(int i=0;i<BL;i++){tph[tpi]=tph[tpi+TP]=in[i];tpi=(tpi+1)%TP;const float*h=tph+tpi;for(int p=0;p<4;p++){float a=0;for(int k=0;k<TP;k++)a+=tpc[p][k]*h[k];a=a<0?-a:a;if(a>m)m=a;}}return m;}
EXP(tp4) float tp4(const float*in){float m=0;for(int i=0;i<BL;i++){tph[tpi]=tph[tpi+TP]=in[i];tpi=(tpi+1)%TP;const float*h=tph+tpi;for(int p=0;p<4;p++){v4 ac=S(0.f);for(int k=0;k<TP;k+=4){v4 c,x;__builtin_memcpy(&c,&tpc[p][k],16);__builtin_memcpy(&x,h+k,16);ac+=c*x;}float a=ac[0]+ac[1]+ac[2]+ac[3];a=a<0?-a:a;if(a>m)m=a;}}return m;}
/* FDN8 Householder, stereo in/out, with 1-pole damping per line; no modulation */
#define DL 8192
static float dl[8][DL];static int len[8]={2053,2437,2857,3203,3571,4001,4421,4871};static int wp;static float lp[8];
EXP(fdn8) void fdn8(float*in){for(int i=0;i<BL;i++){float x[8],s=0;for(int k=0;k<8;k++){x[k]=dl[k][(wp-len[k])&(DL-1)];lp[k]+=.4f*(x[k]-lp[k]);x[k]=lp[k];s+=x[k];}s*=-.25f;float o=0;for(int k=0;k<8;k++){dl[k][wp&(DL-1)]=.85f*(x[k]+s)+in[i];o+=x[k];}wp++;out[i]=o;}}
/* IIR halfband up2+down2, 12 coefs (6+6 allpass per path), 1 ch */
static float upc[12]={.03,.13,.27,.42,.57,.71,.81,.87,.92,.95,.97,.99};static float us[12],uy[12],ds[12],dy[12];static float pd;
static inline float ap(float x,float c,float*xs,float*ys){float y=c*(x-*ys)+*xs;*xs=x;*ys=y;return y;}
EXP(hb2x) void hb2x(float*in){for(int i=0;i<BL;i++){float a=in[i],b=in[i];for(int k=0;k<6;k++){a=ap(a,upc[2*k],&us[2*k],&uy[2*k]);b=ap(b,upc[2*k+1],&us[2*k+1],&uy[2*k+1]);}
 float x0=a,x1=b;for(int k=0;k<6;k++){x0=ap(x0,upc[2*k],&ds[2*k],&dy[2*k]);x1=ap(x1,upc[2*k+1],&ds[2*k+1],&dy[2*k+1]);}out[i]=.5f*(x0+x1);}}
EXP(bufp) float* bufp(){static float b[BL];for(int i=0;i<BL;i++)b[i]=((i*37)%128)/128.f-.5f;return b;}

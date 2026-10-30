#define EXP(n) __attribute__((export_name(#n)))
static float y[64];
EXP(iir) float iir(int n,float in){float s=0;for(int i=0;i<n;i++){for(int k=0;k<64;k++){y[k]=y[k]*0.95f+in;s+=y[k];}}return s;}
EXP(seed) void seed(float v){for(int k=0;k<64;k++)y[k]=v;}
EXP(setv) void setv(float v){for(int k=0;k<64;k++)y[k]=v;}

// runs in jsc (read, preciseTime) or node
var isNode=typeof process!=='undefined'&&process.versions&&process.versions.node;
var now,loadBin,print_;
if(isNode){const fs=require('fs');const {performance}=require('perf_hooks');now=()=>performance.now()/1e3;loadBin=p=>fs.readFileSync(p);print_=console.log;}
else{now=preciseTime;loadBin=p=>new Uint8Array(read(p,'binary'));print_=print;}
function timeit(fn,blocksPerRun,runs){var best=1e9,all=[];for(var r=0;r<runs;r++){var t=now();for(var b=0;b<blocksPerRun;b++)fn();var d=(now()-t)/blocksPerRun;all.push(d);if(d<best)best=d;}all.sort((a,b)=>a-b);return [best,all[all.length>>1]];}
var SR=48000,BUD=128/SR;
function rep(name,fn,units){var warm=timeit(fn,3000,4);var r=timeit(fn,3000,12);var ns=r[0]*1e9/128/units;var nsm=r[1]*1e9/128/units;print_(name.padEnd(34)+(ns.toFixed(1)).padStart(8)+(nsm.toFixed(1)).padStart(8)+'  '+((r[1]/BUD*100/ units).toFixed(3)).padStart(8)+'%/unit');}
function bench(w,tag){var e=w.exports;e.init(SR);e.init4();e.inittb();e.inittp();var b=e.bufp();
 rep(tag+' 2blep+SVF scalar',()=>e.blep_svf(16),16);
 rep(tag+' 2blep+SVF v128 (4 lanes)',()=>e.blep_svf4(16),16);
 rep(tag+' 4cubicWT+SVF scalar',()=>e.wt_svf(16),16);
 rep(tag+' 2blep+ZDFladder scalar',()=>e.blep_ladder(16),16);
 rep(tag+' TP 4x48tap 1ch scalar',()=>e.tp(b),1);
 rep(tag+' TP 4x48tap 1ch v128',()=>e.tp4(b),1);
 rep(tag+' FDN8 householder',()=>e.fdn8(b),1);
 rep(tag+' HB IIR up+down 2x 12c 1ch',()=>e.hb2x(b),1);
}
// JS versions
function jsK(){var N=16,bl=128,out=new Float32Array(bl);var st=new Float32Array(N*11);
 for(var i=0;i<N;i++){var f=110*(1+i*.37);var o=i*11;st[o]=i*.013;st[o+1]=i*.031;st[o+2]=f/SR;st[o+3]=f*1.006/SR;var g=.3,k=.7,a1=1/(1+g*(g+k)),a2=g*a1,a3=g*a2;st[o+6]=a1;st[o+7]=a2;st[o+8]=a3;st[o+9]=.1;}
 function blep(t,dt){if(t<dt){t/=dt;return t+t-t*t-1;}if(t>1-dt){t=(t-1)/dt;return t*t+t+t+1;}return 0;}
 function blepsvf(){out.fill(0);for(var n=0;n<N;n++){var o=n*11,p1=st[o],p2=st[o+1],d1=st[o+2],d2=st[o+3],ic1=st[o+4],ic2=st[o+5],a1=st[o+6],a2=st[o+7],a3=st[o+8],g=st[o+9];
  for(var i=0;i<bl;i++){var s=2*p1-1-blep(p1,d1)+2*p2-1-blep(p2,d2);p1+=d1;if(p1>=1)p1-=1;p2+=d2;if(p2>=1)p2-=1;var v3=s-ic2,v1=a1*ic1+a2*v3,v2=ic2+a2*ic1+a3*v3;ic1=2*v1-ic1;ic2=2*v2-ic2;out[i]+=v2*g;}
  st[o]=p1;st[o+1]=p2;st[o+4]=ic1;st[o+5]=ic2;}}
 var TL=2048,tb=[new Float32Array(TL+4),new Float32Array(TL+4)];var r=12345;for(var t=0;t<2;t++)for(var i=0;i<TL+4;i++){r=(Math.imul(r,1664525)+1013904223)>>>0;tb[t][i]=(r>>>8)/8388608-1;}
 function herm(t,ph){var x=ph*TL,i=x|0,f=x-i,a=t[i],b=t[i+1],c=t[i+2],d=t[i+3];var c1=.5*(c-a),c2=a-2.5*b+2*c-.5*d,c3=.5*(d-a)+1.5*(b-c);return b+f*(c1+f*(c2+f*c3));}
 function wtsvf(){out.fill(0);var t0=tb[0],t1=tb[1];for(var n=0;n<N;n++){var o=n*11,p1=st[o],p2=st[o+1],d1=st[o+2],d2=st[o+3],ic1=st[o+4],ic2=st[o+5],a1=st[o+6],a2=st[o+7],a3=st[o+8],g=st[o+9];
  for(var i=0;i<bl;i++){var s=.7*herm(t0,p1)+.3*herm(t1,p1)+.7*herm(t0,p2)+.3*herm(t1,p2);p1+=d1;if(p1>=1)p1-=1;p2+=d2;if(p2>=1)p2-=1;var v3=s-ic2,v1=a1*ic1+a2*v3,v2=ic2+a2*ic1+a3*v3;ic1=2*v1-ic1;ic2=2*v2-ic2;out[i]+=v2*g;}
  st[o]=p1;st[o+1]=p2;st[o+4]=ic1;st[o+5]=ic2;}}
 // churny style: allocates per block
 function churn(){var a=[];for(var n=0;n<N;n++){a.push({n:n,o:new Float32Array(bl)});}blepsvf();return a.length;}
 return {blepsvf,wtsvf,churn};}
async function main(){var s=loadBin('scalar.wasm'),v=loadBin('simd.wasm');
 print_('name'.padEnd(34)+' ns/s best  median  %128q@48k');
 var J=jsK();rep('JS 2blep+SVF f64-math',J.blepsvf,16);rep('JS 4cubicWT+SVF',J.wtsvf,16);
 var a=await WebAssembly.instantiate(s,{env:{}});bench(a.instance,'W');
 var b=await WebAssembly.instantiate(v,{env:{}});bench(b.instance,'S');
}
main().then(()=>{},e=>print_('ERR '+e+(e.stack||'')));

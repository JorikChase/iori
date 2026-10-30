var isNode=typeof process!=='undefined'&&process.versions&&process.versions.node;
var now,loadBin,print_;
if(isNode){const fs=require('fs');const {performance}=require('perf_hooks');now=()=>performance.now();loadBin=p=>fs.readFileSync(p);print_=console.log;}
else{now=()=>preciseTime()*1e3;loadBin=p=>new Uint8Array(read(p,'binary'));print_=print;}
var SR=48000,bl=128;
function stats(name,fn,n){var a=new Float64Array(n);for(var i=0;i<n;i++){var t=now();fn(i);a[i]=now()-t;}var cold=[a[0],a[1],a[2],a[9]].map(x=>x.toFixed(3));var s=Array.from(a.subarray(2000)).sort((x,y)=>x-y);var q=p=>s[Math.min(s.length-1,Math.floor(s.length*p))];var over=0;for(var i=2000;i<n;i++)if(a[i]>2.667)over++;print_(name.padEnd(30)+' cold '+cold.join(' ')+' | p50 '+q(.5).toFixed(3)+' p99 '+q(.99).toFixed(3)+' p99.9 '+q(.999).toFixed(3)+' p99.99 '+q(.9999).toFixed(3)+' max '+q(1).toFixed(3)+' ms; over2.67='+over);}
function mk(N){var out=new Float32Array(bl),st=new Float32Array(N*11);for(var i=0;i<N;i++){var f=110*(1+i*.07);var o=i*11;st[o]=i*.013;st[o+1]=i*.031;st[o+2]=f/SR;st[o+3]=f*1.006/SR;var g=.3,k=.7,a1=1/(1+g*(g+k)),a2=g*a1,a3=g*a2;st[o+6]=a1;st[o+7]=a2;st[o+8]=a3;st[o+9]=.1;}
 function blep(t,dt){if(t<dt){t/=dt;return t+t-t*t-1;}if(t>1-dt){t=(t-1)/dt;return t*t+t+t+1;}return 0;}
 function clean(){out.fill(0);for(var n=0;n<N;n++){var o=n*11,p1=st[o],p2=st[o+1],d1=st[o+2],d2=st[o+3],ic1=st[o+4],ic2=st[o+5],a1=st[o+6],a2=st[o+7],a3=st[o+8],g=st[o+9];for(var i=0;i<bl;i++){var s=2*p1-1-blep(p1,d1)+2*p2-1-blep(p2,d2);p1+=d1;if(p1>=1)p1-=1;p2+=d2;if(p2>=1)p2-=1;var v3=s-ic2,v1=a1*ic1+a2*v3,v2=ic2+a2*ic1+a3*v3;ic1=2*v1-ic1;ic2=2*v2-ic2;out[i]+=v2*g;}st[o]=p1;st[o+1]=p2;st[o+4]=ic1;st[o+5]=ic2;}}
 // typical idiomatic JS: per-voice object, per-block scratch arrays and closures
 var keep=[];
 function churn(){var scratch=[];for(var n=0;n<N;n++){var v={id:n,buf:new Float32Array(bl),mods:[1,2,3].map(x=>({x}))};scratch.push(v);}clean();keep=scratch;}
 return {clean,churn};}
async function main(){var e=(await WebAssembly.instantiate(loadBin('simd.wasm'),{env:{}})).instance.exports;e.init(SR);e.init4();
 var J=mk(64);
 stats('JS clean 64v',J.clean,40000);
 var J2=mk(64);stats('JS alloc-per-block 64v',J2.churn,40000);
 var f=(await WebAssembly.instantiate(loadBin('simd.wasm'),{env:{}})).instance.exports;f.init(SR);f.init4();stats('WASM SIMD 64v',()=>f.blep_svf4(64),40000);
 // denormal
 var d=(await WebAssembly.instantiate(loadBin('d.wasm'),{env:{}})).instance.exports;
 function t(setup,inp){var best=1e9;for(var r=0;r<8;r++){setup();var a=now();d.iir(20000,inp);var x=now()-a;if(x<best)best=x;}return best;}
 var n=t(()=>d.setv(1),1e-3),z=t(()=>d.setv(1e-40),0);
 print_('denorm test ms: normal '+n.toFixed(2)+' subnormal-range '+z.toFixed(2)+' ratio '+(z/n).toFixed(2));
}
main().then(()=>{},e=>print_('ERR '+e));

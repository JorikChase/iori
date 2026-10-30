var isNode=typeof process!=='undefined'&&process.versions&&process.versions.node;
var now,loadBin,print_;
if(isNode){const fs=require('fs');const {performance}=require('perf_hooks');now=()=>performance.now();loadBin=p=>fs.readFileSync(p);print_=console.log;}
else{now=()=>preciseTime()*1e3;loadBin=p=>new Uint8Array(read(p,'binary'));print_=print;}
WebAssembly.instantiate(loadBin('d2.wasm'),{env:{}}).then(r=>{var d=r.instance.exports;function t(i){var b=1e9;for(var k=0;k<10;k++){d.iir(2000,i,.5);var a=now();var s=d.iir(100000,i,.5);var x=now()-a;if(x<b)b=x;}return [b,s];}
var a=t(1e-3),z=t(2e-40);print_('normal '+a[0].toFixed(2)+' ms, sum '+a[1]+' | subnormal '+z[0].toFixed(2)+' ms, sum '+z[1]+' ratio '+(z[0]/a[0]).toFixed(2));});

class P2 extends AudioWorkletProcessor{
 constructor(o){super();this.port.postMessage({ctor:true,
  wa:typeof WebAssembly,wmem:(()=>{try{return !!new WebAssembly.Memory({initial:1,maximum:2,shared:true})}catch(e){return String(e)}})(),
  sab:typeof SharedArrayBuffer,fetch:typeof fetch,td:typeof TextDecoder,te:typeof TextEncoder,atomics:typeof Atomics,
  simd:WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,10,1,8,0,65,0,253,15,253,98,11])),
  sr:sampleRate,perf:typeof performance,cf:currentFrame});
  this.n=0;this.port.onmessage=e=>{this.got=e.data;this.port.postMessage({echo:Object.prototype.toString.call(e.data&&e.data.b)})}}
 process(i,o){this.n++;if(!this.reported){this.reported=1;this.port.postMessage({quantum:o[0]?o[0][0].length:null})}
  if(o[0])for(const c of o[0])c.fill(0.25);return true}}
registerProcessor("p2",P2);

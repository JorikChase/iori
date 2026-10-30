import {createRequire} from 'module';
const require=createRequire('/Users/iori/Desktop/code/iori/tools/audio-test/');
const {webkit,chromium}=require('playwright');
const body=async()=>{
 const r={};const f=document.getElementById('f');
 await new Promise(ok=>{if(f.contentWindow.childReady)ok();else f.onload=ok});
 const w=f.contentWindow;
 r.coi=[self.crossOriginIsolated,w.crossOriginIsolated];r.sabParent=typeof SharedArrayBuffer;r.sabChild=typeof w.SharedArrayBuffer;
 const ctx=new AudioContext();window.ctx=ctx;
 r.ctxSr=ctx.sampleRate;r.baseLatency=ctx.baseLatency;r.outputLatency=ctx.outputLatency;r.state0=ctx.state;
 r.renderSizeProp='renderQuantumSize' in ctx;r.sinkId='setSinkId' in ctx;
 await ctx.audioWorklet.addModule('wk.js');
 const T=async(n,fn)=>{try{r[n]=await fn()}catch(e){r[n]='THROW '+e.name+': '+e.message}};
 await T('iframe_parentFactory',()=>{const g=w.eval('parent.ctx.createGain()');return g.constructor===GainNode?'parent-realm':'other-realm'});
 await T('iframe_ownCtor_Gain',()=>{const g=w.eval('new GainNode(parent.ctx)');g.connect(ctx.destination);return g instanceof w.GainNode?'child-realm node connected':'x'});
 await T('iframe_ownCtor_AWN',()=>{const n=w.eval("new AudioWorkletNode(parent.ctx,'p')");n.connect(ctx.destination);window.keep=n;return n instanceof w.AudioWorkletNode?'child-realm AWN':'x'});
 await T('iframe_parentCtor_AWN',()=>{const n=w.eval("new parent.AudioWorkletNode(parent.ctx,'p')");return 'ok '+(n instanceof AudioWorkletNode)});
 await T('child_offline',async()=>{const c=w.eval("new OfflineAudioContext(2,4800,48000)");await c.audioWorklet.addModule('wk.js');return 'ok'});
 // iframe-held node after iframe removal
 await T('msgs',async()=>{const ms=[];const n=new AudioWorkletNode(ctx,'p');n.port.onmessage=e=>ms.push(e.data);n.connect(ctx.destination);
   ctx.resume().catch(()=>{});await new Promise(o=>setTimeout(o,800));
   try{const b=typeof SharedArrayBuffer!='undefined'&&self.crossOriginIsolated?new SharedArrayBuffer(8):null;n.port.postMessage({b});await new Promise(o=>setTimeout(o,300))}catch(e){ms.push('postSAB '+e.name)}
   return ms});
 r.stateAfter=ctx.state;
 await T('offline_worklet',async()=>{const c=new OfflineAudioContext(2,48000*5,48000);await c.audioWorklet.addModule('wk.js');const n=new AudioWorkletNode(c,'p');n.connect(c.destination);const t=performance.now();const b=await c.startRendering();return{ms:Math.round(performance.now()-t),peak:b.getChannelData(0)[1000],len:b.length}});
 await T('offline_speed_300s',async()=>{const c=new OfflineAudioContext(2,48000*300,48000);const o=c.createOscillator();const bq=c.createBiquadFilter();o.connect(bq).connect(c.destination);o.start();const t=performance.now();await c.startRendering();return{ms:Math.round(performance.now()-t)}});
 await T('offline_sr_8000',()=>new OfflineAudioContext(1,100,8000).sampleRate);
 await T('offline_sr_3000',()=>new OfflineAudioContext(1,100,3000).sampleRate);
 await T('offline_sr_768000',()=>new OfflineAudioContext(1,100,768000).sampleRate);
 await T('offline_ch_32',()=>new OfflineAudioContext(32,100,48000).numberOfChannels);
 await T('offline_ch_33',()=>new OfflineAudioContext(33,100,48000).numberOfChannels);
 await T('ctx_sr_44100',async()=>{const c=new AudioContext({sampleRate:44100});const s=c.sampleRate;await c.close();return s});
 await T('ctx_sr_96000',async()=>{const c=new AudioContext({sampleRate:96000});const s=c.sampleRate;await c.close();return s});
 await T('ctx_sr_8000',async()=>{const c=new AudioContext({sampleRate:8000});const s=c.sampleRate;await c.close();return s});
 await T('ctx_renderSizeHint',async()=>{const c=new AudioContext({renderSizeHint:256});const s=c.renderQuantumSize;await c.close();return String(s)});
 // WAV 44.1k stereo decode in 48k ctx
 await T('decode_resample',async()=>{const sr=44100,n=44100;const ab=new ArrayBuffer(44+n*4);const d=new DataView(ab);const S=(o,s)=>{for(let i=0;i<s.length;i++)d.setUint8(o+i,s.charCodeAt(i))};S(0,'RIFF');d.setUint32(4,36+n*4,true);S(8,'WAVEfmt ');d.setUint32(16,16,true);d.setUint16(20,1,true);d.setUint16(22,2,true);d.setUint32(24,sr,true);d.setUint32(28,sr*4,true);d.setUint16(32,4,true);d.setUint16(34,16,true);S(36,'data');d.setUint32(40,n*4,true);
   for(let i=0;i<n;i++){d.setInt16(44+i*4,1000,true);d.setInt16(46+i*4,-1000,true)}
   const c=new OfflineAudioContext(2,100,48000);const b=await c.decodeAudioData(ab);return{sr:b.sampleRate,len:b.length,ch:b.numberOfChannels}});
 await T('audioSession',()=>('audioSession' in navigator)?navigator.audioSession.type:'absent');
 await T('wakeLock',()=>'wakeLock' in navigator);
 await T('fsa',()=>({open:typeof showOpenFilePicker,save:typeof showSaveFilePicker,dir:typeof showDirectoryPicker,opfs:typeof navigator.storage?.getDirectory}));
 await T('midi',()=>typeof navigator.requestMIDIAccess);
 return r};
for(const [nm,b,port] of [['webkit',webkit,8801],['chromium',chromium,8802]]){
 for(const mode of ['plain','iso']){
  const {spawn}=await import('child_process');const p=port+(mode=='iso'?10:0);
  const s=spawn('node',['srv.mjs',p,mode],{stdio:'ignore'});await new Promise(o=>setTimeout(o,400));
  try{const br=await b.launch({args:nm=='chromium'?['--autoplay-policy=no-user-gesture-required']:[]});const pg=await br.newPage();
   pg.on('pageerror',e=>console.log('pageerror',e.message));
   await pg.goto(`http://localhost:${p}/parent.html`);
   console.log(nm,mode,br.version(),JSON.stringify(await pg.evaluate(body),null,0));await br.close()}catch(e){console.log(nm,mode,'FAIL',e.message.slice(0,400))}
  s.kill()}}

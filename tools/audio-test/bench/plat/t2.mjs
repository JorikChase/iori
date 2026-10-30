import {createRequire} from 'module';import {spawn} from 'child_process';
const require=createRequire('/Users/iori/Desktop/code/iori/tools/audio-test/');
const {webkit,chromium}=require('playwright');
const s=spawn('node',['srv2.mjs','8831'],{stdio:'ignore'});await new Promise(o=>setTimeout(o,400));
const body=async()=>{const r={};
 const load=(src)=>new Promise(ok=>{const f=document.createElement('iframe');f.src=src;let done=0;f.onload=()=>{if(!done){done=1;ok(f)}};f.onerror=()=>ok(f);setTimeout(()=>ok(f),1500);document.body.append(f)});
 const ctx=new AudioContext();window.ctx=ctx;ctx.resume().catch(()=>{});
 await ctx.audioWorklet.addModule('wk.js');
 // iframe without COEP header under isolated parent
 const bad=await load('kid2.html?nohdr');
 try{r.noCoepChild_access=String(bad.contentWindow.location.href);r.noCoepChild_ready=bad.contentWindow.childReady===true}catch(e){r.noCoepChild_access='THROW '+e.name}
 const f=await load('kid2.html');const w=f.contentWindow;
 r.goodChild_coi=w.crossOriginIsolated;
 // addModule from child realm on parent's ctx, relative URL
 try{await w.eval("parent.ctx.audioWorklet.addModule('wk2.js')");r.child_addModule='ok'}catch(e){r.child_addModule='THROW '+e.name+': '+e.message}
 // child-made nodes, then kill iframe
 const ana=ctx.createAnalyser();ana.fftSize=2048;ana.connect(ctx.destination);
 const n=w.eval("window.n=new AudioWorkletNode(parent.ctx,'p');n");const g=w.eval("window.g=new GainNode(parent.ctx);g");
 const msgs=[];n.port.onmessage=e=>msgs.push(1);
 n.connect(g);g.connect(ana);
 const lvl=()=>{const b=new Float32Array(2048);ana.getFloatTimeDomainData(b);return Math.max(...b.map(Math.abs))};
 await new Promise(o=>setTimeout(o,500));r.level_before=lvl();
 f.remove();window.n2=n;window.g2=g;
 await new Promise(o=>setTimeout(o,800));r.level_after_iframe_removed_refsHeld=lvl();r.ctxState=ctx.state;
 try{n.disconnect();n.connect(ana);r.reconnect_after_remove='ok'}catch(e){r.reconnect_after_remove='THROW '+e.name}
 try{const p=n.parameters;r.params='ok'}catch(e){r.params='THROW'}
 // Second iframe: same but owner context IN iframe, iframe removed
 const f2=await load('kid2.html');const c2=f2.contentWindow.eval("window.c=new AudioContext();c");r.ifrCtxState0=c2.state;
 c2.resume().catch(()=>{});f2.remove();await new Promise(o=>setTimeout(o,300));r.ifrCtxAfterRemove=c2.state;
 for(const [nm,fn] of [['ab1h',()=>new AudioBuffer({numberOfChannels:2,length:48000*3600,sampleRate:48000}).length],['oac1h',()=>new OfflineAudioContext(2,48000*3600,48000).length]]){try{r[nm]=fn()}catch(e){r[nm]='THROW '+e.name+': '+e.message}}
 return r};
await (async()=>{})();
for(const [nm,b] of [['webkit',webkit],['chromium',chromium]]){
 try{const br=await b.launch({args:nm=='chromium'?['--autoplay-policy=no-user-gesture-required']:[]});const pg=await br.newPage();pg.on('console',m=>{if(m.type()=='error')console.log(nm,'console',m.text().slice(0,200))});
 await pg.goto('http://localhost:8831/kid2.html');
 console.log(nm,JSON.stringify(await pg.evaluate(body)));await br.close()}catch(e){console.log(nm,'FAIL',e.message.slice(0,400))}}
s.kill();process.exit(0);

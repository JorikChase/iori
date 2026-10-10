var yb=new Float32Array(1024);
function detect(b,sr){
 var Wn=b.length>>1,tMin=Math.floor(sr/1500),tMax=Math.min(Wn-1,yb.length-2,Math.floor(sr/52)),rms=0;
 for(var i=0;i<Wn;i++)rms+=b[i]*b[i];rms=Math.sqrt(rms/Wn);if(rms<.004)return{f:0,conf:0,rms:rms};
 yb[0]=1;var run=0;
 for(var tau=1;tau<=tMax;tau++){var s=0;for(var i=0;i<Wn;i+=2){var dl=b[i]-b[i+tau];s+=dl*dl;}run+=s;yb[tau]=s*tau/(run||1);}
 var best=-1;
 for(var t=tMin;t<=tMax;t++){if(yb[t]<.12){while(t+1<=tMax&&yb[t+1]<yb[t])t++;best=t;break;}}
 if(best<0){var mn=1e9;for(var t=tMin;t<=tMax;t++)if(yb[t]<mn){mn=yb[t];best=t;}if(mn>.4)return{f:0,conf:0,rms:rms};}
 var x0=yb[best-1],x1=yb[best],x2=yb[Math.min(best+1,tMax)],den=x0-2*x1+x2,sh2=den!==0?.5*(x0-x2)/den:0;
 return{f:sr/(best+sh2),conf:1-x1,rms:rms};}
module.exports=detect;

// window.__shot(name): force a synchronous frame (page sets window.__render), then POST the canvas PNG to /shots/.
window.__shot = async function(name, canvas){
  if (window.__render) window.__render();
  canvas = canvas || document.querySelector('canvas');
  const url = canvas.toDataURL('image/png');
  const r = await fetch('/shots/'+name, {method:'POST', body:url});
  return r.ok ? 'saved '+name+' '+canvas.width+'x'+canvas.height+' '+(url.length/1e6).toFixed(1)+'MB' : 'fail';
};

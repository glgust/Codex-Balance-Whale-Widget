const {ipcRenderer}=require('electron');
let prior;
let widgetHit=false;
document.addEventListener('codex-whale-hit-result',event=>{widgetHit=event.detail===true;});
// Only hit-test delivery crosses the isolated bridge; no filesystem or shell API.
function hitTest(x,y){
 const hit=document.elementFromPoint(x,y);
 widgetHit=false;
 document.dispatchEvent(new CustomEvent('codex-whale-hit-test',{detail:{x,y}}));
 const interactive=widgetHit||(!!hit&&hit!==document.body&&hit!==document.documentElement);
 if(interactive!==prior){prior=interactive;ipcRenderer.send('whale:pointer',interactive);}
}
window.addEventListener('mousemove',event=>hitTest(event.clientX,event.clientY),true);
ipcRenderer.on('whale:cursor',(_event,point)=>hitTest(point.x,point.y));

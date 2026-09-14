// Isolated Chromium integration test; never moves the user's mouse or shows a window.
const {app,BrowserWindow,ipcMain}=require('electron');
const path=require('node:path');
const fs=require('node:fs/promises');
const os=require('node:os');
const assert=require('node:assert/strict');
let server,win;
app.setPath('userData',path.join(os.tmpdir(),'whale-test-profile-'+process.pid));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
 const {startServer}=await import('../standalone/server.mjs');
 const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'whale-interaction-'));
 server=await startServer({dataDir,readUsageFn:async()=>({collectedAt:new Date().toISOString(),rateLimits:{primary:{usedPercent:25,windowDurationMins:10080,resetsAt:2000000000},secondary:null},summary:{lifetimeTokens:1234},dailyUsageBuckets:[],error:null})});
 win=new BrowserWindow({show:false,width:1000,height:800,webPreferences:{preload:path.join(__dirname,'preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
 let interactive=null;
 ipcMain.on('whale:pointer',(_event,value)=>{interactive=value;});
 await win.loadURL(server.url);
 const js=code=>win.webContents.executeJavaScript(code);
 let point;
 for(let attempt=0;attempt<50;attempt++){
  point=await js(`(()=>{const image=document.querySelector('.dshwv-img');if(!image?.complete)return null;const r=image.getBoundingClientRect();let hit=false;const listener=e=>hit=e.detail===true;document.addEventListener('codex-whale-hit-result',listener);try{for(let y=r.top+10;y<r.bottom;y+=10)for(let x=r.left+10;x<r.right;x+=10){hit=false;document.dispatchEvent(new CustomEvent('codex-whale-hit-test',{detail:{x,y}}));if(hit)return {x:Math.round(x),y:Math.round(y)};}return null;}finally{document.removeEventListener('codex-whale-hit-result',listener);}})()`);
  if(point)break;await pause(100);
 }
 assert.ok(point,'original pixel hit-test must find the original character');
 win.webContents.send('whale:cursor',point);await pause(100);
 assert.equal(interactive,true,'isolated preload must accept original image pixels');
 win.webContents.sendInputEvent({type:'mouseDown',...point,button:'left',clickCount:1});
 await pause(100);
 win.webContents.sendInputEvent({type:'mouseUp',...point,button:'left',clickCount:1});
 await pause(500);
 assert.equal(await js(`!!document.querySelector('.dshwv-pop-open')`),true,'click must open original bubble');
 const before=await js(`(()=>{const r=document.querySelector('.dshwv-root').getBoundingClientRect();return {x:r.x,y:r.y}})()`);
 await js(`window.testEvents=[];for(const name of ['pointerdown','pointermove','pointerup'])document.addEventListener(name,e=>testEvents.push([name,e.clientX,e.clientY,e.buttons]),true)`);
 win.webContents.sendInputEvent({type:'mouseDown',...point,button:'left',clickCount:1});
 await pause(100);
 win.webContents.send('whale:cursor',{x:2,y:2});await pause(100);
 assert.equal(interactive,true,'drag must retain event delivery outside image');
 // Hidden Chromium coalesces native mouse moves; exercise the original DOM
 // handler separately. This is not a claim of foreground OS drag validation.
 await js(`document.dispatchEvent(new PointerEvent('pointermove',{clientX:${point.x-120},clientY:${point.y-100},buttons:1,pointerType:'mouse',bubbles:true}))`);
 await pause(100);
 const after=await js(`(()=>{const r=document.querySelector('.dshwv-root').getBoundingClientRect();return {x:r.x,y:r.y}})()`);
 assert.ok(after.x<before.x||after.y<before.y,'original drag must move the widget '+JSON.stringify({point,before,after,events:await js('testEvents')}));
 win.webContents.sendInputEvent({type:'mouseUp',x:point.x-120,y:point.y-100,button:'left',clickCount:1});
 console.log('PASS: original pixel hit, isolated bridge, Chromium bubble click, DOM drag handler and capture policy; foreground OS drag not tested');
}).catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{win?.destroy();await server?.close();app.exit(process.exitCode||0);});

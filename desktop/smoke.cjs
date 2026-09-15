// Verify the packaged runtime without showing UI or touching the user's settings.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const assert=require('node:assert/strict');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'codex-whale-smoke-'));
app.setPath('userData',path.join(directory,'profile'));
let server,win;
let exitCode=0;
const result={ok:false,packaged:app.isPackaged};
const timeout=setTimeout(()=>{result.error='Packaged smoke test timed out';finish(1);},30000);
function finish(code){
 if(process.env.WHALE_SMOKE_REPORT)fs.writeFileSync(process.env.WHALE_SMOKE_REPORT,JSON.stringify(result,null,2));
 app.exit(code);
}
app.whenReady().then(async()=>{
 const {startServer}=await import('../standalone/server.mjs');
 server=await startServer({dataDir:directory,readUsageFn:async()=>({collectedAt:new Date().toISOString(),rateLimits:{primary:{usedPercent:25,windowDurationMins:10080,resetsAt:2000000000}},summary:{lifetimeTokens:1234}})});
 win=new BrowserWindow({show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false}});
 win.webContents.setAudioMuted(true);
 await win.loadURL(server.url);
 const checks=await win.webContents.executeJavaScript(`(async()=>{
   for(let i=0;i<50;i++){const im=document.querySelector('.dshwv-img');if(im?.complete&&im.naturalWidth>0)break;await new Promise(r=>setTimeout(r,100));}
   const im=document.querySelector('.dshwv-img');
   const audio=await fetch('/dsh-whale/sound/press.mp3?set=duck');
   const bytes=await audio.arrayBuffer();
   const context=new AudioContext();const decoded=await context.decodeAudioData(bytes);await context.close();
   const rejected=await fetch('/dsh-whale/balance.json',{credentials:'omit'});
   return {imageWidth:im?.naturalWidth||0,audioStatus:audio.status,audioDuration:decoded.duration,unauthenticatedStatus:rejected.status,bridge:typeof require==='undefined'};
 })()`);
 assert.ok(checks.imageWidth>0);assert.equal(checks.audioStatus,200);assert.ok(checks.audioDuration>0);assert.equal(checks.unauthenticatedStatus,401);assert.ok(checks.bridge);
 result.ok=true;result.checks=checks;
}).catch(error=>{exitCode=1;result.error=error.stack;}).finally(async()=>{
 clearTimeout(timeout);win?.destroy();await server?.close();finish(exitCode);
});

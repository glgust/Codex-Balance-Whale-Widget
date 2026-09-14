// Desktop host only. The widget artwork, DOM, CSS and interactions remain upstream's.
const {app,BrowserWindow,Tray,Menu,nativeImage,screen,ipcMain}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
const stateDir=path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'.local','share'),'CodexWhaleWidget');
app.setName('Codex Whale Widget');
app.setPath('userData',path.join(stateDir,'desktop-profile'));
let timer,cursorTimer,lastControl='';
function status(){fs.mkdirSync(stateDir,{recursive:true});fs.writeFileSync(path.join(stateDir,'desktop-status.json'),JSON.stringify({pid:closing?null:process.pid,visible:!closing&&!!win?.isVisible(),updatedAt:new Date().toISOString()}));}
let win,tray,server,closing=false;
if(!app.requestSingleInstanceLock()) app.quit();
else {
 app.on('second-instance',()=>{win?.show();});
 app.whenReady().then(async()=>{
  const {startServer}=await import('../standalone/server.mjs');
  try{lastControl=fs.readFileSync(path.join(stateDir,'control.json'),'utf8');}catch{}
  server=await startServer();
  const area=screen.getPrimaryDisplay().workArea;
  // Windows tool windows are excluded from Chromium's native occlusion tracker.
  // Keep the original full viewport without making apps underneath look hidden.
  win=new BrowserWindow({...area,type:'toolbar',skipTaskbar:true,frame:false,transparent:true,backgroundColor:'#00000000',resizable:false,alwaysOnTop:true,show:false,title:'Codex Whale · Original Widget',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  win.setMenu(null);
  win.webContents.on('console-message',(_event,details)=>{if(details.level==='error')fs.appendFileSync(path.join(stateDir,'renderer.log'),String(details.message)+'\n');});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(event,url)=>{if(new URL(url).origin!==server.origin)event.preventDefault();});
  win.webContents.session.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  ipcMain.on('whale:pointer',(event,interactive)=>{if(event.sender===win.webContents&&typeof interactive==='boolean')win.setIgnoreMouseEvents(!interactive,{forward:true});});
  const icon=nativeImage.createFromPath(path.join(__dirname,'../assets/DSniang1.png')).resize({width:32,height:32});
  tray=new Tray(icon);
  tray.setToolTip('Codex Whale · 原版鲸鱼');
  tray.setContextMenu(Menu.buildFromTemplate([
   {label:'显示鲸鱼',click:()=>win.show()},
   {label:'隐藏鲸鱼（继续刷新）',click:()=>win.hide()},
   {label:'刷新 Codex 额度',click:()=>server.refresh()},
   {type:'separator'},{label:'退出',click:()=>app.quit()}
  ]));
  tray.on('double-click',()=>win.show());
  win.on('close',event=>{if(!closing){event.preventDefault();win.hide();}});
  win.once('ready-to-show',()=>{win.setIgnoreMouseEvents(true,{forward:true});win.showInactive();});
  await win.loadURL(server.url);
  cursorTimer=setInterval(()=>{if(!win.isDestroyed()){const p=screen.getCursorScreenPoint();const b=win.getBounds();win.webContents.send('whale:cursor',{x:p.x-b.x,y:p.y-b.y});}},100);
  timer=setInterval(()=>{
   try{
    const control=fs.readFileSync(path.join(stateDir,'control.json'),'utf8');
    if(control!==lastControl){lastControl=control;const {action}=JSON.parse(control);if(action==='show')win.show();if(action==='hide')win.hide();if(action==='close')app.quit();if(action==='refresh')server.refresh();}
   }catch{}
   if(!closing)status();
  },1000);
 }).catch(error=>{console.error(error);app.quit();});
 app.on('before-quit',()=>{closing=true;clearInterval(timer);clearInterval(cursorTimer);status();server?.close();tray?.destroy();});
}

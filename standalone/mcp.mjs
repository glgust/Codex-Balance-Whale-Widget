import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile, writeFile, mkdir, access} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {homedir} from 'node:os';
import {readUsage, closeUsageClient} from './collector.mjs';
import settings from '../desktop/settings.cjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)), '..');
const data=join(process.env.LOCALAPPDATA || join(homedir(), '.local','share'), 'CodexWhaleWidget');
const statusPath=join(data,'desktop-status.json');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const definitions=[
  ['get_usage','Read current Codex subscription quota and account token summaries using the official local app-server. No model turn is sent.',true],
  ['show_whale','Open the independent Windows desktop whale. It refreshes account quota every 60 seconds without model turns.',false],
  ['close_whale','Close the desktop whale and its own background collector.',false],
  ['refresh_whale','Request an immediate refresh from the running desktop whale.',false],
  ['desktop_status','Read whether the desktop whale is running and its most recent cached quota snapshot.',true]
].map(([name,description,readOnlyHint])=>({name,description,inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint,destructiveHint:false,idempotentHint:true,openWorldHint:name==='get_usage'}}));

async function status(){try{const s=JSON.parse(await readFile(statusPath,'utf8'));return {...s,running:!!s.pid && Date.now()-Date.parse(s.updatedAt)<8000};}catch{return {running:false};}}
async function control(action){await mkdir(data,{recursive:true});await writeFile(join(data,'control.json'),JSON.stringify({action,nonce:new Date().toISOString()}));}
async function call(name){
  if(name==='get_usage')return await readUsage();
  if(name==='desktop_status'){
    let snapshot=null;try{snapshot=JSON.parse(await readFile(join(data,'usage.json'),'utf8'));}catch{}
    return {desktop:await status(),snapshot};
  }
  if(process.platform!=='win32')throw new Error('Desktop whale currently supports Windows only. get_usage remains available.');
  if(name==='show_whale'){
    const before=await status();
    if(before.running)await control('show');
    else{
      const exe=join(root,'node_modules','electron','dist','electron.exe');
      await access(exe).catch(()=>{throw new Error('Electron is missing. Run npm ci and node node_modules/electron/install.js in the installed plugin folder.');});
      await new Promise((resolve,reject)=>{
        const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-File',join(root,'desktop','launch-detached.ps1'),'-Root',root,'-Node',process.execPath],{stdio:'ignore',windowsHide:true});
        child.once('error',reject);
        child.once('exit',code=>code===0?resolve():reject(new Error('Windows desktop broker could not launch the whale. Use Start-Whale.cmd from the plugin folder.')));
      });
    }
    for(let i=0;i<30;i++){const s=await status();if(s.running&&s.visible)return s;await wait(250);}
    throw new Error('Desktop launch was requested but its ready status was not observed.');
  }
  if(name==='close_whale'){
    if(!(await status()).running)return {running:false};
    await control('close');
    for(let i=0;i<30;i++){const s=await status();if(!s.running)return s;await wait(250);}
    throw new Error('Close requested but desktop has not confirmed exit.');
  }
  if(name==='refresh_whale'){
    if(!(await status()).running)throw new Error('Open the whale first with show_whale.');
    await control('refresh');
    return {requested:true,requestedAt:new Date().toISOString()};
  }
  throw new Error('Unknown tool');
}
const send=value=>process.stdout.write(JSON.stringify(value)+'\n');
let autoStartAttempted=false;
async function autoStart(){
  if(autoStartAttempted)return;
  autoStartAttempted=true;
  if(process.platform!=='win32'||!settings.readSettings(data).startWithCodex)return;
  // Do not reveal a whale the user deliberately hid, or block MCP initialization.
  if((await status()).running)return;
  try{await call('show_whale');}
  catch(error){process.stderr.write(`Whale auto-start failed: ${error.message}\n`);}
}
async function handle(message){
  if(message.method==='notifications/initialized'){void autoStart();return;}
  if(message.id===undefined)return;
  try{
    let result;
    if(message.method==='initialize')result={protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'codex-whale-widget',version:'0.1.0'}};
    else if(message.method==='ping')result={};
    else if(message.method==='tools/list')result={tools:definitions};
    else if(message.method==='resources/list')result={resources:[]};
    else if(message.method==='prompts/list')result={prompts:[]};
    else if(message.method==='tools/call'){
      const name=message.params?.name;
      if(!definitions.some(t=>t.name===name))throw new Error('Unknown tool');
      if(Object.keys(message.params?.arguments||{}).length)throw new Error('This tool takes no arguments');
      try{const value=await call(name);result={content:[{type:'text',text:JSON.stringify(value)}],isError:!!value?.error};}
      catch(error){result={content:[{type:'text',text:error.message}],isError:true};}
    }else{send({jsonrpc:'2.0',id:message.id,error:{code:-32601,message:'Method not found'}});return;}
    send({jsonrpc:'2.0',id:message.id,result});
  }catch(error){send({jsonrpc:'2.0',id:message.id,error:{code:-32602,message:error.message}});}
}
const lines=createInterface({input:process.stdin,crlfDelay:Infinity});
lines.on('line',line=>{try{void handle(JSON.parse(line));}catch{send({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}});}});
lines.on('close',()=>{void closeUsageClient();});
process.on('SIGTERM',()=>{closeUsageClient();process.exit(0);});

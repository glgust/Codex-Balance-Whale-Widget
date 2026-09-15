// Exercise the actual first bubble in a hidden Chromium window with synthetic accounts.
const assert = require('node:assert/strict');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
module.exports = async function checkQuotaWindows(win, server, setWindows) {
  const week = {usedPercent: 81, windowDurationMins: 10080, resetsAt: Math.floor(Date.now()/1000)+345600};
  const five = {usedPercent: 0, windowDurationMins: 300, resetsAt: Math.floor(Date.now()/1000)+10800};
  const scenarios = [
    ['week-only', week, null, false, true],
    ['five-hour-secondary', week, five, true, true],
    ['five-hour-primary', five, week, true, true],
    ['five-hour-only', five, null, true, false],
    ['secondary-only', null, five, true, false],
    ['no-windows', null, null, false, false],
  ];
  const results = [];
  for (const [name, primary, secondary, hasFive, hasWeek] of scenarios) {
    setWindows({primary, secondary});
    await server.refresh();
    await win.loadURL(server.url);
    let point;
    for (let i=0; i<60; i++) {
      point = await win.webContents.executeJavaScript(`(()=>{
        const im=document.querySelector('.dshwv-img');if(!im?.complete||!im.naturalWidth)return null;
        const r=im.getBoundingClientRect();let hit=false;
        const listener=e=>hit=e.detail===true;document.addEventListener('codex-whale-hit-result',listener);
        try{for(let y=r.top+10;y<r.bottom;y+=10)for(let x=r.left+10;x<r.right;x+=10){
          hit=false;document.dispatchEvent(new CustomEvent('codex-whale-hit-test',{detail:{x,y}}));
          if(hit)return {x:Math.round(x),y:Math.round(y)};
        }}finally{document.removeEventListener('codex-whale-hit-result',listener);}return null;
      })()`);
      if (point) break;
      await pause(100);
    }
    assert.ok(point, name+': character loaded');
    await pause(400);
    win.webContents.sendInputEvent({type:'mouseDown',...point,button:'left',clickCount:1});
    await pause(80);
    win.webContents.sendInputEvent({type:'mouseUp',...point,button:'left',clickCount:1});
    await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true});
    await pause(650);
    const actual = await win.webContents.executeJavaScript(`(()=>{
      const pop=document.querySelector('.dshwv-pop-open');
      const rows=pop?Array.from(pop.querySelectorAll('.dshwv-text > .dshwv-trow')):[];
      const box=pop?.querySelector('.dshwv-text').getBoundingClientRect();
      return {open:!!pop,rows:rows.map(x=>x.innerText),bounds:{box:box?.toJSON(),rows:rows.map(x=>x.getBoundingClientRect().toJSON())},fits:rows.every(x=>{const r=x.getBoundingClientRect();return r.top>=box.top-1&&r.bottom<=box.bottom+1})};
    })()`);
    assert.ok(actual.open, name+': original click opens bubble');
    const text=actual.rows.join('\n');
    assert.equal(text.includes('5h'),hasFive,name+': five-hour presence '+text);
    assert.equal(text.includes('7天窗口'),hasWeek,name+': weekly presence '+text);
    if(hasFive) assert.match(text, /(?:^|\D)0%/, name+': zero usage is still a limit');
    if(hasWeek) assert.ok(text.includes('81%'),name+': weekly percentage');
    assert.equal((text.match(/后重置/g)||[]).length,Number(hasFive)+Number(hasWeek),name+': each reset shown');
    assert.ok(actual.rows.length<=6,name+': fits original six-row layout');
    assert.ok(actual.fits,name+': text stays inside original bubble text area '+JSON.stringify(actual.bounds));
    results.push({name,rows:actual.rows});
    if(name==='five-hour-secondary' && process.env.WHALE_QUOTA_SCREENSHOT){
      // Hidden Windows windows may pause compositor transitions. Capture their final state.
      await win.webContents.insertCSS('.dshwv-pop-open .dshwv-text,.dshwv-pop-open .dshwv-bshape,.dshwv-pop-open .dshwv-b1,.dshwv-pop-open .dshwv-b2{opacity:1!important;transition:none!important}');
      require('node:fs').writeFileSync(process.env.WHALE_QUOTA_SCREENSHOT,(await win.webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
    }
  }
  return results;
};

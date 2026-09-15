import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import settings from '../desktop/settings.cjs';

test('startup is opt-in, survives reload, and rejects malformed settings',()=>{
  const directory=mkdtempSync(join(tmpdir(),'whale-startup-'));
  try{
    assert.equal(settings.readSettings(directory).startWithCodex,false);
    settings.writeSettings(directory,{startWithCodex:true});
    assert.equal(settings.readSettings(directory).startWithCodex,true);
    settings.writeSettings(directory,{startWithCodex:false});
    assert.equal(settings.readSettings(directory).startWithCodex,false);
    for(const value of ['{"startWithCodex":"true"}','null','invalid']){
      writeFileSync(join(directory,'desktop-settings.json'),value);
      assert.equal(settings.readSettings(directory).startWithCodex,false);
    }
  }finally{rmSync(directory,{recursive:true,force:true});}
});

import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const child=spawn(process.execPath,['--import','tsx','rl/env/server.ts'],{
  env:{...process.env,PORT:'18211',ENV_HOST:'127.0.0.1',ENV_MODE:'sandbox',PARK_SANDBOX_FIXTURES_ONLY:'1'},stdio:['ignore','pipe','pipe'],
});
async function main(){
  try {
    await new Promise<void>((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('server start timeout')),15000);
      child.once('exit',()=>{clearTimeout(timer);reject(new Error('server exited before test'));});
      child.stdout.on('data',chunk=>{if(String(chunk).includes('listening')){clearTimeout(timer);resolve();}});
    });
    async function post(body:unknown){
      const res=await fetch('http://127.0.0.1:18211/call',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(5000)});
      return {status:res.status,data:await res.json()};
    }
    assert.equal((await post(null)).status,400);
    assert.equal((await post({name:'get_wait_times',arguments:{park_id:'shanghai'}})).status,400);
    for(const args of [null,[],{park_id:12},{park_id:'shanghai',typo:1}]) assert.equal((await post({tool:'get_wait_times',args})).data.ok,false);
    const valid=await post({tool:'get_wait_times',args:{park_id:'shanghai',ride_id:'tron'},mode:'sandbox'});
    assert.equal(valid.status,200);assert.equal(valid.data.ok,true);
    assert.equal((await post({tool:'get_wait_times',args:{park_id:'shanghai'},mode:'invalid'})).data.ok,false);
    console.log('HTTP envelope, null/type/unknown-field/mode rejection and valid dispatch passed');
  } finally {child.kill('SIGTERM');}
}
main().catch(e=>{console.error(e);process.exitCode=1});

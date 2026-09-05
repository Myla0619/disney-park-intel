import assert from "node:assert/strict";
import {buildCorpus} from "./gen_seeds";
import {validateRewrite} from "./augment";
import {KeyPool} from "../agent/key-pool";
import {PHASE_WEIGHTS} from "../reward/reward";
async function main(){
 const rows=buildCorpus();
 assert.equal(rows.length,306);assert.equal(new Set(rows.map(r=>r.query)).size,306);
 assert.deepEqual(rows,buildCorpus());assert.equal(new Set(rows.map(r=>r.category)).size,12);
 assert.ok(rows.every(r=>r.familyId&&r.split));
 assert.equal(validateRewrite("110cm孩子，15:00入园","110cm的孩子，15:00到园区"),true);
 assert.equal(validateRewrite("110cm孩子，15:00入园","120cm的孩子，15:00到园区"),false);
 assert.equal(validateRewrite("110cm孩子，15:00入园","110cm的孩子，15:00入园，玩3个项目"),false);
 const pool=new KeyPool(["test-key-a","test-key-b"],1);
 const a=await pool.acquire(Date.now()+500),b=await pool.acquire(Date.now()+500);
 assert.notEqual(a.key,b.key);
 let resolved=false;const waiting=pool.acquire(Date.now()+1000).then(x=>{resolved=true;return x;});
 await new Promise(r=>setTimeout(r,30));assert.equal(resolved,false);
 a.release();const c=await waiting;assert.equal(c.key,a.key);c.release();b.release();
 for(const w of Object.values(PHASE_WEIGHTS)){assert.ok(w.answer>=.6);assert.ok(Math.abs(Object.values(w).reduce((a,b)=>a+b)-1)<1e-8);}
 console.log("PASS corpus reproducibility, numeric constraints, credential reservations, reward weights");
}
main().catch(e=>{console.error(e);process.exitCode=1;});

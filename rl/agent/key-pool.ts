/** Process-local reservations are synchronous, so concurrent requests cannot overbook a key. */
export class KeyPool {
  private slots: {key: string; active: number; readyAt: number; disabled: boolean}[];
  private cursor = 0;
  constructor(keys: string[], private perKeyConcurrency = 2) {
    const unique = [...new Set(keys.filter(Boolean))];
    if (!unique.length || perKeyConcurrency < 1) throw new Error("Invalid credential pool");
    this.slots = unique.map(key=>({key,active:0,readyAt:0,disabled:false}));
  }
  async acquire(deadline: number) {
    while (Date.now() < deadline) {
      if (this.slots.every(s=>s.disabled)) throw new Error("All configured credentials rejected");
      for (let i=0;i<this.slots.length;i++) {
        const index=(this.cursor+i)%this.slots.length, s=this.slots[index];
        if (!s.disabled && s.readyAt<=Date.now() && s.active<this.perKeyConcurrency) {
          s.active++; this.cursor=(index+1)%this.slots.length;
          let released=false;
          return {key:s.key, release:(status=200,cooldownMs=0)=>{
            if(released)return; released=true;s.active--;
            if(status===401||status===403)s.disabled=true;
            if(status===429||status>=500)s.readyAt=Math.max(s.readyAt,Date.now()+Math.max(cooldownMs,1000));
          }};
        }
      }
      await new Promise(r=>setTimeout(r,100));
    }
    throw new Error("Credential pool deadline exceeded");
  }
}
const pools=new Map<string,KeyPool>();
export function sharedKeyPool(keys:string[]) {
  const id=JSON.stringify(keys);
  if(!pools.has(id))pools.set(id,new KeyPool(keys));
  return pools.get(id)!;
}

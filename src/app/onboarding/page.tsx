"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useProfileStore } from "@/lib/store";
import DiningPlanPicker from "@/components/DiningPlanPicker";
import { DiningPlan } from "@/types";
import { inferMealType, recommendedMealTime } from "@/lib/dining";
import { UserProfile, KidInfo, LLPackage } from "@/types";
import { Users, Zap, Coffee, ChevronRight, Plus, X, Camera, ShoppingBag,
         Sparkles, Footprints, Scale, Utensils, Heart, Info } from "lucide-react";
import { PARKS, getRidesByPark, getRestaurants } from "@/lib/parks-data";
import { LL_PACKAGES, LL_ELIGIBLE_RIDES } from "@/lib/ll-packages";

const MODES = [
  { id:"family",   label:"带娃家庭", desc:"亲子优先，适合所有年龄", icon:Users },
  { id:"thrill",   label:"只玩刺激", desc:"过山车、速度、肾上腺素", icon:Zap },
  { id:"casual",   label:"轻松游览", desc:"经典项目，不排超长队",   icon:Coffee },
  { id:"photo",    label:"拍照打卡", desc:"美景、城堡、ins风景点",  icon:Camera },
  { id:"shopping", label:"购物美食", desc:"边逛边吃，打卡周边商品", icon:ShoppingBag },
] as const;

const ROUTE_PROFILES = [
  { id:"efficient", label:"效率优先", desc:"少排队，接受多走路", detail:"体力充沛，用脚换时间", icon:Zap },
  { id:"balanced",  label:"均衡模式", desc:"排队步行取平衡",     detail:"适合大多数游客",       icon:Scale },
  { id:"easy",      label:"省力优先", desc:"少走路，接受多等",   detail:"带孩子/老人/行动不便", icon:Footprints },
] as const;

const DINING_PREFS = [
  { id:"quick",  label:"快速解决", desc:"不浪费游玩时间", icon:Zap },
  { id:"normal", label:"正常用餐", desc:"均衡体验",       icon:Utensils },
  { id:"fancy",  label:"精致体验", desc:"特色餐厅，愿意花时间", icon:Heart },
] as const;

const HOURS = Array.from({length:16}, (_,i) => `${String(i+7).padStart(2,"0")}:00`);
const PARK_ID = "shanghai";
const parkData = PARKS.find((p) => p.id === PARK_ID)!;

export default function OnboardingPage() {
  const router = useRouter();
  const setProfile = useProfileStore((s) => s.setProfile);

  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<UserProfile["mode"] | null>(null);
  const [date, setDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate()+1); return d.toISOString().slice(0,10);
  });
  const [arrival,   setArrival]   = useState("09:00");
  const [departure, setDeparture] = useState("21:00");

  // 孩子：年龄+身高
  const [kids, setKids] = useState<KidInfo[]>([]);
  const [kidAge, setKidAge] = useState("");
  const [kidHeight, setKidHeight] = useState("");

  const [mobility,       setMobility]       = useState(false);
  const [watchParade,    setWatchParade]    = useState(false);
  const [paradeTime,     setParadeTime]     = useState(parkData.defaultParadeTime);
  const [watchFireworks, setWatchFireworks] = useState(false);
  const [fireworksTime,  setFireworksTime]  = useState(parkData.defaultFireworksTime);

  // 优速通
  const [llPackage,     setLLPackage]    = useState<LLPackage>("none");
  const [singleRides,   setSingleRides]  = useState<string[]>([]);
  const [bundle3Rides,  setBundle3Rides] = useState<string[]>([]);

  const [diningPref,    setDiningPref]    = useState<UserProfile["diningPreference"]>("normal");
  const [routeProfile,  setRouteProfile]  = useState<UserProfile["routeProfile"]>("balanced");
  const [focusPhoto,    setFocusPhoto]    = useState(false);
  const [focusShopping, setFocusShopping] = useState(false);
  const [selectedRests, setSelectedRests] = useState<string[]>([]);
  const [diningPlans, setDiningPlans] = useState<DiningPlan[]>([]);

  const rides = getRidesByPark(PARK_ID);
  const restaurants = getRestaurants(PARK_ID);
  const llRides = rides.filter((r) => LL_ELIGIBLE_RIDES.includes(r.id));
  const selectedPkg = LL_PACKAGES.find((p) => p.id === llPackage);

  const addKid = () => {
    const age = parseInt(kidAge);
    const height = parseInt(kidHeight);
    if (!isNaN(age) && age>=0 && age<=17 && !isNaN(height) && height>=50 && height<=200) {
      setKids([...kids, { age, heightCm:height }]);
      setKidAge(""); setKidHeight("");
    }
  };

  const Toggle = ({ value, onChange, label }: { value:boolean; onChange:()=>void; label:string }) => (
    <div className="flex items-center gap-3">
      <button onClick={onChange} className={`w-10 h-6 rounded-full transition-all flex-shrink-0 ${value?"bg-blue-500":"bg-white/20"}`}>
        <div className={`w-4 h-4 bg-white rounded-full mx-1 transition-transform ${value?"translate-x-4":""}`} />
      </button>
      <span className="text-white/70 text-sm">{label}</span>
    </div>
  );

  const handleFinish = () => {
    if (!mode) return;
    setProfile({
      mode, park:PARK_ID, visitDate:date,
      arrivalTime:arrival, departureTime:departure,
      kids, mobilityNeeds:mobility, thrillLevel:3,
      watchParade, paradeTime,
      watchFireworks, fireworksTime,
      llPackage, singlePassRides:singleRides, bundle3Rides,
      diningPreference:diningPref, routeProfile,
      focusPhoto, focusShopping, selectedRestaurants:selectedRests, diningPlans,
    });
    router.push("/dashboard");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <div className="text-5xl mb-3">🏰</div>
          <h1 className="text-3xl font-bold text-white tracking-tight">迪士尼乐园智能助手</h1>
          <p className="text-blue-200 mt-1 text-sm">AI Agent · TSP 最优动线 · 历史数据预测</p>
        </div>

        <div className="flex gap-2 mb-6">
          {[1,2,3,4].map((s) => (
            <div key={s} className={`h-1 flex-1 rounded-full transition-all ${s<=step?"bg-blue-400":"bg-white/10"}`} />
          ))}
        </div>

        <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-6">

          {/* ── Step 1 ── */}
          {step===1 && (
            <div>
              <h2 className="text-xl font-semibold text-white mb-1">游玩风格 & 日期</h2>
              <p className="text-blue-200 text-sm mb-4">目前支持：上海迪士尼乐园</p>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {MODES.map((m) => (
                  <button key={m.id} onClick={() => setMode(m.id as any)}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${mode===m.id?"border-blue-400 bg-blue-500/20":"border-white/10 bg-white/5 hover:border-white/20"}`}>
                    <m.icon className={`w-4 h-4 mb-1.5 ${mode===m.id?"text-blue-300":"text-white/50"}`} />
                    <div className={`font-semibold text-sm ${mode===m.id?"text-white":"text-white/80"}`}>{m.label}</div>
                    <div className="text-xs text-white/40 mt-0.5">{m.desc}</div>
                  </button>
                ))}
              </div>
              <label className="text-white/60 text-sm block mb-2">入园日期</label>
              <input type="date" value={date} min={new Date().toISOString().slice(0,10)}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-400 mb-4" />
              <div className="text-center text-white/20 text-xs mb-4">
                东京 · 香港 · 巴黎 · 美国各园区 — 即将上线
              </div>
              <button disabled={!mode} onClick={() => setStep(2)}
                className="w-full py-3 bg-blue-500 hover:bg-blue-400 disabled:opacity-30 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-all flex items-center justify-center gap-2">
                下一步 <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* ── Step 2 ── */}
          {step===2 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold text-white mb-1">团队 & 时间安排</h2>
                <p className="text-blue-200 text-sm">帮助 AI 精确规划全天行程</p>
              </div>

              {/* 入离园时间 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-white/60 text-xs block mb-1">入园时间</label>
                  <select value={arrival} onChange={(e) => setArrival(e.target.value)}
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-400">
                    {HOURS.map(h => <option key={h} value={h} className="bg-slate-800">{h}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-white/60 text-xs block mb-1">离园时间</label>
                  <select value={departure} onChange={(e) => setDeparture(e.target.value)}
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-400">
                    {HOURS.filter(h=>h>arrival).map(h => <option key={h} value={h} className="bg-slate-800">{h}</option>)}
                  </select>
                </div>
              </div>

              {/* 孩子信息（年龄+身高）*/}
              <div>
                <label className="text-white/60 text-sm block mb-2">孩子信息（留空=无孩子）</label>
                <div className="flex gap-2 mb-2 flex-wrap">
                  {kids.map((kid,i) => (
                    <span key={i} className="flex items-center gap-1 bg-blue-500/20 text-blue-200 text-xs px-2.5 py-1 rounded-full">
                      {kid.age}岁 {kid.heightCm}cm
                      <X className="w-3 h-3 cursor-pointer" onClick={() => setKids(kids.filter((_,idx)=>idx!==i))} />
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input type="number" placeholder="年龄" value={kidAge} min={0} max={17}
                    onChange={(e) => setKidAge(e.target.value)}
                    className="w-20 bg-white/10 border border-white/20 rounded-lg px-2 py-2 text-white text-sm placeholder-white/30 focus:outline-none focus:border-blue-400" />
                  <input type="number" placeholder="身高cm" value={kidHeight} min={50} max={200}
                    onChange={(e) => setKidHeight(e.target.value)}
                    onKeyDown={(e) => e.key==="Enter" && addKid()}
                    className="flex-1 bg-white/10 border border-white/20 rounded-lg px-2 py-2 text-white text-sm placeholder-white/30 focus:outline-none focus:border-blue-400" />
                  <button onClick={addKid} className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white flex-shrink-0">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-white/30 text-xs mt-1">身高用于判断哪些项目不能乘坐</p>
              </div>

              {/* 优速通 */}
              <div>
                <label className="text-white/60 text-sm block mb-2">⚡ 优速通套餐</label>
                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {LL_PACKAGES.map((pkg) => (
                    <button key={pkg.id} onClick={() => setLLPackage(pkg.id)}
                      className={`w-full px-3 py-2.5 rounded-xl border text-left transition-all ${llPackage===pkg.id?"border-yellow-400 bg-yellow-500/15":"border-white/10 bg-white/5 hover:border-white/20"}`}>
                      <div className="flex justify-between items-start">
                        <span className={`font-medium text-sm ${llPackage===pkg.id?"text-white":"text-white/70"}`}>{pkg.name}</span>
                        <span className="text-xs text-amber-400 flex-shrink-0 ml-2">{pkg.price}</span>
                      </div>
                      <p className="text-xs text-white/40 mt-0.5 line-clamp-1">{pkg.description}</p>
                      {(pkg.hasReservedParade || pkg.hasReservedFireworks) && (
                        <div className="flex gap-1 mt-1">
                          {pkg.hasReservedParade && <span className="text-xs bg-pink-500/20 text-pink-300 px-1.5 py-0.5 rounded">🎠 花车预留位</span>}
                          {pkg.hasReservedFireworks && <span className="text-xs bg-orange-500/20 text-orange-300 px-1.5 py-0.5 rounded">🎆 烟花预留位</span>}
                          {pkg.hasVIPEntrance && <span className="text-xs bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded">🚀 快速入园</span>}
                        </div>
                      )}
                    </button>
                  ))}
                </div>

                {/* 单项自选 */}
                {llPackage==="single" && (
                  <div className="mt-3 p-3 bg-yellow-500/10 rounded-xl border border-yellow-500/20">
                    <p className="text-yellow-300 text-xs mb-2">选择购买了单项尊享卡的项目：</p>
                    <div className="space-y-1">
                      {llRides.map((ride) => (
                        <button key={ride.id} onClick={() => setSingleRides((p) => p.includes(ride.id)?p.filter(r=>r!==ride.id):[...p,ride.id])}
                          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-xs transition-all ${singleRides.includes(ride.id)?"bg-yellow-500/20 text-white":"bg-white/5 text-white/50 hover:text-white/70"}`}>
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${singleRides.includes(ride.id)?"border-yellow-400 bg-yellow-400":"border-white/30"}`}>
                            {singleRides.includes(ride.id) && <span className="text-slate-900 text-xs font-bold">✓</span>}
                          </div>
                          {ride.name}
                          {ride.heightRequirement && <span className="text-white/30 ml-auto">{ride.heightRequirement}cm+</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3项套餐自选 */}
                {llPackage==="bundle3" && (
                  <div className="mt-3 p-3 bg-yellow-500/10 rounded-xl border border-yellow-500/20">
                    <p className="text-yellow-300 text-xs mb-2">选择3个项目（{bundle3Rides.length}/3）：</p>
                    <div className="space-y-1">
                      {llRides.map((ride) => {
                        const sel = bundle3Rides.includes(ride.id);
                        const disabled = !sel && bundle3Rides.length >= 3;
                        return (
                          <button key={ride.id} disabled={disabled}
                            onClick={() => setBundle3Rides((p) => p.includes(ride.id)?p.filter(r=>r!==ride.id):[...p,ride.id])}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-xs transition-all ${sel?"bg-yellow-500/20 text-white":disabled?"text-white/20":"bg-white/5 text-white/50 hover:text-white/70"}`}>
                            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${sel?"border-yellow-400 bg-yellow-400":"border-white/30"}`}>
                              {sel && <span className="text-slate-900 text-xs font-bold">✓</span>}
                            </div>
                            {ride.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* 用餐偏好 */}
              <div>
                <label className="text-white/60 text-sm block mb-2">🍽️ 用餐偏好</label>
                <div className="grid grid-cols-3 gap-2">
                  {DINING_PREFS.map((d) => (
                    <button key={d.id} onClick={() => setDiningPref(d.id as any)}
                      className={`p-2 rounded-xl border-2 text-center transition-all ${diningPref===d.id?"border-amber-400 bg-amber-500/20":"border-white/10 bg-white/5 hover:border-white/20"}`}>
                      <d.icon className={`w-4 h-4 mx-auto mb-1 ${diningPref===d.id?"text-amber-300":"text-white/40"}`} />
                      <div className={`text-xs font-medium ${diningPref===d.id?"text-white":"text-white/60"}`}>{d.label}</div>
                      <div className="text-xs text-white/30 mt-0.5">{d.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 花车/烟花：默认预填+提示 */}
              <div className="space-y-3">
                <div>
                  <Toggle value={watchParade} onChange={() => setWatchParade(!watchParade)} label="🎠 要看花车巡游" />
                  {watchParade && (
                    <div className="mt-2 ml-14 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <select value={paradeTime} onChange={(e) => setParadeTime(e.target.value)}
                          className="bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-sm">
                          {HOURS.map(h=><option key={h} value={h} className="bg-slate-800">{h}</option>)}
                        </select>
                        <span className="text-white/40 text-xs">（默认参考时间）</span>
                      </div>
                      <p className="text-white/30 text-xs flex items-start gap-1">
                        <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />
                        默认参考时间，当天准确时间请查看迪士尼官方 App 并在此修改
                      </p>
                      {selectedPkg?.hasReservedParade && (
                        <p className="text-pink-300 text-xs">✓ 你的套餐含花车预留观赏区，凭套票前往指定区域即可</p>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <Toggle value={watchFireworks} onChange={() => setWatchFireworks(!watchFireworks)} label="🎆 要看烟花/幻影秀" />
                  {watchFireworks && (
                    <div className="mt-2 ml-14 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <select value={fireworksTime} onChange={(e) => setFireworksTime(e.target.value)}
                          className="bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-sm">
                          {HOURS.map(h=><option key={h} value={h} className="bg-slate-800">{h}</option>)}
                        </select>
                        <span className="text-white/40 text-xs">（默认参考时间）</span>
                      </div>
                      <p className="text-white/30 text-xs flex items-start gap-1">
                        <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />
                        默认参考时间，当天准确时间请查看迪士尼官方 App 并在此修改
                      </p>
                      {selectedPkg?.hasReservedFireworks && (
                        <p className="text-orange-300 text-xs">✓ 你的套餐含烟花预留观赏区，凭套票前往指定区域即可</p>
                      )}
                    </div>
                  )}
                </div>
                <Toggle value={mobility} onChange={() => setMobility(!mobility)} label="♿ 有行动不便成员" />
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setStep(1)} className="px-4 py-3 bg-white/5 hover:bg-white/10 text-white/60 rounded-xl text-sm">返回</button>
                <button onClick={() => setStep(3)} className="flex-1 py-3 bg-blue-500 hover:bg-blue-400 text-white font-medium rounded-xl transition-all flex items-center justify-center gap-2">
                  下一步 <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3 ── */}
          {step===3 && (
            <div>
              <h2 className="text-xl font-semibold text-white mb-1">路线偏好</h2>
              <p className="text-blue-200 text-sm mb-4">影响算法在「排队」和「步行」之间的权衡</p>
              <div className="space-y-3 mb-6">
                {ROUTE_PROFILES.map((rp) => (
                  <button key={rp.id} onClick={() => setRouteProfile(rp.id as any)}
                    className={`w-full p-4 rounded-xl border-2 text-left transition-all ${routeProfile===rp.id?"border-blue-400 bg-blue-500/20":"border-white/10 bg-white/5 hover:border-white/20"}`}>
                    <div className="flex items-center gap-3">
                      <rp.icon className={`w-5 h-5 flex-shrink-0 ${routeProfile===rp.id?"text-blue-300":"text-white/40"}`} />
                      <div>
                        <div className={`font-semibold text-sm ${routeProfile===rp.id?"text-white":"text-white/80"}`}>
                          {rp.label} <span className="font-normal text-white/40">— {rp.desc}</span>
                        </div>
                        <div className="text-xs text-white/40 mt-0.5">{rp.detail}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep(2)} className="px-4 py-3 bg-white/5 hover:bg-white/10 text-white/60 rounded-xl text-sm">返回</button>
                <button onClick={() => setStep(4)} className="flex-1 py-3 bg-blue-500 hover:bg-blue-400 text-white font-medium rounded-xl transition-all flex items-center justify-center gap-2">
                  下一步 <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ── Step 4 ── */}
          {step===4 && (
            <div>
              <h2 className="text-xl font-semibold text-white mb-1">游玩重点 & 餐厅</h2>
              <p className="text-blue-200 text-sm mb-4">可选，选了会影响行程安排</p>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <button onClick={() => setFocusPhoto(!focusPhoto)}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${focusPhoto?"border-pink-400 bg-pink-500/20":"border-white/10 bg-white/5 hover:border-white/20"}`}>
                  <Camera className={`w-5 h-5 mb-1.5 ${focusPhoto?"text-pink-300":"text-white/40"}`} />
                  <div className={`font-semibold text-sm ${focusPhoto?"text-white":"text-white/70"}`}>拍照打卡</div>
                  <div className="text-xs text-white/40 mt-0.5">插入15个最佳拍照点</div>
                </button>
                <button onClick={() => setFocusShopping(!focusShopping)}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${focusShopping?"border-emerald-400 bg-emerald-500/20":"border-white/10 bg-white/5 hover:border-white/20"}`}>
                  <ShoppingBag className={`w-5 h-5 mb-1.5 ${focusShopping?"text-emerald-300":"text-white/40"}`} />
                  <div className={`font-semibold text-sm ${focusShopping?"text-white":"text-white/70"}`}>购物安排</div>
                  <div className="text-xs text-white/40 mt-0.5">安排限定品和主题商店</div>
                </button>
              </div>

              <label className="text-white/60 text-sm block mb-2">🍽️ 想去的餐厅（不选则 AI 自动推荐）</label>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {restaurants.map((r) => {
                  const sel = selectedRests.includes(r.id);
                  return (
                    <div key={r.id}>
                    <button
                      onClick={() => {
                        const nowSelected = !selectedRests.includes(r.id);
                        setSelectedRests((p) => p.includes(r.id) ? p.filter(x=>x!==r.id) : [...p, r.id]);
                        setDiningPlans((p) => {
                          if (!nowSelected) return p.filter((x) => x.restaurantId !== r.id);
                          // 选中即给一个推荐时间，用户可再微调——比留空让他猜要好
                          const mealType = inferMealType(r);
                          return [...p, {
                            restaurantId: r.id,
                            mealType,
                            time: recommendedMealTime(mealType, {
                              arrivalTime: arrival, departureTime: departure,
                              diningPreference: diningPref, watchFireworks, fireworksTime,
                            } as any),
                            isReservation: false,
                          }];
                        });
                      }}
                      className={`w-full p-3 rounded-xl border text-left transition-all ${sel?"border-amber-400 bg-amber-500/10":"border-white/10 bg-white/5 hover:border-white/20"}`}>
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`font-medium text-sm ${sel?"text-white":"text-white/80"}`}>{r.name}</span>
                            {r.requiresReservation && <span className="text-xs bg-red-500/20 text-red-300 px-1.5 py-0.5 rounded">需预约</span>}
                            {r.photoWorthy && <span className="text-xs bg-pink-500/20 text-pink-300 px-1.5 py-0.5 rounded">📸</span>}
                          </div>
                          <div className="text-xs text-white/40 mt-0.5">{r.areaName} · {r.cuisine} · {r.priceRange}</div>
                          {r.reviews[0] && <p className="mt-1 text-xs text-white/40 line-clamp-1">&ldquo;{r.reviews[0].text.slice(0,55)}…&rdquo;</p>}
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <span className="text-amber-400 text-sm font-bold">⭐{r.rating}</span>
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${sel?"border-amber-400 bg-amber-400":"border-white/30"}`}>
                            {sel && <span className="text-slate-900 text-xs font-bold">✓</span>}
                          </div>
                        </div>
                      </div>
                    </button>
                    {sel && (
                      <DiningPlanPicker
                        restaurant={r}
                        profile={{
                          arrivalTime: arrival, departureTime: departure,
                          diningPreference: diningPref,
                          watchFireworks, fireworksTime,
                        } as any}
                        plan={diningPlans.find((d) => d.restaurantId === r.id)}
                        onChange={(next) =>
                          setDiningPlans((p) => [
                            ...p.filter((x) => x.restaurantId !== r.id),
                            next,
                          ])
                        }
                      />
                    )}
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-3 mt-4">
                <button onClick={() => setStep(3)} className="px-4 py-3 bg-white/5 hover:bg-white/10 text-white/60 rounded-xl text-sm">返回</button>
                <button onClick={handleFinish}
                  className="flex-1 py-3 bg-gradient-to-r from-blue-500 to-blue-400 hover:from-blue-400 hover:to-blue-300 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25">
                  <Sparkles className="w-4 h-4" /> 开始 AI 规划
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-white/20 text-xs mt-4">
          数据来源：themeparks.wiki · Queue-Times.com · 小红书 · 微博 · TripAdvisor
        </p>
      </div>
    </div>
  );
}

/**
 * 冒烟测试：sandbox 模式直调全部工具，验证环境闭环。
 * 运行：npm run env:smoke（零外部依赖，CI 可跑）
 */

import { callTool, type ToolContext } from "./tools";

const ctx: ToolContext = { mode: "sandbox" };
let failed = 0;

async function expect(name: string, args: any, assert: (r: any) => boolean, label: string) {
  const res = await callTool(name, args, ctx);
  const pass = res.ok && assert(res.result);
  if (!pass) {
    failed++;
    console.error(`FAIL ${label}:`, JSON.stringify(res).slice(0, 400));
  } else {
    console.log(`PASS ${label}`);
  }
}

async function expectError(name: string, args: any, label: string) {
  const res = await callTool(name, args, ctx);
  if (res.ok) {
    failed++;
    console.error(`FAIL ${label}: 应返回错误但成功了`);
  } else {
    console.log(`PASS ${label} (error: ${res.error.slice(0, 60)})`);
  }
}

const P = "shanghai";

(async () => {
  await expect("get_wait_times", { park_id: P }, (r: any) => r.shortest?.length > 0 && typeof r.average === "number", "get_wait_times 全园概况");
  await expect("get_wait_times", { park_id: P, ride_id: "tron" }, (r: any) => r.rideName?.includes("创极速") && r.waitMinutes === 75, "get_wait_times 单项目(快照75min)");
  await expect("search_reviews", { park_id: P, target_id: "tron", target_type: "ride", query: "恐高的人能玩吗" }, (r: any) => r.relevantReviews?.length > 0, "search_reviews 项目评论RAG");
  await expect("search_reviews", { park_id: P, target_id: "royal-banquet", target_type: "restaurant", query: "值得预约吗" }, (r: any) => r.relevantReviews?.length > 0, "search_reviews 餐厅评论(真实数据)");
  await expect("plan_itinerary", { park_id: P, profile: { mode: "family", kids: [{ age: 5, heightCm: 110 }], watchFireworks: true, llPackage: "bundle8" } }, (r: any) => r.totalItems > 3 && r.constraintsPassed === true, "plan_itinerary 亲子+烟花+LL 且约束自检通过");
  await expect("get_spot_info", { park_id: P, spot_id: "soaring", spot_type: "ride", current_area: "entrance" }, (r: any) => r.name?.includes("翱翔") && typeof r.walkMinutes === "number", "get_spot_info 项目+步行时间");
  await expect("get_show_schedule", { park_id: P }, (r: any) => r.shows?.length >= 2, "get_show_schedule 演出场次");
  await expect("get_ll_pricing", {}, (r: any) => Array.isArray(r) && r.length >= 10, "get_ll_pricing 全档位");
  await expect("get_ll_pricing", { package_id: "vip33" }, (r: any) => r.unlimited === true, "get_ll_pricing 单档位");
  await expect("walk_time", { park_id: P, from_area: "tomorrow", to_area: "treasure" }, (r: any) => r.walkMinutes > 0, "walk_time 区域间");
  await expect("get_weather", { park_id: P, date: "2026-10-01" }, (r: any) => r.condition && r.source === "sandbox-deterministic", "get_weather 确定性伪天气");

  // 约束校验：构造一份违规行程（孩子身高不够 + 时间重叠）
  await expect("check_constraints", {
    park_id: P,
    profile: { kids: [{ age: 4, heightCm: 100 }], arrivalTime: "09:00", departureTime: "18:00" },
    itinerary: [
      { time: "09:30", endTime: "10:30", itemId: "tron", itemName: "创极速光轮", area: "tomorrow", type: "ride", estimatedWait: 60, walkMinutes: 5, duration: 5, note: "" },
      { time: "10:00", endTime: "11:00", itemId: "winnie", itemName: "小熊维尼", area: "fantasy", type: "ride", estimatedWait: 20, walkMinutes: 8, duration: 5, note: "" },
    ],
  }, (r: any) => r.passed === false
      && r.checks.find((c: any) => c.check === "height_compliance")?.pass === false
      && r.checks.find((c: any) => c.check === "time_continuity")?.pass === false,
    "check_constraints 捕获身高违规+时间重叠");

  // 失败感知：错误也走信封回传
  await expectError("get_wait_times", { park_id: "tokyo" }, "未配置乐园返回错误信封");
  await expectError("get_spot_info", { park_id: P, spot_id: "nonexistent", spot_type: "ride" }, "不存在项目返回错误信封");
  await expectError("nonexistent_tool", {}, "未知工具返回错误信封");

  console.log(failed === 0 ? "\n✅ smoke 全部通过" : `\n❌ ${failed} 项失败`);
  process.exit(failed === 0 ? 0 : 1);
})();

import Link from "next/link";
import {
  ArrowRight, CalendarClock, Camera, Check, ChevronRight, Clock3,
  MapPin, MessageCircleMore, RefreshCw, Sparkles, Star, Users, Zap,
} from "lucide-react";

const preferences = [
  { label: "拍照打卡", detail: "城堡与光影优先", icon: Camera, tone: "landing-mode-photo" },
  { label: "亲子慢游", detail: "身高与体力都算进去", icon: Users, tone: "landing-mode-family" },
  { label: "刺激项目", detail: "把热门项目排得更顺", icon: Zap, tone: "landing-mode-thrill" },
];

export default function Home() {
  return (
    <main className="landing-shell">
      <nav className="landing-nav" aria-label="主导航">
        <Link href="/" className="landing-brand" aria-label="Disney Park Intelligence 首页">
          <span className="landing-brand-mark"><Sparkles aria-hidden="true" /></span>
          <span>Disney Park Intelligence</span>
        </Link>
        <Link href="/onboarding" className="landing-nav-action">开始规划 <ArrowRight aria-hidden="true" /></Link>
      </nav>

      <section className="landing-hero">
        <div className="landing-hero-copy">
          <h1>你想怎么玩，<br /><span>路线就怎么排。</span></h1>
          <p>想拍照、带孩子轻松玩，还是把刺激项目刷个遍？告诉我们你的时间和偏好，行程会把排队、步行、预约和当天进度一起算进去。</p>
          <div className="landing-actions">
            <Link href="/onboarding" className="landing-primary-action">规划我的一天 <ChevronRight aria-hidden="true" /></Link>
            <span>目前支持上海迪士尼</span>
          </div>
          <div className="landing-modes" aria-label="支持的游玩偏好">
            {preferences.map(({ label, detail, icon: Icon, tone }) => (
              <div className={`landing-mode ${tone}`} key={label}>
                <Icon aria-hidden="true" /><div><strong>{label}</strong><span>{detail}</span></div>
              </div>
            ))}
          </div>
        </div>

        <div className="landing-plan-preview" aria-label="智能行程示例">
          <div className="landing-plan-head">
            <div><span>今天的路线</span><strong>少排队，也少走回头路</strong></div>
            <span className="landing-live"><i /> 实时调整</span>
          </div>
          <ol className="landing-timeline">
            <li className="is-done"><span className="landing-time">09:20</span><span className="landing-node"><Check aria-hidden="true" /></span><div><strong>翱翔·飞越地平线</strong><span>已完成</span></div></li>
            <li className="is-current"><span className="landing-time">10:05</span><span className="landing-node"><MapPin aria-hidden="true" /></span><div><strong>加勒比海盗</strong><span>步行 6 分钟 · 预计等待 15 分钟</span></div></li>
            <li><span className="landing-time">11:10</span><span className="landing-node"><Camera aria-hidden="true" /></span><div><strong>奇幻童话城堡</strong><span>上午顺光，适合拍照</span></div></li>
            <li className="has-reminder"><span className="landing-time">12:00</span><span className="landing-node"><CalendarClock aria-hidden="true" /></span><div><strong>皇家宴会厅</strong><span>预约提醒 · 建议提前 15 分钟到达</span></div></li>
          </ol>
          <div className="landing-replan"><RefreshCw aria-hidden="true" /><div><strong>晚到了一小时？</strong><span>从现在开始重排，不重做已经完成的行程。</span></div></div>
        </div>
      </section>

      <section className="landing-story" aria-labelledby="story-title">
        <div className="landing-story-intro">
          <h2 id="story-title">攻略收藏了一堆，<br />真正需要的是下一步。</h2>
          <p>它不只给你一张固定清单，而是跟着当天的情况继续往下排。</p>
        </div>
        <div className="landing-story-grid">
          <article className="landing-review-feature">
            <div className="landing-feature-title"><MessageCircleMore aria-hidden="true" /><span>替你找到评价里的重点</span></div>
            <blockquote>“前半段比较平缓，真正刺激的是后面的急转和倒车。怕失重的人也比较容易接受……”</blockquote>
            <div className="landing-review-meta"><span><Star aria-hidden="true" /> 评价摘要</span><span>已定位到「刺激程度」相关片段</span></div>
          </article>
          <article className="landing-reminder-feature">
            <Clock3 aria-hidden="true" /><div><span>12:00 · 皇家宴会厅</span><h3>该往餐厅走了</h3><p>路线会为预约、巡游和烟花留出时间，不会排着排着就错过。</p></div>
          </article>
          <article className="landing-question-feature">
            <span>你可以直接问</span><p>“我现在在宝藏湾，接下来去哪儿最省时间？”</p><div><Sparkles aria-hidden="true" /> 正在结合位置、排队与剩余行程…</div>
          </article>
        </div>
      </section>

      <section className="landing-final-cta">
        <div><h2>先选你想要的一天。</h2><p>剩下的路线、时间和提醒，交给我们来排。</p></div>
        <Link href="/onboarding" className="landing-primary-action">开始规划 <ArrowRight aria-hidden="true" /></Link>
      </section>
      <footer className="landing-footer"><span>Disney Park Intelligence</span><span>行程为规划建议，实时信息请以迪士尼官方 App 为准。</span></footer>
    </main>
  );
}

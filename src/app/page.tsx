import Link from "next/link";
import {
  ArrowRight, CalendarClock, Camera, Check, ChevronRight, Clock3,
  MapPin, MessageCircleMore, RefreshCw, Sparkles, Star,
} from "lucide-react";

export default function Home() {
  return (
    <main className="landing-shell">
      <nav className="landing-nav" aria-label="主导航">
        <Link href="/" className="landing-brand" aria-label="Disney Park Intelligence 首页">
          <span className="landing-brand-mark"><Sparkles aria-hidden="true" /></span>
          <span>Disney Park Intelligence</span>
        </Link>
        <Link href="/onboarding" className="landing-nav-action">生成游园路线 <ArrowRight aria-hidden="true" /></Link>
      </nav>

      <section className="landing-hero">
        <div className="landing-hero-copy">
          <h1>把时间留给<br /><span>真正想玩的。</span></h1>
          <p>少排队，少走回头路。无论想拍照、带孩子轻松玩，还是专门挑战刺激项目，我们都会按你的偏好排出一条更顺路的迪士尼行程。</p>
          <div className="landing-actions">
            <Link href="/onboarding" className="landing-primary-action">生成我的游园路线 <ChevronRight aria-hidden="true" /></Link>
            <span>免费使用 · 目前支持上海迪士尼</span>
          </div>
          <div className="landing-assurances" aria-label="路线规划能力">
            <span><Check aria-hidden="true" /> 按喜好安排</span>
            <span><Check aria-hidden="true" /> 预约不会漏</span>
            <span><Check aria-hidden="true" /> 进度随时重排</span>
          </div>
        </div>

        <div className="landing-plan-preview" aria-label="智能行程示例">
          <div className="landing-plan-head">
            <div><span>你今天的路线</span><strong>下一站，直接告诉你</strong></div>
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
        <div className="landing-route-map" aria-hidden="true">
          <svg viewBox="0 0 1440 920" preserveAspectRatio="none">
            <path className="landing-route-shadow" d="M-40 126 C180 70 285 278 470 240 S744 70 870 202 1055 450 1470 352" />
            <path className="landing-route-main" d="M-40 126 C180 70 285 278 470 240 S744 70 870 202 1055 450 1470 352" />
            <path className="landing-route-secondary" d="M132 650 C320 530 475 716 650 610 S925 482 1080 622 1260 786 1510 720" />
            <circle cx="94" cy="108" r="6" />
            <circle cx="470" cy="240" r="7" />
            <circle cx="870" cy="202" r="6" />
            <circle cx="1212" cy="378" r="7" />
            <circle cx="650" cy="610" r="6" />
            <circle cx="1080" cy="622" r="7" />
          </svg>
          <span className="landing-map-label label-fantasy">奇想花园</span>
          <span className="landing-map-label label-cove">宝藏湾</span>
          <span className="landing-map-label label-tomorrow">明日世界</span>
        </div>
        <div className="landing-story-intro">
          <h2 id="story-title">不用来回翻攻略。<br />现在去哪，直接告诉你。</h2>
          <p>不是出发前生成一次就结束。晚到、提前玩完或临时改变主意，后面的路线都会跟着调整。</p>
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
        <div className="landing-route-result" aria-label="路线重新规划示例">
          <div className="landing-route-result-time"><span>10:37</span><i /></div>
          <p>加勒比海盗排队突然增加到 45 分钟</p>
          <strong>已改去晶彩奇航，预计少等 28 分钟</strong>
          <RefreshCw aria-hidden="true" />
        </div>
      </section>

      <section className="landing-final-cta">
        <div><h2>少做选择，多玩几个项目。</h2><p>告诉我们你想玩什么，几分钟生成一条适合你的路线。</p></div>
        <Link href="/onboarding" className="landing-primary-action">生成我的路线 <ArrowRight aria-hidden="true" /></Link>
      </section>
      <footer className="landing-footer"><span>Disney Park Intelligence</span><span>行程为规划建议，实时信息请以迪士尼官方 App 为准。</span></footer>
    </main>
  );
}

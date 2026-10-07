import "./style.css";

type Stat = { label: string; value: string; tone?: "primary" | "success" | "warning" | "danger" };

const stats: Stat[] = [
  { label: "فروش امروز", value: "۰ تومان", tone: "primary" },
  { label: "دریافت امروز", value: "۰ تومان", tone: "success" },
  { label: "مطالبات", value: "۰ تومان", tone: "warning" },
  { label: "موجودی کم", value: "۰ کالا", tone: "danger" },
];

const navItems = [
  ["dashboard", "داشبورد", "⌂"],
  ["sales", "فروش", "▣"],
  ["purchases", "خرید", "⇩"],
  ["inventory", "موجودی", "▤"],
  ["people", "اشخاص", "♙"],
  ["reports", "گزارش‌ها", "◫"],
  ["more", "بیشتر", "⋯"],
] as const;

const app = document.querySelector<HTMLDivElement>("#app")!;

function render() {
  app.innerHTML = `
    <main class="shell">
      <header class="topbar">
        <div>
          <span class="eyebrow">مدیریت مالی و فروش</span>
          <h1>سایار</h1>
        </div>
        <button class="icon-button" aria-label="تنظیمات">⚙</button>
      </header>

      <section class="hero">
        <div>
          <p class="hero-kicker">امروز</p>
          <h2>وضعیت کسب‌وکار شما</h2>
          <p class="muted">همه‌چیز را سریع و ساده از یکجا کنترل کنید.</p>
        </div>
        <div class="hero-mark">س</div>
      </section>

      <section class="stats-grid">
        ${stats.map((stat) => `
          <article class="stat-card ${stat.tone ?? ""}">
            <span>${stat.label}</span>
            <strong>${stat.value}</strong>
          </article>
        `).join("")}
      </section>

      <section class="section">
        <div class="section-head">
          <h3>عملیات سریع</h3>
          <span class="muted">ثبت سریع</span>
        </div>
        <div class="quick-grid">
          <button class="quick-card" data-action="sale"><b>＋</b><span>ثبت فروش</span></button>
          <button class="quick-card" data-action="purchase"><b>⇩</b><span>ثبت خرید</span></button>
          <button class="quick-card" data-action="receive"><b>↙</b><span>دریافت وجه</span></button>
          <button class="quick-card" data-action="expense"><b>−</b><span>ثبت هزینه</span></button>
        </div>
      </section>

      <section class="section empty-panel">
        <div class="empty-icon">◌</div>
        <h3>هنوز تراکنشی ثبت نشده</h3>
        <p class="muted">اولین فروش، خرید یا دریافت وجه خود را ثبت کنید.</p>
      </section>

      <nav class="bottom-nav" aria-label="ناوبری اصلی">
        ${navItems.map(([id, label, icon], index) => `
          <button class="nav-item ${index === 0 ? "active" : ""}" data-nav="${id}">
            <span>${icon}</span><small>${label}</small>
          </button>
        `).join("")}
      </nav>
    </main>
  `;

  document.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.action;
      window.alert(`ماژول «${action}» در نسخه بعدی فعال می‌شود.`);
    });
  });
}

render();
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const state = { token: sessionStorage.getItem("stc_token") || "", user: null, role: "client", accountType: "client", isAdmin: false, dashboard: null, currentTab: "overview" };
const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
const money = (amount, currency = "NGN") => new Intl.NumberFormat("en-NG", { style:"currency", currency, maximumFractionDigits:2 }).format(Number(amount || 0));
const date = value => value ? new Date(value).toLocaleDateString("en-NG", { day:"numeric", month:"short", year:"numeric" }) : "—";
const toast = (message, error = false) => {
  const el = $("#toast"); el.textContent = message; el.classList.toggle("error", error); el.classList.add("show");
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove("show"), 3600);
};
async function api(url, options = {}) {
  const headers = { "Content-Type":"application/json", ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
function showPortal(show) {
  $("#publicSite").classList.toggle("hidden", show);
  $("#siteFooter").classList.toggle("hidden", show);
  $("#portal").classList.toggle("hidden", !show);
  window.scrollTo({ top:0, behavior:"instant" });
}
function openLogin() { $("#loginDialog").showModal(); }
function closeLogin() { $("#loginDialog").close(); }
$("#openLogin").addEventListener("click", openLogin);
$("#footerLogin").addEventListener("click", openLogin);
$("#closeLogin").addEventListener("click", closeLogin);
$("#mobileMenu").addEventListener("click", () => {
  const menu = $("#mainNav"), button = $("#mobileMenu");
  const open = menu.classList.toggle("open");
  button.setAttribute("aria-expanded", String(open));
  button.setAttribute("aria-label", open ? "Close menu" : "Toggle menu");
});
$$(".main-nav a").forEach(link => link.addEventListener("click", () => $("#mainNav").classList.remove("open")));
$("#year").textContent = new Date().getFullYear();

function initHomeVisuals() {
  const header = $("#siteHeader");
  const navLinks = Array.from(document.querySelectorAll(".main-nav a"));
  const updateHeader = () => {
    if (!header) return;
    const hash = location.hash || "#home";
    const isHome = !hash.startsWith("#page/") && !hash.startsWith("#service/");
    header.classList.toggle("is-home", isHome);
    header.classList.toggle("scrolled", !isHome || window.scrollY > 20);
    const activeHref = hash.startsWith("#service/") ? "#page/services" :
      hash.startsWith("#page/") ? "#page/" + hash.slice(6).split(/[/?]/)[0] : "#home";
    navLinks.forEach(link => link.classList.toggle("active", link.getAttribute("href") === activeHref));
  };
  window.addEventListener("scroll", updateHeader, { passive:true });
  window.addEventListener("hashchange", updateHeader);
  updateHeader();

  const slides = Array.from(document.querySelectorAll(".hero-slide"));
  const indicators = Array.from(document.querySelectorAll(".hero-indicator"));
  if (slides.length) {
    let current = Math.max(0, slides.findIndex(slide => slide.classList.contains("is-active")));
    const showSlide = index => {
      current = (index + slides.length) % slides.length;
      slides.forEach((slide,i) => slide.classList.toggle("is-active", i === current));
      indicators.forEach((button,i) => {
        const active = i === current;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", String(active));
      });
    };
    indicators.forEach(button => button.addEventListener("click", () => showSlide(Number(button.dataset.slideTo) || 0)));
    window.setInterval(() => showSlide(current + 1), 30000);
  }

  const counters = Array.from(document.querySelectorAll(".counter[data-count]"));
  const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finishCounter = node => {
    node.textContent = Number(node.dataset.count || 0).toLocaleString("en-NG") + (node.dataset.suffix || "");
  };
  if (reducedMotion || !("IntersectionObserver" in window)) {
    counters.forEach(finishCounter);
  } else {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const node = entry.target;
        observer.unobserve(node);
        const end = Number(node.dataset.count || 0), suffix = node.dataset.suffix || "";
        const duration = 1800, start = performance.now();
        const tick = now => {
          const progress = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          node.textContent = Math.floor(eased * end).toLocaleString("en-NG") + suffix;
          if (progress < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    }, { threshold:.3 });
    counters.forEach(node => observer.observe(node));
  }
}
initHomeVisuals();

function initScrollReveals() {
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const revealSelector = [
    "#publicSite > section:not(.hero)",
    "#publicSite .section-head",
    "#publicSite .service-card",
    "#publicSite .why-grid article",
    "#publicSite .testimonials-grid article",
    "#publicSite .stc-service-card",
    "#publicSite .portfolio-tile",
    "#publicSite .stc-training-benefit-grid article",
    "#publicSite .contact-detail",
    "#publicSite .lovable-about-team-card",
    "#publicSite .lovable-about-values-grid article",
    "#publicSite .lovable-about-award-grid figure"
  ].join(",");
  const reveal = () => {
    const nodes = document.querySelectorAll(revealSelector);
    if (reduceMotion || !("IntersectionObserver" in window)) {
      nodes.forEach(node => node.classList.add("stc-reveal-visible"));
      return;
    }
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("stc-reveal-visible");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -36px 0px" });
    nodes.forEach((node, index) => {
      if (node.dataset.stcRevealReady) return;
      node.dataset.stcRevealReady = "true";
      node.classList.add("stc-reveal");
      node.style.setProperty("--stc-reveal-delay", (Math.min(index % 4, 3) * 75) + "ms");
      observer.observe(node);
    });
  };
  reveal();
  const site = document.querySelector("#publicSite");
  if (site && "MutationObserver" in window) {
    let queued = false;
    const mutationObserver = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; reveal(); });
    });
    mutationObserver.observe(site, { childList: true, subtree: true });
  }
  window.addEventListener("hashchange", () => requestAnimationFrame(reveal));
}
initScrollReveals();

$("#requestCodeForm").addEventListener("submit", async event => {
  event.preventDefault();
  const email = $("#loginEmail").value.trim().toLowerCase();
  const status = $("#loginStatus"); status.textContent = "Sending your secure code…";
  try {
    const result = await api("/api/auth/request-code", { method:"POST", body:JSON.stringify({ email }) });
    $("#requestCodeForm").classList.add("hidden"); $("#verifyCodeForm").classList.remove("hidden");
    $("#loginTitle").innerHTML = "Check your<br><em>inbox.</em>";
    $("#loginHint").textContent = result.message; status.textContent = "";
    $("#loginCode").focus();
  } catch (error) { status.textContent = error.message; }
});
$("#changeEmail").addEventListener("click", () => {
  $("#verifyCodeForm").classList.add("hidden"); $("#requestCodeForm").classList.remove("hidden");
  $("#loginTitle").innerHTML = "Welcome to your<br><em>STC workspace.</em>";
  $("#loginHint").textContent = "Enter your email and we'll send you a secure six-digit sign-in code.";
  $("#loginStatus").textContent = "";
});
$("#verifyCodeForm").addEventListener("submit", async event => {
  event.preventDefault();
  const email = $("#loginEmail").value.trim().toLowerCase();
  const token = $("#loginCode").value.trim();
  $("#loginStatus").textContent = "Verifying your code…";
  try {
    const result = await api("/api/auth/verify-code", { method:"POST", body:JSON.stringify({ email, token }) });
    state.token = result.access_token; state.user = result.user; state.role = result.role; state.isAdmin = result.is_admin;
    sessionStorage.setItem("stc_token", state.token); closeLogin(); await enterPortal();
  } catch (error) { $("#loginStatus").textContent = error.message; }
});

$("#enquiryForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget; const button = $("button[type=submit]", form);
  const status = $("#enquiryStatus"); button.disabled = true; status.textContent = "Sending your enquiry…";
  try {
    const body = Object.fromEntries(new FormData(form));
    const result = await api("/api/enquiries", { method:"POST", body:JSON.stringify(body) });
    status.textContent = `${result.message} Reference: STC-${result.reference}`;
    form.reset(); toast("Your project enquiry has been submitted.");
  } catch (error) { status.textContent = error.message; toast(error.message, true); }
  finally { button.disabled = false; }
});

function renderSTCAnnouncements(posts = window.stcPosts || []) {
  const track = $("#stcAnnouncementTrack");
  if (!track) return;
  const cleanPosts = (Array.isArray(posts) ? posts : []).filter(post => post && post.title);
  const items = cleanPosts.length ? cleanPosts.slice(0, 12).map(post => ({ title: post.title, excerpt: post.excerpt || "" })) : [{ title: "Welcome to Stanley Tech Connect", excerpt: "Learn • Build • Create • Connect" }, { title: "Explore our services and practical technology training", excerpt: "" }];
  const markup = items.map(item => "<span class=\"stc-marquee-item\"><b>" + esc(item.title) + "</b>" + (item.excerpt ? "<small> — " + esc(item.excerpt) + "</small>" : "") + "</span><span class=\"stc-marquee-star\" aria-hidden=\"true\">✦</span>").join("");
  track.innerHTML = markup + markup;
  track.setAttribute("aria-label", cleanPosts.length ? "Latest published STC posts and announcements" : "STC welcome announcements");
}
function initSTCAnnouncementControls() {
  const bar = $("#stcAnnouncementBar"), toggle = $("#stcMarqueeToggle");
  if (!bar || !toggle) return;
  toggle.addEventListener("click", () => { const paused = bar.classList.toggle("is-paused"); toggle.textContent = paused ? "▶" : "Ⅱ"; toggle.setAttribute("aria-label", paused ? "Resume announcements" : "Pause announcements"); toggle.setAttribute("aria-pressed", String(paused)); });
}
function initSTCStockVideos() {
  const videos = [...document.querySelectorAll(".stc-stock-video")];
  if (!videos.length) return;
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  videos.forEach(video => { video.muted = true; video.playsInline = true; });
  if (reduceMotion || !("IntersectionObserver" in window)) return;
  const observer = new IntersectionObserver(entries => entries.forEach(entry => { const video = entry.target; if (entry.isIntersecting) { if (video.readyState === 0) video.load(); video.play().catch(() => {}); } else video.pause(); }), { threshold: 0.2 });
  videos.forEach(video => observer.observe(video));
}
initSTCAnnouncementControls();
async function refreshSTCAnnouncements() {
  if (document.visibilityState !== "visible") return;
  try {
    const result = await api("/api/public/posts");
    window.stcPosts = result.posts || [];
    renderSTCAnnouncements(window.stcPosts);
  } catch (error) { /* Keep the last successfully loaded announcements visible. */ }
}
window.setInterval(refreshSTCAnnouncements, 60000);
document.addEventListener("visibilitychange", refreshSTCAnnouncements);

initSTCStockVideos();

async function loadPublic() {
  const [services, portfolio, posts] = await Promise.allSettled([
    api("/api/public/services"), api("/api/public/portfolio"), api("/api/public/posts")
  ]);
  const fallbackServices = [
    { slug:"web-development", name:"Web Development" },
    { slug:"graphic-design", name:"Graphic Design" },
    { slug:"computer-training", name:"Computer Training" },
    { slug:"it-consulting", name:"IT Consulting" },
    { slug:"student-projects", name:"Student Project Support" },
    { slug:"computer-repairs", name:"Computer Repairs" }
  ];
  const serviceItems = services.status === "fulfilled" && services.value.services?.length
    ? services.value.services : fallbackServices;
  window.stcServices = serviceItems;
  window.stcPortfolio = portfolio.status === "fulfilled" ? portfolio.value.portfolio : [];
  window.stcPosts = posts.status === "fulfilled" ? posts.value.posts : [];
  window.stcGraduateGallery = graduates.status === "fulfilled" ? graduates.value.photos : [];
  renderSTCAnnouncements(window.stcPosts);
  if (typeof renderPageRoute === "function") renderPageRoute();
  if (typeof routePublicPage === "function") routePublicPage();
  const portfolioItems = portfolio.status === "fulfilled" ? portfolio.value.portfolio : [];
  const postItems = posts.status === "fulfilled" ? posts.value.posts : [];
  const servicePresentation = {
    "web-development": { description:"Beautiful, fast, mobile-friendly websites built with modern technology.", features:["Custom websites","E-commerce stores","Landing pages","Maintenance & hosting"] },
    "graphic-design": { description:"Eye-catching designs that elevate your brand and grab attention.", features:["Logo design","Flyers & banners","Brand identity","Social media graphics"] },
    "computer-training": { description:"Practical computer training: MS Office, Web Design, Programming and more.", features:["Basic computing","MS Office Suite","Web Design","Programming basics"] },
    "it-consulting": { description:"Strategic technology guidance for individuals, students and businesses.", features:["Tech strategy","Software recommendations","Network setup","Digital transformation"] },
    "student-projects": { description:"End-to-end project support: development, documentation and defense prep.", features:["System development","Documentation","Slides & defense prep","Source code support"] },
    "computer-repairs": { description:"Fast, reliable repairs to get you back up and running.", features:["Hardware diagnostics","Software fixes","Virus removal","Upgrades"] }
  };
  const icons = [
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8 21h8m-4-4v4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.4 5.6L20 11l-5.6 2.4L12 19l-2.4-5.6L4 11l5.6-2.4L12 3Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m2 9 10-5 10 5-10 5L2 9Zm4 2v5c3.5 3 8.5 3 12 0v-5M22 9v6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>',
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2 4 14h7l-1 8 10-12h-7l1-8Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.7 6.3a5 5 0 0 0-6.6 6.6L3 18l3 3 5.1-5.1a5 5 0 0 0 6.6-6.6L14 13l-3-3 3.7-3.7Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  ];
  $("#serviceGrid").innerHTML = serviceItems.map((item,i) => {
    const slug = item.slug || slugify(item.name);
    const details = servicePresentation[slug] || {};
    const features = details.features || [];
    const description = details.description || item.summary || item.description || "Practical technology solutions designed around your goals.";
    return `<a class="service-card service-link" href="#service/${esc(slug)}">
      <div class="service-icon-box">${icons[i%icons.length]}</div>
      <h3>${esc(item.name || slug.replace(/-/g," "))}</h3>
      <p>${esc(description)}</p>
      ${features.length ? `<ul class="service-features">${features.map(feature=>`<li>${esc(feature)}</li>`).join("")}</ul>` : ""}
      <span class="service-learn">Learn More <span aria-hidden="true">→</span></span>
    </a>`;
  }).join("");
  $("#portfolioGrid").innerHTML = portfolioItems.length ? portfolioItems.map((item,i) => `
    <article class="portfolio-card"><div class="portfolio-art"><span>${i===0?"✚":i===1?"▦":"✦"}</span></div><div class="portfolio-body">
    <small>${esc(item.category || "STC PROJECT")}</small><h3>${esc(item.title)}</h3><p>${esc(item.summary || item.details || "")}</p>
    ${item.url ? `<p><a class="text-arrow" href="${esc(item.url)}" target="_blank" rel="noreferrer">View project ↗</a></p>` : ""}</div></article>`).join("") : `<div class="loading-card">New projects will appear here as they are published.</div>`;
  $("#journalGrid").innerHTML = postItems.length ? postItems.slice(0,3).map(item => `
    <article class="journal-card"><small>${date(item.published_at)} · STC JOURNAL</small><h3>${esc(item.title)}</h3><p>${esc(item.excerpt || "")}</p></article>`).join("") : `<article class="journal-card"><small>COMING SOON</small><h3>Fresh thinking from STC</h3><p>Practical technology notes and project updates will appear here.</p></article>`;
}

const clientTabs = [
  ["overview","◫","Overview"],["training","🎓","My training"],["projects","▦","My projects"],["quotes","▤","Quotes"],["invoices","◈","Invoices & payments"],["support","✉","Support"],["credentials","🏅","ID & Certificates"],["security","🔐","Account security"],["profile","◎","My profile"]
];
const adminTabs = [
  ["overview","◫","Overview"],["enquiries","✉","Enquiries"],["projects","▦","Projects"],["quotes","▤","Quotes"],["invoices","◈","Invoices"],["payments","₦","Payment verification"],["payment-settings","⚙","Bank settings"],["enrollments","🎓","Student enrolments"],["certificates","📜","Certificates"],["awards","🏆","Awards"],["signature","✍","Electronic signature"],["tickets","◉","Support tickets"],["services","⌘","Services"],["portfolio","✦","Portfolio"],["posts","▤","Announcements & Posts"],["media","▧","Media library"],["staff","♙","Staff access"]
];
async function enterPortal() {
  try {
    const me = await api("/api/auth/me");
    state.user = me.user; state.role = me.role; state.accountType = me.profile?.account_type || "client"; state.isAdmin = me.is_admin || me.role !== "client";
    $("#userEmail").textContent = me.user.email; $("#userRole").textContent = state.role.replace("_"," ");
    $("#userAvatar").textContent = (me.profile?.full_name || me.user.email).slice(0,1).toUpperCase(); if(me.profile?.avatar_url) $("#userAvatar").style.backgroundImage = "url("+JSON.stringify(me.profile.avatar_url)+")";
    const tabs = state.isAdmin ? adminTabs : clientTabs;
    $("#portalNav").innerHTML = tabs.map(([id,icon,label]) => `<button data-tab="${id}" class="${id==="overview"?"active":""}">${icon} &nbsp; ${label}</button>`).join("");
    $$("#portalNav button").forEach(button => button.addEventListener("click", () => selectTab(button.dataset.tab)));
    showPortal(true); await selectTab("overview");
  } catch (error) {
    sessionStorage.removeItem("stc_token"); state.token = ""; state.user = null; showPortal(false); toast(error.message, true);
  }
}
async function selectTab(tab) {
  state.currentTab = tab;
  $$("#portalNav button").forEach(button => button.classList.toggle("active", button.dataset.tab === tab));
  const label = [...(state.isAdmin ? adminTabs : clientTabs)].find(item => item[0] === tab)?.[2] || "Workspace";
  $("#portalTitle").textContent = label; $("#portalKicker").textContent = state.isAdmin ? "STC MANAGEMENT CONSOLE" : "CLIENT WORKSPACE";
  $("#portalContent").innerHTML = `<div class="loading-card">Loading ${esc(label.toLowerCase())}…</div>`;
  try {
    if (state.isAdmin) await renderAdmin(tab); else await renderClient(tab);
  } catch (error) { $("#portalContent").innerHTML = `<div class="empty-state">${esc(error.message)}</div>`; }
}
function table(headers, rows) {
  if (!rows.length) return `<div class="empty-state">Nothing here yet. New records will appear when they are added.</div>`;
  return `<div class="table-wrap"><table class="data-table"><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}
function status(value) { return `<span class="status-pill ${esc(String(value||"").toLowerCase())}">${esc(value||"—")}</span>`; }
function panel(title, content, hint="") { return `<section class="panel"><div class="panel-head"><h3>${esc(title)}</h3><span>${esc(hint)}</span></div>${content}</section>`; }


function printCredential(item, kind="certificate") {
  const isAward=kind==="award";
  const title=esc(isAward?item.award_title:item.certificate_title||"Certificate of Completion");
  const recipient=esc(item.recipient_name||state.dashboard?.profile?.full_name||"STC Learner");
  const programme=esc(isAward?(item.award_type||"Achievement"):item.programme);
  const number=esc(isAward?item.award_number:item.certificate_number);
  const description=esc(item.description||"");
  const signer=esc(item.signer_name||"");
  const signerTitle=esc(item.signer_title||"");
  const signature=item.signature_url?'<img class="credential-signature" src="'+esc(item.signature_url)+'" alt="Electronic signature">':"";
  const verify=kind==="certificate"?'https://stanley-tech-connect.onrender.com/api/public/certificates/'+encodeURIComponent(item.certificate_number):"";
  const win=window.open("","_blank","noopener,noreferrer");
  if(!win){toast("Allow pop-ups to print or save your credential.",true);return;}
  win.document.write('<!doctype html><html><head><title>'+title+'</title><style>*{box-sizing:border-box}body{margin:0;background:#eef2f7;font-family:Georgia,serif;color:#17233c}.sheet{width:1100px;min-height:760px;margin:30px auto;padding:60px;border:16px double #0d2847;background:white;text-align:center;position:relative}.brand{font:700 22px Arial;color:#008fb8;letter-spacing:4px}.eyebrow{font:700 13px Arial;letter-spacing:5px;margin-top:35px;color:#6a7890}.sheet h1{font-size:48px;color:#0d2847;margin:18px 0}.sub{font:20px Arial;color:#53627a}.name{font-size:42px;font-weight:bold;border-bottom:2px solid #16bde0;display:inline-block;padding:10px 50px;margin:30px 0}.course{font:26px Arial;font-weight:bold;color:#0b8fb5;margin:20px}.description{font:18px Arial;max-width:800px;margin:18px auto;line-height:1.6}.bottom{display:flex;justify-content:space-between;align-items:end;margin-top:55px;font:14px Arial}.signature{min-width:260px}.credential-signature{height:65px;max-width:230px;object-fit:contain;display:block;margin:0 auto 5px}.line{border-top:1px solid #566;width:260px;margin:0 auto 8px}.number{font:12px Arial;color:#67748a;margin-top:25px}.verify{font:12px Arial;color:#0086aa;margin-top:5px}@media print{body{background:white}.sheet{margin:0;width:100%;min-height:100vh;page-break-after:avoid}}</style></head><body><main class="sheet"><div class="brand">STC · STANLEY TECH CONNECT</div><div class="eyebrow">'+(isAward?"RECOGNITION & EXCELLENCE":"OFFICIAL ACADEMIC CREDENTIAL")+'</div><h1>'+title+'</h1><div class="sub">This is proudly presented to</div><div class="name">'+recipient+'</div><div class="sub">'+(isAward?"In recognition of outstanding achievement":"For successfully completing")+'</div><div class="course">'+programme+'</div><div class="description">'+description+'</div><div class="bottom"><div>Issued: '+date(item.issued_at)+'</div><div class="signature">'+signature+'<div class="line"></div><b>'+signer+'</b><br>'+signerTitle+'</div><div>STC Official Record</div></div><div class="number">Credential No: '+number+'</div>'+(verify?'<div class="verify">Verify at: '+esc(verify)+'</div>':"")+'</main><script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>');
  win.document.close();
}
function printStudentCard(profile, avatarUrl) {
  const win=window.open("","_blank","noopener,noreferrer"); if(!win){toast("Allow pop-ups to print your ID card.",true);return;}
  const photo=avatarUrl?'<img src="'+esc(avatarUrl)+'">':'<div class="photo-placeholder">'+esc((profile.full_name||"S").slice(0,1).toUpperCase())+'</div>';
  win.document.write('<!doctype html><html><head><title>STC Student ID Card</title><style>*{box-sizing:border-box}body{font-family:Arial;background:#edf2f7;padding:35px}.card{width:540px;height:340px;background:linear-gradient(125deg,#101b36,#153f62);color:white;border-radius:18px;padding:25px;position:relative;overflow:hidden}.head{display:flex;align-items:center;gap:12px;border-bottom:1px solid #ffffff55;padding-bottom:14px}.logo{font-size:24px;font-weight:900;color:#1bd2f4}.head small{display:block;letter-spacing:2px;color:#b7e9f6}.body{display:flex;gap:22px;align-items:center;margin-top:24px}.body img,.photo-placeholder{width:115px;height:135px;object-fit:cover;border:3px solid white;border-radius:9px}.photo-placeholder{display:grid;place-items:center;background:#d8e9f2;color:#10213d;font-size:54px}.details h2{font-size:24px;margin:0 0 12px}.details p{margin:8px 0;color:#d4e8f4;font-size:13px}.id{margin-top:18px;color:#21d4f4;font-weight:bold;letter-spacing:1px}.foot{position:absolute;bottom:16px;right:24px;font-size:10px;color:#a9d6e5}@media print{body{padding:0;background:white}}</style></head><body><article class="card"><div class="head"><div class="logo">STC</div><div><b>STANLEY TECH CONNECT</b><small>STUDENT IDENTIFICATION CARD</small></div></div><div class="body">'+photo+'<div class="details"><h2>'+esc(profile.full_name||"Student")+'</h2><p>Institution: '+esc(profile.institution||"—")+'</p><p>Department: '+esc(profile.department||"—")+'</p><p>Level: '+esc(profile.study_level||"—")+'</p><div class="id">'+esc(profile.student_number||"STC STUDENT")+'</div></div></div><div class="foot">LEARN · BUILD · CREATE · CONNECT</div></article><script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>');
  win.document.close();
}

async function renderClient(tab) {
  const data = await api("/api/client/dashboard"); state.dashboard = data;
  if (tab === "signature") {
    if(state.role!=="super_admin") throw new Error("Only the CEO administrator can manage the official signature.");
    const r=await api("/api/admin/signature"),sig=r.signature||{};
    $("#portalContent").innerHTML=panel("Official STC electronic signature",'<p class="form-note">Draw your signature below with a mouse, stylus or finger. It will be embedded on official STC certificates and awards.</p><form id="signatureForm" class="portal-form"><label>Signatory name<input name="signer_name" required maxlength="120" value="'+esc(sig.signer_name||"")+'"></label><label>Official title<input name="signer_title" required maxlength="120" value="'+esc(sig.signer_title||"")+'"></label><div class="signature-pad-wrap full"><canvas id="signaturePad" width="720" height="220"></canvas><button type="button" class="action-btn" id="clearSignature">Clear signature</button></div><button class="btn btn-primary" type="submit">Save official signature</button></form>'+(r.signature_url?'<p class="form-note">Current signature on file</p><img class="signature-preview" src="'+esc(r.signature_url)+'" alt="Saved signature">':""));
    const canvas=$("#signaturePad"),ctx=canvas.getContext("2d");ctx.strokeStyle="#10213d";ctx.lineWidth=3;ctx.lineCap="round";let drawing=false,drawn=false;
    const pos=e=>{const rect=canvas.getBoundingClientRect();return{x:(e.clientX-rect.left)*canvas.width/rect.width,y:(e.clientY-rect.top)*canvas.height/rect.height};};
    canvas.addEventListener("pointerdown",e=>{drawing=true;drawn=true;canvas.setPointerCapture(e.pointerId);const p=pos(e);ctx.beginPath();ctx.moveTo(p.x,p.y);});
    canvas.addEventListener("pointermove",e=>{if(!drawing)return;const p=pos(e);ctx.lineTo(p.x,p.y);ctx.stroke();});
    ["pointerup","pointercancel","pointerleave"].forEach(n=>canvas.addEventListener(n,()=>drawing=false));
    $("#clearSignature").addEventListener("click",()=>{ctx.clearRect(0,0,canvas.width,canvas.height);drawn=false;});
    $("#signatureForm").addEventListener("submit",async e=>{e.preventDefault();if(!drawn){toast("Please draw your signature first.",true);return;}const values=Object.fromEntries(new FormData(e.currentTarget));try{await api("/api/admin/signature",{method:"PUT",body:JSON.stringify(values)});const saved=await api("/api/admin/signature/upload",{method:"POST",body:JSON.stringify({...values,base64:canvas.toDataURL("image/png")})});toast(saved.message);selectTab("signature");}catch(err){toast(err.message,true);}});
    return;
  }
  if (tab === "certificates") {
    if(state.role!=="super_admin") throw new Error("Only the CEO administrator can issue official certificates.");
    const [sr,cr]=await Promise.all([api("/api/admin/students"),api("/api/admin/certificates")]),students=sr.students||[],certs=cr.items||[];
    const studentOptions=students.map(x=>'<option value="'+esc(x.user_id)+'">'+esc(x.full_name||x.user_id)+' · '+esc(x.student_number||"No ID")+'</option>').join("");
    const completed=students.flatMap(x=>(x.enrollments||[]).filter(e=>e.status==="completed").map(e=>({...e,student_name:x.full_name})));
    const courseOptions=completed.map(x=>'<option value="'+x.id+'" data-user="'+esc(x.user_id)+'">'+esc(x.student_name)+' — '+esc(x.course_name)+'</option>').join("");
    const form='<form id="issueCertificateForm" class="portal-form"><label>Credential type<select name="certificate_type" id="certificateType"><option value="course">Course completion certificate</option><option value="service">Service completion certificate</option></select></label><label>Student / recipient<select name="user_id" id="certificateStudent" required><option value="">Choose student</option>'+studentOptions+'</select></label><label class="full" id="courseEnrollmentField">Completed course<select name="enrollment_id" id="certificateEnrollment"><option value="">Choose completed course</option>'+courseOptions+'</select></label><label>Certificate title<input name="certificate_title" value="Certificate of Completion" maxlength="160"></label><label>Course / service name<input name="programme" id="certificateProgramme" required maxlength="180"></label><label>Grade / achievement<input name="grade" maxlength="80" placeholder="e.g. Distinction"></label><label class="full">Certificate statement<textarea name="description" rows="3" maxlength="1000"></textarea></label><button class="btn btn-primary" type="submit">Issue signed certificate</button></form>';
    $("#portalContent").innerHTML=panel("Issue an STC certificate",form)+panel("Issued certificates",table(["NUMBER","RECIPIENT","PROGRAMME","TYPE","ISSUED","STATUS"],certs.map(x=>'<tr><td>'+esc(x.certificate_number)+'</td><td>'+esc(x.recipient_name)+'</td><td>'+esc(x.programme)+'</td><td>'+esc(x.certificate_type)+'</td><td>'+date(x.issued_at)+'</td><td>'+status(x.status)+'</td></tr>')));
    $("#certificateType").addEventListener("change",e=>{$("#courseEnrollmentField").classList.toggle("hidden",e.target.value!=="course");$("#certificateProgramme").placeholder=e.target.value==="service"?"Service delivered":"Course completed";});
    $("#certificateEnrollment").addEventListener("change",e=>{const o=e.target.selectedOptions[0];if(o?.dataset.user){$("#certificateStudent").value=o.dataset.user;$("#certificateProgramme").value=o.textContent.split(" — ").slice(1).join(" — ");}});
    $("#issueCertificateForm").addEventListener("submit",async e=>{e.preventDefault();const body=Object.fromEntries(new FormData(e.currentTarget));if(body.certificate_type==="course"){const o=$("#certificateEnrollment").selectedOptions[0];if(!o?.dataset.user){toast("Choose a completed course enrolment.",true);return;}body.user_id=o.dataset.user;body.enrollment_id=Number(body.enrollment_id);}else delete body.enrollment_id;try{const r=await api("/api/admin/certificates",{method:"POST",body:JSON.stringify(body)});toast(r.message);selectTab("certificates");}catch(err){toast(err.message,true);}});
    return;
  }
  if (tab === "awards") {
    if(state.role!=="super_admin") throw new Error("Only the CEO administrator can issue official awards.");
    const [sr,ar]=await Promise.all([api("/api/admin/students"),api("/api/admin/awards")]),students=sr.students||[],awards=ar.items||[];
    const options=students.map(x=>'<option value="'+esc(x.user_id)+'">'+esc(x.full_name||x.user_id)+' · '+esc(x.student_number||"No ID")+'</option>').join("");
    const form='<form id="issueAwardForm" class="portal-form"><label>Recipient<select name="user_id" required><option value="">Select student</option>'+options+'</select></label><label>Award category<input name="award_type" maxlength="100" value="Achievement"></label><label class="full">Award title<input name="award_title" required maxlength="180" placeholder="e.g. Best Graduating Student"></label><label class="full">Citation / reason<textarea name="description" rows="3" maxlength="1000"></textarea></label><button class="btn btn-primary" type="submit">Issue signed award</button></form>';
    $("#portalContent").innerHTML=panel("Present an STC award",form)+panel("Awards register",table(["AWARD NO.","RECIPIENT ID","AWARD","CATEGORY","ISSUED","STATUS"],awards.map(x=>'<tr><td>'+esc(x.award_number||"—")+'</td><td>'+esc(x.user_id)+'</td><td>'+esc(x.award_title)+'</td><td>'+esc(x.award_type)+'</td><td>'+date(x.issued_at)+'</td><td>'+status(x.status)+'</td></tr>')));
    $("#issueAwardForm").addEventListener("submit",async e=>{e.preventDefault();try{const r=await api("/api/admin/awards",{method:"POST",body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});toast(r.message);selectTab("awards");}catch(err){toast(err.message,true);}});
    return;
  }
  if (tab === "overview") {
    const totalDue = data.invoices.filter(x=>x.status!=="paid").reduce((n,x)=>n+Number(x.amount||0),0);
    $("#portalContent").innerHTML = `
      <div class="metric-grid"><div class="metric-card"><small>Active projects</small><b>${data.projects.length}</b></div><div class="metric-card"><small>Quotes received</small><b>${data.quotes.length}</b></div><div class="metric-card"><small>Open invoices</small><b>${data.invoices.filter(x=>x.status!=="paid").length}</b></div><div class="metric-card"><small>Outstanding balance</small><b>${money(totalDue)}</b></div></div>
      ${panel("Project progress", table(["PROJECT","SERVICE","PROGRESS","STATUS"],data.projects.map(x=>`<tr><td><b>${esc(x.title)}</b></td><td>${esc(x.service||"—")}</td><td>${Number(x.progress||0)}%</td><td>${status(x.status)}</td></tr>`)))}
      ${panel("Recent notifications", data.notifications.length?`<div class="list-stack">${data.notifications.slice(0,5).map(x=>`<div class="list-row"><div><b>${esc(x.title)}</b><small>${esc(x.body)} · ${date(x.created_at)}</small></div>${x.read_at?"":`<button class="action-btn" data-read="${x.id}">Mark read</button>`}</div>`).join("")}</div>`:`<div class="empty-state">You're all caught up.</div>`)}`;
    $$("[data-read]").forEach(button=>button.addEventListener("click",async()=>{await api(`/api/client/notifications/${button.dataset.read}/read`,{method:"PATCH"});selectTab("overview");}));
  } else if (tab === "training") {
    $("#portalContent").innerHTML = panel("My training programmes", table(["PROGRAMME","INSTITUTION","MODE","START DATE","STATUS"], (data.enrollments || []).map(x => "<tr><td><b>"+esc(x.course_name)+"</b></td><td>"+esc(x.institution||"—")+"</td><td>"+esc(x.mode)+"</td><td>"+date(x.start_date)+"</td><td>"+status(x.status)+"</td></tr>"))) + panel("Apply for training or SIWES / IT placement", '<form id="studentEnrollForm" class="portal-form"><label>Programme<select name="course_name" required><option value="">Select a programme</option><option>Web Development</option><option>Data Analysis</option><option>Virtual Assistant</option><option>Graphic Design</option><option>Computer Fundamentals</option><option>SIWES / Industrial Training (IT) Placement</option></select></label><label>Mode<select name="mode"><option>Online</option><option>Physical</option><option>Hybrid</option></select></label><label>Institution<input name="institution" maxlength="180"></label><label>Department / course of study<input name="department" maxlength="160"></label><label>Current level<input name="study_level" maxlength="80"></label><label>Duration<input name="placement_duration" placeholder="e.g. 3 months"></label><label>Preferred start date<input name="start_date" type="date"></label><button class="btn btn-primary" type="submit">Submit application</button></form>');
    $("#studentEnrollForm").addEventListener("submit", async event => { event.preventDefault(); try { const result = await api("/api/student/enrollments", {method:"POST", body:JSON.stringify(Object.fromEntries(new FormData(event.currentTarget)))}); toast(result.message); selectTab("training"); } catch(error) { toast(error.message,true); }});
  } else if (tab === "projects") {
    $("#portalContent").innerHTML = panel("Your projects", table(["PROJECT","SERVICE","STARTED","DUE","PROGRESS","STATUS"],data.projects.map(x=>`<tr><td><b>${esc(x.title)}</b><small>${esc(x.description||"")}</small></td><td>${esc(x.service||"—")}</td><td>${date(x.start_date)}</td><td>${date(x.due_date)}</td><td>${Number(x.progress||0)}%</td><td>${status(x.status)}</td></tr>`)));
  } else if (tab === "quotes") {
    $("#portalContent").innerHTML = panel("Your quotes", table(["REFERENCE","DESCRIPTION","AMOUNT","VALID UNTIL","STATUS"],data.quotes.map(x=>`<tr><td>${esc(x.reference)}</td><td><b>${esc(x.title)}</b><small>${esc(x.description||"")}</small></td><td>${money(x.amount,x.currency)}</td><td>${date(x.valid_until)}</td><td>${status(x.status)}</td></tr>`)));
  } else if (tab === "invoices") {
    const bankResult = await api("/api/public/payment-settings"); const bank=bankResult.settings||{};
    const invoiceRows=data.invoices.map(x=>"<tr><td>"+esc(x.reference)+"</td><td>"+esc(x.description)+"</td><td>"+money(x.amount,x.currency)+"</td><td>"+date(x.due_date)+"</td><td>"+status(x.status)+"</td><td>"+(x.status==="paid"?"—":'<button class="action-btn" data-pay="'+x.id+'">Pay online</button><button class="action-btn" data-bank-invoice="'+x.id+'">Transfer / Upload receipt</button>')+"</td></tr>");
    const bankHtml=bank.bank_name&&bank.account_name&&bank.account_number?("<div class=\"list-stack\"><div class=\"list-row\"><b>Bank</b><span>"+esc(bank.bank_name)+"</span></div><div class=\"list-row\"><b>Account name</b><span>"+esc(bank.account_name)+"</span></div><div class=\"list-row\"><b>Account number</b><strong>"+esc(bank.account_number)+"</strong></div><p>"+esc(bank.transfer_instructions||"Transfer the invoice amount and upload your receipt below.")+"</p></div>"):"<p>STC bank transfer details have not been published yet. Please use online payment or contact STC.</p>";
    $("#portalContent").innerHTML=panel("Invoices",table(["REFERENCE","DESCRIPTION","AMOUNT","DUE DATE","STATUS","ACTION"],invoiceRows))+panel("Bank transfer details",bankHtml)+panel("Payment history",table(["REFERENCE","AMOUNT","METHOD","DATE","STATUS","REFERENCE / NOTE"],data.payments.map(x=>"<tr><td>"+esc(x.reference)+"</td><td>"+money(x.amount,x.currency)+"</td><td>"+esc(x.method)+"</td><td>"+date(x.created_at)+"</td><td>"+status(x.status)+"</td><td>"+esc(x.rejection_reason||x.transaction_reference||"—")+"</td></tr>")))+'<div id="bankReceiptHost"></div>';
    $$("[data-pay]").forEach(button=>button.addEventListener("click",async()=>{button.disabled=true;try{const result=await api("/api/client/invoices/"+button.dataset.pay+"/pay",{method:"POST",body:"{}"});location.href=result.authorization_url;}catch(error){toast(error.message,true);button.disabled=false;}}));
    $$("[data-bank-invoice]").forEach(button=>button.addEventListener("click",()=>{const inv=data.invoices.find(x=>String(x.id)===button.dataset.bankInvoice);$("#bankReceiptHost").innerHTML=panel("Upload receipt for "+esc(inv.reference),'<form id="bankReceiptForm" class="portal-form"><label>Amount transferred (NGN)<input name="amount" type="number" min="1" step="0.01" required></label><label>Bank transaction reference<input name="transaction_reference" maxlength="120" required></label><label class="full">Receipt file (JPG, PNG, WEBP or PDF; max 5 MB)<input name="receipt" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required></label><button class="btn btn-primary" type="submit">Submit for verification</button></form>');
      $("#bankReceiptForm").addEventListener("submit",event=>{event.preventDefault();const form=event.currentTarget,file=form.elements.receipt.files[0];if(!file||file.size>5242880){toast("Receipt must be smaller than 5 MB.",true);return;}const reader=new FileReader();reader.onload=async()=>{try{const result=await api("/api/client/invoices/"+inv.id+"/bank-transfer",{method:"POST",body:JSON.stringify({amount:Number(form.elements.amount.value),transaction_reference:form.elements.transaction_reference.value,filename:file.name,content_type:file.type,receipt_base64:reader.result})});toast(result.message);selectTab("invoices");}catch(error){toast(error.message,true);}};reader.readAsDataURL(file);});}));
  } else if (tab === "support") {
    $("#portalContent").innerHTML = `${panel("Open a support ticket",`<form id="ticketForm" class="portal-form"><label>Subject<input name="subject" required maxlength="180" placeholder="How can we help?"></label><label>Priority<select name="priority"><option value="normal">Normal</option><option value="high">High</option><option value="low">Low</option></select></label><label class="full">Message<textarea name="message" required rows="3" maxlength="4000" placeholder="Describe the issue or request"></textarea></label><button class="btn btn-primary" type="submit">Create support ticket ↗</button></form>`)}${panel("Your support requests",table(["SUBJECT","CREATED","PRIORITY","STATUS",""],data.tickets.map(x=>`<tr><td><b>${esc(x.subject)}</b></td><td>${date(x.created_at)}</td><td>${status(x.priority)}</td><td>${status(x.status)}</td><td><button class="action-btn" data-thread="${x.id}">View conversation</button></td></tr>`)))}`;
    $("#ticketForm").addEventListener("submit",async event=>{event.preventDefault();const body=Object.fromEntries(new FormData(event.currentTarget));try{await api("/api/client/tickets",{method:"POST",body:JSON.stringify(body)});toast("Support ticket created.");selectTab("support");}catch(error){toast(error.message,true);}});
    $$("[data-thread]").forEach(button=>button.addEventListener("click",async()=>{const id=button.dataset.thread;const result=await api(`/api/client/tickets/${id}/messages`);const thread=result.messages.map(m=>`<div class="list-row"><div><b>${m.sender_user_id===state.user.id?"You":"STC Support"}</b><small>${esc(m.message)} · ${date(m.created_at)}</small></div></div>`).join("");$("#portalContent").insertAdjacentHTML("afterbegin",panel(`Ticket #${id}`,`<div class="list-stack">${thread}</div><form id="replyForm" class="portal-form"><label class="full">Reply<textarea name="message" rows="2" required></textarea></label><button class="btn btn-primary" type="submit">Send reply</button></form>`));$("#replyForm").addEventListener("submit",async event=>{event.preventDefault();try{await api(`/api/client/tickets/${id}/messages`,{method:"POST",body:JSON.stringify({message:new FormData(event.currentTarget).get("message")})});toast("Reply sent.");selectTab("support");}catch(error){toast(error.message,true);}});}));
  } else if (tab === "credentials") {
    const p=data.profile||{};
    const certificates=(data.certificates||[]).map(x=>'<div class="credential-item"><div><b>'+esc(x.certificate_title)+'</b><small>'+esc(x.programme)+' · '+date(x.issued_at)+' · '+esc(x.certificate_number)+'</small></div><button class="action-btn" data-print-cert="'+x.id+'">View / Print</button></div>').join("")||'<div class="empty-state">No certificates issued yet. Completed courses and approved services will appear here after STC issues your credential.</div>';
    const awards=(data.awards||[]).map(x=>'<div class="credential-item"><div><b>'+esc(x.award_title)+'</b><small>'+esc(x.award_type)+' · '+date(x.issued_at)+' · '+esc(x.award_number)+'</small></div><button class="action-btn" data-print-award="'+x.id+'">View / Print</button></div>').join("")||'<div class="empty-state">No awards have been issued to this account yet.</div>';
    $("#portalContent").innerHTML=(p.account_type==="student"?panel("Your STC Student ID Card",'<div class="student-id-preview"><div><b>STC · STUDENT ID</b><h3>'+esc(p.full_name||"Student")+'</h3><p>'+esc(p.student_number||"Student ID pending")+'</p><p>'+esc(p.institution||"")+' · '+esc(p.department||"")+'</p></div>'+(data.avatar_url?'<img src="'+esc(data.avatar_url)+'" alt="Student passport photo">':'<div class="photo-placeholder">STC</div>')+'</div><button class="btn btn-primary" id="printStudentCard">Print / Save ID Card</button>'):"")+panel("My Certificates",'<div class="credential-list">'+certificates+'</div>')+panel("My Awards & Recognition",'<div class="credential-list">'+awards+'</div>');
    $("#printStudentCard")?.addEventListener("click",()=>printStudentCard(p,data.avatar_url));
    $("[data-print-cert]").forEach(b=>b.addEventListener("click",()=>printCredential(data.certificates.find(x=>String(x.id)===b.dataset.printCert),"certificate")));
    $("[data-print-award]").forEach(b=>b.addEventListener("click",()=>printCredential(data.awards.find(x=>String(x.id)===b.dataset.printAward),"award")));
  } else if (tab === "security") {
    $("#portalContent").innerHTML=panel("Change your password",'<p class="form-note">You cannot view or retrieve an existing password. For your protection, you can set a new one or request a secure reset link.</p><form id="changePasswordForm" class="portal-form"><label>New password<input type="password" name="password" minlength="10" maxlength="128" autocomplete="new-password" required></label><label>Confirm new password<input type="password" name="confirm_password" minlength="10" maxlength="128" autocomplete="new-password" required></label><button class="btn btn-primary" type="submit">Update password</button></form>')+panel("Forgot your password?",'<form id="resetPasswordForm" class="portal-form"><label class="full">Account email<input name="email" type="email" required value="'+esc(state.user.email)+'"></label><button class="btn btn-outline-light" type="submit">Email me a secure reset link</button></form>');
    $("#changePasswordForm").addEventListener("submit",async e=>{e.preventDefault();const f=e.currentTarget;if(f.elements.password.value!==f.elements.confirm_password.value){toast("The passwords do not match.",true);return;}try{const r=await api("/api/auth/password/update",{method:"POST",body:JSON.stringify({password:f.elements.password.value})});toast(r.message);f.reset();}catch(err){toast(err.message,true);}});
    $("#resetPasswordForm").addEventListener("submit",async e=>{e.preventDefault();try{const r=await api("/api/auth/password/reset",{method:"POST",body:JSON.stringify({email:new FormData(e.currentTarget).get("email")})});toast(r.message);}catch(err){toast(err.message,true);}});
  } else if (tab === "profile") {
    const p=data.profile||{};
    const avatar=data.avatar_url?'<img class="profile-photo-preview" src="'+esc(data.avatar_url)+'" alt="Profile photo">':'<div class="profile-photo-placeholder">STC</div>';
    const html='<div class="profile-photo-block">'+avatar+'<form id="avatarForm"><label>Upload passport / profile photo<input name="avatar" type="file" accept="image/jpeg,image/png,image/webp" required></label><button class="btn btn-outline-light" type="submit">Upload / Change Photo</button></form></div><form id="profileForm" class="portal-form"><label>Account type<select name="account_type"><option value="client">Client account</option><option value="student">Student / Trainee / SIWES account</option></select></label><label>Full name<input name="full_name" required maxlength="120"></label><label>Phone<input name="phone" maxlength="40"></label><label>Institution<input name="institution" maxlength="180"></label><label>Department / Course of study<input name="department" maxlength="160"></label><label>Current level<input name="study_level" maxlength="80"></label><label>Company / organisation<input name="company" maxlength="160"></label><label class="full">Email address<input disabled value="'+esc(state.user.email)+'"></label>'+(p.student_number?'<p class="form-note">STC Student ID: <strong>'+esc(p.student_number)+'</strong></p>':'')+'<button class="btn btn-primary" type="submit">Save profile</button></form>';
    $("#portalContent").innerHTML=panel("Your profile",html);
    const form=$("#profileForm"); form.elements.account_type.value=p.account_type||"client"; form.elements.full_name.value=p.full_name||""; form.elements.phone.value=p.phone||""; form.elements.institution.value=p.institution||""; form.elements.department.value=p.department||""; form.elements.study_level.value=p.study_level||""; form.elements.company.value=p.company||"";
    form.addEventListener("submit",async e=>{e.preventDefault();try{await api("/api/account/profile",{method:"PATCH",body:JSON.stringify(Object.fromEntries(new FormData(form)))});toast("Profile saved.");enterPortal();}catch(err){toast(err.message,true);}});
    $("#avatarForm").addEventListener("submit",e=>{e.preventDefault();const file=e.currentTarget.elements.avatar.files[0];if(!file||file.size>3145728){toast("Choose a photo smaller than 3 MB.",true);return;}const reader=new FileReader();reader.onload=async()=>{try{const r=await api("/api/account/avatar",{method:"POST",body:JSON.stringify({content_type:file.type,base64:reader.result})});toast(r.message);selectTab("profile");}catch(err){toast(err.message,true);}};reader.readAsDataURL(file);});
  }
}

async function renderAdmin(tab) {
  if (tab === "payment-settings") {
    const result=await api("/api/admin/payment-settings"); const p=result.settings||{};
    const html='<p class="form-note">These details appear to signed-in students and clients when they view invoices. Keep blank until you are ready to publish them.</p><form id="bankSettingsForm" class="portal-form"><label>Bank name<input name="bank_name" maxlength="100" value="'+esc(p.bank_name||"")+'"></label><label>Account name<input name="account_name" maxlength="120" value="'+esc(p.account_name||"")+'"></label><label>Account number<input name="account_number" maxlength="10" pattern="[0-9]{10}" value="'+esc(p.account_number||"")+'"></label><label class="full">Transfer instructions<textarea name="transfer_instructions" maxlength="800">'+esc(p.transfer_instructions||"")+'</textarea></label><button class="btn btn-primary" type="submit">Save bank details</button></form>';
    $("#portalContent").innerHTML=panel("STC bank transfer settings",html);
    $("#bankSettingsForm").addEventListener("submit",async event=>{event.preventDefault();try{await api("/api/admin/payment-settings",{method:"PUT",body:JSON.stringify(Object.fromEntries(new FormData(event.currentTarget)))});toast("Bank details saved.");}catch(error){toast(error.message,true);}}); return;
  }
  if (tab === "overview") {
    const data = await api("/api/admin/dashboard");
    $("#portalContent").innerHTML = `<div class="metric-grid">${Object.entries(data.metrics).map(([key,value])=>`<div class="metric-card"><small>${esc(key)}</small><b>${value}</b></div>`).join("")}</div>
      ${panel("Latest enquiries",table(["CLIENT","SERVICE","RECEIVED","STATUS"],data.enquiries.map(x=>`<tr><td><b>${esc(x.name)}</b><small>${esc(x.email)}</small></td><td>${esc(x.service)}</td><td>${date(x.created_at)}</td><td>${status(x.status)}</td></tr>`)))}
      ${panel("Latest projects",table(["PROJECT","CLIENT ID","PROGRESS","STATUS"],data.projects.map(x=>`<tr><td><b>${esc(x.title)}</b></td><td>${esc(x.client_user_id)}</td><td>${x.progress||0}%</td><td>${status(x.status)}</td></tr>`)))}`;
  } else {
    const result = await api(`/api/admin/${tab}`); const items = result.items || [];
    const configs = {
      enquiries:["ID","CLIENT","EMAIL","SERVICE","MESSAGE","DATE","STATUS","ACTION"],
      projects:["ID","PROJECT","CLIENT USER ID","SERVICE","PROGRESS","STATUS","ACTION"],
      quotes:["ID","REFERENCE","TITLE","CLIENT USER ID","AMOUNT","STATUS","ACTION"],
      invoices:["ID","REFERENCE","DESCRIPTION","CLIENT USER ID","AMOUNT","DUE","STATUS","ACTION"],
      tickets:["ID","SUBJECT","CLIENT USER ID","PRIORITY","STATUS","DATE","ACTION"],
      services:["ID","SERVICE","SLUG","ACTIVE","ACTION"],
      portfolio:["ID","PROJECT","CATEGORY","FEATURED","ACTION"],
      posts:["ID","TITLE","STATUS","PUBLISHED","ACTION"],
      media:["ID","TITLE","CATEGORY","TYPE","PUBLISHED","ACTION"],
      staff:["USER ID","ROLE","ACTIVE","ACTION"],
      payments:["ID","REFERENCE","CLIENT USER ID","AMOUNT","METHOD","STATUS","DATE","ACTION"],
      enrollments:["ID","STUDENT USER ID","PROGRAMME","INSTITUTION","DEPARTMENT","STATUS","DATE","ACTION"]
    };
    const cols = configs[tab] || [];
    const rows = items.map(x=>{
      const cells = {
        enquiries:[x.id,x.name,x.email,x.service,x.message,date(x.created_at),status(x.status)],
        projects:[x.id,x.title,x.client_user_id,x.service,`${x.progress||0}%`,status(x.status)],
        quotes:[x.id,x.reference,x.title,x.client_user_id,money(x.amount,x.currency),status(x.status)],
        invoices:[x.id,x.reference,x.description,x.client_user_id,money(x.amount,x.currency),date(x.due_date),status(x.status)],
        tickets:[x.id,x.subject,x.client_user_id,status(x.priority),status(x.status),date(x.created_at)],
        services:[x.id,x.name,x.slug,x.active?"Yes":"No"],
        portfolio:[x.id,x.title,x.category,x.featured?"Yes":"No"],
        posts:[x.id,x.title,status(x.status),date(x.published_at)],
        media:[x.id,x.title,x.category,x.media_type,x.is_published?"Yes":"No"],
        staff:[x.user_id,x.role,x.is_active?"Yes":"No"],
        payments:[x.id,x.reference,x.client_user_id,money(x.amount,x.currency),x.method,status(x.status),date(x.created_at)],
        enrollments:[x.id,x.user_id,x.course_name,x.institution||"—",x.department||"—",status(x.status),date(x.created_at)]
      }[tab] || [];
      const actions = tab==="payments" && x.method==="bank_transfer" && x.status==="pending_verification" ? '<button class="action-btn" data-receipt="'+x.id+'">View receipt</button><button class="action-btn" data-review="'+x.id+'" data-decision="approve">Verify</button><button class="action-btn" data-review="'+x.id+'" data-decision="reject">Reject</button>' :
        tab==="enrollments" ? '<button class="action-btn" data-enrollment="'+x.id+'" data-status="approved">Approve</button><button class="action-btn" data-enrollment="'+x.id+'" data-status="active">Activate</button><button class="action-btn" data-enrollment="'+x.id+'" data-status="completed">Complete</button>' :
        tab==="enquiries" ? `<button class="action-btn" data-status="${x.id}" data-value="contacted">Mark contacted</button>` :
        tab==="tickets" ? `<button class="action-btn" data-status="${x.id}" data-value="in_progress">In progress</button><button class="action-btn" data-status="${x.id}" data-value="closed">Close</button>` :
        tab==="projects" ? `<button class="action-btn" data-status="${x.id}" data-value="in_progress">In progress</button><button class="action-btn" data-status="${x.id}" data-value="completed">Complete</button>` :
        tab==="staff" ? `<button class="action-btn" data-staff="${esc(x.user_id)}" data-active="${!x.is_active}">${x.is_active?"Deactivate":"Activate"}</button>` :
        tab==="posts" ? `<button class="action-btn" data-edit-post="${x.id}" data-title="${esc(x.title)}" data-excerpt="${esc(x.excerpt||"")}">Edit</button><button class="action-btn" data-publish="${x.id}" data-next-status="${x.status==="published"?"draft":"published"}">${x.status==="published"?"Unpublish":"Publish"}</button><button class="action-btn" data-delete-post="${x.id}">Remove</button>` : "—";
      return `<tr>${cells.map(c=>`<td>${typeof c==="string"&&c.startsWith("<span")?c:esc(c)}</td>`).join("")}<td>${actions}</td></tr>`;
    });
    const createButton = ["projects","quotes","invoices","services","portfolio","posts","staff"].includes(tab) ? '<button class="btn btn-primary" id="createRecord">+ Add '+esc(tab.slice(0,-1))+'</button>' : "";
    const graduateUpload = tab==="media" ? panel("Graduating students photo gallery",'<p class="form-note">Upload graduation, award-day and training celebration photos. Choose Graduating Students to publish them on the public gallery page.</p><form id="graduatePhotoForm" class="portal-form"><label>Photo title<input name="title" required maxlength="160"></label><label>Gallery category<select name="category"><option>Graduating Students</option><option>Training Moments</option><option>STC Events</option></select></label><label class="full">Caption / description<textarea name="description" rows="2" maxlength="600"></textarea></label><label class="full">Select photo<input name="photo" type="file" accept="image/jpeg,image/png,image/webp,image/gif" required></label><label><input type="checkbox" name="is_featured"> Feature this photo</label><button class="btn btn-primary" type="submit">Upload to public gallery</button></form>') : "";
    $("#portalContent").innerHTML = graduateUpload + panel(tab[0].toUpperCase()+tab.slice(1)+" management",createButton+table(cols,rows),items.length+" records · showing up to 100");
    if(tab==="media") $("#graduatePhotoForm").addEventListener("submit",e=>{e.preventDefault();const form=e.currentTarget,file=form.elements.photo.files[0];if(!file||file.size>8*1024*1024){toast("Choose an image smaller than 8 MB.",true);return;}const reader=new FileReader();reader.onload=async()=>{try{await api("/api/admin/media/upload",{method:"POST",body:JSON.stringify({title:form.elements.title.value,category:form.elements.category.value,description:form.elements.description.value,filename:file.name,content_type:file.type,base64:reader.result,is_featured:form.elements.is_featured.checked})});toast("Photo uploaded to the gallery.");selectTab("media");}catch(err){toast(err.message,true);}};reader.readAsDataURL(file);});
    $$("[data-status]").forEach(button=>button.addEventListener("click",async()=>{try{await api(`/api/admin/${tab}/${button.dataset.status}`,{method:"PATCH",body:JSON.stringify({status:button.dataset.value})});toast("Record updated.");selectTab(tab);}catch(error){toast(error.message,true);}}));
    $("[data-receipt]").forEach(button=>button.addEventListener("click",async()=>{try{const r=await api("/api/admin/payments/"+button.dataset.receipt+"/receipt");window.open(r.url,"_blank","noopener,noreferrer");}catch(error){toast(error.message,true);}}));
    $("[data-review]").forEach(button=>button.addEventListener("click",async()=>{let reason="";if(button.dataset.decision==="reject"){reason=prompt("Reason for rejecting this receipt:")||"";if(!reason.trim())return;}try{const r=await api("/api/admin/payments/"+button.dataset.review+"/verify",{method:"POST",body:JSON.stringify({decision:button.dataset.decision,rejection_reason:reason})});toast(r.message);selectTab("payments");}catch(error){toast(error.message,true);}}));
    $("[data-enrollment]").forEach(button=>button.addEventListener("click",async()=>{try{await api("/api/admin/enrollments/"+button.dataset.enrollment,{method:"PATCH",body:JSON.stringify({status:button.dataset.status})});toast("Student application updated.");selectTab("enrollments");}catch(error){toast(error.message,true);}}));
    $("#createRecord")?.addEventListener("click",()=>createAdminRecord(tab));
    $("[data-staff]").forEach(button=>button.addEventListener("click",async()=>{try{await api(`/api/admin/staff/${encodeURIComponent(button.dataset.staff)}`,{method:"PATCH",body:JSON.stringify({is_active:button.dataset.active==="true"})});toast("Staff access updated.");selectTab("staff");}catch(error){toast(error.message,true);}}));
    $("[data-publish]").forEach(button=>button.addEventListener("click",async()=>{try{const next=button.dataset.nextStatus;await api(`/api/admin/posts/${button.dataset.publish}`,{method:"PATCH",body:JSON.stringify({status:next,published_at:next==="published"?new Date().toISOString():null})});toast(next==="published"?"Announcement published to the website ticker.":"Post unpublished.");selectTab("posts");}catch(error){toast(error.message,true);}}));
  }
}
async function createAdminRecord(resource) {
  const ask = (label, placeholder="") => prompt(label, placeholder);
  let body = {};
  if (resource === "projects") {
    body.client_user_id=ask("Client Supabase user ID"); body.title=ask("Project title"); body.service=ask("Service"); body.description=ask("Project description")||""; body.status="pending"; body.progress=0;
  } else if (resource === "quotes") {
    body.client_user_id=ask("Client Supabase user ID"); body.reference=ask("Quote reference","STC-Q-001"); body.title=ask("Quote title"); body.description=ask("Description")||""; body.amount=Number(ask("Amount in NGN","0")); body.currency="NGN"; body.status="sent";
  } else if (resource === "invoices") {
    body.client_user_id=ask("Client Supabase user ID"); body.reference=ask("Invoice reference","STC-INV-001"); body.description=ask("Invoice description"); body.amount=Number(ask("Amount in NGN","0")); body.currency="NGN"; body.status="unpaid"; body.due_date=ask("Due date (YYYY-MM-DD)")||null;
  } else if (resource === "services") {
    body.name=ask("Service name"); body.slug=ask("URL slug (lowercase-hyphenated)"); body.summary=ask("Short summary"); body.description=ask("Full description")||""; body.active=true; body.sort_order=10;
  } else if (resource === "portfolio") {
    body.title=ask("Project title"); body.slug=ask("URL slug"); body.category=ask("Category"); body.summary=ask("Short summary"); body.details=ask("Project details")||""; body.featured=false;
  } else if (resource === "posts") {
    body.title=ask("Announcement / post title"); body.slug=ask("URL slug"); body.excerpt=ask("Short announcement text (this appears in the ticker)"); body.body=ask("Full post content (optional)")||body.excerpt; body.status=ask("Publish now? Type published or draft","published")||"draft"; if(!["published","draft"].includes(body.status)) body.status="draft"; if(body.status==="published") body.published_at=new Date().toISOString();
  } else if (resource === "staff") {
    body.user_id=ask("Supabase Auth user ID of the staff member");
    body.role=ask("Staff role: manager, project_manager, finance, support, or content_editor");
  }
  if (Object.values(body).some(value=>value===null||value===undefined||value==="") || (["quotes","invoices"].includes(resource)&&(!Number.isFinite(body.amount)||body.amount<=0))) {
    toast("Record creation cancelled or required details are missing.",true); return;
  }
  try { await api(`/api/admin/${resource}`,{method:"POST",body:JSON.stringify(body)}); toast("New record created."); selectTab(resource); }
  catch(error){toast(error.message,true);}
}

$("#logoutBtn").addEventListener("click",()=>{sessionStorage.removeItem("stc_token");state.token="";state.user=null;state.isAdmin=false;showPortal(false);toast("You have signed out.");});
$("#refreshPortal").addEventListener("click",()=>selectTab(state.currentTab));
(async()=>{
  await loadPublic();
  const payment = new URLSearchParams(location.search).get("payment");
  const reference = new URLSearchParams(location.search).get("reference");
  if (state.token) {
    await enterPortal();
    if (payment==="verify" && reference) {
      try { const result=await api(`/api/client/payments/verify?reference=${encodeURIComponent(reference)}`);toast(result.message);selectTab("invoices"); }
      catch(error){toast(error.message,true);}
      history.replaceState({}, "", "/");
    }
  }
})();

function slugify(value){return String(value||"service").toLowerCase().trim().replace(/&/g,"and").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");}
function renderServiceRoute(){
 const match=(location.hash||"").match(/^#service\/([^?]+)/);
 if(!match){$("#pageView").classList.add("hidden");$("#publicSite").classList.remove("hidden");$("#siteFooter").classList.remove("hidden");return;}
 const slug=decodeURIComponent(match[1]);
 const items=window.stcServices||[];
 const item=items.find(x=>slugify(x.slug||x.name)===slug);
 $("#publicSite").classList.add("hidden");$("#siteFooter").classList.add("hidden");$("#pageView").classList.remove("hidden");
 if(!item){$("#pageView").innerHTML='<section class="service-detail-hero"><div><a class="back-link" href="#services">← All services</a><h1>Service not found</h1></div></section>';return;}
 const name=esc(item.name), summary=esc(item.summary||item.description||"Practical technology solutions designed around your goals.");
 const details=esc(item.description||item.summary||"We work with you to understand the challenge, design a practical solution and deliver with care.");
 const points=["A solution shaped around your needs","Clear communication and delivery steps","Thoughtful design and reliable implementation","Support to help you move forward"];
 $("#pageView").innerHTML='<section class="service-detail-hero"><div class="detail-copy"><a class="back-link" href="#services">← All services</a><div class="eyebrow">STANLEY TECH CONNECT · OUR SERVICES</div><h1>'+name+'<br><em>made purposeful.</em></h1><p>'+summary+'</p><div class="hero-buttons"><a class="btn btn-primary btn-large" href="#contact">Discuss your project ↗</a><a class="btn btn-outline btn-large" href="#services">Explore other services</a></div></div><div class="detail-art"><div class="detail-art-orbit"></div><div class="detail-art-core">STC<span>✦</span></div><small>LEARN • BUILD • CREATE • CONNECT</small></div></section><section class="detail-content"><div><div class="eyebrow">THE STC DIFFERENCE</div><h2>Built around what<br><em>you need to achieve.</em></h2><p class="detail-lead">'+details+'</p></div><div class="detail-list"><h3>What you can expect</h3>'+points.map((p,i)=>'<div class="detail-list-row"><b>0'+(i+1)+'</b><span>'+p+'</span></div>').join("")+'</div></section><section class="detail-cta"><div><div class="eyebrow">LET’S GET STARTED</div><h2>Have a project<br><em>in mind?</em></h2><p>Tell us what you want to achieve. We’ll help you map out the next step.</p></div><a class="btn btn-primary btn-large" href="#contact">Start an enquiry ↗</a></section>';
 window.scrollTo({top:0,behavior:"instant"});
}

function renderPageRoute(){
 const m=(location.hash||"").match(/^#page\/([^?]+)/);if(!m){renderServiceRoute();return;}
 const page=decodeURIComponent(m[1]).toLowerCase();
 const services=window.stcServices||[];
 const catalogue=services.length?services:[
 {name:"Web Development",summary:"Professional website design & development",description:"Custom websites, e-commerce platforms, landing pages and ongoing website maintenance."},
 {name:"Graphic Design",summary:"Logos, flyers, branding & social media",description:"Creative visual designs that communicate your brand clearly and consistently."},
 {name:"Computer Training",summary:"Practical computer and digital skills",description:"Basic computing, Microsoft Office, web design and programming fundamentals."},
 {name:"IT Consulting",summary:"Technology guidance for people and businesses",description:"Tech strategy, software recommendations, network setup and digital transformation."},
 {name:"Student Project Support",summary:"ND/HND project guidance and development",description:"System development, documentation, presentation slides and project defence preparation."},
 {name:"Computer Repairs",summary:"Reliable computer troubleshooting and maintenance",description:"Hardware diagnostics, software fixes, virus removal and system upgrades."}];
 const courses=[["Basic Computer Training","4 weeks","Computer fundamentals, file management, internet use and everyday digital confidence."],["Microsoft Office Suite","6 weeks","Practical skills in Word, Excel, PowerPoint and productive office workflows."],["Web Development","12 weeks","Learn HTML, CSS, JavaScript and the foundations of building websites."],["Programming Basics","8 weeks","Build logical thinking and understand programming concepts through practice."],["Graphic Design","8 weeks","Explore design principles and create useful visual communication materials."],["Digital Skills / ICT","6 weeks","Develop confidence with essential digital tools and modern work practices."],["Data Analysis","8 weeks","Learn spreadsheets, data cleaning, analysis, dashboards and practical reporting using industry-relevant tools."],["Virtual Assistant Training","6 weeks","Build practical remote-work skills in email and calendar management, research, communication, task coordination and digital productivity."]];
 const head=(eyebrow,title,subtitle)=>'<header class="route-hero"><div class="eyebrow">'+eyebrow+'</div><h1>'+title+'</h1><p>'+subtitle+'</p></header>';
 const block=(html,cls="")=>'<section class="route-section '+cls+'">'+html+'</section>';
 const action=(title,copy,label)=>'<section class="route-cta"><h2>'+title+'</h2><p>'+copy+'</p><a class="btn btn-primary btn-large" href="#page/contact">'+label+' ↗</a></section>';
 const cards=catalogue.map((x,i)=>'<a class="service-card" href="#service/'+esc(x.slug||slugify(x.name))+'"><span class="service-index">0'+(i+1)+' / STC</span><h3>'+esc(x.name)+'</h3><p>'+esc(x.summary||x.description||"Practical technology solutions designed around your goals.")+'</p><span class="service-more">Explore service ↗</span></a>').join("");
 const pages={
 about:()=>{
 const team=[
 {name:"Vincent Stanley Azubuike",role:"Founder & Lead Instructor / CEO",img:"founder-ceo.png",initial:"V",bio:"Vincent founded Stanley Tech Connect with a single mission — to make modern technology skills accessible to every student, professional and business in his community and beyond. With years of hands-on experience in software development, IT consulting and academic project supervision, he leads the team's technical direction and personally mentors hundreds of students through web development, programming and project defense success. He also earned recognition for presenting his Automated Cataloguing System project for the Federal Polytechnic Ugep Library, a practical solution built to improve catalog access and academic resource management.",skills:["Full-Stack Development","IT Consulting","Project Supervision","Mentorship","Business Strategy","Library Systems"],gallery:["award-1.png","award-2.png","founder-coding.png","founder-portrait.png","founder-studio-1.png","founder-studio-2.png","founder-studio-3.png"]},
 {name:"Ugobo Patrick",role:"Tech Builder",img:"team-patrick.png",initial:"U",bio:"Patrick is a driven tech builder with a passion for creating impactful digital solutions. He brings strong problem-solving skills and a collaborative mindset to every project, helping the team deliver quality results for clients and students alike.",skills:["Software Development","Problem Solving","Team Collaboration","Tech Strategy"],gallery:[]},
 {name:"Vincent Favour Azubuike",role:"Tech Builder",img:"team-favour.png",initial:"V",bio:"Favour combines her background in healthcare with a growing passion for technology. She brings a unique perspective to the team, bridging the gap between tech solutions and real-world community impact. Her attention to detail and dedication make her a valuable asset to every project.",skills:["Tech & Healthcare","Community Impact","Attention to Detail","Project Support"],gallery:[]},
 {name:"Stanley Vincent",role:"Web Development Tutor",img:"team-webdev.png",initial:"S",bio:"Stanley leads our web development training programs, guiding students from fundamentals like HTML, CSS and JavaScript all the way through modern frameworks like React. He's known for breaking down complex topics into simple, practical lessons that students can apply on real projects from day one.",skills:["HTML & CSS","JavaScript","React","Responsive Design","Curriculum Design"],gallery:["training-lab.png","holographic-tech.png","flyer-project-defense.png"]},
 {name:"Stanley Azubuike",role:"Graphic Design Lead",img:"team-graphics.png",initial:"S",bio:"Stanley heads our creative studio — designing logos, brand identities, flyers and marketing collateral for clients across industries. He combines a sharp eye for visual storytelling with technical mastery of industry-standard design tools.",skills:["Brand Identity","Logo Design","Adobe Photoshop","Illustrator","Print & Digital"],gallery:["flyer-new-approach.png","flyer-project-defense.png"]},
 {name:"Nezziah Stanley",role:"Student Support Coordinator",img:"team-nezziah.jpg",initial:"N",bio:"Nezziah is the friendly first point of contact for every student who joins our programs. She handles registrations, schedules, course inquiries and ensures every learner has the support they need to succeed — from enrollment to graduation.",skills:["Student Onboarding","Course Coordination","Customer Support","Community Building"],gallery:[]},
 {name:"Akomaye Daniel Elijah",role:"Tech Builder",img:"team-daniel.png",initial:"A",bio:"Daniel is a talented and ambitious tech builder who brings energy and creativity to the team. With a sharp eye for detail and a commitment to continuous learning, he contributes to building innovative solutions and supporting the team's mission of empowering others through technology.",skills:["Software Development","Creative Problem Solving","Innovation","Team Support"],gallery:[]}
 ];
 window.stcAboutTeam=team;
 const founderTimeline=[
 ["2015","Started Coding Journey","Vincent began self-teaching programming and web development, laying the technical foundation that would shape everything to come."],
 ["2017","Founded Stanley Tech Connect","Launched a small training initiative in Cross River State to make tech skills accessible to local students and youth."],
 ["2019","Expanded Into Web & Design Services","Grew the brand into a full digital studio offering web development, branding and graphic design for businesses across Nigeria."],
 ["2022","Award-Winning Project Presentation","Earned recognition for presenting the Automated Cataloguing System for Federal Polytechnic Ugep Library — a practical solution improving catalog access."],
 ["2023","500+ Students Mentored","Crossed a major milestone — directly mentoring hundreds of students through training, project defense and IT consulting."],
 ["2025","Scaling Into IT Consulting","Expanding Stanley Tech Connect's reach into enterprise IT consulting, student project support and digital transformation."]
 ];
 const milestones=[
 ["2017","Founded","Stanley Tech Connect started as a small training initiative."],
 ["2019","Web Studio Launched","Began offering full web design and branding services."],
 ["2022","1,000 Students","Crossed 1,000 trained students across our programs."],
 ["2025","Going Bigger","Expanding into IT consulting and student project support."]
 ];
 const values=[
 ["✦","Innovation","We embrace new ideas and modern tools."],
 ["◈","Professionalism","Reliable, ethical and quality-driven service."],
 ["✧","Creativity","Fresh thinking that solves real problems."],
 ["♡","Reliability","We deliver on our promises, on time."]
 ];
 return head("ABOUT STANLEY TECH CONNECT","Empowering people with technology","Helping individuals, students and businesses grow using modern digital solutions.")+
 '<section class="lovable-about-story"><div class="lovable-about-container lovable-about-story-grid"><div class="lovable-about-story-photo"><span></span><img src="/assets/founder-coding.png" alt="Stanley Tech Connect founder working in the tech lab" loading="lazy"></div><div class="lovable-about-story-copy"><span class="lovable-about-eyebrow">OUR STORY</span><h2>Built to make tech <em>accessible to everyone</em></h2><p>Stanley Tech Connect was founded to bridge the gap between people and modern technology. We believe everyone deserves access to high-quality digital skills and trustworthy tech services — whether you\'re a student, a startup or an established business.</p><p>Today we serve clients across web development, design, training, IT consulting and project support — all driven by a single goal: helping you grow.</p></div></div></section>'+
 '<section class="lovable-about-founder"><div class="lovable-about-container"><div class="lovable-about-heading"><span class="lovable-about-eyebrow">MEET THE FOUNDER</span><h2>The vision behind Stanley Tech Connect</h2></div><div class="lovable-about-founder-grid"><div class="lovable-about-founder-photo"><span></span><img src="/assets/founder-ceo.png" alt="Vincent Stanley Azubuike — Founder and CEO of Stanley Tech Connect" loading="lazy"></div><div class="lovable-about-founder-copy"><span class="lovable-about-pill">FOUNDER & CEO</span><h3>Vincent Stanley Azubuike</h3><strong>Lead Instructor • Tech Educator • Entrepreneur</strong><div class="lovable-about-prose"><p>Vincent founded Stanley Tech Connect with a clear belief: <b>technology should empower everyone, not just a privileged few</b>. Growing up in Cross River State, he saw first-hand how limited access to quality tech education held back bright, ambitious students from reaching their full potential.</p><p>After years in software development and IT consulting, he built Stanley Tech Connect into a hub where students learn by doing — from writing their first line of code to defending their final-year projects with confidence. Today, hundreds of students and dozens of businesses across Nigeria trust him and his team for training, web development, design and project support.</p><p>When he\'s not teaching, Vincent is mentoring upcoming developers, supervising student research projects, and building digital products that solve real local problems.</p></div><div class="lovable-about-highlights"><div><span>♧</span><b>500+ Students Mentored</b></div><div><span>🏆</span><b>8+ Years in Tech</b></div><div><span>✦</span><b>100+ Projects Delivered</b></div></div><div class="lovable-about-actions"><a class="btn btn-primary" href="#page/contact">Get in Touch ↗</a><a class="btn btn-outline-light" href="https://wa.me/2347041145338" target="_blank" rel="noreferrer">Message on WhatsApp</a></div></div></div></div></section>'+
 '<section class="lovable-about-timeline"><div class="lovable-about-container lovable-about-narrow"><div class="lovable-about-heading"><span class="lovable-about-eyebrow">FOUNDER\'S JOURNEY</span><h2>Key milestones & achievements</h2><p>A look at the moments that shaped Vincent Stanley Azubuike\'s path as a developer, educator and entrepreneur.</p></div><ol class="lovable-about-timeline-list">'+founderTimeline.map((x,i)=>'<li class="'+(i%2===0?'left':'right')+'"><article><span class="lovable-about-year">'+x[0]+'</span><h3>'+x[1]+'</h3><p>'+x[2]+'</p></article></li>').join("")+'</ol></div></section>'+
 '<section class="lovable-about-awards"><div class="lovable-about-container"><div class="lovable-about-heading"><span class="lovable-about-eyebrow">RECOGNITION & ACHIEVEMENT</span><h2>Award-winning project presentation</h2><p>Vincent Stanley Azubuike earned recognition for presenting his <b>Automated Cataloguing System</b> for the Federal Polytechnic Ugep Library — a practical academic project designed to modernize catalog access, improve resource discovery and strengthen library operations.</p></div><div class="lovable-about-award-grid">'+["award-1.png","award-2.png","award-3.png","award-4.png"].map((img,i)=>'<figure><img src="/assets/'+img+'" alt="'+["Vincent receiving award materials during project presentation","Vincent being presented with award after the exhibition","Handshake moment after Vincent\'s project presentation","Vincent with presentation award package at the exhibition venue"][i]+'" loading="lazy"></figure>').join("")+'</div></div></section>'+
 '<section class="lovable-about-mission"><div class="lovable-about-container lovable-about-mission-grid"><article><span>◎</span><h3>Our Mission</h3><p>To empower people with technology skills and digital solutions that unlock new opportunities, careers and businesses.</p></article><article><span>◉</span><h3>Our Vision</h3><p>To become a trusted technology hub known for innovation, quality training and digital transformation across Africa.</p></article></div></section>'+
 '<section class="lovable-about-values"><div class="lovable-about-container"><div class="lovable-about-heading"><span class="lovable-about-eyebrow">OUR VALUES</span><h2>What guides our work</h2></div><div class="lovable-about-values-grid">'+values.map(x=>'<article><span>'+x[0]+'</span><h3>'+x[1]+'</h3><p>'+x[2]+'</p></article>').join("")+'</div></div></section>'+
 '<section class="lovable-about-team"><div class="lovable-about-container"><div class="lovable-about-heading"><span class="lovable-about-eyebrow">OUR TEAM</span><h2>Meet the people behind it</h2><p>Click any team member to learn more about them.</p></div><div class="lovable-about-team-grid">'+team.map((m,i)=>'<button type="button" class="lovable-about-team-card" data-about-member="'+i+'" aria-label="View profile of '+esc(m.name)+', '+esc(m.role)+'"><span class="lovable-about-team-image"><img src="/assets/'+m.img+'" alt="'+esc(m.name)+'" loading="lazy"><span class="lovable-about-view">View Profile →</span></span><b>'+esc(m.name)+'</b><small>'+esc(m.role)+'</small></button>').join("")+'</div></div></section>'+
 '<section class="lovable-about-milestones"><div class="lovable-about-container lovable-about-narrow"><div class="lovable-about-heading"><span class="lovable-about-eyebrow">MILESTONES</span><h2>Our journey so far</h2></div><ol class="lovable-about-milestone-list">'+milestones.map((m,i)=>'<li class="'+(i%2===0?'left':'right')+'"><article><span class="lovable-about-year">'+m[0]+'</span><h3>'+m[1]+'</h3><p>'+m[2]+'</p></article></li>').join("")+'</ol></div></section>'+
 '<div id="aboutTeamModal" class="lovable-about-modal hidden" role="dialog" aria-modal="true" aria-label="Team member profile"><div class="lovable-about-modal-panel"><button type="button" id="aboutTeamClose" class="lovable-about-modal-close" aria-label="Close profile">×</button><div id="aboutTeamModalContent"></div></div></div>';
 }, services:()=>{
 const serviceVisuals=[
  {category:"Digital",image:"https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=1000&q=85",tag:"01 · DIGITAL PRESENCE",features:["Custom websites","E-commerce stores","Landing pages","Website maintenance"]},
  {category:"Creative",image:"https://images.unsplash.com/photo-1541701494587-cb58502866ab?auto=format&fit=crop&w=1000&q=85",tag:"02 · BRAND EXPERIENCE",features:["Logo design","Flyers & banners","Brand identity","Social media graphics"]},
  {category:"Learning",image:"https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1000&q=85",tag:"03 · SKILLS & GROWTH",features:["Basic computing","Microsoft Office","Web development","Programming basics"]},
  {category:"Business",image:"https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1000&q=85",tag:"04 · SMARTER TECHNOLOGY",features:["Tech strategy","Software guidance","Network setup","Digital transformation"]},
  {category:"Learning",image:"https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1000&q=85",tag:"05 · PROJECT DEVELOPMENT",features:["System development","Documentation","Presentation slides","Defence preparation"]},
  {category:"Support",image:"https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?auto=format&fit=crop&w=1000&q=85",tag:"06 · TECHNICAL SUPPORT",features:["Hardware diagnostics","Software troubleshooting","System security","Upgrades & maintenance"]}
 ];
 const descriptions={
  "Web Development":"Beautiful, fast, mobile-friendly websites built to help your organisation grow and convert visitors into customers.",
  "Graphic Design":"Distinctive visual identities and marketing designs that make your brand recognisable and memorable.",
  "Computer Training":"Practical, instructor-guided digital skills training for beginners, students and working professionals.",
  "IT Consulting":"Clear technology advice and implementation support to help individuals and organisations work smarter.",
  "Student Project Support":"Structured guidance for ND/HND projects, from selecting a practical idea to development and presentation.",
  "Computer Repairs":"Dependable computer diagnostics, troubleshooting and maintenance to keep your devices working.",
  "Data Analysis Training":"Practical training in spreadsheet analysis, data cleaning, visualisation, dashboards and reporting.",
  "Virtual Assistant Training":"Practical remote-work training covering email, calendars, research, customer support and task management.",
  "SIWES / IT Placement":"We welcome eligible students seeking SIWES or Industrial Training placement to gain practical exposure, mentorship and workplace experience."
 };
 const extendedCatalogue=[...catalogue,...[{name:"Data Analysis Training",slug:"data-analysis-training",summary:"Practical data analysis, spreadsheet skills, reporting and dashboards."},{name:"Virtual Assistant Training",slug:"virtual-assistant-training",summary:"Learn remote administrative support, communication, research and productivity tools."},{name:"SIWES / IT Placement",slug:"siwes-it-placement",summary:"Structured practical technology exposure and supervised workplace learning for eligible students."}].filter(extra=>!catalogue.some(item=>slugify(item.name)===extra.slug))];
 const serviceCards=extendedCatalogue.map((x,i)=>{
  const visual=serviceVisuals[i%serviceVisuals.length];
  const title=esc(x.name);
  const slug=esc(x.slug||slugify(x.name));
  const summary=esc(x.summary||descriptions[x.name]||x.description||"Practical technology solutions designed around your goals.");
  const points=visual.features.map(f=>'<li><span>✓</span>'+f+'</li>').join("");
  return '<article class="stc-service-card" data-category="'+visual.category+'" data-service-search="'+(title+" "+summary+" "+visual.features.join(" ")).toLowerCase()+'"><a class="stc-service-image" href="#service/'+slug+'" aria-label="Explore '+title+'"><img src="'+visual.image+'" alt="'+title+' service at Stanley Tech Connect" loading="lazy"><span>'+visual.tag+'</span><b>↗</b></a><div class="stc-service-card-body"><div class="stc-service-card-top"><span class="stc-service-number">0'+(i+1)+'</span><span class="stc-service-category">'+visual.category+'</span></div><h3>'+title+'</h3><p>'+summary+'</p><ul>'+points+'</ul><a class="stc-service-link" href="#service/'+slug+'">Explore service <span>↗</span></a></div></article>';
 }).join("");
 return head("OUR SERVICES","Solutions tailored for you","From websites and design to training and IT consulting — we have you covered.")+
 block('<div class="stc-services-intro"><div><span class="eyebrow">WHAT WE DO</span><h2>Technology that moves<br><em>your ideas forward.</em></h2></div><p>Whether you are building a brand, improving your operations, learning a new skill or solving a technical challenge, STC brings practical expertise and personal support to every step.</p></div><div class="stc-services-toolbar"><div class="stc-service-filters">'+["All","Digital","Creative","Learning","Business","Support"].map((x,i)=>'<button class="filter-chip '+(i===0?'active':'')+'" data-filter="'+x+'">'+x+'</button>').join("")+'</div><label class="stc-service-search"><span>⌕</span><input id="serviceSearch" type="search" placeholder="Search our services..." aria-label="Search services"></label></div><div class="stc-services-grid">'+serviceCards+'</div><p class="stc-services-empty hidden" id="servicesEmpty">No services match that search. Try another keyword or category.</p>')+
 block('<div class="stc-services-process-heading"><span class="eyebrow">HOW WE WORK</span><h2>A clear path from idea<br><em>to real results.</em></h2><p>We keep the process simple, collaborative and focused on what you need.</p></div><div class="stc-services-process-grid"><article><b>01</b><span>◉</span><h3>Discover</h3><p>We listen, ask the right questions and understand your goals, audience and challenges.</p></article><article><b>02</b><span>⌘</span><h3>Plan & Create</h3><p>We recommend the right approach, agree on the scope and build a solution around you.</p></article><article><b>03</b><span>↗</span><h3>Deliver & Support</h3><p>We share the outcome, guide you through it and help you take the next step with confidence.</p></article></div>','soft-section')+
 block('<div class="stc-services-why"><div><span class="eyebrow">THE STC DIFFERENCE</span><h2>More than a service.<br><em>A technology partner.</em></h2><p>We combine practical skills, clear communication and a people-first approach to make technology easier to use and more valuable to your work.</p><a class="btn btn-primary" href="#page/about">Get to know STC ↗</a></div><div class="stc-services-benefits"><div><b>✦</b><span><strong>Practical solutions</strong><small>Built around real needs, not unnecessary complexity.</small></span></div><div><b>◎</b><span><strong>Personal support</strong><small>Clear guidance and communication from start to finish.</small></span></div><div><b>◈</b><span><strong>Modern approach</strong><small>Thoughtful use of current tools and technology.</small></span></div><div><b>✓</b><span><strong>Quality focused</strong><small>Careful attention to detail and reliable delivery.</small></span></div></div></div>')+
 block('<div class="stc-services-faq"><div class="stc-services-process-heading"><span class="eyebrow">QUICK ANSWERS</span><h2>Frequently asked<br><em>questions.</em></h2></div><div class="stc-services-faq-list"><details><summary>How do I get started with a service?<span>＋</span></summary><p>Choose the service that fits your needs and select “Request a Quote”. Tell us a little about your goals and our team will follow up to discuss the next steps.</p></details><details><summary>Can I request a customised solution?<span>＋</span></summary><p>Yes. We can tailor our approach to your organisation, project requirements, learning goals and budget.</p></details><details><summary>Do you provide support after delivery?<span>＋</span></summary><p>Yes. Support and maintenance options can be discussed based on the service and scope of your project.</p></details><details><summary>Can I combine more than one service?<span>＋</span></summary><p>Absolutely. For example, a business may need a website, branding and staff training. Tell us what you have in mind and we can plan it together.</p></details></div></div>')+
 '<section class="route-cta route-cta-centered"><h2>Have a project in mind?</h2><p>Tell us what you need — we’ll respond with a tailored plan and quote.</p><a class="btn btn-primary btn-large" href="#page/contact">Request a Quote ↗</a></section>';
},
 portfolio:()=>head("PORTFOLIO","A look at our work","Websites, graphic designs, student projects and training moments — explore what we’ve delivered.")+
 block('<div class="stc-portfolio-intro"><div><span class="eyebrow">OUR SELECTED WORK</span><h2>Ideas transformed into<br><em>digital experiences.</em></h2></div><p>Explore a selection of creative work, practical training moments and technology projects from Stanley Tech Connect.</p></div><div class="portfolio-filters">'+["All","Web Design","Graphics","Training","Projects"].map((x,i)=>'<button class="filter-chip '+(i===0?'active':'')+'" data-filter="'+x+'">'+x+'</button>').join("")+'</div><label class="stc-portfolio-search">⌕ <input id="portfolioSearch" type="search" placeholder="Search projects..." aria-label="Search portfolio"></label><div class="portfolio-showcase">'+[["Real Estate Website","Web Design","🏠","A responsive website experience designed to present property listings."],["Project Defense Flyer","Graphics","🎓","Promotional flyer for our student project defense support service."],["Coding Bootcamp","Training","💻","Live coding session at our fully-equipped Stanley Tech Connect training lab."],["Hospital Mgmt System","Projects","🏥","A digital hospital management solution concept."],["E-commerce Store","Web Design","🛒","An online shopping experience with product discovery and a clear purchase journey."],["New Approach Brochure","Graphics","📰","Marketing brochure showcasing our project assistance approach."],["Hands-on Programming Class","Training","👨‍💻","One-on-one mentoring with our lead instructor in the tech lab."],["Automated Cataloguing System","Projects","📚","A library management and cataloguing project developed for Federal Polytechnic Ugep to improve academic resource access and catalog operations."],["Portfolio Landing","Web Design","🌐","A modern portfolio landing page concept."],["Tech Visualization","Graphics","✨","Custom tech visualization graphic for branding use."],["Federal Polytechnic Ugep Library UI","Projects","🗂️","Interface preview of the Automated Cataloguing System built for the Federal Polytechnic Ugep Library."],["Logo Pack — Tech Co.","Graphics","🎨","A collection of visual identity concepts and logo designs."]].map((x,i)=>'<button class="portfolio-tile tile-'+(i%6)+'" style="background-image:linear-gradient(0deg,rgba(3,15,36,.92),rgba(3,15,36,.08) 78%),url(/assets/'+["https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1100&q=85","flyer-project-defense.png","training-lab.png","https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=1100&q=85","https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=1100&q=85","flyer-new-approach.png","founder-coding.png","project-library.png","https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1100&q=85","holographic-tech.png","project-library.png","https://images.unsplash.com/photo-1634942536790-2534db4a7e7b?auto=format&fit=crop&w=1100&q=85"][i]+')" data-category="'+x[1]+'" data-title="'+esc(x[0])+'" data-description="'+esc(x[3])+'"><span class="portfolio-emoji">'+x[2]+'</span><span class="portfolio-meta">'+x[1]+'</span><b>'+x[0]+'</b></button>').join("")+'</div><div class="portfolio-modal hidden" id="portfolioModal" role="dialog" aria-modal="true"><button class="modal-close" id="closePortfolioModal">×</button><span class="eyebrow" id="modalCategory"></span><h2 id="modalTitle"></h2><p id="modalDescription"></p></div>')+
 action("Have a project of your own?","Let’s turn your idea into something useful and memorable.","Start a Project"),
 training:()=>head("TRAINING PROGRAMS","Learn the skills the future needs","Practical, hands-on courses for every level — taught by experienced instructors.")+
 block('<div class="stc-training-hero"><img src="https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1300&q=85" alt="Students learning together" loading="lazy"><div><span class="eyebrow">LEARN BY DOING</span><h2>Practical skills.<br><em>Real opportunities.</em></h2><p>Build confidence through guided, hands-on learning, practical assignments and supportive instruction.</p></div></div><div class="page-heading"><span class="eyebrow">OUR COURSES</span><h2>What you can learn</h2><p>Choose any course below and register using the form.</p></div><div class="training-feature"><img src="/assets/training-lab.png" alt="Stanley Tech Connect practical training lab" loading="lazy"><div><span class="eyebrow">LEARN BY DOING</span><h2>Practical skills. Real projects.</h2><p>Build confidence through guided, hands-on learning in a supportive technology environment.</p></div></div><div class="stc-training-benefit-grid"><article><b>01</b><h3>Hands-on learning</h3><p>Practice with guided exercises and real-world tasks.</p></article><article><b>02</b><h3>Supportive guidance</h3><p>Ask questions and get help as you build your skills.</p></article><article><b>03</b><h3>Project-based practice</h3><p>Apply what you learn through practical assignments.</p></article></div><div class="stc-placement-callout"><div><span class="eyebrow">STUDENTS & GRADUATES</span><h2>SIWES &amp; IT placement opportunities</h2><p>Stanley Tech Connect welcomes eligible students seeking Students Industrial Work Experience Scheme (SIWES) or Industrial Training (IT) placement. Get practical exposure, guided learning and an opportunity to develop workplace-ready technology skills. Placement availability, duration and requirements are discussed during application.</p><a class="btn btn-primary" href="#trainingApplyForm">Apply for placement ↗</a></div><div class="stc-placement-points"><span>✓ Practical exposure</span><span>✓ Mentorship and guidance</span><span>✓ Technology-focused learning</span><span>✓ Student-friendly environment</span></div></div><div class="course-grid">'+courses.map((c,i)=>'<article class="course-card"><div class="course-icon">'+["▣","▤","⌘","{ }","✎","◎"][i]+'</div><div><h3>'+c[0]+'</h3><p>'+c[1]+' · Beginner friendly</p><small>'+c[2]+'</small></div></article>').join("")+'</div>')+
 block('<div class="page-heading"><span class="eyebrow">REGISTER NOW</span><h2>Register for Training</h2><p>Fill in the form — your application is delivered instantly via WhatsApp and email.</p></div><form id="trainingApplyForm" class="route-form"><div class="form-grid"><label>Full Name *<input name="name" required minlength="2" placeholder="John Doe"></label><label>Phone / WhatsApp *<input name="phone" required minlength="7" placeholder="08012345678"></label></div><label>Email Address *<input name="email" type="email" required placeholder="you@example.com"></label><div class="form-grid"><label>Course / Programme Interested In *<select name="course" required><option value="">Choose a course or placement</option><option>SIWES / Industrial Training (IT) Placement</option>'+courses.map(c=>'<option>'+c[0]+'</option>').join("")+'</select></label><label>Preferred Start Date *<input name="startDate" type="date" required></label></div><fieldset><legend>Mode of Training *</legend><label class="radio-option"><input type="radio" name="mode" value="Physical Class" checked> Physical Class</label><label class="radio-option"><input type="radio" name="mode" value="Online Class"> Online Class</label></fieldset><div class="form-grid"><label>School / Institution<input name="institution" placeholder="Your school or institution"></label><label>Course of Study / Department<input name="study" placeholder="e.g. Computer Science"></label></div><div class="form-grid"><label>Placement Duration (if applicable)<input name="duration" placeholder="e.g. 3 months / 6 months"></label><label>Current Level (if applicable)<input name="level" placeholder="e.g. ND II / HND I"></label></div><label>Additional Message / Questions<textarea name="message" rows="4" placeholder="For SIWES/IT, include your school requirements or placement letter details if available."></textarea></label><button class="btn btn-primary btn-large" type="submit">Apply Now ↗</button><p class="form-note">By submitting, your details will be sent via WhatsApp to 07041145338 and emailed to stanleytechconnect@gmail.com.</p><p id="trainingStatus" class="form-status"></p></form>','soft-section')+
 action("Ready to start learning?","Contact us with the course you are interested in and your preferred learning mode.","Enquire about training"),
 contact:()=>head("CONTACT","Let’s talk about your project","Reach out via the form, WhatsApp, phone or email — we typically respond within hours.")+
 block('<div class="stc-contact-intro"><div><span class="eyebrow">WE’RE HERE TO HELP</span><h2>Let’s make your<br><em>next idea happen.</em></h2><p>Have a question, a project idea or need help choosing the right service? Our team is happy to assist.</p></div><img src="https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=1200&q=85" alt="Team collaborating on a project" loading="lazy"></div><div class="contact-layout"><div class="contact-details"><a class="contact-info-card" href="tel:+2347041145338"><span>☎</span><div><small>CALL US</small><b>07041145338</b></div></a><a class="contact-info-card" href="mailto:stanleytechconnect@gmail.com"><span>✉</span><div><small>EMAIL</small><b>stanleytechconnect@gmail.com</b></div></a><div class="contact-info-card"><span>⌖</span><div><small>HEAD OFFICE</small><b>No. 17 Hon. Dr. Alex Egbona Road, Agbara Ekureku, Abi Local Government Area, Cross River State</b></div></div><div class="contact-info-card"><span>⌖</span><div><small>BRANCH OFFICE</small><b>John Ifere Street, Ntankpo Close, Federal Polytechnic Ugep, Cross River State</b></div></div><a class="whatsapp-card" href="https://wa.me/2347041145338" target="_blank">◉ <span><b>Chat on WhatsApp</b><small>Fastest way to reach us</small></span></a><div class="social-card"><b>Follow Us</b><div><a href="https://www.instagram.com/stanleytechconnect" target="_blank">Instagram</a><a href="mailto:stanleytechconnect@gmail.com">Email</a></div></div></div><form id="stcContactRouteForm" class="route-form"><h2>Send us a message</h2><p>All fields marked with * are required.</p><div class="form-grid"><label>Full Name *<input name="name" required placeholder="Your name"></label><label>Email *<input name="email" type="email" required placeholder="you@example.com"></label></div><div class="form-grid"><label>Phone *<input name="phone" type="tel" required placeholder="08012345678"></label><label>Subject *<input name="subject" required placeholder="What is it about?"></label></div><label>Message *<textarea name="message" required minlength="5" rows="5" placeholder="Tell us a bit about your needs..."></textarea></label><button class="btn btn-primary btn-large" type="submit">Send Message ↗</button><p class="form-note">Your message will open in WhatsApp and your email app for delivery.</p><p id="contactRouteStatus" class="form-status"></p></form></div>')+
 '<section class="route-section map-section"><iframe title="Our location — Cross River State" src="https://www.google.com/maps?q=Federal+Polytechnic+Ugep+Cross+River+State+Nigeria&output=embed" width="100%" height="400" loading="lazy"></iframe></section>'
 };
 if(!pages[page]){location.hash="#page/services";return;}
 $("#publicSite").classList.add("hidden");$("#pageView").classList.remove("hidden");
 $("#pageView").innerHTML=pages[page]();$("#siteFooter").classList.remove("hidden");
 if(page==="about"){
  const team=window.stcAboutTeam||[];
  const modal=$("#aboutTeamModal"), content=$("#aboutTeamModalContent");
  const close=()=>{modal?.classList.add("hidden");document.body.classList.remove("about-modal-open");};
  $("#pageView [data-about-member]").forEach(card=>card.addEventListener("click",()=>{
   const m=team[Number(card.dataset.aboutMember)];if(!m||!modal||!content)return;
   const gallery=(m.gallery||[]).map((img,i)=>'<figure><img src="/assets/'+img+'" alt="'+esc(m.name)+' — photo '+(i+1)+'" loading="lazy"></figure>').join("");
   content.innerHTML='<div class="lovable-about-modal-hero"><img src="/assets/'+m.img+'" alt="'+esc(m.name)+'"></div><div class="lovable-about-modal-body"><span class="lovable-about-pill">'+esc(m.role)+'</span><h2>'+esc(m.name)+'</h2><p>'+esc(m.bio)+'</p><h3>Skills &amp; Expertise</h3><div class="lovable-about-skill-list">'+m.skills.map(x=>'<span>✓ '+esc(x)+'</span>').join("")+'</div>'+(gallery?'<h3 class="lovable-about-gallery-title">Training Photos &amp; Work</h3><div class="lovable-about-modal-gallery">'+gallery+'</div>':'')+'<div class="lovable-about-actions"><a class="btn btn-primary" href="#page/contact">Contact</a><a class="btn btn-outline-light" href="https://wa.me/2347041145338?text='+encodeURIComponent("Hello "+m.name+", I saw your profile on Stanley Tech Connect and would like to chat.")+'" target="_blank" rel="noreferrer">WhatsApp</a></div></div>';
   modal.classList.remove("hidden");document.body.classList.add("about-modal-open");
  }));
  $("#aboutTeamClose")?.addEventListener("click",close);
  modal?.addEventListener("click",e=>{if(e.target===modal)close();});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!modal.classList.contains("hidden"))close();},{once:false});
 }
 window.scrollTo({top:0,behavior:"instant"});
 $$("#pageView [data-filter]").forEach(b=>b.addEventListener("click",()=>{$$("#pageView [data-filter]").forEach(x=>x.classList.toggle("active",x===b));$$("#pageView [data-category]").forEach(x=>x.classList.toggle("hidden",b.dataset.filter!=="All"&&x.dataset.category!==b.dataset.filter));}));
 if(location.hash==="#page/services"){
  const search=$("#serviceSearch"), cards=$$(".stc-service-card"), empty=$("#servicesEmpty");
  const applyServiceSearch=()=>{
   const term=(search?.value||"").trim().toLowerCase();
   const category=$$("#pageView [data-filter].active")[0]?.dataset.filter||"All";
   let visible=0;
   cards.forEach(card=>{
    const categoryMatch=category==="All"||card.dataset.category===category;
    const textMatch=!term||(card.dataset.serviceSearch||"").includes(term);
    const show=categoryMatch&&textMatch;
    card.classList.toggle("hidden",!show);
    if(show)visible++;
   });
   empty?.classList.toggle("hidden",visible>0);
  };
  search?.addEventListener("input",applyServiceSearch);
  $$("#pageView [data-filter]").forEach(button=>button.addEventListener("click",applyServiceSearch));
 }
 if(page==="portfolio"){
  const search=$("#portfolioSearch"),tiles=$$("#pageView .portfolio-tile");
  search?.addEventListener("input",()=>{const term=search.value.toLowerCase();tiles.forEach(tile=>tile.classList.toggle("hidden",!((tile.dataset.title+" "+tile.dataset.description+" "+tile.dataset.category).toLowerCase().includes(term))));});
 }
 $$("#pageView [data-title]").forEach(t=>t.addEventListener("click",()=>{const modal=$("#portfolioModal");if(!modal)return;$("#modalCategory").textContent=t.dataset.category;$("#modalTitle").textContent=t.dataset.title;$("#modalDescription").textContent=t.dataset.description;modal.classList.remove("hidden");}));
 $("#closePortfolioModal")?.addEventListener("click",()=>$("#portfolioModal")?.classList.add("hidden"));
 $("#portfolioModal")?.addEventListener("click",e=>{if(e.target.id==="portfolioModal")e.currentTarget.classList.add("hidden");});
 const bindForm=(form,training)=>{if(!form)return;form.addEventListener("submit",e=>{e.preventDefault();const d=Object.fromEntries(new FormData(form).entries());const msg=training?"🎓 NEW TRAINING APPLICATION — Stanley Tech Connect\n\nName: "+d.name+"\nPhone: "+d.phone+"\nEmail: "+d.email+"\nCourse: "+d.course+"\nPreferred Start: "+d.startDate+"\nMode: "+d.mode+"\nInstitution: "+(d.institution||"—")+"\nCourse of Study: "+(d.study||"—")+"\nLevel: "+(d.level||"—")+"\nPlacement Duration: "+(d.duration||"—")+"\nMessage: "+(d.message||"—"):"NEW CONTACT MESSAGE — Stanley Tech Connect\n\nName: "+d.name+"\nEmail: "+d.email+"\nPhone: "+d.phone+"\nSubject: "+d.subject+"\n\nMessage:\n"+d.message;window.open("https://wa.me/2347041145338?text="+encodeURIComponent(msg),"_blank","noopener,noreferrer");setTimeout(()=>{location.href="mailto:stanleytechconnect@gmail.com?subject="+encodeURIComponent(training?"Training Application — "+d.course+" ("+d.name+")":d.subject)+"&body="+encodeURIComponent(msg);},500);const status=training?$("#trainingStatus"):$("#contactRouteStatus");if(status)status.textContent="Your message has been prepared in WhatsApp and email. Please send it to complete your enquiry.";form.reset();});};
 bindForm($("#trainingApplyForm"),true);bindForm($("#stcContactRouteForm"),false);
}
window.addEventListener("hashchange",renderPageRoute);
window.addEventListener("DOMContentLoaded",renderPageRoute);


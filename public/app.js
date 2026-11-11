const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const state = { token: sessionStorage.getItem("stc_token") || "", user: null, role: "client", isAdmin: false, dashboard: null, currentTab: "overview" };
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
  ["overview","◫","Overview"],["projects","▦","My projects"],["quotes","▤","Quotes"],["invoices","◈","Invoices & payments"],["support","✉","Support"],["profile","◎","My profile"]
];
const adminTabs = [
  ["overview","◫","Overview"],["enquiries","✉","Enquiries"],["projects","▦","Projects"],["quotes","▤","Quotes"],["invoices","◈","Invoices"],["tickets","◉","Support tickets"],["services","⌘","Services"],["portfolio","✦","Portfolio"],["posts","▤","Journal"],["media","▧","Media library"],["staff","♙","Staff access"]
];
async function enterPortal() {
  try {
    const me = await api("/api/auth/me");
    state.user = me.user; state.role = me.role; state.isAdmin = me.is_admin || me.role !== "client";
    $("#userEmail").textContent = me.user.email; $("#userRole").textContent = state.role.replace("_"," ");
    $("#userAvatar").textContent = (me.profile?.full_name || me.user.email).slice(0,1).toUpperCase();
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

async function renderClient(tab) {
  const data = await api("/api/client/dashboard"); state.dashboard = data;
  if (tab === "overview") {
    const totalDue = data.invoices.filter(x=>x.status!=="paid").reduce((n,x)=>n+Number(x.amount||0),0);
    $("#portalContent").innerHTML = `
      <div class="metric-grid"><div class="metric-card"><small>Active projects</small><b>${data.projects.length}</b></div><div class="metric-card"><small>Quotes received</small><b>${data.quotes.length}</b></div><div class="metric-card"><small>Open invoices</small><b>${data.invoices.filter(x=>x.status!=="paid").length}</b></div><div class="metric-card"><small>Outstanding balance</small><b>${money(totalDue)}</b></div></div>
      ${panel("Project progress", table(["PROJECT","SERVICE","PROGRESS","STATUS"],data.projects.map(x=>`<tr><td><b>${esc(x.title)}</b></td><td>${esc(x.service||"—")}</td><td>${Number(x.progress||0)}%</td><td>${status(x.status)}</td></tr>`)))}
      ${panel("Recent notifications", data.notifications.length?`<div class="list-stack">${data.notifications.slice(0,5).map(x=>`<div class="list-row"><div><b>${esc(x.title)}</b><small>${esc(x.body)} · ${date(x.created_at)}</small></div>${x.read_at?"":`<button class="action-btn" data-read="${x.id}">Mark read</button>`}</div>`).join("")}</div>`:`<div class="empty-state">You're all caught up.</div>`)}`;
    $$("[data-read]").forEach(button=>button.addEventListener("click",async()=>{await api(`/api/client/notifications/${button.dataset.read}/read`,{method:"PATCH"});selectTab("overview");}));
  } else if (tab === "projects") {
    $("#portalContent").innerHTML = panel("Your projects", table(["PROJECT","SERVICE","STARTED","DUE","PROGRESS","STATUS"],data.projects.map(x=>`<tr><td><b>${esc(x.title)}</b><small>${esc(x.description||"")}</small></td><td>${esc(x.service||"—")}</td><td>${date(x.start_date)}</td><td>${date(x.due_date)}</td><td>${Number(x.progress||0)}%</td><td>${status(x.status)}</td></tr>`)));
  } else if (tab === "quotes") {
    $("#portalContent").innerHTML = panel("Your quotes", table(["REFERENCE","DESCRIPTION","AMOUNT","VALID UNTIL","STATUS"],data.quotes.map(x=>`<tr><td>${esc(x.reference)}</td><td><b>${esc(x.title)}</b><small>${esc(x.description||"")}</small></td><td>${money(x.amount,x.currency)}</td><td>${date(x.valid_until)}</td><td>${status(x.status)}</td></tr>`)));
  } else if (tab === "invoices") {
    $("#portalContent").innerHTML = `${panel("Invoices",table(["REFERENCE","DESCRIPTION","AMOUNT","DUE DATE","STATUS","ACTION"],data.invoices.map(x=>`<tr><td>${esc(x.reference)}</td><td>${esc(x.description)}</td><td>${money(x.amount,x.currency)}</td><td>${date(x.due_date)}</td><td>${status(x.status)}</td><td>${x.status==="paid"?"—":`<button class="action-btn" data-pay="${x.id}">Pay online</button>`}</td></tr>`)))}${panel("Payment history",table(["REFERENCE","AMOUNT","METHOD","DATE","STATUS"],data.payments.map(x=>`<tr><td>${esc(x.reference)}</td><td>${money(x.amount,x.currency)}</td><td>${esc(x.method)}</td><td>${date(x.created_at)}</td><td>${status(x.status)}</td></tr>`)))}`;
    $$("[data-pay]").forEach(button=>button.addEventListener("click",async()=>{button.disabled=true;try{const result=await api(`/api/client/invoices/${button.dataset.pay}/pay`,{method:"POST",body:"{}"});location.href=result.authorization_url;}catch(error){toast(error.message,true);button.disabled=false;}}));
  } else if (tab === "support") {
    $("#portalContent").innerHTML = `${panel("Open a support ticket",`<form id="ticketForm" class="portal-form"><label>Subject<input name="subject" required maxlength="180" placeholder="How can we help?"></label><label>Priority<select name="priority"><option value="normal">Normal</option><option value="high">High</option><option value="low">Low</option></select></label><label class="full">Message<textarea name="message" required rows="3" maxlength="4000" placeholder="Describe the issue or request"></textarea></label><button class="btn btn-primary" type="submit">Create support ticket ↗</button></form>`)}${panel("Your support requests",table(["SUBJECT","CREATED","PRIORITY","STATUS",""],data.tickets.map(x=>`<tr><td><b>${esc(x.subject)}</b></td><td>${date(x.created_at)}</td><td>${status(x.priority)}</td><td>${status(x.status)}</td><td><button class="action-btn" data-thread="${x.id}">View conversation</button></td></tr>`)))}`;
    $("#ticketForm").addEventListener("submit",async event=>{event.preventDefault();const body=Object.fromEntries(new FormData(event.currentTarget));try{await api("/api/client/tickets",{method:"POST",body:JSON.stringify(body)});toast("Support ticket created.");selectTab("support");}catch(error){toast(error.message,true);}});
    $$("[data-thread]").forEach(button=>button.addEventListener("click",async()=>{const id=button.dataset.thread;const result=await api(`/api/client/tickets/${id}/messages`);const thread=result.messages.map(m=>`<div class="list-row"><div><b>${m.sender_user_id===state.user.id?"You":"STC Support"}</b><small>${esc(m.message)} · ${date(m.created_at)}</small></div></div>`).join("");$("#portalContent").insertAdjacentHTML("afterbegin",panel(`Ticket #${id}`,`<div class="list-stack">${thread}</div><form id="replyForm" class="portal-form"><label class="full">Reply<textarea name="message" rows="2" required></textarea></label><button class="btn btn-primary" type="submit">Send reply</button></form>`));$("#replyForm").addEventListener("submit",async event=>{event.preventDefault();try{await api(`/api/client/tickets/${id}/messages`,{method:"POST",body:JSON.stringify({message:new FormData(event.currentTarget).get("message")})});toast("Reply sent.");selectTab("support");}catch(error){toast(error.message,true);}});}));
  } else if (tab === "profile") {
    const p = data.profile || {};
    $("#portalContent").innerHTML = panel("Your profile",`<form id="profileForm" class="portal-form"><label>Full name<input name="full_name" required maxlength="120" value="${esc(p.full_name||"")}"></label><label>Phone<input name="phone" maxlength="40" value="${esc(p.phone||"")}"></label><label class="full">Company / organisation<input name="company" maxlength="160" value="${esc(p.company||"")}"></label><label class="full">Email address<input disabled value="${esc(state.user.email)}"></label><button class="btn btn-primary" type="submit">Save profile</button></form>`);
    $("#profileForm").addEventListener("submit",async event=>{event.preventDefault();try{await api("/api/client/profile",{method:"PATCH",body:JSON.stringify(Object.fromEntries(new FormData(event.currentTarget)))});toast("Profile saved.");}catch(error){toast(error.message,true);}});
  }
}

async function renderAdmin(tab) {
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
      staff:["USER ID","ROLE","ACTIVE","ACTION"]
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
        staff:[x.user_id,x.role,x.is_active?"Yes":"No"]
      }[tab] || [];
      const actions = tab==="enquiries" ? `<button class="action-btn" data-status="${x.id}" data-value="contacted">Mark contacted</button>` :
        tab==="tickets" ? `<button class="action-btn" data-status="${x.id}" data-value="in_progress">In progress</button><button class="action-btn" data-status="${x.id}" data-value="closed">Close</button>` :
        tab==="projects" ? `<button class="action-btn" data-status="${x.id}" data-value="in_progress">In progress</button><button class="action-btn" data-status="${x.id}" data-value="completed">Complete</button>` :
        tab==="staff" ? `<button class="action-btn" data-staff="${esc(x.user_id)}" data-active="${!x.is_active}">${x.is_active?"Deactivate":"Activate"}</button>` : "—";
      return `<tr>${cells.map(c=>`<td>${typeof c==="string"&&c.startsWith("<span")?c:esc(c)}</td>`).join("")}<td>${actions}</td></tr>`;
    });
    const createButton = ["projects","quotes","invoices","services","portfolio","posts","staff"].includes(tab) ? `<button class="btn btn-primary" id="createRecord">+ Add ${esc(tab.slice(0,-1))}</button>` : "";
    $("#portalContent").innerHTML = `${panel(`${tab[0].toUpperCase()+tab.slice(1)} management`,`${createButton}${table(cols,rows)}`,`${items.length} records · showing up to 100`)}`;
    $$("[data-status]").forEach(button=>button.addEventListener("click",async()=>{try{await api(`/api/admin/${tab}/${button.dataset.status}`,{method:"PATCH",body:JSON.stringify({status:button.dataset.value})});toast("Record updated.");selectTab(tab);}catch(error){toast(error.message,true);}}));
    $("#createRecord")?.addEventListener("click",()=>createAdminRecord(tab));
    $$("[data-staff]").forEach(button=>button.addEventListener("click",async()=>{try{await api(`/api/admin/staff/${encodeURIComponent(button.dataset.staff)}`,{method:"PATCH",body:JSON.stringify({is_active:button.dataset.active==="true"})});toast("Staff access updated.");selectTab("staff");}catch(error){toast(error.message,true);}}));
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
    body.title=ask("Article title"); body.slug=ask("URL slug"); body.excerpt=ask("Short excerpt"); body.body=ask("Article body"); body.status="draft";
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
 const courses=[["Basic Computer Training","4 weeks","Computer fundamentals, file management, internet use and everyday digital confidence."],["Microsoft Office Suite","6 weeks","Practical skills in Word, Excel, PowerPoint and productive office workflows."],["Web Development","12 weeks","Learn HTML, CSS, JavaScript and the foundations of building websites."],["Programming Basics","8 weeks","Build logical thinking and understand programming concepts through practice."],["Graphic Design","8 weeks","Explore design principles and create useful visual communication materials."],["Digital Skills / ICT","6 weeks","Develop confidence with essential digital tools and modern work practices."]];
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
  "Computer Repairs":"Dependable computer diagnostics, troubleshooting and maintenance to keep your devices working."
 };
 const serviceCards=catalogue.map((x,i)=>{
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
 block('<div class="portfolio-filters">'+["All","Web Design","Graphics","Training","Projects"].map((x,i)=>'<button class="filter-chip '+(i===0?'active':'')+'" data-filter="'+x+'">'+x+'</button>').join("")+'</div><div class="portfolio-showcase">'+[["Real Estate Website","Web Design","🏠","A responsive website experience designed to present property listings."],["Project Defense Flyer","Graphics","🎓","Promotional flyer for our student project defense support service."],["Coding Bootcamp","Training","💻","Live coding session at our fully-equipped Stanley Tech Connect training lab."],["Hospital Mgmt System","Projects","🏥","A digital hospital management solution concept."],["E-commerce Store","Web Design","🛒","An online shopping experience with product discovery and a clear purchase journey."],["New Approach Brochure","Graphics","📰","Marketing brochure showcasing our project assistance approach."],["Hands-on Programming Class","Training","👨‍💻","One-on-one mentoring with our lead instructor in the tech lab."],["Automated Cataloguing System","Projects","📚","A library management and cataloguing project developed for Federal Polytechnic Ugep to improve academic resource access and catalog operations."],["Portfolio Landing","Web Design","🌐","A modern portfolio landing page concept."],["Tech Visualization","Graphics","✨","Custom tech visualization graphic for branding use."],["Federal Polytechnic Ugep Library UI","Projects","🗂️","Interface preview of the Automated Cataloguing System built for the Federal Polytechnic Ugep Library."],["Logo Pack — Tech Co.","Graphics","🎨","A collection of visual identity concepts and logo designs."]].map((x,i)=>'<button class="portfolio-tile tile-'+(i%6)+'" style="background-image:linear-gradient(0deg,rgba(3,15,36,.92),rgba(3,15,36,.08) 78%),url(/assets/'+["studio-1.jpg","flyer-project-defense.png","training-lab.png","project-library.png","studio-2.jpg","flyer-new-approach.png","founder-coding.png","project-library.png","holographic-tech.png","holographic-tech.png","project-library.png","logo.png"][i]+')" data-category="'+x[1]+'" data-title="'+esc(x[0])+'" data-description="'+esc(x[3])+'"><span class="portfolio-emoji">'+x[2]+'</span><span class="portfolio-meta">'+x[1]+'</span><b>'+x[0]+'</b></button>').join("")+'</div><div class="portfolio-modal hidden" id="portfolioModal" role="dialog" aria-modal="true"><button class="modal-close" id="closePortfolioModal">×</button><span class="eyebrow" id="modalCategory"></span><h2 id="modalTitle"></h2><p id="modalDescription"></p></div>')+
 action("Have a project of your own?","Let’s turn your idea into something useful and memorable.","Start a Project"),
 training:()=>head("TRAINING PROGRAMS","Learn the skills the future needs","Practical, hands-on courses for every level — taught by experienced instructors.")+
 block('<div class="page-heading"><span class="eyebrow">OUR COURSES</span><h2>What you can learn</h2><p>Choose any course below and register using the form.</p></div><div class="training-feature"><img src="/assets/training-lab.png" alt="Stanley Tech Connect practical training lab" loading="lazy"><div><span class="eyebrow">LEARN BY DOING</span><h2>Practical skills. Real projects.</h2><p>Build confidence through guided, hands-on learning in a supportive technology environment.</p></div></div><div class="course-grid">'+courses.map((c,i)=>'<article class="course-card"><div class="course-icon">'+["▣","▤","⌘","{ }","✎","◎"][i]+'</div><div><h3>'+c[0]+'</h3><p>'+c[1]+' · Beginner friendly</p><small>'+c[2]+'</small></div></article>').join("")+'</div>')+
 block('<div class="page-heading"><span class="eyebrow">REGISTER NOW</span><h2>Register for Training</h2><p>Fill in the form — your application is delivered instantly via WhatsApp and email.</p></div><form id="trainingApplyForm" class="route-form"><div class="form-grid"><label>Full Name *<input name="name" required minlength="2" placeholder="John Doe"></label><label>Phone / WhatsApp *<input name="phone" required minlength="7" placeholder="08012345678"></label></div><label>Email Address *<input name="email" type="email" required placeholder="you@example.com"></label><div class="form-grid"><label>Course Interested In *<select name="course" required><option value="">Choose a course</option>'+courses.map(c=>'<option>'+c[0]+'</option>').join("")+'</select></label><label>Preferred Start Date *<input name="startDate" type="date" required></label></div><fieldset><legend>Mode of Training *</legend><label class="radio-option"><input type="radio" name="mode" value="Physical Class" checked> Physical Class</label><label class="radio-option"><input type="radio" name="mode" value="Online Class"> Online Class</label></fieldset><label>Additional Message / Questions<textarea name="message" rows="4" placeholder="Anything else we should know?"></textarea></label><button class="btn btn-primary btn-large" type="submit">Apply Now ↗</button><p class="form-note">By submitting, your details will be sent via WhatsApp to 07041145338 and emailed to stanleytechconnect@gmail.com.</p><p id="trainingStatus" class="form-status"></p></form>','soft-section')+
 action("Ready to start learning?","Contact us with the course you are interested in and your preferred learning mode.","Enquire about training"),
 contact:()=>head("CONTACT","Let’s talk about your project","Reach out via the form, WhatsApp, phone or email — we typically respond within hours.")+
 block('<div class="contact-layout"><div class="contact-details"><a class="contact-info-card" href="tel:+2347041145338"><span>☎</span><div><small>CALL US</small><b>07041145338</b></div></a><a class="contact-info-card" href="mailto:stanleytechconnect@gmail.com"><span>✉</span><div><small>EMAIL</small><b>stanleytechconnect@gmail.com</b></div></a><div class="contact-info-card"><span>⌖</span><div><small>HEAD OFFICE</small><b>No. 17 Hon. Dr. Alex Egbona Road, Agbara Ekureku, Abi Local Government Area, Cross River State</b></div></div><div class="contact-info-card"><span>⌖</span><div><small>BRANCH OFFICE</small><b>John Ifere Street, Ntankpo Close, Federal Polytechnic Ugep, Cross River State</b></div></div><a class="whatsapp-card" href="https://wa.me/2347041145338" target="_blank">◉ <span><b>Chat on WhatsApp</b><small>Fastest way to reach us</small></span></a><div class="social-card"><b>Follow Us</b><div><a href="https://www.instagram.com/stanleytechconnect" target="_blank">Instagram</a><a href="mailto:stanleytechconnect@gmail.com">Email</a></div></div></div><form id="stcContactRouteForm" class="route-form"><h2>Send us a message</h2><p>All fields marked with * are required.</p><div class="form-grid"><label>Full Name *<input name="name" required placeholder="Your name"></label><label>Email *<input name="email" type="email" required placeholder="you@example.com"></label></div><div class="form-grid"><label>Phone *<input name="phone" type="tel" required placeholder="08012345678"></label><label>Subject *<input name="subject" required placeholder="What is it about?"></label></div><label>Message *<textarea name="message" required minlength="5" rows="5" placeholder="Tell us a bit about your needs..."></textarea></label><button class="btn btn-primary btn-large" type="submit">Send Message ↗</button><p class="form-note">Your message will open in WhatsApp and your email app for delivery.</p><p id="contactRouteStatus" class="form-status"></p></form></div>')+
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
 $$("#pageView [data-title]").forEach(t=>t.addEventListener("click",()=>{const modal=$("#portfolioModal");if(!modal)return;$("#modalCategory").textContent=t.dataset.category;$("#modalTitle").textContent=t.dataset.title;$("#modalDescription").textContent=t.dataset.description;modal.classList.remove("hidden");}));
 $("#closePortfolioModal")?.addEventListener("click",()=>$("#portfolioModal")?.classList.add("hidden"));
 $("#portfolioModal")?.addEventListener("click",e=>{if(e.target.id==="portfolioModal")e.currentTarget.classList.add("hidden");});
 const bindForm=(form,training)=>{if(!form)return;form.addEventListener("submit",e=>{e.preventDefault();const d=Object.fromEntries(new FormData(form).entries());const msg=training?"🎓 NEW TRAINING APPLICATION — Stanley Tech Connect\n\nName: "+d.name+"\nPhone: "+d.phone+"\nEmail: "+d.email+"\nCourse: "+d.course+"\nPreferred Start: "+d.startDate+"\nMode: "+d.mode+"\nMessage: "+(d.message||"—"):"NEW CONTACT MESSAGE — Stanley Tech Connect\n\nName: "+d.name+"\nEmail: "+d.email+"\nPhone: "+d.phone+"\nSubject: "+d.subject+"\n\nMessage:\n"+d.message;window.open("https://wa.me/2347041145338?text="+encodeURIComponent(msg),"_blank","noopener,noreferrer");setTimeout(()=>{location.href="mailto:stanleytechconnect@gmail.com?subject="+encodeURIComponent(training?"Training Application — "+d.course+" ("+d.name+")":d.subject)+"&body="+encodeURIComponent(msg);},500);const status=training?$("#trainingStatus"):$("#contactRouteStatus");if(status)status.textContent="Your message has been prepared in WhatsApp and email. Please send it to complete your enquiry.";form.reset();});};
 bindForm($("#trainingApplyForm"),true);bindForm($("#stcContactRouteForm"),false);
}
window.addEventListener("hashchange",renderPageRoute);
window.addEventListener("DOMContentLoaded",renderPageRoute);


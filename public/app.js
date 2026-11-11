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
$("#mobileMenu").addEventListener("click", () => $("#mainNav").classList.toggle("open"));
$$(".main-nav a").forEach(link => link.addEventListener("click", () => $("#mainNav").classList.remove("open")));
$("#year").textContent = new Date().getFullYear();

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
  const serviceItems = services.status === "fulfilled" ? services.value.services : [];
  window.stcServices = serviceItems;
  window.stcPortfolio = portfolio.status === "fulfilled" ? portfolio.value.portfolio : [];
  window.stcPosts = posts.status === "fulfilled" ? posts.value.posts : [];
  if (typeof renderPageRoute === "function") renderPageRoute();
  if (typeof routePublicPage === "function") routePublicPage();
  const portfolioItems = portfolio.status === "fulfilled" ? portfolio.value.portfolio : [];
  const postItems = posts.status === "fulfilled" ? posts.value.posts : [];
  const icons = ["⌘","▣","◈","⌁","✳","⌂","✦"];
  $("#serviceGrid").innerHTML = serviceItems.length ? serviceItems.map((item,i) => `
    <a class="service-card service-link" href="#service/${esc(item.slug || slugify(item.name))}"><span class="service-index">0${i+1} / STC</span><span class="service-icon">${icons[i%icons.length]}</span>
    <h3>${esc(item.name)}</h3><p>${esc(item.summary || item.description)}</p><span class="service-more">Explore service ↗</span></a>`).join("") : `<div class="loading-card">Our service catalogue is being refreshed. Contact us and we'll help you find the right solution.</div>`;
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
 const match=(location.hash||"").match(/^#page\/([^?]+)/);
 if(!match){renderServiceRoute();return;}
 const page=decodeURIComponent(match[1]).toLowerCase();
 const services=window.stcServices||[], projects=window.stcPortfolio||[], posts=window.stcPosts||[];
 const pageShell=(eyebrow,title,lead,body)=>'<section class="route-hero"><div class="eyebrow">'+eyebrow+'</div><h1>'+title+'</h1><p>'+lead+'</p></section>'+body;
 const serviceCards=services.map((item,i)=>'<a class="service-card" href="#service/'+esc(item.slug||slugify(item.name))+'"><span class="service-index">0'+(i+1)+' / STC</span><h3>'+esc(item.name)+'</h3><p>'+esc(item.summary||item.description||"Practical technology solutions built around your goals.")+'</p><span class="service-more">Explore service ↗</span></a>').join("");
 const projectCards=projects.map((item,i)=>'<article class="portfolio-card"><div class="portfolio-art"><span>'+(i===0?'✚':i===1?'▦':'✦')+'</span></div><div class="portfolio-body"><small>'+esc(item.category||"STC PROJECT")+'</small><h3>'+esc(item.title)+'</h3><p>'+esc(item.summary||item.details||"")+'</p>'+(item.url?'<p><a class="text-arrow" href="'+esc(item.url)+'" target="_blank" rel="noreferrer">View project ↗</a></p>':'')+'</div></article>').join("");
 const insightCards=posts.map(item=>'<article class="journal-card"><small>'+date(item.published_at)+' · STC JOURNAL</small><h3>'+esc(item.title)+'</h3><p>'+esc(item.excerpt||"")+'</p></article>').join("");
 const pages={
 services:()=>pageShell("WHAT WE DO","Technology that moves your work forward.","Explore the services Stanley Tech Connect provides to businesses, institutions, creators and individuals.",'<section class="route-section"><div class="service-grid">'+(serviceCards||'<div class="empty-state">Our service catalogue is being updated. Contact STC for assistance.</div>')+'</div></section>'),
 about:()=>pageShell("ABOUT STANLEY TECH CONNECT","Practical technology. Human progress.","STC brings design, development and dependable support together to turn ideas into useful digital experiences.",'<section class="route-section split-route"><div><div class="eyebrow">OUR PURPOSE</div><h2>Progress, <em>connected.</em></h2><p>We believe technology should solve real problems, simplify work and create opportunities. Our approach combines thoughtful design, practical engineering and clear communication.</p></div><div class="route-points"><article><b>01</b><h3>Understand first</h3><p>We start with the people, goals and challenges behind every project.</p></article><article><b>02</b><h3>Build with purpose</h3><p>We create useful, accessible and maintainable digital solutions.</p></article><article><b>03</b><h3>Support the journey</h3><p>We stay focused on quality, learning and continuous improvement.</p></article></div></section><section class="route-cta"><h2>Have an idea worth building?</h2><a class="btn btn-primary btn-large" href="#page/contact">Talk to STC ↗</a></section>'),
 portfolio:()=>pageShell("SELECTED WORK","Ideas turned into working solutions.","A closer look at digital platforms, websites and technology projects in the STC ecosystem.",'<section class="route-section"><div class="portfolio-grid">'+(projectCards||'<div class="empty-state">Projects will appear here as they are published.</div>')+'</div></section>'),
 training:()=>pageShell("STC LEARNING & TRAINING","Build skills. Create possibilities.","Practical technology training designed to help learners gain confidence through guided learning and hands-on projects.",'<section class="route-section split-route"><div><div class="eyebrow">LEARN BY DOING</div><h2>From curiosity to <em>capability.</em></h2><p>STC training focuses on practical digital skills, structured learning and project-based experience. Tell us what you want to learn and we can discuss a suitable path.</p><a class="btn btn-primary btn-large" href="#page/contact">Ask about training ↗</a></div><div class="route-points"><article><b>01</b><h3>Web development</h3><p>Learn the foundations of building and publishing websites.</p></article><article><b>02</b><h3>Digital productivity</h3><p>Build confidence with practical digital tools and workflows.</p></article><article><b>03</b><h3>Project-based learning</h3><p>Turn lessons into real work you can demonstrate.</p></article></div></section>'),
 insights:()=>pageShell("STC JOURNAL","Ideas worth sharing.","Updates, practical technology insights and lessons from the STC journey.",'<section class="route-section"><div class="journal-grid">'+(insightCards||'<div class="empty-state">New insights will be published here soon.</div>')+'</div></section>'),
 contact:()=>pageShell("CONTACT STC","Let's make your next idea real.","Tell us what you are planning. We will help you identify a practical next step.",'<section class="route-section contact-route"><div class="contact-route-card"><div class="eyebrow">START A CONVERSATION</div><h2>Stanley Tech Connect</h2><p>Email: <a href="mailto:stanleytechconnect@gmail.com">stanleytechconnect@gmail.com</a></p><p>Instagram: <a href="https://www.instagram.com/stanleytechconnect" target="_blank" rel="noreferrer">@stanleytechconnect</a></p><a class="btn btn-primary btn-large" href="#contact">Go to project enquiry form ↗</a></div></section>')
 };
 const render=pages[page];
 if(!render){location.hash="#page/services";return;}
 $("#publicSite").classList.add("hidden");$("#siteFooter").classList.add("hidden");
 $("#pageView").classList.remove("hidden");$("#pageView").innerHTML=render();
 window.scrollTo({top:0,behavior:"instant"});
}
window.addEventListener("hashchange",renderPageRoute);
window.addEventListener("DOMContentLoaded",renderPageRoute);


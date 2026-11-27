(() => {
  const rootId = "accountRoot";
  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
  const token = () => "";
  const saveSession = () => {};
  const clearSession = () => {
    fetch("/api/better-auth/sign-out", { method:"POST", credentials:"same-origin" }).catch(() => {});
  };
  async function request(url, options = {}) {
    const headers = { "Content-Type":"application/json", ...(options.headers || {}) };
    const response = await fetch(url, { ...options, headers, credentials:"same-origin" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || data.message || "The request could not be completed.");
      error.status = response.status;
      throw error;
    }
    return data;
  }
  function root() {
    let el = document.getElementById(rootId);
    if (!el) {
      el = document.createElement("main");
      el.id = rootId;
      el.className = "stc-account-root hidden";
      document.body.insertBefore(el, document.getElementById("siteFooter"));
    }
    return el;
  }
  function showAccount(markup) {
    $("#publicSite")?.classList.add("hidden");
    $("#pageView")?.classList.add("hidden");
    $("#siteHeader")?.classList.add("hidden");
    $("#stcAnnouncementBar")?.classList.add("hidden");
    $("#siteFooter")?.classList.add("hidden");
    root().classList.remove("hidden");
    root().innerHTML = markup;
    window.scrollTo({ top:0, behavior:"instant" });
  }
  function shell(content, title = "Your STC account") {
    return '<div class="stc-auth-shell"><aside class="stc-auth-aside"><a class="stc-auth-brand" href="#home"><img src="/assets/logo.png" alt="STC"><span>STANLEY TECH CONNECT</span></a><div class="stc-auth-aside-copy"><span class="stc-auth-kicker">YOUR DIGITAL WORKSPACE</span><h1>Learn. Build.<br><em>Move forward.</em></h1><p>One secure place to manage your training, projects, services and progress with Stanley Tech Connect.</p><div class="stc-auth-aside-points"><span>✓ Practical learning and support</span><span>✓ Projects and service updates</span><span>✓ Secure account access</span></div></div><small class="stc-auth-copyright">© '+new Date().getFullYear()+' Stanley Tech Connect</small></aside><section class="stc-auth-main"><div class="stc-auth-card">'+content+'</div><a class="stc-auth-back" href="#home">← Back to public website</a></section></div>';
  }
  function authTabs(active) {
    return '<div class="stc-auth-tabs"><a class="'+(active==="login"?"active":"")+'" href="#account/login">Sign in</a><a class="'+(active==="register"?"active":"")+'" href="#account/register">Create account</a></div>';
  }
  function field(label, name, type, placeholder, extra = "") {
    return '<label class="stc-field">'+label+'<input name="'+name+'" type="'+type+'" placeholder="'+placeholder+'" '+extra+'></label>';
  }
  function status(id) { return '<p class="stc-account-status" id="'+id+'" aria-live="polite"></p>'; }
  function setStatus(id, message, bad = false) {
    const el = $("#"+id);
    if (!el) return;
    el.textContent = message;
    el.classList.toggle("is-error", bad);
    el.classList.toggle("is-success", !bad && Boolean(message));
  }
  function bindForm(id, callback) {
    const form = $("#"+id);
    if (!form) return;
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const button = $("button[type=submit]", form);
      if (button) { button.disabled = true; button.dataset.label = button.textContent; button.textContent = "Please wait…"; }
      try { await callback(new FormData(form), form); }
      catch (error) { setStatus(id+"Status", error.message || "Something went wrong.", true); }
      finally { if (button) { button.disabled = false; button.textContent = button.dataset.label || "Submit"; } }
    });
  }
  function renderLogin() {
    showAccount(shell(
      '<span class="stc-auth-kicker">WELCOME BACK</span><h2>Sign in to your account</h2><p class="stc-auth-subtitle">Access your STC workspace securely.</p>'+authTabs("login")+
      '<form id="stcLoginForm" class="stc-auth-form">'+field("Email address","email","email","name@example.com",'required autocomplete="email"')+field("Password","password","password","Enter your password",'required autocomplete="current-password"')+
      '<div class="stc-auth-inline"><a href="#account/forgot-password">Forgot password?</a></div><button class="stc-auth-submit" type="submit">Sign in to STC <span>→</span></button>'+status("stcLoginFormStatus")+'</form><p class="stc-auth-footnote">New to STC? <a href="#account/register">Create an account</a></p>'
    ));
    bindForm("stcLoginForm", async data => {
      await request("/api/better-auth/sign-in/email", { method:"POST", body:JSON.stringify({ email:data.get("email"), password:data.get("password"), rememberMe:true }) });
      const me = await request("/api/auth/me");
      const role = me.role || "client";
      location.hash = role === "super_admin" ? "#dashboard/admin" : role === "student" ? "#dashboard/student" : role === "client" ? "#dashboard/client" : "#dashboard/staff";
    });
  }
  function renderRegister() {
    showAccount(shell(
      '<span class="stc-auth-kicker">JOIN THE STC COMMUNITY</span><h2>Create your account</h2><p class="stc-auth-subtitle">Choose the account that matches how you work with STC.</p>'+authTabs("register")+
      '<form id="stcRegisterForm" class="stc-auth-form">'+field("Full name","full_name","text","Your full name",'required maxlength="120" autocomplete="name"')+field("Email address","email","email","name@example.com",'required autocomplete="email"')+field("Phone number","phone","tel","+234…",'maxlength="40" autocomplete="tel"')+
      '<label class="stc-field">Account type<select name="account_type" id="stcAccountType" required><option value="student">Student / Trainee</option><option value="client">Client</option></select></label>'+
      '<div id="stcStudentFields">'+field("Institution","institution","text","School or institution",'required maxlength="180"')+field("Department","department","text","Department or course",'required maxlength="160"')+field("Study level","study_level","text","e.g. ND, HND, Undergraduate",'required maxlength="80"')+'</div>'+
      '<div id="stcClientFields" class="hidden">'+field("Company / Organisation","company","text","Optional",'maxlength="160"')+'</div>'+
      field("Create password","password","password","At least 10 characters",'required minlength="10" maxlength="128" autocomplete="new-password"')+
      '<p class="stc-auth-hint">Use at least 10 characters. Staff accounts are created or assigned by an STC administrator.</p><button class="stc-auth-submit" type="submit">Create my account <span>→</span></button>'+status("stcRegisterFormStatus")+'</form><p class="stc-auth-footnote">Already registered? <a href="#account/login">Sign in</a></p>'
    ));
    const type = $("#stcAccountType");
    const sync = () => {
      const student = type.value === "student";
      $("#stcStudentFields").classList.toggle("hidden", !student);
      $("#stcClientFields").classList.toggle("hidden", student);
      ["institution","department","study_level"].forEach(name => { const input=$('[name="'+name+'"]'); if(input) input.required=student; });
    };
    type.addEventListener("change", sync); sync();
    bindForm("stcRegisterForm", async data => {
      const profile = Object.fromEntries(data.entries());
      await request("/api/better-auth/sign-up/email", { method:"POST", body:JSON.stringify({
        name:profile.full_name, email:profile.email, password:profile.password, callbackURL:location.origin + "/"
      }) });
      await request("/api/account/profile", { method:"POST", body:JSON.stringify(profile) });
      setStatus("stcRegisterFormStatus", "Your STC account has been created successfully.");
      setTimeout(() => location.hash = profile.account_type === "student" ? "#dashboard/student" : "#dashboard/client", 900);
    });
  }
  function renderForgot() {
    showAccount(shell(
      '<span class="stc-auth-kicker">ACCOUNT RECOVERY</span><h2>Forgot your password?</h2><p class="stc-auth-subtitle">Enter the email address linked to your STC account. We’ll send a secure reset link if an account exists.</p><form id="stcForgotForm" class="stc-auth-form">'+field("Email address","email","email","name@example.com",'required autocomplete="email"')+'<button class="stc-auth-submit" type="submit">Send reset link <span>→</span></button>'+status("stcForgotFormStatus")+'</form><p class="stc-auth-footnote"><a href="#account/login">← Back to sign in</a></p>'
    ));
    bindForm("stcForgotForm", async data => {
      const result = await request("/api/better-auth/request-password-reset", { method:"POST", body:JSON.stringify({ email:data.get("email"), redirectTo:location.origin + "/#account/reset-password" }) });
      setStatus("stcForgotFormStatus", result.message);
    });
  }
  function recoveryToken() {
    const queryToken = new URLSearchParams(location.search).get("token");
    const hash = location.hash.replace(/^#/,"");
    const hashParams = new URLSearchParams(hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "");
    return queryToken || hashParams.get("token") || "";
  }
  function renderReset() {
    const recovery = recoveryToken();
    showAccount(shell(
      '<span class="stc-auth-kicker">SECURE ACCOUNT RECOVERY</span><h2>Set a new password</h2><p class="stc-auth-subtitle">Choose a new password for your STC account.</p>'+
      (recovery ? '<form id="stcResetForm" class="stc-auth-form">'+field("New password","password","password","At least 10 characters",'required minlength="10" maxlength="128" autocomplete="new-password"')+field("Confirm new password","confirm_password","password","Enter it again",'required minlength="10" maxlength="128" autocomplete="new-password"')+'<button class="stc-auth-submit" type="submit">Update password <span>→</span></button>'+status("stcResetFormStatus")+'</form>' : '<div class="stc-auth-notice">This reset link is missing or has expired. Request a new password-reset email to continue.</div><a class="stc-auth-submit stc-auth-link-button" href="#account/forgot-password">Request a new reset link</a>')+
      '<p class="stc-auth-footnote"><a href="#account/login">Return to sign in</a></p>'
    ));
    bindForm("stcResetForm", async data => {
      if (data.get("password") !== data.get("confirm_password")) throw new Error("The passwords do not match.");
      const result = await request("/api/better-auth/reset-password", { method:"POST", body:JSON.stringify({ newPassword:data.get("password"), token:recovery }) });
      history.replaceState(null, "", location.pathname);
      clearSession();
      setStatus("stcResetFormStatus", result.message + " You can now sign in.");
      setTimeout(() => location.hash = "#account/login", 1600);
    });
  }
  function renderChangePassword() {
    showAccount(shell(
      '<span class="stc-auth-kicker">ACCOUNT SECURITY</span><h2>Change password</h2><p class="stc-auth-subtitle">Confirm your current password before choosing a new one.</p><form id="stcChangeForm" class="stc-auth-form">'+field("Current password","current_password","password","Enter your current password",'required autocomplete="current-password"')+field("New password","password","password","At least 10 characters",'required minlength="10" maxlength="128" autocomplete="new-password"')+field("Confirm new password","confirm_password","password","Enter it again",'required minlength="10" maxlength="128" autocomplete="new-password"')+'<button class="stc-auth-submit" type="submit">Save new password <span>→</span></button>'+status("stcChangeFormStatus")+'</form><p class="stc-auth-footnote"><a href="#dashboard">← Back to dashboard</a></p>'
    ));
    bindForm("stcChangeForm", async data => {
      if (data.get("password") !== data.get("confirm_password")) throw new Error("The passwords do not match.");
      const result = await request("/api/better-auth/change-password", { method:"POST", body:JSON.stringify({ currentPassword:data.get("current_password"), newPassword:data.get("password"), revokeOtherSessions:true }) });
      setStatus("stcChangeFormStatus", result.message);
    });
  }
  const staffResources = {
    manager:["enquiries","projects","quotes","invoices","payments","tickets","services","posts","portfolio","media","profiles","clients","students","enrollments","certificates","awards"],
    project_manager:["enquiries","projects","tickets"],
    finance:["quotes","invoices","payments"],
    support:["enquiries","tickets"],
    content_editor:["services","posts","portfolio","media"]
  };
  const roleNames = { super_admin:"Administrator",manager:"Operations Manager",project_manager:"Project Manager",finance:"Finance Officer",support:"Customer Support",content_editor:"Content Editor",student:"Student",client:"Client" };
  let staffRoleDefinitions = [];
  const resourceNames = { staff:"Staff & Permissions", profiles:"User Profiles", clients:"Client Management", students:"Student Management", enquiries:"Enquiries",projects:"Projects",quotes:"Quotes",invoices:"Invoices",payments:"Payments",tickets:"Support Tickets",services:"Services",posts:"Posts",portfolio:"Portfolio",media:"Media",enrollments:"Training Enrolments",certificates:"Certificates",awards:"Awards" };
  function metric(label,value) { return '<article class="stc-dash-metric"><small>'+esc(label)+'</small><strong>'+esc(value ?? 0)+'</strong></article>'; }

  const adminNavGroups = [
    ["Overview", [["Overview", ""]]],
    ["People & learning", [["Staff & permissions","staff"],["User profiles","profiles"],["Student management","students"],["Client management","clients"],["Training enrolments","enrollments"],["Certificates","certificates"],["Awards","awards"]]],
    ["Business operations", [["Enquiries","enquiries"],["Projects","projects"],["Quotes","quotes"],["Invoices","invoices"],["Payments","payments"],["Support tickets","tickets"]]],
    ["Website & content", [["Services","services"],["Posts & announcements","posts"],["Portfolio","portfolio"],["Media library","media"]]]
  ];
  function adminSidebar(active) {
    return '<nav class="stc-admin-side-nav" aria-label="Administrator navigation">' +
      adminNavGroups.map(([group, links]) => '<section class="stc-admin-side-group"><h3>'+esc(group)+'</h3>' +
        links.map(([label, resource]) => {
          const href = resource ? '#dashboard/admin/'+resource : '#dashboard/admin';
          const selected = (resource || '') === active;
          return '<a href="'+href+'"'+(selected?' aria-current="page" class="is-active"':'')+'>'+esc(label)+'<span>›</span></a>';
        }).join('') + '</section>').join('') +
      '<div class="stc-admin-side-foot"><span>STC ADMINISTRATION</span><small>Secure management workspace</small></div></nav>';
  }
  function adminLayoutStart(role, active) {
    return role === "super_admin" ? '<div class="stc-admin-layout"><button type="button" class="stc-admin-mobile-toggle" id="stcAdminNavToggle" aria-controls="stcAdminSidebar" aria-expanded="false"><span aria-hidden="true">☰</span> Dashboard menu</button><aside class="stc-admin-sidebar" id="stcAdminSidebar">'+adminSidebar(active)+'</aside>' : '';
  }
  function adminLayoutEnd(role) {
    return role === "super_admin" ? '</div>' : '';
  }

  const adminChartPalette = ["#087fa9","#21a6b4","#67c6bb","#f0ad4e","#7586d8","#e17c91","#4d9c83","#9b8bd3"];
  function adminChartPanel(title, values, key = "chart", defaultType = "bar", suffix = "", allowLine = false) {
    const entries = Object.entries(values || {}).map(([label,value])=>[label,Number(value)||0]).sort((a,b)=>key==="monthly"?(Date.parse(a[0])-Date.parse(b[0])||a[0].localeCompare(b[0])):a[0].localeCompare(b[0]));
    const preference = (()=>{try{return JSON.parse(localStorage.getItem("stcAdminDashboardPrefs")||"{}")}catch{return {}}})();
    const allowedTypes = allowLine ? ["bar","donut","line"] : ["bar","donut"];
    const type = allowedTypes.includes(preference.types?.[key])?preference.types[key]:defaultType;
    const hidden = preference.hidden?.includes(key);
    return '<section class="stc-dash-panel stc-admin-chart" data-chart-key="'+esc(key)+'" data-chart-values="'+esc(JSON.stringify(entries))+'" data-chart-suffix="'+esc(suffix)+'" '+(hidden?'hidden':'')+'><div class="stc-admin-panel-heading"><div><span class="stc-admin-eyebrow">LIVE RECORD INSIGHTS</span><h3>'+esc(title)+'</h3></div><div class="stc-admin-chart-tools"><span>'+entries.length+' categories</span><label class="stc-admin-chart-setting">View <select data-chart-type aria-label="Chart type for '+esc(title)+'"><option value="bar" '+(type==="bar"?"selected":"")+'>Bar</option><option value="donut" '+(type==="donut"?"selected":"")+'>Donut</option>'+(allowLine?'<option value="line" '+(type==="line"?"selected":"")+'>Trend line</option>':'')+'</select></label><label class="stc-admin-chart-hide"><input type="checkbox" data-chart-visible '+(!hidden?"checked":"")+'> Show</label></div></div><div class="stc-admin-chart-visual" aria-live="polite"></div></section>';
  }
  function renderAdminChart(card) {
    const entries=JSON.parse(card.dataset.chartValues||"[]"), type=card.querySelector("[data-chart-type]")?.value||"bar", suffix=card.dataset.chartSuffix||"";
    const host=card.querySelector(".stc-admin-chart-visual");
    if(!host)return;
    if(!entries.length){host.innerHTML='<p class="stc-dash-empty">No records available for this chart yet.</p>';return;}
    const max=Math.max(1,...entries.map(x=>x[1]));
    if(type==="donut"){
      const total=entries.reduce((sum,x)=>sum+x[1],0)||1;let cursor=0;
      const stops=entries.map((item,i)=>{const start=cursor;cursor+=item[1]/total*100;return adminChartPalette[i%adminChartPalette.length]+" "+start+"% "+cursor+"%"}).join(",");
      host.innerHTML='<div class="stc-admin-donut-layout"><div class="stc-admin-donut" style="background:conic-gradient('+stops+')"><div><strong>'+total.toLocaleString()+ '</strong><span>Total</span></div></div><ul class="stc-admin-chart-legend">'+entries.map((x,i)=>'<li><i style="background:'+adminChartPalette[i%adminChartPalette.length]+'"></i><span>'+esc(x[0].replaceAll("_"," "))+'</span><strong>'+esc(x[1].toLocaleString()+suffix)+'</strong></li>').join("")+'</ul></div>';
    } else if(type==="line"){
      const width=620,height=230,pad=30,step=entries.length>1?(width-pad*2)/(entries.length-1):0;
      const points=entries.map((x,i)=>[pad+i*step,height-pad-(x[1]/max)*(height-pad*2)]);
      const path=points.map((p,i)=>(i?"L":"M")+p[0].toFixed(1)+" "+p[1].toFixed(1)).join(" ");
      host.innerHTML='<div class="stc-admin-line-wrap"><svg viewBox="0 0 '+width+' '+height+'" role="img" aria-label="'+esc(card.querySelector("h3")?.textContent||"Trend")+' line chart"><line x1="'+pad+'" y1="'+(height-pad)+'" x2="'+(width-pad)+'" y2="'+(height-pad)+'" stroke="#e4edf3"/><path d="'+path+'" fill="none" stroke="#078eae" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>'+points.map((p,i)=>'<circle cx="'+p[0]+'" cy="'+p[1]+'" r="5" fill="#078eae"><title>'+esc(entries[i][0]+": "+entries[i][1])+'</title></circle>').join("")+'</svg><div class="stc-admin-line-labels">'+entries.map(x=>'<span>'+esc(x[0])+'</span>').join("")+'</div></div>';
    } else {
      host.innerHTML='<div class="stc-admin-bars">'+entries.map((x,i)=>'<div class="stc-admin-bar-row"><div><span>'+esc(x[0].replaceAll("_"," "))+'</span><strong>'+esc(x[1].toLocaleString()+suffix)+'</strong></div><div class="stc-admin-bar-track"><i style="width:'+Math.max(0,x[1]/max*100)+'%;background:'+adminChartPalette[i%adminChartPalette.length]+'"></i></div></div>').join("")+'</div>';
    }
  }
  function bindAdminDashboard() {
    const rootEl=root(), prefsKey="stcAdminDashboardPrefs";
    const read=()=>{try{return JSON.parse(localStorage.getItem(prefsKey)||"{}")}catch{return {}}};
    const save=p=>{try{localStorage.setItem(prefsKey,JSON.stringify(p))}catch{}};
    const grid=$("#stcAdminChartGrid",rootEl), toggle=$("#stcAdminCustomize",rootEl), controls=$("#stcAdminLayoutControls",rootEl);
    const navToggle=$("#stcAdminNavToggle",rootEl), sidebar=$("#stcAdminSidebar",rootEl);
    const period=$("#stcAdminChartPeriod",rootEl), monthly=grid?.querySelector('[data-chart-key="monthly"]');
    const fullMonthlyValues=monthly?.dataset.chartValues||"[]";
    period?.addEventListener("change",()=>{
      if(!monthly)return;
      const all=JSON.parse(fullMonthlyValues);
      const count=period.value==="all"?all.length:Number(period.value);
      monthly.dataset.chartValues=JSON.stringify(all.slice(-count));
      renderAdminChart(monthly);
    });
    navToggle?.addEventListener("click",()=>{const open=navToggle.getAttribute("aria-expanded")!=="true";navToggle.setAttribute("aria-expanded",String(open));sidebar?.classList.toggle("is-open",open);});
    sidebar?.querySelectorAll("a").forEach(link=>link.addEventListener("click",()=>{navToggle?.setAttribute("aria-expanded","false");sidebar.classList.remove("is-open");}));
    const prefs=read();
    if(grid){
      grid.classList.toggle("is-three-columns",prefs.columns===3);
      grid.classList.toggle("is-compact",prefs.compact===true);
      grid.querySelectorAll(".stc-admin-chart").forEach(card=>{
        const key=card.dataset.chartKey;
        card.hidden=Array.isArray(prefs.hidden)&&prefs.hidden.includes(key);
        const select=card.querySelector("[data-chart-type]");
        if(select&&prefs.types?.[key])select.value=prefs.types[key];
        renderAdminChart(card);
      });
      grid.addEventListener("change",event=>{
        const card=event.target.closest(".stc-admin-chart");if(!card)return;
        const p=read(),key=card.dataset.chartKey;
        if(event.target.matches("[data-chart-type]")){p.types={...(p.types||{}),[key]:event.target.value};save(p);renderAdminChart(card);}
        if(event.target.matches("[data-chart-visible]")){const hidden=new Set(p.hidden||[]);event.target.checked?hidden.delete(key):hidden.add(key);p.hidden=[...hidden];save(p);card.hidden=!event.target.checked;}
      });
    }
    if(toggle&&controls){
      toggle.addEventListener("click",()=>{const active=controls.hidden;controls.hidden=!active;toggle.setAttribute("aria-expanded",String(active));toggle.textContent=active?"Done customizing":"Customize dashboard";grid?.classList.toggle("is-customizing",active);});
      controls.querySelector("[data-layout-columns]")?.addEventListener("change",event=>{const p=read();p.columns=Number(event.target.value);save(p);grid?.classList.toggle("is-three-columns",p.columns===3);});
      controls.querySelector("[data-layout-compact]")?.addEventListener("change",event=>{const p=read();p.compact=event.target.checked;save(p);grid?.classList.toggle("is-compact",p.compact);});
      controls.querySelector("[data-layout-reset]")?.addEventListener("click",()=>{try{localStorage.removeItem(prefsKey)}catch{};if(grid){grid.classList.remove("is-three-columns","is-compact");grid.querySelectorAll(".stc-admin-chart").forEach(card=>{card.hidden=false;const select=card.querySelector("[data-chart-type]");select.value=card.dataset.chartKey==="monthly"? "line":card.dataset.chartKey==="project"||card.dataset.chartKey==="payment"||card.dataset.chartKey==="enrolment"||card.dataset.chartKey==="enquiry"?"donut":"bar";const visible=card.querySelector("[data-chart-visible]");if(visible)visible.checked=true;renderAdminChart(card);});}const compact=controls.querySelector("[data-layout-compact]");if(compact)compact.checked=false;const columns=controls.querySelector("[data-layout-columns]");if(columns)columns.value="2";});
    }
  }


  const adminEditableFields = {
    staff:["role","is_active"], enquiries:["status"],
    projects:["title","description","service","status","progress","start_date","due_date"],
    quotes:["title","description","amount","currency","status","valid_until"],
    invoices:["description","amount","currency","status","due_date"],
    tickets:["status","priority"], services:["name","summary","description","active","sort_order"],
    posts:["title","excerpt","body","status","published_at"],
    portfolio:["title","category","summary","details","url","featured"],
    media:["title","description","category","is_featured","is_published"],
    enrollments:["status","supervisor","study_level","placement_duration"],
    certificates:["status"], awards:["status"]
  };
  function resourceEditorField(key,value) {
    const label=esc(key.replaceAll("_"," "));
    if(key==="role") return '<label class="stc-field">'+label+'<select name="role">'+staffRoleDefinitions.map(r=>'<option value="'+esc(r.role_key)+'" '+(value===r.role_key?"selected":"")+ '>'+esc(r.label)+'</option>').join("")+'</select></label>';
    if(typeof value==="boolean") return '<label class="stc-field stc-admin-edit-check"><input type="checkbox" name="'+esc(key)+'" '+(value?'checked':'')+'> '+label+'</label>';
    const long=["description","summary","excerpt","body","details"].includes(key);
    const type=["amount","progress","sort_order"].includes(key)?"number":"text";
    const input=long?'<textarea name="'+esc(key)+'" rows="3">'+esc(value??"")+'</textarea>':'<input name="'+esc(key)+'" type="'+type+'" value="'+esc(value??"")+'" '+(type==="number"?'step="any"':'')+'>';
    return '<label class="stc-field">'+label+input+'</label>';
  }
  function bindAdminResource(items,resource) {
    const rootEl=root(), fields=adminEditableFields[resource]||[];
    const search=$("#stcResourceSearch",rootEl), body=$("#stcResourceRows",rootEl), pageLabel=$("#stcResourcePage",rootEl);
    const roleFilter=$("#stcStaffRoleFilter",rootEl), statusFilter=$("#stcStaffStatusFilter",rootEl);
    const pageSize=10; let page=0, filtered=items.slice();
    const applyFilters=()=>{
      const q=(search?.value||"").trim().toLowerCase(), role=roleFilter?.value||"", status=statusFilter?.value||"";
      filtered=items.filter(item=>{
        const matchesSearch=!q||Object.values(item).some(v=>String(v??"").toLowerCase().includes(q));
        const matchesRole=!role||item.role===role;
        const matchesStatus=!status||(status==="active"?item.is_active===true:item.is_active===false);
        return matchesSearch&&matchesRole&&matchesStatus;
      });
      page=0;renderRows();
    };
    const keys=resource==="staff"?["full_name","phone","department","role","is_active","user_id"]:Object.keys(items[0]||{}).filter(k=>!["raw","content"].includes(k));
    const renderRows=()=>{
      const start=page*pageSize, visible=filtered.slice(start,start+pageSize);
      body.innerHTML=visible.length?visible.map(item=>{
        const cells=keys.slice(0,7).map(key=>'<td>'+esc(typeof item[key]==="object"?JSON.stringify(item[key]):item[key]??"—")+'</td>').join("");
        const id=item.id??item.user_id??"";
        return '<tr>'+cells+'<td>'+(fields.length&&id?'<div class="stc-staff-row-actions"><button type="button" class="stc-admin-edit-button" data-edit-id="'+esc(id)+'">Edit</button>'+(resource==="staff"?'<button type="button" class="stc-staff-remove-button" data-remove-id="'+esc(id)+'">Remove access</button>':'')+'</div>':'—')+'</td></tr>';
      }).join(""):'<tr><td colspan="'+(Math.min(keys.length,7)+1)+'" class="stc-dash-empty">No matching records.</td></tr>';
      pageLabel.textContent=filtered.length?("Showing "+(start+1)+"–"+Math.min(start+pageSize,filtered.length)+" of "+filtered.length):"0 records";
      $("#stcResourcePrev",rootEl).disabled=page===0;
      $("#stcResourceNext",rootEl).disabled=(page+1)*pageSize>=filtered.length;
    };
    search?.addEventListener("input",applyFilters);
    roleFilter?.addEventListener("change",applyFilters);
    statusFilter?.addEventListener("change",applyFilters);
    $("#stcResourcePrev",rootEl)?.addEventListener("click",()=>{page=Math.max(0,page-1);renderRows();});
    $("#stcResourceNext",rootEl)?.addEventListener("click",()=>{if((page+1)*pageSize<filtered.length)page++;renderRows();});
    body?.addEventListener("click", async event => {
      const removeButton = event.target.closest("[data-remove-id]");
      if (!removeButton || resource !== "staff") return;
      const userId = removeButton.dataset.removeId;
      const staff = items.find(item => String(item.user_id) === userId);
      const displayName = staff?.full_name || "this staff member";
      if (!window.confirm("Remove staff access for " + displayName + "? Their STC account and profile will remain; only their staff role will be removed.")) return;
      removeButton.disabled = true;
      try {
        await request("/api/admin/staff/" + encodeURIComponent(userId), { method: "DELETE" });
        await renderDashboard();
      } catch (error) {
        window.alert(error.message);
        removeButton.disabled = false;
      }
    });
    body?.addEventListener("click",event=>{
      const button=event.target.closest("[data-edit-id]");
      if(!button)return;
      const record=items.find(item=>String(item.id??item.user_id)===button.dataset.editId);
      if(!record)return;
      const editFields=fields.map(key=>resourceEditorField(key,record[key])).join("");
      const modal=$("#stcAdminEditModal",rootEl);
      modal.innerHTML='<div class="stc-admin-edit-card"><div class="stc-admin-panel-heading"><h3>Edit '+esc(resourceNames[resource]||resource)+'</h3><button type="button" id="stcAdminEditClose" aria-label="Close">×</button></div><form id="stcAdminEditForm">'+editFields+'<div class="stc-admin-edit-actions"><button type="button" class="stc-admin-edit-cancel" id="stcAdminEditCancel">Cancel</button><button type="submit" class="stc-auth-submit">Save changes</button></div><p id="stcAdminEditStatus" class="stc-account-status" aria-live="polite"></p></form></div>';
      modal.classList.remove("hidden");
      const close=()=>modal.classList.add("hidden");
      $("#stcAdminEditClose",modal).onclick=close;$("#stcAdminEditCancel",modal).onclick=close;
      $("#stcAdminEditForm",modal).addEventListener("submit",async e=>{
        e.preventDefault();
        const form=e.currentTarget, submit=$('button[type="submit"]',form);
        submit.disabled=true;submit.textContent="Saving…";
        const payload={};
        for(const key of fields){
          const input=form.elements.namedItem(key); if(!input)continue;
          if(input.type==="checkbox")payload[key]=input.checked;
          else if(input.type==="number")payload[key]=input.value===""?null:Number(input.value);
          else payload[key]=input.value.trim();
        }
        try{
          await request("/api/admin/"+encodeURIComponent(resource)+"/"+encodeURIComponent(button.dataset.editId),{method:"PATCH",body:JSON.stringify(payload)});
          modal.classList.add("hidden");await renderDashboard();
        }catch(error){const status=$("#stcAdminEditStatus",modal);status.textContent=error.message;status.classList.add("is-error");}
        finally{submit.disabled=false;submit.textContent="Save changes";}
      });
    });
    renderRows();
  }


  const adminCreateFields = {
    projects:{fields:["client_user_id","title","description","service","status","progress","start_date","due_date"],required:["client_user_id","title"],defaults:{status:"pending",progress:0}},
    quotes:{fields:["client_user_id","enquiry_id","reference","title","description","amount","currency","status","valid_until"],required:["client_user_id","reference","title","amount","currency"],defaults:{currency:"NGN",status:"draft"}},
    invoices:{fields:["client_user_id","project_id","quote_id","reference","description","amount","currency","status","due_date"],required:["client_user_id","reference","description","amount","currency"],defaults:{currency:"NGN",status:"pending"}},
    tickets:{fields:["client_user_id","subject","message","status","priority"],required:["client_user_id","subject","message"],defaults:{status:"open",priority:"normal"}},
    services:{fields:["slug","name","summary","description","active","sort_order"],required:["slug","name"],defaults:{active:true,sort_order:0}},
    posts:{fields:["title","slug","excerpt","body","status","published_at"],required:["title","slug","body"],defaults:{status:"draft"}},
    portfolio:{fields:["title","slug","category","summary","details","url","featured"],required:["title","slug"],defaults:{featured:false}}
  };
  function resourceCreateField(key,required,defaults) {
    const label=esc(key.replaceAll("_"," "));
    if(typeof defaults[key]==="boolean") return '<label class="stc-field stc-admin-edit-check"><input type="checkbox" name="'+esc(key)+'" '+(defaults[key]?'checked':'')+'> '+label+'</label>';
    const long=["description","summary","excerpt","body","details","message"].includes(key);
    const type=["amount","progress","sort_order","enquiry_id","project_id","quote_id"].includes(key)?"number":["start_date","due_date","valid_until","published_at"].includes(key)?"date":"text";
    const value=defaults[key]??"";
    const control=long?'<textarea name="'+esc(key)+'" rows="3" '+(required.includes(key)?"required":"")+'></textarea>':'<input name="'+esc(key)+'" type="'+type+'" value="'+esc(value)+'" '+(required.includes(key)?"required":"")+' '+(type==="number"?'step="any"':'')+'>';
    return '<label class="stc-field">'+label+control+'</label>';
  }
  function bindAdminCreate(resource) {
    const config=adminCreateFields[resource]; if(!config)return;
    const button=$("#stcAdminCreateButton"), modal=$("#stcAdminCreateModal",root());
    if(!button||!modal)return;
    button.addEventListener("click",()=>{
      const fields=config.fields.map(key=>resourceCreateField(key,config.required,config.defaults||{})).join("");
      modal.innerHTML='<div class="stc-admin-edit-card"><div class="stc-admin-panel-heading"><h3>Add '+esc(resourceNames[resource]||resource)+'</h3><button type="button" id="stcAdminCreateClose" aria-label="Close">×</button></div><form id="stcAdminCreateForm">'+fields+'<div class="stc-admin-edit-actions"><button type="button" class="stc-admin-edit-cancel" id="stcAdminCreateCancel">Cancel</button><button type="submit" class="stc-auth-submit">Create record</button></div><p id="stcAdminCreateStatus" class="stc-account-status" aria-live="polite"></p></form></div>';
      modal.classList.remove("hidden");
      const close=()=>modal.classList.add("hidden");
      $("#stcAdminCreateClose",modal).onclick=close;$("#stcAdminCreateCancel",modal).onclick=close;
      $("#stcAdminCreateForm",modal).addEventListener("submit",async event=>{
        event.preventDefault();
        const form=event.currentTarget,submit=$('button[type="submit"]',form);submit.disabled=true;submit.textContent="Creating…";
        const payload={...config.defaults};
        for(const key of config.fields){
          const input=form.elements.namedItem(key);if(!input)continue;
          if(input.type==="checkbox")payload[key]=input.checked;
          else if(input.value.trim()==="")continue;
          else if(input.type==="number")payload[key]=Number(input.value);
          else payload[key]=input.value.trim();
        }
        try{await request("/api/admin/"+encodeURIComponent(resource),{method:"POST",body:JSON.stringify(payload)});modal.classList.add("hidden");await renderDashboard();}
        catch(error){const status=$("#stcAdminCreateStatus",modal);status.textContent=error.message;status.classList.add("is-error");}
        finally{submit.disabled=false;submit.textContent="Create record";}
      });
    });
  }

  function simpleTable(title, rows, columns) {
    const body = (rows || []).slice(0,6).map(row => '<tr>'+columns.map(key=>'<td>'+esc(row[key] ?? "—")+'</td>').join("")+'</tr>').join("");
    return '<section class="stc-dash-panel"><h3>'+esc(title)+'</h3>'+(body ? '<div class="stc-table-wrap"><table><tbody>'+body+'</tbody></table></div>' : '<p class="stc-dash-empty">Nothing to display yet.</p>')+'</section>';
  }
  async function renderDashboard() {
    showAccount('<div class="stc-dashboard-loading">Loading your secure STC workspace…</div>');
    try {
      const me = await request("/api/auth/me");
      const role = me.role || "client";
      const name = me.profile?.full_name || me.user?.email || "STC member";
      const requestedResource = location.hash.split("/")[2] || "";
      let allowedResources = role === "super_admin" ? Object.keys(resourceNames) : (staffResources[role] || []);
      if (role !== "super_admin" && role !== "student" && role !== "client") {
        try { const ownPermissions=await request("/api/staff/my-permissions"); allowedResources=ownPermissions.resources||[]; } catch {}
      }
      if (requestedResource && allowedResources.includes(requestedResource)) {
        const result = await request("/api/admin/"+encodeURIComponent(requestedResource));
        const items = result.items || result.students || [];
        const keys = requestedResource==="staff"?["full_name","phone","department","role","is_active","user_id"]:Object.keys(items[0] || {}).filter(k=>!["raw","content"].includes(k));
        const heading = resourceNames[requestedResource] || requestedResource;
        const columns = keys.slice(0,7).map(key=>'<th>'+esc(key.replaceAll("_"," "))+'</th>').join("");
        const resourceTable = '<section class="stc-dash-panel stc-dash-resource-table"><div class="stc-dash-table-head"><h3>'+esc(heading)+'</h3><span>'+items.length+' records loaded (maximum 100)</span>'+(adminCreateFields[requestedResource]?'<button type="button" id="stcAdminCreateButton" class="stc-admin-edit-button">Add record</button>':'')+'</div><div class="stc-admin-resource-tools"><input id="stcResourceSearch" type="search" placeholder="Search records…" aria-label="Search records">'+(requestedResource==="staff"?'<select id="stcStaffRoleFilter" aria-label="Filter by staff role"><option value="">All roles</option><option value="manager">Operations Manager</option><option value="project_manager">Project Manager</option><option value="finance">Finance Officer</option><option value="support">Customer Support</option><option value="content_editor">Content Editor</option></select><select id="stcStaffStatusFilter" aria-label="Filter by account status"><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Suspended</option></select>':'')+'<span id="stcResourcePage">0 records</span></div><div class="stc-table-wrap"><table><thead><tr>'+columns+'<th>Actions</th>'+'</tr></thead><tbody id="stcResourceRows"></tbody></table></div><div class="stc-admin-pagination"><button type="button" id="stcResourcePrev" disabled>Previous</button><button type="button" id="stcResourceNext" disabled>Next</button></div></section><div id="stcAdminEditModal" class="stc-admin-edit-modal hidden" role="dialog" aria-modal="true" aria-label="Edit record"></div><div id="stcAdminCreateModal" class="stc-admin-edit-modal hidden" role="dialog" aria-modal="true" aria-label="Create record"></div>';
        let staffAssignment = "";
        if (requestedResource === "staff" && role === "super_admin") {
          staffAssignment = '<section class="stc-staff-summary">'+metric("Total staff",items.length)+metric("Active staff",items.filter(x=>x.is_active===true).length)+metric("Suspended staff",items.filter(x=>x.is_active===false).length)+metric("Assigned roles",new Set(items.map(x=>x.role)).size)+'</section><section class="stc-staff-permissions"><div class="stc-admin-panel-heading"><div><h3>Staff role and permission centre</h3><p>Create roles and configure module-by-module Create, Read, Update and Delete access.</p></div></div><div id="stcStaffPermissions" class="stc-staff-permissions-content"><p>Loading permissions…</p></div></section><section class="stc-staff-activity"><div class="stc-admin-panel-heading"><div><h3>Staff administration history</h3><p>Recent role assignments, role changes and suspensions.</p></div></div><div id="stcStaffActivity" class="stc-staff-activity-content"><p>Loading staff activity…</p></div></section><form id="stcAssignStaffForm" class="stc-staff-assignment"><h3>Assign staff responsibilities</h3><p>Search for an existing STC account by name or email, select the correct person, and assign the role they need. Assigning a role activates that staff account.</p><label>Find STC account<input id="stcStaffAccountSearch" type="search" placeholder="Search by name or email address" autocomplete="off" required aria-describedby="stcStaffAccountHelp"><input name="user_id" id="stcStaffSelectedUserId" type="hidden" required><span id="stcStaffAccountHelp" class="stc-staff-account-help">Type at least 2 characters, then select the correct account.</span><div id="stcStaffAccountResults" class="stc-staff-account-results" role="listbox" aria-label="Matching STC accounts"></div><span id="stcStaffAccountSelected" class="stc-staff-account-selected" aria-live="polite"></span></label><label>Staff role<select name="role" id="stcStaffRoleSelect" required><option value="">Loading roles…</option></select></label><button class="stc-auth-submit" type="submit">Assign staff role</button><p id="stcAssignStaffStatus" class="stc-account-status" aria-live="polite"></p></form>';
        }
        showAccount('<div class="stc-dashboard"><header class="stc-dash-top"><a class="stc-auth-brand" href="#home"><img src="/assets/logo.png" alt="STC"><span>STANLEY TECH CONNECT</span></a><div><span>'+esc(roleNames[role]||role)+'</span><button id="stcLogout" type="button">Sign out</button></div></header>'+adminLayoutStart(role,requestedResource)+'<main class="stc-dash-main"><a class="stc-dash-back" href="#dashboard/'+(role==="super_admin"?"admin":"staff")+'">← Back to dashboard</a><div class="stc-dash-welcome"><div><span class="stc-auth-kicker">WORKSPACE MODULE</span><h2>'+esc(heading)+'</h2><p>Records available to your assigned role.</p></div><span class="stc-dash-role">'+esc(roleNames[role]||role)+'</span></div>'+staffAssignment+resourceTable+'</main>'+adminLayoutEnd(role)+'</div>');
        if(role==="super_admin") bindAdminDashboard();
      $("#stcLogout")?.addEventListener("click",()=>{clearSession();location.hash="#account/login";});
        bindAdminResource(items,requestedResource);
        bindAdminCreate(requestedResource);
        if (requestedResource === "staff" && role === "super_admin") {
          Promise.all([
            request("/api/admin/staff/permissions"),
            request("/api/admin/staff/activity")
          ]).then(([permissionData, activityData]) => {
            staffRoleDefinitions = permissionData.roles || [];
            const roleSelect=$("#stcStaffRoleSelect");
            if(roleSelect) roleSelect.innerHTML=staffRoleDefinitions.map(r=>'<option value="'+esc(r.role_key)+'">'+esc(r.label)+'</option>').join("");
            const permissionRoot=$("#stcStaffPermissions");
            const labels={profiles:"User profiles",students:"Student management",clients:"Client management",enrollments:"Training enrolments",certificates:"Certificates",awards:"Awards",enquiries:"Enquiries",projects:"Projects",quotes:"Quotes",invoices:"Invoices",payments:"Payments",tickets:"Support tickets",services:"Services",posts:"Posts & announcements",portfolio:"Portfolio",media:"Media library"};
            if(permissionRoot){
              const roleOptions=staffRoleDefinitions.map(r=>'<option value="'+esc(r.role_key)+'">'+esc(r.label)+'</option>').join("");
              permissionRoot.innerHTML='<div class="stc-role-admin-grid"><form id="stcCreateRoleForm" class="stc-role-create-form"><h4>Create a staff role</h4><label>Role name<input name="label" required maxlength="80" placeholder="e.g. Training Coordinator"></label><label>Role key<input name="role_key" required maxlength="40" pattern="[a-z][a-z0-9_]{1,39}" placeholder="training_coordinator"></label><label>Description<textarea name="description" rows="2" maxlength="500" placeholder="What this role is responsible for"></textarea></label><button class="stc-auth-submit" type="submit">Create role</button><p id="stcCreateRoleStatus" class="stc-account-status" aria-live="polite"></p></form><div class="stc-role-list-panel"><h4>Manage existing roles</h4><div id="stcRoleList"></div></div></div><section class="stc-permission-editor"><div class="stc-admin-panel-heading"><div><h4>Configure role permissions</h4><p>Choose a role, then grant or revoke Create, Read, Update and Delete access for each management area.</p></div><label class="stc-permission-role-select">Selected role<select id="stcPermissionRoleSelect">'+roleOptions+'</select></label></div><div id="stcPermissionGrid"></div><div class="stc-permission-save-row"><span id="stcPermissionSaveStatus" class="stc-account-status" aria-live="polite"></span><button type="button" class="stc-auth-submit" id="stcSavePermissions">Save permissions</button></div></section>';
              const roleList=$("#stcRoleList",permissionRoot);
              const renderRoles=()=>{roleList.innerHTML=staffRoleDefinitions.map(r=>'<article class="stc-role-list-item"><div><strong>'+esc(r.label)+'</strong><small>'+esc(r.role_key)+(r.is_system?' · Built-in role':' · Custom role')+'</small><p>'+esc(r.description||'No description provided.')+'</p></div><div class="stc-role-actions"><button type="button" data-role-edit="'+esc(r.role_key)+'">Edit</button>'+(r.is_system?'':'<button type="button" class="stc-staff-remove-button" data-role-delete="'+esc(r.role_key)+'">Delete</button>')+'</div></article>').join("");};
              renderRoles();
              const rolePicker=$("#stcPermissionRoleSelect",permissionRoot), grid=$("#stcPermissionGrid",permissionRoot);
              const permissionsForRole=()=>permissionData.permissions.filter(p=>p.role_key===rolePicker.value);
              const renderPermissionGrid=()=>{const rows=permissionsForRole();const map=Object.fromEntries(rows.map(p=>[p.resource_key,p]));grid.innerHTML='<div class="stc-table-wrap"><table class="stc-permission-table"><thead><tr><th>Management area</th><th>Create</th><th>Read</th><th>Update</th><th>Delete</th></tr></thead><tbody>'+permissionData.resources.map(resource=>{const p=map[resource]||{},supported=permissionData.capabilities?.[resource]||{};return '<tr><th>'+esc(labels[resource]||resource)+'</th>'+['create','read','update','delete'].map(action=>'<td><label class="stc-permission-check"><input type="checkbox" data-resource="'+esc(resource)+'" data-action="'+action+'" '+(p['can_'+action]?'checked':'')+' '+(!supported[action]?'disabled title="Not currently supported for this module"':'')+' aria-label="'+esc(action)+' '+esc(labels[resource]||resource)+'"><span>'+action+'</span></label></td>').join("")+'</tr>';}).join("")+'</tbody></table></div>';};
              renderPermissionGrid();rolePicker.addEventListener("change",renderPermissionGrid);
              $("#stcSavePermissions",permissionRoot).addEventListener("click",async()=>{const button=$("#stcSavePermissions",permissionRoot),status=$("#stcPermissionSaveStatus",permissionRoot);button.disabled=true;button.textContent="Saving…";try{const permissions=permissionData.resources.map(resource=>{const p=permissionsForRole().find(x=>x.resource_key===resource)||{};const item={resource_key:resource};for(const action of ['create','read','update','delete']){const input=$('input[data-resource="'+resource+'"][data-action="'+action+'"]',grid);item['can_'+action]=Boolean(input?.checked);}return item;});await request("/api/admin/staff/permissions",{method:"PUT",body:JSON.stringify({role_key:rolePicker.value,permissions})});permissionData.permissions=permissionData.permissions.filter(p=>p.role_key!==rolePicker.value).concat(permissions.map(p=>({role_key:rolePicker.value,...p})));status.textContent="Permissions saved and enforced by the server.";status.classList.add("is-success");}catch(error){status.textContent=error.message;status.classList.add("is-error");}finally{button.disabled=false;button.textContent="Save permissions";}});
              $("#stcCreateRoleForm",permissionRoot).addEventListener("submit",async event=>{event.preventDefault();const form=event.currentTarget,button=$('button[type="submit"]',form),status=$("#stcCreateRoleStatus",form);button.disabled=true;try{const payload=Object.fromEntries(new FormData(form).entries());const result=await request("/api/admin/staff/roles",{method:"POST",body:JSON.stringify(payload)});staffRoleDefinitions.push(result.item);permissionData.roles=staffRoleDefinitions;const option=document.createElement("option");option.value=result.item.role_key;option.textContent=result.item.label;rolePicker.append(option);rolePicker.value=result.item.role_key;permissionData.permissions.push(...permissionData.resources.map(resource_key=>({role_key:result.item.role_key,resource_key,can_create:false,can_read:false,can_update:false,can_delete:false})));renderRoles();renderPermissionGrid();form.reset();status.textContent="Role created. Grant its permissions before assigning it to staff.";}catch(error){status.textContent=error.message;status.classList.add("is-error");}finally{button.disabled=false;}});
              roleList.addEventListener("click",async event=>{const edit=event.target.closest("[data-role-edit]"),del=event.target.closest("[data-role-delete]");if(edit){const role=staffRoleDefinitions.find(r=>r.role_key===edit.dataset.roleEdit);const label=window.prompt("Role display name:",role.label);if(label===null)return;const description=window.prompt("Role description:",role.description||"");if(description===null)return;try{const result=await request("/api/admin/staff/roles/"+encodeURIComponent(role.role_key),{method:"PATCH",body:JSON.stringify({label,description})});Object.assign(role,result.item);const option=Array.from(rolePicker.options).find(o=>o.value===role.role_key);if(option)option.textContent=role.label;renderRoles();}catch(error){window.alert(error.message);}}if(del){const role=staffRoleDefinitions.find(r=>r.role_key===del.dataset.roleDelete);if(!window.confirm("Delete the custom role "+role.label+"? This cannot be undone."))return;try{await request("/api/admin/staff/roles/"+encodeURIComponent(role.role_key),{method:"DELETE"});staffRoleDefinitions=staffRoleDefinitions.filter(r=>r.role_key!==role.role_key);permissionData.roles=staffRoleDefinitions;permissionData.permissions=permissionData.permissions.filter(p=>p.role_key!==role.role_key);Array.from(rolePicker.options).find(o=>o.value===role.role_key)?.remove();renderRoles();renderPermissionGrid();}catch(error){window.alert(error.message);}}});
            }
            const activityRoot=$("#stcStaffActivity");
            if(activityRoot){const rows=activityData.items||[];activityRoot.innerHTML=rows.length?'<div class="stc-table-wrap"><table><thead><tr><th>Date</th><th>Action</th><th>Staff account ID</th><th>Details</th></tr></thead><tbody>'+rows.map(item=>'<tr><td>'+esc(item.created_at?new Date(item.created_at).toLocaleString():"—")+'</td><td>'+esc(item.action||"—")+'</td><td><code>'+esc(item.entity_id||"—")+'</code></td><td>'+esc(JSON.stringify(item.details||{}))+'</td></tr>').join("")+'</tbody></table></div>':'<p class="stc-dash-empty">No staff administration activity has been recorded yet.</p>';}
          }).catch(error => {
            const permissionRoot=$("#stcStaffPermissions"),activityRoot=$("#stcStaffActivity");
            if(permissionRoot)permissionRoot.innerHTML='<p class="stc-account-status is-error">'+esc(error.message)+'</p>';
            if(activityRoot)activityRoot.innerHTML='<p class="stc-account-status is-error">'+esc(error.message)+'</p>';
          });

        }
        const assignForm = $("#stcAssignStaffForm");
        if (assignForm) {
          const search = $("#stcStaffAccountSearch");
          const selectedId = $("#stcStaffSelectedUserId");
          const results = $("#stcStaffAccountResults");
          const selectedLabel = $("#stcStaffAccountSelected");
          let lookupTimer = null;
          let lookupSequence = 0;
          search?.addEventListener("input", () => {
            clearTimeout(lookupTimer);
            selectedId.value = "";
            selectedLabel.textContent = "";
            results.innerHTML = "";
            const term = search.value.trim();
            if (term.length < 2) return;
            results.innerHTML = '<p class="stc-staff-account-empty">Searching accounts…</p>';
            lookupTimer = setTimeout(async () => {
              const sequence = ++lookupSequence;
              try {
                const data = await request("/api/admin/staff/accounts?q=" + encodeURIComponent(term));
                if (sequence !== lookupSequence || search.value.trim() !== term) return;
                results.innerHTML = data.accounts.length ? data.accounts.map(item =>
                  '<button type="button" class="stc-staff-account-option" data-user-id="'+esc(item.user_id)+'" data-account-name="'+esc(item.name)+'" data-account-email="'+esc(item.email)+'"><strong>'+esc(item.name)+'</strong><span>'+esc(item.email)+'</span><small>'+esc(item.account_type)+(item.department?' · '+esc(item.department):'')+'</small></button>'
                ).join("") : '<p class="stc-staff-account-empty">No matching STC account found.</p>';
              } catch (error) {
                if (sequence === lookupSequence) results.innerHTML = '<p class="stc-staff-account-empty is-error">'+esc(error.message)+'</p>';
              }
            }, 250);
          });
          results?.addEventListener("click", event => {
            const option = event.target.closest("[data-user-id]");
            if (!option) return;
            selectedId.value = option.dataset.userId;
            search.value = option.dataset.accountName + " — " + option.dataset.accountEmail;
            selectedLabel.textContent = "Selected account: " + option.dataset.accountName + " (" + option.dataset.accountEmail + ")";
            results.innerHTML = "";
          });
        }
        assignForm?.addEventListener("submit", async event => {
          event.preventDefault();
          const submit = $("button[type=submit]", assignForm);
          submit.disabled = true;
          try {
            const payload = Object.fromEntries(new FormData(assignForm).entries());
            await request("/api/admin/staff", { method:"POST", body:JSON.stringify(payload) });
            const status = $("#stcAssignStaffStatus");
            status.textContent = "Staff role assigned successfully.";
            status.classList.add("is-success");
            assignForm.reset();
            setTimeout(() => location.hash = "#dashboard/staff/staff", 700);
          } catch (error) {
            const status = $("#stcAssignStaffStatus");
            status.textContent = error.message;
            status.classList.add("is-error");
          } finally { submit.disabled = false; }
        });
        return;
      }
      let content = "";
      if (role === "student") {
        const data = await request("/api/student/dashboard");
        content = '<div class="stc-dash-welcome"><div><span class="stc-auth-kicker">STUDENT WORKSPACE</span><h2>Welcome, '+esc(name)+'</h2><p>'+esc(data.profile?.institution || "Your learning journey with STC starts here.")+'</p></div><span class="stc-dash-role">STUDENT</span></div><div class="stc-dash-metrics">'+metric("Training applications",data.enrollments.length)+metric("Certificates",data.certificates.length)+metric("Awards",data.awards.length)+metric("Notifications",data.notifications.length)+'</div><div class="stc-dash-grid">'+simpleTable("My training applications",data.enrollments,["course_name","mode","status","created_at"])+simpleTable("My certificates",data.certificates,["certificate_number","programme","issued_at"])+simpleTable("My awards",data.awards,["award_number","award_title","issued_at"])+simpleTable("Recent notifications",data.notifications,["title","message","created_at"])+'</div>';
      } else if (role === "client") {
        const data = await request("/api/client/dashboard");
        content = '<div class="stc-dash-welcome"><div><span class="stc-auth-kicker">CLIENT WORKSPACE</span><h2>Welcome, '+esc(name)+'</h2><p>Keep track of your STC projects, service requests and payments.</p></div><span class="stc-dash-role">CLIENT</span></div><div class="stc-dash-metrics">'+metric("Projects",data.projects.length)+metric("Quotes",data.quotes.length)+metric("Invoices",data.invoices.length)+metric("Open support",data.tickets.filter(x=>x.status!=="closed").length)+'</div><div class="stc-dash-grid">'+simpleTable("My projects",data.projects,["title","service","status","progress"])+simpleTable("My quotes",data.quotes,["reference","title","amount","status"])+simpleTable("My invoices",data.invoices,["reference","description","amount","status"])+simpleTable("Support requests",data.tickets,["subject","priority","status","created_at"])+'</div>';
      } else {
        const resources = allowedResources;
        let overview = null;
        if (["super_admin","manager"].includes(role)) overview = await request("/api/admin/dashboard");
        const collections = role === "super_admin" ? [] : await Promise.all(resources.filter(x=>x!=="profiles"&&x!=="enrollments"&&x!=="certificates"&&x!=="awards"&&x!=="media").map(async resource => {
          try { const result=await request("/api/admin/"+resource); return {resource,items:result.items||[]}; }
          catch(error) { return {resource,items:[],error:error.message}; }
        }));
        const metrics = overview?.metrics || {};
        if (role === "super_admin") {
          const metricLabels = { enquiries:"Enquiries",projects:"Projects",invoices:"Invoices",tickets:"Support tickets" };
          const priorityMetrics = ["enquiries","projects","invoices","tickets"];
          const cards = priorityMetrics.map(key=>metric(metricLabels[key],metrics[key] ?? 0)).join("");
          const analytics = overview?.analytics || {};
          const attentionSignals = [
            {label:"Enquiries awaiting response",resource:"enquiries",values:analytics.enquiry_status,match:/new|pending|unanswered|open/i},
            {label:"Projects needing attention",resource:"projects",values:analytics.project_status,match:/blocked|delayed|on_hold|at_risk/i},
            {label:"Invoices awaiting payment",resource:"invoices",values:analytics.payment_status,match:/pending|overdue|unpaid/i},
            {label:"Open support tickets",resource:"tickets",values:analytics.ticket_status,match:/open|pending|unresolved/i}
          ];
          const attentionRows = attentionSignals.map(signal=>{
            const entries=Object.entries(signal.values||{});
            const count=entries.reduce((sum,[label,value])=>sum+(signal.match.test(label)?Number(value)||0:0),0);
            return { ...signal,count,available:entries.length>0 };
          });
          const availableAttention=attentionRows.filter(item=>item.available);
          const attentionTotal=availableAttention.reduce((sum,item)=>sum+item.count,0);
          const attention = '<section class="stc-admin-attention"><div class="stc-admin-attention-heading"><div><span class="stc-admin-eyebrow">FOLLOW-UP</span><h3>Needs attention</h3></div><span class="stc-admin-attention-total">'+(availableAttention.length?attentionTotal.toLocaleString():"—")+'</span></div>'+(availableAttention.length?'<div class="stc-admin-attention-list">'+attentionRows.filter(item=>item.available).map(item=>'<a href="#dashboard/admin/'+item.resource+'"><span>'+esc(item.label)+'</span><strong>'+item.count.toLocaleString()+'</strong><span aria-hidden="true">›</span></a>').join("")+'</div>':'<p class="stc-admin-attention-empty">Status summaries are not available yet. Open a management section to review records.</p>')+'</section>';
          const chart = attention+'<div class="stc-admin-customize-row"><div><span class="stc-admin-eyebrow">STC ANALYTICS</span><strong>Dashboard charts</strong></div><div class="stc-admin-dashboard-tools"><label class="stc-admin-period-filter">Monthly trend <select id="stcAdminChartPeriod" aria-label="Monthly activity chart period"><option value="3">Last 3 months</option><option value="6" selected>Last 6 months</option><option value="all">All available</option></select></label><button type="button" id="stcAdminCustomize" aria-expanded="false">Customize charts</button></div></div><div class="stc-admin-layout-controls" id="stcAdminLayoutControls" hidden><label>Chart columns <select data-layout-columns><option value="2">Two columns</option><option value="3">Three columns</option></select></label><label><input type="checkbox" data-layout-compact> Compact chart cards</label><button type="button" data-layout-reset>Reset chart layout</button></div><div class="stc-admin-chart-grid" id="stcAdminChartGrid">'+adminChartPanel("Monthly activity (recent six months)",analytics.monthly_activity,"monthly","line","",true)+adminChartPanel("Project status",analytics.project_status,"project","donut")+adminChartPanel("Enquiry status",analytics.enquiry_status,"enquiry","donut")+adminChartPanel("Payment status",analytics.payment_status,"payment","donut")+'</div>';
          content = '<div class="stc-admin-welcome"><div><span class="stc-admin-eyebrow">STC CONTROL CENTRE</span><h2>Good day, '+esc(name)+'</h2><p>Your business overview at a glance.</p></div><div class="stc-admin-welcome-meta"><span class="stc-admin-live-dot"></span><span>Administrator access</span><small>'+new Date().toLocaleDateString(undefined,{weekday:"long",day:"numeric",month:"long",year:"numeric"})+'</small></div></div><div class="stc-dash-metrics stc-admin-metrics">'+cards+'</div>'+chart;
        } else {
          const cards = overview ? Object.entries(metrics).map(([k,v])=>metric(k.replaceAll("_"," "),v)).join("") : collections.map(x=>metric(resourceNames[x.resource]||x.resource,x.items.length)).join("");
          const nav = resources.map(resource=>'<a href="#dashboard/staff/'+encodeURIComponent(resource)+'">'+esc(resourceNames[resource]||resource)+'</a>').join("");
          content = '<div class="stc-dash-welcome"><div><span class="stc-auth-kicker">STAFF WORKSPACE</span><h2>Welcome, '+esc(name)+'</h2><p>Your workspace is configured for your assigned responsibilities.</p></div><span class="stc-dash-role">'+esc(roleNames[role]||role)+'</span></div><nav class="stc-dash-resource-nav">'+nav+'</nav><div class="stc-dash-metrics">'+cards+'</div><div class="stc-dash-grid">'+collections.slice(0,4).map(x=>simpleTable(resourceNames[x.resource]||x.resource,x.items,Object.keys(x.items[0]||{}).slice(0,4))).join("")+'</div>';
        }
      }
      showAccount('<div class="stc-dashboard"><header class="stc-dash-top"><a class="stc-auth-brand" href="#home"><img src="/assets/logo.png" alt="STC"><span>STANLEY TECH CONNECT</span></a><div><span>'+esc(roleNames[role]||role)+'</span><button id="stcLogout" type="button">Sign out</button></div></header>'+adminLayoutStart(role,"")+'<main class="stc-dash-main">'+content+'<div class="stc-dash-footer"><a href="#account/change-password">Change password</a><a href="#home">Visit public website</a></div></main>'+adminLayoutEnd(role)+'</div>');
      if (role === "super_admin") bindAdminDashboard();
      $("#stcLogout")?.addEventListener("click",()=>{clearSession();location.hash="#account/login";});
    } catch (error) {
      if (error.status === 401) clearSession();
      const expired = error.status === 401;
      showAccount('<div class="stc-auth-card stc-dashboard-error"><span class="stc-auth-kicker">WORKSPACE UNAVAILABLE</span><h2>'+(expired?'Your session has expired':'Your sign-in was successful, but the dashboard could not finish loading')+'</h2><p>'+esc(error.message)+'</p>'+(expired?'<a class="stc-auth-submit stc-auth-link-button" href="#account/login">Sign in again</a>':'<a class="stc-auth-submit stc-auth-link-button" href="#dashboard">Try loading dashboard again</a>')+'</div>');
    }
  }
  function render() {
    const hash = location.hash || "";
    const queryReset = new URLSearchParams(location.search).get("password-reset") === "1";
    if (queryReset || new URLSearchParams(location.search).has("token")) return renderReset();
    if (hash === "#account/login") return renderLogin();
    if (hash === "#account/register") return renderRegister();
    if (hash === "#account/forgot-password") return renderForgot();
    if (hash.startsWith("#account/reset-password")) return renderReset();
    if (hash === "#account/change-password") return renderChangePassword();
    if (hash === "#dashboard" || hash.startsWith("#dashboard/")) return renderDashboard();
    if (!hash.startsWith("#account/") && !hash.startsWith("#dashboard/") && hash !== "#dashboard") {
      const el = document.getElementById(rootId);
      if (el) el.classList.add("hidden");
      $("#siteHeader")?.classList.remove("hidden");
      $("#stcAnnouncementBar")?.classList.remove("hidden");
      $("#siteFooter")?.classList.remove("hidden");
      if (!hash || hash === "#home") {
        $("#publicSite")?.classList.remove("hidden");
        $("#pageView")?.classList.add("hidden");
      }
    }
  }
  window.addEventListener("hashchange", render);
  window.addEventListener("pageshow", render);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render, { once:true });
  else render();
  window.STCAccount = { render, logout:clearSession };
})();
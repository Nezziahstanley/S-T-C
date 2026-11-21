(() => {
  const rootId = "accountRoot";
  const accessKey = "stc_access_token";
  const refreshKey = "stc_refresh_token";
  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
  const token = () => sessionStorage.getItem(accessKey) || "";
  const saveSession = data => {
    if (data?.access_token) sessionStorage.setItem(accessKey, data.access_token);
    if (data?.refresh_token) sessionStorage.setItem(refreshKey, data.refresh_token);
  };
  const clearSession = () => { sessionStorage.removeItem(accessKey); sessionStorage.removeItem(refreshKey); };
  async function request(url, options = {}, bearer = token()) {
    const headers = { "Content-Type":"application/json", ...(options.headers || {}) };
    if (bearer) headers.Authorization = "Bearer " + bearer;
    const response = await fetch(url, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "The request could not be completed.");
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
      const result = await request("/api/auth/password/sign-in", { method:"POST", body:JSON.stringify({ email:data.get("email"), password:data.get("password") }) }, "");
      saveSession(result);
      location.hash = result.role === "super_admin" ? "#dashboard/admin" : ["manager","project_manager","finance","support","content_editor"].includes(result.role) ? "#dashboard/staff" : result.role === "student" ? "#dashboard/student" : "#dashboard/client";
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
      const result = await request("/api/auth/register", { method:"POST", body:JSON.stringify(Object.fromEntries(data.entries())) }, "");
      if (result.access_token) {
        saveSession(result);
        setStatus("stcRegisterFormStatus", result.message);
        setTimeout(() => location.hash = result.role === "student" ? "#dashboard/student" : "#dashboard/client", 900);
      } else {
        setStatus("stcRegisterFormStatus", result.message);
        $("#stcRegisterForm").reset(); sync();
      }
    });
  }
  function renderForgot() {
    showAccount(shell(
      '<span class="stc-auth-kicker">ACCOUNT RECOVERY</span><h2>Forgot your password?</h2><p class="stc-auth-subtitle">Enter the email address linked to your STC account. We’ll send a secure reset link if an account exists.</p><form id="stcForgotForm" class="stc-auth-form">'+field("Email address","email","email","name@example.com",'required autocomplete="email"')+'<button class="stc-auth-submit" type="submit">Send reset link <span>→</span></button>'+status("stcForgotFormStatus")+'</form><p class="stc-auth-footnote"><a href="#account/login">← Back to sign in</a></p>'
    ));
    bindForm("stcForgotForm", async data => {
      const result = await request("/api/auth/password/reset", { method:"POST", body:JSON.stringify({ email:data.get("email") }) }, "");
      setStatus("stcForgotFormStatus", result.message);
    });
  }
  function recoveryToken() {
    const params = new URLSearchParams(location.hash.replace(/^#/,""));
    return params.get("access_token") || "";
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
      const result = await request("/api/auth/password/update", { method:"POST", body:JSON.stringify({ password:data.get("password") }) }, recovery);
      history.replaceState(null, "", location.pathname);
      clearSession();
      setStatus("stcResetFormStatus", result.message + " You can now sign in.");
      setTimeout(() => location.hash = "#account/login", 1600);
    });
  }
  function renderChangePassword() {
    showAccount(shell(
      '<span class="stc-auth-kicker">ACCOUNT SECURITY</span><h2>Change password</h2><p class="stc-auth-subtitle">Choose a strong password you have not used elsewhere.</p><form id="stcChangeForm" class="stc-auth-form">'+field("New password","password","password","At least 10 characters",'required minlength="10" maxlength="128" autocomplete="new-password"')+field("Confirm new password","confirm_password","password","Enter it again",'required minlength="10" maxlength="128" autocomplete="new-password"')+'<button class="stc-auth-submit" type="submit">Save new password <span>→</span></button>'+status("stcChangeFormStatus")+'</form><p class="stc-auth-footnote"><a href="#dashboard">← Back to dashboard</a></p>'
    ));
    bindForm("stcChangeForm", async data => {
      if (data.get("password") !== data.get("confirm_password")) throw new Error("The passwords do not match.");
      const result = await request("/api/auth/password/update", { method:"POST", body:JSON.stringify({ password:data.get("password") }) });
      setStatus("stcChangeFormStatus", result.message);
    });
  }
  const staffResources = {
    manager:["enquiries","projects","quotes","invoices","payments","tickets","services","posts","portfolio","media","profiles","enrollments","certificates","awards"],
    project_manager:["enquiries","projects","tickets"],
    finance:["quotes","invoices","payments"],
    support:["enquiries","tickets"],
    content_editor:["services","posts","portfolio","media"]
  };
  const roleNames = { super_admin:"Administrator",manager:"Operations Manager",project_manager:"Project Manager",finance:"Finance Officer",support:"Customer Support",content_editor:"Content Editor",student:"Student",client:"Client" };
  const resourceNames = { enquiries:"Enquiries",projects:"Projects",quotes:"Quotes",invoices:"Invoices",payments:"Payments",tickets:"Support Tickets",services:"Services",posts:"Posts",portfolio:"Portfolio",media:"Media",profiles:"Profiles",enrollments:"Training Enrolments",certificates:"Certificates",awards:"Awards" };
  function metric(label,value) { return '<article class="stc-dash-metric"><small>'+esc(label)+'</small><strong>'+esc(value ?? 0)+'</strong></article>'; }
  function simpleTable(title, rows, columns) {
    const body = (rows || []).slice(0,6).map(row => '<tr>'+columns.map(key=>'<td>'+esc(row[key] ?? "—")+'</td>').join("")+'</tr>').join("");
    return '<section class="stc-dash-panel"><h3>'+esc(title)+'</h3>'+(body ? '<div class="stc-table-wrap"><table><tbody>'+body+'</tbody></table></div>' : '<p class="stc-dash-empty">Nothing to display yet.</p>')+'</section>';
  }
  async function renderDashboard() {
    if (!token()) { location.hash="#account/login"; return; }
    showAccount('<div class="stc-dashboard-loading">Loading your secure STC workspace…</div>');
    try {
      const me = await request("/api/auth/me");
      const role = me.role || "client";
      const name = me.profile?.full_name || me.user?.email || "STC member";
      const requestedResource = location.hash.split("/")[2] || "";
      const allowedResources = role === "super_admin" ? Object.keys(resourceNames) : (staffResources[role] || []);
      if (requestedResource && allowedResources.includes(requestedResource)) {
        const result = await request("/api/admin/"+encodeURIComponent(requestedResource));
        const items = result.items || [];
        const keys = Object.keys(items[0] || {});
        const rows = items.slice(0,100).map(item => "<tr>"+keys.map(key=>"<td>"+esc(item[key] ?? "—")+"</td>").join("")+"</tr>").join("");
        const heading = resourceNames[requestedResource] || requestedResource;
        showAccount('<div class="stc-dashboard"><header class="stc-dash-top"><a class="stc-auth-brand" href="#home"><img src="/assets/logo.png" alt="STC"><span>STANLEY TECH CONNECT</span></a><div><span>'+esc(roleNames[role]||role)+'</span><button id="stcLogout" type="button">Sign out</button></div></header><main class="stc-dash-main"><a class="stc-dash-back" href="#dashboard/'+(role==="super_admin"?"admin":"staff")+'">← Back to dashboard</a><div class="stc-dash-welcome"><div><span class="stc-auth-kicker">WORKSPACE MODULE</span><h2>'+esc(heading)+'</h2><p>Records available to your assigned role.</p></div><span class="stc-dash-role">'+esc(roleNames[role]||role)+'</span></div><section class="stc-dash-panel stc-dash-resource-table"><div class="stc-dash-table-head"><h3>'+esc(heading)+'</h3><span>'+items.length+' records loaded</span></div>'+(rows?'<div class="stc-table-wrap"><table><thead><tr>'+keys.map(k=>'<th>'+esc(k.replaceAll("_"," "))+'</th>').join("")+'</tr></thead><tbody>'+rows+'</tbody></table></div>':'<p class="stc-dash-empty">No records available in this section yet.</p>')+'</section></main></div>');
        $("#stcLogout")?.addEventListener("click",()=>{clearSession();location.hash="#account/login";});
        return;
      }
      let content = "";
      if (role === "student") {
        const data = await request("/api/student/dashboard");
        content = '<div class="stc-dash-welcome"><div><span class="stc-auth-kicker">STUDENT WORKSPACE</span><h2>Welcome, '+esc(name)+'</h2><p>'+esc(data.profile?.institution || "Your learning journey with STC starts here.")+'</p></div><span class="stc-dash-role">STUDENT</span></div><div class="stc-dash-metrics">'+metric("Training applications",data.enrollments.length)+metric("Certificates",data.certificates.length)+metric("Awards",data.awards.length)+metric("Notifications",data.notifications.length)+'</div><div class="stc-dash-grid">'+simpleTable("My training applications",data.enrollments,["course_name","mode","status","created_at"])+simpleTable("My certificates",data.certificates,["certificate_number","course_name","issued_at"])+simpleTable("My awards",data.awards,["award_number","award_title","issued_at"])+simpleTable("Recent notifications",data.notifications,["title","message","created_at"])+'</div>';
      } else if (role === "client") {
        const data = await request("/api/client/dashboard");
        content = '<div class="stc-dash-welcome"><div><span class="stc-auth-kicker">CLIENT WORKSPACE</span><h2>Welcome, '+esc(name)+'</h2><p>Keep track of your STC projects, service requests and payments.</p></div><span class="stc-dash-role">CLIENT</span></div><div class="stc-dash-metrics">'+metric("Projects",data.projects.length)+metric("Quotes",data.quotes.length)+metric("Invoices",data.invoices.length)+metric("Open support",data.tickets.filter(x=>x.status!=="closed").length)+'</div><div class="stc-dash-grid">'+simpleTable("My projects",data.projects,["title","service","status","progress"])+simpleTable("My quotes",data.quotes,["reference","title","amount","status"])+simpleTable("My invoices",data.invoices,["reference","description","amount","status"])+simpleTable("Support requests",data.tickets,["subject","priority","status","created_at"])+'</div>';
      } else {
        const resources = role === "super_admin" ? Object.keys(resourceNames) : (staffResources[role] || []);
        let overview = null;
        if (["super_admin","manager"].includes(role)) overview = await request("/api/admin/dashboard");
        const collections = await Promise.all(resources.filter(x=>x!=="profiles"&&x!=="enrollments"&&x!=="certificates"&&x!=="awards"&&x!=="media").map(async resource => {
          try { const result=await request("/api/admin/"+resource); return {resource,items:result.items||[]}; }
          catch(error) { return {resource,items:[],error:error.message}; }
        }));
        const metrics = overview?.metrics || {};
        const cards = overview ? Object.entries(metrics).map(([k,v])=>metric(k.replaceAll("_"," "),v)).join("") : collections.map(x=>metric(resourceNames[x.resource]||x.resource,x.items.length)).join("");
        const nav = resources.map(resource=>'<a href="#dashboard/staff/'+encodeURIComponent(resource)+'">'+esc(resourceNames[resource]||resource)+'</a>').join("");
        content = '<div class="stc-dash-welcome"><div><span class="stc-auth-kicker">STAFF WORKSPACE</span><h2>Welcome, '+esc(name)+'</h2><p>Your workspace is configured for your assigned responsibilities.</p></div><span class="stc-dash-role">'+esc(roleNames[role]||role)+'</span></div><nav class="stc-dash-resource-nav">'+nav+'</nav><div class="stc-dash-metrics">'+cards+'</div><div class="stc-dash-grid">'+collections.slice(0,4).map(x=>simpleTable(resourceNames[x.resource]||x.resource,x.items,Object.keys(x.items[0]||{}).slice(0,4))).join("")+'</div>';
      }
      showAccount('<div class="stc-dashboard"><header class="stc-dash-top"><a class="stc-auth-brand" href="#home"><img src="/assets/logo.png" alt="STC"><span>STANLEY TECH CONNECT</span></a><div><span>'+esc(roleNames[role]||role)+'</span><button id="stcLogout" type="button">Sign out</button></div></header><main class="stc-dash-main">'+content+'<div class="stc-dash-footer"><a href="#account/change-password">Change password</a><a href="#home">Visit public website</a></div></main></div>');
      $("#stcLogout")?.addEventListener("click",()=>{clearSession();location.hash="#account/login";});
    } catch (error) {
      clearSession();
      showAccount('<div class="stc-auth-card stc-dashboard-error"><span class="stc-auth-kicker">WORKSPACE UNAVAILABLE</span><h2>We could not load your dashboard</h2><p>'+esc(error.message)+'</p><a class="stc-auth-submit stc-auth-link-button" href="#account/login">Sign in again</a></div>');
    }
  }
  function render() {
    const hash = location.hash || "";
    const queryReset = new URLSearchParams(location.search).get("password-reset") === "1";
    if (queryReset) return renderReset();
    if (hash === "#account/login") return renderLogin();
    if (hash === "#account/register") return renderRegister();
    if (hash === "#account/forgot-password") return renderForgot();
    if (hash === "#account/reset-password") return renderReset();
    if (hash === "#account/change-password") return token() ? renderChangePassword() : (location.hash="#account/login");
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
  document.addEventListener("DOMContentLoaded", render);
  window.STCAccount = { render, logout:clearSession };
})();
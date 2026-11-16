import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.0";

const $ = (selector) => document.querySelector(selector);
const status = $("#adminStatus");
let supabase = null;
let activeSession = null;
let codeEmail = "";

function message(text, isError = false) {
  status.textContent = text || "";
  status.classList.toggle("error", isError);
}
function setMode(mode) {
  $("#passwordForm").classList.toggle("hidden", mode !== "password");
  $("#codeRequestForm").classList.toggle("hidden", mode !== "code" || Boolean(codeEmail));
  $("#codeVerifyForm").classList.toggle("hidden", mode !== "code" || !codeEmail);
  document.querySelectorAll(".method-tab").forEach(button => {
    const selected = button.dataset.mode === mode;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", String(selected));
  });
  message("");
}
async function requestApi(path, body) {
  const response = await fetch(path, {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(body)
  });
  const data = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(data.error || "The request could not be completed.");
  return data;
}
async function authorizeAdmin(session) {
  if (!session?.access_token) throw new Error("No valid sign-in session was returned.");
  const response = await fetch("/api/auth/me", {headers:{Authorization:"Bearer "+session.access_token}});
  const me = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(me.error || "Could not verify your STC account.");
  if (!(me.is_admin || (me.role && me.role !== "client"))) {
    if (supabase) await supabase.auth.signOut().catch(()=>{});
    throw new Error("This account does not have STC administrator or staff permissions.");
  }
  activeSession = session;
  sessionStorage.setItem("stc_token", session.access_token);
  message("Login successful. Opening the STC admin dashboard…");
  location.replace("/?admin=1");
}
async function init() {
  $("#year").textContent = new Date().getFullYear();
  try {
    const response = await fetch("/api/public/auth-config", {cache:"no-store"});
    const config = await response.json();
    if (!response.ok) throw new Error(config.error || "Could not load sign-in configuration.");
    supabase = createClient(config.supabaseUrl, config.publishableKey, {
      auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,experimental:{passkey:true}}
    });
  } catch (error) {
    message(error.message + " Password and email-code login are still available.", true);
  }
  document.querySelectorAll(".method-tab").forEach(button => button.addEventListener("click",()=>setMode(button.dataset.mode)));
  $("#passwordForm").addEventListener("submit", async event => {
    event.preventDefault();
    const email=$("#adminEmail").value.trim().toLowerCase(), password=$("#adminPassword").value;
    message("Checking your administrator credentials…");
    try {
      const result=await requestApi("/api/auth/password/sign-in",{email,password});
      await authorizeAdmin(result);
    } catch(error) { message(error.message,true); }
  });
  $("#codeRequestForm").addEventListener("submit", async event => {
    event.preventDefault();
    codeEmail=$("#codeEmail").value.trim().toLowerCase();
    message("Requesting a secure email code…");
    try {
      const result=await requestApi("/api/auth/request-code",{email:codeEmail});
      $("#codeRequestForm").classList.add("hidden");
      $("#codeVerifyForm").classList.remove("hidden");
      message(result.message || "Check your inbox for the verification code.");
      $("#adminCode").focus();
    } catch(error) { codeEmail=""; message(error.message,true); }
  });
  $("#codeVerifyForm").addEventListener("submit", async event => {
    event.preventDefault();
    message("Verifying your email code…");
    try {
      const result=await requestApi("/api/auth/verify-code",{email:codeEmail,token:$("#adminCode").value.trim()});
      await authorizeAdmin(result);
    } catch(error) { message(error.message,true); }
  });
  $("#changeCodeEmail").addEventListener("click",()=>{codeEmail="";$("#codeRequestForm").classList.remove("hidden");$("#codeVerifyForm").classList.add("hidden");message("");});
  $("#forgotPassword").addEventListener("click",async()=>{
    const email=$("#adminEmail").value.trim().toLowerCase();
    if(!email){message("Enter your administrator email first.",true);return;}
    message("Requesting a password reset link…");
    try {const result=await requestApi("/api/auth/password/reset",{email});message(result.message);}
    catch(error){message(error.message,true);}
  });
  $("#passkeySignIn").addEventListener("click",async()=>{
    if(!supabase){message("Passkey sign-in is not configured. Check the Supabase Passkeys settings.",true);return;}
    if(!window.isSecureContext || !("PublicKeyCredential" in window)){message("Passkeys require a supported browser and secure HTTPS connection.",true);return;}
    message("Waiting for your device to verify your passkey…");
    try {
      const {data,error}=await supabase.auth.signInWithPasskey();
      if(error) throw error;
      await authorizeAdmin(data.session);
    } catch(error) {message(error.message || "Passkey verification failed.",true);}
  });
  $("#registerPasskey").addEventListener("click",async()=>{
    if(!supabase || !activeSession){message("Sign in with your admin password or email code first.",true);return;}
    message("Preparing passkey registration…");
    try {
      const {error:sessionError}=await supabase.auth.setSession({
        access_token:activeSession.access_token,
        refresh_token:activeSession.refresh_token
      });
      if(sessionError) throw sessionError;
      const {data,error}=await supabase.auth.registerPasskey();
      if(error) throw error;
      message("Passkey registered successfully on this device.");
      $("#registerPasskey").textContent="✓ Passkey registered";
      $("#registerPasskey").disabled=true;
    } catch(error) {message(error.message || "Could not register this passkey.",true);}
  });
  $("#openDashboard").addEventListener("click",()=>{location.href="/?admin=1";});
}
init();

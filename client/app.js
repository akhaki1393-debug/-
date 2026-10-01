const $ = s => document.querySelector(s);
let token = localStorage.getItem("gapino_token");
let me = JSON.parse(localStorage.getItem("gapino_user") || "null");
let socket = null, activeUser = null, typingTimer = null;

function toast(msg){const el=$("#toast");el.textContent=msg;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2600)}
async function api(url, opts={}) {
  const res = await fetch(url,{...opts,headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})}});
  const data = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error||"خطا");
  return data;
}
function showAuth(){ $("#auth").classList.remove("hidden");$("#app").classList.add("hidden");}
function showApp(){ $("#auth").classList.add("hidden");$("#app").classList.remove("hidden"); connect(); loadConversations(); }
function initials(name){return (name||"گ").trim().slice(0,1)}
function userRow(u, click){
  const d=document.createElement("div");d.className="result";
  d.innerHTML=`<div class="avatar">${initials(u.display_name)}</div><div class="meta"><b>${escapeHtml(u.display_name)}</b><span>@${escapeHtml(u.username)}</span></div>`;
  d.onclick=click;return d;
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function formatTime(x){return new Date(x).toLocaleTimeString("fa-IR",{hour:"2-digit",minute:"2-digit"})}

async function loadConversations(){
  try{
    const {conversations}=await api("/api/conversations");
    const box=$("#conversations");box.innerHTML="";
    conversations.forEach(u=>{
      const d=document.createElement("div");d.className="conversation";
      d.innerHTML=`<div class="avatar">${initials(u.display_name)}</div><div class="meta"><b>${escapeHtml(u.display_name)}</b><span>${escapeHtml(u.last_message||"گفتگو را شروع کنید")}</span></div>`;
      d.onclick=()=>openChat(u);box.appendChild(d);
    });
  }catch(e){toast(e.message)}
}
async function openChat(u){
  activeUser=u;$("#emptyChat").classList.add("hidden");$("#profilePanel").classList.add("hidden");$("#chatPanel").classList.remove("hidden");
  $(".app").classList.add("chat-open");$("#chatName").textContent=u.display_name;$("#chatStatus").textContent="آفلاین";$("#messages").innerHTML="";
  try{const {messages}=await api(`/api/messages/${u.id}`);messages.forEach(renderMessage);scrollBottom()}catch(e){toast(e.message)}
}
function renderMessage(m){
  const wrap=document.createElement("div");wrap.className="bubble "+(Number(m.sender_id)===Number(me.id)?"mine":"theirs");
  wrap.innerHTML=`<div>${escapeHtml(m.body)}</div><div class="time">${formatTime(m.created_at)}</div>`;
  $("#messages").appendChild(wrap);
}
function scrollBottom(){const x=$("#messages");x.scrollTop=x.scrollHeight}
function connect(){
  if(socket) socket.disconnect();
  socket=io({auth:{token}});
  socket.on("connect",()=>console.log("connected"));
  socket.on("connect_error",()=>{toast("ارتباط لحظه‌ای برقرار نشد.");});
  socket.on("new_message",m=>{
    if(activeUser && (Number(m.sender_id)===Number(activeUser.id)||Number(m.receiver_id)===Number(activeUser.id))){renderMessage(m);scrollBottom();}
    loadConversations();
  });
  socket.on("typing",d=>{
    if(activeUser && Number(d.userId)===Number(activeUser.id)){ $("#typing").classList.toggle("hidden",!d.typing); }
  });
  socket.on("presence",d=>{
    if(activeUser && Number(d.userId)===Number(activeUser.id)) $("#chatStatus").textContent=d.online?"آنلاین":"آفلاین";
  });
}
$("#loginForm").onsubmit=async e=>{e.preventDefault();try{const d=await api("/api/auth/login",{method:"POST",body:JSON.stringify({username:$("#loginUser").value,password:$("#loginPass").value})});token=d.token;me=d.user;localStorage.setItem("gapino_token",token);localStorage.setItem("gapino_user",JSON.stringify(me));showApp()}catch(x){toast(x.message)}};
$("#registerForm").onsubmit=async e=>{e.preventDefault();try{const d=await api("/api/auth/register",{method:"POST",body:JSON.stringify({displayName:$("#regName").value,username:$("#regUser").value,email:$("#regEmail").value,password:$("#regPass").value})});token=d.token;me=d.user;localStorage.setItem("gapino_token",token);localStorage.setItem("gapino_user",JSON.stringify(me));showApp()}catch(x){toast(x.message)}};

document.querySelectorAll(".tab").forEach(t=>t.onclick=()=>{
  document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));t.classList.add("active");
  $("#loginForm").classList.toggle("hidden",t.dataset.tab!=="login");$("#registerForm").classList.toggle("hidden",t.dataset.tab!=="register");
});
$("#search").oninput=async e=>{
  const q=e.target.value.trim();const box=$("#searchResults");box.innerHTML="";if(q.length<2)return;
  try{const {users}=await api("/api/users/search?q="+encodeURIComponent(q));users.forEach(u=>box.appendChild(userRow(u,()=>openChat(u))))}catch(x){toast(x.message)}
};
$("#sendForm").onsubmit=e=>{e.preventDefault();const body=$("#messageInput").value.trim();if(!body||!activeUser)return;socket.emit("send_message",{receiverId:activeUser.id,body},r=>{if(!r?.ok)toast(r?.error||"ارسال نشد");else{$("#messageInput").value="";renderMessage(r.message);scrollBottom();loadConversations();}})};
$("#messageInput").oninput=()=>{if(!activeUser||!socket)return;socket.emit("typing",{receiverId:activeUser.id,typing:true});clearTimeout(typingTimer);typingTimer=setTimeout(()=>socket.emit("typing",{receiverId:activeUser.id,typing:false}),700)};
$("#backBtn").onclick=()=>$(".app").classList.remove("chat-open");
$("#profileBtn").onclick=async()=>{try{const {user}=await api("/api/me");$("#profileName").value=user.display_name;$("#profileBio").value=user.bio||"";$("#profilePanel").classList.remove("hidden");$("#chatPanel").classList.add("hidden");$("#emptyChat").classList.add("hidden")}catch(e){toast(e.message)}};
$("#profileForm").onsubmit=async e=>{e.preventDefault();try{const {user}=await api("/api/me",{method:"PATCH",body:JSON.stringify({displayName:$("#profileName").value,bio:$("#profileBio").value})});me=user;localStorage.setItem("gapino_user",JSON.stringify(user));toast("پروفایل ذخیره شد.")}catch(x){toast(x.message)}};
$("#logout").onclick=()=>{localStorage.removeItem("gapino_token");localStorage.removeItem("gapino_user");token=null;me=null;if(socket)socket.disconnect();showAuth()};
$("#aiBtn").onclick=()=>{
  const ai={id:"ai",display_name:"دستیار گپینو",username:"gapino_ai",bio:"دستیار داخلی"};
  openChat(ai);$("#messages").innerHTML="";
  const wrap=document.createElement("div");wrap.className="bubble theirs";wrap.innerHTML="<div>سلام! من دستیار گپینو هستم 🤖<br>در این نسخه رایگان می‌توانم درباره امکانات گپینو، حساب کاربری و استفاده از برنامه راهنمایی‌ات کنم.</div>";$("#messages").appendChild(wrap);
};
if(token&&me)showApp();else showAuth();

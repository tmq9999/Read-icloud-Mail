// Admin dashboard HTML (served by the Worker at GET /admin, no-store).
// Self-contained SPA. All data comes from /admin/api/* which require the
// signed HttpOnly session cookie. This shell contains no secrets.
// NOTE: keep this string free of backticks and ${...} so it stays a valid
// TS template literal.

export const ADMIN_HTML = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<meta name="robots" content="noindex, nofollow"/>
<title>TempMail Admin</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect x='2' y='4' width='20' height='16' rx='3' fill='%23111'/%3E%3Cpath d='m2 7 10 7L22 7' stroke='%2334c759' stroke-width='2' fill='none'/%3E%3C/svg%3E"/>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  :root{
    --blue:#007aff;--blue-dark:#0062cc;--text:#1d1d1f;--text2:#6e6e73;--text3:#aeaeb2;
    --line:#e3e3e8;--line2:#d2d2d7;--paper:#fff;--paper2:#f5f5f7;--red:#ff3b30;--green:#34c759;--amber:#ff9f0a;
    --font:-apple-system,BlinkMacSystemFont,'SF Pro Text','Inter','Segoe UI',Roboto,sans-serif;
  }
  html,body{height:100%}
  body{font-family:var(--font);font-size:13.5px;color:var(--text);line-height:1.5;-webkit-font-smoothing:antialiased;
    background:radial-gradient(900px 600px at 10% 5%,#dbe6ff 0,transparent 60%),radial-gradient(900px 700px at 90% 20%,#e7dbff 0,transparent 60%),linear-gradient(160deg,#eef1fb,#f4eef8 55%,#eaf4fb)}
  ::selection{background:rgba(0,122,255,.25)}
  ::-webkit-scrollbar{width:9px;height:9px}::-webkit-scrollbar-thumb{background:rgba(0,0,0,.2);border-radius:9px;border:2px solid transparent;background-clip:content-box}

  /* Login */
  .login-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
  .login{width:380px;max-width:100%;background:rgba(255,255,255,.9);backdrop-filter:blur(30px);-webkit-backdrop-filter:blur(30px);
    border:1px solid rgba(0,0,0,.1);border-radius:16px;box-shadow:0 25px 80px rgba(30,40,70,.28);padding:30px 28px}
  .login .lock{width:52px;height:52px;border-radius:14px;margin:0 auto 14px;display:flex;align-items:center;justify-content:center;
    background:linear-gradient(135deg,#1d1d1f,#3a3a3c);color:#fff}
  .login .lock svg{width:26px;height:26px}
  .login h1{font-size:19px;font-weight:700;text-align:center;letter-spacing:-.3px}
  .login p{font-size:12.5px;color:var(--text2);text-align:center;margin-top:3px;margin-bottom:20px}
  .login label{display:block;font-size:11.5px;font-weight:600;color:var(--text2);margin:12px 0 5px}
  .fld{display:flex;background:#fff;border:1px solid var(--line2);border-radius:10px;transition:border-color .15s,box-shadow .15s}
  .fld:focus-within{border-color:var(--blue);box-shadow:0 0 0 3px rgba(0,122,255,.15)}
  .fld input{flex:1;min-width:0;border:none;outline:none;background:transparent;font-family:var(--font);font-size:14px;padding:10px 13px;color:var(--text)}
  .btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;font-family:var(--font);font-size:13.5px;font-weight:600;
    padding:10px 16px;border-radius:10px;cursor:pointer;border:1px solid var(--line2);background:var(--paper);color:var(--text);transition:all .13s;white-space:nowrap}
  .btn:hover{background:var(--paper2)}
  .btn:active{transform:scale(.98)}
  .btn.primary{background:var(--blue);border-color:var(--blue);color:#fff;box-shadow:0 1px 4px rgba(0,122,255,.4)}
  .btn.primary:hover{background:var(--blue-dark)}
  .btn.danger{color:var(--red);border-color:rgba(255,59,48,.3)}
  .btn.danger:hover{background:rgba(255,59,48,.08)}
  .btn:disabled{opacity:.5;cursor:not-allowed}
  .btn.full{width:100%;margin-top:20px;padding:11px}
  .login .err{margin-top:14px;font-size:12.5px;color:var(--red);text-align:center;min-height:16px}
  .login svg.i{width:15px;height:15px}

  /* App */
  #app{display:none;min-height:100vh;flex-direction:column}
  .topbar{display:flex;align-items:center;gap:12px;padding:12px 20px;background:rgba(255,255,255,.75);
    backdrop-filter:blur(28px);-webkit-backdrop-filter:blur(28px);border-bottom:1px solid rgba(0,0,0,.09);position:sticky;top:0;z-index:10}
  .topbar .brand{display:flex;align-items:center;gap:9px;font-weight:700;font-size:15px}
  .topbar .brand .logo{width:28px;height:28px;border-radius:8px;background:linear-gradient(135deg,#1d1d1f,#3a3a3c);display:flex;align-items:center;justify-content:center;color:#fff}
  .topbar .brand .logo svg{width:16px;height:16px}
  .topbar .brand .tag{font-size:10.5px;font-weight:700;color:#b25000;background:rgba(255,159,10,.16);border:1px solid rgba(255,159,10,.35);border-radius:6px;padding:1px 7px;letter-spacing:.4px}
  .topbar .sp{flex:1}
  .topbar .who{font-size:12.5px;color:var(--text2)}
  .topbar .who b{color:var(--text)}
  .topbar .btn{padding:6px 12px;font-size:12.5px}
  .wrap{max-width:1200px;width:100%;margin:0 auto;padding:20px clamp(12px,3vw,24px) 40px}

  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:18px}
  .card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:15px 17px;box-shadow:0 1px 3px rgba(0,0,0,.04)}
  .card .k{font-size:12px;color:var(--text2);font-weight:600;display:flex;align-items:center;gap:7px}
  .card .k svg{width:15px;height:15px;color:var(--blue)}
  .card .v{font-size:30px;font-weight:800;letter-spacing:-.5px;margin-top:6px;font-variant-numeric:tabular-nums}
  .card.accent{background:linear-gradient(135deg,#007aff,#5856d6);border:none;color:#fff}
  .card.accent .k,.card.accent .k svg{color:rgba(255,255,255,.85)}

  .tabs{display:flex;gap:4px;background:#fff;border:1px solid var(--line);border-radius:11px;padding:4px;width:fit-content;margin-bottom:14px;flex-wrap:wrap}
  .tabs button{font-family:var(--font);font-size:13px;font-weight:600;border:none;background:transparent;color:var(--text2);padding:7px 15px;border-radius:8px;cursor:pointer}
  .tabs button.active{background:var(--blue);color:#fff}

  .panel{background:#fff;border:1px solid var(--line);border-radius:14px;box-shadow:0 1px 3px rgba(0,0,0,.04);overflow:hidden}
  .panel .phead{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--line);flex-wrap:wrap}
  .panel .phead .t{font-size:14px;font-weight:700}
  .panel .phead .sp{flex:1}
  .search{display:flex;align-items:center;gap:6px;background:var(--paper2);border:1px solid transparent;border-radius:9px;padding:5px 10px;min-width:200px}
  .search:focus-within{background:#fff;border-color:var(--blue)}
  .search svg{width:14px;height:14px;color:var(--text3)}
  .search input{flex:1;min-width:0;border:none;outline:none;background:transparent;font-family:var(--font);font-size:13px}

  .tblwrap{overflow-x:auto;max-height:60vh;overflow-y:auto}
  table{width:100%;border-collapse:collapse;font-size:12.5px}
  thead th{position:sticky;top:0;background:var(--paper2);text-align:left;font-weight:700;color:var(--text2);padding:9px 14px;white-space:nowrap;border-bottom:1px solid var(--line);z-index:1}
  tbody td{padding:9px 14px;border-bottom:1px solid var(--line);vertical-align:top}
  tbody tr:hover{background:var(--paper2)}
  tbody tr.click{cursor:pointer}
  .mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px}
  .pill{display:inline-block;font-size:11px;font-weight:700;padding:1px 8px;border-radius:999px;background:rgba(0,122,255,.12);color:var(--blue)}
  .pill.ip{background:rgba(52,199,89,.14);color:#1e7e3e}
  .otp{color:var(--amber);font-weight:800}
  .muted{color:var(--text3)}
  .empty{padding:34px 16px;text-align:center;color:var(--text3)}
  .empty svg{width:44px;height:44px;color:#d6d6db;margin-bottom:8px}

  .sec-row{display:flex;align-items:center;gap:12px;padding:13px 16px;border-bottom:1px solid var(--line);flex-wrap:wrap}
  .sec-row:last-child{border-bottom:none}
  .sec-row .lab{font-size:12.5px;color:var(--text2);min-width:150px}
  .sec-row .val{font-weight:600}
  .gm-inp{flex:1;min-width:120px;border:1px solid var(--line2);border-radius:8px;background:#fff;font-family:var(--font);font-size:13px;padding:8px 11px;outline:none;color:var(--text)}
  .gm-inp:focus{border-color:var(--blue);box-shadow:0 0 0 3px rgba(0,122,255,.15)}
  .badge-on{font-size:11px;font-weight:700;padding:1px 8px;border-radius:999px;background:rgba(52,199,89,.14);color:#1e7e3e}
  .badge-off{font-size:11px;font-weight:700;padding:1px 8px;border-radius:999px;background:rgba(142,142,147,.16);color:var(--text2)}
  .lnk{cursor:pointer;color:var(--blue);font-weight:600}.lnk:hover{text-decoration:underline}
  .lnk.rm{color:var(--red)}
  .iplist{display:flex;flex-wrap:wrap;gap:6px}
  .iptag{display:inline-flex;align-items:center;gap:6px;font-size:12px;background:var(--paper2);border:1px solid var(--line2);border-radius:999px;padding:3px 6px 3px 11px;font-family:ui-monospace,monospace}
  .iptag b{font-family:var(--font)}
  .iptag .x{cursor:pointer;color:var(--text3);width:16px;height:16px;display:flex;align-items:center;justify-content:center;border-radius:50%}
  .iptag .x:hover{color:var(--red);background:rgba(255,59,48,.1)}
  .warn-box{margin:0;padding:11px 16px;background:rgba(255,159,10,.1);border-bottom:1px solid rgba(255,159,10,.28);color:#9a6b00;font-size:12.5px}
  .warn-box b{font-weight:700}

  /* modal */
  .overlay{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:60;display:none;align-items:center;justify-content:center;padding:20px}
  .overlay.show{display:flex}
  .modal{width:720px;max-width:100%;max-height:calc(100vh - 60px);overflow-y:auto;background:#fff;border-radius:16px;box-shadow:0 25px 80px rgba(0,0,0,.3)}
  .modal .mh{display:flex;gap:10px;padding:16px 18px;border-bottom:1px solid var(--line);align-items:flex-start}
  .modal .mh .meta{flex:1;min-width:0}
  .modal .mh .subj{font-size:15px;font-weight:700;overflow-wrap:anywhere}
  .modal .mh .kv{font-size:12px;color:var(--text2);margin-top:2px;overflow-wrap:anywhere}
  .modal .mh .x{cursor:pointer;color:var(--text3);font-size:20px;line-height:1;padding:2px 6px}
  .modal .mh .x:hover{color:var(--red)}
  .otp-card{margin:14px 18px 0;background:linear-gradient(135deg,rgba(0,122,255,.08),rgba(88,86,214,.08));border:1px solid rgba(0,122,255,.25);border-radius:12px;padding:12px 16px;display:flex;align-items:center;gap:14px}
  .otp-card .lbl{font-size:11px;font-weight:700;letter-spacing:1px;color:var(--blue);text-transform:uppercase}
  .otp-card .code{font-size:26px;font-weight:800;letter-spacing:6px;font-variant-numeric:tabular-nums}
  .mbody{padding:14px 18px 20px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:13.5px}
  .mframe{display:block;width:calc(100% - 36px);height:420px;margin:14px 18px 20px;border:1px solid var(--line);border-radius:10px;background:#fff}
  .seg{display:flex;margin:14px 18px 0;width:fit-content;background:var(--paper2);border:1px solid var(--line2);border-radius:8px;overflow:hidden}
  .seg button{font-family:var(--font);font-size:11.5px;font-weight:600;border:none;background:transparent;color:var(--text2);padding:5px 13px;cursor:pointer}
  .seg button.active{background:#fff;color:var(--text);box-shadow:inset 0 0 0 1px var(--line2)}

  .toasts{position:fixed;top:16px;right:20px;z-index:80;display:flex;flex-direction:column;gap:9px}
  .toast{background:rgba(255,255,255,.92);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(0,0,0,.1);border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.16);padding:10px 15px;font-size:12.5px;max-width:360px}
  .toast b{font-weight:700}
  .toast.err{border-color:rgba(255,59,48,.4);color:#c22}
  .toast.ok{border-color:rgba(52,199,89,.4)}
  .spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}

  @media(max-width:640px){
    .card .v{font-size:24px}
    .modal .mframe{height:340px}
    .topbar .who{display:none}
  }
</style>
</head>
<body>

<div class="login-wrap" id="loginWrap">
  <form class="login" id="loginForm" autocomplete="off">
    <div class="lock"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg></div>
    <h1>TempMail Admin</h1>
    <p>Đăng nhập để quản trị hệ thống</p>
    <label>Tên đăng nhập</label>
    <div class="fld"><input id="lUser" type="text" autocomplete="username" spellcheck="false" required/></div>
    <label>Mật khẩu</label>
    <div class="fld"><input id="lPass" type="password" autocomplete="current-password" required/></div>
    <button class="btn primary full" id="lBtn" type="submit">Đăng nhập</button>
    <div class="err" id="lErr"></div>
  </form>
</div>

<div id="app">
  <div class="topbar">
    <div class="brand">
      <span class="logo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="4" width="20" height="16" rx="3"/><path d="m2 7 10 7L22 7"/></svg></span>
      TempMail <span class="tag">ADMIN</span>
    </div>
    <div class="sp"></div>
    <span class="who">Xin chào, <b id="whoUser">admin</b></span>
    <button class="btn" id="btnRefresh"><svg class="i" style="width:15px;height:15px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg> Làm mới</button>
    <button class="btn" id="btnLogout">Đăng xuất</button>
  </div>

  <div class="wrap">
    <div class="cards" id="cards"></div>

    <div class="tabs">
      <button data-tab="addresses" class="active">Địa chỉ đã tạo</button>
      <button data-tab="messages">Thư đã nhận</button>
      <button data-tab="gmail">Email hệ thống</button>
      <button data-tab="security">Bảo mật</button>
    </div>

    <div id="tab-addresses" class="tabview">
      <div class="panel">
        <div class="phead">
          <span class="t">Địa chỉ email đã tạo</span>
          <span class="sp"></span>
          <div class="search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg><input id="qAddr" placeholder="Tìm địa chỉ / domain / IP"/></div>
        </div>
        <div class="tblwrap" id="addrTbl"></div>
      </div>
    </div>

    <div id="tab-messages" class="tabview" style="display:none">
      <div class="panel">
        <div class="phead">
          <span class="t">Thư nhận được</span>
          <span class="sp"></span>
          <div class="search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg><input id="qMsg" placeholder="Tìm theo địa chỉ nhận / người gửi / tiêu đề"/></div>
          <button class="btn danger" id="btnNuke">Xóa toàn bộ thư</button>
        </div>
        <div class="tblwrap" id="msgTbl"></div>
      </div>
    </div>

    <div id="tab-gmail" class="tabview" style="display:none">
      <div class="panel">
        <div class="phead">
          <span class="t">Email đã forward vào hệ thống</span>
          <span class="sp"></span>
        </div>
        <div class="sec-row" style="gap:8px">
          <input id="gmEmail" class="gm-inp" type="text" placeholder="vd: user@gmail.com, user@outlook.com, user@gmx.net…" spellcheck="false"/>
          <input id="gmNote" class="gm-inp" type="text" placeholder="ghi chú (tùy chọn)"/>
          <button class="btn primary" id="gmAdd">Thêm email</button>
        </div>
        <div class="warn-box" style="background:rgba(0,122,255,.07);border-color:rgba(0,122,255,.2);color:var(--text2)">Chỉ thêm email bạn đã cấu hình <b>tự động chuyển tiếp (forward)</b> về worker. Người dùng sẽ random biến thể theo nhà cung cấp — <b>Gmail</b>: dấu chấm hoặc +alias; <b>Outlook/Hotmail/iCloud…</b>: +alias; nhà cung cấp không hỗ trợ alias (<b>GMX, mail.com, libero.it…</b>): dùng chính mail gốc.</div>
        <div class="tblwrap" id="gmTbl"></div>
      </div>
    </div>

    <div id="tab-security" class="tabview" style="display:none">
      <div class="panel" id="secPanel"></div>
    </div>
  </div>
</div>

<div class="overlay" id="msgOverlay"><div class="modal" id="msgModal"></div></div>
<div class="toasts" id="toasts"></div>

<script>
(function(){
  'use strict';
  var $=function(id){return document.getElementById(id)};
  var state={authed:false,tab:'addresses',msgs:[],view:'html',sel:null};

  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  var TZ='Asia/Bangkok';
  function parseTs(ts){if(ts==null||ts==='')return null;if(typeof ts==='number'){var dn=new Date(ts);return isNaN(dn.getTime())?null:dn;}var s=String(ts).trim();if(/^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}$/.test(s))s=s.replace(' ','T')+'Z';var d=new Date(s);return isNaN(d.getTime())?null:d;}
  function fmt(ts){var d=parseTs(ts);if(!d)return esc(String(ts||'—'));return d.toLocaleString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:TZ})}
  function toast(msg,kind){var e=document.createElement('div');e.className='toast '+(kind||'ok');e.innerHTML=msg;$('toasts').appendChild(e);setTimeout(function(){e.style.opacity='0';e.style.transition='opacity .3s'},2600);setTimeout(function(){e.remove()},3000)}

  function api(path,opts){
    opts=opts||{};opts.credentials='same-origin';opts.headers=opts.headers||{};
    return fetch('/admin/api/'+path,opts).then(function(r){
      if(r.status===401){showLogin();throw new Error('unauth')}
      return r.json().then(function(d){return {ok:r.ok,status:r.status,data:d}})
    })
  }

  function showLogin(){state.authed=false;$('app').style.display='none';$('loginWrap').style.display='flex';setTimeout(function(){$('lUser').focus()},50)}
  function showApp(user){state.authed=true;$('loginWrap').style.display='none';$('app').style.display='flex';$('whoUser').textContent=user||'admin';loadAll()}

  // Login
  $('loginForm').addEventListener('submit',function(ev){
    ev.preventDefault();
    var u=$('lUser').value,p=$('lPass').value;
    $('lBtn').disabled=true;$('lErr').textContent='';
    fetch('/admin/login',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})})
      .then(function(r){return r.json().then(function(d){return{ok:r.ok,status:r.status,data:d}})})
      .then(function(r){
        $('lBtn').disabled=false;
        if(r.ok&&r.data.ok){$('lPass').value='';showApp(r.data.user)}
        else{$('lErr').textContent=r.data.error||'Đăng nhập thất bại';}
      })
      .catch(function(){$('lBtn').disabled=false;$('lErr').textContent='Lỗi mạng'});
  });

  $('btnLogout').addEventListener('click',function(){
    fetch('/admin/logout',{method:'POST',credentials:'same-origin'}).then(function(){showLogin()}).catch(function(){showLogin()});
  });
  $('btnRefresh').addEventListener('click',loadAll);

  // Tabs
  Array.prototype.forEach.call(document.querySelectorAll('.tabs button'),function(b){
    b.addEventListener('click',function(){
      state.tab=b.getAttribute('data-tab');
      Array.prototype.forEach.call(document.querySelectorAll('.tabs button'),function(x){x.classList.toggle('active',x===b)});
      ['addresses','messages','gmail','security'].forEach(function(t){$('tab-'+t).style.display=(t===state.tab?'block':'none')});
      if(state.tab==='security')loadSecurity();
      if(state.tab==='gmail')loadGmail();
    });
  });

  function loadAll(){loadStats();loadAddresses();loadMessages();if(state.tab==='security')loadSecurity();}

  // Stats
  function statCard(k,v,icon,accent){
    return '<div class="card'+(accent?' accent':'')+'"><div class="k">'+icon+esc(k)+'</div><div class="v">'+esc(String(v))+'</div></div>';
  }
  var IC_TODAY='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';
  var IC_ADDR='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 4h16v16H4z"/><path d="m22 6-10 7L2 6"/></svg>';
  var IC_MAIL='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="4" width="20" height="16" rx="3"/><path d="m2 7 10 7L22 7"/></svg>';
  function loadStats(){
    api('stats').then(function(r){
      if(!r.ok)return;var d=r.data;
      var h='';
      h+=statCard('Địa chỉ tạo hôm nay',d.addresses_today,IC_TODAY,true);
      h+=statCard('Tổng địa chỉ',d.addresses_total,IC_ADDR);
      h+=statCard('Thư nhận hôm nay',d.messages_today,IC_TODAY);
      h+=statCard('Tổng thư',d.messages_total,IC_MAIL);
      $('cards').innerHTML=h;
    }).catch(function(){});
  }

  // Addresses
  var addrRows=[];
  function loadAddresses(){
    api('addresses').then(function(r){if(!r.ok)return;addrRows=r.data.rows||[];renderAddr()}).catch(function(){});
  }
  function renderAddr(){
    var q=($('qAddr').value||'').toLowerCase();
    var rows=addrRows.filter(function(a){return !q||(a.email+' '+(a.domain||'')+' '+(a.ip||'')).toLowerCase().indexOf(q)>=0});
    if(!rows.length){$('addrTbl').innerHTML='<div class="empty">'+IC_ADDR.replace('<svg','<svg style="width:44px;height:44px"')+'<div>Chưa có địa chỉ nào được tạo</div></div>';return}
    var h='<table><thead><tr><th>Địa chỉ email</th><th>Domain</th><th>IP người tạo</th><th>Số lần</th><th>Tạo lúc</th><th>Lần cuối</th></tr></thead><tbody>';
    rows.forEach(function(a){
      h+='<tr><td class="mono">'+esc(a.email)+'</td><td>'+esc(a.domain||'—')+'</td><td><span class="pill ip">'+esc(a.ip||'—')+'</span></td><td>'+esc(String(a.hits||1))+'</td><td class="muted">'+fmt(a.created_at)+'</td><td class="muted">'+fmt(a.last_seen)+'</td></tr>';
    });
    h+='</tbody></table>';
    $('addrTbl').innerHTML=h;
  }
  $('qAddr').addEventListener('input',renderAddr);

  // Messages
  function loadMessages(){
    api('messages').then(function(r){if(!r.ok)return;state.msgs=r.data.rows||[];renderMsg()}).catch(function(){});
  }
  // Fallback giải mã nội dung (giống trang public): base64 và quoted-printable
  function looksB64(s){if(!s||s.length<40)return false;var t=s.trim();return /^[A-Za-z0-9+/=\\r\\n]+$/.test(t)&&!/\\s[a-z]{2,}\\s/.test(t);}
  function b64d(s){try{var b=atob(String(s).replace(/\\s+/g,''));try{return decodeURIComponent(escape(b));}catch(e){return b;}}catch(e){return s;}}
  function hasQP(s){return /=\\r?\\n/.test(s)||/=[0-9A-Fa-f]{2}/.test(s);}
  function qpd(s){var t=String(s).replace(/=\\r?\\n/g,'');var bin='';for(var i=0;i<t.length;i++){var c=t.charAt(i);if(c==='='&&/^[0-9A-Fa-f]{2}$/.test(t.substr(i+1,2))){bin+=String.fromCharCode(parseInt(t.substr(i+1,2),16));i+=2;}else{bin+=c;}}try{return decodeURIComponent(escape(bin));}catch(e){return bin;}}
  function decodeBody(s){if(!s)return s;if(looksB64(s)){var d=b64d(s);if(d&&d!==s)s=d;}if(hasQP(s))s=qpd(s);return s;}
  function dec(m){if(!m.__d){m.__d={text:decodeBody(m.body_text||''),html:decodeBody(m.body_html||'')};}return m.__d;}
  function cleanSender(s){return String(s==null?'':s).replace(/\\+caf_=[^@>\\s"']*(@)/i,'$1');}
  function baseOf(a){var m=String(a==null?'':a).match(/[^\\s<>"]+@[^\\s<>"]+/);var e=m?m[0].toLowerCase():'';var at=e.lastIndexOf('@');if(at<0)return '';var local=e.slice(0,at).split('+')[0];var dom=e.slice(at+1);if(/^(gmail|googlemail)\\.com$/.test(dom))local=local.replace(/\\./g,'');return local?local+'@'+dom:'';}
  function isForwardSelf(s,r){var b=baseOf(s);return !!b&&b===baseOf(r);}
  function otpOf(m){
    var t=(m.subject||'')+' '+(dec(m).text||'');
    var lab=t.match(/(?:code|otp|verification code|m[aã] x[aá]c nh[aậ]n|m[aã] x[aá]c minh|m[aã] OTP)[^\\d]{0,30}(\\d{4,8})/i);
    if(lab)return lab[1];
    var st=t.match(/(?:^|\\s)(\\d{4,8})(?:\\s|$)/);
    if(st&&!/^20[12]\\d$/.test(st[1]))return st[1];
    return null;
  }
  function renderMsg(){
    var q=($('qMsg').value||'').toLowerCase();
    var rows=state.msgs.filter(function(m){return !q||((m.recipient||'')+' '+(m.sender||'')+' '+(m.subject||'')).toLowerCase().indexOf(q)>=0});
    if(!rows.length){$('msgTbl').innerHTML='<div class="empty">'+IC_MAIL.replace('<svg','<svg style="width:44px;height:44px"')+'<div>Chưa có thư nào</div></div>';return}
    var h='<table><thead><tr><th>Đến (địa chỉ nhận)</th><th>Từ (người gửi)</th><th>Tiêu đề</th><th>Mã</th><th>Thời gian</th></tr></thead><tbody>';
    rows.forEach(function(m){
      var o=otpOf(m);
      h+='<tr class="click" data-id="'+esc(String(m.id))+'"><td class="mono">'+esc(m.recipient||'—')+'</td><td>'+esc(cleanSender(m.sender)||'—')+'</td><td>'+esc(m.subject||'(không tiêu đề)')+'</td><td>'+(o?'<span class="otp">'+esc(o)+'</span>':'<span class="muted">—</span>')+'</td><td class="muted">'+fmt(m.received_at)+'</td></tr>';
    });
    h+='</tbody></table>';
    $('msgTbl').innerHTML=h;
    Array.prototype.forEach.call($('msgTbl').querySelectorAll('tr.click'),function(tr){
      tr.addEventListener('click',function(){openMsg(tr.getAttribute('data-id'))});
    });
  }
  $('qMsg').addEventListener('input',renderMsg);

  function sanitize(html){return String(html||'').replace(/<script[\\s\\S]*?<\\/script>/gi,'').replace(/<script[^>]*>/gi,'').replace(/ on\\w+\\s*=\\s*"[^"]*"/gi,'').replace(/ on\\w+\\s*=\\s*'[^']*'/gi,'')}
  function openMsg(id){
    var m=null;state.msgs.forEach(function(x){if(String(x.id)===String(id))m=x});
    if(!m)return;state.view='html';
    var o=otpOf(m);var hasHtml=!!(dec(m).html&&dec(m).html.trim());
    var fromLine = isForwardSelf(m.sender, m.recipient) ? '' : '<div class="kv">Từ: '+esc(cleanSender(m.sender)||'—')+'</div>';
    var h='<div class="mh"><div class="meta"><div class="subj">'+esc(m.subject||'(không tiêu đề)')+'</div>'
      +fromLine+'<div class="kv">Đến: '+esc(m.recipient||'—')+'</div><div class="kv">'+fmt(m.received_at)+'</div></div>'
      +'<div class="x" id="mClose">&times;</div></div>';
    if(o)h+='<div class="otp-card"><div><div class="lbl">Mã xác minh</div><div class="code">'+esc(o)+'</div></div><button class="btn primary" id="mCopy" style="margin-left:auto">Chép mã</button></div>';
    if(hasHtml)h+='<div class="seg"><button id="segH" class="active">HTML</button><button id="segT">Văn bản</button></div>';
    h+='<div id="mContent"></div>';
    $('msgModal').innerHTML=h;
    renderMsgBody(m);
    $('msgOverlay').classList.add('show');
    $('mClose').addEventListener('click',closeMsg);
    var mc=$('mCopy');if(mc)mc.addEventListener('click',function(){navigator.clipboard&&navigator.clipboard.writeText(o);toast('Đã chép mã <b>'+esc(o)+'</b>')});
    var sh=$('segH'),st=$('segT');
    if(sh)sh.addEventListener('click',function(){state.view='html';sh.classList.add('active');st.classList.remove('active');renderMsgBody(m)});
    if(st)st.addEventListener('click',function(){state.view='text';st.classList.add('active');sh.classList.remove('active');renderMsgBody(m)});
  }
  function renderMsgBody(m){
    var d=dec(m);var hasHtml=!!(d.html&&d.html.trim());
    if(state.view==='html'&&hasHtml){
      $('mContent').innerHTML='<iframe class="mframe" sandbox="" srcdoc="'+esc(sanitize(d.html))+'"></iframe>';
    }else{
      $('mContent').innerHTML='<div class="mbody">'+esc(d.text||d.html||'(thư trống)')+'</div>';
    }
  }
  function closeMsg(){$('msgOverlay').classList.remove('show')}
  $('msgOverlay').addEventListener('click',function(e){if(e.target===this)closeMsg()});

  $('btnNuke').addEventListener('click',function(){
    if(!confirm('Xóa TOÀN BỘ thư trong database? Không thể hoàn tác!'))return;
    if(!confirm('Chắc chắn chứ? Mọi thư của mọi địa chỉ sẽ bị xóa.'))return;
    api('messages',{method:'DELETE'}).then(function(r){
      if(r.ok&&r.data.deleted){toast('Đã xóa <b>'+(r.data.rows_deleted||0)+' thư</b>');loadAll()}
      else toast(esc(r.data.error||'Xóa thất bại'),'err');
    }).catch(function(){});
  });

  // Security
  function loadSecurity(){
    api('security').then(function(r){if(!r.ok)return;renderSecurity(r.data)}).catch(function(){});
  }
  function renderSecurity(d){
    var ips=d.allowed_ips||[];var cur=d.current_ip||'—';var locked=ips.length>0;
    var h='';
    if(!locked)h+='<div class="warn-box"><b>Chưa khóa IP.</b> Bất kỳ ai có mật khẩu đều đăng nhập được. Bấm "Khóa vào IP hiện tại" để chỉ cho phép IP của bạn.</div>';
    h+='<div class="sec-row"><span class="lab">IP hiện tại của bạn</span><span class="val mono">'+esc(cur)+'</span></div>';
    h+='<div class="sec-row"><span class="lab">Trạng thái</span><span class="val">'+(locked?'<span class="pill ip">Đã khóa IP</span>':'<span class="pill" style="background:rgba(255,159,10,.15);color:#9a6b00">Mở</span>')+'</span></div>';
    h+='<div class="sec-row"><span class="lab">IP được phép</span><div class="iplist" id="ipList">'+(ips.length?ips.map(function(x){return '<span class="iptag"><b class="mono">'+esc(x)+'</b><span class="x" data-ip="'+esc(x)+'">&times;</span></span>'}).join(''):'<span class="muted">— chưa giới hạn —</span>')+'</div></div>';
    h+='<div class="sec-row"><span class="lab"></span><button class="btn primary" id="btnAddIp">Khóa vào IP hiện tại</button>'+(locked?'<button class="btn danger" id="btnClearIp">Bỏ khóa IP</button>':'')+'</div>';
    h+='<div class="sec-row"><span class="lab">Ghi chú</span><span class="muted" style="max-width:520px">Phiên đăng nhập giữ 24 giờ. Nếu bạn đổi mạng và bị khóa ngoài, hãy nhờ quản trị worker xóa cấu hình allowed_ips để mở lại.</span></div>';
    $('secPanel').innerHTML=h;
    var b1=$('btnAddIp');if(b1)b1.addEventListener('click',function(){
      if(!confirm('Chỉ cho phép IP '+cur+' truy cập admin? Các IP khác sẽ không vào được.'))return;
      api('security',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'add_current'})}).then(function(r){if(r.ok){toast('Đã khóa vào IP hiện tại');renderSecurity(r.data)}else toast(esc(r.data.error||'Lỗi'),'err')});
    });
    var b2=$('btnClearIp');if(b2)b2.addEventListener('click',function(){
      if(!confirm('Bỏ khóa IP? Mọi IP có mật khẩu sẽ đăng nhập được.'))return;
      api('security',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'clear'})}).then(function(r){if(r.ok){toast('Đã bỏ khóa IP');renderSecurity(r.data)}else toast(esc(r.data.error||'Lỗi'),'err')});
    });
    Array.prototype.forEach.call($('ipList').querySelectorAll('.x'),function(x){
      x.addEventListener('click',function(){
        var ip=x.getAttribute('data-ip');
        api('security',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'remove',ip:ip})}).then(function(r){if(r.ok){toast('Đã bỏ IP '+esc(ip));renderSecurity(r.data)}else toast(esc(r.data.error||'Lỗi'),'err')});
      });
    });
  }

  // Gmail accounts
  function loadGmail(){
    api('gmail').then(function(r){if(!r.ok)return;renderGmail(r.data.rows||[])}).catch(function(){});
  }
  function renderGmail(rows){
    if(!rows.length){$('gmTbl').innerHTML='<div class="empty">'+IC_MAIL.replace('<svg','<svg style="width:44px;height:44px"')+'<div>Chưa có email nào. Thêm email gốc đã forward về worker ở trên.</div></div>';return}
    var h='<table><thead><tr><th>Email gốc</th><th>Ghi chú</th><th>Trạng thái</th><th>Thêm lúc</th><th></th></tr></thead><tbody>';
    rows.forEach(function(g){
      var on=Number(g.active)===1;
      h+='<tr><td class="mono">'+esc(g.email)+'</td><td>'+esc(g.note||'—')+'</td>'
       +'<td>'+(on?'<span class="badge-on">Bật</span>':'<span class="badge-off">Tắt</span>')+'</td>'
       +'<td class="muted">'+fmt(g.created_at)+'</td>'
       +'<td style="white-space:nowrap"><span class="lnk" data-act="toggle" data-email="'+esc(g.email)+'">'+(on?'Tắt':'Bật')+'</span> &nbsp; <span class="lnk rm" data-act="delete" data-email="'+esc(g.email)+'">Xóa</span></td></tr>';
    });
    h+='</tbody></table>';
    $('gmTbl').innerHTML=h;
    Array.prototype.forEach.call($('gmTbl').querySelectorAll('.lnk'),function(el){
      el.addEventListener('click',function(){
        var act=el.getAttribute('data-act'),email=el.getAttribute('data-email');
        if(act==='delete'&&!confirm('Xóa email '+email+' khỏi hệ thống?'))return;
        api('gmail',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:act,email:email})})
          .then(function(r){if(r.ok){toast('Đã cập nhật');loadGmail();loadStats()}else toast(esc(r.data.error||'Lỗi'),'err')});
      });
    });
  }
  $('gmAdd').addEventListener('click',function(){
    var email=($('gmEmail').value||'').trim();
    var note=($('gmNote').value||'').trim();
    if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/.test(email)){toast('Địa chỉ email không hợp lệ','err');return}
    api('gmail',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'add',email:email,note:note})})
      .then(function(r){if(r.ok){toast('Đã thêm <b>'+esc(email)+'</b>');$('gmEmail').value='';$('gmNote').value='';loadGmail();loadStats()}else toast(esc(r.data.error||'Lỗi'),'err')});
  });

  document.addEventListener('keydown',function(e){if(e.key==='Escape')closeMsg()});

  // Boot: check session
  api('session').then(function(r){
    if(r.ok&&r.data.authed)showApp(r.data.user);else showLogin();
  }).catch(function(){showLogin()});
})();
</script>
</body>
</html>`;

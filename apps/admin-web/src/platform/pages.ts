import { api } from '../lib/api';
import type { School } from '../lib/types';
// @ts-ignore
import QRCode from 'qrcode/lib/browser.js';
import './platform.css';
type Row = Record<string, any>;
type Shell = (content:string,title:string,subtitle:string)=>void;
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const relation=(v:any)=>Array.isArray(v)?v[0]:v;
const time=(v:unknown)=>v?new Date(String(v)).toLocaleString('id-ID'):'—';
const badge=(s:unknown)=>`<span class="status">${esc(s)}</span>`;
const btn=(label:string,action:string,id:string)=>`<button class="button secondary" data-action="${action}" data-id="${esc(id)}">${esc(label)}</button>`;
let generation=0;
function feedback(root:HTMLElement,error:unknown){const el=root.querySelector<HTMLElement>('[data-feedback]');if(el){el.textContent=error instanceof Error?error.message:String(error);el.setAttribute('role','status');}}
async function busy(button:HTMLButtonElement,root:HTMLElement,run:()=>Promise<void>){button.disabled=true;try{await run();}catch(e){feedback(root,e);}finally{button.disabled=false;}}
function dialog(title:string,fields:string,submitLabel='Simpan'):Promise<FormData|null>{
 return new Promise(resolve=>{const el=document.createElement('dialog');el.className='sa-dialog';el.innerHTML=`<form class="sa-form"><h2>${esc(title)}</h2>${fields}<div class="sa-actions"><button type="button" data-close class="button secondary">Batal</button><button class="button primary">${esc(submitLabel)}</button></div></form>`;document.body.append(el);el.addEventListener('close',()=>{el.remove();resolve(null);},{once:true});el.querySelector('[data-close]')!.addEventListener('click',()=>el.close());el.querySelector('form')!.onsubmit=e=>{e.preventDefault();const data=new FormData(e.currentTarget as HTMLFormElement);resolve(data);el.close();};el.showModal();});
}
const reasonField='<label>Alasan / hasil pemeriksaan<textarea name="reason" minlength="3" maxlength="500" required></textarea></label>';
function options(values:string[],current?:string){return values.map(v=>`<option ${v===current?'selected':''}>${esc(v)}</option>`).join('');}
function schoolOptions(schools:School[]){return schools.map(s=>`<option value="${s.id}">${esc(s.name)} (${esc(s.code)})</option>`).join('');}
async function showSecret(title:string,secret:string){const el=document.createElement('dialog');el.className='sa-dialog';const h=document.createElement('h2');h.textContent=title;const p=document.createElement('p');p.textContent='Simpan di tempat aman sebelum menutup. Nilai ini hanya ditampilkan satu kali.';const pre=document.createElement('pre');pre.textContent=secret;const close=document.createElement('button');close.className='button primary';close.textContent='Sudah disimpan';close.onclick=()=>el.close();el.append(h,p,pre,close);document.body.append(el);el.onclose=()=>el.remove();el.showModal();}
async function provisionRequest(path:string,fields:Record<string,unknown>){
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({path,fields}))))).map(b=>b.toString(16).padStart(2,'0')).join('');
 const storageKey=`aksis.provision.${hash}`;
 const key=sessionStorage.getItem(storageKey)??crypto.randomUUID();sessionStorage.setItem(storageKey,key);
 const response=await api<Row>(path,{method:'POST',body:JSON.stringify({...fields,idempotency_key:key})});
 sessionStorage.removeItem(storageKey);return response;
}
export async function registerSchoolDevice(schoolId:string){
 const fd=await dialog('Daftarkan perangkat','<label>Kode<input name="device_code" required></label><label>Nama<input name="name" required></label><label>Jenis<select name="device_type">'+options(['CARD_STATION','GATE','LIBRARY','LED','WASTE_SCALE','OTHER'])+'</select></label>');
 if(!fd)return;const{data}=await api<Row>('/devices/register',{method:'POST',headers:{'x-school-id':schoolId},body:JSON.stringify(Object.fromEntries(fd))});await showSecret('Kredensial perangkat',`Device ID: ${data.device.id}\nToken: ${data.credential.token}`);
}
export async function mountPlatformPage(path:string,schools:School[],shell:Shell,navigate:(p:string)=>void){
 const epoch=++generation;
 const titles:Record<string,string>={'/platform':'Ringkasan Platform','/platform-schools':'Sekolah & Administrator','/platform-iam':'IAM & Hak Akses','/platform-devices':'Monitor Perangkat','/platform-card-jobs':'Produksi Kartu Siswa','/platform-audit':'Audit Platform'};
 shell(`<section class="panel sa-page"><p data-feedback role="status">Memuat…</p><div data-content></div></section>`,titles[path]??'Platform','Pengelolaan lintas sekolah oleh Super Admin.');
 const root=document.querySelector<HTMLElement>('.sa-page')!,content=root.querySelector<HTMLElement>('[data-content]')!;
 const alive=()=>epoch===generation&&root.isConnected;
 async function table(endpoint:string,columns:string[],row:(r:Row)=>string,handler?:(action:string,id:string,r:Row)=>Promise<void>){
 let page=1;async function load(){const response=await api<Row[]>(`${endpoint}${endpoint.includes('?')?'&':'?'}page=${page}&page_size=30`);if(!alive())return;
 content.innerHTML=`<div class="table-wrap"><table><thead><tr>${columns.map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${response.data.map(row).join('')||`<tr><td colspan="${columns.length}">Belum ada data.</td></tr>`}</tbody></table></div><div class="sa-actions"><button class="button secondary" data-prev ${page===1?'disabled':''}>Sebelumnya</button><span>Halaman ${page} · ${response.meta?.total??response.data.length} data</span><button class="button secondary" data-next ${page*30>=(response.meta?.total??0)?'disabled':''}>Berikutnya</button><button class="button secondary" data-refresh>Segarkan</button></div>`;
 feedback(root,'');
 content.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(b=>b.onclick=()=>void busy(b,root,async()=>{await handler?.(b.dataset.action!,b.dataset.id!,response.data.find(r=>r.id===b.dataset.id)!);if(alive())await load();}));
 content.querySelector<HTMLButtonElement>('[data-prev]')!.onclick=()=>{page--;void load().catch(e=>feedback(root,e));};content.querySelector<HTMLButtonElement>('[data-next]')!.onclick=()=>{page++;void load().catch(e=>feedback(root,e));};content.querySelector<HTMLButtonElement>('[data-refresh]')!.onclick=()=>void load().catch(e=>feedback(root,e));
 }await load();
 }
 try{
 if(path==='/platform'){
 const {data}=await api<Row>('/platform/stats');if(!alive())return;
 content.innerHTML=`<div class="stats-grid">
    <article class="stat-card lime"><div><span>Total Sekolah</span><strong>${data.total_schools}</strong></div><span class="trend">🏢</span></article>
    <article class="stat-card blue"><div><span>Siswa Aktif</span><strong>${data.total_students}</strong></div><span class="trend">👥</span></article>
    <article class="stat-card sage"><div><span>Perangkat Online (2m)</span><strong>${data.total_devices} Unit</strong></div><span class="trend">📡</span></article>
    <article class="stat-card sand"><div><span>Kartu Aktif</span><strong>${data.total_cards}</strong></div><span class="trend">💳</span></article>
  </div><div class="sa-actions"><a href="/platform-schools" data-nav class="button primary">Kelola sekolah</a><a href="/platform-card-jobs" data-nav class="button primary">Produksi & cetak kartu</a></div>`;
 content.querySelectorAll<HTMLAnchorElement>('[data-nav]').forEach(a=>a.onclick=e=>{e.preventDefault();navigate(a.pathname);});feedback(root,'');return;
 }
 if(path==='/platform-schools'){
 const wrap=document.createElement('div');wrap.className='quick-actions';
 const create=document.createElement('button');create.className='button primary';create.innerHTML='<span>🏢</span> Daftarkan Sekolah Baru';
 wrap.appendChild(create);
 root.insertBefore(wrap,content);
 create.onclick=()=>void busy(create,root,async()=>{const fd=await dialog('Daftarkan sekolah','<label>Kode sekolah<input name="code" pattern="[A-Z0-9][A-Z0-9_-]{1,49}" placeholder="Sistem ID (mis: SMAN1WTP)" required></label><label>Nama sekolah<input name="name" maxlength="200" placeholder="Contoh: SMA Negeri 1 Watampone" required></label><label>Zona waktu<select name="timezone">'+options(['Asia/Makassar','Asia/Jakarta','Asia/Jayapura'])+'</select></label>');if(!fd)return;const{data}=await provisionRequest('/platform/schools',Object.fromEntries(fd));await showSecret('Administrator sekolah',`${data.admin_email}\n${data.admin_password}`);navigate('/platform-schools');});
 await table('/platform/schools',['Sekolah','Zona waktu','Status','Aksi'],r=>`<tr><td><strong>${esc(r.name)}</strong><small>${esc(r.code)}</small></td><td><span class="date-chip">${esc(r.timezone)}</span></td><td>${badge(r.status)}</td><td><div class="sa-actions">${btn('✏️ Ubah','edit',r.id)}${btn('👤 + Admin','admin',r.id)}</div></td></tr>`,async(action,id,r)=>{if(action==='edit'){const fd=await dialog('Ubah sekolah',`<label>Nama<input name="name" value="${esc(r.name)}" required></label><label>Zona waktu<select name="timezone">${options(['Asia/Makassar','Asia/Jakarta','Asia/Jayapura'],r.timezone)}</select></label><label>Status<select name="status">${options(['ACTIVE','SUSPENDED','INACTIVE'],r.status)}</select></label><p>Sekolah nonaktif tidak dapat memakai station atau akses operasional biasa.</p>`);if(!fd)return;await api(`/platform/schools/${r.id}`,{method:'PATCH',body:JSON.stringify(Object.fromEntries(fd))});}else{const fd=await dialog('Tambah administrator',`<p>${esc(r.name)}</p><label>Nama<input name="full_name" required maxlength="200"></label><label>Email<input name="email" type="email" required></label><label>Password awal<div style="display:flex;gap:4px"><input name="password" type="password" minlength="8" maxlength="128" autocomplete="new-password" required style="flex:1;min-width:0"><button type="button" class="button secondary" style="flex:none;width:48px;padding:0;display:flex;justify-content:center;align-items:center;color:#64748b" onclick="const i=this.previousElementSibling;if(i.type==='password'){i.type='text';this.querySelector('.eye-off').style.display='block';this.querySelector('.eye-on').style.display='none'}else{i.type='password';this.querySelector('.eye-off').style.display='none';this.querySelector('.eye-on').style.display='block'}" title="Lihat/sembunyikan password"><svg class="eye-on" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg><svg class="eye-off" style="display:none" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg></button></div></label>`);if(!fd)return;await provisionRequest(`/platform/schools/${r.id}/admin`,Object.fromEntries(fd));}});return;
 }
 if(path==='/platform-iam'){
 await table('/platform/iam',['Pengguna / Login','Sekolah','Status','Role & permission','Aksi'],r=>`<tr><td><strong>${esc(r.full_name)}</strong><small>${esc(r.user_id)}</small><small class="date-chip" style="margin-top:4px" title="Terakhir login">Login: ${r.last_sign_in_at?esc(time(r.last_sign_in_at)):'Belum pernah'}</small></td><td>${esc(r.school_name)}</td><td>${badge(r.status)}</td><td>${(r.roles??[]).map((role:any)=>`<strong>${esc(role.code)}</strong><small>${(role.permissions??[]).join(', ')}</small>`).join('')}</td><td><div class="sa-actions">${btn('✏️ Ubah','edit',r.id)}${btn('🗑️ Hapus','delete',r.id)}</div></td></tr>`,async(action,id,r)=>{
 if(action==='delete'){if(confirm(`Yakin ingin menghapus akses ${r.full_name} dari ${r.school_name}? Tindakan ini tidak dapat dibatalkan.`)){await api(`/platform/iam/${id}`,{method:'DELETE'});window.location.reload();}return;}
 const currentRoles=(r.roles??[]).map((a:any)=>a.code);const choices=['SCHOOL_ADMIN','TEACHER','EXTRA_TEACHER','LIBRARY_STAFF','WASTE_STAFF','PARENT'];const fd=await dialog('Hak akses sekolah',`<label>Status<select name="status">${options(['ACTIVE','SUSPENDED','REVOKED'],r.status)}</select></label><fieldset><legend>Role</legend>${choices.map(role=>`<label><input type="checkbox" name="roles" value="${role}" ${currentRoles.includes(role)?'checked':''}>${role}</label>`).join('')}</fieldset><p>Minimal satu role. Hak Super Admin platform dikelola terpisah dari role sekolah.</p>`);if(!fd)return;await api(`/platform/iam/${id}`,{method:'PATCH',body:JSON.stringify({status:fd.get('status'),roles:fd.getAll('roles')})});window.location.reload();});return;
 }
 if(path==='/platform-devices'){
 await table('/platform/devices',['Perangkat / sekolah','Koneksi','Status','Terakhir terlihat','Aksi'],r=>`<tr><td><strong>${esc(r.name)}</strong><small>${esc(relation(r.schools)?.name)} · ${esc(r.device_type)}</small><small class="date-chip" style="margin-top:4px">${esc(r.id)}</small></td><td>${badge(r.online?'ONLINE':'OFFLINE')}</td><td>${badge(r.status)}</td><td>${esc(time(r.last_seen_at))}</td><td><div class="sa-actions">${btn('Status','status',r.id)}${btn('Rotasi token','rotate',r.id)}</div></td></tr>`,async(action,id,r)=>{if(action==='rotate'){const fd=await dialog('Rotasi kredensial','<p>Token sebelumnya langsung dicabut. Station perlu dikonfigurasi ulang.</p>','Rotasi');if(!fd)return;const{data}=await api<{token:string}>(`/platform/devices/${id}/credential`,{method:'POST'});await showSecret('Token perangkat baru',data.token);}else{const fd=await dialog('Status perangkat',`<select name="status">${options(['ACTIVE','DISABLED','MAINTENANCE','RETIRED'],r.status)}</select>`);if(!fd)return;await api(`/platform/devices/${id}`,{method:'PATCH',body:JSON.stringify(Object.fromEntries(fd))});}});return;
 }
 if(path==='/platform-audit'){
 await table('/platform/audit',['Waktu / sekolah','Aktor','Tindakan','Detail'],r=>`<tr><td>${esc(time(r.occurred_at))}<small>${esc(relation(r.schools)?.name)}</small></td><td>${esc(r.actor_user_id??'Perangkat / sistem')}</td><td>${esc(r.action)}<small>${esc(r.resource_id)}</small></td><td><details><summary>Perubahan</summary><pre>${esc(JSON.stringify({before:r.before_data,after:r.after_data},null,2))}</pre></details></td></tr>`);return;
 }
 if(path==='/platform-card-jobs'){await production(root,content,schools,alive);return;}
 feedback(root,'Halaman tidak ditemukan.');
 }catch(e){if(alive())feedback(root,e);}
}
async function production(root:HTMLElement,content:HTMLElement,schools:School[],alive:()=>boolean){
 content.innerHTML=`<div class="sa-tabs"><button data-tab="new">Buat batch</button><button data-tab="batches">Cetak & QC</button><button data-tab="jobs">Antrean penulisan</button><button data-tab="cards">Lifecycle kartu</button></div><div data-production></div>`;
 const body=content.querySelector<HTMLElement>('[data-production]')!;let tabEpoch=0;
 async function open(tab:string){const epoch=++tabEpoch;const current=()=>alive()&&epoch===tabEpoch;body.innerHTML='Memuat…';feedback(root,'');content.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(b=>b.dataset.active=String(b.dataset.tab===tab));
 if(tab==='new'){
 if(!schools.length){body.textContent='Daftarkan sekolah terlebih dahulu.';return;}
 body.innerHTML=`<div style="margin-bottom:1rem;color:#64748b">Pilih maksimal 200 siswa untuk diproduksi. Siswa yang belum memiliki foto resmi dari orang tua atau sudah mempunyai kartu aktif ditahan dari antrean cetak.</div><form class="sa-form" data-filter><label>Sekolah<select name="school">${schoolOptions(schools)}</select></label><label>Kelas & tahun ajaran<select name="class"><option value="">Semua kelas</option></select></label><label>Status foto<select name="photo_status"><option value="">Semua status foto</option><option value="COMPLETE">Siap Cetak (Foto Lengkap ✓)</option><option value="MISSING">Menunggu Foto (Belum Unggah ⚠️)</option></select></label><label>Cari nama<input name="search" maxlength="100" placeholder="Ketik nama siswa..."></label><button class="button secondary">Cari</button></form><div data-candidates></div><div class="sa-actions"><span data-selected style="font-weight:600"></span><button class="button primary" data-create disabled>Buat batch & QR</button></div>`;
 const form=body.querySelector<HTMLFormElement>('form')!,school=form.elements.namedItem('school') as HTMLSelectElement,cls=form.elements.namedItem('class') as HTMLSelectElement,photoStatus=form.elements.namedItem('photo_status') as HTMLSelectElement,search=form.elements.namedItem('search') as HTMLInputElement;
 const selected=new Set<string>();let candidateRequest=0,schoolRequest=0;let page=1,operation=crypto.randomUUID();const create=body.querySelector<HTMLButtonElement>('[data-create]')!;
 function count(){body.querySelector('[data-selected]')!.textContent=`${selected.size} siswa dipilih`;create.disabled=!selected.size||selected.size>200;}
 async function load(){const requestNo=++candidateRequest;const response=await api<Row[]>(`/platform/production/candidates?school_id=${school.value}&page=${page}&page_size=30${cls.value?`&class_id=${cls.value}`:''}${photoStatus.value?`&photo_status=${photoStatus.value}`:''}${search.value?`&search=${encodeURIComponent(search.value)}`:''}`);if(!current()||requestNo!==candidateRequest)return;const area=body.querySelector<HTMLElement>('[data-candidates]')!;
  const selectableCount=response.data.filter(r=>{const cards=r.student_cards??[];const hasActiveCard=cards.some((c:Row)=>c.status==='ACTIVE'&&['VERIFIED','LEGACY'].includes(c.production_status));const inProduction=cards.some((c:Row)=>['DRAFT','PRINTED','READY_TO_WRITE','WRITING','FAILED'].includes(c.production_status));const hasPhoto=Boolean(r.photo_url&&String(r.photo_url).trim().length>5);return !hasActiveCard&&!inProduction&&hasPhoto;}).length;
  area.innerHTML=`<div class="sa-select-bar" style="display:flex;align-items:center;justify-content:space-between;background:#f8fafc;border:1px solid #e2e8f0;border-radius:0.5rem;padding:0.6rem 1rem;margin-bottom:0.75rem"><label style="display:inline-flex;align-items:center;gap:8px;cursor:pointer;user-select:none;font-weight:600;color:#1e293b;margin:0"><input type="checkbox" data-all style="width:16px;height:16px;cursor:pointer" ${selectableCount===0?'disabled':''}> <span>Pilih semua siswa pada halaman ini${selectableCount===0?' (tidak ada yang bisa dipilih)':` (${selectableCount} tersedia)`}</span></label><span style="font-size:0.85rem;color:#64748b;font-weight:500">Menampilkan ${response.data.length} dari ${response.meta?.total??0} siswa</span></div><div class="table-wrap"><table><thead><tr><th style="width:48px;text-align:center"><input type="checkbox" data-all-th title="Pilih semua siswa pada halaman ini" style="width:16px;height:16px;cursor:pointer" ${selectableCount===0?'disabled':''}></th><th style="width:50px;text-align:center">Foto</th><th>Nama Siswa</th><th>Nomor Siswa</th><th>Status</th></tr></thead><tbody>${response.data.map(r=>{const cards=r.student_cards??[];const hasActiveCard=cards.some((c:Row)=>c.status==='ACTIVE'&&['VERIFIED','LEGACY'].includes(c.production_status));const inProduction=cards.some((c:Row)=>['DRAFT','PRINTED','READY_TO_WRITE','WRITING','FAILED'].includes(c.production_status));const hasPhoto=Boolean(r.photo_url&&String(r.photo_url).trim().length>5);const selectable=!hasActiveCard&&!inProduction&&hasPhoto;const initials=(r.full_name||'?').split(' ').map((w:string)=>w[0]).join('').substring(0,2).toUpperCase();const photoHtml=hasPhoto?`<img src="${esc(r.photo_url)}" alt="${esc(r.full_name)}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid #e2e8f0">`:`<div style="width:36px;height:36px;border-radius:50%;background:#fef3c7;color:#b45309;display:flex;align-items:center;justify-content:center;font-size:0.65rem;font-weight:700;border:2px dashed #fbbf24" title="Foto belum diunggah orang tua">${initials}</div>`;let statusHtml='';if(hasActiveCard)statusHtml='<span style="background:#dbeafe;color:#1e40af;padding:3px 8px;border-radius:12px;font-size:0.75rem;font-weight:600">✅ Kartu Aktif</span>';else if(inProduction)statusHtml='<span style="background:#fef3c7;color:#92400e;padding:3px 8px;border-radius:12px;font-size:0.75rem;font-weight:600">⏳ Sedang Diproduksi</span>';else if(hasPhoto)statusHtml='<span style="background:#dcfce7;color:#15803d;padding:3px 8px;border-radius:12px;font-size:0.75rem;font-weight:600">SIAP CETAK ✓</span>';else statusHtml='<span style="background:#fef3c7;color:#b45309;padding:3px 8px;border-radius:12px;font-size:0.75rem;font-weight:600">Menunggu Foto ⚠️</span>';const disabledReason=hasActiveCard?'Siswa sudah memiliki kartu aktif':inProduction?'Kartu sedang dalam produksi':!hasPhoto?'Foto belum diunggah oleh orang tua':'';return `<tr style="${!selectable?'opacity:0.6':''}"><td style="text-align:center"><input type="checkbox" data-student="${r.id}" ${!selectable?'disabled':''} ${selected.has(r.id)?'checked':''} title="${disabledReason}" style="width:16px;height:16px;cursor:${selectable?'pointer':'not-allowed'}"></td><td style="text-align:center">${photoHtml}</td><td><strong>${esc(r.full_name)}</strong></td><td>${esc(r.student_number)}</td><td>${statusHtml}</td></tr>`;}).join('')||'<tr><td colspan="5">Tidak ada siswa.</td></tr>'}</tbody></table></div><div class="sa-actions"><button type="button" class="button secondary" data-prev ${page===1?'disabled':''}>Sebelumnya</button><span>Halaman ${page} · ${response.meta?.total??0} siswa</span><button type="button" class="button secondary" data-next ${page*30>=(response.meta?.total??0)?'disabled':''}>Berikutnya</button></div>`;
  const allCb=area.querySelector<HTMLInputElement>('[data-all]'),allThCb=area.querySelector<HTMLInputElement>('[data-all-th]');
  const updateAllState=()=>{
   const studentCbs=Array.from(area.querySelectorAll<HTMLInputElement>('[data-student]:not(:disabled)'));
   const allChecked=studentCbs.length>0&&studentCbs.every(c=>c.checked);
   if(allCb)allCb.checked=allChecked;if(allThCb)allThCb.checked=allChecked;
  };
  area.querySelectorAll<HTMLInputElement>('[data-student]').forEach(c=>c.onchange=()=>{c.checked?selected.add(c.dataset.student!):selected.delete(c.dataset.student!);updateAllState();count();});
  const toggleAll=(checked:boolean)=>{
   if(allCb)allCb.checked=checked;if(allThCb)allThCb.checked=checked;
   area.querySelectorAll<HTMLInputElement>('[data-student]:not(:disabled)').forEach(c=>{c.checked=checked;checked?selected.add(c.dataset.student!):selected.delete(c.dataset.student!);});
   count();
  };
  if(allCb)allCb.onchange=e=>toggleAll((e.target as HTMLInputElement).checked);
  if(allThCb)allThCb.onchange=e=>toggleAll((e.target as HTMLInputElement).checked);
  updateAllState();
   area.querySelector<HTMLButtonElement>('[data-prev]')!.onclick=()=>{page--;void load().catch(e=>feedback(root,e));};area.querySelector<HTMLButtonElement>('[data-next]')!.onclick=()=>{page++;void load().catch(e=>feedback(root,e));};count();
  }
 async function changeSchool(){const schoolNo=++schoolRequest;++candidateRequest;selected.clear();count();body.querySelector('[data-candidates]')!.textContent='Memuat siswa…';page=1;const{data}=await api<Row[]>(`/platform/production/classes?school_id=${school.value}`);if(!current()||schoolNo!==schoolRequest)return;cls.innerHTML='<option value="">Semua kelas</option>'+data.map(c=>`<option value="${c.id}">${esc(c.name)} · ${esc(relation(c.academic_years)?.name)}</option>`).join('');await load();}
 school.onchange=()=>void changeSchool().catch(e=>feedback(root,e));cls.onchange=()=>{selected.clear();page=1;void load().catch(e=>feedback(root,e));};form.onsubmit=e=>{e.preventDefault();page=1;void load().catch(e=>feedback(root,e));};
 create.onclick=()=>void busy(create,root,async()=>{const{data}=await api<{id:string}>('/platform/production/batches',{method:'POST',body:JSON.stringify({id:operation,school_id:school.value,class_id:cls.value||null,student_ids:[...selected]})});operation=crypto.randomUUID();await batch(data.id);});await changeSchool();return;
 }
 let page=1;let search='',school='',status='';
 if(tab==='cards')body.innerHTML=`<form class="sa-form" data-card-filter><label>Sekolah<select name="school"><option value="">Semua sekolah</option>${schoolOptions(schools)}</select></label><label>Status<select name="status"><option value="">Semua status</option>${options(['ACTIVE','LOST','BLOCKED','REPLACED','EXPIRED'])}</select></label><label>Nama siswa<input name="search"></label><button class="button secondary">Cari</button></form><div data-list></div>`;else body.innerHTML='<div data-list></div>';
 const area=body.querySelector<HTMLElement>('[data-list]')!;
 async function load(){const response=await api<Row[]>(`/platform/production/${tab}?page=${page}&page_size=30${school?`&school_id=${school}`:''}${status?`&status=${status}`:''}${search?`&search=${encodeURIComponent(search)}`:''}`);if(!current())return;
 const columns=tab==='batches'?['Batch / sekolah','Template','Aksi']:tab==='jobs'?['Siswa / sekolah','Status','Percobaan / error','Aksi']:['Siswa / sekolah','Serial / UID','Status produksi / kartu','Aksi'];
 area.innerHTML=`<div class="table-wrap"><table><thead><tr>${columns.map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${response.data.map(r=>tab==='batches'?`<tr><td>${esc(time(r.created_at))}<small>${esc(relation(r.schools)?.name)} · ${esc(relation(r.classes)?.name)}</small></td><td>${esc(r.template_version)}</td><td>${btn('Buka / cetak','batch',r.id)}</td></tr>`:tab==='jobs'?`<tr><td>${esc(relation(r.student_cards)?.print_snapshot?.student_name)}<small>${esc(relation(r.schools)?.name)}</small></td><td>${badge(r.status)}</td><td>${r.attempt_count}/${r.max_attempts}<small>${esc(r.last_error_code)}</small><details><summary>Histori percobaan</summary>${(r.card_write_logs??[]).map((l:Row)=>`<p>${esc(time(l.created_at))} · ${esc(l.success?'Sukses':l.error_code)}</p>`).join('')||'Belum ada hasil penulisan'}</details></td><td><div class="sa-actions">${r.status==='FAILED'&&r.attempt_count<10?btn('Ulangi setelah pemeriksaan','RETRY',r.id):''}${['QUEUED','LEASED','FAILED'].includes(r.status)?btn('Batalkan','CANCEL',r.id):''}</div></td></tr>`:`<tr><td>${esc(relation(r.students)?.full_name)}<small>${esc(relation(r.schools)?.name)}</small></td><td>${esc(r.card_serial)}<small>${esc(r.card_uid??'Belum diikat ke chip')}</small></td><td>${badge(r.production_status)} ${badge(r.status)}</td><td><div class="sa-actions">${btn('Ubah status','status',r.id)}${['VERIFIED','LEGACY'].includes(r.production_status)&&['LOST','BLOCKED','EXPIRED'].includes(r.status)?btn('Kartu pengganti','replace',r.id):''}</div></td></tr>`).join('')||`<tr><td colspan="${columns.length}">Belum ada data.</td></tr>`}</tbody></table></div><div class="sa-actions"><button class="button secondary" data-prev ${page===1?'disabled':''}>Sebelumnya</button><span>Halaman ${page} · ${response.meta?.total??0} data</span><button class="button secondary" data-next ${page*30>=(response.meta?.total??0)?'disabled':''}>Berikutnya</button><button class="button secondary" data-refresh>Segarkan</button></div>`;
 area.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(b=>b.onclick=()=>void busy(b,root,async()=>{const action=b.dataset.action!,id=b.dataset.id!,r=response.data.find(x=>x.id===id)!;
 if(action==='batch'){await batch(id);return;}
 if(action==='replace'){const fd=await dialog('Terbitkan kartu pengganti','<p>Kartu baru mendapat QR berbeda. Kartu lama tetap diblokir dan menjadi REPLACED setelah kartu baru lolos verifikasi.</p>','Buat pengganti');if(!fd)return;const{data}=await api<{id:string}>('/platform/production/batches',{method:'POST',body:JSON.stringify({id:crypto.randomUUID(),school_id:r.school_id,student_ids:[r.student_id],replaces_card_id:id})});await batch(data.id);return;}
 if(action==='status'){const fd=await dialog('Status kartu',`<label>Status<select name="status">${options(['ACTIVE','LOST','BLOCKED','EXPIRED'],r.status)}</select></label>${reasonField}<p>Memblokir kartu yang masih diproduksi membatalkan produksinya.</p>`);if(!fd)return;await api(`/platform/production/cards/${id}`,{method:'PATCH',body:JSON.stringify(Object.fromEntries(fd))});}
 else{const fd=await dialog(action==='RETRY'?'Periksa ulang kartu sebelum mengulang':'Batalkan produksi',reasonField);if(!fd)return;await api(`/platform/production/jobs/${id}/action`,{method:'POST',body:JSON.stringify({action,reason:fd.get('reason')})});}await load();}));
 area.querySelector<HTMLButtonElement>('[data-prev]')!.onclick=()=>{page--;void load().catch(e=>feedback(root,e));};area.querySelector<HTMLButtonElement>('[data-next]')!.onclick=()=>{page++;void load().catch(e=>feedback(root,e));};area.querySelector<HTMLButtonElement>('[data-refresh]')!.onclick=()=>void load().catch(e=>feedback(root,e));
 }
 const filter=body.querySelector<HTMLFormElement>('[data-card-filter]');if(filter)filter.onsubmit=e=>{e.preventDefault();const fd=new FormData(filter);school=String(fd.get('school'));status=String(fd.get('status'));search=String(fd.get('search'));page=1;void load().catch(e=>feedback(root,e));};await load();
 }
 async function batch(id:string){const batchEpoch=++tabEpoch;const{data:cards}=await api<Row[]>(`/platform/production/batches/${id}`);if(!alive()||tabEpoch!==batchEpoch)return;if(!cards.length)throw Error('Batch tidak ditemukan.');
 const printable=cards.every(c=>['DRAFT','PRINTED'].includes(c.production_status));
 const images=await Promise.all(cards.map(c=>QRCode.toDataURL(c.qr_key,{errorCorrectionLevel:'M',margin:4,width:300})));
 if(!alive()||tabEpoch!==batchEpoch)return;
 body.innerHTML=`<h2>Batch ${esc(id)}</h2><p>${cards.length} kartu · Template AKSIS v1 · Ukuran awal 85,6 × 54 mm. Periksa skala 100% dan hasil QR pada printer yang digunakan.</p><div class="sa-actions"><label>Media<select data-media><option value="sheet">Lembar A4</option><option value="card">Satu kartu per halaman</option></select></label><label>Sisi<select data-side><option value="front">Depan</option><option value="back">Belakang</option></select></label><button class="button primary" data-print ${!printable?'disabled':''}>Cetak / Simpan PDF</button>${cards.every(c=>c.production_status==='DRAFT')?btn('Konfirmasi sudah tercetak','PRINTED',id):''}${cards.every(c=>c.production_status==='PRINTED')?btn('Catat cetak ulang','REPRINTED',id)+btn('Lolos QC → antrekan writer','RELEASED',id):''}${cards.some(c=>['DRAFT','PRINTED'].includes(c.production_status))?btn('Batalkan / Reset batch','CANCEL',id):''}</div><p>Dialog cetak tidak otomatis menandai hasil berhasil. Konfirmasikan hanya setelah kartu fisik selesai dan QR terbaca. Cetak ulang sebelum pelepasan: musnahkan hasil cetak yang ditolak.</p><div class="sa-card-previews">${cards.map((c,i)=>`<div><div class="sa-preview">${front(c,images[i])}</div><p>${badge(c.production_status)} ${badge(c.status)}</p></div>`).join('')}</div>`;
 body.querySelector<HTMLButtonElement>('[data-print]')!.onclick=()=>{const side=(body.querySelector('[data-side]') as HTMLSelectElement).value,media=(body.querySelector('[data-media]') as HTMLSelectElement).value;const w=window.open('','_blank');if(!w){feedback(root,'Izinkan jendela cetak pada browser, lalu coba lagi.');return;}
 w.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Batch kartu ${esc(id)} — ${side}</title><style>${printStyles(media)}</style></head><body>${cards.map((c,i)=>`<article class="id-card">${side==='front'?front(c,images[i]):back(c)}</article>`).join('')}</body></html>`);w.document.close();void Promise.all(Array.from(w.document.images).map(img=>img.decode().catch(()=>{}))).then(()=>{w.focus();w.print();});};
 body.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(b=>b.onclick=()=>void busy(b,root,async()=>{const action=b.dataset.action!;const isCancel=action==='CANCEL';const dialogTitle=action==='RELEASED'?'Konfirmasi semua kartu lolos QC':action==='REPRINTED'?'Catat cetak ulang':isCancel?'Batalkan / Reset Batch Produksi':'Konfirmasi hasil cetak';const dialogPrompt=isCancel?'Seluruh kartu dalam batch ini akan dibatalkan dan siswa dikembalikan ke status Siap Cetak. Alasan:':'Saya sudah memeriksa hasil fisik seluruh kartu dalam batch ini.';const fd=await dialog(dialogTitle,reasonField+(!isCancel?'<label><input type="checkbox" required> '+dialogPrompt+'</label>':''),isCancel?'Batalkan Batch':'Simpan');if(!fd)return;await api(`/platform/production/batches/${id}/action`,{method:'POST',body:JSON.stringify({event_id:crypto.randomUUID(),action,reason:fd.get('reason')})});await batch(id);}));feedback(root,'');
 }
 content.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(b=>b.onclick=()=>void open(b.dataset.tab!).catch(e=>feedback(root,e)));await open('new');
}
function getTheme(s: any) {
  const n = String(s.school_name || '').toUpperCase() + " " + String(s.school_code || '').toUpperCase();
  if (n.includes("SMA") || n.includes("SMK")) return "#8caeed";
  if (n.includes("SMP") || n.includes("MTS")) return "#2563eb";
  return "#dc2626";
}

function front(c:Row,qr:string){
  const s=c.print_snapshot??{};
  const theme = getTheme(s);
  const photo = s.photo_url ? esc(s.photo_url) : `${location.origin}/logo.png`;
  return `<div class="id-front" style="--theme:${theme}">
    <header>
      <div class="h-title">KARTU PELAJAR</div>
      <div class="h-school">${esc(s.school_name)}</div>
    </header>
    <div class="id-body">
      <div class="photo-container"><img class="id-photo" src="${photo}" alt="Foto"></div>
      <div class="id-name">${esc(s.student_name)}</div>
      <div class="id-nisn">NISN: ${esc(s.nisn || s.student_number)}</div>
      
      <div class="id-details">
        <div class="detail-row"><span>Kelas</span>: ${esc(s.class_name || '-')}</div>
        <div class="detail-row"><span>TTL</span>: ${esc(s.pob || '-')} / ${esc(s.date_of_birth || '-')}</div>
        <div class="detail-row"><span>Alamat</span>: <span class="addr">${esc(s.address || '-')}</span></div>
      </div>
    </div>
    <footer>
      <img class="id-qr" src="${qr}" alt="QR">
      <div class="f-serial">${esc(c.card_serial)}</div>
    </footer>
  </div>`;
}

function back(c:Row){
  const s=c.print_snapshot??{};
  const theme = getTheme(s);
  const sig = s.principal_signature_url ? `<img src="${esc(s.principal_signature_url)}" class="sig-img">` : `<div class="sig-placeholder"></div>`;
  return `<div class="id-back" style="--theme:${theme}">
    <header>TATA TERTIB</header>
    <div class="b-body">
      <ol>
        <li>Kartu ini adalah tanda bukti sah sebagai siswa ${esc(s.school_name)}.</li>
        <li>Kartu wajib dibawa dan dipakai selama berada di lingkungan sekolah.</li>
        <li>Kartu ini terintegrasi dengan sistem presensi dan layanan digital sekolah.</li>
        <li>Jika kartu ini ditemukan, mohon dikembalikan ke pihak sekolah.</li>
      </ol>
      <div class="b-sign">
        <div class="sign-title">Mengetahui,<br>Kepala Sekolah</div>
        ${sig}
        <div class="sign-name">${esc(s.principal_name || '.......................')}</div>
      </div>
    </div>
    <div class="b-footer">${esc(s.school_name)}</div>
  </div>`;
}

function printStyles(media:string){
  return `@page{size:${media==='card'?'54mm 85.6mm':'A4 portrait'};margin:${media==='card'?'0':'8mm'}}
  *{box-sizing:border-box}
  body{margin:0;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;${media==='sheet'?'display:grid;grid-template-columns:repeat(3,54mm);gap:4mm;align-content:start;':''}}
  .id-card{width:54mm;height:85.6mm;overflow:hidden;border:1px solid #cbd5e1;break-inside:avoid;${media==='card'?'break-after:page;':''}background:#fff;print-color-adjust:exact;-webkit-print-color-adjust:exact;position:relative;}
  
  .id-front, .id-back { width: 100%; height: 100%; display: flex; flex-direction: column; }
  header { background: var(--theme); color: #fff; text-align: center; padding: 3mm 2mm; flex: none; }
  .h-title { font-size: 7pt; font-weight: 600; letter-spacing: 1px; opacity: 0.9; }
  .h-school { font-size: 9pt; font-weight: 800; margin-top: 1px; line-height: 1.1; }
  
  .id-body { flex: 1; display: flex; flex-direction: column; align-items: center; padding: 4mm 3mm 0; }
  .photo-container { width: 22mm; height: 28mm; border: 2px solid var(--theme); border-radius: 4px; padding: 1px; background: #fff; margin-bottom: 3mm; }
  .id-photo { width: 100%; height: 100%; object-fit: cover; border-radius: 2px; }
  
  .id-name { font-size: 8.5pt; font-weight: 800; color: #0f172a; text-align: center; text-transform: uppercase; line-height: 1.2; margin-bottom: 1mm; width: 100%; }
  .id-nisn { font-size: 7pt; font-weight: 600; color: var(--theme); margin-bottom: 3mm; background: #f1f5f9; padding: 1mm 3mm; border-radius: 12px; }
  
  .id-details { width: 100%; font-size: 5.5pt; color: #334155; line-height: 1.3; margin-top: auto; margin-bottom: 2mm; }
  .detail-row { display: flex; margin-bottom: 0.5mm; }
  .detail-row > span:first-child { width: 10mm; font-weight: 600; flex: none; }
  .addr { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  
  .id-front footer { display: flex; align-items: center; justify-content: space-between; padding: 2mm 3mm; background: #f8fafc; border-top: 1px solid #e2e8f0; height: 12mm; }
  .id-qr { width: 10mm; height: 10mm; mix-blend-mode: multiply; }
  .f-serial { font-size: 5pt; color: #94a3b8; font-family: monospace; }
  
  .id-back header { font-size: 9pt; padding: 2.5mm; }
  .b-body { flex: 1; padding: 3mm; display: flex; flex-direction: column; }
  .b-body ol { margin: 0; padding-left: 3.5mm; font-size: 5.5pt; color: #1e293b; line-height: 1.4; text-align: justify; }
  .b-body li { margin-bottom: 1mm; }
  
  .b-sign { margin-top: auto; text-align: center; }
  .sign-title { font-size: 6pt; color: #334155; margin-bottom: 1mm; }
  .sig-img { height: 12mm; object-fit: contain; max-width: 30mm; mix-blend-mode: multiply; }
  .sig-placeholder { height: 12mm; }
  .sign-name { font-size: 6.5pt; font-weight: 700; text-decoration: underline; color: #0f172a; margin-top: 1mm; }
  
  .b-footer { font-size: 5.5pt; text-align: center; padding: 1.5mm; background: var(--theme); color: #fff; opacity: 0.9; }
  `;
}

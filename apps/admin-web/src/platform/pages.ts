import { api } from '../lib/api';
import type { School } from '../lib/types';
import { toast, toastSuccess, toastError } from '../lib/toast';
import { optimistic, removeRowOptimistic } from '../lib/optimistic';
// @ts-ignore
import QRCode from 'qrcode/lib/browser.js';
import './platform.css';
// @ts-ignore -- Vite: impor isi platform.css sebagai teks untuk jendela cetak
import platformCss from './platform.css?raw';
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

interface CredentialItem { label: string; value: string; copyable?: boolean; }
async function showCredentialsModal(title: string, subtitle: string, items: CredentialItem[]) {
  return new Promise<void>((resolve) => {
    const el = document.createElement('dialog');
    el.className = 'sa-dialog sa-credentials-dialog';

    const copyIconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
    const checkIconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

    const itemsHtml = items.map((item, idx) => `
      <div class="sa-cred-field">
        <label>${esc(item.label)}</label>
        <div class="sa-cred-input-wrap">
          <input type="text" readonly value="${esc(item.value)}" id="cred-val-${idx}" class="sa-cred-input" />
          ${item.copyable !== false ? `
            <button type="button" class="sa-cred-copy-btn" data-target="cred-val-${idx}" title="Salin ${esc(item.label)}">
              <span class="copy-icon">${copyIconSvg}</span>
              <span class="copy-label">Salin</span>
            </button>
          ` : ''}
        </div>
      </div>
    `).join('');

    el.innerHTML = `
      <div style="padding: 4px 0;">
        <h2 style="margin-top:0; margin-bottom:6px; font-size:1.25rem; color:#0f172a; font-weight:700;">${esc(title)}</h2>
        <p style="margin-top:0; margin-bottom:18px; font-size:0.875rem; color:#64748b; line-height: 1.4;">${esc(subtitle)}</p>
        <div class="sa-cred-list" style="margin-bottom: 22px;">${itemsHtml}</div>
        <div style="display:flex; justify-content:flex-end;">
          <button type="button" data-close class="button primary" style="padding: 9px 22px; font-weight: 600; border-radius: 8px;">Sudah Disimpan</button>
        </div>
      </div>
    `;

    document.body.append(el);

    el.querySelectorAll<HTMLButtonElement>('.sa-cred-copy-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const inputId = btn.getAttribute('data-target');
        const input = el.querySelector(`#${inputId}`) as HTMLInputElement | null;
        if (input && input.value) {
          try {
            await navigator.clipboard.writeText(input.value);
            const iconSpan = btn.querySelector('.copy-icon');
            const labelSpan = btn.querySelector('.copy-label');
            if (iconSpan && labelSpan) {
              iconSpan.innerHTML = checkIconSvg;
              labelSpan.textContent = 'Tersalin!';
              btn.style.borderColor = '#10b981';
              btn.style.color = '#047857';
              btn.style.background = '#ecfdf5';
              setTimeout(() => {
                iconSpan.innerHTML = copyIconSvg;
                labelSpan.textContent = 'Salin';
                btn.style.borderColor = '#cbd5e1';
                btn.style.color = '#334155';
                btn.style.background = '#ffffff';
              }, 2000);
            }
            toastSuccess(`${itemLabel(input.value)} berhasil disalin!`);
          } catch (err) {
            console.error('Copy error:', err);
          }
        }
      });
    });

    function itemLabel(val: string) { return val.length > 30 ? val.slice(0, 30) + '...' : val; }

    el.addEventListener('close', () => { el.remove(); resolve(); }, { once: true });
    el.querySelector('[data-close]')?.addEventListener('click', () => el.close());
    el.showModal();
  });
}

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
 const titles:Record<string,string>={'/platform':'Ringkasan Platform','/platform-schools':'Sekolah & Administrator','/platform-iam':'IAM & Hak Akses','/platform-devices':'Monitor Perangkat','/platform-card-templates':'Template Desain Kartu Siswa','/platform-card-jobs':'Produksi Kartu Siswa','/platform-audit':'Audit Platform'};
 shell(`<section class="panel sa-page"><p data-feedback role="status">Memuat…</p><div data-content></div></section>`,titles[path]??'Platform','Pengelolaan lintas sekolah oleh Super Admin.');
 const root=document.querySelector<HTMLElement>('.sa-page')!,content=root.querySelector<HTMLElement>('[data-content]')!;
 const alive=()=>epoch===generation&&root.isConnected;
  async function table(endpoint:string,columns:string[],row:(r:Row)=>string,handler?:(action:string,id:string,r:Row)=>Promise<void>,wrapClass=''){
 let page=1;async function load(){const response=await api<Row[]>(`${endpoint}${endpoint.includes('?')?'&':'?'}page=${page}&page_size=30`);if(!alive())return;
  content.innerHTML=`<div class="table-wrap ${wrapClass}"><table><thead><tr>${columns.map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${response.data.map(row).join('')||`<tr><td colspan="${columns.length}">Belum ada data.</td></tr>`}</tbody></table></div><div class="sa-actions"><button class="button secondary" data-prev ${page===1?'disabled':''}>Sebelumnya</button><span>Halaman ${page} · ${response.meta?.total??response.data.length} data</span><button class="button secondary" data-next ${page*30>=(response.meta?.total??0)?'disabled':''}>Berikutnya</button><button class="button secondary" data-refresh>Segarkan</button></div>`;
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
    create.onclick=()=>void busy(create,root,async()=>{const fd=await dialog('Daftarkan sekolah','<label>Kode sekolah<input name="code" pattern="[A-Z0-9][A-Z0-9_-]{1,49}" placeholder="Sistem ID (mis: SMAN1WTP)" required></label><label>Nama sekolah<input name="name" maxlength="200" placeholder="Contoh: SMA Negeri 1 Watampone" required></label><label>Zona waktu<select name="timezone">'+options(['Asia/Makassar','Asia/Jakarta','Asia/Jayapura'])+'</select></label>');if(!fd)return;const{data}=await provisionRequest('/platform/schools',Object.fromEntries(fd));await showCredentialsModal('Pendaftaran Sekolah Berhasil', 'Catat kredensial admin sekolah berikut.', [{ label: 'Email Admin Sekolah', value: data.admin_email, copyable: true }, { label: 'Password Admin Awal', value: data.admin_password, copyable: true }]);navigate('/platform-schools');});
    await table('/platform/schools',['Sekolah','Zona waktu','Status','Aksi'],r=>`<tr><td><strong>${esc(r.name)}</strong><small>${esc(r.code)}</small></td><td><span class="date-chip">${esc(r.timezone)}</span></td><td>${badge(r.status)}</td><td><div class="sa-actions">${btn('✏️ Ubah','edit',r.id)}${btn('👤 + Admin','admin',r.id)}${btn('🔑 Reset Pass','reset-pass',r.id)}</div></td></tr>`,async(action,id,r)=>{if(action==='edit'){const fd=await dialog('Ubah sekolah',`<label>Nama<input name="name" value="${esc(r.name)}" required></label><label>Zona waktu<select name="timezone">${options(['Asia/Makassar','Asia/Jakarta','Asia/Jayapura'],r.timezone)}</select></label><label>Status<select name="status">${options(['ACTIVE','SUSPENDED','INACTIVE'],r.status)}</select></label><p>Sekolah nonaktif tidak dapat memakai station atau akses operasional biasa.</p>`);if(!fd)return;await api(`/platform/schools/${r.id}`,{method:'PATCH',body:JSON.stringify(Object.fromEntries(fd))});}else if(action==='reset-pass'){const fd=await dialog('Reset Password Admin Sekolah',`<p style="margin-bottom:1rem;color:#334155">Reset password seluruh admin sekolah untuk <strong>${esc(r.name)}</strong> (${esc(r.code)}).</p><label>Password Baru<input name="password" value="password123" minlength="8" maxlength="128" required><small style="color:#64748b">Password default: password123</small></label>`,'Reset Password');if(!fd)return;const newPass=String(fd.get('password')||'password123');const res=await api<{message:string,new_password:string,admin_email?:string,admin_emails?:string[],school_name?:string}>(`/platform/schools/${r.id}/reset-admin-password`,{method:'POST',body:JSON.stringify({password:newPass})});const adminEmailVal=res.data.admin_email||`admin@${r.code.toLowerCase()}.aksis.co.id`;const schoolNameVal=res.data.school_name||r.name;await showCredentialsModal('Password Admin Sekolah Berhasil Di-reset','Simpan email dan password baru ini di tempat aman.',[{label:'Sekolah',value:schoolNameVal,copyable:false},{label:'Email Admin Sekolah',value:adminEmailVal,copyable:true},{label:'Password Baru',value:res.data.new_password||newPass,copyable:true}]);toastSuccess(`Password admin ${r.name} berhasil di-reset.`);}else{const fd=await dialog('Tambah administrator',`<p>${esc(r.name)}</p><label>Nama<input name="full_name" required maxlength="200"></label><label>Email<input name="email" type="email" required></label><label>Password awal<div style="display:flex;gap:4px"><input name="password" type="password" minlength="8" maxlength="128" autocomplete="new-password" required style="flex:1;min-width:0"><button type="button" class="button secondary" style="flex:none;width:48px;padding:0;display:flex;justify-content:center;align-items:center;color:#64748b" onclick="const i=this.previousElementSibling;if(i.type==='password'){i.type='text';this.querySelector('.eye-off').style.display='block';this.querySelector('.eye-on').style.display='none'}else{i.type='password';this.querySelector('.eye-off').style.display='none';this.querySelector('.eye-on').style.display='block'}" title="Lihat/sembunyikan password"><svg class="eye-on" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg><svg class="eye-off" style="display:none" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg></button></div></label>`);if(!fd)return;const{data}=await provisionRequest(`/platform/schools/${r.id}/admin`,Object.fromEntries(fd));await showCredentialsModal('Administrator Berhasil Ditambahkan',`Admin baru untuk ${r.name}`,[{label:'Email Admin',value:data.admin_email,copyable:true},{label:'Password Admin',value:data.admin_password,copyable:true}]);}});return;
  }
  if(path==='/platform-iam'){
  await table('/platform/iam',['Pengguna','Sekolah','Terakhir Login','Role & permission','Status','Aksi'],r=>`<tr><td><div class="cell-scroll"><strong>${esc(r.full_name)}</strong><small style="font-family:monospace;font-size:0.75rem">${esc(r.user_id)}</small></div></td><td><div class="cell-scroll"><strong>${esc(r.school_name)}</strong></div></td><td><div class="cell-scroll">${r.last_sign_in_at?`<span class="date-chip" style="padding:0.2rem 0.5rem;font-size:0.75rem">${esc(time(r.last_sign_in_at))}</span>`:'<span style="color:#94a3b8;font-size:0.75rem;font-style:italic">Belum pernah</span>'}</div></td><td><div class="cell-scroll">${(r.roles??[]).map((role:any)=>`<strong>${esc(role.code)}</strong><small>${(role.permissions??[]).join(', ')}</small>`).join('')}</div></td><td><button type="button" class="status-toggle-btn ${r.status==='ACTIVE'?'active':'inactive'}" data-action="toggle-status" data-id="${r.id}" title="${r.status==='ACTIVE'?'Klik untuk menonaktifkan (NON ACTIVE)':'Klik untuk mengaktifkan (ACTIVE)'}">${r.status==='ACTIVE'?'ACTIVE ✓':'NON ACTIVE'}</button></td><td><div class="sa-actions">${btn('🗑️ Hapus','delete',r.id)}</div></td></tr>`,async(action,id,r)=>{
  if(action==='delete'){if(confirm(`Yakin ingin menghapus akses ${r.full_name} dari ${r.school_name}? Tindakan ini tidak dapat dibatalkan.`)){const btn=document.querySelector(`[data-action="delete"][data-id="${id}"]`) as HTMLElement|null;const row=btn?.closest('tr') as HTMLTableRowElement|null;const reinsertRow=row?removeRowOptimistic(row):()=>{};await optimistic({apply:()=>{},mutation:()=>api(`/platform/iam/${id}`,{method:'DELETE'}),rollback:()=>{reinsertRow();},successMessage:`Akses ${r.full_name} dari ${r.school_name} berhasil dihapus.`,errorPrefix:'Gagal menghapus akses'});}return;}
  if(action==='toggle-status'){const nextStatus=r.status==='ACTIVE'?'SUSPENDED':'ACTIVE';const roles=(r.roles??[]).map((a:any)=>a.code);const currentRoles=roles.length>0?roles:['SCHOOL_ADMIN'];const toggleBtn=document.querySelector(`[data-action="toggle-status"][data-id="${id}"]`) as HTMLElement|null;const prevText=toggleBtn?.textContent??'';const prevClass=r.status==='ACTIVE'?'active':'inactive';const nextClass=nextStatus==='ACTIVE'?'active':'inactive';if(toggleBtn){toggleBtn.textContent=nextStatus==='ACTIVE'?'ACTIVE ✓':'NON ACTIVE';toggleBtn.classList.remove(prevClass);toggleBtn.classList.add(nextClass);}await optimistic({apply:()=>{},mutation:()=>api(`/platform/iam/${id}`,{method:'PATCH',body:JSON.stringify({status:nextStatus,roles:currentRoles})}),rollback:()=>{if(toggleBtn){toggleBtn.textContent=prevText;toggleBtn.classList.remove(nextClass);toggleBtn.classList.add(prevClass);}},successMessage:`Status ${r.full_name} berhasil diubah ke ${nextStatus}.`,errorPrefix:'Gagal mengubah status'});return;}
  },'table-iam-wrap');return;
  }
 if(path==='/platform-devices'){
 await table('/platform/devices',['Perangkat / sekolah','Koneksi','Status','Terakhir terlihat','Aksi'],r=>`<tr><td><strong>${esc(r.name)}</strong><small>${esc(relation(r.schools)?.name)} · ${esc(r.device_type)}</small><small class="date-chip" style="margin-top:4px">${esc(r.id)}</small></td><td>${badge(r.online?'ONLINE':'OFFLINE')}</td><td>${badge(r.status)}</td><td>${esc(time(r.last_seen_at))}</td><td><div class="sa-actions">${btn('Status','status',r.id)}${btn('Rotasi token','rotate',r.id)}</div></td></tr>`,async(action,id,r)=>{if(action==='rotate'){const fd=await dialog('Rotasi kredensial','<p>Token sebelumnya langsung dicabut. Station perlu dikonfigurasi ulang.</p>','Rotasi');if(!fd)return;const{data}=await api<{token:string}>(`/platform/devices/${id}/credential`,{method:'POST'});await showSecret('Token perangkat baru',data.token);}else{const fd=await dialog('Status perangkat',`<select name="status">${options(['ACTIVE','DISABLED','MAINTENANCE','RETIRED'],r.status)}</select>`);if(!fd)return;await api(`/platform/devices/${id}`,{method:'PATCH',body:JSON.stringify(Object.fromEntries(fd))});}});return;
 }
 if(path==='/platform-audit'){
 await table('/platform/audit',['Waktu / sekolah','Aktor','Tindakan','Detail'],r=>`<tr><td>${esc(time(r.occurred_at))}<small>${esc(relation(r.schools)?.name)}</small></td><td>${esc(r.actor_user_id??'Perangkat / sistem')}</td><td>${esc(r.action)}<small>${esc(r.resource_id)}</small></td><td><details><summary>Perubahan</summary><pre>${esc(JSON.stringify({before:r.before_data,after:r.after_data},null,2))}</pre></details></td></tr>`);return;
 }
 if(path==='/platform-card-templates'){await cardTemplatesPage(root,content,alive);return;}
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
 body.innerHTML=`<div data-school-banner style="margin-bottom:1rem"></div><div style="margin-bottom:1rem;color:#64748b">Pilih maksimal 200 siswa untuk diproduksi. Siswa yang belum memiliki foto resmi dari orang tua atau sudah mempunyai kartu aktif ditahan dari antrean cetak.</div><form class="sa-form" data-filter><label>Sekolah<select name="school">${schoolOptions(schools)}</select></label><label>Kelas & tahun ajaran<select name="class"><option value="">Semua kelas</option></select></label><label>Status foto<select name="photo_status"><option value="">Semua status foto</option><option value="COMPLETE">Siap Cetak (Foto Lengkap ✓)</option><option value="MISSING">Menunggu Foto (Belum Unggah ⚠️)</option></select></label><label>Cari nama<input name="search" maxlength="100" placeholder="Ketik nama siswa..."></label><button class="button secondary">Cari</button></form><div data-candidates></div><div class="sa-actions"><span data-selected style="font-weight:600"></span><button class="button primary" data-create disabled>Buat batch & QR</button></div>`;
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
 async function changeSchool(){const schoolNo=++schoolRequest;++candidateRequest;selected.clear();count();body.querySelector('[data-candidates]')!.textContent='Memuat data siswa & kelas...';page=1;const [classesRes] = await Promise.all([api<Row[]>(`/platform/production/classes?school_id=${school.value}`), load()]);if(!current()||schoolNo!==schoolRequest)return;cls.innerHTML='<option value="">Semua kelas</option>'+classesRes.data.map(c=>`<option value="${c.id}">${esc(c.name)} · ${esc(relation(c.academic_years)?.name)}</option>`).join('');}
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
  async function batch(id: string) {
    const batchEpoch = ++tabEpoch;
    const { data: cards } = await api<Row[]>(`/platform/production/batches/${id}`);
    if (!alive() || tabEpoch !== batchEpoch) return;
    if (!cards.length) throw Error('Batch tidak ditemukan.');

    const templatesRes = await api<Row[]>('/platform/card-templates').catch(() => ({ data: [] }));
    const templatesMap: Record<string, string> = {};
    (templatesRes.data || []).forEach(t => {
      templatesMap[`${t.level}_${t.side}`] = t.template_url;
    });

    const resolveSchoolLevel = (snapshot: any): 'SD' | 'SMP' | 'SMA' => {
      const schoolName = String(snapshot?.school_name || '').toUpperCase();
      if (schoolName.includes('SD ') || schoolName.includes('SDN ') || schoolName.includes('SEKOLAH DASAR')) return 'SD';
      if (schoolName.includes('SMP ') || schoolName.includes('SMPN ') || schoolName.includes('SEKOLAH MENENGAH PERTAMA')) return 'SMP';
      if (schoolName.includes('SMA ') || schoolName.includes('SMAN ') || schoolName.includes('SMK ') || schoolName.includes('SEKOLAH MENENGAH ATAS')) return 'SMA';
      const rawLvl = String(snapshot?.school_level || '').toUpperCase();
      if (rawLvl === 'SD' || rawLvl === 'SMP' || rawLvl === 'SMA') return rawLvl as 'SD' | 'SMP' | 'SMA';
      return 'SMA';
    };

    const getFrontBg = (c: Row) => {
      const lvl = resolveSchoolLevel(c.print_snapshot);
      return templatesMap[`${lvl}_front`] || c.print_snapshot?.card_template_front_url;
    };
    const getBackBg = (c: Row) => {
      const lvl = resolveSchoolLevel(c.print_snapshot);
      return templatesMap[`${lvl}_back`] || c.print_snapshot?.card_template_back_url;
    };

    const printable = cards.every(c => ['DRAFT', 'PRINTED'].includes(c.production_status));
    const images = await Promise.all(
      cards.map(c => QRCode.toDataURL(c.qr_key, { errorCorrectionLevel: 'M', margin: 0, width: 300 }))
    );
    if (!alive() || tabEpoch !== batchEpoch) return;

    body.innerHTML = `<h2>Batch ${esc(id)}</h2>
      <p>${cards.length} kartu · Template AKSIS v1 · Ukuran 54 × 85,6 mm. Periksa skala 100% dan hasil QR pada printer.</p>
      <div class="sa-actions">
        <label>Media<select data-media><option value="sheet">Lembar A4</option><option value="card">Satu kartu per halaman</option></select></label>
        <label>Sisi<select data-side><option value="front">Depan</option><option value="back">Belakang</option></select></label>
        <button class="button primary" data-print ${!printable ? 'disabled' : ''}>Cetak / Simpan PDF</button>
        ${cards.every(c => c.production_status === 'DRAFT') ? btn('Konfirmasi sudah tercetak', 'PRINTED', id) : ''}
        ${cards.every(c => c.production_status === 'PRINTED') ? btn('Catat cetak ulang', 'REPRINTED', id) + btn('Lolos QC → antrekan writer', 'RELEASED', id) : ''}
        ${cards.some(c => ['DRAFT', 'PRINTED'].includes(c.production_status)) ? btn('Batalkan / Reset batch', 'CANCEL', id) : ''}
      </div>
      <p>Dialog cetak tidak otomatis menandai hasil berhasil. Konfirmasikan hanya setelah kartu fisik selesai dan QR terbaca.</p>
      <div class="sa-card-previews">
        ${cards.map((c, i) => `<div><div class="sa-preview"><article class="id-card">${front(c, images[i], getFrontBg(c))}</article></div><p>${badge(c.production_status)} ${badge(c.status)}</p></div>`).join('')}
      </div>`;

    const sideSelect = body.querySelector<HTMLSelectElement>('[data-side]');
    if (sideSelect) {
      sideSelect.onchange = () => {
        const side = sideSelect.value;
        const previewElems = body.querySelectorAll<HTMLElement>('.sa-preview');
        cards.forEach((c, i) => {
          if (previewElems[i]) {
            previewElems[i].innerHTML = `<article class="id-card">${side === 'front' ? front(c, images[i], getFrontBg(c)) : back(c, getBackBg(c))}</article>`;
          }
        });
      };
    }

    body.querySelector<HTMLButtonElement>('[data-print]')!.onclick = () => {
      const side = (body.querySelector('[data-side]') as HTMLSelectElement).value;
      const media = (body.querySelector('[data-media]') as HTMLSelectElement).value;
      const w = window.open('', '_blank');
      if (!w) {
        feedback(root, 'Izinkan jendela cetak pada browser, lalu coba lagi.');
        return;
      }
      w.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Batch kartu ${esc(id)} — ${side}</title><style>${printStyles(media)}</style></head><body>${cards.map((c, i) => `<article class="id-card">${side === 'front' ? front(c, images[i], getFrontBg(c)) : back(c, getBackBg(c))}</article>`).join('')}</body></html>`);
      w.document.close();
      void Promise.all(Array.from(w.document.images).map(img => img.decode().catch(() => {}))).then(() => {
        w.focus();
        w.print();
      });
    };

    body.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(b =>
      b.onclick = () => void busy(b, root, async () => {
        const action = b.dataset.action!;
        const isCancel = action === 'CANCEL';
        const dialogTitle = action === 'RELEASED' ? 'Konfirmasi semua kartu lolos QC' : action === 'REPRINTED' ? 'Catat cetak ulang' : isCancel ? 'Batalkan / Reset Batch Produksi' : 'Konfirmasi hasil cetak';
        const dialogPrompt = isCancel ? 'Seluruh kartu dalam batch ini akan dibatalkan dan siswa dikembalikan ke status Siap Cetak. Alasan:' : 'Saya sudah memeriksa hasil fisik seluruh kartu dalam batch ini.';
        const fd = await dialog(dialogTitle, reasonField + (!isCancel ? '<label><input type="checkbox" required> ' + dialogPrompt + '</label>' : ''), isCancel ? 'Batalkan Batch' : 'Simpan');
        if (!fd) return;
        await api(`/platform/production/batches/${id}/action`, { method: 'POST', body: JSON.stringify({ event_id: crypto.randomUUID(), action, reason: fd.get('reason') }) });
        await batch(id);
      })
    );
    feedback(root, '');
  }
 content.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(b=>b.onclick=()=>void open(b.dataset.tab!).catch(e=>feedback(root,e)));await open('new');
}
function generateCode128Svg(text: string): string {
  const PATTERNS = [
    "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
    "221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
    "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211",
    "212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
    "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331",
    "231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
    "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
    "112412","122114","122411","142112","142211","241211","221114","411112","411211","211142",
    "211241","211421","231112","231211","212113","212311","241111","211132","211321","223111",
    "221131","221212","241212","241221","211212","211222","231111","211213","212213","212231",
    "213121","211332","222131","231221","211214","211412","2331112"
  ];
  const START_B = 104;
  const STOP = 106;
  const codes: number[] = [START_B];
  let checksum = START_B;

  const cleanText = String(text || '').replace(/[^\x20-\x7E]/g, '') || '0000000';
  for (let i = 0; i < cleanText.length; i++) {
    const code = cleanText.charCodeAt(i) - 32;
    codes.push(code);
    checksum += (i + 1) * code;
  }
  const checkCode = checksum % 103;
  codes.push(checkCode);
  codes.push(STOP);

  let x = 0;
  const height = 28;
  const rects: string[] = [];

  for (const codeIdx of codes) {
    const pattern = PATTERNS[codeIdx] ?? PATTERNS[0] ?? "212222";
    let isBar = true;
    for (let i = 0; i < pattern.length; i++) {
      const char = pattern.charAt(i);
      const width = parseInt(char, 10) || 1;
      if (isBar) {
        rects.push(`<rect x="${x}" y="0" width="${width}" height="${height}" fill="#0f172a"/>`);
      }
      x += width;
      isBar = !isBar;
    }
  }
  return `<svg viewBox="0 0 ${x} ${height}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;">${rects.join('')}</svg>`;
}

function formatIndonesianDateOnly(dob?: string): string {
  if (!dob) return '-';
  if (/^\d{4}-\d{2}-\d{2}/.test(dob)) {
    const rawDatePart = dob.split('T')[0] ?? '';
    const parts = rawDatePart.split('-');
    if (parts.length >= 3) {
      const y = parts[0] ?? '';
      const m = parts[1] ?? '01';
      const d = parts[2] ?? '01';
      const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
      const monthIdx = parseInt(m, 10) - 1;
      const monthName = months[monthIdx] ?? m;
      return `${parseInt(d, 10) || 1} ${monthName} ${y}`;
    }
  }
  return dob || '-';
}

/**
 * FORMATTER MASA BERLAKU KARTU SISWA (S.D 30 JUNI {TAHUN_AKHIR})
 * Contoh: TA 2026/2027 => s.d. 30 Juni 2027
 */
function formatValidityDate(academicYear?: string, validUntil?: string): string {
  if (validUntil && validUntil.trim().length > 0) {
    return `s.d. ${formatIndonesianDateOnly(validUntil)}`;
  }
  if (academicYear) {
    const years = academicYear.match(/\d{4}/g);
    if (years && years.length >= 2) {
      const endYear = years[1];
      return `s.d. 30 Juni ${endYear}`;
    } else if (years && years.length === 1) {
      const endYear = parseInt(years[0], 10) + 1;
      return `s.d. 30 Juni ${endYear}`;
    }
  }
  return 's.d. 30 Juni 2027';
}

function getSchoolLogoHtml(logoUrl?: string): string {
  if (logoUrl && String(logoUrl).trim().length > 5 && !logoUrl.endsWith('/logo.png')) {
    return `<img class="school-logo-img" src="${esc(logoUrl)}" alt="Logo">`;
  }
  return `<svg viewBox="0 0 100 100" class="school-logo-svg" xmlns="http://www.w3.org/2000/svg">
    <path d="M15,35 C15,22 35,18 50,28 C65,18 85,22 85,35 C85,62 50,88 50,88 C50,88 15,62 15,35 Z" fill="none" stroke="#003366" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M50,30 C40,42 30,52 26,64 C38,64 46,55 50,44 C54,55 62,64 74,64 C70,52 60,42 50,30 Z" fill="#0052cc"/>
    <path d="M50,40 L50,74" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M38,24 C44,27 47,31 50,35 C53,31 56,27 62,24" fill="none" stroke="#0052cc" stroke-width="5" stroke-linecap="round"/>
  </svg>`;
}

/* ==========================================================================
   FUNGSI PEMBUAT HTML KARTU SISWA SISI DEPAN (FRONT CARD)
   ========================================================================== */
function front(c: Row, qr: string, customBgUrl?: string) {
  const s = c.print_snapshot ?? {};
  const schoolName = s.school_name || 'SMA NEGERI 3 WATAMPONE';
  const studentName = s.student_name || 'ANDI MUHAMMAD ASYRAAF';
  const nisn = s.nisn || s.student_number || '0064821736';
  const className = s.class_name || 'X-2';
  
  const photoUrl = (s.photo_url && String(s.photo_url).trim().length > 5) ? esc(s.photo_url) : `${location.origin}/logo.png`;

  const bgHtml = customBgUrl ? `<img class="card-bg-template-img" src="${esc(customBgUrl)}" alt="Template Depan">` : `
    <div class="bg-shape-top-1"></div>
    <div class="bg-shape-top-2"></div>
  `;

  return `<div class="id-front-v2">
    <!-- 1. LATAR / BACKGROUND TEMPLATE DEPAN -->
    ${bgHtml}
    
    <!-- 2. HEADER KARTU: Nama Sekolah Digeser ke Atas (Tanpa Logo Sekolah) -->
    <div class="id-header-v2">
      <div class="header-title-box">
        <div class="school-name-v2">${esc(schoolName)}</div>
        <div class="school-slogan-v2">Berilmu · Berkarakter · Berprestasi</div>
      </div>
    </div>

    <!-- 3. BARIS UTAMA: Foto Siswa (Kiri, Full Bingkai) & QR Code (Kanan) -->
    <div class="id-main-row">
      <!-- FOTO SISWA -->
      <div class="photo-col">
        <div class="photo-frame">
          <img class="student-img" src="${photoUrl}" alt="${esc(studentName)}">
        </div>
      </div>
      <!-- QR CODE (Di samping foto) -->
      <div class="meta-col">
        <div class="qr-container">
          <img class="qr-img" src="${qr}" alt="QR Code">
        </div>
      </div>
    </div>

    <!-- 4. BLOCK NAMA LENGKAP SISWA (Tanpa nama sekolah kecil & tanpa detail tambahan) -->
    <div class="id-name-block">
      <div class="student-fullname">${esc(studentName)}</div>
    </div>

    <!-- 5. AREA BAWAH: NISN (Sebelah Kiri) & KELAS (Sebelah Kanan) dipisahkan Garis Vertikal -->
    <div class="id-bottom-meta">
      <div class="bottom-meta-col">
        <span class="bottom-meta-label">NISN</span>
        <span class="bottom-meta-val">${esc(nisn)}</span>
      </div>
      <div class="bottom-meta-divider"></div>
      <div class="bottom-meta-col">
        <span class="bottom-meta-label">KELAS</span>
        <span class="bottom-meta-val">${esc(className)}</span>
      </div>
    </div>

    ${!customBgUrl ? '<div class="bg-shape-bottom-right"></div>' : ''}
  </div>`;
}

function back(c: Row, customBgUrl?: string) {
  const s = c.print_snapshot ?? {};
  const schoolName = s.school_name || 'SMA NEGERI 3 WATAMPONE';
  const studentName = s.student_name || 'ANDI MUHAMMAD ASYRAAF';
  const nisn = s.nisn || s.student_number || '0064821736';
  const className = s.class_name || 'X-2';
  const academicYear = s.academic_year || '2025 / 2026';
  const logoHtml = getSchoolLogoHtml(s.school_logo_url);
  const principalName = s.principal_name || 'Drs. H. Muh. Yusuf, M.Pd';
  const principalNip = s.principal_nip || '19681231 199403 1 006';
  const sigHtml = s.principal_signature_url ? `<img src="${esc(s.principal_signature_url)}" class="sig-img" alt="TTD">` : `<div class="sig-placeholder"></div>`;
  const barcodeCode = (s.school_code && nisn) ? `${s.school_code}-${nisn}` : (c.card_serial || 'SMAN3WTP-20250064821736');
  const barcodeSvg = generateCode128Svg(barcodeCode);

  const bgHtml = customBgUrl ? `<img class="card-bg-template-img" src="${esc(customBgUrl)}" alt="Template Belakang">` : `<div class="back-top-polygon"></div>`;

  return `<div class="id-back-v2">
    <!-- 1. LATAR / BACKGROUND TEMPLATE BELAKANG -->
    ${bgHtml}

    <!-- 2. HEADER BELAKANG: Logo & Nama Sekolah -->
    <div class="back-header">
      <div class="back-header-left">
        <div class="back-logo">${logoHtml}</div>
        <div class="back-school-title">${esc(schoolName)}</div>
      </div>
    </div>

    <!-- 3. INFORMASI SISWA BELAKANG: NISN, Nama, Kelas, Tahun Ajaran -->
    <div class="back-blue-card">
      <div class="card-info-row">
        <div class="info-meta">
          <div class="info-lbl">NISN</div>
          <div class="info-txt bold">${esc(nisn)}</div>
        </div>
      </div>

      <div class="card-info-row">
        <div class="info-meta">
          <div class="info-lbl">Nama</div>
          <div class="info-txt bold uppercase">${esc(studentName)}</div>
        </div>
      </div>

      <div class="card-info-row">
        <div class="info-meta">
          <div class="info-lbl">Kelas</div>
          <div class="info-txt bold">${esc(className)}</div>
        </div>
      </div>

      <div class="card-info-row">
        <div class="info-meta">
          <div class="info-lbl">Tahun Ajaran</div>
          <div class="info-txt bold">${esc(academicYear)}</div>
        </div>
      </div>
    </div>

    <!-- 4. BAGIAN BAWAH BELAKANG: BARCODE CODE128 & TTD KEPALA SEKOLAH (TIDAK BERUBAH) -->
    <div class="back-bottom-row">
      <!-- A. BARCODE CODE128 (TIDAK BERUBAH) -->
      <div class="barcode-block">
        <div class="barcode-svg">${barcodeSvg}</div>
        <div class="barcode-text">${esc(barcodeCode)}</div>
      </div>
      <!-- B. BLOK TANDA TANGAN KEPALA SEKOLAH (TIDAK BERUBAH) -->
      <div class="signature-block">
        <div class="sig-title">Kepala Sekolah</div>
        <div class="sig-image-wrap">${sigHtml}</div>
        <div class="sig-name">${esc(principalName)}</div>
        <div class="sig-nip">NIP. ${esc(principalNip)}</div>
      </div>
    </div>
  </div>`;
}

function printStyles(media: string) {
  return `@page{size:${media==='card'?'54mm 85.6mm':'A4 portrait'};margin:${media==='card'?'0':'8mm'}}
*{box-sizing:border-box;margin:0;padding:0}
body{margin:0;font-family:'Inter','Segoe UI',Roboto,sans-serif;background:${media==='sheet'?'#f1f5f9':'#ffffff'};${media==='sheet'?'display:grid;grid-template-columns:repeat(3,54mm);gap:5mm;align-content:start;justify-content:center;padding:5mm;':''}}
/* Semua gaya kartu diambil langsung dari platform.css agar hasil cetak = tampilan layar */
${platformCss}
/* Penyesuaian khusus cetak */
.id-card{break-inside:avoid;${media==='card'?'break-after:page;':''}print-color-adjust:exact;-webkit-print-color-adjust:exact}
`;
}


async function cardTemplatesPage(root: HTMLElement, content: HTMLElement, alive: () => boolean) {
  let activeLevel: 'SD' | 'SMP' | 'SMA' = 'SD';
  let templatesData: Row[] = [];

  function getTemplateUrl(level: string, side: string): string {
    const found = templatesData.find(t => t.level === level && t.side === side);
    return found ? found.template_url : '';
  }

  function updateCardPreviews() {
    const frontUrl = getTemplateUrl(activeLevel, 'front');
    const backUrl = getTemplateUrl(activeLevel, 'back');

    const sampleCard: Row = {
      print_snapshot: {
        student_name: 'ANDI MUHAMMAD ASYRAAF',
        school_name: activeLevel === 'SD' ? 'SD NEGERI 1 WATAMPONE' : activeLevel === 'SMP' ? 'SMP NEGERI 1 WATAMPONE' : 'SMA NEGERI 3 WATAMPONE',
        school_code: activeLevel === 'SD' ? 'SDN1WTP' : activeLevel === 'SMP' ? 'SMPN1WTP' : 'SMAN3WTP',
        nisn: '0064821736',
        class_name: activeLevel === 'SD' ? 'VI-A' : activeLevel === 'SMP' ? 'IX-B' : 'X-2',
        gender: 'Laki-laki',
        date_of_birth: '2008-08-14',
        address: 'Jl. Pendidikan No. 12 Watampone, Bone',
        principal_name: 'Drs. H. Muh. Yusuf, M.Pd',
        principal_nip: '19681231 199403 1 006'
      }
    };
    const sampleQr = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="%230052cc"/><text x="50" y="55" font-size="20" fill="white" text-anchor="middle">QR</text></svg>';

    const frontWrap = content.querySelector<HTMLElement>('[data-preview-front-wrap]');
    if (frontWrap) {
      frontWrap.innerHTML = `<article class="id-card">${front(sampleCard, sampleQr, frontUrl)}</article>`;
    }
    const backWrap = content.querySelector<HTMLElement>('[data-preview-back-wrap]');
    if (backWrap) {
      backWrap.innerHTML = `<article class="id-card">${back(sampleCard, backUrl)}</article>`;
    }

    const frontBadge = content.querySelector<HTMLElement>('[data-badge-front]');
    if (frontBadge) {
      frontBadge.innerHTML = frontUrl ? '<span style="background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:12px;font-size:0.75rem;font-weight:600">Terpasang ✓</span>' : '<span style="background:#fef3c7;color:#b45309;padding:2px 8px;border-radius:12px;font-size:0.75rem;font-weight:600">Belum diunggah</span>';
    }

    const backBadge = content.querySelector<HTMLElement>('[data-badge-back]');
    if (backBadge) {
      backBadge.innerHTML = backUrl ? '<span style="background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:12px;font-size:0.75rem;font-weight:600">Terpasang ✓</span>' : '<span style="background:#fef3c7;color:#b45309;padding:2px 8px;border-radius:12px;font-size:0.75rem;font-weight:600">Belum diunggah</span>';
    }

    content.querySelectorAll<HTMLElement>('[data-title-level]').forEach(el => {
      el.textContent = activeLevel;
    });

    content.querySelectorAll<HTMLButtonElement>('[data-level]').forEach(b => {
      b.dataset.active = String(b.dataset.level === activeLevel);
    });
  }

  function renderUI() {
    const frontUrl = getTemplateUrl(activeLevel, 'front');
    const backUrl = getTemplateUrl(activeLevel, 'back');

    const sampleCard: Row = {
      print_snapshot: {
        student_name: 'ANDI MUHAMMAD ASYRAAF',
        school_name: activeLevel === 'SD' ? 'SD NEGERI 1 WATAMPONE' : activeLevel === 'SMP' ? 'SMP NEGERI 1 WATAMPONE' : 'SMA NEGERI 3 WATAMPONE',
        school_code: activeLevel === 'SD' ? 'SDN1WTP' : activeLevel === 'SMP' ? 'SMPN1WTP' : 'SMAN3WTP',
        nisn: '0064821736',
        class_name: activeLevel === 'SD' ? 'VI-A' : activeLevel === 'SMP' ? 'IX-B' : 'X-2',
        gender: 'Laki-laki',
        date_of_birth: '2008-08-14',
        address: 'Jl. Pendidikan No. 12 Watampone, Bone',
        principal_name: 'Drs. H. Muh. Yusuf, M.Pd',
        principal_nip: '19681231 199403 1 006'
      }
    };
    const sampleQr = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="%230052cc"/><text x="50" y="55" font-size="20" fill="white" text-anchor="middle">QR</text></svg>';

    content.innerHTML = `
      <div style="margin-bottom:1.5rem">
        <h2 style="font-size:1.25rem;font-weight:700;color:#0f172a;margin-bottom:0.25rem">Template Desain Kartu Siswa</h2>
        <p style="color:#64748b;font-size:0.9rem">Upload template background gambar untuk sisi depan & belakang kartu pada jenjang SD, SMP, dan SMA. Posisi teks, foto, QR, barcode, dan logo diseragamkan secara presisi untuk semua jenjang.</p>
      </div>

      <div class="sa-tabs" style="margin-bottom:1.5rem">
        <button type="button" data-level="SD" ${activeLevel === 'SD' ? 'data-active="true"' : ''}>🔴 SD (Sekolah Dasar)</button>
        <button type="button" data-level="SMP" ${activeLevel === 'SMP' ? 'data-active="true"' : ''}>🔵 SMP (Sekolah Menengah Pertama)</button>
        <button type="button" data-level="SMA" ${activeLevel === 'SMA' ? 'data-active="true"' : ''}>⚪ SMA / SMK (Sekolah Menengah Atas)</button>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:1.5rem">
        <!-- FRONT TEMPLATE CARD -->
        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:0.75rem;padding:1.25rem;display:flex;flex-direction:column;gap:1rem">
          <div style="display:flex;align-items:center;justify-content:space-between">
            <h3 style="font-size:1rem;font-weight:700;color:#0f172a">Sisi Depan (Front) — <span data-title-level>${activeLevel}</span></h3>
            <div data-badge-front>${frontUrl ? '<span style="background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:12px;font-size:0.75rem;font-weight:600">Terpasang ✓</span>' : '<span style="background:#fef3c7;color:#b45309;padding:2px 8px;border-radius:12px;font-size:0.75rem;font-weight:600">Belum diunggah</span>'}</div>
          </div>

          <div style="display:flex;justify-content:center;background:#f8fafc;padding:1rem;border-radius:0.5rem;border:1px dashed #cbd5e1;min-height:360px">
            <div data-preview-front-wrap style="display:flex;justify-content:center">
              <article class="id-card">
                ${front(sampleCard, sampleQr, frontUrl)}
              </article>
            </div>
          </div>

          <div style="display:flex;flex-direction:column;gap:0.5rem">
            <label style="font-size:0.85rem;font-weight:600;color:#334155">Pilih Gambar Background Depan (Ratio 54 x 85.6 mm)</label>
            <input type="file" data-file-front accept="image/*" class="button secondary" style="font-size:0.85rem">
            <button type="button" data-save-front class="button primary" style="width:100%">Simpan Template Depan <span data-title-level>${activeLevel}</span></button>
          </div>
        </div>

        <!-- BACK TEMPLATE CARD -->
        <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:0.75rem;padding:1.25rem;display:flex;flex-direction:column;gap:1rem">
          <div style="display:flex;align-items:center;justify-content:space-between">
            <h3 style="font-size:1rem;font-weight:700;color:#0f172a">Sisi Belakang (Back) — <span data-title-level>${activeLevel}</span></h3>
            <div data-badge-back>${backUrl ? '<span style="background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:12px;font-size:0.75rem;font-weight:600">Terpasang ✓</span>' : '<span style="background:#fef3c7;color:#b45309;padding:2px 8px;border-radius:12px;font-size:0.75rem;font-weight:600">Belum diunggah</span>'}</div>
          </div>

          <div style="display:flex;justify-content:center;background:#f8fafc;padding:1rem;border-radius:0.5rem;border:1px dashed #cbd5e1;min-height:360px">
            <div data-preview-back-wrap style="display:flex;justify-content:center">
              <article class="id-card">
                ${back(sampleCard, backUrl)}
              </article>
            </div>
          </div>

          <div style="display:flex;flex-direction:column;gap:0.5rem">
            <label style="font-size:0.85rem;font-weight:600;color:#334155">Pilih Gambar Background Belakang (Ratio 54 x 85.6 mm)</label>
            <input type="file" data-file-back accept="image/*" class="button secondary" style="font-size:0.85rem">
            <button type="button" data-save-back class="button primary" style="width:100%">Simpan Template Belakang <span data-title-level>${activeLevel}</span></button>
          </div>
        </div>
      </div>
    `;

    // Tab level change - 0ms instant DOM update
    content.querySelectorAll<HTMLButtonElement>('[data-level]').forEach(b => {
      b.onclick = () => {
        activeLevel = b.dataset.level as any;
        updateCardPreviews();
      };
    });

    // Front file change & save
    const fileFront = content.querySelector<HTMLInputElement>('[data-file-front]')!;
    const btnSaveFront = content.querySelector<HTMLButtonElement>('[data-save-front]')!;
    let newFrontBase64 = '';

    fileFront.onchange = () => {
      const file = fileFront.files?.[0];
      if (file) {
        if (file.size > 2.5 * 1024 * 1024) {
          feedback(root, `Ukuran file gambar (${(file.size / 1024 / 1024).toFixed(1)} MB) melebihi batas maksimal 2 MB. Silakan pilih gambar lain.`);
          fileFront.value = '';
          return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
          newFrontBase64 = String(e.target?.result || '');
          const wrap = content.querySelector<HTMLElement>('[data-preview-front-wrap]');
          if (wrap) {
            wrap.innerHTML = `<article class="id-card">${front(sampleCard, sampleQr, newFrontBase64)}</article>`;
          }
        };
        reader.readAsDataURL(file);
      }
    };

    btnSaveFront.onclick = () => void busy(btnSaveFront, root, async () => {
      const currentUrl = getTemplateUrl(activeLevel, 'front');
      if (!newFrontBase64 && !currentUrl) {
        feedback(root, 'Pilih file gambar template depan terlebih dahulu.');
        return;
      }
      const targetUrl = newFrontBase64 || currentUrl;
      const res = await api<Row>('/platform/card-templates', {
        method: 'POST',
        body: JSON.stringify({ level: activeLevel, side: 'front', template_url: targetUrl })
      });
      // Update in-memory templatesData optimistically
      const idx = templatesData.findIndex(t => t.level === activeLevel && t.side === 'front');
      if (idx >= 0) {
        templatesData[idx] = res.data;
      } else {
        templatesData.push(res.data);
      }
      newFrontBase64 = '';
      fileFront.value = '';
      toastSuccess(`Template Depan ${activeLevel} berhasil disimpan!`);
      updateCardPreviews();
    });

    // Back file change & save
    const fileBack = content.querySelector<HTMLInputElement>('[data-file-back]')!;
    const btnSaveBack = content.querySelector<HTMLButtonElement>('[data-save-back]')!;
    let newBackBase64 = '';

    fileBack.onchange = () => {
      const file = fileBack.files?.[0];
      if (file) {
        if (file.size > 2.5 * 1024 * 1024) {
          feedback(root, `Ukuran file gambar (${(file.size / 1024 / 1024).toFixed(1)} MB) melebihi batas maksimal 2 MB. Silakan pilih gambar lain.`);
          fileBack.value = '';
          return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
          newBackBase64 = String(e.target?.result || '');
          const wrap = content.querySelector<HTMLElement>('[data-preview-back-wrap]');
          if (wrap) {
            wrap.innerHTML = `<article class="id-card">${back(sampleCard, newBackBase64)}</article>`;
          }
        };
        reader.readAsDataURL(file);
      }
    };

    btnSaveBack.onclick = () => void busy(btnSaveBack, root, async () => {
      const currentUrl = getTemplateUrl(activeLevel, 'back');
      if (!newBackBase64 && !currentUrl) {
        feedback(root, 'Pilih file gambar template belakang terlebih dahulu.');
        return;
      }
      const targetUrl = newBackBase64 || currentUrl;
      const res = await api<Row>('/platform/card-templates', {
        method: 'POST',
        body: JSON.stringify({ level: activeLevel, side: 'back', template_url: targetUrl })
      });
      // Update in-memory templatesData optimistically
      const idx = templatesData.findIndex(t => t.level === activeLevel && t.side === 'back');
      if (idx >= 0) {
        templatesData[idx] = res.data;
      } else {
        templatesData.push(res.data);
      }
      newBackBase64 = '';
      fileBack.value = '';
      toastSuccess(`Template Belakang ${activeLevel} berhasil disimpan!`);
      updateCardPreviews();
    });
  }

  // Load templates first, then render UI
  try {
    const res = await api<Row[]>('/platform/card-templates');
    if (!alive()) return;
    templatesData = res.data || [];
  } catch (e) {
    if (alive()) feedback(root, e);
  }

  renderUI();
  feedback(root, '');
}

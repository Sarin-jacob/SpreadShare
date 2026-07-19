(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),e.crossOrigin===`use-credentials`?t.credentials=`include`:e.crossOrigin===`anonymous`?t.credentials=`omit`:t.credentials=`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var e=Object.freeze({GOOGLE_CLIENT_ID:`77238747840-ghr8e6lut87edfl29i0b15u5m6eq407d.apps.googleusercontent.com`,APP_DRIVE_FOLDER:`SpreadShare_Workspaces`,DEFAULT_CURRENCY:`INR`}),t=`SpreadShareDB`,n=1,r=null;function i(){return new Promise((e,i)=>{if(r)return e(r);let a=indexedDB.open(t,n);a.onerror=()=>i(a.error),a.onsuccess=t=>{r=t.target.result,e(r)},a.onupgradeneeded=e=>{let t=e.target.result;t.objectStoreNames.contains(`group_events_cache`)||t.createObjectStore(`group_events_cache`,{keyPath:[`spreadsheetId`,`eventId`]}),t.objectStoreNames.contains(`reconstructed_state`)||t.createObjectStore(`reconstructed_state`,{keyPath:`spreadsheetId`}),t.objectStoreNames.contains(`offline_sync_queue`)||t.createObjectStore(`offline_sync_queue`,{keyPath:`id`,autoIncrement:!0})}})}async function a(e,t){let n=await i();return new Promise((r,i)=>{let a=n.transaction(e,`readwrite`);a.objectStore(e).put(t),a.oncomplete=()=>r(!0),a.onerror=()=>i(a.error)})}async function o(e){let t=await i();return new Promise((n,r)=>{let i=t.transaction(e,`readonly`).objectStore(e).getAll();i.onsuccess=()=>n(i.result),i.onerror=()=>r(i.error)})}async function s(e,t){let n=await i();return new Promise((r,i)=>{let a=n.transaction(e,`readwrite`);a.objectStore(e).delete(t),a.oncomplete=()=>r(!0),a.onerror=()=>i(a.error)})}var c=new class{constructor(){this.state={userProfile:null,directory:[],activeGroupId:null,activeGroupName:null,currentView:`dashboard`,groupEvents:[],syncStatus:`synced`,theme:{isDark:!1,isOled:!1,accent:`indigo`}},this.listeners=new Set}getState(){return Object.freeze({...this.state})}setState(e){this.state={...this.state,...e},this.notify()}clearWorkspace(){this.setState({activeGroupId:null,activeGroupName:null,groupEvents:[]})}subscribe(e){return this.listeners.add(e),()=>this.listeners.delete(e)}notify(){let e=this.getState();this.listeners.forEach(t=>t(e))}},l=[`https://www.googleapis.com/auth/spreadsheets`,`https://www.googleapis.com/auth/drive.file`,`https://www.googleapis.com/auth/userinfo.email`,`https://www.googleapis.com/auth/userinfo.profile`].join(` `),u=new class{constructor(){this.tokenClient=null,this.accessToken=null,this.authPromiseResolver=null,this.authPromiseRejecter=null}async init(e){if(!this.tokenClient)return new Promise(t=>{let n=document.createElement(`script`);n.src=`https://accounts.google.com/gsi/client`,n.async=!0,n.defer=!0,n.onload=()=>{this.tokenClient=google.accounts.oauth2.initTokenClient({client_id:e,scope:l,callback:async e=>this._handleAuthCallback(e)}),t()},document.head.appendChild(n)})}async _handleAuthCallback(e){if(e.error!==void 0){console.error(`OAuth Bridge Failure:`,e),this.authPromiseRejecter&&this.authPromiseRejecter(e.error);return}this.accessToken=e.access_token;let t=Date.now()+e.expires_in*1e3;localStorage.setItem(`ss_oauth_token`,this.accessToken),localStorage.setItem(`ss_oauth_expiry`,t.toString());try{let e=await this.fetchUserProfile(this.accessToken);this.authPromiseResolver&&this.authPromiseResolver({token:this.accessToken,profile:e})}catch(e){this.authPromiseRejecter&&this.authPromiseRejecter(e)}}login(){return new Promise((e,t)=>{this.authPromiseResolver=e,this.authPromiseRejecter=t,this.tokenClient.requestAccessToken()})}getAccessToken(){if(!this.accessToken){let e=localStorage.getItem(`ss_oauth_token`),t=parseInt(localStorage.getItem(`ss_oauth_expiry`)||`0`,10);e&&Date.now()<t&&(this.accessToken=e)}return this.accessToken}async checkExistingSession(){let e=this.getAccessToken();if(!e)return null;try{return{token:e,profile:await this.fetchUserProfile(e)}}catch{return console.warn(`Cached session expired or invalid.`),this.logout(),null}}async ensureValidToken(e){let t=localStorage.getItem(`ss_oauth_token`),n=parseInt(localStorage.getItem(`ss_oauth_expiry`)||`0`,10);return t&&Date.now()<n-300*1e3?(this.accessToken=t,t):(console.log(`[Auth] Token expired or expiring soon. Silent refresh initiated...`),new Promise((t,n)=>{this.authPromiseResolver=t,this.authPromiseRejecter=n,this.tokenClient.requestAccessToken({prompt:`none`,hint:e})}).then(e=>e.token))}logout(){this.accessToken=null,localStorage.removeItem(`ss_oauth_token`),localStorage.removeItem(`ss_oauth_expiry`)}async fetchUserProfile(e){let t=await fetch(`https://www.googleapis.com/oauth2/v3/userinfo`,{headers:{Authorization:`Bearer ${e}`}});if(!t.ok)throw Error(`Profile verification rejection.`);return t.json()}},d=new class{async _googleFetch(e,t={}){let n=c.getState().userProfile?.email,r=await u.ensureValidToken(n);if(!r)throw Error(`Sync engine stalled: Invalid context session.`);t.headers={...t.headers,Authorization:`Bearer ${r}`,"Content-Type":`application/json`};let i=await fetch(e,t);if(!i.ok){let e=await i.text();throw Error(`Cloud Core Exception [${i.status}]: ${e}`)}return i.json()}async getOrCreateRootFolder(){let t=encodeURIComponent(`name='${e.APP_DRIVE_FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`),n=await this._googleFetch(`https://www.googleapis.com/drive/v3/files?q=${t}&fields=files(id,name)`);if(n.files&&n.files.length>0)return n.files[0].id;let r={name:e.APP_DRIVE_FOLDER,mimeType:`application/vnd.google-apps.folder`};return(await this._googleFetch(`https://www.googleapis.com/drive/v3/files`,{method:`POST`,body:JSON.stringify(r)})).id}async createGroupSpreadsheet(e,t){let n={properties:{title:e},sheets:[{properties:{title:`transaction_ledger`}}]},r=(await this._googleFetch(`https://sheets.googleapis.com/v4/spreadsheets`,{method:`POST`,body:JSON.stringify(n)})).spreadsheetId;await this._googleFetch(`https://www.googleapis.com/drive/v3/files/${r}?addParents=${t}`,{method:`PATCH`});let i=`https://sheets.googleapis.com/v4/spreadsheets/${r}/values/transaction_ledger!A1:E1:append?valueInputOption=USER_ENTERED`;return await this._googleFetch(i,{method:`POST`,body:JSON.stringify({values:[[`timestamp`,`event_id`,`event_type`,`actor_identity`,`payload_json`]]})}),r}async enableLedgerPublicLinkSharing(e){let t=`https://www.googleapis.com/drive/v3/files/${e}/permissions`;return await this._googleFetch(t,{method:`POST`,body:JSON.stringify({role:`writer`,type:`anyone`,allowFileDiscovery:!1})})}async makeFilePubliclyReadable(e){let t=`https://www.googleapis.com/drive/v3/files/${e}/permissions`;return await this._googleFetch(t,{method:`POST`,body:JSON.stringify({role:`reader`,type:`anyone`,allowFileDiscovery:!1})})}async syncUserConfigRegistry(e){let t=`.spreadshare_user_config`,n=encodeURIComponent(`name='${t}' and trashed=false`),r=await this._googleFetch(`https://www.googleapis.com/drive/v3/files?q=${n}&fields=files(id)`),i=new Blob([JSON.stringify(e)],{type:`application/json`}),a=c.getState(),o=await u.ensureValidToken(a.userProfile?.email);if(r.files&&r.files.length>0)await fetch(`https://www.googleapis.com/upload/drive/v3/files/${r.files[0].id}?uploadType=media`,{method:`PATCH`,headers:{Authorization:`Bearer ${o}`},body:i});else{let e={name:t,mimeType:`application/json`},n=await this._googleFetch(`https://www.googleapis.com/drive/v3/files`,{method:`POST`,body:JSON.stringify(e)});await fetch(`https://www.googleapis.com/upload/drive/v3/files/${n.id}?uploadType=media`,{method:`PATCH`,headers:{Authorization:`Bearer ${o}`},body:i})}}async fetchUserConfigRegistry(){let e=await this._googleFetch(`https://www.googleapis.com/drive/v3/files?q=name%3D'.spreadshare_user_config'%20and%20trashed%3Dfalse&fields=files(id)`);if(e.files&&e.files.length>0){let t=c.getState(),n=await u.ensureValidToken(t.userProfile?.email),r=await fetch(`https://www.googleapis.com/drive/v3/files/${e.files[0].id}?alt=media`,{headers:{Authorization:`Bearer ${n}`}});if(r.ok)return await r.json()}return[]}async syncWorkspace(e){c.setState({syncStatus:`syncing`});try{let t=c.getState(),n=`transaction_ledger!A${t.groupEvents.length+2}:E`,r=`https://sheets.googleapis.com/v4/spreadsheets/${e}/values/${encodeURIComponent(n)}`,i=(await this._googleFetch(r)).values||[];if(i.length>0){let n=i.map(t=>({spreadsheetId:e,timestamp:t[0],eventId:t[1],event_type:t[2],actor_identity:t[3],payload_json:JSON.parse(t[4])}));for(let e of n)await a(`group_events_cache`,e);c.setState({groupEvents:[...t.groupEvents,...n]})}}catch(e){console.warn(`Delta update loop deferred offline:`,e)}finally{c.setState({syncStatus:`synced`})}}async appendLocalEvent(e,t,n){let r=c.getState(),i=n.override_actor_identity||r.userProfile.email;n.override_actor_identity&&delete n.override_actor_identity;let o={...n,actor_name:r.userProfile.name,actor_picture:r.userProfile.picture},s={spreadsheetId:e,eventId:crypto.randomUUID(),timestamp:n.custom_timestamp||new Date().toISOString(),event_type:t,actor_identity:i,payload_json:o};await a(`group_events_cache`,s),await a(`offline_sync_queue`,{action:`APPEND_ROW`,spreadsheetId:e,payload:s}),c.setState({groupEvents:[...r.groupEvents,s]}),this.processOfflineQueue()}async processOfflineQueue(){let e=await o(`offline_sync_queue`);if(e.length!==0){c.setState({syncStatus:`syncing`});for(let t of e)if(t.action===`APPEND_ROW`){let e=t.payload;if(e.payload_json.receipt_local_url&&e.payload_json.receipt_local_url.startsWith(`data:image`))try{let t=await this.getOrCreateRootFolder(),n={name:`receipt_${e.eventId}.jpg`,parents:[t],mimeType:`image/jpeg`},r=await this._googleFetch(`https://www.googleapis.com/drive/v3/files`,{method:`POST`,body:JSON.stringify(n)}),i=await(await fetch(e.payload_json.receipt_local_url)).blob(),a=c.getState(),o=await u.ensureValidToken(a.userProfile?.email);if(!(await fetch(`https://www.googleapis.com/upload/drive/v3/files/${r.id}?uploadType=media`,{method:`PATCH`,headers:{Authorization:`Bearer ${o}`},body:i})).ok)throw Error(`Media payload rejected by Google Drive.`);await this.makeFilePubliclyReadable(r.id),e.payload_json.receipt_local_url=`https://drive.google.com/thumbnail?id=${r.id}&sz=w1000`}catch(e){console.error(`Failed to offload receipt to Drive - pausing queue:`,e);break}let n=`https://sheets.googleapis.com/v4/spreadsheets/${t.spreadsheetId}/values/transaction_ledger!A:E:append?valueInputOption=USER_ENTERED`,r={values:[[e.timestamp,e.eventId,e.event_type,e.actor_identity,JSON.stringify(e.payload_json)]]};try{await this._googleFetch(n,{method:`POST`,body:JSON.stringify(r)}),await s(`offline_sync_queue`,t.id)}catch(e){console.error(`Failed pushing row append task - pausing queue:`,e);break}}c.setState({syncStatus:`synced`})}}},f=new class{constructor(){this.currentRoute=null,this.validRoutes=[`dashboard`,`group-detail`,`add-expense`,`expense-detail`,`settings`,`insights`]}init(){window.addEventListener(`hashchange`,()=>this.handleHashChange()),document.addEventListener(`click`,e=>{let t=e.target.closest(`[data-route]`);if(t){e.preventDefault();let n=t.getAttribute(`data-route`);this.navigate(n)}}),this.handleHashChange()}navigate(e){this.validRoutes.includes(e)&&(window.location.hash=e)}handleHashChange(){let e=window.location.hash.replace(`#`,``)||`dashboard`,t=this.validRoutes.includes(e)?e:`dashboard`;this.currentRoute!==t&&(this.currentRoute=t,this.updateDOM(t),c.setState({currentView:t}))}updateDOM(e){document.querySelectorAll(`section[id^="view-"]`).forEach(e=>{e.classList.add(`hidden`)});let t=document.getElementById(`view-${e}`);t&&t.classList.remove(`hidden`),document.querySelectorAll(`[data-route]`).forEach(t=>{t.getAttribute(`data-route`)===e?(t.classList.add(`text-accent-600`,`dark:text-accent-400`,`font-bold`),t.classList.remove(`text-slate-400`,`dark:text-slate-500`)):(t.classList.remove(`text-accent-600`,`dark:text-accent-400`,`font-bold`),t.classList.add(`text-slate-400`,`dark:text-slate-500`))})}},p=class{constructor(e){this.container=e,this.unsubscribe=c.subscribe(e=>this.onStateChange(e)),this.renderSkeleton(),this.cacheDOM(),this.attachListeners()}onStateChange(e){e.currentView===`dashboard`&&this.updateUI(e)}renderSkeleton(){this.container.innerHTML=`
      <div class="space-y-4 animate-fade-in pb-8">
        <!-- Group Ledger Creator Form Card -->
        <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-xs space-y-3">
          <h3 class="text-xs font-bold text-slate-400 uppercase tracking-wider">Spawn New Group Ledger</h3>
          <div class="flex space-x-2">
            <input type="text" id="dir-new-name" placeholder="e.g., Shared Flat, EuroTrip 2026..." class="flex-grow bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs focus:outline-none focus:border-accent-500 text-slate-900 dark:text-slate-100">
            <button id="dir-btn-create" class="bg-accent-600 dark:bg-accent-500 text-white dark:text-slate-950 px-4 py-2.5 rounded-xl text-xs font-bold hover:opacity-95 cursor-pointer whitespace-nowrap transition-all">
              Create Room
            </button>
          </div>
        </div>

        <!-- Directories Row Output Stream Stack -->
        <div class="space-y-2">
          <h3 class="text-xs font-bold text-slate-400 uppercase tracking-wider">Your Active Group Directories</h3>
          <div id="dir-items-container" class="grid gap-2"></div>
        </div>
      </div>
    `}cacheDOM(){this.$nameInput=this.container.querySelector(`#dir-new-name`),this.$createBtn=this.container.querySelector(`#dir-btn-create`),this.$listContainer=this.container.querySelector(`#dir-items-container`)}attachListeners(){this.$createBtn.addEventListener(`click`,()=>this.createNewGroup()),this.$nameInput.addEventListener(`keypress`,e=>{e.key===`Enter`&&this.createNewGroup()}),this.$listContainer.addEventListener(`click`,e=>{let t=e.target.closest(`[data-group-id]`);if(!t)return;let n=t.getAttribute(`data-group-id`),r=t.getAttribute(`data-group-name`);this.selectGroup(n,r)})}updateUI(e){if(!e.directory||e.directory.length===0){this.$listContainer.innerHTML=`
        <div class="text-center py-8 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
          <p class="text-xs text-slate-400">No active rooms found. Provide a title above to spawn a ledger workspace.</p>
        </div>`;return}this.$listContainer.innerHTML=e.directory.map(e=>`
      <div data-group-id="${e.id}" data-group-name="${e.name}" class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex justify-between items-center shadow-2xs group hover:border-accent-500/40 transition-all cursor-pointer">
        <div class="max-w-[85%]">
          <h4 class="font-bold text-slate-800 dark:text-slate-200 group-hover:text-accent-500 transition-colors truncate">${e.name}</h4>
          <p class="text-[9px] font-mono text-slate-400 mt-0.5 truncate">Ref Token: ${e.id}</p>
        </div>
        <svg class="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>
      </div>
    `).join(``)}async createNewGroup(){let e=this.$nameInput.value.trim();if(e)try{this.$nameInput.disabled=!0,this.$createBtn.disabled=!0,this.$createBtn.innerText=`Creating...`;let t=await d.getOrCreateRootFolder(),n=await d.createGroupSpreadsheet(e,t),r=c.getState(),i=[...r.directory,{id:n,name:e}];await d.syncUserConfigRegistry(i),c.setState({directory:i}),await this.selectGroup(n,e),await d.appendLocalEvent(n,`MEMBER_JOINED`,{member_email:r.userProfile.email}),this.$nameInput.value=``}catch(e){alert(`Ecosystem Provision Error: ${e.message}`)}finally{this.$nameInput.disabled=!1,this.$createBtn.disabled=!1,this.$createBtn.innerText=`Create Room`}}async selectGroup(e,t){c.setState({activeGroupId:e,activeGroupName:t});let n=(await o(`group_events_cache`)).filter(t=>t.spreadsheetId===e);c.setState({groupEvents:n}),f.navigate(`group-detail`),d.syncWorkspace(e)}destroy(){this.unsubscribe(),this.container.innerHTML=``}},m={show(e,t=`success`){let n=document.getElementById(`ss-toast`);n&&n.remove();let r=document.createElement(`div`);r.id=`ss-toast`,r.className=`fixed z-[9999] transition-all duration-300 opacity-0 flex items-center space-x-2.5 text-white text-xs font-bold shadow-xl
                    left-1/2 -translate-x-1/2 
                    bottom-24 px-5 py-2.5 rounded-full translate-y-10 
                    md:bottom-auto md:top-6 md:w-max md:px-6 md:py-3.5 md:rounded-2xl md:-translate-y-10 md:text-sm`;let i=``;t===`error`?(r.classList.add(`bg-rose-600`),i=`<svg class="w-4 h-4 md:w-5 md:h-5 shrink-0" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`):t===`info`?(r.classList.add(`bg-slate-800`,`dark:bg-slate-700`),i=`<svg class="w-4 h-4 md:w-5 md:h-5 shrink-0" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`):(r.classList.add(`bg-emerald-600`),i=`<svg class="w-4 h-4 md:w-5 md:h-5 shrink-0" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`),r.innerHTML=`
      ${i}
      <span class="tracking-wide">${e}</span>
    `,document.body.appendChild(r),requestAnimationFrame(()=>{r.classList.remove(`opacity-0`,`translate-y-10`,`md:-translate-y-10`),r.classList.add(`opacity-100`,`translate-y-0`)}),setTimeout(()=>{r.classList.remove(`opacity-100`,`translate-y-0`),r.classList.add(`opacity-0`,`translate-y-10`,`md:-translate-y-10`),setTimeout(()=>r.remove(),300)},3e3)}},h=e=>Math.round((e+2**-52)*100)/100;function g(e){let t=[],n=[];Object.entries(e).forEach(([e,r])=>{r.netBalance<-.01?t.push({email:e,amount:Math.abs(r.netBalance)}):r.netBalance>.01&&n.push({email:e,amount:r.netBalance})}),t.sort((e,t)=>t.amount-e.amount),n.sort((e,t)=>t.amount-e.amount);let r=[],i=0,a=0;for(;i<t.length&&a<n.length;){let e=t[i],o=n[a],s=Math.min(e.amount,o.amount);r.push({from:e.email,to:o.email,amount:h(s)}),e.amount=h(e.amount-s),o.amount=h(o.amount-s),e.amount<.01&&i++,o.amount<.01&&a++}return r}function _(e){let t={totalSpent:0,members:{},expenses:[],profiles:{}},n=new Set,r=new Set,i=JSON.parse(localStorage.getItem(`ss_profile_cache`)||`{}`),a=(e,n=null,r=null)=>{if(!e)return;t.members[e]||(t.members[e]={paid:0,owes:0,netBalance:0}),t.profiles[e]||(t.profiles[e]=i[e]||{name:e.split(`@`)[0],picture:null});let a=!1;n&&t.profiles[e].name!==n&&(t.profiles[e].name=n,a=!0),r&&t.profiles[e].picture!==r&&(t.profiles[e].picture=r,a=!0),a&&(i[e]=t.profiles[e],localStorage.setItem(`ss_profile_cache`,JSON.stringify(i)))},o=[...e].sort((e,t)=>new Date(e.timestamp)-new Date(t.timestamp));o.forEach(e=>{if(e.eventId||e.event_id,e.event_type===`EXPENSE_DELETE`){let t=typeof e.payload_json==`string`?JSON.parse(e.payload_json):e.payload_json;r.add(t.target_event_id)}});for(let e of o){let i=e.eventId||e.event_id;if(n.has(i)||r.has(i)||e.event_type===`EXPENSE_DELETE`)continue;n.add(i);let o=typeof e.payload_json==`string`?JSON.parse(e.payload_json):e.payload_json,s=e.actor_identity;if(a(s,o.actor_name,o.actor_picture),e.event_type===`MEMBER_JOINED`){a(o.member_email,o.member_name,o.member_picture);continue}let c=h(parseFloat(o.evaluated_amount)||0),l=o.target_peer_identity||``;if(l&&a(l),e.event_type===`EXPENSE_ADD`)t.totalSpent=h(t.totalSpent+c),o.payers&&o.payers.length>0?o.payers.forEach(e=>{a(e.user),t.members[e.user].paid+=parseFloat(e.value)||0}):t.members[s].paid+=c,o.allocations&&o.allocations.forEach(e=>{a(e.user),t.members[e.user].owes+=parseFloat(e.value)||0});else if(e.event_type===`TRANSFER`)t.members[s].paid+=c,t.members[l].owes+=c;else if(e.event_type===`LOAN`){let e=c;o.interest_type===`SIMPLE`&&o.interest_rate>0&&(e=c+c*(o.interest_rate/100)),t.members[s].paid+=h(e),t.members[l].owes+=h(e)}t.expenses.push({eventId:i,title:o.title,type:e.event_type,category:o.category||`General`,amount:c,payer:s,target:l,timestamp:o.custom_timestamp||e.timestamp,receiptUrl:o.receipt_local_url||null,rawPayload:o})}return Object.keys(t.members).forEach(e=>{let n=t.members[e];n.netBalance=h(n.paid-n.owes)}),t}var v=e=>Math.round((e+2**-52)*100)/100,y=new class{processAnalytics(e,t=null,n=30){let r={total:0,categories:{},dayOfWeek:{Sun:0,Mon:0,Tue:0,Wed:0,Thu:0,Fri:0,Sat:0},trendLine:[]},i=new Date,a=new Date(i.getTime()-n*24*60*60*1e3),o={};for(let e=0;e<n;e++){let t=new Date(i.getTime()-e*24*60*60*1e3);o[t.toISOString().split(`T`)[0]]=0}let s=new Set,c=new Set;e.forEach(e=>{if(e.event_type===`EXPENSE_DELETE`){let t=typeof e.payload_json==`string`?JSON.parse(e.payload_json):e.payload_json;c.add(t.target_event_id)}});for(let n of e){let e=n.eventId||n.event_id;if(s.has(e)||c.has(e)||n.event_type!==`EXPENSE_ADD`)continue;s.add(e);let i=typeof n.payload_json==`string`?JSON.parse(n.payload_json):n.payload_json,l=new Date(i.custom_timestamp||n.timestamp);if(l<a)continue;let u=0;if(t){let e=(i.allocations||[]).find(e=>e.user===t);e&&(u=parseFloat(e.value)||0)}else u=parseFloat(i.evaluated_amount)||0;if(u<=0)continue;u=v(u),r.total=v(r.total+u);let d=i.category||`General`;r.categories[d]=v((r.categories[d]||0)+u);let f=l.toLocaleDateString(`en-US`,{weekday:`short`});r.dayOfWeek[f]=v(r.dayOfWeek[f]+u);let p=l.toISOString().split(`T`)[0];o[p]!==void 0&&(o[p]=v(o[p]+u))}return r.trendLine=Object.keys(o).sort().map(e=>o[e]),r}async getGlobalAnalytics(e,t=30){let n=await o(`group_events_cache`);return this.processAnalytics(n,e,t)}},b=class{static getColors(){return[`#6366f1`,`#10b981`,`#8b5cf6`,`#f59e0b`,`#f43f5e`,`#0ea5e9`,`#ec4899`]}static setupCanvas(e){if(!e||!e.parentElement)return null;let t=window.devicePixelRatio||1,n=e.parentElement.getBoundingClientRect();if(n.width<=0||n.height<=0)return null;e.width=n.width*t,e.height=n.height*t,e.style.width=`${n.width}px`,e.style.height=`${n.height}px`;let r=e.getContext(`2d`);return r.scale(t,t),{ctx:r,width:n.width,height:n.height}}static drawPie(e,t){let n=this.setupCanvas(e);if(!n)return;let{ctx:r,width:i,height:a}=n;r.clearRect(0,0,i,a);let o=Object.entries(t).sort((e,t)=>t[1]-e[1]),s=o.reduce((e,[t,n])=>e+n,0);if(s===0)return;let c=i/2,l=a/2,u=Math.min(c,l)-10;if(u<=0)return;let d=this.getColors(),f=-.5*Math.PI;o.forEach(([e,t],n)=>{let i=t/s*2*Math.PI,a=f+i;r.beginPath(),r.moveTo(c,l),r.arc(c,l,u,f,a),r.closePath(),r.fillStyle=d[n%d.length],r.fill(),r.lineWidth=2,r.strokeStyle=document.documentElement.classList.contains(`dark`)?`#1e293b`:`#ffffff`,r.stroke(),f=a})}static drawTrendLine(e,t){let n=this.setupCanvas(e);if(!n)return;let{ctx:r,width:i,height:a}=n;if(r.clearRect(0,0,i,a),!t||t.length===0)return;let o=Math.max(...t,1),s=(i-20)/Math.max(t.length-1,1);r.beginPath(),t.forEach((e,t)=>{let n=10+t*s,i=a-10-e/o*(a-20);t===0?r.moveTo(n,i):r.lineTo(n,i)}),r.lineWidth=3,r.strokeStyle=`${x(`--accent-400`)}`,r.lineCap=`round`,r.lineJoin=`round`,r.stroke(),r.lineTo(i-10,a),r.lineTo(10,a),r.closePath();let c=r.createLinearGradient(0,0,0,a);c.addColorStop(0,`rgba(99, 102, 241, 0.2)`),c.addColorStop(1,`rgba(99, 102, 241, 0)`),r.fillStyle=c,r.fill()}};function x(e,t=document.documentElement){let n=getComputedStyle(t).getPropertyValue(e).trim();if(!n)throw Error(`CSS variable ${e} is not defined or empty.`);let r=n.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/);if(!r){if(n.startsWith(`#`))return n;throw Error(`Could not parse color format: ${n}`)}let i=parseInt(r[1],10),a=parseInt(r[2],10),o=parseInt(r[3],10),s=r[4]?parseFloat(r[4]):null,c=e=>e.toString(16).padStart(2,`0`),l=`#${c(i)}${c(a)}${c(o)}`;if(s!==null&&s<1){let e=Math.round(s*255).toString(16).padStart(2,`0`);l+=e}return l}var S=class{constructor(e){this.container=e,this.activeTab=`feed`,this.insightScope=`group`,this.unsubscribe=c.subscribe(e=>this.onStateChange(e)),this.renderSkeleton(),this.cacheDOM(),this.attachListeners()}onStateChange(e){e.currentView===`group-detail`&&this.updateUI(e)}renderSkeleton(){this.container.innerHTML=`
      <div class="space-y-4 animate-fade-in pb-8">
        <div class="bg-gradient-to-br from-slate-900 to-slate-800 text-white border border-slate-800 rounded-2xl p-4 shadow-sm dark:from-slate-900 dark:to-slate-800">
          <div class="flex justify-between items-center">
            <div class="w-1/2">
              <h2 id="gd-title" class="text-base font-black truncate">Loading Room...</h2>
              <span id="gd-id" class="text-[9px] text-accent-300 font-mono block truncate">ID: None</span>
            </div>
            <div class="flex space-x-1.5 shrink-0">
              <button type="button" id="gd-btn-invite" class="bg-slate-800 hover:bg-slate-700 text-accent-400 text-xs font-bold py-1.5 px-2.5 rounded-lg border border-slate-700 transition-colors">
                <span id="gd-invite-text">Invite</span>
              </button>
              <button type="button" data-route="add-expense" class="bg-white text-slate-950 dark:bg-accent-500 dark:text-slate-950 text-xs font-bold py-1.5 px-3 rounded-lg shadow-sm hover:opacity-90">Log Item</button>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-2 mt-4" id="gd-balances-grid"></div>
        </div>

        <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 p-3.5 rounded-xl shadow-2xs space-y-2">
          <h4 class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Group Roster</h4>
          <div class="flex flex-wrap gap-1.5" id="gd-roster-tags"></div>
        </div>

        <div class="flex space-x-4 border-b border-slate-200 dark:border-slate-800">
          <button id="gd-tab-feed" class="text-xs font-bold pb-2 transition-colors border-b-2 border-accent-500 text-accent-600 dark:text-accent-400 cursor-pointer">Ledger Feed</button>
          <button id="gd-tab-insights" class="text-xs font-bold pb-2 transition-colors border-b-2 border-transparent text-slate-400 hover:text-slate-600 cursor-pointer">Group Insights</button>
        </div>

        <div id="gd-view-feed" class="space-y-2 pb-8">
          <div class="space-y-2" id="gd-ledger-feed"></div>
        </div>

        <div id="gd-view-insights" class="space-y-4 pb-8 hidden animate-fade-in">
          <div class="flex p-1 space-x-1 bg-slate-200/50 dark:bg-slate-800/50 rounded-xl mb-4">
            <button id="btn-scope-group" class="flex-1 py-1.5 text-xs font-bold rounded-lg bg-white shadow-xs text-slate-800 dark:bg-slate-700 dark:text-white transition-all cursor-pointer">Total Group</button>
            <button id="btn-scope-you" class="flex-1 py-1.5 text-xs font-bold rounded-lg text-slate-500 transition-all cursor-pointer">Your Share</button>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 p-3.5 rounded-xl shadow-2xs">
              <span class="block text-[9px] text-slate-400 uppercase font-bold tracking-wider">Total Group Spend</span>
              <span id="gd-insight-total" class="block text-lg font-black text-slate-700 dark:text-slate-200 mt-1 font-mono">0.00</span>
            </div>
            <div class="bg-accent-50 dark:bg-accent-900/20 border border-accent-100 dark:border-accent-800/40 p-3.5 rounded-xl shadow-2xs">
              <span class="block text-[9px] text-accent-500 uppercase font-bold tracking-wider">Your Personal Share</span>
              <span id="gd-insight-yours" class="block text-lg font-black text-accent-700 dark:text-accent-400 mt-1 font-mono">0.00</span>
            </div>
          </div>

          <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-2xs">
            <h4 id="gd-insight-title" class="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-700 pb-2 mb-3">Group Category Spend</h4>
            <div class="flex items-center space-x-4">
              <div class="w-32 h-32 relative shrink-0"><canvas id="gd-pie-canvas"></canvas></div>
              <div id="gd-category-legend" class="flex-grow space-y-2"></div>
            </div>
          </div>

          <div class="bg-amber-500/5 border border-amber-500/20 p-4 rounded-2xl shadow-2xs mt-4">
            <h4 class="text-[10px] font-bold text-amber-600 dark:text-amber-500 uppercase tracking-wider border-b border-amber-500/20 pb-2 mb-3">Suggested Settle Up Plan</h4>
            <div id="gd-insight-settlements" class="space-y-2"></div>
          </div>
        </div>
      </div>
    `}cacheDOM(){this.$title=this.container.querySelector(`#gd-title`),this.$id=this.container.querySelector(`#gd-id`),this.$balancesGrid=this.container.querySelector(`#gd-balances-grid`),this.$rosterTags=this.container.querySelector(`#gd-roster-tags`),this.$tabFeedBtn=this.container.querySelector(`#gd-tab-feed`),this.$tabInsightsBtn=this.container.querySelector(`#gd-tab-insights`),this.$viewFeed=this.container.querySelector(`#gd-view-feed`),this.$viewInsights=this.container.querySelector(`#gd-view-insights`),this.$ledgerFeed=this.container.querySelector(`#gd-ledger-feed`),this.$btnInvite=this.container.querySelector(`#gd-btn-invite`),this.$inviteText=this.container.querySelector(`#gd-invite-text`),this.$insightTotal=this.container.querySelector(`#gd-insight-total`),this.$insightYours=this.container.querySelector(`#gd-insight-yours`),this.$insightSettlements=this.container.querySelector(`#gd-insight-settlements`),this.$btnScopeGroup=this.container.querySelector(`#btn-scope-group`),this.$btnScopeYou=this.container.querySelector(`#btn-scope-you`),this.$pieCanvas=this.container.querySelector(`#gd-pie-canvas`),this.$categoryLegend=this.container.querySelector(`#gd-category-legend`),this.$insightTitle=this.container.querySelector(`#gd-insight-title`)}attachListeners(){let e=e=>{this.activeTab=e;let t=[`border-accent-500`,`text-accent-600`,`dark:text-accent-400`],n=[`border-transparent`,`text-slate-400`];e===`feed`?(this.$tabFeedBtn.classList.add(...t),this.$tabFeedBtn.classList.remove(...n),this.$tabInsightsBtn.classList.add(...n),this.$tabInsightsBtn.classList.remove(...t),this.$viewFeed.classList.remove(`hidden`),this.$viewInsights.classList.add(`hidden`)):(this.$tabInsightsBtn.classList.add(...t),this.$tabInsightsBtn.classList.remove(...n),this.$tabFeedBtn.classList.add(...n),this.$tabFeedBtn.classList.remove(...t),this.$viewInsights.classList.remove(`hidden`),this.$viewFeed.classList.add(`hidden`),this.updateUI(c.getState()))};this.$tabFeedBtn.addEventListener(`click`,()=>e(`feed`)),this.$tabInsightsBtn.addEventListener(`click`,()=>e(`insights`)),this.$btnScopeGroup.addEventListener(`click`,()=>{this.insightScope=`group`,this.$btnScopeGroup.classList.add(`bg-white`,`text-slate-800`,`dark:bg-slate-700`,`dark:text-white`,`shadow-xs`),this.$btnScopeGroup.classList.remove(`text-slate-500`),this.$btnScopeYou.classList.add(`text-slate-500`),this.$btnScopeYou.classList.remove(`bg-white`,`text-slate-800`,`dark:bg-slate-700`,`dark:text-white`,`shadow-xs`),this.$insightTitle.innerText=`Total Group Spend`,this.updateUI(c.getState())}),this.$btnInvite.addEventListener(`click`,async()=>{let e=c.getState();if(e.activeGroupId)try{this.$inviteText.innerText=`Sharing...`,this.$btnInvite.disabled=!0,await d.enableLedgerPublicLinkSharing(e.activeGroupId);let t=`${window.location.origin}${window.location.pathname}?invite=${e.activeGroupId}&name=${encodeURIComponent(e.activeGroupName)}`;await navigator.clipboard.writeText(t),m.show(`Invite link copied to clipboard!`,`success`),this.$inviteText.innerText=`Copied!`}catch(e){e.message.includes(`404`)||e.message.includes(`notFound`)?m.show(`Only the group creator can generate invite links.`,`error`):m.show(`Failed to generate invite.`,`error`),this.$inviteText.innerText=`Error`}finally{setTimeout(()=>{this.$inviteText.innerText=`Invite`,this.$btnInvite.disabled=!1},2e3)}}),this.$btnScopeYou.addEventListener(`click`,()=>{this.insightScope=`you`,this.$btnScopeYou.classList.add(`bg-white`,`text-slate-800`,`dark:bg-slate-700`,`dark:text-white`,`shadow-xs`),this.$btnScopeYou.classList.remove(`text-slate-500`),this.$btnScopeGroup.classList.add(`text-slate-500`),this.$btnScopeGroup.classList.remove(`bg-white`,`text-slate-800`,`dark:bg-slate-700`,`dark:text-white`,`shadow-xs`),this.$insightTitle.innerText=`Your Personal Share`,this.updateUI(c.getState())}),this.$ledgerFeed.addEventListener(`click`,e=>{let t=e.target.closest(`[data-event-id]`);if(!t)return;let n=t.getAttribute(`data-event-id`),r=c.getState().groupEvents.find(e=>(e.eventId||e.event_id)===n);r&&(c.setState({selectedExpenseDetails:r}),f.navigate(`expense-detail`))})}getAvatar(e,t,n=`w-8 h-8`){let r=t[e];return r&&r.picture?`<img src="${r.picture}" alt="${r.name}" class="${n} rounded-full border-2 border-white dark:border-slate-800 object-cover shadow-sm">`:`<div class="${n} rounded-full bg-gradient-to-br from-accent-500 to-accent-600 border-2 border-white dark:border-slate-800 flex items-center justify-center text-white font-bold text-[10px] shadow-sm">${r&&r.name?r.name.charAt(0).toUpperCase():e.charAt(0).toUpperCase()}</div>`}updateUI(e){if(!e.activeGroupId)return;this.$title.innerText=e.activeGroupName||`Active Room`,this.$id.innerText=`ID: ${e.activeGroupId}`,this.$btnInvite&&(this.$btnInvite.classList.remove(`hidden`),this.$btnInvite.style.display=`flex`);let t=_(e.groupEvents),n=e.userProfile?.email||``;this.$balancesGrid.innerHTML=Object.keys(t.members).map(e=>{let r=t.members[e],i=t.profiles[e],a=e===n?`You`:i?.name||e.split(`@`)[0],o=r.netBalance>0,s=r.netBalance===0,c=`text-slate-400`,l=``;return s||(c=o?`text-emerald-600 dark:text-emerald-400`:`text-rose-600 dark:text-rose-400`,l=o?`+`:``),`
        <div class="p-2.5 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800/60 rounded-xl flex justify-between items-center shadow-2xs">
          <div class="flex items-center space-x-2 truncate pr-2">
            ${this.getAvatar(e,t.profiles,`w-6 h-6 shrink-0`)}
            <span class="text-[0.625rem] text-slate-600 dark:text-slate-300 font-medium truncate">${a}</span>
          </div>
          <span class="text-xs font-black tracking-tight ${c} shrink-0">${l}${r.netBalance.toFixed(2)}</span>
        </div>`}).join(``),this.$rosterTags.innerHTML=Object.keys(t.members).map(e=>{let r=t.profiles[e],i=e===n?`You`:r?.name||e.split(`@`)[0];return`
        <span class="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-medium text-[0.625rem] px-2 py-1 rounded-md flex items-center space-x-1.5 shadow-2xs">
          ${this.getAvatar(e,t.profiles,`w-4 h-4 border border-white dark:border-slate-700`)}
          <span>${i}</span>
        </span>`}).join(``),t.expenses.length===0?this.$ledgerFeed.innerHTML=`<div class="text-center py-8 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-4 w-full"><p class="text-xs text-slate-400">No transactions recorded yet.</p></div>`:this.$ledgerFeed.innerHTML=[...t.expenses].reverse().map(e=>{let r=e.rawPayload,i=`bg-slate-100 dark:bg-slate-900 text-slate-500`,a=``,o=t.profiles[e.payer],s=e.payer===n?`You`:o?.name||e.payer.split(`@`)[0];if(e.type===`EXPENSE_ADD`){let t=(r.allocations||[]).find(e=>e.user===n),i=t&&parseFloat(t.value)||0;if(e.payer===n){let t=e.amount-i;a=t>0?`<span class="text-emerald-600 dark:text-emerald-400 font-bold">You are owed INR ${t.toFixed(2)}</span>`:`<span class="text-slate-400">Covered exact share</span>`}else a=i>0?`<span class="text-rose-600 dark:text-rose-400 font-bold">You owe INR ${i.toFixed(2)}</span>`:`<span class="text-slate-400">Not in split</span>`}else e.type===`TRANSFER`&&(i=`bg-amber-500/10 text-amber-500 border border-amber-500/20`,e.payer===n?a=`<span class="text-emerald-500 font-semibold">Sent payment</span>`:e.target===n&&(a=`<span class="text-emerald-500 font-semibold">Received payment</span>`));return`
          <div data-event-id="${e.eventId}" class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 p-3.5 rounded-xl flex justify-between items-center text-xs shadow-2xs cursor-pointer hover:border-accent-500/30 transition-colors">
            <div class="space-y-1 max-w-[65%]">
              <div class="font-bold text-slate-800 dark:text-slate-200 truncate">${e.title}</div>
              <div class="text-[10px] block font-medium">${a}</div>
              <div class="flex items-center space-x-1.5 text-[9px] text-slate-400 pt-0.5">
                <span class="px-1.5 py-0.2 rounded font-bold text-[8px] uppercase tracking-wide ${i}">${e.category||`General`}</span>
                <span>&bull;</span>
                <span class="truncate">By ${s}</span>
              </div>
            </div>
            <div class="text-right space-y-0.5 font-mono shrink-0">
              <div class="font-black text-slate-900 dark:text-slate-100">INR ${e.amount.toFixed(2)}</div>
              <div class="text-[9px] text-slate-400">${new Date(e.timestamp).toLocaleDateString()}</div>
            </div>
          </div>`}).join(``),this.renderInsights(e.groupEvents,n,t.members,t.profiles)}renderInsights(e,t,n,r){if(!this.$insightSettlements||!this.$insightTotal)return;let i=g(n);i.length===0?this.$insightSettlements.innerHTML=`<p class="text-[10px] text-emerald-600 dark:text-emerald-500 text-center py-3 font-bold bg-emerald-50 dark:bg-emerald-900/20 rounded-xl">✨ Everyone is perfectly settled up!</p>`:this.$insightSettlements.innerHTML=i.map(e=>{let n=r[e.from]?.name||e.from.split(`@`)[0],i=r[e.to]?.name||e.to.split(`@`)[0];return`
          <div class="flex items-center justify-between p-3 rounded-2xl shadow-2xs border ${e.from===t||e.to===t?`bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/50`:`bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700/50`} mb-2">
             <div class="flex items-center space-x-3">
                <div class="flex -space-x-3">
                   ${this.getAvatar(e.from,r,`w-9 h-9 relative z-10`)}
                   ${this.getAvatar(e.to,r,`w-9 h-9 opacity-80`)}
                </div>
                <div class="text-[11px] leading-tight">
                   <span class="font-bold text-slate-800 dark:text-slate-200">${e.from===t?`You`:n}</span>
                   <span class="text-slate-400 mx-0.5 block">owe</span>
                   <span class="font-bold text-slate-800 dark:text-slate-200">${e.to===t?`You`:i}</span>
                </div>
             </div>
             <div class="font-black font-mono text-accent-600 dark:text-accent-400 text-sm">INR ${e.amount.toFixed(2)}</div>
          </div>
        `}).join(``);let a=this.insightScope===`you`?t:null,o=y.processAnalytics(e,a,365),s=a?o:y.processAnalytics(e,t,365),c=a?y.processAnalytics(e,null,365):o;this.$insightTotal.innerText=c.total.toFixed(2),this.$insightYours.innerText=s.total.toFixed(2),setTimeout(()=>{this.$viewInsights.classList.contains(`hidden`)||b.drawPie(this.$pieCanvas,o.categories)},100);let l=b.getColors(),u=Object.entries(o.categories).sort((e,t)=>t[1]-e[1]);this.$categoryLegend.innerHTML=u.length>0?u.map(([e,t],n)=>`
      <div class="flex justify-between items-center text-[10px] font-medium">
        <div class="flex items-center space-x-1.5 truncate pr-2">
          <span class="w-2.5 h-2.5 rounded-full block shrink-0" style="background-color: ${l[n%l.length]}"></span>
          <span class="text-slate-600 dark:text-slate-300 truncate">${e}</span>
        </div>
        <span class="font-mono text-slate-800 dark:text-slate-200">INR ${t.toFixed(0)}</span>
      </div>
    `).join(``):`<p class="text-[10px] text-slate-400">No data available for this view.</p>`}destroy(){this.unsubscribe(),this.container.innerHTML=``}},C=class{constructor(e,t=()=>{}){this.container=e,this.onUpdate=t,this.$exprDisplay=this.container.querySelector(`#calc-display-expression, .calc-display-expression`),this.$valDisplay=this.container.querySelector(`#calc-display-value, .calc-display-value`),this.expression=`0`,this.total=0,this.handleKeyDown=this.handleKeyDown.bind(this),this.attachListeners()}processInput(e){e&&(e===`C`?(this.expression=`0`,this.total=0,this.$valDisplay&&(this.$valDisplay.innerText=`0.00`)):e===`DEL`?(this.expression=this.expression.slice(0,-1),(this.expression===``||this.expression===`-`)&&(this.expression=`0`)):this.expression===`0`&&![`+`,`-`,`*`,`/`].includes(e)?this.expression=e:this.expression+=e,this.$exprDisplay&&(this.$exprDisplay.innerText=this.expression),this.evaluateExpression())}evaluateExpression(){try{let e=this.expression.replace(/[^0-9+\-*/().\s]/g,``);if(!e)return;let t=Function(`return (${e})`)();Number.isFinite(t)&&(this.total=t,this.$valDisplay&&(this.$valDisplay.innerText=t.toFixed(2)))}catch{}this.onUpdate(this.total,this.expression)}attachListeners(){this.container.addEventListener(`click`,e=>{let t=e.target.closest(`.comp-calc-btn, .calc-btn`);t&&(e.preventDefault(),this.processInput(t.getAttribute(`data-val`)))}),window.addEventListener(`keydown`,this.handleKeyDown)}handleKeyDown(e){if(!(!this.container.offsetParent||this.container.closest(`.hidden`))&&!(e.target.tagName===`INPUT`||e.target.tagName===`TEXTAREA`)){if([`0`,`1`,`2`,`3`,`4`,`5`,`6`,`7`,`8`,`9`,`.`,`+`,`-`,`*`,`/`,`(`,`)`].includes(e.key))e.preventDefault(),this.processInput(e.key);else if(e.key===`Backspace`)e.preventDefault(),this.processInput(`DEL`);else if(e.key===`Escape`)e.preventDefault(),this.processInput(`C`);else if(e.key===`Enter`){e.preventDefault();let t=this.container.querySelector(`button[type="submit"]`);t&&t.click()}}}reset(){this.processInput(`C`)}destroy(){window.removeEventListener(`keydown`,this.handleKeyDown)}},w=class{static ratesCache=null;static lastFetch=0;static async getMultiplier(e,t=`INR`){if(e===t)return 1;let n=Date.now();if(!this.ratesCache||n-this.lastFetch>720*60*1e3)try{let e=await(await fetch(`https://open.er-api.com/v6/latest/${t}`)).json();this.ratesCache=e.rates,this.lastFetch=n}catch(e){if(console.warn(`Exchange rate fetch failed, falling back to cached or 1:1`,e),!this.ratesCache)return 1}let r=this.ratesCache[e];return r?1/r:1}},T=e=>{try{let t=(e||``).replace(/[^0-9+\-*/.()]/g,``);if(!t)return 0;let n=Function(`return `+t)();return isNaN(n)||!isFinite(n)?0:n}catch{return 0}},E=class{constructor(e){this.container=e,this.calculator=null,this.activeRoster=[],this.receiptBase64=null,this.editingEventId=null,this.activeTab=`EXPENSE_ADD`,this.exchangeMultiplier=1,this.unsubscribe=c.subscribe(e=>this.onStateChange(e)),this.render(),this.cacheDOM(),this.attachListeners(),this.attachDesktopKeyboardSupport()}onStateChange(e){if(e.currentView!==`add-expense`)return;let t=_(e.groupEvents);this.activeRoster=Object.keys(t.members).length>0?Object.keys(t.members):[e.userProfile?.email||`Unknown`],this.updateDropdowns()}render(){let e=new Date;e.setMinutes(e.getMinutes()-e.getTimezoneOffset());let t=e.toISOString().slice(0,16);this.container.innerHTML=`
      <div class="space-y-5 animate-fade-in pb-12 max-w-lg mx-auto relative">
        <div class="flex items-center justify-between">
          <button type="button" data-route="group-detail" class="text-slate-400 hover:text-slate-800 dark:hover:text-white p-2 -ml-2 rounded-full transition-colors cursor-pointer">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
          </button>
          <h3 class="text-sm font-black tracking-tight" id="form-header-title">Log Transaction</h3>
          <button id="cancel-edit-btn" class="hidden text-[10px] uppercase tracking-wider text-rose-500 font-bold bg-rose-500/10 px-3 py-1.5 rounded-full transition-all">Cancel Edit</button>
        </div>

        <div class="flex p-1 space-x-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl shadow-inner border border-slate-200/50 dark:border-slate-700/50">
          <button data-tab="EXPENSE_ADD" class="form-tab flex-1 py-2 text-xs font-bold rounded-lg shadow-sm bg-white text-slate-800 dark:bg-slate-700 dark:text-white transition-all cursor-pointer">Expense</button>
          <button data-tab="TRANSFER" class="form-tab flex-1 py-2 text-xs font-bold rounded-lg text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-all cursor-pointer">Transfer</button>
          <button data-tab="LOAN" class="form-tab flex-1 py-2 text-xs font-bold rounded-lg text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-all cursor-pointer">Loan</button>
        </div>

        <form id="comp-expense-form" class="space-y-4" onsubmit="return false;">
          <div id="calc-display-zone" class="relative bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 p-5 rounded-3xl shadow-sm focus-within:border-accent-500 focus-within:ring-4 focus-within:ring-accent-500/20 transition-all group overflow-hidden cursor-pointer md:cursor-default">
            <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-accent-400 to-emerald-400 opacity-50"></div>
            <div class="flex justify-between items-start mb-2">
              <span class="text-[9px] text-slate-400 uppercase font-bold tracking-wider">Total Amount</span>
              <div class="flex items-center space-x-1 bg-slate-100 dark:bg-slate-800 rounded-lg px-2 py-1 cursor-pointer hover:bg-slate-200 transition-colors pointer-events-auto">
                <select id="comp-currency" class="bg-transparent text-xs font-bold text-accent-600 dark:text-accent-400 focus:outline-none appearance-none cursor-pointer">
                  <option value="INR">INR</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                  <option value="AED">AED</option>
                </select>
                <svg class="w-3 h-3 text-accent-500/50" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"></path></svg>
              </div>
            </div>
            <div class="text-right">
              <div id="calc-display-expression" class="text-xs text-slate-400 min-h-[1rem] truncate font-mono">0</div>
              <div id="calc-display-value" class="text-4xl font-black text-slate-800 dark:text-white mt-1 truncate tracking-tight">0.00</div>
              <div id="calc-converted-value" class="text-[10px] text-emerald-500 font-bold hidden mt-1">≈ 0.00 INR</div>
            </div>
            <p class="hidden md:block text-[9px] text-slate-400 text-center mt-3 font-medium">✨ Type numbers directly on your keyboard</p>
            <p class="md:hidden text-[9px] text-accent-500 text-center mt-3 font-bold uppercase tracking-wider animate-pulse">Tap to open Calculator</p>
          </div>

          <!-- COMMON FIELDS -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Description</label>
              <input type="text" id="comp-exp-title" required placeholder="What was this for?" class="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-medium focus:bg-white focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 focus:outline-none transition-all">
            </div>
            <div>
              <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Date</label>
              <input type="datetime-local" id="comp-exp-datetime" value="${t}" class="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-medium focus:bg-white focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 focus:outline-none transition-all">
            </div>
          </div>

          <!-- TAB 1: EXPENSE -->
          <div id="section-expense" class="space-y-4 animate-fade-in">
            <div class="bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/50 p-4 rounded-2xl shadow-2xs space-y-3">
              <div class="flex justify-between items-center">
                <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Who Paid?</label>
                <select id="comp-payer-mode" class="bg-slate-100 dark:bg-slate-900 border border-transparent hover:border-slate-300 py-1.5 px-2 rounded-lg text-[10px] font-bold focus:outline-none cursor-pointer transition-colors">
                  <option value="SINGLE">Single Person</option>
                  <option value="MULTIPLE">Multiple People</option>
                </select>
              </div>
              <div id="comp-payer-single-slot">
                <select id="comp-single-payer-dropdown" class="w-full roster-dropdown bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm font-semibold focus:outline-none cursor-pointer"></select>
              </div>
              <div id="comp-payer-multiple-slot" class="space-y-2 hidden max-h-40 overflow-y-auto pr-1"></div>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Category</label>
                <select id="comp-exp-category" class="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-semibold focus:outline-none cursor-pointer">
                  <option value="Food">Food & Dining</option>
                  <option value="Utilities">Utilities & Bills</option>
                  <option value="Travel">Transportation</option>
                  <option value="Entertainment">Entertainment</option>
                  <option value="General">General/Other</option>
                </select>
              </div>
              <div>
                <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Split Strategy</label>
                <select id="comp-exp-strategy" class="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-semibold focus:outline-none cursor-pointer">
                  <option value="EQUALLY">Split Equally</option>
                  <option value="SHARES">Split By Shares</option>
                  <option value="EXACT">Split Exact Amounts</option>
                  <option value="ADJUSTMENT">Relative (+/-)</option>
                </select>
              </div>
            </div>

            <div id="comp-advanced-split-block" class="bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-500/20 p-4 rounded-2xl space-y-3 hidden">
              <h4 id="comp-split-hint" class="text-[9px] font-bold text-indigo-500 uppercase tracking-wider">Allocation Parameters</h4>
              <div id="comp-split-members-list" class="space-y-2 max-h-40 overflow-y-auto pr-1"></div>
              <p class="text-[9px] text-indigo-400/80 font-medium pt-1">💡 You can type math equations directly (e.g. 100/3)</p>
            </div>

            <div class="bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
              <h4 class="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between mb-2">
                <span>Final Output Preview</span>
                <span id="comp-preview-error" class="text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded normal-case hidden font-bold text-[9px]">Sum mismatch</span>
              </h4>
              <div id="comp-live-calculation-preview" class="grid grid-cols-2 gap-2 text-[11px]"></div>
            </div>

            <div id="receipt-upload-zone" class="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-accent-500 rounded-2xl p-4 text-center cursor-pointer bg-white/40 dark:bg-slate-900/40 transition-colors group">
              <input type="file" id="receipt-file-input" class="hidden" accept="image/*">
              <div class="flex flex-col items-center justify-center space-y-1 text-slate-400 group-hover:text-accent-500 transition-colors">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path stroke-linecap="round" stroke-linejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                <span class="text-[10px] font-bold uppercase tracking-wider" id="receipt-zone-status">Attach Bill Receipt</span>
              </div>
            </div>
          </div>

          <!-- TAB 2: TRANSFER -->
          <div id="section-transfer" class="space-y-4 hidden animate-fade-in">
            <div class="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-700/30 p-4 rounded-2xl space-y-4 relative">
              <div>
                <label class="block text-[10px] font-bold text-amber-600 dark:text-amber-500 uppercase tracking-wider mb-1.5 ml-1">Sender</label>
                <select id="transfer-sender" class="w-full roster-dropdown bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-700/50 rounded-xl p-3 text-sm font-semibold focus:outline-none"></select>
              </div>
              <div class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 bg-amber-100 dark:bg-amber-900 p-2 rounded-full border border-amber-200 text-amber-500 shadow-sm mt-1">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path></svg>
              </div>
              <div>
                <label class="block text-[10px] font-bold text-amber-600 dark:text-amber-500 uppercase tracking-wider mb-1.5 ml-1">Receiver</label>
                <select id="transfer-receiver" class="w-full roster-dropdown bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-700/50 rounded-xl p-3 text-sm font-semibold focus:outline-none"></select>
              </div>
            </div>
          </div>

          <!-- TAB 3: LOAN -->
          <div id="section-loan" class="space-y-4 hidden animate-fade-in">
            <div class="bg-violet-50 dark:bg-violet-900/10 border border-violet-200 dark:border-violet-700/30 p-4 rounded-2xl space-y-4">
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-[10px] font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wider mb-1.5 ml-1">Lender</label>
                  <select id="loan-lender" class="w-full roster-dropdown bg-white dark:bg-slate-900 border border-violet-200 dark:border-violet-700/50 rounded-xl p-2.5 text-xs font-semibold focus:outline-none"></select>
                </div>
                <div>
                  <label class="block text-[10px] font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wider mb-1.5 ml-1">Borrower</label>
                  <select id="loan-borrower" class="w-full roster-dropdown bg-white dark:bg-slate-900 border border-violet-200 dark:border-violet-700/50 rounded-xl p-2.5 text-xs font-semibold focus:outline-none"></select>
                </div>
              </div>
            </div>
          </div>

          <!-- DESKTOP SUBMIT -->
          <button type="submit" id="comp-btn-submit-desktop" class="w-full bg-accent-600 hover:bg-accent-700 text-white font-black rounded-2xl text-sm py-4 cursor-pointer transition-colors shadow-sm tracking-wide uppercase active:scale-[0.98]">
            Save Transaction
          </button>
        </form>

        <!-- ─── MOBILE CALCULATOR MODAL (BOTTOM SHEET) ─── -->
        <div id="mobile-calc-modal" class="fixed inset-0 z-[100] hidden bg-slate-900/60 backdrop-blur-sm flex flex-col justify-end animate-fade-in md:hidden">
          <div class="bg-slate-100 dark:bg-slate-900 rounded-t-3xl p-5 pb-8 shadow-2xl transform transition-transform border-t border-slate-200 dark:border-slate-800">
            <div class="flex justify-between items-center mb-4">
              <span class="text-xs font-bold text-slate-500 uppercase tracking-wider">Amount Input</span>
            </div>

            <!-- Modal Display Screen -->
            <div class="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl mb-4 text-right shadow-inner">
               <div id="modal-calc-expression" class="text-xs text-slate-400 font-mono min-h-[1rem] truncate">0</div>
               <div id="modal-calc-value" class="text-4xl font-black text-slate-800 dark:text-white mt-1 tracking-tight truncate">0.00</div>
            </div>
            
            <div class="grid grid-cols-4 gap-2">
              ${[`C`,`(`,`)`,`/`,`7`,`8`,`9`,`*`,`4`,`5`,`6`,`-`,`1`,`2`,`3`,`+`,`0`,`.`,`DEL`].map(e=>`
                <button type="button" class="calc-btn h-14 text-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-2xl font-bold shadow-sm active:scale-95 transition-all border border-slate-200 dark:border-slate-700" data-val="${e}">${e}</button>
              `).join(``)}
              <!-- TICK BUTTON NOW CLOSES MODAL INSTEAD OF SUBMITTING -->
              <button type="button" id="mobile-calc-done" class="bg-accent-600 text-white font-black rounded-2xl text-lg active:scale-95 transition-all shadow-md flex items-center justify-center">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    `}cacheDOM(){this.$form=this.container.querySelector(`#comp-expense-form`),this.$title=this.container.querySelector(`#comp-exp-title`),this.$datetime=this.container.querySelector(`#comp-exp-datetime`),this.$cancelEditBtn=this.container.querySelector(`#cancel-edit-btn`),this.$headerTitle=this.container.querySelector(`#form-header-title`),this.$sectionExpense=this.container.querySelector(`#section-expense`),this.$sectionTransfer=this.container.querySelector(`#section-transfer`),this.$sectionLoan=this.container.querySelector(`#section-loan`),this.$tabButtons=this.container.querySelectorAll(`.form-tab`),this.$currency=this.container.querySelector(`#comp-currency`),this.$convertedValue=this.container.querySelector(`#calc-converted-value`),this.$displayZone=this.container.querySelector(`#calc-display-zone`),this.$calcModal=this.container.querySelector(`#mobile-calc-modal`),this.$mobileCalcDone=this.container.querySelector(`#mobile-calc-done`),this.$modalCalcExpr=this.container.querySelector(`#modal-calc-expression`),this.$modalCalcVal=this.container.querySelector(`#modal-calc-value`),this.$payerMode=this.container.querySelector(`#comp-payer-mode`),this.$singleSlot=this.container.querySelector(`#comp-payer-single-slot`),this.$multiSlot=this.container.querySelector(`#comp-payer-multiple-slot`),this.$category=this.container.querySelector(`#comp-exp-category`),this.$strategySelect=this.container.querySelector(`#comp-exp-strategy`),this.$splitBlock=this.container.querySelector(`#comp-advanced-split-block`),this.$splitMembersList=this.container.querySelector(`#comp-split-members-list`),this.$splitHint=this.container.querySelector(`#comp-split-hint`),this.$previewContainer=this.container.querySelector(`#comp-live-calculation-preview`),this.$previewError=this.container.querySelector(`#comp-preview-error`),this.$uploadZone=this.container.querySelector(`#receipt-upload-zone`),this.$fileInput=this.container.querySelector(`#receipt-file-input`),this.$zoneStatus=this.container.querySelector(`#receipt-zone-status`),this.$transferSender=this.container.querySelector(`#transfer-sender`),this.$transferReceiver=this.container.querySelector(`#transfer-receiver`),this.$loanLender=this.container.querySelector(`#loan-lender`),this.$loanBorrower=this.container.querySelector(`#loan-borrower`),this.calculator=new C(this.container,()=>this.calculateLiveOutputPreview())}attachDesktopKeyboardSupport(){window.addEventListener(`keydown`,this._handleKeydown=e=>{if(c.getState().currentView!==`add-expense`)return;let t=document.activeElement.tagName.toLowerCase();[`input`,`textarea`,`select`].includes(t)||[`0`,`1`,`2`,`3`,`4`,`5`,`6`,`7`,`8`,`9`,`.`,`+`,`-`,`*`,`/`,`(`,`)`,`Backspace`].includes(e.key)&&(e.preventDefault(),e.key===`Backspace`?this.calculator.handleInput(`DEL`):this.calculator.handleInput(e.key))})}updateDropdowns(){let e=c.getState(),t=_(e.groupEvents).profiles,n=this.activeRoster.map(e=>`<option value="${e}">${t[e]?.name||e.split(`@`)[0]}</option>`).join(``);this.container.querySelectorAll(`.roster-dropdown`).forEach(e=>e.innerHTML=n);let r=e.userProfile?.email;this.activeRoster.includes(r)&&(this.container.querySelector(`#comp-single-payer-dropdown`).value=r,this.$transferSender.value=r,this.$loanLender.value=r);let i=this.activeRoster.find(e=>e!==r)||r;this.$transferReceiver.value=i,this.$loanBorrower.value=i,this.$multiSlot.innerHTML=this.activeRoster.map(e=>`
        <div class="flex justify-between items-center bg-white dark:bg-slate-800 p-2 rounded-xl border border-slate-100 dark:border-slate-700">
          <span class="truncate max-w-[65%] font-semibold text-xs text-slate-600 dark:text-slate-300 ml-1">${t[e]?.name||e.split(`@`)[0]} paid</span>
          <input type="text" inputmode="text" data-payer-share="${e}" placeholder="0.00" class="w-24 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-1.5 text-right font-mono rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-500/30 text-xs transition-all">
        </div>
      `).join(``),this.renderItemizedInputs()}attachListeners(){this.$displayZone.addEventListener(`click`,e=>{e.target.closest(`#comp-currency`)||window.innerWidth<768&&this.$calcModal.classList.remove(`hidden`)}),this.$mobileCalcDone.addEventListener(`click`,()=>{this.$calcModal.classList.add(`hidden`)}),this.$tabButtons.forEach(e=>{e.addEventListener(`click`,e=>{this.activeTab=e.target.getAttribute(`data-tab`),this.$tabButtons.forEach(e=>{e.classList.remove(`bg-white`,`text-slate-800`,`dark:bg-slate-700`,`dark:text-white`,`shadow-sm`),e.classList.add(`text-slate-500`)}),e.target.classList.add(`bg-white`,`text-slate-800`,`dark:bg-slate-700`,`dark:text-white`,`shadow-sm`),e.target.classList.remove(`text-slate-500`),this.$sectionExpense.classList.toggle(`hidden`,this.activeTab!==`EXPENSE_ADD`),this.$sectionTransfer.classList.toggle(`hidden`,this.activeTab!==`TRANSFER`),this.$sectionLoan.classList.toggle(`hidden`,this.activeTab!==`LOAN`)})}),this.$currency.addEventListener(`change`,async e=>{let t=e.target.value;t===`INR`?(this.exchangeMultiplier=1,this.$convertedValue.classList.add(`hidden`)):(this.$convertedValue.classList.remove(`hidden`),this.$convertedValue.innerText=`Fetching rate...`,this.exchangeMultiplier=await w.getMultiplier(t,`INR`)),this.calculateLiveOutputPreview()}),this.$payerMode.addEventListener(`change`,e=>{this.$singleSlot.classList.toggle(`hidden`,e.target.value!==`SINGLE`),this.$multiSlot.classList.toggle(`hidden`,e.target.value===`SINGLE`)}),this.$strategySelect.addEventListener(`change`,()=>this.renderItemizedInputs()),this.container.addEventListener(`input`,e=>{e.target.matches(`[data-member-allocation], [data-payer-share]`)&&this.calculateLiveOutputPreview()}),this.container.addEventListener(`blur`,e=>{e.target.matches(`[data-member-allocation], [data-payer-share]`)&&e.target.value.trim()!==``&&(e.target.value=T(e.target.value))},!0),this.$uploadZone.addEventListener(`click`,()=>this.$fileInput.click()),this.$fileInput.addEventListener(`change`,e=>{let t=e.target.files[0];if(!t)return;this.$zoneStatus.innerText=`Compressing...`;let n=new FileReader;n.onload=e=>{let t=new Image;t.onload=()=>{let e=document.createElement(`canvas`),n=t.width,r=t.height;n>800&&(r=Math.round(800/n*r),n=800),e.width=n,e.height=r,e.getContext(`2d`).drawImage(t,0,0,n,r),this.receiptBase64=e.toDataURL(`image/webp`,.6),this.$zoneStatus.innerText=`✓ Receipt Attached`,this.$zoneStatus.classList.add(`text-accent-500`),this.$uploadZone.classList.add(`border-accent-500`,`bg-accent-50`)},t.src=e.target.result},n.readAsDataURL(t)}),this.$form.addEventListener(`submit`,()=>this.handleSubmit()),this.$cancelEditBtn.addEventListener(`click`,()=>this.resetForm())}renderItemizedInputs(){if(this.activeTab!==`EXPENSE_ADD`)return;let e=this.$strategySelect.value;if(e===`EQUALLY`){this.$splitBlock.classList.add(`hidden`),this.calculateLiveOutputPreview();return}this.$splitBlock.classList.remove(`hidden`);let t=_(c.getState().groupEvents).profiles;this.$splitMembersList.innerHTML=this.activeRoster.map(n=>`
        <div class="flex justify-between items-center bg-white dark:bg-slate-900 p-2 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800">
          <span class="font-semibold text-xs text-slate-600 dark:text-slate-300 truncate ml-1">${t[n]?.name||n.split(`@`)[0]}</span>
          <input type="text" inputmode="text" data-member-allocation="${n}" placeholder="${e===`SHARES`?`1`:`0.00`}" class="w-24 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 p-1.5 rounded-lg text-right font-mono focus:outline-none focus:ring-2 focus:ring-accent-500/40 text-xs transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600">
        </div>
      `).join(``),e===`SHARES`&&(this.$splitHint.innerText=`Assign Weight Shares`),e===`EXACT`&&(this.$splitHint.innerText=`Enter Exact Cash Amounts`),e===`ADJUSTMENT`&&(this.$splitHint.innerText=`Relative Adjustments (+/-)`),this.calculateLiveOutputPreview()}calculateLiveOutputPreview(){if(this.activeTab!==`EXPENSE_ADD`)return;let e=this.calculator.total||0,t=e*this.exchangeMultiplier;this.$modalCalcExpr&&(this.$modalCalcExpr.innerText=this.calculator.expression||`0`),this.$modalCalcVal&&(this.$modalCalcVal.innerText=e.toFixed(2)),this.exchangeMultiplier!==1&&(this.$convertedValue.innerText=`≈ ${t.toFixed(2)} INR`);let n=this.$strategySelect.value;if(this.$previewError.classList.add(`hidden`),this.$previewContainer.innerHTML=``,this.activeRoster.length===0)return;let r={};if(n===`EQUALLY`){let e=t/this.activeRoster.length;this.activeRoster.forEach(t=>r[t]=e)}else{let e=Array.from(this.container.querySelectorAll(`[data-member-allocation]`));if(n===`EXACT`){let n=0,i=[];e.forEach(e=>{e.placeholder=`0.00`,e.value.trim()===``?i.push(e):n+=T(e.value)});let a=null,o=0;i.length===1&&n<=t&&(o=t-n,i[0].placeholder=`Auto: ${o.toFixed(2)}`,a=i[0].getAttribute(`data-member-allocation`),n+=o),this.activeRoster.forEach(e=>{let t=this.container.querySelector(`[data-member-allocation="${e}"]`);r[e]=e===a?o:T(t?.value)}),Math.abs(n-t)>.01&&this.$previewError.classList.remove(`hidden`)}else{let i={};if(e.forEach(e=>i[e.getAttribute(`data-member-allocation`)]=T(e.value)),n===`SHARES`){let e=Object.values(i).reduce((e,t)=>e+t,0);this.activeRoster.forEach(n=>r[n]=e>0?t*(i[n]/e):0)}else if(n===`ADJUSTMENT`){let e=(t-Object.values(i).reduce((e,t)=>e+t,0))/this.activeRoster.length;this.activeRoster.forEach(t=>r[t]=e+(i[t]||0))}}}let i=_(c.getState().groupEvents).profiles;Object.keys(r).forEach(e=>{let t=i[e]?.name||e.split(`@`)[0];this.$previewContainer.innerHTML+=`
        <div class="flex justify-between items-center bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-100 dark:border-slate-800 shadow-2xs">
          <span class="truncate max-w-[60%] text-slate-500 font-medium text-[10px] ml-1">${t}</span>
          <span class="font-black font-mono text-slate-800 dark:text-slate-200 text-xs">INR ${r[e].toFixed(2)}</span>
        </div>`}),this.currentAllocationsMatrix=r}async handleSubmit(){if(this.calculator.total<=0)return alert(`Amount must evaluate above 0.00`);let e=this.calculator.total*this.exchangeMultiplier,t={title:this.$title.value,raw_amount_string:this.calculator.expression,evaluated_amount:e,foreign_amount:this.calculator.total,foreign_currency:this.$currency.value,exchange_rate:this.exchangeMultiplier,currency:`INR`,custom_timestamp:new Date(this.$datetime.value).toISOString()};if(this.activeTab===`EXPENSE_ADD`)if(t.category=this.$category.value,t.split_strategy=this.$strategySelect.value,t.allocations=Object.keys(this.currentAllocationsMatrix).map(e=>({user:e,value:this.currentAllocationsMatrix[e]})),t.payers=[],this.receiptBase64&&(t.receipt_local_url=this.receiptBase64),this.$payerMode.value===`SINGLE`)t.target_peer_identity=this.container.querySelector(`#comp-single-payer-dropdown`).value,t.payers=[{user:t.target_peer_identity,value:e}];else{let n=0;if(this.container.querySelectorAll(`[data-payer-share]`).forEach(e=>{let r=e.getAttribute(`data-payer-share`),i=T(e.value);n+=i,i>0&&t.payers.push({user:r,value:i})}),Math.abs(n-e)>.02)return alert(`Multi-payers sum must match total (${e.toFixed(2)})`)}else if(this.activeTab===`TRANSFER`){if(this.$transferSender.value===this.$transferReceiver.value)return alert(`Sender and Receiver cannot be the same.`);t.category=`Financial`,t.override_actor_identity=this.$transferSender.value,t.target_peer_identity=this.$transferReceiver.value}else if(this.activeTab===`LOAN`){if(this.$loanLender.value===this.$loanBorrower.value)return alert(`Lender and Borrower cannot be the same.`);t.category=`Financial`,t.override_actor_identity=this.$loanLender.value,t.target_peer_identity=this.$loanBorrower.value}try{let e=c.getState().activeGroupId;this.editingEventId&&await d.appendLocalEvent(e,`EXPENSE_DELETE`,{target_event_id:this.editingEventId}),await d.appendLocalEvent(e,this.activeTab,t),this.resetForm(),f.navigate(`group-detail`)}catch(e){alert(`Ledger Submit Failure: ${e.message}`)}}loadExpenseForEdit(e){this.editingEventId=e.eventId||e.event_id;let t=e.rawPayload||(typeof e.payload_json==`string`?JSON.parse(e.payload_json):e.payload_json);this.$headerTitle.innerText=`Edit Transaction`,this.$cancelEditBtn.classList.remove(`hidden`),this.$title.value=t.title;let n=this.container.querySelector(`[data-tab="${e.event_type||`EXPENSE_ADD`}"]`);n&&n.click(),this.calculator.expression=t.raw_amount_string||t.evaluated_amount.toString(),this.calculator.evaluateExpression(),setTimeout(()=>{this.activeTab===`EXPENSE_ADD`&&(this.$category.value=t.category||`General`,this.$strategySelect.value=t.split_strategy||`EQUALLY`,t.payers&&t.payers.length>1?(this.$payerMode.value=`MULTIPLE`,this.$payerMode.dispatchEvent(new Event(`change`)),t.payers.forEach(e=>{let t=this.container.querySelector(`[data-payer-share="${e.user}"]`);t&&(t.value=e.value)})):t.payers&&t.payers.length===1&&(this.container.querySelector(`#comp-single-payer-dropdown`).value=t.payers[0].user),this.receiptBase64=t.receipt_local_url||null,this.receiptBase64&&(this.$zoneStatus.innerText=`✓ Receipt Loaded`,this.$uploadZone.classList.add(`border-accent-500`,`bg-accent-50`)),this.renderItemizedInputs())},50)}resetForm(){this.editingEventId=null,this.receiptBase64=null,this.$headerTitle.innerText=`Log Transaction`,this.$cancelEditBtn.classList.add(`hidden`),this.$form.reset(),this.$zoneStatus.innerText=`Attach Bill Receipt`,this.$uploadZone.classList.remove(`border-accent-500`,`bg-accent-50`),this.calculator.reset(),this.container.querySelector(`[data-tab="EXPENSE_ADD"]`).click(),this.$payerMode.value=`SINGLE`,this.$payerMode.dispatchEvent(new Event(`change`)),this.$strategySelect.value=`EQUALLY`,this.renderItemizedInputs()}destroy(){this.unsubscribe(),this.calculator.destroy(),this._handleKeydown&&window.removeEventListener(`keydown`,this._handleKeydown)}},D=class{constructor(e){this.container=e,this.currentEvent=null,this.unsubscribe=c.subscribe(e=>this.onStateChange(e)),this.renderSkeleton(),this.cacheDOM(),this.attachListeners()}onStateChange(e){e.currentView!==`expense-detail`||!e.selectedExpenseDetails||this.updateUI(e)}renderSkeleton(){this.container.innerHTML=`
      <div class="space-y-4 animate-fade-in pb-8 max-w-lg mx-auto relative">
        <div class="flex items-center space-x-2">
          <button type="button" data-route="group-detail" class="text-slate-400 hover:text-slate-800 dark:hover:text-white p-2 -ml-2 rounded-full transition-colors cursor-pointer">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
          </button>
          <h3 class="text-sm font-black tracking-tight">Transaction Summary</h3>
        </div>

        <div class="bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/50 p-5 rounded-3xl shadow-sm space-y-4 overflow-hidden relative">
          <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-accent-400 to-emerald-400 opacity-50"></div>
          
          <div class="flex justify-between items-start border-b border-slate-100 dark:border-slate-700/60 pb-4">
            <div class="max-w-[60%]">
              <h2 id="dtl-title" class="text-lg font-black text-slate-800 dark:text-slate-100 leading-tight">Item Label</h2>
              <div class="flex items-center space-x-2 mt-1.5">
                <span id="dtl-type-badge" class="px-2 py-0.5 rounded font-bold text-[9px] uppercase tracking-wide bg-accent-500/10 text-accent-600">EXPENSE</span>
                <span id="dtl-meta" class="text-[10px] text-slate-400 font-medium truncate">Category &bull; Date</span>
              </div>
            </div>
            <div class="text-right shrink-0">
              <div id="dtl-total" class="text-2xl font-black text-slate-900 dark:text-white font-mono tracking-tight">INR 0.00</div>
              <div id="dtl-foreign-meta" class="text-[9px] text-slate-400 font-medium mt-1 hidden"></div>
            </div>
          </div>

          <div class="space-y-3 pt-2">
            <div>
              <h4 class="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">Paid By</h4>
              <div id="dtl-payers-list" class="space-y-1.5"></div>
            </div>
            <div>
              <h4 class="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2 border-t border-slate-100 dark:border-slate-700/60 pt-3">Split Allocations</h4>
              <div id="dtl-allocations-list" class="space-y-1.5"></div>
            </div>
          </div>

          <div id="dtl-receipt-container" class="space-y-2 hidden pt-3 border-t border-slate-100 dark:border-slate-700/60">
            <h4 class="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Attached Bill (Tap to zoom)</h4>
            <div class="border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden bg-slate-50 dark:bg-slate-900/60 p-2 cursor-zoom-in">
              <img id="dtl-receipt-img" src="" referrerpolicy="no-referrer" alt="Attached digital file receipt asset" class="w-full max-h-72 object-contain rounded-xl">
            </div>
          </div>
        </div>

        <div class="flex space-x-2">
          <button id="dtl-btn-edit" class="flex-grow bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-accent-500 text-slate-700 dark:text-slate-200 font-bold py-3.5 rounded-2xl text-xs transition-colors cursor-pointer shadow-sm">
            ✏️ Edit Entry
          </button>
          <button id="dtl-btn-delete" class="flex-grow bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/50 hover:bg-rose-500 hover:text-white text-rose-600 font-bold py-3.5 rounded-2xl text-xs transition-all cursor-pointer shadow-sm text-center">
            🚨 Delete
          </button>
        </div>

        <!-- FULLSCREEN IMAGE OVERLAY -->
        <div id="dtl-fullscreen-overlay" class="fixed inset-0 z-[200] bg-slate-900/95 hidden flex flex-col items-center justify-center p-4 cursor-zoom-out backdrop-blur-md">
           <img id="dtl-fullscreen-img" class="max-w-full max-h-full rounded-lg shadow-2xl transition-transform transform scale-95" referrerpolicy="no-referrer" src="">
           <p class="text-white/50 text-xs mt-4 font-bold tracking-wider uppercase">Tap anywhere to close</p>
        </div>
      </div>
    `}cacheDOM(){this.$title=this.container.querySelector(`#dtl-title`),this.$meta=this.container.querySelector(`#dtl-meta`),this.$total=this.container.querySelector(`#dtl-total`),this.$foreignMeta=this.container.querySelector(`#dtl-foreign-meta`),this.$typeBadge=this.container.querySelector(`#dtl-type-badge`),this.$payersList=this.container.querySelector(`#dtl-payers-list`),this.$allocationsList=this.container.querySelector(`#dtl-allocations-list`),this.$receiptContainer=this.container.querySelector(`#dtl-receipt-container`),this.$receiptImg=this.container.querySelector(`#dtl-receipt-img`),this.$fsOverlay=this.container.querySelector(`#dtl-fullscreen-overlay`),this.$fsImg=this.container.querySelector(`#dtl-fullscreen-img`),this.$btnEdit=this.container.querySelector(`#dtl-btn-edit`),this.$btnDelete=this.container.querySelector(`#dtl-btn-delete`)}attachListeners(){this.$fsOverlay.addEventListener(`click`,()=>{this.$fsImg.classList.replace(`scale-100`,`scale-95`),setTimeout(()=>this.$fsOverlay.classList.add(`hidden`),150)}),this.$receiptImg.addEventListener(`click`,()=>{this.$fsImg.src=this.$receiptImg.src,this.$fsOverlay.classList.remove(`hidden`),setTimeout(()=>this.$fsImg.classList.replace(`scale-95`,`scale-100`),10)}),this.$btnDelete.addEventListener(`click`,async()=>{if(!this.currentEvent||!confirm(`Are you sure you want to permanently delete this transaction?`))return;let e=this.currentEvent.eventId||this.currentEvent.event_id,t=c.getState();try{await d.appendLocalEvent(t.activeGroupId,`EXPENSE_DELETE`,{target_event_id:e}),f.navigate(`group-detail`)}catch(e){alert(`Delete failure: ${e.message}`)}}),this.$btnEdit.addEventListener(`click`,()=>{this.currentEvent&&(window.dispatchEvent(new CustomEvent(`request-edit-expense`,{detail:this.currentEvent})),f.navigate(`add-expense`))})}getAvatar(e,t,n=`w-6 h-6`){let r=t[e];return r&&r.picture?`<img src="${r.picture}" class="${n} rounded-full object-cover border border-white dark:border-slate-800">`:`<div class="${n} rounded-full bg-gradient-to-br from-accent-500 to-accent-600 flex items-center justify-center text-white font-bold text-[9px] shadow-sm">${r&&r.name?r.name.charAt(0).toUpperCase():e.charAt(0).toUpperCase()}</div>`}updateUI(e){this.currentEvent=e.selectedExpenseDetails;let t=_(e.groupEvents).profiles,n=e.userProfile?.email||``,r=this.currentEvent,i=r.rawPayload||(typeof r.payload_json==`string`?JSON.parse(r.payload_json):r.payload_json),a=parseFloat(i.evaluated_amount)||0,o=new Date(i.custom_timestamp||r.timestamp).toLocaleDateString();this.$title.innerText=i.title,this.$meta.innerHTML=`${i.category||`General`} &bull; ${o}`,this.$total.innerText=`INR ${a.toFixed(2)}`,i.foreign_currency&&i.foreign_currency!==`INR`?(this.$foreignMeta.classList.remove(`hidden`),this.$foreignMeta.innerText=`Paid ${parseFloat(i.foreign_amount).toFixed(2)} ${i.foreign_currency} (Rate: ${i.exchange_rate.toFixed(2)})`):this.$foreignMeta.classList.add(`hidden`);let s=r.event_type||`EXPENSE`;if(this.$typeBadge.innerText=s.replace(`_`,` `),s===`TRANSFER`?this.$typeBadge.className=`px-2 py-0.5 rounded font-bold text-[9px] uppercase tracking-wide bg-amber-500/10 text-amber-600`:s===`LOAN`&&(this.$typeBadge.className=`px-2 py-0.5 rounded font-bold text-[9px] uppercase tracking-wide bg-violet-500/10 text-violet-600`),this.$payersList.innerHTML=``,this.$allocationsList.innerHTML=``,i.payers&&i.payers.length>0)i.payers.forEach(e=>{let r=e.user===n?`You`:t[e.user]?.name||e.user.split(`@`)[0];this.$payersList.innerHTML+=`
          <div class="flex justify-between items-center bg-slate-50 dark:bg-slate-900/60 p-2 rounded-xl border border-slate-100 dark:border-slate-800">
            <div class="flex items-center space-x-2">
              ${this.getAvatar(e.user,t)}
              <span class="text-xs font-medium text-slate-700 dark:text-slate-300">${r}</span>
            </div>
            <span class="font-mono text-slate-800 dark:text-slate-200 text-xs font-black">INR ${e.value.toFixed(2)}</span>
          </div>`});else{let e=r.actor_identity===n?`You`:t[r.actor_identity]?.name||r.actor_identity.split(`@`)[0];this.$payersList.innerHTML=`
        <div class="flex justify-between items-center bg-slate-50 dark:bg-slate-900/60 p-2 rounded-xl border border-slate-100 dark:border-slate-800">
          <div class="flex items-center space-x-2">
            ${this.getAvatar(r.actor_identity,t)}
            <span class="text-xs font-medium text-slate-700 dark:text-slate-300">${e}</span>
          </div>
          <span class="font-mono text-slate-800 dark:text-slate-200 text-xs font-black">INR ${a.toFixed(2)}</span>
        </div>`}if(i.allocations)i.allocations.forEach(e=>{let r=e.user===n?`You`:t[e.user]?.name||e.user.split(`@`)[0];this.$allocationsList.innerHTML+=`
          <div class="flex justify-between items-center py-1.5 border-b border-slate-100 dark:border-slate-800/60 last:border-none">
            <div class="flex items-center space-x-2">
              ${this.getAvatar(e.user,t,`w-5 h-5`)}
              <span class="text-xs text-slate-600 dark:text-slate-400">${r}</span>
            </div>
            <span class="font-mono text-slate-700 dark:text-slate-300 text-xs font-bold">INR ${(parseFloat(e.value)||0).toFixed(2)}</span>
          </div>`});else if(i.target_peer_identity){let e=i.target_peer_identity===n?`You`:t[i.target_peer_identity]?.name||i.target_peer_identity.split(`@`)[0];this.$allocationsList.innerHTML=`
          <div class="flex justify-between items-center py-1.5">
            <div class="flex items-center space-x-2">
              ${this.getAvatar(i.target_peer_identity,t,`w-5 h-5`)}
              <span class="text-xs text-slate-600 dark:text-slate-400">${e}</span>
            </div>
            <span class="font-mono text-slate-700 dark:text-slate-300 text-xs font-bold">INR ${a.toFixed(2)}</span>
          </div>`}i.receipt_local_url?(this.$receiptContainer.classList.remove(`hidden`),this.$receiptImg.src=i.receipt_local_url):(this.$receiptContainer.classList.add(`hidden`),this.$receiptImg.src=``)}destroy(){this.unsubscribe(),this.container.innerHTML=``}},O=class{constructor(e){this.container=e,this.unsubscribe=c.subscribe(e=>this.onStateChange(e)),this.renderSkeleton(),this.cacheDOM(),this.attachListeners(),this.applySavedTheme()}onStateChange(e){e.currentView===`settings`&&this.updateUI(e)}renderSkeleton(){this.container.innerHTML=`
      <div class="space-y-6 animate-fade-in pb-12 max-w-lg mx-auto">
        <div class="flex items-center space-x-2 mb-2">
          <button type="button" data-route="dashboard" class="text-slate-400 hover:text-slate-800 dark:hover:text-white p-2 -ml-2 rounded-full transition-colors cursor-pointer">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
          </button>
          <h3 class="text-sm font-black tracking-tight">Application Settings</h3>
        </div>

        <!-- User Profile Card -->
        <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-5 rounded-3xl shadow-sm flex items-center space-x-4">
          <img id="set-avatar" src="" class="w-14 h-14 rounded-full border-2 border-slate-100 dark:border-slate-700 object-cover shadow-sm hidden">
          <div id="set-avatar-fallback" class="w-14 h-14 rounded-full bg-gradient-to-br from-accent-500 to-accent-600 flex items-center justify-center text-white font-bold text-xl shadow-sm"></div>
          <div>
            <h2 id="set-name" class="text-lg font-black text-slate-800 dark:text-slate-100">Loading...</h2>
            <p id="set-email" class="text-xs font-medium text-slate-500"></p>
          </div>
        </div>

        <!-- Appearance & Theme Card -->
        <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl shadow-sm overflow-hidden">
          
          <!-- Accent Colors -->
          <div class="p-4 border-b border-slate-100 dark:border-slate-700/60">
            <h4 class="text-xs font-bold text-slate-700 dark:text-slate-200 mb-3">Active Design Palette Accent</h4>
            <div class="grid grid-cols-6 gap-3" id="cfg-accent-container">
              <button data-select-accent="indigo" class="w-6 h-6 rounded-full bg-indigo-500 border-2 border-transparent cursor-pointer ring-offset-2 dark:ring-offset-slate-800 transition-all shadow-sm"></button>
              <button data-select-accent="blue" class="w-6 h-6 rounded-full bg-blue-500 border-2 border-transparent cursor-pointer ring-offset-2 dark:ring-offset-slate-800 transition-all shadow-sm"></button>
              <button data-select-accent="cyan" class="w-6 h-6 rounded-full bg-cyan-500 border-2 border-transparent cursor-pointer ring-offset-2 dark:ring-offset-slate-800 transition-all shadow-sm"></button>
              <button data-select-accent="teal" class="w-6 h-6 rounded-full bg-teal-500 border-2 border-transparent cursor-pointer ring-offset-2 dark:ring-offset-slate-800 transition-all shadow-sm"></button>
              <button data-select-accent="emerald" class="w-6 h-6 rounded-full bg-emerald-500 border-2 border-transparent cursor-pointer ring-offset-2 dark:ring-offset-slate-800 transition-all shadow-sm"></button>
              <button data-select-accent="amber" class="w-6 h-6 rounded-full bg-amber-500 border-2 border-transparent cursor-pointer ring-offset-2 dark:ring-offset-slate-800 transition-all shadow-sm"></button>
              
              <button data-select-accent="orange" class="w-6 h-6 rounded-full bg-orange-500 border-2 border-transparent cursor-pointer ring-offset-2 dark:ring-offset-slate-800 transition-all shadow-sm"></button>
              <button data-select-accent="rose" class="w-6 h-6 rounded-full bg-rose-500 border-2 border-transparent cursor-pointer ring-offset-2 dark:ring-offset-slate-800 transition-all shadow-sm"></button>
              <button data-select-accent="pink" class="w-6 h-6 rounded-full bg-pink-500 border-2 border-transparent cursor-pointer ring-offset-2 dark:ring-offset-slate-800 transition-all shadow-sm"></button>
              <button data-select-accent="fuchsia" class="w-6 h-6 rounded-full bg-fuchsia-500 border-2 border-transparent cursor-pointer ring-offset-2 dark:ring-offset-slate-800 transition-all shadow-sm"></button>
              <button data-select-accent="violet" class="w-6 h-6 rounded-full bg-violet-500 border-2 border-transparent cursor-pointer ring-offset-2 dark:ring-offset-slate-800 transition-all shadow-sm"></button>
              <button data-select-accent="slate" class="w-6 h-6 rounded-full bg-slate-500 border-2 border-transparent cursor-pointer ring-offset-2 dark:ring-offset-slate-800 transition-all shadow-sm"></button>
            </div>
          </div>

          <!-- Dark Mode -->
          <div class="p-4 border-b border-slate-100 dark:border-slate-700/60 flex justify-between items-center">
            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-200">System Night Theme</label>
              <span class="text-[10px] text-slate-400 block">Toggle default dark layout frame</span>
            </div>
            <button id="cfg-dark-toggle" class="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-1.5 px-3 rounded-lg text-xs font-bold cursor-pointer transition-colors hover:border-slate-300 dark:hover:border-slate-600 shadow-sm active:scale-95">Toggle</button>
          </div>

          <!-- OLED Mode -->
          <div class="p-4 border-b border-slate-100 dark:border-slate-700/60 flex justify-between items-center">
            <div>
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-200">Pure OLED Contrast</label>
              <span class="text-[10px] text-slate-400 block">Forces pure deep pitch blacks (#000000)</span>
            </div>
            <button id="cfg-oled-toggle" class="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-1.5 px-3 rounded-lg text-xs font-bold cursor-pointer transition-colors hover:border-slate-300 dark:hover:border-slate-600 shadow-sm active:scale-95">Enable</button>
          </div>

          <!-- UI Scale -->
          <div class="p-4 flex justify-between items-center">
            <div>
              <h4 class="text-xs font-bold text-slate-700 dark:text-slate-200">Interface Scaling</h4>
              <p class="text-[10px] text-slate-400">Adjust the overall text and UI size.</p>
            </div>
            <select id="set-ui-scale" class="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-accent-500/30 cursor-pointer shadow-sm">
              <option value="14px">Small</option>
              <option value="16px">Normal Default</option>
              <option value="18px">Large</option>
              <option value="20px">Extra Large</option>
            </select>
          </div>
        </div>

        <!-- Data & Export -->
        <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl shadow-sm overflow-hidden">
          <div class="p-4 flex justify-between items-center cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors" id="btn-export-csv">
            <div>
              <h4 class="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center space-x-2">
                 <span>Export Data (CSV)</span>
                 <span class="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 text-[8px] uppercase tracking-wider font-bold">Local</span>
              </h4>
              <p class="text-[10px] text-slate-400">Download the active group's raw ledger.</p>
            </div>
            <svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
          </div>
        </div>

        <!-- Serverless Info -->
        <div class="bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-800/30 p-4 rounded-3xl">
          <h4 class="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-2">Serverless Architecture</h4>
          <p class="text-xs text-indigo-800/70 dark:text-indigo-300/70 leading-relaxed font-medium mb-3">
            SpreadShare uses a 100% serverless PWA architecture. Your data is never routed through our servers, it goes directly from this device into your personal Google Drive and Sheets APIs.
          </p>
          <p class="text-[10px] font-mono text-indigo-500 font-bold">Security Layer: Direct OAuth 2.0</p>
        </div>

        <button id="set-btn-logout" class="w-full bg-rose-50 dark:bg-rose-900/20 hover:bg-rose-500 hover:text-white border border-rose-200 dark:border-rose-800/50 text-rose-600 font-black py-4 rounded-2xl text-sm transition-all cursor-pointer shadow-sm tracking-wide uppercase active:scale-[0.98]">
          Sign Out & Disconnect
        </button>
      </div>
    `}cacheDOM(){this.$avatar=this.container.querySelector(`#set-avatar`),this.$avatarFallback=this.container.querySelector(`#set-avatar-fallback`),this.$name=this.container.querySelector(`#set-name`),this.$email=this.container.querySelector(`#set-email`),this.$btnDarkToggle=this.container.querySelector(`#cfg-dark-toggle`),this.$btnOledToggle=this.container.querySelector(`#cfg-oled-toggle`),this.$accentContainer=this.container.querySelector(`#cfg-accent-container`),this.$accentButtons=this.container.querySelectorAll(`[data-select-accent]`),this.$uiScale=this.container.querySelector(`#set-ui-scale`),this.$btnExport=this.container.querySelector(`#btn-export-csv`),this.$btnLogout=this.container.querySelector(`#set-btn-logout`)}attachListeners(){this.$btnDarkToggle.addEventListener(`click`,()=>{let e=document.documentElement.classList.toggle(`dark`);localStorage.setItem(`ss_cfg_dark`,e?`true`:`false`),m.show(e?`Dark Mode Enabled`:`Light Mode Enabled`,`info`)}),this.$btnOledToggle.addEventListener(`click`,e=>{let t=document.documentElement.classList.toggle(`oled`);e.target.innerText=t?`Disable`:`Enable`,localStorage.setItem(`ss_cfg_oled`,t?`true`:`false`),t&&m.show(`OLED Pitch Black Enabled`,`info`)}),this.$accentContainer.addEventListener(`click`,e=>{if(e.target.matches(`[data-select-accent]`)){let t=e.target.getAttribute(`data-select-accent`);document.documentElement.setAttribute(`data-accent`,t),localStorage.setItem(`ss_active_accent`,t),this.updateAccentRings(t)}}),this.$uiScale.addEventListener(`change`,e=>{let t=e.target.value;localStorage.setItem(`ss_ui_scale`,t),document.documentElement.style.fontSize=t,m.show(`Interface scale updated`,`info`)}),this.$btnExport.addEventListener(`click`,()=>this.exportToCSV()),this.$btnLogout.addEventListener(`click`,()=>{confirm(`Sign out of SpreadShare? Your data remains safe in Google Drive.`)&&(u.logout(),c.clearWorkspace(),window.location.reload())})}applySavedTheme(){localStorage.getItem(`ss_cfg_dark`)===`false`?document.documentElement.classList.remove(`dark`):document.documentElement.classList.add(`dark`),localStorage.getItem(`ss_cfg_oled`)===`true`&&(document.documentElement.classList.add(`oled`),this.$btnOledToggle.innerText=`Disable`);let e=localStorage.getItem(`ss_active_accent`)||`indigo`;document.documentElement.setAttribute(`data-accent`,e),this.updateAccentRings(e);let t=localStorage.getItem(`ss_ui_scale`)||`16px`;document.documentElement.style.fontSize=t,this.$uiScale.value=t}updateAccentRings(e){this.$accentButtons.forEach(t=>{t.classList.remove(`ring-2`,`ring-slate-400`,`dark:ring-slate-200`),t.getAttribute(`data-select-accent`)===e&&t.classList.add(`ring-2`,`ring-slate-400`,`dark:ring-slate-200`)})}updateUI(e){if(!e.userProfile)return;let t=e.userProfile;this.$name.innerText=t.name||t.email.split(`@`)[0],this.$email.innerText=t.email,t.picture?(this.$avatar.src=t.picture,this.$avatar.classList.remove(`hidden`),this.$avatarFallback.classList.add(`hidden`)):(this.$avatar.classList.add(`hidden`),this.$avatarFallback.classList.remove(`hidden`),this.$avatarFallback.innerText=t.email.charAt(0).toUpperCase())}exportToCSV(){let e=c.getState().groupEvents;if(e.length===0)return m.show(`No data to export.`,`error`);let t=`Date,Type,Title,Amount,Currency,Paid By
`;[...e].sort((e,t)=>new Date(e.timestamp)-new Date(t.timestamp)).forEach(e=>{let n=e.payload_json||{},r=new Date(n.custom_timestamp||e.timestamp).toLocaleDateString(),i=e.event_type,a=`"${(n.title||``).replace(/"/g,`""`)}"`,o=n.evaluated_amount||0,s=n.currency||`INR`,c=e.actor_identity;t+=`${r},${i},${a},${o},${s},${c}\n`});let n=new Blob([t],{type:`text/csv`}),r=URL.createObjectURL(n),i=document.createElement(`a`);i.href=r,i.download=`SpreadShare_Ledger_${new Date().toISOString().slice(0,10)}.csv`,i.click(),m.show(`CSV Download Started!`,`success`)}destroy(){this.unsubscribe(),this.container.innerHTML=``}},k=class{constructor(e){this.container=e,this.activeTimeframe=30,this.unsubscribe=c.subscribe(e=>this.onStateChange(e)),this.renderSkeleton(),this.cacheDOM(),this.attachListeners()}async onStateChange(e){if(e.currentView!==`insights`||!e.userProfile?.email)return;let t=await y.getGlobalAnalytics(e.userProfile.email,this.activeTimeframe);this.renderData(t)}async loadData(){let e=c.getState().userProfile?.email;if(e){let t=await y.getGlobalAnalytics(e,this.activeTimeframe);this.renderData(t)}}renderSkeleton(){this.container.innerHTML=`
      <div class="space-y-4 animate-fade-in pb-12">
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-2">
            <button type="button" data-route="dashboard" class="text-slate-400 hover:text-slate-600 p-1 cursor-pointer">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
            </button>
            <h3 class="text-sm font-bold">Personal Analytics</h3>
          </div>
        </div>

        <!-- TIMEFRAME TABS -->
        <div class="flex p-1 space-x-1 bg-slate-200/50 dark:bg-slate-800/50 rounded-xl">
          <button data-days="7" class="time-tab flex-1 py-1.5 text-xs font-bold rounded-lg text-slate-500 transition-all cursor-pointer">7 Days</button>
          <button data-days="30" class="time-tab flex-1 py-1.5 text-xs font-bold rounded-lg bg-white shadow-xs text-slate-800 dark:bg-slate-700 dark:text-white transition-all cursor-pointer">30 Days</button>
          <button data-days="365" class="time-tab flex-1 py-1.5 text-xs font-bold rounded-lg text-slate-500 transition-all cursor-pointer">1 Year</button>
        </div>

        <!-- TOTAL SPEND HERO & TRENDLINE -->
        <div class="bg-gradient-to-br from-accent-900 to-slate-700 dark:to-slate-900 border border-slate-800 text-white rounded-2xl p-5 shadow-sm overflow-hidden relative">
          <h4 class="text-[10px] font-bold uppercase tracking-wider text-accent-300 relative z-10">Total Consumption</h4>
          <div id="gi-total" class="text-3xl font-black font-mono mt-1 relative z-10">INR 0.00</div>
          
          <div class="h-20 w-full mt-4 -mb-5 -mx-2 relative z-0">
             <canvas id="gi-trend-canvas"></canvas>
          </div>
        </div>

        <!-- CATEGORY PIE CHART -->
        <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-2xs">
          <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-700 pb-2 mb-3">By Category</h4>
          <div class="flex items-center space-x-4">
            <div class="w-32 h-32 relative shrink-0"><canvas id="gi-pie-canvas"></canvas></div>
            <div id="gi-category-legend" class="flex-grow space-y-2 max-h-32 overflow-y-auto pr-1"></div>
          </div>
        </div>

        <!-- DAY OF WEEK AVERAGES -->
        <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl shadow-2xs">
          <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-700 pb-2 mb-3">Weekly Velocity</h4>
          <div id="gi-day-bars" class="space-y-2"></div>
        </div>
      </div>
    `}cacheDOM(){this.$timeTabs=this.container.querySelectorAll(`.time-tab`),this.$total=this.container.querySelector(`#gi-total`),this.$trendCanvas=this.container.querySelector(`#gi-trend-canvas`),this.$pieCanvas=this.container.querySelector(`#gi-pie-canvas`),this.$categoryLegend=this.container.querySelector(`#gi-category-legend`),this.$dayBars=this.container.querySelector(`#gi-day-bars`)}attachListeners(){this.$timeTabs.forEach(e=>{e.addEventListener(`click`,e=>{this.activeTimeframe=parseInt(e.target.getAttribute(`data-days`),10),this.$timeTabs.forEach(e=>{e.classList.remove(`bg-white`,`text-slate-800`,`dark:bg-slate-700`,`dark:text-white`,`shadow-xs`),e.classList.add(`text-slate-500`)}),e.target.classList.add(`bg-white`,`text-slate-800`,`dark:bg-slate-700`,`dark:text-white`,`shadow-xs`),e.target.classList.remove(`text-slate-500`),this.loadData()})})}renderData(e){this.$total.innerText=`INR ${e.total.toFixed(2)}`,setTimeout(()=>{b.drawTrendLine(this.$trendCanvas,e.trendLine),b.drawPie(this.$pieCanvas,e.categories)},100);let t=b.getColors(),n=Object.entries(e.categories).sort((e,t)=>t[1]-e[1]);this.$categoryLegend.innerHTML=n.length>0?n.map(([e,n],r)=>`
      <div class="flex justify-between items-center text-[10px] font-medium">
        <div class="flex items-center space-x-1.5 truncate pr-2">
          <span class="w-2.5 h-2.5 rounded-full block shrink-0" style="background-color: ${t[r%t.length]}"></span>
          <span class="text-slate-600 dark:text-slate-300 truncate">${e}</span>
        </div>
        <span class="font-mono text-slate-800 dark:text-slate-200">INR ${n.toFixed(0)}</span>
      </div>
    `).join(``):`<p class="text-[10px] text-slate-400">No category data found.</p>`;let r=[`Mon`,`Tue`,`Wed`,`Thu`,`Fri`,`Sat`,`Sun`],i=Math.max(...Object.values(e.dayOfWeek),1);this.$dayBars.innerHTML=r.map(t=>{let n=e.dayOfWeek[t]||0;return`
        <div class="flex items-center space-x-2 text-xs">
          <span class="w-8 font-bold text-slate-400 shrink-0">${t}</span>
          <div class="flex-grow bg-slate-100 dark:bg-slate-900 h-2.5 rounded-full overflow-hidden">
            <div class="h-2.5 bg-accent-500 rounded-full transition-all duration-700" style="width: ${n/i*100}%"></div>
          </div>
          <span class="w-14 text-right font-mono font-bold text-slate-600 dark:text-slate-300">INR ${n.toFixed(0)}</span>
        </div>
      `}).join(``)}destroy(){this.unsubscribe(),this.container.innerHTML=``}};document.addEventListener(`DOMContentLoaded`,async()=>{await i(),f.init();let t=new p(document.getElementById(`view-dashboard`));new S(document.getElementById(`view-group-detail`));let n=new E(document.getElementById(`view-add-expense`));new D(document.getElementById(`view-expense-detail`)),new O(document.getElementById(`view-settings`)),new k(document.getElementById(`view-insights`));let r=document.getElementById(`sync-indicator`);c.subscribe(e=>{r&&(e.syncStatus===`syncing`?r.innerHTML=`<span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span><span class="text-amber-500 font-bold">Syncing Ledger...</span>`:r.innerHTML=`<span class="w-2 h-2 rounded-full bg-emerald-500"></span><span class="text-slate-500 dark:text-slate-400 font-medium">Cloud Mirror Live</span>`)}),window.addEventListener(`request-edit-expense`,e=>{n.loadExpenseForEdit(e.detail)});let a=document.getElementById(`auth-gate`),o=document.getElementById(`main-stage`),s=document.getElementById(`auth-btn`);await u.init(e.GOOGLE_CLIENT_ID);let l=async e=>{c.setState({userProfile:e}),a.classList.add(`hidden`),o.classList.remove(`hidden`);let n=[];try{n=await d.fetchUserConfigRegistry()}catch{console.warn(`Failed to fetch remote config registry. Booting with empty state.`)}let r=new URLSearchParams(window.location.search),i=r.get(`invite`),s=r.get(`name`);if(i&&s)window.history.replaceState({},document.title,window.location.pathname),n.some(e=>e.id===i)||(c.setState({syncStatus:`syncing`}),n.push({id:i,name:s}),await d.syncUserConfigRegistry(n),await d.appendLocalEvent(i,`MEMBER_JOINED`,{member_email:e.email}),c.setState({syncStatus:`synced`})),c.setState({directory:n}),t.selectGroup(i,s);else{c.setState({directory:n});let e=window.location.hash.replace(`#`,``);e===`group-detail`&&c.getState().activeGroupId||e===`insights`||f.navigate(`dashboard`)}setInterval(()=>d.processOfflineQueue(),1e4)};s.addEventListener(`click`,async()=>{try{let{profile:e}=await u.login();await l(e)}catch{alert(`Authentication handshake failed.`)}});let m=await u.checkExistingSession();m&&await l(m.profile)});
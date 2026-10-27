/* Nexora : cache hors ligne (v8). Dépose ce fichier à côté de index.html.
   Page : CACHE D'ABORD (lancement immédiat), puis revalidation en arrière-plan ;
   si le réseau renvoie une version différente, le cache est mis à jour et la page
   reçoit {type:'updated'} pour afficher « Nouvelle version disponible ».
   Images et autres fichiers : cache d'abord (immuables une fois déposés).
   Supabase passe toujours par le réseau. */
const CACHE='nexora-v8';
const SHELL=['./','./index.html','./manifest.webmanifest','./apple-touch-icon.png','./favicon.png','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL).catch(()=>null)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys()
    .then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim()));
});
self.addEventListener('message',e=>{if(e.data==='clear'){
  caches.keys().then(ks=>Promise.all(ks.map(k=>caches.delete(k))));
}});
async function tellClients(msg){
  const cs=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  cs.forEach(c=>c.postMessage(msg));
}
async function servePage(req){
  const c=await caches.open(CACHE);
  const hit=await c.match(req,{ignoreSearch:true})||await c.match('./index.html');
  const hitCopy=hit?hit.clone():null;   /* copie prise AVANT de rendre hit à la page, sinon son corps est déjà consommé */
  /* no-cache : on revalide auprès du serveur, sans passer par le cache HTTP du navigateur */
  const refresh=fetch(req.url,{cache:'no-cache',credentials:'same-origin'}).then(async r=>{
    if(!r||r.status!==200)return r;
    const fresh=r.clone();
    if(hit){
      const [a,b]=await Promise.all([hitCopy.text(),r.clone().text()]);
      if(a!==b){await c.put(req,fresh);await c.put('./index.html',r.clone());await tellClients({type:'updated'});}
    }else{await c.put(req,fresh);}
    return r;
  }).catch(()=>null);
  if(hit)return hit;           /* le réseau continue en arrière-plan (waitUntil posé par l'appelant) */
  const r=await refresh;
  return r||new Response('Hors ligne',{status:503,headers:{'content-type':'text/plain; charset=utf-8'}});
}
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==location.origin)return;   /* Supabase passe par le réseau */
  const isPage = e.request.mode==='navigate' || u.pathname.endsWith('.html') || u.pathname.endsWith('/');
  if(isPage){
    const p=servePage(e.request);
    e.waitUntil(p.then(()=>new Promise(r=>setTimeout(r,8000))));   /* laisse le temps à la revalidation */
    e.respondWith(p);
    return;
  }
  e.respondWith(
    caches.match(e.request).then(hit=>hit||fetch(e.request).then(r=>{
      if(r&&r.status===200){const cp=r.clone();caches.open(CACHE).then(c=>c.put(e.request,cp))}
      return r;
    }))
  );
});

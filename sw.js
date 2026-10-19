/* Nexora - cache hors ligne (v7). Depose ce fichier a cote de index.html. */
const CACHE='nexora-v7';

self.addEventListener('install',e=>{self.skipWaiting()});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys()
    .then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim()));
});
self.addEventListener('message',e=>{if(e.data==='clear'){
  caches.keys().then(ks=>Promise.all(ks.map(k=>caches.delete(k))));
}});

self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==location.origin)return;   /* Supabase passe par le reseau */

  const isPage = e.request.mode==='navigate' || u.pathname.endsWith('.html') || u.pathname.endsWith('/');

  if(isPage){
    /* RESEAU D'ABORD pour le HTML : une nouvelle version est prise en compte tout de suite,
       et le cache ne sert que si le reseau est indisponible. */
    e.respondWith(
      fetch(e.request).then(r=>{
        if(r&&r.status===200){const cp=r.clone();caches.open(CACHE).then(c=>c.put(e.request,cp))}
        return r;
      }).catch(()=>caches.match(e.request).then(hit=>hit||caches.match('./index.html')))
    );
    return;
  }
  /* Images et autres fichiers : cache d'abord, c'est immuable une fois depose. */
  e.respondWith(
    caches.match(e.request).then(hit=>hit||fetch(e.request).then(r=>{
      if(r&&r.status===200){const cp=r.clone();caches.open(CACHE).then(c=>c.put(e.request,cp))}
      return r;
    }))
  );
});

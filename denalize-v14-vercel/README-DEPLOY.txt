DEPLOY VERCEL (tanpa Cloudflare Worker)
1. Upload ke repository GitHub (folder yang sama dengan index.html):
   - index.html            (timpa)
   - schedule-v14.js       (baru)
   - jkt48-config.js       (timpa)
   - api/theater.js        (baru; harus di folder "api" di root project)
2. Vercel > Project > Settings > Environment Variables:
   Name  JKT48CONNECT_API_KEY   Value  jkc_...   (Production, Preview, Development)
3. Vercel > Deployments > titik tiga di deploy terbaru > Redeploy.
4. Tes: https://denanatalia.my.id/api/theater?debug=1  -> JSON success:true
        https://denanatalia.my.id/  (Ctrl+Shift+R)

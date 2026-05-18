# Ticket Railway Bot Landing Page

Sof HTML/CSS/JS landing page. Build paytida fayllar `dist/` papkasiga yig'iladi; tashqi dependency talab qilinmaydi.

## Fayllar

- `index.html` — asosiy sahifa va meta teglar
- `style.css` — minimal responsive dizayn
- `script.js` — scroll paytida fade-in effect
- `public/favicon.svg` — favicon
- `public/og-image.svg` — ijtimoiy tarmoqlar preview rasmi
- `robots.txt` va `sitemap.xml` — SEO uchun
- `vercel.json` — Vercel deploy konfiguratsiyasi

## Vercel deploy

1. Fayllarni GitHub repositoryga yuklang.
2. Vercelda `New Project` qiling.
3. Framework preset: `Other`
4. Build Command: `npm run build`
5. Output Directory: `dist`
6. Deploy qiling.

> Agar production domen `404 NOT_FOUND` qaytarsa, odatda Vercel `index.html` yo'q papkani serve qilayotgan bo'ladi. Ushbu repo `vercel.json` orqali `dist` outputni aniq belgilaydi.

## Telegram deep-link

Hero ichidagi mini-qidiruv botga quyidagi formatda payload yuboradi:

`https://t.me/TicketRailwayBot?start=search_FROM_TO_YYYYMMDD`

Masalan: `search_TAS_BUX_20260524`. Bot tarafida `/start` komandasi shu payloadni parse qilib, mos qidiruvni boshlashi kerak.

## Domen almashtirish

Quyidagi joylarda `https://railwayticket.uz/` ni o‘zingizning real domeningizga almashtiring:

- `index.html` ichidagi `canonical`, `og:url`, `og:image`, `twitter:image`
- `robots.txt`
- `sitemap.xml`

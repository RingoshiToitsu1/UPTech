# Yooper Tech Recycling

Free pickup and drop-off funnel for used laptops and desktops in Marquette, Negaunee, Ishpeming and Harvey, Michigan. Plain static site: no build step, no framework.

## Pages

| Page | Purpose |
|---|---|
| `index.html` | Main landing page targeting all four towns |
| `marquette-mi/` `negaunee-mi/` `ishpeming-mi/` `harvey-mi/` | One page per town, for local search ("computer recycling Negaunee") |
| `thank-you.html` | Where the form lands after a successful send (hidden from Google) |
| `404.html` | Not-found page |
| `admin.html` | Private request tracker and funnels (hidden from Google) |
| `tools/backend.gs` | Google Apps Script backend for the form and admin |
| `sitemap.xml`, `robots.txt` | For Google Search Console |

Every page has the pickup form, LocalBusiness + FAQ structured data, and links to the other town pages.

## 1. Set your domain

```bash
./scripts/set-domain.sh mydomain.com
```

This replaces `https://yourdomain.com` everywhere (canonical tags, sitemap, structured data) and writes a `CNAME` file.

Links are relative, so the site works both on your own domain and at `https://ringoshitoitsu1.github.io/UPTech/` before you have one.

## 2. Go live (GitHub Pages)

1. Push this folder to a new GitHub repo.
2. Settings → Pages → Source: **Deploy from a branch** → **main** / **(root)** → Save.
3. At your domain registrar, add DNS records: four `A` records for `@` pointing to `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`, and a `CNAME` for `www` pointing to `<your-username>.github.io`.
4. Back in Settings → Pages, enter the domain and tick **Enforce HTTPS** once it's available.

## 3. Connect the form and admin (Google Apps Script)

Out of the box, the form works without any setup: on a phone it opens a text message to your number with everything filled in; on a computer it shows the details and your number.

To collect requests in a Google Sheet, get an email for each one, and use the admin page:

1. Make a new Google Sheet ("Yooper Tech Leads") → Extensions → Apps Script.
2. Paste in `tools/backend.gs` and follow the SETUP steps at the top of that file (set a password, run `setup`, deploy as a web app with access "Anyone").
3. Paste the web app URL (ends in `/exec`) into `API_URL` in `js/config.js`.

Each request records the page the visitor landed on and their source (`utm_source`, the referring site, or direct), so you can see which town page or flyer is working.

### Admin page (`/admin.html`)

Log in with the username and password from `backend.gs`. The password is checked inside Apps Script, so it is never stored in this repo.

- **Requests:** every pickup request, newest and most urgent first. Mark each one New → Contacted → Scheduled → Picked up (or Not a fit), set the pickup time, units collected and notes.
- **Funnels:** visitors → started the form → requests → scheduled → picked up, for the whole site and broken down by landing page, source and town, for the last 7 / 30 / 90 days or all time.

Open `/admin.html#demo` to try it with sample data before the backend is connected.

## 4. Change the name, phone or copy

- **Business name:** find and replace `Yooper Tech Recycling` across all files.
- **Phone:** find and replace `906-235-5711` and `+19062355711`, and update `js/config.js`.
- Keep the name and phone identical everywhere online (site, Google, Facebook). Mismatches hurt local ranking.

## Local SEO checklist

The site is half of it. The other half happens off the site:

1. **Google Business Profile.** This is the biggest lever for "near me" searches. Create it as a *service-area business* (hide your home address), list Marquette, Negaunee, Ishpeming and Harvey as service areas, category "Computer recycling" or "Electronics recycling center" if you can't find a closer fit, and link to the homepage.
2. **Google Search Console.** Verify the domain and submit `sitemap.xml`.
3. **Reviews.** Ask every person you pick up from for a Google review. Ten honest reviews will beat almost anything else you can do in a small market.
4. **Citations.** Same name and phone on Bing Places, Apple Business Connect, Yelp, Nextdoor and a Facebook page.
5. **Local links and posts.** Marquette County Facebook groups, Nextdoor, NMU housing/move-out boards, local buy-sell-trade groups. Link to the matching town page.
6. **Flyers.** Put a QR code to a town page with `?utm_source=flyer` on the end at laundromats, coffee shops and community boards.

## Before you launch

The page makes a few promises. Make sure they're true:

- **Drive wiping/destruction.** Have a real process (e.g. a full overwrite with `nwipe`/DBAN, or drill the platters) and stick to it every time.
- **Nothing goes in the trash.** Line up where leftover boards, cases and broken screens go (a county e-waste drop-off or scrap/e-waste buyer) before the first pickup.
- **Swollen batteries.** Don't transport them loose in a hot car; bag them and get them to a battery recycler.

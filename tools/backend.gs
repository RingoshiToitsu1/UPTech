/**
 * Yooper Tech Recycling backend (Google Apps Script web app).
 *
 * One script does three jobs:
 *   - takes pickup requests from the site's form (no login needed)
 *   - counts page views and form starts so the admin page can show funnels
 *   - powers admin.html: list leads, save status / pickup / notes (login needed)
 *
 * Everything is stored in the Google Sheet this script is attached to:
 *   Leads  - one row per pickup request, plus your tracking columns
 *   Visits - one row per page view or form start
 *
 * SETUP (one time)
 * 1. Make a new Google Sheet, name it "Yooper Tech Leads".
 * 2. In the sheet: Extensions → Apps Script. Delete what's there, paste this
 *    whole file, Save.
 * 3. Type a password between the quotes on the ADMIN_PASS line below.
 *    (Only here in Apps Script. Never commit your password to GitHub.)
 * 4. Pick "setup" in the function dropdown → Run → Authorize. The log should
 *    say "Setup done". Then delete the password from ADMIN_PASS and Save again.
 *    Only a scrambled (hashed) copy is kept, in Script Properties.
 * 5. Deploy → New deployment → gear icon → "Web app".
 *      Description: Yooper Tech backend
 *      Execute as:  Me
 *      Who has access: Anyone   (the form needs it; the admin login keeps leads private)
 *    Deploy → copy the Web app URL (ends in /exec).
 * 6. Paste that URL into API_URL in js/config.js (or send it to Claude).
 *
 * If you ever edit this file: Deploy → Manage deployments → pencil →
 * Version: "New version" → Deploy (the URL stays the same).
 * To change your login: put the new values below, run setup again, then clear ADMIN_PASS.
 */

var ADMIN_USER = 'ringoshi';
var ADMIN_PASS = '';      // type it here only to run setup, then clear it
var NOTIFY_EMAIL = '';    // where new-request emails go; blank = the Google account running this script

var SHEET_ID = '';        // blank = the sheet this script is attached to
var LEADS_TAB = 'Leads';
var VISITS_TAB = 'Visits';

var LEAD_COLS = ['id', 'created_at', 'name', 'phone', 'email', 'town', 'items', 'details', 'handoff',
  'landing', 'page', 'source', 'medium', 'campaign', 'referrer',
  'status', 'pickup_at', 'units', 'value', 'notes',
  'contacted_at', 'scheduled_at', 'picked_up_at', 'updated_at'];
var VISIT_COLS = ['at', 'event', 'page', 'source', 'visitor'];
var EDITABLE = ['status', 'pickup_at', 'units', 'value', 'notes'];
var STATUSES = ['New', 'Contacted', 'Scheduled', 'Picked up', 'Not a fit'];

function setup() {
  if (!ADMIN_PASS) throw new Error('Type your password into ADMIN_PASS first.');
  var salt = Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperties({
    ADMIN_USER: ADMIN_USER.trim().toLowerCase(),
    ADMIN_SALT: salt,
    ADMIN_HASH: hash_(salt + ADMIN_PASS)
  });
  sheet_(LEADS_TAB, LEAD_COLS);
  sheet_(VISITS_TAB, VISIT_COLS);
  Logger.log('Setup done for user "' + ADMIN_USER + '". Now clear ADMIN_PASS and Save.');
}

// ---------- web app entry ----------

function doGet() {
  return json_({ ok: true, service: 'Yooper Tech backend' });
}

function doPost(e) {
  var req = {};
  try { req = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) {}
  try {
    if (req.action === 'submit') return json_(submit_(req));
    if (req.action === 'hit') return json_(hit_(req));

    var auth = checkLogin_(req.user, req.pass);
    if (auth === 'locked') return json_({ ok: false, error: 'locked' });
    if (auth !== 'ok') return json_({ ok: false, error: 'unauthorized' });
    if (req.action === 'list') return json_({ ok: true, leads: leads_(), visits: visits_() });
    if (req.action === 'update') return json_({ ok: true, lead: update_(req.id, req.fields || {}) });
    return json_({ ok: false, error: 'unknown action' });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

// ---------- public: form + tracking ----------

function clip_(v, n) { return String(v == null ? '' : v).replace(/^[=+\-@]/, "'$&").trim().slice(0, n || 200); }

// simple brake against floods: at most `max` of `key` per 10 minutes, site-wide
function throttled_(key, max) {
  var cache = CacheService.getScriptCache();
  var n = Number(cache.get(key) || 0);
  if (n >= max) return true;
  cache.put(key, String(n + 1), 600);
  return false;
}

function submit_(d) {
  if (d.company) return { ok: true };                // honeypot filled: pretend it worked
  var name = clip_(d.name, 100), phone = clip_(d.phone, 40), town = clip_(d.town, 60);
  if (!name || phone.replace(/\D/g, '').length < 10 || !town) return { ok: false, error: 'missing fields' };
  if (throttled_('submits', 40)) return { ok: false, error: 'busy' };

  var now = new Date().toISOString();
  var lead = {
    id: Utilities.getUuid().slice(0, 8), created_at: now,
    name: name, phone: phone, email: clip_(d.email, 120), town: town,
    items: clip_(d.items, 200), details: clip_(d.details, 2000), handoff: clip_(d.handoff, 30),
    landing: clip_(d.landing, 200), page: clip_(d.page, 200), source: clip_(d.source, 80),
    medium: clip_(d.medium, 80), campaign: clip_(d.campaign, 80), referrer: clip_(d.referrer, 200),
    status: 'New', updated_at: now
  };
  var sh = sheet_(LEADS_TAB, LEAD_COLS);
  var head = header_(sh);
  sh.appendRow(head.map(function (h) { return lead[h] === undefined ? '' : lead[h]; }));
  notify_(lead);
  return { ok: true, id: lead.id };
}

function notify_(l) {
  try {
    var to = NOTIFY_EMAIL || Session.getEffectiveUser().getEmail();
    if (!to) return;
    MailApp.sendEmail({
      to: to,
      replyTo: l.email || undefined,
      subject: 'Pickup request: ' + l.town + ' (' + (l.items || 'items not specified') + ')',
      body: [
        'Name: ' + l.name, 'Phone: ' + l.phone, l.email ? 'Email: ' + l.email : '',
        'Town: ' + l.town, 'Items: ' + l.items, l.details ? 'Details: ' + l.details : '',
        'Pickup or drop-off: ' + l.handoff, '',
        'Came in on: ' + (l.landing || l.page) + (l.source ? ' (source: ' + l.source + ')' : '')
      ].filter(function (x) { return x !== ''; }).join('\n')
    });
  } catch (err) {
    Logger.log('Email failed: ' + err);
  }
}

function hit_(d) {
  var ev = d.event === 'start' ? 'start' : 'view';
  if (throttled_('hits', 3000)) return { ok: true };
  sheet_(VISITS_TAB, VISIT_COLS).appendRow([
    new Date().toISOString(), ev, clip_(d.page, 200), clip_(d.source, 80), clip_(d.visitor, 40)
  ]);
  return { ok: true };
}

// ---------- admin ----------

function hash_(s) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

// 'ok', 'bad', or 'locked' (after 10 bad tries, for 15 minutes)
function checkLogin_(user, pass) {
  var cache = CacheService.getScriptCache();
  var fails = Number(cache.get('fails') || 0);
  if (fails >= 10) return 'locked';
  var p = PropertiesService.getScriptProperties();
  var ok = p.getProperty('ADMIN_HASH') &&
    String(user || '').trim().toLowerCase() === p.getProperty('ADMIN_USER') &&
    hash_(p.getProperty('ADMIN_SALT') + String(pass || '')) === p.getProperty('ADMIN_HASH');
  if (!ok) { cache.put('fails', String(fails + 1), 900); Utilities.sleep(800); }
  return ok ? 'ok' : 'bad';
}

function leads_() {
  return rows_(LEADS_TAB).map(function (r) {
    if (!r.status) r.status = 'New';
    return r;
  });
}

// visits are summed per day / page / source / event so the payload stays small
function visits_() {
  var since = new Date(Date.now() - 400 * 86400e3).toISOString();
  var agg = {};
  rows_(VISITS_TAB).forEach(function (r) {
    if (!r.at || r.at < since) return;
    var day = String(r.at).slice(0, 10);
    var k = [day, r.page, r.source || '', r.event].join('|');
    if (!agg[k]) agg[k] = { day: day, page: r.page, source: r.source || '', event: r.event, n: 0, visitors: {} };
    agg[k].n++;
    if (r.visitor) agg[k].visitors[r.visitor] = 1;
  });
  return Object.keys(agg).map(function (k) {
    var a = agg[k];
    return { day: a.day, page: a.page, source: a.source, event: a.event, n: a.n, u: Object.keys(a.visitors).length || a.n };
  });
}

function update_(id, fields) {
  id = String(id || '');
  if (!id) throw new Error('missing id');
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sh = sheet_(LEADS_TAB, LEAD_COLS);
    var vals = sh.getDataRange().getValues();
    var head = vals[0].map(String);
    var idCol = head.indexOf('id');
    for (var i = 1; i < vals.length; i++) {
      if (String(vals[i][idCol]) !== id) continue;
      var cur = {};
      head.forEach(function (h, j) { cur[h] = vals[i][j] instanceof Date ? vals[i][j].toISOString() : vals[i][j]; });
      EDITABLE.forEach(function (c) {
        if (fields[c] !== undefined) cur[c] = clip_(fields[c], 2000);
      });
      if (STATUSES.indexOf(cur.status) < 0) cur.status = 'New';
      var now = new Date().toISOString();
      if (cur.status === 'Contacted' && !cur.contacted_at) cur.contacted_at = now;
      if (cur.status === 'Scheduled' && !cur.scheduled_at) cur.scheduled_at = now;
      if (cur.status === 'Picked up' && !cur.picked_up_at) cur.picked_up_at = now;
      cur.updated_at = now;
      sh.getRange(i + 1, 1, 1, head.length).setValues([head.map(function (h) { return cur[h] === undefined ? '' : cur[h]; })]);
      return cur;
    }
    throw new Error('lead not found');
  } finally {
    lock.releaseLock();
  }
}

// ---------- sheet helpers ----------

function ss_() { return SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet(); }

// returns the tab, creating it (or adding missing columns) as needed
function sheet_(name, cols) {
  var ss = ss_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
    sh.setFrozenRows(1);
    return sh;
  }
  var head = header_(sh);
  var missing = cols.filter(function (c) { return head.indexOf(c) < 0; });
  if (missing.length) sh.getRange(1, head.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
  return sh;
}

function header_(sh) {
  if (sh.getLastColumn() < 1) return [];
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String).filter(String);
}

function rows_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  var vals = sh.getDataRange().getValues();
  var head = vals.shift().map(String);
  return vals.map(function (r) {
    var o = {};
    head.forEach(function (h, i) { if (h) o[h] = r[i] instanceof Date ? r[i].toISOString() : r[i]; });
    return o;
  });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

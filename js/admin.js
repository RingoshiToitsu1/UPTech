(function () {
  var API = (window.SITE || {}).API_URL;
  var DEMO = location.hash === "#demo"; // sample data, no backend needed
  var STATUSES = ["New", "Contacted", "Scheduled", "Picked up", "Not a fit"];
  var PAGES = { "/": "Home", "/marquette-mi/": "Marquette page", "/negaunee-mi/": "Negaunee page", "/ishpeming-mi/": "Ishpeming page", "/harvey-mi/": "Harvey page" };
  var creds = null, leads = [], visits = [], filter = "All", query = "", openSet = {}, days = 30, view = "leads";

  var $ = function (s) { return document.querySelector(s); };
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function toast(m) { var t = $(".toast"); t.textContent = m; t.classList.add("show"); clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove("show"); }, 2000); }
  function money(n) { n = Number(n) || 0; return "$" + Math.round(n).toLocaleString(); }
  function num(n) { return (Number(n) || 0).toLocaleString(); }
  function pct(a, b) { return b ? Math.round(a / b * 1000) / 10 + "%" : "–"; }
  function ago(iso) {
    if (!iso) return "";
    var s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (isNaN(s)) return "";
    if (s < 3600) return Math.max(1, Math.round(s / 60)) + "m ago";
    if (s < 86400) return Math.round(s / 3600) + "h ago";
    return Math.round(s / 86400) + "d ago";
  }
  function fmt(iso) { if (!iso) return ""; var d = new Date(iso); return isNaN(d) ? iso : d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
  function pageName(p) { return PAGES[p] || p || "Unknown"; }
  function store(get, val) {
    try {
      if (get) return JSON.parse(localStorage.getItem("yt_admin") || sessionStorage.getItem("yt_admin") || "null");
      localStorage.removeItem("yt_admin"); sessionStorage.removeItem("yt_admin");
      if (val) (val.remember ? localStorage : sessionStorage).setItem("yt_admin", JSON.stringify(val));
    } catch (e) { return null; }
  }

  function call(body) {
    if (DEMO) return demoCall(body);
    if (!API) return Promise.reject(new Error("The backend URL isn't set yet (API_URL in js/config.js)."));
    body.user = creds.user; body.pass = creds.pass;
    return fetch(API, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) })
      .catch(function () {
        throw new Error("Can't reach the backend. In Apps Script, check the deployment's access is set to \"Anyone\".");
      })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.ok) {
          var e = new Error(j.error === "unauthorized" ? "Wrong username or password." :
                            j.error === "locked" ? "Too many tries. Wait 15 minutes." : (j.error || "Something went wrong."));
          e.code = j.error; throw e;
        }
        return j;
      });
  }

  // ---------- login ----------
  function showApp(on) { $("#loginView").hidden = on; $("#appView").hidden = !on; $("#barActions").hidden = !on; }
  $("#loginForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var err = $("#loginErr"), btn = $("#loginBtn");
    err.hidden = true;
    creds = { user: $("#u").value.trim(), pass: $("#p").value, remember: $("#remember").checked };
    if (!creds.user || !creds.pass) { err.textContent = "Enter your username and password."; err.hidden = false; return; }
    btn.disabled = true; btn.textContent = "Checking…";
    call({ action: "list" }).then(function (j) {
      if (!DEMO) store(false, creds);
      leads = j.leads; visits = j.visits || []; showApp(true); render();
    }).catch(function (x) {
      err.textContent = x.message; err.hidden = false; creds = null;
    }).then(function () { btn.disabled = false; btn.textContent = "Log in"; });
  });
  $("#logoutBtn").addEventListener("click", function () { store(false, null); creds = null; leads = []; visits = []; $("#p").value = ""; showApp(false); });
  $("#refreshBtn").addEventListener("click", function () { load(true); });

  function load(announce) {
    return call({ action: "list" }).then(function (j) { leads = j.leads; visits = j.visits || []; render(); if (announce) toast("Updated"); })
      .catch(function (x) {
        if (x.code === "unauthorized") { store(false, null); creds = null; showApp(false); }
        toast(x.message);
      });
  }

  // ---------- derived ----------
  function statusOf(l) { return l.status || "New"; }
  function since() { return days ? new Date(Date.now() - days * 86400e3).toISOString() : ""; }
  function inRange(iso) { var s = since(); return !s || (iso && String(iso) >= s); }
  function needsCall(l) { return statusOf(l) === "New" && (Date.now() - new Date(l.created_at)) > 24 * 3600e3; }
  function pickupPassed(l) { return statusOf(l) === "Scheduled" && l.pickup_at && new Date(l.pickup_at) < Date.now(); }
  function lastAt(l) { return [l.created_at, l.updated_at].filter(Boolean).sort().pop() || ""; }

  // ---------- render ----------
  function render() {
    var rl = leads.filter(function (l) { return inRange(l.created_at); });
    var rv = visits.filter(function (v) { return inRange(v.day + "T23:59:59Z"); });
    var visitors = sum(rv, function (v) { return v.event === "view" ? v.u : 0; });
    var picked = leads.filter(function (l) { return l.picked_up_at && inRange(l.picked_up_at); });
    var newN = leads.filter(function (l) { return statusOf(l) === "New"; }).length;
    var schedN = leads.filter(function (l) { return statusOf(l) === "Scheduled"; }).length;

    $("#stats").innerHTML =
      stat("Need a call back", newN, newN ? "hot" : "") +
      stat("Scheduled", schedN) +
      stat("Requests", rl.length) +
      stat("Picked up", picked.length + " · " + num(sum(picked, function (l) { return l.units; })) + " units", "dark") +
      stat("Visitor → request", pct(rl.length, visitors));

    document.querySelectorAll("[data-view]").forEach(function (b) { b.setAttribute("aria-selected", String(b.getAttribute("data-view") === view)); });
    $("#leadsView").hidden = view !== "leads";
    $("#funnelsView").hidden = view !== "funnels";
    if (view === "leads") renderLeads(); else renderFunnels(rl, rv);
  }
  function sum(arr, f) { return arr.reduce(function (a, x) { return a + (Number(f(x)) || 0); }, 0); }
  function stat(label, val, cls) { return '<div class="stat ' + (cls || "") + '"><small>' + esc(label) + "</small><b>" + esc(val) + "</b></div>"; }

  function renderLeads() {
    var counts = { All: leads.length };
    STATUSES.forEach(function (s) { counts[s] = 0; });
    leads.forEach(function (l) { counts[statusOf(l)] = (counts[statusOf(l)] || 0) + 1; });
    $("#tabs").innerHTML = ["All"].concat(STATUSES).map(function (s) {
      return '<button type="button" role="tab" aria-selected="' + (s === filter) + '" data-tab="' + esc(s) + '">' + esc(s) + "<span>" + (counts[s] || 0) + "</span></button>";
    }).join("");

    var q = query.toLowerCase();
    var rows = leads.filter(function (l) {
      if (filter !== "All" && statusOf(l) !== filter) return false;
      return !q || JSON.stringify(l).toLowerCase().indexOf(q) >= 0;
    }).sort(function (a, b) {
      function rank(l) { return needsCall(l) || pickupPassed(l) ? 0 : statusOf(l) === "New" ? 1 : statusOf(l) === "Scheduled" ? 2 : 3; }
      return rank(a) - rank(b) || (lastAt(b) > lastAt(a) ? 1 : -1);
    });
    $("#list").innerHTML = rows.map(card).join("");
    $("#empty").hidden = rows.length > 0;
  }

  function card(l) {
    var st = statusOf(l), key = esc(l.id);
    var badges = [];
    if (l.items) badges.push('<span class="badge">' + esc(l.items) + "</span>");
    if (l.handoff) badges.push('<span class="badge">' + esc(l.handoff) + "</span>");
    if (needsCall(l)) badges.push('<span class="badge bad">Waiting ' + esc(ago(l.created_at)) + "</span>");
    if (pickupPassed(l)) badges.push('<span class="badge warn">Pickup time passed</span>');
    if (st === "Scheduled" && l.pickup_at && !pickupPassed(l)) badges.push('<span class="badge warn">Pickup ' + esc(fmt(l.pickup_at)) + "</span>");

    var phone = String(l.phone || "").replace(/[^\d+]/g, "");
    var contacts = [];
    if (phone) contacts.push('<a href="sms:' + esc(phone) + '">Text</a><a href="tel:' + esc(phone) + '">Call</a>');
    if (l.email) contacts.push('<a href="mailto:' + esc(l.email) + "?subject=" + encodeURIComponent("Your computer pickup") + '">Email</a>');
    var open = !!openSet[l.id];

    return '<article class="lead-card' + (needsCall(l) || pickupPassed(l) ? " due" : "") + '" data-id="' + key + '">' +
      '<button type="button" class="lead-head" data-toggle aria-expanded="' + open + '">' +
        '<span class="who"><strong>' + esc(l.name) + "</strong>" +
          '<span class="sub" style="display:block">' + esc(l.town) + " · " + esc(l.phone) + " · " + esc(ago(l.created_at)) + "</span>" +
          '<span class="badges">' + badges.join("") + "</span></span>" +
        '<span class="pill-status st-' + esc(st.replace(/ /g, "-")) + '">' + esc(st) + "</span>" +
      "</button>" +
      '<div class="lead-body"' + (open ? "" : " hidden") + ">" +
        "<div>" +
          "<h4>Contact</h4>" +
          '<div class="contact-btns">' + contacts.join("") + "</div>" +
          "<h4>Request</h4>" +
          '<dl class="kv">' + kv("Phone", l.phone) + kv("Email", l.email) + kv("Town", l.town) + kv("Items", l.items) +
            kv("Pickup / drop", l.handoff) + kv("Sent", fmt(l.created_at)) + "</dl>" +
          (l.details ? '<p class="quote">' + esc(l.details) + "</p>" : "") +
          "<h4>Where they came from</h4>" +
          '<dl class="kv">' + kv("Landed on", pageName(l.landing)) + kv("Sent from", l.page && l.page !== l.landing ? pageName(l.page) : "") +
            kv("Source", l.source) + kv("Campaign", [l.medium, l.campaign].filter(Boolean).join(" / ")) + "</dl>" +
        "</div>" +
        '<form class="track" data-form>' +
          "<h4>Tracking</h4>" +
          '<div class="status-row">' + STATUSES.map(function (s) {
            return '<button type="button" data-status="' + esc(s) + '" class="' + (s === st ? "on" : "") + '">' + esc(s) + "</button>";
          }).join("") + "</div>" +
          '<input type="hidden" name="status" value="' + esc(st) + '">' +
          '<div class="three">' +
            '<div class="field"><label for="pk-' + key + '">Pickup time</label><input id="pk-' + key + '" name="pickup_at" type="datetime-local" value="' + esc(String(l.pickup_at || "").slice(0, 16)) + '"></div>' +
            '<div class="field"><label for="un-' + key + '">Units</label><input id="un-' + key + '" name="units" inputmode="numeric" value="' + esc(l.units) + '" placeholder="0"></div>' +
            '<div class="field"><label for="va-' + key + '">Value ($)</label><input id="va-' + key + '" name="value" inputmode="decimal" value="' + esc(l.value) + '" placeholder="0"></div>' +
          "</div>" +
          '<div class="field"><label for="no-' + key + '">Notes</label><textarea id="no-' + key + '" name="notes" rows="3" placeholder="Private notes">' + esc(l.notes) + "</textarea></div>" +
          '<div class="save-row"><button class="btn" type="submit">Save</button></div>' +
          '<div class="times">' +
            (l.contacted_at ? "Contacted: " + esc(fmt(l.contacted_at)) + "<br>" : "") +
            (l.scheduled_at ? "Scheduled: " + esc(fmt(l.scheduled_at)) + "<br>" : "") +
            (l.picked_up_at ? "Picked up: " + esc(fmt(l.picked_up_at)) + "<br>" : "") +
            (l.updated_at ? "Last saved: " + esc(fmt(l.updated_at)) : "") +
          "</div>" +
        "</form>" +
      "</div>" +
    "</article>";
  }
  function kv(k, v) { return v === "" || v == null ? "" : "<dt>" + esc(k) + "</dt><dd>" + esc(v) + "</dd>"; }

  // ---------- funnels ----------
  function renderFunnels(rl, rv) {
    function views(f) { return sum(rv, function (v) { return v.event === "view" && f(v) ? v.u : 0; }); }
    function starts(f) { return sum(rv, function (v) { return v.event === "start" && f(v) ? v.u : 0; }); }
    function reached(list, s) {
      return list.filter(function (l) {
        var picked = !!l.picked_up_at || statusOf(l) === "Picked up";
        return s === "Picked up" ? picked : picked || !!l.scheduled_at || statusOf(l) === "Scheduled";
      }).length;
    }
    var all = function () { return true; };
    var steps = [
      ["Visitors", views(all)], ["Started form", starts(all)], ["Requests", rl.length],
      ["Scheduled", reached(rl, "Scheduled")], ["Picked up", reached(rl, "Picked up")]
    ];
    var top = Math.max.apply(null, steps.map(function (s) { return s[1]; }).concat([1]));
    $("#funnelAll").innerHTML = steps.map(function (s, i) {
      var w = Math.max(s[1] / top * 100, s[1] ? 1.5 : 0);
      return '<div class="fstep"><span class="lbl">' + s[0] + '</span><span class="bar"><i style="width:' + w + '%"></i><b>' + num(s[1]) + "</b></span>" +
        '<span class="pct">' + (i ? pct(s[1], steps[i - 1][1]) : "") + "</span></div>";
    }).join("");

    // daily bars
    var byDay = {};
    rv.forEach(function (v) { if (v.event === "view") { byDay[v.day] = byDay[v.day] || { v: 0, r: 0 }; byDay[v.day].v += Number(v.u) || 0; } });
    rl.forEach(function (l) { var d = String(l.created_at).slice(0, 10); byDay[d] = byDay[d] || { v: 0, r: 0 }; byDay[d].r++; });
    var n = days || Math.min(180, Math.max(7, Object.keys(byDay).length ? Math.ceil((Date.now() - new Date(Object.keys(byDay).sort()[0])) / 86400e3) + 1 : 30));
    var list = [];
    for (var i = n - 1; i >= 0; i--) { var d = new Date(Date.now() - i * 86400e3).toISOString().slice(0, 10); list.push([d, byDay[d] || { v: 0, r: 0 }]); }
    var maxV = Math.max.apply(null, list.map(function (x) { return Math.max(x[1].v, x[1].r); }).concat([1]));
    $("#daily").innerHTML = list.map(function (x) {
      return '<div class="day" title="' + x[0] + ": " + x[1].v + " visitors, " + x[1].r + ' requests"><span class="v" style="height:' + (x[1].v / maxV * 100) + '%"></span>' +
        (x[1].r ? '<span class="r" style="height:' + Math.max(x[1].r / maxV * 100, 4) + '%"></span>' : "") + "</div>";
    }).join("");

    // tables
    function table(el, label, keys, vf, lf) {
      var rows = keys.map(function (k) {
        var mine = rl.filter(function (l) { return lf(l) === k; });
        return { k: k, v: views(function (x) { return vf(x) === k; }), s: starts(function (x) { return vf(x) === k; }), r: mine.length, sc: reached(mine, "Scheduled"), p: reached(mine, "Picked up") };
      }).filter(function (r) { return r.v || r.r; }).sort(function (a, b) { return b.r - a.r || b.v - a.v; });
      el.innerHTML = "<thead><tr><th>" + label + "</th><th>Visitors</th><th>Started form</th><th>Requests</th><th>Conversion</th><th>Scheduled</th><th>Picked up</th></tr></thead><tbody>" +
        (rows.length ? rows.map(function (r) {
          var c = r.v ? r.r / r.v : 0;
          return "<tr><td>" + esc(r.label || r.k) + "</td><td>" + num(r.v) + "</td><td>" + num(r.s) + "</td><td>" + num(r.r) + '</td><td class="conv"><span' + (c >= 0.05 ? ' class="good"' : "") + ">" + pct(r.r, r.v) + "</span></td><td>" + num(r.sc) + "</td><td>" + num(r.p) + "</td></tr>";
        }).join("") : '<tr><td colspan="7" class="muted">Nothing in this range yet.</td></tr>') + "</tbody>";
      el.querySelectorAll("tbody tr td:first-child").forEach(function (td) { var k = td.textContent; if (el.id === "byPage") td.textContent = pageName(k); });
    }
    function uniq(a) { return a.filter(function (x, i) { return x && a.indexOf(x) === i; }); }
    table($("#byPage"), "Page", uniq(Object.keys(PAGES).concat(rv.map(function (v) { return v.page; }), rl.map(function (l) { return l.landing; }))),
      function (v) { return v.page; }, function (l) { return l.landing || l.page; });
    table($("#bySource"), "Source", uniq(rv.map(function (v) { return v.source || "direct"; }).concat(rl.map(function (l) { return l.source || "direct"; }))),
      function (v) { return v.source || "direct"; }, function (l) { return l.source || "direct"; });

    var towns = uniq(rl.map(function (l) { return l.town; }));
    $("#byTown").innerHTML = "<thead><tr><th>Town</th><th>Requests</th><th>Scheduled</th><th>Picked up</th><th>Units</th></tr></thead><tbody>" +
      (towns.length ? towns.map(function (t) {
        var mine = rl.filter(function (l) { return l.town === t; });
        return { t: t, r: mine.length, s: reached(mine, "Scheduled"), p: reached(mine, "Picked up"), u: sum(mine, function (l) { return l.units; }) };
      }).sort(function (a, b) { return b.r - a.r; }).map(function (r) {
        return "<tr><td>" + esc(r.t) + "</td><td>" + num(r.r) + "</td><td>" + num(r.s) + "</td><td>" + num(r.p) + "</td><td>" + num(r.u) + "</td></tr>";
      }).join("") : '<tr><td colspan="5" class="muted">Nothing in this range yet.</td></tr>') + "</tbody>";
  }

  // ---------- events ----------
  document.querySelectorAll("[data-view]").forEach(function (b) {
    b.addEventListener("click", function () { view = b.getAttribute("data-view"); render(); });
  });
  $("#range").addEventListener("click", function (e) {
    var b = e.target.closest("[data-days]"); if (!b) return;
    days = Number(b.getAttribute("data-days"));
    document.querySelectorAll("#range button").forEach(function (x) { x.classList.toggle("on", x === b); });
    render();
  });
  $("#tabs").addEventListener("click", function (e) {
    var b = e.target.closest("[data-tab]"); if (!b) return; filter = b.getAttribute("data-tab"); render();
  });
  $("#search").addEventListener("input", function (e) { query = e.target.value; render(); });

  $("#list").addEventListener("click", function (e) {
    var art = e.target.closest(".lead-card"); if (!art) return;
    var id = art.getAttribute("data-id");
    var tg = e.target.closest("[data-toggle]");
    if (tg) {
      openSet[id] = !openSet[id];
      art.querySelector(".lead-body").hidden = !openSet[id];
      tg.setAttribute("aria-expanded", String(!!openSet[id]));
      return;
    }
    var sb = e.target.closest("[data-status]");
    if (sb) {
      var form = sb.closest("form");
      form.querySelectorAll("[data-status]").forEach(function (x) { x.classList.toggle("on", x === sb); });
      form.status.value = sb.getAttribute("data-status");
    }
  });
  $("#list").addEventListener("submit", function (e) {
    e.preventDefault();
    var form = e.target, id = form.closest(".lead-card").getAttribute("data-id");
    var fields = {};
    ["status", "pickup_at", "units", "value", "notes"].forEach(function (n) { fields[n] = form[n].value.trim(); });
    var btn = form.querySelector("button[type=submit]"); btn.disabled = true; btn.textContent = "Saving…";
    call({ action: "update", id: id, fields: fields }).then(function (j) {
      leads = leads.map(function (l) { return l.id === id ? j.lead : l; });
      openSet[id] = true;
      render();
      toast("Saved");
    }).catch(function (x) { toast(x.message); btn.disabled = false; btn.textContent = "Save"; });
  });

  // ---------- demo data (admin.html#demo) ----------
  function demoCall(body) {
    if (body.action === "update") {
      var l = leads.filter(function (x) { return x.id === body.id; })[0], now = new Date().toISOString();
      Object.assign(l, body.fields, { updated_at: now });
      if (l.status === "Contacted" && !l.contacted_at) l.contacted_at = now;
      if (l.status === "Scheduled" && !l.scheduled_at) l.scheduled_at = now;
      if (l.status === "Picked up" && !l.picked_up_at) l.picked_up_at = now;
      return Promise.resolve({ ok: true, lead: l });
    }
    var H = 3600e3, now = Date.now();
    function t(h) { return new Date(now - h * H).toISOString(); }
    var sample = [
      ["Sample: Dana K.", "906-555-0142", "Marquette", "Laptop, Desktop", "Pickup", "/marquette-mi/", "facebook", 3, "New"],
      ["Sample: Pete L.", "906-555-0187", "Negaunee", "Laptop", "Drop-off", "/negaunee-mi/", "flyer", 30, "New"],
      ["Sample: Ishpeming Schools", "906-555-0110", "Ishpeming", "Desktop, Flat-screen monitor", "Pickup", "/ishpeming-mi/", "google", 52, "Scheduled", 18],
      ["Sample: Mary T.", "906-555-0166", "Harvey", "All-in-one", "Pickup", "/harvey-mi/", "direct", 75, "Picked up", 0, 1, 40],
      ["Sample: Joe R.", "906-555-0123", "Marquette", "Laptop", "Pickup", "/", "flyer", 140, "Picked up", 0, 3, 90],
      ["Sample: Ann B.", "906-555-0191", "Marquette", "Other", "Drop-off", "/", "direct", 200, "Not a fit"]
    ];
    var L = sample.map(function (s, i) {
      return { id: "demo" + i, created_at: t(s[7]), name: s[0], phone: s[1], email: "", town: s[2], items: s[3], handoff: s[4],
        details: i === 2 ? "About 15 old office towers and 6 monitors." : "", landing: s[5], page: s[5], source: s[6], status: s[8],
        pickup_at: s[9] ? new Date(now + s[9] * H).toISOString().slice(0, 16) : "", units: s[10] || "", value: s[11] || "", notes: "",
        contacted_at: s[8] !== "New" ? t(s[7] - 2) : "", scheduled_at: /Scheduled|Picked/.test(s[8]) ? t(s[7] - 4) : "",
        picked_up_at: s[8] === "Picked up" ? t(s[7] - 24) : "", updated_at: t(1) };
    });
    var V = [], srcs = ["direct", "google", "facebook", "flyer"], pages = Object.keys(PAGES);
    for (var d = 0; d < 45; d++) {
      var day = new Date(now - d * 86400e3).toISOString().slice(0, 10);
      pages.forEach(function (p, pi) {
        srcs.forEach(function (s, si) {
          var n = Math.max(0, Math.round((pi ? 3 : 7) * (1 - si * 0.18) + Math.sin(d * 1.7 + pi + si) * 2));
          if (n) V.push({ day: day, page: p, source: s, event: "view", n: n, u: n });
          if (n > 3) V.push({ day: day, page: p, source: s, event: "start", n: 1, u: 1 });
        });
      });
    }
    return Promise.resolve({ ok: true, leads: L, visits: V });
  }

  // ---------- boot ----------
  if (DEMO) {
    $("#u").value = "demo"; $("#p").value = "demo";
    $("#loginErr").textContent = "Demo mode: sample data only. Click Log in."; $("#loginErr").hidden = false;
    return;
  }
  var saved = store(true);
  if (saved && saved.user) {
    creds = saved; $("#u").value = saved.user;
    showApp(true);
    $("#list").innerHTML = '<p class="empty">Loading…</p>';
    load(false);
  } else if (!API) {
    var err = $("#loginErr"); err.textContent = "Not connected yet: the backend URL still needs to be added to js/config.js."; err.hidden = false;
  }
})();

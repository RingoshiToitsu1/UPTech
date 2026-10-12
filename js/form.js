(function () {
  var cfg = window.SITE || {};
  var API = cfg.API_URL;
  var form = document.getElementById("lead");

  // the site can live at a domain root or in a subfolder (username.github.io/UPTech/),
  // so work out the site root from this script's own address
  var me = document.currentScript && document.currentScript.src;
  var ROOT = me ? new URL("../", me) : new URL("/", location.href);
  var PAGE = "/" + location.pathname.slice(ROOT.pathname.length).replace(/index\.html$/, "");

  function get(store, k) { try { return window[store].getItem(k); } catch (e) { return null; } }
  function set(store, k, v) { try { window[store].setItem(k, v); } catch (e) {} }

  // anonymous visitor id, so the admin funnels count people rather than reloads
  var visitor = get("localStorage", "yt_vid");
  if (!visitor) { visitor = Math.random().toString(36).slice(2, 12); set("localStorage", "yt_vid", visitor); }

  // first page and source of this visit, kept while they click around
  var p = new URLSearchParams(location.search);
  var attr = JSON.parse(get("sessionStorage", "yt_src") || "null");
  if (!attr) {
    var ref = "";
    try { ref = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, "") : ""; } catch (e) {}
    if (ref === location.hostname.replace(/^www\./, "")) ref = "";
    attr = {
      landing: PAGE,
      source: p.get("utm_source") || ref || "direct",
      medium: p.get("utm_medium") || "",
      campaign: p.get("utm_campaign") || "",
      referrer: ref
    };
    set("sessionStorage", "yt_src", JSON.stringify(attr));
  }

  function hit(event) {
    if (!API || navigator.webdriver) return;
    var key = "yt_" + event + PAGE;
    if (get("sessionStorage", key)) return;
    set("sessionStorage", key, "1");
    var body = JSON.stringify({ action: "hit", event: event, page: PAGE, source: attr.source, visitor: visitor });
    if (navigator.sendBeacon && navigator.sendBeacon(API, body)) return;
    fetch(API, { method: "POST", body: body, keepalive: true, headers: { "Content-Type": "text/plain;charset=utf-8" } }).catch(function () {});
  }

  if (!form) return;
  hit("view");
  form.addEventListener("focusin", function () { hit("start"); });

  var msg = document.getElementById("form-msg");

  function collect() {
    var fd = new FormData(form);
    return {
      name: (fd.get("name") || "").trim(),
      phone: (fd.get("phone") || "").trim(),
      email: (fd.get("email") || "").trim(),
      town: fd.get("town") || "",
      items: fd.getAll("items").join(", ") || "Not specified",
      details: (fd.get("details") || "").trim(),
      handoff: fd.get("handoff") || "",
      page: PAGE,
      company: fd.get("company") || ""
    };
  }

  function check(d) {
    var bad = [];
    [["f-name", d.name], ["f-phone", d.phone.replace(/\D/g, "").length >= 10 ? d.phone : ""], ["f-town", d.town]]
      .forEach(function (f) {
        var el = document.getElementById(f[0]);
        el.setAttribute("aria-invalid", f[1] ? "false" : "true");
        if (!f[1]) bad.push(el);
      });
    return bad;
  }

  function asText(d) {
    return "Computer pickup request\n" +
      "Name: " + d.name + "\nPhone: " + d.phone + (d.email ? "\nEmail: " + d.email : "") +
      "\nTown: " + d.town + "\nItems: " + d.items +
      (d.details ? "\nDetails: " + d.details : "") + "\nPickup or drop-off: " + d.handoff;
  }

  function fallback(text) {
    msg.className = "form-msg err";
    msg.innerHTML = text + " Text or call <a href=\"tel:" + cfg.PHONE_E164 + "\">" + cfg.PHONE + "</a> instead.";
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    msg.className = "form-msg"; msg.textContent = "";
    var d = collect();
    if (d.company) return; // bot filled the hidden field
    var bad = check(d);
    if (bad.length) {
      msg.className = "form-msg err";
      msg.textContent = "Add your name, a 10-digit phone number and your town, then send again.";
      bad[0].focus();
      return;
    }
    var btn = form.querySelector("button");

    if (!API) {
      // No backend yet: hand off as a text message, and show the details for desktop users
      var body = encodeURIComponent(asText(d));
      if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        location.href = "sms:" + cfg.PHONE_E164 + (/iPhone|iPad|iPod/i.test(navigator.userAgent) ? "&" : "?") + "body=" + body;
      } else {
        msg.innerHTML = "Text or call <a href=\"tel:" + cfg.PHONE_E164 + "\">" + cfg.PHONE + "</a> with these details:<pre></pre>";
        msg.querySelector("pre").textContent = asText(d);
      }
      return;
    }

    btn.disabled = true; btn.textContent = "Sending…";
    delete d.company;
    var payload = Object.assign({ action: "submit" }, d, attr, { page: PAGE });
    fetch(API, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // plain text keeps Apps Script happy (no CORS preflight)
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j.ok) throw new Error(j.error);
      location.href = new URL("thank-you.html", ROOT).href;
    }).catch(function () {
      btn.disabled = false; btn.textContent = "Send my pickup request";
      fallback("The request didn't go through.");
    });
  });
})();

(function () {
  var form = document.getElementById("lead");
  if (!form) return;
  var msg = document.getElementById("form-msg");
  var cfg = window.SITE || {};

  // keep where the visitor came from (UTM tags, page) so you know which town page / ad works
  function source() {
    var p = new URLSearchParams(location.search), out = [];
    ["utm_source", "utm_medium", "utm_campaign"].forEach(function (k) { if (p.get(k)) out.push(k + "=" + p.get(k)); });
    return location.pathname + (out.length ? " (" + out.join(", ") + ")" : "");
  }

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
      page: source(),
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

    if (!cfg.FORM_ENDPOINT) {
      // No endpoint yet: hand off as a text message, and show the details for desktop users
      var body = encodeURIComponent(asText(d));
      var isPhone = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (isPhone) {
        location.href = "sms:" + cfg.PHONE_E164 + (/iPhone|iPad|iPod/i.test(navigator.userAgent) ? "&" : "?") + "body=" + body;
      } else {
        msg.innerHTML = "Text or call <a href=\"tel:" + cfg.PHONE_E164 + "\">" + cfg.PHONE + "</a> with these details:<pre></pre>";
        msg.querySelector("pre").textContent = asText(d);
      }
      return;
    }

    btn.disabled = true; btn.textContent = "Sending…";
    delete d.company;
    fetch(cfg.FORM_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(Object.assign({ _subject: "Pickup request: " + d.town + " (" + d.items + ")" }, d))
    }).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      location.href = "/thank-you.html";
    }).catch(function () {
      btn.disabled = false; btn.textContent = "Send my pickup request";
      msg.className = "form-msg err";
      msg.innerHTML = "The request didn't go through. Text or call <a href=\"tel:" + cfg.PHONE_E164 + "\">" + cfg.PHONE + "</a> instead.";
    });
  });
})();

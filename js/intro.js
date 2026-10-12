// Opening shot: the photo of stacked laptops, the open one's screen shows this page,
// then the camera zooms into that screen and hands off to the real page.
(function () {
  var root = document.documentElement;
  var intro = document.getElementById("intro");
  if (!intro || !root.classList.contains("play-intro")) return;

  var IMG_W = 1792, IMG_H = 1008;
  // screen glass corners in the photo (pixels): top-left, top-right, bottom-left, bottom-right
  var Q = [[625, 182.5], [1061, 164], [639, 444], [1099, 422.5]];
  var SCREEN_W = 1280, SCREEN_H = 771; // the page is laid out at this size inside the screen

  var stage = intro.querySelector(".intro-stage");
  var img = intro.querySelector("img");
  var screen = intro.querySelector(".intro-screen");
  var done = false, timers = [];

  try { sessionStorage.setItem("yt_intro", "1"); } catch (e) {}

  // put a live copy of the header + hero on the laptop screen
  ["header.top", "section.hero"].forEach(function (sel) {
    var el = document.querySelector(sel);
    if (!el) return;
    var c = el.cloneNode(true);
    c.querySelectorAll("[id]").forEach(function (n) { n.removeAttribute("id"); });
    c.querySelectorAll("a,button").forEach(function (n) { n.setAttribute("tabindex", "-1"); });
    screen.appendChild(c);
  });
  screen.style.width = SCREEN_W + "px";
  screen.style.height = SCREEN_H + "px";
  screen.style.transform = "matrix3d(" + homography(SCREEN_W, SCREEN_H, Q).join(",") + ")";

  function cover() {
    var vw = innerWidth, vh = innerHeight;
    var s = Math.max(vw / IMG_W, vh / IMG_H);
    var cx = (Q[0][0] + Q[3][0]) / 2;
    var tx = Math.min(0, Math.max(vw - IMG_W * s, vw / 2 - cx * s)); // keep the laptop centered on phones
    return { s: s, tx: tx, ty: (vh - IMG_H * s) / 2 };
  }
  function zoomed() {
    var vw = innerWidth, vh = innerHeight;
    var minX = Math.min(Q[0][0], Q[2][0]), maxX = Math.max(Q[1][0], Q[3][0]);
    var minY = Math.min(Q[0][1], Q[1][1]), maxY = Math.max(Q[2][1], Q[3][1]);
    var sw = maxX - minX, cy = (minY + maxY) / 2;
    if (vh > vw) {
      // tall phone screen: the whole screen can't fill it, so close in on the headline (left side)
      var ps = Math.max(cover().s * 1.6, vw / (0.45 * sw));
      return { s: ps, tx: vw / 2 - (minX + 0.26 * sw) * ps, ty: vh / 2 - cy * ps };
    }
    var s = Math.max(vw / sw, vh / (maxY - minY)) * 1.06;
    return { s: s, tx: vw / 2 - (minX + maxX) / 2 * s, ty: vh / 2 - cy * s };
  }
  function place(t) { stage.style.transform = "translate(" + t.tx + "px," + t.ty + "px) scale(" + t.s + ")"; }

  function finish() {
    if (done) return;
    done = true;
    timers.forEach(clearTimeout);
    intro.classList.add("out");
    root.style.overflow = "";
    setTimeout(function () { root.classList.remove("play-intro"); intro.remove(); }, 650);
  }
  function at(ms, fn) { timers.push(setTimeout(fn, ms)); }

  function run() {
    root.style.overflow = "hidden";
    var start = cover();
    place(start);
    intro.classList.add("ready");
    // slow push-in while the screen wakes up
    requestAnimationFrame(function () {
      stage.style.transition = "transform 1.4s ease-out";
      place({ s: start.s * 1.04, tx: start.tx - innerWidth * 0.02, ty: start.ty - innerHeight * 0.02 });
    });
    at(250, function () { intro.classList.add("on"); });
    at(1500, function () {
      stage.style.transition = "transform 1.7s cubic-bezier(.65,0,.2,1)";
      place(zoomed());
      intro.classList.add("zoom");
    });
    at(3300, finish);
  }

  intro.querySelector(".intro-skip").addEventListener("click", finish);
  addEventListener("keydown", function (e) { if (e.key === "Escape") finish(); });
  addEventListener("wheel", finish, { passive: true, once: true });
  addEventListener("resize", function () { if (!done) { stage.style.transition = "none"; place(intro.classList.contains("zoom") ? zoomed() : cover()); } });

  var started = false;
  function go() { if (!started) { started = true; run(); } }
  if (img.complete && img.naturalWidth) go();
  else {
    img.addEventListener("load", go);
    img.addEventListener("error", finish);
    setTimeout(function () { if (!started) finish(); }, 3000); // slow connection: skip it
  }

  // matrix3d that maps a w x h box onto the four points q (tl, tr, bl, br)
  function homography(w, h, q) {
    function adj(m) {
      return [m[4] * m[8] - m[5] * m[7], m[2] * m[7] - m[1] * m[8], m[1] * m[5] - m[2] * m[4],
              m[5] * m[6] - m[3] * m[8], m[0] * m[8] - m[2] * m[6], m[2] * m[3] - m[0] * m[5],
              m[3] * m[7] - m[4] * m[6], m[1] * m[6] - m[0] * m[7], m[0] * m[4] - m[1] * m[3]];
    }
    function mm(a, b) {
      var c = [];
      for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) {
        var s = 0; for (var k = 0; k < 3; k++) s += a[3 * i + k] * b[3 * k + j]; c[3 * i + j] = s;
      }
      return c;
    }
    function mv(m, v) { return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]]; }
    function basis(p) {
      var m = [p[0][0], p[1][0], p[2][0], p[0][1], p[1][1], p[2][1], 1, 1, 1];
      var v = mv(adj(m), [p[3][0], p[3][1], 1]);
      return mm(m, [v[0], 0, 0, 0, v[1], 0, 0, 0, v[2]]);
    }
    var t = mm(basis(q), adj(basis([[0, 0], [w, 0], [0, h], [w, h]])));
    for (var i = 0; i < 9; i++) t[i] /= t[8];
    return [t[0], t[3], 0, t[6], t[1], t[4], 0, t[7], 0, 0, 1, 0, t[2], t[5], 0, t[8]];
  }
})();

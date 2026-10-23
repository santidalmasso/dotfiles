// Jump audit: drives every scene through every step, reverse step, interrupted step and control,
// samples every frame, and lists each object that moves, fades, recolours or retexts in one frame.
// Run with drive.mjs --preload audit.js and the actions
// [["wait", 800], ["eval", "sceneAudit(), 0"], ["until", "window.sceneAuditResult", 900000], ["eval", "window.sceneAuditResult"]].
window.sceneAudit = async function sceneAudit(opts = {}) {
  const speed = opts.speed ?? 0.25;
  const movePx = opts.movePx ?? 20;
  const fadeStep = opts.fadeStep ?? 0.35;
  if ("__driveSpeed" in window) window.__driveSpeed = speed;
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const wait = async (ms) => {
    const end = performance.now() + ms;
    while (performance.now() < end) await frame();
  };
  const digitsOut = (t) => t.replace(/[−+\-]?[\d.,]+%?/g, "#");
  const findings = [];

  function snapshot(fig) {
    const out = new Map();
    fig.querySelectorAll(".sc-layer > .sc-o").forEach((g, i) => {
      const el = g.firstElementChild;
      let box = { x: 0, y: 0, width: 0, height: 0 };
      try { box = el.getBBox(); } catch {}
      const key = g.getAttribute("data-key") || `#${i}`;
      out.set(out.has(key) ? `${key}~${i}` : key, {
        op: +g.getAttribute("opacity"),
        x: box.x, y: box.y, w: box.width, h: box.height,
        text: el.textContent || "",
        fill: getComputedStyle(el).fill,
      });
    });
    return out;
  }
  const rgb = (c) => (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
  const colorJump = (a, b) => { const x = rgb(a), y = rgb(b); return x.length === 3 && y.length === 3 ? Math.max(...x.map((v, i) => Math.abs(v - y[i]))) : 0; };

  async function watch(fig, label, act, ms) {
    let prev = snapshot(fig);
    const born = new Map();
    act();
    const end = performance.now() + ms;
    while (performance.now() < end) {
      await frame();
      const now = snapshot(fig);
      now.forEach((s, key) => {
        const p = prev.get(key);
        const where = `${fig.dataset.scene} ${label} [${key}]`;
        if (!p) { if (s.op > 0.3) born.set(key, { s, where }); return; }
        const seen = Math.max(s.op, p.op);
        const d = Math.max(Math.abs(s.x - p.x), Math.abs(s.y - p.y), Math.abs(s.w - p.w), Math.abs(s.h - p.h));
        if (seen > 0.15 && d > movePx && !(p.text !== s.text && digitsOut(p.text) === digitsOut(s.text) && Math.abs(s.y - p.y) < 1)) findings.push(`${where}: jumps ${d.toFixed(0)}px in one frame`);
        if (Math.abs(s.op - p.op) > fadeStep) findings.push(`${where}: opacity ${p.op} → ${s.op} in one frame`);
        if (seen > 0.15 && p.text !== s.text && digitsOut(p.text) !== digitsOut(s.text)) findings.push(`${where}: text "${p.text}" → "${s.text}" while visible`);
        if (seen > 0.15 && colorJump(p.fill, s.fill) > 90) findings.push(`${where}: fill ${p.fill} → ${s.fill} in one frame`);
      });
      prev.forEach((p, key) => { if (!now.has(key) && p.op > 0.3) findings.push(`${fig.dataset.scene} ${label} [${key}]: vanishes at opacity ${p.op}`); });
      prev = now;
    }
    born.forEach(({ s, where }, key) => {
      const last = prev.get(key);
      const flew = last && Math.max(Math.abs(last.x - s.x), Math.abs(last.y - s.y)) > movePx;
      if (!flew) findings.push(`${where}: pops in at opacity ${s.op}`);
    });
  }

  for (const fig of document.querySelectorAll("figure[data-scene]")) {
    const sc = fig.__scene;
    if (!sc) { findings.push(`${fig.dataset.scene}: did not mount`); continue; }
    const n = fig.querySelectorAll(".sc-dot").length || 1;
    const dur = 1500;
    for (let i = 0; i + 1 < n; i++) {
      sc.go(i, 0); await frame();
      await watch(fig, `step ${i + 1}→${i + 2}`, () => sc.go(i + 1), dur);
      await watch(fig, `step ${i + 2}→${i + 1}`, () => sc.go(i), dur);
      sc.go(i, 0); await frame();
      await watch(fig, `step ${i + 1}→${i + 2} interrupted`, async () => {
        sc.go(i + 1);
        await wait(380);
        sc.go(i + 2 < n ? i + 2 : i);
      }, dur + 400);
    }
    sc.go(n - 1, 0); await frame();
    for (const wrap of fig.querySelectorAll(".sc-param:not([hidden])")) {
      for (const b of wrap.querySelectorAll(".sc-seg button")) await watch(fig, `control ${b.textContent}`, () => b.click(), dur);
      const r = wrap.querySelector("input[type=range]");
      if (r) {
        await watch(fig, `slider ${r.id}`, async () => {
          for (const v of [r.min, r.max, r.min]) {
            for (let k = 0; k <= 12; k++) {
              r.value = String(+r.value + (v - r.value) * (k / 12));
              r.dispatchEvent(new Event("input"));
              await frame();
            }
          }
        }, dur + 1200);
      }
    }
    sc.go(0, 0);
  }
  if ("__driveSpeed" in window) window.__driveSpeed = 1;
  const unique = [...new Set(findings)];
  return (window.sceneAuditResult = { scenes: document.querySelectorAll("figure[data-scene]").length, findings: unique.length, list: unique.slice(0, opts.limit ?? 60) });
};

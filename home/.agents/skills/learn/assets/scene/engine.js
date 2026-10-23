(() => {
  const SVGNS = "http://www.w3.org/2000/svg";
  const DEFS = {};
  const NUM_PROPS = ["x", "y", "w", "h", "r", "x1", "y1", "x2", "y2", "cx", "cy", "rx", "size", "sw", "opacity", "num", "rot", "dash"];
  const RESET_PROPS = { opacity: 1, rot: 0, dash: 0 };
  const COLOR_PROPS = ["fill", "stroke"];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const smooth = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
  const lerp = (a, b, t) => a + (b - a) * t;

  function define(name, def) {
    DEFS[name] = def;
  }

  function obj(kind, key, props, extra) {
    return Object.assign({ kind, key, props }, extra || {});
  }

  const H = {
    rect: (key, p, o) => obj("rect", key, p, o),
    text: (key, p, o) => obj("text", key, p, o),
    line: (key, p, o) => obj("line", key, p, o),
    circle: (key, p, o) => obj("circle", key, p, o),
    path: (key, p, o) => obj("path", key, p, o),
    rich: (key, p, o) => obj("rich", key, p, o),
    arrow: (key, p, o) => obj("line", key, Object.assign({ arrow: true }, p), o),
    fmt: {
      int: (v) => Math.round(v).toLocaleString("en-US"),
      one: (v) => v.toFixed(1),
      two: (v) => v.toFixed(2),
      pct1: (v) => v.toFixed(1) + "%",
      pct2: (v) => v.toFixed(2) + "%",
      signed: (v) => (v > 0.0001 ? "+" : v < -0.0001 ? "−" : "") + Math.abs(Math.round(v)),
    },
  };

  function colorResolver(host) {
    const probe = document.createElement("span");
    probe.style.display = "none";
    host.appendChild(probe);
    const cache = new Map();
    return {
      reset() {
        cache.clear();
      },
      rgb(value) {
        if (value == null || value === "none") return null;
        if (cache.has(value)) return cache.get(value);
        probe.style.color = "";
        probe.style.color = value;
        const computed = getComputedStyle(probe).color;
        const m = computed.match(/[\d.]+/g);
        const unit = computed.startsWith("color(") ? 255 : 1;
        const rgb = m ? [m[0] * unit, m[1] * unit, m[2] * unit, m[3] == null ? 1 : +m[3]] : null;
        cache.set(value, rgb);
        return rgb;
      },
    };
  }

  const rgbString = (c) => (c ? `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${c[3].toFixed(3)})` : "none");

  function mixColor(a, b, t) {
    if (!a && !b) return null;
    if (!b && t >= 1) return null;
    const from = a || [b[0], b[1], b[2], 0];
    const to = b || [a[0], a[1], a[2], 0];
    return [0, 1, 2, 3].map((i) => lerp(from[i], to[i], t));
  }

  function look(kind, p) {
    if (kind === "rich") return JSON.stringify([p.parts, p.anchor]);
    if (kind === "text") return JSON.stringify([p.fmt ? null : String(p.text), p.anchor, p.weight, p.mono, p.serif]);
    if (kind === "path") return pathSkeleton(p.d || "").skel;
    if (kind === "line") return String(!!p.arrow);
    return "";
  }

  function pathSkeleton(d) {
    const nums = (d.match(/-?\d*\.?\d+(?:e-?\d+)?/gi) || []).map(Number);
    return { nums, skel: d.replace(/-?\d*\.?\d+(?:e-?\d+)?/gi, "#") };
  }

  function mount(figure) {
    const name = figure.getAttribute("data-scene");
    const def = DEFS[name];
    if (!def) return;
    const W = def.w || 640;
    const Hh = def.h || 300;
    const steps = def.steps || [{ say: "" }];
    const params = {};
    Object.keys(def.params || {}).forEach((k) => (params[k] = def.params[k].value));

    figure.classList.add("sc");
    figure.innerHTML = `
      <div class="sc-top"><span class="sc-fig">${def.fig || ""}</span><span class="sc-title">${def.title || ""}</span></div>
      <div class="sc-stage"><svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="${(def.title || "").replace(/"/g, "")}">
        <defs><marker id="sc-ah-${name}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,1 L9,5 L0,9 z" fill="context-stroke"/></marker></defs>
        <g class="sc-layer"></g></svg></div>
      <div class="sc-say" aria-live="polite"><span class="sc-k"></span><p></p></div>
      <div class="sc-bar">
        <button type="button" class="sc-btn sc-prev" aria-label="Previous step">&#8592;</button>
        <button type="button" class="sc-btn sc-play" aria-label="Play">Play</button>
        <button type="button" class="sc-btn sc-next" aria-label="Next step">&#8594;</button>
        <div class="sc-dots"></div>
        <div class="sc-params"></div>
      </div>
      ${def.caption ? `<p class="sc-caption">${def.caption}</p>` : ""}`;

    const svg = figure.querySelector("svg");
    const layer = figure.querySelector(".sc-layer");
    const sayK = figure.querySelector(".sc-k");
    const sayP = figure.querySelector(".sc-say p");
    const dotsEl = figure.querySelector(".sc-dots");
    const playBtn = figure.querySelector(".sc-play");
    const colors = colorResolver(figure);
    const live = new Map();
    let step = 0;
    let anim = null;
    let playing = false;
    let playTimer = null;
    let ghosts = 0;

    steps.forEach((s, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "sc-dot";
      b.setAttribute("aria-label", `Step ${i + 1}`);
      b.addEventListener("click", () => {
        stop();
        go(i);
      });
      dotsEl.appendChild(b);
    });
    if (steps.length < 2) figure.querySelectorAll(".sc-prev,.sc-play,.sc-next,.sc-dots").forEach((el) => el.remove());

    const paramsEl = figure.querySelector(".sc-params");
    Object.keys(def.params || {}).forEach((k) => {
      const spec = def.params[k];
      const wrap = document.createElement("div");
      wrap.className = "sc-param";
      if (spec.type === "seg") {
        wrap.innerHTML = `<span class="sc-plbl">${spec.label}</span><span class="sc-seg" role="group" aria-label="${spec.label}">${spec.options
          .map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${v === params[k]}">${l}</button>`)
          .join("")}</span>`;
        wrap.querySelectorAll("button").forEach((b) =>
          b.addEventListener("click", () => {
            params[k] = b.getAttribute("data-v");
            wrap.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
            render(def.paramMs || 650);
          }),
        );
      } else {
        const fmt = spec.format || ((v) => v);
        wrap.innerHTML = `<label class="sc-plbl" for="sc-${name}-${k}">${spec.label}</label><input id="sc-${name}-${k}" type="range" min="${spec.min}" max="${spec.max}" step="${spec.step || 1}" value="${params[k]}"><output>${fmt(params[k])}</output>`;
        const input = wrap.querySelector("input");
        const out = wrap.querySelector("output");
        input.addEventListener("input", () => {
          params[k] = +input.value;
          out.textContent = fmt(params[k]);
          render(220, { direct: true });
        });
      }
      paramsEl.appendChild(wrap);
    });

    function visibleParams() {
      const only = steps[step].params;
      paramsEl.querySelectorAll(".sc-param").forEach((el, i) => {
        const k = Object.keys(def.params)[i];
        el.hidden = Array.isArray(only) ? !only.includes(k) : only === false;
      });
    }

    function makeNode(o) {
      const g = document.createElementNS(SVGNS, "g");
      g.setAttribute("class", "sc-o" + (o.cls ? " " + o.cls : ""));
      g.setAttribute("data-key", o.key);
      const tag = o.kind === "rich" ? "text" : o.kind;
      const el = document.createElementNS(SVGNS, tag);
      g.appendChild(el);
      layer.appendChild(g);
      return { g, el, cur: {}, from: {}, to: {}, at: 0, span: 1, ease: smooth, settled: true, kind: o.kind, dying: false, swap: false, showOld: false, oldProps: null };
    }

    function resolveTarget(o) {
      const p = Object.assign({}, RESET_PROPS, o.props);
      const t = {};
      NUM_PROPS.forEach((k) => {
        if (p[k] != null) t[k] = p[k];
      });
      COLOR_PROPS.forEach((k) => {
        if (p[k] != null) t[k] = colors.rgb(p[k]);
      });
      return { t, p };
    }

    function apply(n, o) {
      const c = n.cur;
      const el = n.el;
      const p = n.showOld ? n.oldProps : n.props;
      const op = c.opacity == null ? 1 : c.opacity;
      n.g.setAttribute("opacity", Math.max(0, Math.min(1, op)).toFixed(3));
      if (c.fill !== undefined) el.style.fill = rgbString(c.fill);
      if (c.stroke !== undefined) el.style.stroke = rgbString(c.stroke);
      if (c.sw != null) el.setAttribute("stroke-width", c.sw);
      if (c.dash > 0) el.setAttribute("stroke-dasharray", `${c.dash} ${c.dash}`);
      else el.removeAttribute("stroke-dasharray");
      if (n.kind === "rect") {
        el.setAttribute("x", c.x);
        el.setAttribute("y", c.y);
        el.setAttribute("width", Math.max(0, c.w));
        el.setAttribute("height", Math.max(0, c.h));
        el.setAttribute("rx", c.r || 0);
      } else if (n.kind === "circle") {
        el.setAttribute("cx", c.cx);
        el.setAttribute("cy", c.cy);
        el.setAttribute("r", Math.max(0, c.r));
      } else if (n.kind === "line") {
        el.setAttribute("x1", c.x1);
        el.setAttribute("y1", c.y1);
        el.setAttribute("x2", c.x2);
        el.setAttribute("y2", c.y2);
        if (p.arrow) el.setAttribute("marker-end", `url(#sc-ah-${name})`);
        else el.removeAttribute("marker-end");
        el.setAttribute("stroke-linecap", "round");
      } else if (n.kind === "path") {
        el.setAttribute("d", (!n.showOld && n.dNow) || p.d);
        el.setAttribute("stroke-linejoin", "round");
        el.setAttribute("stroke-linecap", "round");
      } else {
        el.setAttribute("x", c.x);
        el.setAttribute("y", c.y);
        el.setAttribute("font-size", c.size || 12);
        el.setAttribute("text-anchor", p.anchor || "start");
        el.setAttribute("dominant-baseline", "middle");
        el.setAttribute("class", "sc-t" + (p.mono ? " sc-mono" : "") + (p.serif ? " sc-serif" : ""));
        if (p.weight) el.setAttribute("font-weight", p.weight);
        else el.removeAttribute("font-weight");
        if (c.rot) el.setAttribute("transform", `rotate(${c.rot} ${c.x} ${c.y})`);
        else el.removeAttribute("transform");
        const text = p.fmt && c.num != null ? p.fmt(c.num) : p.text;
        if (n.kind === "rich") {
          el.setAttribute("xml:space", "preserve");
          el.style.whiteSpace = "pre";
          const key = JSON.stringify(p.parts);
          if (el.__k !== key) {
            el.__k = key;
            el.textContent = "";
            p.parts.forEach(([s, color, w]) => {
              const ts = document.createElementNS(SVGNS, "tspan");
              ts.textContent = s;
              if (color) ts.style.fill = color;
              if (w) ts.setAttribute("font-weight", w);
              el.appendChild(ts);
            });
          }
        } else if (el.textContent !== String(text)) el.textContent = text;
      }
      if (o) {
        if (o.tags) n.g.setAttribute("data-tags", o.tags);
        else n.g.removeAttribute("data-tags");
      }
    }

    function render(ms, opts) {
      const objs = def.draw(step, params, H).filter(Boolean);
      const seen = new Set();
      const dur = reduced ? 0 : ms;
      const interrupted = anim !== null;
      const direct = !!(opts && opts.direct);
      objs.forEach((o) => {
        if (seen.has(o.key)) console.warn(`scene ${name}: duplicate key "${o.key}" at step ${step}`);
        seen.add(o.key);
        let n = live.get(o.key);
        if (n && n.kind !== o.kind) {
          live.delete(o.key);
          ghosts += 1;
          live.set(`${o.key}\u0000${ghosts}`, n);
          n = null;
        }
        const { t, p } = resolveTarget(o);
        const moving = !!n && interrupted && !n.settled;
        if (!n) {
          n = makeNode(o);
          live.set(o.key, n);
          const enter = Object.assign({ opacity: 0 }, o.enter || {});
          n.cur = Object.assign({}, t);
          Object.keys(enter).forEach((k) => {
            n.cur[k] = COLOR_PROPS.includes(k) ? colors.rgb(enter[k]) : enter[k];
          });
          if (p.num != null && enter.num == null) n.cur.num = p.num;
        } else {
          layer.appendChild(n.g);
        }
        const shown = n.props ? (n.showOld ? n.oldProps : n.props) : null;
        const shownD = shown ? (!n.showOld && n.dNow) || shown.d : null;
        n.swap = !!shown && look(n.kind, shown) !== look(n.kind, p) && (n.cur.opacity == null ? 1 : n.cur.opacity) > 0.01;
        n.oldProps = n.swap ? shown : null;
        n.showOld = n.swap;
        n.dying = false;
        n.from = Object.assign({}, n.cur);
        Object.keys(t).forEach((k) => {
          if (n.from[k] == null) n.from[k] = t[k];
        });
        n.to = t;
        n.at = direct || moving ? 0 : o.at || 0;
        n.span = o.span || Math.max(0.2, 1 - n.at);
        n.ease = direct || moving ? easeOut : smooth;
        n.settled = false;
        if (p.d != null) {
          const a = pathSkeleton(shownD || p.d);
          const b = pathSkeleton(p.d);
          n.dFrom = a.skel === b.skel ? a : null;
          n.dTo = b;
        }
        n.props = p;
        apply(n, o);
      });
      live.forEach((n, key) => {
        if (seen.has(key)) return;
        n.dying = true;
        n.settled = false;
        n.from = Object.assign({}, n.cur);
        n.to = Object.assign({}, n.cur, { opacity: 0 });
        n.at = 0;
        n.span = 0.5;
        n.ease = interrupted ? easeOut : smooth;
        n.swap = false;
      });
      start(dur);
    }

    function frame(t) {
      live.forEach((n, key) => {
        const raw = clamp01((t - n.at) / n.span);
        const local = n.ease(raw);
        Object.keys(n.to).forEach((k) => {
          const a = n.from[k];
          const b = n.to[k];
          if (COLOR_PROPS.includes(k)) n.cur[k] = mixColor(a, b, local);
          else if (k === "dash") n.cur[k] = local < 0.5 ? a : b;
          else n.cur[k] = lerp(a, b, local);
        });
        if (n.swap) {
          const fromOp = n.from.opacity == null ? 1 : n.from.opacity;
          const toOp = n.to.opacity == null ? 1 : n.to.opacity;
          n.showOld = local < 0.5;
          n.cur.opacity = n.showOld ? lerp(fromOp, 0, local * 2) : lerp(0, toOp, local * 2 - 1);
          if (raw >= 1) {
            n.swap = false;
            n.oldProps = null;
          }
        }
        if (n.dTo) {
          if (n.dFrom) {
            let i = 0;
            n.dNow = n.dTo.skel.replace(/#/g, () => {
              const v = lerp(n.dFrom.nums[i], n.dTo.nums[i], local);
              i += 1;
              return +v.toFixed(2);
            });
          } else n.dNow = null;
        }
        apply(n);
        n.settled = raw >= 1;
        if (n.dying && raw >= 1) {
          n.g.remove();
          live.delete(key);
        }
      });
    }

    function start(dur) {
      if (anim) cancelAnimationFrame(anim.raf);
      if (!dur) {
        frame(1.0001);
        frame(1.0001);
        anim = null;
        return;
      }
      const t0 = performance.now();
      anim = { raf: 0 };
      const tick = (now) => {
        const t = (now - t0) / dur;
        frame(Math.min(t, 1.0001));
        if (t < 1) anim.raf = requestAnimationFrame(tick);
        else anim = null;
      };
      anim.raf = requestAnimationFrame(tick);
    }

    function say() {
      const s = steps[step];
      sayK.textContent = steps.length > 1 ? `${step + 1} / ${steps.length}` : "";
      sayP.innerHTML = s.say || "";
      dotsEl.querySelectorAll(".sc-dot").forEach((d, i) => d.setAttribute("aria-current", String(i === step)));
      figure.querySelector(".sc-prev") && (figure.querySelector(".sc-prev").disabled = step === 0);
      figure.querySelector(".sc-next") && (figure.querySelector(".sc-next").disabled = step === steps.length - 1);
      bindTags(sayP);
    }

    function go(i, ms) {
      step = Math.max(0, Math.min(steps.length - 1, i));
      say();
      visibleParams();
      render(ms == null ? steps[step].ms || def.ms || 1100 : ms);
    }

    function stop() {
      playing = false;
      clearTimeout(playTimer);
      playBtn && (playBtn.textContent = "Play");
    }

    function play() {
      if (step === steps.length - 1) go(0, 500);
      playing = true;
      playBtn.textContent = "Pause";
      const next = () => {
        if (!playing) return;
        if (step >= steps.length - 1) return stop();
        go(step + 1);
        playTimer = setTimeout(next, (steps[step].ms || def.ms || 1100) + (steps[step].dwell || def.dwell || 2600));
      };
      playTimer = setTimeout(next, 700);
    }

    function focusTag(tag) {
      figure.classList.toggle("sc-focus", !!tag);
      layer.querySelectorAll(".sc-o").forEach((g) => {
        const tags = (g.getAttribute("data-tags") || "").split(" ");
        g.classList.toggle("on", !!tag && tags.includes(tag));
      });
      figure.querySelectorAll("[data-tag]").forEach((el) => el.classList.toggle("on", el.getAttribute("data-tag") === tag));
    }

    function bindTags(root) {
      root.querySelectorAll("[data-tag]").forEach((el) => {
        el.classList.add("sc-term");
        el.addEventListener("mouseenter", () => focusTag(el.getAttribute("data-tag")));
        el.addEventListener("mouseleave", () => focusTag(null));
        el.addEventListener("focus", () => focusTag(el.getAttribute("data-tag")));
        el.addEventListener("blur", () => focusTag(null));
        el.tabIndex = 0;
      });
    }

    layer.addEventListener("mouseover", (e) => {
      const g = e.target.closest(".sc-o[data-tags]");
      focusTag(g ? g.getAttribute("data-tags").split(" ")[0] : null);
    });
    layer.addEventListener("mouseleave", () => focusTag(null));

    figure.querySelector(".sc-prev")?.addEventListener("click", () => {
      stop();
      go(step - 1);
    });
    figure.querySelector(".sc-next")?.addEventListener("click", () => {
      stop();
      go(step + 1);
    });
    playBtn?.addEventListener("click", () => (playing ? stop() : play()));
    figure.tabIndex = -1;
    figure.addEventListener("keydown", (e) => {
      if (e.target.closest("input")) return;
      if (e.key === "ArrowRight") {
        stop();
        go(step + 1);
        e.preventDefault();
      } else if (e.key === "ArrowLeft") {
        stop();
        go(step - 1);
        e.preventDefault();
      }
    });
    svg.addEventListener("click", () => {
      if (steps.length < 2) return;
      stop();
      go(step === steps.length - 1 ? 0 : step + 1);
    });

    const retheme = () => {
      colors.reset();
      render(0);
    };
    new MutationObserver(retheme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", retheme);

    go(0, 0);
    figure.__scene = { go, params, get step() { return step; }, render };
  }

  window.Scene = { define, mount, H };
  const boot = () => document.querySelectorAll("figure[data-scene]").forEach(mount);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

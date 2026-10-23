Scene.define("rowsToPivot", {
  fig: "Fig 2.2",
  title: "Nine rows become a pivot",
  w: 640,
  h: 290,
  params: { agg: { type: "seg", label: "Measure", options: [["sum", "SUM"], ["avg", "AVG"]], value: "sum" } },
  steps: [
    { say: 'This is the list that the database returns. It has one row for each <b class="k-key" data-tag="dept">department</b>, account and <b class="k-time" data-tag="month">month</b>, and the amount for that combination.', params: [] },
    { say: 'First move: each <b class="k-time" data-tag="month">month</b> gets its own column. Each amount slides right into the column of its month. No number changes.', params: [] },
    { say: 'Second move: rows with the same <b class="k-key" data-tag="dept">department</b> and account join into one row. The nine amounts now fill a grid of three rows and three columns.', params: [] },
    { say: 'A subtotal is the total of one group. Here a group is a department. <b data-tag="sjan">Sales in January</b> is 20 + 12 = 32.', params: [] },
    { say: 'The grand total row adds every row. The <b class="k-time" data-tag="q1">Q1</b> column adds the three months. The bottom right cell adds all nine amounts: 159.', params: [] },
    { say: 'Set the measure to AVG. An average total must average the rows under it: Sales in January is (20 + 12) ÷ 2 = 16. If you add the cells, you get 32, which is <b class="k-bad" data-tag="wrong">wrong</b>.', params: ["agg"] },
  ],
  caption: "Data: Acme, Actual, Opex, Q1 2026. The list comes from <code>GROUP BY department, account, month</code>. The scene computes each total from the rows under it, as <code>GROUPING SETS</code> does.",
  draw(step, p, h) {
    const MONTHS = ["2026-01", "2026-02", "2026-03"];
    const LEAVES = [
      { dept: "Engineering", acct: "Salaries", v: [18, 18, 19] },
      { dept: "Sales", acct: "Marketing", v: [20, 25, 22] },
      { dept: "Sales", acct: "Salaries", v: [12, 12, 13] },
    ];
    const flat = [];
    LEAVES.forEach((leaf, li) => MONTHS.forEach((m, mi) => flat.push({ li, mi, dept: leaf.dept, acct: leaf.acct, m, v: leaf.v[mi] })));

    const COLX = [330, 410, 490];
    const Q1X = 580;
    const LEAF_Y = [74, 132, 156];
    const SUB_Y = { Engineering: 98, Sales: 180 };
    const GT_Y = 216;
    const flatY = (i) => 58 + i * 24;
    const pivot = step >= 2;
    const avg = step >= 5 && p.agg === "avg";
    const out = [];
    const ink = "var(--ink)";
    const muted = "var(--muted)";

    if (!pivot) {
      [["department", 40, "start"], ["account", 150, "start"], ["month", 250, "start"], ["amount", 380, "end"]].slice(0, step === 0 ? 4 : 2).forEach(([t, x, anchor], i) =>
        out.push(h.text("fh" + i, { x, y: 34, text: t, size: 11.5, fill: muted, anchor }, { tags: t === "month" ? "month" : t === "department" ? "dept" : undefined })),
      );
      out.push(h.line("frule", { x1: 40, y1: 46, x2: step === 0 ? 380 : 600, y2: 46, stroke: "var(--c-cell-line)", sw: 1 }));
    } else {
      out.push(h.line("frule", { x1: 40, y1: 54, x2: step >= 4 ? 600 : 500, y2: 54, stroke: "var(--c-cell-line)", sw: 1 }));
      out.push(h.text("ph", { x: 40, y: 40, text: avg ? "Opex, Actual, AVG" : "Opex, Actual, SUM", size: 11.5, fill: muted }));
    }

    flat.forEach((r, i) => {
      const atCol = step >= 1;
      const y = pivot ? LEAF_Y[r.li] : flatY(i);
      const tags = ["dept", r.dept === "Sales" && r.mi === 0 ? "sjan" : null].filter(Boolean).join(" ");
      const dup = pivot && r.mi > 0 ? 0 : 1;
      out.push(h.text("d" + i, { x: 40, y, text: r.dept, size: 12.5, fill: "var(--c-key)", weight: 550, opacity: dup }, { tags, at: pivot ? r.mi * 0.08 : 0 }));
      out.push(h.text("a" + i, { x: 150, y, text: r.acct, size: 12.5, fill: ink, opacity: dup }, { at: pivot ? r.mi * 0.08 : 0 }));
      out.push(
        h.text("m" + i, atCol ? { x: COLX[r.mi], y: pivot ? 40 : 34, text: r.m, size: 11.5, fill: "var(--c-time)", anchor: "end", weight: 550 } : { x: 250, y, text: r.m, size: 12.5, fill: "var(--c-time)" }, {
          tags: "month",
          at: atCol ? i * 0.045 : 0,
        }),
      );
      out.push(
        h.text("v" + i, { x: atCol ? COLX[r.mi] : 380, y, text: String(r.v), size: 13, fill: ink, anchor: "end", mono: true }, {
          at: atCol && !pivot ? i * 0.045 : pivot ? r.li * 0.1 : 0,
          tags: r.dept === "Sales" && r.mi === 0 ? "sjan" : undefined,
        }),
      );
    });

    if (step >= 3) {
      const sum = (a) => a.reduce((s, x) => s + x, 0);
      const mean = (a) => sum(a) / a.length;
      const fmtFor = (target) => (Number.isInteger(target) ? h.fmt.int : h.fmt.two);
      const total = (rows, cols, key, x, y, tag, at) => {
        const cells = [];
        rows.forEach((leaf) => cols.forEach((mi) => cells.push(leaf.v[mi])));
        const right = avg ? mean(cells) : sum(cells);
        out.push(
          h.text(key, { x, y, num: right, fmt: fmtFor(right), size: 13, fill: avg ? "var(--c-good)" : ink, anchor: "end", mono: true, weight: 650 }, { tags: tag, at, enter: { y: y - 22, num: 0 } }),
        );
        if (avg) {
          const parts = rows.length * cols.length;
          if (parts > 1) {
            const added = sum(cells);
            out.push(h.text(key + "w", { x: x - 48, y: y, text: String(added), size: 10.5, fill: "var(--c-bad)", anchor: "end", mono: true }, { tags: "wrong", at: 0.2 }));
          }
        }
      };
      ["Engineering", "Sales"].forEach((dept, di) => {
        const rows = LEAVES.filter((l) => l.dept === dept);
        const y = SUB_Y[dept];
        out.push(h.text("sl" + dept, { x: 40, y, text: dept + " subtotal", size: 12.5, fill: ink, weight: 650 }, { tags: dept === "Sales" ? "sjan" : undefined, at: 0.1 + di * 0.15 }));
        out.push(h.line("sr" + dept, { x1: 40, y1: y - 12, x2: step >= 4 ? 600 : 500, y2: y - 12, stroke: "var(--c-cell-line)", sw: 1 }));
        MONTHS.forEach((m, mi) => total(rows, [mi], `s${dept}${mi}`, COLX[mi], y, dept === "Sales" && mi === 0 ? "sjan" : undefined, 0.15 + di * 0.15 + mi * 0.06));
        if (step >= 4) total(rows, [0, 1, 2], `s${dept}q`, Q1X, y, "q1", 0.35);
      });
    }
    if (step >= 4) {
      out.push(h.text("q1h", { x: Q1X, y: 40, text: "Q1", size: 11.5, fill: "var(--c-time)", anchor: "end", weight: 550 }, { tags: "q1" }));
      out.push(h.line("gtr", { x1: 40, y1: GT_Y - 14, x2: 600, y2: GT_Y - 14, stroke: ink, sw: 1 }));
      out.push(h.text("gtl", { x: 40, y: GT_Y, text: "Grand total", size: 12.5, fill: ink, weight: 650 }, { at: 0.1 }));
      LEAVES.forEach((leaf, li) => {
        const cells = leaf.v;
        const v = avg ? cells.reduce((s, x) => s + x, 0) / 3 : cells.reduce((s, x) => s + x, 0);
        out.push(
          h.text("lq" + li, { x: Q1X, y: LEAF_Y[li], num: v, fmt: Number.isInteger(v) ? h.fmt.int : h.fmt.two, size: 13, fill: avg ? "var(--c-good)" : ink, anchor: "end", mono: true }, { tags: "q1", at: 0.2 + li * 0.08, enter: { x: COLX[2], num: 0 } }),
        );
        if (avg) out.push(h.text("lq" + li + "w", { x: Q1X - 48, y: LEAF_Y[li], text: String(cells.reduce((s, x) => s + x, 0)), size: 10.5, fill: "var(--c-bad)", anchor: "end", mono: true }, { tags: "wrong", at: 0.2 }));
      });
      const all = LEAVES;
      const gt = (cols, key, x) => {
        const cells = [];
        all.forEach((leaf) => cols.forEach((mi) => cells.push(leaf.v[mi])));
        const s = cells.reduce((a, b) => a + b, 0);
        const v = avg ? s / cells.length : s;
        const fmt = Number.isInteger(v) ? h.fmt.int : h.fmt.two;
        out.push(h.text(key, { x, y: GT_Y, num: v, fmt, size: 13, fill: avg ? "var(--c-good)" : ink, anchor: "end", mono: true, weight: 700 }, { tags: cols.length === 3 ? "q1" : undefined, at: 0.3, enter: { y: GT_Y - 30, num: 0 } }));
        if (avg) out.push(h.text(key + "w", { x: x - 48, y: GT_Y, text: String(s), size: 10.5, fill: "var(--c-bad)", anchor: "end", mono: true }, { tags: "wrong", at: 0.2 }));
      };
      MONTHS.forEach((m, mi) => gt([mi], "g" + mi, COLX[mi]));
      gt([0, 1, 2], "gq", Q1X);
      if (avg) {
        out.push(h.text("legw", { x: 40, y: 258, text: "small red number: the cells added", size: 11, fill: "var(--c-bad)" }, { tags: "wrong" }));
        out.push(h.text("legg", { x: 300, y: 258, text: "bold green number: the average of the rows below it", size: 11, fill: "var(--c-good)" }));
      }
    }
    return out;
  },
});

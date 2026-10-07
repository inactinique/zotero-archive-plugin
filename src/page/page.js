// The page: charts, table and reference list. Adapted from the Python
// project's template.html (see src/page/template-script.js for the original
// and scripts/sync-template.mjs to refresh it): the differences are the
// function wrapper, `root` instead of `document`, the `onOpen` option and the
// returned handle.

/**
 * Render the archive page into `root`, the <article class="zotero-archive"> element,
 * from the data `D` computed by the pipeline.
 *
 * `options.onOpen(key)`, when given, is called instead of following a Zotero link
 * (inside the plugin, it selects the item in the main window). Returns a handle
 * with `render()` and `destroy()`.
 */
export function renderArchive(root, D, options = {}) {
  const SVG = 'http://www.w3.org/2000/svg';
  const $ = (sel) => root.querySelector(sel);

  // Every text of the page, in each language it can be generated in (--language).
  // Functions receive figures and dates already formatted. To add a language, add an
  // entry here and in TYPE_LABELS and PAGE of pipeline.py.
  const STRINGS = {
    fr: {
      locale: 'fr-FR', percent: ' %', half: 'S', quarter: 'T', many: (n) => n > 1,
      title: 'Zotero comme archive',
      compTitle: 'Ce qui entre dans la bibliothèque, période par période',
      tableToggle: 'Voir ces données sous forme de tableau',
      rowsTitle: 'Trajectoire de chaque thème',
      rowsSub: ['Les thèmes sont classés du plus ancien au plus récent. Chaque ligne a sa propre échelle verticale : elle montre ', 'quand', ' un thème occupe la bibliothèque, et son maximum est indiqué. Cliquez sur un thème pour déplier ses sous-thèmes.'],
      references: 'Références', selection: 'Sélection',
      ref: ['référence', 'références'], added: ['référence ajoutée', 'références ajoutées'], day: ['jour', 'jours'],
      compShare: 'Part de chaque thème parmi les références ajoutées pendant la période. Les barres grises, au-dessus, rappellent combien de références ont été ajoutées : une part élevée sur un petit volume pèse peu.',
      compCount: 'Nombre de références ajoutées pendant la période, réparties par thème.',
      compAria: 'Composition thématique des ajouts par période. Les mêmes données figurent dans le tableau ci-dessous.',
      caption: (max) => `Références ajoutées par période (maximum : ${max})`,
      rowAria: (label) => `Évolution du thème ${label}`,
      theme: 'Thème', subtheme: 'Sous-thème', total: 'Ensemble', addedRow: 'Références ajoutées',
      period: 'Période', wholePeriod: 'Toute la période',
      chip: (prefix, label) => `${prefix} : ${label}`,
      removeFilter: (prefix) => `Retirer le filtre ${prefix}`,
      keywords: 'Mots caractéristiques : ', collections: 'Collections Zotero les plus présentes : ', listSep: ' ; ',
      hintWords: 'Cliquez sur un thème, une barre ou un point d’une courbe pour afficher ici ses mots caractéristiques et le nombre de références concernées.',
      hintRefs: 'Cliquez sur un thème, une barre ou un point d’une courbe pour afficher ici les références correspondantes. ',
      hintWeb: 'Les titres suivis d’une flèche mènent à la référence en ligne.',
      hintZotero: 'Chaque titre ouvre la référence dans Zotero.',
      count: (n, refs, period, listed) => refs + (period ? ` ajoutée${n > 1 ? 's' : ''} en ${period}` : '') + (listed ? ', de la plus ancienne à la plus récente.' : '.'),
      addedOn: (date) => `ajouté le ${date}`,
      more: (left) => `Afficher 100 références de plus (${left} restantes)`,
      measure: 'Mesure', share: 'Part des ajouts', number: 'Nombre de références',
      step: 'Pas de temps', year: 'Année', halfYear: 'Semestre', quarterYear: 'Trimestre',
      bulkTitle: (threshold, days) => `Jours où au moins ${threshold} références ont été ajoutées d’un coup : ${days}`,
      bulk: (days, refs) => `Écarter les imports en masse (${days}, ${refs})`,
      lede: (library, added, first, last, themes) => `${library} : ${added} entre le ${first} et le ${last}. Chaque référence est rattachée à l’un des ${themes} thèmes calculés à partir des titres et des résumés. Lue dans l’ordre des dates d’ajout, la bibliothèque devient une archive de ce qui a retenu l’attention, année après année.`,
      method: (model, subthemes, themes) => `Méthode : les titres et résumés sont transformés en vecteurs par un modèle de langue multilingue (${model}), regroupés en ${subthemes} sous-thèmes, eux-mêmes fusionnés en ${themes} thèmes. `,
      namedByModel: (model) => `Les libellés ont été proposés par un modèle de langue exécuté en local (${model}), à partir des mots et des titres les plus caractéristiques de chaque groupe`,
      namedByWords: 'Par défaut, les libellés sont les mots qui distinguent le plus chaque groupe',
      editable: ' ; ils peuvent être remplacés dans le fichier themes.json. ',
      proposal: 'Ces regroupements sont une proposition de lecture, pas un classement définitif. ',
      generated: (date) => `Page générée le ${date} avec `,
    },
    en: {
      locale: 'en-GB', percent: '%', half: 'H', quarter: 'Q', many: (n) => n !== 1,
      title: 'Zotero as an archive',
      compTitle: 'What enters the library, period by period',
      tableToggle: 'View these data as a table',
      rowsTitle: 'The trajectory of each theme',
      rowsSub: ['Themes are ordered from the oldest to the most recent. Each row has its own vertical scale: it shows ', 'when', ' a theme occupies the library, and its peak is marked. Click a theme to unfold its sub-themes.'],
      references: 'References', selection: 'Selection',
      ref: ['reference', 'references'], added: ['reference added', 'references added'], day: ['day', 'days'],
      compShare: 'Share of each theme among the references added during the period. The grey bars above recall how many references were added: a large share of a small volume weighs little.',
      compCount: 'Number of references added during the period, split by theme.',
      compAria: 'Thematic composition of the additions by period. The same data appear in the table below.',
      caption: (max) => `References added per period (maximum: ${max})`,
      rowAria: (label) => `Trajectory of the theme ${label}`,
      theme: 'Theme', subtheme: 'Sub-theme', total: 'Total', addedRow: 'References added',
      period: 'Period', wholePeriod: 'Whole period',
      chip: (prefix, label) => `${prefix}: ${label}`,
      removeFilter: (prefix) => `Remove the ${prefix.toLowerCase()} filter`,
      keywords: 'Distinctive words: ', collections: 'Zotero collections most present: ', listSep: '; ',
      hintWords: 'Click a theme, a bar or a point on a curve to show its distinctive words and the number of references concerned.',
      hintRefs: 'Click a theme, a bar or a point on a curve to list the matching references here. ',
      hintWeb: 'Titles followed by an arrow lead to the reference online.',
      hintZotero: 'Each title opens the reference in Zotero.',
      count: (n, refs, period, listed) => refs + (period ? ` added in ${period}` : '') + (listed ? ', from the oldest addition to the most recent.' : '.'),
      addedOn: (date) => `added on ${date}`,
      more: (left) => `Show 100 more references (${left} left)`,
      measure: 'Measure', share: 'Share of additions', number: 'Number of references',
      step: 'Time step', year: 'Year', halfYear: 'Half-year', quarterYear: 'Quarter',
      bulkTitle: (threshold, days) => `Days on which at least ${threshold} references were added at once: ${days}`,
      bulk: (days, refs) => `Set aside bulk imports (${days}, ${refs})`,
      lede: (library, added, first, last, themes) => `${library}: ${added} between ${first} and ${last}. Each reference is attached to one of ${themes} themes computed from titles and abstracts. Read in the order the references were added, the library becomes an archive of what caught its owner’s attention, year after year.`,
      method: (model, subthemes, themes) => `Method: titles and abstracts are turned into vectors by a multilingual language model (${model}), grouped into ${subthemes} sub-themes, themselves merged into ${themes} themes. `,
      namedByModel: (model) => `The names were proposed by a language model run locally (${model}), from the most distinctive words and titles of each group`,
      namedByWords: 'By default, the names are the words that most distinguish each group',
      editable: '; they can be replaced in the file themes.json. ',
      proposal: 'These groupings are a proposed reading, not a definitive classification. ',
      generated: (date) => `Page generated on ${date} with `,
    },
  };
  const T = STRINGS[D.lang] || STRINGS.fr;
  const nf = new Intl.NumberFormat(T.locale);
  const nf1 = new Intl.NumberFormat(T.locale, { maximumFractionDigits: 1 });

  // DOM helpers. Text always goes through textContent: titles are untrusted data.
  function h(tag, attrs = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === false || v === undefined) continue;
      if (k === 'text') el.textContent = v;
      else if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids) if (kid !== null && kid !== undefined) el.append(kid);
    return el;
  }
  function s(tag, attrs = {}, text) {
    const el = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    if (text !== undefined) el.textContent = text;
    return el;
  }

  const color = (themeId) => `var(--s${themeId + 1})`;
  const plural = (n, [one, many]) => `${nf.format(n)} ${T.many(n) ? many : one}`;
  const pct = (v) => {
    const p = v * 100;
    return (p > 0 && p < 10 ? nf1.format(p) : nf.format(Math.round(p))) + T.percent;
  };
  const longDate = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString(T.locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const shortDate = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString(T.locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

  const ITEMS = D.items.map((a) => ({
    key: a[0], title: a[1], creators: a[2], year: a[3], type: D.types[a[4]], date: a[5],
    sub: a[6], theme: D.subthemes[a[6]].theme, bulk: a[7] === 1, link: a[8] || '',
    y: +a[5].slice(0, 4), m: +a[5].slice(5, 7),
  }));
  const Y0 = ITEMS[0].y;
  const STEPS = { year: 1, half: 2, quarter: 4 }; // periods per year
  const state = { measure: 'share', step: 'year', noBulk: false, theme: null, sub: null, period: null, shown: 100 };
  let A = null; // current aggregation
  let plots = []; // every plot shares the hover position

  const absPeriod = (it) => (it.y - Y0) * STEPS[state.step] + Math.floor((it.m - 1) / (12 / STEPS[state.step]));
  function periodLabel(p) {
    const per = STEPS[state.step], abs = A.p0 + p, year = Y0 + Math.floor(abs / per), k = abs % per;
    return per === 1 ? String(year) : per === 2 ? `${year} ${T.half}${k + 1}` : `${year} ${T.quarter}${k + 1}`;
  }

  function aggregate() {
    const p0 = absPeriod(ITEMS[0]);
    const nP = absPeriod(ITEMS[ITEMS.length - 1]) - p0 + 1;
    const zeros = () => new Array(nP).fill(0);
    const agg = { p0, nP, total: zeros(), byTheme: D.themes.map(zeros), bySub: D.subthemes.map(zeros), items: [] };
    for (const it of ITEMS) {
      if (state.noBulk && it.bulk) continue;
      const p = absPeriod(it) - p0;
      it.p = p;
      agg.items.push(it);
      agg.total[p]++; agg.byTheme[it.theme][p]++; agg.bySub[it.sub][p]++;
    }
    return agg;
  }
  const value = (counts, p) => state.measure === 'share' ? (A.total[p] ? counts[p] / A.total[p] : 0) : counts[p];
  const formatValue = (v) => state.measure === 'share' ? pct(v) : nf.format(v);

  // ----- geometry shared by all plots, so that their time axes line up -----
  function geometry(width) {
    const left = 44, right = 10;
    const band = (width - left - right) / A.nP;
    return { width, left, right, band, x: (p) => left + band * (p + 0.5) };
  }
  function niceTicks(max) {
    const raw = max / 4, mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((f) => f >= raw) || 1;
    const ticks = [];
    for (let t = 0; t < max + step - 1e-9; t += step) ticks.push(Math.round(t));
    return [...new Set(ticks)];
  }
  function yearLabels(svg, g, y) {
    const per = STEPS[state.step];
    const every = Math.max(1, Math.ceil(36 / (g.band * per)));
    for (let p = 0; p < A.nP; p++) {
      const abs = A.p0 + p;
      const year = Y0 + Math.floor(abs / per);
      // The library may start mid-year: label that first year when there is room.
      const partial = p === 0 && (per - abs % per) * g.band >= 36;
      if ((abs % per !== 0 && !partial) || year % every !== 0) continue;
      if (per === 1) {
        svg.append(s('text', { x: g.x(p), y, class: 'tick', 'text-anchor': 'middle' }, year));
      } else {
        const x = g.left + g.band * p;
        svg.append(s('line', { x1: x, x2: x, y1: y - 15, y2: y - 10, class: 'axis' }));
        svg.append(s('text', { x: x + 3, y, class: 'tick' }, year));
      }
    }
  }

  // ----- hover: one position for every plot, one tooltip listing every series -----
  function registerPlot(svg, g, opts) {
    const line = s('line', { class: 'hover', y1: opts.top, y2: opts.bottom, visibility: 'hidden' });
    svg.append(line);
    plots.push({ line, g });
    const locate = (evt) => {
      const box = svg.getBoundingClientRect();
      const px = evt.clientX - box.left, py = evt.clientY - box.top;
      if (px < g.left || px > g.width - g.right) return null;
      const p = Math.min(A.nP - 1, Math.max(0, Math.floor((px - g.left) / g.band)));
      return { p, group: opts.groupAt ? opts.groupAt(p, py) : opts.group };
    };
    svg.addEventListener('pointermove', (evt) => {
      const hit = locate(evt);
      if (!hit) return clearHover();
      for (const plot of plots) {
        plot.line.setAttribute('x1', plot.g.x(hit.p));
        plot.line.setAttribute('x2', plot.g.x(hit.p));
        plot.line.setAttribute('visibility', 'visible');
      }
      showTip(hit.p, opts.series(), hit.group, evt);
    });
    svg.addEventListener('pointerleave', clearHover);
    svg.addEventListener('click', (evt) => {
      const hit = locate(evt);
      if (hit) opts.onClick(hit.p, hit.group);
    });
  }
  function clearHover() {
    for (const plot of plots) plot.line.setAttribute('visibility', 'hidden');
    $('#za-tip').hidden = true;
  }
  const themeSeries = () => D.themes.map((t) => ({ id: t.id, label: t.label, color: color(t.id), counts: A.byTheme[t.id] }));
  const subSeries = (themeId) => () => D.themes[themeId].subs.map((id) => ({ id, label: D.subthemes[id].label, color: color(themeId), counts: A.bySub[id] }));

  function showTip(p, series, highlight, evt) {
    const tip = $('#za-tip');
    tip.textContent = '';
    tip.append(h('div', { class: 'head' }, periodLabel(p), h('span', { text: ` · ${plural(A.total[p], T.added)}` })));
    for (const sr of series) {
      const share = A.total[p] ? sr.counts[p] / A.total[p] : 0;
      const main = state.measure === 'share' ? pct(share) : nf.format(sr.counts[p]);
      const other = state.measure === 'share' ? nf.format(sr.counts[p]) : pct(share);
      const key = h('span', { class: 'key' });
      key.style.background = sr.color;
      const cls = 'line' + (sr.id === highlight ? ' on' : '') + (sr.counts[p] === 0 ? ' off' : '');
      tip.append(h('div', { class: cls }, key, h('span', { class: 'v', text: main }), h('span', { class: 'l', text: `${sr.label} (${other})` })));
    }
    tip.hidden = false;
    const box = tip.getBoundingClientRect();
    let x = evt.clientX + 16, y = evt.clientY + 14;
    if (x + box.width > innerWidth - 8) x = evt.clientX - box.width - 16;
    if (y + box.height > innerHeight - 8) y = Math.max(8, innerHeight - box.height - 8);
    tip.style.left = Math.max(8, x) + 'px';
    tip.style.top = y + 'px';
  }

  // ----- selection -----
  function select(patch, reveal) {
    Object.assign(state, patch);
    state.shown = 100;
    render();
    if (reveal) $('#za-refs-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function toggleTheme(id) {
    select(state.theme === id && state.sub === null ? { theme: null, sub: null } : { theme: id, sub: null });
  }
  function labelButton(group, themeId, n, isSub, pressed, onClick) {
    const sw = h('span', { class: 'sw' });
    sw.style.background = color(themeId);
    const onDblClick = options.onRename ? () => options.onRename(isSub ? 'sub' : 'theme', group.id, group.label) : null;
    return h('button', { class: 'rowlabel' + (isSub ? ' sub' : ''), type: 'button', 'aria-pressed': String(pressed), title: group.keywords.join(', '), onclick: onClick, ondblclick: onDblClick },
      sw, h('span', { class: 'name', text: group.label }), h('span', { class: 'n', text: plural(n, T.ref) }));
  }
  const sum = (arr) => arr.reduce((a, b) => a + b, 0);

  // ----- chart 1: composition of each period (stacked columns) -----
  function renderComposition() {
    const share = state.measure === 'share';
    $('#za-comp-sub').textContent = share ? T.compShare : T.compCount;

    const legend = $('#za-legend');
    legend.textContent = '';
    legend.classList.toggle('spaced', share);
    for (const t of D.themes) {
      legend.append(h('li', {}, labelButton(t, t.id, sum(A.byTheme[t.id]), false, state.theme === t.id, () => toggleTheme(t.id))));
    }

    const host = $('#za-comp-plot');
    host.textContent = '';
    const g = geometry(host.clientWidth);
    const stripH = share ? 40 : 0, top = share ? 74 : 8, plotH = 280, H = top + plotH + 24;
    const svg = s('svg', { width: g.width, height: H, viewBox: `0 0 ${g.width} ${H}`, role: 'img', 'aria-label': T.compAria });
    const maxTotal = Math.max(...A.total, 1);
    const ticks = share ? [0, 0.25, 0.5, 0.75, 1] : niceTicks(maxTotal);
    const yMax = ticks[ticks.length - 1];
    const y = (v) => top + plotH - plotH * (v / yMax);
    const barW = Math.max(2, Math.min(24, g.band * 0.72));

    if (state.period !== null) {
      svg.append(s('rect', { class: 'band', x: g.left + g.band * state.period, y: top - 4, width: g.band, height: plotH + 8, rx: 3 }));
    }
    for (const t of ticks) {
      svg.append(s('line', { x1: g.left, x2: g.width - g.right, y1: y(t), y2: y(t), class: t === 0 ? 'axis' : 'grid' }));
      svg.append(s('text', { x: g.left - 8, y: y(t) + 4, class: 'tick', 'text-anchor': 'end' }, share ? pct(t) : nf.format(t)));
    }
    if (share) {
      svg.append(s('text', { x: g.left, y: 10, class: 'caption' }, T.caption(nf.format(maxTotal))));
      const base = 16 + stripH;
      svg.append(s('line', { x1: g.left, x2: g.width - g.right, y1: base, y2: base, class: 'axis' }));
      for (let p = 0; p < A.nP; p++) {
        if (!A.total[p]) continue;
        const hgt = Math.max(1, stripH * A.total[p] / maxTotal);
        svg.append(s('rect', { class: 'volume', x: g.x(p) - barW / 2, y: base - hgt, width: barW, height: hgt }));
      }
    }

    // Oldest theme on top, newest on the baseline: same order as the legend.
    const order = D.themes.map((t) => t.id).reverse();
    const stacks = [];
    for (let p = 0; p < A.nP; p++) {
      const segments = [];
      let acc = 0;
      for (const t of order) {
        const v = value(A.byTheme[t], p);
        if (v > 0) { segments.push({ t, y0: y(acc), y1: y(acc + v) }); acc += v; }
      }
      stacks.push(segments);
      segments.forEach((sg, i) => {
        // A 2px gap in the surface colour separates segments; no outlines.
        const hgt = Math.max(1, sg.y0 - sg.y1 - (i === 0 ? 0 : 2));
        const x = g.x(p) - barW / 2;
        let mark;
        if (i === segments.length - 1) {
          const r = Math.min(4, barW / 2, hgt);
          mark = s('path', { d: `M${x},${sg.y1 + hgt}V${sg.y1 + r}Q${x},${sg.y1} ${x + r},${sg.y1}H${x + barW - r}Q${x + barW},${sg.y1} ${x + barW},${sg.y1 + r}V${sg.y1 + hgt}Z` });
        } else {
          mark = s('rect', { x, y: sg.y1, width: barW, height: hgt });
        }
        mark.style.fill = color(sg.t);
        if (state.theme !== null && state.theme !== sg.t) mark.classList.add('dim');
        svg.append(mark);
      });
    }
    yearLabels(svg, g, H - 6);
    host.append(svg);
    registerPlot(svg, g, {
      top: top - 4, bottom: top + plotH,
      series: themeSeries,
      groupAt: (p, py) => { const hit = stacks[p].find((sg) => py >= sg.y1 && py <= sg.y0); return hit ? hit.t : null; },
      onClick: (p, themeId) => {
        if (themeId === null) return select({ period: state.period === p ? null : p }, true);
        const same = state.period === p && state.theme === themeId && state.sub === null;
        select(same ? { period: null } : { period: p, theme: themeId, sub: null }, true);
      },
    });
  }

  // ----- chart 2: one row per theme (small multiples), sub-themes on demand -----
  function renderRows() {
    const host = $('#za-rows');
    host.textContent = '';
    const width = $('#za-comp-plot').clientWidth;
    for (const t of D.themes) {
      host.append(row(t, t.id, A.byTheme[t.id], false, width));
      if (state.theme === t.id) {
        for (const id of t.subs) host.append(row(D.subthemes[id], t.id, A.bySub[id], true, width));
      }
    }
  }
  function row(group, themeId, counts, isSub, width) {
    const pressed = isSub ? state.sub === group.id : state.theme === group.id && state.sub === null;
    const onLabel = isSub
      ? () => select({ sub: state.sub === group.id ? null : group.id })
      : () => toggleTheme(group.id);
    const plot = h('div', { class: 'plot' });
    const el = h('div', { class: 'fig row' + (isSub ? ' subrow' : '') },
      h('div', { class: 'gutter' }, labelButton(group, themeId, sum(counts), isSub, pressed, onLabel)), plot);

    const g = geometry(width);
    const H = isSub ? 42 : 54, top = 17, bottom = H - 4;
    const svg = s('svg', { width: g.width, height: H, viewBox: `0 0 ${g.width} ${H}`, role: 'img', 'aria-label': T.rowAria(group.label) });
    const values = counts.map((_, p) => value(counts, p));
    const max = Math.max(...values);
    const y = (v) => bottom - (bottom - top) * (max ? v / max : 0);
    svg.append(s('line', { x1: g.left, x2: g.width - g.right, y1: bottom, y2: bottom, class: 'axis' }));
    if (max > 0) {
      const points = values.map((v, p) => `${g.x(p).toFixed(1)},${y(v).toFixed(1)}`);
      const area = s('path', { d: `M${g.x(0)},${bottom}L${points.join('L')}L${g.x(A.nP - 1)},${bottom}Z`, opacity: 0.12 });
      area.style.fill = color(themeId);
      const line = s('path', { d: 'M' + points.join('L'), fill: 'none', 'stroke-width': isSub ? 1.5 : 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
      line.style.stroke = color(themeId);
      svg.append(area, line);
      // Direct label on the peak only: when the theme mattered most.
      const peak = values.indexOf(max);
      const dot = s('circle', { cx: g.x(peak), cy: y(max), r: 4, 'stroke-width': 2 });
      dot.style.fill = color(themeId);
      dot.style.stroke = 'var(--surface)';
      const px = g.x(peak);
      const anchor = px < g.left + 60 ? 'start' : px > g.width - 70 ? 'end' : 'middle';
      svg.append(dot, s('text', { x: px, y: 9, class: 'peak', 'text-anchor': anchor }, `${formatValue(max)} · ${periodLabel(peak)}`));
    }
    plot.append(svg);
    registerPlot(svg, g, {
      top: 12, bottom, group: group.id,
      series: isSub ? subSeries(themeId) : themeSeries,
      onClick: (p) => select(isSub ? { period: p, sub: group.id } : { period: p, theme: group.id, sub: null }, true),
    });
    return el;
  }

  // ----- table twin of chart 1 -----
  function renderTable() {
    const table = h('table');
    const head = h('tr', {}, h('th', { text: T.theme }));
    for (let p = 0; p < A.nP; p++) head.append(h('th', { text: periodLabel(p) }));
    head.append(h('th', { text: T.total }));
    table.append(h('thead', {}, head));
    const body = h('tbody');
    const all = sum(A.total);
    for (const t of D.themes) {
      const tr = h('tr', {}, h('td', { text: t.label }));
      for (let p = 0; p < A.nP; p++) tr.append(h('td', { text: A.total[p] ? formatValue(value(A.byTheme[t.id], p)) : '–' }));
      const n = sum(A.byTheme[t.id]);
      tr.append(h('td', { text: state.measure === 'share' ? pct(all ? n / all : 0) : nf.format(n) }));
      body.append(tr);
    }
    const tr = h('tr', {}, h('td', { text: T.addedRow }));
    for (let p = 0; p < A.nP; p++) tr.append(h('td', { text: nf.format(A.total[p]) }));
    tr.append(h('td', { text: nf.format(all) }));
    body.append(tr);
    table.append(body);
    $('#za-table').replaceChildren(table);
  }

  // ----- references matching the selection -----
  function chip(prefix, label, swatch, onClear) {
    const el = h('span', { class: 'chip' });
    if (swatch) { const sw = h('span', { class: 'sw' }); sw.style.background = swatch; el.append(sw); }
    el.append(h('span', { text: T.chip(prefix, label) }), h('button', { type: 'button', 'aria-label': T.removeFilter(prefix), text: '✕', onclick: onClear }));
    return el;
  }
  function renderRefs() {
    const sel = $('#za-selection');
    sel.textContent = '';
    const periods = [['', T.wholePeriod]];
    for (let p = 0; p < A.nP; p++) periods.push([String(p), periodLabel(p)]);
    const chosen = state.period === null ? '' : String(state.period);
    const onPeriod = (value) => select({ period: value === '' ? null : +value });
    let picker;
    if (options.select) {
      // The host brings its own control: a privileged window cannot show native <select> popups.
      picker = options.select(periods, chosen, onPeriod, T.period);
    } else {
      picker = h('select', { 'aria-label': T.period, onchange: (e) => onPeriod(e.target.value) });
      for (const [value, label] of periods) picker.append(h('option', { value, text: label, selected: value === chosen }));
    }
    sel.append(picker);
    if (state.theme !== null) sel.append(chip(T.theme, D.themes[state.theme].label, color(state.theme), () => select({ theme: null, sub: null })));
    if (state.sub !== null) sel.append(chip(T.subtheme, D.subthemes[state.sub].label, null, () => select({ sub: null })));

    const info = $('#za-info');
    info.textContent = '';
    const group = state.sub !== null ? D.subthemes[state.sub] : state.theme !== null ? D.themes[state.theme] : null;
    info.hidden = !group;
    if (group) {
      info.append(h('b', { text: T.keywords }), group.keywords.join(', ') + '.');
      if (group.collections.length) {
        info.append(' ', h('b', { text: T.collections }), group.collections.map(([name, n]) => `${name} (${nf.format(n)})`).join(T.listSep) + '.');
      }
    }

    const list = $('#za-refs'), count = $('#za-count'), more = $('#za-more');
    list.textContent = '';
    more.hidden = true;
    if (state.theme === null && state.period === null) {
      count.textContent = '';
      const hint = !D.references ? T.hintWords : T.hintRefs + (D.web ? T.hintWeb : T.hintZotero);
      list.append(h('li', { class: 'hint', text: hint }));
      return;
    }
    const matches = A.items.filter((it) =>
      (state.theme === null || it.theme === state.theme) &&
      (state.sub === null || it.sub === state.sub) &&
      (state.period === null || it.p === state.period));
    count.textContent = T.count(matches.length, plural(matches.length, T.ref), state.period !== null ? periodLabel(state.period) : null, D.references);
    if (!D.references) return; // the public page may leave individual references out
    for (const it of matches.slice(0, state.shown)) {
      const meta = h('div', { class: 'meta' });
      const bits = [it.creators, it.year, D.typeLabels[it.type] || it.type, T.addedOn(shortDate(it.date))].filter(Boolean);
      meta.append(h('span', { text: bits.join(' · ') }));
      if (state.sub === null) {
        const dot = h('span', { class: 'dot' });
        dot.style.background = color(it.theme);
        meta.append(h('span', {}, dot, state.theme === null ? D.themes[it.theme].label : D.subthemes[it.sub].label));
      }
      // Private page: open the item in Zotero. Web page: its DOI or address, when known.
      const href = D.web ? it.link : D.linkPrefix + it.key;
      let title;
      if (!D.web && options.onOpen) {
        // Inside the plugin: hand the reference to Zotero's main window.
        title = h('a', { href: '#', text: it.title, onclick: (e) => { e.preventDefault(); options.onOpen(it.key); } });
      } else {
        title = !href ? h('span', { class: 'title', text: it.title })
          : h('a', { href, text: it.title, target: D.web ? '_blank' : null, rel: D.web ? 'noopener' : null });
      }
      list.append(h('li', {}, title, meta));
    }
    more.hidden = matches.length <= state.shown;
    more.textContent = T.more(nf.format(matches.length - state.shown));
  }

  // ----- filters -----
  function segmented(legendText, name, options) {
    const opts = h('span', { class: 'opts' });
    for (const [val, label] of options) {
      opts.append(h('label', {},
        h('input', { type: 'radio', name, value: val, checked: state[name] === val, onchange: () => select({ [name]: val, period: name === 'step' ? null : state.period }) }),
        h('span', { text: label })));
    }
    return h('fieldset', { class: 'seg' }, h('legend', { text: legendText }), opts);
  }
  function renderFilters() {
    const filters = $('#za-filters');
    filters.append(
      segmented(T.measure, 'measure', [['share', T.share], ['count', T.number]]),
      segmented(T.step, 'step', [['year', T.year], ['half', T.halfYear], ['quarter', T.quarterYear]]));
    if (D.bulkDays.length) {
      const n = sum(D.bulkDays.map((d) => d[1]));
      const days = D.bulkDays.map(([day, k]) => `${shortDate(day)} (${nf.format(k)})`).join(', ');
      filters.append(h('label', { class: 'check', title: T.bulkTitle(D.bulkThreshold, days) },
        h('input', { type: 'checkbox', onchange: (e) => select({ noBulk: e.target.checked }) }),
        h('span', { text: T.bulk(plural(D.bulkDays.length, T.day), plural(n, T.ref)) })));
    }
  }

  function render() {
    plots = [];
    clearHover();
    A = aggregate();
    renderComposition();
    renderRows();
    renderTable();
    renderRefs();
  }

  // Fixed texts of the markup. The standalone page owns its title; a fragment
  // inserted in another site leaves that site's title alone.
  for (const el of root.querySelectorAll('[data-t]')) el.textContent = T[el.dataset.t];
  $('#za-rows-sub').append(T.rowsSub[0], h('em', { text: T.rowsSub[1] }), T.rowsSub[2]);
  $('#za-refs-title').textContent = D.references ? T.references : T.selection;
  if (!D.fragment) document.title = `${T.title} – ${D.library}`;
  $('#za-lede').textContent = T.lede(D.library, plural(ITEMS.length, T.added), longDate(ITEMS[0].date), longDate(ITEMS[ITEMS.length - 1].date), D.themes.length);
  $('#za-method').textContent = T.method(D.model, D.subthemes.length, D.themes.length)
    + (D.labelModel ? T.namedByModel(D.labelModel) : T.namedByWords)
    + (D.web ? '. ' : options.editableHint || T.editable)
    + T.proposal
    + T.generated(longDate(D.generated));
  $('#za-method').append(h('a', { href: D.project, text: 'zotero-as-your-archive' }), '.');
  renderFilters();
  $('#za-more').addEventListener('click', () => { state.shown += 100; renderRefs(); });
  render();
  let timer = null;
  const onResize = () => { clearTimeout(timer); timer = setTimeout(render, 120); };
  window.addEventListener('resize', onResize);
  return {
    render,
    destroy() {
      window.removeEventListener('resize', onResize);
      clearTimeout(timer);
    },
  };
}

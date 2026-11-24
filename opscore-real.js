// ============================================================================
// DATA REAL POR CADENA (sell-out de cada cadena: lo vendido por marca y referencia en cada tienda)
// La carga el coordinador (y gerente/admin) en Cargar datos. Alkosto y Ktronix son la misma cadena (Corbeta):
// se cargan en un solo archivo y la app reparte cada fila a su tienda (en la app siguen siendo dos cadenas).
// Solo la ven los líderes (supervisor, formador, coordinador, gerente, admin); las tiendas nunca.
// Con ella sale:
//   · Share real, participación y puesto de Infinix por tienda, cadena, zona y regional (con filtros y tarjeta).
//   · Infinix vs. competencia: referencias más vendidas por marca y por tienda, y focos de ataque para los planes.
//   · Alertas cuando el reporte del asesor (cierre diario) no coincide con la venta real.
// Guardado: colección zone_data, documento real_<cadena>_<AAAA-MM> (nacional, igual para todos).
// ============================================================================

const REAL_CHAINS = [['exito', 'Éxito'], ['corbeta', 'Alkosto + Ktronix'], ['falabella', 'Falabella'], ['cencosud', 'Cencosud'], ['wom', 'WOM'], ['olimpica', 'Olímpica']];
const REAL_POOL = { corbeta: ['alkosto', 'ktronix'] };
const realChainLogo = (k, l, cls) => k === 'corbeta' ? `<span class="row" style="gap:4px;flex-wrap:nowrap">${chainLogo('alkosto', 'Alkosto', cls)}${chainLogo('ktronix', 'Ktronix', cls)}</span>` : chainLogo(k, l, cls);

const RealData = (() => {
    const N = s => Match.N(s);
    const brandOf = v => {
        const n = N(v); if (!n) return '';
        if (/IPHONE|APPLE/.test(n)) return 'APPLE';
        if (/REDMI|POCO|XIAOMI/.test(n)) return 'XIAOMI';
        if (/GALAXY|SAMSUNG/.test(n)) return 'SAMSUNG';
        if (/INFINIX|\bHOT \d+|\bSMART \d+|\bNOTE \d+|\bNOTE EDGE|\bGT \d+|\bZERO \d+/.test(n)) return 'INFINIX';
        if (/\bMOTO\b|MOTOROLA|MOTO G|MOTO E|\bEDGE \d+/.test(n)) return 'MOTOROLA';
        if (/CAMON|SPARK|POVA|TECNO/.test(n)) return 'TECNO';
        return BRANDS.find(b => n.includes(b)) || 'OTROS';
    };
    // Nombre corto de la referencia: sin marca, memoria, color ni palabras de relleno ("GALAXY A16 128GB NEGRO" → "GALAXY A16")
    const COLORS = /\b(NEGRO|NEGRA|BLANCO|BLANCA|AZUL|VERDE|ROJO|ROJA|GRIS|DORADO|DORADA|PLATEADO|PLATEADA|MORADO|LILA|ROSADO|ROSA|PURPURA|VIOLETA|CELESTE|PLATA|ORO|GRAFITO|TITANIO|NARANJA|AMARILLO|BLACK|WHITE|BLUE|GREEN|GOLD|SILVER|PURPLE|GRAY|GREY|MINT|CYAN|OCEAN|SKY|MIDNIGHT|STARLIGHT|BEIGE|COBRE)\b.*$/;
    function refName(t, marca) {
        let n = N(t).replace(/\b(CELULAR|CELULARES|SMARTPHONE|TELEFONO|MOVIL|EQUIPO|LIBRE|DUAL SIM|DUALSIM|DS|CEL|KIT|PREPAGO|POSPAGO)\b/g, ' ');
        n = n.replace(/\b\d+\s*(GB|TB|G|MB|RAM|ROM)\b.*$/, '').replace(/\b\d+\s*\+\s*\d+.*$/, '').replace(/\b\d+\s*\/\s*\d+.*$/, '').replace(COLORS, '');
        n = n.replace(new RegExp('\\b(' + BRANDS.concat(['APPLE', 'MOTOROLA']).join('|') + ')\\b', 'g'), ' ').replace(/\s+/g, ' ').trim();
        return n.split(' ').filter(Boolean).slice(0, 4).join(' ') || (marca || 'OTROS');
    };
    const isBrandHeader = h => { const n = N(h); return !!n && (BRANDS.some(b => n === b || n.startsWith(b + ' ')) || /^IPHONE|^APPLE|^REDMI|^OTROS|^OTRAS/.test(n)); };
    // Lee el archivo: formato largo (tienda, marca y/o modelo, unidades) o ancho (tienda + una columna por marca)
    function parse(sheets, chainKey) {
        const sh = sheets.slice().sort((a, b) => b.rows.length - a.rows.length)[0]; if (!sh) throw new Error('El archivo no tiene datos.');
        let hi = -1;
        for (let i = 0; i < Math.min(25, sh.rows.length); i++) {
            const H = (sh.rows[i] || []).map(N);
            const store = H.some(h => /TIENDA|ALMACEN|PDV|PUNTO|SUCURSAL|LOCAL|NOMBRE TIENDA|STORE/.test(h));
            if (store && (H.some(h => /MARCA|BRAND|FABRICANTE|MODELO|REFERENCIA|DESCRIPCION|PRODUCTO|ARTICULO|MATERIAL/.test(h)) || H.filter((h, j) => isBrandHeader(sh.rows[i][j])).length >= 3)) { hi = i; break; }
        }
        if (hi < 0) throw new Error('No encontré la tabla: debe tener una columna de tienda y una de marca o modelo (o una columna por marca) con las unidades.');
        const raw = sh.rows[hi], H = raw.map(N);
        const col = re => H.findIndex(h => re.test(h));
        const cS = col(/NOMBRE TIENDA|TIENDA|ALMACEN|PDV|PUNTO DE VENTA|SUCURSAL|LOCAL|STORE/), cB = col(/^MARCA|BRAND|FABRICANTE/);
        const cM = col(/MODELO|REFERENCIA|DESCRIPCION|DESC ARTICULO|PRODUCTO|ARTICULO|MATERIAL|SKU|ITEM/);
        const cQ = col(/UNIDADES|CANTIDAD|UND|UDS|QTY|PIEZAS|VENTA UN|SELL OUT|SELLOUT/), cD = col(/FECHA|DATE|DIA$/), cC = col(/CATEGORIA|CATEGORY|LINEA|FAMILIA|SUBCATEGORIA/);
        const wide = cB < 0 && cM < 0 ? raw.map((h, j) => isBrandHeader(h) ? [j, brandOf(h)] : null).filter(Boolean) : [];
        const rows = [];
        for (let i = hi + 1; i < sh.rows.length; i++) {
            const r = sh.rows[i] || [], tienda = String(r[cS] ?? '').trim();
            if (!tienda || /^TOTAL|GRAN TOTAL/.test(N(tienda))) continue;
            if (cC >= 0 && r[cC] && !/CEL|SMART|MOVIL|TELEF|PHONE|TELEFONIA|EQUIPO/.test(N(r[cC]))) continue;      // solo celulares
            const fecha = cD >= 0 ? XL.iso(r[cD]) : '';
            if (wide.length) wide.forEach(([j, b]) => { const q = Math.round(XL.num(r[j])); if (q) rows.push({ tienda, marca: b, q, fecha }); });
            else {
                const q = cQ >= 0 ? Math.round(XL.num(r[cQ])) : 1; if (!q) continue;
                const mod = cM >= 0 ? String(r[cM] ?? '').trim() : '', marca = cB >= 0 && String(r[cB] ?? '').trim() ? brandOf(r[cB]) : brandOf(mod);
                rows.push({ tienda, marca, q, fecha, ref: mod ? refName(mod, marca) : '' });
            }
        }
        if (!rows.length) throw new Error('No encontré unidades en el archivo.');
        const fechas = rows.map(r => r.fecha).filter(Boolean).sort();
        return { chain: chainKey, sheet: sh.name, rows, desde: fechas[0] || '', hasta: fechas[fechas.length - 1] || '', formato: wide.length ? 'columnas por marca' : cM >= 0 ? 'filas por modelo' : 'filas por marca', conRef: rows.some(r => r.ref) };
    }
    function match(P) {
        const hint = { exito: 'EXITO', falabella: 'FALABELLA', cencosud: 'CENCOSUD', wom: 'WOM', olimpica: 'OLIMPICA' }[P.chain] || '';
        const keys = REAL_POOL[P.chain] || (['alkosto', 'ktronix'].includes(P.chain) ? REAL_POOL.corbeta : [P.chain]);
        const pool = State.stores.filter(s => keys.includes(normLogoKey(s.logoKey)));
        const cache = {}, stores = {}, refs = {}, unm = {};
        P.rows.forEach(r => {
            const k = N(r.tienda); if (!(k in cache)) cache[k] = Match.store(r.tienda, { cadena: hint, zona: '', stores: pool.length ? pool : State.stores });
            const st = cache[k];
            if (!st) { unm[r.tienda] = (unm[r.tienda] || 0) + r.q; return; }
            const S = stores[st.id] = stores[st.id] || {}; S[r.marca] = (S[r.marca] || 0) + r.q;
            if (r.ref) { const R = refs[st.id] = refs[st.id] || {}, rk = `${r.marca}|${r.ref}`; R[rk] = (R[rk] || 0) + r.q; }
        });
        P.stores = stores; P.refs = refs; P.unmatched = unm;
        return P;
    }
    const docId = (chain, ym) => `real_${chain}_${ym}`;
    let cache = {}, loaded = {};
    async function save(P, month, desde, hasta, fileName) {
        const s = State.session || {};
        // Las referencias de cada tienda se recortan a las 60 más vendidas (cabe en un documento)
        const refs = {}; Object.entries(P.refs || {}).forEach(([id, R]) => { refs[id] = Object.fromEntries(Object.entries(R).sort((a, b) => b[1] - a[1]).slice(0, 60)); });
        const doc = { id: docId(P.chain, month), kind: 'real', chain: P.chain, month, desde: desde || P.desde || month + '-01', hasta: hasta || P.hasta || todayStr(), file: fileName, by: s.nombre || '', at: Date.now(), stores: P.stores, refs, unmatched: P.unmatched };
        cache[doc.id] = doc;
        // La carga unificada de Corbeta reemplaza las que se hubieran hecho por separado (Alkosto o Ktronix) ese mes
        if (P.chain === 'corbeta') ['alkosto', 'ktronix'].forEach(k => { const id = docId(k, month); if (cache[id]) { delete cache[id]; Data.del(COL.zoneData, id).catch(() => { }); } });
        return Data.set(COL.zoneData, doc.id, doc, false);
    }
    async function load(month) {
        month = month || todayStr().slice(0, 7);
        const docs = (await Data.list(COL.zoneData, [['kind', '==', 'real'], ['month', '==', month]]).catch(() => [])) || [];
        docs.forEach(d => { cache[d.id] = d; }); loaded[month] = Date.now();
        return docs;
    }
    const ensure = async month => { month = month || todayStr().slice(0, 7); if (!loaded[month] || Date.now() - loaded[month] > 120000) await load(month).catch(() => { }); };
    const docsFor = month => Object.values(cache).filter(d => d.kind === 'real' && d.month === month);
    // Venta real de una tienda (por marca y referencia) en el mes, o null si no hay data real de su cadena
    function forStore(st, month) {
        month = month || todayStr().slice(0, 7);
        const D = docsFor(month).filter(d => d.stores && d.stores[st.id]).sort((a, b) => (b.at || 0) - (a.at || 0))[0];
        return D ? { marcas: D.stores[st.id], refs: (D.refs || {})[st.id] || {}, desde: D.desde, hasta: D.hasta, file: D.file, by: D.by, at: D.at, chain: D.chain } : null;
    }
    // Share, participación y puesto: data real primero; si no hay, el reporte de los asesores (cierres)
    function shareOf(marcas) {
        const tot = sum(Object.values(marcas || {})), inf = int((marcas || {}).INFINIX);
        const rank = Object.entries(marcas || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
        const pos = inf > 0 ? rank.findIndex(([b]) => b === 'INFINIX') + 1 : null;
        return { tot, inf, share: tot ? inf / tot : null, pos, rank };
    }
    return { parse, match, save, load, ensure, forStore, shareOf, docsFor, brandOf, refName };
})();

// Lo que más vende cada marca en una tienda (data real): para comparativos, role play y focos de ataque
function versusFor(st, month) {
    if (!st || typeof RealData === 'undefined') return null;
    const R = RealData.forStore(st, month); if (!R) return null;
    const refs = Object.entries(R.refs || {}).map(([k, q]) => { const [marca, ref] = k.split('|'); return { marca, ref, q }; }).sort((a, b) => b.q - a.q);
    const S = RealData.shareOf(R.marcas);
    return { comp: refs.filter(r => r.marca !== 'INFINIX'), inf: refs.filter(r => r.marca === 'INFINIX'), lider: S.rank[0] ? S.rank[0][0] : '', S, desde: R.desde, hasta: R.hasta };
}

// Compara la data real con lo que reportaron los asesores en los cierres del mismo periodo
async function realVsReporte(stores, month) {
    await RealData.load(month);
    const keys = [...new Set(stores.map(s => `${s.id}_${month}`))];
    let cl = [];
    for (let i = 0; i < keys.length; i += 10) cl = cl.concat(await Data.list(COL.closures, [['storeMonth', 'in', keys.slice(i, i + 10)]]).catch(() => []));
    return stores.map(st => {
        const R = RealData.forStore(st, month);
        const mine = cl.filter(c => c.storeId === st.id && (!R || ((!R.desde || c.fecha >= R.desde) && (!R.hasta || c.fecha <= R.hasta))));
        const rep = {}; mine.forEach(c => { rep.INFINIX = (rep.INFINIX || 0) + closureInfinix(c); Object.entries(c.competencia || {}).forEach(([b, v]) => { rep[b] = (rep[b] || 0) + int(v); }); });
        const real = R ? RealData.shareOf(R.marcas) : null, rp = mine.length ? RealData.shareOf(rep) : null;
        let alerta = '';
        if (real && !rp) alerta = 'Sin reporte de cierres en el periodo';
        else if (real && rp) {
            const dInf = rp.inf - real.inf, dShare = real.share != null && rp.share != null ? (rp.share - real.share) * 100 : 0, dTot = rp.tot - real.tot;
            if (Math.abs(dInf) >= 3 && Math.abs(dInf) / Math.max(1, real.inf) >= .15) alerta = `Infinix reportado ${rp.inf} vs. real ${real.inf} (${dInf > 0 ? '+' : ''}${dInf})`;
            else if (Math.abs(dShare) >= 10) alerta = `Share reportado ${Math.round(rp.share * 100)}% vs. real ${Math.round(real.share * 100)}%`;
            else if (Math.abs(dTot) >= 10 && Math.abs(dTot) / Math.max(1, real.tot) >= .3) alerta = `Venta de la tienda reportada ${rp.tot} vs. real ${real.tot}`;
        }
        return { st, R, real, rep: rp, cierres: mine.length, alerta, fuente: real ? 'real' : rp ? 'cierres' : '' };
    });
}

// ---------- Sección en Cargar datos (coordinador, gerente, admin) ----------
function realUploadHTML() {
    const month = todayStr().slice(0, 7), docs = RealData.docsFor(month);
    const docOf = k => docs.find(x => x.chain === k) || (k === 'corbeta' ? docs.find(x => x.chain === 'alkosto' || x.chain === 'ktronix') : null);
    return `<section class="card up-card" id="up-real">
        <div class="up-h"><span class="up-ico">🏬</span><div><h3 class="h3">Data real por cadena · sell-out</h3><p class="mute">Lo que vendió cada marca (y cada referencia, si el archivo trae el modelo) en cada tienda según la cadena. Con esto salen el share real, la participación y el puesto de Infinix, las referencias que más vende la competencia y las alertas cuando el reporte del asesor no coincide. <b>Alkosto y Ktronix van en un solo archivo (Corbeta):</b> la app reparte cada tienda a su cadena. Solo la ven los líderes.</p></div></div>
        <div class="up-real-grid">${REAL_CHAINS.map(([k, l]) => { const d = docOf(k); return `<div class="up-real ${d ? 'on' : ''}"><div class="row between"><span>${realChainLogo(k, l, 'sm')}</span>${d ? `<i class="pill ok">✓ ${Object.keys(d.stores || {}).length} PDV</i>` : '<i class="pill">Sin cargar</i>'}</div>
            <small class="mute">${d ? `${esc(d.desde)} a ${esc(d.hasta)} · ${esc(d.by || '')}${d.refs && Object.keys(d.refs).length ? ' · con referencias' : ''}` : esc(l) + ' · mes en curso'}</small>
            <label class="btn btn-ghost sm">📂 ${d ? 'Reemplazar' : 'Cargar'}<input type="file" data-real="${k}" accept=".xlsx,.xls,.csv" hidden></label></div>`; }).join('')}</div>
        <div id="up-real-out"></div></section>`;
}
async function onRealFile(chain, file, after) {
    const out = $('#up-real-out'); if (!out || !file) return;
    out.innerHTML = '<p class="hint">Leyendo el archivo…</p>';
    try {
        let sheets;
        if (/\.(csv|txt)$/i.test(file.name)) { const P0 = await ZoneData.readFile(file); sheets = [{ name: 'csv', rows: [P0.headers].concat(P0.rows) }]; }
        else sheets = await XL.sheets(file);
        const P = RealData.match(RealData.parse(sheets, chain));
        const tot = sum(P.rows.map(r => r.q)), unm = Object.entries(P.unmatched || {});
        const inf = sum(Object.values(P.stores).map(s => int(s.INFINIX))), all = sum(Object.values(P.stores).map(s => sum(Object.values(s))));
        const month = todayStr().slice(0, 7);
        const porCadena = chain === 'corbeta' ? ['alkosto', 'ktronix'].map(k => `${CHAINS[k].name} ${Object.keys(P.stores).filter(id => normLogoKey((storeById(id) || {}).logoKey) === k).length}`).join(' · ') : '';
        out.innerHTML = `<div class="up-sum"><b>${esc((REAL_CHAINS.find(c => c[0] === chain) || [])[1])}</b> · ${P.rows.length} filas (${esc(P.formato)}) · ${tot} uds · <b>${Object.keys(P.stores).length}</b> PDV cruzados${porCadena ? ` (${esc(porCadena)})` : ''} · share Infinix <b>${all ? Math.round(inf / all * 100) : 0}%</b>${P.conRef ? ' · con referencias ✓' : ' · <span class="warn-t">sin columna de modelo (no habrá ranking de referencias)</span>'}${unm.length ? ` · <b class="warn-t">${unm.length} tiendas sin cruzar</b>` : ''}</div>
            ${unm.length ? `<p class="hint">Sin cruzar: ${unm.slice(0, 12).map(([t, q]) => esc(t) + ' (' + q + ')').join(', ')}${unm.length > 12 ? '…' : ''}</p>` : ''}
            <div class="row wrap end" style="gap:8px"><label class="lbl" style="margin:0">Periodo</label><input type="date" class="input" id="rl-d" value="${P.desde || month + '-01'}"><span>a</span><input type="date" class="input" id="rl-h" value="${P.hasta || todayStr()}">
            <button class="btn btn-primary" id="rl-ok">✅ Guardar data real</button></div>`;
        $('#rl-ok').onclick = async e => {
            if (!canWrite()) return; busy(e.currentTarget, true);
            try { await RealData.save(P, month, $('#rl-d').value, $('#rl-h').value, file.name); toast('Data real guardada: ya la ven todos los líderes', 'ok'); if (after) after(); } finally { busy(e.currentTarget, false); }
        };
    } catch (e) { console.error(e); out.innerHTML = `<p class="err">${esc(e.message || e)}</p>`; }
}

// ---------- Explorador de share real y de Infinix vs. competencia (Análisis de zona) ----------
// Filtros en cascada (regional → zona → cadena → tienda) y nivel de agrupación (tienda, cadena, zona, regional).
const RS = { regional: '', zona: '', cadena: '', tienda: '', nivel: 'tienda', cache: null, src: 'real', wk: '' };
const rsPc = v => v == null ? '—' : Math.round(v * 100) + '%';
function rsScope(L) {
    return L.filter(x => (!RS.regional || zoneRegional(x.st.zona) === RS.regional) && (!RS.zona || x.st.zona === RS.zona) && (!RS.cadena || chainGroup(x.st).key === RS.cadena) && (!RS.tienda || x.st.id === RS.tienda));
}
const rsLabel = (base) => [RS.tienda ? (storeById(RS.tienda) || {}).tienda : '', RS.cadena && !RS.tienda ? chainGroupLabel(RS.cadena) : '', RS.zona ? 'Zona ' + RS.zona : '', RS.regional && !RS.zona ? 'Regional ' + RS.regional : ''].filter(Boolean).join(' · ') || base;
function rsFiltersHTML(L) {
    const regs = [...new Set(L.map(x => zoneRegional(x.st.zona)).filter(Boolean))].sort();
    const zs = [...new Set(L.filter(x => !RS.regional || zoneRegional(x.st.zona) === RS.regional).map(x => x.st.zona))].sort();
    const L2 = L.filter(x => (!RS.regional || zoneRegional(x.st.zona) === RS.regional) && (!RS.zona || x.st.zona === RS.zona));
    const cads = [...new Map(L2.map(x => [chainGroup(x.st).key, chainGroup(x.st).label])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
    const tds = L2.filter(x => !RS.cadena || chainGroup(x.st).key === RS.cadena).map(x => x.st).sort((a, b) => a.tienda.localeCompare(b.tienda));
    const sel = (id, all, opts, v) => `<select class="input" data-rs="${id}"><option value="">${all}</option>${opts.map(([k, l]) => `<option value="${esc(k)}" ${k === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    return `<div class="rs-filters">${regs.length > 1 ? sel('regional', 'Todas las regionales', regs.map(r => [r, r]), RS.regional) : ''}${zs.length > 1 ? sel('zona', 'Todas las zonas', zs.map(z => [z, z]), RS.zona) : ''}${sel('cadena', 'Todas las cadenas', cads, RS.cadena)}${sel('tienda', 'Todas las tiendas', tds.map(s => [s.id, s.tienda]), RS.tienda)}</div>`;
}
function rsBind(box, again) {
    $$('[data-rs]', box).forEach(s => s.onchange = () => {
        const k = s.dataset.rs; RS[k] = s.value;
        if (k === 'regional') { RS.zona = ''; RS.cadena = ''; RS.tienda = ''; } if (k === 'zona') { RS.cadena = ''; RS.tienda = ''; } if (k === 'cadena') RS.tienda = '';
        again();
    });
    $$('[data-rsn]', box).forEach(b => b.onclick = () => { RS.nivel = b.dataset.rsn; again(); });
}
// Suma marcas de un grupo de tiendas (data real o, si no hay, cierres)
// RS.src: 'real' = solo data real de las cadenas (Share real) · 'cierres' = solo lo que reportan los asesores (Infinix vs. competencia)
function rsAgg(L) {
    const m = {}; let real = 0;
    L.forEach(x => { const S = RS.src === 'cierres' ? x.rep : RS.src === 'real' ? x.real : (x.real || x.rep); if (!S) return; real++; S.rank.forEach(([b, v]) => { m[b] = (m[b] || 0) + v; }); });
    return { ...RealData.shareOf(m), marcas: m, real, n: L.length };
}
function rsGroups(L, nivel) {
    const keyOf = x => nivel === 'tienda' ? x.st.id : nivel === 'cadena' ? chainGroup(x.st).key : nivel === 'zona' ? x.st.zona : (zoneRegional(x.st.zona) || 'SIN REGIONAL');
    const nameOf = x => nivel === 'tienda' ? x.st.tienda : nivel === 'cadena' ? chainGroup(x.st).label : nivel === 'zona' ? x.st.zona : (zoneRegional(x.st.zona) || 'Sin regional');
    const G = {}; L.forEach(x => { const k = keyOf(x); (G[k] = G[k] || { k, nombre: nameOf(x), st: x.st, L: [] }).L.push(x); });
    return Object.values(G).map(g => ({ ...g, A: rsAgg(g.L) })).filter(g => g.A.tot).sort((a, b) => (b.A.share || 0) - (a.A.share || 0));
}
const BRAND_COL = { INFINIX: '#00C853', SAMSUNG: '#1428A0', XIAOMI: '#FF6900', MOTOROLA: '#5C6BC0', OPPO: '#1BA784', HONOR: '#0EA5E9', REALME: '#EAB308', TECNO: '#2563EB', VIVO: '#4F46E5', ZTE: '#64748B', APPLE: '#111827', OTROS: '#94A3B8' };
const brandBars = (rank, tot, n = 8) => `<div class="rs-bars">${rank.slice(0, n).map(([b, v], i) => `<div class="${b === 'INFINIX' ? 'inf' : ''}"><em>#${i + 1}</em><span>${esc(b)}</span><div class="rs-tr"><i style="width:${rank[0] ? v / rank[0][1] * 100 : 0}%;background:${BRAND_COL[b] || '#94A3B8'}"></i></div><b>${tot ? Math.round(v / tot * 100) : 0}%</b><small>${v} uds</small></div>`).join('')}</div>`;

async function paintRealShare(box, stores, label) {
    if (!box) return;
    box.innerHTML = '<p class="hint">Leyendo la data real de las cadenas…</p>';
    const month = todayStr().slice(0, 7), L = await realVsReporte(stores, month);
    if (!box.isConnected) return;
    if (!RS.cache || RS.cache.label !== label) Object.assign(RS, { regional: '', zona: '', cadena: '', tienda: '' });
    RS.cache = { L, label, month };
    const paint = () => {
        RS.src = 'real';
        const Ls = rsScope(L), A = rsAgg(Ls), alertas = Ls.filter(x => x.alerta && x.real), G = rsGroups(Ls, RS.nivel), lider = A.rank[0], lbl = rsLabel(label);
        const V = refsOf(Ls), infRank = V.all.findIndex(r => r.marca === 'INFINIX'), atk = ataques(V, RS.tienda ? storeById(RS.tienda) : null);
        const porCadena = rsGroups(Ls, 'cadena').map(g => ({ g, V: refsOf(g.L) })).filter(x => x.V.all.length);
        if (!A.tot) { box.innerHTML = rsFiltersHTML(L) + `<div class="card empty" style="margin-top:10px">${RealData.docsFor(month).length ? 'No hay data real para este filtro.' : 'Aún no hay data real este mes. La carga el coordinador en <b>Cargar datos › Data real por cadena</b>.'} Lo que reportan los asesores en sus cierres está en <b>⚔️ Infinix vs competencia</b>.</div>`; rsBind(box, paint); return; }
        box.innerHTML = `
        ${rsFiltersHTML(L)}
        <div class="seg sm" style="margin:8px 0">${[['tienda', 'Por tienda'], ['cadena', 'Por cadena'], ['zona', 'Por zona'], ['regional', 'Por regional']].map(([k, l]) => `<button class="seg-btn ${RS.nivel === k ? 'active' : ''}" data-rsn="${k}">${l}</button>`).join('')}</div>
        <div class="zg-kpis">
            <div class="hl"><span>Share real Infinix · ${esc(lbl)}</span><b>${rsPc(A.share)}</b><em>${A.inf} de ${A.tot} uds</em></div>
            <div><span>Puesto de Infinix</span><b>${A.pos ? '#' + A.pos : '—'}</b><em>de ${A.rank.length} marcas</em></div>
            <div><span>Marca #1</span><b style="font-size:20px">${lider ? esc(lider[0]) : '—'}</b><em>${lider ? `${lider[1]} uds · ${rsPc(lider[1] / A.tot)}` : ''}</em></div>
            <div><span>Ref. #1 del mercado</span><b style="font-size:17px">${V.all[0] ? esc(V.all[0].ref) : '—'}</b><em>${V.all[0] ? `${esc(V.all[0].marca)} · ${V.all[0].q} uds` : 'el archivo no trae modelo'}</em></div>
            <div><span>Mejor Infinix</span><b style="font-size:17px">${infRank >= 0 ? esc(V.all[infRank].ref) : '—'}</b><em>${infRank >= 0 ? `puesto #${infRank + 1} · ${V.all[infRank].q} uds` : ''}</em></div>
            <div><span>PDV con data real</span><b>${A.real}<small>/${Ls.length}</small></b><em>${RealData.docsFor(month).length} cadena(s) cargada(s)</em></div>
        </div>
        <details class="card acc" open><summary><span>🏁 Ranking de marcas · ${esc(lbl)}</span></summary>${brandBars(A.rank, A.tot, 11)}</details>
        <details class="card acc" open><summary><span>📊 Share real ${RS.nivel === 'tienda' ? 'por tienda' : RS.nivel === 'cadena' ? 'por cadena' : RS.nivel === 'zona' ? 'por zona' : 'por regional'} (${G.length})</span></summary>
            <div class="tbl-scroll"><table class="tbl compact"><thead><tr><th>${RS.nivel === 'tienda' ? 'PDV' : RS.nivel === 'cadena' ? 'Cadena' : RS.nivel === 'zona' ? 'Zona' : 'Regional'}</th>${RS.nivel !== 'tienda' ? '<th>PDV</th>' : ''}<th>Infinix</th><th>Total</th><th>Share</th><th>Puesto</th><th>Marca #1</th><th>Ref. #1</th><th>Top marcas</th></tr></thead><tbody>
            ${G.map(g => { const v = refsOf(g.L).all[0]; return `<tr><td class="l">${RS.nivel === 'tienda' ? storeLogo(g.st, 'xs') + ' ' : RS.nivel === 'cadena' ? chainGroupLogo(chainGroup(g.st).key, 'xs') + ' ' : ''}<b>${esc(g.nombre)}</b></td>${RS.nivel !== 'tienda' ? `<td>${g.A.real}</td>` : ''}<td><b>${g.A.inf}</b></td><td>${g.A.tot}</td><td><b>${rsPc(g.A.share)}</b></td><td>${g.A.pos ? '#' + g.A.pos : '—'}</td><td>${g.A.rank[0] ? esc(g.A.rank[0][0]) : '—'}</td><td class="l"><small>${v ? `${esc(v.ref)} (${esc(v.marca)}) ${v.q}` : '—'}</small></td><td class="l"><small>${g.A.rank.slice(0, 4).map(([b, q]) => `${esc(b)} ${rsPc(q / g.A.tot)}`).join(' · ')}</small></td></tr>`; }).join('')}</tbody></table></div>
            <div class="actions" id="rs-act" style="margin-top:10px"><button class="btn btn-ghost" data-act="preview">👁️ Vista previa</button><button class="btn btn-wa" data-act="share">📲 WhatsApp</button><button class="btn btn-primary" data-act="save">⬇️ Descargar</button></div></details>
        ${V.all.length ? `
        <details class="card acc" open><summary><span>🏆 Referencias más vendidas · ${esc(lbl)}</span></summary>
            <div class="tbl-scroll"><table class="tbl compact"><thead><tr><th>#</th><th>Referencia</th><th>Marca</th><th>Uds</th><th>% del total</th><th>PDV</th></tr></thead><tbody>
            ${V.all.slice(0, 20).map((r, i) => `<tr class="${r.marca === 'INFINIX' ? 'vs-inf' : ''}"><td>${i + 1}</td><td class="l"><b>${esc(r.ref)}</b></td><td>${esc(r.marca)}</td><td><b>${r.q}</b></td><td>${rsPc(r.q / V.tot)}</td><td>${r.pdv}</td></tr>`).join('')}</tbody></table></div></details>
        <details class="card acc"><summary><span>🏷️ Lo más vendido de cada cadena (${porCadena.length})</span></summary>
            <div class="vs-brands">${porCadena.map(({ g, V: W }) => { const i1 = W.all.find(r => r.marca === 'INFINIX'); return `<div><b>${chainGroupLogo(chainGroup(g.st).key, 'xs')} ${esc(g.nombre)} <small>${W.tot} uds</small></b>${W.all.slice(0, 5).map((r, i) => `<span class="${r.marca === 'INFINIX' ? 'inf' : ''}">${i + 1}. ${esc(r.ref)} <small>${esc(r.marca)}</small> <em>${r.q}</em></span>`).join('')}${i1 && W.all.indexOf(i1) >= 5 ? `<span class="inf">${W.all.indexOf(i1) + 1}. ${esc(i1.ref)} <small>INFINIX</small> <em>${i1.q}</em></span>` : ''}</div>`; }).join('')}</div></details>
        <details class="card acc"><summary><span>🏬 Lo más vendido en cada tienda (${V.porTienda.length})</span></summary>
            <div class="tbl-scroll"><table class="tbl compact"><thead><tr><th>PDV</th><th>Ref. #1 de la tienda</th><th>Ref. #1 competencia</th><th>Uds</th><th>Ref. #1 Infinix</th><th>Uds</th></tr></thead><tbody>
            ${V.porTienda.sort((a, b) => b.tot - a.tot).map(t => { const top = t.comp.concat(t.inf).sort((a, b) => b.q - a.q)[0]; return `<tr><td class="l">${storeLogo(t.st, 'xs')} <b>${esc(t.st.tienda)}</b></td><td class="l"><small>${top ? `${esc(top.ref)} (${esc(top.marca)}) ${top.q}` : '—'}</small></td><td class="l">${t.comp[0] ? `<b>${esc(t.comp[0].ref)}</b> <small>${esc(t.comp[0].marca)}</small>` : '—'}</td><td>${t.comp[0] ? t.comp[0].q : '—'}</td><td class="l">${t.inf[0] ? `<b>${esc(t.inf[0].ref)}</b>` : '<small class="r">sin venta</small>'}</td><td>${t.inf[0] ? t.inf[0].q : '—'}</td></tr>`; }).join('')}</tbody></table></div></details>
        <details class="card acc"><summary><span>🎯 Focos de ataque para tus visitas</span></summary>
            <ol class="vs-atk">${atk.map(a => `<li><b>${esc(a.ref)}</b> <small>${esc(a.marca)} · ${a.q} uds</small><br>${esc(a.txt)}</li>`).join('')}</ol>
            <p class="hint">Estos focos salen solos en el plan de trabajo de cada tienda.</p></details>` : `<p class="hint">El archivo de data real cargado no trae la columna de modelo o referencia: cuando la traiga, aquí verás las referencias más vendidas por cadena y por tienda.</p>`}
        <details class="card acc" ${alertas.length ? 'open' : ''}><summary><span>⚠️ Inconsistencias: reporte del asesor vs. venta real (${alertas.length})</span></summary>
            ${alertas.length ? `<div class="ds-list">${alertas.map(x => `<div class="ds-row"><span>${storeLogo(x.st, 'xs')} <b>${esc(x.st.tienda)}</b> <small class="mute">${x.cierres} cierres</small></span><em class="rv-dias r">${esc(x.alerta)}</em></div>`).join('')}</div>` : '<p class="mute">✅ Sin inconsistencias para este filtro.</p>'}
            <p class="hint">Alerta: Infinix reportado distinto en 3 uds y 15% o más, share con 10 puntos de diferencia, venta de la tienda muy distinta, o tienda sin cierres en el periodo de la data real.</p></details>
        <p class="hint">Share real = unidades Infinix ÷ unidades de la tienda según el sell-out de cada cadena (lo carga el coordinador). Solo la ven los líderes.</p>`;
        rsBind(box, paint);
        ReportActions.bind($('#rs-act', box), {
            title: 'Market share real · Central de Operaciones', noStore: true,
            validate: () => A.tot ? null : 'No hay data para este filtro.',
            filename: () => `Share_real_${slug(lbl)}_${month}.png`,
            build: stage => buildShareCanvas(stage, { lbl, A, G, nivel: RS.nivel, alertas, month, autor: State.session, V })
        });
    };
    paint();
}

function buildShareCanvas(stage, d) {
    const nivelTxt = { tienda: 'POR TIENDA', cadena: 'POR CADENA', zona: 'POR ZONA', regional: 'POR REGIONAL' }[d.nivel];
    const docs = RealData.docsFor(d.month), per = docs.length ? `${docs.map(x => x.desde).sort()[0]} a ${docs.map(x => x.hasta).sort().pop()}` : '';
    const el = document.createElement('div'); el.className = 'rp sp rs-rep';
    el.innerHTML = `<div class="rp-bar"></div>
    <header class="rp-head"><img class="rp-logo" src="${LOGO_INFINIX}" alt="Infinix">
        <div class="rp-head-mid"><div class="rp-kicker">MARKET SHARE REAL · SELL-OUT DE LAS CADENAS</div><div class="rp-title">${esc(d.lbl.toUpperCase())}</div><div class="rp-sub">${esc(mesLargo(d.month))}${per ? ' · venta del ' + esc(per) : ''}</div></div>
        <div class="pl-who"><b>${esc((d.autor || {}).nombre || '')}</b><small>${ROLES[(d.autor || {}).rol] ? ROLES[d.autor.rol].label : ''}</small></div></header>
    <div class="sp-band">
        <div class="hero"><span>SHARE INFINIX</span><b>${rsPc(d.A.share)}</b><em>${d.A.inf} de ${d.A.tot} uds vendidas</em></div>
        <div><span>Puesto Infinix</span><b>${d.A.pos ? '#' + d.A.pos : '—'}</b><em>de ${d.A.rank.length} marcas</em></div>
        <div><span>Marca #1</span><b style="font-size:28px">${d.A.rank[0] ? esc(d.A.rank[0][0]) : '—'}</b><em>${d.A.rank[0] ? rsPc(d.A.rank[0][1] / d.A.tot) + ' de share' : ''}</em></div>
        <div><span>Uds Infinix</span><b>${d.A.inf}</b><em>${d.A.real} PDV con data real</em></div>
        <div><span>Grupos</span><b>${d.G.length}</b><em>${nivelTxt.toLowerCase()}</em></div>
        <div class="${d.alertas.length ? 'bad' : 'ok'}"><span>Alertas de reporte</span><b>${d.alertas.length}</b><em>reporte asesor ≠ real</em></div>
    </div>
    <div class="rp-sec">RANKING DE MARCAS</div>${brandBars(d.A.rank, d.A.tot, 11)}
    <div class="rp-sec">SHARE ${nivelTxt}</div>
    <table class="rp-tbl sp-tbl"><thead><tr><th class="l">#</th><th class="l">${nivelTxt.replace('POR ', '')}</th><th>INFINIX</th><th>TOTAL</th><th class="c-tot">SHARE</th><th>PUESTO</th><th class="l">MARCA #1</th><th class="l">TOP MARCAS</th></tr></thead><tbody>
    ${d.G.map((g, i) => `<tr><td class="l">${i + 1}</td><td class="l"><div class="sp-pdv">${d.nivel === 'tienda' ? storeLogo(g.st, 'xs') : d.nivel === 'cadena' ? chainGroupLogo(chainGroup(g.st).key, 'xs') : ''}<b>${esc(g.nombre)}</b></div></td><td><b>${g.A.inf}</b></td><td>${g.A.tot}</td><td class="c-tot"><b>${rsPc(g.A.share)}</b></td><td>${g.A.pos ? '#' + g.A.pos : '—'}</td><td class="l">${g.A.rank[0] ? esc(g.A.rank[0][0]) : '—'}</td><td class="l small">${g.A.rank.slice(0, 4).map(([b, v]) => `${b === 'INFINIX' ? '<b>INFINIX</b>' : esc(b)} ${v}`).join(' · ')}</td></tr>`).join('')}</tbody></table>
    ${d.V && d.V.all.length ? `<div class="rp-sec">REFERENCIAS MÁS VENDIDAS</div><table class="rp-tbl sp-tbl"><thead><tr><th class="l">#</th><th class="l">REFERENCIA</th><th class="l">MARCA</th><th>UDS</th><th class="c-tot">% TOTAL</th><th>PDV</th></tr></thead><tbody>${d.V.all.slice(0, 12).map((r, i) => `<tr class="${r.marca === 'INFINIX' ? 'vs-inf' : ''}"><td class="l">${i + 1}</td><td class="l"><b>${esc(r.ref)}</b></td><td class="l">${esc(r.marca)}</td><td><b>${r.q}</b></td><td class="c-tot">${rsPc(r.q / d.V.tot)}</td><td>${r.pdv}</td></tr>`).join('')}</tbody></table>` : ''}
    ${d.alertas.length ? `<div class="rp-sec">ALERTAS: EL REPORTE DEL ASESOR NO COINCIDE CON LA VENTA REAL</div><table class="rp-tbl sp-tbl"><tbody>${d.alertas.map(x => `<tr><td class="l"><div class="sp-pdv">${storeLogo(x.st, 'xs')}<b>${esc(x.st.tienda)}</b></div></td><td class="l r">${esc(x.alerta)}</td></tr>`).join('')}</tbody></table>` : ''}
    <footer class="rp-foot"><span>Share real = unidades Infinix ÷ unidades de la tienda según la data de la cadena (sell-out).</span><b>Infinix · Central de Operaciones</b></footer><div class="rp-bar"></div>`;
    stage.appendChild(el); return el;
}

// ---------- Infinix vs. competencia: referencias ----------
function refsOf(Ls) {
    const T = {}, porMarca = {}, porTienda = [];
    Ls.forEach(x => {
        if (!x.R || !x.R.refs) return;
        const V = Object.entries(x.R.refs).map(([k, q]) => { const [marca, ref] = k.split('|'); return { k, marca, ref, q }; }).sort((a, b) => b.q - a.q);
        V.forEach(r => { const t = T[r.k] = T[r.k] || { marca: r.marca, ref: r.ref, q: 0, pdv: 0 }; t.q += r.q; t.pdv++; });
        if (V.length) porTienda.push({ st: x.st, comp: V.filter(r => r.marca !== 'INFINIX'), inf: V.filter(r => r.marca === 'INFINIX'), tot: sum(V.map(r => r.q)) });
    });
    const all = Object.values(T).sort((a, b) => b.q - a.q), tot = sum(all.map(r => r.q));
    all.forEach(r => { if (!porMarca[r.marca]) porMarca[r.marca] = []; porMarca[r.marca].push(r); });
    return { all, tot, porMarca, porTienda };
}
// Contra qué referencia Infinix atacar: la Infinix que más vende en el mismo alcance (o la referencia foco del PDV)
function ataques(V, st) {
    const infTop = V.all.filter(r => r.marca === 'INFINIX');
    const foco = st && st.foco && st.foco.ref ? (INFINIX_MODELS.find(m => m.key === st.foco.ref) || {}).name : '';
    return V.all.filter(r => r.marca !== 'INFINIX').slice(0, 5).map((r, i) => {
        const arma = foco || (infTop[i % Math.max(1, Math.min(3, infTop.length))] || {}).ref || (INFINIX_MODELS[0] || {}).name;
        return { ...r, arma, txt: `${r.ref} (${r.marca}) vende ${r.q} uds en ${r.pdv} PDV: comparativo y role play de ${arma} contra ${r.ref}; argumentos de cámara, batería y carga rápida, y precio en piso.` };
    });
}
// ---------- Infinix vs. competencia: lo que reportan los asesores en sus cierres (por semana o mes) ----------
// Cada cierre trae la venta del día de Infinix y de cada marca de la competencia. El cierre semanal cuenta en su semana.
const closureWeek = c => 'W' + isoWeek(c.fecha);
async function closureShare(stores, month) {
    const keys = [...new Set(stores.map(s => `${s.id}_${month}`))];
    let cl = [];
    for (let i = 0; i < keys.length; i += 10) cl = cl.concat(await Data.list(COL.closures, [['storeMonth', 'in', keys.slice(i, i + 10)]]).catch(() => []));
    return cl;
}
function closureL(stores, cl, wk) {
    return stores.map(st => {
        const mine = cl.filter(c => c.storeId === st.id && (!wk || closureWeek(c) === wk));
        const rep = {}; mine.forEach(c => { rep.INFINIX = (rep.INFINIX || 0) + closureInfinix(c); Object.entries(c.competencia || {}).forEach(([b, v]) => { rep[b] = (rep[b] || 0) + int(v); }); });
        return { st, rep: mine.length ? RealData.shareOf(rep) : null, cierres: mine.length };
    });
}
async function paintVersus(box, stores, label) {
    if (!box) return;
    box.innerHTML = '<p class="hint">Sumando los cierres de los asesores…</p>';
    const month = todayStr().slice(0, 7), cl = await closureShare(stores, month);
    if (!box.isConnected) return;
    if (!RS.cache || RS.cache.label !== label) Object.assign(RS, { regional: '', zona: '', cadena: '', tienda: '' });
    const weeks = [...new Set(cl.map(closureWeek))].sort((a, b) => int(a.slice(1)) - int(b.slice(1)));
    if (RS.wk && !weeks.includes(RS.wk)) RS.wk = '';
    const rangeOf = w => { const D = cl.filter(c => closureWeek(c) === w).map(c => c.semana ? [c.semana.desde, c.semana.hasta] : [c.fecha, c.fecha]).flat().sort(); return D.length ? `${int(D[0].slice(8))}–${int(D[D.length - 1].slice(8))}` : ''; };
    const paint = () => {
        RS.src = 'cierres';
        const L = closureL(stores, cl, RS.wk), Ls = rsScope(L), A = rsAgg(Ls), G = rsGroups(Ls, RS.nivel), lider = A.rank[0], lbl = rsLabel(label);
        const per = RS.wk ? `${RS.wk} (${rangeOf(RS.wk)} ${mesLargo(month).split(' ')[0].toLowerCase()})` : `Mes de ${mesLargo(month)}`;
        // Evolución semana a semana del alcance filtrado
        const evo = weeks.map(w => { const Lw = rsScope(closureL(stores, cl, w)), Aw = rsAgg(Lw); return { w, A: Aw }; });
        box.innerHTML = `${rsFiltersHTML(L)}
        <div class="vs-wk"><span class="lbl">Periodo</span><div class="seg sm">${[['', 'Mes completo']].concat(weeks.map(w => [w, `${w} · ${rangeOf(w)}`])).map(([k, l]) => `<button class="seg-btn ${RS.wk === k ? 'active' : ''}" data-rswk="${k}">${esc(l)}</button>`).join('')}</div></div>
        <div class="seg sm" style="margin:8px 0">${[['tienda', 'Por tienda'], ['cadena', 'Por cadena'], ['zona', 'Por zona'], ['regional', 'Por regional']].map(([k, l]) => `<button class="seg-btn ${RS.nivel === k ? 'active' : ''}" data-rsn="${k}">${l}</button>`).join('')}</div>
        ${!A.tot ? `<div class="card empty">No hay cierres con venta de competencia para este filtro y periodo.</div>` : `
        <div class="zg-kpis">
            <div class="hl"><span>Share Infinix · ${esc(per)}</span><b>${rsPc(A.share)}</b><em>${A.inf} de ${A.tot} uds reportadas</em></div>
            <div><span>Puesto de Infinix</span><b>${A.pos ? '#' + A.pos : '—'}</b><em>de ${A.rank.length} marcas</em></div>
            <div><span>Marca #1</span><b style="font-size:20px">${lider ? esc(lider[0]) : '—'}</b><em>${lider ? `${lider[1]} uds · ${rsPc(lider[1] / A.tot)}` : ''}</em></div>
            <div><span>PDV que reportan</span><b>${A.real}<small>/${Ls.length}</small></b><em>${sum(Ls.map(x => x.cierres))} cierres</em></div>
        </div>
        <details class="card acc" open><summary><span>🏁 Ranking de marcas · ${esc(lbl)} · ${esc(per)}</span></summary>${brandBars(A.rank, A.tot, 11)}</details>
        <details class="card acc" open><summary><span>📊 Share ${RS.nivel === 'tienda' ? 'por tienda' : RS.nivel === 'cadena' ? 'por cadena' : RS.nivel === 'zona' ? 'por zona' : 'por regional'} (${G.length})</span></summary>
            <div class="tbl-scroll"><table class="tbl compact"><thead><tr><th>${RS.nivel === 'tienda' ? 'PDV' : RS.nivel === 'cadena' ? 'Cadena' : RS.nivel === 'zona' ? 'Zona' : 'Regional'}</th>${RS.nivel !== 'tienda' ? '<th>PDV</th>' : '<th>Cierres</th>'}<th>Infinix</th><th>Total</th><th>Share</th><th>Puesto</th><th>Marca #1</th><th>Top marcas</th></tr></thead><tbody>
            ${G.map(g => `<tr><td class="l">${RS.nivel === 'tienda' ? storeLogo(g.st, 'xs') + ' ' : RS.nivel === 'cadena' ? chainGroupLogo(chainGroup(g.st).key, 'xs') + ' ' : ''}<b>${esc(g.nombre)}</b></td><td>${RS.nivel !== 'tienda' ? g.A.real : g.L[0].cierres}</td><td><b>${g.A.inf}</b></td><td>${g.A.tot}</td><td><b>${rsPc(g.A.share)}</b></td><td>${g.A.pos ? '#' + g.A.pos : '—'}</td><td>${g.A.rank[0] ? esc(g.A.rank[0][0]) : '—'}</td><td class="l"><small>${g.A.rank.slice(0, 4).map(([b, q]) => `${esc(b)} ${rsPc(q / g.A.tot)}`).join(' · ')}</small></td></tr>`).join('')}</tbody></table></div></details>`}
        ${evo.length ? `<details class="card acc" open><summary><span>📈 Share semana a semana · ${esc(lbl)}</span></summary>
            <div class="tbl-scroll"><table class="tbl compact"><thead><tr><th>Semana</th><th>Infinix</th><th>Total tienda</th><th>Share</th><th>Var.</th><th>Puesto</th><th>Marca #1</th></tr></thead><tbody>
            ${evo.map((e, i) => { const p = i ? evo[i - 1].A.share : null, dv = e.A.share != null && p != null ? Math.round((e.A.share - p) * 100) : null; return `<tr class="${RS.wk === e.w ? 'cur' : ''}"><td class="l"><b>${e.w}</b> <small class="mute">${rangeOf(e.w)}</small></td><td><b>${e.A.inf}</b></td><td>${e.A.tot}</td><td><b>${rsPc(e.A.share)}</b></td><td class="${dv == null ? '' : dv >= 0 ? 'g' : 'r'}">${dv == null ? '—' : (dv >= 0 ? '▲ ' : '▼ ') + Math.abs(dv) + ' pts'}</td><td>${e.A.pos ? '#' + e.A.pos : '—'}</td><td>${e.A.rank[0] ? esc(e.A.rank[0][0]) : '—'}</td></tr>`; }).join('')}</tbody></table></div></details>` : ''}
        ${A.tot ? `<div class="actions" id="vs-act"><button class="btn btn-ghost" data-act="preview">👁️ Vista previa</button><button class="btn btn-wa" data-act="share">📲 WhatsApp</button><button class="btn btn-primary" data-act="save">⬇️ Descargar</button></div>` : ''}
        <p class="hint">Sale de los cierres que llenan los asesores cada noche (venta de Infinix y de cada marca de la competencia). El cierre semanal cuenta en su semana. La venta según las cadenas está en <b>📊 Share real</b>.</p>`;
        rsBind(box, paint);
        $$('[data-rswk]', box).forEach(b => b.onclick = () => { RS.wk = b.dataset.rswk; paint(); });
        if ($('#vs-act', box)) ReportActions.bind($('#vs-act', box), {
            title: 'Infinix vs. competencia · Central de Operaciones', noStore: true,
            filename: () => `Infinix_vs_competencia_${slug(lbl)}_${RS.wk || month}.png`,
            build: stage => buildVersusCanvas(stage, { lbl, per, A, G, evo, nivel: RS.nivel, month, autor: State.session })
        });
    };
    paint();
}
function buildVersusCanvas(stage, d) {
    const nivelTxt = { tienda: 'POR TIENDA', cadena: 'POR CADENA', zona: 'POR ZONA', regional: 'POR REGIONAL' }[d.nivel];
    const el = document.createElement('div'); el.className = 'rp sp rs-rep';
    el.innerHTML = `<div class="rp-bar"></div>
    <header class="rp-head"><img class="rp-logo" src="${LOGO_INFINIX}" alt="Infinix">
        <div class="rp-head-mid"><div class="rp-kicker">INFINIX VS. COMPETENCIA · REPORTE DE CIERRES DE LOS ASESORES</div><div class="rp-title">${esc(d.lbl.toUpperCase())}</div><div class="rp-sub">${esc(d.per)} · ${d.A.tot} uds reportadas · ${d.A.real} PDV</div></div>
        <div class="pl-who"><b>${esc((d.autor || {}).nombre || '')}</b><small>${ROLES[(d.autor || {}).rol] ? ROLES[d.autor.rol].label : ''}</small></div></header>
    <div class="sp-band">
        <div class="hero"><span>SHARE INFINIX</span><b>${rsPc(d.A.share)}</b><em>${d.A.inf} de ${d.A.tot} uds</em></div>
        <div><span>Puesto Infinix</span><b>${d.A.pos ? '#' + d.A.pos : '—'}</b><em>de ${d.A.rank.length} marcas</em></div>
        <div><span>Marca #1</span><b style="font-size:28px">${d.A.rank[0] ? esc(d.A.rank[0][0]) : '—'}</b><em>${d.A.rank[0] ? rsPc(d.A.rank[0][1] / d.A.tot) + ' de share' : ''}</em></div>
        <div><span>PDV que reportan</span><b>${d.A.real}</b><em>${nivelTxt.toLowerCase()}</em></div>
    </div>
    <div class="rp-sec">RANKING DE MARCAS</div>${brandBars(d.A.rank, d.A.tot, 11)}
    <div class="rp-sec">SHARE ${nivelTxt}</div>
    <table class="rp-tbl sp-tbl"><thead><tr><th class="l">#</th><th class="l">${nivelTxt.replace('POR ', '')}</th><th>INFINIX</th><th>TOTAL</th><th class="c-tot">SHARE</th><th>PUESTO</th><th class="l">MARCA #1</th></tr></thead><tbody>
    ${d.G.map((g, i) => `<tr><td class="l">${i + 1}</td><td class="l"><div class="sp-pdv">${d.nivel === 'tienda' ? storeLogo(g.st, 'xs') : d.nivel === 'cadena' ? chainGroupLogo(chainGroup(g.st).key, 'xs') : ''}<b>${esc(g.nombre)}</b></div></td><td><b>${g.A.inf}</b></td><td>${g.A.tot}</td><td class="c-tot"><b>${rsPc(g.A.share)}</b></td><td>${g.A.pos ? '#' + g.A.pos : '—'}</td><td class="l">${g.A.rank[0] ? esc(g.A.rank[0][0]) : '—'}</td></tr>`).join('')}</tbody></table>
    ${d.evo.length > 1 ? `<div class="rp-sec">SHARE SEMANA A SEMANA</div><table class="rp-tbl sp-tbl"><thead><tr><th class="l">SEMANA</th><th>INFINIX</th><th>TOTAL</th><th class="c-tot">SHARE</th><th>PUESTO</th><th class="l">MARCA #1</th></tr></thead><tbody>${d.evo.map(e => `<tr><td class="l"><b>${e.w}</b></td><td>${e.A.inf}</td><td>${e.A.tot}</td><td class="c-tot"><b>${rsPc(e.A.share)}</b></td><td>${e.A.pos ? '#' + e.A.pos : '—'}</td><td class="l">${e.A.rank[0] ? esc(e.A.rank[0][0]) : '—'}</td></tr>`).join('')}</tbody></table>` : ''}
    <footer class="rp-foot"><span>Fuente: cierres diarios de los asesores (venta de Infinix y de la competencia en cada tienda). Share = unidades Infinix ÷ unidades reportadas de la tienda.</span><b>Infinix · Central de Operaciones</b></footer><div class="rp-bar"></div>`;
    stage.appendChild(el); return el;
}

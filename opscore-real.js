// ============================================================================
// DATA REAL POR CADENA (sell-out de cada cadena: lo vendido por marca en cada tienda)
// La carga el coordinador (y gerente/admin) en Cargar datos, una por cada una de las 7 cadenas.
// Con ella sale el market share REAL, la participación y el puesto de Infinix en cada PDV; si no hay data real,
// se usa lo que reportan los asesores en el cierre diario. Además compara las dos fuentes y alerta las tiendas
// donde el reporte del asesor no coincide con la venta real.
// Guardado: colección zone_data, documento real_<cadena>_<AAAA-MM> (nacional, igual para todos).
// ============================================================================

const REAL_CHAINS = [['exito', 'Éxito'], ['alkosto', 'Alkosto'], ['ktronix', 'Ktronix'], ['falabella', 'Falabella'], ['cencosud', 'Cencosud'], ['wom', 'WOM'], ['olimpica', 'Olímpica']];
const RealData = (() => {
    const N = s => Match.N(s);
    const brandOf = v => {
        const n = N(v); if (!n) return '';
        if (/IPHONE|APPLE/.test(n)) return 'APPLE';
        if (/REDMI|POCO|XIAOMI/.test(n)) return 'XIAOMI';
        if (/GALAXY|SAMSUNG/.test(n)) return 'SAMSUNG';
        return BRANDS.find(b => n.includes(b)) || 'OTROS';
    };
    const isBrandHeader = h => { const n = N(h); return !!n && (BRANDS.some(b => n === b || n.startsWith(b + ' ')) || /^IPHONE|^APPLE|^REDMI|^OTROS|^OTRAS/.test(n)); };
    // Lee el archivo: formato largo (tienda, marca, unidades) o ancho (tienda + una columna por marca)
    function parse(sheets, chainKey) {
        const sh = sheets.slice().sort((a, b) => b.rows.length - a.rows.length)[0]; if (!sh) throw new Error('El archivo no tiene datos.');
        let hi = -1;
        for (let i = 0; i < Math.min(25, sh.rows.length); i++) {
            const H = (sh.rows[i] || []).map(N);
            const store = H.some(h => /TIENDA|ALMACEN|PDV|PUNTO|SUCURSAL|LOCAL|NOMBRE TIENDA|STORE/.test(h));
            if (store && (H.some(h => /MARCA|BRAND|FABRICANTE/.test(h)) || H.filter((h, j) => isBrandHeader(sh.rows[i][j])).length >= 3)) { hi = i; break; }
        }
        if (hi < 0) throw new Error('No encontré la tabla: debe tener una columna de tienda y una de marca (o una columna por marca) con las unidades.');
        const raw = sh.rows[hi], H = raw.map(N);
        const col = re => H.findIndex(h => re.test(h));
        const cS = col(/NOMBRE TIENDA|TIENDA|ALMACEN|PDV|PUNTO DE VENTA|SUCURSAL|LOCAL|STORE/), cB = col(/MARCA|BRAND|FABRICANTE/);
        const cQ = col(/UNIDADES|CANTIDAD|UND|UDS|QTY|PIEZAS|VENTA UN|SELL OUT|SELLOUT/), cD = col(/FECHA|DATE|DIA$/), cC = col(/CATEGORIA|CATEGORY|LINEA|FAMILIA|SUBCATEGORIA/);
        const wide = cB < 0 ? raw.map((h, j) => isBrandHeader(h) ? [j, brandOf(h)] : null).filter(Boolean) : [];
        const rows = [];
        for (let i = hi + 1; i < sh.rows.length; i++) {
            const r = sh.rows[i] || [], tienda = String(r[cS] ?? '').trim();
            if (!tienda || /^TOTAL|GRAN TOTAL/.test(N(tienda))) continue;
            if (cC >= 0 && r[cC] && !/CEL|SMART|MOVIL|TELEF|PHONE|TELEFONIA|EQUIPO/.test(N(r[cC]))) continue;      // solo celulares
            const fecha = cD >= 0 ? XL.iso(r[cD]) : '';
            if (wide.length) wide.forEach(([j, b]) => { const q = Math.round(XL.num(r[j])); if (q) rows.push({ tienda, marca: b, q, fecha }); });
            else { const q = cQ >= 0 ? Math.round(XL.num(r[cQ])) : 1; if (q) rows.push({ tienda, marca: brandOf(r[cB]), q, fecha }); }
        }
        if (!rows.length) throw new Error('No encontré unidades en el archivo.');
        const fechas = rows.map(r => r.fecha).filter(Boolean).sort();
        return { chain: chainKey, sheet: sh.name, rows, desde: fechas[0] || '', hasta: fechas[fechas.length - 1] || '', formato: wide.length ? 'columnas por marca' : 'filas por marca' };
    }
    function match(P) {
        const hint = { exito: 'EXITO', alkosto: 'ALKOSTO', ktronix: 'KTRONIX', falabella: 'FALABELLA', cencosud: 'CENCOSUD', wom: 'WOM', olimpica: 'OLIMPICA' }[P.chain] || '';
        const pool = State.stores.filter(s => normLogoKey(s.logoKey) === P.chain || (P.chain === 'alkosto' && normLogoKey(s.logoKey) === 'ktronix') || (P.chain === 'ktronix' && normLogoKey(s.logoKey) === 'alkosto'));
        const cache = {}, stores = {}, unm = {};
        P.rows.forEach(r => {
            const k = N(r.tienda); if (!(k in cache)) cache[k] = Match.store(r.tienda, { cadena: hint, zona: '', stores: pool.length ? pool : State.stores });
            const st = cache[k];
            if (!st) { unm[r.tienda] = (unm[r.tienda] || 0) + r.q; return; }
            const S = stores[st.id] = stores[st.id] || {}; S[r.marca] = (S[r.marca] || 0) + r.q;
        });
        P.stores = stores; P.unmatched = unm;
        return P;
    }
    const docId = (chain, ym) => `real_${chain}_${ym}`;
    let cache = {};
    async function save(P, month, desde, hasta, fileName) {
        const s = State.session || {};
        const doc = { id: docId(P.chain, month), kind: 'real', chain: P.chain, month, desde: desde || P.desde || month + '-01', hasta: hasta || P.hasta || todayStr(), file: fileName, by: s.nombre || '', at: Date.now(), stores: P.stores, unmatched: P.unmatched };
        cache[doc.id] = doc;
        return Data.set(COL.zoneData, doc.id, doc, false);
    }
    async function load(month) {
        month = month || todayStr().slice(0, 7);
        const docs = (await Data.list(COL.zoneData, [['kind', '==', 'real'], ['month', '==', month]]).catch(() => [])) || [];
        docs.forEach(d => { cache[d.id] = d; });
        return docs;
    }
    const docsFor = month => Object.values(cache).filter(d => d.kind === 'real' && d.month === month);
    // Venta real de una tienda (por marca) en el mes, o null si no hay data real de su cadena
    function forStore(st, month) {
        month = month || todayStr().slice(0, 7);
        const D = docsFor(month).find(d => d.stores && d.stores[st.id]);
        return D ? { marcas: D.stores[st.id], desde: D.desde, hasta: D.hasta, file: D.file, by: D.by, at: D.at, chain: D.chain } : null;
    }
    // Share, participación y puesto: data real primero; si no hay, el reporte de los asesores (cierres)
    function shareOf(marcas) {
        const tot = sum(Object.values(marcas || {})), inf = int((marcas || {}).INFINIX);
        const rank = Object.entries(marcas || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
        const pos = inf > 0 ? rank.findIndex(([b]) => b === 'INFINIX') + 1 : null;
        return { tot, inf, share: tot ? inf / tot : null, pos, rank };
    }
    return { parse, match, save, load, forStore, shareOf, docsFor, brandOf };
})();

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
    return `<section class="card up-card" id="up-real">
        <div class="up-h"><span class="up-ico">🏬</span><div><h3 class="h3">Data real por cadena · sell-out</h3><p class="mute">Lo que vendió cada marca en cada tienda según la cadena. Con esto salen el share real, la participación y el puesto de Infinix, y las alertas cuando el reporte del asesor no coincide. Sirve el Excel de la cadena con una columna de tienda y una de marca (o una columna por marca) y las unidades.</p></div></div>
        <div class="up-real-grid">${REAL_CHAINS.map(([k, l]) => { const d = docs.find(x => x.chain === k); return `<div class="up-real ${d ? 'on' : ''}"><div class="row between"><span>${chainLogo(k, l, 'sm')}</span>${d ? `<i class="pill ok">✓ ${Object.keys(d.stores || {}).length} PDV</i>` : '<i class="pill">Sin cargar</i>'}</div>
            <small class="mute">${d ? `${esc(d.desde)} a ${esc(d.hasta)} · ${esc(d.by || '')}` : 'Mes en curso'}</small>
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
        out.innerHTML = `<div class="up-sum"><b>${esc((REAL_CHAINS.find(c => c[0] === chain) || [])[1])}</b> · ${P.rows.length} filas (${esc(P.formato)}) · ${tot} uds · <b>${Object.keys(P.stores).length}</b> PDV cruzados · share Infinix <b>${all ? Math.round(inf / all * 100) : 0}%</b>${unm.length ? ` · <b class="warn-t">${unm.length} tiendas sin cruzar</b>` : ''}</div>
            ${unm.length ? `<p class="hint">Sin cruzar: ${unm.slice(0, 12).map(([t, q]) => esc(t) + ' (' + q + ')').join(', ')}${unm.length > 12 ? '…' : ''}</p>` : ''}
            <div class="row wrap end" style="gap:8px"><label class="lbl" style="margin:0">Periodo</label><input type="date" class="input" id="rl-d" value="${P.desde || month + '-01'}"><span>a</span><input type="date" class="input" id="rl-h" value="${P.hasta || todayStr()}">
            <button class="btn btn-primary" id="rl-ok">✅ Guardar data real</button></div>`;
        $('#rl-ok').onclick = async e => {
            if (!canWrite()) return; busy(e.currentTarget, true);
            try { await RealData.save(P, month, $('#rl-d').value, $('#rl-h').value, file.name); toast('Data real guardada: ya la ven todos los líderes', 'ok'); if (after) after(); } finally { busy(e.currentTarget, false); }
        };
    } catch (e) { console.error(e); out.innerHTML = `<p class="err">${esc(e.message || e)}</p>`; }
}

// ---------- Pestaña "Share real" del Análisis de zona ----------
async function paintRealShare(box, stores, label) {
    if (!box) return;
    box.innerHTML = '<p class="hint">Cruzando la data real con los reportes de los asesores…</p>';
    const month = todayStr().slice(0, 7), L = await realVsReporte(stores, month);
    if (!box.isConnected) return;
    const conReal = L.filter(x => x.real), alertas = L.filter(x => x.alerta);
    const pc = v => v == null ? '—' : Math.round(v * 100) + '%';
    const totR = conReal.reduce((a, x) => ({ inf: a.inf + x.real.inf, tot: a.tot + x.real.tot }), { inf: 0, tot: 0 });
    box.innerHTML = `
        <div class="zg-kpis" style="grid-template-columns:repeat(4,1fr)">
            <div class="hl"><span>Share real ${esc(label)}</span><b>${totR.tot ? pc(totR.inf / totR.tot) : '—'}</b><em>${totR.inf} de ${totR.tot} uds</em></div>
            <div><span>PDV con data real</span><b>${conReal.length}<small>/${L.length}</small></b><em>${RealData.docsFor(month).length} cadenas cargadas</em></div>
            <div><span>Alertas</span><b class="${alertas.length ? 'r' : 'g'}">${alertas.length}</b><em>reporte ≠ venta real</em></div>
            <div><span>Fuente</span><b style="font-size:16px">${conReal.length ? 'Data real' : 'Cierres'}</b><em>${conReal.length ? 'donde no hay, cierres del asesor' : 'aún no hay data real'}</em></div>
        </div>
        ${alertas.length ? `<h4 class="sec">⚠️ Tiendas con alerta por inconsistencia en el reporte de venta</h4>
        <div class="ds-list">${alertas.map(x => `<div class="ds-row"><span>${storeLogo(x.st, 'xs')} <b>${esc(x.st.tienda)}</b> <small class="mute">${x.cierres} cierres</small></span><em class="rv-dias r">${esc(x.alerta)}</em></div>`).join('')}</div>` : ''}
        <h4 class="sec">Market share por PDV</h4>
        <div class="tbl-scroll"><table class="tbl compact"><thead><tr><th>PDV</th><th>Fuente</th><th>Infinix</th><th>Total tienda</th><th>Share</th><th>Puesto</th><th>Reporte asesor</th><th>Share reportado</th><th>Top marcas</th></tr></thead><tbody>
        ${L.map(x => { const S = x.real || x.rep; return `<tr class="${x.alerta ? 'alert-row' : ''}"><td class="l">${storeLogo(x.st, 'xs')} <b>${esc(x.st.tienda)}</b></td><td>${x.fuente === 'real' ? '<i class="pill ok">Real</i>' : x.fuente ? '<i class="pill">Cierres</i>' : '—'}</td>
            <td><b>${S ? S.inf : '—'}</b></td><td>${S ? S.tot : '—'}</td><td><b>${S ? pc(S.share) : '—'}</b></td><td>${S && S.pos ? '#' + S.pos : '—'}</td><td>${x.rep ? x.rep.inf + ' / ' + x.rep.tot : '—'}</td><td>${x.rep ? pc(x.rep.share) : '—'}</td>
            <td class="l"><small>${S ? S.rank.slice(0, 4).map(([b, v]) => `${b === 'INFINIX' ? '<b>' + b + '</b>' : b} ${v}`).join(' · ') : '—'}</small></td></tr>`; }).join('')}</tbody></table></div>
        <p class="hint">Share = unidades Infinix ÷ unidades de la tienda. La data real la carga el coordinador por cadena; donde no hay, se usa lo que reportan los asesores en el cierre diario. Alerta: Infinix reportado distinto en 3 uds y 15% o más, share con 10 puntos de diferencia, o tienda sin cierres en el periodo de la data real.</p>`;
}

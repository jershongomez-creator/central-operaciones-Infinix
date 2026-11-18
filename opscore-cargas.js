// ============================================================================
// CARGAR DATOS · target del mes, malla de horarios y data plana
// + ESTADO DEL ASESOR EN EL DÍA (malla) Y NOVEDADES (manuales)
//
// Todo queda en el documento de cada tienda (colección stores, que todos escuchan en tiempo real):
//   st.malla      = { desde, hasta, file, at, by, data: JSON { 'Nombre': { 'YYYY-MM-DD': 'código|texto' } } }
//   st.novedades  = [{ id, nombre, tipo, desde, hasta, nota, by, rol, at }]
//   st.targetMes  = 'YYYY-MM' del target cargado (recordatorio del 1 al 5)
// Lo ajustado a mano (✋) se respeta mientras sea el mismo mes; un target de un mes nuevo reemplaza el anterior.
// ============================================================================

// ---------- Lectura de Excel (todas las hojas, valores ya calculados) ----------
const XL = {
    cell(v) {
        if (v == null) return '';
        if (v instanceof Date) return v;
        if (typeof v === 'object') {
            if (v.result !== undefined) return XL.cell(v.result);
            if (v.richText) return v.richText.map(t => t.text).join('');
            if (v.text !== undefined) return String(v.text);
            if (v.error) return '';
            return '';
        }
        return v;
    },
    async sheets(file) {
        if (typeof ExcelJS === 'undefined') throw new Error('La librería de Excel no cargó. Revisa la conexión y vuelve a intentar.');
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(await file.arrayBuffer());
        const out = [];
        wb.eachSheet(ws => {
            const rows = [];
            ws.eachRow({ includeEmpty: true }, (row, i) => { const vals = []; row.eachCell({ includeEmpty: true }, (c, j) => { vals[j - 1] = XL.cell(c.value); }); rows[i - 1] = vals; });
            out.push({ name: ws.name, rows: Array.from(rows, r => r || []) });
        });
        return out;
    },
    iso(v) {
        if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
        const s = String(v || '').trim(); let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
        m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if (m) return `${m[3]}-${pad2(+m[1])}-${pad2(+m[2])}`;       // malla: mes/día/año
        return '';
    },
    num: v => typeof v === 'number' ? v : (parseFloat(String(v || '').replace(/[^0-9.,-]/g, '').replace(',', '.')) || 0)
};

// ---------- Cruce de nombres de tienda (archivo → PDV de la app) ----------
const Match = (() => {
    const N = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
    const STOP = new Set(['TIENDA', 'ALMACEN', 'PDV', 'DE', 'LA', 'EL', 'LOS', 'LAS', 'DEL', 'CC', 'Y', 'CV', 'B', 'CENTRO', 'COMERCIAL']);
    const toks = s => N(s).split(' ').filter(t => t.length > 1 && !STOP.has(t));
    function chainHint(cad, tienda) {
        const c = N(cad) + ' ' + N(tienda);
        if (/EXITO/.test(c)) return ['exito'];
        if (/FALABELLA/.test(c)) return ['falabella'];
        if (/CENCOSUD|JUMBO|METRO/.test(c)) return ['cencosud'];
        if (/\bWOM\b/.test(c)) return ['wom'];
        if (/OLIMPICA/.test(c)) return ['olimpica'];
        if (/KTRONIX/.test(N(tienda))) return ['ktronix', 'alkosto'];
        if (/ALKOSTO|ALKSOTO|KTRONIX/.test(c)) return ['alkosto', 'ktronix'];
        return null;
    }
    function score(name, st) {
        const n = N(name), nt = toks(name); let best = 0;
        [st.tienda, st.usuario].filter(Boolean).forEach(c => {
            const cn = N(c), ct = toks(c);
            let sc = 0;
            if (cn === n) sc = 100;
            else if (n.length > 4 && (cn.includes(n) || n.includes(cn))) sc = 85;
            else {
                const hit = nt.filter(t => ct.some(x => x === t || (t.length >= 4 && x.length >= 4 && (x.startsWith(t) || t.startsWith(x))))).length;
                if (hit) sc = 40 + hit * 15 - Math.abs(ct.length - nt.length) * 3;
            }
            best = Math.max(best, sc);
        });
        return best;
    }
    // Busca primero en la zona del archivo y en la cadena indicada
    function store(name, { cadena, zona, stores }) {
        const hint = chainHint(cadena, name);
        let pool = stores.filter(s => !hint || hint.includes(normLogoKey(s.logoKey)));
        const z = N(zona); const inZone = z ? pool.filter(s => N(s.zona) === z || z.startsWith(N(s.zona)) || N(s.zona).startsWith(z)) : [];
        for (const P of [inZone, pool]) {
            let b = null, bs = 0; P.forEach(s => { const sc = score(name, s); if (sc > bs) { bs = sc; b = s; } });
            if (bs >= 55) return b;
        }
        return null;
    }
    const person = (a, b) => sameAdvisor({ nombre: a }, { nombre: b }) || nameSubset(a, b);
    return { N, store, chainHint, person };
})();

// ---------- Estado del asesor en un día: novedad manual > malla ----------
const DayStatus = (() => {
    const CODES = {
        comp: { label: 'Compensando', ico: '🟣', off: true }, desc: { label: 'Descanso', ico: '⚪', off: true },
        incap: { label: 'Incapacidad', ico: '🔴', off: true }, vac: { label: 'Vacaciones', ico: '🟠', off: true },
        permiso: { label: 'Permiso / licencia', ico: '🟡', off: true }, retiro: { label: 'Vacío laboral', ico: '⚫', off: true },
        vacante: { label: 'Vacante / en contratación', ico: '⚫', off: true }, apoyo: { label: 'Apoyo en otra tienda', ico: '🔵', off: true },
        cap: { label: 'Capacitación', ico: '🔵', off: true }, turno: { label: 'En turno', ico: '🟢', off: false }
    };
    const NOV_TIPOS = [
        ['incap', 'Incapacidad'], ['comp', 'Compensatorio'], ['desc', 'Descanso'], ['vac', 'Vacaciones'], ['permiso', 'Permiso / licencia'],
        ['calamidad', 'Calamidad doméstica'], ['cap', 'Capacitación'], ['apoyo', 'Apoyo en otra tienda'], ['retiro', 'Retiro / renuncia'],
        ['tarde', 'Llegada tarde'], ['otro', 'Otra novedad']
    ];
    const NOV_OFF = new Set(['incap', 'comp', 'desc', 'vac', 'permiso', 'calamidad', 'cap', 'apoyo', 'retiro']);
    const tipoLabel = t => (NOV_TIPOS.find(x => x[0] === t) || [, t])[1];
    // Texto de la celda de la malla → código
    function classify(v) {
        const t = Match.N(v); if (!t) return null;
        if (/COMPENSA/.test(t)) return 'comp';
        if (/DESCANS/.test(t)) return 'desc';
        if (/INCAPACI/.test(t)) return 'incap';
        if (/VACACION/.test(t)) return 'vac';
        if (/VACANTE|CONTRATACI|CONTATACI/.test(t)) return 'vacante';
        if (/VACIO|RETIR|RENUNCI/.test(t)) return 'retiro';
        if (/PERMISO|LICENCIA|CALAMIDAD/.test(t)) return 'permiso';
        if (/CAPACITA|FORMACION/.test(t)) return 'cap';
        if (/\d/.test(t)) return /^[0-9]/.test(t) || /^(AM|PM)/.test(t) ? 'turno' : 'apoyo';      // "PASEO 10-6" = apoyo en otra tienda
        return null;
    }
    const mallaOf = st => { if (!st || !st.malla || !st.malla.data) return null; if (st.__mallaRaw !== st.malla.data) { try { st.__malla = JSON.parse(st.malla.data); } catch (e) { st.__malla = {}; } st.__mallaRaw = st.malla.data; } return st.__malla; };
    function ofAdvisor(st, nombre, fecha = todayStr()) {
        if (!st) return null;
        const nv = (st.novedades || []).filter(n => n.desde <= fecha && (n.hasta || n.desde) >= fecha && Match.person(n.nombre, nombre)).sort((a, b) => b.at - a.at)[0];
        if (nv) return { src: 'novedad', code: nv.tipo, label: tipoLabel(nv.tipo), off: NOV_OFF.has(nv.tipo), ico: nv.tipo === 'tarde' || nv.tipo === 'otro' ? '🟡' : (CODES[nv.tipo] || { ico: '🔴' }).ico, nota: nv.nota || '', by: nv.by || '', nov: nv };
        const M = mallaOf(st); if (!M) return null;
        const k = Object.keys(M).find(n => Match.person(n, nombre)); if (!k) return null;
        const raw = M[k][fecha]; if (!raw) return null;
        const [code, txt] = String(raw).split('|'); const C = CODES[code]; if (!C) return null;
        return { src: 'malla', code, label: code === 'apoyo' ? 'Apoyo · ' + (txt || '') : C.label, off: C.off, ico: C.ico, nota: code === 'turno' ? (txt || '') : '', turno: code === 'turno' ? txt : '' };
    }
    // Asesores asignados de las tiendas que no están en el PDV ese día o tienen novedad
    function zoneDay(stores, fecha = todayStr()) {
        const out = [];
        stores.forEach(st => activeAdvisors(st).forEach(a => { const s = ofAdvisor(st, a.nombre, fecha); if (s && (s.off || s.src === 'novedad')) out.push({ st, nombre: a.nombre, s }); }));
        return out.sort((a, b) => (b.s.off - a.s.off) || a.st.tienda.localeCompare(b.st.tienda, 'es'));
    }
    const chip = s => s ? `<i class="ds-chip ${s.off ? 'off' : 'on'} ds-${esc(s.code)}" title="${esc(s.label + (s.nota ? ' · ' + s.nota : '') + (s.by ? ' · registró ' + s.by : ''))}">${s.ico} ${esc(s.label)}</i>` : '';
    // Novedad: formulario (supervisor, formador, coordinador, gerente, admin)
    function novForm(st, nombre, after) {
        if (!st) return;
        const L = (st.novedades || []).filter(n => Match.person(n.nombre, nombre)).sort((a, b) => b.desde.localeCompare(a.desde));
        const m = openModal(`<h3 class="modal-title">⚑ Novedad · ${esc(nombre)}</h3>
            <p class="mute">${esc(st.tienda)}. La ven todos los que consultan esta zona y sale en los reportes.</p>
            <div class="grid2"><div><label class="lbl">Tipo</label><select class="input" id="nv-t">${NOV_TIPOS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
            <div class="grid2"><div><label class="lbl">Desde</label><input class="input" type="date" id="nv-d" value="${todayStr()}"></div><div><label class="lbl">Hasta</label><input class="input" type="date" id="nv-h" value="${todayStr()}"></div></div></div>
            <label class="lbl">Detalle (opcional)</label><input class="input" id="nv-n" placeholder="Ej. incapacidad 3 días, regresa el lunes">
            ${L.length ? `<h4 class="sec">Novedades registradas</h4><table class="tbl compact"><tbody>${L.map(n => `<tr><td class="l"><b>${esc(tipoLabel(n.tipo))}</b> <small class="mute">${esc(n.desde.slice(5))}${n.hasta && n.hasta !== n.desde ? ' a ' + esc(n.hasta.slice(5)) : ''}${n.nota ? ' · ' + esc(n.nota) : ''} · ${esc(n.by || '')}</small></td><td class="acts"><button class="icon-btn" title="Quitar" data-nvdel="${esc(n.id)}">🗑️</button></td></tr>`).join('')}</tbody></table>` : ''}
            <div class="row end" style="margin-top:14px"><button class="btn btn-ghost" data-x>Cerrar</button><button class="btn btn-primary" data-ok>Guardar novedad</button></div>`);
        const save = async list => { if (!canWrite()) return false; const upd = { novedades: list, updatedAt: Date.now() }; Object.assign(st, upd); await Data.set(COL.stores, st.id, upd, true); return true; };
        $('[data-x]', m).onclick = () => closeModal(m);
        m.addEventListener('click', async e => { const b = e.target.closest('[data-nvdel]'); if (!b) return; if (await save((st.novedades || []).filter(n => n.id !== b.dataset.nvdel))) { closeModal(m); toast('Novedad quitada', 'ok'); if (after) after(); } });
        $('[data-ok]', m).onclick = async () => {
            const d = $('#nv-d', m).value, h = $('#nv-h', m).value || d; if (!d) return toast('Indica desde cuándo.', 'warn');
            const s = State.session, nv = { id: 'nv' + Date.now().toString(36), nombre, tipo: $('#nv-t', m).value, desde: d, hasta: h < d ? d : h, nota: $('#nv-n', m).value.trim(), by: s.nombre || '', rol: s.rol || '', at: Date.now() };
            // Se guardan las de los últimos 60 días: el documento no crece sin límite
            const keep = (st.novedades || []).filter(n => (n.hasta || n.desde) >= addDays(todayStr(), -60));
            if (await save(keep.concat(nv))) { closeModal(m); toast(`Novedad registrada: ${nombre} · ${tipoLabel(nv.tipo)}`, 'ok'); if (after) after(); }
        };
    }
    // Bloque para los lienzos de reporte (zona, plan, visita)
    function reportBlock(stores, fecha = todayStr(), title) {
        const L = zoneDay(stores, fecha); if (!L.length) return '';
        return `<div class="rp-sec">${esc(title || 'NOVEDADES Y ASESORES FUERA DEL PDV')} · ${esc(fechaLarga(fecha).toUpperCase())}</div>
            <table class="rp-tbl rp-nov"><thead><tr><th class="l">ASESOR</th><th class="l">TIENDA</th><th class="l">ESTADO</th><th class="l">DETALLE</th></tr></thead><tbody>
            ${L.map(x => `<tr><td class="l">${esc(x.nombre)}</td><td class="l">${esc(x.st.tienda)}</td><td class="l">${x.s.ico} ${esc(x.s.label)}</td><td class="l">${esc(x.s.nota || (x.s.src === 'malla' ? 'Según malla de horarios' : ''))}${x.s.by ? ' · ' + esc(x.s.by) : ''}</td></tr>`).join('')}</tbody></table>`;
    }
    return { CODES, NOV_TIPOS, classify, ofAdvisor, zoneDay, chip, novForm, reportBlock, tipoLabel, mallaOf };
})();

// ---------- Archivo de target del mes ----------
const TargetFile = (() => {
    // Encuentra la tabla: fila con ZONA y TIENDA y una columna TARGET
    function parse(sheets) {
        for (const sh of sheets) {
            const hi = sh.rows.findIndex(r => r.some(c => Match.N(c) === 'ZONA') && r.some(c => Match.N(c) === 'TIENDA') && r.some(c => /^TARGET/.test(Match.N(c))));
            if (hi < 0) continue;
            const H = sh.rows[hi].map(c => Match.N(c));
            const col = f => H.findIndex(f);
            const C = {
                zona: col(h => h === 'ZONA'), cadena: col(h => h === 'CADENA'), tienda: col(h => h === 'TIENDA'), hc: col(h => /^HC\b/.test(h)),
                base: col(h => /BASE ROI|ROI BASE/.test(h)), k400: col(h => /400/.test(h)), k700: col(h => /700/.test(h)), capa: col(h => /^CAPA/.test(h)), target: col(h => /^TARGET/.test(h))
            };
            const models = H.map((h, i) => i > C.target && !/SHARE|SUMA|TOTAL/.test(h) ? [i, ZoneData.matchModelName(sh.rows[hi][i])] : null).filter(x => x && x[1]);
            const rows = [];
            for (let i = hi + 1; i < sh.rows.length; i++) {
                const r = sh.rows[i], tienda = String(r[C.tienda] ?? '').trim();
                if (!tienda || /TOTAL/.test(Match.N(tienda)) || /TOTAL/.test(Match.N(r[C.zona]))) continue;
                const metas = {}; models.forEach(([j, k]) => { metas[k] = (metas[k] || 0) + Math.round(XL.num(r[j])); });
                const target = C.target >= 0 ? XL.num(r[C.target]) : sum(Object.values(metas));
                if (!target && !sum(Object.values(metas))) continue;
                rows.push({
                    zona: String(r[C.zona] || '').trim(), cadena: String(r[C.cadena] || '').trim(), tienda, target, metas,
                    hc: C.hc >= 0 ? XL.num(r[C.hc]) : null, kpi: C.base >= 0 ? { base: Math.round(XL.num(r[C.base])), k400: Math.round(XL.num(r[C.k400])), k700: Math.round(XL.num(r[C.k700])) } : null,
                    capa: C.capa >= 0 ? Math.round(XL.num(r[C.capa])) : 0
                });
            }
            if (rows.length) return { sheet: sh.name, rows, models: models.length };
        }
        throw new Error('No encontré la tabla de target: debe tener columnas ZONA, CADENA, TIENDA, HC y TARGET.');
    }
    // Cruza cada fila con un PDV. Las tiendas inhabilitadas que pasaron su target a otra suman en esa otra.
    function match(P) {
        const all = State.stores.concat(State.storesDeleted || []);
        P.rows.forEach(r => {
            let st = Match.store(r.tienda, { cadena: r.cadena, zona: r.zona, stores: all });
            r.disabled = null;
            if (st && st.deleted) { r.disabled = st; st = st.mergedInto ? storeById(st.mergedInto) : null; }
            r.st = st || null;
        });
        return P;
    }
    // Aplica al alcance del usuario. Mes nuevo = reemplaza; mismo mes = respeta lo ajustado a mano.
    async function apply(P, month, fileName, force) {
        const by = {}, me = State.session;
        P.rows.filter(r => r.st && inScope(r.st.zona)).forEach(r => {
            const g = by[r.st.id] = by[r.st.id] || { st: r.st, target: 0, metas: {}, hc: 0, hcSet: false, kpi: null, capa: 0, n: 0 };
            g.target += r.target; Object.entries(r.metas).forEach(([k, v]) => { g.metas[k] = (g.metas[k] || 0) + v; });
            if (r.hc != null) { g.hc += r.hc; g.hcSet = true; }
            if (r.kpi) g.kpi = g.kpi ? { base: g.kpi.base + r.kpi.base, k400: g.kpi.k400 + r.kpi.k400, k700: g.kpi.k700 + r.kpi.k700 } : { ...r.kpi };
            g.capa += r.capa; g.n++;
        });
        const ops = []; let kept = 0;
        Object.values(by).forEach(g => {
            const st = g.st, sameMonth = storeTargetMonth(st) === month;
            const upd = { metas: g.metas, metaMes: Math.round(g.target) || sum(Object.values(g.metas)), targetMes: month, targetFile: fileName, targetAt: Date.now(), targetBy: me.nombre, isConfigured: true, updatedAt: Date.now() };
            if (g.hcSet) upd.hc = { ...(st.hc || {}), INFINIX: Math.round(g.hc * 10) / 10 };
            if (g.kpi) upd.kpi = g.kpi;
            if (g.capa) upd.capa = g.capa;
            if (sameMonth && !force) {
                (st.manualFields || []).forEach(f => { if (f in upd) { delete upd[f]; kept++; } if (f === 'metas') delete upd.metaMes; });
            } else if (sameMonth) {                     // mismo mes, reemplazando lo manual: target, HC y ROI igual a la tabla (la meta por asesor se conserva)
                upd.manualFields = (st.manualFields || []).filter(f => !['metas', 'metaMes', 'hc', 'kpi'].includes(f));
            } else {
                upd.manualFields = (st.manualFields || []).filter(f => !['metas', 'metaMes', 'hc', 'kpi', 'metasAsesor'].includes(f));
                upd.metasAsesor = null;                 // mes nuevo: la meta de cada asesor sale del reparto hasta que se ajuste a mano
                upd.targetsAsesor = null;
            }
            Object.assign(st, upd); ops.push({ op: 'set', col: COL.stores, id: st.id, data: upd, merge: true });
        });
        ops.push({ op: 'set', col: COL.config, id: 'cargas', data: { target: { month, file: fileName, at: Date.now(), by: me.nombre, tiendas: ops.length } }, merge: true });
        const r = await Data.batch(ops);
        return { tiendas: ops.length - 1, kept, synced: r.synced };
    }
    return { parse, match, apply };
})();

// ---------- Malla de horarios ----------
const MallaFile = (() => {
    function parse(sheets) {
        const lo = addDays(todayStr(), -35), hi = addDays(todayStr(), 45);
        const out = [];               // { sheet, pdv, cadena, promotor, dias: { fecha: código|texto } }
        sheets.forEach(sh => {
            const hiRow = sh.rows.findIndex(r => r.some(c => Match.N(c) === 'PROMOTOR'));
            if (hiRow < 0) return;
            // Fila de fechas: la de arriba con más fechas
            let dRow = -1, best = 0;
            for (let i = Math.max(0, hiRow - 4); i < hiRow; i++) { const n = (sh.rows[i] || []).filter(c => XL.iso(c)).length; if (n > best) { best = n; dRow = i; } }
            if (dRow < 0 || best < 5) return;
            const dates = (sh.rows[dRow] || []).map(c => XL.iso(c));
            if (!dates.some(d => d && d >= lo && d <= hi)) return;                     // hoja vieja (2024, 2025…)
            const H = sh.rows[hiRow].map(c => Match.N(c));
            const cP = H.indexOf('PROMOTOR'), cT = H.findIndex(h => /^PUNTO DE VENTA|^TIENDA$|^PDV/.test(h)), cC = H.indexOf('CADENA');
            if (cP < 0 || cT < 0) return;
            for (let i = hiRow + 1; i < sh.rows.length; i++) {
                const r = sh.rows[i] || []; const first = Match.N(r[0]);
                if (/^TOTAL/.test(first)) break;
                const prom = String(r[cP] || '').trim(), pdv = String(r[cT] || '').trim();
                if (!prom || !pdv || /VACANTE/.test(Match.N(prom))) continue;
                const dias = {};
                dates.forEach((d, j) => { if (!d || d < lo || d > hi) return; const v = String(r[j] ?? '').trim(); const code = DayStatus.classify(v); if (code) dias[d] = code + '|' + v.replace(/\s+/g, ' ').slice(0, 28); });
                if (Object.keys(dias).length) out.push({ sheet: sh.name, pdv, cadena: cC >= 0 ? String(r[cC] || '').trim() : '', promotor: ZoneData.titleCase(prom.replace(/^\d{5,}\s+/, '')), dias });
            }
        });
        if (!out.length) throw new Error('No encontré la malla: debe tener la fila de fechas, la columna PROMOTOR y la de PUNTO DE VENTA, con días de este mes.');
        return out;
    }
    function match(rows) {
        rows.forEach(r => { const st = Match.store(r.pdv, { cadena: r.cadena, zona: '', stores: State.stores }); r.st = st && !st.deleted ? st : null; });
        return rows;
    }
    async function apply(rows, fileName) {
        const by = {}, me = State.session;
        rows.filter(r => r.st && inScope(r.st.zona)).forEach(r => { const g = by[r.st.id] = by[r.st.id] || { st: r.st, data: {} }; g.data[r.promotor] = { ...(g.data[r.promotor] || {}), ...r.dias }; });
        const ops = [];
        Object.values(by).forEach(g => {
            const ds = Object.values(g.data).flatMap(o => Object.keys(o)).sort();
            const malla = { desde: ds[0], hasta: ds[ds.length - 1], file: fileName, at: Date.now(), by: me.nombre, data: JSON.stringify(g.data) };
            g.st.malla = malla; ops.push({ op: 'set', col: COL.stores, id: g.st.id, data: { malla, updatedAt: Date.now() }, merge: true });
        });
        ops.push({ op: 'set', col: COL.config, id: 'cargas', data: { malla: { file: fileName, at: Date.now(), by: me.nombre, tiendas: ops.length } }, merge: true });
        const r = await Data.batch(ops);
        return { tiendas: ops.length - 1, synced: r.synced };
    }
    return { parse, match, apply };
})();

// ---------- Módulo: Cargar datos ----------
registerModule('datos', (() => {
    let cargas = null, tgt = null, tgtFile = '', mal = null, malFile = '', view = null;
    const me = () => State.session;
    const nextMonth = () => { const d = parseD(todayStr()); d.setDate(1); if (int(todayStr().slice(8)) > 20) d.setMonth(d.getMonth() + 1); return dstr(d).slice(0, 7); };
    const lastTxt = c => c ? `Última carga: <b>${esc(c.file || '')}</b> · ${esc(c.by || '')} · ${c.at ? fechaHora(c.at) : ''}${c.month ? ' · mes ' + esc(mesLargo(c.month)) : ''}` : 'Aún no se ha cargado.';

    async function render(v) {
        view = v;
        const months = [-1, 0, 1].map(k => { const d = parseD(todayStr()); d.setDate(1); d.setMonth(d.getMonth() + k); return dstr(d).slice(0, 7); });
        v.innerHTML = `
        <section class="card">
            <h2 class="h2">Cargar datos</h2>
            <p class="mute">Aquí se carga lo que alimenta la app mes a mes y semana a semana: target y malla de horarios. Lo que se cargue lo ven al instante todos los usuarios de la zona. La venta (data plana DCR) se carga en el <b>Análisis de zona</b>.</p>
        </section>
        <section class="card up-card">
            <div class="up-h"><span class="up-ico">🎯</span><div><h3 class="h3">Target del mes · una vez al mes</h3><p class="mute">El Excel de target (ZONA, CADENA, TIENDA, HC, ROI, TARGET y una columna por referencia). Actualiza target por referencia, HC y umbrales ROI de cada PDV de tu alcance.</p><p class="hint" id="up-tgt-last"></p></div></div>
            <div class="row wrap end" style="gap:8px"><label class="lbl" style="margin:0">Mes del target</label><select class="input" id="up-tgt-m">${months.map(x => `<option value="${x}" ${x === nextMonth() ? 'selected' : ''}>${esc(mesLargo(x))}</option>`).join('')}</select>
                <label class="btn btn-dark">📂 Elegir Excel de target<input type="file" id="up-tgt" accept=".xlsx" hidden></label></div>
            <div id="up-tgt-out"></div>
        </section>
        <section class="card up-card">
            <div class="up-h"><span class="up-ico">🗓️</span><div><h3 class="h3">Malla de horarios · cada semana</h3><p class="mute">El Excel de la malla (todas las hojas de zona). La app toma los días de este mes: turnos, <b>compensatorios</b>, descansos, incapacidades, vacaciones y apoyos en otra tienda.</p><p class="hint" id="up-mal-last"></p></div></div>
            <div class="row end"><label class="btn btn-dark">📂 Elegir Excel de malla<input type="file" id="up-mal" accept=".xlsx" hidden></label></div>
            <div id="up-mal-out"></div>
        </section>
        <section class="card" id="up-hoy"></section>`;
        $('#up-tgt', v).onchange = e => onTarget(e.target.files[0]);
        $('#up-mal', v).onchange = e => onMalla(e.target.files[0]);
        paintHoy();
        try { cargas = await Data.get(COL.config, 'cargas'); } catch (e) { cargas = null; }
        if ($('#up-tgt-last')) { $('#up-tgt-last').innerHTML = lastTxt(cargas && cargas.target); $('#up-mal-last').innerHTML = lastTxt(cargas && cargas.malla); }
    }

    // ---- Target
    async function onTarget(file) {
        if (!file) return; const out = $('#up-tgt-out'); out.innerHTML = '<p class="hint">Leyendo el archivo…</p>';
        try { tgt = TargetFile.match(TargetFile.parse(await XL.sheets(file))); tgtFile = file.name; paintTarget(); }
        catch (e) { console.error(e); out.innerHTML = `<p class="err">${esc(e.message || e)}</p>`; }
    }
    function paintTarget() {
        const out = $('#up-tgt-out'); if (!out || !tgt) return;
        const mine = tgt.rows.filter(r => r.st ? inScope(r.st.zona) : true);
        const unm = tgt.rows.filter(r => !r.st && !r.disabled);
        const byZ = {}; mine.filter(r => r.st).forEach(r => { const z = byZ[r.st.zona] = byZ[r.st.zona] || { file: 0, now: 0, n: 0, ids: new Set() }; z.file += r.target; z.n++; if (!z.ids.has(r.st.id)) { z.ids.add(r.st.id); z.now += storeMetaMes(r.st); } });
        const month = $('#up-tgt-m').value;
        out.innerHTML = `<div class="up-sum"><b>${tgt.rows.length}</b> filas en «${esc(tgt.sheet)}» · <b>${mine.filter(r => r.st).length}</b> de tu alcance cruzadas · ${unm.length ? `<b class="warn-t">${unm.length} sin cruzar</b>` : 'todas cruzadas'}</div>
            <div class="tbl-scroll"><table class="tbl compact"><thead><tr><th>Zona</th><th>PDV</th><th>Target archivo</th><th>Target actual</th></tr></thead><tbody>
            ${Object.entries(byZ).sort().map(([z, x]) => `<tr><td class="l"><b>${esc(z)}</b></td><td>${x.n}</td><td><b>${Math.round(x.file)}</b> <small class="mute">(${fmt1(x.file)})</small></td><td>${x.now}</td></tr>`).join('') || '<tr><td colspan="4">Ninguna fila del archivo es de tu alcance.</td></tr>'}</tbody></table></div>
            <details class="up-det"><summary>Ver tienda por tienda</summary><div class="tbl-scroll"><table class="tbl compact"><thead><tr><th>Archivo</th><th>PDV en la app</th><th>HC</th><th>Target</th></tr></thead><tbody>
            ${mine.map(r => `<tr><td class="l">${esc(r.tienda)} <small class="mute">· ${esc(r.cadena)}</small></td><td class="l">${r.st ? esc(r.st.tienda) + (r.disabled ? ` <small class="mute">(recibe a ${esc(r.disabled.tienda)})</small>` : '') + (storeTargetMonth(r.st) === month && (r.st.manualFields || []).length ? ' <i class="pill man">✋ se respeta</i>' : '') : r.disabled ? `<i class="pill off">inhabilitada · se descuenta</i>` : '<i class="pill warn">sin cruzar</i>'}</td><td>${r.hc ?? '—'}</td><td>${Math.round(r.target)}</td></tr>`).join('')}</tbody></table></div></details>
            ${unm.length ? `<p class="hint">Sin cruzar: ${unm.slice(0, 12).map(r => esc(r.tienda + ' (' + r.zona + ')')).join(', ')}${unm.length > 12 ? '…' : ''}. Si son de tu zona, revisa que la tienda exista en Gestión.</p>` : ''}
            ${(() => { const nMan = new Set(mine.filter(r => r.st && storeTargetMonth(r.st) === month && (r.st.manualFields || []).length).map(r => r.st.id)).size; return nMan ? `<label class="remember"><input type="checkbox" id="up-tgt-force"><span>Reemplazar también lo ajustado a mano (${nMan} PDV con ✋): todo queda igual a la tabla</span></label>` : ''; })()}
            <div class="row end" style="margin-top:10px"><button class="btn btn-primary" id="up-tgt-ok">✅ Aplicar target de ${esc(mesLargo(month))}</button></div>`;
        $('#up-tgt-ok').onclick = async e => {
            if (!canWrite()) return;
            const month = $('#up-tgt-m').value;
            if (!await confirmBox(`Se actualizan target, HC y ROI de ${new Set(mine.filter(r => r.st).map(r => r.st.id)).size} PDV para ${mesLargo(month)}. ${Object.entries(byZ).map(([z, x]) => `${z}: ${Math.round(x.file)}`).join(' · ')}. ¿Aplicar?`, 'Aplicar')) return;
            busy(e.currentTarget, true);
            try { const r = await TargetFile.apply(tgt, month, tgtFile, !!($('#up-tgt-force') && $('#up-tgt-force').checked)); toast(`Target de ${mesLargo(month)} aplicado a ${r.tiendas} PDV${r.kept ? ` · ${r.kept} ajustes manuales respetados` : ''}`, 'ok', 6000); tgt = null; render(view); renderHeader(); }
            finally { busy(e.currentTarget, false); }
        };
        $('#up-tgt-m').onchange = paintTarget;
    }

    // ---- Malla
    async function onMalla(file) {
        if (!file) return; const out = $('#up-mal-out'); out.innerHTML = '<p class="hint">Leyendo la malla…</p>';
        try { mal = MallaFile.match(MallaFile.parse(await XL.sheets(file))); malFile = file.name; paintMalla(); }
        catch (e) { console.error(e); out.innerHTML = `<p class="err">${esc(e.message || e)}</p>`; }
    }
    function paintMalla() {
        const out = $('#up-mal-out'); if (!out || !mal) return;
        const mine = mal.filter(r => r.st && inScope(r.st.zona)), unm = mal.filter(r => !r.st);
        const hoy = todayStr(), off = mine.filter(r => { const c = (r.dias[hoy] || '').split('|')[0]; return c && c !== 'turno'; });
        out.innerHTML = `<div class="up-sum"><b>${mal.length}</b> asesores en la malla (${[...new Set(mal.map(r => r.sheet))].map(esc).join(', ')}) · <b>${mine.length}</b> de tu alcance en ${new Set(mine.map(r => r.st.id)).size} PDV${unm.length ? ` · <b class="warn-t">${unm.length} sin cruzar</b>` : ''}</div>
            ${off.length ? `<p><b>Hoy no están en el PDV:</b> ${off.map(r => `${esc(r.promotor)} <small class="mute">(${esc(r.st.tienda)} · ${esc(DayStatus.CODES[r.dias[hoy].split('|')[0]].label)})</small>`).join(' · ')}</p>` : '<p class="hint">Hoy todos los asesores de tu alcance tienen turno.</p>'}
            ${unm.length ? `<p class="hint">Sin cruzar (no se reconoce la tienda): ${unm.slice(0, 10).map(r => esc(r.pdv + ' · ' + r.promotor)).join(', ')}${unm.length > 10 ? '…' : ''}</p>` : ''}
            <div class="row end" style="margin-top:10px"><button class="btn btn-primary" id="up-mal-ok">✅ Aplicar malla</button></div>`;
        $('#up-mal-ok').onclick = async e => {
            if (!canWrite()) return;
            busy(e.currentTarget, true);
            try { const r = await MallaFile.apply(mal, malFile); toast(`Malla aplicada en ${r.tiendas} PDV`, 'ok'); mal = null; render(view); }
            finally { busy(e.currentTarget, false); }
        };
    }

    // ---- Hoy y mañana: quién no está en el PDV + novedades
    function paintHoy() {
        const box = $('#up-hoy'); if (!box) return;
        const S = scopedStores(), hoy = todayStr(), man = addDays(hoy, 1);
        const H = DayStatus.zoneDay(S, hoy), M = DayStatus.zoneDay(S, man);
        const list = (L, f) => L.length ? `<div class="ds-list">${L.map(x => `<div class="ds-row"><span><b>${esc(x.nombre)}</b> <small class="mute">${esc(x.st.tienda)}</small></span>${DayStatus.chip(x.s)}<button class="icon-btn" title="Registrar novedad" data-nv="${esc(x.st.id)}|${esc(x.nombre)}">⚑</button></div>`).join('')}</div>` : `<p class="hint">Todos en el PDV ${f}.</p>`;
        box.innerHTML = `<h3 class="h3">👥 Asesores fuera del PDV y novedades</h3>
            <div class="grid2"><div><h4 class="sec">Hoy · ${esc(fechaLarga(hoy))}</h4>${list(H, 'hoy')}</div><div><h4 class="sec">Mañana · ${esc(fechaLarga(man))}</h4>${list(M, 'mañana')}</div></div>
            <div class="row end" style="margin-top:8px"><button class="btn btn-ghost" id="up-nv-new">⚑ Registrar novedad de un asesor</button></div>`;
        box.onclick = e => {
            const b = e.target.closest('[data-nv]'); if (b) { const [sid, n] = b.dataset.nv.split('|'); return DayStatus.novForm(storeById(sid), n, paintHoy); }
            if (e.target.closest('#up-nv-new')) pickAdvisor(paintHoy);
        };
    }
    return { render, onData: () => paintHoy() };
})());

// Elegir asesor (tienda → asesor) para registrar una novedad desde cualquier pantalla
function pickAdvisor(after) {
    const S = scopedStores().filter(st => activeAdvisors(st).length);
    const m = openModal(`<h3 class="modal-title">⚑ Registrar novedad</h3>
        <input class="input" id="pa-q" placeholder="Buscar asesor o tienda…" style="margin-bottom:8px">
        <div class="ds-list" id="pa-l" style="max-height:55vh;overflow:auto">${S.flatMap(st => activeAdvisors(st).map(a => `<div class="ds-row" data-q="${esc(slug(a.nombre + ' ' + st.tienda))}"><span><b>${esc(a.nombre)}</b> <small class="mute">${esc(st.tienda)}</small></span>${DayStatus.chip(DayStatus.ofAdvisor(st, a.nombre))}<button class="btn btn-ghost sm" data-pk="${esc(st.id)}|${esc(a.nombre)}">Elegir</button></div>`)).join('')}</div>
        <div class="row end" style="margin-top:10px"><button class="btn btn-ghost" data-x>Cerrar</button></div>`);
    $('[data-x]', m).onclick = () => closeModal(m);
    $('#pa-q', m).oninput = e => { const q = slug(e.target.value); $$('#pa-l .ds-row', m).forEach(r => { r.hidden = !!q && !r.dataset.q.includes(q); }); };
    $('#pa-l', m).onclick = e => { const b = e.target.closest('[data-pk]'); if (!b) return; const [sid, n] = b.dataset.pk.split('|'); closeModal(m); DayStatus.novForm(storeById(sid), n, after); };
}

// ⚑ en cualquier lista de asesores: registra una novedad y repinta la pantalla actual
document.addEventListener('click', e => {
    const b = e.target.closest('[data-nvd], [data-nvnew]'); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const after = () => { if (State.tab && !$('#modal-root').children.length) navigate(State.tab); };
    if (b.dataset.nvnew !== undefined) return pickAdvisor(after);
    const [sid, n] = b.dataset.nvd.split('|'); DayStatus.novForm(storeById(sid), n, after);
}, true);

// ============================================================================
// MÓDULO 8 · EVALUACIONES (Formador; también Coordinador y Administrador)
// Se cargan hasta 5 datas planas de evaluaciones (una por semana: W45, W46…)
// con nombre, cédula y nota de cada asesor. La app las cruza con los asesores
// de los PDV del alcance (cédula primero, nombre después, aunque vengan mal
// escritos) y entrega: quién presentó, quién falta, quién repitió, notas,
// promedio, y la lista de pendientes para el plan de trabajo.
// ============================================================================

const Evals = (() => {
    const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
    const digits = s => String(s ?? '').replace(/\D+/g, '');
    const ROLE = {
        name: ['NOMBREDELASESOR', 'NOMBREASESOR', 'NOMBRECOMPLETO', 'NOMBRE', 'ASESOR', 'PROMOTOR', 'PARTICIPANTE', 'USUARIO', 'ESTUDIANTE', 'NAME', 'FULLNAME', 'COLABORADOR'],
        doc: ['CEDULA', 'DOCUMENTO', 'IDENTIFICACION', 'NUMERODEDOCUMENTO', 'NUMERODECEDULA', 'CC', 'DNI', 'NIT', 'ID', 'CODIGO'],
        score: ['NOTA', 'CALIFICACION', 'PUNTAJE', 'PUNTUACION', 'SCORE', 'RESULTADO', 'PORCENTAJE', 'TOTAL', 'PUNTOS', 'GRADE'],
        date: ['MARCATEMPORAL', 'TIMESTAMP', 'FECHA', 'DATE', 'HORA'],
        store: ['PUNTODEVENTA', 'TIENDA', 'PDV', 'ALMACEN', 'SHOPNAME', 'STORE'],
        test: ['EVALUACION', 'PRUEBA', 'CURSO', 'TEMA', 'QUIZ', 'TITULO', 'FORMULARIO', 'MODULO'],
        email: ['CORREO', 'EMAIL', 'MAIL']
    };
    const PRIORITY = ['name', 'doc', 'score', 'date', 'store', 'test', 'email'];
    const nk = h => norm(h).replace(/ /g, '');
    function guessMapping(headers) {
        const map = {}, used = new Set();
        PRIORITY.forEach(role => {
            let best = -1, bestScore = 0;
            headers.forEach((h, i) => {
                if (used.has(i)) return; const n = nk(h); if (!n) return;
                ROLE[role].forEach((k, ki) => { const sc = n === k ? 100 - ki : n.includes(k) ? 60 - ki : 0; if (sc > bestScore) { bestScore = sc; best = i; } });
            });
            if (best >= 0) { map[role] = best; used.add(best); }
        });
        return map;
    }
    // Universo de asesores del alcance: configurados en la tienda (con cédula si la hay) + los de la data de zona
    function roster(zonas) {
        const out = [];
        State.stores.filter(s => zonas.includes(s.zona) && chainOn(s)).forEach(st => {
            // Solo asesores activos (los retirados no se evalúan ni salen como pendientes)
            activeAdvisors(st).forEach(a => out.push({ nombre: a.nombre, cedula: digits(a.cedula || ''), storeId: st.id, tienda: st.tienda, zona: st.zona, key: `${st.id}|${slug(a.nombre)}` }));
        });
        return out;
    }
    const toks = s => norm(s).split(' ').filter(t => t.length > 2);
    // Distancia de edición entre dos cédulas (Damerau: incluye dígitos invertidos)
    function digitDist(a, b) {
        if (Math.abs(a.length - b.length) > 1) return 9;
        const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
        for (let j = 1; j <= b.length; j++) d[0][j] = j;
        for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
            d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        }
        return d[a.length][b.length];
    }
    function sameName(a, b) {
        const A = norm(a), B = norm(b); if (!A || !B) return false;
        if (A === B || A.includes(B) || B.includes(A)) return true;
        const ta = toks(A), tb = toks(B); const hit = ta.filter(t => tb.includes(t)).length;
        return hit >= 2 || (hit === 1 && Math.min(ta.length, tb.length) === 1);
    }
    // Empareja una fila (nombre, cédula) con el roster: cédula exacta → nombre → nombre parcial
    function matchRow(nombre, cedula, R) {
        const c = digits(cedula);
        if (c.length >= 5) { const byDoc = R.filter(a => a.cedula === c); if (byDoc.length) return { a: byDoc[0], how: 'cedula' }; }
        const n = norm(nombre);
        // Cédula mal digitada (un dígito de más, de menos, cambiado o dos invertidos): vale si el nombre también se parece o si no hay nombre
        if (c.length >= 6) {
            const near = R.filter(a => a.cedula && a.cedula.length >= 6 && digitDist(a.cedula, c) <= 1);
            const ok = near.filter(a => !n || toks(a.nombre).some(t => toks(n).includes(t)));
            if (ok.length === 1) return { a: ok[0], how: 'cedula~' };
        }
        if (!n) return null;
        let exact = R.filter(a => norm(a.nombre) === n); if (exact.length) return { a: exact[0], how: 'nombre' };
        const tb = toks(n);
        let best = null, bestHit = 0;
        R.forEach(a => { const ta = toks(a.nombre); const hit = ta.filter(t => tb.includes(t)).length; if (hit > bestHit) { bestHit = hit; best = a; } });
        if (best && (bestHit >= 2 || (bestHit === 1 && tb.length <= 2))) return { a: best, how: 'parcial' };
        return null;
    }
    const parseScore = v => { const s = String(v ?? '').trim(); if (!s) return null; const m = s.match(/(\d+(?:[.,]\d+)?)\s*(?:\/\s*(\d+))?/); if (!m) return null; let n = parseFloat(m[1].replace(',', '.')); if (m[2]) n = n / parseFloat(m[2]) * 100; else if (n <= 5) n = n * 20; else if (n <= 10 && !/%/.test(s)) n = n * 10; return Math.round(Math.min(100, n)); };

    // Columnas con nota por tema o módulo: encabezado que no es de datos personales y casi todas las celdas son notas (8/10, 80 %, 4,5)
    const NUM_STRICT = /^\s*\d+(?:[.,]\d+)?\s*(?:\/\s*\d+|%)?\s*$/;
    const SKIP_HDR = /EDAD|TELEFONO|CELULAR|CEDULA|DOCUMENTO|ZONA|CIUDAD|FECHA|HORA|MARCA TEMPORAL|\bANO\b|TOTAL|NOTA|PUNTAJE|PUNTUACION|CALIFICACION|INTENTO|DURACION|TIEMPO|IDENTIFICACION|CODIGO| ID$|^ID /;
    function detectTemaCols(headers, rows, map) {
        const used = new Set(Object.values(map));
        const out = [];
        headers.forEach((h, i) => {
            if (used.has(i) || !String(h || '').trim() || SKIP_HDR.test(norm(h))) return;
            const vals = rows.map(r => String(r[i] ?? '').trim()).filter(Boolean);
            if (vals.length < 3) return;
            const nums = vals.filter(v => NUM_STRICT.test(v));
            if (nums.length / vals.length >= 0.7) out.push(i);
        });
        return out;
    }
    // Procesa un archivo de una semana: devuelve { rows: [{nombre, cedula, nota, fecha, test, match}], unmatched, matchedN }
    async function processFile(file, R) {
        const parsed = await ZoneData.readFile(file);
        const map = guessMapping(parsed.headers);
        if (map.name === undefined && map.doc === undefined) throw new Error('No encontré columnas de nombre ni cédula. Encabezados: ' + parsed.headers.filter(Boolean).slice(0, 8).join(', '));
        const get = (r, role) => map[role] === undefined ? '' : String(r[map[role]] ?? '').trim();
        const rows = [], unmatched = {};
        const temaCols = detectTemaCols(parsed.headers, parsed.rows, map);
        parsed.rows.forEach(r => {
            const nombre = get(r, 'name'), cedula = get(r, 'doc'); if (!nombre && !cedula) return;
            const nota = map.score !== undefined ? parseScore(get(r, 'score')) : null;
            const m = matchRow(nombre, cedula, R);
            // El mismo asesor puede estar en dos PDV (misma cédula o mismo nombre): la evaluación cuenta en todos
            const keys = m ? R.filter(a => a === m.a || (m.a.cedula && a.cedula === m.a.cedula) || norm(a.nombre) === norm(m.a.nombre)).map(a => a.key) : [];
            const row = { nombre, cedula: digits(cedula), nota, fecha: get(r, 'date').slice(0, 16), test: get(r, 'test'), key: m ? m.a.key : '', keys, how: m ? m.how : '' };
            if (temaCols.length) { const tm = {}; temaCols.forEach(i => { const v = String(r[i] ?? '').trim(); if (v && NUM_STRICT.test(v)) tm[String(parsed.headers[i]).trim().slice(0, 60)] = parseScore(v); }); if (Object.keys(tm).length) row.temas = tm; }
            rows.push(row);
            if (!m) { const k = nombre || cedula; unmatched[k] = (unmatched[k] || 0) + 1; }
        });
        return { fileName: file.name, temaCols: temaCols.map(i => parsed.headers[i]), headers: parsed.headers, columns: Object.fromEntries(Object.entries(map).map(([k, v]) => [k, parsed.headers[v]])), rows, unmatched, matchedN: rows.filter(r => r.key).length, total: rows.length };
    }

    // Consolidado: por asesor y semana, intentos y notas
    function summarize(weeks, R, weekKeys) {
        const byKey = Object.fromEntries(R.map(a => [a.key, { ...a, weeks: {} }]));
        weekKeys.forEach(w => { const W = weeks[w]; if (!W) return; W.rows.forEach(r => { (r.keys && r.keys.length ? r.keys : [r.key]).forEach(k => { if (!k || !byKey[k]) return; const slot = byKey[k].weeks[w] = byKey[k].weeks[w] || { intentos: [], best: null, last: null }; slot.intentos.push({ nota: r.nota, fecha: r.fecha, test: r.test }); if (r.nota != null) { slot.best = slot.best == null ? r.nota : Math.max(slot.best, r.nota); slot.last = r.nota; } }); }); });
        const advisors = Object.values(byKey).sort((a, b) => (a.tienda + a.nombre).localeCompare(b.tienda + b.nombre, 'es'));
        const loaded = weekKeys.filter(w => weeks[w]);
        const perWeek = loaded.map(w => {
            const done = advisors.filter(a => a.weeks[w]), rep = done.filter(a => a.weeks[w].intentos.length > 1), notas = done.map(a => a.weeks[w].best).filter(n => n != null);
            return { w, done: done.length, pend: advisors.length - done.length, rep: rep.length, prom: notas.length ? Math.round(sum(notas) / notas.length) : null, bajo: done.filter(a => a.weeks[w].best != null && a.weeks[w].best < 70).length, pendientes: advisors.filter(a => !a.weeks[w]) };
        });
        const cur = loaded[loaded.length - 1] || null;
        const stores = {};
        advisors.forEach(a => { const S = stores[a.storeId] = stores[a.storeId] || { storeId: a.storeId, tienda: a.tienda, zona: a.zona, asesores: [] }; S.asesores.push(a); });
        const allNotas = advisors.flatMap(a => Object.values(a.weeks).map(s => s.best).filter(n => n != null));
        return { advisors, perWeek, cur, loaded, stores: Object.values(stores), prom: allNotas.length ? Math.round(sum(allNotas) / allNotas.length) : null, nunca: advisors.filter(a => !Object.keys(a.weeks).length) };
    }

    // ---- Persistencia por zona y mes ----------------------------------------
    const docId = (zona, month) => `${slug(zona)}_${month}`;
    const cache = {};
    async function load(zonas, month) {
        const docs = await Promise.all(zonas.map(z => Data.get(COL.evalData, docId(z, month)).catch(() => null)));
        zonas.forEach((z, i) => { if (docs[i]) cache[docId(z, month)] = docs[i]; });
        return Object.fromEntries(zonas.map((z, i) => [z, docs[i] || cache[docId(z, month)] || null]));
    }
    // Guarda las semanas cargadas repartidas por zona (cada fila va a la zona de su asesor)
    async function save(zonas, month, weeks, meta) {
        const ops = [];
        zonas.forEach(z => {
            const wz = {};
            Object.entries(weeks).forEach(([w, W]) => { if (!W) return; const rows = W.rows.filter(r => (r.keys && r.keys.length ? r.keys : [r.key]).some(k => k && (storeById(k.split('|')[0]) || {}).zona === z)); const unm = zonas.length === 1 ? W.unmatched : {}; if (rows.length || zonas.length === 1) wz[w] = { fileName: W.fileName, columns: W.columns, rows, unmatched: unm, total: W.total, matchedN: W.matchedN, uploadedAt: W.uploadedAt || Date.now(), uploadedBy: W.uploadedBy || (meta && meta.uploadedBy) || '' }; });
            if (!Object.keys(wz).length) return;
            const prev = cache[docId(z, month)] || {};
            const doc = { ...prev, id: docId(z, month), zona: z, month, weeks: { ...(prev.weeks || {}), ...wz }, ...meta, updatedAt: Date.now() };
            cache[doc.id] = doc; ops.push({ op: 'set', col: COL.evalData, id: doc.id, data: doc, merge: false });
        });
        return ops.length ? Data.batch(ops) : { synced: true };
    }
    // Quita una semana guardada (en todas las zonas del alcance)
    async function removeWeek(zonas, month, w) {
        const ops = [];
        zonas.forEach(z => { const d = cache[docId(z, month)]; if (!d || !d.weeks || !d.weeks[w]) return; const weeks = { ...d.weeks }; delete weeks[w]; const doc = { ...d, weeks, updatedAt: Date.now() }; cache[doc.id] = doc; ops.push({ op: 'set', col: COL.evalData, id: doc.id, data: doc, merge: false }); });
        return ops.length ? Data.batch(ops) : { synced: true };
    }
    // Pendientes de la última semana cargada para una tienda (lo usa el plan de trabajo)
    function pendingFor(storeId, month) {
        const st = storeById(storeId); if (!st) return null;
        month = month || todayStr().slice(0, 7);
        const d = cache[docId(st.zona, month)]; if (!d || !d.weeks) return null;
        const ws = Object.keys(d.weeks).sort(); const w = ws[ws.length - 1]; if (!w) return null;
        const R = roster([st.zona]).filter(a => a.storeId === storeId); if (!R.length) return null;
        const done = new Set(d.weeks[w].rows.flatMap(r => r.keys && r.keys.length ? r.keys : [r.key]));
        const notas = d.weeks[w].rows.filter(r => (r.keys || [r.key]).some(k => R.some(a => a.key === k)) && r.nota != null);
        return { week: w, pendientes: R.filter(a => !done.has(a.key)).map(a => a.nombre), hechas: R.filter(a => done.has(a.key)).map(a => a.nombre), prom: notas.length ? Math.round(sum(notas.map(n => n.nota)) / notas.length) : null };
    }
    // Nombre de tema a partir del archivo cuando la data no trae columna de tema: "Evaluacion_Note_60_W46.xlsx" → "Evaluacion Note 60"
    const temaDeArchivo = f => String(f || '').replace(/\.[a-z0-9]+$/i, '').replace(/[_\-]+/g, ' ').replace(/\bW\d{1,2}\b/gi, '').replace(/\s+/g, ' ').trim();
    // Evaluación de un asesor (mes en curso): última nota, notas por semana y temas donde sacó menos de notaMin
    function forAdvisor(storeId, nombre, cedula, month) {
        const st = storeById(storeId); if (!st) return null;
        month = month || todayStr().slice(0, 7);
        const d = cache[docId(st.zona, month)]; if (!d || !d.weeks) return null;
        const ws = Object.keys(d.weeks).sort(); if (!ws.length) return null;
        const probe = { nombre, cedula };
        const key = `${storeId}|${slug(nombre)}`;
        const mine = r => (r.keys && r.keys.includes(key)) || r.key === key || sameAdvisor({ nombre: r.nombre, cedula: r.cedula }, probe);
        const notaMin = int(State.radar.notaMin) || 80;
        const porSemana = {}; let last = null;
        ws.forEach(w => {
            const rows = d.weeks[w].rows.filter(mine); if (!rows.length) return;
            const best = rows.filter(r => r.nota != null).sort((a, b) => b.nota - a.nota)[0] || rows[0];
            porSemana[w] = { nota: best.nota, intentos: rows.length, test: best.test || '', temas: best.temas || null, fileName: d.weeks[w].fileName || '' };
            last = { w, ...porSemana[w] };
        });
        const semanaActual = ws[ws.length - 1];
        const notas = Object.values(porSemana).map(x => x.nota).filter(n => n != null);
        const promedio = notas.length ? Math.round(sum(notas) / notas.length) : null;
        if (!last) return { hecha: false, semana: semanaActual, semanaActual, nota: null, porSemana, cargadas: ws, promedio, temasDebiles: [], bajo: false, pendiente: true };
        const temasDebiles = [];
        if (last.temas) Object.entries(last.temas).filter(([, n]) => n != null && n < notaMin).sort((a, b) => a[1] - b[1]).forEach(([tema, nota]) => temasDebiles.push({ tema, nota }));
        if (!temasDebiles.length && last.nota != null && last.nota < notaMin) temasDebiles.push({ tema: last.test || temaDeArchivo(last.fileName) || `Evaluación ${last.w}`, nota: last.nota });
        return { hecha: last.w === semanaActual, semana: last.w, semanaActual, nota: last.nota, intentos: last.intentos, porSemana, cargadas: ws, promedio, temasDebiles, bajo: last.nota != null && last.nota < notaMin, pendiente: last.w !== semanaActual };
    }
    // Carga las evaluaciones guardadas de las zonas (para que el radar y la ficha las tengan sin abrir la pestaña Evaluaciones)
    const ensureLoaded = (zonas, month) => load(zonas.filter(Boolean), month || todayStr().slice(0, 7)).catch(() => ({}));

    // Tarjeta resumen para el Análisis de zona del formador
    function zoneCardHTML(zonas) {
        const month = todayStr().slice(0, 7);
        const docs = zonas.map(z => cache[docId(z, month)]).filter(Boolean);
        if (!docs.length) return `<section class="card"><h3 class="h3">🎓 Evaluaciones</h3><p class="mute">Aún no hay evaluaciones cargadas este mes. Súbelas en la pestaña <b>Evaluaciones</b> y aquí verás quién falta.</p></section>`;
        const weeks = {}; docs.forEach(d => Object.entries(d.weeks || {}).forEach(([w, W]) => { weeks[w] = weeks[w] || { rows: [], fileName: W.fileName }; weeks[w].rows.push(...W.rows); }));
        const R = roster(zonas), S = summarize(weeks, R, Object.keys(weeks).sort());
        const cur = S.perWeek[S.perWeek.length - 1];
        return `<section class="card"><h3 class="h3">🎓 Evaluaciones <small class="mute">${cur ? cur.w : ''}</small></h3>
            <div class="row wrap" style="gap:8px">${S.perWeek.map(p => `<div class="achip ${p.pend ? 'warn' : 'ok'}"><small>${p.w}</small><b>${p.done}/${R.length}</b></div>`).join('')}<div class="achip hl"><small>Promedio</small><b>${S.prom == null ? '—' : S.prom}</b></div></div>
            ${cur && cur.pend ? `<p class="hint" style="margin-top:8px"><b>Pendientes ${cur.w}:</b> ${cur.pendientes.slice(0, 12).map(a => `${esc(a.nombre)} (${esc(a.tienda)})`).join(', ')}${cur.pend > 12 ? ` y ${cur.pend - 12} más` : ''}.</p>` : '<p class="hint" style="margin-top:8px">✅ Todos los asesores presentaron la última evaluación.</p>'}
        </section>`;
    }

    return { guessMapping, roster, processFile, summarize, load, save, removeWeek, pendingFor, forAdvisor, ensureLoaded, zoneCardHTML, docId, cache };
})();

// ---------------------------------------------------------------------------
// Pantalla
// ---------------------------------------------------------------------------
registerModule('evals', (() => {
    const me = () => State.session;
    let zonas = [], view = '', month = '', weekKeys = [], weeks = {}, R = [], S = null, dirty = false;
    const viewZonas = () => view ? [view] : zonas;
    const label = () => view ? `Zona ${view}` : (isAllZones() ? 'Nacional' : (myRegional() && ['coordinador', 'gerente'].includes(me().rol) ? `Regional ${myRegional()}` : `Zona ${zonas[0] || ''}`));

    async function render(v) {
        zonas = scopedZones(); view = zonas.length === 1 ? zonas[0] : (zonas.includes(me().zona) ? me().zona : '');
        month = todayStr().slice(0, 7); weeks = {}; dirty = false;
        v.innerHTML = `
        <section class="card">
            <h2 class="h2">Evaluaciones de asesores</h2>
            <p class="mute">Sube la data plana de cada semana (nombre, cédula y nota). La app cruza por cédula y, si no coincide, por nombre, aunque esté mal escrito. Verás quién presentó, quién falta, quién repitió y las notas.</p>
            <div class="row wrap" style="gap:10px;margin-top:10px;align-items:flex-end">
                ${zonas.length > 1 ? `<label class="field-inline grow"><span class="lbl">Ámbito</span><select id="ev-zona" class="input"><option value="">${esc(label().replace(/^Zona .*/, 'Todo el alcance'))} · ${zonas.length} zonas</option>${zonas.map(z => `<option value="${esc(z)}" ${z === view ? 'selected' : ''}>${esc(z)}</option>`).join('')}</select></label>` : `<label class="field-inline grow"><span class="lbl">Zona</span><input class="input" value="${esc(zonas[0] || '')}" readonly></label>`}
                <label class="field-inline"><span class="lbl">Mes</span><input type="month" id="ev-month" class="input" value="${month}"></label>
            </div>
            <div id="ev-slots" class="ev-slots"></div>
            <p class="hint" id="ev-status"></p>
        </section>
        <div id="ev-out"></div>`;
        if ($('#ev-zona')) $('#ev-zona').onchange = e => { view = e.target.value; start(); };
        $('#ev-month').onchange = e => { month = e.target.value || month; start(); };
        $('#ev-slots').addEventListener('change', e => { if (e.target.dataset.w) onFile(e.target.dataset.w, e.target.files[0]); });
        $('#ev-slots').addEventListener('click', async e => { const b = e.target.closest('[data-del]'); if (!b) return; const w = b.dataset.del; if (!confirm(`¿Quitar la evaluación ${w}? Se borra también de lo guardado.`)) return; delete weeks[w]; paintSlots(); compute(); await Evals.removeWeek(viewZonas(), month, w); toast(`${w} quitada.`, 'ok'); });
        await start();
    }
    async function start() {
        weekKeys = evalWeeksOfMonth(month).map(w => 'W' + w);
        R = Evals.roster(viewZonas());
        const saved = await Evals.load(viewZonas(), month);
        weeks = {};
        Object.values(saved).filter(Boolean).forEach(d => Object.entries(d.weeks || {}).forEach(([w, W]) => { const cur = weeks[w] = weeks[w] || { fileName: W.fileName, rows: [], unmatched: {}, total: 0, matchedN: 0, saved: true, uploadedAt: W.uploadedAt || d.updatedAt || 0, uploadedBy: W.uploadedBy || d.uploadedBy || '' }; cur.rows.push(...W.rows); Object.assign(cur.unmatched, W.unmatched || {}); cur.total += W.total || 0; cur.matchedN += W.matchedN || 0; }));
        dirty = false; paintSlots(); compute();
    }
    function paintSlots() {
        $('#ev-slots').innerHTML = weekKeys.map(w => { const W = weeks[w]; return `<div class="ev-slot ${W ? 'on' : ''}"><b>${w}</b>${W ? `<span class="ev-file" title="${esc(W.fileName || '')}">📄 ${esc((W.fileName || 'guardada').slice(0, 26))}<br><small>${W.matchedN}/${W.total} cruzadas${W.saved ? ' · guardada ✅' : ' · guardando…'}</small></span><small class="ev-when">Última data cargada: ${W.uploadedAt ? esc(fechaHora(W.uploadedAt)) : '—'}${W.uploadedBy ? ' · ' + esc(String(W.uploadedBy).split(' ')[0]) : ''}</small><button class="icon-btn" title="Quitar" data-del="${w}">🗑️</button>` : '<span class="mute">Sin data</span>'}<label class="btn btn-ghost sm">📂 ${W ? 'Reemplazar' : 'Adjuntar'}<input type="file" data-w="${w}" accept=".xlsx,.xls,.csv,.txt" hidden></label></div>`; }).join('');
    }
    async function onFile(w, file) {
        if (!file) return;
        $('#ev-status').textContent = `Leyendo ${file.name}…`;
        try {
            const W = await Evals.processFile(file, R);
            W.uploadedAt = Date.now(); W.uploadedBy = me().nombre;
            weeks[w] = W; paintSlots(); compute();
            await Evals.save(viewZonas(), month, { [w]: W }, { uploadedBy: me().nombre, uploadedById: me().userId });   // queda guardada de una vez
            W.saved = true; paintSlots();
            const unm = Object.keys(W.unmatched).length;
            toast(`${w}: ${W.matchedN} de ${W.total} filas cruzadas con asesores${unm ? ` · ${unm} sin cruzar` : ''}`, unm ? 'warn' : 'ok', 5000);
        } catch (e) { console.error(e); toast('No se pudo leer: ' + (e.message || e), 'error', 7000); $('#ev-status').textContent = 'No se pudo leer el archivo: ' + (e.message || e); }
        finally { const i = $(`[data-w="${w}"]`); if (i) i.value = ''; }
    }
    function compute() {
        const out = $('#ev-out'); if (!out) return;
        const loaded = weekKeys.filter(w => weeks[w]);
        if (!R.length) { out.innerHTML = '<div class="card empty">No hay asesores en el alcance: configúralos en cada tienda o carga la data de zona.</div>'; $('#ev-status').textContent = ''; return; }
        if (!loaded.length) { S = null; out.innerHTML = `<div class="card empty">Adjunta la data de al menos una semana. Asesores en ${esc(label().toLowerCase())}: <b>${R.length}</b> en ${new Set(R.map(a => a.storeId)).size} PDV.</div>`; $('#ev-status').textContent = ''; return; }
        S = Evals.summarize(weeks, R, weekKeys);
        const cur = S.perWeek[S.perWeek.length - 1];
        $('#ev-status').innerHTML = `${R.length} asesores en ${new Set(R.map(a => a.storeId)).size} PDV · ${loaded.length} semana(s) cargada(s)${dirty ? ' · <b>Al compartir o guardar el reporte, las evaluaciones quedan guardadas y el plan de trabajo mostrará los pendientes.</b>' : ''}`;
        const unmatchedAll = Object.entries(loaded.reduce((acc, w) => { Object.entries(weeks[w].unmatched || {}).forEach(([k, n]) => { acc[k] = (acc[k] || 0) + n; }); return acc; }, {}));
        const cls = n => n == null ? '' : n >= 80 ? 'ok' : n >= 70 ? 'warn' : 'bad';
        const multi = viewZonas().length > 1;
        out.innerHTML = `
        <section class="kpi-row">
            <div class="kpi hl"><span>Asesores</span><b>${S.advisors.length}</b><small>${S.stores.length} PDV · ${esc(label())}</small></div>
            <div class="kpi"><span>Presentaron ${cur.w}</span><b>${cur.done}/${S.advisors.length}</b><small>${cur.rep} repitieron · ${cur.bajo} por debajo de 70</small></div>
            <div class="kpi ${cur.pend ? 'warn' : ''}"><span>Pendientes ${cur.w}</span><b>${cur.pend}</b><small>${S.nunca.length} sin ninguna evaluación en el mes</small></div>
            <div class="kpi"><span>Promedio</span><b>${S.prom == null ? '—' : S.prom}</b><small>${cur.prom == null ? 'sin notas' : cur.w + ': ' + cur.prom}</small></div>
        </section>
        <div class="grid2">
            <section class="card"><h3 class="h3">Semana a semana</h3>
                <table class="tbl compact"><thead><tr><th>Semana</th><th>Presentaron</th><th>Pendientes</th><th>Repitieron</th><th>Promedio</th><th>&lt; 70</th></tr></thead><tbody>
                ${S.perWeek.map(p => `<tr><td class="l"><b>${p.w}</b></td><td>${p.done}</td><td>${p.pend ? `<i class="pill warn">${p.pend}</i>` : '0'}</td><td>${p.rep}</td><td>${p.prom == null ? '—' : `<i class="pill ${cls(p.prom)}">${p.prom}</i>`}</td><td>${p.bajo}</td></tr>`).join('')}
                </tbody></table>
                ${unmatchedAll.length ? `<details class="acc" style="margin-top:10px"><summary><span>⚠️ ${unmatchedAll.length} nombres de la data sin cruzar con ningún asesor</span></summary><p class="hint">Revisa la cédula o el nombre en la data, o agrega al asesor en la tienda.</p><div class="chips">${unmatchedAll.map(([k, n]) => `<span class="chip">${esc(k)}${n > 1 ? ` ×${n}` : ''}</span>`).join('')}</div></details>` : ''}
            </section>
            <section class="card"><h3 class="h3">⏳ Pendientes ${cur.w}</h3>
                ${cur.pend ? `<ul class="insights">${S.stores.filter(s => s.asesores.some(a => !a.weeks[cur.w])).map(s => `<li><b>${esc(s.tienda)}</b>${multi ? ` <small class="mute">${esc(s.zona)}</small>` : ''}: ${s.asesores.filter(a => !a.weeks[cur.w]).map(a => esc(a.nombre)).join(', ')}</li>`).join('')}</ul>` : '<p class="mute">✅ Todos presentaron la evaluación de la semana.</p>'}
            </section>
        </div>
        <section class="card"><h3 class="h3">Detalle por PDV y asesor</h3>
            <div class="tbl-scroll"><table class="tbl compact"><thead><tr><th>PDV</th><th>Asesor</th><th>Cédula</th>${S.loaded.map(w => `<th>${w}</th>`).join('')}<th>Prom.</th></tr></thead><tbody>
            ${S.advisors.map(a => { const ns = Object.values(a.weeks).map(x => x.best).filter(n => n != null); const pr = ns.length ? Math.round(sum(ns) / ns.length) : null; return `<tr><td class="l"><small>${esc(a.tienda)}</small></td><td class="l"><b>${esc(a.nombre)}</b></td><td><small>${esc(a.cedula || '—')}</small></td>${S.loaded.map(w => { const s = a.weeks[w]; return `<td>${!s ? '<i class="pill bad">falta</i>' : s.best == null ? '<i class="pill ok">✓</i>' : `<i class="pill ${cls(s.best)}">${s.best}${s.intentos.length > 1 ? ` ×${s.intentos.length}` : ''}</i>`}</td>`; }).join('')}<td>${pr == null ? '—' : `<b>${pr}</b>`}</td></tr>`; }).join('')}
            </tbody></table></div>
            <p class="hint">×2 = presentó dos veces (se toma la mejor nota). Las notas se llevan a escala de 0 a 100.</p>
        </section>
        ${actionBarHTML()}`;
        ReportActions.bind(out, {
            title: 'Reporte de evaluaciones · Central de Operaciones',
            validate: () => S ? null : 'Carga al menos una semana.',
            filename: () => `Evaluaciones_${slug(label())}_${month}.png`,
            build: stage => buildEvalsCanvas(stage, { label: label(), month, S, autor: me() }),
            persist: async () => { const r = await Evals.save(viewZonas(), month, weeks, { uploadedBy: me().nombre, uploadedById: me().userId }); dirty = false; Object.values(weeks).forEach(W => { W.saved = true; }); paintSlots(); return r; }
        });
    }
    return { render };
})());

// ----------------------------------------------------------------------------
// LIENZO · REPORTE DE EVALUACIONES (1080 px, vertical)
// ----------------------------------------------------------------------------
function buildEvalsCanvas(stage, d) {
    const { S, autor } = d, dash = '—';
    const cur = S.perWeek[S.perWeek.length - 1];
    const cls = n => n == null ? '' : n >= 80 ? 'g' : n >= 70 ? 'a' : 'r';
    const el = document.createElement('div');
    el.className = 'rp rp-m3 rp-evals';
    el.innerHTML = `
    <div class="rp-bar"></div>
    <header class="rp-head">
        <img class="rp-logo" src="${LOGO_INFINIX}" alt="Infinix">
        <div class="rp-head-mid">
            <div class="rp-kicker">REPORTE DE EVALUACIONES · FORMACIÓN</div>
            <div class="rp-title">${esc(d.label.toUpperCase())}</div>
            <div class="rp-sub">${esc(mesLargo(d.month))} · semanas ${S.loaded.join(', ')} · elaborado por <b>${esc(autor.nombre)}</b> · ${ROLES[autor.rol].label}</div>
        </div>
        <div class="rp-chain z-stamp"><b>${S.advisors.length}</b><span>ASESORES</span></div>
    </header>
    <section class="rp-dash four">
        <div class="dcard hero"><div class="dcard-t">🎓 PRESENTARON ${cur.w}</div>
            <div class="center">${ringCardHTML('re-done', 150, `${cur.done}/${S.advisors.length}`, 'asesores')}</div>
            <div class="dfoot">${cur.pend} pendientes · ${cur.rep} repitieron</div></div>
        <div class="dcard"><div class="dcard-t">PROMEDIO ${cur.w}</div><div class="center big-num" style="color:${cur.prom == null ? '#94A3B8' : cur.prom >= 80 ? THEME.green : cur.prom >= 70 ? THEME.amber : THEME.red}">${cur.prom == null ? dash : cur.prom}</div><div class="dfoot">Promedio del mes <b>${S.prom == null ? dash : S.prom}</b></div></div>
        <div class="dcard"><div class="dcard-t">POR DEBAJO DE 70</div><div class="center big-num" style="color:${cur.bajo ? THEME.red : THEME.green}">${cur.bajo}</div><div class="dfoot">Refuerzo prioritario</div></div>
        <div class="dcard"><div class="dcard-t">SIN EVALUAR EN EL MES</div><div class="center big-num" style="color:${S.nunca.length ? THEME.red : THEME.green}">${S.nunca.length}</div><div class="dfoot">${S.stores.length} PDV en el alcance</div></div>
    </section>
    <div class="rp-sec">SEMANA A SEMANA</div>
    <table class="rp-tbl"><thead><tr><th class="l">SEMANA</th><th>PRESENTARON</th><th>PENDIENTES</th><th>REPITIERON</th><th>PROMEDIO</th><th>&lt; 70</th></tr></thead><tbody>
        ${S.perWeek.map(p => `<tr><td class="l"><b>${p.w}</b></td><td>${p.done} de ${S.advisors.length}</td><td class="${p.pend ? 'r' : ''}">${p.pend}</td><td>${p.rep}</td><td class="c-tot ${cls(p.prom)}">${p.prom == null ? dash : p.prom}</td><td>${p.bajo}</td></tr>`).join('')}
    </tbody></table>
    <div class="rp-sec">DETALLE POR PDV Y ASESOR</div>
    <table class="rp-tbl"><thead><tr><th class="l">PDV</th><th class="l">ASESOR</th>${S.loaded.map(w => `<th>${w}</th>`).join('')}<th>PROM.</th></tr></thead><tbody>
        ${S.advisors.map(a => { const ns = Object.values(a.weeks).map(x => x.best).filter(n => n != null); const pr = ns.length ? Math.round(sum(ns) / ns.length) : null; return `<tr><td class="l small">${esc(a.tienda)}</td><td class="l">${esc(a.nombre)}</td>${S.loaded.map(w => { const s = a.weeks[w]; return `<td class="c-tot ${!s ? 'r' : cls(s.best)}">${!s ? 'FALTA' : s.best == null ? '✓' : s.best + (s.intentos.length > 1 ? ' ×' + s.intentos.length : '')}</td>`; }).join('')}<td><b>${pr == null ? dash : pr}</b></td></tr>`; }).join('')}
    </tbody></table>
    <div class="v-two">
        <div class="vbox ${cur.pend ? 'warn' : 'good'}"><div class="vbox-t">Pendientes ${cur.w}</div>${cur.pend ? `<ul class="z-list">${S.stores.filter(s => s.asesores.some(a => !a.weeks[cur.w])).map(s => `<li><b>${esc(s.tienda)}</b>: ${s.asesores.filter(a => !a.weeks[cur.w]).map(a => esc(a.nombre)).join(', ')}</li>`).join('')}</ul>` : '<p class="vtxt">Todos los asesores presentaron la evaluación de la semana.</p>'}</div>
        <div class="vbox"><div class="vbox-t">Refuerzo (nota &lt; 70 en ${cur.w})</div>${cur.bajo ? `<ul class="z-list">${S.advisors.filter(a => a.weeks[cur.w] && a.weeks[cur.w].best != null && a.weeks[cur.w].best < 70).map(a => `<li><b>${esc(a.nombre)}</b> (${esc(a.tienda)}): ${a.weeks[cur.w].best}</li>`).join('')}</ul>` : '<p class="vtxt">Sin notas por debajo de 70.</p>'}</div>
    </div>
    <footer class="rp-foot"><span>Cruce por cédula y nombre con los asesores de cada PDV. Con varias presentaciones en la semana se toma la mejor nota. Escala 0–100.</span><b>Infinix · Central de Operaciones</b></footer>
    <div class="rp-bar"></div>`;
    stage.appendChild(el);
    const p = S.advisors.length ? cur.done / S.advisors.length : 0;
    Charts.ring($('#re-done', el), [p, 1 - p], [p >= 1 ? THEME.green : p >= .7 ? THEME.amber : THEME.red, THEME.line], { cutout: '76%' });
    return el;
}

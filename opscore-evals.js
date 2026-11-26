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
    // Universo de asesores del alcance: configurados en la tienda (con cédula si la hay) + los de la data de zona.
    // Se enriquece con la malla nacional: su nombre completo queda como alias y su cédula se usa si el asesor no la tiene.
    // opts.retirados = 'AAAA-MM': incluye además a los asesores retirados en ese mes o después (estuvieron en el mes),
    // marcados con retirado: true (evaluaciones iniciales: miden a todos los que estuvieron en el mes).
    function roster(zonas, opts) {
        const out = [];
        State.stores.filter(s => zonas.includes(s.zona) && chainOn(s)).forEach(st => {
            if (opts && opts.retirados) {
                const ini = opts.retirados + '-01';
                (st.bajas || []).filter(b => (b.fecha || (b.at ? dstr(new Date(b.at)) : '')) >= ini).forEach(b => {
                    if (activeAdvisors(st).some(a => sameAdvisor(a, b)) || out.some(o => o.retirado && sameAdvisor(o, b))) return;
                    const c = digits(b.cedula || '');
                    out.push({ nombre: b.nombre, cedula: c, cedulas: c.length >= 5 ? [c] : [], alias: [...new Set([b.nombre].concat(b.nombres || []))], storeId: st.id, tienda: st.tienda, zona: st.zona, key: `${st.id}|${slug(b.nombre)}`, retirado: true, retiroFecha: b.fecha || '' });
                });
            }
            let M = {}; try { M = st.malla && st.malla.ced ? JSON.parse(st.malla.ced) : {}; } catch (e) { M = {}; }
            let MN = []; try { MN = st.malla && st.malla.data ? Object.keys(JSON.parse(st.malla.data)) : []; } catch (e) { MN = []; }
            const mallaNames = [...new Set(Object.keys(M).concat(MN))];
            // Solo asesores activos (los retirados no se evalúan ni salen como pendientes)
            activeAdvisors(st).forEach(a => {
                const alias = [...new Set([a.nombre].concat(a.alias || []))], ceds = new Set([digits(a.cedula || ''), digits((st.cedulas || {})[a.nombre] || '')].filter(c => c.length >= 5));
                mallaNames.forEach(mn => {
                    const mc = digits(M[mn] || '');
                    if ((mc.length >= 5 && ceds.has(mc)) || alias.some(n => nameScore(n, mn).hit >= 2 || sameName(n, mn))) { if (!alias.includes(mn)) alias.push(mn); if (mc.length >= 5) ceds.add(mc); }
                });
                out.push({ nombre: a.nombre, cedula: [...ceds][0] || '', cedulas: [...ceds], alias, storeId: st.id, tienda: st.tienda, zona: st.zona, key: `${st.id}|${slug(a.nombre)}` });
            });
        });
        return out;
    }
    let natR = null, natAt = 0;
    // Para cruzar la data se incluyen también los retirados desde el mes pasado (las iniciales los cuentan; las semanales no)
    const rosterAll = () => { if (!natR || Date.now() - natAt > 15000) { natR = roster(State.zones.map(z => z.nombre), { retirados: addDays(todayStr().slice(0, 7) + '-01', -1).slice(0, 7) }); natAt = Date.now(); } return natR; };
    const toks = s => norm(s).split(' ').filter(t => t.length > 2 && !['DEL', 'LAS', 'LOS'].includes(t));
    // Distancia de edición (Damerau: incluye dos caracteres invertidos)
    function digitDist(a, b) {
        if (Math.abs(a.length - b.length) > 2) return 9;
        const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
        for (let j = 1; j <= b.length; j++) d[0][j] = j;
        for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
            d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        }
        return d[a.length][b.length];
    }
    // Dos palabras son la misma aunque estén mal escritas (Yorlen/Yorlan, Sebastian/Sebastián, Ma/Maria)
    const tokEq = (x, y) => x === y || (x.length >= 4 && y.length >= 4 && (digitDist(x, y) <= (Math.min(x.length, y.length) >= 7 ? 2 : 1) || x.startsWith(y) || y.startsWith(x)));
    function nameScore(a, b) {
        const ta = toks(a), tb = toks(b); if (!ta.length || !tb.length) return { hit: 0, ratio: 0, full: 0 };
        const used = new Set(); let hit = 0;
        ta.forEach(t => { const j = tb.findIndex((u, i) => !used.has(i) && tokEq(t, u)); if (j >= 0) { used.add(j); hit++; } });
        return { hit, ratio: hit / Math.min(ta.length, tb.length), full: hit / Math.max(ta.length, tb.length) };
    }
    function sameName(a, b) {
        const A = norm(a), B = norm(b); if (!A || !B) return false;
        if (A === B || A.includes(B) || B.includes(A)) return true;
        const sc = nameScore(A, B);
        return sc.hit >= 2 || (sc.hit === 1 && Math.min(toks(A).length, toks(B).length) === 1);
    }
    // Doble cotejo: cédula y nombre. Basta que uno de los dos esté bien:
    //   · cédula exacta → es él (aunque el nombre esté mal escrito)
    //   · cédula con 1 o 2 dígitos mal (de más, de menos, cambiados o invertidos) y algo del nombre coincide → es él
    //   · nombre que coincide (2 o más palabras, con errores de digitación) → es él aunque la cédula esté mal
    // Si dos asesores empatan, se desempata por la cédula más cercana, el nombre más completo y la tienda de la data.
    function matchRow(nombre, cedula, R, pdv) {
        const c = digits(cedula), n = norm(nombre), tp = toks(pdv || '');
        let best = [], bestSc = 0;
        R.forEach(a => {
            const ceds = a.cedulas && a.cedulas.length ? a.cedulas : (a.cedula ? [a.cedula] : []);
            const cd = c.length >= 5 ? Math.min(9, ...ceds.map(x => x === c ? 0 : (x.length >= 6 && c.length >= 6 ? digitDist(x, c) : 9))) : 9;
            const ns = n ? (a.alias || [a.nombre]).map(x => nameScore(x, n)).sort((p, q) => q.hit - p.hit || q.full - p.full)[0] : { hit: 0, ratio: 0, full: 0 };
            let sc = 0, how = '';
            if (cd === 0) { sc = 1000; how = 'cedula'; }
            else if (cd <= 2 && ns.hit >= 1) { sc = 800 - cd * 50; how = 'cedula~'; }
            else if (ns.hit >= 2 && ns.ratio >= .99) { sc = 600 + ns.hit * 10; how = 'nombre'; }
            else if (ns.hit >= 2) { sc = 450 + ns.hit * 10; how = 'nombre~'; }
            else if (cd <= 1 && c.length >= 7 && !n) { sc = 400; how = 'cedula~'; }
            else if (ns.hit === 1 && ns.ratio >= .99 && Math.min(toks(n).length, toks(a.nombre).length) === 1) { sc = 300; how = 'parcial'; }
            if (!sc) return;
            sc += Math.round(ns.full * 40) + (cd < 9 ? (3 - Math.min(3, cd)) * 5 : 0) + (tp.length && toks(a.tienda).some(t => tp.includes(t)) ? 15 : 0);
            if (sc > bestSc) { bestSc = sc; best = [{ a, how }]; } else if (sc === bestSc) best.push({ a, how });
        });
        if (!best.length) return null;
        return { a: best[0].a, how: best[0].how, all: best.map(x => x.a) };
    }
    // Llaves de cada fila contra el roster nacional (se recalculan al leer: así la data subida antes también
    // se beneficia de cédulas nuevas, de la malla y de nombres corregidos)
    const keyMemo = new WeakMap();
    function keysOf(W) {
        const R = rosterAll(), sig = R.length + '|' + (R[0] || {}).key + '|' + natAt;
        const m = keyMemo.get(W); if (m && m.sig === sig) return m;
        const keys = [], unmatched = {}, how = {}; let matchedN = 0;
        W.rows.forEach(r => {
            const mm = matchRow(r.nombre, r.cedula, R, r.pdv);
            if (!mm) { keys.push([]); const k = r.nombre || r.cedula; unmatched[k] = (unmatched[k] || 0) + 1; return; }
            // El mismo asesor puede estar en dos PDV (misma cédula o mismo nombre): la evaluación cuenta en todos
            const ks = R.filter(a => mm.all.includes(a) || (mm.a.cedula && (a.cedulas || []).includes(mm.a.cedula)) || norm(a.nombre) === norm(mm.a.nombre)).map(a => a.key);
            keys.push([...new Set(ks)]); matchedN++; how[mm.how] = (how[mm.how] || 0) + 1;
        });
        const out = { sig, keys, unmatched, matchedN, how };
        keyMemo.set(W, out); return out;
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
        const rows = [];
        const temaCols = detectTemaCols(parsed.headers, parsed.rows, map);
        parsed.rows.forEach(r => {
            const nombre = get(r, 'name'), cedula = get(r, 'doc'); if (!nombre && !cedula) return;
            const nota = map.score !== undefined ? parseScore(get(r, 'score')) : null;
            const row = { nombre, cedula: digits(cedula), nota, fecha: get(r, 'date').slice(0, 16), test: get(r, 'test').slice(0, 80), pdv: get(r, 'store').slice(0, 60) };
            if (temaCols.length) { const tm = {}; temaCols.forEach(i => { const v = String(r[i] ?? '').trim(); if (v && NUM_STRICT.test(v)) tm[String(parsed.headers[i]).trim().slice(0, 40)] = parseScore(v); }); if (Object.keys(tm).length) row.temas = tm; }
            rows.push(row);
        });
        const W = { fileName: file.name, temaCols: temaCols.map(i => parsed.headers[i]), headers: parsed.headers, columns: Object.fromEntries(Object.entries(map).map(([k, v]) => [k, parsed.headers[v]])), rows, total: rows.length };
        const K = keysOf(W); W.unmatched = K.unmatched; W.matchedN = K.matchedN; W.how = K.how;
        return W;
    }

    // Consolidado: por asesor y semana, intentos y notas
    function summarize(weeks, R, weekKeys, month) {
        month = month || monthOfWeeks();
        const byKey = Object.fromEntries(R.map(a => [a.key, { ...a, weeks: {} }]));
        weekKeys.forEach(w => { const W = weeks[w]; if (!W) return; const K = keysOf(W); W.unmatched = K.unmatched; W.matchedN = K.matchedN; W.how = K.how; W.rows.forEach((r, ri) => { K.keys[ri].forEach(k => { if (!k || !byKey[k]) return; const slot = byKey[k].weeks[w] = byKey[k].weeks[w] || { intentos: [], best: null, last: null }; slot.intentos.push({ nota: r.nota, fecha: r.fecha, test: r.test }); if (r.nota != null) { slot.best = slot.best == null ? r.nota : Math.max(slot.best, r.nota); slot.last = r.nota; } }); }); });
        const loaded = weekKeys.filter(w => weeks[w]);
        Object.values(byKey).forEach(a => loaded.forEach(w => { const o = ovr(month, a.key, w); if (!o) return; if (o.x) delete a.weeks[w]; else a.weeks[w] = { intentos: [{ nota: o.nota }], best: o.nota, last: o.nota, manual: true }; }));
        const advisors = Object.values(byKey).sort((a, b) => (a.tienda + a.nombre).localeCompare(b.tienda + b.nombre, 'es'));
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
    // Ajustes manuales del formador: { 'tienda|asesor': { W46: { nota: 85 } | { x: true } } } en un documento nacional por mes.
    // Mandan sobre lo que cruza la data (nota corregida, "no la presentó" o una evaluación que la data no reconoció).
    const manId = month => `manual_${month}`;
    const man = {};
    const ovr = (month, key, w) => ((man[month] || {})[key] || {})[w];
    async function loadMan(month) { const d = await Data.get(COL.evalData, manId(month)).catch(() => null); man[month] = (d && d.overrides) || man[month] || {}; return man[month]; }
    async function setManual(month, key, w, val) {         // val: { nota } | { x: true } | null (quitar el ajuste)
        const by = (State.session && State.session.nombre) || '';
        const M = man[month] = man[month] || {}, A = M[key] = { ...(M[key] || {}) };
        if (val) A[w] = { ...val, by, at: Date.now() }; else delete A[w];
        M[key] = A;
        return Data.set(COL.evalData, manId(month), { id: manId(month), kind: 'evalManual', month, overrides: M, updatedAt: Date.now() }, false);
    }
    const monthOfWeeks = () => todayStr().slice(0, 7);
    // La data de evaluaciones es nacional: si la sube el administrador, un coordinador o el gerente queda un documento
    // por semana para todo el país (todas las filas, crucen o no) y lo ven todos. Si la sube un formador, queda en su zona.
    const nacId = (month, w) => `nacional_${month}_${w}`;
    const nac = {};                                 // mes → { W45: semana nacional }
    const canNacional = () => !!State.session && ['admin', 'coordinador', 'gerente'].includes(State.session.rol);
    async function loadNac(month) {
        const ws = String(month).endsWith('~ini') ? EVAL_INICIAL.map(x => x[0]) : evalWeeksOfMonth(month).map(n => 'W' + n), out = {};
        await Promise.all(ws.map(async w => {
            const d = await Data.get(COL.evalData, nacId(month, w)).catch(() => null); if (!d || !d.rows) return;
            let rows = d.rows.slice();
            for (let i = 2; i <= int(d.parts); i++) { const p = await Data.get(COL.evalData, nacId(month, w) + '_p' + i).catch(() => null); if (p && p.rows) rows = rows.concat(p.rows); }
            out[w] = { ...d, rows, nac: true, saved: true };
        }));
        nac[month] = out; return out;
    }
    async function load(zonas, month) {
        const [docs] = await Promise.all([Promise.all(zonas.map(z => Data.get(COL.evalData, docId(z, month)).catch(() => null))), loadNac(month).catch(() => ({})), loadMan(month).catch(() => ({}))]);
        zonas.forEach((z, i) => { if (docs[i]) cache[docId(z, month)] = docs[i]; });
        return Object.fromEntries(zonas.map((z, i) => [z, docs[i] || cache[docId(z, month)] || null]));
    }
    // Semanas del alcance: la nacional manda (es el archivo completo); si no hay, se juntan las de las zonas
    const rowSig = r => `${r.cedula}|${norm(r.nombre)}|${r.nota}|${r.fecha}`;
    const weekMemo = {};
    function weeksFor(zonas, month) {
        const out = {}, N = nac[month] || {};
        Object.entries(N).forEach(([w, W]) => { out[w] = W; });
        zonas.forEach(z => {
            const d = cache[docId(z, month)]; if (!d || !d.weeks) return;
            Object.entries(d.weeks).forEach(([w, W]) => {
                if (N[w] && (N[w].uploadedAt || 0) >= (W.uploadedAt || 0)) return;
                const k = `${month}|${w}|${zonas.join(',')}`;
                const cur = out[w] && !out[w].nac ? out[w] : (out[w] = { fileName: W.fileName, rows: [], total: 0, saved: true, uploadedAt: W.uploadedAt || d.updatedAt || 0, uploadedBy: W.uploadedBy || d.uploadedBy || '', _seen: new Set() });
                W.rows.forEach(r => { const sg = rowSig(r); if (!cur._seen.has(sg)) { cur._seen.add(sg); cur.rows.push(r); } });
                cur.total = cur.rows.length;
                if ((W.uploadedAt || 0) > cur.uploadedAt) { cur.uploadedAt = W.uploadedAt; cur.uploadedBy = W.uploadedBy || cur.uploadedBy; cur.fileName = W.fileName; }
                weekMemo[k] = cur;
            });
        });
        // Objetos estables entre llamadas (para no recalcular el cruce)
        Object.keys(out).forEach(w => { if (out[w].nac) return; const k = `${month}|${w}|${zonas.join(',')}`, prev = weekMemo['s' + k]; if (prev && prev.rows.length === out[w].rows.length && prev.uploadedAt === out[w].uploadedAt) out[w] = prev; else weekMemo['s' + k] = out[w]; });
        return out;
    }
    const slimRow = r => { const o = { nombre: r.nombre, cedula: r.cedula, nota: r.nota, fecha: r.fecha }; if (r.test) o.test = r.test; if (r.pdv) o.pdv = r.pdv; if (r.temas) o.temas = r.temas; return o; };
    // Nacional: un documento por semana (partido en trozos si es muy grande)
    async function saveNac(month, w, W, meta) {
        const rows = W.rows.map(slimRow), parts = [];
        let cur = [], size = 0;
        rows.forEach(r => { const z = JSON.stringify(r).length; if (size + z > 700000 && cur.length) { parts.push(cur); cur = []; size = 0; } cur.push(r); size += z; });
        parts.push(cur);
        const base = { kind: 'evalNac', month, w, fileName: W.fileName, columns: W.columns || {}, total: W.total, uploadedAt: W.uploadedAt || Date.now(), uploadedBy: W.uploadedBy || (meta && meta.uploadedBy) || '', uploadedById: (meta && meta.uploadedById) || '', parts: parts.length, updatedAt: Date.now() };
        const ops = parts.map((p, i) => ({ op: 'set', col: COL.evalData, id: nacId(month, w) + (i ? '_p' + (i + 1) : ''), data: i ? { kind: 'evalNacPart', month, w, rows: p } : { ...base, rows: p }, merge: false }));
        nac[month] = nac[month] || {}; nac[month][w] = { ...base, rows: W.rows, nac: true, saved: true };
        return Data.batch(ops);
    }
    // Zona (formador): cada fila va a la zona de su asesor; las que no cruzan quedan en la primera zona del alcance
    async function save(zonas, month, weeks, meta) {
        const ops = [];
        zonas.forEach((z, zi) => {
            const wz = {};
            Object.entries(weeks).forEach(([w, W]) => { if (!W || W.nac) return; const K = keysOf(W); const rows = W.rows.filter((r, i) => K.keys[i].some(k => (storeById(k.split('|')[0]) || {}).zona === z) || (!K.keys[i].length && zi === 0)).map(slimRow); if (rows.length || zonas.length === 1) wz[w] = { fileName: W.fileName, columns: W.columns || {}, rows, total: W.total, uploadedAt: W.uploadedAt || Date.now(), uploadedBy: W.uploadedBy || (meta && meta.uploadedBy) || '' }; });
            if (!Object.keys(wz).length) return;
            const prev = cache[docId(z, month)] || {};
            const doc = { ...prev, id: docId(z, month), zona: z, month, weeks: { ...(prev.weeks || {}), ...wz }, ...meta, updatedAt: Date.now() };
            cache[doc.id] = doc; ops.push({ op: 'set', col: COL.evalData, id: doc.id, data: doc, merge: false });
        });
        return ops.length ? Data.batch(ops) : { synced: true };
    }
    // Guarda según quién sube: nacional (admin, coordinador, gerente) o por zona (formador)
    async function saveWeeks(zonas, month, weeks, meta) {
        if (canNacional()) { let last = { synced: true }; for (const [w, W] of Object.entries(weeks)) if (W && !W.nac) last = await saveNac(month, w, W, meta); return last; }
        return save(zonas, month, weeks, meta);
    }
    // Quita una semana guardada (en las zonas del alcance y, si quien la quita puede, también la nacional)
    async function removeWeek(zonas, month, w) {
        const ops = [];
        zonas.forEach(z => { const d = cache[docId(z, month)]; if (!d || !d.weeks || !d.weeks[w]) return; const weeks = { ...d.weeks }; delete weeks[w]; const doc = { ...d, weeks, updatedAt: Date.now() }; cache[doc.id] = doc; ops.push({ op: 'set', col: COL.evalData, id: doc.id, data: doc, merge: false }); });
        if (canNacional() && nac[month] && nac[month][w]) { for (let i = 1; i <= Math.max(1, int(nac[month][w].parts)); i++) ops.push({ op: 'del', col: COL.evalData, id: nacId(month, w) + (i > 1 ? '_p' + i : '') }); delete nac[month][w]; }
        return ops.length ? Data.batch(ops) : { synced: true };
    }
    // Llaves de asesor que presentaron una semana
    const doneKeys = (W, month, w, R) => { const set = new Set(keysOf(W).keys.flat()); (R || []).forEach(a => { const o = ovr(month, a.key, w); if (o) { if (o.x) set.delete(a.key); else set.add(a.key); } }); return set; };
    // Pendientes de la última semana cargada para una tienda (lo usa el plan de trabajo)
    function pendingFor(storeId, month) {
        const st = storeById(storeId); if (!st) return null;
        month = month || todayStr().slice(0, 7);
        const WS = weeksFor([st.zona], month), ws = Object.keys(WS).sort(); const w = ws[ws.length - 1]; if (!w) return null;
        const R = roster([st.zona]).filter(a => a.storeId === storeId); if (!R.length) return null;
        const W = WS[w], K = keysOf(W), done = doneKeys(W, month, w, R);
        const notas = R.map(a => { const o = ovr(month, a.key, w); if (o) return o.x ? null : o.nota; const ns = W.rows.filter((r, i) => K.keys[i].includes(a.key) && r.nota != null).map(r => r.nota); return ns.length ? Math.max(...ns) : null; }).filter(n => n != null);
        return { week: w, pendientes: R.filter(a => !done.has(a.key)).map(a => a.nombre), hechas: R.filter(a => done.has(a.key)).map(a => a.nombre), prom: notas.length ? Math.round(sum(notas) / notas.length) : null, total: R.length };
    }
    // Cumplimiento de evaluaciones de un grupo de tiendas por semana (plan del formador)
    function weeksStatus(storeIds, month) {
        month = month || todayStr().slice(0, 7);
        const sts = storeIds.map(storeById).filter(Boolean); if (!sts.length) return [];
        const zonas = [...new Set(sts.map(s => s.zona))], WS = weeksFor(zonas, month), R = roster(zonas).filter(a => storeIds.includes(a.storeId));
        return Object.keys(WS).sort().map(w => { const done = doneKeys(WS[w], month, w, R); const h = R.filter(a => done.has(a.key)).length; return { w, hechas: h, total: R.length, pct: R.length ? h / R.length : null }; });
    }
    // Nombre de tema a partir del archivo cuando la data no trae columna de tema: "Evaluacion_Note_60_W46.xlsx" → "Evaluacion Note 60"
    const temaDeArchivo = f => String(f || '').replace(/\.[a-z0-9]+$/i, '').replace(/[_\-]+/g, ' ').replace(/\bW\d{1,2}\b/gi, '').replace(/\s+/g, ' ').trim();
    // Evaluación de un asesor (mes en curso): última nota, notas por semana y temas donde sacó menos de notaMin
    function forAdvisor(storeId, nombre, cedula, month) {
        const st = storeById(storeId); if (!st) return null;
        month = month || todayStr().slice(0, 7);
        const WS = weeksFor([st.zona], month), ws = Object.keys(WS).sort(); if (!ws.length) return null;
        const key = `${storeId}|${slug(nombre)}`;
        const R = rosterAll(), ra = R.find(a => a.key === key) || R.find(a => a.storeId === storeId && sameName(a.nombre, nombre));
        const notaMin = int(State.radar.notaMin) || 80;
        const porSemana = {}; let last = null;
        ws.forEach(w => {
            const W = WS[w], K = keysOf(W);
            const o = ovr(month, key, w) || (ra ? ovr(month, ra.key, w) : null);
            if (o) { if (o.x) return; porSemana[w] = { nota: o.nota, intentos: 1, test: '', temas: null, fileName: W.fileName || '', manual: true }; last = { w, ...porSemana[w] }; return; }
            const rows = W.rows.filter((r, i) => K.keys[i].includes(key) || (ra && K.keys[i].includes(ra.key))); if (!rows.length) return;
            const best = rows.filter(r => r.nota != null).sort((a, b) => b.nota - a.nota)[0] || rows[0];
            porSemana[w] = { nota: best.nota, intentos: rows.length, test: best.test || '', temas: best.temas || null, fileName: W.fileName || '' };
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
        const weeks = weeksFor(zonas, month);
        if (!Object.keys(weeks).length) return `<section class="card"><h3 class="h3">🎓 Evaluaciones</h3><p class="mute">Aún no hay evaluaciones cargadas este mes. Súbelas en la pestaña <b>Evaluaciones</b> y aquí verás quién falta.</p></section>`;
        const R = roster(zonas), S = summarize(weeks, R, Object.keys(weeks).sort(), month);
        const cur = S.perWeek[S.perWeek.length - 1];
        return `<section class="card"><h3 class="h3">🎓 Evaluaciones <small class="mute">${cur ? cur.w : ''}</small></h3>
            <div class="row wrap" style="gap:8px">${S.perWeek.map(p => `<div class="achip ${p.pend ? 'warn' : 'ok'}"><small>${p.w}</small><b>${p.done}/${R.length}</b></div>`).join('')}<div class="achip hl"><small>Promedio</small><b>${S.prom == null ? '—' : S.prom}</b></div></div>
            ${cur && cur.pend ? `<p class="hint" style="margin-top:8px"><b>Pendientes ${cur.w}:</b> ${cur.pendientes.slice(0, 12).map(a => `${esc(a.nombre)} (${esc(a.tienda)})`).join(', ')}${cur.pend > 12 ? ` y ${cur.pend - 12} más` : ''}.</p>` : '<p class="hint" style="margin-top:8px">✅ Todos los asesores presentaron la última evaluación.</p>'}
        </section>`;
    }

    return { setManual, ovr, loadMan, guessMapping, roster, rosterAll, matchRow, nameScore, processFile, summarize, load, save, saveNac, saveWeeks, canNacional, weeksFor, keysOf, removeWeek, pendingFor, weeksStatus, forAdvisor, ensureLoaded, zoneCardHTML, docId, cache };
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
            <h2 class="h2">📅 Evaluaciones semanales</h2>
            <p class="mute">Sube la data plana de cada semana (nombre, cédula y nota). La app cruza por cédula y, si no coincide, por nombre, aunque esté mal escrito. Verás quién presentó, quién falta, quién repitió y las notas.</p>
            <div class="row wrap" style="gap:10px;margin-top:10px;align-items:flex-end">
                ${zonas.length > 1 ? `<label class="field-inline grow"><span class="lbl">Ámbito</span><select id="ev-zona" class="input"><option value="">${esc(label().replace(/^Zona .*/, 'Todo el alcance'))} · ${zonas.length} zonas</option>${zonas.map(z => `<option value="${esc(z)}" ${z === view ? 'selected' : ''}>${esc(z)}</option>`).join('')}</select></label>` : `<label class="field-inline grow"><span class="lbl">Zona</span><input class="input" value="${esc(zonas[0] || '')}" readonly></label>`}
                <label class="field-inline"><span class="lbl">Mes</span><input type="month" id="ev-month" class="input" value="${month}"></label>
            </div>
            <div id="ev-slots" class="ev-slots"></div>
            <p class="hint" id="ev-status"></p>
        </section>
        <div id="ev-out"></div>
        <div id="ev-ini" style="margin-top:14px"></div>`;
        if ($('#ev-zona')) $('#ev-zona').onchange = e => { view = e.target.value; start(); };
        $('#ev-month').onchange = e => { month = e.target.value || month; start(); };
        $('#ev-slots').addEventListener('change', e => { if (e.target.dataset.w) onFile(e.target.dataset.w, e.target.files[0]); });
        $('#ev-slots').addEventListener('click', async e => { const b = e.target.closest('[data-del]'); if (!b) return; const w = b.dataset.del; if (!confirm(`¿Quitar la evaluación ${w}? Se borra también de lo guardado.`)) return; delete weeks[w]; paintSlots(); compute(); await Evals.removeWeek(viewZonas(), month, w); toast(`${w} quitada.`, 'ok'); });
        await start();
        if (['formador', 'admin'].includes(me().rol) && $('#ev-ini')) EvalsIni.mount($('#ev-ini')).catch(e => console.error(e));
    }
    async function start() {
        weekKeys = evalWeeksOfMonth(month).map(w => 'W' + w);
        R = Evals.roster(viewZonas());
        await Evals.load(viewZonas(), month);
        weeks = { ...Evals.weeksFor(viewZonas(), month) };
        dirty = false; paintSlots(); compute();
    }
    function paintSlots() {
        $('#ev-slots').innerHTML = weekKeys.map(w => { const W = weeks[w]; return `<div class="ev-slot ${W ? 'on' : ''}"><b>${w}</b>${W ? `<span class="ev-file" title="${esc(W.fileName || '')}">📄 ${esc((W.fileName || 'guardada').slice(0, 26))}<br><small>${W.matchedN != null ? W.matchedN : '…'}/${W.total || W.rows.length} cruzadas${W.nac ? ' · 🇨🇴 nacional' : ''}${W.saved ? ' · guardada ✅' : ' · guardando…'}</small></span><small class="ev-when">Última data cargada: ${W.uploadedAt ? esc(fechaHora(W.uploadedAt)) : '—'}${W.uploadedBy ? ' · ' + esc(String(W.uploadedBy).split(' ')[0]) : ''}</small><button class="icon-btn" title="Quitar" data-del="${w}">🗑️</button>` : '<span class="mute">Sin data</span>'}<label class="btn btn-ghost sm">📂 ${W ? 'Reemplazar' : 'Adjuntar'}<input type="file" data-w="${w}" accept=".xlsx,.xls,.csv,.txt" hidden></label></div>`; }).join('');
    }
    async function onFile(w, file) {
        if (!file) return;
        $('#ev-status').textContent = `Leyendo ${file.name}…`;
        try {
            // Administrador, coordinador o gerente: la evaluación es nacional (se cruza con todo el país y la ven todos).
            // Formador: queda en su zona.
            const nacional = Evals.canNacional(), allZ = State.zones.map(z => z.nombre);
            const W = await Evals.processFile(file, Evals.rosterAll());
            W.uploadedAt = Date.now(); W.uploadedBy = me().nombre; W.nac = false;
            weeks[w] = W; paintSlots(); compute();
            await Evals.saveWeeks(nacional ? allZ : scopedZones(), month, { [w]: W }, { uploadedBy: me().nombre, uploadedById: me().userId });
            W.saved = true; if (nacional) { W.nac = true; weeks = { ...Evals.weeksFor(viewZonas(), month) }; }
            paintSlots(); compute();
            const unm = Object.keys(W.unmatched).length;
            const hw = W.how || {}; toast(`${w}${nacional ? ' (nacional)' : ''}: ${W.matchedN} de ${W.total} filas cruzadas · ${int(hw.cedula)} por cédula, ${int(hw['cedula~'])} con cédula mal digitada, ${int(hw.nombre) + int(hw['nombre~']) + int(hw.parcial)} por nombre${unm ? ` · ${unm} sin cruzar` : ''}`, unm ? 'warn' : 'ok', 7000);
        } catch (e) { console.error(e); toast('No se pudo leer: ' + (e.message || e), 'error', 7000); $('#ev-status').textContent = 'No se pudo leer el archivo: ' + (e.message || e); }
        finally { const i = $(`[data-w="${w}"]`); if (i) i.value = ''; }
    }
    // Edición manual de una nota (solo formador)
    function editNota(key, w) {
        const a = S && S.advisors.find(x => x.key === key); if (!a) return;
        const s = a.weeks[w], o = Evals.ovr(month, key, w);
        const m = openModal(`<h3 class="modal-title">✏️ ${esc(a.nombre)} · ${esc(w)}</h3>
            <p class="mute">${esc(a.tienda)} · ${o ? `ajustada a mano${o.by ? ' por ' + esc(o.by) : ''}` : s ? `según la data: ${s.best == null ? 'presentó (sin nota)' : 'nota ' + s.best}` : 'según la data: no la presentó'}</p>
            <label class="lbl">Nota (0 a 100)</label><input class="input num" type="number" min="0" max="100" inputmode="numeric" id="en-nota" value="${s && s.best != null ? s.best : ''}">
            <div class="actions" style="margin-top:12px"><button class="btn btn-primary" data-en="ok">💾 Guardar nota</button><button class="btn btn-ghost" data-en="x">🚫 No la presentó</button>${o ? '<button class="btn btn-ghost" data-en="del">↩️ Volver a la data</button>' : ''}</div>`);
        const save = async val => { await Evals.setManual(month, key, w, val); closeModal(m); compute(); toast(val ? 'Nota ajustada ✅' : 'Ajuste quitado: vuelve a la data', 'ok'); };
        $('[data-en="ok"]', m).onclick = () => { const v = $('#en-nota', m).value; if (v === '' || isNaN(+v)) return toast('Escribe la nota.', 'warn'); save({ nota: Math.max(0, Math.min(100, Math.round(+v))) }); };
        $('[data-en="x"]', m).onclick = () => save({ x: true });
        if ($('[data-en="del"]', m)) $('[data-en="del"]', m).onclick = () => save(null);
    }
    function compute() {
        const out = $('#ev-out'); if (!out) return;
        const loaded = weekKeys.filter(w => weeks[w]);
        if (!R.length) { out.innerHTML = '<div class="card empty">No hay asesores en el alcance: configúralos en cada tienda o carga la data de zona.</div>'; $('#ev-status').textContent = ''; return; }
        if (!loaded.length) { S = null; out.innerHTML = `<div class="card empty">Adjunta la data de al menos una semana. Asesores en ${esc(label().toLowerCase())}: <b>${R.length}</b> en ${new Set(R.map(a => a.storeId)).size} PDV.</div>`; $('#ev-status').textContent = ''; return; }
        S = Evals.summarize(weeks, R, weekKeys, month);
        const cur = S.perWeek[S.perWeek.length - 1];
        const HW = loaded.reduce((acc, w) => { Object.entries(weeks[w].how || {}).forEach(([k, n]) => { acc[k] = (acc[k] || 0) + n; }); return acc; }, {});
        $('#ev-status').innerHTML = `${R.length} asesores en ${new Set(R.map(a => a.storeId)).size} PDV · ${loaded.length} semana(s) cargada(s) · cruce: ${int(HW.cedula)} por cédula, ${int(HW['cedula~'])} con cédula mal digitada, ${int(HW.nombre) + int(HW['nombre~']) + int(HW.parcial)} por nombre${dirty ? ' · <b>Al compartir o guardar el reporte, las evaluaciones quedan guardadas y el plan de trabajo mostrará los pendientes.</b>' : ''}`;
        const unmatchedAll = Object.entries(loaded.reduce((acc, w) => { Object.entries(weeks[w].unmatched || {}).forEach(([k, n]) => { acc[k] = (acc[k] || 0) + n; }); return acc; }, {}));
        const cls = n => n == null ? '' : n >= 80 ? 'ok' : n >= 70 ? 'warn' : 'bad';
        const multi = viewZonas().length > 1, editor = me().rol === 'formador';
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
        <section class="card"><div class="row between wrap" style="gap:8px"><h3 class="h3">Detalle por PDV y asesor</h3>${editor ? '<input class="input" id="ev-q" placeholder="🔎 Buscar asesor o tienda" style="max-width:260px">' : ''}</div>
            ${editor ? '<p class="hint">✏️ <b>Edición manual (solo formador):</b> toca la nota de cualquier asesor en cualquier semana para corregirla, marcar que sí la presentó o que no la presentó. Lo ajustado a mano lleva ✏️ y manda sobre la data.</p>' : ''}
            <div class="tbl-scroll"><table class="tbl compact" id="ev-det"><thead><tr><th>PDV</th><th>Asesor</th><th>Cédula</th>${S.loaded.map(w => `<th>${w}</th>`).join('')}<th>Prom.</th></tr></thead><tbody>
            ${S.advisors.map(a => { const ns = Object.values(a.weeks).map(x => x.best).filter(n => n != null); const pr = ns.length ? Math.round(sum(ns) / ns.length) : null; return `<tr data-q="${esc(slug(a.nombre + ' ' + a.tienda))}"><td class="l"><small>${esc(a.tienda)}</small></td><td class="l"><b>${esc(a.nombre)}</b></td><td><small>${esc(a.cedula || '—')}</small></td>${S.loaded.map(w => { const s = a.weeks[w], o = Evals.ovr(month, a.key, w), pill = !s ? '<i class="pill bad">falta</i>' : s.best == null ? '<i class="pill ok">✓</i>' : `<i class="pill ${cls(s.best)}">${s.best}</i>`; return `<td>${editor ? `<button class="ev-edit ${o ? 'man' : ''}" data-ek="${esc(a.key)}" data-ew="${w}" title="Editar nota">${pill}${o ? '✏️' : ''}</button>` : pill}</td>`; }).join('')}<td>${pr == null ? '—' : `<b>${pr}</b>`}</td></tr>`; }).join('')}
            </tbody></table></div>
            <p class="hint">Se toma la nota más alta de cada semana. Las notas se llevan a escala de 0 a 100.</p>
        </section>
        ${actionBarHTML()}`;
        if (editor) {
            const q = $('#ev-q', out); if (q) q.oninput = () => { const t = slug(q.value); $$('#ev-det tbody tr', out).forEach(tr => { tr.hidden = !!t && !tr.dataset.q.includes(t); }); };
            $$('[data-ek]', out).forEach(b => b.onclick = () => editNota(b.dataset.ek, b.dataset.ew));
        }
        ReportActions.bind(out, {
            title: 'Reporte de evaluaciones · Central de Operaciones',
            validate: () => S ? null : 'Carga al menos una semana.',
            filename: () => `Evaluaciones_${slug(label())}_${month}.png`,
            build: stage => buildEvalsCanvas(stage, { label: label(), month, S, autor: me() }),
            persist: async () => { const r = await Evals.saveWeeks(Evals.canNacional() ? State.zones.map(z => z.nombre) : viewZonas(), month, Object.fromEntries(Object.entries(weeks).filter(([, W]) => W && !W.saved)), { uploadedBy: me().nombre, uploadedById: me().userId }); dirty = false; Object.values(weeks).forEach(W => { W.saved = true; }); paintSlots(); return r; }
        });
    }
    return { render };
})());

// ---------------------------------------------------------------------------
// EVALUACIONES INICIALES DE PRODUCTO (12, una por producto) · misma lógica de cruce que las semanales.
// Cuentan TODOS los asesores que estuvieron en el mes, también los retirados (salen con franja roja clara).
// Si las sube el administrador (o coordinador/gerente) quedan nacionales y las ven todos los formadores.
// ---------------------------------------------------------------------------
const EvalsIni = (() => {
    const me = () => State.session;
    let zonas = [], view = '', month = '', keys = [], weeks = {}, R = [], S = null, box = null;
    const mk = () => month + '~ini';
    const viewZonas = () => view ? [view] : zonas;
    const label = () => view ? `Zona ${view}` : (isAllZones() ? 'Nacional' : (myRegional() && ['coordinador', 'gerente'].includes(me().rol) ? `Regional ${myRegional()}` : `Zona ${zonas[0] || ''}`));
    const nm = k => EVAL_INI_NAME(k);
    async function mount(container) {
        box = container; zonas = scopedZones(); view = zonas.length === 1 ? zonas[0] : (zonas.includes(me().zona) ? me().zona : '');
        month = todayStr().slice(0, 7); weeks = {};
        box.innerHTML = `<details class="card acc ei-card" open><summary><span>🧪 Evaluaciones iniciales de producto <small class="mute">· ${EVAL_INICIAL.length} productos · todos los asesores del mes, también los retirados</small></span></summary>
            <p class="mute">Sube la data de cada producto (nombre, cédula y nota). Igual que las semanales: cruza por cédula y por nombre, toma la nota más alta y abajo ves quién las lleva y quién no. Si la carga el administrador, la ven todos los formadores.</p>
            <div class="row wrap" style="gap:10px;margin-top:10px;align-items:flex-end">
                ${zonas.length > 1 ? `<label class="field-inline grow"><span class="lbl">Ámbito</span><select id="ei-zona" class="input"><option value="">Todo el alcance · ${zonas.length} zonas</option>${zonas.map(z => `<option value="${esc(z)}" ${z === view ? 'selected' : ''}>${esc(z)}</option>`).join('')}</select></label>` : ''}
                <label class="field-inline"><span class="lbl">Mes</span><input type="month" id="ei-month" class="input" value="${month}"></label>
            </div>
            <div id="ei-slots" class="ev-slots"></div>
            <p class="hint" id="ei-status"></p>
            <div id="ei-out"></div></details>`;
        if ($('#ei-zona', box)) $('#ei-zona', box).onchange = e => { view = e.target.value; start(); };
        $('#ei-month', box).onchange = e => { month = e.target.value || month; start(); };
        $('#ei-slots', box).addEventListener('change', e => { if (e.target.dataset.wi) onFile(e.target.dataset.wi, e.target.files[0]); });
        $('#ei-slots', box).addEventListener('click', async e => { const b = e.target.closest('[data-deli]'); if (!b) return; const k = b.dataset.deli; if (!confirm(`¿Quitar la evaluación de ${nm(k)}? Se borra también de lo guardado.`)) return; delete weeks[k]; paintSlots(); compute(); await Evals.removeWeek(viewZonas(), mk(), k); toast(`${nm(k)} quitada.`, 'ok'); });
        await start();
    }
    async function start() {
        keys = EVAL_INICIAL.map(x => x[0]);
        R = Evals.roster(viewZonas(), { retirados: month });
        await Evals.load(viewZonas(), mk());
        weeks = { ...Evals.weeksFor(viewZonas(), mk()) };
        paintSlots(); compute();
    }
    function paintSlots() {
        $('#ei-slots', box).innerHTML = keys.map(k => { const W = weeks[k]; return `<div class="ev-slot ${W ? 'on' : ''}"><b>${esc(nm(k))}</b>${W ? `<span class="ev-file" title="${esc(W.fileName || '')}">📄 ${esc((W.fileName || 'guardada').slice(0, 26))}<br><small>${W.matchedN != null ? W.matchedN : '…'}/${W.total || W.rows.length} cruzadas${W.nac ? ' · 🇨🇴 nacional' : ''}${W.saved ? ' · guardada ✅' : ' · guardando…'}</small></span><small class="ev-when">Última carga: ${W.uploadedAt ? esc(fechaHora(W.uploadedAt)) : '—'}${W.uploadedBy ? ' · ' + esc(W.uploadedBy) : ''}</small><button class="icon-btn" title="Quitar" data-deli="${k}">🗑️</button>` : '<span class="mute">Sin data</span>'}<label class="btn btn-ghost sm">📂 ${W ? 'Reemplazar' : 'Adjuntar'}<input type="file" data-wi="${k}" accept=".xlsx,.xls,.csv,.txt" hidden></label></div>`; }).join('');
    }
    async function onFile(k, file) {
        if (!file) return;
        $('#ei-status', box).textContent = `Leyendo ${file.name}…`;
        try {
            const nacional = Evals.canNacional(), allZ = State.zones.map(z => z.nombre);
            const W = await Evals.processFile(file, Evals.rosterAll());
            W.uploadedAt = Date.now(); W.uploadedBy = me().nombre; W.nac = false;
            weeks[k] = W; paintSlots(); compute();
            await Evals.saveWeeks(nacional ? allZ : scopedZones(), mk(), { [k]: W }, { uploadedBy: me().nombre, uploadedById: me().userId });
            W.saved = true; if (nacional) { W.nac = true; weeks = { ...Evals.weeksFor(viewZonas(), mk()) }; }
            paintSlots(); compute();
            const unm = Object.keys(W.unmatched).length;
            toast(`${nm(k)}${nacional ? ' (nacional)' : ''}: ${W.matchedN} de ${W.total} filas cruzadas${unm ? ` · ${unm} sin cruzar` : ''}`, unm ? 'warn' : 'ok', 6000);
        } catch (e) { console.error(e); toast('No se pudo leer: ' + (e.message || e), 'error', 7000); $('#ei-status', box).textContent = 'No se pudo leer el archivo: ' + (e.message || e); }
        finally { const i = $(`[data-wi="${k}"]`, box); if (i) i.value = ''; }
    }
    function editNota(key, k) {
        const a = S && S.advisors.find(x => x.key === key); if (!a) return;
        const s = a.weeks[k], o = Evals.ovr(mk(), key, k);
        const m = openModal(`<h3 class="modal-title">✏️ ${esc(a.nombre)} · ${esc(nm(k))}</h3>
            <p class="mute">${esc(a.tienda)} · ${o ? `ajustada a mano${o.by ? ' por ' + esc(o.by) : ''}` : s ? `según la data: ${s.best == null ? 'presentó (sin nota)' : 'nota ' + s.best}` : 'según la data: no la presentó'}</p>
            <label class="lbl">Nota (0 a 100)</label><input class="input num" type="number" min="0" max="100" inputmode="numeric" id="ein-nota" value="${s && s.best != null ? s.best : ''}">
            <div class="actions" style="margin-top:12px"><button class="btn btn-primary" data-ein="ok">💾 Guardar nota</button><button class="btn btn-ghost" data-ein="x">🚫 No la presentó</button>${o ? '<button class="btn btn-ghost" data-ein="del">↩️ Volver a la data</button>' : ''}</div>`);
        const save = async val => { await Evals.setManual(mk(), key, k, val); closeModal(m); compute(); toast(val ? 'Nota ajustada ✅' : 'Ajuste quitado', 'ok'); };
        $('[data-ein="ok"]', m).onclick = () => { const v = $('#ein-nota', m).value; if (v === '' || isNaN(+v)) return toast('Escribe la nota.', 'warn'); save({ nota: Math.max(0, Math.min(100, Math.round(+v))) }); };
        $('[data-ein="x"]', m).onclick = () => save({ x: true });
        if ($('[data-ein="del"]', m)) $('[data-ein="del"]', m).onclick = () => save(null);
    }
    function compute() {
        const out = $('#ei-out', box); if (!out) return;
        const loaded = keys.filter(k => weeks[k]);
        if (!R.length) { out.innerHTML = '<div class="card empty">No hay asesores en el alcance.</div>'; return; }
        if (!loaded.length) { S = null; out.innerHTML = `<p class="hint">Adjunta la data de al menos un producto. Asesores del mes en ${esc(label().toLowerCase())}: <b>${R.length}</b>${R.filter(a => a.retirado).length ? ` (${R.filter(a => a.retirado).length} retirados)` : ''}.</p>`; return; }
        S = Evals.summarize(weeks, R, keys, mk());
        const A = S.advisors.map(a => ({ ...a, hechas: loaded.filter(k => a.weeks[k]).length, faltan: loaded.filter(k => !a.weeks[k]) }));
        const tot = A.length, comp = A.filter(a => !a.faltan.length).length, ret = A.filter(a => a.retirado), falt = sum(A.map(a => a.faltan.length));
        const notas = A.flatMap(a => Object.values(a.weeks).map(x => x.best).filter(n => n != null)), prom = notas.length ? Math.round(sum(notas) / notas.length) : null;
        const cls = n => n == null ? '' : n >= 80 ? 'ok' : n >= 70 ? 'warn' : 'bad', editor = me().rol === 'formador';
        $('#ei-status', box).innerHTML = `${tot} asesores del mes (${tot - ret.length} activos · ${ret.length} retirados) · ${loaded.length} de ${keys.length} productos cargados`;
        S.ini = { A, loaded, tot, comp, falt, prom, ret: ret.length };
        out.innerHTML = `<section class="kpi-row">
            <div class="kpi hl"><span>Asesores del mes</span><b>${tot}</b><small>${tot - ret.length} activos · ${ret.length} retirados</small></div>
            <div class="kpi"><span>Al día</span><b>${comp}/${tot}</b><small>con las ${loaded.length} evaluaciones cargadas</small></div>
            <div class="kpi ${falt ? 'warn' : ''}"><span>Evaluaciones faltantes</span><b>${falt}</b><small>en ${A.filter(a => a.faltan.length).length} asesores</small></div>
            <div class="kpi"><span>Cumplimiento</span><b>${tot && loaded.length ? Math.round((tot * loaded.length - falt) / (tot * loaded.length) * 100) + '%' : '—'}</b><small>promedio de notas ${prom == null ? '—' : prom}</small></div></section>
        <div class="grid2">
            <section class="card"><h3 class="h3">Por producto</h3><div class="tbl-scroll"><table class="tbl compact"><thead><tr><th class="l">Producto</th><th>Presentaron</th><th>Faltan</th><th>Promedio</th></tr></thead><tbody>
                ${S.perWeek.map(p => `<tr><td class="l"><b>${esc(nm(p.w))}</b></td><td>${p.done}/${tot}</td><td>${p.pend ? `<i class="pill warn">${p.pend}</i>` : '0'}</td><td>${p.prom == null ? '—' : `<i class="pill ${cls(p.prom)}">${p.prom}</i>`}</td></tr>`).join('')}</tbody></table></div></section>
            <section class="card"><h3 class="h3">⏳ Quiénes faltan (${A.filter(a => a.faltan.length).length})</h3>
                ${A.filter(a => a.faltan.length).length ? `<ul class="insights">${A.filter(a => a.faltan.length).sort((x, y) => y.faltan.length - x.faltan.length).map(a => `<li class="${a.retirado ? 'ei-ret-li' : ''}"><b>${esc(a.nombre)}</b> <small class="mute">${esc(a.tienda)}${a.retirado ? ' · retirado' : ''}</small>: faltan ${a.faltan.length} (${a.faltan.map(nm).map(esc).join(', ')})</li>`).join('')}</ul>` : '<p class="mute">✅ Todos llevan las evaluaciones cargadas.</p>'}</section>
        </div>
        <section class="card"><div class="row between wrap" style="gap:8px"><h3 class="h3">Detalle por asesor</h3><input class="input" id="ei-q" placeholder="🔎 Buscar asesor o tienda" style="max-width:260px"></div>
            <p class="hint"><span class="ei-ret-tag">Retirado</span> = asesor que estuvo en el mes y ya se retiró: sí cuenta para tu medición.${editor ? ' ✏️ Toca una nota para corregirla.' : ''}</p>
            <div class="tbl-scroll"><table class="tbl compact" id="ei-det"><thead><tr><th>PDV</th><th>Asesor</th><th>Cédula</th>${loaded.map(k => `<th title="${esc(nm(k))}">${esc(nm(k).replace(/^(NOTE|Note|HOT|SMART|GT|XPAD|XBUDS) /, m => m.charAt(0) + '. ').slice(0, 12))}</th>`).join('')}<th>Llevan</th></tr></thead><tbody>
            ${A.map(a => `<tr class="${a.retirado ? 'ei-ret' : ''}" data-q="${esc(slug(a.nombre + ' ' + a.tienda))}"><td class="l"><small>${esc(a.tienda)}</small></td><td class="l"><b>${esc(a.nombre)}</b>${a.retirado ? ` <span class="ei-ret-tag">Retirado${a.retiroFecha ? ' ' + esc(a.retiroFecha.slice(8)) + '/' + esc(a.retiroFecha.slice(5, 7)) : ''}</span>` : ''}</td><td><small>${esc(a.cedula || '—')}</small></td>${loaded.map(k => { const s = a.weeks[k]; const t = !s ? '<b class="r">FALTA</b>' : s.best == null ? '✓' : `<i class="pill ${cls(s.best)}">${s.best}</i>`; return `<td>${editor ? `<button class="ev-n" data-eki="${esc(a.key)}" data-ewi="${k}">${t}${s && s.manual ? ' ✏️' : ''}</button>` : t}</td>`; }).join('')}<td><b class="${a.faltan.length ? 'r' : 'g'}">${a.hechas}/${loaded.length}</b></td></tr>`).join('')}
            </tbody></table></div></section>
        <div class="actions" id="ei-act"><button class="btn btn-ghost" data-act="preview">👁️ Vista previa</button><button class="btn btn-wa" data-act="share">📲 WhatsApp</button><button class="btn btn-primary" data-act="save">⬇️ Descargar</button></div>`;
        const q = $('#ei-q', out); q.oninput = () => { const t = slug(q.value); $$('#ei-det tbody tr', out).forEach(tr => { tr.hidden = !!t && !tr.dataset.q.includes(t); }); };
        if (editor) $$('[data-eki]', out).forEach(b => b.onclick = () => editNota(b.dataset.eki, b.dataset.ewi));
        ReportActions.bind($('#ei-act', out), {
            title: 'Evaluaciones iniciales · Central de Operaciones', noStore: true,
            filename: () => `Evaluaciones_iniciales_${slug(label())}_${month}.png`,
            build: stage => buildEvalsIniCanvas(stage, { label: label(), month, S, autor: me() })
        });
    }
    return { mount };
})();
function buildEvalsIniCanvas(stage, d) {
    const { A, loaded, tot, comp, falt, prom, ret } = d.S.ini, nm = EVAL_INI_NAME, cls = n => n == null ? '' : n >= 80 ? 'g' : n >= 70 ? 'a' : 'r';
    const el = document.createElement('div'); el.className = 'rp sp aud';
    el.innerHTML = `<div class="rp-bar"></div>
    <header class="rp-head"><img class="rp-logo" src="${LOGO_INFINIX}" alt="Infinix">
        <div class="rp-head-mid"><div class="rp-kicker">EVALUACIONES INICIALES DE PRODUCTO · FORMACIÓN</div><div class="rp-title">${esc(d.label.toUpperCase())}</div><div class="rp-sub">${esc(mesLargo(d.month))} · ${loaded.length} de ${EVAL_INICIAL.length} productos cargados · ${tot} asesores del mes (${ret} retirados)</div></div>
        <div class="pl-who"><b>${esc(d.autor.nombre)}</b><small>${ROLES[d.autor.rol] ? ROLES[d.autor.rol].label : ''}</small></div></header>
    <div class="sp-band">
        <div class="hero ${falt ? 'r' : ''}"><span>CUMPLIMIENTO</span><b>${tot && loaded.length ? Math.round((tot * loaded.length - falt) / (tot * loaded.length) * 100) + '%' : '—'}</b><em>${tot * loaded.length - falt} de ${tot * loaded.length} evaluaciones</em></div>
        <div class="ok"><span>Al día</span><b>${comp}<small style="font-size:20px">/${tot}</small></b><em>asesores completos</em></div>
        <div class="${falt ? 'bad' : 'ok'}"><span>Faltantes</span><b>${falt}</b><em>en ${A.filter(a => a.faltan.length).length} asesores</em></div>
        <div><span>Promedio</span><b>${prom == null ? '—' : prom}</b><em>de las notas</em></div>
    </div>
    <div class="rp-sec">DETALLE POR ASESOR (RETIRADOS EN ROJO CLARO)</div>
    <table class="rp-tbl sp-tbl"><thead><tr><th class="l">PDV</th><th class="l">ASESOR</th>${loaded.map(k => `<th>${esc(nm(k))}</th>`).join('')}<th class="c-tot">LLEVA</th></tr></thead><tbody>
    ${A.map(a => `<tr class="${a.retirado ? 'ei-ret' : ''}"><td class="l small">${esc(a.tienda)}</td><td class="l"><b>${esc(a.nombre)}</b>${a.retirado ? ' <small>(retirado)</small>' : ''}</td>${loaded.map(k => { const s = a.weeks[k]; return `<td class="${!s ? 'r' : cls(s.best)}">${!s ? 'FALTA' : s.best == null ? '✓' : s.best}</td>`; }).join('')}<td class="c-tot ${a.faltan.length ? 'r' : 'g'}"><b>${a.hechas}/${loaded.length}</b></td></tr>`).join('')}</tbody></table>
    <footer class="rp-foot"><span>Cuentan todos los asesores que estuvieron en el mes, también los retirados. Cruce por cédula y nombre; con varias presentaciones se toma la mejor nota (0–100).</span><b>Infinix · Central de Operaciones</b></footer><div class="rp-bar"></div>`;
    stage.appendChild(el); return el;
}

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
        ${S.advisors.map(a => { const ns = Object.values(a.weeks).map(x => x.best).filter(n => n != null); const pr = ns.length ? Math.round(sum(ns) / ns.length) : null; return `<tr><td class="l small">${esc(a.tienda)}</td><td class="l">${esc(a.nombre)}</td>${S.loaded.map(w => { const s = a.weeks[w]; return `<td class="c-tot ${!s ? 'r' : cls(s.best)}">${!s ? 'FALTA' : s.best == null ? '✓' : s.best}</td>`; }).join('')}<td><b>${pr == null ? dash : pr}</b></td></tr>`; }).join('')}
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

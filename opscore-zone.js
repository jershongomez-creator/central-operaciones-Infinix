// ============================================================================
// MÓDULO 6 · ANÁLISIS DE ZONA (Supervisor, Formador, Coordinador, Gerente, Admin)
// Se carga la data plana (Excel o CSV con la venta real de la zona: tienda,
// asesor, referencia, unidades) y la app la cruza con los targets de cada PDV.
// Sale: estado de cada tienda, referencias rezagadas, asesores, recomendaciones,
// PDV a visitar (seleccionables → llenan el plan de trabajo) y la imagen del
// reporte de zona. La última data cargada queda guardada por zona y mes para
// que el plan de trabajo y la calculadora del asesor la usen.
// ============================================================================

// ---------------------------------------------------------------------------
// Lectura y cruce de la data plana
// ---------------------------------------------------------------------------
const ZoneData = (() => {
    const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '');
    const ROLE = {                                    // palabras clave para detectar columnas (primero el formato DCR / Shop Sales Query)
        storeId: ['SHOPID', 'IDTIENDA', 'CODIGOTIENDA', 'CODIGOPDV', 'IDPDV', 'PDVID', 'POSID', 'CODIGO'],
        store: ['SHOPNAME', 'RETAILERNAME', 'PUNTODEVENTA', 'PDV', 'TIENDA', 'ALMACEN', 'SUCURSAL', 'STORE', 'LOCAL', 'PUNTO', 'SITIO'],
        advisor: ['UPLOADER', 'PROMOTOR', 'ASESOR', 'VENDEDOR', 'PROMOTORA', 'DCR', 'NOMBRE', 'EMPLEADO', 'COLABORADOR'],
        ref: ['MARKETNAME', 'REFERENCIA', 'MODELO', 'PRODUCTO', 'EQUIPO', 'SKU', 'DESCRIPCION', 'MATERIAL', 'ITEM', 'ARTICULO', 'TERMINAL'],
        qty: ['SALESQTY', 'CANTIDAD', 'UNIDADES', 'UNDS', 'UND', 'UDS', 'QTY', 'VENTAS', 'VENTA', 'TOTAL', 'SELLOUT', 'ACTIVACIONES'],
        date: ['SALESDATE', 'FECHA', 'DIA', 'DATE', 'FECHAVENTA'],
        zone: ['SUPERVISORNAME', 'ZONA', 'TERRITORIO'],
        region: ['SALESREGION3', 'REGIONAL', 'REGION'],
        brand: ['BRAND', 'MARCA'],
        category: ['PRODUCTCATEGORY', 'CATEGORIA', 'CATEGORY', 'TIPOPRODUCTO'],
        position: ['POSITION', 'CARGO'],
        city: ['CITY', 'CIUDAD', 'MUNICIPIO'],
        channel: ['SALESCHANNEL', 'CANALDEVENTA', 'TIPOCANAL'],
        chain: ['SHOPALIAS', 'CADENA', 'CLIENTE', 'CANAL', 'RETAIL', 'ALIADO']
    };
    const PRIORITY = ['storeId', 'store', 'advisor', 'ref', 'qty', 'date', 'zone', 'region', 'brand', 'category', 'position', 'city', 'channel', 'chain'];
    // Regla de oro: solo se analizan las 7 cadenas (Éxito, Alkosto, Ktronix, Falabella, Cencosud, WOM, Olímpica). IR y demás canales se ignoran.
    const OFFICIAL_ALIAS = /^(EXITO|ALKOSTO|KTRONIX|FALABELLA|CENCOSUD|JUMBO|METRO|WOM|OLIMPICA)/;

    // Detecta qué columna cumple cada papel por el encabezado (la persona puede corregirlo)
    function guessMapping(headers) {
        const map = {}, used = new Set();
        PRIORITY.forEach(role => {
            let best = -1, bestScore = 0;
            headers.forEach((h, i) => {
                if (used.has(i)) return;
                const n = norm(h); if (!n) return;
                ROLE[role].forEach((k, ki) => { const sc = n === k ? 100 - ki : n.includes(k) ? 60 - ki : 0; if (sc > bestScore) { bestScore = sc; best = i; } });
            });
            if (best >= 0) { map[role] = best; used.add(best); }
        });
        return map;
    }

    // Excel (ExcelJS) o CSV → { headers, rows }
    async function readFile(file) {
        const name = (file.name || '').toLowerCase();
        if (name.endsWith('.csv') || name.endsWith('.txt')) return parseCSV(await file.text());
        if (typeof ExcelJS === 'undefined') throw new Error('La librería de Excel no cargó; usa un archivo CSV o revisa la conexión.');
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(await file.arrayBuffer());
        let best = null;
        wb.eachSheet(ws => { if (!best || ws.rowCount > best.rowCount) best = ws; });   // la hoja con más filas es la data
        if (!best) throw new Error('El archivo no tiene hojas con datos.');
        const grid = [];
        best.eachRow({ includeEmpty: false }, (row, n) => {
            const vals = [];
            row.eachCell({ includeEmpty: true }, (cell, c) => { vals[c - 1] = cellText(cell); });
            grid.push(vals);
        });
        return splitHeader(grid);
    }
    function cellText(cell) {
        let v = cell.value;
        if (v && typeof v === 'object') {
            if (v.richText) v = v.richText.map(t => t.text).join('');
            else if (v.result !== undefined) v = v.result;
            else if (v.text !== undefined) v = v.text;
        }
        if (v instanceof Date) return dstr(new Date(v.getTime() + v.getTimezoneOffset() * 60000));
        return v == null ? '' : String(v).trim();
    }
    function parseCSV(text) {
        const sep = (text.match(/;/g) || []).length > (text.match(/,/g) || []).length ? ';' : ',';
        const rows = [];
        for (const line of text.split(/\r?\n/)) {
            if (!line.trim()) continue;
            const out = []; let cur = '', q = false;
            for (let i = 0; i < line.length; i++) {
                const ch = line[i];
                if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
                else if (ch === sep && !q) { out.push(cur.trim()); cur = ''; }
                else cur += ch;
            }
            out.push(cur.trim()); rows.push(out);
        }
        return splitHeader(rows);
    }
    // El encabezado es la primera fila con al menos 3 textos no numéricos
    function splitHeader(grid) {
        let h = 0;
        for (let i = 0; i < Math.min(grid.length, 15); i++) { if (grid[i].filter(x => x && isNaN(+x)).length >= 3) { h = i; break; } }
        const headers = grid[h].map(x => String(x || '').trim());
        return { headers, rows: grid.slice(h + 1).filter(r => r.some(x => x !== '' && x != null)) };
    }

    // ---- Cruces ----------------------------------------------------------
    const modelIndex = () => INFINIX_MODELS.map(m => ({ key: m.key, n: norm(m.name).replace(/PLUS$/, '') })).sort((a, b) => b.n.length - a.n.length);
    const accIndex = () => INFINIX_ACCESSORIES.map(a => ({ key: a.key, n: norm(a.name.split(' ').slice(0, 2).join(' ')) })).sort((a, b) => b.n.length - a.n.length);
    function matchModel(ref, idx) {
        const n = norm(ref).replace('PLUS', '');
        if (!n) return null;
        for (const m of idx) if (n.includes(m.n)) return m.key;              // el nombre más largo que quepa gana (HOT 70 PRO 5G antes que HOT 70)
        return null;
    }
    const matchModelName = ref => matchModel(ref, modelIndex());
    const matchAccName = ref => { const n = norm(ref); for (const a of accIndex()) if (n.includes(a.n)) return a.key; return null; };
    // "1052409027 NOMBRE APELLIDO" o "Nombre Apellido - 1052409027" → { nombre, cedula }
    function parseAdvisor(v) {
        const s = String(v || '').trim();
        let m = s.match(/^(\d{5,})\s+(.+)$/); if (m) return { nombre: titleCase(m[2]), cedula: m[1] };
        m = s.match(/^(.+?)\s*-\s*(\d{5,})$/); if (m) return { nombre: titleCase(m[1]), cedula: m[2] };
        return { nombre: titleCase(s), cedula: '' };
    }
    const tokens = s => norm(s).replace(/(TIENDA|ALMACEN|ALMACENES|PDV|PUNTO|DE|LA|EL|LOS|LAS|CC|CENTROCOMERCIAL)/g, ' ').split(' ').filter(Boolean);
    function matchStore(name, stores, manual) {
        const n = norm(name); if (!n) return null;
        if (manual && manual[n] !== undefined) return manual[n] || null;       // asignación manual (o "ignorar" = '')
        let best = null, bestScore = 0;
        stores.forEach(st => {
            const cands = [st.tienda, st.usuario, `${st.cadena || ''} ${st.tienda}`, `${st.cadena || ''} ${st.ciudad || ''}`];
            cands.forEach(c => {
                const cn = norm(c); if (!cn) return;
                let sc = 0;
                if (cn === n) sc = 100;
                else if (n.includes(cn) || cn.includes(n)) sc = 80 + Math.min(cn.length, n.length) / 10;
                else { const a = new Set(tokens(c)), b = tokens(name); const hit = b.filter(t => t.length > 2 && a.has(t)).length; if (hit) sc = 40 + hit * 10 - Math.abs(a.size - b.length); }
                if (sc > bestScore) { bestScore = sc; best = st; }
            });
        });
        return bestScore >= 50 ? best : null;
    }
    const titleCase = s => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase().replace(/(^|\s|\.)([a-záéíóúñ])/g, (m, p, c) => p + c.toUpperCase());

    // Construye el snapshot de la zona a partir de la data cruda y el mapeo de columnas
    // Cruza la data con las tiendas. Devuelve un snapshot por zona del alcance ({ zona: snap }) y los totales de descarte.
    // Las tiendas se cruzan primero por Shop ID (exacto) y luego por nombre; las de otras zonas se descartan en silencio.
    function build(parsed, map, opts) {
        const { zonas, stores, allStores = State.stores, manualStores = {}, month } = opts;
        const idx = modelIndex();
        const mk0 = () => ({ stores: {}, unmatchedStores: {}, unmatchedRefs: {}, rowsTotal: parsed.rows.length, rowsUsed: 0, rowsOtherBrand: 0, rowsNoOficial: 0, rowsOtherMonth: 0, rowsOtherZone: 0, rowsAcc: 0, maxDate: '', advisors: 0, chainUnits: {}, rowsOffChain: 0, dayRows: {} });
        const tot = mk0(), snaps = {};
        zonas.forEach(z => { snaps[z] = { ...mk0(), zona: z, regional: zoneRegional(z), month }; });
        const zoneSet = new Set(zonas), scopedNorm = new Set(zonas.map(norm));
        const byShop = {}; allStores.forEach(st => { if (st.shopId) byShop[norm(st.shopId)] = st; });
        // Tiendas inhabilitadas: su venta pasa a la tienda que recibió su target, o se ignora si el target se descontó
        const off = new Set();
        (State.storesDeleted || []).forEach(st => { if (!st.shopId) return; const d = st.mergedInto && storeById(st.mergedInto); if (d) byShop[norm(st.shopId)] = d; else off.add(norm(st.shopId)); });
        const cache = {};
        parsed.rows.forEach(r => {
            const get = role => map[role] === undefined ? '' : String(r[map[role]] ?? '').trim();
            if (map.brand !== undefined && get('brand') && !/INFINIX/i.test(get('brand'))) { tot.rowsOtherBrand++; return; }
            const d = normDate(get('date'));
            if (d) { if (month && d.slice(0, 7) !== month) { tot.rowsOtherMonth++; return; } if (d > tot.maxDate) tot.maxDate = d; tot.dayRows[d] = (tot.dayRows[d] || 0) + 1; }
            if ((map.channel !== undefined && /^IR\b/i.test(get('channel'))) || (map.chain !== undefined && get('chain') && !OFFICIAL_ALIAS.test(norm(get('chain'))))) { tot.rowsNoOficial++; return; }
            const sid = get('storeId'), name = get('store'); if (!name && !sid) return;
            if (sid && off.has(norm(sid))) { tot.rowsDisabled = (tot.rowsDisabled || 0) + 1; return; }
            const k = norm(sid) + '|' + norm(name);
            if (!(k in cache)) cache[k] = (sid && byShop[norm(sid)]) || matchStore(name, stores, manualStores) || matchStore(name, allStores, manualStores);
            const st = cache[k] && normLogoKey(cache[k].logoKey) !== 'otro' ? cache[k] : null;
            const qty = map.qty === undefined ? 1 : Math.round(numf(get('qty')));
            if (!st) {
                // Solo se reporta como "sin cruzar" si la fila es de una zona del alcance (o la data no trae zona)
                const z = get('zone'); if (map.zone === undefined || !z || scopedNorm.has(norm(z)) || [...scopedNorm].some(x => x.startsWith(norm(z)))) tot.unmatchedStores[name || sid] = (tot.unmatchedStores[name || sid] || 0) + qty; else tot.rowsOtherZone++;
                return;
            }
            if (!zoneSet.has(st.zona)) { tot.rowsOtherZone++; return; }
            const ck = chainGroup(st).key; tot.chainUnits[ck] = (tot.chainUnits[ck] || 0) + qty; if (!chainOn(st)) tot.rowsOffChain += qty;   // la data de todas las cadenas se guarda; el filtro se aplica al analizar
            const snap = snaps[st.zona];
            const S = snap.stores[st.id] = snap.stores[st.id] || { storeId: st.id, tienda: st.tienda, total: 0, ventas: {}, otros: 0, asesores: {}, refsOtras: {}, accesorios: {}, cedulas: {} };
            const cat = norm(get('category'));
            const ak = (cat && !cat.startsWith('MOBILE') && !cat.startsWith('CELULAR')) || /XPAD|XBUDS|RELOJ|WATCH|CARGADOR|AUDIF/.test(norm(get('ref'))) ? (matchAccName(get('ref')) || norm(get('ref')) || 'ACCESORIO') : null;
            if (ak) { S.accesorios[ak] = (S.accesorios[ak] || 0) + qty; snap.rowsAcc += qty; tot.rowsAcc += qty; return; }
            const mk = matchModel(get('ref'), idx);
            if (mk) S.ventas[mk] = (S.ventas[mk] || 0) + qty; else { S.otros += qty; const rn = get('ref') || '(sin referencia)'; S.refsOtras[rn] = (S.refsOtras[rn] || 0) + qty; snap.unmatchedRefs[rn] = (snap.unmatchedRefs[rn] || 0) + qty; tot.unmatchedRefs[rn] = (tot.unmatchedRefs[rn] || 0) + qty; }
            S.total += qty;
            const wk = d ? 'W' + isoWeek(d) : '';
            if (wk) {
                S.sem = S.sem || {}; S.sem[wk] = (S.sem[wk] || 0) + qty; S.dias = S.dias || {}; S.dias[d.slice(8)] = (S.dias[d.slice(8)] || 0) + qty;
                if (mk) { S.diasRef = S.diasRef || {}; const dr = S.diasRef[d.slice(8)] = S.diasRef[d.slice(8)] || {}; dr[mk] = (dr[mk] || 0) + qty; }     // venta por día y referencia (central por semana)
            }
            const pos = norm(get('position'));
            const P = pos && /TRAIN|FORMA|SUPERV|COORD/.test(pos) ? { nombre: 'Formador / Supervisor', cedula: '' } : parseAdvisor(get('advisor'));
            const adv = P.nombre || 'Sin asesor';
            const A = S.asesores[adv] = S.asesores[adv] || { nombre: adv, cedula: P.cedula, total: 0, ventas: {} };
            if (P.cedula) { A.cedula = P.cedula; S.cedulas[adv] = P.cedula; }
            A.total += qty; if (mk) A.ventas[mk] = (A.ventas[mk] || 0) + qty;
            if (wk) { A.sem = A.sem || {}; A.sem[wk] = (A.sem[wk] || 0) + qty; if (mk) { A.semRef = A.semRef || {}; const sr = A.semRef[wk] = A.semRef[wk] || {}; sr[mk] = (sr[mk] || 0) + qty; } }
            snap.rowsUsed += qty; tot.rowsUsed += qty;
        });
        Object.values(snaps).forEach(sn => { sn.advisors = sum(Object.values(sn.stores).map(s => Object.keys(s.asesores).length)); sn.maxDate = tot.maxDate; });
        tot.advisors = sum(Object.values(snaps).map(s => s.advisors)); tot.storesN = sum(Object.values(snaps).map(s => Object.keys(s.stores).length));
        return { snaps, tot };
    }
    // Une varios snapshots de zona en uno solo (vista regional / nacional)
    function merge(snaps, label) {
        const out = { zona: label, month: '', corte: '', stores: {}, zonas: [], rowsUsed: 0, advisors: 0, fileName: '', uploadedBy: '', updatedAt: 0 };
        Object.values(snaps).filter(Boolean).forEach(s => {
            out.zonas.push(s.zona); Object.assign(out.stores, s.stores); out.rowsUsed += s.rowsUsed || 0; out.advisors += s.advisors || 0;
            if ((s.corte || '') > out.corte) { out.corte = s.corte; out.month = s.month; }
            if ((s.updatedAt || 0) > out.updatedAt) { out.updatedAt = s.updatedAt; out.fileName = s.fileName || ''; out.uploadedBy = s.uploadedBy || ''; }
        });
        return out;
    }
    function normDate(v) {
        if (!v) return '';
        const s = String(v).trim();
        let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return `${m[1]}-${pad2(+m[2])}-${pad2(+m[3])}`;
        m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/); if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${pad2(+m[2])}-${pad2(+m[1])}`; }
        if (/^\d{5}$/.test(s)) { const d = new Date(Date.UTC(1899, 11, 30) + (+s) * 86400000); return d.toISOString().slice(0, 10); }   // serial de Excel
        return '';
    }

    // Une en la tienda que recibió el target la venta ya guardada de una tienda inhabilitada (y quita la de las descontadas)
    function foldMerged(snap) {
        if (!snap || !snap.stores) return snap;
        const addMap = (a, b) => { Object.entries(b || {}).forEach(([k, v]) => { a[k] = typeof v === 'object' && v ? addMap(a[k] || {}, v) : (a[k] || 0) + (v || 0); }); return a; };
        (State.storesDeleted || []).forEach(st => {
            const S = snap.stores[st.id]; if (!S) return;
            const d = st.mergedInto && storeById(st.mergedInto);
            if (d) {
                const D = snap.stores[d.id] = snap.stores[d.id] || { storeId: d.id, tienda: d.tienda, total: 0, ventas: {}, otros: 0, asesores: {}, refsOtras: {}, accesorios: {}, cedulas: {} };
                D.total += S.total || 0; D.otros = (D.otros || 0) + (S.otros || 0);
                ['ventas', 'refsOtras', 'accesorios', 'sem', 'dias', 'diasRef'].forEach(k => { if (S[k]) D[k] = addMap(D[k] || {}, S[k]); });
                Object.values(S.asesores || {}).forEach(x => { const A = D.asesores[x.nombre] = D.asesores[x.nombre] || { nombre: x.nombre, cedula: x.cedula, total: 0, ventas: {} }; A.total += x.total || 0; A.ventas = addMap(A.ventas || {}, x.ventas); if (x.sem) A.sem = addMap(A.sem || {}, x.sem); if (x.semRef) A.semRef = addMap(A.semRef || {}, x.semRef); });
            }
            delete snap.stores[st.id];
        });
        return snap;
    }

    // ---- Persistencia: el último snapshot de cada zona/mes --------------
    const snapId = (zona, month) => `${slug(zona)}_${month}`;
    // La data plana es de cada líder: se guarda con su usuario y no cambia lo que ven los demás.
    // Cada líder ve la última que él cargó; si no ha cargado, la más reciente de la zona. La tienda ve siempre la más reciente.
    const ownerKey = () => { const s = State.session; return s && s.type === 'staff' ? slug(s.userId || s.dcr || s.nombre || 'staff') : ''; };
    const ownId = (zona, month) => snapId(zona, month) + '__u_' + ownerKey();
    async function saveAll(snaps, meta) {
        const ops = [], s = State.session || {};
        State.zoneSnaps = State.zoneSnaps || {};
        Object.values(snaps).forEach(sn => {
            if (!Object.keys(sn.stores).length) return;
            const doc = { ...sn, ...meta, id: ownerKey() ? ownId(sn.zona, sn.month) : snapId(sn.zona, sn.month), owner: ownerKey(), ownerName: s.nombre || '', uploadedBy: s.nombre || meta.uploadedBy || '', updatedAt: Date.now() };
            State.zoneSnaps[sn.zona] = doc; ops.push({ op: 'set', col: COL.zoneData, id: doc.id, data: doc, merge: false });
        });
        return ops.length ? Data.batch(ops) : { synced: true };
    }
    const save = (snap, meta) => saveAll({ [snap.zona]: snap }, meta);
    async function pick(zona, month) {
        const mine = ownerKey() ? await Data.get(COL.zoneData, ownId(zona, month)).catch(() => null) : null;
        if (mine) return mine;
        const all = (await Data.list(COL.zoneData, [['zona', '==', zona], ['month', '==', month]]).catch(() => [])).filter(d => !d.demo && d.stores);
        return all.sort((a, b) => ((b.corte || '') + (b.updatedAt || 0)).localeCompare((a.corte || '') + (a.updatedAt || 0)))[0] || null;
    }
    // Carga los snapshots guardados de una lista de zonas para el mes
    async function loadMany(zonas, month) {
        month = month || todayStr().slice(0, 7); State.zoneSnaps = State.zoneSnaps || {};
        const docs = await Promise.all(zonas.map(z => pick(z, month)));
        // Sin data guardada de la zona: se usa el corte precargado del mes (opscore-snap.js), si es más nuevo que nada
        const seedSnap = z => typeof SNAP_SEED !== 'undefined' && SNAP_SEED[z] && SNAP_SEED[z].month === month ? JSON.parse(JSON.stringify(SNAP_SEED[z])) : null;
        zonas.forEach((z, i) => { if (!docs[i]) docs[i] = seedSnap(z); if (docs[i] && seedSnap(z) && ((docs[i].corte || '') < SNAP_SEED[z].corte || ((docs[i].corte || '') <= SNAP_SEED[z].corte && !Object.values(docs[i].stores || {}).some(s => s.dias)))) docs[i] = seedSnap(z); });
        docs.forEach(d => { if (d) foldMerged(d); });
        zonas.forEach((z, i) => { if (docs[i]) State.zoneSnaps[z] = docs[i]; else if (State.zoneSnaps[z] && State.zoneSnaps[z].month !== month) delete State.zoneSnaps[z]; });
        return Object.fromEntries(zonas.map((z, i) => [z, docs[i] || State.zoneSnaps[z] || null]));
    }
    async function load(zona, month) { if (!zona) return null; const r = await loadMany([zona], month); return r[zona]; }
    const current = () => State.zoneSnaps || {};
    const forStore = storeId => { const st = storeById(storeId), s = st && State.zoneSnaps ? State.zoneSnaps[st.zona] : null; return s && s.stores && s.stores[storeId] ? { ...s.stores[storeId], corte: s.corte, month: s.month } : null; };

    // ---- Análisis -----------------------------------------------------------
    function analyze(snap, stores) {
        const corte = snap.corte || todayStr(), day = parseD(corte).getDate(), dim = daysInMonth(corte.slice(0, 7));
        const rows = stores.map(st => {
            const S = snap.stores[st.id] || { total: 0, ventas: {}, asesores: {}, otros: 0, accesorios: {} };
            const meta = storeMetaMes(st), venta = S.total, proj = Math.round(venta / day * dim);
            // Asesores retirados: sus unidades siguen en la venta de la tienda y la zona, pero no cuentan como asesor ni como HC
            const allAs = Object.values(S.asesores), act = allAs.filter(a => !isBaja(st, a.nombre, a.cedula)), baj = allAs.filter(a => isBaja(st, a.nombre, a.cedula));
            const bajaVenta = sum(baj.map(a => a.total));
            const hc = int(st.hc && st.hc.INFINIX) || Math.max(1, act.filter(a => !isPseudoAdvisor(a.nombre)).length || act.length);
            const inv = st.inventario || {};
            const refs = INFINIX_MODELS.map(m => { const t = int(st.metas && st.metas[m.key]), v = int(S.ventas[m.key]); return { ...m, meta: t, venta: v, inv: int(inv[m.key]), gap: Math.max(0, t - v), cumpl: t > 0 ? v / t : null, proj: Math.round(v / day * dim) }; });
            const conTarget = refs.filter(r => r.meta > 0);
            const rezagadas = conTarget.slice().sort((a, b) => (a.proj / a.meta) - (b.proj / b.meta)).slice(0, 3);
            const foco = conTarget.slice().sort((a, b) => b.gap - a.gap)[0] || refs[0];
            const sinVenta = conTarget.filter(r => r.venta === 0);
            const sinStock = refs.filter(r => r.inv <= 0 && r.meta > 0);
            const asesores = act.sort((a, b) => b.total - a.total);
            const cumpl = meta > 0 ? venta / meta : null, cumplProj = meta > 0 ? proj / meta : null;
            const status = meta <= 0 ? 'sin' : venta === 0 ? 'cero' : cumplProj >= 1 ? 'meta' : cumplProj >= 0.85 ? 'bien' : cumplProj >= 0.7 ? 'riesgo' : 'critico';
            // Prioridad de visita: qué tan lejos está del cierre y cuántas unidades faltan
            const prio = (meta <= 0 ? 0.5 : Math.max(0, 1 - (cumplProj || 0))) * 100 + Math.min(40, Math.max(0, meta - proj)) + (venta === 0 ? 30 : 0) + sinStock.length * 3;
            const focoMan = st.foco && st.foco.ref ? refs.find(x => x.key === st.foco.ref) : null;   // foco fijado a mano en la configuración
            return { st, zona: st.zona, venta, meta, proj, hc, cumpl, cumplProj, roi: venta / hc, roiProj: proj / hc, refs, rezagadas, foco: focoMan || foco, focoNota: st.foco && st.foco.nota || '', sinVenta, sinStock, asesores, bajaVenta, bajaN: baj.length, otros: S.otros, accesorios: sum(Object.values(S.accesorios || {})), status, prio, faltan: Math.max(0, meta - venta), ritmo: +(venta / day).toFixed(1), ritmoReq: meta > 0 ? +((meta - venta) / Math.max(1, dim - day)).toFixed(1) : 0 };
        });
        const totV = sum(rows.map(r => r.venta)), totM = sum(rows.map(r => r.meta)), totP = sum(rows.map(r => r.proj)), totHC = sum(rows.map(r => r.hc));
        const refsZona = INFINIX_MODELS.map(m => { const v = sum(rows.map(r => int(r.refs.find(x => x.key === m.key).venta))), t = sum(rows.map(r => int(r.refs.find(x => x.key === m.key).meta))); return { ...m, venta: v, meta: t, cumpl: t > 0 ? v / t : null, proj: Math.round(v / day * dim), share: pctNum(v, totV) }; }).sort((a, b) => b.venta - a.venta);
        const count = k => rows.filter(r => r.status === k).length;
        const status = { meta: count('meta'), bien: count('bien'), riesgo: count('riesgo'), critico: count('critico'), cero: count('cero'), sin: count('sin') };
        const advisors = rows.flatMap(r => r.asesores.map(a => ({ ...a, tienda: r.st.tienda, storeId: r.st.id }))).sort((a, b) => b.total - a.total);
        const visitar = rows.slice().sort((a, b) => b.prio - a.prio).slice(0, 5);
        const ranking = rows.slice().sort((a, b) => (b.cumplProj ?? -1) - (a.cumplProj ?? -1));
        // Resumen por zona (vista regional)
        const zMap = {};
        rows.forEach(r => { const z = zMap[r.zona] = zMap[r.zona] || { zona: r.zona, tiendas: 0, conVenta: 0, venta: 0, meta: 0, proj: 0, hc: 0, critico: 0 }; z.tiendas++; if (r.venta > 0) z.conVenta++; z.venta += r.venta; z.meta += r.meta; z.proj += r.proj; z.hc += r.hc; if (r.status === 'critico' || r.status === 'cero') z.critico++; });
        const zonasRes = Object.values(zMap).map(z => ({ ...z, cumpl: z.meta > 0 ? z.venta / z.meta : null, cumplProj: z.meta > 0 ? z.proj / z.meta : null, roi: z.hc > 0 ? z.venta / z.hc : null })).sort((a, b) => (b.cumplProj ?? -1) - (a.cumplProj ?? -1));
        return {
            corte, day, dim, rows, ranking, refsZona, status, advisors, visitar, zonasRes, multiZona: zonasRes.length > 1,
            sum: { venta: totV, meta: totM, proj: totP, hc: totHC, cumpl: totM > 0 ? totV / totM : null, cumplProj: totM > 0 ? totP / totM : null, roi: totHC > 0 ? totV / totHC : null, roiProj: totHC > 0 ? totP / totHC : null, bajaVenta: sum(rows.map(r => r.bajaVenta)), bajaN: sum(rows.map(r => r.bajaN)), tiendas: rows.length, conVenta: rows.filter(r => r.venta > 0).length, faltan: Math.max(0, totM - totV), ritmoReq: totM > 0 ? +((totM - totV) / Math.max(1, dim - day)).toFixed(1) : 0 },
            insights: insights(rows, refsZona, status, { venta: totV, meta: totM, proj: totP, day, dim, advisors })
        };
    }

    // Lectura en texto: lo que un coordinador diría al ver los números
    function insights(rows, refsZona, status, z) {
        const out = [], rec = [];
        const pct = (a, b) => b > 0 ? Math.round(a / b * 100) + '%' : '—';
        const names = arr => arr.slice(0, 8).map(r => r.st.tienda).join(', ') + (arr.length > 8 ? ` y ${arr.length - 8} más` : '');
        out.push(`La zona lleva <b>${z.venta}</b> de <b>${z.meta}</b> unidades (${pct(z.venta, z.meta)}) con ${z.day} de ${z.dim} días; a este ritmo cierra en <b>${z.proj}</b> (${pct(z.proj, z.meta)} de la meta).`);
        const crit = rows.filter(r => r.status === 'critico' || r.status === 'cero');
        const risk = rows.filter(r => r.status === 'riesgo');
        const ok = rows.filter(r => r.status === 'meta' || r.status === 'bien');
        if (crit.length) out.push(`<b>${crit.length} PDV en estado crítico</b> (proyección por debajo del 70%): ${names(crit)}.`);
        if (risk.length) out.push(`<b>${risk.length} PDV en riesgo</b> (70–85%): ${names(risk)}.`);
        if (ok.length) out.push(`<b>${ok.length} PDV van bien</b>: ${names(ok.slice(0, 6))}${ok.length > 6 ? '…' : ''}.`);
        const cero = rows.filter(r => r.status === 'cero');
        if (cero.length) out.push(`Sin ninguna venta registrada en la data: ${names(cero)}.`);
        const worstRef = refsZona.filter(r => r.meta > 0).sort((a, b) => (a.proj / a.meta) - (b.proj / b.meta))[0];
        const bestRef = refsZona.filter(r => r.meta > 0).sort((a, b) => (b.proj / b.meta) - (a.proj / a.meta))[0];
        if (bestRef) out.push(`Referencia que mejor rota: <b>${esc(bestRef.name)}</b> (${pct(bestRef.venta, bestRef.meta)} del target, ${bestRef.share}% de la venta).`);
        if (worstRef && worstRef !== bestRef) out.push(`Referencia más rezagada en la zona: <b>${esc(worstRef.name)}</b> (${pct(worstRef.venta, worstRef.meta)} del target).`);
        const topAdv = z.advisors.slice(0, 3), lowAdv = z.advisors.filter(a => a.nombre !== 'Sin asesor').slice(-3).reverse();
        if (topAdv.length) out.push(`Asesores que más venden: ${topAdv.map(a => `<b>${esc(a.nombre)}</b> (${a.total}, ${esc(a.tienda)})`).join(', ')}.`);
        if (lowAdv.length && z.advisors.length > 3) out.push(`Asesores con menor venta: ${lowAdv.map(a => `${esc(a.nombre)} (${a.total}, ${esc(a.tienda)})`).join(', ')}.`);
        // Recomendaciones
        crit.slice(0, 4).forEach(r => rec.push(`<b>${esc(r.st.tienda)}</b>: visita prioritaria. Faltan ${r.faltan} uds; necesita ${r.ritmoReq} uds/día (hoy va a ${r.ritmo}). Foco en <b>${esc(r.foco.name)}</b> (${r.foco.venta} de ${r.foco.meta}).${r.sinStock.length ? ` Pedir reposición: ${r.sinStock.map(x => esc(x.name)).join(', ')}.` : ''}`));
        risk.slice(0, 3).forEach(r => rec.push(`<b>${esc(r.st.tienda)}</b>: acompañamiento en sala y seguimiento diario; cerrar la brecha de ${r.faltan} uds con ${esc(r.foco.name)}.`));
        const stockout = rows.filter(r => r.sinStock.length);
        if (stockout.length) rec.push(`Gestionar inventario en ${stockout.length} PDV con referencias en cero: ${stockout.slice(0, 5).map(r => `${esc(r.st.tienda)} (${r.sinStock.map(x => esc(x.name)).join(', ')})`).join('; ')}.`);
        if (worstRef) rec.push(`Clínica de producto y demo encendida de <b>${esc(worstRef.name)}</b> en toda la zona: es la referencia que más target deja sin cumplir.`);
        if (z.meta > 0 && z.proj < z.meta) rec.push(`Para cerrar en meta la zona debe vender <b>${Math.max(0, z.meta - z.venta)}</b> uds en ${Math.max(1, z.dim - z.day)} días (${(Math.max(0, z.meta - z.venta) / Math.max(1, z.dim - z.day)).toFixed(1)} uds/día frente a ${(z.venta / z.day).toFixed(1)} actuales).`);
        return { lectura: out, recomendaciones: rec };
    }

    return { readFile, guessMapping, build, merge, analyze, save, saveAll, load, loadMany, current, forStore, norm, PRIORITY, matchModelName, parseAdvisor, matchStore, titleCase, foldMerged };
})();

// ---------------------------------------------------------------------------
// Pantalla del módulo
// ---------------------------------------------------------------------------
registerModule('zona', (() => {
    const me = () => State.session;
    // zonas = alcance del usuario (su zona, su regional o el país); view = '' (todo el alcance) o una zona
    let zonas = [], view = '', corte = '', parsed = null, map = {}, manualStores = {}, snaps = {}, tot = null, an = null, fileName = '', selected = new Set(), fresh = false;
    let radarSel = new Set(), radarAll = false, radarFilter = 'prio', advSel = new Set(), ztab = 'resumen', planBy = 'asesor', planMore = false;
    const ROLE_LABEL = { storeId: 'ID de tienda (Shop ID)', store: 'Tienda / PDV', advisor: 'Asesor / Promotor', ref: 'Referencia / Modelo', qty: 'Unidades (si no hay, cada fila = 1)', date: 'Fecha', zone: 'Zona', region: 'Regional', brand: 'Marca', category: 'Categoría (celular / accesorio)', position: 'Cargo', city: 'Ciudad', chain: 'Cadena' };
    const STATUS = { meta: ['En meta', 'ok', THEME.green], bien: ['Bien', 'ok', '#16A34A'], riesgo: ['En riesgo', 'warn', THEME.amber], critico: ['Crítico', 'bad', THEME.red], cero: ['Sin venta', 'bad', '#7F1D1D'], sin: ['Sin target', '', THEME.line] };
    const scopeLabel = () => isAllZones() ? 'Nacional' : (['coordinador', 'gerente'].includes(me().rol) && myRegional() ? `Regional ${myRegional()}` : `Zona ${zonas[0] || ''}`);
    const viewZonas = () => view ? [view] : zonas;
    const viewStores = () => scopedStores().filter(s => viewZonas().includes(s.zona) && chainViewOn(s));
    const canEditAdv = () => ['supervisor', 'formador', 'coordinador', 'gerente', 'admin'].includes(me().rol);
    const chainBtnLabel = () => { const all = chainList(scopedStores().filter(s => viewZonas().includes(s.zona))), on = all.filter(c => !State.chainView.includes(c.key)).length; return `🏷️ Cadenas (${on} de ${all.length})`; };
    const viewLabel = () => view ? `Zona ${view}` : scopeLabel();
    const viewSnap = () => { const sub = Object.fromEntries(viewZonas().map(z => [z, snaps[z]])); return view ? (snaps[view] || { zona: view, stores: {} }) : ZoneData.merge(sub, viewLabel()); };

    async function render(v) {
        zonas = scopedZones();
        view = zonas.length === 1 ? zonas[0] : '';
        corte = addDays(todayStr(), -1); parsed = null; an = null; selected = new Set(); fresh = false;
        v.innerHTML = `
        <section class="card">
            <div class="row between wrap">
                <div><h2 class="h2">Análisis de zona</h2><p class="mute z-desc">Carga la data plana DCR (Shop Sales Query) o cualquier Excel/CSV de venta: la app toma solo las tiendas de tu alcance (<b>${esc(scopeLabel())}</b>) y las cruza con los targets de cada PDV.</p></div>
            </div>
            <div class="row wrap z-ctrl" style="gap:10px;margin-top:10px;align-items:flex-end">
                ${zonas.length > 1 ? `<label class="field-inline grow"><span class="lbl">Ámbito</span><select id="z-zona" class="input"><option value="">${esc(scopeLabel())} · ${zonas.length} zonas</option>${zonas.map(z => `<option value="${esc(z)}">${esc(z)}</option>`).join('')}</select></label>` : `<label class="field-inline grow"><span class="lbl">Zona</span><input class="input" value="${esc(zonas[0] || '')}" readonly></label>`}
                <div class="field-inline grow"><span class="lbl">Asesores</span><button class="input z-adv-btn" id="z-asesor-btn" type="button">👥 Todos los asesores</button></div>
                <label class="field-inline"><span class="lbl">Fecha de corte de la data</span><input type="date" id="z-corte" class="input" value="${corte}" max="${todayStr()}"></label>
                <label class="btn btn-dark" style="margin-bottom:2px">📂 Cargar data plana<input type="file" id="z-file" accept=".xlsx,.xls,.csv,.txt" hidden></label>
                <button class="btn btn-ghost" id="z-chains">🏷️ Cadenas</button>
                <button class="btn btn-ghost" id="z-config">🎯 Configuración inicial</button>
            </div>
            <p class="hint" id="z-status"></p>
        </section>
        <div id="z-map"></div>
        <div id="z-out"></div>`;
        if ($('#z-zona')) $('#z-zona').onchange = e => { view = e.target.value; paintChainBtn(); refresh(); };
        $('#z-corte').onchange = e => { corte = e.target.value || corte; if (parsed) analyzeNow(); };
        $('#z-asesor-btn').onclick = openAdvPicker;
        $('#z-file').onchange = e => onFile(e.target.files[0]);
        $('#z-config').onclick = openConfig;
        $('#z-chains').onclick = () => openChainPicker({ global: me().rol === 'admin', units: tot ? tot.chainUnits : {}, onDone: () => { paintChainBtn(); if (parsed) analyzeNow(); else refresh(); } });
        paintChainBtn();
        $('#z-map').addEventListener('change', e => {
            if (e.target.dataset.role) { const val = e.target.value; if (val === '') delete map[e.target.dataset.role]; else map[e.target.dataset.role] = int(val); analyzeNow(); }
            if (e.target.dataset.unm !== undefined) { manualStores[ZoneData.norm(e.target.dataset.unm)] = e.target.value; analyzeNow(); }
        });
        $('#z-out').addEventListener('change', e => { if (e.target.dataset.rsel) { e.target.checked ? radarSel.add(e.target.dataset.rsel) : radarSel.delete(e.target.dataset.rsel); const c = e.target.closest('.rd-card'); if (c) c.classList.toggle('picked', e.target.checked); const b = $('#z-radar-plan'); if (b) b.textContent = `☀️ Enviar ${radarSel.size} asesor(es) al Plan de trabajo`; return; } if (e.target.dataset.sel) { e.target.checked ? selected.add(e.target.dataset.sel) : selected.delete(e.target.dataset.sel); const b = $('#z-plan'); if (b) b.textContent = `☀️ Crear plan de trabajo con ${selected.size} PDV`; } });
        $('#z-out').addEventListener('click', e => {
            if (e.target.id === 'z-plan') return toPlan();
            if (e.target.id === 'z-radar-plan') return radarToPlan();
            if (e.target.id === 'z-radar-top') { radarSel = new Set(); const seen = new Set(); (radarData.list || []).filter(d => d.prescripcion.semaforo === 'rojo').forEach(d => { if (radarSel.size < 5 && (seen.has(d.storeId) || seen.size < 5)) { seen.add(d.storeId); radarSel.add(d.id); } }); return paintRadar(); }
            const fb = e.target.closest('[data-ficha]'); if (fb) return openAdvisorFicha(fb.dataset.ficha);
            const vs = e.target.closest('[data-advsel]'); if (vs) { advSel = new Set([vs.dataset.advsel]); paintAdvBtn(); paintAdvPanel(); $('#z-adv').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
            const g2 = e.target.closest('[data-goto2]'); if (g2) return showTab(g2.dataset.goto2);
            const rf = e.target.closest('[data-rfilter]'); if (rf) { radarFilter = rf.dataset.rfilter; radarAll = false; return paintRadar(); }
            if (e.target.closest('[data-rmore]')) { radarAll = !radarAll; return paintRadar(); }
        });
        await loadSaved();
    }

    function paintChainBtn() {
        const b = $('#z-chains'); if (!b) return;
        const all = chainList(me().rol === 'admin' ? scopedStoresAll().filter(s => viewZonas().includes(s.zona)) : scopedStores().filter(s => viewZonas().includes(s.zona)));
        const on = all.filter(c => me().rol === 'admin' ? !State.cadenas.off.includes(c.key) : !State.chainView.includes(c.key)).length;
        b.textContent = `🏷️ Cadenas (${on} de ${all.length})`;
        b.title = me().rol === 'admin' ? 'Elige qué cadenas se trabajan en toda la app' : 'Elige qué cadenas ver en tu análisis';
    }

    async function loadSaved() {
        const st = $('#z-status'); if (st) st.textContent = 'Buscando la última data guardada…';
        const month = todayStr().slice(0, 7);
        const loaded = await ZoneData.loadMany(zonas, month);
        if (typeof Evals !== 'undefined') await Evals.ensureLoaded(zonas, month);
        if (!$('#z-out')) return;
        snaps = {}; Object.entries(loaded).forEach(([z, d]) => { if (d && d.stores) snaps[z] = d; });
        tot = null; fresh = false;
        refresh();
    }

    // Pinta la vista actual (todo el alcance o una zona) con lo que haya en memoria
    function refresh() {
        const sn = viewSnap();
        if (sn && Object.keys(sn.stores || {}).length) {
            const sv = viewStores();
            if (!sv.length) { an = null; $('#z-status').textContent = 'Todas las cadenas de este ámbito están ocultas. Usa el botón Cadenas para elegir cuáles trabajar.'; $('#z-out').innerHTML = '<div class="card empty">No hay cadenas seleccionadas para mostrar.</div>'; return; }
            an = ZoneData.analyze(sn, sv);
            if (!fresh) { corte = sn.corte || corte; if ($('#z-corte')) $('#z-corte').value = corte; }
            presel();
            const withData = Object.keys(snaps).filter(z => viewZonas().includes(z)).length;
            $('#z-status').innerHTML = fresh ? statusFresh() : `Última data guardada: <b>${esc(sn.fileName || 'archivo')}</b> · corte ${esc(sn.corte)} ${sn.seed ? '· venta oficial precargada en la app' : `· cargada por ${esc(sn.uploadedBy || '—')} el ${esc(dstr(new Date(sn.updatedAt || Date.now())))}`} · ${an.sum.venta} uds en ${an.sum.conVenta} PDV con venta${viewZonas().length > 1 ? ` de ${withData} zonas` : ''}. Carga un archivo nuevo para actualizar.`;
            if (!fresh) $('#z-map').innerHTML = '';
            paintOut();
        } else {
            an = null;
            $('#z-status').textContent = fresh ? statusFresh() : `Aún no hay data cargada para ${viewLabel()} en el mes. Sube el Excel DCR (Shop Sales Query) o un CSV de la venta.`;
            if (!fresh) $('#z-map').innerHTML = '';
            $('#z-out').innerHTML = `<div class="card empty">Carga la data plana para ver el análisis. Mientras tanto puedes revisar la <b>configuración inicial</b> (targets, HC y foco por PDV).</div>`;
        }
    }
    function statusFresh() {
        if (!tot) return '';
        const parts = [`<b>${esc(fileName)}</b>: ${an ? an.sum.venta : tot.rowsUsed} uds Infinix en ${an ? an.sum.conVenta : tot.storesN} PDV de ${esc(scopeLabel().toLowerCase())}`];
        if (tot.rowsAcc) parts.push(`${tot.rowsAcc} accesorios`);
        if (tot.rowsOffChain) parts.push(`${tot.rowsOffChain} uds de cadenas que no se trabajan (guardadas, fuera del análisis)`);
        if (tot.rowsOtherZone) parts.push(`${tot.rowsOtherZone} filas de otras zonas descartadas`);
        if (tot.rowsNoOficial) parts.push(`${tot.rowsNoOficial} filas de IR u otros canales ignoradas (solo se analizan las 7 cadenas)`);
        if (tot.rowsOtherBrand) parts.push(`${tot.rowsOtherBrand} de otras marcas`);
        if (tot.rowsOtherMonth) parts.push(`${tot.rowsOtherMonth} de otro mes`);
        if (tot.maxDate) parts.push(`última fecha en la data ${tot.maxDate}`);
        return parts.join(' · ') + (fresh ? '. <b>Guardando la data…</b>' : '. <b>✅ Data guardada</b>: queda disponible para el radar, las tarjetas de asesor, el plan de trabajo y la calculadora.');
    }

    async function onFile(file) {
        if (!file) return;
        fileName = file.name; $('#z-status').textContent = 'Leyendo archivo…';
        try {
            parsed = await ZoneData.readFile(file);
            if (!parsed.rows.length) throw new Error('El archivo no tiene filas de datos.');
            map = ZoneData.guessMapping(parsed.headers); manualStores = {};
            if (map.store === undefined || map.ref === undefined) toast('No reconocí todas las columnas: ajústalas en "Columnas detectadas".', 'warn', 6000);
            // Si la data trae fecha, el corte es la última fecha que aparece
            paintMap(); analyzeNow(true);
        } catch (e) { console.error(e); $('#z-status').textContent = 'No se pudo leer el archivo: ' + (e.message || e); toast('No se pudo leer el archivo.', 'error'); }
        finally { $('#z-file').value = ''; }
    }

    function paintMap() {
        const box = $('#z-map'); if (!box || !parsed) return;
        const opt = role => `<select class="input" data-role="${role}"><option value="">— no usar —</option>${parsed.headers.map((h, i) => `<option value="${i}" ${map[role] === i ? 'selected' : ''}>${esc(h || 'Columna ' + (i + 1))}</option>`).join('')}</select>`;
        box.innerHTML = `<details class="card acc" ${map.store === undefined || map.ref === undefined ? 'open' : ''}>
            <summary><span>🧩 Columnas detectadas en <b>${esc(fileName)}</b></span><span class="badge">${parsed.rows.length} filas</span></summary>
            <div class="grid-num" style="margin-top:8px">${ZoneData.PRIORITY.map(r => `<label class="numcell wide"><span>${ROLE_LABEL[r]}</span>${opt(r)}</label>`).join('')}</div>
            <p class="hint">Obligatorias: Tienda y Referencia (el Shop ID, si viene, cruza exacto). Si la data no trae unidades, cada fila cuenta como una venta. Si trae Marca, solo se toma Infinix; si trae Fecha, solo el mes del corte; si trae Zona, las tiendas de otras zonas se descartan.</p>
            <div id="z-unm"></div>
        </details>`;
    }

    function analyzeNow(setCorte) {
        if (!parsed) return;
        if (map.store === undefined || map.ref === undefined) { $('#z-out').innerHTML = '<div class="card empty">Indica cuál columna es la tienda y cuál la referencia.</div>'; return; }
        const month = corte.slice(0, 7);
        const r = ZoneData.build(parsed, map, { zonas, stores: scopedStores(), manualStores, month });
        tot = r.tot;
        if (setCorte && tot.maxDate && tot.maxDate.slice(0, 7) === month) {
            // Corte = último día completo: si el último día trae muy pocas filas (la data se bajó de madrugada), se toma el anterior
            const days = Object.values(tot.dayRows || {}), avg = days.length ? sum(days) / days.length : 0;
            corte = tot.maxDate; if (days.length > 3 && (tot.dayRows[tot.maxDate] || 0) < avg * 0.3 && tot.maxDate.slice(8) !== '01') corte = addDays(tot.maxDate, -1);
            if ($('#z-corte')) $('#z-corte').value = corte;
        }
        Object.values(r.snaps).forEach(sn => { sn.corte = corte; sn.fileName = fileName; sn.uploadedBy = me().nombre; sn.uploadedById = me().userId; sn.columns = Object.fromEntries(Object.entries(map).map(([k, v]) => [k, parsed.headers[v]])); });
        // Las zonas del alcance que no traen filas conservan la data guardada antes
        Object.entries(r.snaps).forEach(([z, sn]) => { if (Object.keys(sn.stores).length) { snaps[z] = sn; State.zoneSnaps[z] = sn; } });
        fresh = true;
        // La data queda guardada de una vez (no hay que esperar a compartir el reporte): la usan el radar, la tarjeta del asesor, el plan y la calculadora
        clearTimeout(analyzeNow.t); analyzeNow.t = setTimeout(() => persistSnaps().then(() => { const s = $('#z-status'); if (s && tot) s.innerHTML = statusFresh(); }).catch(() => { }), 600);
        // Tiendas de la data que no cruzaron con ningún PDV del alcance
        const unm = Object.entries(tot.unmatchedStores);
        const u = $('#z-unm');
        if (u) u.innerHTML = unm.length ? `<label class="lbl">Tiendas de la data sin cruzar (${unm.length}) · asígnalas a un PDV o ignóralas</label>
            <div class="tbl-scroll"><table class="tbl compact"><tbody>${unm.map(([n, q]) => `<tr><td class="l"><b>${esc(n)}</b> <small class="mute">${q} uds</small></td><td><select class="input" data-unm="${esc(n)}"><option value="">Ignorar</option>${scopedStores().map(s => `<option value="${esc(s.id)}" ${manualStores[ZoneData.norm(n)] === s.id ? 'selected' : ''}>${esc(s.tienda)} · ${esc(s.zona)}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table></div>` : '<p class="hint">✅ Todas las tiendas de la data de tu alcance cruzaron con un PDV.</p>';
        refresh();
    }
    function presel() { selected = new Set(an.visitar.filter(r => r.status !== 'meta' && r.status !== 'bien').slice(0, 5).map(r => r.st.id)); if (!selected.size) an.visitar.slice(0, 3).forEach(r => selected.add(r.st.id)); }

    function paintOut() {
        const out = $('#z-out'); if (!out || !an) return;
        Charts.destroyAll('view');
        const S = an.sum, pill = v => v == null ? '<i class="pill">—</i>' : `<i class="pill ${semaforo(v).cls}">${Math.round(v * 100)}%</i>`;
        const stTag = k => `<i class="pill ${STATUS[k][1]}">${STATUS[k][0]}</i>`;
        const multi = an.multiZona, RV = roleView(), canPlan = ROLES[me().rol].modules.includes('m2');
        const evalBlock = typeof Evals !== 'undefined' && ['formador', 'coordinador', 'admin'].includes(me().rol) ? Evals.zoneCardHTML(viewZonas()) : '';
        radarData = Advisor.scan(viewStores()); if (RV.salesOnly) radarData.list.sort((a, b) => (a.pacing.indice ?? 9) - (b.pacing.indice ?? 9));
        const critA = radarData.list.filter(d => levelOf(d)[0] === 'rojo').slice(0, 4), critS = an.rows.slice().sort((a, b) => b.prio - a.prio).slice(0, 4);
        const pc = Advisor.pc;
        const tabs = [['resumen', '📋 Resumen'], ['asesores', `👥 Asesores (${radarData.list.length})`], ['tiendas', `🏬 Tiendas (${an.rows.length})`]].concat(canPlan ? [['plan', '☀️ Plan de trabajo']] : []).concat([['reportes', '📤 Reportes']]);
        if (!tabs.some(x => x[0] === ztab)) ztab = 'resumen';
        out.innerHTML = `
        <section class="kpi-row six">
            <div class="kpi hl"><span>Venta ${multi ? (view || !isAllZones() ? 'regional' : 'nacional') : 'zona'}</span><b>${S.venta}</b><small>Target ${S.meta || '—'} · ${S.cumpl == null ? 'sin target' : Math.round(S.cumpl * 100) + '%'}</small></div>
            <div class="kpi"><span>Proyección cierre</span><b>${S.proj}</b><small>${S.cumplProj == null ? '—' : Math.round(S.cumplProj * 100) + '% de la meta'}</small></div>
            <div class="kpi"><span>ROI</span><b>${S.roi == null ? '—' : fmt1(S.roi)}</b><small>Proy. ${S.roiProj == null ? '—' : fmt1(S.roiProj)} · HC ${fmt1(S.hc)}</small></div>
            <div class="kpi"><span>PDV con venta</span><b>${S.conVenta}/${S.tiendas}</b><small>${an.status.critico + an.status.cero} críticos · ${an.status.riesgo} en riesgo</small></div>
            <div class="kpi"><span>Faltan</span><b>${S.faltan}</b><small>${S.ritmoReq} uds/día para cerrar</small></div>
            <div class="kpi"><span>Corte</span><b>${an.day}/${an.dim}</b><small>días del mes · ${esc(an.corte)}</small></div>
        </section>
        <div id="z-adv"></div>
        <nav class="ztabs" id="z-tabs">${tabs.map(([k, l]) => `<button class="ztab ${ztab === k ? 'on' : ''}" data-ztab="${k}">${l}</button>`).join('')}</nav>

        <div class="zpanel" data-zp="resumen" ${ztab === 'resumen' ? '' : 'hidden'}>
            ${(() => { if (typeof DayStatus === 'undefined') return ''; const L = DayStatus.zoneDay(an.rows.map(r => r.st)); return `<section class="card ds-today"><div class="row between wrap"><h3 class="h3">👥 Hoy fuera del PDV y novedades <small class="mute">${L.length ? L.length + ' asesor(es)' : 'todos en turno'}</small></h3><button class="btn btn-ghost sm" data-nvnew>⚑ Registrar novedad</button></div>
                ${L.length ? `<div class="ds-list">${L.slice(0, 8).map(x => `<div class="ds-row"><span><b>${esc(x.nombre)}</b> <small class="mute">${esc(x.st.tienda)}</small></span>${DayStatus.chip(x.s)}<button class="nv-dot" title="Novedad" data-nvd="${esc(x.st.id)}|${esc(x.nombre)}">⚑</button></div>`).join('')}</div>${L.length > 8 ? `<p class="hint">y ${L.length - 8} más en Cargar datos.</p>` : ''}` : '<p class="hint">Según la malla y las novedades, hoy todos los asesores están en su PDV. Evita visitas a quien esté compensando.</p>'}</section>`; })()}
            <div class="grid2">
                <section class="card"><div class="row between"><h3 class="h3">🚨 Asesores más críticos</h3><button class="btn btn-link sm" data-goto="asesores">Ver todos →</button></div>
                    <div class="mini-list">${critA.map(d => { const ev = d.evaluacion; return `<button class="mini" data-ficha-or-sel="${esc(d.id)}">${advisorAvatar(d.storeId, d.nombre, 38)}<span class="mini-t"><b>${esc(d.nombre)}</b><small>${esc(d.pdv.tienda)}</small></span>
                        <span class="mini-n"><b class="r">${pc(d.pacing.cumpl)}</b><small>${d.pacing.venta}/${d.pacing.meta || '—'}</small></span>${RV.evals ? `<span class="mini-n"><b>${ev && ev.promedio != null ? ev.promedio : '—'}</b><small>eval.</small></span>` : `<span class="mini-n"><b>${d.pacing.brechaUds}</b><small>faltan</small></span>`}</button>`; }).join('') || '<p class="mute">Ningún asesor crítico. 🎉</p>'}</div></section>
                <section class="card"><div class="row between"><h3 class="h3">🚨 Tiendas más críticas</h3><button class="btn btn-link sm" data-goto="tiendas">Ver todas →</button></div>
                    <div class="mini-list">${critS.map(r => `<div class="mini">${storeLogo(r.st, 'xs')}<span class="mini-t"><b>${esc(r.st.tienda)}</b><small>${STATUS[r.status][0]} · foco ${esc(r.foco.name)}</small></span><span class="mini-n"><b class="${r.cumplProj != null && r.cumplProj < .7 ? 'r' : 'a'}">${pc(r.cumplProj)}</b><small>proy.</small></span><span class="mini-n"><b>${Math.max(0, r.meta - r.venta)}</b><small>faltan</small></span></div>`).join('')}</div></section>
            </div>
            <div class="grid2">
                <section class="card"><h3 class="h3">Estado de los PDV</h3>
                    <div class="row" style="gap:16px;align-items:center"><div class="chart-box sm"><canvas id="z-status-c"></canvas></div>
                    <div class="legend grow">${Object.keys(STATUS).filter(k => an.status[k]).map(k => `<div><i class="dot" style="background:${STATUS[k][2]}"></i><span>${STATUS[k][0]}</span><b>${an.status[k]}</b></div>`).join('')}</div></div></section>
                ${evalBlock || `<section class="card"><h3 class="h3">📦 Referencias</h3>${an.refsZona.slice(0, 5).map(r => `<div class="gv-hb"><span>${esc(r.name)}</span><div class="gv-track"><div style="width:${an.refsZona[0].venta ? r.venta / an.refsZona[0].venta * 100 : 0}%;background:#00C853"></div></div><b>${r.venta} <small>/ ${r.meta || '—'}</small></b></div>`).join('')}</section>`}
            </div>
            <details class="card acc"><summary><span>📖 Lectura y ✅ recomendaciones</span></summary>
                <div class="grid2" style="margin-top:8px"><ul class="insights">${an.insights.lectura.map(t => `<li>${t}</li>`).join('')}</ul><ol class="insights">${an.insights.recomendaciones.map(t => `<li>${t}</li>`).join('') || '<li>Va en meta: sostener el ritmo y cuidar el inventario.</li>'}</ol></div></details>
            ${multi ? `<details class="card acc"><summary><span>🗺️ Resumen por zona · ${esc(viewLabel())}</span></summary>
                <div class="tbl-scroll"><table class="tbl compact"><thead><tr><th>Zona</th><th>PDV</th><th>Con venta</th><th>Target</th><th>Venta</th><th>Proy.</th><th>Cumpl.</th><th>ROI</th><th>Críticos</th></tr></thead><tbody>
                ${an.zonasRes.map(z => `<tr><td class="l"><b>${esc(z.zona)}</b></td><td>${z.tiendas}</td><td>${z.conVenta}</td><td>${z.meta || '—'}</td><td><b>${z.venta}</b></td><td>${z.proj}</td><td>${pill(z.cumplProj)}</td><td>${z.roi == null ? '—' : fmt1(z.roi)}</td><td>${z.critico ? `<i class="pill bad">${z.critico}</i>` : '0'}</td></tr>`).join('')}
                </tbody></table></div></details>` : ''}
            ${S.bajaVenta ? `<p class="hint">ℹ️ Incluye <b>${S.bajaVenta} uds</b> de ${S.bajaN} asesor(es) retirados: cuentan en la venta de cada tienda y de la zona.</p>` : ''}
        </div>

        <div class="zpanel" data-zp="asesores" ${ztab === 'asesores' ? '' : 'hidden'}><div id="z-radar"></div></div>

        <div class="zpanel" data-zp="tiendas" ${ztab === 'tiendas' ? '' : 'hidden'}>
            <section class="card"><h3 class="h3">Ranking de PDV <small class="mute">por proyección de cierre</small></h3>
                <div class="tbl-scroll"><table class="tbl compact"><thead><tr><th>#</th><th>PDV</th>${multi ? '<th>Zona</th>' : ''}<th>Estado</th><th>Target</th><th>Venta</th><th>Proy.</th><th>Cumpl.</th><th>ROI</th><th>Ref. rezagada</th></tr></thead><tbody>
                ${an.ranking.map((r, i) => `<tr><td>${i + 1}</td><td class="l"><div class="row" style="gap:6px;flex-wrap:nowrap">${storeLogo(r.st, 'xs')}<b>${esc(r.st.tienda)}</b></div><small class="mute">${r.asesores.map(a => `${esc(a.nombre.split(' ')[0])} ${a.total}`).join(' · ') || 'sin asesores en la data'}</small></td>${multi ? `<td><small>${esc(r.zona)}</small></td>` : ''}<td>${stTag(r.status)}</td><td>${r.meta || '—'}</td><td><b>${r.venta}</b></td><td>${r.proj}</td><td>${pill(r.cumplProj)}</td><td>${fmt1(r.roi)}</td><td><small>${r.rezagadas.map(x => esc(x.name)).join(', ')}</small></td></tr>`).join('')}
                </tbody></table></div></section>
            <details class="card acc"><summary><span>📊 Cumplimiento proyectado por PDV (gráfica)</span></summary><div class="chart-box" style="height:${Math.min(900, Math.max(220, an.rows.length * 24))}px"><canvas id="z-bars"></canvas></div></details>
            <details class="card acc"><summary><span>📦 Referencias de ${esc(viewLabel())} · venta vs. target</span></summary>
                <div class="tbl-scroll"><table class="tbl compact"><thead><tr><th>Referencia</th><th>Target</th><th>Venta</th><th>Proy.</th><th>Cumpl.</th><th>Share</th></tr></thead><tbody>
                ${an.refsZona.map(r => `<tr><td class="l"><b>${esc(r.name)}</b></td><td>${r.meta || '—'}</td><td><b>${r.venta}</b></td><td>${r.proj}</td><td>${pill(r.cumpl)}</td><td>${r.share}%</td></tr>`).join('')}
                </tbody></table></div></details>
        </div>

        ${canPlan ? `<div class="zpanel" data-zp="plan" ${ztab === 'plan' ? '' : 'hidden'}><section class="card" id="z-planbox"></section></div>` : ''}

        <div class="zpanel" data-zp="reportes" ${ztab === 'reportes' ? '' : 'hidden'}>
            <div class="grid2">
                <section class="card rep-card" id="z-rep-zona"><h3 class="h3">🗺️ Reporte completo de ${esc(viewLabel())}</h3><p class="mute">Estado de las tiendas, referencias, asesores y recomendaciones en una imagen.</p>
                    <div class="actions" style="margin-top:10px"><button class="btn btn-ghost" data-act="preview">👁️ Vista previa</button><button class="btn btn-wa" data-act="share">📲 WhatsApp</button><button class="btn btn-primary" data-act="save">⬇️ Descargar</button></div></section>
                <div id="z-quick"></div>
            </div>
            ${RV.ficha ? `<section class="card rep-card"><h3 class="h3">📲 Tarjetas de asesor</h3><p class="mute">Elige el asesor y abre su tarjeta (para él o para tus jefes).</p>
                <div class="row wrap" style="gap:8px;margin-top:8px"><select class="input grow" id="z-rep-adv">${radarData.list.map(d => `<option value="${esc(d.id)}">${esc(d.nombre)} · ${esc(d.pdv.tienda)}</option>`).join('')}</select><button class="btn btn-primary" id="z-rep-adv-go">Abrir tarjeta</button></div></section>` : ''}
        </div>`;
        $$('[data-ztab]', out).forEach(b => b.onclick = () => showTab(b.dataset.ztab));
        $$('[data-goto]', out).forEach(b => b.onclick = () => showTab(b.dataset.goto));
        $$('[data-ficha-or-sel]', out).forEach(b => b.onclick = () => { advSel = new Set([b.dataset.fichaOrSel]); paintAdvPanel(); paintAdvBtn(); $('#z-adv').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
        if ($('#z-rep-adv-go')) $('#z-rep-adv-go').onclick = () => openAdvisorFicha($('#z-rep-adv').value);
        paintRadar();
        paintQuick();
        paintPlanBox();
        paintAdvBtn();
        paintAdvPanel();

        if (typeof Chart !== 'undefined') {
            const ks = Object.keys(STATUS).filter(k => an.status[k]);
            Charts.add(new Chart($('#z-status-c'), { type: 'doughnut', data: { labels: ks.map(k => STATUS[k][0]), datasets: [{ data: ks.map(k => an.status[k]), backgroundColor: ks.map(k => STATUS[k][2]), borderWidth: 2, borderColor: '#fff' }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '66%', plugins: { legend: { display: false } } } }), 'view');
            const rk = an.ranking;
            Charts.add(new Chart($('#z-bars'), { type: 'bar', data: { labels: rk.map(r => r.st.tienda.length > 26 ? r.st.tienda.slice(0, 25) + '…' : r.st.tienda), datasets: [{ data: rk.map(r => Math.round((r.cumplProj || 0) * 100)), backgroundColor: rk.map(r => STATUS[r.status][2]), borderRadius: 5 }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => c.raw + '% proyectado' } } }, scales: { x: { grid: { color: THEME.line }, max: Math.max(120, ...rk.map(r => Math.round((r.cumplProj || 0) * 100))), ticks: { callback: v => v + '%' } }, y: { grid: { display: false }, ticks: { font: { size: 10, weight: '600' } } } } } }), 'view');
        }
        ReportActions.bind($('#z-rep-zona'), {
            title: 'Reporte de zona · Central de Operaciones',
            validate: () => an ? null : 'Carga la data primero.',
            filename: () => `Zona_${slug(viewLabel())}_${an.corte}.png`,
            build: stage => buildZoneCanvas(stage, { zona: viewLabel(), an, snap: viewSnap(), autor: me(), visitar: an.rows.filter(r => selected.has(r.st.id)) }),
            persist
        });
    }

    function showTab(k) {
        ztab = k;
        $$('#z-tabs [data-ztab]').forEach(b => b.classList.toggle('on', b.dataset.ztab === k));
        $$('#z-out .zpanel').forEach(p => { p.hidden = p.dataset.zp !== k; });
        const nav = $('#z-tabs'); if (nav && nav.getBoundingClientRect().top < 0) nav.scrollIntoView({ behavior: 'smooth' });
    }

    // Plan de trabajo desde el análisis: por asesor o por tienda, con los 4 más críticos y la opción de ver más
    function paintPlanBox() {
        const box = $('#z-planbox'); if (!box) return;
        const RV = roleView(), pc = Advisor.pc;
        const listA = radarData.list.filter(d => d.pacing.meta > 0), listS = an.rows.slice().sort((a, b) => b.prio - a.prio);
        const nA = planMore ? 20 : 4, nS = planMore ? 20 : 4;
        box.innerHTML = `<div class="row between wrap" style="gap:8px"><h3 class="h3">☀️ Armar el plan de trabajo</h3>
            <div class="seg sm"><button class="seg-btn ${planBy === 'asesor' ? 'active' : ''}" data-planby="asesor">Por asesor</button><button class="seg-btn ${planBy === 'tienda' ? 'active' : ''}" data-planby="tienda">Por tienda</button></div></div>
            <p class="mute">Marca a quién vas a trabajar (máximo 5 tiendas por día). El plan se abre con todo pre-llenado.</p>
            ${planBy === 'asesor' ? `<div class="mini-list">${listA.slice(0, nA).map(d => `<label class="mini pick ${radarSel.has(d.id) ? 'on' : ''}"><input type="checkbox" data-rsel="${esc(d.id)}" ${radarSel.has(d.id) ? 'checked' : ''}>${advisorAvatar(d.storeId, d.nombre, 36)}<span class="mini-t"><b>${esc(d.nombre)}</b><small>${esc(d.pdv.tienda)}</small></span><span class="mini-n"><b class="${d.pacing.indice < .85 ? 'r' : 'a'}">${pc(d.pacing.cumpl)}</b><small>${d.pacing.venta}/${d.pacing.meta}</small></span></label>`).join('')}</div>
                <div class="row between wrap" style="margin-top:10px;gap:8px">${listA.length > 4 ? `<button class="btn btn-link sm" data-planmore="1">${planMore ? 'Ver solo los 4 más críticos' : `Ver más (${Math.min(20, listA.length)})`}</button>` : '<span></span>'}<button class="btn btn-dark" id="z-radar-plan">☀️ Crear plan con ${radarSel.size} asesor(es)</button></div>`
            : `<div class="mini-list">${listS.slice(0, nS).map(r => `<label class="mini pick ${selected.has(r.st.id) ? 'on' : ''}"><input type="checkbox" data-sel="${esc(r.st.id)}" ${selected.has(r.st.id) ? 'checked' : ''}>${storeLogo(r.st, 'xs')}<span class="mini-t"><b>${esc(r.st.tienda)}</b><small>${STATUS[r.status][0]} · foco ${esc(r.foco.name)}</small></span><span class="mini-n"><b class="${r.cumplProj != null && r.cumplProj < .7 ? 'r' : 'a'}">${pc(r.cumplProj)}</b><small>proy.</small></span></label>`).join('')}</div>
                <div class="row between wrap" style="margin-top:10px;gap:8px">${listS.length > 4 ? `<button class="btn btn-link sm" data-planmore="1">${planMore ? 'Ver solo las 4 más críticas' : `Ver más (${Math.min(20, listS.length)})`}</button>` : '<span></span>'}<button class="btn btn-dark" id="z-plan">☀️ Crear plan con ${selected.size} PDV</button></div>`}`;
        $$('[data-planby]', box).forEach(b => b.onclick = () => { planBy = b.dataset.planby; paintPlanBox(); });
        const pm = $('[data-planmore]', box); if (pm) pm.onclick = () => { planMore = !planMore; paintPlanBox(); };
        box.onchange = e => { const l = e.target.closest('.mini'); if (l) l.classList.toggle('on', e.target.checked); const a = $('#z-radar-plan', box); if (a) a.textContent = `☀️ Crear plan con ${radarSel.size} asesor(es)`; const b2 = $('#z-plan', box); if (b2) b2.textContent = `☀️ Crear plan con ${selected.size} PDV`; };
    }

    // Qué ve cada cargo en la lista de asesores
    const roleView = () => {
        const r = me().rol;
        return { evals: r !== 'supervisor', salesOnly: r === 'supervisor', ficha: r !== 'supervisor', plan: ROLES[r].modules.includes('m2'), foco: ['coordinador', 'gerente', 'admin'].includes(r) };
    };
    // Prioridad solo por venta (supervisor): ritmo frente a lo esperado a la fecha
    const salesLevel = d => { const x = d.pacing.indice; if (x == null) return ['gris', 'sin_meta']; if (x < .6) return ['rojo', 'critica']; if (x < ((State.radar.ritmoMin || 85) / 100)) return ['rojo', 'alta']; if (x < 1) return ['amarillo', 'media']; return ['verde', 'baja']; };
    const levelOf = d => roleView().salesOnly ? salesLevel(d) : [d.prescripcion.semaforo, d.prescripcion.nivel];

    // ---- Radar de prioridad: lista de asesores del peor al mejor ----
    let radarData = { list: [], sinData: 0 };
    function paintRadar() {
        const box = $('#z-radar'); if (!box) return;
        const RV = roleView();
        radarData = Advisor.scan(viewStores());
        if (RV.salesOnly) radarData.list.sort((a, b) => (a.pacing.indice ?? 9) - (b.pacing.indice ?? 9));
        const all = radarData.list, ids = new Set(all.map(d => d.id));
        radarSel = new Set([...radarSel].filter(id => ids.has(id)));
        const cnt = k => all.filter(d => levelOf(d)[0] === k).length;
        const filtered = all.filter(d => { const s = levelOf(d)[0]; return radarFilter === 'todos' || (radarFilter === 'rojo' ? s === 'rojo' : ['rojo', 'amarillo'].includes(s)); });
        const shown = radarAll ? filtered : filtered.slice(0, 15);
        const pc = Advisor.pc, dash = '—';
        const row = (d, i) => {
            const [sem, niv] = levelOf(d), S = Advisor.SEM[sem], pa = d.pacing, ev = d.evaluacion, W = d.evSemanas || [];
            const cumCls = pa.cumpl == null ? '' : pa.indice < ((State.radar.ritmoMin || 85) / 100) ? 'r' : pa.indice < 1 ? 'a' : 'g';
            const hechas = W.filter(x => x.estado === 'ok').length;
            const foco = d.inventario.oportunidad ? d.inventario.oportunidad.name : (d.inventario.estrella ? '⭐ ' + d.inventario.estrella.name : dash);
            return `<div class="rl-row sem-${sem} ${radarSel.has(d.id) ? 'picked' : ''}">
                <div class="rl-who"><span class="rl-n">${i + 1}</span>${typeof advisorAvatar === 'function' ? advisorAvatar(d.storeId, d.nombre, 36) : `<i class="rd-dot" style="background:${S.color}"></i>`}
                    <div><b>${esc(d.nombre)}</b> ${typeof DayStatus !== 'undefined' ? DayStatus.chip(((s) => s && (s.off || s.src === 'novedad') ? s : null)(DayStatus.ofAdvisor(storeById(d.storeId), d.nombre))) + `<button class="nv-dot" title="Registrar novedad" data-nvd="${esc(d.storeId)}|${esc(d.nombre)}">⚑</button>` : ''}<small>${esc(d.pdv.tienda)} · ${esc(d.pdv.cadena)}${viewZonas().length > 1 ? ' · ' + esc(d.pdv.zona) : ''}${d.apoyo ? ' · apoyo' : ''}</small></div></div>
                <div class="rl-nums">
                    <div><small>Meta</small><b>${pa.meta || dash}</b></div>
                    <div><small>Venta</small><b>${pa.venta}</b></div>
                    <div><small>Cumpl.</small><b class="${cumCls}">${pc(pa.cumpl)}</b><em>hoy ${pc(pa.esperado)}</em></div>
                    <div><small>Proyección</small><b>${pa.proy}</b><em>${pa.proyCumpl == null ? '' : pc(pa.proyCumpl)}</em></div>
                    ${RV.salesOnly ? `<div><small>Faltan</small><b>${pa.meta ? pa.brechaUds : dash}</b><em>${pa.meta && pa.brechaUds ? pa.ritmoReq + '/día' : ''}</em></div>`
                    : `<div><small>Evaluación</small><b class="${ev && ev.promedio != null ? (ev.promedio >= (State.radar.notaMin || 80) ? 'g' : 'r') : ''}">${ev && ev.promedio != null ? ev.promedio : dash}</b><em>${W.length ? `${hechas}/${W.length} hechas` : ''}</em></div>`}
                    ${RV.foco ? `<div class="rl-foco"><small>Foco</small><b>${esc(foco)}</b></div>` : ''}
                </div>
                <div class="rl-end"><span class="rd-lv" style="background:${S.soft};color:${S.color}">${esc(Advisor.NIVEL[niv])}</span>
                    ${RV.ficha ? `<button class="btn btn-ghost sm" data-ficha="${esc(d.id)}">📲 Estatus</button>` : ''}
</div>
            </div>`;
        };
        const title = RV.salesOnly ? '🎯 Asesores por cumplimiento de venta' : RV.foco ? '👥 Estatus de asesores' : '🎯 Radar de prioridad: asesores';
        const sub = RV.salesOnly ? 'Del que va más lejos de su meta al que va mejor: venta frente a lo que debería llevar a la fecha.' : 'Del más crítico al mejor: cumplimiento frente al ritmo del mes, inventario sin rotar en su tienda y evaluaciones.';
        box.innerHTML = `<section class="card radar">
            <div class="row between wrap" style="gap:8px"><div><h3 class="h3">${title}</h3><p class="mute">${sub}</p></div>
                <div class="rd-sum"><span class="rd-pill r">${cnt('rojo')} críticos</span><span class="rd-pill a">${cnt('amarillo')} en riesgo</span><span class="rd-pill g">${cnt('verde')} al día</span></div></div>
            <div class="row between wrap" style="gap:8px;margin:8px 0 12px">
                <div class="seg sm"><button class="seg-btn ${radarFilter === 'prio' ? 'active' : ''}" data-rfilter="prio">Van mal</button><button class="seg-btn ${radarFilter === 'rojo' ? 'active' : ''}" data-rfilter="rojo">Solo críticos</button><button class="seg-btn ${radarFilter === 'todos' ? 'active' : ''}" data-rfilter="todos">Todos (${all.length})</button></div>
                ${RV.plan ? `<button class="btn btn-ghost sm" data-goto2="plan">☀️ Armar plan de trabajo</button>` : ''}</div>
            <div class="rl-list">${shown.map(row).join('') || `<div class="empty">${all.length ? 'Ningún asesor en este filtro. 🎉' : 'Sin asesores para diagnosticar: carga la data de zona y configura los asesores activos.'}</div>`}</div>
            ${filtered.length > 15 ? `<div class="row end" style="margin-top:10px"><button class="btn btn-ghost sm" data-rmore="1">${radarAll ? 'Ver menos' : `Ver los ${filtered.length - 15} restantes`}</button></div>` : ''}
            ${radarData.sinData ? `<p class="hint">${radarData.sinData} asesor(es) sin data de zona cargada no se diagnostican.</p>` : ''}
            <p class="hint">${RV.salesOnly ? `Crítico: va por debajo del ${int(State.radar.ritmoMin)}% de lo que debería llevar a la fecha · En riesgo: va un poco por debajo.` : `Crítico: va por debajo del ${int(State.radar.ritmoMin)}% del ritmo esperado · En riesgo: ritmo justo, inventario foco sin rotar o nota menor a ${int(State.radar.notaMin)}.`}</p>
        </section>`;
    }

    // ---- Reportes rápidos para enviar a un grupo: zona, una cadena o una tienda ----
    let quick = { tipo: 'cadena', key: '' };
    function paintQuick() {
        const box = $('#z-quick'); if (!box || !an) { if (box) box.innerHTML = ''; return; }
        const chains = chainList(an.rows.map(r => r.st)), stores = an.rows.map(r => r.st).sort((a, b) => a.tienda.localeCompare(b.tienda));
        if (quick.tipo === 'cadena' && !chains.some(c => c.key === quick.key)) quick.key = (chains[0] || {}).key || '';
        if (quick.tipo === 'tienda' && !stores.some(s => s.id === quick.key)) quick.key = (stores[0] || {}).id || '';
        const opts = quick.tipo === 'cadena' ? chains.map(c => `<option value="${esc(c.key)}" ${c.key === quick.key ? 'selected' : ''}>${esc(c.label)} · ${c.pdv} PDV</option>`).join('')
            : quick.tipo === 'tienda' ? stores.map(s => `<option value="${esc(s.id)}" ${s.id === quick.key ? 'selected' : ''}>${esc(s.tienda)}</option>`).join('') : '';
        box.innerHTML = `<section class="card quick">
            <h3 class="h3">📤 Reportes rápidos para enviar</h3>
            <p class="mute">Una imagen corta y clara para el grupo de la cadena, la tienda o tu coordinador.</p>
            <div class="row wrap" style="gap:8px;margin-top:8px;align-items:flex-end">
                <div class="seg sm">${[['zona', 'Zona'], ['cadena', 'Cadena'], ['tienda', 'Tienda']].map(([k, l]) => `<button class="seg-btn ${quick.tipo === k ? 'active' : ''}" data-qtipo="${k}">${l}</button>`).join('')}</div>
                ${quick.tipo !== 'zona' ? `<select class="input grow" id="z-qkey">${opts}</select>` : `<span class="mute grow">${esc(viewLabel())} · ${an.rows.length} PDV</span>`}
            </div>
            <div class="actions" style="margin-top:10px"><button class="btn btn-ghost" data-act="preview">👁️ Vista previa</button><button class="btn btn-wa" data-act="share">📲 WhatsApp</button><button class="btn btn-primary" data-act="save">⬇️ Descargar</button></div>
        </section>`;
        $$('[data-qtipo]', box).forEach(b => b.onclick = () => { quick = { tipo: b.dataset.qtipo, key: '' }; paintQuick(); });
        if ($('#z-qkey', box)) $('#z-qkey', box).onchange = e => { quick.key = e.target.value; };
        ReportActions.bind(box, {
            title: 'Reporte · Central de Operaciones',
            validate: () => an ? null : 'Carga la data primero.',
            filename: () => `Reporte_${quick.tipo}_${slug(quickLabel())}_${an.corte}.png`,
            build: stage => buildQuickCanvas(stage, quickData(), me())
        });
    }
    const quickLabel = () => quick.tipo === 'zona' ? viewLabel() : quick.tipo === 'cadena' ? ((chainList(an.rows.map(r => r.st)).find(c => c.key === quick.key) || {}).label || '') : ((storeById(quick.key) || {}).tienda || '');
    function quickData() {
        const rows = quick.tipo === 'zona' ? an.rows : quick.tipo === 'cadena' ? an.rows.filter(r => chainGroup(r.st).key === quick.key) : an.rows.filter(r => r.st.id === quick.key);
        const RV = roleView();
        const advs = quick.tipo === 'tienda' && rows[0] ? Advisor.forStore(rows[0].st) : [];
        return { tipo: quick.tipo, label: quickLabel(), zona: viewLabel(), corte: an.corte, day: an.day, dim: an.dim, rows, advs, evals: !RV.salesOnly, st: quick.tipo === 'tienda' && rows[0] ? rows[0].st : null, logoKey: quick.tipo === 'cadena' ? quick.key : quick.tipo === 'tienda' && rows[0] ? normLogoKey(rows[0].st.logoKey) : '' };
    }

    // ---- Panel de un asesor (selector «Asesor» de la cabecera) ----
    // Selección de uno o varios asesores (botón «Asesores» de la cabecera)
    const allAdvisors = () => viewStores().flatMap(st => activeAdvisors(st).map(a => ({ id: `${st.id}|${slug(a.nombre)}`, nombre: a.nombre, tienda: st.tienda, storeId: st.id }))).sort((a, b) => a.nombre.localeCompare(b.nombre));
    function paintAdvBtn() { const b = $('#z-asesor-btn'); if (!b) return; const n = advSel.size, list = allAdvisors(); b.innerHTML = n ? `👤 ${n === 1 ? esc((list.find(a => advSel.has(a.id)) || { nombre: '1 asesor' }).nombre) : n + ' asesores elegidos'}` : `👥 Todos los asesores (${list.length})`; }
    function openAdvPicker() {
        const list = allAdvisors(), pick = new Set(advSel);
        const m = openModal(`<h3 class="modal-title">👥 Elegir asesores</h3><p class="mute">Elige uno para ver su estatus completo o varios para compararlos.</p>
            <input class="input" id="ap-q" placeholder="Buscar por nombre o tienda…" style="margin:8px 0">
            <div class="ap-list" id="ap-list"></div>
            <div class="row between wrap" style="margin-top:12px;gap:8px"><button class="btn btn-link" id="ap-none">Ver todos (quitar selección)</button><button class="btn btn-primary" id="ap-ok">Ver selección</button></div>`);
        const paint = q => { const n = String(q || '').toLowerCase(); $('#ap-list', m).innerHTML = list.filter(a => !n || (a.nombre + ' ' + a.tienda).toLowerCase().includes(n)).map(a => `<label class="ap-i ${pick.has(a.id) ? 'on' : ''}"><input type="checkbox" value="${esc(a.id)}" ${pick.has(a.id) ? 'checked' : ''}>${advisorAvatar(a.storeId, a.nombre, 34)}<span><b>${esc(a.nombre)}</b><small>${esc(a.tienda)}</small></span>${typeof DayStatus !== 'undefined' ? DayStatus.chip(((s) => s && (s.off || s.src === 'novedad') ? s : null)(DayStatus.ofAdvisor(storeById(a.storeId), a.nombre))) : ''}</label>`).join(''); };
        $('#ap-q', m).oninput = e => paint(e.target.value);
        $('#ap-list', m).onchange = e => { e.target.checked ? pick.add(e.target.value) : pick.delete(e.target.value); e.target.closest('.ap-i').classList.toggle('on', e.target.checked); };
        $('#ap-none', m).onclick = () => { advSel = new Set(); closeModal(m); paintAdvBtn(); paintAdvPanel(); };
        $('#ap-ok', m).onclick = () => { advSel = pick; closeModal(m); paintAdvBtn(); paintAdvPanel(); const b = $('#z-adv'); if (b && advSel.size) b.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
        paint('');
    }
    function paintAdvPanel() {
        const box = $('#z-adv'); if (!box) return;
        Charts.destroyAll('advpanel');
        const ids = [...advSel].filter(id => allAdvisors().some(a => a.id === id));
        if (!ids.length) { box.innerHTML = ''; return; }
        const RV = roleView(), pc = Advisor.pc;
        const close = `<button class="btn btn-ghost sm" id="z-adv-x">✕ Cerrar</button>`;
        if (ids.length === 1) {
            const D = Advisor.byId(ids[0]);
            if (!D) { box.innerHTML = `<section class="card empty">No encontré a ese asesor en la data cargada. ${close}</section>`; }
            else {
                box.innerHTML = `<section class="card adv-panel">
                    <div class="row between wrap" style="gap:8px;margin-bottom:6px"><h3 class="h3">👤 Estatus del asesor</h3>
                        <div class="row" style="gap:6px">${RV.ficha ? `<button class="btn btn-primary sm" data-ficha="${esc(D.id)}">📲 Tarjeta para el asesor / jefes</button>` : ''}${close}</div></div>
                    <div class="fa fa-ui ${RV.salesOnly ? '' : 'ac'}" id="z-adv-body">${RV.salesOnly ? advisorSalesHTML(D) : advisorCardHTML(D, 'acr-panel')}</div>
                </section>`;
                if (!RV.salesOnly) { const c = $('#acr-panel', box); if (c) { const W = D.evSemanas || []; Charts.ring(c, [W.filter(x => x.estado === 'ok').length, W.filter(x => x.estado === 'no').length, W.filter(x => x.estado === 'sin').length], ['#16A34A', '#DC2626', '#CBD5E1'], { cutout: '70%', gap: true, scope: 'advpanel' }); } }
            }
        } else {
            const Ds = ids.map(id => Advisor.byId(id)).filter(Boolean);
            box.innerHTML = `<section class="card adv-panel"><div class="row between wrap" style="gap:8px;margin-bottom:8px"><h3 class="h3">👥 Comparativo de ${Ds.length} asesores</h3>${close}</div>
                <div class="cmp-grid">${Ds.map(D => { const pa = D.pacing, ev = D.evaluacion, cls = pa.indice == null ? '' : pa.indice < .85 ? 'r' : pa.indice < 1 ? 'a' : 'g'; return `<div class="cmp">
                    <div class="row" style="gap:8px;flex-wrap:nowrap">${advisorAvatar(D.storeId, D.nombre, 44)}<div style="min-width:0"><b>${esc(D.nombre)}</b><small class="mute" style="display:block">${esc(D.pdv.tienda)}</small></div></div>
                    <div class="cmp-n"><div><small>Meta</small><b>${pa.meta || '—'}</b></div><div><small>Venta</small><b>${pa.venta}</b></div><div><small>Cumpl.</small><b class="${cls}">${pc(pa.cumpl)}</b></div><div><small>Proy.</small><b>${pa.proy}</b></div>
                    ${RV.evals ? `<div><small>Eval.</small><b>${ev && ev.promedio != null ? ev.promedio : '—'}</b></div><div><small>Faltan</small><b>${pa.brechaUds}</b></div>` : `<div><small>Faltan</small><b>${pa.brechaUds}</b></div><div><small>Por día</small><b>${pa.ritmoReq}</b></div>`}</div>
                    ${RV.ficha ? `<button class="btn btn-ghost sm" data-ficha="${esc(D.id)}" style="width:100%">📲 Ver tarjeta</button>` : ''}</div>`; }).join('')}</div></section>`;
        }
        const x = $('#z-adv-x', box); if (x) x.onclick = () => { advSel = new Set(); paintAdvBtn(); paintAdvPanel(); };
    }

    // Envía los asesores elegidos al Plan de trabajo (agrupados por tienda: máximo 5 tiendas por día)
    async function radarToPlan() {
        if (!radarSel.size) return toast('Marca al menos un asesor.', 'warn');
        const by = {}; radarData.list.filter(d => radarSel.has(d.id)).forEach(d => { (by[d.storeId] = by[d.storeId] || []).push(d.nombre); });
        const items = Object.entries(by).map(([storeId, asesores]) => ({ storeId, asesores }));
        if (items.length > 5) return toast(`El plan admite máximo 5 tiendas por día; elegiste asesores de ${items.length}.`, 'warn', 5000);
        if (!ROLES[me().rol].modules.includes('m2')) return toast('Tu cargo no diligencia plan de trabajo.', 'warn');
        await persistSnaps();
        Modules.m2.prefill(items);
        navigate('m2');
    }

    async function persistSnaps() {
        if (!fresh) return { synced: true };
        const r = await ZoneData.saveAll(snaps, { corte, fileName });
        fresh = false; return r;
    }
    async function persist() {
        const r = await persistSnaps();
        const rep = { id: `${slug(viewLabel())}_${an.corte}_${me().userId}`, ambito: viewLabel(), zonas: viewZonas(), corte: an.corte, month: an.corte.slice(0, 7), userId: me().userId, nombre: me().nombre, rol: me().rol, venta: an.sum.venta, meta: an.sum.meta, proj: an.sum.proj, roi: an.sum.roi, status: an.status, visitar: [...selected], updatedAt: Date.now() };
        await Data.set(COL.zoneReports, rep.id, rep, false);
        return r;
    }

    // Pasa las tiendas elegidas al plan de trabajo con la data real
    async function toPlan() {
        if (!selected.size) return toast('Elige al menos un PDV.', 'warn');
        if (selected.size > 5) return toast('El plan admite máximo 5 tiendas por día.', 'warn');
        if (!ROLES[me().rol].modules.includes('m2')) return toast('Tu cargo no diligencia plan de trabajo.', 'warn');
        await persistSnaps();
        Modules.m2.prefill([...selected]);
        navigate('m2');
    }

    // Configuración inicial: metas y foco por PDV + lista de asesores activos (se escribe una vez; se corrige cuando haga falta)
    function openConfig() {
        const zs = viewStores();
        const multi = viewZonas().length > 1;
        const canAdv = canEditAdv();
        // Asesores de cada PDV: los de la data + los configurados + los ya retirados (para poder reactivarlos)
        const advOf = Object.fromEntries(zs.map(s => [s.id, storeAdvisors(s)]));
        const bajaTot = sum(zs.map(s => sum(advOf[s.id].filter(a => !a.activo).map(a => a.total))));
        const m = openModal(`<h3 class="modal-title">Configuración inicial · ${esc(viewLabel())}</h3>
            <div class="seg sm" style="margin-bottom:12px"><button class="seg-btn active" data-cp="meta">🎯 Metas y foco</button><button class="seg-btn" data-cp="adv">👥 Asesores activos</button></div>
            <div class="cfg-panel" data-panel="meta">
            <p class="mute">Target del mes, HC Infinix y foco de la semana de cada PDV. El target por referencia se fija en cada tienda (⚙️ Ajustes); si aquí dejas el total en 0, se usa la suma por referencia. HC en 0 = se cuentan los asesores activos. El foco en blanco se calcula solo (mayor brecha frente al target).</p>
            <div class="tbl-scroll" style="max-height:56vh"><table class="tbl compact"><thead><tr><th>PDV</th>${multi ? '<th>Zona</th>' : ''}<th>Σ ref.</th><th>Target mes</th><th>HC</th><th>Ref. foco</th><th>Foco de trabajo</th></tr></thead><tbody>
            ${zs.map(s => `<tr><td class="l">${storeLogo(s, 'xs')} <b>${esc(s.tienda)}</b></td>${multi ? `<td><small>${esc(s.zona)}</small></td>` : ''}<td>${sum(INFINIX_MODELS.map(x => int(s.metas && s.metas[x.key]))) || '—'}</td><td><input class="input num" type="number" min="0" data-cfg="meta" data-id="${esc(s.id)}" value="${int(s.metaMes)}" ${canTarget() ? '' : 'disabled title="Solo el coordinador cambia el target"'}></td><td><input class="input num" type="number" min="0" data-cfg="hc" data-id="${esc(s.id)}" step="0.5" value="${+(s.hc && s.hc.INFINIX) || 0}" ${canTarget() ? '' : 'disabled title="Solo el coordinador cambia el HC"'}></td>
                <td><select class="input" data-cfg="fref" data-id="${esc(s.id)}"><option value="">auto</option>${INFINIX_MODELS.map(x => `<option value="${x.key}" ${s.foco && s.foco.ref === x.key ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></td>
                <td><input class="input" data-cfg="fnota" data-id="${esc(s.id)}" value="${esc(s.foco && s.foco.nota || '')}" placeholder="Ej. Movimiento de mesa"></td></tr>`).join('')}
            </tbody></table></div></div>
            <div class="cfg-panel" data-panel="adv" hidden>
            <p class="mute">Estos son los asesores que trae la data. <b>Desmarca</b> al que ya no trabaja con nosotros: deja de aparecer como asesor (ranking, HC, calculadora, evaluaciones y plan), pero <b>sus unidades siguen contando en la venta de la tienda y de la zona</b>. Puedes volver a marcarlo cuando quieras.${canAdv ? '' : ' <i>Tu cargo solo consulta esta lista.</i>'}</p>
            <input class="input" id="zc-adv-q" placeholder="Buscar tienda o asesor…" style="margin-bottom:10px">
            <div style="max-height:52vh;overflow:auto" id="zc-adv">${zs.map(s => { const L = advOf[s.id], tot = sum(L.map(a => a.total)); return `<div class="adv-store" data-sid="${esc(s.id)}" data-q="${esc(slug(s.tienda + ' ' + L.map(a => a.nombre).join(' ')))}">
                <div class="row between wrap" style="gap:6px"><b>${esc(s.tienda)}${multi ? ` <small class="mute">· ${esc(s.zona)}</small>` : ''}</b><small class="mute" data-sum="${esc(s.id)}"></small></div>
                ${L.length ? `<div class="chips">${L.map((a, i) => `<label class="chip adv"><input type="checkbox" data-adv="${esc(s.id)}" data-i="${i}" ${a.activo ? 'checked' : ''} ${canAdv ? '' : 'disabled'}><span>${esc(a.nombre)}<small>${a.total} uds${a.cedula ? ' · ' + esc(a.cedula) : ''}</small></span></label>`).join('')}</div>` : '<p class="hint" style="margin:6px 0 0">Sin asesores en la data ni en la tienda.</p>'}</div>`; }).join('') || '<p class="hint">No hay tiendas en este ámbito.</p>'}</div>
            <p class="hint" id="zc-adv-sum">${bajaTot ? `Hoy hay ${bajaTot} uds de asesores retirados incluidas en las tiendas.` : ''}</p></div>
            <div class="row end" style="margin-top:14px"><button class="btn btn-ghost" id="zc-cancel">Cancelar</button><button class="btn btn-primary" id="zc-save">Guardar</button></div>`, { wide: true });
        // Pestañas
        $$('[data-cp]', m).forEach(b => b.onclick = () => { $$('[data-cp]', m).forEach(x => x.classList.toggle('active', x === b)); $$('.cfg-panel', m).forEach(p => p.hidden = p.dataset.panel !== b.dataset.cp); });
        // Resumen por tienda: venta total = activos + retirados
        const sumStore = id => {
            const L = advOf[id], on = $$(`[data-adv="${id}"]`, m);
            const act = sum(on.filter(x => x.checked).map(x => L[+x.dataset.i].total)), baj = sum(on.filter(x => !x.checked).map(x => L[+x.dataset.i].total));
            const el = $(`[data-sum="${id}"]`, m); if (el) el.textContent = L.length ? `Venta ${act + baj} uds = ${act} activos${baj ? ` + ${baj} retirados` : ''}` : '';
        };
        zs.forEach(s => sumStore(s.id));
        $('#zc-adv', m).onchange = e => { if (e.target.dataset.adv) sumStore(e.target.dataset.adv); };
        $('#zc-adv-q', m).oninput = e => { const q = slug(e.target.value); $$('.adv-store', m).forEach(d => { d.hidden = !!q && !d.dataset.q.includes(q); }); };
        $('#zc-cancel', m).onclick = () => closeModal(m);
        $('#zc-save', m).onclick = async () => {
            if (!canWrite()) return;
            const ops = [];
            zs.forEach(s => {
                const g = k => $(`[data-cfg="${k}"][data-id="${s.id}"]`, m).value;
                const meta = int(g('meta')), hc = numf(g('hc')), fref = g('fref'), fnota = g('fnota').trim();
                const upd = {};
                if (canTarget() && meta !== int(s.metaMes)) upd.metaMes = meta;
                if (canTarget() && hc !== (+(s.hc && s.hc.INFINIX) || 0)) upd.hc = { ...(s.hc || {}), INFINIX: hc };
                if (fref !== ((s.foco && s.foco.ref) || '') || fnota !== ((s.foco && s.foco.nota) || '')) upd.foco = { ref: fref, nota: fnota, at: Date.now(), by: me().nombre };
                // Asesores: lo desmarcado pasa a "retirado" (conserva fecha y quién lo marcó); lo marcado de nuevo vuelve a activo
                if (canAdv && advOf[s.id].length) {
                    const L = advOf[s.id], prev = s.bajas || [], next = [];
                    L.forEach((a, i) => {
                        const box = $(`[data-adv="${s.id}"][data-i="${i}"]`, m); if (!box) return;
                        if (!box.checked) { const old = prev.find(b => sameAdvisor(b, a)); next.push(old ? { ...old, nombres: a.alias } : { nombre: a.nombre, cedula: a.cedula || '', nombres: a.alias, at: Date.now(), by: me().nombre }); }
                    });
                    // Retirados que ya no están en la lista visible se conservan tal cual
                    prev.forEach(b => { if (!L.some(a => sameAdvisor(b, a))) next.push(b); });
                    const same = next.length === prev.length && next.every(n => prev.some(b => sameAdvisor(b, n)));
                    if (!same) {
                        upd.bajas = next;
                        if ((s.asesores || []).length) upd.asesores = s.asesores.filter(n => !next.some(b => sameAdvisor(b, { nombre: n, cedula: (s.cedulas || {})[n] })));
                    }
                }
                if (upd.metaMes !== undefined || upd.hc) upd.targetMes = todayStr().slice(0, 7);
                if (Object.keys(upd).length) { upd.updatedAt = Date.now(); const mk = Object.keys(upd).filter(k => MANUAL_KEYS.includes(k)); if (mk.length) Object.assign(upd, markManual(s, mk)); Object.assign(s, upd); ops.push({ op: 'set', col: COL.stores, id: s.id, data: upd, merge: true }); }
            });
            if (ops.length) await Data.batch(ops);
            closeModal(m); toast(ops.length ? `${ops.length} PDV actualizados` : 'Sin cambios', 'ok');
            if (an) refresh();
        };
    }

    return { render };
})());

// ----------------------------------------------------------------------------
// LIENZO · REPORTE DE ZONA (1400 px, horizontal)
// ----------------------------------------------------------------------------
function buildZoneCanvas(stage, d) {
    const { zona, an, autor, visitar } = d, S = an.sum, dash = '—';
    const STAT = { meta: ['En meta', THEME.green], bien: ['Bien', '#16A34A'], riesgo: ['En riesgo', THEME.amber], critico: ['Crítico', THEME.red], cero: ['Sin venta', '#7F1D1D'], sin: ['Sin target', '#94A3B8'] };
    const sem = semaforo(S.cumplProj == null ? 1 : S.cumplProj);
    const cls = v => v == null ? '' : v >= 1 ? 'g' : v >= .7 ? 'a' : 'r';
    const pct = v => v == null ? dash : Math.round(v * 100) + '%';
    // Con muchas tiendas (vista regional o nacional) el ranking muestra las 20 mejores y las 20 más críticas
    const rankRows = an.ranking.length > 44 ? an.ranking.slice(0, 20).concat(an.ranking.slice(-20)) : an.ranking;
    const el = document.createElement('div');
    el.className = 'rp rp-m1 rp-zona';
    el.innerHTML = `
    <div class="rp-bar"></div>
    <header class="rp-head">
        <img class="rp-logo" src="${LOGO_INFINIX}" alt="Infinix">
        <div class="rp-head-mid">
            <div class="rp-kicker">ANÁLISIS DE ZONA · VENTA REAL</div>
            <div class="rp-title">${esc((/^(ZONA|REGIONAL|NACIONAL)/i.test(zona) ? zona : 'ZONA ' + zona).toUpperCase())}</div>
            <div class="rp-sub">Corte ${esc(fechaLarga(an.corte))} · día ${an.day} de ${an.dim} · ${esc(mesLargo(an.corte.slice(0, 7)))}</div>
            <div class="rp-sub">Elaborado por <b>${esc(autor.nombre)}</b> · ${ROLES[autor.rol].label}${d.snap && d.snap.fileName ? ` · Fuente: ${esc(d.snap.fileName)}` : ''}</div>
        </div>
        <div class="rp-chain z-stamp"><b>${S.tiendas}</b><span>PDV</span></div>
    </header>

    <section class="rp-dash">
        <div class="dcard hero">
            <div class="dcard-t">🎯 CUMPLIMIENTO DE LA ZONA</div>
            <div class="row" style="gap:22px">
                ${ringCardHTML('rz-cumpl', 190, pct(S.cumpl), 'de la meta')}
                <div class="dlist">
                    <div><span>Venta</span><b>${S.venta}</b></div>
                    <div><span>Target</span><b>${S.meta || dash}</b></div>
                    <div><span>Proyección cierre</span><b style="color:${sem.color}">${S.proj} · ${pct(S.cumplProj)}</b></div>
                    <div><span>Faltan</span><b>${S.faltan} · ${S.ritmoReq}/día</b></div>
                    <i class="pill big ${sem.cls}">● ${sem.label}</i>
                </div>
            </div>
        </div>
        <div class="dcard">
            <div class="dcard-t">ESTADO DE LOS PDV</div>
            <div class="row" style="gap:14px">
                ${ringCardHTML('rz-status', 140, an.status.meta + an.status.bien, 'van bien')}
                <div class="legend">${Object.keys(STAT).filter(k => an.status[k]).map(k => `<div><i class="dot" style="background:${STAT[k][1]}"></i><span>${STAT[k][0]}</span><b>${an.status[k]}</b></div>`).join('')}</div>
            </div>
        </div>
        <div class="dcard">
            <div class="dcard-t">ROI DE LA ZONA</div>
            <div class="center">${ringCardHTML('rz-roi', 150, S.roi == null ? dash : fmt1(S.roi), 'uds / promotor')}</div>
            <div class="dfoot">Proyectado <b>${S.roiProj == null ? dash : fmt1(S.roiProj)}</b> · HC ${S.hc}</div>
        </div>
        <div class="dcard">
            <div class="dcard-t">TOP REFERENCIAS</div>
            <div class="brank">${an.refsZona.slice(0, 5).map((r, i) => `<div><b>#${i + 1}</b><i class="dot" style="background:${THEME.green}"></i><span>${esc(r.name)}</span><div class="brank-bar"><div style="width:${an.refsZona[0].venta ? Math.round(r.venta / an.refsZona[0].venta * 100) : 0}%;background:${THEME.green}"></div></div><em>${r.venta} · ${pct(r.cumpl)}</em></div>`).join('')}</div>
        </div>
    </section>

    ${an.multiZona ? `<div class="rp-sec">RESUMEN POR ZONA</div>
    <table class="rp-tbl"><thead><tr><th class="l">ZONA</th><th>PDV</th><th>CON VENTA</th><th>HC</th><th>TARGET</th><th>VENTA</th><th>CUMPL.</th><th>PROY.</th><th>% PROY.</th><th>ROI</th><th>CRÍTICOS</th></tr></thead><tbody>
        ${an.zonasRes.map(z => `<tr><td class="l"><b>${esc(z.zona)}</b></td><td>${z.tiendas}</td><td>${z.conVenta}</td><td>${z.hc}</td><td>${z.meta || dash}</td><td><b>${z.venta}</b></td><td class="c-tot ${cls(z.cumpl)}">${pct(z.cumpl)}</td><td>${z.proj}</td><td class="c-tot ${cls(z.cumplProj)}">${pct(z.cumplProj)}</td><td>${z.roi == null ? dash : fmt1(z.roi)}</td><td class="${z.critico ? 'r' : ''}">${z.critico}</td></tr>`).join('')}
    </tbody></table>` : ''}
    <div class="rp-sec">RANKING DE PDV · VENTA REAL FRENTE AL TARGET${rankRows.length < an.ranking.length ? ` · ${rankRows.length} DE ${an.ranking.length} PDV (MEJORES Y MÁS CRÍTICOS)` : ''}</div>
    <table class="rp-tbl"><thead><tr><th class="l">#</th><th class="l">PUNTO DE VENTA</th>${an.multiZona ? '<th class="l">ZONA</th>' : ''}<th>ESTADO</th><th>HC</th><th>TARGET</th><th>VENTA</th><th>CUMPL.</th><th>PROY.</th><th>% PROY.</th><th>ROI</th><th>ROI PROY.</th><th class="l">ASESORES</th><th class="l">REF. REZAGADA</th><th class="l">FOCO</th></tr></thead><tbody>
        ${rankRows.map(r => `<tr><td class="l">${an.ranking.indexOf(r) + 1}</td><td class="l">${esc(r.st.tienda)}</td>${an.multiZona ? `<td class="l small">${esc(r.zona)}</td>` : ''}<td><i class="ztag" style="background:${STAT[r.status][1]}">${STAT[r.status][0]}</i></td><td>${r.hc}</td><td>${r.meta || dash}</td><td><b>${r.venta}</b></td><td class="c-tot ${cls(r.cumpl)}">${pct(r.cumpl)}</td><td>${r.proj}</td><td class="c-tot ${cls(r.cumplProj)}">${pct(r.cumplProj)}</td><td>${fmt1(r.roi)}</td><td class="roi">${fmt1(r.roiProj)}</td><td class="l small">${r.asesores.map(a => `${esc(a.nombre)} (${a.total})`).join(', ') || dash}${r.bajaVenta ? ` · +${r.bajaVenta} ex-asesores` : ''}</td><td class="l small">${r.rezagadas[0] ? `${esc(r.rezagadas[0].name)} ${r.rezagadas[0].venta}/${r.rezagadas[0].meta}` : dash}</td><td class="l small">${esc(r.foco.name)}</td></tr>`).join('')}
        <tr class="tot"><td class="l" colspan="${an.multiZona ? 3 : 2}">TOTAL</td><td></td><td>${S.hc}</td><td>${S.meta || dash}</td><td>${S.venta}</td><td class="c-tot ${cls(S.cumpl)}">${pct(S.cumpl)}</td><td>${S.proj}</td><td class="c-tot ${cls(S.cumplProj)}">${pct(S.cumplProj)}</td><td>${S.roi == null ? dash : fmt1(S.roi)}</td><td class="roi">${S.roiProj == null ? dash : fmt1(S.roiProj)}</td><td colspan="3"></td></tr>
    </tbody></table>

    <div class="rp-sec">REFERENCIAS INFINIX EN LA ZONA</div>
    <table class="rp-tbl"><thead><tr><th class="l">REFERENCIA</th>${an.refsZona.map(r => `<th>${esc(r.name)}</th>`).join('')}<th class="c-tot">TOTAL</th></tr></thead><tbody>
        <tr><td class="l">Target</td>${an.refsZona.map(r => `<td>${r.meta || dash}</td>`).join('')}<td class="c-tot">${S.meta || dash}</td></tr>
        <tr><td class="l">Venta</td>${an.refsZona.map(r => `<td><b>${r.venta}</b></td>`).join('')}<td class="c-tot">${S.venta}</td></tr>
        <tr><td class="l">Cumplimiento</td>${an.refsZona.map(r => `<td class="c-tot ${cls(r.cumpl)}">${pct(r.cumpl)}</td>`).join('')}<td class="c-tot ${cls(S.cumpl)}">${pct(S.cumpl)}</td></tr>
        <tr><td class="l">Share de la venta</td>${an.refsZona.map(r => `<td>${r.share}%</td>`).join('')}<td class="c-tot">100%</td></tr>
    </tbody></table>

    <div class="v-two">
        <div class="vbox"><div class="vbox-t">Lectura de la zona</div><ul class="z-list">${an.insights.lectura.map(t => `<li>${t}</li>`).join('')}</ul></div>
        <div class="vbox good"><div class="vbox-t">Recomendaciones</div><ol class="z-list">${an.insights.recomendaciones.slice(0, 6).map(t => `<li>${t}</li>`).join('') || '<li>Sostener el ritmo y cuidar inventario.</li>'}</ol></div>
    </div>
    ${visitar.length ? `<div class="rp-sec light">PLAN DE VISITAS PROPUESTO · ${visitar.length} PDV</div>
    <div class="z-visits">${visitar.map(r => `<div class="zv"><i class="ztag" style="background:${STAT[r.status][1]}">${STAT[r.status][0]}</i><b>${esc(r.st.tienda)}</b><span>${r.venta}/${r.meta || dash} · proy. ${pct(r.cumplProj)} · foco ${esc(r.foco.name)} (${r.foco.venta}/${r.foco.meta})${r.sinStock.length ? ' · sin stock: ' + r.sinStock.map(x => esc(x.name)).join(', ') : ''}</span></div>`).join('')}</div>` : ''}

    ${typeof DayStatus !== 'undefined' ? DayStatus.reportBlock(an.rows.map(r => r.st)) : ''}
    <footer class="rp-foot"><span>Proyección = venta ÷ días transcurridos × días del mes · ROI = unidades ÷ promotores (HC) · Estados por proyección: en meta ≥100%, bien ≥85%, en riesgo ≥70%, crítico &lt;70% · Fuente: data plana de la zona.</span><b>Infinix · Central de Operaciones</b></footer>
    <div class="rp-bar"></div>`;
    stage.appendChild(el);
    const cm = S.cumpl == null ? 0 : Math.min(1, S.cumpl);
    Charts.ring($('#rz-cumpl', el), [cm, 1 - cm], [sem.color, THEME.line], { cutout: '76%' });
    const ks = Object.keys(STAT).filter(k => an.status[k]);
    Charts.ring($('#rz-status', el), ks.map(k => an.status[k]), ks.map(k => STAT[k][1]), { cutout: '68%', gap: true });
    const roiTop = Math.max(S.roiProj || 0, S.roi || 0, S.hc > 0 ? S.meta / S.hc : 0);
    Charts.ring($('#rz-roi', el), [S.roi || 0, Math.max(0, (S.roiProj || 0) - (S.roi || 0)), Math.max(0, roiTop - Math.max(S.roi || 0, S.roiProj || 0))], [sem.color, sem.color + '55', THEME.line], { cutout: '76%' });
    return el;
}


// ----------------------------------------------------------------------------
// LIENZO · REPORTE RÁPIDO (zona, cadena o tienda) · 1080 px
// ----------------------------------------------------------------------------
function buildQuickCanvas(stage, Q, autor) {
    const dash = '—', pc = v => v == null ? dash : Math.round(v * 100) + '%';
    const R = Q.rows, venta = sum(R.map(r => r.venta)), meta = sum(R.map(r => r.meta)), proj = sum(R.map(r => r.proj)), hc = sum(R.map(r => r.hc));
    const esp = Q.day / Q.dim, cumpl = meta > 0 ? venta / meta : null, cp = meta > 0 ? proj / meta : null;
    const cls = v => v == null ? '' : v >= 1 ? 'g' : v >= .85 ? 'a' : 'r';
    const refs = INFINIX_MODELS.map(m => { const v = sum(R.map(r => r.refs.find(x => x.key === m.key).venta)), t = sum(R.map(r => r.refs.find(x => x.key === m.key).meta)), inv = sum(R.map(r => r.refs.find(x => x.key === m.key).inv)); return { ...m, v, t, inv }; }).filter(x => x.v || x.t || x.inv);
    const kick = { zona: 'REPORTE DE ZONA', cadena: 'REPORTE DE CADENA', tienda: 'REPORTE DE TIENDA' }[Q.tipo];
    const fill = Math.min(100, Math.round((cumpl || 0) * 100)), mark = Math.round(esp * 100);
    const body = Q.tipo === 'tienda'
        ? `<div class="fa-sec">👥 ASESORES</div><table class="fa-tbl"><thead><tr><th class="l">Asesor</th><th>Meta</th><th>Venta</th><th>Cumpl.</th><th>Proyección</th>${Q.evals ? '<th>Evaluación</th>' : ''}<th class="l">Foco</th></tr></thead><tbody>
            ${Q.advs.map(d => `<tr><td class="l"><b>${esc(d.nombre)}</b></td><td>${d.pacing.meta || dash}</td><td><b>${d.pacing.venta}</b></td><td class="${cls(d.pacing.indice)}"><b>${pc(d.pacing.cumpl)}</b></td><td>${d.pacing.proy}</td>${Q.evals ? `<td>${d.evaluacion && d.evaluacion.promedio != null ? d.evaluacion.promedio : dash}</td>` : ''}<td class="l">${d.inventario.oportunidad ? esc(d.inventario.oportunidad.name) : dash}</td></tr>`).join('') || `<tr><td colspan="7">Sin asesores en la data.</td></tr>`}
            </tbody></table>`
        : `<div class="fa-sec">🏬 TIENDAS</div><table class="fa-tbl"><thead><tr><th class="l">Tienda</th><th>Meta</th><th>Venta</th><th>Cumpl.</th><th>Proyección</th><th>% Proy.</th><th>ROI proy.</th></tr></thead><tbody>
            ${R.slice().sort((a, b) => (b.cumplProj ?? -1) - (a.cumplProj ?? -1)).map(r => `<tr><td class="l"><b>${esc(r.st.tienda)}</b></td><td>${r.meta || dash}</td><td><b>${r.venta}</b></td><td>${pc(r.cumpl)}</td><td>${r.proj}</td><td class="${cls(r.cumplProj)}"><b>${pc(r.cumplProj)}</b></td><td>${r.hc ? fmt1(r.roiProj) : dash}</td></tr>`).join('')}
            </tbody></table>`;
    const el = document.createElement('div');
    el.className = 'rp fa fa-img qk';
    el.innerHTML = `<div class="rp-bar"></div><div class="fa-pad">
        <div class="fa-head"><div class="fa-who"><div class="fa-kick">${kick} · ${esc(Q.zona.toUpperCase())}</div>
            <div class="fa-name">${Q.logoKey ? chainLogo(Q.logoKey, '', 'sm') + ' ' : ''}${esc(Q.label)}</div>
            <div class="fa-sub">Corte ${esc(fechaLarga(Q.corte))} · día ${Q.day} de ${Q.dim} · ${R.length} PDV · HC ${fmt1(hc)}</div></div>
            <div class="ac-big ${cls(meta ? cumpl / esp : null)}"><b>${pc(cumpl)}</b><small>de la meta</small></div></div>
        <div class="fa-kpis">
            <div class="fa-kpi"><span>Venta vs. meta</span><b>${venta}<small> / ${meta || dash}</small></b><em>faltan ${Math.max(0, meta - venta)} uds</em></div>
            <div class="fa-kpi"><span>A hoy debería llevar</span><b>${Math.round(meta * esp)}</b><em>${venta >= Math.round(meta * esp) ? 'va arriba ✅' : `va ${Math.round(meta * esp) - venta} abajo`}</em></div>
            <div class="fa-kpi"><span>Proyección</span><b>${proj}</b><em>${pc(cp)} de la meta</em></div>
            <div class="fa-kpi"><span>ROI proyectado</span><b>${hc ? fmt1(proj / hc) : dash}</b><em>actual ${hc ? fmt1(venta / hc) : dash}</em></div>
        </div>
        <div class="fa-pace"><div class="fa-bar"><div class="fa-fill ${cls(meta ? cumpl / esp : null)}" style="width:${fill}%"></div><div class="fa-mark" style="left:${mark}%"><b>a hoy ${mark}%</b></div></div>
            <div class="fa-pace-t">Ritmo: ${fmt1(venta / Q.day)} uds/día · necesita ${Q.dim - Q.day > 0 ? fmt1(Math.max(0, meta - venta) / (Q.dim - Q.day)) : dash} uds/día para cerrar.</div></div>
        ${body}
        <div class="fa-sec">📦 REFERENCIAS</div><table class="fa-tbl"><thead><tr><th class="l">Referencia</th><th>Target</th><th>Venta</th><th>Cumpl.</th><th>Inventario</th></tr></thead><tbody>
            ${refs.map(x => `<tr><td class="l"><b>${esc(x.name)}</b></td><td>${x.t || dash}</td><td><b>${x.v}</b></td><td class="${x.t ? cls(x.v / x.t / esp) : ''}">${x.t ? pc(x.v / x.t) : dash}</td><td>${x.inv}</td></tr>`).join('')}
        </tbody></table>
    </div>
    <footer class="rp-foot"><span>Venta de la data DCR · Proyección = venta ÷ días transcurridos × días del mes${autor ? ` · Elaborado por ${esc(autor.nombre)}` : ''}</span><b>Infinix · Central de Operaciones</b></footer><div class="rp-bar"></div>`;
    stage.appendChild(el);
    return el;
}

// ============================================================================
// INFINIX OPSCORE · DATOS DE DEMOSTRACIÓN
// Deja la app lista para mostrar: todas las tiendas con asesores, HC, metas,
// inventario y cierres diarios; un equipo de prueba con planes y visitas.
// Todo queda marcado con demo:true y se borra con "Restaurar de cero"
// (Gestión › Configuración). Los números son inventados pero estables: la
// misma tienda y el mismo día generan siempre lo mismo.
// ============================================================================

const Demo = (() => {
    // Azar reproducible a partir de un texto (tienda + fecha)
    const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
    const rng = seed => { let a = hash(seed); return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
    const poisson = (r, mean) => { const L = Math.exp(-mean); let k = 0, p = 1; do { k++; p *= r(); } while (p > L); return k - 1; };
    const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
    const pickN = (r, arr, n) => { const a = arr.slice(), out = []; while (out.length < n && a.length) out.push(a.splice(Math.floor(r() * a.length), 1)[0]); return out; };

    const WEIGHTS = { 'smart-20': .22, 'hot-60-pro': .06, 'hot-70': .17, 'hot-70-pro-5g': .08, 'note-edge': .25, 'note-60': .07, 'note-60-pro': .10, 'gt-50-pro': .03, 'note-60-ultra': .02 };
    const COMP = { SAMSUNG: 1.0, XIAOMI: .8, MOTOROLA: .45, TECNO: .45, HONOR: .4, OPPO: .35, REALME: .2, VIVO: .15, ZTE: .08, APPLE: .1 };
    const MISS = [0, .03, .08, 0, .2, .03, 0, .35, .05, 0, .1, .03, .5, 0, .06];      // disciplina de reporte variada
    const DOW = [1.3, .8, .8, .85, .9, 1.2, 1.6];                                      // domingo … sábado
    const GESTION = ['Se movió la mesa de Infinix a la entrada del pasillo de tecnología.', 'Clínica de ventas de Note Edge con los asesores y un asesor de cadena.', 'Revisión de planillas, metas y participación con el equipo.', 'Demo de Hot 70 encendido y material POP renovado.', 'Acompañamiento en sala: dos ventas cerradas durante la visita.'];
    const ALERTAS = ['Note 60 agotado desde hace tres días.', 'Participación en tercer lugar durante la semana.', 'Asesor de cadena recomienda primero a la competencia.', 'Sin novedades críticas.', 'Demo de Note Edge sin cargador.'];
    const COMPROMISOS = ['Cerrar la semana con 15 unidades.', 'Note Edge: 6 unidades adicionales antes del domingo.', 'Subir el cumplimiento 10 puntos esta semana.', 'Recuperar el segundo lugar en participación.'];
    const RADAR = ['Tecno paga bono por Spark 50 5G a asesores de cadena.', 'Samsung con activación BTL sábado y domingo.', 'Xiaomi con descuento de $100.000 en Redmi Note 15.', 'Honor sumó un promotor de fin de semana.'];

    // Ventas reales del mes (DEMO_SALES) por referencia de la app
    function realSales(st) {
        const D = typeof DEMO_SALES !== 'undefined' ? DEMO_SALES[st.id] : null, out = { total: 0, ventas: {}, asesores: {} };
        if (!D) return out;
        const key = n => ZoneData.matchModelName(n);
        Object.entries(D.v).forEach(([n, q]) => { const k = key(n); if (k) { out.ventas[k] = (out.ventas[k] || 0) + q; out.total += q; } });
        Object.entries(D.a).forEach(([a, mm]) => { const A = out.asesores[a] = { nombre: a, total: 0, ventas: {} }; Object.entries(mm).forEach(([n, q]) => { const k = key(n); if (k) { A.ventas[k] = (A.ventas[k] || 0) + q; A.total += q; } }); });
        return out;
    }
    function storeProfile(st, i) {
        const r = rng('perfil_' + st.id), R = realSales(st);
        const seedAs = (st.asesoresSeed || []).slice(0, 4);
        const nAs = seedAs.length || (1 + Math.floor(r() * 3));
        // Target: la venta real proyectada al mes con una exigencia del 10–35 %; si no hay venta real, un target típico
        const corteDay = typeof DEMO_SALES_CORTE !== 'undefined' ? parseD(DEMO_SALES_CORTE).getDate() : 14, dim = daysInMonth(todayStr().slice(0, 7));
        const k = 0.55 + r() * 1.0;
        const metaTot = R.total > 0 ? Math.max(8, Math.round(R.total / corteDay * dim * (1.1 + r() * 0.25))) : Math.round(38 + k * 46);
        const metas = Object.fromEntries(INFINIX_MODELS.map(m => [m.key, Math.round(metaTot * WEIGHTS[m.key])]));
        return {
            k, perf: 0.78 + r() * 0.6, compF: 0.6 + r() * 0.45, miss: MISS[i % MISS.length], metas, metaMes: sum(Object.values(metas)), real: R,
            asesores: seedAs.length ? seedAs : Array.from({ length: nAs }, (_, n) => `Asesor ${n + 1}`),
            hc: { INFINIX: nAs, XIAOMI: 2, SAMSUNG: 2 + Math.round(r()), MOTOROLA: 1, OPPO: 1, HONOR: 1, REALME: Math.round(r()), TECNO: 1, VIVO: 0, ZTE: 0, APPLE: 0 },
            // Targets de la competencia (según su peso en la tienda) y de accesorios
            metasComp: Object.fromEntries(Object.keys(COMP).filter(b => b !== 'INFINIX').map(b => [b, Math.round(metaTot * COMP[b] * 0.9)])),
            metasAcc: { 'xbuds-h5': Math.round(6 + k * 6), 'xpad-30e': Math.round(1 + k * 2), 'gt-5-pro': Math.round(2 + k * 2) },
            invAcc: { 'xbuds-h5': Math.round(8 + k * 10), 'xpad-30e': Math.round(2 + k * 3), 'gt-5-pro': Math.round(3 + k * 3) }
        };
    }

    function buildClosures(st, P, from, to) {
        const out = [];
        const stock = Object.fromEntries(INFINIX_MODELS.map(m => [m.key, Math.round(P.metas[m.key] * 1.5) + 3]));
        const base = { ...stock };
        const keys = INFINIX_MODELS.map(m => m.key), cum = []; let acc = 0;
        keys.forEach(k => { acc += WEIGHTS[k]; cum.push(acc); });
        for (let d = from; d <= to; d = addDays(d, 1)) {
            const r = rng(st.id + '_' + d), mean = P.metaMes / 30 * P.perf * DOW[parseD(d).getDay()];
            const ventas = Object.fromEntries(keys.map(k => [k, 0]));
            for (let n = poisson(r, mean); n > 0; n--) {
                const x = r() * acc, k = keys[cum.findIndex(c => x <= c)];
                if (stock[k] > 0) { ventas[k]++; stock[k]--; }
            }
            keys.forEach(k => { if (stock[k] <= Math.round(base[k] * 0.35) && r() < 0.55) stock[k] += Math.round(base[k] * 0.7); });   // reposición
            const competencia = Object.fromEntries(Object.keys(COMP).map(b => [b, P.hc[b] > 0 || COMP[b] < .3 ? poisson(r, mean * COMP[b] * P.compF * (P.hc[b] > 0 ? 1 : .5)) : 0]));
            const accesorios = { 'xbuds-h5': poisson(r, .28), 'xpad-30e': poisson(r, .07), 'gt-5-pro': poisson(r, .1) };
            const skip = r() < P.miss;
            if (skip) continue;                                        // ese día la tienda no envió cierre
            const totalInfinix = sum(Object.values(ventas));
            out.push({
                id: `${st.id}_${d}`, storeId: st.id, storeMonth: `${st.id}_${d.slice(0, 7)}`, tienda: st.tienda, cadena: st.cadena || '', zona: st.zona || '', ciudad: st.ciudad || '',
                logoKey: normLogoKey(st.logoKey), fecha: d, week: 'W' + isoWeek(d), month: d.slice(0, 7), asesores: P.asesores.slice(0, 1 + Math.floor(r() * P.asesores.length)),
                ventas, competencia, inventario: { ...stock }, accesorios, hc: P.hc, metaMes: P.metaMes,
                totalInfinix, totalTienda: totalInfinix + sum(Object.values(competencia)), updatedAt: parseD(d).getTime() + 8 * 3600000, demo: true
            });
        }
        return { closures: out, stock };
    }

    async function load(opts = {}) {
        const today = todayStr(), yest = addDays(today, -1), monthStart = today.slice(0, 8) + '01';
        const from = addDays(monthStart, -14);
        const ops = [], closBy = {}, profiles = {};
        const allStores = State.stores.filter(s => !s.isConfigured || s.demoConfig);     // nunca toca tiendas ya configuradas de verdad
        const stores = allStores.filter(s => DEMO_CLOSURE_ZONES.includes(s.zona));        // con cierres diarios, planes y visitas

        // 1) Todas las tiendas del país configuradas con asesores reales, targets e inventario; cierres solo en las zonas de prueba
        allStores.forEach((st, i) => {
            const P = profiles[st.id] = storeProfile(st, i);
            let stock, closures = [];
            if (DEMO_CLOSURE_ZONES.includes(st.zona)) { ({ closures, stock } = buildClosures(st, P, from, yest)); closBy[st.id] = closures; closures.forEach(c => ops.push({ op: 'set', col: COL.closures, id: c.id, data: c, merge: false })); }
            else stock = Object.fromEntries(INFINIX_MODELS.map(m => [m.key, Math.max(0, Math.round(P.metas[m.key] * 1.2) + 2 - int(P.real.ventas[m.key]))]));
            const upd = { isConfigured: true, demoConfig: true, asesores: P.asesores, cedulas: st.cedulas || {}, hc: P.hc, metas: P.metas, metaMes: P.metaMes, metasComp: P.metasComp, metasAcc: P.metasAcc, invAcc: P.invAcc, inventario: stock, lastClosure: closures.length ? closures[closures.length - 1].fecha : null, updatedAt: Date.now() };
            Object.assign(st, upd); ops.push({ op: 'set', col: COL.stores, id: st.id, data: { ...st }, merge: true });   // documento completo: sirve aunque la tienda aún no exista en la nube
        });

        // 2) Equipo de prueba: coordinador por regional (de las zonas de prueba) y supervisores/formador por zona de prueba
        const zonas = [...new Set(stores.map(s => s.zona).filter(Boolean))];
        const team = [];
        [...new Set(zonas.map(zoneRegional).filter(Boolean))].forEach((reg, ri) => {
            const u = { id: `coordinador_demo_${slug(reg)}`, rol: 'coordinador', nombre: `Coordinador Demo${ri === 0 ? '' : ' ' + reg}`, dcr: ri === 0 ? 'COO' : `COO-${slug(reg).toUpperCase()}`, zona: zonas.find(z => zoneRegional(z) === reg), regional: reg, passHash: pwdHash(DEMO_PASSWORD), createdAt: Date.now(), updatedAt: Date.now(), demo: true };
            team.push(u); upsertState('staff', u); ops.push({ op: 'set', col: COL.staff, id: u.id, data: u, merge: false });
        });
        zonas.forEach((z, zi) => {
            const suf = zi === 0 ? '' : ` ${z}`;
            [['supervisor', 'Supervisor Demo 1', 'SUP1'], ['supervisor', 'Supervisor Demo 2', 'SUP2'], ['formador', 'Formador Demo 1', 'FOR1']].forEach(([rol, nombre, dcr]) => {
                const u = { id: `${rol}_${slug(nombre + suf)}`, rol, nombre: nombre + suf, dcr: zi === 0 ? dcr : `${dcr}-${slug(z).toUpperCase()}`, zona: z, passHash: pwdHash(DEMO_PASSWORD), createdAt: Date.now(), updatedAt: Date.now(), demo: true };
                team.push(u); upsertState('staff', u); ops.push({ op: 'set', col: COL.staff, id: u.id, data: u, merge: false });
            });
        });

        // 3) Planes de la mañana, cierres de la noche y visitas
        const skipP = { 0: .08, 1: .2, 2: .05 };
        team.filter(u => u.rol !== 'coordinador').forEach((u, ui) => {
            const zs = stores.filter(s => s.zona === u.zona); if (!zs.length) return;
            let dayN = 0;
            for (let d = monthStart; d <= yest; d = addDays(d, 1)) {
                if (!STAFF_DAYS.includes(parseD(d).getDay())) continue;
                const r = rng(u.id + '_' + d); dayN++;
                if (r() < (skipP[ui % 3] || .1)) continue;                 // ese día no envió plan
                const n = Math.min(zs.length, 3 + Math.floor(r() * 2)), ts = parseD(d).getTime();
                const rowsP = [];
                for (let j = 0; j < n; j++) {
                    const st = zs[(dayN * 3 + ui * 5 + j * 2) % zs.length];
                    if (rowsP.some(x => x.storeId === st.id)) continue;
                    const cl = closBy[st.id] || [], prev = cl.filter(c => c.fecha < d && c.fecha.slice(0, 7) === d.slice(0, 7)).map(c => c.fecha).pop();
                    const c = prev ? computeStore(st, cl, prev) : null, hc = int(st.hc && st.hc.INFINIX) || 1;
                    const todayC = cl.find(x => x.fecha === d), undVisita = todayC ? todayC.totalInfinix : poisson(r, 1.5);
                    const foco = INFINIX_MODELS.map(m => ({ key: m.key, meta: int(st.metas[m.key]) })).sort((a, b) => b.meta - a.meta)[0].key;
                    const fm = c && c.models.find(m => m.key === foco), ventaMes = c ? c.infMes : 0;
                    const day = prev ? parseD(prev).getDate() : 1, dim = daysInMonth(d.slice(0, 7));
                    const compromisoUnd = 1 + Math.floor(r() * 4);
                    rowsP.push({
                        storeId: st.id, tienda: st.tienda, ciudad: st.ciudad || '', cadena: st.cadena || '', logoKey: normLogoKey(st.logoKey), zona: st.zona || '',
                        auto: !!c, corte: prev || '', hc, metaMes: storeMetaMes(st), ventaMes, ventaSemana: c ? c.infSem : 0, shareSem: c ? c.shareSem : 0, invTotal: c ? c.invTotal : storeInvTotal(st),
                        roi: +(ventaMes / hc).toFixed(1), roiProj: +((ventaMes / day * dim) / hc).toFixed(1),
                        focoRef: foco, focoMeta: int(st.metas[foco]), focoVenta: fm ? fm.mes : 0, focoInv: fm ? fm.inv : int(st.inventario[foco]),
                        foco: pick(r, PLAN_FOCOS), acciones: pickN(r, PLAN_ACCIONES, 3), impactos: pickN(r, PLAN_IMPACTOS, 3), compromisoUnd,
                        estados: [0, 1, 2].map(() => { const x = r(); return x < .68 ? 'ok' : x < .86 ? 'parcial' : 'pend'; }),
                        undVisita, compromisoOk: undVisita >= compromisoUnd ? 'si' : 'no', undLlegada: ventaMes, undCierre: ventaMes + undVisita
                    });
                }
                const conCierre = r() < .86;
                if (!conCierre) rowsP.forEach(x => { x.estados = ['', '', '']; x.undVisita = 0; x.compromisoOk = ''; x.undCierre = x.ventaMes; });
                const plan = {
                    id: `${u.id}_${d}`, userId: u.id, nombre: u.nombre, rol: u.rol, zona: u.zona, fecha: d, week: 'W' + isoWeek(d), month: d.slice(0, 7),
                    stores: rowsP, storeIds: rowsP.map(x => x.storeId), planSentAt: ts - 4.5 * 3600000 + Math.floor(r() * 20) * 60000,
                    cierreSentAt: conCierre ? ts + 8 * 3600000 + Math.floor(r() * 40) * 60000 : null, updatedAt: ts, demo: true
                };
                ops.push({ op: 'set', col: COL.plans, id: plan.id, data: plan, merge: false });

                rowsP.forEach(x => {                                        // visita a la tienda planeada
                    if (r() > .82) return;
                    const st = storeById(x.storeId), dim = daysInMonth(d.slice(0, 7)), dayNum = parseD(d).getDate();
                    const cl = closBy[st.id] || [], c = x.corte ? computeStore(st, cl, x.corte) : null;
                    const ventaDia = conCierre ? x.undVisita : poisson(r, 1.2), metaDia = Math.ceil(x.metaMes / dim), acum = x.ventaMes + ventaDia;
                    const modo = u.rol === 'formador' ? 'formador' : 'supervisor';
                    const evals = {}; evalWeeksOfMonth(d.slice(0, 7)).forEach(w => { if (w <= isoWeek(d) && r() < .85) evals['W' + w] = { done: true, score: 68 + Math.floor(r() * 30) }; });
                    const done = Object.values(evals), radar = Object.fromEntries(VISIT_RADAR.map(a => [a.key, r() < .25]));
                    const form = {
                        promotores: st.asesores || [], promExtra: '', auto: !!c, corte: x.corte, metaDia, ventaDia, metaMes: x.metaMes, ventaMes: x.ventaMes,
                        accMes: c ? c.accMes : 0, hc: x.hc, share: c ? c.shareMes : 0, evals,
                        competencias: Object.fromEntries(VISIT_COMPETENCIAS.map(k => [k.key, 2 + Math.floor(r() * 4)])), focos: pickN(r, VISIT_FOCOS_FORMADOR, 1 + Math.floor(r() * 2)),
                        ejec: Object.fromEntries(VISIT_EJECUCION.map(a => [a.key, r() < .76])), radar, radarNota: Object.values(radar).some(Boolean) ? pick(r, RADAR) : '',
                        calif: Object.fromEntries(VISIT_CALIF_ASESOR.map(k => [k.key, 3 + Math.floor(r() * 3)])),
                        gestion: pick(r, GESTION), alertas: pick(r, ALERTAS), compromisos: pick(r, COMPROMISOS)
                    };
                    const v = {
                        id: `${u.id}_${st.id}_${d}`, userId: u.id, nombre: u.nombre, rol: u.rol, modo, zona: st.zona || '', storeId: st.id, tienda: st.tienda, cadena: st.cadena || '', ciudad: st.ciudad || '',
                        logoKey: normLogoKey(st.logoKey), fecha: d, week: 'W' + isoWeek(d), month: d.slice(0, 7), promotores: form.promotores,
                        ventaAcum: acum, roi: +(acum / x.hc).toFixed(2), roiProj: +((acum / dayNum * dim) / x.hc).toFixed(2),
                        cumplDia: metaDia > 0 ? +(ventaDia / metaDia).toFixed(3) : null, cumplMes: x.metaMes > 0 ? +(acum / x.metaMes).toFixed(3) : null,
                        ejecOk: Object.values(form.ejec).filter(Boolean).length, ejecTotal: VISIT_EJECUCION.length,
                        evalPromedio: modo === 'formador' && done.length ? Math.round(sum(done.map(e => e.score)) / done.length) : null, evalRealizadas: modo === 'formador' ? done.length : 0,
                        fotos: 0, form, updatedAt: ts, demo: true
                    };
                    ops.push({ op: 'set', col: COL.visits, id: v.id, data: v, merge: false });
                });
            }
        });

        // 4) Data plana de cada zona del país (la venta real agregada de la data DCR, como si ya se hubiera cargado el Excel)
        const month = today.slice(0, 7), corte = typeof DEMO_SALES_CORTE !== 'undefined' && DEMO_SALES_CORTE.slice(0, 7) === month ? DEMO_SALES_CORTE : yest;
        [...new Set(allStores.map(s => s.zona).filter(Boolean))].forEach(z => {
            const snap = { zona: z, regional: zoneRegional(z), month, corte, fileName: 'Shop_Sales_Query_demo.xlsx', uploadedBy: 'Datos de demostración', stores: {}, unmatchedStores: {}, unmatchedRefs: {}, rowsTotal: 0, rowsUsed: 0, rowsOtherBrand: 0, rowsOtherMonth: 0, maxDate: corte, advisors: 0, demo: true };
            allStores.filter(s => s.zona === z).forEach(st => {
                const R = profiles[st.id].real; if (!R.total) return;
                const S = { storeId: st.id, tienda: st.tienda, total: R.total, ventas: R.ventas, otros: 0, asesores: R.asesores, refsOtras: {}, cedulas: st.cedulas || {} };
                snap.stores[st.id] = S; snap.rowsUsed += S.total; snap.rowsTotal += S.total; snap.advisors += Object.keys(R.asesores).length;
            });
            snap.id = `${slug(z)}_${month}`; snap.updatedAt = Date.now();
            ops.push({ op: 'set', col: COL.zoneData, id: snap.id, data: snap, merge: false });
        });

        State.demo = { loaded: true, at: Date.now() };
        ops.push({ op: 'set', col: COL.config, id: 'demo', data: State.demo, merge: false });
        const res = await Data.batch(ops);
        State.zoneSnaps = {};
        if (!opts.silent && State.session) renderHeader();
        return { count: ops.length, synced: res.synced };
    }

    // Restaurar de cero: borra todo lo marcado como demostración y desconfigura las tiendas de prueba
    async function clear() {
        const ops = [];
        for (const col of [COL.closures, COL.plans, COL.visits, COL.staff, COL.zoneData, COL.zoneReports]) {
            const docs = await Data.list(col, [['demo', '==', true]]);
            docs.forEach(d => ops.push({ op: 'del', col, id: d.id }));
        }
        State.staff = State.staff.filter(u => !u.demo);
        State.stores.filter(s => s.demoConfig).forEach(st => {
            const upd = { isConfigured: false, demoConfig: false, asesores: [], hc: null, inventario: null, metas: null, metaMes: 0, metasComp: null, metasAcc: null, invAcc: null, targetsAsesor: null, manual: null, lastClosure: null, updatedAt: Date.now() };
            Object.assign(st, upd); ops.push({ op: 'set', col: COL.stores, id: st.id, data: upd, merge: true });
        });
        State.zoneSnaps = {};
        State.demo = { loaded: false, cleared: true, at: Date.now() };
        ops.push({ op: 'set', col: COL.config, id: 'demo', data: State.demo, merge: false });
        await Data.batch(ops);
        return { count: ops.length - 1 };
    }

    return { load, clear };
})();

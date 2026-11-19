// ============================================================================
// MÓDULO 4 · CENTRAL DE REPORTES Y EXPORTACIÓN GERENCIAL (ExcelJS)
// Supervisor/Formador: su gestión y las tiendas de su zona.
// Coordinador: consolidado de su equipo. Gerente/Admin: consolidado total.
// ============================================================================

registerModule('m4', (() => {
    let Fx = null, agg = null;
    const me = () => State.session;
    const isOwn = () => ['supervisor', 'formador'].includes(me().rol);
    const chainKey = st => normLogoKey(st.logoKey);

    function render(view) {
        const t = todayStr();
        Fx = { from: t.slice(0, 8) + '01', to: t, regional: '', zona: '', cadena: '', tienda: '', user: '' };
        const regs = scopedRegionales();
        const weeks = Array.from({ length: 8 }, (_, i) => weekDays(addDays(t, -7 * i)));
        const zonas = scopedZones();
        const gerencial = ['gerente', 'admin'].includes(me().rol);
        view.innerHTML = `
        <section class="card">
            <div class="row between wrap">
                <div><h2 class="h2">${gerencial ? 'Central nacional / regional de consolidados' : 'Central de reportes y consolidado de cierres'}</h2>
                <p class="mute">${isOwn() ? 'Tu gestión y las tiendas de tu zona.' : me().rol === 'coordinador' ? 'Consolidado de tus supervisores, formadores y tiendas.' : 'Consolidado de coordinadores, supervisores, formadores y tiendas.'}</p></div>
                <div class="row wrap" style="gap:8px"><button class="btn btn-dark" id="m4-visual">📊 Informe gerencial visual</button><button class="btn btn-primary" id="m4-xlsx">⬇️ Informe Gerencial (.xlsx)</button></div>
            </div>
            <div class="filters">
                <label><span class="lbl">Desde</span><input type="date" id="f-from" class="input" value="${Fx.from}"></label>
                <label><span class="lbl">Hasta</span><input type="date" id="f-to" class="input" value="${Fx.to}"></label>
                <label><span class="lbl">Semana (W)</span><select id="f-week" class="input"><option value="">Rango manual</option>${weeks.map(w => `<option value="${w[0]}|${w[6]}">W${isoWeek(w[0])} · ${w[0].slice(5)} a ${w[6].slice(5)}</option>`).join('')}</select></label>
                ${regs.length > 1 ? `<label><span class="lbl">Regional</span><select id="f-regional" class="input"><option value="">Todas (${regs.length})</option>${regs.map(r => `<option>${esc(r)}</option>`).join('')}</select></label>` : ''}
                ${zonas.length > 1 ? `<label><span class="lbl">Zona</span><select id="f-zona" class="input"><option value="">Todas</option>${zonas.map(z => `<option>${esc(z)}</option>`).join('')}</select></label>` : ''}
                <label><span class="lbl">Cadena</span><select id="f-cadena" class="input"></select></label>
                <label><span class="lbl">Tienda</span><select id="f-tienda" class="input"></select></label>
                ${isOwn() ? '' : `<label><span class="lbl">Integrante</span><select id="f-user" class="input"></select></label>`}
                <button class="btn btn-dark" id="f-apply">Aplicar filtros</button>
            </div>
        </section>
        <div id="m4-out"><div class="card empty">Cargando consolidado…</div></div>`;

        $('#f-week').onchange = e => { if (!e.target.value) return; const [a, b] = e.target.value.split('|'); $('#f-from').value = a; $('#f-to').value = b; };
        ['f-from', 'f-to'].forEach(id => $('#' + id).addEventListener('input', () => { $('#f-week').value = ''; }));
        if ($('#f-regional')) $('#f-regional').onchange = () => { Fx.regional = $('#f-regional').value; Fx.zona = ''; fillZonas(); fillDependents(); };
        if ($('#f-zona')) $('#f-zona').onchange = () => { Fx.zona = $('#f-zona').value; fillDependents(); };
        $('#f-cadena').onchange = () => { Fx.cadena = $('#f-cadena').value; fillDependents(true); };
        $('#f-apply').onclick = load;
        $('#m4-xlsx').onclick = downloadExcel;
        $('#m4-visual').onclick = openVisual;
        fillDependents(); load();
    }

    // Zonas del selector según la regional elegida
    function fillZonas() {
        const sel = $('#f-zona'); if (!sel) return;
        const zs = scopedZones().filter(z => !Fx.regional || zoneRegional(z) === Fx.regional);
        sel.innerHTML = '<option value="">Todas</option>' + zs.map(z => `<option ${z === Fx.zona ? 'selected' : ''}>${esc(z)}</option>`).join('');
    }
    const inReg = st => !Fx.regional || zoneRegional(st.zona) === Fx.regional;
    function fillDependents(keepChain) {
        const base = scopedStores().filter(s => inReg(s) && (!Fx.zona || s.zona === Fx.zona));
        if (!keepChain) {
            const chains = [...new Set(base.map(chainKey))];
            $('#f-cadena').innerHTML = '<option value="">Todas</option>' + chains.map(k => `<option value="${k}" ${k === Fx.cadena ? 'selected' : ''}>${k === 'otro' ? 'Otras' : CHAINS[k].name}</option>`).join('');
            if (!chains.includes(Fx.cadena)) Fx.cadena = '';
        }
        $('#f-tienda').innerHTML = '<option value="">Todas</option>' + base.filter(s => !Fx.cadena || chainKey(s) === Fx.cadena).map(s => `<option value="${esc(s.id)}">${esc(s.tienda)}</option>`).join('');
        if ($('#f-user')) {
            const team = State.staff.filter(u => ['supervisor', 'formador', 'coordinador'].includes(u.rol) && inScope(u.zona) && (!Fx.regional || zoneRegional(u.zona) === Fx.regional || u.regional === Fx.regional) && (!Fx.zona || u.zona === Fx.zona));
            $('#f-user').innerHTML = '<option value="">Todo el equipo</option>' + team.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map(u => `<option value="${esc(u.id)}">${esc(u.nombre)} · ${ROLES[u.rol].label}</option>`).join('');
        }
    }

    async function load() {
        Object.assign(Fx, {
            from: $('#f-from').value || Fx.from, to: $('#f-to').value || Fx.to,
            regional: $('#f-regional') ? $('#f-regional').value : '', zona: $('#f-zona') ? $('#f-zona').value : '', cadena: $('#f-cadena').value, tienda: $('#f-tienda').value, user: $('#f-user') ? $('#f-user').value : ''
        });
        if (Fx.from > Fx.to) { toast('El rango de fechas no es válido.', 'warn'); return; }
        const range = [['fecha', '>=', Fx.from], ['fecha', '<=', Fx.to]];
        const [cl, pl, vi] = await Promise.all([Data.list(COL.closures, range), Data.list(COL.plans, range), Data.list(COL.visits, range), ZoneData.loadMany(scopedZones(), Fx.from.slice(0, 7)).catch(() => null)]);
        agg = aggregate(cl, pl, vi);
        if ($('#m4-out')) paint();
        return agg;
    }

    // ------------------------------------------------------------------ Motor
    function aggregate(cl, pl, vi) {
        const s = me(), f = Fx, today = todayStr();
        const toEff = f.to > today ? today : f.to;
        const rangeDays = Math.max(1, Math.round((parseD(toEff) - parseD(f.from)) / 86400000) + 1);
        const today0 = todayStr();
        const dim = daysInMonth(toEff.slice(0, 7));

        const stores = scopedStores().filter(st => (!f.regional || zoneRegional(st.zona) === f.regional) && (!f.zona || st.zona === f.zona) && (!f.cadena || chainKey(st) === f.cadena) && (!f.tienda || st.id === f.tienda));
        const ids = new Set(stores.map(x => x.id));
        const closures = cl.filter(c => ids.has(c.storeId));

        // Equipo: usuarios vigentes + autores de registros (aunque ya hayan sido retirados)
        const teamMap = {};
        State.staff.filter(u => ['supervisor', 'formador', 'coordinador'].includes(u.rol)).forEach(u => { teamMap[u.id] = { id: u.id, nombre: u.nombre, rol: u.rol, zona: u.zona, activo: true }; });
        pl.concat(vi).forEach(d => { if (d.userId && !teamMap[d.userId]) teamMap[d.userId] = { id: d.userId, nombre: d.nombre + (State.staff.some(u => u.id === d.userId) ? '' : ' (retirado)'), rol: d.rol, zona: d.zona, activo: false }; });
        let team = Object.values(teamMap).filter(u => inScope(u.zona) && (!f.regional || zoneRegional(u.zona) === f.regional) && (!f.zona || u.zona === f.zona));
        if (isOwn()) team = team.filter(u => u.id === s.userId);
        if (f.user) team = team.filter(u => u.id === f.user);
        const teamIds = new Set(team.map(u => u.id));
        const storeFilter = !!(f.cadena || f.tienda);
        const plans = pl.filter(p => teamIds.has(p.userId));
        const visits = vi.filter(v => teamIds.has(v.userId) && (!storeFilter || ids.has(v.storeId)));

        // Venta Infinix: la data DCR cargada en Análisis de zona manda cuando el rango es el mes en curso (desde el día 1);
        // la competencia sale de los cierres diarios (se digita a mano: sin cierres queda en cero)
        // La venta Infinix sale de la data DCR (por día y referencia) para cualquier rango del mes cargado: una semana, varias o el mes.
        // Meta del rango: mes completo = meta del mes; si no, cuota semanal (meta ÷ 4) proporcional a los días del rango.
        const monthEnd = f.from.slice(0, 8) + pad2(dim);
        const metaFactor = f.from.slice(8) === '01' && (f.to >= monthEnd || f.to >= today) ? 1 : (rangeDays / 7) / 4;
        const rows = stores.map(st => {
            const cs = closures.filter(c => c.storeId === st.id).sort((a, b) => a.fecha < b.fecha ? -1 : 1);
            const last = cs[cs.length - 1];
            const brands = Object.fromEntries(BRANDS.map(b => [b, sum(cs.map(c => closureBrand(c, b)))]));
            const Z = typeof ZoneData !== 'undefined' ? ZoneData.forStore(st.id) : null;
            const zm = Z && (Z.month || (Z.corte || '').slice(0, 7));
            const dcr = Z && zm === f.from.slice(0, 7) ? Z : null;
            const corteZ = dcr ? (dcr.corte || toEff) : toEff;
            const rg = dcr ? (dcr.dias ? dcrRange(dcr, f.from, f.to < corteZ ? f.to : corteZ) : (f.from.slice(8) === '01' ? { total: int(dcr.total), ventas: dcr.ventas || {} } : null)) : null;
            if (rg) brands.INFINIX = rg.total;
            const inf = brands.INFINIX, total = sum(Object.values(brands));
            const hcRaw = last && last.hc && last.hc.INFINIX != null ? last.hc.INFINIX : st.hc && st.hc.INFINIX, hc = +hcRaw || 0;
            // días ya transcurridos del rango (para proyectar el rango completo)
            const endData = rg ? (f.to < corteZ ? f.to : corteZ) : toEff;
            const elapsed = Math.max(1, Math.round((parseD(endData) - parseD(f.from)) / 86400000) + 1);
            const metaM = storeMetaMes(st), meta = Math.round(metaM * metaFactor);
            const proj = metaFactor === 1 ? Math.round(inf / Math.max(1, parseD(endData).getDate()) * dim) : Math.round(inf / elapsed * rangeDays);
            const inv = last ? (last.inventario || {}) : (st.inventario || {});
            return {
                st, cierres: [...closureDaysCovered(cs)].filter(d => d >= f.from && d <= f.to).length, inf, total, brands, share: total > 0 ? inf / total : 0, hc, meta, proj,
                cumpl: meta > 0 ? inf / meta : null, cumplProj: meta > 0 ? proj / meta : null,
                roi: hc > 0 ? inf / hc : null, roiProj: hc > 0 ? proj / hc : null,
                acc: sum(cs.map(c => sum(Object.values(c.accesorios || {}).map(int)))),
                inv, invTotal: sum(INFINIX_MODELS.map(m => int(inv[m.key]))),
                dcr: !!rg, dcrVentas: rg ? rg.ventas : null, corteDCR: dcr ? dcr.corte : '', sem: dcr ? dcr.sem || {} : {},
                lastFecha: last ? last.fecha : null, expected: expectedDays(f.from, f.to, STORE_DAYS, closureDaysCovered(cs).has(today0))
            };
        });
        rows.forEach(r => { r.efect = r.expected > 0 ? Math.min(1, r.cierres / r.expected) : null; });
        const bizDays = Math.max(0, ...rows.map(r => r.expected));

        const brandTot = BRANDS.map(b => ({ brand: b, v: sum(rows.map(r => r.brands[b])) })).sort((a, b) => b.v - a.v);
        const totStore = sum(brandTot.map(b => b.v)), totInf = sum(rows.map(r => r.inf));
        brandTot.forEach((b, i) => { b.share = totStore > 0 ? b.v / totStore : 0; b.pos = b.v > 0 ? i + 1 : null; });

        const zoneMap = {};
        rows.forEach(r => {
            const z = zoneMap[r.st.zona] = zoneMap[r.st.zona] || { zona: r.st.zona, tiendas: 0, reportan: 0, hc: 0, inf: 0, total: 0, meta: 0, proj: 0, cierres: 0, expected: 0 };
            z.tiendas++; z.expected += r.expected; z.reportan += r.cierres > 0 ? 1 : 0; z.hc += r.hc; z.inf += r.inf; z.total += r.total; z.meta += r.meta; z.proj += r.proj; z.cierres += r.cierres;
        });
        const zones = Object.values(zoneMap).map(z => ({
            ...z, regional: zoneRegional(z.zona), share: z.total > 0 ? z.inf / z.total : 0, cumpl: z.meta > 0 ? z.inf / z.meta : null,
            roi: z.hc > 0 ? z.inf / z.hc : null, roiProj: z.hc > 0 ? z.proj / z.hc : null,
            efect: z.expected > 0 ? Math.min(1, z.cierres / z.expected) : null
        })).sort((a, b) => (a.regional + a.zona).localeCompare(b.regional + b.zona, 'es'));
        // Consolidado por regional (suma de sus zonas)
        const regMap = {};
        zones.forEach(z => { const r = regMap[z.regional || '—'] = regMap[z.regional || '—'] || { regional: z.regional || '—', zonas: 0, tiendas: 0, reportan: 0, hc: 0, inf: 0, total: 0, meta: 0, proj: 0, cierres: 0, expected: 0 }; r.zonas++; ['tiendas', 'reportan', 'hc', 'inf', 'total', 'meta', 'proj', 'cierres', 'expected'].forEach(k => { r[k] += z[k]; }); });
        const regionals = Object.values(regMap).map(r => ({ ...r, share: r.total > 0 ? r.inf / r.total : 0, cumpl: r.meta > 0 ? r.inf / r.meta : null, roi: r.hc > 0 ? r.inf / r.hc : null, roiProj: r.hc > 0 ? r.proj / r.hc : null, efect: r.expected > 0 ? Math.min(1, r.cierres / r.expected) : null })).sort((a, b) => a.regional.localeCompare(b.regional, 'es'));

        const staff = team.map(u => {
            const vs = visits.filter(v => v.userId === u.id), ps = plans.filter(p => p.userId === u.id);
            const freq = {}; vs.forEach(v => { freq[v.storeId] = freq[v.storeId] || { n: 0, tienda: v.tienda, last: '' }; freq[v.storeId].n++; if (v.fecha > freq[v.storeId].last) freq[v.storeId].last = v.fecha; });
            const pdv = Object.keys(freq).length, zoneStores = State.stores.filter(st => st.zona === u.zona).length;
            const dias = new Set(vs.map(v => v.fecha)).size;
            const planes = ps.filter(p => p.planSentAt).length, cierresAct = ps.filter(p => p.cierreSentAt).length;
            const expPlan = expectedDays(f.from, f.to, STAFF_DAYS, ps.some(p => p.fecha === today0 && p.planSentAt));
            return {
                u, visitas: vs.length, pdv, zoneStores, cobertura: zoneStores > 0 ? pdv / zoneStores : null, repetidas: vs.length - pdv,
                prom: dias > 0 ? vs.length / dias : 0, planes, cierresAct, planeadas: sum(ps.map(p => (p.stores || []).length)),
                cierreVsPlan: planes > 0 ? cierresAct / planes : null, expPlan, planEfect: expPlan > 0 ? Math.min(1, planes / expPlan) : null, freq
            };
        }).filter(x => x.u.rol !== 'coordinador' || x.visitas || x.planes)      // el coordinador solo aparece si él mismo reportó
            .sort((a, b) => b.visitas - a.visitas);

        // Complementos: estado de tiendas, venta semanal, referencias y cadenas
        const status = { meta: 0, riesgo: 0, critico: 0, sin: 0 };
        rows.forEach(r => { if (r.cumplProj == null) status.sin++; else if (r.cumplProj >= 1) status.meta++; else if (r.cumplProj >= 0.7) status.riesgo++; else status.critico++; });
        const wkMap = {};
        closures.forEach(c => { const k = isoWeek(c.fecha); wkMap[k] = wkMap[k] || { wk: k, inf: 0, total: 0, first: c.fecha }; wkMap[k].inf += closureInfinix(c); wkMap[k].total += sum(BRANDS.map(b => closureBrand(c, b))); if (c.fecha < wkMap[k].first) wkMap[k].first = c.fecha; });
        // Venta semanal: de la data DCR cuando la hay (semanas del rango), con el total de tienda de los cierres
        if (rows.some(r => r.dcr)) {
            const wr = new Set(); for (let d = f.from; d <= toEff; d = addDays(d, 1)) wr.add(isoWeek(d));
            Object.keys(wkMap).forEach(k => { wkMap[k].inf = 0; });
            rows.forEach(r => Object.entries(r.sem || {}).forEach(([w, q]) => { const k = +w.slice(1); if (!wr.has(k)) return; wkMap[k] = wkMap[k] || { wk: k, inf: 0, total: 0, first: f.from }; wkMap[k].inf += q; }));
            Object.values(wkMap).forEach(w => { if (w.total < w.inf) w.total = w.inf; });
        }
        const weekly = Object.values(wkMap).sort((a, b) => a.wk - b.wk).slice(-8);
        const models = INFINIX_MODELS.map(m => ({ ...m, v: sum(rows.map(r => r.dcr ? int(r.dcrVentas[m.key]) : sum(closures.filter(c => c.storeId === r.st.id).map(c => int(c.ventas && c.ventas[m.key]))))), meta: Math.round(sum(stores.map(st => int(st.metas && st.metas[m.key]))) * metaFactor) }))
            .map(m => ({ ...m, cumpl: m.meta > 0 ? m.v / m.meta : null })).sort((a, b) => b.v - a.v);
        const chainMap = {};
        rows.forEach(r => { const k = chainKey(r.st), c = chainMap[k] = chainMap[k] || { key: k, name: k === 'otro' ? 'Otras' : CHAINS[k].name, tiendas: 0, inf: 0, meta: 0, proj: 0, hc: 0 }; c.tiendas++; c.inf += r.inf; c.meta += r.meta; c.proj += r.proj; c.hc += r.hc; });
        const chains = Object.values(chainMap).map(c => ({ ...c, cumpl: c.meta > 0 ? c.inf / c.meta : null, cumplProj: c.meta > 0 ? c.proj / c.meta : null, roi: c.hc > 0 ? c.inf / c.hc : null })).sort((a, b) => b.inf - a.inf);

        const hcTot = sum(rows.map(r => r.hc)), projTot = sum(rows.map(r => r.proj));
        return {
            f: { ...f }, toEff, bizDays, rangeDays, rows, brandTot, zones, regionals, staff, closures, plans, visits, status, weekly, models, chains,
            sum: {
                totInf, totStore, share: totStore > 0 ? totInf / totStore : 0, tiendas: rows.length, reportan: rows.filter(r => r.cierres > 0).length,
                roi: hcTot > 0 ? totInf / hcTot : null, roiProj: hcTot > 0 ? projTot / hcTot : null, hc: hcTot,
                meta: sum(rows.map(r => r.meta)), proj: projTot, dcrN: rows.filter(r => r.dcr).length, metaFactor, fullMonth: metaFactor === 1, corteDCR: (rows.find(r => r.dcr) || {}).corteDCR || '', visitas: visits.length, planes: plans.filter(p => p.planSentAt).length,
                cierresAct: plans.filter(p => p.cierreSentAt).length, cierres: closures.length,
                efect: sum(rows.map(r => r.expected)) > 0 ? Math.min(1, closures.length / sum(rows.map(r => r.expected))) : null
            }
        };
    }

    // Informe gerencial visual (imagen): tortas y barras con lo mismo del consolidado
    function openVisual() {
        if (!agg) return toast('Espera a que cargue el consolidado.', 'warn');
        const m = openModal(`<h3 class="modal-title">📊 Informe gerencial visual</h3><p class="mute">${esc(scopeTitle())} · ${esc(agg.f.from)} a ${esc(agg.toEff)}. Se genera como imagen para enviar; el Excel trae el detalle plano.</p>
            <div class="actions fa-actions"><button class="btn btn-ghost" data-act="preview">👁️ Vista previa</button><button class="btn btn-wa" data-act="share">📲 WhatsApp</button><button class="btn btn-primary" data-act="save">⬇️ Descargar imagen</button></div>`);
        ReportActions.bind(m, { title: 'Informe gerencial · Central de Operaciones', validate: () => null, filename: () => `Informe_Gerencial_Visual_${slug(scopeTitle())}_${agg.toEff}.png`, build: stage => buildM4Visual(stage, agg, scopeTitle(), me()) });
    }
    const scopeTitle = () => Fx.zona ? `Zona ${Fx.zona}` : Fx.regional ? `Regional ${Fx.regional}` : isAllZones() ? 'Nacional' : (me().rol === 'coordinador' && myRegional() ? `Regional ${myRegional()}` : `Zona ${me().zona || ''}`);

    // ---------------------------------------------------------------- Pantalla
    const pill = r => r == null ? '<i class="pill">—</i>' : `<i class="pill ${semaforo(r).cls}">${Math.round(r * 100)}%</i>`;
    // Cumplimiento del mes: muestra el avance real y lo colorea según la proyección al cierre
    const pillCumpl = (real, proj) => real == null ? '<i class="pill">—</i>' : `<i class="pill ${semaforo(proj == null ? real : proj).cls}">${Math.round(real * 100)}%</i>`;
    function paint() {
        const a = agg, S = a.sum, out = $('#m4-out');
        Charts.destroyAll('view');
        const byRoi = a.rows.slice().sort((x, y) => (y.roi ?? -1) - (x.roi ?? -1));
        const maxRoi = Math.max(1, ...byRoi.map(r => r.roi || 0));
        out.innerHTML = `
        <section class="kpi-row six">
            <div class="kpi hl"><span>ROI promedio</span><b>${S.roi == null ? '—' : fmt1(S.roi)}</b><small>Proyectado ${S.roiProj == null ? '—' : fmt1(S.roiProj)}</small></div>
            <div class="kpi"><span>Venta Infinix</span><b>${S.totInf}</b><small>${S.metaFactor === 1 ? 'Meta mes' : 'Meta del rango (cuota semanal = mes ÷ 4)'} ${S.meta || '—'}${S.dcrN ? ' · data DCR' : ''}</small></div>
            <div class="kpi"><span>Market share</span><b>${S.totStore > S.totInf ? Math.round(S.share * 100) + '%' : '—'}</b><small>${S.totStore > S.totInf ? S.totStore + ' uds en tiendas' : 'sin venta de competencia registrada'}</small></div>
            <div class="kpi"><span>Tiendas reportando</span><b>${S.reportan}/${S.tiendas}</b><small>Efectividad ${S.efect == null ? '—' : Math.round(S.efect * 100) + '%'}</small></div>
            <div class="kpi"><span>Visitas a PDV</span><b>${S.visitas}</b><small>${a.staff.length} integrante(s)</small></div>
            <div class="kpi"><span>Planes / cierres</span><b>${S.planes}/${S.cierresAct}</b><small>mañana / noche</small></div>
        </section>

        <div class="grid2">
            <div class="stack">
                <section class="card">
                    <h3 class="h3">Participación por marca</h3>
                    ${S.totStore ? `<div class="chart-box"><canvas id="m4-brands"></canvas></div>` : '<p class="empty">Sin ventas registradas en el rango.</p>'}
                </section>
                <section class="card">
                    <h3 class="h3">Estado de las tiendas <small class="mute">según proyección de cierre</small></h3>
                    <div class="row" style="gap:16px;align-items:center">
                        <div class="chart-box sm"><canvas id="m4-status"></canvas></div>
                        <div class="legend grow">
                            <div><i class="dot" style="background:${THEME.green}"></i><span>En meta (≥100%)</span><b>${a.status.meta}</b></div>
                            <div><i class="dot" style="background:${THEME.amber}"></i><span>En riesgo (70–99%)</span><b>${a.status.riesgo}</b></div>
                            <div><i class="dot" style="background:${THEME.red}"></i><span>Críticas (&lt;70%)</span><b>${a.status.critico}</b></div>
                            ${a.status.sin ? `<div><i class="dot" style="background:${THEME.line}"></i><span>Sin meta / sin datos</span><b>${a.status.sin}</b></div>` : ''}
                        </div>
                    </div>
                </section>
                <section class="card">
                    <h3 class="h3">Venta semanal <small class="mute">Infinix vs. total tienda</small></h3>
                    ${a.weekly.length ? `<div class="chart-box wk"><canvas id="m4-weekly"></canvas></div>` : '<p class="empty">Sin cierres en el rango.</p>'}
                </section>
            </div>
            <section class="card">
                <h3 class="h3">Ranking de tiendas por ROI</h3>
                <div class="tbl-scroll"><table class="tbl compact"><thead><tr><th>#</th><th>Tienda</th><th>HC</th><th>Target</th><th>Venta</th><th>Cumpl.</th><th>ROI</th><th>Proy. ROI</th></tr></thead><tbody>
                ${byRoi.map((r, i) => `<tr><td>${i + 1}</td><td class="l"><b>${esc(r.st.tienda)}</b><div class="mini-bar"><div style="width:${(r.roi || 0) / maxRoi * 100}%"></div></div></td><td>${r.hc || '—'}</td><td>${r.meta || '—'}</td><td>${r.inf}</td><td>${pillCumpl(r.cumpl, r.cumplProj)}</td><td><b>${r.roi == null ? '—' : fmt1(r.roi)}</b></td><td><b style="color:${semaforo(r.cumplProj == null ? 1 : r.cumplProj).color}">${r.roiProj == null ? '—' : fmt1(r.roiProj)}</b></td></tr>`).join('') || '<tr><td colspan="8">Sin tiendas en el filtro.</td></tr>'}
                </tbody></table></div>
                <p class="hint">Proy. ROI = ROI proyectado al cierre del mes (venta ÷ días transcurridos × días del mes ÷ HC).</p>
            </section>
        </div>

        <div class="grid2">
            <section class="card">
                    <h3 class="h3">Referencias Infinix <small class="mute">venta vs. target del rango</small></h3>
                    <table class="tbl compact"><thead><tr><th>Referencia</th><th>Target</th><th>Venta</th><th>Cumpl.</th></tr></thead><tbody>
                    ${a.models.map(m => `<tr><td class="l"><b>${esc(m.name)}</b><div class="mini-bar"><div style="width:${a.models[0].v ? m.v / a.models[0].v * 100 : 0}%"></div></div></td><td>${m.meta || '—'}</td><td><b>${m.v}</b></td><td>${pill(m.cumpl)}</td></tr>`).join('')}
                    </tbody></table>
            </section>
            <section class="card">
                    <h3 class="h3">Cumplimiento por cadena</h3>
                    <table class="tbl compact"><thead><tr><th>Cadena</th><th>Tiendas</th><th>Target</th><th>Venta</th><th>Cumpl.</th><th>ROI</th></tr></thead><tbody>
                    ${a.chains.map(c => `<tr><td class="l">${chainLogo(c.key, c.name, 'xs')} <b>${esc(c.name)}</b></td><td>${c.tiendas}</td><td>${c.meta || '—'}</td><td><b>${c.inf}</b></td><td>${pillCumpl(c.cumpl, c.cumplProj)}</td><td>${c.roi == null ? '—' : fmt1(c.roi)}</td></tr>`).join('') || '<tr><td colspan="6">Sin tiendas.</td></tr>'}
                    </tbody></table>
            </section>
        </div>

        ${a.regionals.length > 1 ? `<section class="card"><h3 class="h3">Consolidado por regional</h3><div class="tbl-scroll"><table class="tbl compact"><thead><tr><th>Regional</th><th>Zonas</th><th>Tiendas</th><th>HC</th><th>Venta Infinix</th><th>Share</th><th>Cumpl.</th><th>ROI</th><th>ROI proy.</th><th>Disciplina</th></tr></thead><tbody>
            ${a.regionals.map(r => `<tr><td class="l"><b>${esc(r.regional)}</b></td><td>${r.zonas}</td><td>${r.reportan}/${r.tiendas}</td><td>${r.hc}</td><td>${r.inf}</td><td>${Math.round(r.share * 100)}%</td><td>${pillCumpl(r.cumpl, r.meta > 0 ? r.proj / r.meta : null)}</td><td><b>${r.roi == null ? '—' : fmt1(r.roi)}</b></td><td>${r.roiProj == null ? '—' : fmt1(r.roiProj)}</td><td>${pill(r.efect)}</td></tr>`).join('')}</tbody></table></div></section>` : ''}
        ${a.zones.length > 1 ? `<section class="card"><h3 class="h3">Consolidado por zona${a.regionals.length > 1 ? '' : (a.regionals[0] ? ` <small class="mute">regional ${esc(a.regionals[0].regional)}</small>` : '')}</h3><div class="tbl-scroll"><table class="tbl compact"><thead><tr><th>Zona</th>${a.regionals.length > 1 ? '<th>Regional</th>' : ''}<th>Tiendas</th><th>HC</th><th>Venta Infinix</th><th>Share</th><th>Cumpl.</th><th>ROI</th><th>ROI proy.</th><th>Disciplina</th></tr></thead><tbody>
            ${a.zones.map(z => `<tr><td class="l"><b>${esc(z.zona)}</b></td>${a.regionals.length > 1 ? `<td><small>${esc(z.regional)}</small></td>` : ''}<td>${z.reportan}/${z.tiendas}</td><td>${z.hc}</td><td>${z.inf}</td><td>${Math.round(z.share * 100)}%</td><td>${pillCumpl(z.cumpl, z.meta > 0 ? z.proj / z.meta : null)}</td><td><b>${z.roi == null ? '—' : fmt1(z.roi)}</b></td><td>${z.roiProj == null ? '—' : fmt1(z.roiProj)}</td><td>${pill(z.efect)}</td></tr>`).join('')}</tbody></table></div></section>` : ''}

        <section class="card">
            <h3 class="h3">Auditoría de disciplina operativa · cierres diarios</h3>
            <p class="mute">Cierres enviados frente a los días exigibles del rango (hoy cuenta cuando llega el cierre de la noche). Quién envió y quién no.</p>
            <div class="tbl-scroll"><table class="tbl compact"><thead><tr><th>Tienda</th><th>Zona</th><th>Cierres</th><th>Efectividad</th><th>Último cierre</th><th>Stock Infinix</th></tr></thead><tbody>
            ${a.rows.slice().sort((x, y) => (x.efect ?? 0) - (y.efect ?? 0)).map(r => `<tr><td class="l">${storeLogo(r.st, 'xs')} <b>${esc(r.st.tienda)}</b></td><td>${esc(r.st.zona || '')}</td><td>${r.cierres}/${r.expected}</td><td>${pill(r.efect)}</td><td>${r.lastFecha || '<span class="err-t">No ha enviado</span>'}</td><td>${r.invTotal}</td></tr>`).join('')}
            </tbody></table></div>
        </section>

        <section class="card">
            <h3 class="h3">Auditoría de visitas y planes de trabajo</h3>
            <div class="tbl-scroll"><table class="tbl compact"><thead><tr><th>Integrante</th><th>Rol</th><th>Visitas</th><th>PDV distintos</th><th>Cobertura</th><th>Prom./día</th><th>Planes</th><th>Cierres act.</th><th>Cierre vs plan</th></tr></thead><tbody>
            ${a.staff.map(x => `<tr><td class="l"><b>${esc(x.u.nombre)}</b><br><small class="mute">${esc(x.u.zona || '')}</small></td><td>${ROLES[x.u.rol] ? ROLES[x.u.rol].label : esc(x.u.rol)}</td><td>${x.visitas}</td><td>${x.pdv}/${x.zoneStores}</td><td>${pill(x.cobertura)}</td><td>${fmt1(x.prom)}</td><td>${x.planes}</td><td>${x.cierresAct}</td><td>${pill(x.cierreVsPlan)}</td></tr>`).join('') || '<tr><td colspan="9">Sin integrantes en el filtro.</td></tr>'}
            </tbody></table></div>
        </section>`;

        if (S.totStore && typeof Chart !== 'undefined') {
            const b = a.brandTot.filter(x => x.v > 0);
            Charts.add(new Chart($('#m4-brands'), {
                type: 'bar',
                data: { labels: b.map(x => `${x.brand} · ${Math.round(x.share * 100)}%`), datasets: [{ data: b.map(x => x.v), backgroundColor: b.map(x => BRAND_COLORS[x.brand]), borderRadius: 6 }] },
                options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { color: THEME.line }, ticks: { precision: 0 } }, y: { grid: { display: false }, ticks: { color: THEME.ink, font: { weight: '600' } } } } }
            }), 'view');
        }
        if (typeof Chart !== 'undefined') {
            const st = a.status, cv = $('#m4-status');
            if (cv) Charts.add(new Chart(cv, { type: 'doughnut', data: { labels: ['En meta', 'En riesgo', 'Críticas', 'Sin datos'], datasets: [{ data: [st.meta, st.riesgo, st.critico, st.sin], backgroundColor: [THEME.green, THEME.amber, THEME.red, THEME.line], borderWidth: 2, borderColor: '#fff' }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '66%', plugins: { legend: { display: false } } } }), 'view');
            const wc = $('#m4-weekly');
            if (wc && a.weekly.length) Charts.add(new Chart(wc, {
                type: 'bar',
                data: { labels: a.weekly.map(w => 'W' + w.wk), datasets: [{ label: 'Infinix', data: a.weekly.map(w => w.inf), backgroundColor: THEME.green, borderRadius: 6 }, { label: 'Total tienda', data: a.weekly.map(w => w.total), backgroundColor: '#CBD5E1', borderRadius: 6 }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } } }, scales: { x: { grid: { display: false } }, y: { grid: { color: THEME.line }, ticks: { precision: 0 } } } }
            }), 'view');
        }
    }

    // ------------------------------------------------------- Excel gerencial
    const XL = { green: 'FF00C853', dgreen: 'FF047857', ink: 'FF0F172A', card: 'FFF8FAFC', line: 'FFE2E8F0', white: 'FFFFFFFF', mute: 'FF64748B', lg: 'FFDCFCE7', la: 'FFFEF3C7', lr: 'FFFEE2E2', tg: 'FF166534', ta: 'FF92400E', tr: 'FF991B1B' };
    const border = { top: { style: 'thin', color: { argb: XL.line } }, left: { style: 'thin', color: { argb: XL.line } }, bottom: { style: 'thin', color: { argb: XL.line } }, right: { style: 'thin', color: { argb: XL.line } } };
    const fill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
    const semCell = (cell, ratio) => {              // semáforo estático (se ve igual en Excel, Sheets y móvil)
        if (ratio == null) return;
        const k = ratio >= 1 ? ['lg', 'tg'] : ratio >= 0.7 ? ['la', 'ta'] : ['lr', 'tr'];
        cell.fill = fill(XL[k[0]]); cell.font = { bold: true, color: { argb: XL[k[1]] }, size: 10 };
    };

    function sheetTitle(ws, title, cols) {
        const a = agg, s = me();
        ws.mergeCells(1, 1, 1, cols); ws.mergeCells(2, 1, 2, cols);
        const c1 = ws.getCell(1, 1); c1.value = `INFINIX OPSCORE · ${title}`;
        c1.font = { bold: true, size: 16, color: { argb: XL.white } }; c1.fill = fill(XL.ink); c1.alignment = { vertical: 'middle', indent: 1 };
        ws.getRow(1).height = 34;
        const c2 = ws.getCell(2, 1);
        c2.value = `Periodo ${a.f.from} a ${a.f.to} · ${a.f.zona ? 'Zona ' + a.f.zona : a.f.regional ? 'Regional ' + a.f.regional : (isAllZones() ? 'Nacional' : (myRegional() && ['coordinador', 'gerente'].includes(s.rol) ? 'Regional ' + myRegional() : 'Zona ' + (s.zona || '')))}${a.f.cadena ? ' · ' + (a.f.cadena === 'otro' ? 'Otras cadenas' : CHAINS[a.f.cadena].name) : ''} · Generado por ${s.nombre} (${ROLES[s.rol].label}) el ${todayStr()}`;
        c2.font = { size: 10, color: { argb: XL.white } }; c2.fill = fill(XL.dgreen); c2.alignment = { vertical: 'middle', indent: 1 };
        ws.getRow(2).height = 20;
        ws.views = [{ showGridLines: false }];
        ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
    }

    // Tabla con encabezado estilizado. cols: [{ h, w, fmt, sem(v,row), align, key | get(row) }]
    function table(ws, r0, title, cols, data, opts = {}) {
        let r = r0;
        ws.mergeCells(r, 1, r, cols.length);
        const t = ws.getCell(r, 1); t.value = title; t.font = { bold: true, size: 11, color: { argb: XL.ink } }; t.fill = fill(XL.lg);
        t.alignment = { vertical: 'middle', indent: 1 }; t.border = { left: { style: 'thick', color: { argb: XL.green } } }; ws.getRow(r).height = 22; r++;
        cols.forEach((c, i) => {
            const cell = ws.getCell(r, i + 1); cell.value = c.h;
            cell.font = { bold: true, size: 9, color: { argb: XL.white } }; cell.fill = fill(XL.ink);
            cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }; cell.border = border;
            const col = ws.getColumn(i + 1); col.width = Math.max(col.width || 0, c.w || 12);
        });
        ws.getRow(r).height = 30; r++;
        const first = r;
        data.forEach((row, n) => {
            cols.forEach((c, i) => {
                const cell = ws.getCell(r, i + 1), v = c.get(row, n);
                cell.value = v == null ? '—' : v; cell.border = border; cell.font = { size: 10, color: { argb: XL.ink }, bold: !!c.bold };
                cell.alignment = { vertical: 'middle', horizontal: c.align || (typeof v === 'number' ? 'center' : 'left'), wrapText: !!c.wrap };
                if (c.fmt && typeof v === 'number') cell.numFmt = c.fmt;
                if (n % 2) cell.fill = fill(XL.card);
                if (c.sem && typeof v === 'number') semCell(cell, c.sem(v, row));
                if (opts.rowStyle) opts.rowStyle(cell, row, c);
            });
            r++;
        });
        if (!data.length) { ws.mergeCells(r, 1, r, cols.length); const e = ws.getCell(r, 1); e.value = 'Sin registros en el periodo.'; e.font = { italic: true, color: { argb: XL.mute } }; r++; }
        const last = r - 1, L = i => ws.getColumn(i).letter;
        if (data.length) cols.forEach((c, i) => {      // indicadores visuales nativos de Excel
            const ref = `${L(i + 1)}${first}:${L(i + 1)}${last}`;
            if (c.bar) ws.addConditionalFormatting({ ref, rules: [{ type: 'dataBar', priority: 1, minLength: 0, maxLength: 100, gradient: false, cfvo: [{ type: 'num', value: 0 }, { type: 'max' }], color: { argb: c.bar } }] });
            if (c.icons) ws.addConditionalFormatting({ ref, rules: [{ type: 'iconSet', priority: 1, iconSet: '3TrafficLights', cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 0.7 }, { type: 'num', value: 1 }] }] });
            if (c.scale) ws.addConditionalFormatting({ ref, rules: [{ type: 'colorScale', priority: 1, cfvo: [{ type: 'min' }, { type: 'percentile', value: 50 }, { type: 'max' }], color: [{ argb: 'FFFEE2E2' }, { argb: 'FFFEF9C3' }, { argb: 'FFBBF7D0' }] }] });
        });
        return r + 1;
    }

    async function downloadExcel() {
        if (typeof ExcelJS === 'undefined') { toast('La librería de Excel no cargó. Revisa la conexión.', 'error'); return; }
        const btn = $('#m4-xlsx'); busy(btn, true);
        try {
            await load();
            const a = agg, S = a.sum, s = me();
            const wb = new ExcelJS.Workbook(); wb.creator = 'Central de Operaciones'; wb.created = new Date();
            const P = '0%', N1 = '0.0';

            // ===== 1 · Resumen ejecutivo & market share
            const w1 = wb.addWorksheet('Resumen Ejecutivo', { properties: { tabColor: { argb: XL.green } } });
            sheetTitle(w1, 'RESUMEN EJECUTIVO & MARKET SHARE', 13);
            const kpis = [['ROI PROMEDIO', S.roi, N1], ['ROI PROYECTADO', S.roiProj, N1], ['VENTA INFINIX', S.totInf, '0'], ['VENTA TOTAL PDV', S.totStore, '0'], ['MARKET SHARE', S.share, P],
                ['CUMPL. META', S.meta > 0 ? S.totInf / S.meta : null, P], ['TIENDAS REPORTANDO', `${S.reportan} de ${S.tiendas}`], ['VISITAS A PDV', S.visitas, '0']];
            kpis.forEach((k, i) => {
                const l = w1.getCell(4, 1 + i), v = w1.getCell(5, 1 + i);
                l.value = k[0]; l.font = { bold: true, size: 8, color: { argb: XL.mute } }; l.fill = fill(XL.card); l.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; l.border = border;
                v.value = k[1] == null ? '—' : k[1]; if (k[2] && typeof k[1] === 'number') v.numFmt = k[2];
                v.font = { bold: true, size: 16, color: { argb: i < 2 ? XL.dgreen : XL.ink } }; v.fill = fill(i < 2 ? XL.lg : XL.card); v.alignment = { horizontal: 'center', vertical: 'middle' }; v.border = border;
            });
            w1.getRow(4).height = 26; w1.getRow(5).height = 34;
            let r = 7;
            r = table(w1, r, 'PARTICIPACIÓN DE MERCADO · MARCAS EN LOS PDV', [
                { h: 'Pos.', w: 7, get: b => b.pos }, { h: 'Marca', w: 16, get: b => b.brand, bold: true }, { h: 'Ventas (uds)', w: 14, get: b => b.v, bar: XL.green },
                { h: '% Share', w: 12, get: b => b.share, fmt: P }, { h: 'Top 5', w: 10, get: (b, i) => i < 5 && b.v > 0 ? '★' : '' }
            ], a.brandTot, { rowStyle: (cell, b) => { if (b.brand === 'INFINIX') { cell.fill = fill(XL.lg); cell.font = { bold: true, size: 10, color: { argb: XL.tg } }; } } });
            r = table(w1, r, 'ROI PROMEDIO Y PROYECTADO POR ZONA', [
                { h: 'Regional', w: 14, get: z => z.regional || '' }, { h: 'Zona', w: 16, get: z => z.zona, bold: true }, { h: 'Tiendas', w: 9, get: z => z.tiendas }, { h: 'Reportan', w: 10, get: z => z.reportan }, { h: 'HC Infinix', w: 10, get: z => z.hc },
                { h: 'Venta Infinix', w: 13, get: z => z.inf, bar: XL.green }, { h: 'Venta tienda', w: 12, get: z => z.total }, { h: '% Share', w: 10, get: z => z.share, fmt: P },
                { h: 'Meta mes', w: 10, get: z => z.meta }, { h: '% Cumpl.', w: 10, get: z => z.cumpl, fmt: P, sem: (v, z) => z.meta > 0 ? z.proj / z.meta : null }, { h: 'ROI', w: 9, get: z => z.roi, fmt: N1, bold: true },
                { h: 'ROI proyectado', w: 12, get: z => z.roiProj, fmt: N1 }, { h: '% Cumpl. proy.', w: 12, get: z => z.meta > 0 ? z.proj / z.meta : null, fmt: P, sem: v => v }, { h: '% Disciplina', w: 12, get: z => z.efect, fmt: P, sem: v => v }
            ], a.zones);
            table(w1, r, 'ROI POR TIENDA · ORDENADO DE MAYOR A MENOR', [
                { h: '#', w: 7, get: (x, i) => i + 1 }, { h: 'Zona', w: 16, get: x => x.st.zona }, { h: 'Cadena', w: 16, get: x => x.st.cadena }, { h: 'Tienda', w: 30, get: x => x.st.tienda, bold: true },
                { h: 'HC', w: 13, get: x => x.hc }, { h: 'Venta Infinix', w: 12, get: x => x.inf, bar: XL.green }, { h: 'Venta tienda', w: 10, get: x => x.total },
                { h: '% Share', w: 10, get: x => x.share, fmt: P }, { h: 'Meta mes', w: 10, get: x => x.meta }, { h: '% Cumpl.', w: 9, get: x => x.cumpl, fmt: P, sem: (v, x) => x.cumplProj },
                { h: 'ROI', w: 12, get: x => x.roi, fmt: N1, bold: true, scale: true }, { h: 'ROI proyectado', w: 12, get: x => x.roiProj, fmt: N1 },
                { h: 'Semáforo proy.', w: 13, get: x => x.cumplProj == null ? 'Sin meta' : semaforo(x.cumplProj).label, align: 'center' }
            ], a.rows.slice().sort((x, y) => (y.roi ?? -1) - (x.roi ?? -1)), {
                rowStyle: (cell, x, c) => { if (c.h === 'Semáforo proy.' && x.cumplProj != null) semCell(cell, x.cumplProj); }
            });

            // ===== 2 · Consolidado de cierres e inventario
            const w2 = wb.addWorksheet('Cierres e Inventario', { properties: { tabColor: { argb: XL.ink } } });
            const c2 = [
                { h: 'Zona', w: 14, get: x => x.st.zona }, { h: 'Cadena', w: 16, get: x => x.st.cadena }, { h: 'Tienda', w: 30, get: x => x.st.tienda, bold: true }, { h: 'Ciudad', w: 16, get: x => x.st.ciudad },
                { h: 'Meta / presupuesto', w: 12, get: x => x.meta }, { h: 'Venta acumulada', w: 12, get: x => x.inf, bar: XL.green }, { h: '% Cumpl.', w: 10, get: x => x.cumpl, fmt: P, sem: (v, x) => x.cumplProj },
                { h: 'Accesorios', w: 11, get: x => x.acc },
                ...INFINIX_MODELS.map(m => ({ h: `Stock ${m.name}`, w: 10, get: x => int(x.inv[m.key]), sem: v => v === 0 ? 0 : null })),
                { h: 'Stock total', w: 10, get: x => x.invTotal, bold: true },
                { h: 'Días hábiles del mes / periodo', w: 11, get: x => x.expected }, { h: 'Cierres reportados', w: 11, get: x => x.cierres },
                { h: '% Efectividad de reporte', w: 13, get: x => x.efect, fmt: P, sem: v => v, icons: true },
                { h: 'Último cierre', w: 12, get: x => x.lastFecha || 'No ha enviado', align: 'center' },
                { h: 'Disciplina', w: 13, get: x => x.efect == null ? '—' : x.efect >= 1 ? 'Al día' : x.efect >= 0.7 ? 'Con faltantes' : 'Crítica', align: 'center' }
            ];
            sheetTitle(w2, 'CONSOLIDADO DE CIERRES, INVENTARIO Y DISCIPLINA OPERATIVA', c2.length);
            table(w2, 4, `CIERRES E INVENTARIO POR TIENDA · HASTA ${a.bizDays} DÍA(S) EXIGIBLE(S) EN EL PERIODO`, c2, a.rows.slice().sort((x, y) => (x.st.zona + x.st.tienda).localeCompare(y.st.zona + y.st.tienda, 'es')));
            w2.views = [{ state: 'frozen', xSplit: 3, ySplit: 5, showGridLines: false }];

            // ===== 3 · Auditoría de visitas y planes (trazabilidad jerárquica)
            const w3 = wb.addWorksheet('Visitas y Planes', { properties: { tabColor: { argb: XL.dgreen } } });
            sheetTitle(w3, 'AUDITORÍA DE VISITAS Y PLANES DE TRABAJO', 15);
            const rolL = x => ROLES[x] ? ROLES[x].label : x;
            r = table(w3, 4, 'GESTIÓN POR INTEGRANTE · COBERTURA, FRECUENCIA Y CUMPLIMIENTO DE PLANES', [
                { h: 'Rol', w: 14, get: x => rolL(x.u.rol) }, { h: 'Nombre', w: 30, get: x => x.u.nombre, bold: true }, { h: 'Zona', w: 32, get: x => x.u.zona },
                { h: 'Visitas realizadas', w: 13, get: x => x.visitas, bar: XL.green }, { h: 'PDV distintos', w: 13, get: x => x.pdv }, { h: 'PDV de la zona', w: 12, get: x => x.zoneStores },
                { h: '% Cobertura de zona', w: 12, get: x => x.cobertura, fmt: P, sem: v => v, icons: true }, { h: 'Visitas repetidas', w: 11, get: x => x.repetidas },
                { h: 'Prom. visitas / día', w: 11, get: x => +x.prom.toFixed(1), fmt: N1 }, { h: 'Planes enviados (mañana)', w: 12, get: x => x.planes },
                { h: 'Cierres enviados (noche)', w: 12, get: x => x.cierresAct }, { h: '% Cierre vs. plan', w: 11, get: x => x.cierreVsPlan, fmt: P, sem: v => v },
                { h: 'Tiendas planeadas', w: 11, get: x => x.planeadas }, { h: 'Días hábiles', w: 10, get: x => x.expPlan }, { h: '% Planes vs. días hábiles', w: 12, get: x => x.planEfect, fmt: P, sem: v => v }
            ], a.staff);
            const freqRows = a.staff.flatMap(x => Object.values(x.freq).map(f => ({ x, f }))).sort((p, q) => q.f.n - p.f.n);
            table(w3, r, 'FRECUENCIA DE VISITA POR PDV · CUÁNTAS VECES SE REPITIÓ CADA TIENDA', [
                { h: 'Rol', w: 14, get: o => rolL(o.x.u.rol) }, { h: 'Integrante', w: 30, get: o => o.x.u.nombre }, { h: 'Tienda', w: 32, get: o => o.f.tienda, bold: true },
                { h: 'Veces visitada', w: 13, get: o => o.f.n, bar: XL.green }, { h: 'Última visita', w: 13, get: o => o.f.last, align: 'center' }, { h: 'Zona', w: 12, get: o => o.x.u.zona }
            ], freqRows);
            w3.views = [{ state: 'frozen', xSplit: 2, ySplit: 2, showGridLines: false }];

            // ===== Anexo A · Detalle de visitas
            const w4 = wb.addWorksheet('Detalle Visitas');
            sheetTitle(w4, 'ANEXO · DETALLE DE VISITAS A PDV', 12);
            table(w4, 4, 'REPORTES DE VISITA DEL PERIODO', [
                { h: 'Fecha', w: 12, get: v => v.fecha, align: 'center' }, { h: 'Integrante', w: 28, get: v => v.nombre }, { h: 'Rol', w: 14, get: v => rolL(v.rol) },
                { h: 'Modo', w: 13, get: v => v.modo === 'formador' ? 'Formación' : 'Supervisión' }, { h: 'Tienda', w: 30, get: v => v.tienda, bold: true },
                { h: 'ROI', w: 9, get: v => v.roi, fmt: N1 }, { h: 'ROI proy.', w: 10, get: v => v.roiProj, fmt: N1 }, { h: '% Cumpl. mes', w: 11, get: v => v.cumplMes, fmt: P, sem: x => x },
                { h: 'Eval. promedio', w: 11, get: v => v.evalPromedio }, { h: 'Gestión lograda', w: 40, get: v => (v.form && v.form.gestion) || '', wrap: true },
                { h: 'Alertas', w: 34, get: v => (v.form && v.form.alertas) || '', wrap: true }, { h: 'Compromisos', w: 34, get: v => (v.form && v.form.compromisos) || '', wrap: true }
            ], a.visits.slice().sort((p, q) => p.fecha < q.fecha ? 1 : -1));

            // ===== Anexo B · Planes de la mañana vs. cierres de la noche
            const w5 = wb.addWorksheet('Detalle Planes');
            sheetTitle(w5, 'ANEXO · PLANES DE TRABAJO VS. CIERRES DE ACTIVIDADES', 12);
            const planRows = a.plans.flatMap(p => (p.stores || []).map(st => ({ p, st }))).sort((x, y) => x.p.fecha < y.p.fecha ? 1 : -1);
            table(w5, 4, 'PLAN DE LA MAÑANA VS. CIERRE DE LA NOCHE POR TIENDA', [
                { h: 'Fecha', w: 12, get: o => o.p.fecha, align: 'center' }, { h: 'Integrante', w: 28, get: o => o.p.nombre }, { h: 'Rol', w: 14, get: o => rolL(o.p.rol) },
                { h: 'Tienda', w: 30, get: o => o.st.tienda, bold: true }, { h: 'Foco de la visita', w: 36, get: o => o.st.foco || '', wrap: true },
                { h: 'Asesores a trabajar', w: 34, get: o => (o.st.asesores || []).map(x => x.nombre).join(', '), wrap: true },
                { h: 'Plan enviado', w: 10, get: o => o.p.planSentAt ? 'Sí' : 'No', align: 'center' }, { h: 'Cierre enviado', w: 10, get: o => o.p.cierreSentAt ? 'Sí' : 'No', align: 'center' },
                { h: 'Compromiso (uds)', w: 12, get: o => int(o.st.compromisoUnd) }, { h: 'Vendidas en visita', w: 12, get: o => o.p.cierreSentAt ? int(o.st.undVisita) : null },
                { h: '% Logro', w: 10, get: o => o.p.cierreSentAt && o.st.compromisoUnd > 0 ? int(o.st.undVisita) / o.st.compromisoUnd : null, fmt: P, sem: v => v },
                { h: 'Acciones cumplidas', w: 12, get: o => { const ac = (o.st.acciones || []).filter(x => x && x.trim()).length; return `${o.p.cierreSentAt ? (o.st.estados || []).filter(e => e === 'ok').length : 0} de ${ac}`; }, align: 'center' },
                { h: 'Compromiso', w: 14, get: o => ({ si: 'Cumplido', parcial: 'Parcial', no: 'No cumplido' })[o.st.compromisoOk] || 'Sin calificar', align: 'center' }
            ], planRows);

            // ===== Anexo C · Plan por asesor: trazabilidad completa (cumplimiento, rezago de inventario, evaluación, temas y compromiso)
            const advRows = a.plans.flatMap(p => (p.stores || []).flatMap(st => (st.asesores || []).map(ad => ({ p, st, ad })))).sort((x, y) => x.p.fecha < y.p.fecha ? 1 : -1);
            if (advRows.length) {
                const w6 = wb.addWorksheet('Plan por Asesor');
                sheetTitle(w6, 'ANEXO · PLAN DE TRABAJO POR ASESOR (DIAGNÓSTICO AUTOMÁTICO)', 24);
                const NV = { critica: 'Crítica', alta: 'Alta', media: 'Media', baja: 'Sin alerta', sin_meta: 'Sin meta' };
                table(w6, 4, 'ASESORES TRABAJADOS EN LAS VISITAS', [
                    { h: 'Fecha', w: 12, get: o => o.p.fecha, align: 'center' }, { h: 'Integrante', w: 26, get: o => o.p.nombre }, { h: 'Zona', w: 18, get: o => o.st.zona || o.p.zona },
                    { h: 'Cadena', w: 14, get: o => o.st.cadena || '' }, { h: 'Tienda', w: 30, get: o => o.st.tienda, bold: true },
                    { h: 'Asesor', w: 30, get: o => o.ad.nombre, bold: true }, { h: 'Cédula', w: 14, get: o => o.ad.cedula || '' },
                    { h: 'Corte de la data', w: 12, get: o => o.ad.corte || '', align: 'center' },
                    { h: 'Meta asesor (uds)', w: 11, get: o => int(o.ad.meta) }, { h: 'Venta (uds)', w: 10, get: o => int(o.ad.venta) },
                    { h: '% Cumplimiento', w: 12, get: o => o.ad.cumpl, fmt: P, sem: v => v },
                    { h: 'Esperado a la fecha', w: 12, get: o => o.ad.esperado, fmt: P },
                    { h: 'Prioridad', w: 12, get: o => NV[o.ad.nivel] || o.ad.nivel, align: 'center' },
                    { h: 'Stock foco sin rotar (uds)', w: 13, get: o => int(o.ad.stockFoco) },
                    { h: 'Referencias en rezago', w: 38, get: o => (o.ad.rezagos || []).map(m => `${m.name}: ${m.inv} en PDV, vendió ${m.vendidas}`).join('; '), wrap: true },
                    { h: 'Nota evaluación', w: 11, get: o => o.ad.nota, align: 'center' }, { h: 'Semana eval.', w: 10, get: o => o.ad.semanaEval || '', align: 'center' },
                    { h: 'Temas débiles (evaluación)', w: 30, get: o => (o.ad.temasDebiles || []).join('; '), wrap: true },
                    { h: 'Temas a trabajar', w: 44, get: o => (o.ad.temas || []).join('; '), wrap: true },
                    { h: 'Compromiso sugerido', w: 40, get: o => o.ad.compromisoTxt || '', wrap: true },
                    { h: 'Compromiso del día en la tienda (uds)', w: 14, get: o => int(o.st.compromisoUnd) },
                    { h: 'Vendidas en visita', w: 12, get: o => o.p.cierreSentAt ? int(o.st.undVisita) : null },
                    { h: 'Compromiso', w: 14, get: o => ({ si: 'Cumplido', parcial: 'Parcial', no: 'No cumplido' })[o.st.compromisoOk] || 'Sin calificar', align: 'center' }
                ], advRows);
            }

            const buf = await wb.xlsx.writeBuffer();
            const scope = isOwn() ? `${ROLES[s.rol].label}_${slug(s.nombre)}` : a.f.zona ? `Consolidado_Zona_${slug(a.f.zona)}` : a.f.regional ? `Consolidado_Regional_${slug(a.f.regional)}` : s.rol === 'coordinador' && myRegional() ? `Consolidado_Regional_${slug(myRegional())}` : 'Consolidado_Nacional';
            if (await downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Informe_Gerencial_${scope}_${a.f.from}_a_${a.f.to}.xlsx`)) toast('Informe gerencial descargado', 'ok');
        } catch (e) { console.error(e); toast('No se pudo generar el Excel: ' + (e.message || e), 'error'); }
        finally { busy(btn, false); btn.innerHTML = '⬇️ Descargar Informe Gerencial (.xlsx)'; }
    }

    return { render, onData: () => { if ($('#f-tienda')) fillDependents(); } };
})());


// ----------------------------------------------------------------------------
// LIENZO · INFORME GERENCIAL VISUAL (1200 px)
// ----------------------------------------------------------------------------
function buildM4Visual(stage, a, scope, autor) {
    const S = a.sum, dash = '—', pc = v => v == null ? dash : Math.round(v * 100) + '%';
    const cumpl = S.meta > 0 ? S.totInf / S.meta : null, cp = S.meta > 0 ? S.proj / S.meta : null;
    const col = v => v == null ? '#94A3B8' : v >= 1 ? '#16A34A' : v >= .7 ? '#F59E0B' : '#DC2626';
    const hbar = (label, v, max, txt, color, logo) => `<div class="gv-hb"><span>${logo || ''}${esc(label)}</span><div class="gv-track"><div style="width:${max > 0 ? Math.min(100, v / max * 100) : 0}%;background:${color}"></div></div><b>${txt}</b></div>`;
    const brands = a.brandTot.filter(x => x.v > 0), comp = brands.filter(x => x.brand !== 'INFINIX').length;
    const st = a.status, stK = [['meta', 'En meta', '#16A34A'], ['riesgo', 'En riesgo', '#F59E0B'], ['critico', 'Críticas', '#DC2626'], ['sin', 'Sin meta', '#CBD5E1']].filter(([k]) => st[k]);
    const maxCh = Math.max(1, ...a.chains.map(c => Math.max(c.cumplProj || 0, 1)));
    const maxM = Math.max(1, ...a.models.map(m => Math.max(m.v, m.meta)));
    const maxW = Math.max(1, ...a.weekly.map(w => w.inf));
    const el = document.createElement('div');
    el.className = 'rp gv';
    el.innerHTML = `<div class="rp-bar"></div>
    <header class="rp-head"><img class="rp-logo" src="${LOGO_INFINIX}" alt="Infinix"><div class="rp-head-mid"><div class="rp-kicker">INFORME GERENCIAL</div><div class="rp-title">${esc(scope.toUpperCase())}</div>
        <div class="rp-sub">${esc(fechaLarga(a.f.from))} a ${esc(fechaLarga(a.toEff))}${S.dcrN ? ` · venta Infinix de la data DCR (corte ${esc(S.corteDCR)})` : ' · venta de los cierres diarios'}</div></div></header>
    <div class="gv-pad">
    <div class="gv-kpis">
        <div><span>Venta Infinix</span><b>${S.totInf}</b><em>meta ${S.meta || dash}</em></div>
        <div><span>Cumplimiento</span><b style="color:${col(cp)}">${pc(cumpl)}</b><em>proyección ${pc(cp)}</em></div>
        <div><span>Proyección</span><b>${S.proj}</b><em>uds al cierre</em></div>
        <div><span>ROI</span><b>${S.roi == null ? dash : fmt1(S.roi)}</b><em>proy. ${S.roiProj == null ? dash : fmt1(S.roiProj)}</em></div>
        <div><span>Visitas</span><b>${S.visitas}</b><em>planes ${S.planes} · cierres ${S.cierresAct}</em></div>
        <div><span>Tiendas</span><b>${S.tiendas}</b><em>${S.reportan} con cierres</em></div>
    </div>
    <div class="gv-grid">
        <section class="gv-card"><h4>🏬 Estado de las tiendas</h4><div class="gv-donut">${ringCardHTML('gv-st', 190, S.tiendas, 'tiendas')}<div class="gv-leg">${stK.map(([k, l, c]) => `<div><i style="background:${c}"></i>${l}<b>${st[k]}</b></div>`).join('')}</div></div></section>
        <section class="gv-card"><h4>📊 Participación por marca</h4>${comp ? `<div class="gv-donut">${ringCardHTML('gv-br', 190, pc(S.share), 'Infinix')}<div class="gv-leg">${brands.slice(0, 7).map(x => `<div><i style="background:${BRAND_COLORS[x.brand] || '#94A3B8'}"></i>${esc(x.brand)}<b>${pc(x.share)}</b></div>`).join('')}</div></div>` : `<p class="gv-empty">Aún no hay venta de la competencia registrada (se digita a mano en los cierres diarios).</p>`}</section>
        <section class="gv-card"><h4>🔗 Cumplimiento proyectado por cadena</h4>${a.chains.map(c => hbar(c.name, c.cumplProj || 0, maxCh, `${pc(c.cumplProj)} <small>${c.inf}/${c.meta || dash}</small>`, col(c.cumplProj), chainLogo(c.key, '', 'xs') + ' ')).join('')}</section>
        <section class="gv-card"><h4>📦 Referencias · venta vs. target</h4>${a.models.filter(m => m.v || m.meta).map(m => `<div class="gv-hb"><span>${esc(m.name)}</span><div class="gv-track two"><div style="width:${m.meta / maxM * 100}%;background:#E2E8F0"></div><div style="width:${m.v / maxM * 100}%;background:#00C853"></div></div><b>${m.v} <small>/ ${m.meta || dash}</small></b></div>`).join('')}</section>
        ${a.weekly.length ? `<section class="gv-card"><h4>📅 Venta semanal</h4><div class="gv-cols">${a.weekly.map(w => `<div><b>${w.inf}</b><div class="gv-col" style="height:${Math.max(4, w.inf / maxW * 120)}px"></div><small>W${w.wk}</small></div>`).join('')}</div></section>` : ''}
        ${a.zones.length > 1 ? `<section class="gv-card"><h4>🗺️ Cumplimiento proyectado por zona</h4>${a.zones.map(z => hbar(z.zona, z.meta > 0 ? z.proj / z.meta : 0, Math.max(1, ...a.zones.map(x => x.meta > 0 ? x.proj / x.meta : 0)), pc(z.meta > 0 ? z.proj / z.meta : null), col(z.meta > 0 ? z.proj / z.meta : null))).join('')}</section>` : ''}
        ${a.staff.length ? `<section class="gv-card wide"><h4>👥 Gestión del equipo</h4><table class="fa-tbl"><thead><tr><th class="l">Integrante</th><th>Cargo</th><th>Visitas</th><th>Cobertura</th><th>Planes</th><th>Cierres</th></tr></thead><tbody>${a.staff.map(x => `<tr><td class="l"><b>${esc(x.u.nombre)}</b></td><td>${ROLES[x.u.rol] ? ROLES[x.u.rol].label : esc(x.u.rol)}</td><td><b>${x.visitas}</b></td><td>${pc(x.cobertura)}</td><td>${x.planes}</td><td>${x.cierresAct}</td></tr>`).join('')}</tbody></table></section>` : ''}
    </div></div>
    <footer class="rp-foot"><span>Proyección = venta ÷ días transcurridos × días del mes · ROI = venta ÷ HC${autor ? ` · Generado por ${esc(autor.nombre)}` : ''}</span><b>Infinix · Central de Operaciones</b></footer><div class="rp-bar"></div>`;
    stage.appendChild(el);
    if (stK.length) Charts.ring($('#gv-st', el), stK.map(([k]) => st[k]), stK.map(x => x[2]), { cutout: '68%', gap: true });
    if (comp) Charts.ring($('#gv-br', el), brands.map(x => x.v), brands.map(x => BRAND_COLORS[x.brand] || '#94A3B8'), { cutout: '68%', gap: true });
    return el;
}

// ============================================================================
// MÓDULO 2 · PLAN DE TRABAJO (MAÑANA) Y CIERRE DE ACTIVIDADES (NOCHE)
// Lo más automático posible: al elegir la tienda se arrastran meta, venta,
// share, inventario y ROI desde los cierres diarios y desde lo ya guardado.
// A mano solo va lo del día: unidades de la semana, foco, acciones y compromiso.
// En la noche: chulitos por acción y las unidades vendidas; el "¿se cumplió?" sale solo.
// ============================================================================

registerModule('m2', (() => {
    const MAX = 5;
    let fecha = todayStr(), fase = 'plan', rows = [], planDoc = null, comps = {}, pendingIds = null;
    const SEMC = () => Advisor.SEM;
    const me = () => State.session;
    const docId = () => `${me().userId}_${fecha}`;
    const ym = () => fecha.slice(0, 7);

    const blankRow = st => ({
        storeId: st.id, tienda: st.tienda, ciudad: st.ciudad || '', cadena: st.cadena || '', logoKey: normLogoKey(st.logoKey), zona: st.zona || '',
        auto: false, corte: '', hc: int(st.hc && st.hc.INFINIX) || 1,
        metaMes: storeMetaMes(st), ventaMes: 0, ventaSemana: 0, shareSem: 0, invTotal: storeInvTotal(st), roi: 0, roiProj: 0,
        focoRef: 'note-edge', focoMeta: 0, focoVenta: 0, focoInv: 0,
        foco: PLAN_FOCOS[0], acciones: ['', '', ''], impactos: ['', '', ''], compromisoUnd: 0,
        estados: ['', '', ''], undVisita: 0, compromisoOk: '',
        asesores: [], focoAuto: false          // asesores a trabajar en la visita (diagnóstico arrastrado de la data, el inventario y las evaluaciones)
    });

    // ROI y proyección: siempre calculados, nunca digitados
    function derive(r) {
        const dim = daysInMonth(ym()), hc = r.hc || 1;
        const day = r.auto && r.corte ? parseD(r.corte).getDate() : Math.max(1, parseD(fecha).getDate() - 1);
        r.roi = +(int(r.ventaMes) / hc).toFixed(1);
        r.roiProj = +((int(r.ventaMes) / day * dim) / hc).toFixed(1);
    }

    function render(view) {
        fecha = todayStr(); fase = new Date().getHours() >= 15 ? 'cierre' : 'plan';
        view.innerHTML = `
        <section class="card">
            <div class="row between wrap">
                <div><h2 class="h2">Plan de trabajo y cierre de actividades</h2><p class="mute">${esc(me().nombre)} · ${ROLES[me().rol].label} · Zona ${esc(me().zona || '')}</p></div>
                <label class="field-inline"><span class="lbl">Fecha</span><input type="date" id="m2-fecha" class="input" value="${fecha}"></label>
            </div>
            <div class="seg" style="margin-top:12px">
                <button class="seg-btn" data-fase="plan">☀️ Plan de trabajo · 7:30 a. m.</button>
                <button class="seg-btn" data-fase="cierre">🌙 Cierre de actividades · 8:00 p. m.</button>
            </div>
            <p class="hint" id="m2-status"></p>
            <div class="row wrap" style="margin-top:10px">
                <select id="m2-store" class="input grow"></select>
                <button class="btn btn-dark" id="m2-add">➕ Agregar tienda</button>
            </div>
        </section>
        <div id="m2-rows"></div>
        <datalist id="dl-acc">${PLAN_ACCIONES.map(a => `<option value="${esc(a)}">`).join('')}</datalist>
        <datalist id="dl-imp">${PLAN_IMPACTOS.map(a => `<option value="${esc(a)}">`).join('')}</datalist>
        <datalist id="dl-foco">${PLAN_FOCOS.map(a => `<option value="${esc(a)}">`).join('')}</datalist>
        ${actionBarHTML()}`;

        $$('[data-fase]', view).forEach(b => b.onclick = () => { fase = b.dataset.fase; paint(); });
        $('#m2-fecha').onchange = e => { fecha = e.target.value || todayStr(); load(); };
        $('#m2-add').onclick = addStore;
        const box = $('#m2-rows');
        box.addEventListener('input', onInput); box.addEventListener('change', onInput);
        box.addEventListener('change', e => {
            const t = e.target; if (t.dataset.advpick === undefined) return;
            const r = rows[int(t.dataset.advpick)]; if (!r) return;
            if (t.checked) { const nm = (Advisor.byId(t.value) || {}).nombre; if (nm) addAdvisor(r, nm); } else removeAdvisor(r, t.value);
            paintRows();
        });
        box.addEventListener('click', e => {
            const fb = e.target.closest('[data-ficha]'); if (fb) { openAdvisorFicha(fb.dataset.ficha); return; }
            const del = e.target.closest('[data-del]'); if (del) { rows.splice(int(del.dataset.del), 1); paint(); return; }
            const st = e.target.closest('[data-est]');
            if (st) { const [i, j] = st.dataset.est.split('-').map(Number); rows[i].estados[j] = st.dataset.v; paintRows(); }
        });

        ReportActions.bind(view, {
            title: 'Plan de trabajo · Central de Operaciones',
            validate: () => !rows.length ? 'Agrega al menos una tienda a visitar.' : rows.some(r => !r.acciones.some(a => a.trim())) ? 'Cada tienda necesita al menos una acción.' : null,
            filename: () => `${fase === 'plan' ? 'Plan' : 'CierreActividades'}_${slug(me().nombre)}_${fecha}.png`,
            build: stage => buildPlanCanvas(stage, buildDoc(), fase),
            persist
        });
        load();
    }

    function fillStoreSelect() {
        const sel = $('#m2-store'); if (!sel) return;
        const used = rows.map(r => r.storeId);
        sel.innerHTML = '<option value="">Selecciona una tienda de tu zona…</option>' + scopedStores().filter(s => !used.includes(s.id))
            .map(s => `<option value="${esc(s.id)}">${esc(s.tienda)} · ${esc(s.ciudad || '')}</option>`).join('');
    }

    async function load() {
        planDoc = await Data.get(COL.plans, docId());
        if (!$('#m2-rows')) return;
        rows = planDoc && planDoc.stores ? JSON.parse(JSON.stringify(planDoc.stores)) : [];
        rows.forEach(r => { r.asesores = r.asesores || []; });
        await attachVisits();
        if (planDoc && planDoc.planSentAt && fecha === todayStr() && new Date().getHours() >= 15) fase = 'cierre';
        paint();
        if (pendingIds) {                                   // viene del Análisis de zona: tiendas (y asesores) elegidos con la data real
            const items = pendingIds; pendingIds = null; fase = 'plan';
            if (typeof Evals !== 'undefined') await Evals.ensureLoaded([...new Set(items.map(x => (storeById(x.storeId) || {}).zona).filter(Boolean))]);
            let nAdv = 0, nSt = 0;
            for (const it of items) {
                const have = rows.find(r => r.storeId === it.storeId);
                if (!have && rows.length >= MAX) continue;
                const r = have || await addStoreById(it.storeId); if (!have) nSt++;
                for (const nm of (it.asesores || [])) if (r && addAdvisor(r, nm)) nAdv++;
            }
            paint();
            if (nSt || nAdv) toast(`${nSt} PDV${nAdv ? ` y ${nAdv} asesor(es)` : ''} cargados con la data real. Revisa las acciones sugeridas y ajusta el compromiso.`, 'ok', 6000);
        }
    }
    // Las visitas guardadas hoy (Visita PDV) pasan solas al cierre: agregan la tienda si no estaba en el plan,
    // traen lo ejecutado, la gestión, las ventas del día y las miniaturas de las fotos.
    async function attachVisits() {
        let vis = [];
        try { vis = (await Data.list(COL.visits, [['fecha', '==', fecha]])).filter(v => v.userId === me().userId); } catch (e) { vis = []; }
        for (const v of vis.sort((a, b) => (a.savedAt || a.updatedAt || 0) - (b.savedAt || b.updatedAt || 0))) {
            let r = rows.find(x => x.storeId === v.storeId);
            if (!r && rows.length < MAX && storeById(v.storeId)) { r = await addStoreById(v.storeId); if (r) r.fromVisit = true; }
            if (!r) continue;
            r.visita = { at: v.savedAt || v.updatedAt || 0, ejecutado: v.ejecutado || [], gestion: (v.form && v.form.gestion) || '', compromisos: (v.form && v.form.compromisos) || '', ventaDia: int(v.ventaDia != null ? v.ventaDia : v.form && v.form.ventaDia), fotos: (v.fotosMini || []).slice(0, 3), evalPromedio: v.evalPromedio, evalRealizadas: v.evalRealizadas || 0 };
            if (!int(r.undVisita) && r.visita.ventaDia) r.undVisita = r.visita.ventaDia;
            if (r.fromVisit && !r.acciones.some(a => a && a.trim())) r.acciones = [0, 1, 2].map(j => r.visita.ejecutado[j] || '');
            if (r.fromVisit && r.acciones.some(Boolean) && !r.estados.some(Boolean)) r.estados = r.acciones.map(a => a ? 'ok' : '');
        }
    }
    const visitHTML = r => !r.visita ? '' : `<div class="vis-box"><div class="row between wrap"><b>📸 Visita registrada${r.visita.at ? ' a las ' + new Date(r.visita.at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : ''}</b>${r.fromVisit ? '<i class="pill">Agregada desde la visita</i>' : ''}</div>
        ${r.visita.ejecutado.length ? `<div class="pa-temas">${r.visita.ejecutado.map(x => `<span>✔ ${esc(x)}</span>`).join('')}</div>` : ''}
        ${r.visita.gestion ? `<p class="pa-line"><b>Gestión:</b> ${esc(r.visita.gestion)}</p>` : ''}${r.visita.compromisos ? `<p class="pa-line"><b>Compromisos:</b> ${esc(r.visita.compromisos)}</p>` : ''}
        ${r.visita.fotos.length ? `<div class="vis-fotos">${r.visita.fotos.map(f => `<img src="${f}" alt="Evidencia">`).join('')}</div>` : ''}</div>`;
    // Lo llama el Análisis de zona antes de navegar aquí
    function prefill(items) { pendingIds = items.map(x => typeof x === 'string' ? { storeId: x, asesores: [] } : x); }

    function paint() {
        $$('[data-fase]').forEach(b => b.classList.toggle('active', b.dataset.fase === fase));
        const t = ts => new Date(ts).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
        $('#m2-status').textContent = !planDoc ? 'Aún no hay plan registrado para esta fecha.'
            : `Plan enviado ${planDoc.planSentAt ? 'a las ' + t(planDoc.planSentAt) : '—'} · Cierre ${planDoc.cierreSentAt ? 'enviado a las ' + t(planDoc.cierreSentAt) : 'pendiente'}`;
        fillStoreSelect(); paintRows();
    }

    // Al agregar la tienda se arrastra todo lo que ya existe: cierres diarios, metas e inventario
    async function addStore() {
        const id = $('#m2-store').value; if (!id) { toast('Selecciona una tienda.', 'warn'); return; }
        if (rows.length >= MAX) { toast(`Máximo ${MAX} tiendas por día.`, 'warn'); return; }
        await addStoreById(id);
    }
    async function addStoreById(id) {
        const st = storeById(id); if (!st) return;
        const row = blankRow(st);
        rows.push(row); paint();
        const cl = await fetchStoreClosures(id, fecha);
        const last = cl.filter(c => c.storeId === id && c.fecha <= fecha && c.fecha.slice(0, 7) === ym()).map(c => c.fecha).sort().pop();
        if (last) {
            const c = computeStore(st, cl, last); comps[id] = c;
            Object.assign(row, { auto: true, corte: last, ventaMes: c.infMes, ventaSemana: c.infSem, shareSem: c.shareSem, invTotal: c.invTotal, hc: c.hcInf || 1 });
        } else if (st.manual && st.manual.month === ym()) {          // sin cierres: se retoma lo último que se escribió
            Object.assign(row, { ventaMes: int(st.manual.ventaMes), ventaSemana: int(st.manual.ventaSemana) });
        }
        const foco = INFINIX_MODELS.map(m => ({ key: m.key, meta: int(st.metas && st.metas[m.key]) })).sort((a, b) => b.meta - a.meta)[0];
        if (foco && foco.meta > 0) row.focoRef = foco.key;
        // Data de zona (venta real por tienda): manda sobre los cierres si es más reciente o si no hay cierres
        const Z = typeof ZoneData !== 'undefined' ? ZoneData.forStore(id) : null;
        if (Z && Z.month === ym() && (!last || Z.corte >= last)) {
            Object.assign(row, { auto: true, corte: Z.corte, src: 'data', ventaMes: int(Z.total), ventaSemana: int((Z.sem || {})['W' + isoWeek(Z.corte || fecha)]), hc: +(st.hc && st.hc.INFINIX) || row.hc });
            const gap = INFINIX_MODELS.map(m => ({ key: m.key, gap: int(st.metas && st.metas[m.key]) - int(Z.ventas[m.key]) })).sort((a, b) => b.gap - a.gap)[0];
            if (gap && gap.gap > 0) row.focoRef = gap.key;
        }
        // Foco fijado a mano en la configuración de la tienda (cambia semana a semana) y evaluaciones pendientes del formador
        if (st.foco && st.foco.ref) row.focoRef = st.foco.ref;
        if (st.foco && st.foco.nota && !row.foco.trim()) row.foco = st.foco.nota;
        if (typeof Evals !== 'undefined') { const ev = Evals.pendingFor(id); if (ev) row.evals = { week: ev.week, pendientes: ev.pendientes, hechas: ev.hechas.length, prom: ev.prom }; }
        applyFoco(row); derive(row);
        if ($('#m2-rows')) paintRows();
        return row;
    }
    // ---- Asesores a trabajar: al marcarlos se pre-llenan foco, acciones, impactos y compromiso (solo en espacios vacíos)
    const putEmpty = (arr, texts, used) => texts.forEach(tx => { const j = arr.findIndex(x => !String(x || '').trim()); if (j >= 0) { arr[j] = tx; used.push(tx); } });
    function addAdvisor(row, nombre) {
        const D = Advisor.byId(`${row.storeId}|${slug(nombre)}`); if (!D) return false;
        if (row.asesores.some(a => a.id === D.id)) return false;
        const pe = Advisor.planEntry(D), F = Advisor.planFill(D);
        pe.gen = { acciones: [], impactos: [] };
        putEmpty(row.acciones, F.acciones, pe.gen.acciones); putEmpty(row.impactos, F.impactos, pe.gen.impactos);
        if (!row.asesores.length && (!String(row.foco || '').trim() || row.foco === PLAN_FOCOS[0] || row.focoAuto)) { row.foco = F.foco; row.focoAuto = true; }
        else if (row.focoAuto && row.foco.length < 100) row.foco = (row.foco + ' | ' + F.foco).slice(0, 160);
        pe.compGen = F.compromiso; row.compromisoUnd = int(row.compromisoUnd) + F.compromiso;
        if (D.inventario.rezagos[0] && !row.asesores.length) { row.focoRef = D.inventario.rezagos[0].key; applyFoco(row); }
        row.asesores.push(pe);
        return true;
    }
    function removeAdvisor(row, id) {
        const pe = row.asesores.find(a => a.id === id); if (!pe) return;
        (pe.gen && pe.gen.acciones || []).forEach(tx => { const j = row.acciones.indexOf(tx); if (j >= 0) row.acciones[j] = ''; });
        (pe.gen && pe.gen.impactos || []).forEach(tx => { const j = row.impactos.indexOf(tx); if (j >= 0) row.impactos[j] = ''; });
        row.compromisoUnd = Math.max(0, int(row.compromisoUnd) - int(pe.compGen));
        row.asesores = row.asesores.filter(a => a.id !== id);
        if (!row.asesores.length && row.focoAuto) { row.foco = PLAN_FOCOS[0]; row.focoAuto = false; }
    }
    // Bloque visual: chips de asesores del PDV (semáforo + % cumplimiento) y el resumen de lo arrastrado
    function advisorsHTML(i) {
        const r = rows[i], st = storeById(r.storeId); if (!st) return '';
        const list = Advisor.forStore(st).filter(d => !d.sinData || r.asesores.some(a => a.id === d.id)); if (!list.length) return '';
        const S = SEMC(), pc = Advisor.pc;
        return `<div class="pa-box">
            <label class="lbl">👤 Asesores a trabajar en la visita <small class="mute">· al marcarlos se pre-llenan foco, acciones, impacto y compromiso desde su venta, el inventario del PDV y su evaluación</small></label>
            <div class="chips">${list.map(d => `<label class="chip adv-pick"><input type="checkbox" data-advpick="${i}" value="${esc(d.id)}" ${r.asesores.some(a => a.id === d.id) ? 'checked' : ''}><span><i class="rd-dot" style="background:${S[d.prescripcion.semaforo].color}"></i>${esc(d.nombre)} <small>${pc(d.pacing.cumpl)}</small></span></label>`).join('')}</div>
            ${r.asesores.map(a => { const c = S[a.semaforo] || S.gris; return `<div class="pa-item" style="border-left-color:${c.color}"><div class="row between wrap" style="gap:6px"><b>${esc(a.nombre)}</b><button type="button" class="btn btn-ghost sm" data-ficha="${esc(a.id)}">📄 Ficha</button></div>
                <div class="pa-line">Cumplimiento <b>${pc(a.cumpl)}</b> (${a.venta} de ${a.meta || '—'} uds) · día ${a.day}/${a.dim}, esperado ${pc(a.esperado)}${a.stockFoco ? ` · <b>${a.stockFoco} uds foco sin rotar</b>: ${esc(a.rezagos.map(m => `${m.name} ×${m.inv}`).join(', '))}` : ''}${a.nota != null ? ` · eval. ${a.nota}${a.semanaEval ? ' (' + esc(a.semanaEval) + ')' : ''}` : ''}</div>
                ${a.temas.length ? `<div class="pa-temas">${a.temas.map(x => `<span>${esc(x)}</span>`).join('')}</div>` : ''}
                ${a.compromisoTxt ? `<div class="pa-line mute">Compromiso sugerido: ${esc(a.compromisoTxt)}</div>` : ''}</div>`; }).join('')}
        </div>`;
    }
    function applyFoco(row) {
        const c = comps[row.storeId], st = storeById(row.storeId) || {};
        const m = c && c.models.find(x => x.key === row.focoRef);
        row.focoMeta = int(st.metas && st.metas[row.focoRef]);
        row.focoInv = m ? m.inv : int(st.inventario && st.inventario[row.focoRef]);
        row.focoVenta = m ? m.mes : int(st.manual && st.manual.month === ym() && st.manual.foco && st.manual.foco[row.focoRef]);
        const Z = typeof ZoneData !== 'undefined' ? ZoneData.forStore(row.storeId) : null;
        if (row.src === 'data' && Z) row.focoVenta = int(Z.ventas[row.focoRef]);
    }

    function stripHTML(r) {
        const cumpl = r.metaMes > 0 ? r.ventaMes / r.metaMes : null;
        const cls = cumpl == null ? '' : cumpl >= 1 ? 'ok' : cumpl >= .7 ? 'warn' : 'bad';
        return `<div class="achip ${cls}"><small>% Cumpl.</small><b>${pctStr(r.ventaMes, r.metaMes)}</b></div>
            <div class="achip"><small>Share sem.</small><b>${r.auto ? int(r.shareSem) + '%' : '—'}</b></div>
            <div class="achip"><small>Inventario</small><b>${int(r.invTotal)}</b></div>
            <div class="achip hl"><small>ROI actual</small><b>${fmt1(r.roi)}</b></div>
            <div class="achip hl"><small>ROI proy.</small><b>${fmt1(r.roiProj)}</b></div>
            <div class="achip"><small>Inv. foco</small><b>${int(r.focoInv)}</b></div>
            ${r.evals ? `<div class="achip ${r.evals.pendientes.length ? 'warn' : 'ok'}" title="${esc(r.evals.pendientes.join(', '))}"><small>Eval. ${esc(r.evals.week)}</small><b>${r.evals.pendientes.length ? r.evals.pendientes.length + ' pend.' : '✓'}</b></div>` : ''}`;
    }

    function onInput(e) {
        const t = e.target, i = int(t.dataset.i), f = t.dataset.f; if (!f || !rows[i]) return;
        const r = rows[i];
        if (f.includes('.')) { const [k, j] = f.split('.'); r[k][int(j)] = t.value; }
        else r[f] = t.type === 'number' ? numf(t.value) : t.value;
        if (f === 'focoRef' && e.type === 'change') { applyFoco(r); paintRows(); return; }
        if (['metaMes', 'ventaMes'].includes(f)) { derive(r); const s = $(`[data-strip="${i}"]`); if (s) s.innerHTML = stripHTML(r); }
        if (['undVisita', 'compromisoUnd'].includes(f)) { const o = $(`[data-ok="${i}"]`); if (o) o.innerHTML = okHTML(r); }
    }

    // ¿Se cumplió el compromiso? Sale solo: unidades vendidas hoy frente al compromiso
    const okState = r => int(r.compromisoUnd) > 0 ? (int(r.undVisita) >= int(r.compromisoUnd) ? 'si' : 'no') : '';
    const okHTML = r => { const s = okState(r); return s === 'si' ? '<i class="pill big ok">✅ Sí se cumplió</i>' : s === 'no' ? '<i class="pill big bad">❌ No se cumplió</i>' : '<i class="pill big">Sin compromiso numérico</i>'; };

    function paintRows() {
        const box = $('#m2-rows'); if (!box) return;
        const n = (i, f, v, ro) => `<input class="input num" type="number" inputmode="numeric" min="0" data-i="${i}" data-f="${f}" value="${v ?? 0}" ${ro ? 'readonly tabindex="-1"' : ''}>`;
        const cierre = fase === 'cierre';
        box.innerHTML = rows.map((r, i) => `
        <section class="card plan-row">
            <div class="row between">
                <div class="row">${chainLogo(r.logoKey, r.cadena)}${(r.asesores || []).map(a => typeof advisorAvatar === 'function' ? advisorAvatar(r.storeId, a.nombre, 34) : '').join('')}<div><b>${esc(r.tienda)}</b><p class="mute">${esc(r.ciudad)} · ${r.auto ? (r.src === 'data' ? `Venta real de la data de zona (corte ${esc(r.corte)})` : `Datos arrastrados del cierre del ${esc(r.corte)}`) : 'Sin cierres este mes: escribe la venta una vez y queda guardada'}</p></div></div>
                <button class="icon-btn" data-del="${i}" title="Quitar tienda">🗑️</button>
            </div>
            <div class="auto-strip" data-strip="${i}">${stripHTML(r)}</div>
            ${(() => { const st = storeById(r.storeId); if (!st || typeof DayStatus === 'undefined') return ''; const L = DayStatus.zoneDay([st], fecha), act = activeAdvisors(st).length, off = L.filter(x => x.s.off).length;
                return L.length ? `<div class="ds-warn">${act && off >= act ? '⚠️ <b>Ese día nadie está en el PDV</b> · ' : ''}${L.map(x => `${esc(x.nombre.split(' ').slice(0, 2).join(' '))} ${DayStatus.chip(x.s)}`).join(' · ')}</div>` : ''; })()}
            ${visitHTML(r)}
            ${advisorsHTML(i)}
            <div class="grid-num">
                <label class="numcell"><span>Meta mes</span>${n(i, 'metaMes', r.metaMes)}</label>
                <label class="numcell"><span>Venta mes ${r.auto ? '🔒' : ''}</span>${n(i, 'ventaMes', r.ventaMes, r.auto)}</label>
                <label class="numcell"><span>Und semana</span>${n(i, 'ventaSemana', r.ventaSemana)}</label>
                <label class="numcell wide"><span>Referencia foco</span><select class="input" data-i="${i}" data-f="focoRef">${INFINIX_MODELS.map(m => `<option value="${m.key}" ${m.key === r.focoRef ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>
                <label class="numcell"><span>Meta foco</span>${n(i, 'focoMeta', r.focoMeta)}</label>
                <label class="numcell"><span>Venta foco ${r.auto ? '🔒' : ''}</span>${n(i, 'focoVenta', r.focoVenta, r.auto)}</label>
            </div>
            <label class="lbl">Foco de la visita</label>
            <input class="input" list="dl-foco" data-i="${i}" data-f="foco" value="${esc(r.foco)}" placeholder="Ej. Movimiento de mesa · Foco Note Edge">
            <div class="grid2" style="margin-top:10px">
                <div>
                    <label class="lbl">Acción principal (3 puntos concretos)</label>
                    ${[0, 1, 2].map(j => `<div class="acc-line"><input class="input" list="dl-acc" data-i="${i}" data-f="acciones.${j}" value="${esc(r.acciones[j] || '')}" placeholder="Acción ${j + 1}">
                        ${cierre ? `<div class="est">${[['ok', '✅'], ['parcial', '⚠️'], ['pend', '❌']].map(([v, ic]) => `<button type="button" class="${r.estados[j] === v ? 'on' : ''}" data-est="${i}-${j}" data-v="${v}" title="${v}">${ic}</button>`).join('')}</div>` : ''}</div>`).join('')}
                </div>
                <div>
                    <label class="lbl">Impacto esperado</label>
                    ${[0, 1, 2].map(j => `<input class="input" style="margin-bottom:6px" list="dl-imp" data-i="${i}" data-f="impactos.${j}" value="${esc(r.impactos[j] || '')}" placeholder="Impacto ${j + 1}">`).join('')}
                </div>
            </div>
            <div class="cierre-box">
                <div class="row wrap" style="gap:14px;align-items:flex-end">
                    <label class="numcell"><span>Compromiso del día (uds)</span>${n(i, 'compromisoUnd', r.compromisoUnd)}</label>
                    ${cierre ? `<label class="numcell"><span>Ventas de hoy (uds)</span>${n(i, 'undVisita', r.undVisita)}</label>
                    <div class="numcell"><span>¿Se cumplió?</span><div data-ok="${i}" style="min-height:42px;display:flex;align-items:center">${okHTML(r)}</div></div>` : ''}
                </div>
            </div>
        </section>`).join('') || '<div class="card empty">Agrega entre 1 y 5 tiendas para armar el plan del día.</div>';
        fillStoreSelect();
    }

    function buildDoc() {
        const s = me(), cierre = fase === 'cierre';
        const stores = JSON.parse(JSON.stringify(rows)).map(r => {
            derive(r);
            if (cierre) r.compromisoOk = okState(r);
            r.undLlegada = int(r.ventaMes); r.undCierre = int(r.ventaMes) + int(r.undVisita);
            return r;
        });
        return {
            id: docId(), userId: s.userId, nombre: s.nombre, rol: s.rol, zona: s.zona || '', fecha, week: 'W' + isoWeek(fecha), month: ym(),
            stores, storeIds: rows.map(r => r.storeId),
            planSentAt: planDoc && planDoc.planSentAt ? planDoc.planSentAt : (fase === 'plan' ? Date.now() : null),
            cierreSentAt: cierre ? Date.now() : (planDoc && planDoc.cierreSentAt) || null,
            updatedAt: Date.now()
        };
    }

    async function persist() {
        const doc = buildDoc(), cierre = fase === 'cierre';
        const ops = [{ op: 'set', col: COL.plans, id: doc.id, data: doc, merge: false }];
        // Lo que se escribió a mano se guarda en la tienda para que la próxima vez salga solo
        rows.forEach(r => {
            const st = storeById(r.storeId); if (!st) return;
            const upd = {};
            if (int(r.metaMes) !== storeMetaMes(st)) upd.metaMes = int(r.metaMes);
            if (int(r.focoMeta) !== int(st.metas && st.metas[r.focoRef])) upd.metas = { ...(st.metas || {}), [r.focoRef]: int(r.focoMeta) };
            if (!r.auto) {
                const prev = st.manual && st.manual.month === ym() ? st.manual.foco || {} : {};
                upd.manual = {
                    month: ym(), ventaMes: int(r.ventaMes) + (cierre ? int(r.undVisita) : 0), ventaSemana: int(r.ventaSemana) + (cierre ? int(r.undVisita) : 0),
                    foco: { ...prev, [r.focoRef]: int(r.focoVenta) }
                };
            }
            if (Object.keys(upd).length) { Object.assign(st, upd); ops.push({ op: 'set', col: COL.stores, id: st.id, data: upd, merge: true }); }
        });
        const res = await Data.batch(ops);
        planDoc = doc; if ($('#m2-status')) paint();
        return res;
    }

    return { render, prefill };
})());

// ----------------------------------------------------------------------------
// LIENZO · PLAN DE TRABAJO / CIERRE DE ACTIVIDADES (1600 px, matricial por PDV)
// ----------------------------------------------------------------------------
function buildPlanCanvas(stage, doc, fase) {
    const cierre = fase === 'cierre';
    const ico = { ok: ['ok', '✓'], parcial: ['warn', '!'], pend: ['bad', '✕'], '': ['plan', '•'] };
    const okTxt = { si: ['ok', '✓ Compromiso cumplido'], no: ['bad', '✕ Compromiso no cumplido'], parcial: ['warn', '! Compromiso parcial'], '': ['plan', 'Sin compromiso numérico'] };
    const row = r => {
        const hc = r.hc || 1, venta = cierre ? int(r.undCierre) : int(r.ventaMes);
        const cumpl = r.metaMes > 0 ? venta / r.metaMes : null;
        const roi = cierre ? venta / hc : r.roi;
        // Semáforo del ROI: ROI proyectado frente al ROI que exige la meta (meta ÷ HC)
        const sem = semaforo(r.metaMes > 0 ? r.roiProj / (r.metaMes / hc) : 1);
        const focoName = (INFINIX_MODELS.find(m => m.key === r.focoRef) || {}).name || '';
        const acc = r.acciones.map((a, j) => a && a.trim() ? `<li><i class="ck ${ico[cierre ? (r.estados[j] || '') : ''][0]}">${ico[cierre ? (r.estados[j] || '') : ''][1]}</i><span>${esc(a)}</span></li>` : '').join('');
        const imp = r.impactos.filter(a => a && a.trim()).map(a => `<li><i class="ck plan">→</i><span>${esc(a)}</span></li>`).join('');
        const ok = okTxt[r.compromisoOk || ''];
        const res = cierre ? `
            <div class="res-nums">
                <div><small>Compromiso</small><b>${int(r.compromisoUnd)} uds</b></div><span>→</span>
                <div class="hl"><small>Ventas de hoy</small><b>${int(r.undVisita)}</b></div><span>→</span>
                <div><small>Acumulado mes</small><b>${int(r.undCierre)}</b></div>
            </div>
            <div class="res-line"><i class="pill big ${ok[0]}">${ok[1]}</i></div>
            <div class="res-line mute2">Cumpl. mes ${pctStr(int(r.undCierre), r.metaMes)} · ROI ${fmt1(roi)}</div>`
            : `<ul class="pl-list">${imp || '<li><span class="mute2">Sin impacto definido</span></li>'}</ul>
               ${r.compromisoUnd ? `<div class="res-line"><i class="pill big ok">Compromiso: ${int(r.compromisoUnd)} uds hoy</i></div>` : ''}`;
        return `<div class="pl-row">
            <div class="pl-id"><div class="pl-logo">${chainLogo(r.logoKey, r.cadena)}</div><div class="pl-name">${esc(r.tienda.toUpperCase())}<small>${esc((r.ciudad || '').toUpperCase())}</small></div>
                ${(() => { const L = (r.asesores || []).length ? r.asesores.map(a => a.nombre) : (storeById(r.storeId) ? activeAdvisors(storeById(r.storeId)).map(a => a.nombre) : []); return L.length ? `<div class="pl-advs">${L.slice(0, 3).map(n => `<div class="pl-advp">${typeof advisorAvatar === 'function' ? advisorAvatar(r.storeId, n, 54) : ''}<span>${esc(n.split(' ').slice(0, 2).join(' '))}</span></div>`).join('')}</div>` : ''; })()}</div>
            <div class="pl-foco">
                <div class="pl-foco-t">${esc(r.foco || 'Visita de gestión')}</div>
                <div class="pl-pills">
                    <div class="ppill ${cumpl == null ? '' : cumpl >= 1 ? 'g' : cumpl >= .7 ? 'a' : 'r'}"><b>${pctStr(venta, r.metaMes)}</b><small>Cumpl. mes</small></div>
                    <div class="ppill"><b>${int(r.ventaSemana)} und</b><small>Semana</small></div>
                    <div class="ppill"><b>${int(r.focoVenta)}/${int(r.focoMeta)}</b><small>${esc(focoName)} mes</small></div>
                    <div class="ppill"><b>${r.auto ? int(r.shareSem) + '%' : '—'}</b><small>Share</small></div>
                    <div class="ppill"><b>${int(r.invTotal)}</b><small>Inventario</small></div>
                    <div class="roi-badge" style="border-color:${sem.color}"><b>${fmt1(roi)}</b><small>ROI</small><em style="background:${sem.color}">Proy. ${fmt1(r.roiProj)}</em></div>
                </div>
                <div class="pl-mini">Mes: ${venta} de ${int(r.metaMes)} · Faltan ${Math.max(0, int(r.metaMes) - venta)} und · Inv. ${esc(focoName)}: ${int(r.focoInv)}</div>
                ${(r.asesores || []).length ? `<div class="pl-adv">${r.asesores.map(a => { const c = (Advisor.SEM[a.semaforo] || Advisor.SEM.gris).color; return `<div class="pl-adv-i"><i style="background:${c}"></i><span><b>${esc(a.nombre)}</b> · ${a.cumpl == null ? 'sin meta' : Math.round(a.cumpl * 100) + '% cumpl.'} (día ${a.day}/${a.dim}, esperado ${Math.round(a.esperado * 100)}%)${a.stockFoco ? ` · ${a.stockFoco} uds foco sin rotar: ${esc(a.rezagos.map(m => m.name + ' ×' + m.inv).join(', '))}` : ''}${a.nota != null ? ` · eval. ${a.nota}` : ''}${a.temasDebiles.length ? ` · reforzar: ${esc(a.temasDebiles.slice(0, 2).join(', '))}` : ''}</span></div>`; }).join('')}</div>` : ''}
                ${r.evals ? `<div class="pl-mini ${r.evals.pendientes.length ? 'warn' : 'ok'}">🎓 Evaluación ${esc(r.evals.week)}: ${r.evals.pendientes.length ? 'pendiente ' + esc(r.evals.pendientes.join(', ')) : 'al día'}${r.evals.prom != null ? ` · prom. ${r.evals.prom}` : ''}</div>` : ''}
            </div>
            <div class="pl-acc"><ul class="pl-list">${acc}</ul>${cierre && r.visita ? `${r.visita.gestion ? `<div class="pl-mini">📸 ${esc(r.visita.gestion.slice(0, 220))}</div>` : ''}${r.visita.fotos && r.visita.fotos.length ? `<div class="pl-fotos">${r.visita.fotos.map(f => `<img src="${f}" alt="">`).join('')}</div>` : ''}` : ''}</div>
            <div class="pl-res ${cierre ? 'cierre' : ''}">${res}</div>
        </div>`;
    };
    const R = doc.stores;
    const allAcc = R.flatMap(r => r.acciones.map((a, j) => a && a.trim() ? (r.estados[j] || '') : null)).filter(x => x !== null);
    const conComp = R.filter(r => int(r.compromisoUnd) > 0);
    const chips = cierre ? [
        ['Tiendas cubiertas', R.length], ['Ventas de hoy', sum(R.map(r => int(r.undVisita))) + ' und'],
        ['Acciones cumplidas', `${allAcc.filter(x => x === 'ok').length}/${allAcc.length}`],
        ['Compromisos cumplidos', `${conComp.filter(r => r.compromisoOk === 'si').length}/${conComp.length}`]
    ] : [
        ['Tiendas a cubrir', R.length], ['Meta acumulada', sum(R.map(r => int(r.metaMes))) + ' und'],
        ['Venta acumulada', sum(R.map(r => int(r.ventaMes))) + ' und'], ['Compromiso del día', sum(R.map(r => int(r.compromisoUnd))) + ' und']
    ];
    const el = document.createElement('div');
    el.className = 'rp rp-m2';
    el.innerHTML = `
    <div class="rp-bar"></div>
    <header class="rp-head">
        <img class="rp-logo" src="${LOGO_INFINIX}" alt="Infinix">
        <div class="rp-head-mid">
            <div class="rp-title">${cierre ? '<span class="g">CIERRE</span> DE ACTIVIDADES' : '<span class="g">PLAN</span> DE TRABAJO DIARIO'}</div>
            <div class="rp-sub big">${esc(fechaLarga(doc.fecha).toUpperCase())} · ${esc(doc.week)}</div>
        </div>
        <div class="pl-who"><b>${esc(doc.nombre)}</b><small>${ROLES[doc.rol] ? ROLES[doc.rol].label : ''}</small><span class="zone">ZONA ${esc(doc.zona)}</span></div>
    </header>
    <div class="pl-cols"><div>📍 PUNTO DE VENTA</div><div>🎯 FOCO Y RADIOGRAFÍA NUMÉRICA</div><div>⚙️ ${cierre ? 'ACCIONES EJECUTADAS' : 'ACCIÓN PRINCIPAL'}</div><div>📊 ${cierre ? 'RESULTADO AL CIERRE' : 'IMPACTO ESPERADO'}</div></div>
    ${R.map(row).join('')}
    ${typeof DayStatus !== 'undefined' ? DayStatus.reportBlock(R.map(r => storeById(r.storeId)).filter(Boolean), doc.fecha, 'ASESORES FUERA DEL PDV Y NOVEDADES') : ''}
    <div class="pl-foot">${chips.map(c => `<div><small>${c[0]}</small><b>${c[1]}</b></div>`).join('')}</div>
    <div class="rp-bar"></div>`;
    stage.appendChild(el);
    return el;
}

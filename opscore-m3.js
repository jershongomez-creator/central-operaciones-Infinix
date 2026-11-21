// ============================================================================
// MÓDULO 3 · REPORTE DE VISITA EN PDV (modo Supervisor y modo Formador)
// Los indicadores (meta, venta del mes, accesorios, HC, share, ROI) se arrastran
// de los cierres que ya llenaron los asesores. A mano solo va lo del día.
// Supervisión y Formación usan el mismo formato corto: marcar chulitos y listo.
// ============================================================================

registerModule('m3', (() => {
    let fecha = todayStr(), modo = 'supervisor', storeId = '', fotos = [null, null, null], minis = [null, null, null];
    let F = null;                                   // estado del formulario
    const me = () => State.session;
    const fresh = () => ({
        promotores: [], promExtra: '', auto: false, corte: '',
        metaDia: 0, ventaDia: 0, metaMes: 0, ventaMes: 0, accMes: 0, hc: 1, share: 0,
        evals: {}, competencias: Object.fromEntries(VISIT_COMPETENCIAS.map(c => [c.key, 3])), focos: [],
        ejec: Object.fromEntries(VISIT_EJECUCION.map(a => [a.key, false])),
        radar: Object.fromEntries(VISIT_RADAR.map(a => [a.key, false])), radarNota: '', ejecExtra: '', ejecItems: [], pano: null,
        calif: Object.fromEntries(VISIT_CALIF_ASESOR.map(c => [c.key, 3])),
        gestion: '', alertas: '', compromisos: ''
    });
    // Acumulado con la venta de hoy incluida cuando el cierre de hoy aún no existe
    const ventaAcum = f => int(f.ventaMes) + (f.corte === fecha ? 0 : int(f.ventaDia));
    const roiOf = f => f.hc > 0 ? ventaAcum(f) / f.hc : 0;
    const roiProjOf = f => { const d = parseD(fecha).getDate(); return f.hc > 0 ? (ventaAcum(f) / d * daysInMonth(fecha.slice(0, 7))) / f.hc : 0; };

    function render(view) {
        fecha = todayStr(); F = fresh(); fotos = [null, null, null]; minis = [null, null, null]; storeId = '';
        const rol = me().rol;
        modo = rol === 'formador' ? 'formador' : 'supervisor';
        const canSwitch = ['coordinador', 'admin'].includes(rol);
        view.innerHTML = `
        <section class="card">
            <div class="row between wrap">
                <div><h2 class="h2">Reporte de visita en PDV</h2><p class="mute">${esc(me().nombre)} · ${ROLES[rol].label}</p></div>
                <label class="field-inline"><span class="lbl">Fecha</span><input type="date" id="m3-fecha" class="input" value="${fecha}" max="${todayStr()}"></label>
            </div>
            ${canSwitch ? `<div class="seg" style="margin-top:12px"><button class="seg-btn" data-modo="supervisor">Modo Supervisión</button><button class="seg-btn" data-modo="formador">Modo Formación</button></div>` : ''}
            <label class="lbl">Punto de venta visitado</label>
            <select id="m3-store" class="input"><option value="">Selecciona una tienda…</option>${scopedStores().map(s => `<option value="${esc(s.id)}">${esc(s.tienda)} · ${esc(s.ciudad || '')}</option>`).join('')}</select>
        </section>
        <div id="m3-body"></div>`;
        $$('[data-modo]', view).forEach(b => b.onclick = () => { modo = b.dataset.modo; paint(); });
        $('#m3-fecha').onchange = e => { fecha = e.target.value || todayStr(); if (storeId) pickStore(storeId); };
        $('#m3-store').onchange = e => pickStore(e.target.value);

        const body = $('#m3-body');
        const onIn = e => {
            const t = e.target, f = t.dataset.f; if (!f) return;
            const val = t.type === 'checkbox' ? t.checked : (t.type === 'number' || t.type === 'range') ? numf(t.value) : t.value;
            const parts = f.split('.');
            if (parts[0] === 'prom') { F.promotores = $$('[data-f="prom"]:checked', body).map(i => i.value); }
            else if (parts[0] === 'foco') { F.focos = $$('[data-f="foco"]:checked', body).map(i => i.value); }
            else if (parts[0] === 'eval') {
                F.evals[parts[1]] = F.evals[parts[1]] || { done: false, score: 0 };
                if (parts[2] === 'done') { F.evals[parts[1]].done = t.checked; paint(); return; }
                F.evals[parts[1]].score = clamp(numf(t.value), 0, 100);
            }
            else if (parts[0] === 'ejecItems') { if (F.ejecItems[parts[1]]) F.ejecItems[parts[1]].detalle = val; }
            else if (parts.length === 2) F[parts[0]][parts[1]] = val;
            else F[f] = val;
            if (t.type === 'range') { const o = $(`[data-out="${f}"]`, body); if (o) o.textContent = val; }
            if (parts[0] === 'ejec') { const c = $('#m3-ejec-n', body); if (c) c.textContent = ejecCount(); }
            if (['ventaMes', 'metaMes', 'ventaDia', 'metaDia'].includes(f)) liveKpis();
        };
        body.addEventListener('input', onIn);
        body.addEventListener('change', e => { if (e.target.type === 'file') onPhoto(e.target); });
        body.addEventListener('click', e => {
            const x = e.target.closest('[data-rmfoto]'); if (x) { fotos[int(x.dataset.rmfoto)] = null; minis[int(x.dataset.rmfoto)] = null; paint(); return; }
            if (e.target.id === 'm3-ej-add') {                         // Añadir una ejecución (tipo de la lista + detalle)
                const sel = $('#m3-ej-tipo', body), det = $('#m3-ej-det', body), otro = $('#m3-ej-otro', body);
                const tipo = sel.value === '__otro' ? (otro.value || '').trim() : sel.value;
                if (!tipo) { toast('Elige o escribe la ejecución.', 'warn'); return; }
                (F.ejecItems = F.ejecItems || []).push({ tipo, detalle: (det.value || '').trim() });
                paintEjec(body); const d2 = $('#m3-ej-det', body); if (d2) d2.focus();
                return;
            }
            const rm = e.target.closest('[data-rmej]'); if (rm) { F.ejecItems.splice(int(rm.dataset.rmej), 1); paintEjec(body); }
        });
        body.addEventListener('change', e => { if (e.target.id === 'm3-ej-tipo') { const o = $('#m3-ej-otro', body); if (o) { o.hidden = e.target.value !== '__otro'; if (!o.hidden) o.focus(); } } });
        paint();
    }
    const ejecCount = () => `${(F.ejecItems || []).length + VISIT_EJECUCION.filter(a => F.ejec[a.key]).length}`;
    // Lista de ejecuciones añadidas (tipo + detalle), como las acciones del plan de trabajo
    const ejecListHTML = () => {
        const items = F.ejecItems || [];
        return `<div class="ej-rows">${items.map((it, i) => `<div class="ej-row"><span class="ej-n">${i + 1}</span><b>${esc(it.tipo)}</b><input class="input" data-f="ejecItems.${i}.detalle" value="${esc(it.detalle || '')}" placeholder="Detalle / impacto (opcional)"><button type="button" class="icon-btn" title="Quitar" data-rmej="${i}">🗑️</button></div>`).join('') || '<p class="hint">Aún no has añadido ejecuciones. Elige una de la lista y toca Añadir.</p>'}</div>`;
    };
    function paintEjec(body) { const box = $('#m3-ej-list', body); if (box) box.innerHTML = ejecListHTML(); const c = $('#m3-ejec-n', body); if (c) c.textContent = ejecCount(); const d = $('#m3-ej-det', body); if (d) d.value = ''; }

    // Arrastre automático: todo sale de los cierres diarios de la tienda
    async function pickStore(id) {
        storeId = id; F = fresh(); fotos = [null, null, null]; minis = [null, null, null];
        const st = storeById(id);
        if (st) {
            const ym = fecha.slice(0, 7), dim = daysInMonth(ym), dd = fecha.slice(8);
            // La venta Infinix sale de la data DCR (la misma del Análisis de zona); los cierres del asesor
            // completan competencia, share e inventario. Antes, con un solo cierre en el mes se ignoraba la DCR.
            let Z = null; try { await ZoneData.load(st.zona, ym); Z = ZoneData.forStore(st.id); } catch (e) { }
            const zOk = !!(Z && Z.month === ym);
            const cl = await fetchStoreClosures(id, fecha);
            const last = cl.filter(c => c.storeId === id && c.fecha <= fecha && c.fecha.slice(0, 7) === ym).map(c => c.fecha).sort().pop();
            const c = last ? computeStore(st, cl, last) : null;
            const m = st.manual && st.manual.month === ym ? st.manual : null;
            const dayDCR = d => int(Z && Z.dias && Z.dias[d.slice(8)]);
            const refDay = (d, k) => int(Z && Z.diasRef && (Z.diasRef[d.slice(8)] || {})[k]);
            const wk = weekDays(fecha).filter(d => d.slice(0, 7) === ym && d <= fecha), wkPrev = weekDays(addDays(weekDays(fecha)[0], -1)).filter(d => d.slice(0, 7) === ym).slice(0, wk.length);
            const ventaMes = zOk ? int(Z.total) : c ? c.infMes : (m ? int(m.ventaMes) : 0);
            Object.assign(F, {
                auto: true, fromDCR: zOk, corte: zOk ? (Z.corte || last || '') : (last || ''),
                metaMes: c ? c.metaMes : storeMetaMes(st), ventaMes, accMes: c ? c.accMes : (zOk ? sum(Object.values(Z.accesorios || {})) : 0),
                hc: (c && c.hcInf) || +(st.hc && st.hc.INFINIX) || 1, share: c ? c.shareMes : '',
                ventaDia: Math.max(zOk ? dayDCR(fecha) : 0, c && last === fecha ? c.infHoy : 0)
            });
            const base = c ? panoramaOf(c) : { brands: [], pos: null, storeMes: 0, cierres: 0 };
            if (zOk) {
                const models = INFINIX_MODELS.map(x => { const meta = int(st.metas && st.metas[x.key]), mes = int(Z.ventas && Z.ventas[x.key]); return { name: x.name, meta, inv: int(st.inventario && st.inventario[x.key]), mes, semana: sum(wk.map(d => refDay(d, x.key))), cumpl: meta ? Math.round(mes / meta * 100) : null }; }).filter(x => x.meta || x.mes || x.inv);
                F.pano = { ...base, models, infMes: ventaMes, infSem: sum(wk.map(dayDCR)), prevSem: c ? c.prevSem : sum(wkPrev.map(dayDCR)), metaMes: F.metaMes, invTotal: storeInvTotal(st), dayOfMonth: int((Z.corte || fecha).slice(8)) || int(dd), dim, fuente: c ? 'DCR + cierres' : 'DCR' };
            } else if (c) F.pano = base;
            // Share, participación y puesto: la data real de la cadena manda sobre lo reportado en los cierres
            if (typeof RealData !== 'undefined') {
                await RealData.load(ym).catch(() => { });
                const RD = RealData.forStore(st, ym);
                if (RD) { const S = RealData.shareOf(RD.marcas); F.share = S.share == null ? F.share : Math.round(S.share * 100); F.pano = { ...(F.pano || { models: [] }), brands: S.rank.slice(0, 5).map(([brand, mes]) => ({ brand, mes, share: S.tot ? Math.round(mes / S.tot * 100) : 0, pos: S.rank.findIndex(x => x[0] === brand) + 1, hc: int((st.hc || {})[brand]), meta: 0 })), pos: S.pos, storeMes: S.tot, fuenteShare: 'real ' + RD.desde + ' a ' + RD.hasta }; }
            }
            F.metaDia = F.metaMes > 0 ? Math.ceil(F.metaMes / dim) : 0;
            F.promotores = activeAdvisors(st).map(a => a.nombre);
            // Evaluaciones: si ya están cargadas, se marcan solas (presentó / nota promedio de los promotores de la tienda)
            if (typeof Evals !== 'undefined') {
                await Evals.ensureLoaded([st.zona], ym);
                const evs = F.promotores.map(n => Evals.forAdvisor(st.id, n, '', ym)).filter(Boolean);
                evalWeeksOfMonth(ym).forEach(w => {
                    const k = 'W' + w, notas = evs.map(x => x.porSemana && x.porSemana[k]).filter(Boolean), cargada = evs.some(x => (x.cargadas || []).includes(k));
                    if (notas.length) F.evals[k] = { done: true, score: Math.round(sum(notas.map(n => n.nota || 0)) / notas.length), auto: `${notas.length}/${F.promotores.length}` };
                    else if (cargada) F.evals[k] = { done: false, score: 0, auto: `0/${F.promotores.length}` };
                });
            }
            const prev = await Data.get(COL.visits, visitId());          // el reporte de hoy se puede retomar
            if (prev && prev.fotosMini && prev.fotosMini.length) { minis = [0, 1, 2].map(i => prev.fotosMini[i] || null); fotos = minis.slice(); }
            if (prev && prev.form) F = { ...fresh(), ...prev.form, ejec: { ...fresh().ejec, ...(prev.form.ejec || {}) }, ejecItems: (prev.form.ejecItems || []).map(x => ({ ...x })) };
        }
        if ($('#m3-body')) paint();
    }
    const visitId = () => `${me().userId}_${storeId}_${fecha}`;
    // Radiografía del PDV que viaja con el reporte (sale de los cierres)
    function panoramaOf(c) {
        return {
            models: c.models.map(m => ({ name: m.name, meta: m.meta, inv: m.inv, mes: m.mes, semana: m.semana, cumpl: m.cumpl })),
            brands: c.brands.filter(b => b.mes > 0).sort((a, b) => b.mes - a.mes).slice(0, 5).map(b => ({ brand: b.brand, mes: b.mes, share: b.share, pos: b.pos, hc: b.hc, meta: b.meta })),
            pos: c.pos, invTotal: c.invTotal, storeMes: c.storeMes, infMes: c.infMes, infSem: c.infSem, prevSem: c.prevSem, metaMes: c.metaMes, cierres: c.cierresMes, dayOfMonth: c.dayOfMonth, dim: c.dim
        };
    }

    function liveKpis() {
        const k = $('#m3-kpis'); if (!k) return;
        k.innerHTML = `<div class="kpi hl"><span>ROI actual</span><b>${fmt1(roiOf(F))}</b><small>Proy. ${fmt1(roiProjOf(F))}</small></div>
            <div class="kpi"><span>Cumpl. día</span><b>${pctStr(F.ventaDia, F.metaDia)}</b><small>${int(F.ventaDia)} de ${int(F.metaDia)}</small></div>
            <div class="kpi"><span>Cumpl. mes</span><b>${pctStr(ventaAcum(F), F.metaMes)}</b><small>${ventaAcum(F)} de ${int(F.metaMes)}</small></div>
            <div class="kpi"><span>Share PDV</span><b>${F.auto ? int(F.share) + '%' : '—'}</b><small>${int(F.accMes)} accesorios · HC ${int(F.hc)}</small></div>`;
    }

    function paint() {
        $$('[data-modo]').forEach(b => b.classList.toggle('active', b.dataset.modo === modo));
        const body = $('#m3-body'); if (!body) return;
        const st = storeById(storeId);
        if (!st) { body.innerHTML = '<div class="card empty">Selecciona el punto de venta para iniciar el reporte.</div>'; return; }
        const n = (f, v, ro) => `<input class="input num" type="number" inputmode="numeric" min="0" data-f="${f}" value="${v ?? 0}" ${ro ? 'readonly tabindex="-1"' : ''}>`;
        const rng = (f, v) => `<div class="rng"><input type="range" min="1" max="5" step="1" data-f="${f}" value="${v}"><output data-out="${f}">${v}</output></div>`;
        const chk = (f, label, on, cls = '') => `<label class="chip ${cls}"><input type="checkbox" data-f="${f}" ${on ? 'checked' : ''}><span>${esc(label)}</span></label>`;
        const weeks = evalWeeksOfMonth(fecha.slice(0, 7));

        const formador = `
        <section class="card">
            <h3 class="h3">🎓 Formación y acompañamiento</h3>
            <label class="lbl">Evaluaciones semanales del mes</label>
            <div class="eval-grid">${weeks.map(w => { const e = F.evals['W' + w] || {}; return `<div class="eval ${e.done ? 'on' : ''}"><label class="chip"><input type="checkbox" data-f="eval.W${w}.done" ${e.done ? 'checked' : ''}><span>W${w}</span></label>${e.auto ? `<small class="ev-auto">📥 de la data: ${e.auto} presentaron</small>` : ''}
                ${e.done ? `<input class="input num" type="number" min="0" max="100" data-f="eval.W${w}.score" value="${e.score || 0}" placeholder="0-100">` : '<small>No realizada</small>'}</div>`; }).join('')}</div>
            <label class="lbl">Evaluación de competencias en sala (1 a 5)</label>
            ${VISIT_COMPETENCIAS.map(c => `<div class="rng-row"><span>${c.label}</span>${rng('competencias.' + c.key, F.competencias[c.key])}</div>`).join('')}
            <label class="lbl">Foco de intervención</label>
            <div class="chips">${VISIT_FOCOS_FORMADOR.map(x => `<label class="chip"><input type="checkbox" data-f="foco" value="${esc(x)}" ${F.focos.includes(x) ? 'checked' : ''}><span>${esc(x)}</span></label>`).join('')}</div>
        </section>`;

        const supervisor = `
        <section class="card">
            <h3 class="h3">🛡️ Supervisión en el punto</h3>
            <label class="lbl">Ejecución retail · ¿qué se trabajó en el PDV? <span class="badge" id="m3-ejec-n">${ejecCount()}</span></label>
            <div class="ej-add">
                <select class="input" id="m3-ej-tipo">${VISIT_EJECUCION.map(a => `<option value="${esc(a.label)}">${esc(a.label)}</option>`).join('')}<option value="__otro">Otra ejecución (escribir)…</option></select>
                <input class="input" id="m3-ej-otro" placeholder="Nombre de la ejecución" hidden>
                <input class="input" id="m3-ej-det" placeholder="Detalle / impacto (opcional)">
                <button type="button" class="btn btn-dark" id="m3-ej-add">➕ Añadir</button>
            </div>
            <div id="m3-ej-list">${ejecListHTML()}</div>
            <textarea class="input" rows="2" style="margin-top:8px" data-f="ejecExtra" placeholder="Otras ejecuciones realizadas a mano (una por línea): negociación de espacio adicional, capacitación al asesor de cadena, cambio de precios…">${esc(F.ejecExtra || '')}</textarea>
            <label class="lbl">¿Qué encontró de la competencia?</label>
            <div class="chips">${VISIT_RADAR.map(x => chk('radar.' + x.key, x.label, F.radar[x.key], 'alert')).join('')}</div>
            <textarea class="input" rows="2" style="margin-top:8px" data-f="radarNota" placeholder="Detalle de lo encontrado (marca, descuento, bono, activación, promotor adicional…). Lo que escribas sale en el reporte.">${esc(F.radarNota)}</textarea>
            <label class="lbl">Calificación del asesor (1 a 5)</label>
            ${VISIT_CALIF_ASESOR.map(c => `<div class="rng-row"><span>${c.label}</span>${rng('calif.' + c.key, F.calif[c.key])}</div>`).join('')}
        </section>`;

        body.innerHTML = `
        <section class="card">
            <div class="row">${storeLogo(st)}<div><b>${esc(st.tienda)}</b><p class="mute">${esc(st.ciudad || '')} · ${F.auto ? (F.fromDCR ? `Venta de la data DCR al ${esc(F.corte)}${F.pano && F.pano.fuente === 'DCR + cierres' ? ' · competencia de los cierres' : ''}` : `Indicadores arrastrados del cierre del ${esc(F.corte)}`) : F.fromDCR ? `Venta del mes tomada de la data DCR (corte ${esc(F.corte)})` : 'La tienda aún no tiene cierres este mes'}</p></div></div>
            <label class="lbl">Promotor(es) en tienda</label>
            <div class="chips">${[...new Set(activeAdvisors(st).map(a => a.nombre).concat((st.asesores || []).filter(a => !isBaja(st, a))))].map(a => `<label class="chip"><input type="checkbox" data-f="prom" value="${esc(a)}" ${F.promotores.includes(a) ? 'checked' : ''}><span>${typeof advisorAvatar === 'function' ? advisorAvatar(st.id, a, 26) + ' ' : ''}${esc(a)}</span></label>`).join('')}</div>
            <input class="input" style="margin-top:8px" data-f="promExtra" value="${esc(F.promExtra)}" placeholder="Otro promotor (opcional)">
            <label class="lbl">Lo de hoy</label>
            <div class="grid-num" style="margin-top:0">
                <label class="numcell"><span>Meta del día</span>${n('metaDia', F.metaDia)}</label>
                <label class="numcell"><span>Venta de hoy</span>${n('ventaDia', F.ventaDia)}</label>
                ${F.auto ? '' : `<label class="numcell"><span>Meta mes</span>${n('metaMes', F.metaMes)}</label><label class="numcell"><span>Venta mes</span>${n('ventaMes', F.ventaMes)}</label>`}
            </div>
        </section>
        <section class="kpi-row" id="m3-kpis"></section>
        ${modo === 'formador' ? formador : supervisor}
        <section class="card">
            <h3 class="h3">📝 Gestión, novedades y compromisos</h3>
            <label class="lbl">Gestión lograda en visita</label><textarea class="input" rows="3" data-f="gestion">${esc(F.gestion)}</textarea>
            <label class="lbl">Novedades / alertas</label><textarea class="input" rows="2" data-f="alertas">${esc(F.alertas)}</textarea>
            <label class="lbl">Compromisos para el cierre de semana</label><textarea class="input" rows="2" data-f="compromisos">${esc(F.compromisos)}</textarea>
        </section>
        <section class="card">
            <h3 class="h3">📷 Evidencias fotográficas (hasta 3)</h3>
            <div class="foto-grid">${[0, 1, 2].map(i => fotos[i] ? `<div class="foto"><img src="${fotos[i]}" alt="Evidencia ${i + 1}"><button type="button" data-rmfoto="${i}">✕</button></div>`
                : `<label class="foto add"><input type="file" accept="image/*" data-foto="${i}" hidden><span>＋<small>${['Exhibición', 'Equipo', 'Planillas'][i]}</small></span></label>`).join('')}</div>
            <p class="hint">Las fotos se comprimen en el teléfono. Al guardar, una miniatura pasa sola al cierre de actividades de la noche.</p>
        </section>
        <section class="card save-visit"><button class="btn btn-dark btn-block" id="m3-guardar">💾 Guardar visita (pasa sola al cierre de actividades)</button><p class="hint" id="m3-saved"></p></section>
        ${actionBarHTML()}`;
        liveKpis();
        $('#m3-guardar', body).onclick = async e => {
            if (!F.gestion.trim()) return toast('Describe la gestión lograda en la visita.', 'warn');
            busy(e.currentTarget, true); try { const r = await persist(); toast(r && r.synced === false ? 'Visita guardada en el equipo; se sincroniza al recuperar conexión. Ya está en tu cierre de actividades.' : 'Visita guardada ✅ Ya está en tu cierre de actividades.', 'ok', 5000); $('#m3-saved').textContent = 'Guardada a las ' + new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }).replace(/\.$/, '') + '. Ahora puedes verla, compartirla o descargarla.'; } finally { busy(e.currentTarget, false); }
        };
        ReportActions.bind(body, {
            title: 'Reporte de visita · Central de Operaciones',
            validate: () => !F.gestion.trim() ? 'Describe la gestión lograda en la visita.' : null,
            filename: () => `Visita_${slug(storeById(storeId).tienda)}_${fecha}.png`,
            build: stage => buildVisitCanvas(stage, buildDoc(), fotos),
            persist,
            noStore: true                       // la visita ya tiene su propio botón de guardar
        });
    }

    // Compresión y recorte 4:3 en el cliente (equivale a object-fit: cover)
    function onPhoto(input) {
        const i = int(input.dataset.foto), file = input.files && input.files[0]; if (!file) return;
        const reader = new FileReader();                 // data URL: nunca "mancha" el lienzo
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const W = 960, H = 720, c = document.createElement('canvas'); c.width = W; c.height = H;
                const s = Math.max(W / img.width, H / img.height), w = img.width * s, h = img.height * s;
                c.getContext('2d').drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
                fotos[i] = c.toDataURL('image/jpeg', 0.82);
                const m = document.createElement('canvas'); m.width = 800; m.height = 600; m.getContext('2d').drawImage(c, 0, 0, 800, 600);
                minis[i] = m.toDataURL('image/jpeg', 0.72);          // miniatura que viaja al cierre de actividades
                paint();
            };
            img.onerror = () => toast('No se pudo leer la foto.', 'error');
            img.src = reader.result;
        };
        reader.onerror = () => toast('No se pudo leer la foto.', 'error');
        reader.readAsDataURL(file);
    }

    function buildDoc() {
        const st = storeById(storeId), s = me();
        const promotores = F.promotores.concat(F.promExtra.trim() ? [F.promExtra.trim()] : []);
        const done = Object.values(F.evals).filter(e => e.done);
        return {
            id: visitId(), userId: s.userId, nombre: s.nombre, rol: s.rol, modo, zona: st.zona || s.zona || '',
            storeId: st.id, tienda: st.tienda, cadena: st.cadena || '', ciudad: st.ciudad || '', logoKey: normLogoKey(st.logoKey),
            fecha, week: 'W' + isoWeek(fecha), month: fecha.slice(0, 7), promotores,
            ventaAcum: ventaAcum(F), roi: +roiOf(F).toFixed(2), roiProj: +roiProjOf(F).toFixed(2),
            cumplDia: F.metaDia > 0 ? +(F.ventaDia / F.metaDia).toFixed(3) : null,
            cumplMes: F.metaMes > 0 ? +(ventaAcum(F) / F.metaMes).toFixed(3) : null,
            ejecOk: (F.ejecItems || []).length + VISIT_EJECUCION.filter(a => F.ejec[a.key]).length + splitLines(F.ejecExtra).length, ejecTotal: VISIT_EJECUCION.length,
            evalPromedio: done.length ? Math.round(sum(done.map(e => e.score)) / done.length) : null, evalRealizadas: done.length,
            fotos: fotos.filter(Boolean).length, fotosMini: minis.filter(Boolean),
            ejecutado: VISIT_EJECUCION.filter(a => F.ejec[a.key]).map(a => a.label || a.key).concat((F.ejecItems || []).map(x => [x.tipo, x.detalle].filter(Boolean).join(': ')), splitLines(F.ejecExtra)).slice(0, 12),
            ventaDia: int(F.ventaDia), savedAt: Date.now(),
            form: JSON.parse(JSON.stringify(F)), updatedAt: Date.now()
        };
    }

    async function persist() {
        const doc = buildDoc(), st = storeById(storeId);
        const ops = [{ op: 'set', col: COL.visits, id: doc.id, data: doc, merge: false }];
        if (!F.auto && st) {                             // sin cierres: lo digitado queda guardado en la tienda
            const upd = { manual: { ...(st.manual && st.manual.month === doc.month ? st.manual : {}), month: doc.month, ventaMes: ventaAcum(F) } };
            if (int(F.metaMes) !== storeMetaMes(st)) upd.metaMes = int(F.metaMes);
            Object.assign(st, upd); ops.push({ op: 'set', col: COL.stores, id: st.id, data: upd, merge: true });
        }
        return Data.batch(ops);
    }

    return { render };
})());

// ----------------------------------------------------------------------------
// LIENZO · REPORTE DE VISITA (1080 px, vertical)
// ----------------------------------------------------------------------------
function buildVisitCanvas(stage, doc, fotos) {
    const f = doc.form, dash = '—';
    const venta = doc.ventaAcum != null ? doc.ventaAcum : int(f.ventaMes);
    const semRoi = semaforo(f.metaMes > 0 && f.hc > 0 ? doc.roiProj / (f.metaMes / f.hc) : 1);
    const cd = f.metaDia > 0 ? f.ventaDia / f.metaDia : 0, cm = f.metaMes > 0 ? venta / f.metaMes : 0;
    const bar5 = (label, v) => `<div class="b5"><span>${label}</span><div class="b5-track"><div style="width:${v / 5 * 100}%;background:${v >= 4 ? THEME.green : v >= 3 ? THEME.amber : THEME.red}"></div></div><b>${v}/5</b></div>`;
    const lines = t => esc(t || dash).replace(/\n/g, '<br>');

    let roleBlock = '';
    if (doc.modo === 'formador') {
        const weeks = evalWeeksOfMonth(doc.month).map(w => ({ w: 'W' + w, ...(f.evals['W' + w] || {}) }));
        roleBlock = `
        <div class="rp-sec">FORMACIÓN Y ACOMPAÑAMIENTO</div>
        <div class="v-two">
            <div class="vbox">
                <div class="vbox-t">Evaluaciones semanales del mes</div>
                <div class="row" style="gap:18px;align-items:center">
                    ${ringCardHTML('rv-eval', 130, doc.evalPromedio == null ? dash : doc.evalPromedio, 'promedio')}
                    <div class="grow">
                        <div class="ev-count"><b>${doc.evalRealizadas}/${weeks.length}</b> evaluaciones realizadas</div>
                        <div class="ev-weeks">${weeks.map(w => `<div class="${w.done ? 'on' : ''}"><b>${w.w}</b><span>${w.done ? (w.score || 0) + ' pts' : 'No realizada'}</span></div>`).join('')}</div>
                    </div>
                </div>
            </div>
            <div class="vbox">
                <div class="vbox-t">Competencias en sala</div>
                ${VISIT_COMPETENCIAS.map(c => bar5(c.label, int(f.competencias[c.key]))).join('')}
                <div class="tags">${(f.focos.length ? f.focos : ['Sin foco de intervención definido']).map(x => `<i>${esc(x)}</i>`).join('')}</div>
            </div>
        </div>`;
    } else {
        const ej = f.ejec || {};
        const done = (f.ejecItems || []).map(it => it.detalle ? `<b>${esc(it.tipo)}</b> — ${esc(it.detalle)}` : `<b>${esc(it.tipo)}</b>`)
            .concat(VISIT_EJECUCION.filter(a => ej[a.key]).map(a => `<b>${esc(a.label)}</b>`), splitLines(f.ejecExtra).map(esc));
        const radarOn = VISIT_RADAR.filter(r => f.radar[r.key]);
        roleBlock = `
        <div class="rp-sec">SUPERVISIÓN EN EL PUNTO</div>
        <div class="v-two">
            <div class="vbox good">
                <div class="vbox-t">Ejecución realizada en el PDV · ${done.length} ${done.length === 1 ? 'acción' : 'acciones'}</div>
                ${done.length ? `<ul class="ej-list">${done.map(t => `<li><i class="ck ok">✓</i><span>${t}</span></li>`).join('')}</ul>` : '<p class="vtxt">Sin ejecuciones registradas en esta visita.</p>'}
            </div>
            <div class="vbox">
                <div class="vbox-t">Competencia en el PDV</div>
                ${radarOn.length ? `<div class="tags radar">${radarOn.map(r => `<i class="on">⚠ ${r.label}</i>`).join('')}</div>` : ''}
                <p class="vtxt">${f.radarNota ? lines(f.radarNota) : (radarOn.length ? 'Sin detalle adicional.' : 'Sin novedades de la competencia.')}</p>
                <div class="vbox-t" style="margin-top:12px">Calificación del asesor</div>
                ${VISIT_CALIF_ASESOR.map(c => bar5(c.label, int(f.calif[c.key]))).join('')}
            </div>
        </div>`;
    }

    // Panorama del PDV (sale de los cierres de la tienda)
    let panoBlock = '';
    const P = f.pano;
    if (P && P.models) {
        const cls = v => v == null ? '' : v >= 100 ? 'g' : v >= 70 ? 'a' : 'r';
        const infRow = P.brands.find(b => b.brand === 'INFINIX');
        const low = P.models.filter(m => m.meta > 0).sort((a, b) => (a.cumpl || 0) - (b.cumpl || 0)).slice(0, 3);
        const sinStock = P.models.filter(m => m.inv <= 0 && m.meta > 0);
        panoBlock = `
        <div class="rp-sec">PANORAMA DEL PDV · CORTE ${esc(f.corte || doc.fecha)}</div>
        <div class="v-two pano">
            <div class="vbox">
                <div class="vbox-t">Infinix por referencia · target, venta e inventario</div>
                <table class="rp-tbl pano-tbl"><thead><tr><th class="l">REFERENCIA</th><th>TARGET</th><th>MES</th><th>CUMPL.</th><th>INV.</th></tr></thead><tbody>
                    ${P.models.map(m => `<tr><td class="l">${esc(m.name)}</td><td>${m.meta || dash}</td><td><b>${m.mes}</b></td><td class="c-tot ${cls(m.cumpl)}">${m.cumpl == null ? dash : m.cumpl + '%'}</td><td class="${m.inv <= 0 ? 'r' : ''}">${m.inv}</td></tr>`).join('')}
                    <tr class="tot"><td class="l">TOTAL</td><td>${P.metaMes || dash}</td><td><b>${P.infMes}</b></td><td class="c-tot ${cls(P.metaMes ? Math.round(P.infMes / P.metaMes * 100) : null)}">${P.metaMes ? Math.round(P.infMes / P.metaMes * 100) + '%' : dash}</td><td>${P.invTotal}</td></tr>
                </tbody></table>
            </div>
            <div class="vbox">
                <div class="vbox-t">Ranking de marcas en la tienda · ${P.storeMes} uds en el mes</div>
                <div class="brank">${P.brands.map(b => `<div class="${b.brand === 'INFINIX' ? 'own' : ''}"><b>#${b.pos}</b><i class="dot" style="background:${BRAND_COLORS[b.brand] || '#94A3B8'}"></i><span>${b.brand}</span><div class="brank-bar"><div style="width:${P.brands[0].mes ? Math.round(b.mes / P.brands[0].mes * 100) : 0}%;background:${BRAND_COLORS[b.brand] || '#94A3B8'}"></div></div><em>${b.mes} · ${b.share}%</em></div>`).join('') || '<p class="vtxt">Sin ventas registradas.</p>'}</div>
                <div class="pano-kpis">
                    <div><small>Posición Infinix</small><b>${P.pos ? '#' + P.pos : dash}</b></div>
                    <div><small>Inventario Infinix</small><b>${P.invTotal} uds</b></div>
                    <div><small>Semana actual</small><b>${P.infSem} uds</b><span>ant. ${P.prevSem}</span></div>
                    <div><small>Cierres del mes</small><b>${P.cierres}/${P.dayOfMonth}</b></div>
                </div>
                <div class="pano-notes">
                    ${low.length ? `<p><b>Referencias rezagadas:</b> ${low.map(m => `${esc(m.name)} (${m.cumpl}%)`).join(', ')}.</p>` : ''}
                    ${sinStock.length ? `<p class="r"><b>Sin inventario:</b> ${sinStock.map(m => esc(m.name)).join(', ')}.</p>` : '<p class="g"><b>Inventario:</b> todas las referencias con unidades.</p>'}
                </div>
            </div>
        </div>`;
    }

    const ph = fotos.filter(Boolean);
    const el = document.createElement('div');
    el.className = 'rp rp-m3';
    el.innerHTML = `
    <div class="rp-bar"></div>
    <header class="rp-head">
        <img class="rp-logo" src="${LOGO_INFINIX}" alt="Infinix">
        <div class="rp-head-mid">
            <div class="rp-kicker">REPORTE DE VISITA · ${doc.modo === 'formador' ? 'FORMACIÓN' : 'SUPERVISIÓN'}</div>
            <div class="rp-title">${esc(doc.tienda.toUpperCase())}</div>
            <div class="rp-sub">${esc(fechaLarga(doc.fecha))} · ${esc(doc.week)} · ${esc(doc.ciudad)} · Zona ${esc(doc.zona)}</div>
        </div>
        <div class="rp-chain">${chainLogo(doc.logoKey, doc.cadena)}</div>
    </header>
    <div class="v-meta">
        <div><small>Visita realizada por</small><b>${esc(doc.nombre)}</b><span>${ROLES[doc.rol] ? ROLES[doc.rol].label : ''}</span></div>
        <div><small>Promotor(es) en tienda</small>${doc.promotores.length && typeof advisorAvatar === 'function' ? `<div class="v-advs">${doc.promotores.slice(0, 3).map(n => `<span>${advisorAvatar(doc.storeId, n, 64)}<em>${esc(n.split(' ').slice(0, 2).join(' '))}</em></span>`).join('')}</div>` : `<b>${esc(doc.promotores.join(', ') || dash)}</b>`}<span>HC Infinix: ${int(f.hc)}</span></div>
    </div>

    <section class="rp-dash four">
        <div class="dcard hero"><div class="dcard-t">🔥 ROI DEL PROMOTOR</div>
            <div class="center">${ringCardHTML('rv-roi', 150, fmt1(doc.roi), 'actual')}</div>
            <div class="dfoot">Proyectado <b style="color:${semRoi.color}">${fmt1(doc.roiProj)}</b> <i class="pill ${semRoi.cls}">${semRoi.label}</i></div></div>
        <div class="dcard"><div class="dcard-t">META DEL DÍA</div>
            <div class="center">${ringCardHTML('rv-dia', 150, f.metaDia > 0 ? Math.round(cd * 100) + '%' : dash, 'cumplimiento')}</div>
            <div class="dfoot"><b>${int(f.ventaDia)}</b> de <b>${int(f.metaDia)}</b> uds hoy</div></div>
        <div class="dcard"><div class="dcard-t">ACUMULADO DEL MES</div>
            <div class="center">${ringCardHTML('rv-mes', 150, f.metaMes > 0 ? Math.round(cm * 100) + '%' : dash, 'cumplimiento')}</div>
            <div class="dfoot"><b>${venta}</b> de <b>${int(f.metaMes)}</b> uds · ${int(f.accMes)} accesorios</div></div>
        <div class="dcard"><div class="dcard-t">MARKET SHARE EN PDV</div>
            <div class="center">${ringCardHTML('rv-share', 150, f.auto === false ? dash : int(f.share) + '%', 'Infinix')}</div>
            <div class="dfoot">Participación en la tienda</div></div>
    </section>

    ${roleBlock}
    ${panoBlock}

    <div class="rp-sec">GESTIÓN, NOVEDADES Y COMPROMISOS</div>
    <div class="vbox good"><div class="vbox-t">Gestión lograda en visita</div><p class="vtxt">${lines(f.gestion)}</p></div>
    <div class="v-two">
        <div class="vbox bad"><div class="vbox-t">Novedades / alertas</div><p class="vtxt">${lines(f.alertas)}</p></div>
        <div class="vbox"><div class="vbox-t">Compromisos · cierre de semana</div><p class="vtxt">${lines(f.compromisos)}</p></div>
    </div>

    ${typeof DayStatus !== 'undefined' && storeById(doc.storeId) ? DayStatus.reportBlock([storeById(doc.storeId)], doc.fecha || todayStr(), 'ESTADO DE LOS ASESORES') : ''}
    ${ph.length ? `<div class="rp-sec">EVIDENCIAS FOTOGRÁFICAS</div><div class="v-fotos n${ph.length}">${ph.map(p => `<img src="${p}" alt="Evidencia">`).join('')}</div>` : ''}

    <footer class="rp-foot"><span>ROI = ventas del mes ÷ promotores (HC). Proyección con los días transcurridos del mes.</span><b>Infinix · Central de Operaciones</b></footer>
    <div class="rp-bar"></div>`;
    stage.appendChild(el);

    const roiMeta = f.metaMes > 0 && f.hc > 0 ? f.metaMes / f.hc : 0, top = Math.max(roiMeta, doc.roiProj, doc.roi);
    Charts.ring($('#rv-roi', el), [doc.roi, Math.max(0, doc.roiProj - doc.roi), Math.max(0, top - Math.max(doc.roi, doc.roiProj))], [semRoi.color, semRoi.color + '55', THEME.line]);
    Charts.ring($('#rv-dia', el), [Math.min(1, cd), 1 - Math.min(1, cd)], [semaforo(cd).color, THEME.line]);
    Charts.ring($('#rv-mes', el), [Math.min(1, cm), 1 - Math.min(1, cm)], [THEME.green, THEME.line]);
    Charts.ring($('#rv-share', el), [int(f.share), Math.max(0, 100 - int(f.share))], [THEME.green, THEME.line], { cutout: '64%' });
    if (doc.modo === 'formador') {
        const p = doc.evalPromedio || 0;
        Charts.ring($('#rv-eval', el), [p, 100 - p], [p >= 80 ? THEME.green : p >= 60 ? THEME.amber : THEME.red, THEME.line]);
    }
    return el;
}

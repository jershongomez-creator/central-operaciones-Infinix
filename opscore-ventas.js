// ============================================================================
// REPORTES DE VENTA (supervisor, formador, coordinador, gerente, admin)
// Sale de la data plana que cargó el propio líder (Análisis de zona). El día de cada venta es el de la CARGA
// (fecha y hora reales): lo que se carga después de las 7 p.m. el sistema lo pasa al día siguiente, aquí no.
//   · Status del día: meta del día, lo que debería llevar a la hora del corte, lo que lleva y su proyección.
//   · Venta 0: quién no ha vendido en el rango (hoy, ayer, fin de semana, últimos días, semana o rango libre).
//   · Día a día: venta de cada asesor por fecha.
//   · IMEI inactivos: por asesor, con referencia y fecha de venta, para pedir factura o soporte.
// Cada reporte se comparte como imagen o PDF, con un plan de acción según el rol de quien lo genera.
// ============================================================================

registerModule('ventas', (() => {
    let F = { zona: '', cadena: '', tienda: '', preset: 'hoy', desde: todayStr(), hasta: todayStr() }, tab = 'refs', view = null;
    const me = () => State.session;
    const HORA_ABRE = 10, HORA_CIERRA = 21;                  // jornada comercial para "a esta hora debería llevar"

    // ---- Rangos rápidos
    function presetRange(p) {
        const t = todayStr(), dow = parseD(t).getDay();
        if (p === 'hoy') return [t, t];
        if (p === 'ayer') return [addDays(t, -1), addDays(t, -1)];
        if (p === 'finde') { const sun = addDays(t, -(dow === 0 ? 7 : dow)); return [addDays(sun, -1), sun]; }    // sábado y domingo pasados
        if (p === '3d') return [addDays(t, -2), t];
        if (p === 'semana') return [weekDays(t)[0], t];
        if (p === 'mes') return [t.slice(0, 8) + '01', t];
        return [F.desde, F.hasta];
    }
    const days = (a, b) => { const out = []; for (let d = a; d <= b && out.length < 62; d = addDays(d, 1)) out.push(d); return out; };

    // ---- Datos
    const zonasF = () => F.zona ? [F.zona] : scopedZones();
    const storesF = () => scopedStores().filter(st => zonasF().includes(st.zona)).filter(st => !F.cadena || chainGroup(st).key === F.cadena).filter(st => !F.tienda || st.id === F.tienda);
    const snapOf = z => (State.zoneSnaps || {})[z] || null;
    const corteOf = () => { const S = zonasF().map(snapOf).filter(Boolean); const up = S.map(s => s.maxUpload || '').sort().pop() || ''; return { up, fecha: up.slice(0, 10) || S.map(s => s.corte || '').sort().pop() || '', hora: up.slice(11, 16), conHora: S.some(s => s.maxUpload), file: (S[0] || {}).fileName || '', owner: (S[0] || {}).ownerName || (S[0] || {}).uploadedBy || '' }; };
    const hasDr = () => storesF().some(st => { const Z = ZoneData.forStore(st.id); return Z && Z.dr; });
    function advisorsF() {
        return storesF().flatMap(st => activeAdvisors(st).map(a => ({ st, a, nombre: a.nombre, dr: a.dr || {}, lastAt: a.lastAt || '' })));
    }
    const ventaRango = (x, D) => sum(D.map(d => int(x.dr[d])));
    const lastSale = x => Object.keys(x.dr).filter(d => x.dr[d] > 0).sort().pop() || '';
    const offAll = (x, D) => typeof DayStatus !== 'undefined' && D.length && D.every(d => { const s = DayStatus.ofAdvisor(x.st, x.nombre, d); return s && s.off; });

    function status(fecha) {
        const C = corteOf(), Z = zonasF(), G = zoneGoal(Z, fecha);
        const S = storesF(), ventaHoy = sum(S.map(st => int(((ZoneData.forStore(st.id) || {}).dr || {})[fecha])));
        // Meta del día desde el inicio del día: lo que faltaba ayer ÷ días que quedaban (incluido hoy)
        const dim = daysInMonth(fecha.slice(0, 7)), rest = Math.max(1, dim - int(fecha.slice(8)) + 1);
        const meta = sum(S.map(storeMetaMes)), totMes = sum(S.map(st => int((ZoneData.forStore(st.id) || {}).total)));
        const metaDia = Math.ceil(Math.max(0, meta - (totMes - ventaHoy)) / rest);
        const h = C.fecha === fecha && C.hora ? int(C.hora.slice(0, 2)) + int(C.hora.slice(3, 5)) / 60 : (fecha < todayStr() ? HORA_CIERRA : new Date().getHours() + new Date().getMinutes() / 60);
        const frac = Math.min(1, Math.max(0.05, (h - HORA_ABRE) / (HORA_CIERRA - HORA_ABRE)));
        const deberia = Math.round(metaDia * frac), proy = Math.round(ventaHoy / frac);
        const A = advisorsF().map(x => ({ ...x, hoy: int(x.dr[fecha]), ds: typeof DayStatus !== 'undefined' ? DayStatus.ofAdvisor(x.st, x.nombre, fecha) : null }));
        const fuera = A.filter(x => x.ds && x.ds.off), activos = A.filter(x => !(x.ds && x.ds.off));
        return { fecha, C, G, meta, metaDia, ventaHoy, deberia, proy, frac, hora: C.fecha === fecha && C.hora ? C.hora : '', vendiendo: activos.filter(x => x.hoy > 0).sort((a, b) => b.hoy - a.hoy), cero: activos.filter(x => !x.hoy), fuera, total: A.length };
    }
    function cero(D) {
        const A = advisorsF().map(x => ({ ...x, v: ventaRango(x, D), last: lastSale(x) }));
        const c = corteOf().fecha, hasta = c && c < D[D.length - 1] ? c : D[D.length - 1], z = A.filter(x => !x.v);
        z.forEach(x => { x.sinVender = x.last ? Math.max(0, Math.round((parseD(hasta) - parseD(x.last)) / 864e5)) : null; x.novedad = offAll(x, D); });
        return { lista: z.filter(x => !x.novedad).sort((a, b) => (b.sinVender ?? 99) - (a.sinVender ?? 99) || a.st.tienda.localeCompare(b.st.tienda, 'es')), novedad: z.filter(x => x.novedad), total: A.length, conVenta: A.filter(x => x.v > 0).length };
    }
    function imei(D) {
        const set = new Set(D), out = {};
        storesF().forEach(st => { const Z = ZoneData.forStore(st.id); (Z && Z.inact || []).filter(r => set.has(r.f)).forEach(r => { const k = st.id + '|' + r.a; const g = out[k] = out[k] || { st, nombre: r.a, items: [] }; g.items.push(r); }); });
        return Object.values(out).sort((a, b) => b.items.length - a.items.length);
    }

    // ---- Venta por referencia y asesor en el rango, con el inventario de la tienda (último cierre)
    function refsData(D) {
        const dim = daysInMonth(D[D.length - 1].slice(0, 7)), C = corteOf(), day = Math.max(1, int((C.fecha || D[D.length - 1]).slice(8)));
        const groups = storesF().map(st => {
            const A = activeAdvisors(st).map(a => { const v = {}; let tot = 0; D.forEach(d => Object.entries((a.drr || {})[d] || {}).forEach(([k, q]) => { v[k] = (v[k] || 0) + q; tot += q; })); return { nombre: a.nombre, v, tot, ds: typeof DayStatus !== 'undefined' ? DayStatus.ofAdvisor(st, a.nombre, D[D.length - 1]) : null }; }).sort((a, b) => b.tot - a.tot);
            const venta = {}; A.forEach(a => Object.entries(a.v).forEach(([k, q]) => { venta[k] = (venta[k] || 0) + q; }));
            const Z = ZoneData.forStore(st.id);
            return { st, A, venta, inv: st.inventario || {}, mes: (Z && Z.ventas) || {}, tot: sum(Object.values(venta)) };
        }).filter(g => g.A.length).sort((a, b) => a.st.tienda.localeCompare(b.st.tienda, 'es'));
        const keys = INFINIX_MODELS.filter(m => groups.some(g => int(g.venta[m.key]) || int(g.inv[m.key]) || int(g.mes[m.key]))).map(m => m.key);
        const resumen = keys.map(k => { const inv = sum(groups.map(g => int(g.inv[k]))), v = sum(groups.map(g => int(g.venta[k]))), mes = sum(groups.map(g => int(g.mes[k]))), ritmo = mes / day;
            return { k, name: (INFINIX_MODELS.find(m => m.key === k) || {}).name || k, inv, v, mes, dias: inv > 0 && ritmo > 0 ? Math.round(inv / ritmo) : null, sinRotar: groups.filter(g => int(g.inv[k]) > 0 && !int(g.venta[k])).length }; });
        const hasDrr = storesF().some(st => activeAdvisors(st).some(a => a.drr && Object.keys(a.drr).length));
        return { groups, keys, resumen, hasDrr, day, dim };
    }
    const refShort = k => ((INFINIX_MODELS.find(m => m.key === k) || {}).name || k).replace(/^Note /i, 'N. ').replace(/ Pro\+$/i, ' P+');

    // ---- Plan de acción según quien genera el reporte
    function planAccion(rol, ctx) {
        const top = ctx.tiendas.slice(0, 3).map(t => t.tienda).join(', ') || 'los PDV en cero';
        const ref = ctx.foco ? ctx.foco : 'la referencia foco';
        const hora = ctx.hora ? `antes de las ${pad2(Math.min(20, int(ctx.hora.slice(0, 2)) + 2))}:00` : 'hoy mismo';
        if (rol === 'supervisor') return [
            `Llamar ${hora} a los ${ctx.n} asesores en cero: meta del día por asesor y compromiso de unidades.`,
            `Revisar mesa, exhibición y precios en ${top}; si hace falta, mover la mesa a zona caliente.`,
            `Charla con el líder de piso de los PDV con más de un asesor sin venta para ganar tráfico y referidos.`,
            `Corte de seguimiento a las 5:00 p. m. con planilla física y foto de la mesa.`,
            ctx.imei ? `${ctx.imei} IMEI sin activar: pedir factura o soporte al asesor hoy para no perder la venta.` : 'Confirmar que cada venta quede cargada en DCR con IMEI activo.'];
        if (rol === 'formador') return [
            `Mensaje de voz o llamada de 10 minutos con los ${ctx.n} asesores en cero: speech de apertura y cierre de ${ref}.`,
            `Role play de objeciones (precio, cuotas, competencia) con quien lleva más días sin vender.`,
            `Tip del día en el grupo: argumento estrella de ${ref} frente a la competencia del piso.`,
            `Acompañamiento en piso (venta asistida) en ${top} en la próxima visita.`,
            'Revisar la última evaluación de cada asesor en cero y reforzar el tema más bajo.'];
        return [
            `Escalar con supervisión los PDV con 2 o más días sin venta: ${top}.`,
            'Validar cobertura: compensatorios, incapacidades y vacantes que expliquen la venta en cero.',
            `Pedir corte a las 5:00 p. m. y plan de recuperación por zona para cerrar la meta del día (${ctx.metaDia || '—'} uds).`,
            ctx.imei ? `${ctx.imei} IMEI sin activar en el rango: seguimiento con supervisores para recuperar facturas.` : 'Seguimiento a IMEI sin activar en la siguiente carga.'];
    }

    // ---- Pantalla
    async function render(v) {
        view = v;
        await ZoneData.loadMany(scopedZones(), todayStr().slice(0, 7)).catch(() => { });
        if (!view.isConnected) return;
        const zs = scopedZones();
        v.innerHTML = `
        <section class="card">
            <div class="row between wrap"><div><h2 class="h2">Reportes de venta</h2><p class="mute" id="rv-src"></p></div><button class="btn btn-dark" id="rv-load">📂 Cargar data plana</button></div>
            <div class="rv-f">
                ${zs.length > 1 ? `<label><span class="lbl">Zona</span><select class="input" id="rv-zona"><option value="">Todas (${zs.length})</option>${zs.map(z => `<option ${F.zona === z ? 'selected' : ''}>${esc(z)}</option>`).join('')}</select></label>` : ''}
                <label><span class="lbl">Cadena</span><select class="input" id="rv-cad"></select></label>
                <label><span class="lbl">Tienda</span><select class="input" id="rv-tie"></select></label>
            </div>
            <div class="rv-pre">${[['hoy', 'Hoy'], ['ayer', 'Ayer'], ['finde', 'Fin de semana'], ['3d', 'Últimos 3 días'], ['semana', 'Esta semana'], ['mes', 'Mes'], ['rango', 'Rango']].map(([k, l]) => `<button class="chip-b ${F.preset === k ? 'on' : ''}" data-pre="${k}">${l}</button>`).join('')}
                <span class="rv-dates"><input type="date" class="input" id="rv-d" value="${F.desde}" max="${todayStr()}"><span>a</span><input type="date" class="input" id="rv-h" value="${F.hasta}" max="${todayStr()}"></span></div>
        </section>
        <section id="rv-status"></section>
        <nav class="ztabs" id="rv-tabs">${[['refs', '📱 Por referencia'], ['dia', '📅 Día a día'], ['imei', '📵 IMEI inactivos']].map(([k, l]) => `<button class="ztab ${tab === k ? 'on' : ''}" data-tab2="${k}">${l}</button>`).join('')}</nav>
        <section class="card" id="rv-body"></section>
        ${actionBarHTML()}`;
        $('#rv-load', v).onclick = () => { navigate('zona'); setTimeout(() => { const f = $('#z-file'); if (f) f.click(); }, 500); };
        v.addEventListener('change', e => {
            const id = e.target.id;
            if (id === 'rv-zona') { F.zona = e.target.value; F.cadena = ''; F.tienda = ''; }
            if (id === 'rv-cad') { F.cadena = e.target.value; F.tienda = ''; }
            if (id === 'rv-tie') F.tienda = e.target.value;
            if (id === 'rv-d' || id === 'rv-h') { F.preset = 'rango'; F.desde = $('#rv-d').value || todayStr(); F.hasta = $('#rv-h').value || F.desde; if (F.hasta < F.desde) [F.desde, F.hasta] = [F.hasta, F.desde]; }
            paint();
        });
        v.addEventListener('click', e => {
            const p = e.target.closest('[data-pre]'); if (p) { F.preset = p.dataset.pre; if (F.preset !== 'rango') [F.desde, F.hasta] = presetRange(F.preset); paint(); return; }
            const t = e.target.closest('[data-tab2]'); if (t) { tab = t.dataset.tab2; paint(); }
        });
        ReportActions.bind(v, {
            title: 'Reporte de venta · Central de Operaciones',
            validate: () => hasDr() ? null : 'Carga primero la data plana del día para generar el reporte.',
            filename: () => `Reporte_${tab === 'refs' ? 'Referencias' : tab === 'dia' ? 'DiaADia' : 'IMEI'}_${slug(F.tienda ? storeById(F.tienda).tienda : F.zona || zonasF().join('_'))}_${F.desde}${F.hasta !== F.desde ? '_' + F.hasta : ''}.png`,
            build: stage => buildVentasCanvas(stage, reportData(), me())
        });
        paint();
    }
    function paint() {
        if (!view || !view.isConnected) return;
        [F.desde, F.hasta] = F.preset === 'rango' ? [F.desde, F.hasta] : presetRange(F.preset);
        const cads = chainList(scopedStores().filter(st => zonasF().includes(st.zona)));
        $('#rv-cad').innerHTML = `<option value="">Todas</option>${cads.map(c => `<option value="${esc(c.key)}" ${F.cadena === c.key ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}`;
        const tiendas = scopedStores().filter(st => zonasF().includes(st.zona)).filter(st => !F.cadena || chainGroup(st).key === F.cadena);
        $('#rv-tie').innerHTML = `<option value="">Todas (${tiendas.length})</option>${tiendas.map(st => `<option value="${esc(st.id)}" ${F.tienda === st.id ? 'selected' : ''}>${esc(st.tienda)}</option>`).join('')}`;
        $$('[data-pre]').forEach(b => b.classList.toggle('on', b.dataset.pre === F.preset));
        $$('[data-tab2]').forEach(b => b.classList.toggle('on', b.dataset.tab2 === tab));
        $('#rv-d').value = F.desde; $('#rv-h').value = F.hasta;
        const C = corteOf();
        $('#rv-src').innerHTML = C.fecha ? `Tu data: <b>${esc(C.file || 'data plana')}</b> · último registro <b>${esc(C.fecha)}${C.hora ? ' ' + esc(C.hora) : ''}</b>${C.owner ? ' · cargada por ' + esc(C.owner) : ''}` : 'Aún no hay data plana cargada: cárgala para ver la venta del día.';
        if (!hasDr()) { $('#rv-status').innerHTML = ''; $('#rv-body').innerHTML = '<p class="empty">Esta data no trae la venta por día y hora de carga. Vuelve a cargar la data plana (Shop Sales Query) desde aquí o desde el Análisis de zona.</p>'; return; }
        const S = status(F.hasta);
        $('#rv-status').innerHTML = (C.fecha && F.hasta > C.fecha ? `<div class="ds-nomalla">⚠️ Tu data llega hasta el <b>${esc(C.fecha)}${C.hora ? ' ' + esc(C.hora) : ''}</b>: lo de ${F.hasta === todayStr() ? 'hoy' : 'después'} aún no está cargado. Carga la data plana del momento para ver el corte real.</div>` : '') + statusHTML(S);
        const D = days(F.desde, F.hasta);
        $('#rv-body').innerHTML = tab === 'refs' ? refsHTML(refsData(D)) : tab === 'cero' ? ceroHTML(cero(D), D) : tab === 'dia' ? diaHTML(D) : imeiHTML(imei(D), D);
    }
    const rangoTxt = () => F.desde === F.hasta ? fechaLarga(F.desde) : `${fechaLarga(F.desde)} a ${fechaLarga(F.hasta)}`;
    function statusHTML(S) {
        const pc = v => Math.round(v * 100) + '%', ritmo = S.deberia ? S.ventaHoy / S.deberia : null;
        return `<div class="card rv-status"><div class="row between wrap"><h3 class="h3">⏱️ Status de venta · ${esc(fechaLarga(S.fecha))}${S.hora ? ` · corte ${esc(S.hora)}` : ''}</h3><small class="mute">${esc(zonasF().join(', '))}</small></div>
            <div class="zg-kpis">
                <div class="hl"><span>Meta del día</span><b>${S.metaDia}</b><em>uds para ir al 100%</em></div>
                <div><span>A esta hora debería llevar</span><b>${S.deberia}</b><em>${Math.round(S.frac * 100)}% de la jornada</em></div>
                <div><span>Lleva</span><b class="${ritmo == null ? '' : ritmo >= 1 ? 'g' : ritmo >= .7 ? 'a' : 'r'}">${S.ventaHoy}</b><em>${ritmo == null ? '' : pc(ritmo) + ' de lo esperado'}</em></div>
                <div><span>Proyección del día</span><b>${S.proy}</b><em>${S.metaDia ? pc(S.proy / S.metaDia) + ' de la meta' : ''}</em></div>
                <div><span>Asesores</span><b>${S.vendiendo.length}<small>/${S.total - S.fuera.length}</small></b><em>vendiendo · ${S.cero.length} en cero · ${S.fuera.length} fuera</em></div>
            </div></div>`;
    }
    const advRow = (x, extra) => `<div class="ds-row"><span>${typeof advisorAvatar === 'function' ? advisorAvatar(x.st.id, x.nombre, 30) : ''}<b>${esc(x.nombre)}</b> <small class="mute">${esc(x.st.tienda)} · ${esc(chainGroup(x.st).label)}</small></span>${extra}</div>`;
    function ceroHTML(R, D) {
        return `<div class="row between wrap"><h3 class="h3">🚫 Venta 0 · ${esc(rangoTxt())}</h3><b>${R.lista.length} de ${R.total} asesores</b></div>
            <p class="hint">Sin unidades cargadas en el rango (día real de carga). ${R.novedad.length ? `${R.novedad.length} más sin venta están compensando o con novedad todo el rango y se muestran aparte.` : ''}</p>
            <div class="ds-list">${R.lista.map(x => advRow(x, `<em class="rv-dias ${x.sinVender == null || x.sinVender >= 3 ? 'r' : 'a'}">${x.sinVender == null ? 'sin ventas en el mes' : x.sinVender === 0 ? 'vendió antes en el día' : `${x.sinVender} día${x.sinVender > 1 ? 's' : ''} sin vender`}${x.last ? ` · última ${esc(x.last.slice(5))}` : ''}</em>`)).join('') || '<p class="empty">🎉 Todos los asesores tienen venta en el rango.</p>'}</div>
            ${R.novedad.length ? `<h4 class="sec">Sin venta por compensatorio o novedad</h4><div class="ds-list">${R.novedad.map(x => advRow(x, DayStatus.chip(DayStatus.ofAdvisor(x.st, x.nombre, D[D.length - 1])))).join('')}</div>` : ''}`;
    }
    function refsHTML(R) {
        if (!R.hasDrr) return '<p class="empty">Para ver la venta por referencia de cada asesor y día, vuelve a cargar la data plana (desde esta versión se guarda la referencia por día).</p>';
        const cell = (q, inv) => `<td class="${q ? 'g' : int(inv) > 0 ? 'z' : 'n'}">${q || 0}</td>`;
        return `<div class="row between wrap"><h3 class="h3">📱 Venta por referencia · ${esc(rangoTxt())}</h3><b>${sum(R.groups.map(g => g.tot))} uds · ${R.groups.length} PDV</b></div>
            <details class="acc" open><summary><span>📦 Inventario vs. venta por referencia</span></summary>
            <div class="tbl-scroll"><table class="tbl compact"><thead><tr><th>Referencia</th><th>Inventario</th><th>Venta rango</th><th>Venta mes</th><th>Días de inventario</th><th>PDV con inventario sin vender</th></tr></thead><tbody>
            ${R.resumen.map(r => `<tr><td class="l"><b>${esc(r.name)}</b></td><td><b>${r.inv}</b></td><td><b class="${r.v ? 'g' : r.inv ? 'r' : ''}">${r.v}</b></td><td>${r.mes}</td><td>${r.dias == null ? (r.inv ? '<i class="pill bad">sin rotación</i>' : '—') : `<i class="pill ${r.dias > 30 ? 'bad' : r.dias > 15 ? 'warn' : 'ok'}">${r.dias} d</i>`}</td><td>${r.sinRotar ? `<b class="r">${r.sinRotar}</b>` : '0'}</td></tr>`).join('')}</tbody></table></div></details>
            ${R.groups.map(g => `<details class="acc rv-refst" ${R.groups.length <= 6 ? 'open' : ''}><summary><span>${storeLogo(g.st, 'xs')} <b>${esc(g.st.tienda)}</b> · ${g.tot} uds</span></summary>
                <div class="tbl-scroll"><table class="tbl compact rv-grid"><thead><tr><th>Asesor</th>${R.keys.map(k => `<th>${esc(refShort(k))}</th>`).join('')}<th>Total</th></tr></thead><tbody>
                <tr class="rv-inv"><td class="l">📦 Inventario</td>${R.keys.map(k => `<td><b>${int(g.inv[k])}</b></td>`).join('')}<td><b>${sum(R.keys.map(k => int(g.inv[k])))}</b></td></tr>
                <tr class="rv-sum"><td class="l">🛒 Venta tienda</td>${R.keys.map(k => `<td><b>${int(g.venta[k])}</b></td>`).join('')}<td><b>${g.tot}</b></td></tr>
                ${g.A.map(a => `<tr><td class="l"><b>${esc(a.nombre)}</b>${a.ds && a.ds.off ? ' ' + DayStatus.chip(a.ds) : ''}</td>${R.keys.map(k => cell(int(a.v[k]), g.inv[k])).join('')}<td><b>${a.tot}</b></td></tr>`).join('')}
                </tbody></table></div></details>`).join('') || '<p class="empty">Sin asesores en el filtro.</p>'}
            <p class="hint">0 en rojo = la tienda tiene inventario de esa referencia y el asesor no la vendió en el rango. Inventario = último cierre de la tienda. Días de inventario = inventario ÷ venta diaria del mes.</p>`;
    }
    function diaHTML(D) {
        const A = advisorsF().map(x => ({ ...x, v: ventaRango(x, D) })).sort((a, b) => a.v - b.v || a.st.tienda.localeCompare(b.st.tienda, 'es'));
        const cols = D.slice(-14);
        return `<h3 class="h3">📅 Venta por asesor y día · ${esc(rangoTxt())}</h3>${D.length > 14 ? '<p class="hint">Se muestran los últimos 14 días del rango.</p>' : ''}
            <div class="tbl-scroll"><table class="tbl compact rv-grid"><thead><tr><th>Asesor</th><th>Tienda</th>${cols.map(d => `<th>${DIAS_CORTO[(parseD(d).getDay() + 6) % 7]}<br>${d.slice(8)}</th>`).join('')}<th>Total</th></tr></thead><tbody>
            ${A.map(x => `<tr><td class="l"><b>${esc(x.nombre)}</b></td><td class="l"><small>${esc(x.st.tienda)}</small></td>${cols.map(d => { const n = int(x.dr[d]), ds = typeof DayStatus !== 'undefined' ? DayStatus.ofAdvisor(x.st, x.nombre, d) : null; return `<td class="${n ? 'g' : ds && ds.off ? 'off' : 'z'}" title="${ds ? esc(ds.label) : ''}">${n || (ds && ds.off ? '—' : 0)}</td>`; }).join('')}<td><b>${x.v}</b></td></tr>`).join('')}
            </tbody></table></div><p class="hint">0 en rojo = día sin venta · — = compensando o con novedad (malla).</p>`;
    }
    function imeiHTML(L, D) {
        const n = sum(L.map(g => g.items.length));
        return `<div class="row between wrap"><h3 class="h3">📵 IMEI sin activar · ${esc(rangoTxt())}</h3><b>${n} IMEI · ${L.length} asesores</b></div>
            <p class="hint">Ventas cargadas con el IMEI sin activar. El asesor debe enviar la factura o el soporte para no perder la venta.</p>
            ${L.map(g => `<div class="rv-imei"><div class="row between"><span>${advRow({ st: g.st, nombre: g.nombre }, '')}</span><b>${g.items.length}</b></div>
                <table class="tbl compact"><tbody>${g.items.map(r => `<tr><td class="l"><code>${esc(r.imei || '—')}</code></td><td class="l">${esc(r.ref || '')}</td><td>${esc((r.f || '').slice(5))}${r.h ? ' ' + esc(r.h) : ''}</td></tr>`).join('')}</tbody></table></div>`).join('') || '<p class="empty">Sin IMEI inactivos en el rango.</p>'}`;
    }
    function reportData() {
        const D = days(F.desde, F.hasta), S = status(F.hasta), R = cero(D), I = imei(D), RF = refsData(D);
        const byStore = {}; R.lista.forEach(x => { byStore[x.st.id] = byStore[x.st.id] || { tienda: x.st.tienda, n: 0 }; byStore[x.st.id].n++; });
        const zs = storesF(), refs = INFINIX_MODELS.map(m => ({ name: m.name, gap: sum(zs.map(st => int(st.metas && st.metas[m.key]) - int(((ZoneData.forStore(st.id) || {}).ventas || {})[m.key]))) })).sort((a, b) => b.gap - a.gap);
        const ctx = { n: R.lista.length, tiendas: Object.values(byStore).sort((a, b) => b.n - a.n), foco: refs[0] && refs[0].gap > 0 ? refs[0].name : '', hora: S.hora, metaDia: S.metaDia, imei: sum(I.map(g => g.items.length)) };
        const C = corteOf();
        const lentas = RF.resumen.filter(r => r.inv > 0).sort((a, b) => (b.dias ?? 999) - (a.dias ?? 999)).slice(0, 2);
        const planR = tab === 'refs' && lentas.length ? lentas.map(r => `${r.name}: ${r.inv} uds en inventario y ${r.v} vendidas en el rango${r.sinRotar ? ` (${r.sinRotar} PDV sin venderla)` : ''}. Presión con cada asesor que tiene 0: meta de 1 unidad hoy, demo en mesa y argumento frente a la competencia.`) : [];
        return { tab, F: { ...F }, D, S, R, I, RF, aviso: C.fecha && F.hasta > C.fecha ? `Data hasta el ${C.fecha}${C.hora ? ' ' + C.hora : ''}` : '', plan: planR.concat(planAccion(me().rol, ctx)).slice(0, 6), zonas: zonasF(), filtro: [F.cadena ? (chainList(scopedStores()).find(c => c.key === F.cadena) || {}).label : '', F.tienda ? storeById(F.tienda).tienda : ''].filter(Boolean).join(' · '), rango: rangoTxt(), dayList: D };
    }
    return { render, onData: () => { if (view && view.isConnected && !$('#modal-root').children.length) paint(); } };
})());

// ---------- Lienzo del reporte de venta (para compartir en los grupos) ----------
function buildVentasCanvas(stage, d, autor) {
    const S = d.S, dash = '—', pc = v => Math.round(v * 100) + '%', ritmo = S.deberia ? S.ventaHoy / S.deberia : null;
    const kind = d.tab === 'refs' ? 'VENTA POR REFERENCIA' : d.tab === 'cero' ? 'VENTA 0' : d.tab === 'dia' ? 'VENTA DÍA A DÍA' : 'IMEI SIN ACTIVAR';
    const row0 = x => `<tr><td class="l"><b>${esc(x.nombre)}</b></td><td class="l">${esc(x.st.tienda)}</td><td class="l small">${esc(chainGroup(x.st).label)}</td><td class="c-tot ${x.sinVender == null || x.sinVender >= 3 ? 'r' : 'a'}">${x.sinVender == null ? 'sin ventas' : x.sinVender === 0 ? 'hoy' : x.sinVender + ' d'}</td><td>${x.last ? esc(x.last.slice(5)) : dash}</td></tr>`;
    const cols = d.dayList.slice(-14);
    let body = '';
    if (d.tab === 'cero') body = `<div class="rp-sec">ASESORES EN VENTA 0 · ${esc(d.rango.toUpperCase())} · ${d.R.lista.length} DE ${d.R.total}</div>
        <table class="rp-tbl sp-tbl"><thead><tr><th class="l">ASESOR</th><th class="l">TIENDA</th><th class="l">CADENA</th><th class="c-tot">SIN VENDER</th><th>ÚLTIMA VENTA</th></tr></thead><tbody>${d.R.lista.map(row0).join('') || '<tr><td colspan="5">Todos los asesores tienen venta en el rango 🎉</td></tr>'}</tbody></table>
        ${d.R.novedad.length ? `<p class="rv-note">Sin venta por compensatorio o novedad: ${d.R.novedad.map(x => esc(x.nombre.split(' ').slice(0, 2).join(' '))).join(', ')}.</p>` : ''}`;
    else if (d.tab === 'refs') { const R = d.RF, nm = k => ((INFINIX_MODELS.find(m => m.key === k) || {}).name || k);
        body = `<div class="rp-sec">INVENTARIO VS. VENTA POR REFERENCIA · ${esc(d.rango.toUpperCase())}</div>
        <table class="rp-tbl sp-tbl"><thead><tr><th class="l">REFERENCIA</th><th>INVENTARIO</th><th class="c-tot">VENTA RANGO</th><th>VENTA MES</th><th>DÍAS DE INVENTARIO</th><th>PDV SIN VENDER</th></tr></thead><tbody>${R.resumen.map(r => `<tr><td class="l"><b>${esc(r.name)}</b></td><td><b>${r.inv}</b></td><td class="c-tot ${r.v ? '' : r.inv ? 'r' : ''}"><b>${r.v}</b></td><td>${r.mes}</td><td class="${r.dias == null ? (r.inv ? 'r' : '') : r.dias > 30 ? 'r' : r.dias > 15 ? 'a' : 'g'}">${r.dias == null ? (r.inv ? 'sin rotación' : dash) : r.dias + ' d'}</td><td class="${r.sinRotar ? 'r' : ''}">${r.sinRotar}</td></tr>`).join('')}</tbody></table>
        ${R.groups.map(g => `<div class="rp-sec light">${esc(g.st.tienda.toUpperCase())} · ${g.tot} UDS</div>
        <table class="rp-tbl sp-tbl rv-gridp"><thead><tr><th class="l">ASESOR</th>${R.keys.map(k => `<th>${esc(nm(k).toUpperCase())}</th>`).join('')}<th class="c-tot">TOTAL</th></tr></thead><tbody>
        <tr class="rv-inv"><td class="l"><b>📦 INVENTARIO</b></td>${R.keys.map(k => `<td><b>${int(g.inv[k])}</b></td>`).join('')}<td class="c-tot"><b>${sum(R.keys.map(k => int(g.inv[k])))}</b></td></tr>
        <tr class="rv-sum"><td class="l"><b>🛒 VENTA TIENDA</b></td>${R.keys.map(k => `<td><b>${int(g.venta[k])}</b></td>`).join('')}<td class="c-tot"><b>${g.tot}</b></td></tr>
        ${g.A.map(a => `<tr><td class="l"><b>${esc(a.nombre)}</b></td>${R.keys.map(k => { const q = int(a.v[k]); return `<td class="${q ? 'g' : int(g.inv[k]) > 0 ? 'r' : ''}">${q}</td>`; }).join('')}<td class="c-tot"><b>${a.tot}</b></td></tr>`).join('')}</tbody></table>`).join('')}`; }
    else if (d.tab === 'dia') { const A = advisorsAll(d); body = `<div class="rp-sec">VENTA POR ASESOR Y DÍA · ${esc(d.rango.toUpperCase())}</div>
        <table class="rp-tbl sp-tbl rv-gridp"><thead><tr><th class="l">ASESOR</th><th class="l">TIENDA</th>${cols.map(x => `<th>${x.slice(8)}</th>`).join('')}<th class="c-tot">TOTAL</th></tr></thead><tbody>${A.map(x => `<tr><td class="l"><b>${esc(x.nombre)}</b></td><td class="l small">${esc(x.st.tienda)}</td>${cols.map(c => `<td class="${int(x.dr[c]) ? '' : 'r'}">${int(x.dr[c])}</td>`).join('')}<td class="c-tot"><b>${sum(cols.map(c => int(x.dr[c])))}</b></td></tr>`).join('')}</tbody></table>`; }
    else body = `<div class="rp-sec">IMEI SIN ACTIVAR · ${esc(d.rango.toUpperCase())} · ${sum(d.I.map(g => g.items.length))} IMEI</div>
        <div class="rv-imeip">${d.I.map(g => `<div><div class="rv-ih"><b>${esc(g.nombre)}</b><small>${esc(g.st.tienda)}</small><em>${g.items.length}</em></div><table><tbody>${g.items.map(r => `<tr><td>${esc(r.imei || dash)}</td><td>${esc(r.ref || '')}</td><td>${esc((r.f || '').slice(5))}</td></tr>`).join('')}</tbody></table></div>`).join('') || '<p>Sin IMEI inactivos en el rango.</p>'}</div>`;
    const el = document.createElement('div'); el.className = 'rp sp rv-rep';
    el.innerHTML = `<div class="rp-bar"></div>
    <header class="rp-head"><img class="rp-logo" src="${LOGO_INFINIX}" alt="Infinix">
        <div class="rp-head-mid"><div class="rp-kicker">REPORTE DE VENTA · ${kind}</div><div class="rp-title">${esc(d.zonas.join(' · ').toUpperCase())}</div><div class="rp-sub">${esc(d.rango)}${S.hora ? ` · corte ${esc(S.hora)}` : ''}${d.filtro ? ' · ' + esc(d.filtro) : ''}${d.aviso ? ` · <b style="color:#B45309">${esc(d.aviso)}</b>` : ''}</div></div>
        <div class="pl-who"><b>${esc(autor.nombre)}</b><small>${ROLES[autor.rol] ? ROLES[autor.rol].label : ''}</small></div></header>
    <div class="sp-band">
        <div class="hero"><span>META DEL DÍA</span><b>${S.metaDia}</b><em>${esc(fechaLarga(S.fecha))}</em></div>
        <div><span>Debería llevar</span><b>${S.deberia}</b><em>${S.hora ? 'a las ' + esc(S.hora) : 'a esta hora'}</em></div>
        <div><span>Lleva</span><b class="${ritmo == null ? '' : ritmo >= 1 ? 'g' : ritmo >= .7 ? 'a' : 'r'}">${S.ventaHoy}</b><em>${ritmo == null ? '' : pc(ritmo) + ' de lo esperado'}</em></div>
        <div><span>Proyección día</span><b>${S.proy}</b><em>${S.metaDia ? pc(S.proy / S.metaDia) + ' de la meta' : ''}</em></div>
        <div><span>Vendiendo</span><b>${S.vendiendo.length}</b><em>asesores</em></div>
        <div class="${S.cero.length ? 'bad' : 'ok'}"><span>En cero hoy</span><b>${S.cero.length}</b><em>${S.fuera.length} fuera del PDV</em></div>
    </div>
    ${S.vendiendo.length ? `<div class="rv-top"><span>🏆 Van vendiendo:</span> ${S.vendiendo.slice(0, 6).map(x => `<b>${esc(x.nombre.split(' ').slice(0, 2).join(' '))}</b> ${x.hoy}`).join(' · ')}</div>` : ''}
    ${body}
    <div class="rp-sec">PLAN DE ACCIÓN · ${esc((ROLES[autor.rol] ? ROLES[autor.rol].label : '').toUpperCase())}</div>
    <ol class="rv-plan">${d.plan.map(t => `<li>${esc(t)}</li>`).join('')}</ol>
    <footer class="rp-foot"><span>Día de la venta = fecha y hora de carga en DCR (lo cargado después de las 7 p. m. cuenta el día en que se vendió). Meta del día = (meta del mes − venta hasta ayer) ÷ días que quedan. Debería llevar = meta del día × parte de la jornada (10 a. m. a 9 p. m.) transcurrida al corte.</span><b>Infinix · Central de Operaciones</b></footer><div class="rp-bar"></div>`;
    stage.appendChild(el); return el;
}
const advisorsAll = d => scopedStores().filter(st => d.zonas.includes(st.zona)).filter(st => !d.F.cadena || chainGroup(st).key === d.F.cadena).filter(st => !d.F.tienda || st.id === d.F.tienda)
    .flatMap(st => activeAdvisors(st).map(a => ({ st, nombre: a.nombre, dr: a.dr || {} }))).sort((a, b) => sum(Object.values(a.dr)) - sum(Object.values(b.dr)));

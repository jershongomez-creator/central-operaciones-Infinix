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
    let F = { zona: '', cadena: '', tienda: '', preset: 'hoy', desde: todayStr(), hasta: todayStr() }, tab = 'refs', view = null, refDet = false;
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
        return storesF().flatMap(st => activeAdvisors(st).map(a => ({ st, a, nombre: a.nombre, dr: a.dr || {}, drr: a.drr || {}, lastAt: a.lastAt || '' })));
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

    // ---- Meta del día del asesor (total y por referencia): lo que le falta hasta ayer ÷ días que quedan (incluido hoy),
    // redondeado hacia arriba (+1 si queda fracción). Solo referencias con meta para el asesor.
    let advCache = {};
    function advDiag(st, nombre) { const L = advCache[st.id] = advCache[st.id] || (typeof Advisor !== 'undefined' ? Advisor.forStore(st) : []); return L.find(d => d.id === `${st.id}|${slug(nombre)}`) || L.find(d => sameAdvisor({ nombre: d.nombre }, { nombre })) || null; }
    function metaDia(x, fecha) {
        const D = advDiag(x.st, x.nombre); if (!D) return null;
        const ym = fecha.slice(0, 7), rest = Math.max(1, daysInMonth(ym) - int(fecha.slice(8)) + 1), antes = d => d.slice(0, 7) === ym && d < fecha;
        const vAntes = sum(Object.entries(x.dr || {}).filter(([d]) => antes(d)).map(([, v]) => int(v)));
        const tot = D.pacing.meta > 0 ? Math.ceil(Math.max(0, D.pacing.meta - vAntes) / rest) : null, refs = {};
        (D.inventario.modelos || []).forEach(m => { if (!m.meta) return; const va = sum(Object.entries(x.drr || {}).filter(([d]) => antes(d)).map(([, r]) => int(r[m.key]))); refs[m.key] = Math.ceil(Math.max(0, m.meta - va) / rest); });
        return { tot, refs, meta: D.pacing.meta, rest };
    }
    // Crecimiento contra la semana anterior: lunes a la fecha de esta semana vs. los mismos días de la anterior
    function wow(dr, fecha, key) {
        const wd = weekDays(fecha), n = (parseD(fecha).getDay() + 6) % 7, val = d => key ? int(((dr || {})[d] || {})[key]) : int((dr || {})[d]);
        const cur = sum(wd.slice(0, n + 1).map(val)), prev = sum(weekDays(addDays(wd[0], -1)).slice(0, n + 1).map(val));
        return { cur, prev, pct: prev ? (cur - prev) / prev : (cur ? null : 0) };
    }

    // ---- Venta por referencia y asesor en el rango, con el inventario de la tienda (último cierre)
    function refsData(D) {
        const dim = daysInMonth(D[D.length - 1].slice(0, 7)), C = corteOf(), day = Math.max(1, int((C.fecha || D[D.length - 1]).slice(8)));
        const groups = storesF().map(st => {
            const A = activeAdvisors(st).map(a => { const v = {}; let tot = 0; D.forEach(d => Object.entries((a.drr || {})[d] || {}).forEach(([k, q]) => { v[k] = (v[k] || 0) + q; tot += q; })); const x = { st, nombre: a.nombre, dr: a.dr || {}, drr: a.drr || {} }; return { nombre: a.nombre, v, tot, md: metaDia(x, D[D.length - 1]), w: wow(a.dr, D[D.length - 1]), ds: typeof DayStatus !== 'undefined' ? DayStatus.ofAdvisor(st, a.nombre, D[D.length - 1]) : null }; }).sort((a, b) => b.tot - a.tot);
            const venta = {}; A.forEach(a => Object.entries(a.v).forEach(([k, q]) => { venta[k] = (venta[k] || 0) + q; }));
            const Z = ZoneData.forStore(st.id);
            return { st, A, venta, inv: st.inventario || {}, mes: (Z && Z.ventas) || {}, tot: sum(Object.values(venta)) };
        }).filter(g => g.A.length).sort((a, b) => a.st.tienda.localeCompare(b.st.tienda, 'es'));
        const keys = INFINIX_MODELS.filter(m => groups.some(g => int((g.st.metas || {})[m.key]) > 0)).map(m => m.key);      // solo referencias con target
        const resumen = keys.map(k => { const inv = sum(groups.map(g => int(g.inv[k]))), v = sum(groups.map(g => int(g.venta[k]))), mes = sum(groups.map(g => int(g.mes[k]))), ritmo = mes / day;
            return { k, name: (INFINIX_MODELS.find(m => m.key === k) || {}).name || k, inv, v, mes, dias: inv > 0 && ritmo > 0 ? Math.round(inv / ritmo) : null, sinRotar: groups.filter(g => int(g.inv[k]) > 0 && !int(g.venta[k])).length }; });
        const hasDrr = storesF().some(st => activeAdvisors(st).some(a => a.drr && Object.keys(a.drr).length));
        const flat = groups.flatMap(g => g.A.map(a => ({ ...a, st: g.st, inv: g.inv }))).sort((a, b) => b.tot - a.tot || a.nombre.localeCompare(b.nombre, 'es'));      // del que más vende al que menos
        return { groups, keys, resumen, hasDrr, day, dim, flat, det: refDet };
    }
    const wowCell = w => !w ? '—' : w.pct == null ? '<i class="pill ok">▲ nuevo</i>' : `<i class="pill ${w.pct > 0.005 ? 'ok' : w.pct < -0.005 ? 'bad' : ''}">${w.pct > 0.005 ? '▲' : w.pct < -0.005 ? '▼' : '='} ${Math.round(w.pct * 100)}% <small>(${w.cur} vs ${w.prev})</small></i>`;
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
        const dk = takeDeep('ventas'); if (dk) { tab = dk; if (dk === 'imei') F.preset = 'mes'; }
        facs = null;
        await ZoneData.loadMany(scopedZones(), todayStr().slice(0, 7)).catch(() => { });
        if (!view.isConnected) return;
        const zs = scopedZones();
        v.innerHTML = `
        <section class="card">
            ${hubBack()}<div class="row between wrap"><div><h2 class="h2">Reportes de venta</h2><p class="mute" id="rv-src"></p></div><button class="btn btn-dark" id="rv-load">📂 Cargar data plana</button></div>
            <div class="rv-f">
                ${zs.length > 1 ? `<label><span class="lbl">Zona</span><select class="input" id="rv-zona"><option value="">Todas (${zs.length})</option>${zs.map(z => `<option ${F.zona === z ? 'selected' : ''}>${esc(z)}</option>`).join('')}</select></label>` : ''}
                <label><span class="lbl">Cadena</span><select class="input" id="rv-cad"></select></label>
                <label><span class="lbl">Tienda</span><select class="input" id="rv-tie"></select></label>
            </div>
            <div class="rv-pre">${[['hoy', 'Hoy'], ['ayer', 'Ayer'], ['finde', 'Fin de semana'], ['3d', 'Últimos 3 días'], ['semana', 'Esta semana'], ['mes', 'Mes'], ['rango', 'Rango']].map(([k, l]) => `<button class="chip-b ${F.preset === k ? 'on' : ''}" data-pre="${k}">${l}</button>`).join('')}
                <span class="rv-dates"><input type="date" class="input" id="rv-d" value="${F.desde}" max="${todayStr()}"><span>a</span><input type="date" class="input" id="rv-h" value="${F.hasta}" max="${todayStr()}"></span></div>
        </section>
        <section id="rv-status"></section>
        <nav class="ztabs" id="rv-tabs">${[['refs', '📱 Por referencia'], ['dia', '📅 Día a día'], ['explorar', '🔎 Explorador'], ['imei', '📵 IMEI inactivos']].map(([k, l]) => `<button class="ztab ${tab === k ? 'on' : ''}" data-tab2="${k}">${l}</button>`).join('')}</nav>
        <section class="card" id="rv-body"></section>
        ${actionBarHTML()}`;
        $('#rv-load', v).onclick = () => { navigate('zona'); setTimeout(() => { const f = $('#z-file'); if (f) f.click(); }, 500); };
        v.addEventListener('change', e => {
            const id = e.target.id;
            if (id === 'rv-zona') { F.zona = e.target.value; F.cadena = ''; F.tienda = ''; }
            if (id === 'rv-cad') { F.cadena = e.target.value; F.tienda = ''; }
            if (id === 'rv-tie') F.tienda = e.target.value;
            if (id === 'rv-refdet') refDet = e.target.checked;
            if (id === 'rv-d' || id === 'rv-h') { F.preset = 'rango'; F.desde = $('#rv-d').value || todayStr(); F.hasta = $('#rv-h').value || F.desde; if (F.hasta < F.desde) [F.desde, F.hasta] = [F.hasta, F.desde]; }
            paint();
        });
        v.addEventListener('click', e => {
            const p = e.target.closest('[data-pre]'); if (p) { F.preset = p.dataset.pre; if (F.preset !== 'rango') [F.desde, F.hasta] = presetRange(F.preset); paint(); return; }
            const t = e.target.closest('[data-tab2]'); if (t) { tab = t.dataset.tab2; paint(); return; }
            const fd = e.target.closest('[data-facdl]'); if (fd) { const d = (facs || []).find(f => f.id === fd.dataset.facdl); if (d) docDownload(d, docFileName(d, `factura_${slug(d.asesor || '')}_${d.imei}`)); return; }
            if (e.target.id === 'rv-facall') { (async () => { const b = e.target; busy(b, true); const D = days(F.desde, F.hasta), I = imei(D), list = []; I.forEach(g => g.items.forEach(r => { const f = facOf(g.st, r); if (f) list.push(f); })); for (const d of list) { await docDownload(d, docFileName(d, `factura_${slug(d.asesor || '')}_${d.imei}`)); await new Promise(r => setTimeout(r, 450)); } busy(b, false); })(); }
        });
        ReportActions.bind(v, {
            title: 'Reporte de venta · Central de Operaciones',
            validate: () => hasDr() ? null : 'Carga primero la data plana del día para generar el reporte.',
            filename: () => `Reporte_${tab === 'refs' ? 'Referencias' : tab === 'dia' ? 'DiaADia' : tab === 'explorar' ? 'Explorador_' + X.by : 'IMEI'}_${slug(F.tienda ? storeById(F.tienda).tienda : F.zona || zonasF().join('_'))}_${F.desde}${F.hasta !== F.desde ? '_' + F.hasta : ''}.png`,
            build: stage => tab === 'explorar' ? buildExplorerCanvas(stage, explorerData(days(F.desde, F.hasta)), me(), { rango: rangoTxt(), scope: F.tienda ? storeById(F.tienda).tienda : F.zona || zonasF().join(', ') }) : buildVentasCanvas(stage, reportData(), me())
        });
        v.addEventListener('change', e => {
            const t = e.target;
            if (t.dataset.xby !== undefined) { X.by = t.value; paint(); }
            if (t.id === 'xp-ase') { X.asesor = t.value; paint(); }
            if (t.id === 'xp-sin') { X.sinVenta = t.checked; paint(); }
            if (t.id === 'xp-cols') { X.cols = t.value; paint(); }
        });
        v.addEventListener('click', e => { const r = e.target.closest('[data-xref]'); if (!r) return; const k = r.dataset.xref; X.refs = k === '*' ? [] : X.refs.includes(k) ? X.refs.filter(x => x !== k) : X.refs.concat(k); paint(); });
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
        advCache = {};
        const S = status(F.hasta);
        $('#rv-status').innerHTML = (C.fecha && F.hasta > C.fecha ? `<div class="ds-nomalla">⚠️ Tu data llega hasta el <b>${esc(C.fecha)}${C.hora ? ' ' + esc(C.hora) : ''}</b>: lo de ${F.hasta === todayStr() ? 'hoy' : 'después'} aún no está cargado. Carga la data plana del momento para ver el corte real.</div>` : '') + statusHTML(S);
        const D = days(F.desde, F.hasta);
        $('#rv-body').innerHTML = tab === 'refs' ? refsHTML(refsData(D)) : tab === 'cero' ? ceroHTML(cero(D), D) : tab === 'dia' ? diaHTML(D) : tab === 'explorar' ? explorerHTML(explorerData(D)) : imeiHTML(imei(D), D);
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
        const tog = `<label class="rv-det"><input type="checkbox" id="rv-refdet" ${refDet ? 'checked' : ''}> Detalle por tienda (gerencia)</label>`;
        const one = F.desde === F.hasta, cel = (q, md, inv) => `<td class="${md != null && q >= md && md > 0 ? 'g' : q ? 'a' : int(inv) > 0 ? 'z' : 'n'}">${q || 0}</td>`;
        if (!refDet) return `<div class="row between wrap"><h3 class="h3">📱 Venta por referencia · ${esc(rangoTxt())}</h3>${tog}</div>
            <div class="tbl-scroll"><table class="tbl compact rv-grid rv-ref"><thead><tr><th rowspan="2">Asesor</th>${R.keys.map(k => `<th colspan="3" class="rv-rh">${esc(refShort(k))}</th>`).join('')}<th rowspan="2">Venta</th><th rowspan="2">Meta día</th><th rowspan="2">Cumpl.</th><th rowspan="2">vs sem. ant.</th></tr>
                <tr>${R.keys.map(() => '<th class="rv-sh">Inv</th><th class="rv-sh">Vta</th><th class="rv-sh">Meta</th>').join('')}</tr></thead><tbody>
            ${R.flat.map(a => { const md = a.md || { refs: {} }, mt = one ? md.tot : null; return `<tr><td class="l"><b>${esc(a.nombre)}</b>${a.ds && a.ds.off ? ' ' + DayStatus.chip(a.ds) : ''}</td>${R.keys.map(k => `<td class="inv">${int(a.inv[k])}</td>${cel(int(a.v[k]), one ? md.refs[k] : null, a.inv[k])}<td class="mt">${one && md.refs[k] != null ? md.refs[k] : '—'}</td>`).join('')}<td><b>${a.tot}</b></td><td>${mt ?? '—'}</td><td>${mt ? `<i class="pill ${a.tot >= mt ? 'ok' : a.tot ? 'warn' : 'bad'}">${Math.round(a.tot / mt * 100)}%</i>` : '—'}</td><td>${wowCell(a.w)}</td></tr>`; }).join('') || `<tr><td colspan="${R.keys.length * 3 + 5}">Sin asesores en el filtro.</td></tr>`}
            </tbody></table></div><p class="hint">Inv = inventario de su tienda. Meta = unidades que debe vender hoy de esa referencia para llegar al 100% de su target (lo que le falta ÷ días que quedan, redondeado hacia arriba). ${one ? '' : 'Para ver la meta del día elige un solo día. '}Verde = cumplió la meta del día; rojo = tiene inventario y no la ha vendido. vs sem. ant. = lunes a hoy contra los mismos días de la semana pasada.</p>`;
        return `<div class="row between wrap"><h3 class="h3">📱 Venta por referencia · ${esc(rangoTxt())}</h3><span class="row" style="gap:10px">${tog}<b>${sum(R.groups.map(g => g.tot))} uds · ${R.groups.length} PDV</b></span></div>
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
        const f = D[D.length - 1];
        const A = advisorsF().map(x => ({ ...x, v: ventaRango(x, D), hoy: int(x.dr[f]), md: metaDia(x, f), w: wow(x.dr, f) })).sort((a, b) => b.v - a.v || b.hoy - a.hoy || a.st.tienda.localeCompare(b.st.tienda, 'es'));
        const cols = D.slice(-14);
        return `<h3 class="h3">📅 Venta por asesor y día · ${esc(rangoTxt())}</h3>${D.length > 14 ? '<p class="hint">Se muestran los últimos 14 días del rango.</p>' : ''}
            <div class="tbl-scroll"><table class="tbl compact rv-grid"><thead><tr><th>Asesor</th><th>Tienda</th>${cols.map(d => `<th>${DIAS_CORTO[(parseD(d).getDay() + 6) % 7]}<br>${d.slice(8)}</th>`).join('')}<th>Total</th><th>Meta día ${f.slice(8)}</th><th>Cumpl. día</th><th>vs sem. ant.</th></tr></thead><tbody>
            ${A.map(x => `<tr><td class="l"><b>${esc(x.nombre)}</b></td><td class="l"><small>${esc(x.st.tienda)}</small></td>${cols.map(d => { const n = int(x.dr[d]), ds = typeof DayStatus !== 'undefined' ? DayStatus.ofAdvisor(x.st, x.nombre, d) : null; return `<td class="${n ? 'g' : ds && ds.off ? 'off' : 'z'}" title="${ds ? esc(ds.label) : ''}">${n || (ds && ds.off ? '—' : 0)}</td>`; }).join('')}<td><b>${x.v}</b></td><td>${x.md && x.md.tot != null ? x.md.tot : '—'}</td><td>${x.md && x.md.tot ? `<i class="pill ${x.hoy >= x.md.tot ? 'ok' : x.hoy ? 'warn' : 'bad'}">${x.hoy}/${x.md.tot} · ${Math.round(x.hoy / x.md.tot * 100)}%</i>` : '—'}</td><td>${wowCell(x.w)}</td></tr>`).join('')}
            </tbody></table></div><p class="hint">Ordenado del que más vende al que menos. Meta día = lo que le falta para su meta del mes ÷ días que quedan (redondeado hacia arriba). 0 en rojo = día sin venta · — = compensando o con novedad (malla). vs sem. ant. = lunes a la fecha contra los mismos días de la semana pasada.</p>`;
    }
    // ---- 🔎 Explorador (piloto): el líder arma su propio reporte con filtros. Filas = asesores (o tienda, cadena, zona,
    // referencia) y columnas = unidades de cada referencia elegida en el rango de fechas. Sale de la venta diaria DCR.
    const X = { by: 'asesor', refs: [], asesor: '', sinVenta: false, cols: 'refs' };
    const XBY = [['asesor', '👤 Asesor'], ['tienda', '🏬 Tienda'], ['cadena', '🏷️ Cadena'], ['zona', '📍 Zona'], ['ref', '📱 Referencia']];
    function explorerData(D) {
        const set = new Set(D), mes = F.preset === 'mes';
        const unitsOf = x => { const o = {}; Object.entries(x.drr || {}).forEach(([d, r]) => { if (!set.has(d)) return; Object.entries(r).forEach(([k, q]) => { o[k] = (o[k] || 0) + int(q); }); }); return o; };
        const A = advisorsF().filter(x => !X.asesor || x.st.id + '|' + x.nombre === X.asesor).map(x => ({ ...x, u: unitsOf(x) }));
        const usados = INFINIX_MODELS.filter(m => A.some(x => x.u[m.key]) || storesF().some(st => int((st.metas || {})[m.key]) > 0));
        const refs = X.refs.length ? INFINIX_MODELS.filter(m => X.refs.includes(m.key)) : usados;
        const tot = u => sum(refs.map(m => int(u[m.key])));
        let rows;
        if (X.by === 'ref') {
            rows = refs.map(m => { const V = A.filter(x => x.u[m.key] > 0).sort((a, b) => b.u[m.key] - a.u[m.key]); const meta = sum(storesF().map(st => int((st.metas || {})[m.key]))); return { k: m.key, nombre: m.name, total: sum(V.map(x => x.u[m.key])), asesores: V.length, top: V[0] ? `${V[0].nombre} (${V[0].u[m.key]})` : '—', tiendas: new Set(V.map(x => x.st.id)).size, meta, cumpl: mes && meta ? sum(V.map(x => x.u[m.key])) / meta : null }; });
        } else if (X.by === 'asesor') {
            rows = A.map(x => ({ k: x.st.id + '|' + x.nombre, nombre: x.nombre, st: x.st, u: x.u, total: tot(x.u) }));
        } else {
            const keyOf = x => X.by === 'tienda' ? x.st.id : X.by === 'cadena' ? chainGroup(x.st).key : x.st.zona;
            const nameOf = x => X.by === 'tienda' ? x.st.tienda : X.by === 'cadena' ? chainGroup(x.st).label : x.st.zona;
            const G = {};
            A.forEach(x => { const k = keyOf(x), g = G[k] = G[k] || { k, nombre: nameOf(x), st: x.st, u: {}, asesores: 0, stores: new Set() }; g.asesores++; g.stores.add(x.st.id); Object.entries(x.u).forEach(([r, q]) => { g.u[r] = (g.u[r] || 0) + q; }); });
            rows = Object.values(G).map(g => {
                const metas = {}; [...g.stores].map(storeById).forEach(st => Object.entries(st.metas || {}).forEach(([r, q]) => { metas[r] = (metas[r] || 0) + int(q); }));
                const conMeta = refs.filter(m => metas[m.key] > 0).map(m => ({ m, c: int(g.u[m.key]) / metas[m.key] })).sort((a, b) => a.c - b.c);
                const best = refs.map(m => [m, int(g.u[m.key])]).sort((a, b) => b[1] - a[1])[0];
                return { ...g, total: tot(g.u), metas, mejor: best && best[1] ? `${best[0].name} (${best[1]})` : '—', rezagada: conMeta[0] ? `${conMeta[0].m.name} (${int(g.u[conMeta[0].m.key])}/${metas[conMeta[0].m.key]})` : '—' };
            });
        }
        if (!X.sinVenta) rows = rows.filter(r => r.total > 0); else rows = rows.filter(r => X.by === 'ref' || true);
        rows.sort((a, b) => X.sinVenta && X.by === 'asesor' ? a.total - b.total : b.total - a.total);
        const total = sum(rows.map(r => r.total));
        return { rows, refs, total, by: X.by, asesores: A.length, mes };
    }
    function explorerHTML(E) {
        const ases = advisorsF().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
        const refCols = X.cols === 'refs' && E.by !== 'ref';
        const head = E.by === 'ref' ? '<th class="l">Referencia</th><th>Unidades</th><th>Asesores que la venden</th><th>Tiendas</th><th class="l">Quién más vende</th>' + (E.mes ? '<th>Meta mes</th><th>Cumpl.</th>' : '')
            : `<th class="l">${{ asesor: 'Asesor', tienda: 'Tienda', cadena: 'Cadena', zona: 'Zona' }[E.by]}</th>${E.by === 'asesor' ? '<th class="l">Tienda</th><th class="l">Cadena</th>' : E.by === 'tienda' ? '<th class="l">Cadena</th>' : ''}${E.by !== 'asesor' && E.by !== 'zona' ? '' : ''}${refCols ? E.refs.map(m => `<th title="${esc(m.name)}">${esc(m.name.replace(/^(NOTE|Note|HOT|SMART|GT) /, x => x.charAt(0) + '. '))}</th>`).join('') : ''}<th>Total</th><th>%</th>${E.by !== 'asesor' ? '<th>Asesores</th><th class="l">Más vendida</th><th class="l">Más rezagada (vs meta)</th>' : ''}`;
        const row = r => E.by === 'ref' ? `<tr><td class="l"><b>${esc(r.nombre)}</b></td><td><b>${r.total}</b></td><td>${r.asesores}</td><td>${r.tiendas}</td><td class="l"><small>${esc(r.top)}</small></td>${E.mes ? `<td>${r.meta || '—'}</td><td>${r.cumpl == null ? '—' : `<i class="pill ${r.cumpl >= .85 ? 'ok' : r.cumpl >= .6 ? 'warn' : 'bad'}">${Math.round(r.cumpl * 100)}%</i>`}</td>` : ''}</tr>`
            : `<tr><td class="l"><b>${esc(r.nombre)}</b></td>${E.by === 'asesor' ? `<td class="l"><small>${esc(r.st.tienda)}</small></td><td class="l"><small>${esc(chainGroup(r.st).label)}</small></td>` : E.by === 'tienda' ? `<td class="l"><small>${esc(chainGroup(r.st).label)}</small></td>` : ''}${refCols ? E.refs.map(m => `<td class="${int(r.u[m.key]) ? '' : 'z'}">${int(r.u[m.key]) || 0}</td>`).join('') : ''}<td><b>${r.total}</b></td><td><small>${E.total ? Math.round(r.total / E.total * 100) + '%' : '—'}</small></td>${E.by !== 'asesor' ? `<td>${r.asesores}</td><td class="l"><small>${esc(r.mejor)}</small></td><td class="l"><small class="r">${esc(r.rezagada)}</small></td>` : ''}</tr>`;
        return `<div class="row between wrap"><h3 class="h3">🔎 Explorador de venta <small class="mute">· piloto · ${esc(rangoTxt())}</small></h3><b>${E.total} uds · ${E.rows.length} fila(s)</b></div>
            <p class="hint">Arma tu reporte: elige cómo agrupar, las referencias y el asesor. Usa los filtros de arriba (zona, cadena, tienda y fechas). Sale de la venta diaria de la data plana DCR.</p>
            <div class="xp-f"><span class="lbl">Ver por</span><div class="seg sm">${XBY.map(([k, l]) => `<label class="seg-btn ${X.by === k ? 'active' : ''}"><input type="radio" name="xp-by" value="${k}" data-xby ${X.by === k ? 'checked' : ''} hidden>${l}</label>`).join('')}</div></div>
            <div class="xp-f"><span class="lbl">Referencias</span><div class="chips"><button class="chip-b ${X.refs.length ? '' : 'on'}" data-xref="*">Todas</button>${INFINIX_MODELS.map(m => `<button class="chip-b ${X.refs.includes(m.key) ? 'on' : ''}" data-xref="${m.key}">${esc(m.name)}</button>`).join('')}</div></div>
            <div class="row wrap" style="gap:8px;margin:6px 0 10px;align-items:flex-end">
                <label class="field-inline grow"><span class="lbl">Asesor</span><select class="input" id="xp-ase"><option value="">Todos los asesores (${ases.length})</option>${ases.map(x => `<option value="${esc(x.st.id + '|' + x.nombre)}" ${X.asesor === x.st.id + '|' + x.nombre ? 'selected' : ''}>${esc(x.nombre)} · ${esc(x.st.tienda)}</option>`).join('')}</select></label>
                ${E.by !== 'ref' ? `<label class="field-inline"><span class="lbl">Columnas</span><select class="input" id="xp-cols"><option value="refs" ${X.cols === 'refs' ? 'selected' : ''}>Una por referencia</option><option value="tot" ${X.cols === 'tot' ? 'selected' : ''}>Solo el total</option></select></label>` : ''}
                <label class="chip"><input type="checkbox" id="xp-sin" ${X.sinVenta ? 'checked' : ''}><span>Incluir los que no han vendido (los de menos venta primero)</span></label>
            </div>
            ${E.rows.length ? `<div class="tbl-scroll"><table class="tbl compact xp-t"><thead><tr><th>#</th>${head}</tr></thead><tbody>${E.rows.map((r, i) => row(r).replace('<tr>', `<tr><td>${i + 1}</td>`)).join('')}
                <tr class="tot"><td></td><td class="l"><b>Total</b></td>${E.by === 'asesor' ? '<td></td><td></td>' : E.by === 'tienda' ? '<td></td>' : ''}${E.by !== 'ref' && X.cols === 'refs' ? E.refs.map(m => `<td><b>${sum(E.rows.map(r => int(r.u[m.key])))}</b></td>`).join('') : ''}<td><b>${E.total}</b></td>${E.by === 'ref' ? '' : '<td></td>'}${E.by !== 'asesor' && E.by !== 'ref' ? '<td></td><td></td><td></td>' : ''}</tr></tbody></table></div>` : '<p class="empty">Sin venta con estos filtros. Prueba otro rango de fechas o marca "Incluir los que no han vendido".</p>'}
            <p class="hint">Es un panel piloto: dime qué otros cortes te sirven y los agrego.</p>`;
    }

    // Facturas que subieron los asesores para sus IMEI sin activar (se borran solas cuando el IMEI aparece activo)
    let facs = null, facKey = '';
    async function loadFacs() {
        const zs = [...new Set(storesF().map(s => s.zona))], k = zs.join('|');
        if (facs && facKey === k) return; facKey = k;
        try { facs = await ImeiFac.cleanup(await ImeiFac.byZones(zs)); } catch (e) { facs = []; }
        if (tab === 'imei' && view && view.isConnected) paint();
    }
    const facOf = (st, r) => (facs || []).find(f => f.storeId === st.id && String(f.imei) === String(r.imei));
    function imeiHTML(L, D) {
        if (!facs) loadFacs();
        const n = sum(L.map(g => g.items.length)), con = sum(L.map(g => g.items.filter(r => facOf(g.st, r)).length));
        return `<div class="row between wrap"><h3 class="h3">📵 IMEI sin activar · ${esc(rangoTxt())}</h3><b>${n} IMEI · ${L.length} asesores</b></div>
            <div class="row wrap" style="gap:6px;margin:6px 0"><i class="pill ok">📎 ${con} con factura</i><i class="pill ${n - con ? 'warn' : 'ok'}">${n - con} sin factura</i>${con ? `<button class="btn btn-primary sm" id="rv-facall">⬇️ Descargar las ${con} facturas</button>` : ''}${facs ? '' : '<small class="mute">Buscando facturas…</small>'}</div>
            <p class="hint">Ventas cargadas con el IMEI sin activar. El asesor sube la factura desde su Mi central; aquí la descargas. Cuando una data nueva trae el IMEI activo, sale de la lista y la factura se borra sola de la nube. Para ver todo el mes elige el rango <b>Mes</b>.</p>
            ${L.map(g => `<div class="rv-imei"><div class="row between"><span>${advRow({ st: g.st, nombre: g.nombre }, '')}</span><b>${g.items.length}</b></div>
                <table class="tbl compact"><tbody>${g.items.map(r => { const F = facOf(g.st, r); return `<tr><td class="l"><code>${esc(r.imei || '—')}</code></td><td class="l">${esc(r.ref || '')}</td><td>${esc((r.f || '').slice(5))}${r.h ? ' ' + esc(r.h) : ''}</td><td>${F ? `<button class="btn btn-ghost sm" data-facdl="${esc(F.id)}">📎 Factura ⬇️</button>` : '<small class="r">sin factura</small>'}</td></tr>`; }).join('')}</tbody></table></div>`).join('') || '<p class="empty">Sin IMEI inactivos en el rango.</p>'}`;
    }
    function reportData() {
        const D = days(F.desde, F.hasta), S = status(F.hasta), R = cero(D), I = imei(D), RF = refsData(D);
        const byStore = {}; R.lista.forEach(x => { byStore[x.st.id] = byStore[x.st.id] || { tienda: x.st.tienda, n: 0 }; byStore[x.st.id].n++; });
        const zs = storesF(), refs = INFINIX_MODELS.map(m => ({ name: m.name, gap: sum(zs.map(st => int(st.metas && st.metas[m.key]) - int(((ZoneData.forStore(st.id) || {}).ventas || {})[m.key]))) })).sort((a, b) => b.gap - a.gap);
        const ctx = { n: R.lista.length, tiendas: Object.values(byStore).sort((a, b) => b.n - a.n), foco: refs[0] && refs[0].gap > 0 ? refs[0].name : '', hora: S.hora, metaDia: S.metaDia, imei: sum(I.map(g => g.items.length)) };
        const C = corteOf();
        const lentas = RF.resumen.filter(r => r.inv > 0).sort((a, b) => (b.dias ?? 999) - (a.dias ?? 999)).slice(0, 2);
        const planR = tab === 'refs' && lentas.length ? lentas.map(r => `${r.name}: ${r.inv} uds en inventario y ${r.v} vendidas en el rango${r.sinRotar ? ` (${r.sinRotar} PDV sin venderla)` : ''}. Presión con cada asesor que tiene 0: meta de 1 unidad hoy, demo en mesa y argumento frente a la competencia.`) : [];
        const fH = D[D.length - 1], AD = advisorsF().map(x => ({ st: x.st, nombre: x.nombre, dr: x.dr, v: ventaRango(x, D), hoy: int(x.dr[fH]), md: metaDia(x, fH), w: wow(x.dr, fH) })).sort((a, b) => b.v - a.v || b.hoy - a.hoy);
        return { AD, one: F.desde === F.hasta, tab, F: { ...F }, D, S, R, I, RF, aviso: C.fecha && F.hasta > C.fecha ? `Data hasta el ${C.fecha}${C.hora ? ' ' + C.hora : ''}` : '', plan: planR.concat(planAccion(me().rol, ctx)).slice(0, 6), zonas: zonasF(), filtro: [F.cadena ? (chainList(scopedStores()).find(c => c.key === F.cadena) || {}).label : '', F.tienda ? storeById(F.tienda).tienda : ''].filter(Boolean).join(' · '), rango: rangoTxt(), dayList: D };
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
    else if (d.tab === 'refs' && !d.RF.det) { const R = d.RF, nm = k => ((INFINIX_MODELS.find(m => m.key === k) || {}).name || k); const wt = w => !w ? dash : w.pct == null ? '▲ nuevo' : `${w.pct > 0.005 ? '▲' : w.pct < -0.005 ? '▼' : '='} ${Math.round(w.pct * 100)}%`, wc = w => !w || w.pct == null ? 'g' : w.pct > 0.005 ? 'g' : w.pct < -0.005 ? 'r' : '';
        body = `<div class="rp-sec">VENTA POR REFERENCIA Y ASESOR · ${esc(d.rango.toUpperCase())} · DEL QUE MÁS VENDE AL QUE MENOS</div>
        <table class="rp-tbl sp-tbl rv-gridp rv-refp"><thead><tr><th class="l" rowspan="2">ASESOR</th>${R.keys.map(k => `<th colspan="${d.one ? 3 : 2}">${esc(nm(k).toUpperCase())}</th>`).join('')}<th class="c-tot" rowspan="2">VENTA</th>${d.one ? '<th rowspan="2">META DÍA</th><th class="c-tot" rowspan="2">CUMPL.</th>' : ''}<th rowspan="2">VS SEM. ANT.</th></tr>
        <tr>${R.keys.map(() => `<th class="sh">INV</th><th class="sh">VTA</th>${d.one ? '<th class="sh">META</th>' : ''}`).join('')}</tr></thead><tbody>
        ${R.flat.map(a => { const md = a.md || { refs: {} }, mt = md.tot; return `<tr><td class="l"><b>${esc(a.nombre.split(' ').slice(0, 3).join(' '))}</b></td>${R.keys.map(k => { const q = int(a.v[k]), iv = int(a.inv[k]), m = md.refs[k]; return `<td class="inv">${iv}</td><td class="${d.one && m != null && m > 0 && q >= m ? 'g' : q ? 'a' : iv > 0 ? 'r' : ''}"><b>${q}</b></td>${d.one ? `<td class="mt">${m ?? dash}</td>` : ''}`; }).join('')}<td class="c-tot"><b>${a.tot}</b></td>${d.one ? `<td>${mt ?? dash}</td><td class="c-tot ${mt ? (a.tot >= mt ? 'g' : a.tot ? 'a' : 'r') : ''}">${mt ? Math.round(a.tot / mt * 100) + '%' : dash}</td>` : ''}<td class="${wc(a.w)}">${wt(a.w)}</td></tr>`; }).join('')}
        <tr class="tot"><td class="l">TOTAL</td>${R.keys.map(k => `<td class="inv">${sum(R.groups.map(g => int(g.inv[k])))}</td><td><b>${sum(R.flat.map(a => int(a.v[k])))}</b></td>${d.one ? `<td class="mt">${sum(R.flat.map(a => int((a.md || { refs: {} }).refs[k])))}</td>` : ''}`).join('')}<td class="c-tot"><b>${sum(R.flat.map(a => a.tot))}</b></td>${d.one ? `<td>${sum(R.flat.map(a => int(a.md && a.md.tot)))}</td><td class="c-tot"></td>` : ''}<td></td></tr></tbody></table>`; }
    else if (d.tab === 'refs') { const R = d.RF, nm = k => ((INFINIX_MODELS.find(m => m.key === k) || {}).name || k);
        body = `<div class="rp-sec">INVENTARIO VS. VENTA POR REFERENCIA · ${esc(d.rango.toUpperCase())}</div>
        <table class="rp-tbl sp-tbl"><thead><tr><th class="l">REFERENCIA</th><th>INVENTARIO</th><th class="c-tot">VENTA RANGO</th><th>VENTA MES</th><th>DÍAS DE INVENTARIO</th><th>PDV SIN VENDER</th></tr></thead><tbody>${R.resumen.map(r => `<tr><td class="l"><b>${esc(r.name)}</b></td><td><b>${r.inv}</b></td><td class="c-tot ${r.v ? '' : r.inv ? 'r' : ''}"><b>${r.v}</b></td><td>${r.mes}</td><td class="${r.dias == null ? (r.inv ? 'r' : '') : r.dias > 30 ? 'r' : r.dias > 15 ? 'a' : 'g'}">${r.dias == null ? (r.inv ? 'sin rotación' : dash) : r.dias + ' d'}</td><td class="${r.sinRotar ? 'r' : ''}">${r.sinRotar}</td></tr>`).join('')}</tbody></table>
        ${R.groups.map(g => `<div class="rp-sec light">${esc(g.st.tienda.toUpperCase())} · ${g.tot} UDS</div>
        <table class="rp-tbl sp-tbl rv-gridp"><thead><tr><th class="l">ASESOR</th>${R.keys.map(k => `<th>${esc(nm(k).toUpperCase())}</th>`).join('')}<th class="c-tot">TOTAL</th></tr></thead><tbody>
        <tr class="rv-inv"><td class="l"><b>📦 INVENTARIO</b></td>${R.keys.map(k => `<td><b>${int(g.inv[k])}</b></td>`).join('')}<td class="c-tot"><b>${sum(R.keys.map(k => int(g.inv[k])))}</b></td></tr>
        <tr class="rv-sum"><td class="l"><b>🛒 VENTA TIENDA</b></td>${R.keys.map(k => `<td><b>${int(g.venta[k])}</b></td>`).join('')}<td class="c-tot"><b>${g.tot}</b></td></tr>
        ${g.A.map(a => `<tr><td class="l"><b>${esc(a.nombre)}</b></td>${R.keys.map(k => { const q = int(a.v[k]); return `<td class="${q ? 'g' : int(g.inv[k]) > 0 ? 'r' : ''}">${q}</td>`; }).join('')}<td class="c-tot"><b>${a.tot}</b></td></tr>`).join('')}</tbody></table>`).join('')}`; }
    else if (d.tab === 'dia') { const A = d.AD, f = d.D[d.D.length - 1]; const wt = w => !w ? dash : w.pct == null ? '▲ nuevo' : `${w.pct > 0.005 ? '▲' : w.pct < -0.005 ? '▼' : '='} ${Math.round(w.pct * 100)}%`, wc = w => !w || w.pct == null ? 'g' : w.pct > 0.005 ? 'g' : w.pct < -0.005 ? 'r' : ''; body = `<div class="rp-sec">VENTA POR ASESOR Y DÍA · ${esc(d.rango.toUpperCase())} · DEL QUE MÁS VENDE AL QUE MENOS</div>
        <table class="rp-tbl sp-tbl rv-gridp"><thead><tr><th class="l">ASESOR</th><th class="l">TIENDA</th>${cols.map(x => `<th>${x.slice(8)}</th>`).join('')}<th class="c-tot">TOTAL</th><th>META DÍA ${f.slice(8)}</th><th class="c-tot">CUMPL. DÍA</th><th>VS SEM. ANT.</th></tr></thead><tbody>${A.map(x => { const mt = x.md && x.md.tot; return `<tr><td class="l"><b>${esc(x.nombre)}</b></td><td class="l small">${esc(x.st.tienda)}</td>${cols.map(c => `<td class="${int(x.dr[c]) ? '' : 'r'}">${int(x.dr[c])}</td>`).join('')}<td class="c-tot"><b>${x.v}</b></td><td>${mt ?? dash}</td><td class="c-tot ${mt ? (x.hoy >= mt ? 'g' : x.hoy ? 'a' : 'r') : ''}">${mt ? `${x.hoy}/${mt} · ${Math.round(x.hoy / mt * 100)}%` : dash}</td><td class="${wc(x.w)}">${wt(x.w)}</td></tr>`; }).join('')}</tbody></table>`; }
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

// Lienzo del explorador: la tabla tal cual la armó el líder
function buildExplorerCanvas(stage, E, autor, o) {
    const by = { asesor: 'ASESOR', tienda: 'TIENDA', cadena: 'CADENA', zona: 'ZONA', ref: 'REFERENCIA' }[E.by], refCols = E.by !== 'ref' && E.refs.length <= 10;
    const el = document.createElement('div'); el.className = 'rp sp aud';
    el.innerHTML = `<div class="rp-bar"></div>
    <header class="rp-head"><img class="rp-logo" src="${LOGO_INFINIX}" alt="Infinix">
        <div class="rp-head-mid"><div class="rp-kicker">EXPLORADOR DE VENTA · POR ${by}</div><div class="rp-title">${esc(String(o.scope || '').toUpperCase())}</div><div class="rp-sub">${esc(o.rango)} · ${E.refs.length === INFINIX_MODELS.length ? 'todas las referencias' : E.refs.map(m => m.name).join(', ')} · ${E.total} uds</div></div>
        <div class="pl-who"><b>${esc(autor.nombre)}</b><small>${ROLES[autor.rol] ? ROLES[autor.rol].label : ''}</small></div></header>
    <table class="rp-tbl sp-tbl"><thead><tr><th class="l">#</th><th class="l">${by}</th>${E.by === 'asesor' ? '<th class="l">TIENDA</th>' : ''}${E.by === 'ref' ? '<th>UDS</th><th>ASESORES</th><th class="l">QUIÉN MÁS VENDE</th>' : `${refCols ? E.refs.map(m => `<th>${esc(m.name)}</th>`).join('') : ''}<th class="c-tot">TOTAL</th>${E.by !== 'asesor' ? '<th class="l">MÁS VENDIDA</th><th class="l">MÁS REZAGADA</th>' : ''}`}</tr></thead><tbody>
    ${E.rows.slice(0, 80).map((r, i) => `<tr><td class="l">${i + 1}</td><td class="l"><b>${esc(r.nombre)}</b></td>${E.by === 'asesor' ? `<td class="l small">${esc(r.st.tienda)}</td>` : ''}${E.by === 'ref' ? `<td><b>${r.total}</b></td><td>${r.asesores}</td><td class="l small">${esc(r.top)}</td>` : `${refCols ? E.refs.map(m => `<td class="${int(r.u[m.key]) ? '' : 'mute'}">${int(r.u[m.key]) || 0}</td>`).join('') : ''}<td class="c-tot"><b>${r.total}</b></td>${E.by !== 'asesor' ? `<td class="l small">${esc(r.mejor)}</td><td class="l small r">${esc(r.rezagada)}</td>` : ''}`}</tr>`).join('')}</tbody></table>
    <footer class="rp-foot"><span>Venta diaria de la data plana DCR en el rango elegido. Reporte armado con los filtros del Explorador.</span><b>Infinix · Central de Operaciones</b></footer><div class="rp-bar"></div>`;
    stage.appendChild(el); return el;
}

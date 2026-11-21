// ============================================================================
// MÓDULO 1 · REPORTE DE CIERRE DIARIO E INVENTARIO (perfil Tienda / Asesor)
// La tienda, la cadena y el logo vienen de la sesión: el asesor solo marca
// quién reporta, digita ventas e inventario y comparte el lienzo.
// ============================================================================

registerModule('m1', (() => {
    let fecha = todayStr(), closures = [], invBase = {}, invTouched = {}, invAccBase = {}, invAccTouched = {};
    // Piloto (noviembre): cierre semanal. modo 'semana' → per = { desde, hasta }; el cierre se guarda con la fecha de cierre
    // de la semana y cubre todos sus días. Al guardarlo reemplaza los cierres diarios que hubiera en esa semana.
    let modo = 'dia', per = null, wkCur = null, wkDaily = [];
    const pilotOn = d => WEEKLY_PILOT_MONTHS.includes((d || todayStr()).slice(0, 7));
    // Semanas del mes (lunes a domingo, recortadas al mes) que YA TERMINARON: la semana en curso se carga día a día
    const weekEndOf = d => { const e = weekDays(d)[6], me = d.slice(0, 8) + pad2(daysInMonth(d.slice(0, 7))); return e < me ? e : me; };
    function pilotWeeks(ym) {
        const out = [];
        for (let i = 1; i <= daysInMonth(ym); i++) { const d = `${ym}-${pad2(i)}`, k = weekDays(d)[0]; let w = out.find(x => x.k === k); if (!w) { w = { k, desde: d, hasta: d }; out.push(w); } w.hasta = d; }
        return out.filter(w => w.hasta < todayStr()).map(w => ({ ...w, label: `${int(w.desde.slice(8))}${w.desde !== w.hasta ? ' al ' + int(w.hasta.slice(8)) : ''} de ${MESES[+ym.slice(5) - 1]}` }));
    }
    // Pasa un cierre semanal a cierre diario de su último día (no se pierde nada: luego se corrige día a día)
    async function splitWeekly(c) {
        const { semana, ...rest } = c; const doc = { ...rest, fecha: semana.hasta, updatedAt: Date.now() };
        await Data.set(COL.closures, c.id, doc, false);
        closures = closures.filter(x => x.id !== c.id).concat(doc);
        return doc;
    }
    const weekOf = d => pilotWeeks(d.slice(0, 7)).find(w => d >= w.desde && d <= w.hasta) || null;
    const weeklyCovering = d => closures.find(c => c.semana && d >= c.semana.desde && d <= c.semana.hasta) || null;

    const stepper = (id, v, ro) => `<div class="stp"><button type="button" data-d="-1" ${ro ? 'disabled' : ''}>−</button>
        <input class="input num" type="number" inputmode="numeric" min="0" id="${id}" value="${int(v)}" ${ro ? 'readonly' : ''}>
        <button type="button" data-d="1" ${ro ? 'disabled' : ''}>+</button></div>`;

    function render(view) {
        const st = currentStore();
        if (!st) { view.innerHTML = '<div class="card">Sesión de tienda no válida.</div>'; return; }
        fecha = todayStr();
        const hc = st.hc || {}, metas = st.metas || {}, metasAcc = st.metasAcc || {}, metasComp = st.metasComp || {};
        const tgt = v => int(v) ? `<b class="tgt">${int(v)}</b>` : '<span class="mute">—</span>';
        view.innerHTML = `
        <section class="card">
            <div class="row between wrap">
                <div class="row">${storeLogo(st)}<div><h2 class="h2">Reporte de cierre diario</h2><p class="mute">${esc(st.tienda)} · ${esc(st.ciudad || '')} · Zona ${esc(st.zona || '')}</p></div></div>
                <label class="field-inline"><span class="lbl">Fecha del cierre</span><span class="row" style="gap:4px"><button type="button" class="icon-btn" id="m1-prev" title="Día anterior">◀</button><input type="date" id="m1-fecha" class="input" value="${fecha}" max="${todayStr()}"><button type="button" class="icon-btn" id="m1-next" title="Día siguiente">▶</button></span></label>
            </div>
            ${pilotOn() ? `<div class="m1-mode"><div class="seg sm"><button type="button" class="seg-btn" data-modo="dia">📅 Cierre diario</button><button type="button" class="seg-btn" data-modo="semana">🗓️ Cierre semanal (piloto)</button></div>
                <span id="m1-wkbox" hidden><select class="input" id="m1-wk"></select></span></div>
                <p class="hint" id="m1-wkhint" hidden>Piloto de ${esc(mesLargo(todayStr().slice(0, 7)))}: solo para semanas que ya terminaron, carga en un solo cierre toda la venta de la semana (Infinix, accesorios y competencia). La semana en curso se carga día a día. Si ya había cierres diarios en esa semana, se suman aquí y quedan reemplazados por este.</p>` : ''}
            <div class="m1-days" id="m1-days"></div>
            <div id="m1-wkwarn"></div>
            <label class="lbl">¿Quién reporta hoy?</label>
            <div class="chips" id="m1-asesores">${(st.asesores || []).filter(a => !isBaja(st, a, (st.cedulas || {})[a])).map((a, i) => `<label class="chip"><input type="checkbox" value="${esc(a)}" ${i === 0 ? 'checked' : ''}><span>${esc(a)}</span></label>`).join('') || '<span class="mute">Configura los asesores en ⚙️ Ajustes de tienda.</span>'}</div>
        </section>

        <section class="kpi-row" id="m1-kpis"></section>

        <details class="card acc" open>
            <summary><span>📱 Infinix · ventas del día e inventario</span><span class="badge" id="m1-tot-inf">0 uds</span></summary>
            <table class="tbl compact"><thead><tr><th>Referencia</th><th>Target</th><th>Inventario</th><th class="m1-vl">Venta hoy</th></tr></thead><tbody>
                ${INFINIX_MODELS.map(m => `<tr><td><b>${esc(m.name)}</b></td><td class="c">${tgt(metas[m.key])}</td><td><input class="input num" type="number" inputmode="numeric" min="0" id="m1-i-${m.key}" value="0"></td><td>${stepper('m1-v-' + m.key, 0)}</td></tr>`).join('')}
            </tbody></table>
            <p class="hint">Target y HC se fijan en ⚙️ Ajustes de tienda. El inventario se descuenta solo con cada venta y queda listo para mañana; corrígelo si recibiste mercancía.</p>
        </details>

        <details class="card acc" open>
            <summary><span>🎧 Accesorios Infinix (venta independiente)</span><span class="badge" id="m1-tot-acc">0 uds</span></summary>
            <table class="tbl compact"><thead><tr><th>Accesorio</th><th>Target</th><th>Inventario</th><th class="m1-vl">Venta hoy</th></tr></thead><tbody>
                ${INFINIX_ACCESSORIES.map(a => `<tr><td><b>${esc(a.name)}</b></td><td class="c">${tgt(metasAcc[a.key])}</td><td><input class="input num" type="number" inputmode="numeric" min="0" id="m1-ia-${a.key}" value="0"></td><td>${stepper('m1-a-' + a.key, 0)}</td></tr>`).join('')}
            </tbody></table>
            <p class="hint">No cuentan para el share ni para el ROI de celulares.</p>
        </details>

        <details class="card acc" open>
            <summary><span id="m1-comp-t">🏬 Ventas del día de la competencia</span><span class="badge" id="m1-tot-st">0 uds tienda</span></summary>
            <table class="tbl compact"><thead><tr><th>Marca</th><th>HC</th><th>Target</th><th class="m1-vl">Venta hoy</th></tr></thead><tbody>
                ${BRANDS.map(b => `<tr class="${b === 'INFINIX' ? 'row-own' : ''}"><td><span class="dot" style="background:${BRAND_COLORS[b]}"></span><b>${b}</b></td><td class="c">${int(hc[b]) || '—'}</td><td class="c">${tgt(b === 'INFINIX' ? storeMetaMes(st) : metasComp[b])}</td><td>${stepper('m1-c-' + b, 0, b === 'INFINIX')}</td></tr>`).join('')}
            </tbody></table>
        </details>
        ${actionBarHTML()}`;

        // Eventos
        view.addEventListener('click', e => {
            const b = e.target.closest('.stp button'); if (!b) return;
            const inp = $('input', b.parentElement); inp.value = Math.max(0, int(inp.value) + int(b.dataset.d));
            inp.dispatchEvent(new Event('input', { bubbles: true }));
        });
        view.addEventListener('input', e => {
            if (e.target.id && e.target.id.startsWith('m1-i-')) invTouched[e.target.id.slice(5)] = true;
            if (e.target.id && e.target.id.startsWith('m1-ia-')) invAccTouched[e.target.id.slice(6)] = true;
            recalc();
        });
        $('#m1-fecha').onchange = e => { fecha = e.target.value || todayStr(); load(); };
        const go = d => { const f = addDays(fecha, d); if (f > todayStr()) return; fecha = f; $('#m1-fecha').value = f; load(); };
        $('#m1-prev').onclick = () => go(-1); $('#m1-next').onclick = () => go(1);
        $('#m1-days').onclick = e => { const b = e.target.closest('[data-day]'); if (!b) return; const d = b.dataset.day; if (modo === 'semana') { const w = weekOf(d); if (w) { per = w; $('#m1-wk').value = w.desde; fecha = w.hasta; load(); } return; } fecha = d; $('#m1-fecha').value = fecha; load(); };
        $$('[data-modo]', view).forEach(b => b.onclick = () => setModo(b.dataset.modo));
        if ($('#m1-wk')) $('#m1-wk').onchange = e => { per = pilotWeeks(fecha.slice(0, 7)).find(w => w.desde === e.target.value) || per; fecha = per.hasta; load(); };
        if (pilotOn()) setModo(modo, true);

        ReportActions.bind(view, {
            title: 'Reporte diario de ventas',
            validate: () => !$$('#m1-asesores input:checked').length ? 'Marca al menos un asesor que reporta.' : (modo === 'dia' && weeklyCovering(fecha) ? `Este día ya está dentro del cierre semanal del ${weeklyCovering(fecha).semana.desde.slice(8)} al ${weeklyCovering(fecha).semana.hasta.slice(8)}: edítalo en "Cierre semanal".` : null),
            filename: () => `Cierre_${slug(currentStore().tienda)}_${modo === 'semana' && per ? per.desde + '_a_' + per.hasta : fecha}.png`,
            build: stage => buildClosureCanvas(stage, currentStore(), computeStore(currentStore(), merged(), fecha), collect()),
            persist,
            // Marca que el cierre se compartió (menú de compartir del teléfono: WhatsApp) y no solo se guardó
            onShared: async via => { const id = collect().id, env = { via, at: Date.now() }; const c = closures.find(x => x.id === id); if (c) c.enviado = env; await Data.set(COL.closures, id, { enviado: env }, true); }
        });
        if (!pilotOn()) load();
    }
    function setModo(m, first) {
        modo = m;
        $$('[data-modo]').forEach(b => b.classList.toggle('active', b.dataset.modo === m));
        const wk = m === 'semana';
        if ($('#m1-wkbox')) $('#m1-wkbox').hidden = !wk; if ($('#m1-wkhint')) $('#m1-wkhint').hidden = !wk;
        const fb = $('#m1-fecha') && $('#m1-fecha').closest('.field-inline'); if (fb) fb.hidden = wk;
        $$('.m1-vl').forEach(t => { t.textContent = wk ? 'Venta semana' : 'Venta hoy'; });
        if ($('#m1-comp-t')) $('#m1-comp-t').textContent = wk ? '🏬 Ventas de la semana de la competencia' : '🏬 Ventas del día de la competencia';
        if (wk) {
            const ws = pilotWeeks(fecha.slice(0, 7));
            if (!ws.length) { toast('Aún no ha terminado ninguna semana del mes: carga el cierre día a día.', 'warn'); return setModo('dia'); }
            per = weekOf(fecha) || ws[ws.length - 1];
            $('#m1-wk').innerHTML = ws.map(w => `<option value="${w.desde}" ${per && w.desde === per.desde ? 'selected' : ''}>Semana del ${esc(w.label)}</option>`).join('');
            fecha = per.hasta;
        } else { per = null; fecha = $('#m1-fecha').value || todayStr(); }
        load();
    }

    async function load() {                 // trae los cierres del mes/semana y precarga el día si ya existe
        const st = currentStore(); if (!st) return;
        closures = await fetchStoreClosures(st.id, fecha);
        if (!$('#m1-fecha')) return;
        // Cierres semanales de una semana que aún no termina: quedan como cierre diario del día en que se guardaron
        const abiertos = closures.filter(c => c.semana && weekEndOf(c.semana.desde) >= todayStr());
        if (abiertos.length) { for (const c of abiertos) await splitWeekly(c); toast(`El cierre semanal de la semana en curso quedó como cierre del día ${abiertos.map(c => int(c.fecha.slice(8))).join(', ')}. Esta semana se carga día a día: corrige ese día si ahí sumaste la venta de otros días.`, 'warn', 9000); }
        paintWkWarn();
        if (modo === 'semana' && per) { loadWeek(st); return; }
        const cur = closures.find(c => c.fecha === fecha && !c.semana);
        invTouched = {}; invBase = {};
        // Día sin cierre: el inventario parte del último cierre anterior (llenar el mes día a día) o del inventario vigente
        const prev = cur ? null : closures.filter(c => c.fecha < fecha && c.inventario).sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
        const later = !cur && closures.some(c => c.fecha > fecha);
        const baseInv = prev ? prev.inventario : st.inventario, baseAcc = prev ? prev.invAcc : st.invAcc;
        INFINIX_MODELS.forEach(m => {
            const v = cur ? int(cur.ventas && cur.ventas[m.key]) : 0;
            const inv = cur ? int(cur.inventario && cur.inventario[m.key]) : int(baseInv && baseInv[m.key]);
            invBase[m.key] = cur ? inv + v : inv;            // stock antes de las ventas del día
            $('#m1-v-' + m.key).value = v; $('#m1-i-' + m.key).value = inv;
        });
        invAccTouched = {}; invAccBase = {};
        INFINIX_ACCESSORIES.forEach(a => {
            const v = cur ? int(cur.accesorios && cur.accesorios[a.key]) : 0;
            const inv = cur && cur.invAcc ? int(cur.invAcc[a.key]) : int(baseAcc && baseAcc[a.key]);
            invAccBase[a.key] = cur && cur.invAcc ? inv + v : inv;
            $('#m1-a-' + a.key).value = v; $('#m1-ia-' + a.key).value = inv;
        });
        BRANDS.forEach(b => { if (b !== 'INFINIX') $('#m1-c-' + b).value = cur ? int(cur.competencia && cur.competencia[b]) : 0; });
        if (cur && cur.asesores) $$('#m1-asesores input').forEach(i => { i.checked = cur.asesores.includes(i.value); });
        if (!cur && later && !prev && !weeklyCovering(fecha)) toast('Este día no tiene cierre: revisa el inventario antes de guardar.', 'info', 4000);
        recalc(); paintDays();
    }

    // En cierre diario, un día que está dentro de un cierre semanal: se puede separar para editarlo día a día
    function paintWkWarn() {
        const box = $('#m1-wkwarn'); if (!box) return;
        const w = modo === 'dia' ? weeklyCovering(fecha) : null;
        box.innerHTML = w ? `<div class="ds-nomalla">Este día está dentro del <b>cierre semanal del ${int(w.semana.desde.slice(8))} al ${int(w.semana.hasta.slice(8))}</b>. Para editarlo día a día, sepáralo: la venta de la semana queda en el día ${int(w.semana.hasta.slice(8))} y luego corriges cada día. <button class="btn btn-sm" id="m1-split">✂️ Separar en cierres diarios</button></div>` : '';
        if (w) $('#m1-split').onclick = async () => { if (!confirm(`La venta de toda la semana quedará en el día ${int(w.semana.hasta.slice(8))}. Luego corrige cada día para no contar doble. ¿Continuar?`)) return; await splitWeekly(w); toast('Semana separada: ya puedes editar cada día', 'ok'); load(); };
    }
    // Semana del piloto: precarga el semanal ya guardado o la suma de los cierres diarios de esa semana
    function loadWeek(st) {
        wkCur = closures.find(c => c.semana && c.semana.desde === per.desde) || null;
        wkDaily = closures.filter(c => !c.semana && c.fecha >= per.desde && c.fecha <= per.hasta);
        const src = wkCur ? [wkCur] : wkDaily, last = src.slice().sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
        const sumOf = (field, k) => sum(src.map(c => int(c[field] && c[field][k])));
        const prev = closures.filter(c => (c.semana ? c.semana.hasta : c.fecha) < per.desde && c.inventario).sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
        const baseInv = prev ? prev.inventario : st.inventario, baseAcc = prev ? prev.invAcc : st.invAcc;
        invTouched = {}; invBase = {}; invAccTouched = {}; invAccBase = {};
        INFINIX_MODELS.forEach(m => {
            const v = sumOf('ventas', m.key), inv = last ? int(last.inventario && last.inventario[m.key]) : int(baseInv && baseInv[m.key]);
            invBase[m.key] = last ? inv + v : inv; $('#m1-v-' + m.key).value = v; $('#m1-i-' + m.key).value = inv;
        });
        INFINIX_ACCESSORIES.forEach(a => {
            const v = sumOf('accesorios', a.key), inv = last && last.invAcc ? int(last.invAcc[a.key]) : int(baseAcc && baseAcc[a.key]);
            invAccBase[a.key] = last && last.invAcc ? inv + v : inv; $('#m1-a-' + a.key).value = v; $('#m1-ia-' + a.key).value = inv;
        });
        BRANDS.forEach(b => { if (b !== 'INFINIX') $('#m1-c-' + b).value = sumOf('competencia', b); });
        const as = [...new Set(src.flatMap(c => c.asesores || []))]; if (as.length) $$('#m1-asesores input').forEach(i => { i.checked = as.includes(i.value); });
        if (!wkCur && wkDaily.length) toast(`Se sumaron ${wkDaily.length} cierre(s) diario(s) de esa semana. Al guardar quedan en este cierre semanal.`, 'info', 5500);
        recalc(); paintDays();
    }

    // Franja del mes: qué días ya tienen cierre guardado (para llenar el mes completo sin perderse)
    function paintDays() {
        const box = $('#m1-days'); if (!box) return;
        const ym = fecha.slice(0, 7), last = todayStr().slice(0, 7) === ym ? int(todayStr().slice(8)) : new Date(+ym.slice(0, 4), +ym.slice(5), 0).getDate();
        const done = closureDaysCovered(closures.filter(c => c.month === ym || (c.fecha || '').slice(0, 7) === ym));
        const n = [...done].filter(d => d.slice(0, 7) === ym).length, today = todayStr();
        const inSel = d => modo === 'semana' && per ? d >= per.desde && d <= per.hasta : d === fecha;
        box.innerHTML = `<span class="lbl">${esc(mesLargo(ym))}: ${n} de ${last} días guardados</span><div class="m1-strip">${Array.from({ length: last }, (_, i) => {
            const d = `${ym}-${String(i + 1).padStart(2, '0')}`, wk = weeklyCovering(d);
            return `<button type="button" data-day="${d}" class="${done.has(d) ? 'ok' : d < today ? 'miss' : ''} ${wk ? 'wk' : ''} ${inSel(d) ? 'cur' : ''}" title="${done.has(d) ? (wk ? 'En cierre semanal' : 'Guardado') : 'Sin cierre'}">${i + 1}</button>`;
        }).join('')}</div>`;
    }

    function recalc() {
        if (!$('#m1-kpis')) return;
        let tot = 0;
        INFINIX_MODELS.forEach(m => {
            const v = int($('#m1-v-' + m.key).value); tot += v;
            if (!invTouched[m.key]) $('#m1-i-' + m.key).value = Math.max(0, int(invBase[m.key]) - v);
        });
        $('#m1-c-INFINIX').value = tot;
        INFINIX_ACCESSORIES.forEach(a => { if (!invAccTouched[a.key]) $('#m1-ia-' + a.key).value = Math.max(0, int(invAccBase[a.key]) - int($('#m1-a-' + a.key).value)); });
        const acc = sum(INFINIX_ACCESSORIES.map(a => int($('#m1-a-' + a.key).value)));
        const tienda = sum(BRANDS.map(b => int($('#m1-c-' + b).value)));
        $('#m1-tot-inf').textContent = `${tot} uds`; $('#m1-tot-acc').textContent = `${acc} uds`; $('#m1-tot-st').textContent = `${tienda} uds tienda`;
        const c = computeStore(currentStore(), merged(), fecha);
        const sem = semaforo(c.cumplProj == null ? 1 : c.cumplProj);
        $('#m1-kpis').innerHTML = `
            <div class="kpi hl"><span>ROI Infinix</span><b>${c.roi == null ? '—' : fmt1(c.roi)}</b><small>Proy. ${c.roiProj == null ? '—' : fmt1(c.roiProj)} <i class="pill ${sem.cls}">${sem.label}</i></small></div>
            <div class="kpi"><span>Venta mes</span><b>${c.infMes}</b><small>Meta ${c.metaMes || '—'} · ${c.cumpl == null ? 'sin meta' : Math.round(c.cumpl * 100) + '%'}</small></div>
            <div class="kpi"><span>Share mes</span><b>${c.shareMes}%</b><small>${c.pos ? 'Puesto #' + c.pos : 'Sin ventas'} en tienda</small></div>
            <div class="kpi"><span>Semana W${c.wk}</span><b>${c.infSem}</b><small>Proy. ${c.projSem} uds</small></div>`;
    }

    function collect() {
        const st = currentStore();
        const ventas = Object.fromEntries(INFINIX_MODELS.map(m => [m.key, int($('#m1-v-' + m.key).value)]));
        const competencia = Object.fromEntries(BRANDS.filter(b => b !== 'INFINIX').map(b => [b, int($('#m1-c-' + b).value)]));
        const totalInfinix = sum(Object.values(ventas));
        return {
            id: `${st.id}_${fecha}`, storeId: st.id, storeMonth: `${st.id}_${fecha.slice(0, 7)}`,
            tienda: st.tienda, cadena: st.cadena || '', zona: st.zona || '', ciudad: st.ciudad || '', logoKey: st.logoKey || 'otro',
            fecha, week: 'W' + isoWeek(fecha), month: fecha.slice(0, 7),
            asesores: $$('#m1-asesores input:checked').map(i => i.value),
            ventas, competencia,
            inventario: Object.fromEntries(INFINIX_MODELS.map(m => [m.key, int($('#m1-i-' + m.key).value)])),
            accesorios: Object.fromEntries(INFINIX_ACCESSORIES.map(a => [a.key, int($('#m1-a-' + a.key).value)])),
            invAcc: Object.fromEntries(INFINIX_ACCESSORIES.map(a => [a.key, int($('#m1-ia-' + a.key).value)])),
            metas: st.metas || {}, metasComp: st.metasComp || {}, metasAcc: st.metasAcc || {},
            hc: st.hc || {}, metaMes: storeMetaMes(st),
            totalInfinix, totalTienda: totalInfinix + sum(Object.values(competencia)),
            enviado: ((closures.find(c => c.id === `${st.id}_${fecha}`) || {}).enviado) || null,
            ...(modo === 'semana' && per ? { semana: { desde: per.desde, hasta: per.hasta, dias: Math.round((parseD(per.hasta) - parseD(per.desde)) / 864e5) + 1 } } : {}),
            updatedAt: Date.now()
        };
    }
    const merged = () => closures.filter(c => c.fecha !== fecha && !(modo === 'semana' && per && ((c.semana && c.semana.desde === per.desde) || (!c.semana && c.fecha >= per.desde && c.fecha <= per.hasta)))).concat($('#m1-fecha') ? collect() : []);

    async function persist() {
        const st = currentStore(), doc = collect();
        let saving;
        if (modo === 'semana' && per) {           // el semanal reemplaza al semanal anterior y a los diarios de esa semana
            const gone = closures.filter(c => c.id !== doc.id && ((c.semana && c.semana.desde === per.desde) || (!c.semana && c.fecha >= per.desde && c.fecha <= per.hasta)));
            saving = [Data.batch([{ op: 'set', col: COL.closures, id: doc.id, data: doc, merge: false }].concat(gone.map(c => ({ op: 'del', col: COL.closures, id: c.id }))))];
            closures = closures.filter(c => c.id !== doc.id && !gone.includes(c)).concat(doc);
            wkCur = doc; wkDaily = [];
        } else {
            saving = [Data.set(COL.closures, doc.id, doc, false)];
            closures = closures.filter(c => c.fecha !== fecha).concat(doc);
        }
        paintDays();
        if (!st.lastClosure || fecha >= st.lastClosure) {      // el inventario vigente es el del último cierre
            const upd = { inventario: doc.inventario, invAcc: doc.invAcc, lastClosure: fecha };
            Object.assign(st, upd); saving.push(Data.set(COL.stores, st.id, upd, true));
        }
        return (await Promise.all(saving))[0];
    }

    // Cambios hechos por el supervisor, formador o coordinador (retiros, traslados) se ven al instante en la tienda
    const onData = part => {
        const box = $('#m1-asesores'), st = currentStore(); if (!part.stores || !box || !st) return;
        const on = new Set($$('input:checked', box).map(i => i.value));
        box.innerHTML = (st.asesores || []).filter(a => !isBaja(st, a, (st.cedulas || {})[a])).map((a, i) => `<label class="chip"><input type="checkbox" value="${esc(a)}" ${on.size ? (on.has(a) ? 'checked' : '') : (i === 0 ? 'checked' : '')}><span>${esc(a)}</span></label>`).join('') || '<span class="mute">Configura los asesores en ⚙️ Ajustes de tienda.</span>';
    };
    return { render, onData };
})());

// ----------------------------------------------------------------------------
// LIENZO · REPORTE DIARIO DE VENTAS (1400 px, fondo blanco corporativo)
// ----------------------------------------------------------------------------
function buildClosureCanvas(stage, store, c, closure) {
    const dash = '—';
    const dayHead = c.days.map((d, i) => `<th class="c-day">${DIAS_CORTO[i]} ${d.slice(8)}</th>`).join('');
    const wkHead = c.weeks.map(w => `<th class="c-wk ${w === c.wk ? 'cur' : ''}">W${w}</th>`).join('');
    const cells = (arr, cls) => arr.map(v => `<td class="${cls}">${v}</td>`).join('');
    const totalRow = (label, rows, extra) => `<tr class="tot"><td class="l">${label}</td>${extra(rows)}</tr>`;
    const colSum = (rows, get) => sum(rows.map(get));
    const varCell = (v, semana) => v == null ? `<td class="c-var n">${semana > 0 ? 'nuevo' : dash}</td>` : `<td class="c-var ${v > 0.005 ? 'up' : v < -0.005 ? 'dn' : 'eq'}">${v > 0.005 ? '▲ +' : v < -0.005 ? '▼ ' : '= '}${Math.round(v * 100)}%</td>`;
    const varOf = (semana, prev) => prev > 0 ? (semana - prev) / prev : (semana > 0 ? null : 0);
    const varHead = `<th class="c-var">VAR. W${c.wk} vs W${c.prevWk}</th>`;

    // --- Tabla 1: Infinix por modelo
    const t1 = c.models.map(m => `<tr><td class="l">${esc(m.name)}</td><td>${m.meta || dash}</td><td>${m.inv}</td>${cells(m.w, 'c-wk')}${cells(m.d, 'c-day')}
        <td class="c-tot">${m.semana}</td>${varCell(m.varSem, m.semana)}<td class="c-tot">${m.mes}</td><td class="c-tot">${m.share}%</td><td class="c-tot ${m.cumpl == null ? '' : m.cumpl >= 100 ? 'g' : m.cumpl >= 70 ? 'a' : 'r'}">${m.cumpl == null ? dash : m.cumpl + '%'}</td></tr>`).join('')
        + totalRow('TOTAL INFINIX', c.models, rows => `<td>${c.metaMes || dash}</td><td>${c.invTotal}</td>
            ${c.weeks.map((_, i) => `<td class="c-wk">${colSum(rows, r => r.w[i])}</td>`).join('')}${c.days.map((_, i) => `<td class="c-day">${colSum(rows, r => r.d[i])}</td>`).join('')}
            <td class="c-tot">${c.infSem}</td>${varCell(c.varSemAFecha == null ? varOf(c.infSem, c.prevSemAFecha) : c.varSemAFecha, c.infSem)}<td class="c-tot">${c.infMes}</td><td class="c-tot">${c.infMes ? '100%' : '0%'}</td><td class="c-tot">${c.cumpl == null ? dash : Math.round(c.cumpl * 100) + '%'}</td>`);

    // --- Tabla 2: venta general de la tienda
    const t2 = c.brands.map(b => `<tr class="${b.brand === 'INFINIX' ? 'own' : ''}"><td class="l"><i class="dot" style="background:${BRAND_COLORS[b.brand]}"></i>${b.brand}</td><td>${b.meta || dash}</td><td>${b.hc || dash}</td>${cells(b.w, 'c-wk')}${cells(b.d, 'c-day')}
        <td class="c-tot">${b.semana}</td>${varCell(b.varSem, b.semana)}<td class="c-tot">${b.mes}</td><td class="c-tot ${b.cumpl == null ? '' : b.cumpl >= 100 ? 'g' : b.cumpl >= 70 ? 'a' : 'r'}">${b.cumpl == null ? dash : b.cumpl + '%'}</td><td class="c-tot">${b.share}%</td><td class="c-tot">${b.pos ? '#' + b.pos : dash}</td><td class="c-tot roi">${b.roi == null ? dash : fmt1(b.roi)}</td></tr>`).join('')
        + totalRow('TOTAL TIENDA', c.brands, rows => `<td>${colSum(rows, r => r.meta) || dash}</td><td>${colSum(rows, r => r.hc) || dash}</td>
            ${c.weeks.map((_, i) => `<td class="c-wk">${colSum(rows, r => r.w[i])}</td>`).join('')}${c.days.map((_, i) => `<td class="c-day">${colSum(rows, r => r.d[i])}</td>`).join('')}
            <td class="c-tot">${c.storeSem}</td>${varCell(varOf(c.storeSem, colSum(rows, r => r.prevAFecha)), c.storeSem)}<td class="c-tot">${c.storeMes}</td><td class="c-tot">${colSum(rows.filter(r => r.meta > 0), r => r.meta) ? pctNum(colSum(rows.filter(r => r.meta > 0), r => r.mes), colSum(rows.filter(r => r.meta > 0), r => r.meta)) + '%' : dash}</td><td class="c-tot">${c.storeMes ? '100%' : '0%'}</td><td class="c-tot">${dash}</td><td class="c-tot roi">${colSum(rows, r => r.hc) ? fmt1(c.storeMes / colSum(rows, r => r.hc)) : dash}</td>`);

    // --- Tabla 3: accesorios
    const t3 = c.accs.map(a => `<tr><td class="l">${esc(a.name)}</td><td>${a.meta || dash}</td><td>${a.inv}</td>${cells(a.w, 'c-wk')}${cells(a.d, 'c-day')}<td class="c-tot">${a.semana}</td>${varCell(a.varSem, a.semana)}<td class="c-tot">${a.mes}</td><td class="c-tot ${a.cumpl == null ? '' : a.cumpl >= 100 ? 'g' : a.cumpl >= 70 ? 'a' : 'r'}">${a.cumpl == null ? dash : a.cumpl + '%'}</td></tr>`).join('');

    // --- Dashboard
    const sem = semaforo(c.cumplProj == null ? 1 : c.cumplProj);
    const top = c.brands.filter(b => b.brand !== 'INFINIX' && b.mes > 0).sort((a, b) => b.mes - a.mes);
    const top4 = top.slice(0, 4), otros = sum(top.slice(4).map(b => b.mes));
    const shareSeg = [{ label: 'INFINIX', v: c.infMes, color: BRAND_COLORS.INFINIX }, ...top4.map(b => ({ label: b.brand, v: b.mes, color: BRAND_COLORS[b.brand] }))];
    if (otros) shareSeg.push({ label: 'OTROS', v: otros, color: BRAND_COLORS.OTROS });
    const bar = (v, max, color, lbl, top) => `<div class="pbar"><b>${top}</b><div class="pbar-track"><div style="height:${max > 0 ? clamp(Math.round(v / max * 100), 3, 100) : 3}%;background:${color}"></div></div><span>${lbl}</span></div>`;
    const wMax = Math.max(c.prevSem, c.projSem, 1), mMax = Math.max(c.metaMes, c.projMes, 1);
    const varTxt = c.varSem == null ? 'Sin semana anterior' : `${c.varSem >= 0 ? '▲ +' : '▼ '}${Math.round(c.varSem * 100)}% vs W${isoWeek(addDays(c.days[0], -1))}`;

    const el = document.createElement('div');
    el.className = 'rp rp-m1';
    el.innerHTML = `
    <div class="rp-bar"></div>
    <header class="rp-head">
        <img class="rp-logo" src="${LOGO_INFINIX}" alt="Infinix">
        <div class="rp-head-mid">
            <div class="rp-kicker">${closure.semana ? 'CIERRE SEMANAL DE VENTAS (PILOTO)' : 'REPORTE DIARIO DE VENTAS'}</div>
            <div class="rp-title">${esc(store.tienda.toUpperCase())}</div>
            <div class="rp-sub">Zona ${esc(store.zona || dash)} · ${esc(store.ciudad || '')} · Asesor(es): <b>${esc((closure.asesores || []).join(', ') || dash)}</b></div>
            <div class="rp-sub">${closure.semana ? `Venta del <b>${esc(fechaLarga(closure.semana.desde))}</b> al <b>${esc(fechaLarga(closure.semana.hasta))}</b>` : `Cierre: ${esc(fechaLarga(c.fecha))}`} · Semana W${c.wk} · ${esc(mesLargo(c.ym))}</div>
        </div>
        <div class="rp-chain">${storeLogo(store)}</div>
    </header>

    <section class="rp-dash">
        <div class="dcard hero">
            <div class="dcard-t">🔥 ROI INFINIX · UNIDADES POR PROMOTOR</div>
            <div class="row" style="gap:22px">
                ${ringCardHTML('rc-roi', 190, c.roi == null ? dash : fmt1(c.roi), 'ROI actual')}
                <div class="dlist">
                    <div><span>ROI proyectado al cierre</span><b style="color:${sem.color}">${c.roiProj == null ? dash : fmt1(c.roiProj)}</b></div>
                    <div><span>ROI meta del mes</span><b>${c.roiMeta == null ? dash : fmt1(c.roiMeta)}</b></div>
                    <div><span>HC Infinix</span><b>${c.hcInf || dash}</b></div>
                    <i class="pill big ${sem.cls}">● ${sem.label}</i>
                </div>
            </div>
            <div class="dnote">ROI = ventas del mes ÷ promotores (HC)</div>
        </div>
        <div class="dcard">
            <div class="dcard-t">MARKET SHARE EN TIENDA</div>
            <div class="row" style="gap:14px">
                ${ringCardHTML('rc-share', 140, c.shareMes + '%', 'Infinix')}
                <div class="legend">${shareSeg.map(s => `<div><i class="dot" style="background:${s.color}"></i><span>${s.label}</span><b>${pctNum(s.v, c.storeMes)}%</b></div>`).join('') || '<div><span>Sin ventas registradas</span></div>'}</div>
            </div>
            <div class="rank"><b>${c.pos ? `#${c.pos}` : dash}</b><span>posición de Infinix en el ranking del PDV</span></div>
        </div>
        <div class="dcard">
            <div class="dcard-t">CUMPLIMIENTO META MENSUAL</div>
            <div class="center">${ringCardHTML('rc-meta', 150, c.cumpl == null ? dash : Math.round(c.cumpl * 100) + '%', 'de la meta')}</div>
            <div class="dfoot"><b>${c.infMes}</b> de <b>${c.metaMes || dash}</b> uds${c.metaMes ? ` · faltan ${Math.max(0, c.metaMes - c.infMes)}` : ''}</div>
        </div>
        <div class="dcard">
            <div class="dcard-t">PROYECCIÓN SEMANAL Y MENSUAL</div>
            <div class="pbars">
                <div class="pgroup">${bar(c.prevSem, wMax, '#94A3B8', 'Sem. ant.', c.prevSem)}${bar(c.projSem, wMax, c.varSem != null && c.varSem < 0 ? THEME.red : THEME.green, `Proy. W${c.wk}`, c.projSem)}</div>
                <div class="pgroup">${bar(c.metaMes, mMax, '#94A3B8', 'Meta mes', c.metaMes || dash)}${bar(c.projMes, mMax, sem.color, 'Cierre proy.', c.projMes)}</div>
            </div>
            <div class="dfoot">${varTxt} · Proy. mes ${c.cumplProj == null ? dash : Math.round(c.cumplProj * 100) + '% de la meta'}</div>
        </div>
    </section>

    <div class="rp-sec">VENTAS E INVENTARIO INFINIX POR MODELO · ${esc(mesLargo(c.ym).toUpperCase())}</div>
    <table class="rp-tbl"><thead><tr><th class="l">MODELO</th><th>TARGET</th><th>INV.</th>${wkHead}${dayHead}<th class="c-tot">SEMANA</th>${varHead}<th class="c-tot">MES</th><th class="c-tot">SHARE</th><th class="c-tot">CUMPL.</th></tr></thead><tbody>${t1}</tbody></table>

    <div class="rp-sec">VENTA GENERAL DE LA TIENDA · SEMANA W${c.wk} · ${c.days[0]} A ${c.days[6]}</div>
    <table class="rp-tbl"><thead><tr><th class="l">MARCA</th><th>TARGET</th><th>HC</th>${wkHead}${dayHead}<th class="c-tot">SEMANA</th>${varHead}<th class="c-tot">MES</th><th class="c-tot">CUMPL.</th><th class="c-tot">SHARE</th><th class="c-tot">POS.</th><th class="c-tot">ROI</th></tr></thead><tbody>${t2}</tbody></table>

    <div class="rp-sec light">ACCESORIOS INFINIX · VENTA INDEPENDIENTE</div>
    <table class="rp-tbl"><thead><tr><th class="l">ACCESORIO</th><th>TARGET</th><th>INV.</th>${wkHead}${dayHead}<th class="c-tot">SEMANA</th>${varHead}<th class="c-tot">MES</th><th class="c-tot">CUMPL.</th></tr></thead><tbody>${t3}</tbody></table>

    <footer class="rp-foot">
        <span>ROI = unidades ÷ promotores · SHARE = participación acumulada del mes · POS. = puesto en la tienda (los empates comparten puesto) · VAR. = semana actual frente a los mismos días de la semana anterior · Accesorios excluidos de share y ROI · Proyecciones con ${c.dayOfMonth} de ${c.dim} días del mes.</span>
        <b>Infinix · Central de Operaciones</b>
    </footer>
    <div class="rp-bar"></div>`;
    stage.appendChild(el);

    // Gráficas (Chart.js)
    const roiTop = Math.max(c.roiMeta || 0, c.roiProj || 0, c.roi || 0);
    Charts.ring($('#rc-roi', el), [c.roi || 0, Math.max(0, (c.roiProj || 0) - (c.roi || 0)), Math.max(0, roiTop - Math.max(c.roi || 0, c.roiProj || 0))], [sem.color, sem.color + '55', THEME.line], { cutout: '76%' });
    Charts.ring($('#rc-share', el), shareSeg.map(s => s.v), shareSeg.map(s => s.color), { cutout: '68%', gap: true });
    const cm = c.cumpl == null ? 0 : Math.min(1, c.cumpl);
    Charts.ring($('#rc-meta', el), [cm, 1 - cm], [semaforo(c.cumpl == null ? 0 : c.cumpl / Math.max(0.01, c.dayOfMonth / c.dim)).color, THEME.line], { cutout: '76%' });
    return el;
}

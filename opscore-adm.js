// ============================================================================
// CARGAS ADMINISTRATIVAS (tienda) y FICHA ADMINISTRATIVA DEL PDV (líderes)
// La tienda sube cada mes:
//   · Acta de sample firmada (1 foto)
//   · Samples: hasta 10, cada uno con referencia, IMEI y foto
//   · Foto de la mesa con los asesores (horizontal, obligatoria)
//   · Herramientas de visibilidad: hasta 6 fotos con su tipo
// y cada semana la planilla física de ventas (hasta 3 fotos por semana).
// Toda foto sale con marca de agua (Infinix, tienda, tipo, fecha y hora, quién la subió).
// Las fotos van en zone_reports (kind 'adm', una por documento, sin caché local); el resumen de
// cumplimiento queda en la tienda (st.adm[mes]) para que líderes y avisos lo lean sin bajar fotos.
// Supervisor, formador, coordinador, gerente y admin abren la ficha desde Análisis de zona › Tiendas:
// ven las fotos, las descargan y generan la tarjeta administrativa del PDV (imagen o PDF).
// ============================================================================

const ADM = {
    MAX_SAMPLES: 10, MAX_VIS: 6, MAX_PLAN: 3,
    VIS_TIPOS: ['Exhibidor / mueble', 'Habladores y precios', 'Cenefa / branding', 'Mesa de demo', 'Material POP', 'Otro'],
    TIPO: { acta: 'Acta de sample', sample: 'Sample', mesa: 'Mesa con asesores', vis: 'Visibilidad', plan: 'Planilla semanal' },
    ICON: { acta: '📝', sample: '📱', mesa: '👥', vis: '🎯', plan: '🗒️' }
};
const admYm = () => todayStr().slice(0, 7);
// Semana de la planilla: pertenece al mes donde cae su jueves (igual que las evaluaciones)
const admWeekOf = d => { const th = weekDays(d)[3]; return { w: 'W' + isoWeek(d), ym: th.slice(0, 7), lunes: weekDays(d)[0], domingo: weekDays(d)[6] }; };
const admThursdays = ym => { const out = []; for (let i = 1; i <= daysInMonth(ym); i++) { const d = `${ym}-${pad2(i)}`; if (parseD(d).getDay() === 4) out.push(d); } return out; };
const admWeeksOfMonth = ym => admThursdays(ym).map(th => 'W' + isoWeek(th));
const admDocId = (stId, period, slot) => `adm_${stId}_${period}_${slot}`;
const admSum = (st, ym) => ((st && st.adm) || {})[ym || admYm()] || {};
const imeiOk = v => /^\d{15}$/.test(String(v || '').replace(/\D/g, ''));

// Cumplimiento del mes: 5 frentes (acta, samples, mesa, visibilidad, planillas de las semanas ya vencidas)
function admStatus(st, ym) {
    ym = ym || admYm(); const S = admSum(st, ym), today = todayStr();
    // Una semana se exige desde su domingo (ese día en la noche se sube la planilla)
    const semanas = admWeeksOfMonth(ym), venc = admThursdays(ym).filter(th => addDays(th, 3) <= today).map(th => 'W' + isoWeek(th));
    const plan = venc.filter(w => int((S.plan || {})[w]) > 0).length;
    const items = [
        { k: 'acta', ok: int(S.acta) > 0, txt: int(S.acta) ? '✓' : '✗' },
        { k: 'sample', ok: int(S.samples) > 0, txt: `${int(S.samples)}/${ADM.MAX_SAMPLES}` },
        { k: 'mesa', ok: int(S.mesa) > 0, txt: int(S.mesa) ? '✓' : '✗' },
        { k: 'vis', ok: int(S.vis) > 0, txt: `${int(S.vis)}` },
        { k: 'plan', ok: plan >= venc.length, txt: `${plan}/${venc.length}` }
    ];
    const done = items.filter(i => i.ok).length;
    return { ym, items, done, pct: done / items.length, semanas, venc, planOk: plan, at: S.at || 0, by: S.by || '' };
}
// Lo que le falta a la tienda este mes (para los avisos)
function admPendientes(st) {
    const s = admStatus(st), out = [];
    s.items.forEach(i => { if (!i.ok && i.k !== 'plan') out.push(ADM.TIPO[i.k].toLowerCase()); });
    return out;
}
const admPlanSemanaPend = st => { const W = admWeekOf(todayStr()); return int(((admSum(st, W.ym)).plan || {})[W.w]) === 0; };

// ---- Foto: reducir, marca de agua y base64 (cabe en un documento de Firestore) -----------------
function admPhoto(file, mark, opts = {}) {
    return new Promise((res, rej) => {
        const r = new FileReader();
        r.onerror = () => rej(new Error('No se pudo leer la foto'));
        r.onload = () => {
            const img = new Image();
            img.onerror = () => rej(new Error('El archivo no es una imagen válida'));
            img.onload = () => {
                if (opts.horizontal && img.height > img.width) return rej(new Error('La foto de la mesa debe ser HORIZONTAL: gira el teléfono y tómala de nuevo.'));
                const draw = (maxSide, q) => {
                    const s = Math.min(1, maxSide / Math.max(img.width, img.height)), W = Math.round(img.width * s), H = Math.round(img.height * s);
                    const c = document.createElement('canvas'); c.width = W; c.height = H;
                    const g = c.getContext('2d'); g.drawImage(img, 0, 0, W, H);
                    // Marca de agua: franja inferior con los datos y el sello Infinix en diagonal, tenue
                    const fs = Math.max(14, Math.round(Math.min(W, H) * 0.032)), band = Math.round(fs * 3.1);
                    g.save(); g.translate(W / 2, H / 2); g.rotate(-Math.atan2(H, W)); g.font = `900 ${Math.round(Math.min(W, H) * 0.16)}px Arial, sans-serif`;
                    g.fillStyle = 'rgba(255,255,255,0.13)'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('INFINIX', 0, 0); g.restore();
                    g.fillStyle = 'rgba(0,0,0,0.62)'; g.fillRect(0, H - band, W, band);
                    g.fillStyle = '#00C853'; g.fillRect(0, H - band, Math.round(fs * 0.4), band);
                    g.fillStyle = '#fff'; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
                    g.font = `800 ${fs}px Arial, sans-serif`; g.fillText(mark[0], fs, H - band + fs * 1.25, W - fs * 2);
                    g.font = `500 ${Math.round(fs * 0.82)}px Arial, sans-serif`; g.fillText(mark[1], fs, H - band + fs * 2.45, W - fs * 2);
                    return { img: c.toDataURL('image/jpeg', q), w: W, h: H };
                };
                let out = draw(1600, 0.72);
                if (out.img.length > 850000) out = draw(1280, 0.62);
                if (out.img.length > 850000) out = draw(1024, 0.55);
                res(out);
            };
            img.src = r.result;
        };
        r.readAsDataURL(file);
    });
}

// ---- Datos -----------------------------------------------------------------------------------
async function admLoad(stId, ym) {
    return (await Data.listRaw(COL.zoneReports, [['storeId', '==', stId], ['ym', '==', ym]])).filter(d => d.kind === 'adm').sort((a, b) => String(a.period + a.slot).localeCompare(String(b.period + b.slot), 'es', { numeric: true }));
}
// Recalcula el resumen del mes con las fotos que hay y lo guarda en la tienda
async function admSaveSummary(st, ym, docs) {
    const S = { acta: 0, samples: 0, mesa: 0, vis: 0, plan: {}, at: Date.now(), by: (State.session && (State.session.nombre || State.session.userName)) || st.tienda };
    docs.forEach(d => {
        if (d.tipo === 'acta') S.acta++; else if (d.tipo === 'sample') S.samples++; else if (d.tipo === 'mesa') S.mesa++; else if (d.tipo === 'vis') S.vis++;
        else if (d.tipo === 'plan') S.plan[d.period] = int(S.plan[d.period]) + 1;
    });
    const keep = Object.keys(st.adm || {}).filter(k => k !== ym).sort().slice(-2);           // el mes y los dos anteriores
    const adm = {}; keep.forEach(k => { adm[k] = st.adm[k]; }); adm[ym] = S;
    st.adm = adm;
    await Data.set(COL.stores, st.id, { adm, updatedAt: Date.now() }, true);
}
async function admUpload(st, file, meta) {
    const who = (State.session && (State.session.nombre || State.session.userName)) || st.tienda;
    const first = `INFINIX · ${st.tienda} · ${(st.cadena || chainGroup(st).label || '').toString().toUpperCase()}`;
    const det = meta.tipo === 'sample' ? `${meta.ref || 'Sample'} · IMEI ${meta.imei}` : meta.tipo === 'vis' ? `Visibilidad · ${meta.nota || ''}` : meta.tipo === 'plan' ? `Planilla ${meta.period} · hoja ${meta.slot.slice(1)}` : ADM.TIPO[meta.tipo];
    const ph = await admPhoto(file, [first, `${det} · ${fechaHora(Date.now())} · ${who}`], { horizontal: meta.tipo === 'mesa' });
    const id = admDocId(st.id, meta.period, meta.slot);
    const doc = { kind: 'adm', storeId: st.id, zona: st.zona, tienda: st.tienda, cadena: st.cadena || '', ym: meta.ym, period: meta.period, slot: meta.slot, tipo: meta.tipo,
        ref: meta.ref || '', imei: meta.imei || '', nota: meta.nota || '', img: ph.img, w: ph.w, h: ph.h, at: Date.now(), by: who };
    const r = await Data.setRaw(COL.zoneReports, id, doc);
    if (r.denied) throw new Error('La nube rechazó la foto (permisos de Firestore).');
    return { doc, synced: r.synced };
}
const admFileName = (st, d) => `${slug(st.tienda)}_${d.ym}_${d.tipo}${d.tipo === 'plan' ? '_' + d.period : ''}_${d.slot}${d.imei ? '_' + d.imei : ''}.jpg`;
const dataUrlBlob = u => { const [h, b] = u.split(','), bin = atob(b), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type: (h.match(/data:([^;]+)/) || [])[1] || 'image/jpeg' }); };
function admViewPhoto(d) {
    const st = storeById(d.storeId) || { tienda: d.tienda };
    const m = openModal(`<h3 class="modal-title">${ADM.ICON[d.tipo]} ${esc(ADM.TIPO[d.tipo])}${d.imei ? ' · ' + esc(d.imei) : ''}</h3>
        <p class="mute">${esc(d.tienda)} · ${esc(fechaHora(d.at))} · ${esc(d.by || '')}</p>
        <div class="preview-box"><img src="${d.img}" alt="${esc(ADM.TIPO[d.tipo])}"></div>
        <div class="actions"><button class="btn btn-primary" data-dl>⬇️ Descargar foto</button><button class="btn btn-ghost" data-x>Cerrar</button></div>`, { wide: true });
    $('[data-dl]', m).onclick = () => downloadBlob(dataUrlBlob(d.img), admFileName(st, d));
    $('[data-x]', m).onclick = () => closeModal(m);
}

// ---- Pantalla de la tienda ------------------------------------------------------------------
registerModule('adm', (() => {
    let ym = admYm(), docs = [], semana = admWeekOf(todayStr()).w, view = null, busyUp = false;
    const st = () => currentStore();

    async function render(v) {
        view = v; const s = st(); if (!s) { v.innerHTML = '<div class="card">Sesión de tienda no válida.</div>'; return; }
        v.innerHTML = '<div class="card empty">Cargando tus cargas administrativas…</div>';
        try { docs = await admLoad(s.id, ym); } catch (e) { docs = []; }
        const ws = admWeeksOfMonth(ym); if (!ws.includes(semana)) semana = ws.includes(admWeekOf(todayStr()).w) ? admWeekOf(todayStr()).w : ws[ws.length - 1];
        paint();
    }
    const of = (tipo, period) => docs.filter(d => d.tipo === tipo && (!period || d.period === period));
    const thumb = (d, del = true) => `<div class="adm-th"><img src="${d.img}" alt="" data-view="${esc(d.id)}">${d.imei ? `<small>${esc(d.ref || '')}<br><b>${esc(d.imei)}</b></small>` : d.nota ? `<small>${esc(d.nota)}</small>` : ''}${del ? `<button class="adm-del" data-del="${esc(d.id)}" title="Quitar">✕</button>` : ''}</div>`;
    const upBtn = (label, attrs, horizontal) => `<label class="btn btn-primary sm adm-up">📷 ${label}<input type="file" accept="image/*" ${horizontal ? '' : 'capture="environment"'} ${attrs} hidden></label>`;

    function paint() {
        const s = st(), S = admStatus({ ...s, adm: { ...(s.adm || {}), [ym]: summaryNow() } }, ym), meses = [admYm(), addDays(admYm() + '-01', -1).slice(0, 7)];
        const samples = of('sample'), vis = of('vis'), plan = of('plan', semana), acta = of('acta')[0], mesa = of('mesa')[0];
        const nextS = Array.from({ length: ADM.MAX_SAMPLES }, (_, i) => 's' + pad2(i + 1)).find(k => !samples.some(d => d.slot === k));
        const nextV = Array.from({ length: ADM.MAX_VIS }, (_, i) => 'v' + (i + 1)).find(k => !vis.some(d => d.slot === k));
        const nextP = Array.from({ length: ADM.MAX_PLAN }, (_, i) => 'p' + (i + 1)).find(k => !plan.some(d => d.slot === k));
        const refs = INFINIX_MODELS.map(m => m.name);
        view.innerHTML = `<section class="card">
            <div class="row between wrap" style="gap:8px"><div class="row">${storeLogo(s)}<div><h2 class="h2">📁 Cargas administrativas</h2><p class="mute">${esc(s.tienda)} · todas las fotos salen con marca de agua de la tienda, la fecha y la hora</p></div></div>
                <div class="row" style="gap:8px"><select class="input" id="adm-mes">${meses.map(m => `<option value="${m}" ${m === ym ? 'selected' : ''}>${esc(mesLargo(m))}</option>`).join('')}</select><button class="btn btn-ghost sm" id="adm-ficha">🪪 Ver mi ficha</button></div></div>
            <div class="adm-kpis">${S.items.map(i => `<div class="${i.ok ? 'ok' : 'bad'}"><span>${ADM.ICON[i.k]} ${esc(ADM.TIPO[i.k])}</span><b>${i.txt}</b></div>`).join('')}<div class="tot"><span>Cumplimiento</span><b>${Math.round(S.pct * 100)}%</b></div></div>
            <p class="hint">📅 Del 1 al 5 de cada mes: acta, samples, mesa y visibilidad. 🗒️ Cada domingo: la planilla física de ventas de la semana.</p></section>

        <section class="card"><h3 class="h3">📝 Acta de sample <small class="mute">firmada, completa y legible</small></h3>
            <div class="adm-grid">${acta ? thumb(acta) : '<p class="empty sm">Aún no la cargas.</p>'}</div>
            <div class="row" style="margin-top:8px">${upBtn(acta ? 'Reemplazar acta' : 'Subir acta', 'data-up="acta"')}</div></section>

        <section class="card"><h3 class="h3">📱 Samples <small class="mute">${samples.length} de ${ADM.MAX_SAMPLES} · foto del equipo en exhibición con su IMEI</small></h3>
            <div class="adm-grid">${samples.map(d => thumb(d)).join('') || '<p class="empty sm">Aún no cargas samples.</p>'}</div>
            ${nextS ? `<div class="adm-form"><input class="input" id="adm-ref" list="adm-refs" placeholder="Referencia (ej. HOT 60 Pro+)"><datalist id="adm-refs">${refs.map(r => `<option value="${esc(r)}">`).join('')}</datalist>
                <input class="input num" id="adm-imei" inputmode="numeric" maxlength="15" placeholder="IMEI (15 dígitos)">${upBtn('Foto del sample', `data-up="sample" data-slot="${nextS}"`)}</div>` : '<p class="hint">Llegaste al máximo de 10 samples. Quita uno para cargar otro.</p>'}</section>

        <section class="card"><h3 class="h3">👥 Mesa con los asesores <small class="mute">foto HORIZONTAL de la mesa con todo el equipo</small></h3>
            <div class="adm-grid wide">${mesa ? thumb(mesa) : '<p class="empty sm">Aún no la cargas.</p>'}</div>
            <div class="row" style="margin-top:8px">${upBtn(mesa ? 'Reemplazar foto' : 'Subir foto horizontal', 'data-up="mesa"', true)}</div></section>

        <section class="card"><h3 class="h3">🎯 Herramientas de visibilidad <small class="mute">${vis.length} de ${ADM.MAX_VIS}</small></h3>
            <div class="adm-grid">${vis.map(d => thumb(d)).join('') || '<p class="empty sm">Aún no cargas visibilidad.</p>'}</div>
            ${nextV ? `<div class="adm-form"><select class="input" id="adm-vtipo">${ADM.VIS_TIPOS.map(t => `<option>${esc(t)}</option>`).join('')}</select>${upBtn('Foto de visibilidad', `data-up="vis" data-slot="${nextV}"`)}</div>` : ''}</section>

        <section class="card"><h3 class="h3">🗒️ Planilla física de ventas <small class="mute">una por semana (hasta ${ADM.MAX_PLAN} hojas)</small></h3>
            <div class="seg sm wrap" style="margin:6px 0">${admWeeksOfMonth(ym).map(w => { const n = of('plan', w).length; return `<button class="seg-btn ${w === semana ? 'active' : ''}" data-wk="${w}">${w} ${n ? '✅' : '·'}</button>`; }).join('')}</div>
            <div class="adm-grid">${plan.map(d => thumb(d)).join('') || `<p class="empty sm">Sin planilla de la semana ${semana}.</p>`}</div>
            ${nextP ? `<div class="row" style="margin-top:8px">${upBtn('Foto de la planilla ' + semana, `data-up="plan" data-slot="${nextP}"`)}</div>` : ''}</section>`;
        $('#adm-mes').onchange = e => { ym = e.target.value; render(view); };
        $('#adm-ficha').onclick = () => openAdmFicha(st().id, ym);
        $$('[data-wk]', view).forEach(b => b.onclick = () => { semana = b.dataset.wk; paint(); });
        view.onclick = e => {
            const v = e.target.closest('[data-view]'); if (v) { const d = docs.find(x => x.id === v.dataset.view); if (d) admViewPhoto(d); return; }
            const x = e.target.closest('[data-del]'); if (x) remove(x.dataset.del);
        };
        view.onchange = e => { const inp = e.target.closest('[data-up]'); if (inp && inp.files && inp.files[0]) upload(inp.dataset.up, inp.dataset.slot, inp.files[0], inp); };
    }
    function summaryNow() {
        const S = { acta: 0, samples: 0, mesa: 0, vis: 0, plan: {} };
        docs.forEach(d => { if (d.tipo === 'acta') S.acta++; else if (d.tipo === 'sample') S.samples++; else if (d.tipo === 'mesa') S.mesa++; else if (d.tipo === 'vis') S.vis++; else if (d.tipo === 'plan') S.plan[d.period] = int(S.plan[d.period]) + 1; });
        return S;
    }
    async function upload(tipo, slot, file, inp) {
        const s = st(); if (busyUp) return; if (!canWrite()) return;
        const meta = { tipo, ym, period: tipo === 'plan' ? semana : ym, slot: slot || tipo };
        if (tipo === 'sample') {
            meta.ref = ($('#adm-ref').value || '').trim(); meta.imei = ($('#adm-imei').value || '').replace(/\D/g, '');
            if (!meta.ref) { toast('Escribe la referencia del sample antes de la foto.', 'warn'); inp.value = ''; return; }
            if (!imeiOk(meta.imei)) { toast('El IMEI debe tener 15 dígitos.', 'warn'); inp.value = ''; return; }
            if (docs.some(d => d.tipo === 'sample' && d.imei === meta.imei)) { toast('Ese IMEI ya está cargado este mes.', 'warn'); inp.value = ''; return; }
        }
        if (tipo === 'vis') meta.nota = $('#adm-vtipo').value;
        busyUp = true; const lab = inp.closest('label'); if (lab) lab.classList.add('loading');
        try {
            const { doc, synced } = await admUpload(s, file, meta);
            docs = docs.filter(d => d.id !== doc.id).concat({ ...doc, id: admDocId(s.id, meta.period, meta.slot) });
            await admSaveSummary(s, ym, docs);
            toast(synced ? `Foto guardada ✅ (${ADM.TIPO[tipo]})` : `Foto guardada en el teléfono (${ADM.TIPO[tipo]}): se sube al volver la señal.`, synced ? 'ok' : 'warn');
            if (typeof paintReminder === 'function') paintReminder();
        } catch (e) { toast(e.message || 'No se pudo subir la foto', 'error', 6000); }
        finally { busyUp = false; paint(); }
    }
    async function remove(id) {
        const d = docs.find(x => x.id === id); if (!d) return;
        if (!confirm(`¿Quitar esta foto (${ADM.TIPO[d.tipo]}${d.imei ? ' ' + d.imei : ''})?`)) return;
        await Data.delRaw(COL.zoneReports, id); docs = docs.filter(x => x.id !== id);
        await admSaveSummary(st(), ym, docs); paint();
    }
    return { render };
})());

// ---- Ficha administrativa del PDV (tienda y líderes) ----------------------------------------
async function openAdmFicha(stId, ym) {
    const st = storeById(stId); if (!st) return;
    ym = ym || admYm();
    const m = openModal(`<h3 class="modal-title">🪪 Ficha administrativa · ${esc(st.tienda)}</h3><div id="af-body" class="empty">Cargando fotos…</div>`, { wide: true });
    let docs = [];
    try { docs = await admLoad(st.id, ym); } catch (e) { docs = []; }
    const S = admStatus(st, ym), body = $('#af-body', m); body.className = '';
    const grupo = (tipo, titulo) => { const L = docs.filter(d => d.tipo === tipo); return `<div class="af-sec"><b>${ADM.ICON[tipo]} ${titulo} <small class="mute">(${L.length})</small></b><div class="adm-grid">${L.map(d => `<div class="adm-th"><img src="${d.img}" alt="" data-view="${esc(d.id)}">${d.imei ? `<small>${esc(d.ref || '')}<br><b>${esc(d.imei)}</b></small>` : d.tipo === 'plan' ? `<small>${esc(d.period)}</small>` : d.nota ? `<small>${esc(d.nota)}</small>` : ''}</div>`).join('') || '<p class="empty sm">Sin cargar.</p>'}</div></div>`; };
    body.innerHTML = `<p class="mute">${esc(mesLargo(ym))} · ${esc(st.zona)} · última carga ${S.at ? esc(fechaHora(S.at)) + ' por ' + esc(S.by) : '—'}</p>
        <div class="adm-kpis">${S.items.map(i => `<div class="${i.ok ? 'ok' : 'bad'}"><span>${ADM.ICON[i.k]} ${esc(ADM.TIPO[i.k])}</span><b>${i.txt}</b></div>`).join('')}<div class="tot"><span>Cumplimiento</span><b>${Math.round(S.pct * 100)}%</b></div></div>
        ${grupo('acta', 'Acta de sample')}${grupo('sample', 'Samples')}${grupo('mesa', 'Mesa con asesores')}${grupo('vis', 'Visibilidad')}${grupo('plan', 'Planillas semanales')}
        <div class="actions" id="af-act" style="margin-top:12px"><button class="btn btn-ghost" data-all ${docs.length ? '' : 'disabled'}>⬇️ Descargar las ${docs.length} fotos</button><button class="btn btn-ghost" data-act="preview">👁️ Tarjeta</button><button class="btn btn-wa" data-act="share">📲 WhatsApp</button><button class="btn btn-primary" data-act="save">⬇️ Tarjeta PNG</button><button class="btn btn-ghost" data-act="pdf">📄 PDF</button></div>`;
    body.addEventListener('click', async e => {
        const v = e.target.closest('[data-view]'); if (v) { const d = docs.find(x => x.id === v.dataset.view); if (d) admViewPhoto(d); return; }
        const all = e.target.closest('[data-all]'); if (all) {
            busy(all, true);
            for (const d of docs) { await downloadBlob(dataUrlBlob(d.img), admFileName(st, d)); await new Promise(r => setTimeout(r, 450)); }
            busy(all, false); toast(`${docs.length} fotos descargadas`, 'ok');
        }
    });
    ReportActions.bind($('#af-act', m), {
        title: 'Ficha administrativa del PDV',
        noStore: true,
        filename: () => `Ficha_adm_${slug(st.tienda)}_${ym}.png`,
        build: stage => buildAdmCanvas(stage, st, ym, S, docs)
    });
}

function buildAdmCanvas(stage, st, ym, S, docs) {
    const autor = State.session || {}, rol = ROLES[autor.rol] ? ROLES[autor.rol].label : 'Tienda';
    const fotos = (tipo, n) => docs.filter(d => d.tipo === tipo).slice(0, n);
    const cell = d => `<figure><img src="${d.img}" alt=""><figcaption>${d.imei ? `${esc(d.ref || '')} · <b>${esc(d.imei)}</b>` : d.tipo === 'plan' ? `Planilla ${esc(d.period)}` : esc(d.nota || ADM.TIPO[d.tipo])}</figcaption></figure>`;
    const samples = docs.filter(d => d.tipo === 'sample');
    const el = document.createElement('div'); el.className = 'rp af-rep';
    el.innerHTML = `<div class="rp-bar"></div>
    <header class="rp-head"><img class="rp-logo" src="${LOGO_INFINIX}" alt="Infinix">
        <div class="rp-head-mid"><div class="rp-kicker">FICHA ADMINISTRATIVA DEL PDV · ${esc(mesLargo(ym).toUpperCase())}</div><div class="rp-title">${esc(st.tienda.toUpperCase())}</div><div class="rp-sub">${esc(st.zona)} · ${esc(chainGroup(st).label)} · generado ${esc(fechaHora(Date.now()))} por ${esc(autor.nombre || autor.userName || st.tienda)} (${esc(rol)})</div></div>
        <div class="rp-chain">${storeLogo(st)}</div></header>
    <div class="af-band">${S.items.map(i => `<div class="${i.ok ? 'ok' : 'bad'}"><span>${ADM.ICON[i.k]} ${esc(ADM.TIPO[i.k])}</span><b>${i.txt}</b></div>`).join('')}<div class="tot"><span>CUMPLIMIENTO</span><b>${Math.round(S.pct * 100)}%</b></div></div>
    <div class="rp-sec">MESA CON ASESORES Y ACTA DE SAMPLE</div>
    <div class="af-pair">${fotos('mesa', 1).map(cell).join('') || '<div class="af-miss">Sin foto de la mesa</div>'}${fotos('acta', 1).map(cell).join('') || '<div class="af-miss">Sin acta de sample</div>'}</div>
    <div class="rp-sec">SAMPLES · ${samples.length} DE ${ADM.MAX_SAMPLES}</div>
    ${samples.length ? `<div class="af-grid">${samples.map(cell).join('')}</div>` : '<div class="af-miss line">Sin samples cargados</div>'}
    <div class="rp-sec">HERRAMIENTAS DE VISIBILIDAD</div>
    ${fotos('vis', 6).length ? `<div class="af-grid">${fotos('vis', 6).map(cell).join('')}</div>` : '<div class="af-miss line">Sin fotos de visibilidad</div>'}
    <div class="rp-sec">PLANILLAS SEMANALES · ${S.planOk} DE ${S.venc.length} SEMANAS VENCIDAS</div>
    ${fotos('plan', 8).length ? `<div class="af-grid">${fotos('plan', 8).map(cell).join('')}</div>` : '<div class="af-miss line">Sin planillas cargadas</div>'}
    <footer class="rp-foot"><span>Cumplimiento = acta, al menos un sample, foto horizontal de la mesa, al menos una foto de visibilidad y planilla de cada semana vencida del mes. Las fotos llevan marca de agua con la tienda, la fecha y la hora en que se cargaron.</span><b>Infinix · Central de Operaciones</b></footer><div class="rp-bar"></div>`;
    stage.appendChild(el); return el;
}

// ---- Tabla de cumplimiento para líderes (Análisis de zona › Tiendas) ------------------------
function paintAdmZone(box, stores, label) {
    if (!box) return;
    const ym = admYm(), rows = stores.map(st => ({ st, s: admStatus(st, ym) })).sort((a, b) => a.s.pct - b.s.pct || a.st.tienda.localeCompare(b.st.tienda));
    const prom = rows.length ? sum(rows.map(r => r.s.pct)) / rows.length : 0, full = rows.filter(r => r.s.done === 5).length;
    const mk = i => `<td class="${i.ok ? 'g' : 'r'}">${i.txt}</td>`;
    box.innerHTML = `<section class="card"><div class="row between wrap" style="gap:8px"><h3 class="h3">📁 Cargas administrativas · ${esc(mesLargo(ym))}</h3><small class="mute">${esc(label || '')} · ${full} de ${rows.length} PDV al 100% · promedio ${Math.round(prom * 100)}%</small></div>
        <p class="mute">Toca un PDV para ver sus fotos, descargarlas y generar su ficha administrativa.</p>
        <div class="tbl-scroll"><table class="tbl compact adm-tbl"><thead><tr><th>PDV</th><th>📝 Acta</th><th>📱 Samples</th><th>👥 Mesa</th><th>🎯 Visib.</th><th>🗒️ Planillas</th><th>%</th><th></th></tr></thead><tbody>
        ${rows.map(r => `<tr><td class="l"><div class="row" style="gap:6px;flex-wrap:nowrap">${storeLogo(r.st, 'xs')}<b>${esc(r.st.tienda)}</b></div></td>${r.s.items.map(mk).join('')}<td><i class="pill ${r.s.pct >= 1 ? 'ok' : r.s.pct >= .6 ? 'warn' : 'bad'}">${Math.round(r.s.pct * 100)}%</i></td><td><button class="btn btn-ghost sm" data-adm="${esc(r.st.id)}">🪪 Ficha</button></td></tr>`).join('')}
        </tbody></table></div></section>`;
    $$('[data-adm]', box).forEach(b => b.onclick = () => openAdmFicha(b.dataset.adm, ym));
}

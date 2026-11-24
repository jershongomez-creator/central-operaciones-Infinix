// ============================================================================
// FACTURAS DE IMEI SIN ACTIVAR y LEGALIZACIONES DE OBSEQUIOS (v1.19)
//  · El asesor sube la factura de cada IMEI sin activar (Mi central). Los líderes la ven y la descargan en
//    Reportes › IMEI sin activar. Cuando una data nueva trae ese IMEI ya activo, la factura se borra sola de la nube.
//  · La tienda registra el merchandising que le llega (obsequios: parlantes, audífonos…) con su cantidad y sube
//    la legalización de cada entrega. Supervisor, formador y coordinador ven lo pendiente y descargan las
//    legalizaciones por tienda (para subirlas a la otra plataforma).
// Todo va en la colección zone_reports (fotos con marca de agua o PDF en trozos), sin copia en el navegador.
// ============================================================================

// ---- Subida genérica: foto (marca de agua) o PDF (en trozos de 700 KB) --------------------------
async function docUpload(st, file, id, base, detalle) {
    const who = (State.session && (State.session.nombre || State.session.userName)) || st.tienda;
    const mk = [`INFINIX · ${st.tienda} · ${(st.cadena || chainGroup(st).label || '').toString().toUpperCase()}`, `${detalle} · ${fechaHora(Date.now())} · ${who}`];
    base = { ...base, storeId: st.id, zona: st.zona, tienda: st.tienda, cadena: st.cadena || '', at: Date.now(), by: who };
    let doc;
    if (isPdfFile(file)) {
        if (file.size > 6e6) throw new Error('El PDF pesa más de 6 MB: comprímelo o súbelo como foto.');
        let bytes = new Uint8Array(await file.arrayBuffer()), pages = 0;
        try { const o = await admStampPdf(bytes, mk); bytes = o.bytes; pages = o.pages; } catch (e) { console.warn('[Central] PDF sin marca de agua', e); }
        const b64 = bytesToB64(bytes), parts = []; for (let i = 0; i < b64.length; i += 700000) parts.push(b64.slice(i, i + 700000));
        for (let i = 0; i < parts.length; i++) { const r = await Data.setRaw(COL.zoneReports, `${id}_c${i}`, { kind: base.kind + 'Part', parent: id, i, b64: parts[i] }); if (r.denied) throw new Error('La nube rechazó el archivo (permisos de Firestore).'); }
        doc = { ...base, pdf: true, fileName: file.name, size: bytes.length, pages, parts: parts.length, img: '' };
    } else {
        const ph = await admPhoto(file, mk);
        doc = { ...base, img: ph.img, w: ph.w, h: ph.h };
    }
    const r = await Data.setRaw(COL.zoneReports, id, doc);
    if (r.denied) throw new Error('La nube rechazó la foto (permisos de Firestore).');
    return { ...doc, id };
}
async function docDelete(d) {
    await Data.delRaw(COL.zoneReports, d.id);
    for (let i = 0; i < int(d.parts); i++) await Data.delRaw(COL.zoneReports, `${d.id}_c${i}`);
}
const docFileName = (d, extra) => `${slug(d.tienda || '')}_${extra}.${d.pdf ? 'pdf' : 'jpg'}`;
async function docDownload(d, name) { try { return await downloadBlob(await admBlob(d), name); } catch (e) { toast(e.message || 'No se pudo descargar', 'error'); return false; } }
// Botones de subida: cámara y galería/PDF
const docUpBtns = (label, attrs) => `<span class="adm-ups"><label class="btn btn-primary sm adm-up">📷 ${label}<input type="file" accept="image/*" capture="environment" ${attrs} hidden></label><label class="btn btn-ghost sm adm-up">📄 PDF o galería<input type="file" accept="application/pdf,image/*" ${attrs} hidden></label></span>`;
async function listByZones(kind, zonas) {
    const out = [];
    for (let i = 0; i < zonas.length; i += 10) out.push(...await Data.listRaw(COL.zoneReports, [['kind', '==', kind], ['zona', 'in', zonas.slice(i, i + 10)]]).catch(() => []));
    return out;
}

// ============================================================================
// 1) FACTURAS DE IMEI SIN ACTIVAR
// ============================================================================
const ImeiFac = (() => {
    const idOf = (stId, imei) => `fac_${stId}_${String(imei).replace(/\D/g, '')}`;
    const byStore = async stId => Data.listRaw(COL.zoneReports, [['kind', '==', 'imeiFac'], ['storeId', '==', stId]]).catch(() => []);
    // Limpieza: si la última data plana del mes de la venta (con columna de activación) ya no trae el IMEI como inactivo,
    // la factura ya no sirve y se borra de la nube. Las de meses anteriores al pasado también se borran.
    async function cleanup(docs) {
        const prev = addDays(todayStr().slice(0, 7) + '-01', -1).slice(0, 7), keep = [];
        for (const d of docs) {
            const st = storeById(d.storeId), sn = st && State.zoneSnaps ? State.zoneSnaps[st.zona] : null, S = sn && sn.stores ? sn.stores[d.storeId] : null;
            const viejo = (d.month || '') < prev;
            const activo = sn && !sn.seed && sn.month === d.month && sn.columns && sn.columns.activation && (sn.updatedAt || 0) > (d.at || 0) && !((S && S.inact) || []).some(r => String(r.imei) === String(d.imei));
            if (viejo || activo) { try { await docDelete(d); } catch (e) { keep.push(d); } } else keep.push(d);
        }
        return keep;
    }
    async function upload(st, r, file) {
        return docUpload(st, file, idOf(st.id, r.imei), { kind: 'imeiFac', imei: String(r.imei), ref: r.ref || '', asesor: r.a || '', f: r.f || '', month: (r.f || todayStr()).slice(0, 7) }, `Factura IMEI ${r.imei} · ${r.ref || ''}`);
    }
    return { idOf, byStore, cleanup, upload, byZones: zonas => listByZones('imeiFac', zonas) };
})();

// ============================================================================
// 2) OBSEQUIOS: lotes de merchandising recibidos y legalizaciones
// ============================================================================
const Obseq = (() => {
    const lotes = st => ((st && st.obsequios) || []).filter(l => l && l.id);
    const byStore = async stId => (await Data.listRaw(COL.zoneReports, [['kind', '==', 'legal'], ['storeId', '==', stId]]).catch(() => [])).sort((a, b) => (b.at || 0) - (a.at || 0));
    // Por lote: recibidas, legalizadas y pendientes
    function estado(st, docs) {
        return lotes(st).map(l => { const leg = sum(docs.filter(d => d.lotId === l.id).map(d => int(d.uds) || 1)); return { ...l, leg, pend: Math.max(0, int(l.cant) - leg) }; });
    }
    const pendientes = (st, docs) => sum(estado(st, docs).map(l => l.pend));
    async function saveLotes(st, L) { st.obsequios = L; return Data.set(COL.stores, st.id, { obsequios: L, updatedAt: Date.now() }, true); }
    async function upload(st, lote, uds, file) {
        const id = `leg_${st.id}_${Date.now()}`;
        return docUpload(st, file, id, { kind: 'legal', lotId: lote.id, item: lote.item, uds: Math.max(1, int(uds)), fecha: todayStr(), ym: todayStr().slice(0, 7) }, `Legalización ${lote.item} · ${Math.max(1, int(uds))} ud(s)`);
    }
    return { lotes, byStore, estado, pendientes, saveLotes, upload, byZones: zonas => listByZones('legal', zonas) };
})();
// Cuántas legalizaciones le faltan a la tienda (para el aviso del cierre); se recuerda unos minutos
const obseqPendCache = {};
async function obseqPendientes(st) {
    const c = obseqPendCache[st.id]; if (c && Date.now() - c.t < 120000) return c.n;
    if (!Obseq.lotes(st).length) return 0;
    const n = Obseq.pendientes(st, await Obseq.byStore(st.id)); obseqPendCache[st.id] = { n, t: Date.now() }; return n;
}

// ---- Módulo de la tienda: 🎁 Obsequios ---------------------------------------------------------
registerModule('obseq', (() => {
    let docs = [], view = null, busyUp = false;
    const st = () => currentStore();
    async function render(v) {
        view = v; const s = st(); if (!s) { v.innerHTML = '<div class="card">Sesión de tienda no válida.</div>'; return; }
        v.innerHTML = '<div class="card empty">Cargando obsequios…</div>';
        docs = await Obseq.byStore(s.id);
        paint();
    }
    function paint() {
        const s = st(); if (!view || !s) return;
        const E = Obseq.estado(s, docs), pend = sum(E.map(l => l.pend)), items = [...new Set(E.map(l => l.item))];
        obseqPendCache[s.id] = { n: pend, t: Date.now() };
        view.innerHTML = `<section class="card"><div class="row">${storeLogo(s)}<div><h2 class="h2">🎁 Obsequios y legalizaciones</h2><p class="mute">${esc(s.tienda)} · registra el merchandising que te llega y sube la legalización de cada entrega</p></div></div>
            <div class="adm-kpis"><div class="${pend ? 'bad' : 'ok'}"><span>Pendientes por legalizar</span><b>${pend}</b></div><div><span>Recibidas</span><b>${sum(E.map(l => int(l.cant)))}</b></div><div class="ok"><span>Legalizadas</span><b>${sum(E.map(l => l.leg))}</b></div></div></section>
        <section class="card"><h3 class="h3">➕ Me llegó merchandising</h3>
            <div class="row wrap" style="gap:6px"><input class="input grow" id="ob-item" list="ob-items" placeholder="¿Qué te llegó? (escríbelo o pégalo, ej. Parlante Infinix)"><datalist id="ob-items">${[...new Set(items.concat(['Parlante', 'Audífonos', 'Power bank', 'Smartwatch', 'Gorra', 'Termo', 'Maleta']))].map(x => `<option value="${esc(x)}">`).join('')}</datalist>
            <input class="input num" id="ob-cant" type="number" inputmode="numeric" min="1" placeholder="Cantidad" style="width:110px"><button class="btn btn-dark" id="ob-add">Agregar</button></div>
            <p class="hint">Cada unidad que entregues a un cliente se legaliza con su foto o PDF. Tus líderes ven cuántas te faltan.</p></section>
        ${E.length ? E.map(l => `<section class="card ob-lote ${l.pend ? '' : 'done'}"><div class="row between wrap"><div><b class="ob-it">${esc(l.item)}</b> <small class="mute">llegaron ${int(l.cant)} · ${esc(fechaLarga(l.fecha || todayStr()))}</small></div><i class="pill ${l.pend ? 'warn' : 'ok'}">${l.pend ? `${l.pend} por legalizar` : '✓ todo legalizado'}</i></div>
            <div class="mm-bar"><div style="width:${int(l.cant) ? Math.min(100, l.leg / int(l.cant) * 100) : 0}%"></div></div><small class="mute">${l.leg} de ${int(l.cant)} legalizadas</small>
            ${l.pend ? `<div class="row wrap" style="gap:6px;margin-top:8px"><label class="field-inline"><span class="lbl">Unidades en esta legalización</span><input class="input num" type="number" inputmode="numeric" min="1" max="${l.pend}" value="1" data-obu="${esc(l.id)}" style="width:90px"></label>${docUpBtns('Legalizar', `data-obup="${esc(l.id)}"`)}</div>` : ''}
            <div class="adm-grid">${docs.filter(d => d.lotId === l.id).map(d => `<div class="adm-th">${d.pdf ? admPdfTile(d) : `<img src="${d.img}" alt="Legalización">`}<small>${esc((d.fecha || '').slice(8))}/${esc((d.fecha || '').slice(5, 7))} · ${int(d.uds) || 1} ud(s)</small><button class="icon-btn sm" data-obx="${esc(d.id)}" title="Quitar">✕</button></div>`).join('')}</div>
            ${!l.leg ? `<button class="btn btn-link sm" data-oblx="${esc(l.id)}">Quitar este registro</button>` : ''}</section>`).join('') : '<div class="card empty">Aún no registras merchandising. Cuando te llegue, agrégalo arriba con su cantidad.</div>'}`;
        $('#ob-add', view).onclick = async () => {
            const item = ($('#ob-item', view).value || '').trim().replace(/\s+/g, ' '), cant = int($('#ob-cant', view).value);
            if (!item || cant < 1) return toast('Escribe qué te llegó y la cantidad.', 'warn');
            if (!canWrite()) return;
            const L = Obseq.lotes(s).concat([{ id: 'l' + Date.now(), item: item.charAt(0).toUpperCase() + item.slice(1), cant, fecha: todayStr(), by: (State.session && State.session.nombre) || s.tienda }]);
            await Obseq.saveLotes(s, L); toast('Merchandising registrado ✔', 'ok'); paint();
        };
        view.onclick = async e => {
            const x = e.target.closest('[data-obx]'); if (x) { const d = docs.find(y => y.id === x.dataset.obx); if (d && await confirmBox('¿Quitar esta legalización?', 'Quitar')) { await docDelete(d); docs = docs.filter(y => y !== d); paint(); } return; }
            const lx = e.target.closest('[data-oblx]'); if (lx && await confirmBox('¿Quitar este registro de merchandising?', 'Quitar')) { await Obseq.saveLotes(s, Obseq.lotes(s).filter(l => l.id !== lx.dataset.oblx)); paint(); }
        };
        $$('[data-obup]', view).forEach(inp => inp.onchange = async () => {
            const f = inp.files && inp.files[0]; if (!f || busyUp) return; if (!canWrite()) return;
            const lote = Obseq.estado(s, docs).find(l => l.id === inp.dataset.obup), uds = Math.min(lote.pend, Math.max(1, int(($(`[data-obu="${lote.id}"]`, view) || {}).value)));
            busyUp = true; const lab = inp.closest('label'); if (lab) lab.classList.add('loading');
            try { const d = await Obseq.upload(s, lote, uds, f); docs.unshift(d); toast('Legalización cargada ✔', 'ok'); }
            catch (err) { toast(err.message || 'No se pudo cargar', 'error'); }
            finally { busyUp = false; inp.value = ''; paint(); }
        });
    }
    return { render, onData: () => paint() };
})());

// ---- Panel de líderes (Central de reportes › Obsequios) ----------------------------------------
async function paintObseqLeaders(box, stores) {
    if (!box) return;
    box.innerHTML = '<p class="hint">Buscando legalizaciones…</p>';
    const zonas = [...new Set(stores.map(s => s.zona).filter(Boolean))], docs = await Obseq.byZones(zonas);
    if (!box.isConnected) return;
    const R = stores.map(st => { const D = docs.filter(d => d.storeId === st.id), E = Obseq.estado(st, D); return { st, D, E, rec: sum(E.map(l => int(l.cant))), leg: sum(E.map(l => l.leg)), pend: sum(E.map(l => l.pend)) }; }).filter(r => r.E.length || r.D.length)
        .sort((a, b) => b.pend - a.pend || b.rec - a.rec);
    const tot = k => sum(R.map(r => r[k]));
    box.innerHTML = `<div class="zg-kpis"><div class="hl"><span>Pendientes por legalizar</span><b class="${tot('pend') ? 'r' : 'g'}">${tot('pend')}</b><em>${R.filter(r => r.pend).length} tienda(s) con pendientes</em></div><div><span>Recibidas</span><b>${tot('rec')}</b><em>unidades de merchandising</em></div><div><span>Legalizadas</span><b>${tot('leg')}</b><em>${docs.length} archivo(s)</em></div></div>
        ${R.length ? R.map((r, i) => `<details class="card acc ob-st" ${i < 3 && r.pend ? 'open' : ''}><summary><span>${storeLogo(r.st, 'xs')} <b>${esc(r.st.tienda)}</b> <small class="mute">${esc(r.st.zona || '')}</small></span><span class="row" style="gap:6px"><i class="pill ${r.pend ? 'warn' : 'ok'}">${r.pend ? r.pend + ' pendientes' : '✓ al día'}</i><i class="pill">${r.leg}/${r.rec}</i></span></summary>
            <table class="tbl compact"><thead><tr><th class="l">Merchandising</th><th>Recibidas</th><th>Legalizadas</th><th>Pendientes</th></tr></thead><tbody>${r.E.map(l => `<tr><td class="l"><b>${esc(l.item)}</b> <small class="mute">${esc((l.fecha || '').slice(5))}</small></td><td>${int(l.cant)}</td><td>${l.leg}</td><td class="${l.pend ? 'r' : 'g'}"><b>${l.pend}</b></td></tr>`).join('')}</tbody></table>
            ${r.D.length ? `<div class="ob-files">${r.D.map(d => `<div><span>${d.pdf ? '📄' : '🖼️'} ${esc(d.item || '')} · ${int(d.uds) || 1} ud · ${esc((d.fecha || '').slice(5))}</span><button class="btn btn-ghost sm" data-obdl="${esc(d.id)}">⬇️</button></div>`).join('')}</div>
            <button class="btn btn-primary sm" data-obdla="${esc(r.st.id)}" style="margin-top:6px">⬇️ Descargar las ${r.D.length} legalizaciones de la tienda</button>` : '<p class="hint">Aún no sube legalizaciones.</p>'}</details>`).join('') : '<div class="card empty">Ninguna tienda ha registrado merchandising en este filtro.</div>'}
        <p class="hint">La tienda registra lo que le llega (tipo y cantidad) en 🎁 Obsequios y sube la legalización de cada entrega. Aquí descargas los archivos para cargarlos en la otra plataforma.</p>`;
    const name = (d, n) => docFileName(d, `legalizacion_${slug(d.item || 'obsequio')}_${d.fecha || ''}_${n}`);
    box.onclick = async e => {
        const b = e.target.closest('[data-obdl]'); if (b) { const d = docs.find(x => x.id === b.dataset.obdl); if (d) await docDownload(d, name(d, d.id.slice(-5))); return; }
        const a = e.target.closest('[data-obdla]'); if (a) { busy(a, true); const D = docs.filter(x => x.storeId === a.dataset.obdla); for (let i = 0; i < D.length; i++) { await docDownload(D[i], name(D[i], i + 1)); await new Promise(r => setTimeout(r, 450)); } busy(a, false); }
    };
}
// Ver un archivo cargado (foto en grande o PDF para descargar)
function docView(d, title, name) {
    const m = openModal(`<h3 class="modal-title">${esc(title)}</h3><p class="mute">${esc(d.tienda || '')} · ${esc(fechaHora(d.at))} · ${esc(d.by || '')}</p>
        ${d.pdf ? `<div class="adm-pdf big">${admPdfTile(d)}</div>` : `<div class="preview-box"><img src="${d.img}" alt="${esc(title)}"></div>`}
        <div class="actions"><button class="btn btn-primary" data-dl>⬇️ Descargar</button></div>`, { wide: true });
    $('[data-dl]', m).onclick = () => docDownload(d, name);
}

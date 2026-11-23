// ============================================================================
// MÓDULO · MI CENTRAL (tienda / asesor)
// Lo que ve el asesor al entrar con su tienda: cómo va el mes, semana contra
// semana, el equipo (quién vendió más cada semana), capa vs. venta, marcas,
// referencias e incentivos. Selector: la tienda completa o cada asesor.
// Fotos del equipo: cada asesor sube su foto (medio cuerpo, con uniforme) y sale
// en las tarjetas y reportes.
// ============================================================================

// ---- Fotos de asesores -------------------------------------------------------
const advPhotoKey = n => slug(n);
function advisorPhoto(storeId, nombre) {
    const st = storeById(storeId); const f = st && st.fotosAsesor; if (!f || !nombre) return null;
    if (f[advPhotoKey(nombre)]) return f[advPhotoKey(nombre)];
    const k = Object.keys(f).find(k => sameAdvisor({ nombre: k.replace(/_/g, ' ') }, { nombre }));
    return k ? f[k] : null;
}
// Avatar: foto del asesor o sus iniciales sobre el color de la cadena
function advisorAvatar(storeId, nombre, size = 44) {
    const p = advisorPhoto(storeId, nombre), st = storeById(storeId) || {}, c = CHAINS[normLogoKey(st.logoKey)] || CHAINS.otro;
    if (p) return `<img class="adv-av" src="${p}" alt="${esc(nombre)}" style="width:${size}px;height:${size}px">`;
    const ini = String(nombre || '?').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
    return `<span class="adv-av ini" style="width:${size}px;height:${size}px;font-size:${Math.round(size * .38)}px;background:${c.color};color:${c.ink}">${esc(ini)}</span>`;
}
// Recorte 3:4 (medio cuerpo) y compresión en el teléfono
function photoToPortrait(file) {
    return new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => { const img = new Image(); img.onload = () => {
            const W = 360, H = 480, c = document.createElement('canvas'); c.width = W; c.height = H;
            const s = Math.max(W / img.width, H / img.height), w = img.width * s, h = img.height * s;
            c.getContext('2d').drawImage(img, (W - w) / 2, Math.min(0, (H - h) * 0.25), w, h);      // prioriza la parte de arriba (rostro)
            res(c.toDataURL('image/jpeg', 0.72));
        }; img.onerror = () => rej(new Error('No se pudo leer la foto')); img.src = r.result; };
        r.onerror = () => rej(new Error('No se pudo leer la foto')); r.readAsDataURL(file);
    });
}
function openAdvisorPhotos(storeId, onDone) {
    const st = storeById(storeId); if (!st) return;
    const list = activeAdvisors(st).map(a => a.nombre);
    const fotos = { ...(st.fotosAsesor || {}) };
    const m = openModal(`<h3 class="modal-title">📸 Fotos del equipo</h3>
        <p class="mute">${esc(st.tienda)}. La foto sale en tu tarjeta de estatus y en los reportes que ven tu supervisor, formador y coordinador.</p>
        <div class="photo-guide"><b>Cómo tomarla</b><ul>
            <li>👕 Con el uniforme Infinix completo y bien presentado.</li><li>🧍 Medio cuerpo, de frente y mirando a la cámara.</li>
            <li>💡 Buena luz y fondo limpio (vitrina o pared clara); sin gafas oscuras ni gorra.</li><li>📱 Teléfono vertical, a la altura del pecho.</li></ul></div>
        <div class="photo-grid" id="ph-grid"></div>
        <div class="row end" style="margin-top:12px"><button class="btn btn-ghost" id="ph-close">Cerrar</button></div>`);
    const paint = () => {
        $('#ph-grid', m).innerHTML = list.map(n => { const f = fotos[advPhotoKey(n)]; return `<div class="ph-card">
            ${f ? `<img src="${f}" alt="${esc(n)}">` : `<div class="ph-empty">${advisorAvatar(st.id, n, 72)}<small>Sin foto</small></div>`}
            <b>${esc(n)}</b>
            <label class="btn btn-primary sm">📷 ${f ? 'Cambiar' : 'Tomar / subir'}<input type="file" accept="image/*" capture="user" data-ph="${esc(n)}" hidden></label>
            ${f ? `<button class="btn btn-link sm" data-phdel="${esc(n)}">Quitar</button>` : ''}</div>`; }).join('') || '<p class="empty">Registra los asesores en Ajustes de tienda.</p>';
    };
    const save = async () => { st.fotosAsesor = { ...fotos }; await Data.set(COL.stores, st.id, { fotosAsesor: st.fotosAsesor, updatedAt: Date.now() }, true); };
    m.addEventListener('change', async e => {
        const n = e.target.dataset.ph, file = e.target.files && e.target.files[0]; if (!n || !file) return;
        try { fotos[advPhotoKey(n)] = await photoToPortrait(file); paint(); await save(); toast(`Foto de ${n.split(' ')[0]} guardada ✅`, 'ok'); } catch (err) { toast(err.message, 'error'); }
    });
    m.addEventListener('click', async e => { const d = e.target.closest('[data-phdel]'); if (d) { delete fotos[advPhotoKey(d.dataset.phdel)]; paint(); await save(); } });
    $('#ph-close', m).onclick = () => { closeModal(m); if (onDone) onDone(); };
    paint();
}

// ---- Pantalla ----------------------------------------------------------------
registerModule('central', (() => {
    let sel = 'tienda', closures = [], openP = {};
    const st = () => currentStore();

    async function render(view) {
        const s = st(); if (!s) { view.innerHTML = '<div class="card">Sesión de tienda no válida.</div>'; return; }
        view.innerHTML = '<div class="card empty">Cargando tu central…</div>';
        const month = todayStr().slice(0, 7);
        try { await ZoneData.load(s.zona, month); } catch (e) { }
        if (typeof Evals !== 'undefined') await Evals.ensureLoaded([s.zona]);
        try { closures = await fetchStoreClosures(s.id, todayStr()); } catch (e) { closures = []; }
        view.innerHTML = `<section class="card ct-head">
            <div class="row between wrap" style="gap:8px"><div class="row">${storeLogo(s)}<div><h2 class="h2">Mi central</h2><p class="mute">${esc(s.tienda)} · cómo va el mes, semana a semana y en equipo</p></div></div>
                <button class="btn btn-ghost sm" id="ct-photos">📸 Fotos del equipo</button></div>
            <div class="ct-pick" id="ct-pick"></div></section>
            <div id="ct-body"></div>`;
        $('#ct-photos').onclick = () => openAdvisorPhotos(s.id, () => paint());
        $('#ct-pick').addEventListener('click', e => { const b = e.target.closest('[data-ct]'); if (b) { sel = b.dataset.ct; paint(); } });
        $('#ct-body').addEventListener('click', e => {
            const c = e.target.closest('[data-cpy]'); if (c) { const v = c.dataset.cpy; (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(() => toast('IMEI copiado', 'ok', 1800)).catch(() => toast(v, 'info')); return; }
            const b = e.target.closest('[data-ficha]'); if (b) openAdvisorFicha(b.dataset.ficha, 'asesor');
        });
        $('#ct-body').addEventListener('toggle', e => { const d = e.target; if (d.dataset && d.dataset.ctp) openP[d.dataset.ctp] = d.open; }, true);
        paint();
    }

    // Semanas del mes con data (ISO), con su rango de fechas
    function weeksOf(month) {
        const out = [], dim = daysInMonth(month);
        for (let d = 1; d <= dim; d++) { const ds = `${month}-${pad2(d)}`, w = 'W' + isoWeek(ds); let x = out.find(o => o.w === w); if (!x) out.push(x = { w, from: d, to: d }); x.to = d; }
        return out;
    }
    const varPct = (a, b) => b > 0 ? (a - b) / b : (a > 0 ? 1 : null);
    const varHTML = v => v == null ? '<i class="ct-var">—</i>' : `<i class="ct-var ${v >= 0 ? 'up' : 'down'}">${v >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(v * 100))}%</i>`;

    function paint() {
        const s = st(); if (!s || !$('#ct-body')) return;
        Charts.destroyAll('view');
        const D = Advisor.forStore(s), Z = ZoneData.forStore(s.id);
        $('#ct-pick').innerHTML = `<button class="ct-chip ${sel === 'tienda' ? 'on' : ''}" data-ct="tienda">${storeLogo(s, 'xs')}<span>Tienda</span></button>` +
            D.map(d => `<button class="ct-chip ${sel === d.id ? 'on' : ''}" data-ct="${esc(d.id)}">${advisorAvatar(s.id, d.nombre, 30)}<span>${esc(d.nombre.split(' ')[0])}</span></button>`).join('');
        if (!Z) { $('#ct-body').innerHTML = '<section class="card empty">Aún no hay data de venta cargada para tu zona este mes. Tu supervisor o formador la carga en Análisis de zona.</section>'; return; }
        const corte = Z.corte || todayStr(), month = corte.slice(0, 7), day = parseD(corte).getDate(), dim = daysInMonth(month);
        const W = weeksOf(month).filter(w => w.from <= day);
        const curW = 'W' + isoWeek(corte);
        if (sel !== 'tienda' && !D.some(d => d.id === sel)) sel = 'tienda';
        // Tienda: venta de los cierres que registran los asesores. Asesor: venta real DCR (última data plana de la zona).
        const Zc = closuresZ(month), dayC = Zc.corte ? Math.max(1, int(Zc.corte.slice(8))) : day;
        $('#ct-body').innerHTML = sel === 'tienda' ? storeHTML(s, D, Zc, weeksOf(month).filter(w => w.from <= dayC), 'W' + isoWeek(Zc.corte || corte), dayC, dim) : advHTML(s, D, D.find(d => d.id === sel), W, curW, day, dim);
    }

    // Barras de semana (CSS) con variación frente a la semana anterior
    function weekBars(sem, W, curW, color) {
        const max = Math.max(1, ...W.map(w => sem[w.w] || 0));
        return `<div class="ct-weeks">${W.map((w, i) => { const v = sem[w.w] || 0, prev = i ? sem[W[i - 1].w] || 0 : null; return `<div class="ct-wk ${w.w === curW ? 'cur' : ''}">
            <b>${v}</b><div class="ct-bar" style="height:${Math.max(4, v / max * 110)}px;background:${color || '#00C853'}"></div>
            <small>${w.w}</small><em>${w.from}–${w.to}</em>${i ? varHTML(varPct(v, prev)) : '<i class="ct-var">—</i>'}</div>`; }).join('')}</div>
            <p class="hint">▲▼ = variación contra la semana anterior${W.some(w => w.w === curW) ? ` · ${curW} va en curso` : ''}.</p>`;
    }

    // Tabla semana a semana con meta semanal (cuota del mes ÷ 4) y la venta por referencia de cada semana
    function weekTable(sem, semRef, W, metaMes, metaRef, curW) {
        const ms = metaSemana(metaMes), refs = INFINIX_MODELS.filter(m => W.some(w => (semRef[w.w] || {})[m.key]) || (metaRef && metaRef[m.key]));
        return `<div class="tbl-scroll"><table class="tbl compact ct-wt"><thead><tr><th class="l">Semana</th><th>Venta</th><th>Meta sem.</th><th>Cumpl.</th><th>Var.</th>${refs.map(m => `<th title="${esc(m.name)}">${esc(m.name.replace('Note ', 'N. ').replace('NOTE ', 'N. '))}</th>`).join('')}</tr></thead><tbody>
            ${W.map((w, i) => { const v = sem[w.w] || 0, p = i ? sem[W[i - 1].w] || 0 : null, ms = Math.round(metaSemana(metaMes) * Math.min(7, w.to - w.from + 1) / 7); return `<tr class="${w.w === curW ? 'cur' : ''}"><td class="l"><b>${w.w}</b> <small class="mute">${w.from}–${w.to}${w.w === curW ? ' · en curso' : ''}</small></td><td><b>${v}</b></td><td>${ms || '—'}</td><td>${ms ? `<i class="pill ${v >= ms ? 'ok' : v >= ms * .7 ? 'warn' : 'bad'}">${Math.round(v / ms * 100)}%</i>` : '—'}</td><td>${i ? varHTML(varPct(v, p)) : '—'}</td>${refs.map(m => `<td>${(semRef[w.w] || {})[m.key] || 0}</td>`).join('')}</tr>`; }).join('')}
            <tr class="tot"><td class="l"><b>Mes</b></td><td><b>${sum(W.map(w => sem[w.w] || 0))}</b></td><td>${metaMes || '—'}</td><td>${metaMes ? Math.round(sum(W.map(w => sem[w.w] || 0)) / metaMes * 100) + '%' : '—'}</td><td></td>${refs.map(m => `<td><b>${sum(W.map(w => (semRef[w.w] || {})[m.key] || 0))}</b>${metaRef && metaRef[m.key] ? `<small class="mute">/${metaRef[m.key]}</small>` : ''}</td>`).join('')}</tr>
        </tbody></table></div><p class="hint">Meta semanal = cuota del mes ÷ 4 (las semanas incompletas del mes, proporcionales a sus días). Úsala para llenar tus planillas.</p>`;
    }
    // Venta por semana y referencia de la tienda (de la venta diaria de la data)
    function storeSemRef(Z, month) {
        const out = {}; Object.entries(Z.diasRef || {}).forEach(([dd, r]) => { const w = 'W' + isoWeek(`${month}-${dd}`); const o = out[w] = out[w] || {}; Object.entries(r).forEach(([k, v]) => { o[k] = (o[k] || 0) + v; }); }); return out;
    }
    // Venta de la tienda armada con sus cierres (Infinix por referencia, por semana y por día)
    function closuresZ(month) {
        const Z = { month, total: 0, sem: {}, ventas: {}, dias: {}, diasRef: {}, corte: '' };
        closures.filter(c => (c.fecha || '').slice(0, 7) === month).forEach(c => {
            const t = closureInfinix(c), w = 'W' + isoWeek(c.fecha), dd = c.fecha.slice(8);
            Z.total += t; Z.sem[w] = (Z.sem[w] || 0) + t; Z.dias[dd] = (Z.dias[dd] || 0) + t;
            const r = Z.diasRef[dd] = Z.diasRef[dd] || {};
            Object.entries(c.ventas || {}).forEach(([k, v]) => { Z.ventas[k] = (Z.ventas[k] || 0) + int(v); r[k] = (r[k] || 0) + int(v); });
            if (c.fecha > Z.corte) Z.corte = c.fecha;
        });
        return Z;
    }
    // Cierres diarios por semana: Infinix y competencia
    function closuresByWeek() {
        const out = {}; closures.forEach(c => { const w = 'W' + isoWeek(c.fecha), o = out[w] = out[w] || {}; BRANDS.forEach(b => { o[b] = (o[b] || 0) + closureBrand(c, b); }); }); return out;
    }
    const panel = (id, title, body, open) => `<details class="card acc ct-p" ${(openP[id] ?? open) ? 'open' : ''} data-ctp="${id}"><summary><span>${title}</span></summary><div class="ct-pb">${body}</div></details>`;

    function brandsFromClosures() {
        const tot = Object.fromEntries(BRANDS.map(b => [b, sum(closures.map(c => closureBrand(c, b)))]));
        const all = sum(Object.values(tot));
        return { all, list: BRANDS.map(b => ({ b, v: tot[b], share: all ? tot[b] / all : 0 })).filter(x => x.v > 0).sort((a, b) => b.v - a.v) };
    }

    function storeHTML(s, D, Z, W, curW, day, dim) {
        const pc = Advisor.pc, meta = storeMetaMes(s), venta = int(Z.total), proj = Math.round(venta / day * dim), esp = day / dim;
        const hc = +(s.hc && s.hc.INFINIX) || Math.max(1, D.length), capa = int(s.capa);
        const B = brandsFromClosures(), pos = B.list.findIndex(x => x.b === 'INFINIX') + 1;
        const team = D.map(d => ({ d, sem: d.pacingSem || {}, total: d.pacing.venta })).sort((a, b) => b.total - a.total);
        const semOf = d => (activeAdvisors(s).find(a => sameAdvisor(a, { nombre: d.nombre })) || {}).sem || {};
        const best = W.map(w => { const r = D.map(d => ({ n: d.nombre, v: semOf(d)[w.w] || 0 })).sort((a, b) => b.v - a.v)[0]; return r && r.v ? { w: w.w, ...r } : null; }).filter(Boolean);
        const refs = INFINIX_MODELS.map(m => ({ ...m, meta: int(s.metas && s.metas[m.key]), v: int(Z.ventas && Z.ventas[m.key]), inv: int(s.inventario && s.inventario[m.key]) })).filter(x => x.meta > 0).sort((a, b) => b.v - a.v);
        const afecta = refs.filter(x => x.meta > 0).sort((a, b) => (a.v / a.meta) - (b.v / b.meta))[0];
        const cls = v => v == null ? '' : v >= 1 ? 'g' : v >= .85 ? 'a' : 'r';
        const month = (Z.month || (Z.corte || '').slice(0, 7)), semRef = storeSemRef(Z, month), CW = closuresByWeek(), cwKeys = W.map(w => w.w).filter(w => CW[w]);
        return `
        <section class="kpi-row">
            <div class="kpi hl"><span>Venta del mes · cierres</span><b>${venta}</b><small>meta ${meta || '—'} · ${pc(meta ? venta / meta : null)}${Z.corte ? ' · al ' + esc(Z.corte.slice(8)) : ''}</small></div>
            <div class="kpi"><span>A hoy debería llevar</span><b>${Math.round(meta * esp)}</b><small>${venta >= Math.round(meta * esp) ? 'va arriba ✅' : `va ${Math.round(meta * esp) - venta} abajo`}</small></div>
            <div class="kpi"><span>Proyección</span><b>${proj}</b><small>${pc(meta ? proj / meta : null)} de la meta</small></div>
            <div class="kpi"><span>Meta de la semana</span><b>${metaSemana(meta)}</b><small>${curW}: lleva ${(Z.sem || {})[curW] || 0}</small></div>
        </section>
        ${panel('semana', '📅 Semana a semana · tienda', weekBars(Z.sem || {}, W, curW) + weekTable(Z.sem || {}, semRef, W, meta, s.metas || {}, curW), true)}
        ${panel('equipo', `👥 El equipo · sana competencia ${best.length ? `<small class="mute">🏆 ${esc(best[best.length - 1].n.split(' ')[0])} lidera ${best[best.length - 1].w}</small>` : ''}`, `<div class="tbl-scroll"><table class="tbl compact"><thead><tr><th>#</th><th>Asesor</th>${W.map(w => `<th>${w.w}</th>`).join('')}<th>Mes</th><th>Meta</th><th>Meta sem.</th><th>Cumpl.</th><th>Var.</th></tr></thead><tbody>
            ${team.map((tm, i) => { const sm = semOf(tm.d), last = W[W.length - 1], prev = W[W.length - 2]; return `<tr><td>${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</td><td class="l"><div class="row" style="gap:8px;flex-wrap:nowrap">${advisorAvatar(s.id, tm.d.nombre, 32)}<b title="${esc(tm.d.nombre)}">${esc(tm.d.nombre.split(' ').slice(0, 2).join(' '))}</b></div></td>
                ${W.map(w => `<td>${best.some(b => b.w === w.w && b.n === tm.d.nombre) ? '🏆 ' : ''}${sm[w.w] || 0}</td>`).join('')}<td><b>${tm.total}</b></td><td>${tm.d.pacing.meta || '—'}</td><td>${tm.d.pacing.meta ? metaSemana(tm.d.pacing.meta) : '—'}</td><td><i class="pill ${cls(tm.d.pacing.indice)}">${pc(tm.d.pacing.cumpl)}</i></td><td>${last && prev ? varHTML(varPct(sm[last.w] || 0, sm[prev.w] || 0)) : '—'}</td></tr>`; }).join('')}
            </tbody></table></div>${best.length ? `<p class="hint">🏆 = el que más vendió esa semana. ${best.map(b => `${b.w}: <b>${esc(b.n.split(' ')[0])}</b> (${b.v})`).join(' · ')}</p>` : ''}`, true)}
        ${panel('capa', '🧮 Capa vs. venta', capa ? `<div class="ct-capa"><div><small>Capa del mes (mercado)</small><b>${capa}</b></div><div><small>Venta Infinix</small><b>${venta}</b></div><div><small>Share actual</small><b>${pc(venta / capa)}</b></div><div><small>Share objetivo</small><b>${pc(meta / capa)}</b></div></div>
            <div class="gv-track two" style="height:18px;margin-top:10px"><div style="width:${Math.min(100, meta / capa * 100)}%;background:#BBF7D0"></div><div style="width:${Math.min(100, proj / capa * 100)}%;background:#00C853"></div></div>
            <p class="hint">Verde oscuro: tu proyección dentro del mercado de la tienda · verde claro: lo que pide el target.</p>` : '<p class="empty">Sin capa registrada para esta tienda.</p>')}
        ${panel('marcas', `🏁 Marcas: ¿quién va punteando? ${pos ? `<small class="mute">Infinix ${pos}°</small>` : ''}`, B.list.length > 1 ? `${B.list.map((x, i) => `<div class="gv-hb"><span>${i + 1}. ${esc(x.b)}</span><div class="gv-track"><div style="width:${x.share / B.list[0].share * 100}%;background:${BRAND_COLORS[x.b] || '#94A3B8'}"></div></div><b>${pc(x.share)}</b></div>`).join('')}
            ${cwKeys.length ? `<div class="tbl-scroll" style="margin-top:8px"><table class="tbl compact"><thead><tr><th class="l">Marca</th>${cwKeys.map(w => `<th>${w}</th>`).join('')}<th>Var.</th></tr></thead><tbody>${B.list.map(x => `<tr class="${x.b === 'INFINIX' ? 'row-own' : ''}"><td class="l"><b>${esc(x.b)}</b></td>${cwKeys.map(w => `<td>${CW[w][x.b] || 0}</td>`).join('')}<td>${cwKeys.length > 1 ? varHTML(varPct(CW[cwKeys[cwKeys.length - 1]][x.b] || 0, CW[cwKeys[cwKeys.length - 2]][x.b] || 0)) : '—'}</td></tr>`).join('')}</tbody></table></div>` : ''}
            <p class="hint">De tus cierres diarios del mes (venta por marca que registras cada noche).</p>`
            : '<p class="empty">Registra la venta de la competencia en tu <b>Cierre diario</b> y aquí verás qué marca va primera, tu share, tu posición y la variación semana a semana.</p>')}
        ${panel('refs', `📦 Referencias ${afecta ? `<small class="mute">la que más afecta: ${esc(afecta.name)}</small>` : ''}`, `<table class="tbl compact"><thead><tr><th>Referencia</th><th>Meta</th><th>Venta</th><th>Cumpl.</th><th>Inventario</th></tr></thead><tbody>
            ${refs.map(x => `<tr><td class="l"><b>${esc(x.name)}</b></td><td>${x.meta || '—'}</td><td><b>${x.v}</b></td><td>${x.meta ? `<i class="pill ${cls(x.v / x.meta / (day / dim))}">${pc(x.v / x.meta)}</i>` : '—'}</td><td>${x.inv}</td></tr>`).join('')}
            </tbody></table>${afecta ? `<p class="hint">La que más te está afectando: <b>${esc(afecta.name)}</b> (${afecta.v} de ${afecta.meta}${afecta.inv ? `, ${afecta.inv} en inventario` : ''}).</p>` : ''}`)}
        ${panel('plan', '📜 Plan de incentivos y términos', planTerminosHTML(true).replace('<details class="acc plan-tc" open>', '<div>').replace('</details>', '</div>').replace(/<summary>.*?<\/summary>/, ''))}`;
    }

    // IMEI sin activar del asesor elegido (de la última data plana DCR de la zona): para hacerles seguimiento
    function imeiPanel(s, d) {
        const Z = ZoneData.forStore(s.id) || {}, L = (Z.inact || []).filter(r => sameAdvisor({ nombre: r.a }, { nombre: d.nombre }) || nameSubset(r.a, d.nombre)).sort((a, b) => String(b.f + b.h).localeCompare(String(a.f + a.h)));
        const body = L.length ? `<div class="tbl-scroll"><table class="tbl compact"><thead><tr><th>Fecha</th><th class="l">Referencia</th><th class="l">IMEI</th></tr></thead><tbody>${L.map(r => `<tr><td>${esc((r.f || '').slice(8))}/${esc((r.f || '').slice(5, 7))}${r.h ? ` <small class="mute">${esc(r.h)}</small>` : ''}</td><td class="l">${esc(r.ref || '')}</td><td class="l"><code>${esc(r.imei || '—')}</code> ${r.imei ? `<button class="icon-btn sm" data-cpy="${esc(r.imei)}" title="Copiar IMEI">📋</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
            <p class="hint">Ventas cargadas en DCR con el equipo aún sin activar. Pide al cliente que lo encienda con su SIM o guarda la factura como soporte para no perder la venta. Se actualiza con cada data que cargan tus líderes${Z.corte ? ` (corte ${esc(Z.corte.slice(8))}/${esc(Z.corte.slice(5, 7))})` : ''}.</p>`
            : '<p class="empty">✅ No tienes IMEI sin activar en la última data de la zona.</p>';
        return panel('imei', `📵 Mis IMEI sin activar <small class="mute">${L.length ? L.length + ' pendiente(s)' : 'ninguno'}</small>`, body, L.length > 0);
    }

    function advHTML(s, D, d, W, curW, day, dim) {
        const pc = Advisor.pc, pa = d.pacing, C = d.comision;
        const A = activeAdvisors(s).find(a => sameAdvisor(a, { nombre: d.nombre })) || { sem: {} };
        const rank = D.slice().sort((a, b) => b.pacing.venta - a.pacing.venta).findIndex(x => x.id === d.id) + 1;
        const tienda = sum(D.map(x => x.pacing.venta)), aporte = tienda ? pa.venta / tienda : null;
        const cumCls = pa.cumpl == null ? '' : pa.indice < .85 ? 'bad' : pa.indice < 1 ? 'warn' : 'ok';
        const companeros = D.filter(x => x.id !== d.id);
        const last = W[W.length - 1], prev = W[W.length - 2];
        const semRefA = A.semRef || {}, metaRefA = Object.fromEntries(d.inventario.modelos.map(m => [m.key, m.meta]));
        return `
        <section class="card ct-me"><div class="row" style="gap:14px">${advisorAvatar(s.id, d.nombre, 72)}<div class="grow"><h3 class="h2" style="margin:0">${esc(d.nombre)}</h3>
            <p class="mute">Puesto <b>${rank}</b> de ${D.length} en la tienda · aportas ${pc(aporte)} de la venta del PDV</p></div>
            <button class="btn btn-primary sm" data-ficha="${esc(d.id)}">📲 Mi tarjeta</button></div></section>
        <section class="kpi-row">
            <div class="kpi hl"><span>Mi venta</span><b>${pa.venta}</b><small>meta ${pa.meta || '—'} · ${pc(pa.cumpl)}</small></div>
            <div class="kpi ${cumCls === 'bad' ? 'warn' : ''}"><span>A hoy debería llevar</span><b>${pa.deberiaLlevar}</b><small>${pa.venta >= pa.deberiaLlevar ? 'vas arriba ✅' : `vas ${pa.deberiaLlevar - pa.venta} abajo`}</small></div>
            <div class="kpi"><span>Proyección</span><b>${pa.proy}</b><small>${pc(pa.proyCumpl)} de tu meta</small></div>
            <div class="kpi"><span>Siguiente llave</span><b>${C.hoy.next ? C.hoy.falta + ' uds' : '🏆'}</b><small>${C.hoy.next ? `te faltan para ${esc(C.hoy.next.label)}` : 'ROI 3 logrado'}</small></div>
        </section>
        ${panel('msem', `📅 Mi venta semana a semana <small class="mute">meta semanal ${pa.meta ? metaSemana(pa.meta) : '—'}</small>`, weekBars(A.sem || {}, W, curW) + weekTable(A.sem || {}, semRefA, W, pa.meta, metaRefA, curW), true)}
        ${panel('vs', '🤝 Yo frente a mis compañeros', [d, ...companeros].map(x => { const sm = (activeAdvisors(s).find(a => sameAdvisor(a, { nombre: x.nombre })) || {}).sem || {}; const mx = Math.max(1, ...D.map(y => y.pacing.venta)); return `<div class="ct-vs ${x.id === d.id ? 'me' : ''}">${advisorAvatar(s.id, x.nombre, 30)}<span>${esc(x.nombre.split(' ').slice(0, 2).join(' '))}</span><div class="gv-track"><div style="width:${x.pacing.venta / mx * 100}%;background:${x.id === d.id ? '#00C853' : '#94A3B8'}"></div></div><b>${x.pacing.venta}</b>${last && prev ? varHTML(varPct(sm[last.w] || 0, sm[prev.w] || 0)) : ''}</div>`; }).join('') + `<p class="hint">Barras: venta del mes · ▲▼: variación de ${last ? last.w : ''} contra ${prev ? prev.w : ''}.</p>`, true)}
        ${panel('tienda', '🏬 Mi tienda esta semana y en el mes', `<div class="ct-capa"><div><small>Tienda ${curW}</small><b>${closuresZ(todayStr().slice(0, 7)).sem[curW] || 0}</b></div><div><small>Meta sem. tienda</small><b>${metaSemana(storeMetaMes(s))}</b></div><div><small>Tienda mes</small><b>${closuresZ(todayStr().slice(0, 7)).total}</b></div><div><small>Meta tienda</small><b>${storeMetaMes(s)}</b></div></div>`)}
        ${panel('mref', '📦 Mis referencias', `<div class="tbl-scroll"><table class="tbl compact"><thead><tr><th>Referencia</th><th>Mi meta</th><th>Vendidas</th><th>Cumpl.</th><th>En tienda</th></tr></thead><tbody>
            ${d.inventario.modelos.filter(m => m.meta > 0).map(m => `<tr><td class="l"><b>${esc(m.name)}</b></td><td>${m.meta || '—'}</td><td><b>${m.vendidas}</b></td><td>${m.meta ? pc(m.vendidas / m.meta) : '—'}</td><td>${m.inv}</td></tr>`).join('')}
            </tbody></table></div><p class="hint">${C.hoy.abierto ? 'La llave (ROI 1) está abierta.' : `Te faltan ${Math.max(0, C.plan.base - pa.venta)} uds para abrir la llave (ROI 1).`} Lo que llevas ganado lo ves en la Calculadora.</p>`)}
        ${imeiPanel(s, d)}
        ${(d.mejoras || []).length ? panel('mej', '🚀 Oportunidades de mejora', `<div class="ac-tips"><ul>${d.mejoras.slice(0, 5).map(x => `<li><i>${x.i}</i><span>${x.t}</span></li>`).join('')}</ul></div>`) : ''}
        ${panel('plan', '📜 Plan de incentivos y términos', planTerminosHTML(true).replace('<details class="acc plan-tc" open>', '<div>').replace('</details>', '</div>').replace(/<summary>.*?<\/summary>/, ''))}`;
    }

    return { render, onData: () => paint() };
})());

// ============================================================================
// PARCIAL DE VENTA (tienda): el asesor escribe lo que lleva vendido de cada referencia Infinix y de cada marca
// y la app arma el mensaje con el formato de los grupos nacionales para copiar o enviar por WhatsApp
// (cortes de la 1, las 3 y las 5 p. m.). Lo escrito queda guardado en el teléfono para el siguiente parcial del día.
// ============================================================================
const PARCIAL_HORAS = ['1:00 p. m.', '3:00 p. m.', '5:00 p. m.', 'Otro'];
const PARCIAL_ICO = { INFINIX: '🟢', XIAOMI: '🟠', SAMSUNG: '⚫', MOTOROLA: '🟣', TECNO: '🔵', HONOR: '⚪', OPPO: '🟢', REALME: '🟡', VIVO: '🔵', ZTE: '🔴', APPLE: '⚪' };
registerModule('parcial', (() => {
    let hora = '', view = null;
    const st = () => currentStore();
    const key = () => `opscore_parcial_${(st() || {}).id}_${todayStr()}`;
    const load = () => { try { return JSON.parse(localStorage.getItem(key())) || {}; } catch (e) { return {}; } };
    const save = d => { try { localStorage.setItem(key(), JSON.stringify(d)); } catch (e) { } };
    const refs = s => storeRefs(s);
    const horaAuto = () => { const h = new Date().getHours(); return h < 14 ? PARCIAL_HORAS[0] : h < 16 ? PARCIAL_HORAS[1] : PARCIAL_HORAS[2]; };

    function render(v) {
        view = v; const s = st(); if (!s) { v.innerHTML = '<div class="card">Sesión de tienda no válida.</div>'; return; }
        const d = load(); hora = d.hora || horaAuto();
        const vig = (s.asesores || []).filter(a => !isBaja(s, a, (s.cedulas || {})[a])), ase = d.asesores || vig;
        v.innerHTML = `<section class="card">
            <div class="row"><span>${storeLogo(s)}</span><div><h2 class="h2">📊 Parcial de venta</h2><p class="mute">${esc(s.tienda)} · escribe lo que llevan vendido hoy y envíalo al grupo. Se guarda para el siguiente parcial.</p></div></div>
            <div class="seg sm wrap" style="margin-top:10px">${PARCIAL_HORAS.map(h => `<button class="seg-btn ${h === hora ? 'active' : ''}" data-h="${esc(h)}">${h === 'Otro' ? 'Otra hora' : '🕐 ' + esc(h)}</button>`).join('')}</div>
            <label class="lbl" style="margin-top:10px">Asesores</label>
            <div class="chips" id="pc-ase">${vig.map(a => `<label class="chip"><input type="checkbox" value="${esc(a)}" ${ase.includes(a) ? 'checked' : ''}><span>${esc(a)}</span></label>`).join('') || '<span class="mute">Sin asesores configurados.</span>'}</div>
        </section>
        <div class="grid2">
            <section class="card"><h3 class="h3">💚 Infinix · venta por modelo</h3>
                <table class="tbl compact"><tbody>${refs(s).map(m => `<tr><td class="l"><b>${esc(m.name)}</b></td><td>${stp('pc-m-' + m.key, (d.inf || {})[m.key])}</td></tr>`).join('')}</tbody></table>
                <p class="hint">Total Infinix: <b id="pc-tinf">0</b></p></section>
            <section class="card"><h3 class="h3">📦 Venta por marca · tienda</h3>
                <table class="tbl compact"><tbody>${BRANDS.map(b => `<tr><td class="l">${PARCIAL_ICO[b] || '⚪'} <b>${b}</b></td><td>${b === 'INFINIX' ? '<b id="pc-binf">0</b> <small class="mute">(suma de los modelos)</small>' : stp('pc-b-' + b, (d.mar || {})[b])}</td></tr>`).join('')}</tbody></table>
                <p class="hint">Participación Infinix al corte: <b id="pc-share">—</b> · Total tienda: <b id="pc-ttot">0</b></p></section>
        </div>
        <section class="card"><h3 class="h3">📝 Mensaje para el grupo</h3>
            <pre class="pc-msg" id="pc-msg"></pre>
            <div class="actions"><button class="btn btn-ghost" id="pc-copy">📋 Copiar mensaje</button><button class="btn btn-wa" id="pc-wa">📲 Enviar por WhatsApp</button><button class="btn btn-link" id="pc-clear">Empezar en ceros</button></div>
        </section>`;
        v.onclick = e => {
            const b = e.target.closest('.stp button'); if (b) { const i = $('input', b.parentElement); i.value = Math.max(0, int(i.value) + int(b.dataset.d)); upd(); return; }
            const h = e.target.closest('[data-h]'); if (h) { hora = h.dataset.h === 'Otro' ? (prompt('¿De qué hora es el parcial? (ej. 11:00 a. m.)', '') || hora) : h.dataset.h; $$('[data-h]', v).forEach(x => x.classList.toggle('active', x.dataset.h === h.dataset.h)); upd(); }
        };
        v.oninput = upd; v.onchange = upd;
        $('#pc-copy').onclick = async () => { const t = msg(); logEnvio('copiado'); try { await navigator.clipboard.writeText(t); toast('Mensaje copiado: pégalo en el grupo', 'ok'); } catch (e) { const r = document.createRange(); r.selectNodeContents($('#pc-msg')); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); toast('Selecciona y copia el mensaje', 'info'); } };
        $('#pc-wa').onclick = async () => { const t = msg(); if (navigator.share) { try { await navigator.share({ text: t }); logEnvio('whatsapp'); return; } catch (e) { if (e.name === 'AbortError') return; } } window.open('https://wa.me/?text=' + encodeURIComponent(t), '_blank'); logEnvio('whatsapp'); };
        $('#pc-clear').onclick = () => { if (!confirm('¿Poner todo en cero para empezar el día?')) return; $$('#view input.num').forEach(i => { i.value = 0; }); upd(); };
        upd();
    }
    // Auditoría: cada envío (WhatsApp) o copia del parcial queda en la nube con la hora real del envío
    async function logEnvio(via) {
        const s = st(); if (!s) return;
        const d = collect(), f = todayStr(), tInf = sum(Object.values(d.inf)), tot = tInf + sum(Object.values(d.mar));
        const slot = PARCIAL_HORAS.slice(0, 3).includes(d.hora) ? d.hora : 'Otro', id = `parc_${s.id}_${f}`;
        const prev = (await Data.get(COL.zoneReports, id).catch(() => null)) || {};
        const env = { ...(prev.envios || {}) }, cur = env[slot];
        // Si ya lo envió por WhatsApp, una copia posterior no cambia el registro; si antes solo copió, el envío lo actualiza
        if (!(cur && cur.via === 'whatsapp' && via === 'copiado')) env[slot] = { via, at: Date.now(), hora: d.hora, inf: tInf, tot, n: (cur ? int(cur.n) : 0) + 1, asesores: d.asesores };
        await Data.set(COL.zoneReports, id, { id, kind: 'parcial', storeId: s.id, zona: s.zona, tienda: s.tienda, fecha: f, envios: env, updatedAt: Date.now() }, true).catch(() => { });
    }
    const stp = (id, v) => `<div class="stp"><button type="button" data-d="-1">−</button><input class="input num" type="number" inputmode="numeric" min="0" id="${id}" value="${int(v)}"><button type="button" data-d="1">+</button></div>`;
    function collect() {
        const s = st(), inf = Object.fromEntries(refs(s).map(m => [m.key, int(($('#pc-m-' + m.key) || {}).value)])), mar = Object.fromEntries(BRANDS.filter(b => b !== 'INFINIX').map(b => [b, int(($('#pc-b-' + b) || {}).value)]));
        return { hora, asesores: $$('#pc-ase input:checked').map(i => i.value), inf, mar };
    }
    // Participación de Infinix en la tienda a la hora del parcial (Infinix ÷ total de la tienda)
    const share = (inf, tot) => tot ? (Math.round(inf / tot * 1000) / 10).toString().replace('.', ',') + '%' : '—';
    function msg() {
        const s = st(), d = collect(), tInf = sum(Object.values(d.inf)), mar = { INFINIX: tInf, ...d.mar }, f = todayStr();
        const L = [`📊 PARCIAL DE VENTAS – ${d.hora.toUpperCase()}`, '', `📅 Fecha: ${f.slice(8)}/${f.slice(5, 7)}/${f.slice(0, 4)}`, `🏛️ Cadena: ${s.cadena || chainGroup(s).label}`, `📍 Zona: ${ZoneData.titleCase ? ZoneData.titleCase(s.zona || '') : s.zona}`, `🏬 Punto de venta: ${s.tienda}`, `👤 Nombre de los asesores: ${d.asesores.map(n => n.split(' ')[0]).join('- ')}`, '',
            '💚 INFINIX – VENTA POR MODELO', '________________________', ...refs(s).map(m => `📱 ${m.name}: ${d.inf[m.key] || ''}`), `💚 TOTAL INFINIX: ${tInf}`, '',
            '📦 VENTA POR MARCA – TIENDA', '________________________', ...BRANDS.filter(b => b === 'INFINIX' || mar[b]).map(b => `${PARCIAL_ICO[b] || '⚪'} ${b}: ${mar[b]}`), '', `🎯 PARTICIPACIÓN INFINIX AL CORTE (${d.hora}): ${share(tInf, sum(Object.values(mar)))}`, `📈 TOTAL TIENDA: ${sum(Object.values(mar))}`];
        return L.join('\n');
    }
    function upd() {
        if (!view || !$('#pc-msg')) return;
        const d = collect(), tInf = sum(Object.values(d.inf));
        $('#pc-tinf').textContent = tInf; $('#pc-binf').textContent = tInf; $('#pc-ttot').textContent = tInf + sum(Object.values(d.mar)); $('#pc-share').textContent = share(tInf, tInf + sum(Object.values(d.mar)));
        $('#pc-msg').textContent = msg(); save(d);
    }
    return { render };
})());

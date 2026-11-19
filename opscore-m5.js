// ============================================================================
// MÓDULO 5 · SIMULADOR DE CUOTAS (todos los perfiles)
// Todo automático: se elige la tarjeta, el equipo y el precio; si hay abono y
// el nombre del cliente son opcionales. La tasa y la cuota de manejo las fija
// el Administrador en Gestión › Configuración: aquí nadie las puede cambiar.
// El resultado muestra de una vez la cuota a 3, 6, 12, 18, 24 y 36 meses.
// ============================================================================

registerModule('m5', (() => {
    let S = null;
    const defEntity = () => {
        const st = currentStore(), k = st && normLogoKey(st.logoKey);
        const map = { exito: 'exito', falabella: 'falabella', cencosud: 'cencosud', alkosto: 'alkosto', ktronix: 'alkosto' };
        return State.rates[map[k]] ? map[k] : Object.keys(State.rates)[0];
    };

    // Cuota fija: P · i / (1 − (1+i)^−n), con la tasa mensual (M.V.) de la entidad
    function calc(s, plazo) {
        const r = State.rates[s.entidad] || {}, i = (+r.tasaMV || 0) / 100, n = plazo || s.plazo;
        const precio = Math.max(0, s.precio);
        const abono = clamp(s.abonoModo === '%' ? precio * s.abono / 100 : s.abono, 0, precio);
        const P = precio - abono;
        const cuota = P <= 0 ? 0 : (i > 0 ? P * i / (1 - Math.pow(1 + i, -n)) : P / n);
        const manejo = P > 0 ? (+r.cuotaManejo || 0) : 0;
        const tabla = []; let saldo = P;
        for (let k = 1; k <= n && P > 0; k++) {
            const interes = saldo * i, capital = k === n ? saldo : cuota - interes;
            saldo = Math.max(0, saldo - capital);
            tabla.push({ k, cuota: capital + interes, interes, capital, saldo });
        }
        const intereses = sum(tabla.map(t => t.interes));
        return { precio, abono, P, n, i, tasa: +r.tasaMV || 0, cuota, manejo, cuotaTotal: cuota + manejo, intereses, total: P + intereses + manejo * n, tabla };
    }

    function render(view) {
        const ent = defEntity();
        S = { entidad: ent, equipo: '', precio: 0, abonoModo: '$', abono: 0, plazo: 12, cliente: '' };
        view.innerHTML = `
        <section class="card">
            <h2 class="h2">Simulador de cuotas</h2>
            <p class="mute">Elige la tarjeta, el equipo y el precio. Lo demás sale solo.</p>
            <div class="grid2">
                <div>
                    <label class="lbl">1 · Tarjeta / entidad</label>
                    <div class="row"><select id="s5-ent" class="input grow">${Object.keys(State.rates).map(k => `<option value="${k}" ${k === ent ? 'selected' : ''}>${esc(State.rates[k].nombre)}</option>`).join('')}</select><span id="s5-logo" class="logo-prev"></span></div>
                    <p class="hint" id="s5-cond"></p>
                    <label class="lbl">2 · Equipo</label>
                    <select id="s5-eq" class="input"><option value="">Selecciona referencia…</option>${INFINIX_MODELS.map(m => `<option>Infinix ${esc(m.name)}</option>`).join('')}${INFINIX_ACCESSORIES.map(m => `<option>${esc(m.name)}</option>`).join('')}<option>Otro equipo</option></select>
                </div>
                <div>
                    <label class="lbl">3 · Precio de venta ($)</label>
                    <input id="s5-precio" class="input" type="number" inputmode="numeric" min="0" step="1000" placeholder="Ej. 1299900">
                    <label class="lbl">Abono / cuota inicial (opcional)</label>
                    <div class="row">
                        <div class="seg sm"><button class="seg-btn active" data-am="$">$</button><button class="seg-btn" data-am="%">%</button></div>
                        <input id="s5-abono" class="input grow" type="number" inputmode="decimal" min="0" placeholder="0">
                    </div>
                    <label class="lbl">Cliente (opcional)</label>
                    <input id="s5-cli" class="input" placeholder="Nombre del cliente">
                </div>
            </div>
        </section>
        <section class="card sim-res" id="s5-res"></section>
        <p class="hint">La simulación es solo para mostrarla en pantalla al cliente: no se comparte ni se descarga.</p>`;

        const sync = () => {
            S.entidad = $('#s5-ent').value; S.equipo = $('#s5-eq').value; S.precio = numf($('#s5-precio').value);
            S.abono = numf($('#s5-abono').value); S.cliente = $('#s5-cli').value.trim();
            paintRes();
        };
        // Solo 'input': si se repintara también en 'change' (al salir del campo), el primer toque sobre un plazo se perdería
        ['s5-ent', 's5-eq', 's5-precio', 's5-abono', 's5-cli'].forEach(id => $('#' + id).addEventListener('input', sync));
        ['s5-ent', 's5-eq'].forEach(id => $('#' + id).addEventListener('change', sync));
        $$('[data-am]', view).forEach(b => b.onclick = () => { S.abonoModo = b.dataset.am; $$('[data-am]', view).forEach(x => x.classList.toggle('active', x === b)); sync(); });
        $('#s5-res').addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (b) { S.plazo = int(b.dataset.p); paintRes(); } });

        sync();
    }

    function paintRes() {
        const r = State.rates[S.entidad] || {}, c = calc(S), box = $('#s5-res'); if (!box) return;
        $('#s5-logo').innerHTML = chainLogo(r.logoKey || 'otro', r.nombre);
        $('#s5-cond').innerHTML = `Tasa <b>${(+r.tasaMV || 0).toFixed(2)}% mensual</b> · Cuota de manejo <b>${money(r.cuotaManejo)}</b>${r.condicion ? '<br>' + esc(r.condicion) : ''}`;
        if (c.P <= 0) { box.innerHTML = '<p class="empty">Escribe el precio del equipo para ver las cuotas.</p>'; return; }
        box.innerHTML = `
            <div class="sim-top">
                <div><span>Cuota mensual a ${c.n} meses</span><b class="sim-cuota">${money(c.cuotaTotal)}</b><small>Incluye cuota de manejo ${money(c.manejo)} · tasa ${c.tasa.toFixed(2)}% mensual</small></div>
                <div class="sim-grid">
                    <div><span>Valor del equipo</span><b>${money(c.precio)}</b></div>
                    <div><span>Cuota inicial</span><b>${money(c.abono)}</b></div>
                    <div><span>Monto financiado</span><b>${money(c.P)}</b></div>
                    <div><span>Total intereses</span><b>${money(c.intereses)}</b></div>
                </div>
            </div>
            <label class="lbl">Cuota según el plazo · toca el que prefiera el cliente</label>
            <div class="plazo-grid">${SIM_PLAZOS.map(p => { const x = calc(S, p); return `<button type="button" class="plazo ${p === S.plazo ? 'on' : ''}" data-p="${p}"><small>${p} cuotas</small><b>${money(x.cuotaTotal)}</b></button>`; }).join('')}</div>
            <details class="acc" style="margin-top:14px"><summary><span>Tabla de amortización · ${c.n} cuotas</span><span class="badge">Ver detalle</span></summary>
                <div class="tbl-scroll"><table class="tbl compact"><thead><tr><th>#</th><th>Cuota</th><th>Interés</th><th>Abono a capital</th><th>Saldo</th></tr></thead>
                <tbody>${c.tabla.map(t => `<tr><td>${t.k}</td><td>${money(t.cuota)}</td><td>${money(t.interes)}</td><td>${money(t.capital)}</td><td>${money(t.saldo)}</td></tr>`).join('')}</tbody></table></div>
            </details>`;
    }

    return { render, calc };
})());

// LIENZO · TARJETA DE SIMULACIÓN PARA EL CLIENTE (1080 px)
function buildSimCanvas(stage, S, c, all) {
    const r = State.rates[S.entidad] || {};
    const st = currentStore();
    const el = document.createElement('div');
    el.className = 'rp rp-m5';
    el.innerHTML = `
    <div class="rp-bar"></div>
    <header class="rp-head">
        <img class="rp-logo" src="${LOGO_INFINIX}" alt="Infinix">
        <div class="rp-head-mid"><div class="rp-kicker">SIMULACIÓN DE CRÉDITO</div><div class="rp-title">${esc(S.equipo || 'Tu nuevo Infinix')}</div>
            <div class="rp-sub">${esc(r.nombre || '')}${S.cliente ? ' · Cliente: <b>' + esc(S.cliente) + '</b>' : ''}${st ? ' · ' + esc(st.tienda) : ''}</div></div>
        <div class="rp-chain">${chainLogo(r.logoKey || 'otro', r.nombre)}</div>
    </header>
    <div class="sim-hero"><small>CUOTA MENSUAL ESTIMADA A ${c.n} MESES</small><b>${money(c.cuotaTotal)}</b><span>Tasa ${c.tasa.toFixed(2)}% mensual${c.manejo ? ` · incluye cuota de manejo ${money(c.manejo)}` : ''}</span></div>
    <div class="sim-cards">
        <div><small>Valor del equipo</small><b>${money(c.precio)}</b></div>
        <div><small>Cuota inicial</small><b>${money(c.abono)}</b></div>
        <div><small>Monto financiado</small><b>${money(c.P)}</b></div>
        <div><small>Total intereses</small><b>${money(c.intereses)}</b></div>
    </div>
    <div class="rp-sec">TU CUOTA SEGÚN EL PLAZO</div>
    <div class="sim-plazos">${all.map(x => `<div class="${x.n === c.n ? 'on' : ''}"><small>${x.n} cuotas</small><b>${money(x.cuotaTotal)}</b><span>Intereses ${money(x.intereses)}</span></div>`).join('')}</div>
    <div class="rp-sec">TABLA DE AMORTIZACIÓN · ${c.n} CUOTAS</div>
    <table class="rp-tbl sim"><thead><tr><th>CUOTA</th><th>VALOR CUOTA</th><th>INTERÉS</th><th>ABONO A CAPITAL</th><th>SALDO</th></tr></thead>
        <tbody>${c.tabla.map(t => `<tr><td>${t.k}</td><td>${money(t.cuota)}</td><td>${money(t.interes)}</td><td>${money(t.capital)}</td><td>${money(t.saldo)}</td></tr>`).join('')}
        <tr class="tot"><td>TOTAL</td><td>${money(c.P + c.intereses)}</td><td>${money(c.intereses)}</td><td>${money(c.P)}</td><td>${money(0)}</td></tr></tbody></table>
    <footer class="rp-foot"><span>Valores estimados con fines informativos. La cuota de la tabla no incluye la cuota de manejo. La aprobación y las condiciones definitivas dependen de la entidad financiera. ${esc(fechaLarga(todayStr()))}.</span><b>Infinix · Central de Operaciones</b></footer>
    <div class="rp-bar"></div>`;
    stage.appendChild(el);
    return el;
}

// ============================================================================
// GESTIÓN · TIENDAS, ZONAS Y USUARIOS
// Supervisor: solo las tiendas de su zona (ajustes, targets, contraseña).
// Coordinador: tiendas, zonas y equipo de su regional. Administrador: todo + configuración.
// ============================================================================

registerModule('admin', (() => {
    let tab = 'tiendas';
    const me = () => State.session;
    const isAdmin = () => me().rol === 'admin';
    const isSup = () => me().rol === 'supervisor';
    const TABS = () => isAdmin() ? ['tiendas', 'zonas', 'equipo', 'config'] : isSup() ? ['tiendas'] : ['tiendas', 'zonas', 'equipo'];
    const TAB_LABEL = { tiendas: '🏬 Tiendas', zonas: '🗺️ Zonas', equipo: '👥 Equipo', config: '🔐 Configuración' };

    function render(view) {
        view.innerHTML = `
        <section class="card">
            <h2 class="h2">${isSup() ? 'Gestión de tiendas de mi zona' : 'Gestión de tiendas, zonas y usuarios'}</h2>
            <p class="mute">${isSup() ? 'Ajusta asesores, targets, inventario, foco y contraseña de cada PDV cuando el asesor no lo haya hecho.' : 'Los cambios se reflejan en toda la app en tiempo real.'} Alcance: <b>${isAllZones() ? 'nacional' : (myRegional() && ['coordinador', 'gerente'].includes(me().rol) ? 'regional ' + esc(myRegional()) : 'zona ' + esc(me().zona))}</b>.</p>
            <div class="seg" style="margin-top:12px">${TABS().map(t => `<button class="seg-btn" data-t="${t}">${TAB_LABEL[t]}</button>`).join('')}</div>
        </section>
        <div id="adm-body"></div>`;
        $$('[data-t]', view).forEach(b => b.onclick = () => { tab = b.dataset.t; paint(); });
        $('#adm-body').addEventListener('click', onClick);
        $('#adm-body').addEventListener('change', async e => {
            if (e.target.id === 'st-fzona') { fZona = e.target.value; paint(); }
            if (e.target.id === 'zn-reg') $('#zn-reg-new').hidden = e.target.value !== '__new';
            if (e.target.dataset.zreg) { const z = State.zones.find(x => x.id === e.target.dataset.zreg); if (z) { z.regional = e.target.value; await Data.set(COL.zones, z.id, { regional: z.regional }, true); toast(`${z.nombre} → regional ${z.regional}`, 'ok'); } }
        });
        $('#adm-body').addEventListener('input', e => { if (e.target.id === 'st-fq') { fQ = e.target.value; const tb = $('#adm-body tbody'); const v = e.target.value; paint(); const i = $('#st-fq'); if (i) { i.focus(); i.setSelectionRange(v.length, v.length); } } });
        paint();
    }

    function paint() {
        $$('[data-t]').forEach(b => b.classList.toggle('active', b.dataset.t === tab));
        const body = $('#adm-body'); if (!body) return;
        if (!TABS().includes(tab)) tab = 'tiendas';
        body.innerHTML = ({ tiendas: tiendasHTML, zonas: zonasHTML, equipo: equipoHTML, config: configHTML })[tab]();
    }

    // ------------------------------------------------------------- Tiendas
    let fZona = '', fQ = '';
    function tiendasHTML() {
        const zs = scopedZones();
        const all = scopedStoresAll().filter(s => !fZona || s.zona === fZona).filter(s => !fQ || slug(s.tienda + ' ' + s.ciudad + ' ' + (s.cadena || '')).includes(slug(fQ)));
        const list = all.sort((a, b) => (a.zona + a.tienda).localeCompare(b.zona + b.tienda, 'es'));
        return `<section class="card">
            <div class="row between wrap"><h3 class="h3">Puntos de venta (${list.length})</h3>${isSup() ? '' : '<button class="btn btn-primary" data-a="store-new">➕ Nueva tienda</button>'}</div>
            <div class="row wrap" style="gap:8px;margin:8px 0 12px">
                ${zs.length > 1 ? `<select class="input" id="st-fzona"><option value="">Todas las zonas (${zs.length})</option>${zs.map(z => `<option value="${esc(z)}" ${fZona === z ? 'selected' : ''}>${esc(z)}</option>`).join('')}</select>` : ''}
                <input class="input grow" id="st-fq" placeholder="Buscar tienda, ciudad o cadena…" value="${esc(fQ)}">
            </div>
            <div class="tbl-scroll"><table class="tbl compact"><thead><tr><th>Tienda</th><th>Zona</th><th>Ciudad</th><th>Estado</th><th>Target</th><th>HC</th><th>Acciones</th></tr></thead><tbody>
            ${list.map(s => `<tr><td class="l">${storeLogo(s, 'xs')} <b>${esc(s.tienda)}</b><br><small class="mute">${esc(s.cadena || '')}${s.shopId ? ' · ' + esc(s.shopId) : ''}</small></td><td>${esc(s.zona || '')}</td><td>${esc(s.ciudad || '')}</td>
                <td>${s.isConfigured ? '<i class="pill ok">Configurada</i>' : '<i class="pill warn">Pendiente</i>'}${chainOn(s) ? '' : ' <i class="pill off" title="Su cadena no está en las cadenas de trabajo">fuera de trabajo</i>'}</td><td>${storeMetaMes(s) || '—'}</td><td>${int(s.hc && s.hc.INFINIX) || '—'}</td>
                <td class="acts">${isSup() ? '' : `<button class="icon-btn" title="Editar datos" data-a="store-edit" data-id="${esc(s.id)}">✏️</button>`}<button class="icon-btn" title="Asesores, HC, targets, inventario, foco y comisiones" data-a="store-cfg" data-id="${esc(s.id)}">⚙️</button>
                <button class="icon-btn" title="Restablecer contraseña" data-a="store-pass" data-id="${esc(s.id)}">🔑</button>${isSup() ? '' : `<button class="icon-btn" title="Eliminar" data-a="store-del" data-id="${esc(s.id)}">🗑️</button>`}</td></tr>`).join('') || '<tr><td colspan="7">Sin tiendas con ese filtro.</td></tr>'}
            </tbody></table></div></section>`;
    }

    function storeForm(st) {
        const zonas = scopedZones();
        if (!zonas.length) { toast('Primero crea una zona.', 'warn'); tab = 'zonas'; paint(); return; }
        const m = openModal(`<h3 class="modal-title">${st ? 'Editar tienda' : 'Nueva tienda'}</h3>
            <label class="lbl">Nombre del punto de venta</label><input class="input" id="sf-tienda" value="${esc(st ? st.tienda : '')}" placeholder="Ej. EXITO CABECERA">
            <label class="lbl">Cadena</label>
            <div class="row"><select class="input grow" id="sf-chain">${Object.keys(CHAINS).map(k => `<option value="${k}" ${st && normLogoKey(st.logoKey) === k ? 'selected' : ''}>${CHAINS[k].name}</option>`).join('')}</select><span class="logo-prev" id="sf-logo"></span></div>
            <input class="input" id="sf-cadena" style="margin-top:8px" value="${esc(st && normLogoKey(st.logoKey) === 'otro' ? st.cadena || '' : '')}" placeholder="Nombre de la cadena" hidden>
            <div class="grid2">
                <div><label class="lbl">Ciudad</label><input class="input" id="sf-ciudad" value="${esc(st ? st.ciudad || '' : '')}"></div>
                <div><label class="lbl">Zona / regional</label><select class="input" id="sf-zona">${zonas.map(z => `<option ${st && st.zona === z ? 'selected' : ''}>${esc(z)}</option>`).join('')}</select></div>
            </div>
            <p id="sf-err" class="err" hidden></p>
            <div class="row end" style="margin-top:16px"><button class="btn btn-ghost" data-x>Cancelar</button><button class="btn btn-primary" data-ok>Guardar</button></div>`);
        // Solo existen las 7 cadenas oficiales; cualquier otra se escribe a mano
        const logo = () => {
            const k = $('#sf-chain', m).value; $('#sf-cadena', m).hidden = k !== 'otro';
            $('#sf-logo', m).innerHTML = chainLogo(k, $('#sf-cadena', m).value.toUpperCase());
        };
        $('#sf-chain', m).onchange = logo; $('#sf-cadena', m).oninput = logo; logo();
        $('[data-x]', m).onclick = () => closeModal(m);
        $('[data-ok]', m).onclick = async () => {
            const tienda = $('#sf-tienda', m).value.trim().replace(/\s+/g, ' '), logoKey = $('#sf-chain', m).value;
            const err = $('#sf-err', m);
            if (tienda.length < 3) { err.textContent = 'Escribe el nombre de la tienda.'; err.hidden = false; return; }
            const otra = $('#sf-cadena', m).value.trim().toUpperCase();
            if (logoKey === 'otro' && !otra) { err.textContent = 'Escribe el nombre de la cadena.'; err.hidden = false; return; }
            const keep = st && normLogoKey(st.logoKey) === logoKey && st.cadena;      // p. ej. "ALKOSTO CENTRO" se conserva
            const data = {
                tienda, usuario: tienda.toUpperCase(), logoKey, zona: $('#sf-zona', m).value,
                cadena: logoKey === 'otro' ? otra : (keep ? st.cadena : CHAINS[logoKey].name.toUpperCase()), ciudad: $('#sf-ciudad', m).value.trim().toUpperCase(), updatedAt: Date.now()
            };
            let id = st ? st.id : slug(`${logoKey}_${tienda}`);
            if (!st && storeById(id)) { err.textContent = 'Ya existe una tienda con ese nombre en la cadena.'; err.hidden = false; return; }
            if (!st) Object.assign(data, { id, isConfigured: false, createdAt: Date.now(), createdBy: me().userId });
            await Data.set(COL.stores, id, data, true);
            if (st) Object.assign(st, data); else upsertState('stores', { ...data, id });
            closeModal(m); toast(st ? 'Tienda actualizada' : 'Tienda creada. Ya aparece en el acceso de PDV.', 'ok'); paint();
        };
    }

    // --------------------------------------------------------------- Zonas
    function zonasHTML() {
        const zs = State.zones.filter(z => inScope(z.nombre)).sort((a, b) => ((a.regional || '') + a.nombre).localeCompare((b.regional || '') + b.nombre, 'es'));
        const regs = isAdmin() ? regionales() : scopedRegionales();
        return `<section class="card">
            <h3 class="h3">Zonas por regional</h3>
            <p class="mute">Regionales: ${regs.map(r => `<b>${esc(r)}</b> (${State.zones.filter(z => z.regional === r).length} zonas)`).join(' · ') || '—'}.</p>
            <div class="row wrap" style="gap:8px"><input class="input grow" id="zn-new" placeholder="Nombre de la nueva zona (ej. VALLE NORTE)"><select class="input" id="zn-reg">${regs.map(r => `<option value="${esc(r)}" ${r === myRegional() ? 'selected' : ''}>${esc(r)}</option>`).join('')}${isAdmin() ? '<option value="__new">➕ Nueva regional…</option>' : ''}</select><input class="input" id="zn-reg-new" placeholder="Nombre de la regional" hidden><button class="btn btn-primary" data-a="zone-new">➕ Crear zona</button></div>
            <div class="tbl-scroll"><table class="tbl compact" style="margin-top:12px"><thead><tr><th>Zona</th><th>Regional</th><th>Tiendas</th><th>Equipo</th><th></th></tr></thead><tbody>
            ${zs.map(z => `<tr><td class="l"><b>${esc(z.nombre)}</b></td><td>${isAdmin() ? `<select class="input" data-zreg="${esc(z.id)}">${regionales().map(r => `<option ${z.regional === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select>` : esc(z.regional || '—')}</td><td>${State.stores.filter(s => s.zona === z.nombre).length}</td><td>${State.staff.filter(u => u.zona === z.nombre && !u.base).length}</td>
                <td class="acts"><button class="icon-btn" title="Eliminar zona" data-a="zone-del" data-id="${esc(z.id)}">🗑️</button></td></tr>`).join('') || '<tr><td colspan="5">Sin zonas.</td></tr>'}
            </tbody></table></div></section>`;
    }

    // -------------------------------------------------------------- Equipo
    function equipoHTML() {
        const mine = me();
        const list = State.staff.filter(u => isAdmin() || inScope(u.zona) || (u.regional && u.regional === myRegional())).filter(u => isAdmin() || ['supervisor', 'formador'].includes(u.rol) || u.id === mine.userId)
            .sort((a, b) => ((a.base ? '0' : a.demo ? '2' : '1') + a.rol + a.nombre).localeCompare((b.base ? '0' : b.demo ? '2' : '1') + b.rol + b.nombre, 'es'));
        const demoN = State.staff.filter(u => u.demo).length;
        return `<section class="card">
            <div class="row between wrap"><h3 class="h3">Usuarios del equipo (${list.length})</h3>${isAdmin() && demoN ? `<button class="btn btn-ghost" data-a="users-demo-del">🧹 Eliminar los ${demoN} usuarios de demostración</button>` : ''}</div>
            <p class="mute">Cada integrante se registra solo con su código DCR y la clave inicial de su cargo. Al retirarse, elimínalo aquí y el código queda libre para el reemplazo. Los usuarios <i class="pill">base</i> son genéricos y fijos; los <i class="pill warn">demo</i> son de prueba.</p>
            <div class="tbl-scroll"><table class="tbl compact"><thead><tr><th>Código DCR</th><th>Nombre</th><th>Cargo</th><th>Zona / regional</th><th>Registro</th><th></th></tr></thead><tbody>
            ${list.map(u => `<tr><td><b>${esc(u.dcr || '—')}</b></td><td class="l"><b>${esc(u.nombre)}</b> ${u.base ? '<i class="pill">base</i>' : u.demo ? '<i class="pill warn">demo</i>' : ''}</td><td>${ROLES[u.rol] ? ROLES[u.rol].label : esc(u.rol)}</td><td>${['coordinador', 'gerente'].includes(u.rol) && (u.regional || u.zona === 'NACIONAL') ? esc(u.regional || 'NACIONAL') : esc(u.zona || '')}</td><td>${u.createdAt ? dstr(new Date(u.createdAt)) : '—'}</td>
                <td class="acts">${u.id === mine.userId ? '<small class="mute">Tú</small>' : (u.base && !isAdmin()) ? '' : `<button class="icon-btn" title="Eliminar usuario" data-a="user-del" data-id="${esc(u.id)}">🗑️</button>`}</td></tr>`).join('') || '<tr><td colspan="6">Aún no hay usuarios registrados en tu zona.</td></tr>'}
            </tbody></table></div></section>`;
    }

    // -------------------------------------------------------- Configuración
    function configHTML() {
        const keys = [['store', 'Tiendas (PDV)'], ...STAFF_ROLES.map(r => [r, ROLES[r].label])];
        return `<section class="card">
            <h3 class="h3">Claves iniciales</h3>
            <p class="mute">Son las contraseñas con las que una tienda entra por primera vez y con las que el staff se registra. Deja en blanco las que no quieras cambiar.</p>
            <div class="grid2">${keys.map(([k, l]) => `<div><label class="lbl">${l}</label><input class="input" type="password" id="cf-${k}" placeholder="Nueva clave inicial" autocomplete="new-password"></div>`).join('')}</div>
            <div class="row end" style="margin-top:12px"><button class="btn btn-primary" data-a="cfg-auth">Guardar claves</button></div>
        </section>
        <section class="card">
            <h3 class="h3">Cadenas de trabajo</h3>
            <p class="mute">La data nacional trae retail, IR e independientes. Elige las cadenas que se trabajan: las demás salen del análisis de zona, la central, el plan y las evaluaciones de <b>toda la app</b>, pero su data queda guardada y vuelven cuando las marques. También lo puedes hacer desde el botón <b>Cadenas</b> del análisis de zona.</p>
            ${(() => { const L = chainList(State.stores), off = L.filter(c => State.cadenas.off.includes(c.key)); return `<p><b>${L.length - off.length} de ${L.length}</b> cadenas activas · ${sum(L.filter(c => !State.cadenas.off.includes(c.key)).map(c => c.pdv))} de ${State.stores.length} PDV${off.length ? `<br><small class="mute">Fuera de trabajo: ${off.slice(0, 12).map(c => esc(c.label)).join(', ')}${off.length > 12 ? ` y ${off.length - 12} más` : ''}</small>` : ''}</p>`; })()}
            <div class="row end"><button class="btn btn-primary" data-a="cfg-chains">🏷️ Elegir cadenas de trabajo</button></div>
        </section>
        <section class="card">
            <h3 class="h3">Radar de asesores</h3>
            <p class="mute">Define qué referencias son <b>foco</b> y desde cuándo un asesor entra en alerta. Se aplican al Radar del análisis de zona, a la ficha del asesor y al plan de trabajo. El foco que cada tienda fija a mano se suma a estas referencias.</p>
            <label class="lbl">Referencias foco</label>
            <div class="chips" id="rd-foco">${INFINIX_MODELS.map(m => `<label class="chip"><input type="checkbox" value="${m.key}" ${(State.radar.focoRefs || []).includes(m.key) ? 'checked' : ''}><span>${esc(m.name)}</span></label>`).join('')}</div>
            <div class="row wrap" style="gap:10px;margin-top:12px;align-items:flex-end">
                <label class="numcell"><span>Rezago desde (uds en PDV)</span><input class="input num" type="number" min="1" id="rd-inv" value="${int(State.radar.invMin)}"></label>
                <label class="numcell"><span>Venta "muy baja" (uds o menos)</span><input class="input num" type="number" min="0" id="rd-vb" value="${int(State.radar.ventaBaja)}"></label>
                <label class="numcell"><span>Alerta de ritmo (% del esperado)</span><input class="input num" type="number" min="10" max="100" id="rd-ritmo" value="${int(State.radar.ritmoMin)}"></label>
                <label class="numcell"><span>Nota mínima (de 100)</span><input class="input num" type="number" min="10" max="100" id="rd-nota" value="${int(State.radar.notaMin)}"></label>
            </div>
            <p class="hint">Rezago crítico = referencia foco con al menos ese stock en el PDV y venta del asesor igual o menor a "muy baja". Alerta de ritmo = cumplimiento ÷ cumplimiento esperado a la fecha por debajo de ese porcentaje.</p>
            <div class="row end" style="margin-top:12px"><button class="btn btn-primary" data-a="cfg-radar">Guardar radar</button></div>
        </section>
        <section class="card">
            <h3 class="h3">Tasas del simulador</h3>
            <p class="mute">Tasa mensual (M.V.), cuota de manejo y condiciones por entidad. Solo se cambian aquí: en el simulador quedan fijas para todos los perfiles.</p>
            <div class="tbl-scroll"><table class="tbl compact"><thead><tr><th>Entidad</th><th>Tasa M.V. %</th><th>Cuota de manejo $</th><th>Condición / beneficio</th></tr></thead><tbody>
            ${Object.keys(State.rates).map(k => { const r = State.rates[k]; return `<tr><td class="l">${chainLogo(r.logoKey || 'otro', r.nombre, 'xs')} <b>${esc(r.nombre)}</b></td>
                <td><input class="input num" type="number" step="0.01" min="0" id="rt-t-${k}" value="${+r.tasaMV || 0}"></td>
                <td><input class="input num" type="number" step="500" min="0" id="rt-m-${k}" value="${+r.cuotaManejo || 0}" style="width:110px"></td>
                <td><input class="input" id="rt-c-${k}" value="${esc(r.condicion || '')}"></td></tr>`; }).join('')}
            </tbody></table></div>
            <div class="row end" style="margin-top:12px"><button class="btn btn-primary" data-a="cfg-rates">Guardar tasas</button></div>
        </section>
        <section class="card">
            <h3 class="h3">Plan comisional de asesores · noviembre 2026</h3>
            <p class="mute">ROI 1 (ROI base de la tienda) abre la llave de los speeds: desde ahí se paga el incentivo de cada modelo vendido. ROI 2 y ROI 3 dan $400.000 o $700.000 (no acumulables). Los accesorios pagan desde la primera unidad. Los umbrales de cada tienda vienen del target (Alkosto/Éxito 100 y 140; Ktronix, Falabella, Cencosud y WOM 90 y 120) y se ven en la tarjeta del asesor y en la calculadora.</p>
            <div class="row wrap" style="gap:10px;align-items:flex-end">
                <label class="numcell"><span>Premio ROI 2 ($)</span><input class="input num" type="number" step="50000" min="0" id="cm-p400" value="${int((State.comisiones.kpiPay || KPI_PAY).k400)}"></label>
                <label class="numcell"><span>Premio ROI 3 ($)</span><input class="input num" type="number" step="50000" min="0" id="cm-p700" value="${int((State.comisiones.kpiPay || KPI_PAY).k700)}"></label>
                <label class="numcell wide grow"><span>Nota para el asesor</span><input class="input" id="cm-nota" value="${esc(State.comisiones.nota || '')}" placeholder="Ej. Plan vigente noviembre 2026"></label>
            </div>
            <div class="grid2" style="margin-top:10px">
                <div><label class="lbl">Speeds · incentivo por modelo ($)</label>
                <table class="tbl compact"><tbody>${INFINIX_MODELS.map(m => `<tr><td class="l"><b>${esc(m.name)}</b></td><td><input class="input num" type="number" step="1000" min="0" id="cm-v-${m.key}" value="${int(planValores()[m.key])}"></td></tr>`).join('')}</tbody></table></div>
                <div><label class="lbl">Accesorios ($ por unidad, desde la primera)</label>
                <table class="tbl compact"><tbody>${INFINIX_ACCESSORIES.map(a => `<tr><td class="l"><b>${esc(a.name)}</b></td><td><input class="input num" type="number" step="1000" min="0" id="cm-a-${a.key}" value="${int(planValoresAcc()[a.key])}"></td></tr>`).join('')}</tbody></table></div>
            </div>
            <div class="row end" style="margin-top:12px"><button class="btn btn-primary" data-a="cfg-com">Guardar plan comisional</button></div>
        </section>
        <section class="card">
            <h3 class="h3">Datos de demostración</h3>
            <p class="mute">${State.demo && State.demo.loaded ? `Cargados el ${State.demo.at ? dstr(new Date(State.demo.at)) : ''}: todas las tiendas del país configuradas con sus asesores reales, targets e inventario; data de zona del mes; cierres diarios, planes y visitas de prueba en ${DEMO_CLOSURE_ZONES.join(', ')} (usuarios "Demo", contraseña <b>${DEMO_PASSWORD}</b>).` : 'No hay datos de demostración cargados.'}
            Restaurar de cero borra todo lo de prueba y deja las tiendas sin configurar; lo que hayas registrado de verdad se conserva.</p>
            <div class="row end wrap" style="margin-top:12px">
                <button class="btn btn-ghost" data-a="demo-load">📦 Cargar datos de demostración</button>
                <button class="btn btn-danger" data-a="demo-clear">♻️ Restaurar de cero</button>
            </div>
        </section>`;
    }

    // ------------------------------------------------------------- Acciones
    async function onClick(e) {
        const b = e.target.closest('[data-a]'); if (!b) return;
        const a = b.dataset.a, id = b.dataset.id;
        if (a === 'cfg-radar') {
            const refs = $$('#rd-foco input:checked').map(i => i.value);
            if (!refs.length) return toast('Marca al menos una referencia foco.', 'warn');
            const clamp = (v, lo, hi, d) => { v = int(v); return v >= lo && v <= hi ? v : d; };
            State.radar = { focoRefs: refs, invMin: clamp($('#rd-inv').value, 1, 99, 2), ventaBaja: clamp($('#rd-vb').value, 0, 99, 1), ritmoMin: clamp($('#rd-ritmo').value, 10, 100, 85), notaMin: clamp($('#rd-nota').value, 10, 100, 80) };
            try { await Data.set(COL.config, 'radar', { ...State.radar, updatedAt: Date.now(), updatedBy: me().nombre }, false); } catch (e) { console.error(e); }
            return toast('Radar de asesores guardado', 'ok');
        }
        if (a === 'cfg-chains') return openChainPicker({ global: true, onDone: paint });
        if (a === 'store-new') return storeForm(null);
        if (a === 'store-edit') return storeForm(storeById(id));
        if (a === 'store-cfg') return openStoreSettings(id, { onSaved: paint });
        if (a === 'store-pass') {
            if (!await confirmBox('La tienda volverá a entrar con la clave inicial de PDV. ¿Restablecer?', 'Restablecer')) return;
            await Data.set(COL.stores, id, { passHash: null }, true); storeById(id).passHash = null; toast('Contraseña restablecida', 'ok'); return;
        }
        if (a === 'store-del') {
            const st = storeById(id);
            if (!await confirmBox(`Se eliminará "${st.tienda}" del acceso de PDV. Sus cierres históricos se conservan. ¿Continuar?`, 'Eliminar')) return;
            await Data.del(COL.stores, id); State.stores = State.stores.filter(s => s.id !== id); toast('Tienda eliminada', 'ok'); return paint();
        }
        if (a === 'zone-new') {
            const nombre = $('#zn-new').value.trim().toUpperCase().replace(/\s+/g, ' ');
            if (nombre.length < 3) return toast('Escribe el nombre de la zona.', 'warn');
            if (State.zones.some(z => z.nombre === nombre)) return toast('Esa zona ya existe.', 'warn');
            let regional = $('#zn-reg') ? $('#zn-reg').value : myRegional();
            if (regional === '__new') regional = $('#zn-reg-new').value.trim().toUpperCase().replace(/\s+/g, ' ');
            if (!regional) return toast('Indica la regional de la zona.', 'warn');
            const z = { id: slug(nombre), nombre, regional, createdBy: me().userId, createdAt: Date.now() };
            await Data.set(COL.zones, z.id, z, false); upsertState('zones', z); toast('Zona creada', 'ok'); return paint();
        }
        if (a === 'zone-del') {
            const z = State.zones.find(x => x.id === id);
            if (State.stores.some(s => s.zona === z.nombre) || State.staff.some(u => u.zona === z.nombre)) return toast('La zona tiene tiendas o usuarios: reasígnalos antes de eliminarla.', 'warn', 5000);
            if (!await confirmBox(`¿Eliminar la zona ${z.nombre}?`, 'Eliminar')) return;
            await Data.del(COL.zones, id); State.zones = State.zones.filter(x => x.id !== id); toast('Zona eliminada', 'ok'); return paint();
        }
        if (a === 'users-demo-del') {
            const us = State.staff.filter(u => u.demo);
            if (!await confirmBox(`Se eliminarán ${us.length} usuarios de demostración (sus planes y visitas de prueba se conservan hasta "Restaurar de cero"). ¿Continuar?`, 'Eliminar')) return;
            await Data.batch(us.map(u => ({ op: 'del', col: COL.staff, id: u.id }))); State.staff = State.staff.filter(u => !u.demo); toast('Usuarios de demostración eliminados', 'ok'); return paint();
        }
        if (a === 'user-del') {
            const u = State.staff.find(x => x.id === id);
            if (!await confirmBox(`${u.nombre} perderá el acceso de inmediato. Sus reportes históricos se conservan. ¿Eliminar?`, 'Eliminar')) return;
            await Data.del(COL.staff, id); State.staff = State.staff.filter(x => x.id !== id); toast('Usuario eliminado; el cupo queda libre', 'ok'); return paint();
        }
        if (a === 'cfg-auth') {
            const upd = {};
            for (const k of ['store', ...STAFF_ROLES]) { const v = $('#cf-' + k).value; if (v) { if (v.length < 6) return toast('Cada clave debe tener al menos 6 caracteres.', 'warn'); upd[k] = pwdHash(v); } }
            if (!Object.keys(upd).length) return toast('No hay cambios.', 'info');
            await Data.set(COL.config, 'auth', upd, true); Object.assign(State.auth, upd); toast('Claves iniciales actualizadas', 'ok'); return paint();
        }
        if (a === 'demo-load') {
            if (!await confirmBox('Se cargarán tiendas configuradas, cierres, planes y visitas de prueba del mes. ¿Continuar?', 'Cargar')) return;
            busy(b, true); const r = await Demo.load({}); busy(b, false);
            toast(`Datos de demostración cargados (${r.count} registros)`, 'ok'); return paint();
        }
        if (a === 'demo-clear') {
            if (!await confirmBox('Se borrarán los cierres, planes, visitas y usuarios de prueba, y las tiendas de prueba quedarán sin configurar. ¿Restaurar de cero?', 'Restaurar')) return;
            busy(b, true); const r = await Demo.clear(); busy(b, false);
            toast(`Listo: ${r.count} registros de prueba eliminados`, 'ok'); return paint();
        }
        if (a === 'cfg-com') {
            const upd = { plan: PLAN_ID, kpiPay: { k400: int($('#cm-p400').value) || KPI_PAY.k400, k700: int($('#cm-p700').value) || KPI_PAY.k700 }, nota: $('#cm-nota').value.trim(),
                valores: Object.fromEntries(INFINIX_MODELS.map(m => [m.key, int($('#cm-v-' + m.key).value)])), valoresAcc: Object.fromEntries(INFINIX_ACCESSORIES.map(a => [a.key, int($('#cm-a-' + a.key).value)])), updatedAt: Date.now(), updatedBy: me().nombre };
            await Data.set(COL.config, 'comisiones', { ...State.comisiones, ...upd }, false); State.comisiones = { ...State.comisiones, ...upd }; toast('Plan comisional guardado: tarjetas y calculadora ya lo usan', 'ok'); return paint();
        }
        if (a === 'cfg-rates') {
            const upd = {};
            Object.keys(State.rates).forEach(k => { upd[k] = { ...State.rates[k], tasaMV: numf($('#rt-t-' + k).value), cuotaManejo: numf($('#rt-m-' + k).value), condicion: $('#rt-c-' + k).value.trim() }; });
            await Data.set(COL.config, 'rates', upd, true); Object.assign(State.rates, upd); toast('Tasas sincronizadas', 'ok');
        }
    }

    // Si llega un cambio en tiempo real mientras se escribe, no se pisa el formulario
    const typing = () => { const el = document.activeElement, body = $('#adm-body'); return !!(el && body && body.contains(el) && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)); };
    return { render, onData: () => { if (!typing()) paint(); } };
})());

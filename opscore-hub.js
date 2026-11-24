// Central de Operaciones · Reportes (v1.18)
// Un solo lugar para encontrar cualquier reporte: agrupados por tema, con buscador. Cada tarjeta abre la pantalla
// exacta (por ejemplo Reportes de venta › Día a día o Central de reportes › Inventario).
registerModule('reportes', (() => {
    const has = m => ROLES[State.session.rol].modules.includes(m);
    const GROUPS = [
        ['📈 Venta', [
            ['ventas', 'refs', '📱', 'Venta por referencia e inventario', 'Cada asesor con inventario y venta por referencia, meta del día y cumplimiento.'],
            ['ventas', 'dia', '📅', 'Venta día a día', 'Venta de hoy o de un rango por asesor, con meta del día y crecimiento vs semana anterior.'],
            ['m4', 'resumen', '🧮', 'Resumen de venta por tienda, cadena y zona', 'Indicadores, ranking de tiendas y tablas por cadena y por zona.'],
            ['zona', 'reportes', '🖼️', 'Reporte de zona (imagen para WhatsApp)', 'El resumen de la zona listo para compartir.']
        ]],
        ['👥 Asesores', [
            ['zona', 'reportes', '🏆', 'Ranking de asesores', 'Del mejor al más crítico: meta, cumplimiento, proyección, ROI y evaluaciones.'],
            ['zona', 'asesores', '🎯', 'Radar de asesores (quién va mal)', 'Prioridad de cada asesor frente al ritmo del mes y su ficha.'],
            ['evals', '', '🎓', 'Evaluaciones semanales', 'Notas por semana, quién falta y reporte para el grupo.']
        ]],
        ['🏬 Tiendas e inventario', [
            ['zona', 'tiendas', '🏬', 'Estado de las tiendas', 'Tiendas críticas, en riesgo y en meta, con proyección.'],
            ['m4', 'inventario', '📦', 'Estado de inventario', 'Quiebres, días de inventario y sobrestock por cadena, tienda y zona.']
        ]],
        ['🧾 Cierres y control', [
            ['m4', 'cierres', '🧾', 'Auditoría de cierres', 'Quién no ha cerrado, qué días le faltan y la imagen de cada cierre.'],
            ['ventas', 'imei', '📵', 'IMEI sin activar y facturas', 'IMEI inactivos por asesor, con la factura que subió para descargarla.'],
            ['m4', 'obsequios', '🎁', 'Legalizaciones de obsequios', 'Merchandising recibido por tienda, legalizaciones pendientes y descarga de archivos.']
        ]],
        ['⚔️ Competencia', [
            ['zona', 'share', '📊', 'Share real (data de las cadenas)', 'Share, puesto y referencias más vendidas por cadena y por tienda según el sell-out.'],
            ['zona', 'versus', '⚔️', 'Infinix vs competencia (cierres)', 'Market share que reportan las tiendas en sus cierres, por semana (W46…) o mes.']
        ]],
        ['🗓️ Equipo', [
            ['m4', 'equipo', '👥', 'Visitas y planes del equipo', 'Lo que hizo cada líder en el rango.'],
            ['m2', '', '☀️', 'Plan de trabajo', 'Arma y comparte el plan del día.']
        ]]
    ];
    let q = '';
    function render(v) {
        q = '';
        v.innerHTML = `<section class="card hub-head"><h2 class="h2">📊 Reportes</h2><p class="mute">Todos los reportes en un solo lugar. Toca el que necesitas; para volver usa <b>← Reportes</b>.</p>
            <input class="input" id="hub-q" type="search" placeholder="🔎 Buscar reporte (ej. inventario, cierres, ranking)"></section><div id="hub-list"></div>`;
        $('#hub-q', v).oninput = e => { q = norm(e.target.value); paint(v); };
        paint(v);
        v.addEventListener('click', e => { const b = e.target.closest('[data-hub]'); if (!b) return; const [t, sub] = b.dataset.hub.split('|'); goTo(t, sub); });
    }
    const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    function paint(v) {
        const html = GROUPS.map(([g, items]) => {
            const L = items.filter(i => has(i[0]) && (!q || norm(i[3] + ' ' + i[4] + ' ' + g).includes(q)));
            return L.length ? `<section class="hub-g"><h3 class="hub-gt">${esc(g)}</h3><div class="hub-grid">${L.map(i => `<button class="hub-c" data-hub="${i[0]}|${i[1]}"><i>${i[2]}</i><span><b>${esc(i[3])}</b><small>${esc(i[4])}</small></span><em>›</em></button>`).join('')}</div></section>` : '';
        }).join('');
        $('#hub-list', v).innerHTML = html || '<div class="card empty">No hay reportes con esa palabra.</div>';
    }
    return { render };
})());
// Enlace "← Reportes" arriba de las pantallas que se abren desde el centro de reportes
const hubBack = () => State.session && ROLES[State.session.rol].modules.includes('reportes') ? `<button class="btn btn-link hub-back" onclick="navigate('reportes')">← Reportes</button>` : '';

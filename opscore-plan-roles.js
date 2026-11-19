// ============================================================================
// PLAN DE TRABAJO Y CIERRE POR ROL
// Supervisor: el número. Meta del día de la zona (faltante ÷ días que quedan), meta del día y compromiso por PDV,
//   gestiones comerciales (presión, mesa, ejecución, líder de piso, planillas). Cierre: meta vs. vendido, gestión por PDV,
//   collage de fotos de las visitas.
// Formador: el conocimiento. Plan igual al de siempre (con ajustes de diseño). Cierre: tarjeta por PDV con la foto de la
//   visita, asesores trabajados, evaluaciones, temas débiles, referencia trabajada y si se vendió.
// ============================================================================

const PLAN_ACCIONES_SUP = [
    'Presión comercial: meta del día con cada asesor', 'Cambio / movimiento de mesa', 'Ejecución de exhibición y material POP',
    'Charla con líder de piso / jefe de sección', 'Revisión y diligenciamiento de planillas', 'Seguimiento a faltantes de planilla',
    'Revisión de inventario y pedido de surtido', 'Negociación de cabeceras y espacios', 'Revisión de precios y tablas de crédito',
    'Activación / impulso en piso', 'Seguimiento a IMEI inactivos'
];
const PLAN_IMPACTOS_SUP = [
    'Cumplir la meta del día del PDV', 'Recuperar el faltante de la semana', 'Rotar la referencia rezagada', 'Mesa ejecutada para el fin de semana',
    'Subir el ROI del PDV', 'Planillas al día', 'Reposición de inventario confirmada'
];
const PLAN_ACCIONES_FORM = [
    'Capacitación de la referencia rezagada', 'Speech y demo de producto', 'Tips de cierre y manejo de objeciones', 'Refuerzo de temas débiles de la evaluación',
    'Role play con el asesor', 'Acompañamiento en piso (venta asistida)', 'Capacitación a asesores de cadena', 'Comparativo frente a la competencia', 'Acompañar movimiento de mesa'
];
const isSupPlan = rol => rol === 'supervisor';

// Meta del día de la zona: lo que falta del mes ÷ los días que quedan (contando el día del plan)
function zoneGoal(zonas, fecha) {
    const ym = fecha.slice(0, 7), dim = daysInMonth(ym);
    const S = State.stores.filter(s => zonas.includes(s.zona) && chainOn(s));
    let venta = 0, corte = '';
    S.forEach(st => { const Z = typeof ZoneData !== 'undefined' ? ZoneData.forStore(st.id) : null; if (Z && Z.month === ym) { venta += int(Z.total); if ((Z.corte || '') > corte) corte = Z.corte; } });
    const meta = sum(S.map(storeMetaMes));
    const dayCorte = corte ? int(corte.slice(8)) : Math.max(1, int(fecha.slice(8)) - 1);
    const diasRest = Math.max(1, dim - Math.max(dayCorte, int(fecha.slice(8)) - 1));
    const faltan = Math.max(0, meta - venta), proj = dayCorte ? Math.round(venta / dayCorte * dim) : 0;
    return { zonas, meta, venta, faltan, dim, dayCorte, diasRest, corte, metaDia: Math.ceil(faltan / diasRest), proj, cumpl: meta ? venta / meta : null, cumplProj: meta ? proj / meta : null, pdv: S.length };
}
const metaDiaPdv = (r, fecha) => { const dim = daysInMonth(fecha.slice(0, 7)), day = r.corte ? int(r.corte.slice(8)) : Math.max(1, int(fecha.slice(8)) - 1); const rest = Math.max(1, dim - Math.max(day, int(fecha.slice(8)) - 1)); return Math.ceil(Math.max(0, int(r.metaMes) - int(r.ventaMes)) / rest); };

// Tarjeta de la meta del día en la pantalla del plan (supervisor)
function zoneGoalHTML(G) {
    const pc = v => v == null ? '—' : Math.round(v * 100) + '%';
    const col = v => v == null ? '' : v >= 1 ? 'g' : v >= .85 ? 'a' : 'r';
    return `<section class="card zg-card"><div class="row between wrap"><h3 class="h3">🎯 Meta del día · ${esc(G.zonas.join(', '))}</h3><small class="mute">Data al ${esc(G.corte || '—')} · quedan ${G.diasRest} días</small></div>
        <div class="zg-kpis">
            <div class="hl"><span>Meta del día</span><b>${G.metaDia}</b><em>uds para ir al 100%</em></div>
            <div><span>Meta mes</span><b>${G.meta}</b><em>${G.pdv} PDV</em></div>
            <div><span>Venta a hoy</span><b>${G.venta}</b><em class="${col(G.cumpl)}">${pc(G.cumpl)} cumpl.</em></div>
            <div><span>Faltan</span><b>${G.faltan}</b><em>${G.diasRest} días</em></div>
            <div><span>Proyección</span><b>${G.proj}</b><em class="${col(G.cumplProj)}">${pc(G.cumplProj)} de la meta</em></div>
        </div></section>`;
}

// ---------- Lienzo · PLAN DEL SUPERVISOR (informe de números) ----------
function buildPlanSupCanvas(stage, doc) {
    const G = doc.zoneGoal || zoneGoal([doc.zona], doc.fecha), R = doc.stores, dash = '—';
    const pc = v => v == null ? dash : Math.round(v * 100) + '%', col = v => v == null ? '' : v >= 1 ? 'g' : v >= .85 ? 'a' : 'r';
    const comp = sum(R.map(r => int(r.compromisoUnd))), metaDiaR = sum(R.map(r => int(r.metaDia)));
    const el = document.createElement('div'); el.className = 'rp sp';
    el.innerHTML = `<div class="rp-bar"></div>
    <header class="rp-head"><img class="rp-logo" src="${LOGO_INFINIX}" alt="Infinix">
        <div class="rp-head-mid"><div class="rp-kicker">SUPERVISIÓN · PLAN DE TRABAJO DEL DÍA</div><div class="rp-title">${esc(fechaLarga(doc.fecha).toUpperCase())}</div><div class="rp-sub">${esc(doc.week)} · Zona ${esc(doc.zona)} · ${R.length} PDV a visitar</div></div>
        <div class="pl-who"><b>${esc(doc.nombre)}</b><small>Supervisor</small><span class="zone">ZONA ${esc(doc.zona)}</span></div></header>
    <div class="sp-band">
        <div class="hero"><span>META DEL DÍA DE LA ZONA</span><b>${G.metaDia}</b><em>uds para ir al 100% · quedan ${G.diasRest} días</em></div>
        <div><span>Meta mes</span><b>${G.meta}</b><em>${G.pdv} PDV</em></div>
        <div><span>Venta a hoy</span><b>${G.venta}</b><em class="${col(G.cumpl)}">${pc(G.cumpl)}</em></div>
        <div><span>Faltan</span><b>${G.faltan}</b><em>al ${esc(G.corte || doc.fecha)}</em></div>
        <div><span>Proyección</span><b>${G.proj}</b><em class="${col(G.cumplProj)}">${pc(G.cumplProj)} de la meta</em></div>
        <div class="ok"><span>Compromiso hoy</span><b>${comp}</b><em>en ${R.length} PDV · meta PDV ${metaDiaR}</em></div>
    </div>
    <div class="rp-sec">PUNTOS DE VENTA A VISITAR · NÚMEROS Y COMPROMISO</div>
    <table class="rp-tbl sp-tbl"><thead><tr><th class="l">#</th><th class="l">PUNTO DE VENTA</th><th class="l">ASESORES</th><th>META MES</th><th>VENTA</th><th>CUMPL.</th><th>PROY.</th><th>FALTAN</th><th class="c-tot">META DÍA</th><th class="c-tot">COMPROMISO</th><th class="l">REF. FOCO</th></tr></thead><tbody>
    ${R.map((r, i) => { const st = storeById(r.storeId), cu = r.metaMes ? int(r.ventaMes) / r.metaMes : null, pr = r.roiProj && r.hc ? r.roiProj * r.hc : null, focoName = (INFINIX_MODELS.find(m => m.key === r.focoRef) || {}).name || dash;
        const advs = st ? activeAdvisors(st).map(a => { const ds = typeof DayStatus !== 'undefined' ? DayStatus.ofAdvisor(st, a.nombre, doc.fecha) : null; return `${esc(a.nombre.split(' ').slice(0, 2).join(' '))}${ds && ds.off ? ` <i class="sp-off">${esc(ds.label)}</i>` : ''}`; }).join('<br>') : dash;
        return `<tr><td class="l">${i + 1}</td><td class="l"><div class="sp-pdv">${chainLogo(r.logoKey, r.cadena, 'xs')}<b>${esc(r.tienda)}</b></div></td><td class="l small">${advs || dash}</td><td>${int(r.metaMes) || dash}</td><td><b>${int(r.ventaMes)}</b></td><td class="c-tot ${col(cu)}">${pc(cu)}</td><td>${pr == null ? dash : Math.round(pr)}</td><td>${Math.max(0, int(r.metaMes) - int(r.ventaMes))}</td><td class="c-tot">${int(r.metaDia)}</td><td class="c-tot"><b>${int(r.compromisoUnd)}</b></td><td class="l small">${esc(focoName)} ${int(r.focoVenta)}/${int(r.focoMeta)}</td></tr>`; }).join('')}
    <tr class="tot"><td class="l" colspan="3">TOTAL VISITA</td><td>${sum(R.map(r => int(r.metaMes)))}</td><td>${sum(R.map(r => int(r.ventaMes)))}</td><td></td><td></td><td>${sum(R.map(r => Math.max(0, int(r.metaMes) - int(r.ventaMes))))}</td><td class="c-tot">${metaDiaR}</td><td class="c-tot">${comp}</td><td></td></tr>
    </tbody></table>
    <div class="rp-sec">GESTIÓN COMERCIAL PROGRAMADA</div>
    <div class="sp-gest">${R.map(r => `<div class="sp-g"><div class="sp-g-h">${chainLogo(r.logoKey, r.cadena, 'xs')}<b>${esc(r.tienda)}</b><em>Compromiso ${int(r.compromisoUnd)} uds</em></div>
        <ul>${r.acciones.filter(a => a && a.trim()).map(a => `<li>${esc(a)}</li>`).join('') || '<li class="mute2">Sin gestión definida</li>'}</ul>
        ${r.impactos.filter(Boolean).length ? `<div class="sp-imp">🎯 ${r.impactos.filter(Boolean).map(esc).join(' · ')}</div>` : ''}</div>`).join('')}</div>
    ${typeof DayStatus !== 'undefined' ? DayStatus.reportBlock(R.map(r => storeById(r.storeId)).filter(Boolean), doc.fecha, 'ASESORES FUERA DEL PDV HOY (NO SE INCLUYEN EN LA VISITA)') : ''}
    <footer class="rp-foot"><span>Meta del día = (meta del mes − venta a la fecha) ÷ días que quedan. Venta de la data DCR al ${esc(G.corte || '—')}. Proyección = venta ÷ días transcurridos × días del mes.</span><b>Infinix · Central de Operaciones</b></footer><div class="rp-bar"></div>`;
    stage.appendChild(el); return el;
}

// ---------- Lienzo · CIERRE DEL SUPERVISOR (metas, gestión por PDV y collage) ----------
function buildCierreSupCanvas(stage, doc) {
    const G = doc.zoneGoal || zoneGoal([doc.zona], doc.fecha), R = doc.stores.map(r => ({ ...r, asesores: advOfRow(r) })), dash = '—';
    const pc = v => v == null ? dash : Math.round(v * 100) + '%', col = v => v == null ? '' : v >= 1 ? 'g' : v >= .85 ? 'a' : 'r';
    const comp = sum(R.map(r => int(r.compromisoUnd))), vendido = sum(R.map(r => int(r.undVisita)));
    const acc = R.flatMap(r => r.acciones.map((a, j) => a && a.trim() ? (r.estados[j] || '') : null)).filter(x => x !== null);
    const conComp = R.filter(r => int(r.compromisoUnd) > 0), cumplidos = conComp.filter(r => r.compromisoOk === 'si').length;
    const fotos = R.flatMap(r => ((r.visita && r.visita.fotos) || []).map(f => ({ f, r })));
    const est = { ok: ['g', '✓'], parcial: ['a', '!'], pend: ['r', '✕'], '': ['', '•'] };
    const el = document.createElement('div'); el.className = 'rp sp';
    el.innerHTML = `<div class="rp-bar"></div>
    <header class="rp-head"><img class="rp-logo" src="${LOGO_INFINIX}" alt="Infinix">
        <div class="rp-head-mid"><div class="rp-kicker">SUPERVISIÓN · CIERRE DE GESTIÓN</div><div class="rp-title">${esc(fechaLarga(doc.fecha).toUpperCase())}</div><div class="rp-sub">${esc(doc.week)} · Zona ${esc(doc.zona)} · ${R.length} PDV visitados</div></div>
        <div class="pl-who"><b>${esc(doc.nombre)}</b><small>Supervisor</small><span class="zone">ZONA ${esc(doc.zona)}</span></div></header>
    <div class="sp-band">
        <div class="hero ${comp ? col(vendido / comp) : ''}"><span>CUMPLIMIENTO DEL DÍA</span><b>${comp ? pc(vendido / comp) : dash}</b><em>${vendido} vendidas de ${comp} comprometidas</em></div>
        <div><span>Meta del día zona</span><b>${G.metaDia}</b><em>uds para ir al 100%</em></div>
        <div><span>Vendido en visitas</span><b>${vendido}</b><em>en ${R.length} PDV</em></div>
        <div><span>Compromisos</span><b>${cumplidos}/${conComp.length}</b><em>cumplidos</em></div>
        <div><span>Gestiones</span><b>${acc.filter(x => x === 'ok').length}/${acc.length}</b><em>ejecutadas</em></div>
        <div><span>Zona mes</span><b>${pc(G.cumpl)}</b><em class="${col(G.cumplProj)}">proy. ${pc(G.cumplProj)}</em></div>
    </div>
    <div class="rp-sec">RESULTADO POR PUNTO DE VENTA</div>
    <table class="rp-tbl sp-tbl"><thead><tr><th class="l">PUNTO DE VENTA</th><th>COMPROMISO</th><th>VENDIDO HOY</th><th class="c-tot">% DÍA</th><th>ACUM. MES</th><th>META MES</th><th class="c-tot">CUMPL. MES</th><th class="l">GESTIÓN REALIZADA</th></tr></thead><tbody>
    ${R.map(r => { const cd = int(r.compromisoUnd) ? int(r.undVisita) / int(r.compromisoUnd) : null, cm = r.metaMes ? int(r.undCierre) / r.metaMes : null;
        return `<tr><td class="l"><div class="sp-pdv">${chainLogo(r.logoKey, r.cadena, 'xs')}<b>${esc(r.tienda)}</b></div></td><td>${int(r.compromisoUnd) || dash}</td><td><b>${int(r.undVisita)}</b></td><td class="c-tot ${col(cd)}">${pc(cd)}</td><td>${int(r.undCierre)}</td><td>${int(r.metaMes) || dash}</td><td class="c-tot ${col(cm)}">${pc(cm)}</td>
        <td class="l small">${r.acciones.map((a, j) => a && a.trim() ? `<span class="sp-ck ${est[r.estados[j] || ''][0]}">${est[r.estados[j] || ''][1]}</span> ${esc(a)}` : '').filter(Boolean).join('<br>') || dash}</td></tr>`; }).join('')}
    <tr class="tot"><td class="l">TOTAL</td><td>${comp}</td><td>${vendido}</td><td class="c-tot ${comp ? col(vendido / comp) : ''}">${comp ? pc(vendido / comp) : dash}</td><td>${sum(R.map(r => int(r.undCierre)))}</td><td>${sum(R.map(r => int(r.metaMes)))}</td><td></td><td></td></tr>
    </tbody></table>
    ${R.some(r => (r.asesores || []).length) ? `<div class="rp-sec">ASESORES GESTIONADOS</div>
    <table class="rp-tbl sp-tbl"><thead><tr><th class="l">ASESOR</th><th class="l">PDV</th><th>META</th><th>VENTA</th><th class="c-tot">CUMPL.</th><th class="l">REF. REZAGADA</th></tr></thead><tbody>
    ${R.flatMap(r => (r.asesores || []).map(a => `<tr><td class="l"><b>${esc(a.nombre)}</b></td><td class="l small">${esc(r.tienda)}</td><td>${a.meta || dash}</td><td>${a.venta ?? dash}</td><td class="c-tot ${col(a.cumpl)}">${pc(a.cumpl)}</td><td class="l small">${esc((a.rezagos || []).map(m => m.name + ' ×' + m.inv).slice(0, 2).join(', ') || dash)}</td></tr>`)).join('')}</tbody></table>` : ''}
    ${fotos.length ? `<div class="rp-sec">REGISTRO FOTOGRÁFICO DE LAS VISITAS</div><div class="sp-collage">${fotos.slice(0, 12).map(x => `<figure><img src="${x.f}" alt=""><figcaption>${esc(x.r.tienda)}</figcaption></figure>`).join('')}</div>` : ''}
    ${R.some(r => r.visita && (r.visita.gestion || r.visita.compromisos)) ? `<div class="rp-sec">NOTAS DE LA VISITA</div><div class="sp-notes">${R.filter(r => r.visita && (r.visita.gestion || r.visita.compromisos)).map(r => `<div><b>${esc(r.tienda)}</b>${r.visita.gestion ? `<p>${esc(r.visita.gestion)}</p>` : ''}${r.visita.compromisos ? `<p class="mute2">Compromisos: ${esc(r.visita.compromisos)}</p>` : ''}</div>`).join('')}</div>` : ''}
    <footer class="rp-foot"><span>% día = vendido en la visita ÷ compromiso. Meta del día de la zona = (meta del mes − venta) ÷ días que quedan. Venta de la data DCR y de lo registrado en la visita.</span><b>Infinix · Central de Operaciones</b></footer><div class="rp-bar"></div>`;
    stage.appendChild(el); return el;
}

// ---------- Lienzo · CIERRE DEL FORMADOR (conocimiento, evaluaciones y referencia trabajada) ----------
// Asesores de la visita: los marcados en el plan o, si no se marcó ninguno, los activos del PDV con su diagnóstico
const advOfRow = r => (r.asesores && r.asesores.length) ? r.asesores : (storeById(r.storeId) && typeof Advisor !== 'undefined' ? Advisor.forStore(storeById(r.storeId)).filter(d => !d.sinData).map(Advisor.planEntry) : []);
function buildCierreFormCanvas(stage, doc) {
    const R = doc.stores.map(r => ({ ...r, asesores: advOfRow(r) })), dash = '—';
    const pc = v => v == null ? dash : Math.round(v * 100) + '%', col = v => v == null ? '' : v >= 1 ? 'g' : v >= .7 ? 'a' : 'r';
    const advs = R.flatMap(r => r.asesores || []), notas = advs.map(a => a.nota).filter(n => n != null);
    const temas = [...new Set(advs.flatMap(a => a.temasDebiles || []))];
    const vendido = sum(R.map(r => int(r.undVisita))), acc = R.flatMap(r => r.acciones.map((a, j) => a && a.trim() ? (r.estados[j] || '') : null)).filter(x => x !== null);
    const est = { ok: ['g', '✓'], parcial: ['a', '!'], pend: ['r', '✕'], '': ['', '•'] };
    const extra = R.flatMap(r => ((r.visita && r.visita.fotos) || []).slice(1).map(f => ({ f, r })));
    const el = document.createElement('div'); el.className = 'rp sp fc';
    el.innerHTML = `<div class="rp-bar"></div>
    <header class="rp-head"><img class="rp-logo" src="${LOGO_INFINIX}" alt="Infinix">
        <div class="rp-head-mid"><div class="rp-kicker">FORMACIÓN · CIERRE DEL DÍA</div><div class="rp-title">${esc(fechaLarga(doc.fecha).toUpperCase())}</div><div class="rp-sub">${esc(doc.week)} · Zona ${esc(doc.zona)} · ${R.length} PDV · ${advs.length} asesores trabajados</div></div>
        <div class="pl-who"><b>${esc(doc.nombre)}</b><small>${ROLES[doc.rol] ? ROLES[doc.rol].label : 'Formador'}</small><span class="zone">ZONA ${esc(doc.zona)}</span></div></header>
    <div class="sp-band">
        <div class="hero"><span>ASESORES FORMADOS HOY</span><b>${advs.length}</b><em>en ${R.length} PDV</em></div>
        <div><span>Nota promedio</span><b class="${notas.length ? col(sum(notas) / notas.length / 80) : ''}">${notas.length ? Math.round(sum(notas) / notas.length) : dash}</b><em>evaluaciones del mes</em></div>
        <div><span>Temas reforzados</span><b>${temas.length}</b><em>${esc(temas.slice(0, 2).join(' · ') || 'sin temas débiles')}</em></div>
        <div><span>Acciones</span><b>${acc.filter(x => x === 'ok').length}/${acc.length}</b><em>ejecutadas</em></div>
        <div><span>Ventas en visita</span><b>${vendido}</b><em>uds el día de hoy</em></div>
    </div>
    <div class="fc-grid">${R.map(r => { const foto = r.visita && r.visita.fotos && r.visita.fotos[0], focoName = (INFINIX_MODELS.find(m => m.key === r.focoRef) || {}).name || dash, fcu = r.focoMeta ? int(r.focoVenta) / r.focoMeta : null, ok = r.compromisoOk;
        return `<div class="fc-card">
            <div class="fc-photo">${foto ? `<img src="${foto}" alt="">` : `<div class="fc-nofoto">${chainLogo(r.logoKey, r.cadena)}<small>Sin foto de la visita</small></div>`}<span class="fc-tag"><i>${chainLogo(r.logoKey, r.cadena, 'xs')}</i><b>${esc(r.tienda)}</b></span></div>
            <div class="fc-body">
                <div class="fc-ref"><span>Referencia trabajada</span><b>${esc(focoName)}</b><em class="${col(fcu)}">${int(r.focoVenta)}/${int(r.focoMeta) || dash} mes · ${pc(fcu)}</em><em>Hoy: <b>${int(r.undVisita)}</b> uds${int(r.compromisoUnd) ? ` de ${int(r.compromisoUnd)}` : ''} ${ok === 'si' ? '✅' : ok === 'no' ? '❌' : ''}</em></div>
                ${(r.asesores || []).length ? `<div class="fc-advs">${r.asesores.map(a => `<div class="fc-adv">${typeof advisorAvatar === 'function' ? advisorAvatar(r.storeId, a.nombre, 40) : ''}<div><b>${esc(a.nombre.split(' ').slice(0, 2).join(' '))}</b><small>${a.nota != null ? `Eval. <b class="${col(a.nota / 80)}">${a.nota}</b>` : 'Sin evaluación'} · ${pc(a.cumpl)} cumpl.</small>${(a.temasDebiles || []).length ? `<small class="fc-tem">Reforzar: ${esc(a.temasDebiles.slice(0, 2).join(', '))}</small>` : ''}</div></div>`).join('')}</div>` : (r.visita && r.visita.evalPromedio != null ? `<div class="fc-advs"><small>Evaluación del PDV: <b>${r.visita.evalPromedio}</b> (${r.visita.evalRealizadas} realizadas)</small></div>` : '')}
                <ul class="fc-acc">${r.acciones.map((a, j) => a && a.trim() ? `<li><span class="sp-ck ${est[r.estados[j] || ''][0]}">${est[r.estados[j] || ''][1]}</span>${esc(a)}</li>` : '').join('')}</ul>
                ${r.visita && r.visita.gestion ? `<p class="fc-note">${esc(r.visita.gestion.slice(0, 260))}${r.visita.gestion.length > 260 ? '…' : ''}</p>` : ''}
            </div></div>`; }).join('')}</div>
    ${extra.length ? `<div class="rp-sec">MÁS FOTOS DE LAS VISITAS</div><div class="sp-collage">${extra.slice(0, 8).map(x => `<figure><img src="${x.f}" alt=""><figcaption>${esc(x.r.tienda)}</figcaption></figure>`).join('')}</div>` : ''}
    <footer class="rp-foot"><span>Nota de evaluación del mes (≥80 aprobada). Referencia trabajada = foco de la visita: venta del mes de la data DCR y venta del día registrada en la visita.</span><b>Infinix · Central de Operaciones</b></footer><div class="rp-bar"></div>`;
    stage.appendChild(el); return el;
}

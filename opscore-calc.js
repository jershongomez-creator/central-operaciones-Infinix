// ============================================================================
// MÓDULO 7 · CALCULADORA COMERCIAL DEL ASESOR (perfil Tienda)
// El asesor se elige a sí mismo y ve: su target (el de la tienda repartido
// entre los asesores, ajustable a mano), cuántas unidades lleva por referencia
// (de la data de zona por asesor, o de los cierres), si ya abrió comisión
// (KPI de apertura), cuánto paga cada referencia y cuánto lleva ganado.
// El plan comisional es general: Gestión › Configuración › Plan comisional.
// ============================================================================

// ============================================================================
// MOTOR DE DIAGNÓSTICO POR ASESOR · AdvisorDiagnostic (v1.5)
// Cruza, para cada asesor activo: (1) su venta real de la data DCR frente a su meta y al ritmo del mes,
// (2) su venta por referencia frente al inventario de su PDV, (3) su última evaluación y los temas flojos,
// y (4) las referencias foco. Con eso entrega un diagnóstico único que consumen el Radar de Análisis de zona,
// la Ficha ejecutiva (imagen), el Plan de trabajo y el Excel gerencial. Cero doble digitación.
//
// AdvisorDiagnostic = {
//   id, storeId, nombre, cedula,
//   pdv: { tienda, ciudad, cadena, zona, regional, logoKey },
//   corte, day, dim, left, sinData,
//   pacing: { meta, venta, cumpl, esperado, indice, proy, proyCumpl, brechaUds, brechaEsperada, ritmoReq, ritmoActual, comisionJuego },
//   inventario: { total, modelos: [{ key, name, foco, meta, vendidas, inv, estado, label }], estrella, oportunidad, rezagos, stockFoco },
//   evaluacion: null | { hecha, nota, semana, bajo, pendiente, temasDebiles: [{ tema, nota }], porSemana },
//   prescripcion: { nivel, semaforo, score, razones, acciones: [{ tipo, texto, corto }], impactos, temas, compromisoDia, compromisoTxt, focoLineas, focoCorto }
// }
// ============================================================================
const Advisor = (() => {
    const R = () => ({ ...DEFAULT_RADAR, ...(State.radar || {}) });
    const pc = v => v == null ? '—' : Math.round(v * 100) + '%';
    const focoSet = st => new Set([...(R().focoRefs || []), ...(st.foco && st.foco.ref ? [st.foco.ref] : [])]);
    const unidades = n => `${n} ud${n === 1 ? '' : 's'}`;
    // Target mensual del asesor por referencia: el que dejó guardado la calculadora o el reparto del target de la tienda entre los asesores activos
    function targetOf(st, adv, active) {
        const saved = Object.entries(st.targetsAsesor || {}).find(([n]) => adv.alias.some(a => sameAdvisor({ nombre: n }, { nombre: a })));
        if (saved && saved[1] && Object.keys(saved[1]).length) return { src: 'manual', porRef: { ...saved[1] } };
        // Meta individual del seguimiento (tabla por asesor): se reparte por referencia según el target de la tienda
        if (st.metasAsesor && Object.keys(st.metasAsesor).length) {
            const hit = Object.entries(st.metasAsesor).find(([n]) => adv.alias.some(a => sameAdvisor({ nombre: n }, { nombre: a })));
            if (hit) {
                const total = int(hit[1]), base = INFINIX_MODELS.map(m => [m.key, +(st.metas && st.metas[m.key]) || 0]), tb = sum(base.map(x => x[1])), out = {};
                if (tb > 0 && total > 0) {
                    const raw = base.map(([k, v]) => [k, v / tb * total]); raw.forEach(([k, v]) => { out[k] = Math.floor(v); });
                    let rest = total - sum(Object.values(out)); raw.slice().sort((a, b) => (b[1] % 1) - (a[1] % 1)).forEach(([k]) => { if (rest > 0) { out[k]++; rest--; } });
                } else INFINIX_MODELS.forEach(m => { out[m.key] = 0; });
                return { src: 'seguimiento', porRef: out, total };
            }
        }
        const n = Math.max(1, active.length), i = Math.max(0, active.indexOf(adv)), out = {};
        INFINIX_MODELS.forEach(m => { const t = int(st.metas && st.metas[m.key]); out[m.key] = Math.floor(t / n) + (i < t % n ? 1 : 0); });
        return { src: 'reparto', porRef: out };
    }
    // Comisión promedio por unidad según el mix de su target (o el promedio simple si no hay target)
    function valorUnidad(porRef) {
        const v = (State.comisiones && State.comisiones.valores) || {};
        const w = INFINIX_MODELS.map(m => [int(porRef[m.key]), int(v[m.key])]), tw = sum(w.map(x => x[0]));
        if (tw > 0 && sum(w.map(x => x[1])) > 0) return sum(w.map(x => x[0] * x[1])) / tw;
        const pos = w.map(x => x[1]).filter(x => x > 0); return pos.length ? sum(pos) / pos.length : 0;
    }

    function diagnose(st, adv, active) {
        const r = R(), notaMin = int(r.notaMin) || 80, ritmoMin = (+r.ritmoMin || 85) / 100, invMin = Math.max(1, int(r.invMin) || 2), ventaBaja = int(r.ventaBaja);
        const Z = typeof ZoneData !== 'undefined' ? ZoneData.forStore(st.id) : null;
        const corte = Z && Z.corte ? Z.corte : todayStr();
        const day = Math.max(1, parseD(corte).getDate()), dim = daysInMonth(corte.slice(0, 7)), left = Math.max(0, dim - day);
        const T = targetOf(st, adv, active), meta = sum(INFINIX_MODELS.map(m => int(T.porRef[m.key])));
        const venta = int(adv.total), esperado = day / dim;
        const cumpl = meta > 0 ? venta / meta : null, indice = cumpl == null ? null : cumpl / esperado;
        const proy = Math.round(venta / day * dim), proyCumpl = meta > 0 ? proy / meta : null;
        const brechaUds = Math.max(0, meta - venta), brechaEsperada = Math.max(0, Math.round(meta * esperado) - venta);
        const ritmoReq = meta > 0 ? +(brechaUds / Math.max(1, left)).toFixed(1) : 0;
        // Comisión (plan noviembre): ROI base abre incentivos; KPI $400.000 / $700.000 por unidades del asesor
        const KP = kpiPlan(st), vAdv = adv.ventas || {}, fac = dim / day;
        const vProy = Object.fromEntries(INFINIX_MODELS.map(m => [m.key, Math.round(int(vAdv[m.key]) * fac)]));
        const vMeta = Object.fromEntries(INFINIX_MODELS.map(m => [m.key, Math.max(int(vAdv[m.key]), int(T.porRef[m.key]))]));
        const comHoy = incentivo(vAdv, KP), comProy = incentivo(vProy, KP), comMeta = incentivo(vMeta, KP);
        const porDia = u => left > 0 ? +(Math.max(0, u - venta) / left).toFixed(1) : Math.max(0, u - venta);
        const comision = { plan: KP, hoy: comHoy, proy: comProy, meta: comMeta, ritmoBase: porDia(KP.base), ritmo400: porDia(KP.k400), ritmo700: porDia(KP.k700) };
        const vu = 0;

        // --- Inventario del PDV frente a su sell-out, modelo por modelo
        const foco = focoSet(st), inv = st.inventario || {};
        const modelos = INFINIX_MODELS.map(m => {
            const v = int(adv.ventas && adv.ventas[m.key]), i = int(inv[m.key]), isF = foco.has(m.key);
            let estado, label;
            if (i <= 0) { estado = 'sinstock'; label = v > 0 ? 'Sin stock · reponer' : 'Sin stock'; }
            else if (i >= invMin && v === 0) { estado = 'rezago'; label = isF ? 'Rezago crítico' : 'Rezago · impulsar'; }
            else if (i >= invMin && isF && v <= ventaBaja) { estado = 'impulsar'; label = 'Rezago · impulsar'; }
            else if (v > 0) { estado = 'rotando'; label = 'Rotando'; }
            else { estado = 'bajo'; label = 'Stock bajo'; }
            return { key: m.key, name: m.name, foco: isF, meta: int(T.porRef[m.key]), vendidas: v, inv: i, estado, label };
        });
        const rezagos = modelos.filter(m => m.foco && (m.estado === 'rezago' || m.estado === 'impulsar')).sort((a, b) => b.inv - a.inv);
        const rezagosOtros = modelos.filter(m => !m.foco && m.estado === 'rezago' && m.inv > invMin).sort((a, b) => b.inv - a.inv);
        const stockFoco = sum(rezagos.map(m => m.inv));
        const estrella = modelos.filter(m => m.vendidas > 0).sort((a, b) => b.vendidas - a.vendidas)[0] || null;
        const oportunidad = rezagos[0] || rezagosOtros[0] || null;

        // --- Evaluación
        const ev = typeof Evals !== 'undefined' ? Evals.forAdvisor(st.id, adv.nombre, adv.cedula) : null;
        // Semanas de evaluación del mes: realizada (con nota), no realizada (la data ya se cargó y no aparece) o sin data aún
        const evSemanas = (typeof evalWeeksOfMonth === 'function' ? evalWeeksOfMonth(corte.slice(0, 7)) : []).map(n => {
            const w = 'W' + n, x = ev && ev.porSemana && ev.porSemana[w];
            if (x) return { w, estado: 'ok', nota: x.nota, intentos: x.intentos };
            if (ev && (ev.cargadas || []).includes(w)) return { w, estado: 'no', nota: null };
            return { w, estado: 'sin', nota: null };
        });

        // --- Semáforo, nivel y puntaje de prioridad (0 = sin problema · 100 = máxima urgencia)
        const atras = indice != null && indice < ritmoMin;
        const evBajo = !!(ev && ev.bajo);
        let sem, nivel;
        if (atras) { sem = 'rojo'; nivel = (indice < 0.6 || rezagos.length || evBajo) ? 'critica' : 'alta'; }
        else if ((indice != null && indice < 1) || rezagos.length || evBajo) { sem = 'amarillo'; nivel = 'media'; }
        else if (indice == null) { sem = 'gris'; nivel = 'sin_meta'; }
        else { sem = 'verde'; nivel = 'baja'; }
        let score = 0;
        if (indice != null) score += Math.max(0, 1 - indice) * 55;
        score += Math.min(30, stockFoco * 6 + (rezagos.length > 1 ? 3 : 0));
        if (evBajo) score += Math.min(15, (notaMin - ev.nota) / notaMin * 40 + 5); else if (ev && ev.pendiente) score += 4;
        score = Math.round(Math.min(100, score));

        // --- Prescripción: ¿qué trabajar con el asesor?
        const razones = [], acciones = [], impactos = [], temas = [];
        if (atras) {
            razones.push(`Va a ${pc(cumpl)} de su meta cuando debería ir en ${pc(esperado)} (${Math.round(indice * 100)}% del ritmo esperado)`);
            acciones.push({ tipo: 'cierre', texto: `Cierre comercial y manejo de objeciones: acompañarlo en 3 ventas en sala. Meta ${meta} uds, lleva ${venta} (${pc(cumpl)}) frente a ${pc(esperado)} esperado; necesita ${ritmoReq} uds/día para cerrar.`, corto: `Cierre comercial y objeciones: acompañar 3 ventas (lleva ${venta} de ${meta})` });
            impactos.push(`Llevar el cumplimiento de ${pc(cumpl)} al ${pc(esperado)} esperado a la fecha`);
        } else if (indice != null && indice < 1) razones.push(`Va a ${pc(cumpl)} de su meta frente a ${pc(esperado)} esperado: cuidar el ritmo`);
        rezagos.slice(0, 3).forEach(m => {
            razones.push(`${m.name}: ${unidades(m.inv)} en el PDV y ${m.vendidas ? 'solo ' + unidades(m.vendidas) + ' vendidas' : 'ninguna vendida'}`);
            acciones.push({ tipo: 'producto', ref: m.key, texto: `Refuerzo técnico y pitch de ${m.name}: ${unidades(m.inv)} sin mover en el PDV (vendió ${m.vendidas}). Pitch en 3 pasos (necesidad → beneficio clave de la referencia → cierre con accesorio o financiación), demo encendida y ubicación visible en vitrina.`, corto: `Pitch y demo ${m.name}: ${unidades(m.inv)} sin mover (vendió ${m.vendidas})` });
            temas.push(`Pitch ${m.name} (${unidades(m.inv)} sin mover)`);
        });
        if (stockFoco > 0) impactos.push(`Evacuar ${unidades(stockFoco)} de ${rezagos.slice(0, 3).map(m => m.name).join(', ')} en 7 días`);
        if (!rezagos.length && rezagosOtros.length) { const m = rezagosOtros[0]; razones.push(`${m.name} (no foco): ${unidades(m.inv)} en el PDV sin venta del asesor`); acciones.push({ tipo: 'producto', ref: m.key, texto: `Impulsar ${m.name}: ${unidades(m.inv)} en el PDV sin venta del asesor; incluirla en la oferta de comparación.`, corto: `Impulsar ${m.name}: ${unidades(m.inv)} sin venta` }); temas.push(`Impulsar ${m.name}`); }
        if (ev && ev.bajo) {
            razones.push(`Nota de evaluación ${ev.nota}/100 (${ev.semana}), por debajo de ${notaMin}`);
            (ev.temasDebiles.length ? ev.temasDebiles : [{ tema: `Evaluación ${ev.semana}`, nota: ev.nota }]).slice(0, 2).forEach(x => {
                acciones.push({ tipo: 'eval', texto: `Re-entrenamiento en "${x.tema}" (nota ${x.nota}/100, mínimo ${notaMin}); repetir la evaluación esta semana.`, corto: `Re-entrenar "${x.tema}" (nota ${x.nota})` });
                temas.push(`Re-entrenar: ${x.tema} (${x.nota})`);
            });
            impactos.push(`Nota ≥ ${notaMin} en la próxima evaluación`);
        } else if (ev && ev.pendiente) {
            razones.push(`Evaluación ${ev.semanaActual || ev.semana} pendiente`);
            acciones.push({ tipo: 'eval', texto: `Evaluación ${ev.semanaActual || ev.semana} pendiente: presentarla durante la visita y calificarla con el asesor.`, corto: `Presentar evaluación ${ev.semanaActual || ev.semana} (pendiente)` });
            temas.push(`Evaluación ${ev.semanaActual || ev.semana} pendiente`);
        }
        if (!acciones.length) acciones.push({ tipo: 'fortaleza', texto: estrella ? `Mantener el ritmo y usar su venta de ${estrella.name} (${estrella.vendidas} uds) como ejemplo para el equipo.` : 'Mantener el ritmo y cuidar el inventario.', corto: estrella ? `Replicar su venta de ${estrella.name}` : 'Sostener el ritmo y cuidar inventario' });
        // Compromiso del día: evacuar el stock foco estancado en ~7 días; si no hay stock estancado, el ritmo que le falta
        let compromisoDia = 0, compromisoTxt = '';
        if (stockFoco > 0) { compromisoDia = Math.min(3, Math.max(1, Math.ceil(stockFoco / 7))); compromisoTxt = `Evacuar ${unidades(stockFoco)} de ${rezagos.slice(0, 3).map(m => m.name).join(', ')} en 7 días (≈ ${compromisoDia}/día)`; }
        else if (atras) { compromisoDia = Math.min(3, Math.max(1, Math.ceil(ritmoReq))); compromisoTxt = `Vender ${compromisoDia} ud(s) hoy: necesita ${ritmoReq} uds/día para cerrar su meta`; }
        // Oportunidades de mejora en segunda persona (tarjeta que se le envía al asesor)
        const mejoras = [];
        if (meta > 0 && brechaUds > 0) mejoras.push({ i: '🚀', t: `Para llegar a tu meta de ${meta} te faltan <b>${unidades(brechaUds)}</b>: vende <b>${ritmoReq} por día</b> en los ${left} días que quedan${venta < Math.round(meta * esperado) ? ` (a hoy deberías llevar ${Math.round(meta * esperado)})` : ''}.` });
        if (comHoy.next && comHoy.next.premio) mejoras.push({ i: '💰', t: `Te faltan <b>${unidades(comHoy.falta)}</b> para el ${comHoy.next.label}: son <b>${porDia(comHoy.next.meta)} por día</b>.` });
        else if (comHoy.next) mejoras.push({ i: '🔓', t: `Te faltan <b>${unidades(comHoy.falta)}</b> para abrir la llave (ROI 1: ${KP.base} uds). Desde ahí cobras el speed de cada modelo que vendas.` });
        (rezagos.length ? rezagos : rezagosOtros).slice(0, 2).forEach(m => mejoras.push({ i: '🎯', t: `Tienes <b>${unidades(m.inv)} de ${m.name}</b> en tienda y ${m.vendidas ? 'solo vendiste ' + m.vendidas : 'aún no vendes ninguno'}. ${MODEL_TIPS[m.key] || ''}` }));
        if (ev && ev.temasDebiles && ev.temasDebiles.length && ev.bajo) mejoras.push({ i: '📚', t: `Repasa <b>${ev.temasDebiles.slice(0, 2).map(x => `${x.tema} (${x.nota})`).join(' y ')}</b>: la nota mínima es ${notaMin}.` });
        const noHechas = evSemanas.filter(x => x.estado === 'no').map(x => x.w);
        if (noHechas.length) mejoras.push({ i: '📝', t: `Te falta presentar la evaluación <b>${noHechas.join(', ')}</b>. Hazla hoy: cuenta para tu seguimiento.` });
        if (estrella) mejoras.push({ i: '⭐', t: `Tu fuerte es <b>${estrella.name}</b> (${unidades(estrella.vendidas)}): usa ese mismo argumento con las referencias que tienes quietas.` });
        const focoLineas = acciones.map(a => a.texto);
        const focoCorto = acciones.slice(0, 2).map(a => a.corto).join(' + ');

        return {
            id: `${st.id}|${slug(adv.nombre)}`, storeId: st.id, nombre: adv.nombre, cedula: adv.cedula || '',
            pdv: { tienda: st.tienda, ciudad: st.ciudad || '', cadena: chainGroup(st).label, zona: st.zona || '', regional: zoneRegional(st.zona) || '', logoKey: normLogoKey(st.logoKey) },
            corte, day, dim, left, sinData: !Z, metaSrc: T.src,
            pacing: { meta, venta, cumpl, esperado, indice, proy, proyCumpl, brechaUds, brechaEsperada, ritmoReq, ritmoActual: +(venta / day).toFixed(1), deberiaLlevar: Math.round(meta * esperado), comisionJuego: null },
            comision, evSemanas, mejoras, otras: adv.otras || [], apoyo: (st.asesoresApoyo || []).some(n => adv.alias.some(a => sameAdvisor({ nombre: n }, { nombre: a }))),
            inventario: { total: sum(modelos.map(m => m.inv)), modelos, estrella, oportunidad, rezagos, stockFoco },
            evaluacion: ev,
            prescripcion: { nivel, semaforo: sem, score, razones, acciones, impactos, temas, compromisoDia, compromisoTxt, focoLineas, focoCorto }
        };
    }
    // Diagnóstico de todos los asesores activos de una tienda
    function forStore(st) {
        const active = activeAdvisors(st);
        return active.map(a => diagnose(st, a, active));
    }
    const byId = id => { const st = storeById(String(id).split('|')[0]); return st ? forStore(st).find(d => d.id === id) || null : null; };
    // Radar: asesores de varias tiendas, del peor al mejor desempeño
    function scan(stores) {
        const all = stores.flatMap(forStore);
        const list = all.filter(d => !d.sinData).sort((a, b) => b.prescripcion.score - a.prescripcion.score || (a.pacing.cumpl ?? 9) - (b.pacing.cumpl ?? 9));
        return { list, sinData: all.length - list.length };
    }
    // Lo que el Plan de trabajo arrastra de un asesor (compacto y estable para guardarlo y exportarlo)
    function planEntry(D) {
        const P = D.prescripcion, ev = D.evaluacion;
        return {
            id: D.id, nombre: D.nombre, cedula: D.cedula, corte: D.corte, day: D.day, dim: D.dim,
            meta: D.pacing.meta, venta: D.pacing.venta, cumpl: D.pacing.cumpl == null ? null : +D.pacing.cumpl.toFixed(3), esperado: +D.pacing.esperado.toFixed(3), indice: D.pacing.indice == null ? null : +D.pacing.indice.toFixed(3),
            nivel: P.nivel, semaforo: P.semaforo, score: P.score,
            rezagos: D.inventario.rezagos.map(m => ({ key: m.key, name: m.name, inv: m.inv, vendidas: m.vendidas })), stockFoco: D.inventario.stockFoco,
            nota: ev ? ev.nota : null, semanaEval: ev ? ev.semana : '', temasDebiles: ev ? ev.temasDebiles.map(x => x.tema) : [],
            temas: P.temas, compromisoDia: P.compromisoDia, compromisoTxt: P.compromisoTxt, focoCorto: P.focoCorto
        };
    }
    // Textos para los campos del plan (acciones e impactos de máx. 3 líneas)
    const planFill = D => ({ acciones: D.prescripcion.acciones.map(a => a.corto).slice(0, 3), impactos: D.prescripcion.impactos.slice(0, 3), compromiso: D.prescripcion.compromisoDia, foco: `${D.nombre.split(' ').slice(0, 2).join(' ')} · ${D.prescripcion.acciones.slice(0, 3).map(a => a.corto.split(':')[0].replace(/^Re-entrenar "?/, 'Re-entrenar ').replace(/"$/, '')).join(' + ')}` });

    const SEM = { rojo: { color: '#DC2626', soft: '#FEE2E2', label: 'Crítico', cls: 'bad' }, amarillo: { color: '#D97706', soft: '#FEF3C7', label: 'En riesgo', cls: 'warn' }, verde: { color: '#16A34A', soft: '#DCFCE7', label: 'Al día', cls: 'ok' }, gris: { color: '#64748B', soft: '#E2E8F0', label: 'Sin meta', cls: '' } };
    const NIVEL = { critica: 'Prioridad crítica', alta: 'Prioridad alta', media: 'Prioridad media', baja: 'Sin alerta', sin_meta: 'Sin meta asignada' };
    const ESTADO = { rotando: ['ok', 'Rotando'], rezago: ['bad', null], impulsar: ['warn', null], sinstock: ['', null], bajo: ['', null] };
    return { diagnose, forStore, byId, scan, planEntry, planFill, SEM, NIVEL, ESTADO, pc };
})();

registerModule('calc', (() => {
    let asesor = '', units = {}, targets = {}, src = '', closures = [], saveT = null, accU = {};

    const plan = () => State.comisiones || DEFAULT_COMISIONES;
    const valor = k => int((plan().valores || {})[k]);
    // Reparte el target de la tienda entre los asesores (el resto va a los primeros)
    function splitTarget(st, n, i) {
        const out = {};
        INFINIX_MODELS.forEach(m => { const t = int(st.metas && st.metas[m.key]); out[m.key] = n > 0 ? Math.floor(t / n) + (i < t % n ? 1 : 0) : t; });
        return out;
    }
    // Liquidación: abre con la apertura; cada unidad paga el valor de su referencia; bonos por KPI de unidades
    // Plan noviembre: el ROI base abre incentivos; KPI $400.000 y KPI $700.000 por unidades del mes (no acumulables)
    function calc(total) {
        const P = kpiPlan(currentStore()), I = incentivo(units, P, accU), V = planValores();
        const porRef = INFINIX_MODELS.map(m => ({ ...m, u: int(units[m.key]), v: V[m.key] || 0, sub: int(units[m.key]) * (V[m.key] || 0) }));
        return { P, k: I, I, ap: P.base, abierto: I.abierto, faltanAp: I.faltaBase, ganado: I.total, next: I.next ? { desde: I.next.meta, bono: I.next.premio, label: I.next.label } : null, porRef, base: I.abierto ? I.speeds : 0, bono: I.kpi, prom: total > 0 ? Math.round(speedsOf(units) / total) : 0, siAbre: I.speedsBloq };
    }

    async function render(view) {
        const st = currentStore();
        if (!st) { view.innerHTML = '<div class="card">Sesión de tienda no válida.</div>'; return; }
        try { await ZoneData.load(st.zona, todayStr().slice(0, 7)); } catch (e) { /* sin data */ }
        if (typeof Evals !== 'undefined') await Evals.ensureLoaded([st.zona]);
        // Asesores: los configurados en la tienda + los que aparecen en la data de zona con otro nombre
        // Solo asesores activos: los retirados siguen en la venta de la tienda pero ya no se reparten target
        const as = activeAdvisors(st).map(a => a.nombre);
        asesor = as[0] || '';
        view.innerHTML = `
        <section class="card">
            <div class="row between wrap">
                <div class="row">${storeLogo(st)}<div><h2 class="h2">Calculadora comercial Infinix</h2><p class="mute">${esc(st.tienda)} · ¿cuánto llevo y cuánto gano?</p></div></div>
                <span class="badge" title="Target del PDV">Target PDV ${storeMetaMes(st)} uds · ${as.length} asesor(es)</span>
            </div>
            <label class="lbl">Asesor</label>
            <div class="chips" id="cc-as">${as.map((a, i) => `<label class="chip"><input type="radio" name="cc-as" value="${esc(a)}" ${i === 0 ? 'checked' : ''}><span>${esc(a)}${(st.asesores || []).includes(a) ? '' : ' <small class="mute">(data)</small>'}</span></label>`).join('') || '<span class="mute">Configura los asesores en ⚙️ Ajustes de tienda.</span>'}</div>
            <p class="hint" id="cc-src"></p>
            <div class="row end"><button class="btn btn-ghost" id="cc-ficha">📄 Ver ficha del asesor</button></div>
        </section>
        <section class="kpi-row" id="cc-kpis"></section>
        <section class="card">
            <div class="row between wrap"><h3 class="h3">Mi target y mis unidades del mes</h3><span class="badge" id="cc-tot">0 uds</span></div>
            <div class="tbl-scroll"><table class="tbl compact"><thead><tr><th>Referencia</th><th>Mi target</th><th>Mis unidades</th><th>% target</th><th>Speed/ud</th><th>Ganado</th></tr></thead><tbody>
                ${INFINIX_MODELS.map(m => `<tr><td><b>${esc(m.name)}</b></td>
                    <td><input class="input num" type="number" inputmode="numeric" min="0" id="cc-t-${m.key}" value="0" title="Target del asesor para esta referencia (se puede ajustar)"></td>
                    <td><div class="stp"><button type="button" data-d="-1">−</button><input class="input num" type="number" inputmode="numeric" min="0" id="cc-u-${m.key}" value="0"><button type="button" data-d="1">+</button></div></td>
                    <td class="c" id="cc-p-${m.key}">—</td><td class="c">${money(planValores()[m.key] || 0)}</td><td class="c" id="cc-g-${m.key}">—</td></tr>`).join('')}
                <tr><td colspan="6" class="l"><b>Accesorios</b> <small class="mute">· pagan desde la primera unidad y no suman al ROI</small></td></tr>
                ${INFINIX_ACCESSORIES.map(a => `<tr><td><b>${esc(a.name)}</b></td><td></td><td><div class="stp"><button type="button" data-d="-1">−</button><input class="input num" type="number" inputmode="numeric" min="0" id="cc-a-${a.key}" value="0"><button type="button" data-d="1">+</button></div></td><td></td><td class="c">${money(planValoresAcc()[a.key] || 0)}</td><td class="c" id="cc-ag-${a.key}">—</td></tr>`).join('')}
            </tbody></table></div>
            <p class="hint">El target sale del target de la tienda repartido entre los asesores; puedes ajustarlo y queda guardado. Las unidades se precargan solas; ajústalas si tienes ventas que aún no están en la data.</p>
        </section>
        <section class="card" id="cc-scheme"></section>
        ${actionBarHTML()}`;

        view.addEventListener('change', e => { if (e.target.name === 'cc-as') { asesor = e.target.value; prefill(); } });
        view.addEventListener('click', e => { const b = e.target.closest('.stp button'); if (!b) return; const i = $('input', b.parentElement); i.value = Math.max(0, int(i.value) + int(b.dataset.d)); i.dispatchEvent(new Event('input', { bubbles: true })); });
        view.addEventListener('input', e => {
            const id = e.target.id || '';
            if (id.startsWith('cc-u-')) { units[id.slice(5)] = int(e.target.value); src = 'manual'; paint(); }
            if (id.startsWith('cc-a-')) { accU[id.slice(5)] = int(e.target.value); paint(); }
            if (id.startsWith('cc-t-')) { targets[id.slice(5)] = int(e.target.value); paint(); saveTargets(); }
        });
        $('#cc-ficha').onclick = () => { if (!asesor) return toast('Elige el asesor.', 'warn'); openAdvisorFicha(`${st.id}|${slug(asesor)}`); };
        ReportActions.bind(view, {
            title: 'Calculadora comercial Infinix',
            validate: () => asesor ? null : 'Elige el asesor.',
            filename: () => `Calculadora_${slug(asesor)}_${todayStr()}.png`,
            build: stage => buildCalcCanvas(stage, st, asesor, units, targets, calc(total()), src)
        });
        closures = await fetchStoreClosures(st.id, todayStr());
        if ($('#cc-kpis')) prefill();
    }
    const total = () => sum(INFINIX_MODELS.map(m => int(units[m.key])));
    const totalT = () => sum(INFINIX_MODELS.map(m => int(targets[m.key])));
    // Mismo asesor aunque el nombre venga distinto: igual, uno contiene al otro, o comparten nombre y apellido
    function sameName(a, b) {
        const A = slug(a), B = slug(b); if (!A || !B) return false;
        if (A === B || A.includes(B) || B.includes(A)) return true;
        const ta = A.split('_').filter(t => t.length > 2), tb = B.split('_').filter(t => t.length > 2);
        return ta.filter(t => tb.includes(t)).length >= 2;
    }
    // Target del asesor: el guardado a mano o el reparto automático del target de la tienda
    function loadTargets(st) {
        const saved = st.targetsAsesor && st.targetsAsesor[asesor];
        if (saved && Object.keys(saved).length) return { ...saved };
        const D = Advisor.byId(`${st.id}|${slug(asesor)}`);                 // meta individual del seguimiento repartida por referencia
        if (D && D.pacing.meta > 0) return Object.fromEntries(D.inventario.modelos.map(m => [m.key, m.meta]));
        const act = activeAdvisors(st).map(a => a.nombre), list = act.length ? act : [asesor];
        const i = Math.max(0, list.findIndex(a => sameName(a, asesor)));
        return splitTarget(st, list.length, i);
    }
    function saveTargets() {
        clearTimeout(saveT);
        saveT = setTimeout(async () => {
            const st = currentStore(); if (!st) return;
            st.targetsAsesor = { ...(st.targetsAsesor || {}), [asesor]: { ...targets } };
            await Data.set(COL.stores, st.id, { targetsAsesor: st.targetsAsesor, updatedAt: Date.now() }, true);
        }, 800);
    }

    // Prellenado: 1) data de zona por asesor · 2) cierres de la tienda (si es el único asesor) · 3) en cero
    function prefill() {
        const st = currentStore(); units = {}; src = '';
        targets = loadTargets(st);
        const Z = ZoneData.forStore(st.id);
        if (Z && Z.asesores) {
            const key = Object.keys(Z.asesores).find(k => sameName(k, asesor));
            if (key) { units = { ...Z.asesores[key].ventas }; src = `data de zona del ${Z.corte} (${esc(key)})`; }
        }
        if (!src) {
            const c = computeStore(st, closures, todayStr());
            if ((st.asesores || []).length === 1 && c.infMes > 0) { c.models.forEach(m => { units[m.key] = m.mes; }); src = `cierres diarios de la tienda (${c.cierresMes} cierres del mes)`; }
        }
        INFINIX_MODELS.forEach(m => { const i = $('#cc-u-' + m.key); if (i) i.value = int(units[m.key]); const t = $('#cc-t-' + m.key); if (t) t.value = int(targets[m.key]); });
        $('#cc-src').innerHTML = src ? `Unidades tomadas de <b>${src}</b>. Ajústalas si tienes ventas que aún no están en la data.` : 'No hay data de zona ni cierres de este asesor: escribe tus unidades.';
        paint();
    }

    function paint() {
        const t = total(), tt = totalT(), r = calc(t), P = plan();
        $('#cc-tot').textContent = `${t} uds · target ${tt}`;
        INFINIX_MODELS.forEach(m => { const p = $('#cc-p-' + m.key), g = $('#cc-g-' + m.key); const tg = int(targets[m.key]), u = int(units[m.key]); if (p) p.innerHTML = tg > 0 ? `<i class="pill ${semaforo(u / tg).cls}">${Math.round(u / tg * 100)}%</i>` : '—'; if (g) g.innerHTML = `<b style="color:${r.abierto ? '#047857' : '#94A3B8'}">${money(u * (planValores()[m.key] || 0))}</b>`; });
        INFINIX_ACCESSORIES.forEach(a => { const g = $('#cc-ag-' + a.key); if (g) g.innerHTML = `<b>${money(int(accU[a.key]) * (planValoresAcc()[a.key] || 0))}</b>`; });
        const K = r.I, P2 = r.P, left = Math.max(0, daysInMonth(todayStr().slice(0, 7)) - new Date().getDate() + 1);
        const perDay = n => left > 0 ? fmt1(Math.max(0, n - t) / left) : Math.max(0, n - t);
        const step = (lbl, meta, premio, ok) => `<div class="ac-step ${ok ? 'ok' : ''}"><i>${ok ? '✅' : '🔒'}</i><div><b>${lbl}</b><small>${meta} uds${premio ? ' · ' + money(premio) : ''}</small></div><em>${ok ? 'Logrado' : `Faltan <b>${meta - t}</b>`}</em></div>`;
        $('#cc-kpis').innerHTML = `
            <div class="kpi hl"><span>Unidades del mes</span><b>${t}</b><small>${tt > 0 ? `${Math.round(t / tt * 100)}% de mi target (${tt})` : 'sin target'}</small></div>
            <div class="kpi ${K.abierto ? '' : 'warn'}"><span>Llave de speeds (ROI 1 · ${P2.base} uds)</span><b>${K.abierto ? 'Abierta ✅' : `Faltan ${K.faltaBase}`}</b><small>${K.abierto ? 'Ya cobras el speed de cada modelo' : 'Desde ahí cobras el speed de cada modelo'}</small></div>
            <div class="kpi"><span>Llevas ganado</span><b>${money(K.total)}</b><small>speeds ${money(K.speeds)}${K.kpi ? ` + ROI ${money(K.kpi)}` : ''}${K.acc ? ` + accesorios ${money(K.acc)}` : ''}</small></div>
            <div class="kpi"><span>Siguiente premio</span><b>${K.next ? K.next.meta + ' uds' : '🏆'}</b><small>${K.next ? `Faltan ${K.falta} · ${esc(K.next.label)}` : 'Alcanzaste el ROI 3'}</small></div>`;
        $('#cc-scheme').innerHTML = `
            <h3 class="h3">Plan de incentivos · noviembre 2026</h3>
            <div class="ac-steps">${step('ROI 1 · Llave de speeds', P2.base, 0, K.nivel >= 1)}${step('ROI 2', P2.k400, P2.pay400, K.nivel >= 2)}${step('ROI 3', P2.k700, P2.pay700, K.nivel >= 3)}${tt > 0 ? step('100% de mi target', tt, 0, t >= tt) : ''}</div>
            ${planTerminosHTML()}`;
    }

    return { render };
})());

// ----------------------------------------------------------------------------
// LIENZO · CALCULADORA (1080 px, vertical)
// ----------------------------------------------------------------------------
function buildCalcCanvas(stage, st, asesor, units, targets, r, src) {
    const t = sum(INFINIX_MODELS.map(m => int(units[m.key]))), tt = sum(INFINIX_MODELS.map(m => int(targets[m.key]))), dash = '—';
    const prog = r.ap > 0 ? Math.min(1, t / r.ap) : 1;
    const cls = v => v == null ? '' : v >= 1 ? 'g' : v >= .7 ? 'a' : 'r';
    const el = document.createElement('div');
    el.className = 'rp rp-m3 rp-calc';
    el.innerHTML = `
    <div class="rp-bar"></div>
    <header class="rp-head">
        <img class="rp-logo" src="${LOGO_INFINIX}" alt="Infinix">
        <div class="rp-head-mid">
            <div class="rp-kicker">CALCULADORA COMERCIAL</div>
            <div class="rp-title">${esc(asesor.toUpperCase())}</div>
            <div class="rp-sub">${esc(st.tienda)} · ${esc(st.ciudad || '')} · Zona ${esc(st.zona || dash)} · ${esc(fechaLarga(todayStr()))}</div>
        </div>
        <div class="rp-chain">${storeLogo(st)}</div>
    </header>
    <section class="rp-dash four">
        <div class="dcard hero"><div class="dcard-t">📦 UNIDADES DEL MES</div>
            <div class="center">${ringCardHTML('rc-u', 150, t, tt > 0 ? `de ${tt} target` : 'unidades')}</div>
            <div class="dfoot">${tt > 0 ? `<b>${Math.round(t / tt * 100)}%</b> de mi target` : 'Sin target asignado'}</div></div>
        <div class="dcard"><div class="dcard-t">LLAVE · ROI 1 · ${r.ap} UDS</div>
            <div class="center big-num" style="color:${r.abierto ? THEME.green : THEME.amber}">${r.abierto ? 'ABIERTA' : `FALTAN ${r.faltanAp}`}</div>
            <div class="dfoot">${r.abierto ? 'Cobras el speed de cada modelo' : 'Desde ahí cobras el speed de cada modelo'}</div></div>
        <div class="dcard"><div class="dcard-t">LLEVAS GANADO</div>
            <div class="center big-num" style="color:${THEME.green}">${money(r.ganado)}</div>
            <div class="dfoot">speeds ${money(r.base)}${r.bono ? ' + ROI ' + money(r.bono) : ''}${r.I.acc ? ' + acc. ' + money(r.I.acc) : ''}</div></div>
        <div class="dcard"><div class="dcard-t">SIGUIENTE PREMIO</div>
            <div class="center big-num">${r.next ? r.next.desde + ' uds' : '🏆'}</div>
            <div class="dfoot">${r.next ? `Faltan <b>${r.next.desde - t}</b> · ${esc(r.next.label)}` : 'Alcanzaste el KPI máximo'}</div></div>
    </section>
    <div class="rp-sec">MI TARGET, MIS UNIDADES Y MI COMISIÓN POR REFERENCIA</div>
    <div class="v-two">
        <div class="vbox">
            <table class="rp-tbl pano-tbl"><thead><tr><th class="l">REFERENCIA</th><th>TARGET</th><th>UDS</th><th>CUMPL.</th><th>SPEED/UD</th><th>GANADO</th></tr></thead><tbody>
            ${r.porRef.map(x => { const tg = int(targets[x.key]); return `<tr><td class="l">${esc(x.name)}</td><td>${tg || dash}</td><td><b>${x.u}</b></td><td class="c-tot ${tg > 0 ? cls(x.u / tg) : ''}">${tg > 0 ? Math.round(x.u / tg * 100) + '%' : dash}</td><td>${money(x.v)}</td><td><b>${r.abierto ? money(x.sub) : dash}</b></td></tr>`; }).join('')}
            <tr class="tot"><td class="l">TOTAL</td><td>${tt || dash}</td><td><b>${t}</b></td><td class="c-tot ${tt > 0 ? cls(t / tt) : ''}">${tt > 0 ? Math.round(t / tt * 100) + '%' : dash}</td><td></td><td><b>${money(r.base)}</b></td></tr>
            </tbody></table>
        </div>
        <div class="vbox good">
            <div class="vbox-t">Plan comisional</div>
            <div class="prog big"><div style="width:${Math.round(prog * 100)}%"></div></div>
            <p class="vtxt small">${t} de ${r.ap} uds para abrir incentivos</p>
            <table class="rp-tbl pano-tbl"><thead><tr><th class="l">CONCEPTO</th><th>CONDICIÓN</th><th>VALOR</th></tr></thead><tbody>
            <tr class="${r.abierto ? 'own' : ''}"><td class="l">ROI 1 · llave</td><td>≥ ${r.ap} uds</td><td>${r.abierto ? '✓ abiertos' : 'pendiente'}</td></tr>
            <tr class="${t >= r.P.k400 ? 'own' : ''}"><td class="l">ROI 2</td><td>≥ ${r.P.k400} uds</td><td><b>${money(r.P.pay400)}</b></td></tr>
            <tr class="${t >= r.P.k700 ? 'own' : ''}"><td class="l">ROI 3</td><td>≥ ${r.P.k700} uds</td><td><b>${money(r.P.pay700)}</b></td></tr>
            <tr class="tot"><td class="l">TOTAL GANADO</td><td></td><td><b>${money(r.ganado)}</b></td></tr>
            </tbody></table>
            <p class="vtxt small">${src && src !== 'manual' ? `Unidades tomadas de ${src}.` : 'Unidades ajustadas a mano por el asesor.'}</p>
        </div>
    </div>
    <footer class="rp-foot"><span>Plan de incentivos noviembre 2026: ROI 1 abre la llave de speeds; ROI 2 $400.000 o ROI 3 $700.000 (no acumulables). Solo unidades cargadas en DCR. Simulación informativa.</span><b>Infinix · Central de Operaciones</b></footer>
    <div class="rp-bar"></div>`;
    stage.appendChild(el);
    Charts.ring($('#rc-u', el), [prog, 1 - prog], [r.abierto ? THEME.green : THEME.amber, THEME.line], { cutout: '76%' });
    return el;
}

// ============================================================================
// FICHA EJECUTIVA INDIVIDUAL DEL ASESOR (pantalla + imagen PNG para WhatsApp)
// Mismo HTML en modal y en el lienzo de exportación (Exporter / ReportActions).
// ============================================================================
function advisorFichaHTML(D) {
    const P = D.prescripcion, S = Advisor.SEM[P.semaforo], pa = D.pacing, ev = D.evaluacion, I = D.inventario, pc = Advisor.pc, dash = '—';
    const fill = pa.cumpl == null ? 0 : Math.min(100, Math.round(pa.cumpl * 100)), mark = Math.min(100, Math.round(pa.esperado * 100));
    const evTxt = !ev ? ['—', 'sin evaluaciones cargadas'] : ev.nota == null ? ['Pendiente', `${esc(ev.semanaActual || ev.semana)} sin presentar`] : [`${ev.nota}<small>/100</small>`, `${esc(ev.semana)}${ev.pendiente ? ` · falta ${esc(ev.semanaActual)}` : ''}`];
    const evCls = ev && ev.bajo ? 'r' : ev && ev.nota != null ? 'g' : '';
    const cumCls = pa.cumpl == null ? '' : pa.indice < ((State.radar.ritmoMin || 85) / 100) ? 'r' : pa.indice < 1 ? 'a' : 'g';
    const pill = m => `<i class="fa-st ${m.estado}">${esc(m.label)}</i>`;
    return `
    <div class="fa-head">
        <div class="fa-who">
            <div class="fa-kick">FICHA EJECUTIVA DE ASESOR</div>
            <div class="fa-name fa-name-av">${typeof advisorAvatar === 'function' ? advisorAvatar(D.storeId, D.nombre, 64) : ''}<span>${esc(D.nombre)}</span></div>
            <div class="fa-sub">${chainLogo(D.pdv.logoKey, D.pdv.cadena, 'xs')} <b>${esc(D.pdv.tienda)}</b> · ${esc(D.pdv.cadena)} · Zona ${esc(D.pdv.zona || dash)}</div>
            <div class="fa-sub">Corte ${esc(fechaLarga(D.corte))} · día ${D.day} de ${D.dim}</div>
        </div>
        <div class="fa-sem" style="background:${S.soft};color:${S.color};border-color:${S.color}"><i style="background:${S.color}"></i><b>${S.label}</b><small>${esc(Advisor.NIVEL[P.nivel])}</small></div>
    </div>
    <div class="fa-kpis">
        <div class="fa-kpi"><span>Venta real vs. meta</span><b>${pa.venta}<small> / ${pa.meta || dash}</small></b><em>${pa.meta ? `faltan ${pa.brechaUds} uds` : 'sin meta asignada'}</em></div>
        <div class="fa-kpi"><span>% Cumplimiento</span><b class="${cumCls}">${pc(pa.cumpl)}</b><em>esperado a la fecha ${pc(pa.esperado)}</em></div>
        <div class="fa-kpi"><span>Proyección de cierre</span><b>${pa.proy}<small> uds</small></b><em>${pa.proyCumpl == null ? 'sin meta' : pc(pa.proyCumpl) + ' de la meta'}</em></div>
        <div class="fa-kpi"><span>Nota de evaluación</span><b class="${evCls}">${evTxt[0]}</b><em>${evTxt[1]}</em></div>
    </div>
    <div class="fa-pace">
        <div class="fa-bar"><div class="fa-fill ${cumCls}" style="width:${fill}%"></div>${pa.meta ? `<div class="fa-mark" style="left:${mark}%"><b>esperado ${pc(pa.esperado)}</b></div>` : ''}</div>
        <div class="fa-pace-t">Ritmo: lleva <b>${pa.ritmoActual}</b> uds/día${pa.meta ? ` y necesita <b>${pa.ritmoReq}</b>` : ''}${pa.meta ? ` · brecha vs. ritmo esperado <b>${pa.brechaEsperada} uds</b>` : ''}${D.comision && D.comision.hoy.next ? ` · le faltan <b>${D.comision.hoy.falta}</b> uds para ${esc(D.comision.hoy.next.label)}` : ''}</div>
    </div>
    <div class="fa-sec">📦 MODELO POR MODELO EN SU PDV</div>
    <table class="fa-tbl"><thead><tr><th class="l">Referencia</th><th>Vendidas</th><th>Inventario en PDV</th><th class="l">Estado</th></tr></thead><tbody>
        ${I.modelos.map(m => `<tr class="${m.estado}"><td class="l"><b>${esc(m.name)}</b>${m.foco ? ' <i class="fa-foco">★ foco</i>' : ''}</td><td><b>${m.vendidas}</b>${m.meta ? `<small> de ${m.meta}</small>` : ''}</td><td><b>${m.inv}</b></td><td class="l">${pill(m)}</td></tr>`).join('')}
    </tbody></table>
    <div class="fa-chips">
        <div class="fa-chip good"><span>⭐ Producto estrella</span><b>${I.estrella ? `${esc(I.estrella.name)} · ${I.estrella.vendidas} uds` : 'Sin ventas aún'}</b></div>
        <div class="fa-chip ${I.oportunidad ? 'warn' : ''}"><span>🎯 Mayor oportunidad</span><b>${I.oportunidad ? `${esc(I.oportunidad.name)} · ${I.oportunidad.inv} uds en PDV, vendió ${I.oportunidad.vendidas}` : 'Sin rezago en su PDV'}</b></div>
        <div class="fa-chip"><span>Stock foco sin rotar</span><b>${I.stockFoco} uds</b></div>
    </div>
    <div class="fa-focus">
        <div class="fa-focus-t">🎯 FOCO DE REFUERZO EN VISITA</div>
        <ol>${P.focoLineas.map(l => `<li>${esc(l)}</li>`).join('')}</ol>
        ${P.compromisoTxt ? `<div class="fa-comp">Compromiso sugerido: <b>${esc(P.compromisoTxt)}</b></div>` : ''}
        ${P.razones.length ? `<div class="fa-why">Por qué: ${P.razones.map(esc).join(' · ')}.</div>` : ''}
    </div>`;
}

function buildAdvisorCanvas(stage, D, autor) {
    const R = State.radar || DEFAULT_RADAR;
    const el = document.createElement('div');
    el.className = 'rp fa fa-img';
    el.innerHTML = `<div class="rp-bar"></div><div class="fa-pad">${advisorFichaHTML(D)}</div>
        <footer class="rp-foot"><span>Ritmo esperado = días transcurridos ÷ días del mes · Rezago = referencia con ≥ ${int(R.invMin)} uds en el PDV sin venta del asesor · Nota mínima ${int(R.notaMin)}/100${autor && autor.nombre ? ` · Elaborado por ${esc(autor.nombre)}` : ''}</span><b>Infinix · Central de Operaciones</b></footer>
        <div class="rp-bar"></div>`;
    stage.appendChild(el);
    return el;
}

// Términos y condiciones del plan (desplegable)
function planTerminosHTML(open) {
    const V = planValores(), A = planValoresAcc();
    return `<details class="acc plan-tc" ${open ? 'open' : ''}><summary><span>📜 Incentivos por modelo y términos del plan</span></summary>
        <div class="plan-speeds">${INFINIX_MODELS.filter(m => V[m.key]).map(m => `<div><span>${esc(m.name)}</span><b>${money(V[m.key])}</b></div>`).join('')}${INFINIX_ACCESSORIES.map(a => `<div class="acc-i"><span>${esc(a.name)}</span><b>${money(A[a.key])}</b></div>`).join('')}</div>
        <ul class="plan-terms">${PLAN_TERMINOS.map(([k, v]) => `<li><b>${esc(k)}:</b> ${esc(v)}</li>`).join('')}</ul></details>`;
}

// ============================================================================
// TARJETA PARA EL ASESOR (lo que él necesita para enfocarse: venta, meta, proyección,
// comisión, evaluaciones, referencias y oportunidades de mejora). Va en segunda persona.
// ============================================================================
function advisorCardHTML(D, uid) {
    const pa = D.pacing, I = D.inventario, C = D.comision, pc = Advisor.pc, dash = '—', ev = D.evaluacion;
    const fill = pa.cumpl == null ? 0 : Math.min(100, Math.round(pa.cumpl * 100)), mark = Math.min(100, Math.round(pa.esperado * 100));
    const cumCls = pa.cumpl == null ? '' : pa.indice < ((State.radar.ritmoMin || 85) / 100) ? 'r' : pa.indice < 1 ? 'a' : 'g';
    const W = D.evSemanas || [], hechas = W.filter(x => x.estado === 'ok').length, noH = W.filter(x => x.estado === 'no').length, sinD = W.filter(x => x.estado === 'sin').length;
    const prom = ev && ev.promedio != null ? ev.promedio : null;
    const mes = MESES[parseD(D.corte).getMonth()];
    // Sin dinero en la ficha: solo cuántas unidades faltan para cada llave (lo ganado se ve únicamente en la Calculadora)
    const step = (lbl, meta, ok) => `<div class="ac-step ${ok ? 'ok' : ''}"><i>${ok ? '✅' : '🔒'}</i><div><b>${lbl}</b><small>${meta} uds</small></div><em>${ok ? 'Logrado' : `Faltan <b>${Math.max(0, meta - pa.venta)}</b>`}</em></div>`;
    const evChip = x => x.estado === 'ok' ? `<div class="ac-w ${x.nota != null && x.nota < (State.radar.notaMin || 80) ? 'low' : 'ok'}"><b>${x.w}</b><span>${x.nota == null ? 'Realizada' : x.nota}</span><small>${x.nota == null ? '' : x.nota >= (State.radar.notaMin || 80) ? 'Aprobada' : 'Por mejorar'}</small></div>`
        : x.estado === 'no' ? `<div class="ac-w no"><b>${x.w}</b><span>✗</span><small>No realizada</small></div>` : `<div class="ac-w"><b>${x.w}</b><span>⏳</span><small>Sin calificar</small></div>`;
    const estado = m => m.estado === 'rotando' ? '<i class="fa-st rotando">Vendiendo</i>' : m.estado === 'rezago' || m.estado === 'impulsar' ? '<i class="fa-st rezago">¡Muévelo!</i>' : m.estado === 'sinstock' ? '<i class="fa-st">Sin stock</i>' : '<i class="fa-st">Poco stock</i>';
    const rows = I.modelos.filter(m => m.meta || m.vendidas || m.inv);
    return `
    <div class="fa-head">
        <div class="fa-who">
            <div class="fa-kick">TU ESTATUS DE ${esc(mes.toUpperCase())} · ASÍ VAS</div>
            <div class="fa-name fa-name-av">${typeof advisorAvatar === 'function' ? advisorAvatar(D.storeId, D.nombre, 64) : ''}<span>${esc(D.nombre)}</span></div>
            <div class="fa-sub">${chainLogo(D.pdv.logoKey, D.pdv.cadena, 'xs')} <b>${esc(D.pdv.tienda)}</b> · ${esc(D.pdv.cadena)} · Zona ${esc(D.pdv.zona || dash)}</div>
            <div class="fa-sub">Corte ${esc(fechaLarga(D.corte))} · día ${D.day} de ${D.dim} · quedan ${D.left} días</div>
        </div>
        <div class="ac-big ${cumCls}"><b>${pc(pa.cumpl)}</b><small>de tu meta</small></div>
    </div>
    <div class="fa-kpis">
        <div class="fa-kpi"><span>Venta vs. meta</span><b>${pa.venta}<small> / ${pa.meta || dash}</small></b><em>${pa.meta ? (pa.brechaUds ? `faltan ${pa.brechaUds} uds` : '¡meta cumplida! 🎉') : 'sin meta asignada'}${(D.otras || []).length ? ` · incluye ${sum(D.otras.map(o => o.total))} en ${esc(D.otras.map(o => o.tienda).join(', '))}` : ''}</em></div>
        <div class="fa-kpi"><span>A hoy deberías llevar</span><b>${pa.meta ? pa.deberiaLlevar : dash}<small> uds</small></b><em>${pa.meta ? (pa.venta >= pa.deberiaLlevar ? `vas ${pa.venta - pa.deberiaLlevar} arriba 💪` : `vas ${pa.deberiaLlevar - pa.venta} abajo`) : ''}</em></div>
        <div class="fa-kpi"><span>Proyección a cierre</span><b>${pa.proy}<small> uds</small></b><em>${pa.proyCumpl == null ? 'a este ritmo' : pc(pa.proyCumpl) + ' de tu meta'}</em></div>
        <div class="fa-kpi"><span>Evaluaciones</span><b class="${prom == null ? '' : prom >= (State.radar.notaMin || 80) ? 'g' : 'r'}">${prom == null ? dash : prom}<small>${prom == null ? '' : '/100'}</small></b><em>${hechas} de ${W.length} realizadas${noH ? ` · ${noH} pendiente${noH > 1 ? 's' : ''}` : ''}</em></div>
    </div>
    <div class="fa-pace">
        <div class="fa-bar"><div class="fa-fill ${cumCls}" style="width:${fill}%"></div>${pa.meta ? `<div class="fa-mark" style="left:${mark}%"><b>a hoy ${pc(pa.esperado)}</b></div>` : ''}</div>
        <div class="fa-pace-t">Ritmo: llevas <b>${pa.ritmoActual}</b> uds por día${pa.meta && pa.brechaUds ? ` y necesitas <b>${pa.ritmoReq}</b> por día para cumplir tu meta` : ''}.</div>
    </div>
    <div class="ac-two">
        <div class="ac-box">
            <div class="ac-t">🎯 TUS LLAVES Y TU META</div>
            <div class="ac-steps">
                ${step('ROI 1 · Llave de speeds', C.plan.base, C.hoy.nivel >= 1)}
                ${step('ROI 2', C.plan.k400, C.hoy.nivel >= 2)}
                ${step('ROI 3', C.plan.k700, C.hoy.nivel >= 3)}
                ${pa.meta ? step('100% de tu meta', pa.meta, pa.venta >= pa.meta) : ''}
            </div>
        </div>
        <div class="ac-box">
            <div class="ac-t">📝 TUS EVALUACIONES DEL MES</div>
            <div class="ac-ev">
                <div class="ring" style="width:118px;height:118px"><canvas id="${uid}" width="118" height="118"></canvas><div class="ring-c"><b>${hechas}/${W.length}</b><small>realizadas</small></div></div>
                <div class="ac-ws">${W.map(evChip).join('')}</div>
            </div>
            <div class="ac-leg"><span><i style="background:#16A34A"></i>Realizadas ${hechas}</span><span><i style="background:#DC2626"></i>No realizadas ${noH}</span><span><i style="background:#CBD5E1"></i>Sin calificar ${sinD}</span>${prom != null ? `<span>Promedio <b>${prom}</b></span>` : ''}</div>
        </div>
    </div>
    <div class="fa-sec">📦 TUS REFERENCIAS · LO QUE VENDES Y LO QUE HAY EN TU TIENDA</div>
    <table class="fa-tbl"><thead><tr><th class="l">Referencia</th><th>Tu meta</th><th>Vendidas</th><th>Cumpl.</th><th>En tienda</th><th class="l">Estado</th></tr></thead><tbody>
        ${rows.map(m => `<tr class="${m.estado}"><td class="l"><b>${esc(m.name)}</b>${m.foco ? ' <i class="fa-foco">★ foco</i>' : ''}</td><td>${m.meta || dash}</td><td><b>${m.vendidas}</b></td><td>${m.meta ? Math.round(m.vendidas / m.meta * 100) + '%' : dash}</td><td><b>${m.inv}</b></td><td class="l">${estado(m)}</td></tr>`).join('') || `<tr><td colspan="6">Aún no hay data de referencias.</td></tr>`}
    </tbody></table>
    <div class="fa-chips">
        <div class="fa-chip good"><span>⭐ Tu producto estrella</span><b>${I.estrella ? `${esc(I.estrella.name)} · ${I.estrella.vendidas} uds` : 'Aún sin ventas'}</b></div>
        <div class="fa-chip ${I.oportunidad ? 'warn' : ''}"><span>🎯 Tu mayor oportunidad</span><b>${I.oportunidad ? `${esc(I.oportunidad.name)} · ${I.oportunidad.inv} en tienda` : 'Todo está rotando'}</b></div>
        <div class="fa-chip"><span>Foco sin rotar</span><b>${I.stockFoco} uds</b></div>
    </div>
    <div class="fa-focus ac-tips">
        <div class="fa-focus-t">🚀 OPORTUNIDADES DE MEJORA</div>
        <ul>${(D.mejoras || []).slice(0, 5).map(x => `<li><i>${x.i}</i><span>${x.t}</span></li>`).join('') || '<li><i>🏆</i><span>¡Vas excelente! Sostén el ritmo y cuida el inventario.</span></li>'}</ul>
    </div>`;
}
// Panel de venta del asesor para el supervisor (sin evaluaciones ni comisión)
function advisorSalesHTML(D) {
    const pa = D.pacing, I = D.inventario, pc = Advisor.pc, dash = '—';
    const fill = pa.cumpl == null ? 0 : Math.min(100, Math.round(pa.cumpl * 100)), mark = Math.min(100, Math.round(pa.esperado * 100));
    const cumCls = pa.cumpl == null ? '' : pa.indice < ((State.radar.ritmoMin || 85) / 100) ? 'r' : pa.indice < 1 ? 'a' : 'g';
    return `<div class="fa-sub">${chainLogo(D.pdv.logoKey, D.pdv.cadena, 'xs')} <b>${esc(D.pdv.tienda)}</b> · ${esc(D.pdv.cadena)} · corte ${esc(D.corte)} (día ${D.day} de ${D.dim})</div>
    <div class="fa-kpis">
        <div class="fa-kpi"><span>Venta vs. meta</span><b>${pa.venta}<small> / ${pa.meta || dash}</small></b><em>${pa.meta ? `faltan ${pa.brechaUds} uds` : 'sin meta'}</em></div>
        <div class="fa-kpi"><span>% Cumplimiento</span><b class="${cumCls}">${pc(pa.cumpl)}</b><em>a hoy debería ir en ${pc(pa.esperado)} (${pa.deberiaLlevar} uds)</em></div>
        <div class="fa-kpi"><span>Proyección</span><b>${pa.proy}<small> uds</small></b><em>${pa.proyCumpl == null ? '' : pc(pa.proyCumpl) + ' de la meta'}</em></div>
        <div class="fa-kpi"><span>Ritmo</span><b>${pa.ritmoActual}<small>/día</small></b><em>${pa.meta && pa.brechaUds ? `necesita ${pa.ritmoReq}/día` : ''}</em></div>
    </div>
    <div class="fa-pace"><div class="fa-bar"><div class="fa-fill ${cumCls}" style="width:${fill}%"></div>${pa.meta ? `<div class="fa-mark" style="left:${mark}%"><b>a hoy ${pc(pa.esperado)}</b></div>` : ''}</div></div>
    <table class="fa-tbl"><thead><tr><th class="l">Referencia</th><th>Meta</th><th>Vendidas</th><th>Cumpl.</th><th>Inventario</th></tr></thead><tbody>
        ${I.modelos.filter(m => m.meta || m.vendidas || m.inv).map(m => `<tr class="${m.estado}"><td class="l"><b>${esc(m.name)}</b></td><td>${m.meta || dash}</td><td><b>${m.vendidas}</b></td><td>${m.meta ? Math.round(m.vendidas / m.meta * 100) + '%' : dash}</td><td>${m.inv}</td></tr>`).join('')}
    </tbody></table>`;
}
const drawAdvisorRing = (root, D, uid) => { const c = $('#' + uid, root); if (!c) return; const W = D.evSemanas || []; Charts.ring(c, [W.filter(x => x.estado === 'ok').length, W.filter(x => x.estado === 'no').length, W.filter(x => x.estado === 'sin').length], ['#16A34A', '#DC2626', '#CBD5E1'], { cutout: '70%', gap: true, scope: root.closest('.modal') ? 'modal' : 'stage' }); };
function buildAdvisorCardCanvas(stage, D, autor) {
    const el = document.createElement('div');
    el.className = 'rp fa fa-img ac';
    el.innerHTML = `<div class="rp-bar"></div><div class="fa-pad">${advisorCardHTML(D, 'acr-img')}</div>
        <footer class="rp-foot"><span>ROI 1 abre la llave de speeds; ROI 2 y ROI 3 son los premios del plan (lo ganado se consulta en la Calculadora). Solo unidades cargadas en DCR con IMEI activo. Proyección de unidades = lo que llevas ÷ días transcurridos × días del mes.${autor && autor.nombre ? ` · Te acompaña: ${esc(autor.nombre)}` : ''}</span><b>Infinix · Central de Operaciones</b></footer>
        <div class="rp-bar"></div>`;
    stage.appendChild(el);
    drawAdvisorRing(el, D, 'acr-img');
    return el;
}

// Abre la ficha de un asesor (id = "storeId|slug-del-nombre") con los botones de imagen.
// Dos versiones: «Para el asesor» (su estatus) y «Para jefes» (diagnóstico y foco de la visita).
function openAdvisorFicha(id, modo) {
    const D = Advisor.byId(id);
    if (!D) { toast('No encontré el diagnóstico de ese asesor.', 'warn'); return; }
    const s = State.session, canPlan = s && s.type === 'staff' && ROLES[s.rol].modules.includes('m2');
    const salesOnly = s && s.rol === 'supervisor';
    let mode = modo || (s && s.type === 'store' ? 'asesor' : 'asesor');
    const m = openModal(`<div class="seg fa-mode" style="margin-bottom:10px" ${s && s.type === 'store' ? 'hidden' : ''}><button class="seg-btn" data-fmode="asesor">📲 Para el asesor</button><button class="seg-btn" data-fmode="jefes">🗂️ Para jefes (foco de visita)</button></div>
        <div class="fa fa-ui" id="fa-body"></div>
        <div class="actions fa-actions">
            <button class="btn btn-ghost" data-act="preview">👁️ Vista previa</button>
            <button class="btn btn-wa" data-act="share">📲 Compartir por WhatsApp</button>
            <button class="btn btn-primary" data-act="save">⬇️ Descargar imagen (PNG)</button>
            ${canPlan ? '<button class="btn btn-dark" data-plan="1">☀️ Enviar a Plan de trabajo</button>' : ''}
        </div>`, { wide: true });
    const paintMode = () => {
        Charts.destroyAll('modal');
        $$('[data-fmode]', m).forEach(b => b.classList.toggle('active', b.dataset.fmode === mode));
        const body = $('#fa-body', m);
        body.innerHTML = mode === 'asesor' ? advisorCardHTML(D, 'acr-ui') : advisorFichaHTML(D);
        body.classList.toggle('ac', mode === 'asesor');
        if (mode === 'asesor') drawAdvisorRing(body, D, 'acr-ui');
    };
    $$('[data-fmode]', m).forEach(b => b.onclick = () => { mode = b.dataset.fmode; paintMode(); });
    paintMode();
    ReportActions.bind(m, {
        title: `Estatus de ${D.nombre} · Central de Operaciones`,
        validate: () => null,
        filename: () => `${mode === 'asesor' ? 'Estatus' : 'Ficha'}_${slug(D.nombre)}_${D.corte}.png`,
        build: stage => mode === 'asesor' ? buildAdvisorCardCanvas(stage, D, s) : buildAdvisorCanvas(stage, D, s),
        persist: async () => {      // compartir o descargar también deja el registro del diagnóstico
            const rec = { id: `adv_${D.storeId}_${slug(D.nombre)}_${D.corte}`, tipo: 'asesor', storeId: D.storeId, asesor: D.nombre, tienda: D.pdv.tienda, zona: D.pdv.zona, corte: D.corte, month: D.corte.slice(0, 7), userId: s.userId || '', nombre: s.nombre || '', rol: s.rol || '', semaforo: D.prescripcion.semaforo, nivel: D.prescripcion.nivel, score: D.prescripcion.score, cumpl: D.pacing.cumpl, meta: D.pacing.meta, venta: D.pacing.venta, nota: D.evaluacion ? D.evaluacion.nota : null, stockFoco: D.inventario.stockFoco, foco: D.prescripcion.focoLineas, updatedAt: Date.now() };
            return Data.set(COL.zoneReports, rec.id, rec, false);
        }
    });
    const bp = $('[data-plan]', m);
    if (bp) bp.onclick = () => { closeModal(m); Modules.m2.prefill([{ storeId: D.storeId, asesores: [D.nombre] }]); navigate('m2'); };
}

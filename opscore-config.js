// ============================================================================
// INFINIX OPSCORE · CONFIGURACIÓN, CATÁLOGOS Y SEMILLAS
// Todo lo editable por negocio vive en este archivo.
// ============================================================================

const OPS_VERSION = '1.16.0';
const APP_NAME = 'Central de Operaciones';

// --- Firebase: proyecto propio de OpsCore -------------------------------------
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyCacebKrL0shmc1YLC2yM8MzVazhFrfepY",
    authDomain: "opscore-b1e22.firebaseapp.com",
    projectId: "opscore-b1e22",
    storageBucket: "opscore-b1e22.firebasestorage.app",
    messagingSenderId: "169413987655",
    appId: "1:169413987655:web:c72b791748cfba8f4cd062",
    measurementId: "G-YMPB47NLF0"
};

const COL = {
    stores: 'stores',
    zones: 'zones',
    staff: 'staff_users',
    closures: 'daily_closures',
    plans: 'work_plans',
    visits: 'visit_reports',
    config: 'opscore_config',
    zoneData: 'zone_data',             // última data plana cargada por zona y mes
    zoneReports: 'zone_reports',       // reportes de zona generados
    evalData: 'eval_data'              // evaluaciones semanales cargadas por zona y mes (formador)
};

// Datos de demostración: se cargan solos la primera vez que la base está vacía.
// Se pueden cargar o borrar desde Gestión › Configuración. Poner en false para producción.
const DEMO_AUTOLOAD = false;            // producción: sin datos de prueba
const DEMO_ENTRY = false;                // botones «Modo demostración» en la pantalla de ingreso (poner false en producción)
const DEMO_PASSWORD = 'Demo2026';
const DEMO_CLOSURE_ZONES = ['SANTANDER'];   // zonas con cierres diarios, planes y visitas de prueba (el resto solo queda configurado con la data real)

// Usuarios base (fijos, no son de demostración): uno genérico por cargo y el Administrador.
// Entran con código DCR + contraseña y pueden cambiarla en "Registrarme / Cambiar contraseña".
const INITIAL_STAFF_SEED = [
    { id: 'u_admin',       dcr: 'ADMIN',       rol: 'admin',       nombre: 'Administrador',        zona: 'NACIONAL',     pass: 'Admin2026*' },
    { id: 'u_supervisor',  dcr: 'SUPERVISOR',  rol: 'supervisor',  nombre: 'Supervisor Genérico',  zona: 'SANTANDER',    pass: 'Supervisor2026' },
    { id: 'u_formador',    dcr: 'FORMADOR',    rol: 'formador',    nombre: 'Formador Genérico',    zona: 'SANTANDER',    pass: 'Formador2026' },
    { id: 'u_coordinador', dcr: 'COORDINADOR', rol: 'coordinador', nombre: 'Coordinador Genérico', zona: 'SANTANDER', regional: 'SUROCCIDENTE', pass: 'Coordinador2026' },
    { id: 'u_gerente',     dcr: 'GERENTE',     rol: 'gerente',     nombre: 'Gerente Genérico',     zona: 'NACIONAL',     pass: 'Gerente2026' }
];          // contraseña de los usuarios de demostración

// --- Identidad visual del lienzo corporativo ---------------------------------
const THEME = {
    bg: '#FFFFFF', card: '#F8FAFC', line: '#E2E8F0', ink: '#0F172A', mute: '#64748B',
    green: '#00C853', green2: '#10B981', amber: '#F59E0B', red: '#DC2626', gray: '#CBD5E1'
};
const LOGO_INFINIX = LOGOS.infinix;        // ver opscore-assets.js

// --- Roles (RBAC) ------------------------------------------------------------
const ROLES = {
    asesor:      { label: 'Tienda (PDV)',  modules: ['m1', 'parcial', 'central', 'adm', 'calc', 'm5'] },
    supervisor:  { label: 'Supervisor',    modules: ['zona', 'ventas', 'm2', 'm3', 'm4', 'm5', 'datos', 'admin'] },      // sin evaluaciones
    formador:    { label: 'Formador',      modules: ['zona', 'ventas', 'evals', 'm2', 'm3', 'm4', 'm5', 'datos', 'admin'] },
    coordinador: { label: 'Coordinador',   modules: ['zona', 'ventas', 'm4', 'evals', 'm5', 'datos', 'admin'] },          // no hace plan ni visita: analiza y consulta reportes
    gerente:     { label: 'Gerente',       modules: ['m4', 'zona', 'ventas', 'm5', 'datos', 'admin'] },
    admin:       { label: 'Administrador', modules: ['zona', 'ventas', 'm2', 'm3', 'm4', 'evals', 'm5', 'datos', 'admin'] }
};
const STAFF_ROLES = ['supervisor', 'formador', 'coordinador', 'gerente', 'admin'];
const MODULE_LABELS = {
    m1: 'Cierre diario', m2: 'Plan de trabajo', m3: 'Visita PDV',
    m4: 'Central de reportes', m5: 'Simulador', admin: 'Gestión', datos: 'Cargar datos', ventas: 'Reportes de venta', zona: 'Análisis de zona', calc: 'Calculadora', evals: 'Evaluaciones', central: 'Mi central', adm: 'Cargas administrativas', parcial: 'Parcial de venta'
};

// Claves iniciales (solo su hash SHA-256; el Administrador las cambia en Gestión › Configuración).
const DEFAULT_MASTER_HASH = {
    store:       '52d8e072363dd1bcb1cfc4e4a742f789d98ea80d71359b767674de36d0d07d87',
    supervisor:  'ee80dff6f3a690c8360077b21c6c6593a57d7e3cd95082811d9914bf5cf3d71e',
    formador:    '033d0b87ca8a975c9bddcbf016127a2cd241bad8097129a389c62455e06b0b42',
    coordinador: '93ad62601303309317ccc3e5a87b698f5ae3153a6f1bed59c8218aebdfd86fa9',
    gerente:     '814c8c43437c69f6ba7b2dbeb43e723a9f7026cdb0bf65c87b15a07091ad5b54',
    admin:       'eb904cdc41fe2610999cf38c9846aaa0c1da96e7a74702e39dac9fe38c4a05fe'
};

// --- Cadenas comerciales: las 7 oficiales + "Otra" (nombre escrito a mano) ----
// logo: clave dentro de LOGOS (opscore-assets.js). Jumbo, Metro, Claro, etc. no son cadenas:
// van en el nombre de la tienda.
const CHAINS = {
    exito:     { name: 'Éxito',     logo: 'exito',     color: '#FFE700', ink: '#0F172A' },
    alkosto:   { name: 'Alkosto',   logo: 'alkosto',   color: '#F58220', ink: '#FFFFFF' },
    ktronix:   { name: 'Ktronix',   logo: 'ktronix',   color: '#E30613', ink: '#FFFFFF' },
    falabella: { name: 'Falabella', logo: 'falabella', color: '#B2D235', ink: '#0F172A' },
    cencosud:  { name: 'Cencosud',  logo: 'cencosud',  color: '#00704A', ink: '#FFFFFF' },
    wom:       { name: 'WOM',       logo: 'wom',       color: '#6D2077', ink: '#FFFFFF' },
    olimpica:  { name: 'Olímpica',  logo: 'olimpica',  color: '#E31837', ink: '#FFFFFF' },
    otro:      { name: 'Otra (escribir nombre)', logo: null, color: '#334155', ink: '#FFFFFF' }
};
// Compatibilidad con claves antiguas (jumbo y metro pertenecen a Cencosud)
const normLogoKey = k => CHAINS[k] ? k : (['jumbo', 'metro'].includes(k) ? 'cencosud' : 'otro');

// --- Catálogo Infinix --------------------------------------------------------
const INFINIX_MODELS = [
    { key: 'smart-20',      name: 'SMART 20' },
    { key: 'hot-60-pro',    name: 'HOT 60 Pro+' },
    { key: 'hot-70',        name: 'HOT 70' },
    { key: 'hot-70-pro-5g', name: 'HOT 70 Pro 5G' },
    { key: 'note-edge',     name: 'Note EDGE' },
    { key: 'note-60',       name: 'NOTE 60' },
    { key: 'note-60-pro',   name: 'Note 60 Pro' },
    { key: 'gt-50-pro',     name: 'GT 50 PRO' },
    { key: 'note-60-ultra', name: 'NOTE 60 ULTRA' }
];
// Accesorios: venta independiente, excluidos del share y del ROI de celulares
const INFINIX_ACCESSORIES = [
    { key: 'xbuds-h5',  name: 'XBUDS H5 Audífonos' },
    { key: 'xpad-30e',  name: 'XPAD 30E Tablet' },
    { key: 'gt-5-pro',  name: 'GT 5 PRO Reloj' }
];

// Catálogo completo para elegir en listas (samples, exhibición): portafolio vigente, accesorios y referencias anteriores
// que algunas tiendas aún tienen en sample o inventario. En los reportes solo salen las referencias con target.
const CATALOGO_INFINIX = INFINIX_MODELS.map(m => m.name).concat(['XPAD 30E', 'XBUDS H5', 'GT WATCH 5 PRO', 'HOT 60i', 'SMART 10', 'GT 30', 'GT 30 Pro']);

// --- Marcas del PDV ----------------------------------------------------------
const BRANDS = ['INFINIX', 'XIAOMI', 'SAMSUNG', 'MOTOROLA', 'OPPO', 'HONOR', 'REALME', 'TECNO', 'VIVO', 'ZTE', 'APPLE'];
const BRAND_COLORS = {
    INFINIX: '#00C853', XIAOMI: '#F97316', SAMSUNG: '#2563EB', MOTOROLA: '#64748B', OPPO: '#DC2626',
    HONOR: '#9333EA', REALME: '#EAB308', TECNO: '#38BDF8', VIVO: '#4F46E5', ZTE: '#06B6D4', APPLE: '#111827',
    OTROS: '#CBD5E1'
};

// --- Módulo 2: opciones rápidas ----------------------------------------------
const PLAN_FOCOS = [
    'Movimiento de mesa · Foco Note Edge', 'Refuerzo foco de cadena', 'Capacitación lanzamiento',
    'Activación fin de semana', 'Seguimiento a asesor', 'Recuperación de share', 'Auditoría de exhibición'
];
const PLAN_ACCIONES = [
    'Acompañar movimiento de mesa', 'Discurso y demo en sala', 'Seguimiento a asesor', 'Pedir reposición de stock',
    'Comparativo frente a la competencia', 'Revisión de planillas y metas', 'Capacitación a asesores de cadena',
    'Negociación con jefe de piso', 'Activación BTL en punto'
];
const PLAN_IMPACTOS = [
    'Rotar unidades de la referencia foco', 'Subir el cumplimiento del mes', 'Mejorar el ROI de la tienda',
    'Recuperar share frente a la competencia', 'Mesa lista para el fin de semana', 'Primeras ventas del asesor nuevo'
];

// --- Módulo 3: bloques por rol -----------------------------------------------
const VISIT_COMPETENCIAS = [
    { key: 'producto',      label: 'Conocimiento de producto' },
    { key: 'argumentacion', label: 'Argumentación comercial' },
    { key: 'cierre',        label: 'Técnicas de venta / cierre' },
    { key: 'objeciones',    label: 'Manejo de objeciones' }
];
const VISIT_FOCOS_FORMADOR = [
    'Capacitación personal Infinix', 'Capacitación fuerza de venta externa', 'Apoyo comercial', 'Lanzamientos'
];
// Supervisión: lista corta de chulitos (marcado = se hizo / está bien)
const VISIT_EJECUCION = [
    { key: 'mesa',        label: 'Movimiento de mesa' },
    { key: 'exhibicion',  label: 'Exhibición al día' },
    { key: 'pop',         label: 'Material POP' },
    { key: 'demos',       label: 'Demos encendidos' },
    { key: 'precios',     label: 'Precios actualizados' },
    { key: 'inventario',  label: 'Sin quiebres de inventario' },
    { key: 'negociacion', label: 'Negociación con jefe de piso' },
    { key: 'planillas',   label: 'Planillas y metas al día' }
];
const VISIT_RADAR = [
    { key: 'descuentos',  label: 'Descuentos agresivos' },
    { key: 'bonos',       label: 'Bonos a asesores externos' },
    { key: 'promotoria',  label: 'Promotoría adicional' },
    { key: 'btl',         label: 'Activaciones BTL' }
];
const VISIT_CALIF_ASESOR = [
    { key: 'presentacion', label: 'Presentación personal' },
    { key: 'actitud',      label: 'Actitud comercial' },
    { key: 'metas',        label: 'Dominio de metas y planillas' }
];

// --- Módulo 5: entidades financieras -----------------------------------------
// Valores por defecto. El Administrador los edita en Gestión › Configuración
// (se guardan en opscore_config/rates); en el simulador son fijos, nadie los cambia.
const DEFAULT_RATES = {
    exito:     { nombre: 'Tarjeta Éxito / Tuya', tasaMV: 2.15, cuotaManejo: 24000, logoKey: 'exito',     condicion: 'Cuota de manejo en $0 si realiza 3 compras en el mes.' },
    falabella: { nombre: 'CMR Falabella',        tasaMV: 2.20, cuotaManejo: 22000, logoKey: 'falabella', condicion: 'Acumula CMR Puntos. La cuota de manejo varía según la categoría.' },
    cencosud:  { nombre: 'Tarjeta Cencosud',     tasaMV: 2.10, cuotaManejo: 21000, logoKey: 'cencosud',  condicion: '20% de descuento en la primera compra de tecnología.' },
    alkosto:   { nombre: 'Tarjeta Alkosto',      tasaMV: 2.18, cuotaManejo: 25000, logoKey: 'alkosto',   condicion: 'Mitad de precio en cuota de manejo el primer año.' }
};
// Plan comisional (general para todos los asesores; se edita en Gestión › Configuración › Plan comisional).
// apertura: unidades mínimas del mes (KPI) para empezar a cobrar · valores: pago por unidad según la referencia
// kpis: bonos fijos al alcanzar cierta cantidad de unidades · valoresAcc: pago por accesorio
// Plan de incentivos promotores · noviembre 2026 (imagen oficial). Speeds = incentivo por unidad de cada modelo.
const PLAN_ID = 'nov2026';
const DEFAULT_COMISIONES = {
    plan: PLAN_ID,
    valores: { 'smart-20': 2000, 'hot-60-pro': 0, 'hot-70': 7000, 'hot-70-pro-5g': 16000, 'note-edge': 16000, 'note-60': 15000, 'note-60-pro': 20000, 'gt-50-pro': 50000, 'note-60-ultra': 80000 },
    valoresAcc: { 'xbuds-h5': 10000, 'xpad-30e': 10000, 'gt-5-pro': 10000 },
    kpiPay: { k400: 400000, k700: 700000 },
    diasMin: 20, minUnidades: 40,
    nota: 'Plan de incentivos promotores · noviembre 2026'
};
// Términos y condiciones del plan (se muestran en la calculadora, la central de la tienda y la tarjeta del asesor)
const PLAN_TERMINOS = [
    ['ROI 1 · Llave', 'Al llegar al ROI 1 (ROI base de tu tienda) se habilita la llave de los speeds: cobras el incentivo de cada modelo vendido. Todos los IMEI deben estar activos en DCR dentro del mismo mes.'],
    ['ROI 2 · $400.000', 'Comisión adicional de $400.000 al llegar al ROI 2 de tu tienda.'],
    ['ROI 3 · $700.000', 'Comisión adicional de $700.000 al llegar al ROI 3. No son acumulables: se gana $400.000 o $700.000 según el nivel alcanzado.'],
    ['Por referencia', 'La meta se evalúa por referencia según el peso de cada modelo; una referencia no reemplaza otra, salvo quiebre de inventario aprobado.'],
    ['Desempeño mínimo', 'Con menos de 40 unidades al cierre del mes y más de 30 días en la compañía hay revisión de desempeño con Recursos Humanos.'],
    ['Obsoletos y accesorios', 'Relojes, tablets y audífonos pagan incentivo desde la primera unidad y no suman al ROI. Los obsoletos tienen incentivo adicional y tampoco suman al ROI.'],
    ['Plataforma DCR', 'Solo se pagan unidades cargadas en DCR; el cierre diario es a las 7:00 p. m. (el último día del mes, lo cargado después no cuenta). IMEI activados antes del 1 de noviembre, de trianguladores o mayoristas no cuentan.'],
    ['Condiciones', 'Se liquida al validar el ROI y la activación del IMEI. Aplica para promotores activos de Infinix al menos 20 días del mes. Horas y domingos se pagan solo si están reportados en DCR.']
];

const SIM_PLAZOS = [3, 6, 12, 18, 24, 36];

// --- Plan comisional de promotores · noviembre 2026 (Condiciones promotores) -----------------
// El ROI base abre la llave de incentivos. KPI $400.000 y KPI $700.000 por unidades del asesor en el mes.
// No se acumulan: se gana $400.000 o $700.000. Los umbrales de cada tienda vienen del target (st.kpi);
// estos son los de respaldo por cadena.
const KPI_PAY = { k400: 400000, k700: 700000 };
const KPI_DEFAULT = {
    exito: { base: 50, k400: 100, k700: 140 }, alkosto: { base: 60, k400: 100, k700: 140 }, ktronix: { base: 50, k400: 90, k700: 120 },
    falabella: { base: 50, k400: 90, k700: 120 }, cencosud: { base: 50, k400: 90, k700: 120 }, wom: { base: 50, k400: 90, k700: 120 }, olimpica: { base: 50, k400: 90, k700: 120 }
};
function kpiPlan(st) {
    const d = KPI_DEFAULT[normLogoKey(st && st.logoKey)] || { base: 50, k400: 90, k700: 120 }, k = (st && st.kpi) || {}, pay = (typeof State !== 'undefined' && State.comisiones && State.comisiones.kpiPay) || KPI_PAY;
    return { base: int(k.base) || d.base, k400: int(k.k400) || d.k400, k700: int(k.k700) || d.k700, pay400: int(pay.k400) || KPI_PAY.k400, pay700: int(pay.k700) || KPI_PAY.k700 };
}
// Speeds (incentivo por unidad) de un mix de ventas por referencia; solo se pagan con la llave abierta (ROI 1)
const planValores = () => ({ ...DEFAULT_COMISIONES.valores, ...((typeof State !== 'undefined' && State.comisiones && State.comisiones.plan === PLAN_ID && State.comisiones.valores) || {}) });
const planValoresAcc = () => ({ ...DEFAULT_COMISIONES.valoresAcc, ...((typeof State !== 'undefined' && State.comisiones && State.comisiones.plan === PLAN_ID && State.comisiones.valoresAcc) || {}) });
function speedsOf(ventas) { const v = planValores(); return INFINIX_MODELS.reduce((s, m) => s + (Math.round(+((ventas || {})[m.key]) || 0)) * (v[m.key] || 0), 0); }
function accOf(acc) { const v = planValoresAcc(); return INFINIX_ACCESSORIES.reduce((s, a) => s + (Math.round(+((acc || {})[a.key]) || 0)) * (v[a.key] || 0), 0); }
// Liquidación completa: speeds (si abrió la llave) + KPI ($400.000 o $700.000) + accesorios (desde la primera unidad)
function incentivo(ventas, P, acc) {
    const u = INFINIX_MODELS.reduce((s, m) => s + (Math.round(+((ventas || {})[m.key]) || 0)), 0);
    const k = kpiPay(u, P), sp = speedsOf(ventas), ac = accOf(acc);
    return { ...k, speeds: k.abierto ? sp : 0, speedsBloq: k.abierto ? 0 : sp, kpi: k.ganado, acc: ac, total: (k.abierto ? sp : 0) + k.ganado + ac };
}
// Qué gana con u unidades: nivel 0 (sin abrir) · 1 (abrió incentivos) · 2 ($400.000) · 3 ($700.000)
function kpiPay(u, P) {
    u = Math.max(0, Math.round(+u || 0));
    const nivel = u >= P.k700 ? 3 : u >= P.k400 ? 2 : u >= P.base ? 1 : 0;
    const ganado = nivel === 3 ? P.pay700 : nivel === 2 ? P.pay400 : 0;
    const next = nivel === 0 ? { meta: P.base, label: 'abrir la llave (ROI 1)', premio: 0 } : nivel === 1 ? { meta: P.k400, label: `ROI 2 (${money(P.pay400)})`, premio: P.pay400 } : nivel === 2 ? { meta: P.k700, label: `ROI 3 (${money(P.pay700)})`, premio: P.pay700 } : null;
    return { u, nivel, ganado, abierto: u >= P.base, next, falta: next ? next.meta - u : 0, faltaBase: Math.max(0, P.base - u), falta400: Math.max(0, P.k400 - u), falta700: Math.max(0, P.k700 - u) };
}
// Precio de referencia (oferta) por referencia, del target de noviembre
const MODEL_PRICE = { 'smart-20': 599900, 'hot-70': 834900, 'hot-70-pro-5g': 1099900, 'note-edge': 1099900, 'note-60': 1469900, 'note-60-pro': 1999900, 'gt-50-pro': 2969900, 'note-60-ultra': 3849990 };
// Tips de venta por referencia para la tarjeta del asesor (técnica de venta; se ajustan en Gestión › Configuración › Radar)
const MODEL_TIPS = {
    'smart-20': 'Es la puerta de entrada: ofrécelo a quien busca su primer smartphone, a papás y para regalo. Cierra con el precio y un accesorio.',
    'hot-60-pro': 'Muévelo como oportunidad de precio: compáralo en mano con el equipo que el cliente está mirando.',
    'hot-70': 'La referencia de más rotación: demo encendida y comparación lado a lado con la competencia del mismo precio.',
    'hot-70-pro-5g': 'Para quien pregunta por 5G: muéstrale que le dura años y súbelo desde el HOT 70 con la diferencia por cuota.',
    'note-edge': 'Ponlo en la mano del cliente: el diseño vende solo. Úsalo para subir de gama a quien llega por un HOT.',
    'note-60': 'Gama media-alta: demo de cámara y rendimiento en el momento; cierra con financiación o tarjeta de la cadena.',
    'note-60-pro': 'Cliente que compara gamas altas: haz la demo completa, toma fotos con él y cierra con cuotas.',
    'gt-50-pro': 'Para el cliente gamer: abre un juego en la demo y déjalo jugar; habla de potencia y temperatura.',
    'note-60-ultra': 'Tope de gama: atención sin afán, demo completa y cierre con financiación; ofrécelo a quien mira equipos premium.'
};

// Auditoría de disciplina operativa (0 = domingo … 6 = sábado)
const STORE_DAYS = [0, 1, 2, 3, 4, 5, 6];
// Piloto: en estos meses la tienda puede cargar la venta de toda la semana en un solo cierre (corte del domingo)
const WEEKLY_PILOT_MONTHS = ['2026-11'];   // días en que la tienda debe enviar cierre
const STAFF_DAYS = [1, 2, 3, 4, 5, 6];      // días en que el staff debe enviar plan

// --- Semilla oficial de tiendas · Regional Santander -------------------------
// Las semillas de regionales, zonas y tiendas están en opscore-seed.js (generado desde la data DCR)


// --- Radar de asesores (v1.5): umbrales del diagnóstico por asesor; el administrador los ajusta en Gestión › Configuración ---
// focoRefs: referencias foco (además del foco que cada tienda fije a mano). invMin: unidades en PDV desde las que una
// referencia sin venta se considera rezago. ritmoMin: % del cumplimiento esperado a la fecha bajo el cual el asesor va atrasado.
// notaMin: nota de evaluación mínima. ventaBaja: unidades vendidas o menos que cuentan como venta "muy baja" en una referencia foco.
const DEFAULT_RADAR = { focoRefs: ['note-edge', 'note-60', 'note-60-pro', 'hot-70-pro-5g', 'gt-50-pro'], invMin: 2, ritmoMin: 85, notaMin: 80, ventaBaja: 1 };

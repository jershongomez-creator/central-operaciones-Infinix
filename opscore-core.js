// ============================================================================
// INFINIX OPSCORE · NÚCLEO
// Utilidades, capa de datos (Firestore + respaldo local), sesión, login dual,
// ajustes de tienda, navegación por rol y motor de exportación gráfica.
// ============================================================================

// ---------- Utilidades -------------------------------------------------------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slug = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const int = v => { const n = parseInt(v, 10); return isNaN(n) ? 0 : n; };
const numf = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(n) ? 0 : n; };
const sum = arr => arr.reduce((a, b) => a + (+b || 0), 0);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const pctNum = (a, b) => b > 0 ? Math.round(a / b * 100) : 0;
const pctStr = (a, b, dash = '—') => b > 0 ? Math.round(a / b * 100) + '%' : dash;
const fmt1 = n => (Math.round((+n || 0) * 10) / 10).toLocaleString('es-CO', { maximumFractionDigits: 1 });
const money = n => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Math.round(+n || 0));

// Fechas: siempre como texto 'AAAA-MM-DD' en hora local (evita el desfase UTC-5)
const pad2 = n => String(n).padStart(2, '0');
const dstr = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parseD = s => new Date(s + 'T12:00:00');
const todayStr = () => dstr(new Date());
const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return dstr(d); };
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const DIAS_CORTO = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];
// Meta semanal = cuota del mes ÷ 4 (por tienda y por asesor)
const metaSemana = metaMes => Math.round((+metaMes || 0) / 4);
// Venta DCR de una tienda en un rango de fechas del mes del snapshot: total y por referencia
function dcrRange(Z, from, to) {
    if (!Z || !Z.dias) return null;
    const m = (Z.month || (Z.corte || '').slice(0, 7)); let total = 0; const ventas = {};
    Object.entries(Z.dias).forEach(([dd, q]) => { const ds = `${m}-${dd}`; if (ds >= from && ds <= to) total += q; });
    Object.entries(Z.diasRef || {}).forEach(([dd, r]) => { const ds = `${m}-${dd}`; if (ds >= from && ds <= to) Object.entries(r).forEach(([k, v]) => { ventas[k] = (ventas[k] || 0) + v; }); });
    return { total, ventas };
}
const fechaHora = ms => { const d = new Date(ms); return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const fechaLarga = s => { const d = parseD(s); return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`; };
const mesLargo = ym => { const [y, m] = ym.split('-'); return `${MESES[+m - 1]} de ${y}`; };
function isoWeek(s) {                      // misma fórmula que ProTrainer (semana ISO, lunes a domingo)
    const d = parseD(s), t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    t.setDate(t.getDate() + 4 - (t.getDay() || 7));
    return Math.ceil((((t - new Date(t.getFullYear(), 0, 1)) / 86400000) + 1) / 7);
}
function weekDays(s) {                     // 7 fechas, de lunes a domingo, de la semana de s
    const d = parseD(s), off = (d.getDay() || 7) - 1, mon = addDays(s, -off);
    return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
}
const daysInMonth = ym => { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); };
function weeksOfMonth(ym) {                // semanas ISO que tocan el mes (W44…W48)
    const out = [];
    for (let i = 1; i <= daysInMonth(ym); i++) { const w = isoWeek(`${ym}-${pad2(i)}`); if (!out.includes(w)) out.push(w); }
    return out;
}
// Semanas del mes para evaluaciones: una semana pertenece al mes donde cae su jueves
// (noviembre de 2026 → W45 a W48; la W44 solo toca el 1 de noviembre y no cuenta).
function evalWeeksOfMonth(ym) {
    const out = [];
    for (let i = 1; i <= daysInMonth(ym); i++) {
        const s = `${ym}-${pad2(i)}`;
        if (parseD(s).getDay() === 4) out.push(isoWeek(s));
    }
    return out;
}
function businessDaysBetween(from, to, days) {   // días hábiles entre dos fechas, inclusive
    let n = 0;
    for (let s = from; s <= to; s = addDays(s, 1)) if (days.includes(parseD(s).getDay())) n++;
    return n;
}
// Días exigibles de reporte: hasta ayer, y hoy solo si ya se envió (el cierre de hoy llega en la noche)
function expectedDays(from, to, days, sentToday) {
    const today = todayStr(), end = to >= today ? addDays(today, -1) : to;
    return (from <= end ? businessDaysBetween(from, end, days) : 0) + (to >= today && from <= today && sentToday ? 1 : 0);
}

// SHA-256 síncrono (funciona también sin HTTPS). Las contraseñas nunca se guardan en claro.
function sha256(str) {
    const ascii0 = unescape(encodeURIComponent(str));
    const rr = (v, a) => (v >>> a) | (v << (32 - a));
    const maxWord = Math.pow(2, 32);
    let i, j, result = '', ascii = ascii0;
    const words = [], bitLen = ascii.length * 8;
    let hash = sha256.h = sha256.h || [];
    const k = sha256.k = sha256.k || [];
    let primeCounter = k.length;
    const isComposite = {};
    for (let c = 2; primeCounter < 64; c++) {
        if (!isComposite[c]) {
            for (i = 0; i < 313; i += c) isComposite[i] = c;
            hash[primeCounter] = (Math.pow(c, .5) * maxWord) | 0;
            k[primeCounter++] = (Math.pow(c, 1 / 3) * maxWord) | 0;
        }
    }
    ascii += '\x80';
    while (ascii.length % 64 - 56) ascii += '\x00';
    for (i = 0; i < ascii.length; i++) { j = ascii.charCodeAt(i); words[i >> 2] |= j << ((3 - i) % 4) * 8; }
    words[words.length] = ((bitLen / maxWord) | 0);
    words[words.length] = bitLen;
    for (j = 0; j < words.length;) {
        const w = words.slice(j, j += 16), oldHash = hash;
        hash = hash.slice(0, 8);
        for (i = 0; i < 64; i++) {
            const w15 = w[i - 15], w2 = w[i - 2], a = hash[0], e = hash[4];
            const t1 = hash[7] + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & hash[5]) ^ ((~e) & hash[6])) + k[i]
                + (w[i] = (i < 16) ? w[i] : (w[i - 16] + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0);
            const t2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
            hash = [(t1 + t2) | 0].concat(hash);
            hash[4] = (hash[4] + t1) | 0;
        }
        for (i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
    }
    for (i = 0; i < 8; i++) for (j = 3; j + 1; j--) { const b = (hash[i] >> (j * 8)) & 255; result += ((b < 16) ? '0' : '') + b.toString(16); }
    return result;
}
const splitLines = t => String(t || '').split(/\n|;/).map(x => x.trim().replace(/^[-•*]\s*/, '')).filter(Boolean);
const pwdHash = p => sha256('opscore:' + String(p || ''));

// ---------- Avisos y modales -------------------------------------------------
function toast(msg, type = 'ok', ms = 3800) {
    const box = $('#toast'); if (!box) return;
    const el = document.createElement('div');
    el.className = `toast toast-${type}`; el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms);
}
function openModal(html, opts = {}) {
    const root = $('#modal-root');
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `<div class="modal ${opts.wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true">${opts.locked ? '' : '<button class="modal-x" aria-label="Cerrar">✕</button>'}${html}</div>`;
    if (!opts.locked) {
        wrap.addEventListener('click', e => { if (e.target === wrap) closeModal(wrap); });
        $('.modal-x', wrap).addEventListener('click', () => closeModal(wrap));
    }
    root.appendChild(wrap);
    document.body.classList.add('no-scroll');
    return wrap;
}
function closeModal(wrap) {
    (wrap || $('#modal-root').lastElementChild)?.remove();
    if (!$('#modal-root').children.length) document.body.classList.remove('no-scroll');
}
function confirmBox(msg, okLabel = 'Confirmar') {
    return new Promise(res => {
        const m = openModal(`<h3 class="modal-title">Confirmar</h3><p class="mute" style="margin:8px 0 18px">${esc(msg)}</p>
            <div class="row end"><button class="btn btn-ghost" data-no>Cancelar</button><button class="btn btn-danger" data-ok>${esc(okLabel)}</button></div>`);
        $('[data-no]', m).onclick = () => { closeModal(m); res(false); };
        $('[data-ok]', m).onclick = () => { closeModal(m); res(true); };
    });
}
function busy(btn, on) {
    if (!btn) return;
    if (on) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Generando…'; }
    else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
}

// ---------- Capa de datos: Firestore + respaldo local ------------------------
// Toda lectura cae al caché local si no hay red; toda escritura queda en el
// equipo y en una cola que se reenvía cuando vuelve la conexión.
const Data = (() => {
    let db = null, online = null, denied = false;
    const listeners = [];
    const TIMEOUT = 8000;
    const ck = col => 'opscore_c_' + col;
    const readCache = col => { try { return JSON.parse(localStorage.getItem(ck(col))) || {}; } catch (e) { return {}; } };
    const writeCache = (col, map) => { try { localStorage.setItem(ck(col), JSON.stringify(map)); } catch (e) { console.warn('[Central] caché local lleno', e); } };
    const readQueue = () => { try { return JSON.parse(localStorage.getItem('opscore_pending')) || []; } catch (e) { return []; } };
    const writeQueue = q => { try { localStorage.setItem('opscore_pending', JSON.stringify(q)); } catch (e) { /* sin espacio */ } };
    // Sin red no se hace esperar al usuario: 8 s la primera vez, 2,5 s mientras siga sin conexión
    const waitMs = () => navigator.onLine === false ? 50 : online === false ? 2500 : TIMEOUT;
    const withTimeout = p => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), waitMs()))]);
    const setOnline = (v, err) => {
        const d = !v && !!err && err.code === 'permission-denied';      // reglas de Firestore sin publicar
        if (online !== v || denied !== d) { online = v; denied = d; listeners.forEach(fn => fn(v)); }
    };
    const match = (doc, f) => {
        const v = doc[f[0]];
        if (f[1] === '==') return v === f[2];
        if (f[1] === 'in') return f[2].includes(v);
        if (f[1] === '>=') return v >= f[2];
        if (f[1] === '<=') return v <= f[2];
        return true;
    };

    function init() {
        try {
            if (typeof firebase === 'undefined') throw new Error('SDK de Firebase no disponible');
            if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
            db = firebase.firestore();
            if (firebase.firestore.setLogLevel) firebase.firestore.setLogLevel('silent');   // sin ruido en consola cuando no hay red
        } catch (e) { console.warn('[Central] Firebase no disponible; modo local.', e.message); db = null; setOnline(false); }
        window.addEventListener('online', flush);
    }

    async function fetch(col, filters = []) {
        const local = () => Object.values(readCache(col)).filter(d => filters.every(f => match(d, f)));
        if (!db) return { docs: local(), fromServer: false };
        try {
            let q = db.collection(col);
            filters.forEach(f => { q = q.where(f[0], f[1], f[2]); });
            const snap = await withTimeout(q.get());
            if (snap.metadata && snap.metadata.fromCache) throw new Error('offline');
            const docs = snap.docs.map(d => ({ ...d.data(), id: d.id }));
            let cache = readCache(col);
            if (!filters.length) {          // lista completa: el servidor manda, salvo lo pendiente de subir
                const pend = readQueue().filter(p => p.col === col && p.op === 'set').map(p => p.id);
                const keep = {}; pend.forEach(id => { if (cache[id]) keep[id] = cache[id]; });
                cache = keep;
            }
            docs.forEach(d => { cache[d.id] = d; });
            writeCache(col, cache);
            setOnline(true);
            return { docs, fromServer: true };
        } catch (e) { setOnline(false, e); return { docs: local(), fromServer: false }; }
    }
    const list = async (col, filters) => (await fetch(col, filters)).docs;

    async function get(col, id) {
        if (db) {
            try {
                const snap = await withTimeout(db.collection(col).doc(id).get());
                if (snap.metadata && snap.metadata.fromCache && !snap.exists) throw new Error('offline');
                setOnline(true);
                const cache = readCache(col);
                if (snap.exists) { cache[id] = { ...snap.data(), id }; writeCache(col, cache); return cache[id]; }
                return cache[id] && readQueue().some(p => p.col === col && p.id === id) ? cache[id] : null;
            } catch (e) { setOnline(false, e); }
        }
        return readCache(col)[id] || null;
    }

    async function set(col, id, data, merge = true) {
        const cache = readCache(col);
        cache[id] = merge ? { ...(cache[id] || {}), ...data, id } : { ...data, id };
        writeCache(col, cache);
        const payload = JSON.parse(JSON.stringify(data)); delete payload.id;       // Firestore no admite valores undefined
        if (db) {
            try { await withTimeout(db.collection(col).doc(id).set(payload, { merge })); setOnline(true); return { synced: true }; }
            catch (e) { setOnline(false, e); }
        }
        const q = readQueue().filter(p => !(p.col === col && p.id === id && p.op === 'set' && !merge));
        q.push({ op: 'set', col, id, data: payload, merge: !!merge }); writeQueue(q);
        return { synced: false };
    }

    // Varias escrituras de una vez (lotes de 400): datos de demostración, ajustes masivos
    async function commit(ops) {
        for (let i = 0; i < ops.length; i += 400) {
            const b = db.batch();
            ops.slice(i, i + 400).forEach(o => {
                const ref = db.collection(o.col).doc(o.id);
                if (o.op === 'del') b.delete(ref); else b.set(ref, o.data, { merge: !!o.merge });
            });
            await withTimeout(b.commit());
        }
    }
    async function batch(ops) {                // ops: [{ op:'set'|'del', col, id, data, merge }]
        const caches = {};
        ops.forEach(o => {
            const c = caches[o.col] = caches[o.col] || readCache(o.col);
            if (o.op === 'del') delete c[o.id];
            else c[o.id] = o.merge ? { ...(c[o.id] || {}), ...o.data, id: o.id } : { ...o.data, id: o.id };
        });
        Object.keys(caches).forEach(col => writeCache(col, caches[col]));
        const clean = ops.map(o => {
            const d = o.data ? JSON.parse(JSON.stringify(o.data)) : null; if (d) delete d.id;
            return o.op === 'del' ? { op: 'del', col: o.col, id: o.id } : { op: 'set', col: o.col, id: o.id, data: d, merge: !!o.merge };
        });
        if (db) {
            try { await commit(clean); setOnline(true); return { synced: true }; }
            catch (e) { setOnline(false, e); }
        }
        writeQueue(readQueue().concat(clean));
        return { synced: false };
    }

    async function del(col, id) {
        const cache = readCache(col); delete cache[id]; writeCache(col, cache);
        if (db) {
            try { await withTimeout(db.collection(col).doc(id).delete()); setOnline(true); return { synced: true }; }
            catch (e) { setOnline(false, e); }
        }
        const q = readQueue(); q.push({ op: 'del', col, id }); writeQueue(q);
        return { synced: false };
    }

    let flushing = false;
    async function flush() {                // reenvía lo pendiente, por lotes; al primer fallo se detiene
        if (!db || flushing) return;
        flushing = true; let sent = 0;
        try {
            for (;;) {
                const q = readQueue(); if (!q.length) break;
                const part = q.slice(0, 400);
                await commit(part);
                writeQueue(readQueue().slice(part.length)); sent += part.length; setOnline(true);
            }
        } catch (e) { setOnline(false, e); }
        flushing = false;
        if (sent) toast(`${sent} registro(s) pendientes sincronizados`, 'ok');
    }

    function watch(col, cb) {               // tiempo real para colecciones pequeñas
        if (!db) return () => { };
        try {
            return db.collection(col).onSnapshot(snap => {
                if (snap.metadata.fromCache) return;
                const pend = readQueue().filter(p => p.col === col && p.op === 'set').map(p => p.id);
                const old = readCache(col), cache = {};
                pend.forEach(id => { if (old[id]) cache[id] = old[id]; });
                snap.docs.forEach(d => { cache[d.id] = { ...d.data(), id: d.id }; });
                writeCache(col, cache); setOnline(true);
                cb(Object.values(cache));
            }, err => console.warn('[Central] watch', col, err.code || err.message));
        } catch (e) { return () => { }; }
    }

    return {
        init, fetch, list, get, set, del, batch, flush, watch, hasCloud: () => !!db, denied: () => denied,
        local: col => Object.values(readCache(col)),
        seedLocal: (col, docs) => { const c = readCache(col); docs.forEach(d => { if (!c[d.id]) c[d.id] = d; }); writeCache(col, c); },
        onStatus: fn => { listeners.push(fn); if (online !== null) fn(online); },
        pending: () => readQueue().length
    };
})();

// ---------- Estado global ----------------------------------------------------
const State = {
    stores: [], zones: [], staff: [],
    auth: { ...DEFAULT_MASTER_HASH },
    rates: JSON.parse(JSON.stringify(DEFAULT_RATES)),
    comisiones: JSON.parse(JSON.stringify(DEFAULT_COMISIONES)),
    cadenas: { off: [] },          // cadenas que NO se trabajan (global, la fija el administrador)
    radar: JSON.parse(JSON.stringify(DEFAULT_RADAR)),   // umbrales y referencias foco del radar de asesores
    chainView: [],                 // cadenas que cada persona oculta de su análisis (solo en su equipo)
    demo: null, session: null, tab: null, zoneSnaps: {}
};
const Modules = {};                         // cada archivo de módulo registra aquí su render
const registerModule = (id, mod) => { Modules[id] = mod; };

const storeById = id => State.stores.find(s => s.id === id) || null;
const currentStore = () => State.session && State.session.type === 'store' ? storeById(State.session.storeId) : null;
const isAllZones = () => { const s = State.session; return !!s && (s.rol === 'admin' || (s.rol === 'gerente' && !s.regional && (!s.zona || s.zona === 'NACIONAL'))); };
// Alcance: supervisor y formador ven su zona; coordinador (y gerente regional) todas las zonas de su regional
const myZones = () => {
    const s = State.session; if (!s) return [];
    const reg = s.regional || ((s.rol === 'coordinador' || s.rol === 'gerente') ? zoneRegional(s.zona) : '');
    const ofReg = reg ? State.zones.filter(z => z.regional === reg).map(z => z.nombre) : [];
    const own = s.rol === 'coordinador' ? State.zones.filter(z => z.createdBy === s.userId).map(z => z.nombre) : [];
    return [...new Set([s.zona, ...ofReg, ...own].filter(z => z && z !== 'NACIONAL'))];
};
const myRegional = () => { const s = State.session; return s ? (s.regional || zoneRegional(s.zona) || '') : ''; };
const scopedRegionales = () => isAllZones() ? regionales() : [...new Set(myZones().map(zoneRegional).filter(Boolean))].sort();
const inScope = zona => isAllZones() || myZones().includes(zona);
// ---------- Cadenas de trabajo ----------------------------------------------------
// La data nacional trae de todo (retail, IR, independientes…). El administrador elige qué cadenas se
// trabajan; las demás salen de rankings, central, plan y evaluaciones, pero sus ventas quedan guardadas.
const chainGroup = st => { const k = normLogoKey(st && st.logoKey); return k !== 'otro' ? { key: k, label: CHAINS[k].name.toUpperCase() } : { key: 'x:' + (slug(st && st.cadena) || 'sin_cadena'), label: String((st && st.cadena) || 'SIN CADENA').toUpperCase() }; };
const chainOn = st => !State.cadenas.off.includes(chainGroup(st).key);
const chainViewOn = st => !State.chainView.includes(chainGroup(st).key);
const chainViewKey = () => 'opscore_cv_' + ((State.session && (State.session.userId || State.session.storeId)) || 'x');
const loadChainView = () => { try { State.chainView = JSON.parse(localStorage.getItem(chainViewKey())) || []; } catch (e) { State.chainView = []; } };
const scopedStoresAll = () => State.stores.filter(s => inScope(s.zona)).sort((a, b) => a.tienda.localeCompare(b.tienda, 'es'));
const scopedStores = () => scopedStoresAll().filter(chainOn);
// Cadenas presentes en una lista de tiendas: [{ key, label, official, pdv, units }]
function chainList(stores, units = {}) {
    const m = {};
    stores.forEach(s => { const g = chainGroup(s); const c = m[g.key] = m[g.key] || { key: g.key, label: g.label, official: !g.key.startsWith('x:'), pdv: 0, units: 0 }; c.pdv++; });
    Object.keys(m).forEach(k => { m[k].units = int(units[k]); });
    return Object.values(m).sort((a, b) => (b.official - a.official) || (b.pdv - a.pdv) || a.label.localeCompare(b.label, 'es'));
}
// Selector de cadenas. global = true (administrador): cambia las cadenas de trabajo de toda la app.
// global = false: solo oculta cadenas en el análisis de esta persona (dentro de lo que el administrador dejó activo).
function openChainPicker(opts = {}) {
    const global = !!opts.global;
    const base = global ? State.stores.slice() : scopedStores();
    const list = chainList(base, opts.units || {});
    let off = new Set(global ? State.cadenas.off : State.chainView);
    const m = openModal(`<h3 class="modal-title">🏷️ ${global ? 'Cadenas de trabajo' : 'Cadenas en mi análisis'}</h3>
        <p class="mute">${global ? 'Marca las cadenas que <b>sí se trabajan</b>. Las demás (por ejemplo IR o tiendas independientes) salen del análisis, la central, el plan y las evaluaciones <b>de toda la app</b>, pero su data queda guardada y vuelven en cuanto las marques.' : 'Marca las cadenas que quieres ver en este análisis. Solo cambia tu vista; el administrador define cuáles se trabajan en toda la app.'}</p>
        <div class="row wrap" style="gap:8px;margin:10px 0">
            <input class="input grow" id="cp-q" placeholder="Buscar cadena…">
            <button class="btn btn-ghost" id="cp-all">Todas</button><button class="btn btn-ghost" id="cp-off">Ninguna</button><button class="btn btn-ghost" id="cp-off7">Solo las 7 oficiales</button>
        </div>
        <div class="chain-grid" id="cp-grid">${list.map(c => `<label class="chain-it" data-q="${esc(slug(c.label))}"><input type="checkbox" data-k="${esc(c.key)}" ${off.has(c.key) ? '' : 'checked'}><span><b>${esc(c.label)}</b><small>${c.pdv} PDV${c.units ? ' · ' + c.units + ' uds en la data' : ''}${c.official ? '' : ' · otra'}</small></span></label>`).join('')}</div>
        <p class="hint" id="cp-sum"></p>
        <div class="row end" style="margin-top:14px"><button class="btn btn-ghost" id="cp-cancel">Cancelar</button><button class="btn btn-primary" id="cp-save">${global ? 'Guardar para toda la app' : 'Aplicar'}</button></div>`, { wide: true });
    const boxes = () => $$('#cp-grid input', m);
    const sumTxt = () => { const on = boxes().filter(b => b.checked).length; const pdv = list.filter(c => boxes().some(b => b.dataset.k === c.key && b.checked)).reduce((a, c) => a + c.pdv, 0); $('#cp-sum', m).textContent = `${on} de ${list.length} cadenas · ${pdv} de ${base.length} PDV`; };
    $('#cp-grid', m).onchange = sumTxt; sumTxt();
    $('#cp-q', m).oninput = e => { const q = slug(e.target.value); $$('.chain-it', m).forEach(l => { l.hidden = !!q && !l.dataset.q.includes(q); }); };
    $('#cp-all', m).onclick = () => { boxes().forEach(b => b.checked = true); sumTxt(); };
    $('#cp-off', m).onclick = () => { boxes().forEach(b => b.checked = false); sumTxt(); };
    $('#cp-off7', m).onclick = () => { boxes().forEach(b => b.checked = !b.dataset.k.startsWith('x:')); sumTxt(); };
    $('#cp-cancel', m).onclick = () => closeModal(m);
    $('#cp-save', m).onclick = async () => {
        const nOff = boxes().filter(b => !b.checked).map(b => b.dataset.k);
        if (boxes().every(b => !b.checked)) return toast('Deja al menos una cadena marcada.', 'warn');
        if (global) {
            // Se conservan las cadenas que no aparecen en la lista (por ejemplo, de tiendas que se agreguen después)
            State.cadenas = { off: nOff };
            try { await Data.set(COL.config, 'cadenas', { off: nOff, updatedAt: Date.now(), updatedBy: (State.session && State.session.nombre) || '' }, false); } catch (e) { console.error(e); }
        } else { State.chainView = nOff; try { localStorage.setItem(chainViewKey(), JSON.stringify(nOff)); } catch (e) { /* sin almacenamiento */ } }
        closeModal(m); toast(global ? 'Cadenas de trabajo guardadas' : 'Vista aplicada', 'ok');
        if (opts.onDone) opts.onDone();
    };
}

// ---------- Asesores activos y retirados ---------------------------------------------
// Un asesor que renuncia puede seguir apareciendo en la data. Se marca como retirado en la tienda: sale de
// rankings, HC, calculadora y evaluaciones, pero sus unidades siguen sumando a la venta de la tienda y la zona.
const advNameKey = n => slug(n).split('_').filter(Boolean).sort().join('_');
const advDigits = c => String(c || '').replace(/\D/g, '');
// Dos registros son la misma persona si comparten cédula o si su nombre (o algún alias con el que se unieron) coincide sin importar el orden
const sameAdvisor = (a, b) => {
    const ca = advDigits(a.cedula), cb = advDigits(b.cedula);
    if (ca.length >= 5 && cb.length >= 5) return ca === cb;
    const ka = [a.nombre, ...(a.nombres || [])].map(advNameKey).filter(Boolean), kb = [b.nombre, ...(b.nombres || [])].map(advNameKey).filter(Boolean);
    return ka.some(k => kb.includes(k));
};
// "Mariana Hoyos" y "Mariana Hoyos Sepulveda" (data) son la misma persona al unir la lista de la tienda con la data
const nameSubset = (a, b) => { const A = advNameKey(a).split('_').filter(Boolean), B = advNameKey(b).split('_').filter(Boolean), [s, l] = A.length <= B.length ? [A, B] : [B, A]; return s.length >= 2 && s.every(x => l.includes(x)); };
const isBaja = (st, nombre, cedula) => ((st && st.bajas) || []).some(b => sameAdvisor(b, { nombre, cedula }));
const isPseudoAdvisor = n => !n || n === 'Sin asesor' || /^Formador/i.test(n);
// Todos los asesores conocidos de una tienda (configurados + semilla + data de zona + retirados) con su venta y estado
function storeAdvisors(st) {
    const out = [];
    const push = (nombre, cedula) => {
        if (isPseudoAdvisor(nombre)) return null;
        const probe = { nombre, cedula };
        let a = out.find(x => sameAdvisor(x, probe));
        if (!a) a = out.find(x => { const cx = advDigits(x.cedula), cp = advDigits(cedula); return !(cx.length >= 5 && cp.length >= 5 && cx !== cp) && x.alias.some(n => nameSubset(n, nombre)); });
        if (!a) { a = { nombre, cedula: advDigits(cedula), total: 0, ventas: {}, alias: [nombre] }; out.push(a); }
        else { if (!a.cedula && cedula) a.cedula = advDigits(cedula); if (!a.alias.includes(nombre)) a.alias.push(nombre); }
        return a;
    };
    const cfg = (st.asesores || []);
    cfg.forEach(n => push(n, (st.cedulas || {})[n]));
    if (!cfg.length) (st.asesoresSeed || []).forEach(n => push(n));
    const Z = typeof ZoneData !== 'undefined' ? ZoneData.forStore(st.id) : null;
    const addV = (a, x) => { a.total += x.total || 0; a.ventas = { ...(a.ventas || {}) }; Object.entries(x.ventas || {}).forEach(([k, v]) => { a.ventas[k] = (a.ventas[k] || 0) + (v || 0); }); a.sem = { ...(a.sem || {}) }; Object.entries(x.sem || {}).forEach(([k, v]) => { a.sem[k] = (a.sem[k] || 0) + (v || 0); }); a.semRef = JSON.parse(JSON.stringify(a.semRef || {})); Object.entries(x.semRef || {}).forEach(([w, r]) => { const o = a.semRef[w] = a.semRef[w] || {}; Object.entries(r).forEach(([k, v]) => { o[k] = (o[k] || 0) + v; }); }); };
    if (Z && Z.asesores) Object.values(Z.asesores).forEach(x => { const a = push(x.nombre, x.cedula); if (a) addV(a, x); });
    (st.bajas || []).forEach(b => push(b.nombre, b.cedula));
    out.forEach(a => { a.activo = !isBaja(st, a.nombre, a.cedula) && !a.alias.some(n => isBaja(st, n, a.cedula)); });
    // Asesor de apoyo en otra tienda (vendió aquí pero su meta está en otra tienda de la zona): sus unidades siguen en la venta
    // de esta tienda, pero como asesor se mide en su tienda de origen, donde se le suma lo que vendió aquí (igual que el seguimiento por asesor)
    const listed = (s, a) => s.metasAsesor && Object.keys(s.metasAsesor).some(k => a.alias.some(n => sameAdvisor({ nombre: k }, { nombre: n })));
    out.forEach(a => {
        if (st.metasAsesor && !listed(st, a)) { const home = State.stores.find(s => s.id !== st.id && s.zona === st.zona && listed(s, a)); if (home) { a.home = home.id; a.homeTienda = home.tienda; } }
    });
    const ZS = State.zoneSnaps && State.zoneSnaps[st.zona];
    if (st.metasAsesor && ZS && ZS.stores) out.filter(a => !a.home && listed(st, a)).forEach(a => {
        Object.entries(ZS.stores).forEach(([sid, S]) => {
            if (sid === st.id) return; const other = storeById(sid); if (!other || listed(other, a)) return;
            Object.values(S.asesores || {}).forEach(x => { if (a.alias.some(n => sameAdvisor({ nombre: n, cedula: a.cedula }, { nombre: x.nombre, cedula: x.cedula }))) { addV(a, x); (a.otras = a.otras || []).push({ tienda: other.tienda, total: x.total || 0 }); } });
        });
    });
    return out;
}
const activeAdvisors = st => storeAdvisors(st).filter(a => a.activo && !a.home);
const scopedZones = () => (isAllZones() ? State.zones.map(z => z.nombre) : myZones()).sort();
// Meta del mes: el total fijado para la tienda o, si no hay, la suma de las metas por referencia.
// Se escribe una sola vez y se mantiene hasta que alguien la cambie.
const storeMetaMes = st => int(st && st.metaMes) || sum(INFINIX_MODELS.map(m => int(st && st.metas && st.metas[m.key])));
// Inserta o reemplaza en el estado sin duplicar (el listener en tiempo real puede haber llegado antes)
const upsertState = (key, doc) => { State[key] = State[key].filter(x => x.id !== doc.id).concat(doc); };
const storeInvTotal = st => sum(INFINIX_MODELS.map(m => int(st && st.inventario && st.inventario[m.key])));

function chainLogo(logoKey, label, cls = '') {
    const c = CHAINS[normLogoKey(logoKey)];
    if (c.logo && LOGOS[c.logo]) return `<img class="chain-logo ${cls}" src="${LOGOS[c.logo]}" alt="${esc(c.name)}">`;
    return `<span class="chain-badge ${cls}" style="background:${c.color};color:${c.ink}">${esc(label || 'OTRA')}</span>`;   // cadena escrita a mano
}
const storeLogo = (st, cls) => chainLogo(st && st.logoKey, st && st.cadena, cls);

// ---------- Arranque ---------------------------------------------------------
async function boot() {
    Data.init();
    if (!Data.hasCloud()) $('#local-banner').hidden = false;      // el SDK de Firebase no cargó: se trabaja solo en este equipo
    $('#brand-logo').src = LOGO_INFINIX;
    Data.onStatus(v => {
        const dot = $('#conn'), ban = $('#local-banner');
        if (dot) { dot.className = 'conn ' + (v ? 'on' : 'off'); dot.title = v ? 'Conectado a la nube' : 'Sin conexión: trabajando con respaldo local'; }
        if (ban && Data.denied()) { ban.hidden = false; ban.textContent = 'Firebase respondió "sin permisos": falta publicar las reglas de Firestore (ver LEEME). Mientras tanto los datos quedan en este equipo.'; }
        else if (ban && Data.hasCloud()) ban.hidden = true;
    });

    // 1) Respaldo local inmediato (la app abre aunque no haya red)
    Data.seedLocal(COL.zones, INITIAL_ZONES_SEED);
    Data.seedLocal(COL.stores, INITIAL_STORES_SEED);                 // aditiva: agrega las tiendas de la semilla que falten
    Data.seedLocal(COL.staff, staffSeedDocs());
    State.stores = officialStores(Data.local(COL.stores)); State.zones = Data.local(COL.zones); State.staff = Data.local(COL.staff);
    try { State.session = JSON.parse(localStorage.getItem('opscore_session')); } catch (e) { State.session = null; }
    renderLogin();
    if (State.session && (State.session.type === 'staff' || storeById(State.session.storeId))) enterApp();

    // 2) Nube: sembrar si está vacía, cargar configuración y escuchar cambios
    const [st, zn, sf, cfgAuth, cfgRates, cfgDemo, cfgCom, cfgCad, cfgRad, cfgSeed] = await Promise.all([
        Data.fetch(COL.stores), Data.fetch(COL.zones), Data.fetch(COL.staff),
        Data.get(COL.config, 'auth'), Data.get(COL.config, 'rates'), Data.get(COL.config, 'demo'), Data.get(COL.config, 'comisiones'), Data.get(COL.config, 'cadenas'), Data.get(COL.config, 'radar'), Data.get(COL.config, 'seed')
    ]);
    if (cfgRad && Array.isArray(cfgRad.focoRefs)) State.radar = { ...DEFAULT_RADAR, ...cfgRad };
    if (cfgCad && Array.isArray(cfgCad.off)) State.cadenas = { off: cfgCad.off };
    if (cfgCom && cfgCom.plan === PLAN_ID) State.comisiones = { ...JSON.parse(JSON.stringify(DEFAULT_COMISIONES)), ...cfgCom, valores: { ...DEFAULT_COMISIONES.valores, ...(cfgCom.valores || {}) }, valoresAcc: { ...DEFAULT_COMISIONES.valoresAcc, ...(cfgCom.valoresAcc || {}) } };
    else if (cfgCom && cfgCom.kpiPay) State.comisiones = { ...JSON.parse(JSON.stringify(DEFAULT_COMISIONES)), kpiPay: cfgCom.kpiPay, nota: cfgCom.nota || DEFAULT_COMISIONES.nota };   // plan anterior: se toma el oficial de noviembre
    else if (false && cfgCom && cfgCom.valores) State.comisiones = { ...JSON.parse(JSON.stringify(DEFAULT_COMISIONES)), ...cfgCom, valores: { ...DEFAULT_COMISIONES.valores, ...cfgCom.valores }, valoresAcc: { ...DEFAULT_COMISIONES.valoresAcc, ...(cfgCom.valoresAcc || {}) } };
    // Siembra aditiva en la nube: lo que falte de la semilla (tiendas, zonas, usuarios base) se crea en un lote
    if (st.fromServer || zn.fromServer || sf.fromServer) {
        const ops = [];
        const add = (col, docs, have) => docs.filter(d => !have.some(x => x.id === d.id)).forEach(d => { const doc = { ...d, createdAt: Date.now() }; have.push(doc); ops.push({ op: 'set', col, id: d.id, data: doc, merge: false }); });
        if (st.fromServer) add(COL.stores, INITIAL_STORES_SEED, st.docs);
        if (zn.fromServer) add(COL.zones, INITIAL_ZONES_SEED, zn.docs);
        if (sf.fromServer) add(COL.staff, staffSeedDocs(), sf.docs);
        if (ops.length) await Data.batch(ops);
    }
    if (cfgAuth) State.auth = { ...DEFAULT_MASTER_HASH, ...cfgAuth };
    if (cfgRates) Object.keys(cfgRates).forEach(k => { if (State.rates[k] && cfgRates[k] && typeof cfgRates[k] === 'object') State.rates[k] = { ...State.rates[k], ...cfgRates[k] }; });
    State.demo = cfgDemo || null;
    applyCollections({ stores: st.docs, zones: zn.docs, staff: sf.docs });
    await applySeedUpgrade(cfgSeed, st.docs);
    Data.watch(COL.stores, docs => applyCollections({ stores: docs }));
    Data.watch(COL.zones, docs => applyCollections({ zones: docs }));
    Data.watch(COL.staff, docs => applyCollections({ staff: docs }));
    Data.flush();
    if (State.session && typeof ZoneData !== 'undefined') { const zs = State.session.type === 'store' ? [(currentStore() || {}).zona] : scopedZones(); ZoneData.loadMany(zs.filter(Boolean), todayStr().slice(0, 7)).catch(() => { }); if (State.session.type === 'staff' && typeof Evals !== 'undefined') Evals.load(zs.filter(Boolean), todayStr().slice(0, 7)).catch(() => { }); }
    // Primera vez con la base vacía: se cargan los datos de demostración (se borran desde Gestión › Configuración)
    if (DEMO_AUTOLOAD && !State.demo && typeof Demo !== 'undefined' && (st.fromServer || !Data.hasCloud() || Data.denied())) {
        await Demo.load({ silent: true });
        toast('Datos de demostración cargados. Se restauran de cero en Gestión › Configuración.', 'info', 6000);
        if (State.session && State.tab) navigate(State.tab);
    }
}

// Regla de oro: en toda la app solo existen las tiendas de las 7 cadenas oficiales
const officialStores = arr => (arr || []).filter(s => normLogoKey(s.logoKey) !== 'otro');
// Actualización de la data base del mes (targets, HC, KPI de comisión, asesores, inventario): se aplica una sola vez por versión
// de semilla. Quita la data de demostración y respeta lo que es propio de cada tienda (asesores retirados, foco, contraseña).
// Ajustes manuales: lo que el staff corrige a mano queda marcado y ninguna carga automática lo pisa
const MANUAL_KEYS = ['asesores', 'hc', 'metas', 'metaMes', 'metasComp', 'metasAcc', 'metasAsesor', 'kpi'];
const markManual = (st, fields) => ({ manualFields: [...new Set([...((st && st.manualFields) || []), ...fields.filter(f => MANUAL_KEYS.includes(f))])], manualAt: Date.now(), manualBy: (State.session && State.session.nombre) || '' });
const isManual = (st, f) => !!(st && (st.manualFields || []).includes(f));
const seedOf = id => (typeof INITIAL_STORES_SEED !== 'undefined' ? INITIAL_STORES_SEED : []).find(s => s.id === id) || null;
function seedFields(st, s) {
    const upd = {
        cadena: s.cadena, logoKey: s.logoKey, zona: s.zona, regional: s.regional, tienda: st.tienda || s.tienda,
        metas: s.metas || {}, metaMes: s.metaMes || 0, kpi: s.kpi || null, capa: s.capa || 0,
        hc: { ...(st.demoConfig ? {} : (st.hc || {})), ...(s.hc || {}) },
        metasAsesor: s.metasAsesor || null, asesoresApoyo: s.asesoresApoyo || [], targetsAsesor: null,
        metasComp: null, isConfigured: true, demoConfig: false, seedVersion: SEED_VERSION, updatedAt: Date.now()
    };
    if (s.inventario) { upd.inventario = s.inventario; upd.invAt = '2026-11-17'; }
    if (s.asesoresSeed && s.asesoresSeed.length) upd.asesores = s.asesoresSeed.slice();
    if (s.ciudad && !st.ciudad) upd.ciudad = s.ciudad;
    (st.manualFields || []).forEach(f => { delete upd[f]; if (f === 'metas') delete upd.metaMes; });      // lo manual manda
    return upd;
}
// Devuelve una tienda a los datos automáticos (data base del mes) y quita las marcas de ajuste manual
function restoreAuto(st) {
    const s = seedOf(st.id), upd = { manualFields: [], manualAt: null, manualBy: null, updatedAt: Date.now() };
    if (s) {
        const base = seedFields({ ...st, manualFields: [] }, s);
        (st.manualFields || []).forEach(f => { if (f in base) upd[f] = base[f]; if (f === 'metas') upd.metaMes = base.metaMes; });
        if ((st.manualFields || []).includes('asesores')) upd.asesores = (s.asesoresSeed || []).slice();
    }
    return upd;
}
async function applySeedUpgrade(cfgSeed, docs) {
    if (typeof SEED_VERSION === 'undefined' || (cfgSeed && cfgSeed.version === SEED_VERSION)) return;
    try {
        if (State.demo && State.demo.loaded && typeof Demo !== 'undefined') await Demo.clear();
        const ops = [], seed = new Map(INITIAL_STORES_SEED.map(s => [s.id, s]));
        State.stores.forEach(st => { const s = seed.get(st.id); if (!s) return; const upd = seedFields(st, s); Object.assign(st, upd); ops.push({ op: 'set', col: COL.stores, id: st.id, data: upd, merge: true }); });
        ops.push({ op: 'set', col: COL.config, id: 'seed', data: { version: SEED_VERSION, at: Date.now() }, merge: false });
        await Data.batch(ops);
        if (State.session && State.tab) navigate(State.tab);
    } catch (e) { console.warn('seed upgrade', e); }
}

function applyCollections(part) {
    if (part.stores) State.stores = officialStores(part.stores);
    if (part.zones) State.zones = part.zones;
    if (part.staff) State.staff = part.staff;
    // Sesión de un usuario eliminado por el Coordinador/Admin: se cierra sola
    const s = State.session;
    if (s && s.type === 'staff' && part.staff && !State.staff.some(u => u.id === s.userId)) { toast('Tu usuario fue retirado. Vuelve a registrarte si corresponde.', 'warn'); logout(); return; }
    if (s && s.type === 'store' && part.stores && !storeById(s.storeId)) { logout(); return; }
    if (!State.session) { refreshLoginLists(); return; }
    renderHeader();
    const mod = Modules[State.tab];
    if (mod && mod.onData && !$('#modal-root').children.length) mod.onData(part);
}

// ---------- Login dual -------------------------------------------------------
function renderLogin() {
    const el = $('#login-screen');
    el.innerHTML = `
    <div class="login-card">
        <img class="login-logo" src="${LOGO_INFINIX}" alt="Infinix">
        <h1 class="login-title">Central de <span>Operaciones</span></h1>
        <p class="login-sub">Panel operativo y de ejecución retail</p>
        <div class="seg" role="tablist">
            <button class="seg-btn active" data-mode="store">Acceso Tienda (PDV)</button>
            <button class="seg-btn" data-mode="staff">Acceso Administrativo</button>
        </div>

        <form id="login-store" class="login-form" autocomplete="off">
            <label class="lbl">Punto de venta</label>
            <div class="ac">
                <input id="ls-search" class="input" placeholder="Escribe el nombre de tu tienda…" autocomplete="off">
                <div id="ls-list" class="ac-list" hidden></div>
            </div>
            <label class="lbl">Contraseña de tienda</label>
            <input id="ls-pass" class="input" type="password" placeholder="••••••••" autocomplete="current-password">
            <p id="ls-err" class="err" hidden></p>
            <button class="btn btn-primary btn-block" type="submit">Ingresar al PDV</button>
        </form>

        <form id="login-staff" class="login-form" autocomplete="off" hidden>
            <div id="lf-login-fields">
                <label class="lbl">Código DCR</label>
                <input id="lf-dcr" class="input" placeholder="Ej. DCR-1023" autocomplete="username" autocapitalize="characters">
                <label class="lbl">Contraseña</label>
                <input id="lf-pass" class="input" type="password" placeholder="••••••••" autocomplete="current-password">
            </div>
            <div id="lf-reg" hidden>
                <p class="hint" id="lf-reg-hint">Si eres nuevo, la contraseña actual es la clave inicial de tu cargo. Si ya tienes usuario, aquí cambias tu contraseña.</p>
                <label class="lbl">Cargo</label>
                <select id="lf-rol" class="input">${STAFF_ROLES.filter(r => r !== 'admin').map(r => `<option value="${r}">${ROLES[r].label}</option>`).join('')}</select>
                <label class="lbl">Nombre completo</label>
                <input id="lf-nombre" class="input" placeholder="Nombre y apellido">
                <label class="lbl">Código DCR</label>
                <input id="lf-dcr-reg" class="input" placeholder="Tu código DCR" autocapitalize="characters">
                <div id="lf-zona-wrap">
                    <label class="lbl">Zona / Regional asignada</label>
                    <select id="lf-zona" class="input"></select>
                    <input id="lf-zona-new" class="input" placeholder="Nombre de la nueva zona" hidden style="margin-top:8px">
                </div>
                <label class="lbl">Contraseña actual / clave inicial del cargo</label>
                <input id="lf-actual" class="input" type="password" autocomplete="off">
                <label class="lbl">Nueva contraseña (mínimo 6 caracteres)</label>
                <input id="lf-nueva" class="input" type="password" autocomplete="new-password">
            </div>
            <p id="lf-err" class="err" hidden></p>
            <button class="btn btn-primary btn-block" type="submit" id="lf-submit">Ingresar</button>
            <button class="btn btn-link btn-block" type="button" id="lf-toggle">Registrarme / Cambiar contraseña</button>
        </form>

        <p class="login-foot">Infinix · Central de Operaciones v${OPS_VERSION}</p>
    </div>`;

    // Entrada directa al demo: carga los datos de prueba si aún no existen y abre la sesión
    $$('[data-demo]', el).forEach(b => b.onclick = async () => {
        const kind = b.dataset.demo, err = $('#demo-err'); err.hidden = true;
        busy(b, true);
        try {
            const hasDemo = () => State.staff.some(u => u.demo) && State.stores.some(s => s.demoConfig);
            if (!hasDemo()) { await Demo.load({ silent: true }); State.demo = { loaded: true, at: Date.now() }; }
            if (kind === 'store') {
                const st = State.stores.find(s => s.demoConfig && s.lastClosure && DEMO_CLOSURE_ZONES.includes(s.zona)) || State.stores.find(s => s.demoConfig) || State.stores[0];
                setSession({ type: 'store', rol: 'asesor', storeId: st.id });
            } else {
                const u = State.staff.find(x => x.demo && x.rol === kind);
                if (!u) throw new Error('No se encontró el usuario de demostración.');
                setSession({ type: 'staff', rol: u.rol, userId: u.id, nombre: u.nombre, zona: u.zona, regional: u.regional || '', dcr: u.dcr || '' });
            }
            enterApp();
        } catch (e) { busy(b, false); err.textContent = 'No se pudo abrir el demo: ' + (e.message || e); err.hidden = false; }
    });

    // Conmutador Tienda | Staff
    $$('.seg-btn', el).forEach(b => b.onclick = () => {
        $$('.seg-btn', el).forEach(x => x.classList.toggle('active', x === b));
        $('#login-store').hidden = b.dataset.mode !== 'store';
        $('#login-staff').hidden = b.dataset.mode !== 'staff';
    });

    // Buscador autocompletable de tiendas
    const search = $('#ls-search'), list = $('#ls-list');
    const paint = () => {
        const q = slug(search.value);
        const items = State.stores.filter(s => !q || slug(s.usuario + ' ' + s.tienda + ' ' + s.ciudad).includes(q))
            .sort((a, b) => a.usuario.localeCompare(b.usuario, 'es')).slice(0, 40);
        list.innerHTML = items.length ? items.map(s => `<button type="button" class="ac-item" data-id="${esc(s.id)}">${storeLogo(s, 'sm')}<span><b>${esc(s.usuario)}</b><small>${esc(s.ciudad || '')} · ${esc(s.zona || '')}</small></span></button>`).join('')
            : '<div class="ac-empty">Sin coincidencias. Pide a tu coordinador que cree la tienda.</div>';
        list.hidden = false;
    };
    search.addEventListener('focus', paint);
    search.addEventListener('input', () => { delete search.dataset.id; paint(); });
    list.addEventListener('click', e => {
        const it = e.target.closest('.ac-item'); if (!it) return;
        const s = storeById(it.dataset.id); search.value = s.usuario; search.dataset.id = s.id; list.hidden = true; $('#ls-pass').focus();
    });
    document.addEventListener('click', e => { if (!e.target.closest('.ac')) list.hidden = true; });

    $('#login-store').addEventListener('submit', e => {
        e.preventDefault();
        const err = $('#ls-err'); err.hidden = true;
        let st = storeById(search.dataset.id);
        if (!st) st = State.stores.find(s => slug(s.usuario) === slug(search.value));
        if (!st) { err.textContent = 'Selecciona tu punto de venta de la lista.'; err.hidden = false; return; }
        if (pwdHash($('#ls-pass').value) !== (st.passHash || State.auth.store)) { err.textContent = 'Contraseña de tienda incorrecta.'; err.hidden = false; return; }
        setSession({ type: 'store', rol: 'asesor', storeId: st.id });
        enterApp();
    });

    // Staff: ingreso por código DCR + contraseña; registro con la clave inicial del cargo
    const rolSel = $('#lf-rol'), regBox = $('#lf-reg'), toggle = $('#lf-toggle');
    const setReg = on => {
        regBox.hidden = !on; $('#lf-login-fields').hidden = on;
        $('#lf-submit').textContent = on ? 'Guardar y entrar' : 'Ingresar';
        toggle.textContent = on ? 'Volver a ingresar' : 'Registrarme / Cambiar contraseña';
        $('#lf-err').hidden = true;
        if (on && !$('#lf-dcr-reg').value) $('#lf-dcr-reg').value = $('#lf-dcr').value;
    };
    toggle.onclick = () => setReg(regBox.hidden);
    rolSel.onchange = () => refreshLoginLists();
    $('#lf-zona').onchange = () => { $('#lf-zona-new').hidden = $('#lf-zona').value !== '__new'; };
    refreshLoginLists();

    $('#login-staff').addEventListener('submit', async e => {
        e.preventDefault();
        const err = $('#lf-err'); err.hidden = true;
        const fail = m => { err.textContent = m; err.hidden = false; };
        if (regBox.hidden) {                 // --- Ingreso normal
            const code = normDcr($('#lf-dcr').value), h = pwdHash($('#lf-pass').value);
            if (!code) return fail('Escribe tu código DCR.');
            const u = staffByDcr(code);
            if (!u) {
                // Clave inicial de algún cargo → pasa al registro con el cargo detectado
                const rol = STAFF_ROLES.find(r => State.auth[r] === h);
                if (rol) { setReg(true); $('#lf-dcr-reg').value = code; $('#lf-actual').value = $('#lf-pass').value; if (rol !== 'admin') rolSel.value = rol; refreshLoginLists(); $('#lf-reg-hint').textContent = 'Clave inicial correcta. Completa tus datos y crea tu contraseña personal.'; return; }
                return fail('Código DCR no registrado. Si eres nuevo, toca "Registrarme" y usa la clave inicial de tu cargo.');
            }
            if (u.passHash !== h) return fail('Contraseña incorrecta.');
            setSession({ type: 'staff', rol: u.rol, userId: u.id, nombre: u.nombre, zona: u.zona, regional: u.regional || '', dcr: u.dcr || '' });
            return enterApp();
        }
        // --- Registro / cambio de contraseña (autogestión, sin soporte técnico)
        const nombre = $('#lf-nombre').value.trim().replace(/\s+/g, ' ');
        const code = normDcr($('#lf-dcr-reg').value);
        const actual = pwdHash($('#lf-actual').value), nueva = $('#lf-nueva').value;
        if (nombre.length < 5) return fail('Escribe tu nombre completo.');
        if (!code) return fail('Escribe tu código DCR.');
        if (nueva.length < 6) return fail('La nueva contraseña debe tener al menos 6 caracteres.');
        const existing = staffByDcr(code);
        // El cargo sale del usuario existente; si es nuevo, del selector, salvo que la clave inicial sea la de Administrador (oculto)
        let rol = existing ? existing.rol : (actual === State.auth.admin ? 'admin' : rolSel.value);
        if (existing) { if (existing.passHash !== actual) return fail('Ese código DCR ya está registrado: la contraseña actual no coincide.'); }
        else if (actual !== State.auth[rol]) return fail('La clave inicial del cargo no es correcta.');
        if (!existing && rol === 'admin' && State.staff.some(u => u.rol === 'admin')) return fail('Ya existe el usuario Administrador.');
        if (STAFF_ROLES.some(r => pwdHash(nueva) === State.auth[r])) return fail('La nueva contraseña no puede ser una clave inicial.');
        let zona = existing ? existing.zona : 'NACIONAL', regional = existing ? (existing.regional || '') : '';
        if (!existing && rol !== 'admin') {
            zona = $('#lf-zona').value;
            if (zona === '__new') zona = $('#lf-zona-new').value.trim().toUpperCase();
            if (!zona) return fail(['coordinador', 'gerente'].includes(rol) ? 'Indica tu regional.' : 'Indica tu zona.');
            if (zona.startsWith('REG:')) { regional = zona.slice(4); zona = State.zones.filter(z => z.regional === regional).map(z => z.nombre).sort()[0] || regional; }
        }
        const id = existing ? existing.id : `u_${slug(code)}`;
        if (zona && zona !== 'NACIONAL' && !State.zones.some(z => z.nombre === zona)) {
            const z = { id: slug(zona), nombre: zona, createdBy: id, createdAt: Date.now() };
            await Data.set(COL.zones, z.id, z, false); upsertState('zones', z);
        }
        const user = { ...(existing || {}), id, rol, nombre, dcr: code, zona, regional, passHash: pwdHash(nueva), updatedAt: Date.now(), createdAt: (existing && existing.createdAt) || Date.now() };
        const r = await Data.set(COL.staff, id, user, false);
        upsertState('staff', user);
        setSession({ type: 'staff', rol, userId: id, nombre, zona, regional, dcr: code });
        toast(existing ? 'Contraseña actualizada' : (r.synced ? 'Usuario creado' : 'Usuario creado en este equipo; se sincronizará al tener conexión'), 'ok');
        enterApp();
    });
}

const normDcr = v => String(v || '').trim().toUpperCase().replace(/\s+/g, '');
// Usuarios base de la semilla con su contraseña ya cifrada
const staffSeedDocs = () => INITIAL_STAFF_SEED.map(u => { const { pass, ...rest } = u; return { ...rest, passHash: pwdHash(pass), base: true, createdAt: 0, updatedAt: 0 }; });
const zoneRegional = zona => { const z = State.zones.find(x => x.nombre === zona); return z && z.regional ? z.regional : ''; };
const regionales = () => [...new Set(State.zones.map(z => z.regional).filter(Boolean))].sort();
const staffByDcr = code => State.staff.find(u => normDcr(u.dcr) === code) || State.staff.find(u => u.id === code.toLowerCase()) || null;

function refreshLoginLists() {
    const rolSel = $('#lf-rol'); if (!rolSel) return;
    const rol = rolSel.value;
    const regional = ['coordinador', 'gerente'].includes(rol);
    const zsel = $('#lf-zona'), prevZ = zsel.value, lbl = $('#lf-zona-wrap .lbl');
    if (lbl) lbl.textContent = regional ? 'Regional a cargo' : 'Zona asignada';
    if (regional) {
        zsel.innerHTML = (rol === 'gerente' ? '<option value="NACIONAL">NACIONAL (todas las regionales)</option>' : '')
            + regionales().map(r => `<option value="REG:${esc(r)}">${esc(r)} · ${State.zones.filter(z => z.regional === r).length} zonas</option>`).join('')
            + (rol === 'coordinador' ? '<option value="__new">➕ Crear nueva zona…</option>' : '');
    } else {
        const regs = regionales(), byReg = r => State.zones.filter(z => (z.regional || '') === r).map(z => z.nombre).sort();
        zsel.innerHTML = regs.map(r => `<optgroup label="${esc(r)}">${byReg(r).map(z => `<option value="${esc(z)}">${esc(z)}</option>`).join('')}</optgroup>`).join('')
            + (byReg('').length ? `<optgroup label="OTRAS">${byReg('').map(z => `<option value="${esc(z)}">${esc(z)}</option>`).join('')}</optgroup>` : '');
    }
    if ($$('option', zsel).some(o => o.value === prevZ)) zsel.value = prevZ;
    $('#lf-zona-new').hidden = zsel.value !== '__new';
}

function setSession(s) { State.session = s; try { localStorage.setItem('opscore_session', JSON.stringify(s)); } catch (e) { /* almacenamiento no disponible */ } }
function logout() {
    State.session = null; State.tab = null; try { localStorage.removeItem('opscore_session'); } catch (e) { /* sin almacenamiento */ }
    $('#modal-root').innerHTML = ''; document.body.classList.remove('no-scroll');
    $('#app').hidden = true; $('#login-screen').hidden = false; renderLogin();
}

// ---------- Shell y navegación por rol ---------------------------------------
function enterApp() {
    $('#login-screen').hidden = true; $('#app').hidden = false;
    loadChainView();
    renderHeader();
    const mods = ROLES[State.session.rol].modules;
    $('#tabs').innerHTML = mods.map(m => `<button class="tab" data-tab="${m}">${MODULE_LABELS[m]}</button>`).join('');
    $$('#tabs .tab').forEach(b => b.onclick = () => navigate(b.dataset.tab));
    navigate(mods.includes(State.tab) ? State.tab : mods[0]);
    const st = currentStore();
    if (st && !st.isConfigured) openStoreSettings(st.id, { onboarding: true });
}

function renderHeader() {
    const s = State.session, box = $('#user-chip'); if (!s || !box) return;
    if (s.type === 'store') {
        const st = currentStore(); if (!st) return;
        box.innerHTML = `${storeLogo(st, 'sm')}<span class="uc-txt"><b>${esc(st.tienda)}</b><small>${esc(st.ciudad || '')} · ${esc(st.zona || '')}</small></span>
            <button class="icon-btn" id="btn-store-cfg" title="Ajustes de tienda">⚙️</button>`;
        $('#btn-store-cfg').onclick = () => openStoreSettings(st.id);
    } else {
        const amb = isAllZones() ? 'Nacional' : (['coordinador', 'gerente'].includes(s.rol) && myRegional() ? `Regional ${esc(myRegional())}` : `Zona ${esc(s.zona || '—')}`);
        box.innerHTML = `<span class="avatar">${esc((s.nombre || '?').charAt(0).toUpperCase())}</span><span class="uc-txt"><b>${slug(s.nombre || '').startsWith(slug(ROLES[s.rol].label)) ? '' : ROLES[s.rol].label + ' '}${esc(s.nombre)}</b><small>${amb}${s.dcr ? ' · DCR ' + esc(s.dcr) : ''}</small></span>`;
    }
}

function navigate(tab) {
    if (!State.session || !ROLES[State.session.rol].modules.includes(tab)) return;   // RBAC
    State.tab = tab;
    $$('#tabs .tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    // Contenedor nuevo en cada cambio de pestaña: así no quedan listeners huérfanos del módulo anterior
    const old = $('#view'), view = old.cloneNode(false); old.replaceWith(view);
    Charts.destroyAll('view');
    const mod = Modules[tab];
    if (mod) mod.render(view); else view.innerHTML = '<div class="card">Módulo no disponible.</div>';
    window.scrollTo(0, 0);
}

// ---------- Ajustes de tienda (onboarding y edición) --------------------------
function openStoreSettings(storeId, opts = {}) {
    const st = storeById(storeId); if (!st) return;
    // Asesores: los configurados o, la primera vez, los que trae la data DCR para ese PDV
    const as = ((st.asesores && st.asesores.length) ? st.asesores : (st.asesoresSeed || [])).filter(n => !isBaja(st, n, (st.cedulas || {})[n])), hc = st.hc || {}, inv = st.inventario || {}, metas = st.metas || {};
    const foco = st.foco || {};
    const metasComp = st.metasComp || {}, invAcc = st.invAcc || {}, metasAcc = st.metasAcc || {};
    const numIn = (id, v) => `<input class="input num" type="number" inputmode="numeric" min="0" id="${id}" value="${int(v)}">`;
    // El staff (supervisor, formador, coordinador, gerente) edita todo a mano: asesores, meta por asesor, targets y clave
    const staffEdit = !!(State.session && State.session.type === 'staff');
    const metaAs = st.metasAsesor || {};
    const metaKeyOf = n => Object.keys(metaAs).find(k => sameAdvisor({ nombre: k }, { nombre: n }) || nameSubset(k, n));
    const advRow = (n, i) => `<div class="adv-edit" data-row><input class="input" data-asn placeholder="Nombre del asesor ${i + 1}" value="${esc(n || '')}">${staffEdit ? `<input class="input num" type="number" inputmode="numeric" min="0" data-asm placeholder="—" title="Meta del mes del asesor (unidades)" value="${n && metaKeyOf(n) ? int(metaAs[metaKeyOf(n)]) : ''}">` : ''}<button type="button" class="icon-btn" data-asx title="Quitar asesor">✕</button></div>`;
    const manualTxt = (st.manualFields || []).length ? `<div class="manual-note">✋ Ajustado a mano${st.manualBy ? ' por ' + esc(st.manualBy) : ''}${st.manualAt ? ' el ' + dstr(new Date(st.manualAt)) : ''}: ${(st.manualFields || []).map(f => ({ asesores: 'asesores', hc: 'HC', metas: 'target por referencia', metaMes: 'target del mes', metasComp: 'target competencia', metasAcc: 'target accesorios', metasAsesor: 'meta por asesor', kpi: 'ROI' })[f] || f).join(', ')}. Las cargas automáticas no cambian estos datos.${staffEdit ? ' <button type="button" class="btn btn-ghost sm" id="sc-auto">↺ Volver a datos automáticos</button>' : ''}</div>` : '';
    const m = openModal(`
        <h3 class="modal-title">${opts.onboarding ? 'Configuración inicial de la tienda' : 'Ajustes de tienda'}</h3>
        <p class="mute">${esc(st.tienda)} · ${esc(st.ciudad || '')}. ${opts.onboarding ? 'Se hace una sola vez; después el reporte abre listo para llenar.' : ''}</p>
        ${manualTxt}

        <h4 class="sec">1 · Cadena comercial</h4>
        <div class="row">
            <select id="sc-chain" class="input grow">${Object.keys(CHAINS).map(k => `<option value="${k}" ${k === normLogoKey(st.logoKey) ? 'selected' : ''}>${CHAINS[k].name}</option>`).join('')}</select>
            <span id="sc-logo" class="logo-prev">${storeLogo(st)}</span>
        </div>
        <input class="input" id="sc-chain-name" style="margin-top:8px" placeholder="Nombre de la cadena" value="${esc(normLogoKey(st.logoKey) === 'otro' ? st.cadena || '' : '')}" ${normLogoKey(st.logoKey) === 'otro' ? '' : 'hidden'}>

        <h4 class="sec">2 · Asesores asignados al PDV</h4>
        ${!(st.asesores && st.asesores.length) && (st.asesoresSeed || []).length ? '<p class="hint">Precargados desde la data DCR del PDV; corrige lo que haga falta.</p>' : ''}
        ${staffEdit ? '<div class="adv-edit head"><span>Nombre</span><span>Meta mes (uds)</span><span></span></div>' : ''}
        <div id="sc-advs">${(as.length ? as : ['']).map(advRow).join('')}</div>
        <div class="row between wrap" style="margin-top:6px"><button type="button" class="btn btn-ghost sm" id="sc-add">➕ Agregar asesor</button>${staffEdit ? '<small class="mute">Quitar a un asesor lo marca como retirado: sus unidades siguen en la venta de la tienda. Sin meta, se reparte el target de la tienda.</small>' : ''}</div>
        ${opts.onboarding ? '' : `<div class="row end" style="margin-top:8px"><button type="button" class="btn btn-ghost sm" id="sc-photos">📸 Fotos del equipo (medio cuerpo, con uniforme)</button></div>`}

        <h4 class="sec">2b · Foco de la semana <small class="mute">(lo ajusta el supervisor o formador; cambia semana a semana)</small></h4>
        <div class="row wrap" style="gap:8px">
            <select class="input grow" id="sc-foco-ref"><option value="">— Referencia foco automática (mayor brecha frente al target) —</option>${INFINIX_MODELS.map(x => `<option value="${x.key}" ${foco.ref === x.key ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
            <input class="input grow" id="sc-foco-nota" placeholder="Foco de trabajo (ej. Movimiento de mesa · Note Edge)" value="${esc(foco.nota || '')}">
        </div>

        <h4 class="sec">3 · Headcount y target del mes por marca</h4>
        <p class="hint">Se fijan una vez. La meta de Infinix sale de la suma por referencia (punto 4).</p>
        <table class="tbl compact"><thead><tr><th>Marca</th><th>HC (promotores)</th><th>Target mes</th></tr></thead><tbody>
            ${BRANDS.map(b => `<tr class="${b === 'INFINIX' ? 'row-own' : ''}"><td><span class="dot" style="background:${BRAND_COLORS[b]}"></span><b>${b}</b></td><td>${numIn('sc-hc-' + b, hc[b] ?? (b === 'INFINIX' ? Math.max(1, as.filter(Boolean).length) : 0))}</td><td>${b === 'INFINIX' ? `<input class="input num" id="sc-mc-INFINIX" value="${storeMetaMes(st) || 0}" readonly>` : numIn('sc-mc-' + b, metasComp[b])}</td></tr>`).join('')}
        </tbody></table>

        <h4 class="sec">4 · Target del mes e inventario por referencia Infinix</h4>
        <table class="tbl compact"><thead><tr><th>Referencia</th><th>Target mes</th><th>Inventario</th></tr></thead><tbody>
            ${INFINIX_MODELS.map(x => `<tr><td>${esc(x.name)}</td><td>${numIn('sc-meta-' + x.key, metas[x.key])}</td><td>${numIn('sc-inv-' + x.key, inv[x.key])}</td></tr>`).join('')}
        </tbody></table>

        <h4 class="sec">5 · Target e inventario de accesorios</h4>
        <table class="tbl compact"><thead><tr><th>Accesorio</th><th>Target mes</th><th>Inventario</th></tr></thead><tbody>
            ${INFINIX_ACCESSORIES.map(x => `<tr><td>${esc(x.name)}</td><td>${numIn('sc-macc-' + x.key, metasAcc[x.key])}</td><td>${numIn('sc-iacc-' + x.key, invAcc[x.key])}</td></tr>`).join('')}
        </tbody></table>

        <h4 class="sec">6 · Comisiones</h4>
        <p class="hint">El plan comisional es general y lo fija el Administrador en Gestión › Configuración. En la Calculadora cada asesor ve su target (el de la tienda repartido entre los asesores) y lo que lleva ganado.</p>

        <h4 class="sec">7 · Contraseña de la tienda (opcional)</h4>
        <div class="row wrap" style="gap:8px"><input class="input grow" type="${staffEdit ? 'text' : 'password'}" id="sc-pass" placeholder="Nueva contraseña · dejar vacío para conservar la actual" autocomplete="new-password">${staffEdit ? '<button type="button" class="btn btn-ghost sm" id="sc-pass-reset">🔑 Volver a la clave inicial</button>' : ''}</div>

        <p id="sc-err" class="err" hidden></p>
        <div class="row end" style="margin-top:16px">
            ${opts.onboarding ? '<button class="btn btn-ghost" id="sc-out">Cerrar sesión</button>' : '<button class="btn btn-ghost" id="sc-cancel">Cancelar</button>'}
            <button class="btn btn-primary" id="sc-save">Guardar configuración</button>
        </div>`, { wide: true, locked: !!opts.onboarding });

    const chainPrev = () => {
        const k = $('#sc-chain', m).value; $('#sc-chain-name', m).hidden = k !== 'otro';
        $('#sc-logo', m).innerHTML = chainLogo(k, $('#sc-chain-name', m).value.toUpperCase());
    };
    $('#sc-chain', m).onchange = chainPrev; $('#sc-chain-name', m).oninput = chainPrev;
    m.addEventListener('input', e => { if (e.target.id && e.target.id.startsWith('sc-meta-')) $('#sc-mc-INFINIX', m).value = sum(INFINIX_MODELS.map(x => int($('#sc-meta-' + x.key, m).value))); });
    if ($('#sc-out', m)) $('#sc-out', m).onclick = logout;
    if ($('#sc-cancel', m)) $('#sc-cancel', m).onclick = () => closeModal(m);
    if ($('#sc-photos', m)) $('#sc-photos', m).onclick = () => { if (typeof openAdvisorPhotos === 'function') openAdvisorPhotos(st.id); };
    $('#sc-add', m).onclick = () => { const box = $('#sc-advs', m); box.insertAdjacentHTML('beforeend', advRow('', box.children.length)); $('[data-row]:last-child [data-asn]', box).focus(); };
    $('#sc-advs', m).onclick = e => { const x = e.target.closest('[data-asx]'); if (!x) return; const box = $('#sc-advs', m); if (box.children.length > 1) x.closest('[data-row]').remove(); else $('[data-asn]', box).value = ''; };
    if ($('#sc-pass-reset', m)) $('#sc-pass-reset', m).onclick = async () => {
        if (!await confirmBox('La tienda volverá a entrar con la clave inicial de PDV. ¿Restablecer?', 'Restablecer')) return;
        await Data.set(COL.stores, st.id, { passHash: null }, true); st.passHash = null; toast('Contraseña restablecida a la clave inicial', 'ok');
    };
    if ($('#sc-auto', m)) $('#sc-auto', m).onclick = async () => {
        if (!await confirmBox('Se quitan los ajustes manuales y la tienda vuelve a los datos de la carga automática (target, HC, asesores y metas). ¿Continuar?', 'Volver a automático')) return;
        const upd = restoreAuto(st); await Data.set(COL.stores, st.id, upd, true); Object.assign(st, upd);
        closeModal(m); toast('Tienda de nuevo con datos automáticos', 'ok'); openStoreSettings(st.id, opts);
    };
    $('#sc-save', m).onclick = async () => {
        const rows = $$('#sc-advs [data-row]', m).map(r => ({ n: $('[data-asn]', r).value.trim().replace(/\s+/g, ' '), meta: staffEdit ? $('[data-asm]', r).value.trim() : '' })).filter(x => x.n);
        const asesores = [...new Set(rows.map(x => x.n))];
        const err = $('#sc-err', m);
        if (!asesores.length) { err.textContent = 'Registra al menos un asesor.'; err.hidden = false; return; }
        const logoKey = $('#sc-chain', m).value, pass = $('#sc-pass', m).value;
        if (pass && pass.length < 6) { err.textContent = 'La contraseña debe tener al menos 6 caracteres.'; err.hidden = false; return; }
        const chainName = $('#sc-chain-name', m).value.trim().toUpperCase();
        if (logoKey === 'otro' && !chainName) { err.textContent = 'Escribe el nombre de la cadena.'; err.hidden = false; return; }
        const upd = {
            logoKey, asesores, isConfigured: true, updatedAt: Date.now(),
            foco: { ref: $('#sc-foco-ref', m).value, nota: $('#sc-foco-nota', m).value.trim(), at: Date.now() },
            cedulas: Object.fromEntries(asesores.map(a => [a, (st.cedulas || {})[a] || ''])),
            hc: Object.fromEntries(BRANDS.map(b => [b, int($('#sc-hc-' + b, m).value)])),
            inventario: Object.fromEntries(INFINIX_MODELS.map(x => [x.key, int($('#sc-inv-' + x.key, m).value)])),
            metas: Object.fromEntries(INFINIX_MODELS.map(x => [x.key, int($('#sc-meta-' + x.key, m).value)])),
            metasComp: Object.fromEntries(BRANDS.filter(b => b !== 'INFINIX').map(b => [b, int($('#sc-mc-' + b, m).value)])),
            metasAcc: Object.fromEntries(INFINIX_ACCESSORIES.map(x => [x.key, int($('#sc-macc-' + x.key, m).value)])),
            invAcc: Object.fromEntries(INFINIX_ACCESSORIES.map(x => [x.key, int($('#sc-iacc-' + x.key, m).value)])),
        };
        // Si cambia la cadena, el nombre comercial sigue al logo; si no, se conserva (p. ej. "ALKOSTO CENTRO")
        if (logoKey === 'otro') upd.cadena = chainName;
        else if (normLogoKey(st.logoKey) !== logoKey || !st.cadena) upd.cadena = CHAINS[logoKey].name.toUpperCase();
        const sumMetas = sum(Object.values(upd.metas));
        if (sumMetas > 0) upd.metaMes = sumMetas;               // las metas por referencia definen el total del mes
        if (pass) upd.passHash = pwdHash(pass);
        if (staffEdit) {
            // Meta por asesor: se conserva el nombre con el que vino del seguimiento; sin valor = reparto del target de la tienda
            const nextMeta = { ...metaAs };
            as.forEach(n => { if (!asesores.some(a => sameAdvisor({ nombre: a }, { nombre: n }))) { const k = metaKeyOf(n); if (k) delete nextMeta[k]; } });
            rows.forEach(x => { const k = metaKeyOf(x.n); if (k) delete nextMeta[k]; if (x.meta !== '') nextMeta[k || x.n] = int(x.meta); });
            upd.metasAsesor = Object.keys(nextMeta).length ? nextMeta : null;
            // Quitar = retirado (sale de rankings y calculadora; sus unidades siguen en la tienda). Volver a agregarlo lo reactiva.
            const bajas = (st.bajas || []).filter(b => !asesores.some(a => sameAdvisor(b, { nombre: a }) || nameSubset(b.nombre, a)));
            as.filter(n => !asesores.some(a => sameAdvisor({ nombre: a }, { nombre: n }))).forEach(n => { if (!bajas.some(b => sameAdvisor(b, { nombre: n }))) bajas.push({ nombre: n, cedula: (st.cedulas || {})[n] || '', at: Date.now(), by: State.session.nombre }); });
            upd.bajas = bajas;
        }
        const norm = v => { if (v && typeof v === 'object' && !Array.isArray(v)) { const e = Object.entries(v).filter(([, x]) => x !== 0 && x !== '' && x != null).sort(); return e.length ? JSON.stringify(e) : 'null'; } return JSON.stringify(Array.isArray(v) ? (v.length ? v : null) : (v || null)); };
        const changed = MANUAL_KEYS.filter(k => k in upd && norm(upd[k]) !== norm(st[k]));
        if (changed.length && !opts.onboarding) Object.assign(upd, markManual(st, changed));
        const r = await Data.set(COL.stores, st.id, upd, true);
        Object.assign(st, upd);
        closeModal(m);
        toast(r.synced ? 'Tienda configurada' : 'Tienda configurada en este equipo; se sincronizará al tener conexión', 'ok');
        renderHeader();
        if (opts.onSaved) opts.onSaved(st); else if (State.tab) navigate(State.tab);
    };
}

// ---------- Gráficas (Chart.js) ----------------------------------------------
const Charts = {
    items: [],
    add(chart, scope) { this.items.push({ chart, scope }); return chart; },
    destroyAll(scope) { this.items = this.items.filter(it => { if (it.scope === scope) { try { it.chart.destroy(); } catch (e) { } return false; } return true; }); },
    // Anillo/torta estático para los lienzos (sin animación para que html2canvas lo capture completo)
    ring(canvas, values, colors, opts = {}) {
        if (typeof Chart === 'undefined') return null;
        const total = sum(values);
        return this.add(new Chart(canvas, {
            type: 'doughnut',
            data: { datasets: [{ data: total > 0 ? values : [1], backgroundColor: total > 0 ? colors : [THEME.line], borderWidth: opts.gap ? 2 : 0, borderColor: '#FFFFFF' }] },
            options: {
                responsive: false, animation: false, devicePixelRatio: 2, cutout: opts.cutout || '74%', events: [],
                rotation: opts.rotation || 0, circumference: opts.circumference || 360,
                plugins: { legend: { display: false }, tooltip: { enabled: false } }
            }
        }), opts.scope || 'stage');
    }
};
// Tarjeta con anillo de avance (valor/total) y texto central
function ringCardHTML(id, size, center, sub) {
    return `<div class="ring" style="width:${size}px;height:${size}px"><canvas id="${id}" width="${size}" height="${size}"></canvas>
        <div class="ring-c"><b>${center}</b>${sub ? `<small>${sub}</small>` : ''}</div></div>`;
}
const semaforo = ratio => ratio >= 1 ? { color: THEME.green, label: 'En meta', cls: 'ok' } : ratio >= 0.7 ? { color: THEME.amber, label: 'En riesgo', cls: 'warn' } : { color: THEME.red, label: 'Crítico', cls: 'bad' };

// ---------- Motor de exportación gráfica (html2canvas) ------------------------
const Exporter = {
    async render(build) {
        const stage = $('#stage');
        stage.innerHTML = ''; Charts.destroyAll('stage');
        const el = await build(stage);
        await Promise.all($$('img', el).map(img => img.complete ? null : new Promise(r => { img.onload = img.onerror = r; })));
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const canvas = await html2canvas(el, {
            scale: 2, backgroundColor: '#FFFFFF', useCORS: true, logging: false,
            width: el.offsetWidth, height: el.offsetHeight, windowWidth: el.offsetWidth + 80, scrollX: 0, scrollY: 0
        });
        Charts.destroyAll('stage'); stage.innerHTML = '';
        return canvas;
    }
};

// Descarga de archivos. En un navegador normal (GitHub Pages) usa un enlace de descarga.
// Si la app corre dentro de un visor que entrega su propio servicio de descargas
// (window.claude), se usa ese servicio, que pide confirmación a la persona.
async function downloadBlob(blob, name) {
    if (window.claude && typeof window.claude.use === 'function') {
        const cap = await window.claude.use('downloads').catch(() => null);
        if (cap) {
            try { await cap.save({ filename: name, data: blob }); return true; }
            catch (e) {
                if (e && e.code === 'declined') return false;
                if (e && e.code === 'rate_limited') { toast('Ya hay una descarga esperando confirmación.', 'warn'); return false; }
            }
        }
    }
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
}

// Los 3 botones obligatorios: Vista previa · Compartir en WhatsApp · Guardar imagen
const actionBarHTML = () => `
    <div class="actions">
        <button class="btn btn-ghost" data-act="preview">👁️ Vista previa</button>
        <button class="btn btn-wa" data-act="share">📲 Compartir en WhatsApp</button>
        <button class="btn btn-primary" data-act="save">💾 Guardar imagen</button>
    </div>`;

const ReportActions = {
    // cfg: { validate():string|null, build(stage):Promise<HTMLElement>, filename():string, title, persist?():Promise<{synced}>, afterStore?() }
    bind(root, cfg) {
        // Todo reporte que guarda datos tiene además "Solo guardar": registra en la nube sin generar imagen
        if (cfg.persist && !cfg.noStore) $$('.actions', root).forEach(bar => {
            if ($('[data-act="store"]', bar)) return;
            const b = document.createElement('button'); b.className = 'btn btn-ok'; b.dataset.act = 'store'; b.type = 'button';
            b.textContent = '✅ Solo guardar'; b.title = 'Guarda la información en el sistema sin generar imagen'; bar.prepend(b);
        });
        $$('[data-act]', root).forEach(btn => btn.onclick = () => this.run(btn.dataset.act, cfg, btn));
    },
    async make(cfg) {
        const canvas = await Exporter.render(cfg.build);
        const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
        return { blob, url: URL.createObjectURL(blob) };
    },
    async run(act, cfg, btn) {
        const err = cfg.validate ? cfg.validate() : null;
        if (err) { toast(err, 'warn'); return; }
        busy(btn, true);
        if (act === 'store') {
            try { await this.persist(cfg); if (cfg.afterStore) cfg.afterStore(); }
            finally { busy(btn, false); }
            return;
        }
        try {
            const out = await this.make(cfg);
            if (act === 'preview') this.preview(out, cfg);
            else if (act === 'share') await this.share(out, cfg);
            else await this.save(out, cfg);
        } catch (e) { console.error(e); toast('No se pudo generar la imagen: ' + (e.message || e), 'error'); }
        finally { busy(btn, false); }
    },
    preview(out, cfg) {
        const m = openModal(`<h3 class="modal-title">Vista previa</h3>
            <p class="mute">Así se enviará la imagen. Verifica datos y gráficas antes de compartir.</p>
            <div class="preview-box"><img src="${out.url}" alt="Vista previa del reporte"></div>
            <div class="actions"><button class="btn btn-wa" data-p="share">📲 Compartir en WhatsApp</button><button class="btn btn-primary" data-p="save">💾 Guardar imagen</button></div>`, { wide: true });
        $('[data-p="share"]', m).onclick = async () => { await this.share(out, cfg); closeModal(m); };
        $('[data-p="save"]', m).onclick = async () => { await this.save(out, cfg); closeModal(m); };
    },
    async share(out, cfg) {
        const file = new File([out.blob], cfg.filename(), { type: 'image/png' });
        const saving = this.persist(cfg);                        // Regla de oro: compartir = guardar en Firestore
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            try { await navigator.share({ files: [file], title: cfg.title || 'Central de Operaciones' }); }
            catch (e) { if (e.name !== 'AbortError' && await downloadBlob(out.blob, cfg.filename())) toast('No se pudo abrir el menú de compartir: la imagen se descargó.', 'warn'); }
        } else if (await downloadBlob(out.blob, cfg.filename())) {
            toast('Este navegador no comparte archivos directamente: la imagen se descargó para enviarla por WhatsApp Web.', 'info', 5200);
        }
        await saving;
    },
    async save(out, cfg) {
        const saving = this.persist(cfg);                        // Regla de oro: guardar imagen = guardar en Firestore
        await downloadBlob(out.blob, cfg.filename());
        await saving;
    },
    async persist(cfg) {
        if (!cfg.persist) return;
        try {
            const r = await cfg.persist();
            toast(r && r.synced ? 'Registro guardado en la nube ✔' : 'Registro guardado en el equipo; se sincronizará al recuperar conexión', r && r.synced ? 'ok' : 'info');
        } catch (e) { console.error(e); toast('La imagen se generó, pero el registro no se pudo guardar.', 'error'); }
    }
};

// ---------- Cálculo de indicadores de tienda (compartido por los módulos) ----
// A partir de los cierres diarios arma semanas, días, share, ROI y proyecciones.
const closureKeysFor = (storeId, fecha) => {
    const days = weekDays(fecha), prev = weekDays(addDays(days[0], -1));
    const yms = [fecha.slice(0, 7), days[0].slice(0, 7), days[6].slice(0, 7), prev[0].slice(0, 7)];
    return [...new Set(yms)].map(ym => `${storeId}_${ym}`);
};
const fetchStoreClosures = (storeId, fecha) => Data.list(COL.closures, [['storeMonth', 'in', closureKeysFor(storeId, fecha)]]);
const closureInfinix = c => sum(INFINIX_MODELS.map(m => int(c.ventas && c.ventas[m.key])));
const closureBrand = (c, b) => b === 'INFINIX' ? closureInfinix(c) : int(c.competencia && c.competencia[b]);

function computeStore(store, closures, fecha) {
    const ym = fecha.slice(0, 7);
    const byDate = {}; closures.forEach(c => { if (c.storeId === store.id) byDate[c.fecha] = c; });
    const monthCl = Object.values(byDate).filter(c => c.fecha.slice(0, 7) === ym && c.fecha <= fecha);
    const weeks = weeksOfMonth(ym), wk = isoWeek(fecha), days = weekDays(fecha);
    const prevDays = weekDays(addDays(days[0], -1));
    const today = byDate[fecha];
    const hc = { ...(store.hc || {}), ...((today && today.hc) || {}) };
    const metas = store.metas || {};
    const upTo = d => d <= fecha && byDate[d];

    const dowIdx = (parseD(fecha).getDay() + 6) % 7;                       // 0 = lunes … 6 = domingo
    const rowFor = getter => {
        const w = weeks.map(n => sum(monthCl.filter(c => isoWeek(c.fecha) === n).map(getter)));
        const d = days.map(ds => upTo(ds) ? getter(byDate[ds]) : 0);
        const prevAFecha = sum(prevDays.slice(0, dowIdx + 1).map(ds => byDate[ds] ? getter(byDate[ds]) : 0));   // semana anterior, mismos días
        const semana = sum(d);
        return { w, d, semana, mes: sum(w), prevAFecha, varSem: prevAFecha > 0 ? (semana - prevAFecha) / prevAFecha : (semana > 0 ? null : 0) };
    };

    const models = INFINIX_MODELS.map(m => ({
        ...m, meta: int(metas[m.key]),
        inv: today && today.inventario ? int(today.inventario[m.key]) : int(store.inventario && store.inventario[m.key]),
        ...rowFor(c => int(c.ventas && c.ventas[m.key]))
    }));
    const infMes = sum(models.map(m => m.mes)), infSem = sum(models.map(m => m.semana));
    models.forEach(m => { m.share = pctNum(m.mes, infMes); m.cumpl = m.meta > 0 ? pctNum(m.mes, m.meta) : null; });
    const metaMes = storeMetaMes(store);

    const metasComp = store.metasComp || {};
    const brands = BRANDS.map(b => ({ brand: b, hc: int(hc[b]), meta: b === 'INFINIX' ? metaMes : int(metasComp[b]), ...rowFor(c => closureBrand(c, b)) }));
    const storeMes = sum(brands.map(b => b.mes)), storeSem = sum(brands.map(b => b.semana));
    const ranked = brands.filter(b => b.mes > 0).map(b => b.mes).sort((a, b) => b - a);
    brands.forEach(b => {
        b.cumpl = b.meta > 0 ? pctNum(b.mes, b.meta) : null;
        b.share = pctNum(b.mes, storeMes);
        b.pos = b.mes > 0 ? ranked.indexOf(b.mes) + 1 : null;           // los empates comparten puesto
        b.roi = b.hc > 0 ? b.mes / b.hc : null;
    });

    const metasAcc = store.metasAcc || {};
    const accs = INFINIX_ACCESSORIES.map(a => ({
        ...a, meta: int(metasAcc[a.key]),
        inv: today && today.invAcc ? int(today.invAcc[a.key]) : int(store.invAcc && store.invAcc[a.key]),
        ...rowFor(c => int(c.accesorios && c.accesorios[a.key]))
    }));
    accs.forEach(a => { a.cumpl = a.meta > 0 ? pctNum(a.mes, a.meta) : null; });

    // Proyecciones (misma regla del reporte actual: venta ÷ días transcurridos × días del periodo)
    const dayOfMonth = parseD(fecha).getDate(), dim = daysInMonth(ym);
    const projMes = Math.round(infMes / dayOfMonth * dim);
    const dow = (parseD(fecha).getDay() || 7);
    const projSem = Math.round(infSem / dow * 7);
    const prevSem = sum(prevDays.map(ds => byDate[ds] ? closureInfinix(byDate[ds]) : 0));
    const prevSemAFecha = sum(prevDays.slice(0, dowIdx + 1).map(ds => byDate[ds] ? closureInfinix(byDate[ds]) : 0));
    const hcInf = int(hc.INFINIX);
    const inf = brands[0];
    return {
        fecha, ym, weeks, wk, days, models, brands, accs, hc,
        hasData: monthCl.length > 0, cierresMes: monthCl.length,
        infMes, infSem, infHoy: today ? closureInfinix(today) : 0, storeMes, storeSem, metaMes,
        accMes: sum(accs.map(a => a.mes)),
        invTotal: sum(models.map(m => m.inv)),
        shareMes: pctNum(infMes, storeMes), shareSem: pctNum(infSem, storeSem), pos: inf.pos,
        cumpl: metaMes > 0 ? infMes / metaMes : null,
        projMes, projSem, prevSem, dayOfMonth, dim, dow,
        cumplProj: metaMes > 0 ? projMes / metaMes : null,
        varSem: prevSem > 0 ? (projSem - prevSem) / prevSem : null,
        prevWk: isoWeek(prevDays[0]), prevSemAFecha, varSemAFecha: prevSemAFecha > 0 ? (infSem - prevSemAFecha) / prevSemAFecha : null,
        hcInf, roi: hcInf > 0 ? infMes / hcInf : null, roiProj: hcInf > 0 ? projMes / hcInf : null,
        roiMeta: hcInf > 0 && metaMes > 0 ? metaMes / hcInf : null
    };
}

document.addEventListener('DOMContentLoaded', () => {
    $('#btn-logout').onclick = logout;
    boot();
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => { });
});

# Infinix · Central de Operaciones v1.8

Aplicación web (PWA) de ejecución retail de Infinix para tiendas, supervisores, formadores, coordinadores y gerencia. Funciona en computador y en celular, en el navegador o instalada como app.

Trae **13 zonas y 238 puntos de venta** de las 7 cadenas (Éxito, Alkosto, Ktronix, Falabella, Cencosud, WOM y Olímpica) con el **target de noviembre** (HC, meta por referencia, ROI base y KPI de comisión), los **asesores con su meta individual** (Valle, Eje Cafetero y Santander), el **inventario al 17 de noviembre** y la **venta DCR del 1 al 17 de noviembre** ya cargada.

> **Regla de oro:** la app solo trabaja con las 7 cadenas. Al cargar cualquier data plana, las filas de IR u otros canales se ignoran solas.

## 1. Usuarios

Todos los usuarios de staff entran con **código DCR + contraseña** (pestaña "Acceso Administrativo"). Para cambiar la contraseña: "Registrarme / Cambiar contraseña", escribir el código DCR, la contraseña actual y la nueva.

### Usuarios base (fijos: no se borran al restaurar los datos de prueba)

| Código DCR | Contraseña | Cargo | Alcance |
|---|---|---|---|
| `ADMIN` | `Admin2026*` | Administrador (único) | Todo el país |
| `SUPERVISOR` | `Supervisor2026` | Supervisor genérico | Zona SANTANDER |
| `FORMADOR` | `Formador2026` | Formador genérico | Zona SANTANDER |
| `COORDINADOR` | `Coordinador2026` | Coordinador genérico | Regional SUROCCIDENTE |
| `GERENTE` | `Gerente2026` | Gerente genérico | Nacional |

**Lo primero al pasar a producción: entrar con `ADMIN` y cambiar su contraseña.** El Administrador no aparece en la lista de cargos del registro.

### Tiendas

Cada PDV entra eligiendo su nombre y con la clave de tiendas `Infinix2026` (o la clave propia que le ponga el supervisor).

### Registro de personas nuevas

La persona escribe su código DCR y la clave inicial de su cargo; la app pasa al registro (cargo, nombre, zona o regional, contraseña personal).

| Cargo | Clave inicial |
|---|---|
| Supervisor | `Super2026` |
| Formador | `Forma2026` |
| Coordinador | `Coord2026` |
| Gerente | `Geren2026` |

El Administrador las cambia en Gestión › Configuración.

## 2. Qué ve cada cargo

| Cargo | Módulos | Alcance |
|---|---|---|
| Tienda (PDV) | Cierre diario, Calculadora, Simulador | Su tienda |
| Supervisor | Análisis de zona (**solo venta**: sin evaluaciones ni fichas), Plan de trabajo, Visita PDV, Central de reportes, Simulador, Gestión | Su zona |
| Formador | Análisis de zona (completo: venta + evaluaciones + tarjetas de asesor), Evaluaciones, Plan de trabajo, Visita PDV, Central de reportes, Simulador, Gestión | Su zona |
| Coordinador | Análisis de zona (estatus completo de asesores con foco), Central de reportes (incluye avance de supervisores y formadores), Evaluaciones, Simulador, Gestión. **No hace plan de trabajo ni visita.** | Su regional (todas sus zonas) |
| Gerente | Central de reportes, Análisis de zona, Simulador, Gestión | Nacional o su regional |
| Administrador | Todo | Nacional |

**Gestión (todos los cargos menos la tienda), dentro de su alcance:** crear, editar y eliminar tiendas; asesores (agregar, quitar/retirar, reactivar, mover de tienda, meta del mes de cada uno); HC, target por referencia, competencia y accesorios; inventario y foco; contraseña de cada tienda (asignar una nueva o volver a la clave inicial). Coordinador y Gerente además zonas, equipo y Configuración (claves iniciales, cadenas, radar, tasas, plan comisional). Solo el Administrador cambia la clave del Administrador y maneja los datos de demostración.

La tienda solo configura lo básico de su PDV (asesores, targets e inventario en ⚙️ Ajustes).

## 3. Data del mes (v1.6) y actualización

La primera vez que cualquier usuario abre la v1.6, la app actualiza sola todas las tiendas con la data de noviembre (targets, HC, KPI, asesores, inventario) y **borra la data de demostración** (cierres, planes, visitas y usuarios demo). Lo propio de cada tienda (asesores retirados, foco, contraseña) se respeta. Se hace una sola vez por versión de data (`SEED_VERSION` en `opscore-seed.js`).

- La venta precargada (`opscore-snap.js`, DCR al 17-nov) se usa mientras la zona no tenga una data más nueva. Al cargar una DCR nueva en Análisis de zona, **queda guardada de una vez** para todos los usuarios de la zona.
- La venta de la competencia queda en cero: se digita a mano en los cierres diarios.
- Las cédulas no van en el código (es público): llegan con la DCR que se carga.
- Para regenerar la data de otro mes: `build/build_seed.py` con el target, el seguimiento y el inventario nuevos.

## 4. Análisis de zona

1. Descarga el **Shop Sales Query** (DCR) completo del país y súbelo con "Cargar data plana". La app reconoce las columnas solas (Shop ID, Shop Name, Uploader, Market Name, Sales Qty, Sales Date, Supervisor Name, Sales Region 3, Product Category, Position…).
2. Cada persona ve solo lo suyo: el supervisor su zona, el coordinador su regional (con selector "Regional" o cada zona), el Administrador todo el país.
3. Las tiendas se cruzan por **Shop ID** (exacto). Archivos de otro formato también sirven: se cruzan por nombre y lo que no cruce se asigna a mano.
4. **Configuración inicial:** target del mes, HC y **foco de la semana** por PDV (referencia + nota). El foco en blanco se calcula solo (mayor brecha frente al target).
5. Sale el reporte de zona (imagen), la lectura, las recomendaciones y los PDV a visitar; al elegirlos, "Crear plan de trabajo" abre el plan ya lleno.

Al compartir o guardar el reporte, la data queda guardada por zona y mes: la usan el plan de trabajo, la calculadora y las evaluaciones.

### Cadenas de trabajo (v1.4)

La data nacional trae retail, IR, WOM e independientes. Con el botón **🏷️ Cadenas** del análisis eliges cuáles se trabajan:

- **Administrador:** la selección es global. Las cadenas que desmarques (por ejemplo IR o las independientes) salen del análisis de zona, la central de reportes, la selección de tiendas del plan y la visita, y las evaluaciones, **en toda la app**. Su data **queda guardada**: si las vuelves a marcar, regresan sin recargar el archivo. También se cambia en Gestión › Configuración › Cadenas de trabajo. En Gestión › Tiendas las tiendas excluidas siguen apareciendo con la etiqueta *fuera de trabajo*.
- **Supervisor, formador, coordinador y gerente:** el botón solo cambia **su vista** (dentro de lo que el administrador dejó activo) y queda recordado en su equipo.
- "Solo las 7 oficiales" deja Éxito, Alkosto, Ktronix, Falabella, Cencosud, WOM y Olímpica. Cada cadena muestra sus PDV y las unidades que trae la data.

### Asesores activos y retirados (v1.4)

En **🎯 Configuración inicial › 👥 Asesores activos** (supervisor, formador, coordinador y administrador) aparece, por tienda, la lista de asesores que trae la data. Si alguien renuncia, **desmárcalo**:

- **Sus unidades siguen contando** en la venta de la tienda y de la zona (tienda con 50 uds = 30 de un asesor activo + 20 del retirado: sigue en 50 y el cumplimiento no cambia).
- Deja de aparecer como asesor en el ranking, el HC (cuando no está fijado a mano), la calculadora (el target ya no se reparte con él), las evaluaciones pendientes y el plan de trabajo.
- En el ranking se muestra "+20 de retirados" y bajo los indicadores una nota con el total de unidades de retirados.
- Se puede **volver a marcar** en cualquier momento. Al cargar data nueva, el retirado sigue retirado aunque siga apareciendo en el archivo; un asesor nuevo en la data aparece activo.
- El retirado se identifica por cédula (si la data la trae) o por nombre, sin importar el orden de nombres y apellidos.

## 5. Evaluaciones (formador)

Hasta 5 semanas (W45, W46…), un archivo por semana (Excel o CSV de Google Forms u otro). La app busca nombre, cédula, nota y fecha, y coteja con los asesores de la zona:

- primero por cédula exacta, luego por cédula con un dígito errado o dos invertidos, luego por nombre completo y por nombre parcial;
- notas tipo `8/10`, `80 %`, `4,5` sobre 5 o `8` sobre 10 se pasan a escala de 100.

Resultado: quién presentó, quién falta, quién repitió y con qué notas, promedio por semana y por PDV, e imagen del informe. Los pendientes aparecen en el plan de trabajo de cada tienda y en el análisis de zona del formador.

## 5b. Radar de asesores, ficha ejecutiva y plan por asesor (v1.5)

**Motor de diagnóstico por asesor** (`Advisor` en `opscore-calc.js`). Para cada asesor activo calcula un único objeto, `AdvisorDiagnostic`, que alimenta el radar, la ficha, el plan de trabajo y el Excel:

| Bloque | Qué trae |
|---|---|
| `pacing` | meta del asesor (la guardada en la calculadora o el reparto del target de la tienda entre asesores activos), venta, % cumplimiento, días transcurridos/del mes, % esperado, índice de ritmo (cumplimiento ÷ esperado), proyección de cierre, brecha en unidades y comisión en juego |
| `inventario` | modelo por modelo en su PDV: vendidas, inventario y estado (rotando, rezago, impulsar, sin stock, stock bajo); producto estrella, mayor oportunidad y stock foco sin rotar |
| `evaluacion` | última nota, semana, y temas débiles (columnas por módulo del archivo; si no hay, nombre de la evaluación) |
| `prescripcion` | prioridad (crítica/alta/media/baja), semáforo, razones, acciones, impactos, compromiso del día |

**Reglas de la prescripción** (configurables en *Gestión › Configuración › Radar de asesores*):

- Ritmo por debajo del **85 %** de lo esperado → prioridad alta o crítica + *cierre comercial y manejo de objeciones*.
- Referencia foco con **≥ 2 uds** en el PDV y **0** ventas del asesor (rezago crítico) → *refuerzo técnico y pitch* de esa referencia, con sus unidades.
- Nota menor a **80** → *re-entrenamiento* en el tema débil.
- Compromiso del día = stock foco sin rotar ÷ 7 días (mínimo 1, máximo 3).
- Referencias foco por defecto: Note EDGE, Note 60, Note 60 Pro, Hot 70 Pro 5G, GT 50 Pro (más la referencia foco de la tienda).

**Radar de prioridad** (Análisis de zona): tarjetas del peor al mejor con semáforo, PDV, cadena, % cumplimiento, stock foco sin rotar y nota. Respeta el filtro de cadenas y los asesores retirados. Cada tarjeta tiene *Ver ficha / Generar reporte* y la casilla *Enviar a Plan de trabajo* (máximo 5 tiendas por día).

**Ficha ejecutiva del asesor** (también desde la calculadora): KPIs, barra de ritmo, tabla Referencia | Vendidas | Inventario | Estado, y *Foco de refuerzo en visita*. Botones: vista previa, **compartir por WhatsApp** y **descargar PNG**, con el mismo motor de imagen del reporte de zona.

**Plan de trabajo:** al enviar asesores desde el radar, el plan se abre con la tienda, los asesores marcados y todo pre-llenado (foco, 3 acciones, impactos, compromiso en unidades). Lo escrito a mano se respeta: al quitar un asesor solo se borra lo generado automáticamente. La imagen del plan muestra una línea por asesor.

**Excel gerencial:** *Detalle Planes* suma la columna "Asesores a trabajar" y hay una hoja nueva, **Plan por Asesor** (Anexo C), con meta, venta, % cumplimiento, esperado, prioridad, stock foco, referencias en rezago, nota, semana, temas débiles, temas a trabajar y compromisos.

## 5c. Novedades v1.6

- **Selector de asesor** en Análisis de zona: eliges un asesor y ves todo su estatus (venta, meta, cumplimiento, lo que debería llevar a hoy, proyección, comisión, evaluaciones, referencias e inventario). El supervisor ve solo la parte de venta.
- **Lista de asesores** clara: nombre, tienda, meta, venta, cumplimiento, proyección y evaluación (o "faltan" y uds/día para el supervisor; foco para el coordinador), del peor al mejor.
- **Dos tarjetas por asesor:** «Para el asesor» (su estatus en segunda persona: comisión con los 3 escalones, evaluaciones de las semanas del mes con dona, referencias, estrella, oportunidad y oportunidades de mejora con tips de venta) y «Para jefes» (diagnóstico y foco de refuerzo en visita).
- **Comisión** según el plan de noviembre: el ROI base de la tienda abre incentivos; KPI 1 ($400.000) y KPI 2 ($700.000) por unidades del asesor, no acumulables. El asesor de apoyo que vende en otra tienda suma esas unidades en su tienda de origen.
- **Evaluaciones:** cada semana queda guardada al adjuntarla y muestra "Última data cargada: fecha y hora".
- **Reportes rápidos** (zona, cadena o tienda) para enviar a cada grupo.
- **Visita PDV → Cierre de actividades:** el botón "Guardar visita" deja la visita (con miniaturas de las fotos, lo ejecutado y la gestión) lista en el cierre de la noche; si la tienda no estaba en el plan, se agrega sola.
- **Informe gerencial visual** (imagen con tortas y barras) en la Central de reportes, además del Excel plano. Cuando el rango arranca el día 1, la venta Infinix sale de la data DCR.

## 5d. Plan de incentivos, Mi central y fotos (v1.6.1)

**Plan de incentivos promotores · noviembre 2026** (`DEFAULT_COMISIONES` y `PLAN_TERMINOS` en `opscore-config.js`; editable en Gestión › Configuración):

| Modelo | Speed por unidad | | Accesorio | Por unidad |
|---|---|---|---|---|
| SMART 20 | $2.000 | | XPAD 30 | $10.000 |
| HOT 70 | $7.000 | | GT5 Pro (reloj) | $10.000 |
| HOT 70 Pro 5G | $16.000 | | XBUDS H5 | $10.000 |
| NOTE EDGE | $16.000 | | | |
| NOTE 60 | $15.000 | | | |
| NOTE 60 PRO | $20.000 | | | |
| GT 50 PRO | $50.000 | | | |
| NOTE 60 ULTRA | $80.000 | | | |

- **ROI 1** (ROI base de la tienda, del target): abre la llave de los speeds; desde ahí se paga el speed de **todas** las unidades vendidas.
- **ROI 2:** $400.000 · **ROI 3:** $700.000 (no acumulables). Umbrales por tienda según el target (Éxito/Alkosto 100 y 140; Ktronix, Falabella, Cencosud y WOM 90 y 120).
- Accesorios: pagan desde la primera unidad y no suman al ROI.
- La calculadora, la tarjeta del asesor y Mi central muestran: lo que gana hoy, lo que ganaría con su proyección y si cumple su meta, cuánto le falta para cada ROI y por día, y los términos y condiciones completos.

**Mi central (pestaña de la tienda):** selector Tienda / cada asesor (con su foto).
- Tienda: venta del mes, lo que debería llevar a hoy, proyección, ROI; semana contra semana con variación; capa vs. venta (share actual y objetivo); el equipo semana a semana con 🏆 al que más vendió y la variación; qué marca va punteando (de los cierres diarios); referencias y la que más está afectando.
- Asesor: su puesto en la tienda y su aporte, su venta semana a semana, él frente a sus compañeros, sus referencias con el speed de cada una, oportunidades de mejora y su tarjeta.

**Fotos del equipo:** en Mi central (o Ajustes de tienda) cada asesor se toma la foto con la guía (medio cuerpo, uniforme, buena luz, fondo limpio). Se recorta y comprime en el teléfono y sale en su tarjeta, en la ficha para jefes y en la lista de asesores del análisis de zona. Sin foto aparecen sus iniciales.

## 5e. Novedades v1.7

- **Análisis de zona en pestañas:** Resumen (los 4 asesores y las 4 tiendas más críticos, estado de PDV, evaluaciones; lectura y recomendaciones plegadas), Asesores, Tiendas, Plan de trabajo (por asesor o por tienda, 4 críticos y "ver más") y Reportes (reporte de zona, reportes rápidos por zona/cadena/tienda y tarjetas de asesor).
- **Varios asesores a la vez:** el botón «Asesores» permite elegir uno (estatus completo) o varios (comparativo).
- **Central de reportes por semana o rango:** la venta Infinix sale de la data DCR por día y referencia, así que una semana (W45, W46…) o cualquier rango muestra solo lo vendido en ese rango. Meta del rango = cuota semanal (mes ÷ 4) proporcional a los días; el mes completo usa la meta del mes. El share solo se muestra cuando hay venta de competencia registrada.
- **Mi central en paneles desplegables:** semana a semana (barras + tabla con meta semanal, cumplimiento, variación y venta por referencia de cada semana, para llenar planillas), equipo, capa vs. venta, marcas semana a semana (de los cierres), referencias, incentivos. La vista del asesor trae su tabla semanal, la de la tienda y sus compañeros.
- **Meta semanal = cuota del mes ÷ 4** (tienda y asesor; semanas incompletas proporcionales).
- **Fotos del asesor** en el plan de trabajo, el cierre de actividades y la visita (junto a la cadena y la tienda).
- **Todo se llena solo:** la visita trae la venta del mes de la DCR cuando no hay cierres y marca las evaluaciones ya cargadas (quién presentó y nota promedio); el plan trae la venta de la semana de la DCR.

## 5f. Novedades v1.8

- **"✅ Solo guardar" en el cierre diario** (y en el plan de trabajo): guarda el cierre en el sistema sin generar imagen ni abrir WhatsApp. La imagen se genera solo cuando se va a enviar.
- **Llenar el mes completo:** el cierre trae flechas ◀ ▶ para pasar de día y una franja con los días del mes; los días en verde ya tienen cierre guardado. Al tocar un día se cargan sus datos (si existe) para corregirlos. En un día sin cierre, el inventario arranca del último cierre anterior.
- **Todo automático, todo editable a mano:** lo que llega con la data (asesores, metas por asesor, HC, targets) se puede corregir en Gestión › Tiendas (⚙️) o en Gestión › Asesores. Lo corregido a mano queda marcado **✋ manual** y ninguna carga automática lo pisa. En ⚙️ Ajustes de la tienda, «↺ Volver a datos automáticos» quita la marca y devuelve la tienda a la data base.
- **Gestión › Asesores:** lista por zona con venta del mes, meta (vacío = reparto del target de la tienda), retirar / reactivar, mover a otra tienda y agregar asesor. Se guarda al cambiar cada dato.
- **Lectura de la data plana verificada** con la DCR real del 1 al 18 de noviembre: 9.348 celulares y 305 accesorios (la tablet XPAD 30E cuenta como accesorio, como en el plan comisional) en 234 tiendas, iguales unidad por unidad a un conteo independiente; IR y cadenas no oficiales quedan fuera.

## 6. Calculadora (tienda)

El asesor elige su nombre. Su target por referencia sale del target de la tienda dividido entre los asesores y lo puede ajustar a mano; sus unidades llegan de la data de zona (o se escriben). Muestra apertura (KPI), lo ganado y el siguiente bono según el **plan comisional general**, que el Administrador configura en Gestión › Configuración › Plan comisional (valor por referencia y accesorio, apertura y bonos).

> Los valores que trae son de referencia: reemplázalos por el plan comisional vigente.

## 7. Conectar Firebase (proyecto `opscore-b1e22`)

1. Consola de Firebase › **Firestore Database** › Crear base de datos (modo producción).
2. Pestaña **Reglas**: pega esto y publica.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{col}/{doc} {
      allow read, write: if col in ['stores', 'zones', 'staff_users', 'daily_closures',
                                     'work_plans', 'visit_reports', 'opscore_config',
                                     'zone_data', 'zone_reports', 'eval_data'];
    }
  }
}
```

Mientras no estén publicadas, la app avisa y guarda todo en el equipo; luego lo sube sola. La app no usa Firebase Authentication: el control de acceso es de la aplicación. Con estas reglas, cualquiera que tenga la configuración del proyecto puede leer y escribir: es lo práctico para arrancar; el siguiente paso de seguridad es activar Firebase Authentication.

3. (Recomendado) Google Cloud Console › APIs y servicios › Credenciales › la clave de API web › Restricciones de aplicación: *Referentes HTTP* y agrega `https://TU-USUARIO.github.io/*`.

## 8. Publicar en GitHub Pages

1. En GitHub crea un repositorio (por ejemplo `central-operaciones`).
2. Sube **todo el contenido de esta carpeta** a la raíz del repositorio (arrastrar los archivos en "Add file › Upload files" sirve).
3. Repositorio › **Settings › Pages** › Source: *Deploy from a branch* › rama `main`, carpeta `/ (root)` › Save.
4. En 1–2 minutos queda en `https://TU-USUARIO.github.io/central-operaciones/`.
5. En el celular, abre ese enlace y elige "Agregar a pantalla de inicio" para instalarla como app.

Para actualizar después, sube los archivos nuevos encima (no hace falta borrar los anteriores: los que tienen el mismo nombre se reemplazan). El `sw.js` cambia de versión y los teléfonos toman la nueva al reabrir. Los datos no se tocan: viven en Firebase, no en GitHub.

GitHub Pages gratuito publica repositorios **públicos**: el código queda visible (no las ventas ni los registros, que viven en Firebase). La semilla incluye nombres de tiendas y asesores, pero no cédulas.

## 9. Reglas de cálculo

- **ROI** = ventas Infinix del mes ÷ HC. **ROI proyectado** = (ventas ÷ días transcurridos × días del mes) ÷ HC.
- **Estados por proyección:** en meta ≥ 100 %, bien ≥ 85 %, en riesgo ≥ 70 %, crítico por debajo; "sin venta" sin unidades.
- **Variación semanal:** semana actual frente a los mismos días de la semana anterior.
- **Semanas:** ISO, lunes a domingo; la semana de evaluación pertenece al mes de su jueves.
- **Disciplina de reporte:** envíos ÷ días exigibles (tiendas todos los días, staff lunes a sábado).

## 10. Archivos

| Archivo | Contenido |
|---|---|
| `index.html`, `opscore.css` | Estructura y tema (también para celular) |
| `opscore-config.js` | Firebase, cargos, usuarios base, cadenas, catálogo, tasas, plan comisional |
| `opscore-seed.js` | Zonas y tiendas de las 7 cadenas con target, KPI, asesores e inventario de noviembre (generado por `build/build_seed.py`) |
| `opscore-snap.js` | Venta DCR precargada (1 al 17 de noviembre) |
| `opscore-core.js` | Datos (Firestore + respaldo local), ingreso, permisos, exportación |
| `opscore-m1.js` … `opscore-m5.js` | Cierre, plan, visita, central y simulador |
| `opscore-zone.js`, `opscore-evals.js`, `opscore-calc.js` | Análisis de zona, evaluaciones y calculadora |
| `opscore-admin.js`, `opscore-demo.js` | Gestión y datos de demostración |
| `opscore-assets.js` | Logos embebidos (necesarios para exportar imágenes) |
| `sw.js`, `manifest.json`, `logo-512.png` | Instalación como app |

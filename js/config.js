/* Configuración central del Generador (patrón js/config.js de Auditoría Técnica).
   TODOS los números y listas de la app viven acá. */
window.CONFIG = (function () {
    'use strict';
    if (!window.MTZ_VERSION) throw new Error('Falta window.MTZ_VERSION');
    return {
        version: window.MTZ_VERSION,
        nombreApp: 'Mostaza — Mantenimiento Franquicias',
        pieCorporativo: 'Mostaza Mantenimiento Franquicias - Control Interno Regional',

        // Claves de persistencia (texto en localStorage; binarios en IndexedDB)
        almacenamiento: {
            claveBorrador: 'mtz:borrador:v13',
            claveHistorial: 'mtz:historial:v13',
            dbNombre: 'mtz-binarios', dbVersion: 1, dbStore: 'blobs'
        },

        // Técnicos de mantenimiento (nombres oficiales según padrón)
        tecnicos: ['FERNANDO SORIA', 'TOMÁS VERA', 'ANABELLA GUERRERO', 'FRANCISCO RAMETTA', 'CRISTIAN MERLO'],
        // Código personal de 4 dígitos por técnico (esquema de las auditorías de
        // jefatura). EN STANDBY desde V13.10.0: se unifica el Generador con la app
        // principal (que tendrá login), así que el nombre vendrá del usuario logueado
        // y no hace falta el código. Poner true para reactivar la versión con código.
        usarCodigosTecnicos: false,
        codigosTecnicos: {
            '1907': 'FERNANDO SORIA',
            '5690': 'TOMÁS VERA',
            '6056': 'ANABELLA GUERRERO',
            '3615': 'FRANCISCO RAMETTA',
            '0731': 'CRISTIAN MERLO'
        },

        prioridades: [
            ['', '-- SELECCIONAR PRIORIDAD --'],
            ['PROGRAMADO', 'PROGRAMADO (PREVENTIVO)'],
            ['URGENTE', 'URGENTE (CORRECTIVO)'],
            ['RE-VISITA (FALLA)', 'RE-VISITA POR FALLA PREVIA'],
            ['RE-VISITA (REPUESTO)', 'RE-VISITA POR REPUESTO PENDIENTE'],
            ['GARANTIA', 'CARÁCTER DE GARANTÍA'],
            ['TICKET PRIORIDAD MEDIA', 'TICKET POR PRIORIDAD MEDIA'],
            ['TICKET PRIORIDAD BAJA', 'TICKET POR PRIORIDAD BAJA'],
            ['VISITA DIAGNOSTICO / COTIZACION', 'VISITA DIAGNÓSTICO / COTIZACIÓN'],
            ['VISITA ANALISIS INTERNO (SIN CARGO)', 'VISITA ANÁLISIS INTERNO (SIN CARGO)']
        ],

        equipos: ['Cimbali', 'Melitta', 'Otros'],
        tareas: [
            'Limpieza grupo', 'Cambio juntas', 'Calibración', 'Descalcificación',
            'Gramaje y Recetas', 'Limpieza bomba leche', 'Limpieza válvula ELF3',
            'Limpieza chicler', 'Destapado desagüe'
        ],

        labor: { minimo: 2 },

        // ---- Módulo de Soporte / Asistencia Remota (V13.11.0) ----
        // Comparte la identificación (local/ticket/fecha/técnico/código) con el informe
        // presencial, pero cambia por completo el cuerpo: sin agua, equipos detallados,
        // fotos ni firmas. El equipo afectado reusa la misma lista CFG.equipos.
        remoto: {
            canales: [
                ['', '-- FORMA DE RECEPCIÓN --'],
                ['Telefono', 'TELÉFONO'],
                ['Llamado', 'LLAMADO'],
                ['Ticket', 'TICKET'],
                ['Mail', 'MAIL'],
                ['Aviso por persona', 'AVISO POR X PERSONA']
            ],
            caracteres: [
                ['', '-- CARÁCTER --'],
                ['Consulta', 'CONSULTA'],
                ['Diagnostico', 'DIAGNÓSTICO'],
                ['Emergencia', 'EMERGENCIA']
            ],
            coordinadas: [['No coordinada', 'NO COORDINADA (ESPONTÁNEA)'], ['Programada', 'PROGRAMADA / COORDINADA']],
            // Bloques discretos de 1 hora (sin minutos): se toma 1 hs base aunque haya
            // sido menos; si pasa la hora, 2 hs, y así consecuentemente.
            duraciones: [1, 2, 3, 4, 5, 6, 8, 10, 12]
        },

        // Cortes PPM del mantenimiento (NO tocar): 1-49 blanda, 50-119 óptimo, 120-300 alerta, >300 dura
        ppm: { cortes: [50, 120, 300], min: 0, max: 9999 },

        fotos: {
            maxLadoLargo: 1200, calidad: 0.65,
            maxPorInforme: 8,
            estampar: true,           // fecha+hora+GPS sobre la imagen
            anchoEnPdfPx: 800, porFilaEnPdf: 2
        },

        firmas: { anchoMm: 60, altoMm: 30 },

        historial: { maxItems: 30 },

        // Relay de envío al grupo de Telegram (servidor telegram_bridge, /enviar_informe).
        // Mientras url esté vacía, "Enviar al grupo" usa el menú nativo de compartir
        // del teléfono (el técnico elige el grupo). La clave debe coincidir con
        // MTZ_RELAY_CLAVE del .env del bridge.
        relay: { url: '', clave: '94bd7e89630d716ab11de1e4b303789c' }
    };
})();

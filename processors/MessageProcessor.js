const JSONManager = require('../managers/JSONManager');
const DriveManager = require('../managers/DriveManager');
const SheetsManager = require('../managers/SheetsManager');
const IAManager = require('../managers/IAManager');
const { cargarBarriosConfig, guardarBarriosConfig } = require('../utils/configUtils');

// Importar estrategias
const BarrioConfigStrategy = require('../strategies/BarrioConfigStrategy');
const AgendaStrategy = require('../strategies/AgendaStrategy');
const BarrioDataStrategy = require('../strategies/BarrioDataStrategy');
const MediaStrategy = require('../strategies/MediaStrategy');
const DefaultStrategy = require('../strategies/DefaultStrategy');

class MessageProcessor {
    constructor() {
        this.strategies = new Map();
        this.config = {
            MENSAJES_JSON: './data/mensajes_capturados.json',
            MEDIA_JSON: './data/media_capturados.json',
            PROCESSING_DELAY: 3000, // 3 segundos entre mensajes
            IA_DELAY: 2000, // 2 segundos entre llamadas a IA
            BATCH_SIZE: 10 // Procesar de a 10
        };
        this.initializeStrategies();
    }
    
    initializeStrategies() {
        // Configuración de barrios (11, 12, 13)
        this.strategies.set(11, new BarrioConfigStrategy());
        this.strategies.set(12, new BarrioConfigStrategy());
        this.strategies.set(13, new BarrioConfigStrategy());
        
        // Agendas (5)
        this.strategies.set(5, new AgendaStrategy());
        
        // Datos de barrio (1, 2, 3)
        this.strategies.set(1, new BarrioDataStrategy());
        this.strategies.set(2, new BarrioDataStrategy());
        this.strategies.set(3, new BarrioDataStrategy());
        
        // Default para mensajes sin código
        this.strategies.set(0, new DefaultStrategy());
    }
    
    async procesarTodosPendientes() {
        console.log('\n🔄 === INICIANDO PROCESAMIENTO COMPLETO ===');
        
        try {
            // FASE 1: Procesar configuraciones de barrios PRIMERO
            await this.procesarConfiguracionesBarrios();
            
            // FASE 2: Procesar agendas
            await this.procesarAgendas();
            
            // FASE 3: Procesar datos de barrios
            await this.procesarDatosBarrios();
            
            // FASE 4: Procesar media
            await this.procesarMedia();
            
            console.log('\n✅ === PROCESAMIENTO COMPLETO FINALIZADO ===');
            
        } catch (error) {
            console.error('❌ Error en procesamiento completo:', error);
            throw error;
        }
    }
    
    async procesarConfiguracionesBarrios() {
        console.log('\n🏘️ === FASE 1: CONFIGURACIONES DE BARRIOS ===');
        
        const configuraciones = JSONManager.obtenerMensajesConfiguracion(this.config.MENSAJES_JSON);
        
        if (configuraciones.length === 0) {
            console.log('✅ No hay configuraciones de barrios pendientes');
            return;
        }
        
        console.log(`📋 Procesando ${configuraciones.length} configuraciones de barrios...`);
        
        // Ordenar por código para procesar en orden (11, 12, 13)
        configuraciones.sort((a, b) => a.codigo - b.codigo);
        
        for (let i = 0; i < configuraciones.length; i++) {
            const config = configuraciones[i];
            
            console.log(`\n🏘️ [${i + 1}/${configuraciones.length}] Configurando barrio ${config.codigo - 10}: "${config.contenido}"`);
            
            try {
                const strategy = this.strategies.get(config.codigo);
                await strategy.process(config);
                
                // Marcar como procesado
                JSONManager.marcarComoProcesado(this.config.MENSAJES_JSON, config.id, {
                    resultadoProcesamiento: 'Barrio configurado exitosamente'
                });
                
                console.log(`✅ Barrio ${config.codigo - 10} configurado: ${config.contenido}`);
                
                // Delay entre configuraciones
                if (i < configuraciones.length - 1) {
                    console.log(`⏳ Esperando ${this.config.PROCESSING_DELAY}ms...`);
                    await this.delay(this.config.PROCESSING_DELAY);
                }
                
            } catch (error) {
                console.error(`❌ Error configurando barrio ${config.codigo}:`, error);
                // No marcar como procesado si falla
            }
        }
        
        // Recargar configuración después de procesar
        console.log('🔄 Recargando configuración de barrios...');
        const nuevaConfig = cargarBarriosConfig();
        console.log('📋 Configuración actualizada:', nuevaConfig);
    }
    
    async procesarAgendas() {
        console.log('\n📅 === FASE 2: AGENDAS ===');
        
        const agendas = JSONManager.obtenerMensajesAgenda(this.config.MENSAJES_JSON);
        
        if (agendas.length === 0) {
            console.log('✅ No hay agendas pendientes');
            return;
        }
        
        console.log(`📋 Procesando ${agendas.length} agendas...`);
        
        for (let i = 0; i < agendas.length; i++) {
            const agenda = agendas[i];
            
            console.log(`\n📅 [${i + 1}/${agendas.length}] Procesando agenda de ${agenda.contacto}`);
            console.log(`📝 Contenido: ${agenda.contenido.substring(0, 100)}...`);
            
            try {
                const strategy = this.strategies.get(agenda.codigo);
                await strategy.process(agenda);
                
                JSONManager.marcarComoProcesado(this.config.MENSAJES_JSON, agenda.id, {
                    resultadoProcesamiento: 'Agenda procesada con IA'
                });
                
                console.log(`✅ Agenda procesada`);
                
                // Delay para IA
                if (i < agendas.length - 1) {
                    console.log(`⏳ Delay IA: ${this.config.IA_DELAY}ms...`);
                    await this.delay(this.config.IA_DELAY);
                }
                
            } catch (error) {
                console.error(`❌ Error procesando agenda:`, error.message);
                
                // MANEJO SIMPLE: SI FALLA IA → PARAR TODO  
                if (error.message.startsWith('RATE_LIMITED:')) {
                    const tiempoEspera = parseInt(error.message.split(':')[1]);
                    
                    console.log(`\n🚫 ═══════════════════════════════════════════════════════`);
                    console.log(`   📅 RATE LIMIT EN PROCESAMIENTO DE AGENDAS`);
                    console.log(`🚫 ═══════════════════════════════════════════════════════`);
                    console.log(`⏰ Tiempo de espera: ${tiempoEspera} segundos (${Math.ceil(tiempoEspera/60)} min)`);
                    console.log(`📊 Progreso: ${i}/${agendas.length} agendas procesadas`);
                    console.log(`📋 Al reiniciar, continuará desde agenda pendiente`);
                    console.log(`\n🛑 CERRANDO PROGRAMA... Reiniciar después de la espera.`);
                    console.log(`🚫 ═══════════════════════════════════════════════════════\n`);
                    
                    process.exit(1);
                    
                } else {
                    console.log(`⚠️ Error en agenda: ${error.message}`);
                    console.log(`🛑 CERRANDO PROGRAMA por error inesperado...`);
                    process.exit(1);
                }
            }
        }
    }
    
    async procesarDatosBarrios() {
        console.log('\n🏘️ === FASE 3: DATOS DE BARRIOS ===');
        
        const datosBarrio = JSONManager.obtenerMensajesDatosBarrio(this.config.MENSAJES_JSON);
        
        if (datosBarrio.length === 0) {
            console.log('✅ No hay datos de barrios pendientes');
            return;
        }
        
        console.log(`📋 Procesando ${datosBarrio.length} mensajes de datos de barrios...`);
        
        // Agrupar por barrio para procesamiento ordenado
        const porBarrio = {};
        datosBarrio.forEach(dato => {
            if (!porBarrio[dato.codigo]) {
                porBarrio[dato.codigo] = [];
            }
            porBarrio[dato.codigo].push(dato);
        });
        
        for (const [codigoBarrio, mensajes] of Object.entries(porBarrio)) {
            console.log(`\n🏘️ Procesando barrio ${codigoBarrio} - ${mensajes.length} mensajes`);
            
            for (let i = 0; i < mensajes.length; i++) {
                const mensaje = mensajes[i];
                
                console.log(`\n📝 [${i + 1}/${mensajes.length}] Barrio ${codigoBarrio} - ${mensaje.contacto}`);
                console.log(`💬 ${mensaje.contenido.substring(0, 80)}...`);
                
                try {
                    const strategy = this.strategies.get(parseInt(codigoBarrio));
                    await strategy.process(mensaje);
                    
                    // Solo marcar como procesado si fue exitoso
                    JSONManager.marcarComoProcesado(this.config.MENSAJES_JSON, mensaje.id, {
                        resultadoProcesamiento: `Datos de barrio ${codigoBarrio} procesados con IA`
                    });
                    
                    console.log(`✅ Datos procesados para barrio ${codigoBarrio}`);
                    
                    // Delay entre mensajes y extra para IA
                    if (i < mensajes.length - 1) {
                        console.log(`⏳ Delay: ${this.config.PROCESSING_DELAY}ms + IA: ${this.config.IA_DELAY}ms...`);
                        await this.delay(this.config.PROCESSING_DELAY + this.config.IA_DELAY);
                    }
                    
                } catch (error) {
                    console.error(`❌ Error procesando datos de barrio ${codigoBarrio}:`, error.message);
                    
                    // MANEJO SIMPLE: SI FALLA IA → PARAR TODO
                    if (error.message.startsWith('RATE_LIMITED:')) {
                        const tiempoEspera = parseInt(error.message.split(':')[1]);
                        
                        console.log(`\n🚫 ═══════════════════════════════════════════════════════`);
                        console.log(`   🤖 RATE LIMIT DE GEMINI IA - SIN REQUESTS DISPONIBLES`);
                        console.log(`🚫 ═══════════════════════════════════════════════════════`);
                        console.log(`⏰ Tiempo de espera: ${tiempoEspera} segundos (${Math.ceil(tiempoEspera/60)} min)`);
                        console.log(`📊 Progreso guardado: ${i}/${mensajes.length} mensajes del barrio ${codigoBarrio}`);
                        console.log(`📋 Al reiniciar el programa, continuará desde este punto`);
                        console.log(`\n🔄 PARA CONTINUAR:`);
                        console.log(`   1. Esperar ${Math.ceil(tiempoEspera/60)} minutos`);
                        console.log(`   2. Reiniciar: node main.js`);
                        console.log(`   3. Ejecutar: process`);
                        console.log(`   4. Continuará automáticamente desde aquí`);
                        console.log(`\n💾 ESTADO: Mensajes procesados guardados, pendientes sin tocar`);
                        console.log(`🚫 ═══════════════════════════════════════════════════════\n`);
                        
                        // NO marcar como procesado
                        console.log(`❌ Mensaje NO procesado: queda pendiente para próxima ejecución`);
                        
                        // TERMINAR PROGRAMA COMPLETAMENTE
                        console.log(`🛑 CERRANDO PROGRAMA... Reiniciar después de la espera.`);
                        process.exit(1);
                        
                    } else if (error.message.startsWith('AUTH_ERROR:')) {
                        console.log(`\n🔑 ═══════════════════════════════════════════════════════`);
                        console.log(`   🔑 ERROR DE AUTENTICACIÓN - API KEY INVÁLIDA`);
                        console.log(`🔑 ═══════════════════════════════════════════════════════`);
                        console.log(`❌ API Key de Gemini inválida o expirada`);
                        console.log(`🔧 Solución: Verificar GEMINI_API_KEY en managers/IAManager.js`);
                        console.log(`📋 Mensaje NO procesado: queda pendiente`);
                        console.log(`\n🛑 CERRANDO PROGRAMA... Corregir API key y reiniciar.`);
                        console.log(`🔑 ═══════════════════════════════════════════════════════\n`);
                        
                        process.exit(1);
                        
                    } else {
                        console.log(`⚠️ Error general: ${error.message}`);
                        console.log(`📋 Mensaje NO procesado: queda pendiente`);
                        console.log(`🛑 CERRANDO PROGRAMA por error inesperado...`);
                        process.exit(1);
                    }
                }
            }
        }
    }
    
    async procesarMedia() {
        console.log('\n📸 === FASE 4: MEDIA (IMÁGENES/VIDEOS) ===');
        
        const mediaPendiente = JSONManager.obtenerPendientes(this.config.MEDIA_JSON);
        
        if (mediaPendiente.length === 0) {
            console.log('✅ No hay media pendiente');
            return;
        }
        
        console.log(`📋 Procesando ${mediaPendiente.length} archivos de media...`);
        
        // Filtrar solo media con códigos de barrio válidos
        const mediaValida = mediaPendiente.filter(media => media.codigo >= 1 && media.codigo <= 3);
        
        if (mediaValida.length === 0) {
            console.log('✅ No hay media con códigos de barrio válidos');
            return;
        }
        
        console.log(`📸 Media válida para procesar: ${mediaValida.length}`);
        
        for (let i = 0; i < mediaValida.length; i++) {
            const media = mediaValida[i];
            
            console.log(`\n📸 [${i + 1}/${mediaValida.length}] Subiendo ${media.tipoMedia}: ${media.fileName}`);
            console.log(`🏘️ Barrio: ${media.codigo} | Caption: ${media.caption}`);
            
            try {
                const mediaStrategy = new MediaStrategy();
                await mediaStrategy.process(media);
                
                JSONManager.marcarComoProcesado(this.config.MEDIA_JSON, media.id, {
                    subido: true,
                    resultadoProcesamiento: `Media subido a Drive para barrio ${media.codigo}`
                });
                
                console.log(`✅ Media subido exitosamente`);
                
                // Delay más largo para uploads
                if (i < mediaValida.length - 1) {
                    console.log(`⏳ Delay upload: ${this.config.PROCESSING_DELAY * 2}ms...`);
                    await this.delay(this.config.PROCESSING_DELAY * 2);
                }
                
            } catch (error) {
                console.error(`❌ Error subiendo media:`, error);
            }
        }
    }
    
    async procesarPorLotes(limite = null) {
        console.log('\n🔄 === PROCESAMIENTO POR LOTES ===');
        
        const batchSize = limite || this.config.BATCH_SIZE;
        
        // Obtener mensajes pendientes limitados
        const mensajesPendientes = JSONManager.obtenerPendientes(this.config.MENSAJES_JSON, batchSize);
        
        if (mensajesPendientes.length === 0) {
            console.log('✅ No hay mensajes pendientes para procesar');
            return;
        }
        
        console.log(`📋 Procesando lote de ${mensajesPendientes.length} mensajes...`);
        
        for (let i = 0; i < mensajesPendientes.length; i++) {
            const mensaje = mensajesPendientes[i];
            
            console.log(`\n📝 [${i + 1}/${mensajesPendientes.length}] ${mensaje.contacto}: [${mensaje.codigo}]`);
            
            try {
                await this.procesarMensajeIndividual(mensaje);
                console.log(`✅ Mensaje procesado`);
                
                if (i < mensajesPendientes.length - 1) {
                    await this.delay(this.config.PROCESSING_DELAY);
                }
                
            } catch (error) {
                console.error(`❌ Error procesando mensaje:`, error);
            }
        }
    }
    
    async procesarMensajeIndividual(mensaje) {
        const strategy = this.strategies.get(mensaje.codigo) || this.strategies.get(0);
        
        try {
            await strategy.process(mensaje);
            
            JSONManager.marcarComoProcesado(this.config.MENSAJES_JSON, mensaje.id, {
                resultadoProcesamiento: `Procesado con estrategia ${strategy.constructor.name}`
            });
            
            return true;
        } catch (error) {
            console.error(`❌ Error en estrategia ${strategy.constructor.name}:`, error);
            throw error;
        }
    }
    
    // Método para procesar solo un tipo específico
    async procesarTipo(tipo) {
        switch (tipo) {
            case 'config':
                await this.procesarConfiguracionesBarrios();
                break;
            case 'agendas':
                await this.procesarAgendas();
                break;
            case 'barrios':
                await this.procesarDatosBarrios();
                break;
            case 'media':
                await this.procesarMedia();
                break;
            default:
                console.log('❌ Tipo no reconocido. Opciones: config, agendas, barrios, media');
        }
    }
    
    // Utilidad para delays
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    // Obtener estadísticas de procesamiento
    obtenerEstadisticas() {
        const statsMensajes = JSONManager.obtenerEstadisticas(this.config.MENSAJES_JSON);
        const statsMedia = JSONManager.obtenerEstadisticas(this.config.MEDIA_JSON);
        
        return {
            mensajes: statsMensajes,
            media: statsMedia,
            configuracion: {
                delayProcesamiento: this.config.PROCESSING_DELAY,
                delayIA: this.config.IA_DELAY,
                tamañoLote: this.config.BATCH_SIZE
            }
        };
    }
}

module.exports = MessageProcessor;
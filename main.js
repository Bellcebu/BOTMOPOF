const { default: makeWASocket, useMultiFileAuthState, downloadMediaMessage } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

// Importar managers y procesadores
const JSONManager = require('./managers/JSONManager');
const MessageProcessor = require('./processors/MessageProcessor');
const { cargarBarriosConfig } = require('./utils/configUtils');
const DeleteStrategy = require('./strategies/DeleteStrategy'); // ✅ Importar DeleteStrategy

// ====================================
// CONFIGURACIONES
// ====================================

const CAPTURE_CONFIG = {
    MENSAJES_JSON: './data/mensajes_capturados.json',
    MEDIA_JSON: './data/media_capturados.json',
    MEDIA_FOLDER: './media_descargados',
    BACKUP_FOLDER: './backups'
};

// ====================================
// VARIABLES GLOBALES
// ====================================

let messageProcessor;
let isProcessing = false;

// ====================================
// FUNCIONES DE CAPTURA
// ====================================

function extraerTextoMensaje(messageTypes) {
    if (messageTypes.extendedTextMessage && messageTypes.extendedTextMessage.text) {
        return messageTypes.extendedTextMessage.text;
    } else if (messageTypes.conversation) {
        return messageTypes.conversation;
    }
    return null;
}

function detectarCodigo(mensaje) {
    const primerNumero = mensaje.trim().split(' ')[0];
    
    if (primerNumero === '11') return { codigo: 11, contenido: mensaje.substring(3).trim() };
    if (primerNumero === '12') return { codigo: 12, contenido: mensaje.substring(3).trim() };
    if (primerNumero === '13') return { codigo: 13, contenido: mensaje.substring(3).trim() };
    if (primerNumero === '5') return { codigo: 5, contenido: mensaje.substring(2).trim() };
    if (primerNumero === '1') return { codigo: 1, contenido: mensaje.substring(2).trim() };
    if (primerNumero === '2') return { codigo: 2, contenido: mensaje.substring(2).trim() };
    if (primerNumero === '3') return { codigo: 3, contenido: mensaje.substring(2).trim() };
    // ❌ ELIMINAR: Código 4365DELETE ya no es necesario
    
    return { codigo: 0, contenido: mensaje };
}

function capturarMensajeTexto(msg) {
    try {
        const messageTypes = msg.message;
        const textoMensaje = extraerTextoMensaje(messageTypes);
        
        if (!textoMensaje) return false;
        
        const { codigo, contenido } = detectarCodigo(textoMensaje);
        const contacto = msg.pushName || (msg.key.participant ? msg.key.participant.split('@')[0] : 'Desconocido');
        const messageTimestamp = msg.messageTimestamp * 1000;
        const fechaMsg = new Date(messageTimestamp);
        
        // Datos RAW de Baileys - SIN PROCESAMIENTO
        const messageData = {
            // Datos de identificación
            messageId: msg.key.id,
            timestamp: messageTimestamp,
            fecha: fechaMsg.toLocaleDateString('es-ES'),
            hora: fechaMsg.toLocaleTimeString('es-ES'),
            
            // Datos del contacto
            contacto,
            pushName: msg.pushName,
            participant: msg.key.participant,
            remoteJid: msg.key.remoteJid,
            
            // Contenido del mensaje
            textoCompleto: textoMensaje,
            codigo,
            contenido,
            
            // Metadatos
            fromMe: msg.key.fromMe,
            tipo: 'texto',
            procesado: false,
            
            // Datos RAW de Baileys (por si se necesitan después)
            baileys_raw: {
                key: msg.key,
                messageTimestamp: msg.messageTimestamp
            }
        };
        
        const success = JSONManager.agregarMensaje(messageData, CAPTURE_CONFIG.MENSAJES_JSON);
        
        if (success) {
            console.log(`📝 CAPTURADO: [${codigo}] ${contacto}: ${contenido.substring(0, 50)}...`);
            return true;
        }
        
        return false;
        
    } catch (error) {
        console.error('❌ Error capturando mensaje de texto:', error);
        return false;
    }
}

async function capturarMensajeMedia(msg, sock) {
    try {
        const messageTypes = msg.message;
        let mediaMessage = null;
        let caption = '';
        let fileExtension = '';
        let tipoMedia = '';
        
        if (messageTypes.imageMessage) {
            mediaMessage = messageTypes.imageMessage;
            caption = mediaMessage.caption || 'imagen_sin_titulo';
            fileExtension = '.jpg';
            tipoMedia = 'imagen';
        } else if (messageTypes.videoMessage) {
            mediaMessage = messageTypes.videoMessage;
            caption = mediaMessage.caption || 'video_sin_titulo';
            fileExtension = '.mp4';
            tipoMedia = 'video';
        } else if (messageTypes.stickerMessage) {
            mediaMessage = messageTypes.stickerMessage;
            caption = 'sticker_' + msg.messageTimestamp;
            fileExtension = '.webp';
            tipoMedia = 'sticker';
        }
        
        if (!mediaMessage) return false;
        
        const { codigo } = detectarCodigo(caption);
        const contacto = msg.pushName || (msg.key.participant ? msg.key.participant.split('@')[0] : 'Desconocido');
        const messageTimestamp = msg.messageTimestamp * 1000;
        const fechaMsg = new Date(messageTimestamp);
        
        // Crear folder si no existe
        if (!fs.existsSync(CAPTURE_CONFIG.MEDIA_FOLDER)) {
            fs.mkdirSync(CAPTURE_CONFIG.MEDIA_FOLDER, { recursive: true });
        }
        
        // Descargar media inmediatamente
        console.log(`📥 Descargando ${tipoMedia}: ${caption}...`);
        const buffer = await downloadMediaMessage(msg, 'buffer', {});
        
        const cleanCaption = caption.replace(/[<>:"/\\|?*]/g, '_').substring(0, 100);
        const fileName = `${messageTimestamp}_${contacto}_${cleanCaption}${fileExtension}`;
        const filePath = path.join(CAPTURE_CONFIG.MEDIA_FOLDER, fileName);
        
        fs.writeFileSync(filePath, buffer);
        console.log(`✅ Media descargado: ${fileName}`);
        
        // Datos RAW de Media - SIN PROCESAMIENTO
        const mediaData = {
            // Datos de identificación
            messageId: msg.key.id,
            timestamp: messageTimestamp,
            fecha: fechaMsg.toLocaleDateString('es-ES'),
            hora: fechaMsg.toLocaleTimeString('es-ES'),
            
            // Datos del contacto
            contacto,
            pushName: msg.pushName,
            participant: msg.key.participant,
            remoteJid: msg.key.remoteJid,
            
            // Contenido del media
            caption,
            codigo,
            tipoMedia,
            fileName,
            filePath,
            fileExtension,
            fileSize: buffer.length,
            
            // Metadatos
            fromMe: msg.key.fromMe,
            tipo: 'media',
            procesado: false,
            subido: false,
            
            // Datos RAW de Baileys
            baileys_raw: {
                key: msg.key,
                messageTimestamp: msg.messageTimestamp,
                mediaMessage: {
                    mimetype: mediaMessage.mimetype,
                    fileSha256: mediaMessage.fileSha256,
                    fileLength: mediaMessage.fileLength
                }
            }
        };
        
        const success = JSONManager.agregarMedia(mediaData, CAPTURE_CONFIG.MEDIA_JSON);
        
        if (success) {
            console.log(`📸 CAPTURADO: [${codigo}] ${contacto}: ${fileName}`);
            return true;
        }
        
        return false;
        
    } catch (error) {
        console.error('❌ Error capturando media:', error);
        return false;
    }
}

// ====================================
// COMANDOS INTERACTIVOS
// ====================================

function mostrarEstadisticas() {
    const mensajes = JSONManager.leerJSON(CAPTURE_CONFIG.MENSAJES_JSON);
    const media = JSONManager.leerJSON(CAPTURE_CONFIG.MEDIA_JSON);
    
    const mensajesPendientes = mensajes.filter(m => !m.procesado);
    const mediaPendiente = media.filter(m => !m.procesado);
    
    console.log('\n📊 === ESTADÍSTICAS DE CAPTURA ===');
    console.log(`📝 Mensajes: ${mensajesPendientes.length} pendientes / ${mensajes.length} total`);
    console.log(`📸 Media: ${mediaPendiente.length} pendientes / ${media.length} total`);
    console.log('===================================\n');
}

async function procesarMensajesPendientes() {
    if (isProcessing) {
        console.log('⏳ Ya hay un procesamiento en curso...');
        return;
    }
    
    isProcessing = true;
    
    try {
        console.log('\n🔄 Iniciando procesamiento de mensajes...');
        await messageProcessor.procesarTodosPendientes();
        console.log('✅ Procesamiento completado\n');
    } catch (error) {
        console.error('❌ Error en procesamiento:', error);
    } finally {
        isProcessing = false;
    }
}

async function limpiarSistemaCompleto() {
    try {
        console.log('\n🗑️ === LIMPIEZA COMPLETA DEL SISTEMA ===');
        console.log('⚠️  Esta acción va a:');
        console.log('   📋 Resetear configuración de barrios');
        console.log('   🗑️  Limpiar mensajes capturados');
        console.log('   📸 Limpiar media capturada');
        console.log('   💾 Crear backup antes de limpiar');
        console.log('');
        
        // Usar DeleteStrategy para hacer la limpieza completa
        const deleteStrategy = new DeleteStrategy();
        
        // Simular datos de mensaje para el log
        const mensajeSimulado = {
            contacto: 'SISTEMA_MANUAL',
            fecha: new Date().toLocaleDateString('es-ES'),
            hora: new Date().toLocaleTimeString('es-ES'),
            messageId: `CLEAN_${Date.now()}`
        };
        
        const resultado = await deleteStrategy.process(mensajeSimulado);
        
        if (resultado.success) {
            console.log('\n🎉 ¡SISTEMA LIMPIADO COMPLETAMENTE!');
            console.log('✅ Acciones realizadas:', resultado.accionesRealizadas);
            if (resultado.backupInfo) {
                console.log(`💾 Backup creado en: ${resultado.backupInfo.directorioBackup}`);
            }
            console.log('\n🚀 El sistema está listo para configurar nuevos barrios');
        }
        
    } catch (error) {
        console.error('❌ Error en limpieza completa:', error);
        console.log('⚠️  La limpieza falló. Revisa los logs para más detalles.');
    }
}

async function ejecutarComandos() {
    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    console.log('\n🎮 === COMANDOS DISPONIBLES ===');
    console.log('stats    - Mostrar estadísticas');
    console.log('process  - Procesar todos los mensajes pendientes');
    console.log('clean    - ⚠️  LIMPIEZA COMPLETA (resetear todo el sistema)');
    console.log('config   - Mostrar configuración de barrios');
    console.log('exit     - Salir del programa');
    console.log('==============================\n');
    
    const preguntarComando = () => {
        rl.question('🎮 Comando: ', async (comando) => {
            switch (comando.trim().toLowerCase()) {
                case 'stats':
                    mostrarEstadisticas();
                    break;
                case 'process':
                    await procesarMensajesPendientes();
                    break;
                case 'clean':
                    // ✅ MEJORADO: Pedir confirmación antes de limpiar
                    rl.question('⚠️  ¿CONFIRMAS LIMPIEZA COMPLETA? (escribe "CONFIRMO" para continuar): ', async (confirmacion) => {
                        if (confirmacion.trim().toUpperCase() === 'CONFIRMO') {
                            await limpiarSistemaCompleto();
                        } else {
                            console.log('❌ Limpieza cancelada');
                        }
                        preguntarComando();
                    });
                    return; // No llamar preguntarComando() aquí
                case 'config':
                    const config = cargarBarriosConfig();
                    console.log('🏘️ Configuración actual:', config);
                    break;
                case 'exit':
                    console.log('👋 Cerrando programa...');
                    rl.close();
                    process.exit(0);
                    break;
                default:
                    console.log('❌ Comando no reconocido');
            }
            preguntarComando();
        });
    };
    
    preguntarComando();
}

// ====================================
// FUNCIÓN PRINCIPAL
// ====================================

async function startBot() {
    try {
        // Crear directorios necesarios
        ['./data', CAPTURE_CONFIG.MEDIA_FOLDER, CAPTURE_CONFIG.BACKUP_FOLDER].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
        
        // Inicializar procesador de mensajes
        messageProcessor = new MessageProcessor();
        
        // Inicializar WhatsApp
        const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
        
        const sock = makeWASocket({
            auth: state,
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                console.log('📱 Escanea este código QR con WhatsApp:');
                qrcode.generate(qr, { small: true });
            }
            
            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== 401;
                console.log('Conexión cerrada debido a', lastDisconnect?.error, ', reconectando...', shouldReconnect);
                if (shouldReconnect) {
                    startBot();
                }
            } else if (connection === 'open') {
                console.log('✅ Bot conectado - MODO CAPTURA ACTIVADO');
                console.log('📦 Todos los mensajes se guardan en JSON sin procesamiento');
                console.log('🎮 Usa comandos para procesar cuando quieras');
                mostrarEstadisticas();
                ejecutarComandos();
            }
        });

        // Capturar TODOS los mensajes sin procesamiento
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            const mensajesGrupo = messages.filter(msg => 
                msg.message && 
                !msg.key.fromMe && 
                msg.key.remoteJid.includes('@g.us')
            );
            
            if (mensajesGrupo.length === 0) return;
            
            console.log(`\n📥 CAPTURANDO ${mensajesGrupo.length} mensaje(s) - Tipo: ${type}`);
            
            let capturedCount = 0;
            
            for (const msg of mensajesGrupo) {
                const messageTypes = msg.message;
                
                // Capturar texto
                const textoMensaje = extraerTextoMensaje(messageTypes);
                if (textoMensaje) {
                    if (capturarMensajeTexto(msg)) {
                        capturedCount++;
                    }
                }
                
                // Capturar media
                if (messageTypes.imageMessage || messageTypes.videoMessage || messageTypes.stickerMessage) {
                    if (await capturarMensajeMedia(msg, sock)) {
                        capturedCount++;
                    }
                }
            }
            
            if (capturedCount > 0) {
                console.log(`✅ ${capturedCount} elementos capturados\n`);
            }
        });

    } catch (error) {
        console.error('❌ Error iniciando bot:', error);
    }
}

// ====================================
// INICIAR APLICACIÓN
// ====================================

console.log('🚀 WhatsApp Bot - Sistema de Captura y Procesamiento');
console.log('📋 Arquitectura: Captura → JSON → Procesamiento Strategy');
console.log('⚡ Ventajas: Cero pérdidas + Control total + Recuperación');
console.log('');

startBot();
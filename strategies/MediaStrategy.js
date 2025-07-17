const fs = require('fs');
const path = require('path');
const DriveManager = require('../managers/DriveManager');
const { obtenerBarrio, cargarBarriosConfig } = require('../utils/configUtils');

class MediaStrategy {
    constructor() {
        this.supportedTypes = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.mp4': 'video/mp4',
            '.mov': 'video/quicktime',
            '.avi': 'video/x-msvideo',
            '.webp': 'image/webp'
        };
    }
    
    async process(mediaInfo) {
        const { codigo, fileName, filePath, fileExtension, caption, contacto, tipoMedia } = mediaInfo;
        
        try {
            const numeroBarrio = codigo; // 1, 2, 3
            
            // ✅ CORREGIDO: Recargar configuración antes de verificar
            const configActual = cargarBarriosConfig();
            const barrioConfig = obtenerBarrio(numeroBarrio);
            
            console.log(`🔍 Verificando barrio ${numeroBarrio} para media:`, barrioConfig);
            
            if (!barrioConfig || !barrioConfig.activo || !barrioConfig.nombre) {
                console.log(`❌ Barrio ${numeroBarrio} no está configurado para media`);
                console.log(`📋 Config actual:`, configActual);
                return {
                    success: false,
                    motivo: `Barrio ${numeroBarrio} no configurado`
                };
            }
            
            const nombreBarrio = barrioConfig.nombre;
            
            console.log(`📸 Procesando ${tipoMedia} para barrio ${numeroBarrio} (${nombreBarrio})`);
            console.log(`📁 Archivo: ${fileName}`);
            console.log(`📝 Caption: ${caption}`);
            
            // Validar que el archivo existe
            if (!fs.existsSync(filePath)) {
                throw new Error(`Archivo no encontrado: ${filePath}`);
            }
            
            // Obtener información del archivo
            const fileStats = fs.statSync(filePath);
            const fileSize = fileStats.size;
            
            console.log(`📊 Tamaño del archivo: ${this.formatFileSize(fileSize)}`);
            
            // Validar tipo de archivo
            const mimeType = this.supportedTypes[fileExtension.toLowerCase()];
            if (!mimeType) {
                throw new Error(`Tipo de archivo no soportado: ${fileExtension}`);
            }
            
            // Validar tamaño del archivo
            const validacionTamaño = this.validarTamañoArchivo(fileSize, tipoMedia);
            if (!validacionTamaño.valido) {
                console.log(`⚠️ ${validacionTamaño.mensaje}`);
            }
            
            // Subir a Google Drive
            const driveFileId = await this.subirADrive(
                filePath, fileName, mimeType, nombreBarrio, numeroBarrio, caption, contacto
            );
            
            if (!driveFileId) {
                throw new Error('Error subiendo archivo a Drive');
            }
            
            console.log(`✅ Media subido exitosamente para barrio ${nombreBarrio}`);
            
            // Opcionalmente, limpiar archivo local después de subir
            await this.limpiarArchivoLocal(filePath);
            
            return {
                success: true,
                numeroBarrio,
                nombreBarrio,
                fileName,
                driveFileId,
                mimeType,
                fileSize,
                accionesRealizadas: [
                    'Archivo validado',
                    'Subido a Google Drive',
                    'Archivo local limpiado'
                ]
            };
            
        } catch (error) {
            console.error(`❌ Error procesando media:`, error);
            throw error;
        }
    }
    
    async subirADrive(filePath, fileName, mimeType, nombreBarrio, numeroBarrio, caption, contacto) {
        try {
            console.log(`🚀 Subiendo ${fileName} a Google Drive...`);
            
            const driveManager = new DriveManager();
            await driveManager.inicializar();
            
            // ✅ CORREGIDO: Obtener carpeta del barrio SIN crear subcarpetas
            const carpetaBarrio = await driveManager.obtenerCarpetaBarrio(nombreBarrio);
            
            if (!carpetaBarrio) {
                throw new Error(`No se pudo obtener carpeta de barrio: ${nombreBarrio}`);
            }
            
            // ✅ CORREGIDO: Generar nombre limpio desde el caption (sin código)
            const captionSinCodigo = caption.replace(/^\d+\s+/, '').trim(); // Remover "1 " del inicio
            const nombreLimpio = captionSinCodigo
                .replace(/[<>:"/\\|?*]/g, '_')      // Reemplazar caracteres especiales
                .replace(/\s+/g, '_')               // Espacios por guiones bajos
                .substring(0, 50);                  // Máximo 50 caracteres
            
            // ✅ CORREGIDO: Nombre final con extensión original
            const nombreFinal = `${nombreLimpio}${path.extname(fileName)}`;
            
            console.log(`📝 Nombre del archivo: "${caption}" → "${nombreFinal}"`);
            
            // Metadatos del archivo
            const metadata = {
                name: nombreFinal,
                parents: [carpetaBarrio],  // ✅ DIRECTO en la carpeta del barrio
                description: `Media de barrio ${nombreBarrio} - Caption: ${caption} - Contacto: ${contacto} - Fecha: ${new Date().toISOString()}`
            };
            
            // Subir archivo
            const driveFileId = await driveManager.subirArchivo(filePath, metadata, mimeType);
            
            if (driveFileId) {
                console.log(`✅ Archivo subido a Drive: ${nombreFinal}`);
                console.log(`📁 Ubicación: Mopof/Barrio Imagenes/Barrio_${nombreBarrio}_FECHA/${nombreFinal}`);
                console.log(`🔗 ID del archivo: ${driveFileId}`);
                
                // Generar enlace compartible (opcional)
                try {
                    const enlaceCompartible = await driveManager.generarEnlacePublico(driveFileId);
                    if (enlaceCompartible) {
                        console.log(`🌐 Enlace público: ${enlaceCompartible}`);
                    }
                } catch (error) {
                    console.log('⚠️ No se pudo generar enlace público (continuando...)');
                }
                
                return driveFileId;
            }
            
            return null;
            
        } catch (error) {
            console.error('❌ Error subiendo archivo a Drive:', error);
            throw error;
        }
    }
    
    validarTamañoArchivo(fileSize, tipoMedia) {
        const MB = 1024 * 1024;
        const GB = 1024 * MB;
        
        // Límites por tipo de media
        const limites = {
            imagen: 50 * MB,    // 50 MB para imágenes
            video: 2 * GB,      // 2 GB para videos
            sticker: 10 * MB    // 10 MB para stickers
        };
        
        const limite = limites[tipoMedia] || 100 * MB;
        
        if (fileSize > limite) {
            return {
                valido: false,
                mensaje: `Archivo muy grande (${this.formatFileSize(fileSize)}). Límite: ${this.formatFileSize(limite)}`
            };
        }
        
        if (fileSize < 1024) { // Menos de 1KB
            return {
                valido: false,
                mensaje: `Archivo muy pequeño (${this.formatFileSize(fileSize)}). Posible corrupción.`
            };
        }
        
        return {
            valido: true,
            mensaje: `Tamaño válido: ${this.formatFileSize(fileSize)}`
        };
    }
    
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    async limpiarArchivoLocal(filePath, mantenerBackup = false) {
        try {
            if (mantenerBackup) {
                // Crear backup antes de eliminar
                const backupPath = filePath + '.backup';
                fs.copyFileSync(filePath, backupPath);
                console.log(`💾 Backup creado: ${backupPath}`);
            }
            
            // Eliminar archivo original
            fs.unlinkSync(filePath);
            console.log(`🗑️ Archivo local limpiado: ${path.basename(filePath)}`);
            
        } catch (error) {
            console.error('❌ Error limpiando archivo local:', error);
            // No fallar el proceso si no se puede limpiar
        }
    }
    
    async procesarMediaPorLotes(mediaList, batchSize = 5) {
        try {
            console.log(`📦 Procesando ${mediaList.length} archivos en lotes de ${batchSize}...`);
            
            const resultados = [];
            
            for (let i = 0; i < mediaList.length; i += batchSize) {
                const lote = mediaList.slice(i, i + batchSize);
                console.log(`\n📋 Procesando lote ${Math.floor(i/batchSize) + 1}/${Math.ceil(mediaList.length/batchSize)}`);
                
                for (let j = 0; j < lote.length; j++) {
                    const media = lote[j];
                    
                    try {
                        console.log(`\n📸 [${i + j + 1}/${mediaList.length}] ${media.fileName}`);
                        const resultado = await this.process(media);
                        resultados.push({ ...media, resultado, procesado: true });
                        
                        // Delay entre archivos
                        if (j < lote.length - 1) {
                            console.log('⏳ Esperando 3 segundos...');
                            await this.delay(3000);
                        }
                        
                    } catch (error) {
                        console.error(`❌ Error procesando ${media.fileName}:`, error);
                        resultados.push({ ...media, error: error.message, procesado: false });
                    }
                }
                
                // Delay más largo entre lotes
                if (i + batchSize < mediaList.length) {
                    console.log('\n⏳ Pausa entre lotes: 10 segundos...');
                    await this.delay(10000);
                }
            }
            
            return resultados;
            
        } catch (error) {
            console.error('❌ Error en procesamiento por lotes:', error);
            throw error;
        }
    }
    
    async verificarIntegridad(filePath) {
        try {
            const stats = fs.statSync(filePath);
            
            // Verificaciones básicas
            if (stats.size === 0) {
                return { integro: false, razon: 'Archivo vacío' };
            }
            
            // Para imágenes, intentar leer header
            const ext = path.extname(filePath).toLowerCase();
            if (['.jpg', '.jpeg', '.png', '.gif'].includes(ext)) {
                const buffer = fs.readFileSync(filePath, { encoding: null });
                
                // Verificar headers básicos
                if (ext === '.jpg' || ext === '.jpeg') {
                    if (buffer[0] !== 0xFF || buffer[1] !== 0xD8) {
                        return { integro: false, razon: 'Header JPEG corrupto' };
                    }
                } else if (ext === '.png') {
                    const pngSignature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
                    for (let i = 0; i < pngSignature.length; i++) {
                        if (buffer[i] !== pngSignature[i]) {
                            return { integro: false, razon: 'Header PNG corrupto' };
                        }
                    }
                }
            }
            
            return { integro: true };
            
        } catch (error) {
            return { integro: false, razon: `Error verificando: ${error.message}` };
        }
    }
    
    async generarThumbnail(filePath, outputPath) {
        try {
            // Aquí se podría integrar con una librería como sharp para generar thumbnails
            // Por ahora, solo retornamos info
            console.log(`🖼️ [SIMULADO] Generando thumbnail: ${path.basename(filePath)}`);
            
            return {
                success: true,
                thumbnailPath: outputPath,
                mensaje: 'Thumbnail generado (simulado)'
            };
            
        } catch (error) {
            console.error('❌ Error generando thumbnail:', error);
            return { success: false, error: error.message };
        }
    }
    
    async extraerMetadatos(filePath) {
        try {
            const stats = fs.statSync(filePath);
            const ext = path.extname(filePath).toLowerCase();
            
            const metadatos = {
                nombre: path.basename(filePath),
                tamaño: stats.size,
                extension: ext,
                fechaCreacion: stats.birthtime,
                fechaModificacion: stats.mtime,
                tipo: this.supportedTypes[ext] || 'unknown'
            };
            
            // Para imágenes, se podría extraer EXIF data
            if (['.jpg', '.jpeg'].includes(ext)) {
                metadatos.tipoEspecifico = 'imagen_jpeg';
                // Aquí se podría usar una librería como exif-parser
            } else if (ext === '.png') {
                metadatos.tipoEspecifico = 'imagen_png';
            } else if (['.mp4', '.mov', '.avi'].includes(ext)) {
                metadatos.tipoEspecifico = 'video';
                // Aquí se podría usar ffprobe para obtener duración, resolución, etc.
            }
            
            return metadatos;
            
        } catch (error) {
            console.error('❌ Error extrayendo metadatos:', error);
            return null;
        }
    }
    
    async organizarPorFecha(mediaList) {
        const organizacion = {};
        
        mediaList.forEach(media => {
            const fecha = media.fecha || new Date().toISOString().split('T')[0];
            
            if (!organizacion[fecha]) {
                organizacion[fecha] = [];
            }
            
            organizacion[fecha].push(media);
        });
        
        return organizacion;
    }
    
    async generarReporteMedia(mediaList) {
        try {
            const reporte = {
                total: mediaList.length,
                exitosos: mediaList.filter(m => m.procesado).length,
                fallidos: mediaList.filter(m => !m.procesado).length,
                porBarrio: {},
                porTipo: {},
                tamañoTotal: 0,
                fechaReporte: new Date().toISOString()
            };
            
            mediaList.forEach(media => {
                // Por barrio
                const barrio = media.numeroBarrio || 'sin_barrio';
                if (!reporte.porBarrio[barrio]) {
                    reporte.porBarrio[barrio] = { count: 0, tamaño: 0 };
                }
                reporte.porBarrio[barrio].count++;
                reporte.porBarrio[barrio].tamaño += media.fileSize || 0;
                
                // Por tipo
                const tipo = media.tipoMedia || 'desconocido';
                if (!reporte.porTipo[tipo]) {
                    reporte.porTipo[tipo] = { count: 0, tamaño: 0 };
                }
                reporte.porTipo[tipo].count++;
                reporte.porTipo[tipo].tamaño += media.fileSize || 0;
                
                // Tamaño total
                reporte.tamañoTotal += media.fileSize || 0;
            });
            
            // Formatear tamaños
            reporte.tamañoTotalFormateado = this.formatFileSize(reporte.tamañoTotal);
            
            Object.keys(reporte.porBarrio).forEach(barrio => {
                reporte.porBarrio[barrio].tamañoFormateado = this.formatFileSize(reporte.porBarrio[barrio].tamaño);
            });
            
            Object.keys(reporte.porTipo).forEach(tipo => {
                reporte.porTipo[tipo].tamañoFormateado = this.formatFileSize(reporte.porTipo[tipo].tamaño);
            });
            
            return reporte;
            
        } catch (error) {
            console.error('❌ Error generando reporte de media:', error);
            return null;
        }
    }
    
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    // Método para estadísticas de media
    async obtenerEstadisticas() {
        try {
            // Aquí se podrían obtener estadísticas del Drive o base de datos
            return {
                totalArchivos: 0,
                tamañoTotal: 0,
                tiposArchivos: {},
                archivosPorBarrio: {},
                fechaUltimaSubida: null
            };
            
        } catch (error) {
            console.error('❌ Error obteniendo estadísticas de media:', error);
            return null;
        }
    }
}

module.exports = MediaStrategy;
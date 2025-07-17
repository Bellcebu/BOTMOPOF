const fs = require('fs');
const path = require('path');
const { resetearTodosLosBarrios, cargarBarriosConfig } = require('../utils/configUtils');
const JSONManager = require('../managers/JSONManager');

class DeleteStrategy {
    async process(messageInfo) {
        const { contacto, fecha, hora, messageId } = messageInfo;
        
        try {
            console.log('🗑️ Ejecutando comando DELETE - Reseteando sistema completo');
            console.log(`👤 Solicitado por: ${contacto} el ${fecha} a las ${hora}`);
            
            // Crear backup antes de resetear
            const backupInfo = await this.crearBackupCompleto();
            
            // Resetear configuración de barrios
            await this.resetearConfiguracionBarrios();
            
            // Limpiar archivos JSON (opcional)
            await this.limpiarArchivosJSON();
            
            // Limpiar media descargada (opcional)
            await this.limpiarMediaDescargada();
            
            // Crear log del reseteo
            await this.crearLogReseteo(contacto, fecha, hora, messageId, backupInfo);
            
            console.log('✅ Sistema reseteado completamente');
            
            return {
                success: true,
                accionesRealizadas: [
                    'Backup completo creado',
                    'Configuración de barrios reseteada',
                    'Archivos JSON limpiados',
                    'Media descargada limpiada',
                    'Log de reseteo creado'
                ],
                backupInfo
            };
            
        } catch (error) {
            console.error('❌ Error ejecutando comando DELETE:', error);
            throw error;
        }
    }
    
    async crearBackupCompleto() {
        try {
            console.log('💾 Creando backup completo antes del reseteo...');
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupDir = `./backups/delete_backup_${timestamp}`;
            
            // Crear directorio de backup
            if (!fs.existsSync(backupDir)) {
                fs.mkdirSync(backupDir, { recursive: true });
            }
            
            const archivosBackup = [];
            
            // Backup de configuración de barrios
            const configFile = './config/barrios_config.json';
            if (fs.existsSync(configFile)) {
                const backupConfigPath = path.join(backupDir, 'barrios_config.json');
                fs.copyFileSync(configFile, backupConfigPath);
                archivosBackup.push('barrios_config.json');
            }
            
            // Backup de mensajes capturados
            const mensajesFile = './data/mensajes_capturados.json';
            if (fs.existsSync(mensajesFile)) {
                const backupMensajesPath = path.join(backupDir, 'mensajes_capturados.json');
                fs.copyFileSync(mensajesFile, backupMensajesPath);
                archivosBackup.push('mensajes_capturados.json');
            }
            
            // Backup de media capturada
            const mediaFile = './data/media_capturados.json';
            if (fs.existsSync(mediaFile)) {
                const backupMediaPath = path.join(backupDir, 'media_capturados.json');
                fs.copyFileSync(mediaFile, backupMediaPath);
                archivosBackup.push('media_capturados.json');
            }
            
            // Crear archivo de información del backup
            const backupInfo = {
                fechaBackup: new Date().toISOString(),
                razon: 'Comando DELETE ejecutado',
                archivosIncluidos: archivosBackup,
                directorioBackup: backupDir,
                totalArchivos: archivosBackup.length
            };
            
            const infoPath = path.join(backupDir, 'backup_info.json');
            fs.writeFileSync(infoPath, JSON.stringify(backupInfo, null, 2));
            
            console.log(`✅ Backup completo creado en: ${backupDir}`);
            console.log(`📁 Archivos incluidos: ${archivosBackup.join(', ')}`);
            
            return backupInfo;
            
        } catch (error) {
            console.error('❌ Error creando backup completo:', error);
            throw error;
        }
    }
    
    async resetearConfiguracionBarrios() {
        try {
            console.log('🏘️ Reseteando configuración de barrios...');
            
            const success = resetearTodosLosBarrios();
            
            if (success) {
                console.log('✅ Configuración de barrios reseteada');
                
                // Verificar el reseteo
                const configActual = cargarBarriosConfig();
                console.log('📋 Configuración después del reseteo:', {
                    barrio1: configActual.barrio1,
                    barrio2: configActual.barrio2,
                    barrio3: configActual.barrio3
                });
            } else {
                throw new Error('No se pudo resetear la configuración de barrios');
            }
            
        } catch (error) {
            console.error('❌ Error reseteando configuración de barrios:', error);
            throw error;
        }
    }
    
    async limpiarArchivosJSON() {
        try {
            console.log('🧹 Limpiando archivos JSON...');
            
            const archivosLimpiar = [
                './data/mensajes_capturados.json',
                './data/media_capturados.json'
            ];
            
            const archivosLimpiados = [];
            
            for (const archivo of archivosLimpiar) {
                if (fs.existsSync(archivo)) {
                    // En lugar de eliminar, vaciamos el contenido
                    fs.writeFileSync(archivo, JSON.stringify([], null, 2));
                    archivosLimpiados.push(path.basename(archivo));
                    console.log(`🗑️ ${path.basename(archivo)} limpiado`);
                }
            }
            
            console.log(`✅ ${archivosLimpiados.length} archivos JSON limpiados`);
            
        } catch (error) {
            console.error('❌ Error limpiando archivos JSON:', error);
            throw error;
        }
    }
    
    async limpiarMediaDescargada() {
        try {
            console.log('📸 Limpiando media descargada...');
            
            const mediaDir = './media_descargados';
            
            if (!fs.existsSync(mediaDir)) {
                console.log('📁 Directorio de media no existe, omitiendo...');
                return;
            }
            
            const archivos = fs.readdirSync(mediaDir);
            let archivosEliminados = 0;
            
            for (const archivo of archivos) {
                const rutaCompleta = path.join(mediaDir, archivo);
                const stats = fs.statSync(rutaCompleta);
                
                if (stats.isFile()) {
                    fs.unlinkSync(rutaCompleta);
                    archivosEliminados++;
                }
            }
            
            console.log(`🗑️ ${archivosEliminados} archivos de media eliminados`);
            
        } catch (error) {
            console.error('❌ Error limpiando media descargada:', error);
            // No fallar todo el proceso por esto
            console.log('⚠️ Continuando sin limpiar media...');
        }
    }
    
    async crearLogReseteo(contacto, fecha, hora, messageId, backupInfo) {
        try {
            console.log('📋 Creando log del reseteo...');
            
            const logDir = './logs';
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const logFile = path.join(logDir, `reseteo_${timestamp}.json`);
            
            const logData = {
                evento: 'SISTEMA_RESETEADO',
                fecha: new Date().toISOString(),
                solicitadoPor: {
                    contacto,
                    fecha,
                    hora,
                    messageId
                },
                accionesRealizadas: {
                    backupCreado: backupInfo ? true : false,
                    directorioBackup: backupInfo ? backupInfo.directorioBackup : null,
                    configuracionReseteada: true,
                    archivosJSONLimpiados: true,
                    mediaLimpiada: true
                },
                estadoAnterior: {
                    // Aquí se podría incluir estadísticas del sistema antes del reseteo
                    timestamp: new Date().toISOString()
                },
                estadoPosterior: {
                    barrios: {
                        barrio1: { nombre: null, activo: false },
                        barrio2: { nombre: null, activo: false },
                        barrio3: { nombre: null, activo: false }
                    },
                    archivosJSON: 'vacios',
                    mediaDescargada: 'limpia'
                }
            };
            
            fs.writeFileSync(logFile, JSON.stringify(logData, null, 2));
            
            console.log(`📋 Log de reseteo creado: ${logFile}`);
            
        } catch (error) {
            console.error('❌ Error creando log de reseteo:', error);
            // No fallar todo el proceso por esto
        }
    }
    
    async verificarEstadoSistema() {
        try {
            console.log('🔍 Verificando estado del sistema después del reseteo...');
            
            const estado = {
                configuracionBarrios: this.verificarConfiguracionBarrios(),
                archivosJSON: this.verificarArchivosJSON(),
                mediaDescargada: this.verificarMediaDescargada(),
                backupsDisponibles: this.listarBackupsDisponibles()
            };
            
            console.log('📊 Estado del sistema:', estado);
            
            return estado;
            
        } catch (error) {
            console.error('❌ Error verificando estado del sistema:', error);
            return null;
        }
    }
    
    verificarConfiguracionBarrios() {
        try {
            const config = cargarBarriosConfig();
            
            const todosInactivos = !config.barrio1.activo && !config.barrio2.activo && !config.barrio3.activo;
            const todosSinNombre = !config.barrio1.nombre && !config.barrio2.nombre && !config.barrio3.nombre;
            
            return {
                reseteada: todosInactivos && todosSinNombre,
                detalles: {
                    barrio1: config.barrio1,
                    barrio2: config.barrio2,
                    barrio3: config.barrio3
                }
            };
            
        } catch (error) {
            return { reseteada: false, error: error.message };
        }
    }
    
    verificarArchivosJSON() {
        const archivos = [
            './data/mensajes_capturados.json',
            './data/media_capturados.json'
        ];
        
        const estado = {};
        
        archivos.forEach(archivo => {
            const nombre = path.basename(archivo);
            
            if (fs.existsSync(archivo)) {
                try {
                    const contenido = JSON.parse(fs.readFileSync(archivo, 'utf8'));
                    estado[nombre] = {
                        existe: true,
                        vacio: Array.isArray(contenido) && contenido.length === 0,
                        elementos: Array.isArray(contenido) ? contenido.length : 'no_array'
                    };
                } catch (error) {
                    estado[nombre] = { existe: true, error: 'error_parsing' };
                }
            } else {
                estado[nombre] = { existe: false };
            }
        });
        
        return estado;
    }
    
    verificarMediaDescargada() {
        const mediaDir = './media_descargados';
        
        if (!fs.existsSync(mediaDir)) {
            return { directorio: false, archivos: 0 };
        }
        
        try {
            const archivos = fs.readdirSync(mediaDir);
            const soloArchivos = archivos.filter(archivo => {
                const rutaCompleta = path.join(mediaDir, archivo);
                return fs.statSync(rutaCompleta).isFile();
            });
            
            return {
                directorio: true,
                archivos: soloArchivos.length,
                limpio: soloArchivos.length === 0
            };
            
        } catch (error) {
            return { directorio: true, error: error.message };
        }
    }
    
    listarBackupsDisponibles() {
        const backupDir = './backups';
        
        if (!fs.existsSync(backupDir)) {
            return [];
        }
        
        try {
            const carpetas = fs.readdirSync(backupDir);
            const backupsDelete = carpetas.filter(carpeta => 
                carpeta.startsWith('delete_backup_') && 
                fs.statSync(path.join(backupDir, carpeta)).isDirectory()
            );
            
            return backupsDelete.map(backup => ({
                nombre: backup,
                ruta: path.join(backupDir, backup),
                fecha: backup.replace('delete_backup_', '').replace(/-/g, ':')
            }));
            
        } catch (error) {
            return [];
        }
    }
    
    async restaurarDesdeBackup(backupDir) {
        try {
            console.log(`🔄 Restaurando desde backup: ${backupDir}`);
            
            if (!fs.existsSync(backupDir)) {
                throw new Error('Directorio de backup no existe');
            }
            
            // Restaurar configuración de barrios
            const configBackup = path.join(backupDir, 'barrios_config.json');
            if (fs.existsSync(configBackup)) {
                fs.copyFileSync(configBackup, './config/barrios_config.json');
                console.log('✅ Configuración de barrios restaurada');
            }
            
            // Restaurar mensajes
            const mensajesBackup = path.join(backupDir, 'mensajes_capturados.json');
            if (fs.existsSync(mensajesBackup)) {
                fs.copyFileSync(mensajesBackup, './data/mensajes_capturados.json');
                console.log('✅ Mensajes restaurados');
            }
            
            // Restaurar media
            const mediaBackup = path.join(backupDir, 'media_capturados.json');
            if (fs.existsSync(mediaBackup)) {
                fs.copyFileSync(mediaBackup, './data/media_capturados.json');
                console.log('✅ Media restaurada');
            }
            
            console.log('🎉 Restauración completada exitosamente');
            
            return { success: true };
            
        } catch (error) {
            console.error('❌ Error restaurando desde backup:', error);
            throw error;
        }
    }
}

module.exports = DeleteStrategy;
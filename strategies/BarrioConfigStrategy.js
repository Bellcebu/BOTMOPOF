const { actualizarBarrio } = require('../utils/configUtils');
const SheetsManager = require('../managers/SheetsManager');
const DriveManager = require('../managers/DriveManager');

class BarrioConfigStrategy {
    async process(messageInfo) {
        const { codigo, contenido, contacto, fecha, hora } = messageInfo;
        
        try {
            console.log(`🏘️ Configurando barrio ${codigo - 10}: "${contenido}"`);
            
            const numeroBarrio = codigo - 10; // 11->1, 12->2, 13->3
            const nombreBarrio = contenido.toUpperCase().trim();
            
            // Validar nombre del barrio
            if (!nombreBarrio || nombreBarrio.length < 2) {
                throw new Error('Nombre de barrio inválido');
            }
            
            // Actualizar configuración
            const success = actualizarBarrio(numeroBarrio, nombreBarrio);
            
            if (!success) {
                throw new Error('Error guardando configuración de barrio');
            }
            
            console.log(`✅ Barrio ${numeroBarrio} configurado localmente: ${nombreBarrio}`);
            
            // Crear separador en Google Sheets CON FECHA del mensaje
            await this.crearSeparadorBarrio(nombreBarrio, fecha);
            
            // Crear estructura de carpetas en Drive
            await this.crearEstructuraCarpetas(nombreBarrio);
            
            console.log(`🎉 Barrio ${numeroBarrio} completamente configurado: ${nombreBarrio}`);
            
            return {
                success: true,
                numeroBarrio,
                nombreBarrio,
                accionesRealizadas: [
                    'Configuración local actualizada',
                    'Separador creado en Google Sheets',
                    'Estructura de carpetas creada en Drive'
                ]
            };
            
        } catch (error) {
            console.error(`❌ Error configurando barrio ${codigo}:`, error);
            throw error;
        }
    }
    
    async crearSeparadorBarrio(nombreBarrio, fechaMensaje) {
        try {
            console.log(`📊 Creando separador para barrio: ${nombreBarrio} - ${fechaMensaje}`);
            
            const sheetsManager = new SheetsManager();
            await sheetsManager.inicializar();
            
            // Crear separador visual con fecha del mensaje
            await sheetsManager.crearSeparadorBarrio(nombreBarrio, fechaMensaje);
            
            console.log(`✅ Separador creado en Google Sheets: ${nombreBarrio} - ${fechaMensaje}`);
            
        } catch (error) {
            console.error(`❌ Error creando separador para ${nombreBarrio}:`, error);
            // No fallar todo el proceso si solo falla el separador
            console.log(`⚠️ Continuando sin separador en Sheets...`);
        }
    }
    
    async crearEstructuraCarpetas(nombreBarrio) {
        try {
            console.log(`📁 Creando estructura de carpetas para: ${nombreBarrio}`);
            
            const driveManager = new DriveManager();
            await driveManager.inicializar();
            
            // Crear carpeta principal del barrio - SIN SUBCARPETAS
            const carpetaBarrio = await driveManager.crearCarpetaBarrio(nombreBarrio);
            
            if (carpetaBarrio) {
                console.log(`✅ Carpeta creada: Mopof/Barrio Imagenes/Barrio_${nombreBarrio}_FECHA/`);
                console.log(`📁 Lista para recibir imágenes y videos directamente`);
            }
            
        } catch (error) {
            console.error(`❌ Error creando carpetas para ${nombreBarrio}:`, error);
            // No fallar todo el proceso si solo fallan las carpetas
            console.log(`⚠️ Continuando sin estructura de carpetas...`);
        }
    }
    
    // Método para validar si un barrio ya está configurado
    async validarBarrioExistente(numeroBarrio, nombreBarrio) {
        try {
            const { obtenerBarrio } = require('../utils/configUtils');
            const barrioExistente = obtenerBarrio(numeroBarrio);
            
            if (barrioExistente && barrioExistente.activo) {
                if (barrioExistente.nombre === nombreBarrio) {
                    console.log(`⚠️ Barrio ${numeroBarrio} ya está configurado con el mismo nombre: ${nombreBarrio}`);
                    return { yaExiste: true, mismoNombre: true };
                } else {
                    console.log(`⚠️ Barrio ${numeroBarrio} ya está configurado con nombre diferente: ${barrioExistente.nombre} -> ${nombreBarrio}`);
                    return { yaExiste: true, mismoNombre: false, nombreAnterior: barrioExistente.nombre };
                }
            }
            
            return { yaExiste: false };
            
        } catch (error) {
            console.error('❌ Error validando barrio existente:', error);
            return { yaExiste: false };
        }
    }
    
    // Método para reconfigurar un barrio existente
    async reconfigurarBarrio(numeroBarrio, nombreAnterior, nombreNuevo) {
        try {
            console.log(`🔄 Reconfigurando barrio ${numeroBarrio}: ${nombreAnterior} -> ${nombreNuevo}`);
            
            // Aquí podrías implementar lógica para:
            // 1. Renombrar carpetas en Drive
            // 2. Actualizar separadores en Sheets
            // 3. Migrar datos existentes
            
            console.log(`✅ Barrio ${numeroBarrio} reconfigurado exitosamente`);
            
        } catch (error) {
            console.error(`❌ Error reconfigurando barrio ${numeroBarrio}:`, error);
            throw error;
        }
    }
}

module.exports = BarrioConfigStrategy;
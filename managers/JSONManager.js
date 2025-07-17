const fs = require('fs');
const path = require('path');

class JSONManager {
    
    static leerJSON(archivo, defaultValue = []) {
        try {
            if (fs.existsSync(archivo)) {
                const data = fs.readFileSync(archivo, 'utf8');
                return JSON.parse(data);
            }
            return defaultValue;
        } catch (error) {
            console.error(`❌ Error leyendo ${archivo}:`, error);
            return defaultValue;
        }
    }
    
    static escribirJSON(archivo, data) {
        try {
            // Crear directorio si no existe
            const dir = path.dirname(archivo);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            // Crear backup si el archivo existe
            if (fs.existsSync(archivo)) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const backupDir = './backups';
                const backupPath = path.join(backupDir, `${path.basename(archivo)}_backup_${timestamp}`);
                
                if (!fs.existsSync(backupDir)) {
                    fs.mkdirSync(backupDir, { recursive: true });
                }
                
                fs.copyFileSync(archivo, backupPath);
            }
            
            fs.writeFileSync(archivo, JSON.stringify(data, null, 2), 'utf8');
            return true;
        } catch (error) {
            console.error(`❌ Error escribiendo ${archivo}:`, error);
            return false;
        }
    }
    
    static agregarMensaje(messageData, archivo) {
        const mensajes = this.leerJSON(archivo);
        
        // Generar ID único
        messageData.id = Date.now() + Math.random();
        messageData.fechaCaptura = new Date().toISOString();
        
        mensajes.push(messageData);
        return this.escribirJSON(archivo, mensajes);
    }
    
    static agregarMedia(mediaData, archivo) {
        const media = this.leerJSON(archivo);
        
        // Generar ID único
        mediaData.id = Date.now() + Math.random();
        mediaData.fechaCaptura = new Date().toISOString();
        
        media.push(mediaData);
        return this.escribirJSON(archivo, media);
    }
    
    static marcarComoProcesado(archivo, id, campoAdicional = null) {
        const datos = this.leerJSON(archivo);
        
        const item = datos.find(d => d.id === id);
        if (item) {
            item.procesado = true;
            item.fechaProcesado = new Date().toISOString();
            
            if (campoAdicional) {
                Object.assign(item, campoAdicional);
            }
            
            return this.escribirJSON(archivo, datos);
        }
        return false;
    }
    
    static obtenerPendientes(archivo, limite = null, filtro = null) {
        const datos = this.leerJSON(archivo);
        let pendientes = datos.filter(d => !d.procesado);
        
        // Aplicar filtro adicional si se proporciona
        if (filtro && typeof filtro === 'function') {
            pendientes = pendientes.filter(filtro);
        }
        
        // Ordenar por timestamp para procesamiento secuencial
        pendientes.sort((a, b) => a.timestamp - b.timestamp);
        
        return limite ? pendientes.slice(0, limite) : pendientes;
    }
    
    static limpiarProcesados(archivo) {
        const datos = this.leerJSON(archivo);
        const pendientes = datos.filter(d => !d.procesado);
        const procesados = datos.filter(d => d.procesado);
        
        // Guardar solo los pendientes
        this.escribirJSON(archivo, pendientes);
        
        // Crear archivo de histórico si hay procesados
        if (procesados.length > 0) {
            const timestamp = new Date().toISOString().split('T')[0];
            const historicoPath = archivo.replace('.json', `_historico_${timestamp}.json`);
            
            let historico = [];
            if (fs.existsSync(historicoPath)) {
                historico = this.leerJSON(historicoPath);
            }
            
            historico.push(...procesados);
            this.escribirJSON(historicoPath, historico);
            
            console.log(`📁 ${procesados.length} elementos movidos a histórico: ${historicoPath}`);
        }
        
        console.log(`🧹 Limpieza completada: ${pendientes.length} pendientes, ${procesados.length} archivados`);
        return true;
    }
    
    static obtenerEstadisticas(archivo) {
        const datos = this.leerJSON(archivo);
        
        const total = datos.length;
        const procesados = datos.filter(d => d.procesado).length;
        const pendientes = total - procesados;
        
        // Estadísticas por código
        const porCodigo = {};
        datos.forEach(item => {
            if (!porCodigo[item.codigo]) {
                porCodigo[item.codigo] = { total: 0, procesados: 0, pendientes: 0 };
            }
            porCodigo[item.codigo].total++;
            if (item.procesado) {
                porCodigo[item.codigo].procesados++;
            } else {
                porCodigo[item.codigo].pendientes++;
            }
        });
        
        // Estadísticas por contacto
        const porContacto = {};
        datos.forEach(item => {
            if (!porContacto[item.contacto]) {
                porContacto[item.contacto] = { total: 0, procesados: 0, pendientes: 0 };
            }
            porContacto[item.contacto].total++;
            if (item.procesado) {
                porContacto[item.contacto].procesados++;
            } else {
                porContacto[item.contacto].pendientes++;
            }
        });
        
        return {
            resumen: { total, procesados, pendientes },
            porCodigo,
            porContacto,
            archivo: path.basename(archivo)
        };
    }
    
    static buscarPorCriterio(archivo, criterio) {
        const datos = this.leerJSON(archivo);
        
        return datos.filter(item => {
            // Búsqueda flexible por múltiples campos
            const textoCompleto = JSON.stringify(item).toLowerCase();
            return textoCompleto.includes(criterio.toLowerCase());
        });
    }
    
    static reprocesarElemento(archivo, id) {
        const datos = this.leerJSON(archivo);
        
        const item = datos.find(d => d.id === id);
        if (item) {
            item.procesado = false;
            item.fechaReproceso = new Date().toISOString();
            delete item.fechaProcesado;
            
            return this.escribirJSON(archivo, datos);
        }
        return false;
    }
    
    static eliminarElemento(archivo, id) {
        const datos = this.leerJSON(archivo);
        const nuevosDatos = datos.filter(d => d.id !== id);
        
        if (nuevosDatos.length < datos.length) {
            return this.escribirJSON(archivo, nuevosDatos);
        }
        return false;
    }
    
    // Método específico para obtener mensajes que requieren configuración de barrios
    static obtenerMensajesConfiguracion(archivo) {
        return this.obtenerPendientes(archivo, null, (item) => {
            return item.codigo >= 11 && item.codigo <= 13;
        });
    }
    
    // Método específico para obtener mensajes de datos de barrio
    static obtenerMensajesDatosBarrio(archivo) {
        return this.obtenerPendientes(archivo, null, (item) => {
            return item.codigo >= 1 && item.codigo <= 3;
        });
    }
    
    // Método específico para obtener agendas
    static obtenerMensajesAgenda(archivo) {
        return this.obtenerPendientes(archivo, null, (item) => {
            return item.codigo === 5;
        });
    }
}

module.exports = JSONManager;
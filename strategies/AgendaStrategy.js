const IAManager = require('../managers/IAManager');
const SheetsManager = require('../managers/SheetsManager');

class AgendaStrategy {
    constructor() {
        this.iaManager = new IAManager();
    }
    
    async process(messageInfo) {
        const { contenido, contacto, fecha, hora, messageId } = messageInfo;
        
        try {
            console.log(`📅 Procesando agenda de ${contacto}`);
            console.log(`📝 Contenido: ${contenido.substring(0, 100)}...`);
            
            // Extraer información de agenda usando IA
            const agendaData = await this.iaManager.extraerAgenda(contenido);
            
            if (!agendaData) {
                console.log('❌ No se detectó información de agenda válida');
                return {
                    success: false,
                    motivo: 'No se detectó agenda válida con IA'
                };
            }
            
            console.log('🎯 Agenda detectada:', agendaData);
            
            // Guardar en Google Sheets
            await this.guardarAgendaEnSheets(contacto, contenido, agendaData, fecha, hora, messageId);
            
            console.log('✅ Agenda procesada y guardada exitosamente');
            
            return {
                success: true,
                agendaDetectada: agendaData,
                accionesRealizadas: [
                    'Información extraída con IA',
                    'Guardada en Google Sheets'
                ]
            };
            
        } catch (error) {
            console.error('❌ Error procesando agenda:', error);
            throw error;
        }
    }
    
    async guardarAgendaEnSheets(contacto, mensajeOriginal, agendaData, fechaMensaje, horaMensaje, messageId) {
        try {
            console.log('📊 Guardando agenda en Google Sheets...');
            
            const sheetsManager = new SheetsManager();
            await sheetsManager.inicializar();
            
            // Preparar datos para la fila (solo las columnas necesarias)
            const nuevaFila = [
                agendaData.fecha || 'No especificada',
                agendaData.hora || 'No especificada', 
                agendaData.motivo || 'No especificado',
                agendaData.persona || 'No especificada',
                'Pendiente', // Estado inicial
                fechaMensaje,
                horaMensaje,
                contacto,
                mensajeOriginal
                // ❌ NO agregar messageId - solo 9 columnas
            ];
            
            console.log(`📝 Datos de agenda a insertar (${nuevaFila.length} columnas):`, nuevaFila);
            
            // Obtener o crear spreadsheet de agendas
            const spreadsheetId = await sheetsManager.obtenerSpreadsheetAgendas();
            
            // Agregar nueva fila
            await sheetsManager.agregarFilaAgenda(spreadsheetId, nuevaFila);
            
            console.log('✅ Agenda guardada en Google Sheets');
            
        } catch (error) {
            console.error('❌ Error guardando agenda en Google Sheets:', error);
            throw error;
        }
    }
    
    // Método para analizar múltiples agendas y detectar conflictos
    async analizarConflictos(agendas) {
        try {
            console.log('🔍 Analizando posibles conflictos de horarios...');
            
            const conflictos = [];
            
            for (let i = 0; i < agendas.length; i++) {
                for (let j = i + 1; j < agendas.length; j++) {
                    const agenda1 = agendas[i];
                    const agenda2 = agendas[j];
                    
                    if (this.detectarConflictoHorario(agenda1, agenda2)) {
                        conflictos.push({
                            agenda1: agenda1,
                            agenda2: agenda2,
                            tipo: 'conflicto_horario'
                        });
                    }
                }
            }
            
            if (conflictos.length > 0) {
                console.log(`⚠️ Se detectaron ${conflictos.length} conflictos de horario`);
            } else {
                console.log('✅ No se detectaron conflictos de horario');
            }
            
            return conflictos;
            
        } catch (error) {
            console.error('❌ Error analizando conflictos:', error);
            return [];
        }
    }
    
    detectarConflictoHorario(agenda1, agenda2) {
        // Lógica simple para detectar conflictos
        // Se puede mejorar con parsing de fechas más sofisticado
        
        if (!agenda1.fecha || !agenda2.fecha || !agenda1.hora || !agenda2.hora) {
            return false;
        }
        
        // Si tienen la misma fecha y hora similares, hay conflicto
        const fecha1 = agenda1.fecha.toLowerCase();
        const fecha2 = agenda2.fecha.toLowerCase();
        const hora1 = agenda1.hora.toLowerCase();
        const hora2 = agenda2.hora.toLowerCase();
        
        return (fecha1 === fecha2) && (Math.abs(this.parsearHora(hora1) - this.parsearHora(hora2)) < 2);
    }
    
    parsearHora(horaStr) {
        // Convertir hora string a número para comparación
        // Ejemplo: "14:30" -> 14.5
        try {
            const match = horaStr.match(/(\d{1,2}):?(\d{0,2})/);
            if (match) {
                const horas = parseInt(match[1]);
                const minutos = parseInt(match[2] || 0);
                return horas + (minutos / 60);
            }
        } catch (error) {
            // Si no se puede parsear, retornar 0
        }
        return 0;
    }
    
    // Método para clasificar tipos de agenda
    async clasificarTipoAgenda(agendaData) {
        try {
            const motivo = (agendaData.motivo || '').toLowerCase();
            
            if (motivo.includes('reunión') || motivo.includes('meeting') || motivo.includes('junta')) {
                return 'reunion';
            } else if (motivo.includes('asamblea') || motivo.includes('convocatoria')) {
                return 'asamblea';
            } else if (motivo.includes('entrega') || motivo.includes('presupuesto')) {
                return 'entrega';
            } else if (motivo.includes('revisión') || motivo.includes('revisar')) {
                return 'revision';
            } else {
                return 'general';
            }
            
        } catch (error) {
            return 'general';
        }
    }
    
    // Método para generar recordatorios
    async generarRecordatorio(agendaData, tiempoAntes = '1 día') {
        try {
            console.log(`⏰ Generando recordatorio para: ${agendaData.motivo}`);
            
            const recordatorio = {
                fecha: agendaData.fecha,
                hora: agendaData.hora,
                motivo: agendaData.motivo,
                persona: agendaData.persona,
                tiempoRecordatorio: tiempoAntes,
                fechaCreacion: new Date().toISOString(),
                activo: true
            };
            
            // Aquí se podría implementar lógica para enviar recordatorios
            // Por ejemplo, guardar en una tabla de recordatorios
            
            console.log('✅ Recordatorio generado:', recordatorio);
            return recordatorio;
            
        } catch (error) {
            console.error('❌ Error generando recordatorio:', error);
            return null;
        }
    }
    
    // Método para validar datos de agenda
    validarDatosAgenda(agendaData) {
        const errores = [];
        const warnings = [];
        
        if (!agendaData.fecha || agendaData.fecha === 'No especificada') {
            warnings.push('Fecha no especificada');
        }
        
        if (!agendaData.hora || agendaData.hora === 'No especificada') {
            warnings.push('Hora no especificada');
        }
        
        if (!agendaData.motivo || agendaData.motivo === 'No especificado') {
            errores.push('Motivo no especificado');
        }
        
        if (!agendaData.persona || agendaData.persona === 'No especificada') {
            warnings.push('Persona responsable no especificada');
        }
        
        return {
            valida: errores.length === 0,
            errores,
            warnings
        };
    }
    
    // Método para estadísticas de agendas
    async obtenerEstadisticas() {
        try {
            // Aquí se podría obtener estadísticas del spreadsheet
            return {
                totalAgendas: 0,
                agendasPendientes: 0,
                agendasCompletadas: 0,
                tiposComunes: [],
                fechaUltimaActualizacion: new Date().toISOString()
            };
            
        } catch (error) {
            console.error('❌ Error obteniendo estadísticas de agendas:', error);
            return null;
        }
    }
}

module.exports = AgendaStrategy;
const IAManager = require('../managers/IAManager');
const SheetsManager = require('../managers/SheetsManager');
const { obtenerBarrio, cargarBarriosConfig } = require('../utils/configUtils');

class BarrioDataStrategy {
    constructor() {
        this.iaManager = new IAManager();
    }
    
    async process(messageInfo) {
        const { codigo, contenido, contacto, fecha, hora, messageId } = messageInfo;
        
        try {
            const numeroBarrio = codigo; // 1, 2, 3
            
            // ✅ CORREGIDO: Recargar configuración antes de verificar
            const configActual = cargarBarriosConfig();
            const barrioConfig = obtenerBarrio(numeroBarrio);
            
            console.log(`🔍 Verificando barrio ${numeroBarrio}:`, barrioConfig);
            
            if (!barrioConfig || !barrioConfig.activo || !barrioConfig.nombre) {
                console.log(`❌ Barrio ${numeroBarrio} no está configurado`);
                console.log(`📋 Config actual:`, configActual);
                return {
                    success: false,
                    motivo: `Barrio ${numeroBarrio} no configurado`
                };
            }
            
            const nombreBarrio = barrioConfig.nombre;
            
            console.log(`🏘️ Procesando datos para barrio ${numeroBarrio} (${nombreBarrio})`);
            console.log(`👤 Contacto: ${contacto}`);
            console.log(`📝 Contenido: ${contenido.substring(0, 100)}...`);
            
            // Extraer datos usando IA
            const datosBarrio = await this.iaManager.extraerDatosBarrio(contenido);
            
            if (!datosBarrio) {
                console.log('❌ No se detectaron datos de barrio válidos');
                return {
                    success: false,
                    motivo: 'No se detectaron datos de barrio con IA'
                };
            }
            
            console.log('🎯 Datos de barrio detectados:', datosBarrio);
            
            // Validar datos extraídos
            const validacion = this.validarDatosBarrio(datosBarrio);
            if (!validacion.valida) {
                console.log('⚠️ Datos incompletos, pero se guardarán:', validacion.warnings);
            }
            
            // Guardar en Google Sheets
            await this.guardarDatosEnSheets(
                contacto, contenido, datosBarrio, fecha, hora, 
                nombreBarrio, numeroBarrio, messageId
            );
            
            console.log(`✅ Datos de barrio ${nombreBarrio} procesados exitosamente`);
            
            return {
                success: true,
                numeroBarrio,
                nombreBarrio,
                datosExtraidos: datosBarrio,
                validacion,
                accionesRealizadas: [
                    'Datos extraídos con IA',
                    'Validación completada',
                    'Guardados en Google Sheets'
                ]
            };
            
        } catch (error) {
            console.error(`❌ Error procesando datos de barrio ${codigo}:`, error);
            throw error;
        }
    }
    
    async guardarDatosEnSheets(contacto, mensajeOriginal, datosBarrio, fechaMensaje, horaMensaje, nombreBarrio, numeroBarrio, messageId) {
        try {
            console.log(`📊 Guardando datos de barrio ${nombreBarrio} en Google Sheets...`);
            
            const sheetsManager = new SheetsManager();
            await sheetsManager.inicializar();
            
            // ✅ CORREGIDO: Solo usar las 11 columnas que corresponden a los headers
            const nuevaFila = [
                datosBarrio.nombre_apellido || '',    // A - NOMBRE Y APELLIDO
                datosBarrio.calle || '',              // B - CALLE  
                datosBarrio.numero_casa || '',        // C - N° DE CASA
                datosBarrio.celular || '',            // D - CELULAR
                datosBarrio.fecha || '',              // E - FECHA
                datosBarrio.observaciones || '',      // F - OBSERVACIONES
                datosBarrio.problematica || '',       // G - PROBLEMÁTICA
                fechaMensaje,                         // H - FECHA DEL MENSAJE
                horaMensaje,                          // I - HORA DEL MENSAJE
                contacto,                             // J - CONTACTO
                mensajeOriginal                       // K - MENSAJE ORIGINAL
                // ❌ ELIMINAR: messageId, nombreBarrio, numeroBarrio (causaban error)
            ];
            
            console.log(`📝 Datos a insertar (${nuevaFila.length} columnas):`, nuevaFila);
            
            // Insertar nueva fila - CORREGIDO: pasar parámetros en orden correcto
            await sheetsManager.insertarFilaBarrio(nuevaFila, nombreBarrio, fechaMensaje);
            
            console.log(`✅ Datos guardados en Google Sheets para barrio ${nombreBarrio}`);
            
        } catch (error) {
            console.error('❌ Error guardando datos en Google Sheets:', error);
            throw error;
        }
    }
    
    validarDatosBarrio(datosBarrio) {
        const errores = [];
        const warnings = [];
        const sugerencias = [];
        
        // Validaciones críticas
        if (!datosBarrio.nombre_apellido) {
            errores.push('Nombre y apellido requerido');
        } else if (datosBarrio.nombre_apellido.length < 3) {
            warnings.push('Nombre muy corto');
        }
        
        // Validaciones de dirección
        if (!datosBarrio.calle && !datosBarrio.numero_casa) {
            warnings.push('Dirección incompleta');
        }
        
        if (datosBarrio.calle && datosBarrio.calle.length < 3) {
            warnings.push('Nombre de calle muy corto');
        }
        
        // Validación de teléfono
        if (datosBarrio.celular) {
            const telefonoLimpio = datosBarrio.celular.replace(/[^0-9]/g, '');
            if (telefonoLimpio.length < 8) {
                warnings.push('Número de teléfono parece incompleto');
            } else if (telefonoLimpio.length > 15) {
                warnings.push('Número de teléfono muy largo');
            }
        } else {
            sugerencias.push('Sería útil tener un número de contacto');
        }
        
        // Validación de problemática
        if (!datosBarrio.problematica) {
            sugerencias.push('No se detectó problemática específica');
        } else if (datosBarrio.problematica.length < 10) {
            warnings.push('Descripción de problemática muy breve');
        }
        
        // Validación de fecha
        if (datosBarrio.fecha) {
            if (!this.validarFormatoFecha(datosBarrio.fecha)) {
                warnings.push('Formato de fecha no estándar');
            }
        }
        
        return {
            valida: errores.length === 0,
            errores,
            warnings,
            sugerencias,
            score: this.calcularScoreCompletitud(datosBarrio)
        };
    }
    
    validarFormatoFecha(fecha) {
        // Intentar varios formatos comunes
        const formatosComunes = [
            /^\d{1,2}\/\d{1,2}\/\d{4}$/, // DD/MM/YYYY
            /^\d{4}-\d{1,2}-\d{1,2}$/, // YYYY-MM-DD
            /^\d{1,2}-\d{1,2}-\d{4}$/, // DD-MM-YYYY
            /^\d{1,2} de \w+ de \d{4}$/ // DD de MMMM de YYYY
        ];
        
        return formatosComunes.some(formato => formato.test(fecha));
    }
    
    calcularScoreCompletitud(datosBarrio) {
        let score = 0;
        const campos = [
            'nombre_apellido', 'calle', 'numero_casa', 'celular', 
            'fecha', 'observaciones', 'problematica'
        ];
        
        const pesos = {
            'nombre_apellido': 25, // Más importante
            'problematica': 20,    // Importante
            'calle': 15,
            'celular': 15,
            'numero_casa': 10,
            'fecha': 10,
            'observaciones': 5
        };
        
        campos.forEach(campo => {
            if (datosBarrio[campo] && datosBarrio[campo].trim() !== '') {
                score += pesos[campo] || 5;
            }
        });
        
        return Math.min(score, 100); // Máximo 100%
    }
    
    // Método para detectar duplicados potenciales
    async detectarDuplicados(datosBarrio, numeroBarrio) {
        try {
            console.log('🔍 Detectando posibles duplicados...');
            
            // Aquí se podría implementar lógica para:
            // 1. Buscar en el spreadsheet personas con nombre similar
            // 2. Buscar direcciones similares
            // 3. Buscar números de teléfono iguales
            
            const posiblesDuplicados = [];
            
            // Ejemplo de criterios de duplicación:
            if (datosBarrio.celular) {
                // Buscar mismo teléfono
                console.log(`📞 Verificando teléfono: ${datosBarrio.celular}`);
            }
            
            if (datosBarrio.nombre_apellido) {
                // Buscar nombres similares
                console.log(`👤 Verificando nombre: ${datosBarrio.nombre_apellido}`);
            }
            
            return posiblesDuplicados;
            
        } catch (error) {
            console.error('❌ Error detectando duplicados:', error);
            return [];
        }
    }
    
    // Método para categorizar problemáticas
    async categorizarProblematica(problematica) {
        if (!problematica) return 'sin_categoria';
        
        const problematicaLower = problematica.toLowerCase();
        
        // Categorías predefinidas
        if (problematicaLower.includes('agua') || problematicaLower.includes('cloaca')) {
            return 'agua_cloacas';
        } else if (problematicaLower.includes('luz') || problematicaLower.includes('eléctric')) {
            return 'energia_electrica';
        } else if (problematicaLower.includes('calle') || problematicaLower.includes('asfalto') || problematicaLower.includes('pavimento')) {
            return 'vias_publicas';
        } else if (problematicaLower.includes('basura') || problematicaLower.includes('residuo')) {
            return 'recoleccion_residuos';
        } else if (problematicaLower.includes('seguridad') || problematicaLower.includes('robo')) {
            return 'seguridad';
        } else if (problematicaLower.includes('salud') || problematicaLower.includes('hospital')) {
            return 'salud';
        } else if (problematicaLower.includes('educación') || problematicaLower.includes('escuela')) {
            return 'educacion';
        } else {
            return 'otros';
        }
    }
    
    // Método para generar resumen de datos
    async generarResumenDatos(datosBarrio) {
        try {
            const resumen = {
                persona: datosBarrio.nombre_apellido || 'Sin nombre',
                direccion: this.formatearDireccion(datosBarrio.calle, datosBarrio.numero_casa),
                contacto: datosBarrio.celular || 'Sin teléfono',
                problema: datosBarrio.problematica || 'Sin problemática',
                categoria: await this.categorizarProblematica(datosBarrio.problematica),
                completitud: this.calcularScoreCompletitud(datosBarrio),
                prioridad: this.calcularPrioridad(datosBarrio)
            };
            
            return resumen;
            
        } catch (error) {
            console.error('❌ Error generando resumen:', error);
            return null;
        }
    }
    
    formatearDireccion(calle, numero) {
        if (calle && numero) {
            return `${calle} ${numero}`;
        } else if (calle) {
            return calle;
        } else if (numero) {
            return `Número ${numero}`;
        } else {
            return 'Dirección no especificada';
        }
    }
    
    calcularPrioridad(datosBarrio) {
        let prioridad = 'normal';
        
        if (datosBarrio.problematica) {
            const problemaLower = datosBarrio.problematica.toLowerCase();
            
            // Palabras que indican alta prioridad
            const palabrasUrgentes = [
                'urgente', 'emergencia', 'peligro', 'grave', 'crítico',
                'inundación', 'corte', 'accidente', 'robo'
            ];
            
            if (palabrasUrgentes.some(palabra => problemaLower.includes(palabra))) {
                prioridad = 'alta';
            }
            
            // Palabras que indican baja prioridad
            const palabrasNormal = ['consulta', 'información', 'pregunta'];
            
            if (palabrasNormal.some(palabra => problemaLower.includes(palabra))) {
                prioridad = 'baja';
            }
        }
        
        return prioridad;
    }
    
    // Método para estadísticas por barrio
    async obtenerEstadisticasBarrio(numeroBarrio) {
        try {
            // Aquí se podría obtener estadísticas específicas del barrio
            return {
                numeroBarrio,
                totalRegistros: 0,
                problemasComunes: [],
                scorePromedioCompletitud: 0,
                fechaUltimaActualizacion: new Date().toISOString()
            };
            
        } catch (error) {
            console.error('❌ Error obteniendo estadísticas del barrio:', error);
            return null;
        }
    }
}

module.exports = BarrioDataStrategy;
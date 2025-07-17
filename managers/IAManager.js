class IAManager {
    constructor() {
        this.config = {
            // 🆕 GROQ API Configuration - Usar variables de entorno
            GROQ_API_KEY: process.env.GROQ_API_KEY || '', // Leer desde variable de entorno
            BASE_URL: 'https://api.groq.com/openai/v1/chat/completions',
            MODEL: 'llama3-70b-8192', // Modelo recomendado
            RATE_LIMIT_DELAY: 1000, // 1 segundo (Groq es MUY rápido)
            MAX_RETRIES: 3,
            TIMEOUT: 15000 // 15 segundos timeout
        };
        
        // Validar que la API key esté configurada
        if (!this.config.GROQ_API_KEY) {
            console.error('❌ ERROR: GROQ_API_KEY no está configurada en las variables de entorno');
            throw new Error('API Key de Groq no configurada. Configura la variable de entorno GROQ_API_KEY');
        }
        
        this.lastCallTime = 0;
    }
    
    async esperarRateLimit() {
        const tiempoTranscurrido = Date.now() - this.lastCallTime;
        if (tiempoTranscurrido < this.config.RATE_LIMIT_DELAY) {
            const tiempoEspera = this.config.RATE_LIMIT_DELAY - tiempoTranscurrido;
            console.log(`⏳ Rate limit: esperando ${tiempoEspera}ms...`);
            await new Promise(resolve => setTimeout(resolve, tiempoEspera));
        }
        this.lastCallTime = Date.now();
    }
    
    async llamarGroqConReintentos(prompt, reintentos = 0) {
        try {
            await this.esperarRateLimit();
            
            console.log(`🤖 Llamando a Groq Llama3-70B (intento ${reintentos + 1}/${this.config.MAX_RETRIES + 1})...`);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.config.TIMEOUT);
            
            const response = await fetch(this.config.BASE_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.config.GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: this.config.MODEL,
                    messages: [
                        {
                            role: "user",
                            content: prompt
                        }
                    ],
                    temperature: 0.1, // Más determinístico para extracción de datos
                    max_tokens: 1000,
                    top_p: 1,
                    stream: false
                }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                if (response.status === 429) {
                    // Rate limit hit
                    const retryAfter = response.headers.get('retry-after') || '60';
                    throw new Error(`RATE_LIMITED:${retryAfter}`);
                } else if (response.status === 401) {
                    throw new Error('AUTH_ERROR:API Key inválida');
                } else {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
            }
            
            const data = await response.json();
            
            if (!data.choices || !data.choices[0] || !data.choices[0].message || !data.choices[0].message.content) {
                throw new Error('Estructura de respuesta de Groq inválida');
            }
            
            return data.choices[0].message.content;
            
        } catch (error) {
            console.error(`❌ Error en llamada a Groq (intento ${reintentos + 1}):`, error);
            
            if (reintentos < this.config.MAX_RETRIES) {
                const delayReintento = (reintentos + 1) * 2000; // Delay incremental
                console.log(`🔄 Reintentando en ${delayReintento}ms...`);
                await new Promise(resolve => setTimeout(resolve, delayReintento));
                return this.llamarGroqConReintentos(prompt, reintentos + 1);
            }
            
            throw error;
        }
    }
    
    async extraerAgenda(mensaje) {
        try {
            console.log(`📅 Analizando mensaje para detectar agenda con Groq...`);
            
            const prompt = `Analiza el siguiente mensaje de WhatsApp y determina si contiene información de agenda/reunión/evento.

Si NO es una agenda, responde: {"es_agenda": false}

Si SÍ es una agenda, extrae la información disponible y responde con este formato EXACTO:
{"es_agenda": true, "fecha": "valor o null", "hora": "valor o null", "motivo": "valor o null", "persona": "valor o null"}

Mensaje: "${mensaje}"

Responde ÚNICAMENTE con el JSON válido:`;

            const textoRespuesta = await this.llamarGroqConReintentos(prompt);
            const resultado = this.parsearRespuestaJSON(textoRespuesta);
            
            if (resultado && resultado.es_agenda === true) {
                console.log('🎯 ¡ES UNA AGENDA detectada por Groq IA!');
                return {
                    fecha: resultado.fecha,
                    hora: resultado.hora,
                    motivo: resultado.motivo,
                    persona: resultado.persona
                };
            }
            
            console.log('📝 No es una agenda según Groq IA');
            return null;
            
        } catch (error) {
            console.error('❌ Error extrayendo agenda con Groq:', error);
            throw error;
        }
    }
    
    async extraerDatosBarrio(mensaje) {
        try {
            console.log(`🏘️ Analizando mensaje para detectar datos de barrio con Groq...`);
            
            const prompt = `Analiza el siguiente mensaje y extrae información de datos de barrio/ciudadanos/vecinos.

Si NO contiene datos de personas o barrio, responde: {"es_datos_barrio": false}

Si SÍ contiene datos de barrio, extrae la información disponible y responde con este formato EXACTO:
{
    "es_datos_barrio": true,
    "nombre_apellido": "valor o null",
    "calle": "valor o null", 
    "numero_casa": "valor o null",
    "celular": "valor o null",
    "fecha": "valor o null",
    "observaciones": "valor o null",
    "problematica": "valor o null"
}

Mensaje: "${mensaje}"

Responde ÚNICAMENTE con el JSON válido:`;

            const textoRespuesta = await this.llamarGroqConReintentos(prompt);
            const resultado = this.parsearRespuestaJSON(textoRespuesta);
            
            if (resultado && resultado.es_datos_barrio === true) {
                console.log('🎯 ¡DATOS DE BARRIO detectados por Groq IA!');
                return {
                    nombre_apellido: resultado.nombre_apellido,
                    calle: resultado.calle,
                    numero_casa: resultado.numero_casa,
                    celular: resultado.celular,
                    fecha: resultado.fecha,
                    observaciones: resultado.observaciones,
                    problematica: resultado.problematica
                };
            }
            
            console.log('📝 No son datos de barrio según Groq IA');
            return null;
            
        } catch (error) {
            console.error('❌ Error extrayendo datos de barrio con Groq:', error);
            throw error;
        }
    }
    
    async clasificarMensaje(mensaje) {
        try {
            console.log(`🔍 Clasificando tipo de mensaje con Groq...`);
            
            const prompt = `Analiza el siguiente mensaje de WhatsApp y clasifícalo en una de estas categorías:

1. "agenda" - Si es una reunión, evento, cita o convocatoria
2. "datos_barrio" - Si contiene información de vecinos/ciudadanos (nombre, dirección, teléfono, problemas)
3. "consulta" - Si es una pregunta o consulta general
4. "reclamo" - Si es una queja o reclamo específico
5. "normal" - Si es conversación normal sin datos específicos

Responde ÚNICAMENTE con: {"categoria": "agenda|datos_barrio|consulta|reclamo|normal", "confianza": 0.0-1.0}

Mensaje: "${mensaje}"`;

            const textoRespuesta = await this.llamarGroqConReintentos(prompt);
            const resultado = this.parsearRespuestaJSON(textoRespuesta);
            
            if (resultado && resultado.categoria) {
                console.log(`🏷️ Mensaje clasificado como: ${resultado.categoria} (confianza: ${resultado.confianza})`);
                return resultado;
            }
            
            return { categoria: "normal", confianza: 0.5 };
            
        } catch (error) {
            console.error('❌ Error clasificando mensaje:', error);
            return { categoria: "normal", confianza: 0.0 };
        }
    }
    
    async extraerEntidadesNombradas(mensaje) {
        try {
            console.log(`🔍 Extrayendo entidades nombradas del mensaje con Groq...`);
            
            const prompt = `Extrae las siguientes entidades del mensaje:

- PERSONAS: Nombres y apellidos mencionados
- LUGARES: Calles, direcciones, barrios, lugares específicos
- FECHAS: Fechas mencionadas (día, mes, año)
- HORAS: Horarios mencionados
- TELÉFONOS: Números de teléfono o celular
- PROBLEMAS: Problemas o situaciones mencionadas

Responde en formato JSON:
{
    "personas": ["lista de nombres"],
    "lugares": ["lista de lugares"],
    "fechas": ["lista de fechas"],
    "horas": ["lista de horas"],
    "telefonos": ["lista de teléfonos"],
    "problemas": ["lista de problemas"]
}

Mensaje: "${mensaje}"

Responde ÚNICAMENTE con el JSON válido:`;

            const textoRespuesta = await this.llamarGroqConReintentos(prompt);
            const resultado = this.parsearRespuestaJSON(textoRespuesta);
            
            if (resultado) {
                console.log('🎯 Entidades extraídas exitosamente');
                return resultado;
            }
            
            return {
                personas: [],
                lugares: [],
                fechas: [],
                horas: [],
                telefonos: [],
                problemas: []
            };
            
        } catch (error) {
            console.error('❌ Error extrayendo entidades:', error);
            return {
                personas: [],
                lugares: [],
                fechas: [],
                horas: [],
                telefonos: [],
                problemas: []
            };
        }
    }
    
    async generarResumen(mensaje, maxCaracteres = 100) {
        try {
            console.log(`📝 Generando resumen del mensaje con Groq...`);
            
            const prompt = `Genera un resumen muy conciso del siguiente mensaje en máximo ${maxCaracteres} caracteres.

Mensaje: "${mensaje}"

Resumen:`;

            const textoRespuesta = await this.llamarGroqConReintentos(prompt);
            const resumen = textoRespuesta.trim().substring(0, maxCaracteres);
            
            console.log(`✅ Resumen generado: ${resumen}`);
            return resumen;
            
        } catch (error) {
            console.error('❌ Error generando resumen:', error);
            return mensaje.substring(0, maxCaracteres) + '...';
        }
    }
    
    async detectarSentimiento(mensaje) {
        try {
            console.log(`😊 Analizando sentimiento del mensaje con Groq...`);
            
            const prompt = `Analiza el sentimiento del siguiente mensaje y clasifícalo:

Categorías:
- "positivo" - Mensaje alegre, agradecido, satisfecho
- "negativo" - Mensaje molesto, queja, reclamo fuerte
- "neutral" - Mensaje informativo, sin carga emocional
- "urgente" - Mensaje que requiere atención inmediata

Responde ÚNICAMENTE con: {"sentimiento": "positivo|negativo|neutral|urgente", "intensidad": 0.0-1.0}

Mensaje: "${mensaje}"`;

            const textoRespuesta = await this.llamarGroqConReintentos(prompt);
            const resultado = this.parsearRespuestaJSON(textoRespuesta);
            
            if (resultado && resultado.sentimiento) {
                console.log(`😊 Sentimiento detectado: ${resultado.sentimiento} (intensidad: ${resultado.intensidad})`);
                return resultado;
            }
            
            return { sentimiento: "neutral", intensidad: 0.5 };
            
        } catch (error) {
            console.error('❌ Error detectando sentimiento:', error);
            return { sentimiento: "neutral", intensidad: 0.0 };
        }
    }
    
    // Método utilitario para parsear respuestas JSON de Groq
    parsearRespuestaJSON(textoRespuesta) {
        try {
            // Limpiar texto de markdown o caracteres extra
            const textoLimpio = textoRespuesta.replace(/```json|```/g, '').trim();
            
            // Buscar JSON en el texto
            const jsonMatch = textoLimpio.match(/\{[\s\S]*\}/);
            
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            
            // Intentar parsear directamente
            return JSON.parse(textoLimpio);
            
        } catch (error) {
            console.error('❌ Error parseando JSON de Groq:', error);
            console.log('📄 Texto recibido:', textoRespuesta);
            return null;
        }
    }
    
    // Método para análisis completo de un mensaje
    async analizarMensajeCompleto(mensaje) {
        try {
            console.log(`🔬 Iniciando análisis completo del mensaje con Groq...`);
            
            const [
                agenda,
                datosBarrio,
                clasificacion,
                entidades,
                sentimiento
            ] = await Promise.all([
                this.extraerAgenda(mensaje),
                this.extraerDatosBarrio(mensaje),
                this.clasificarMensaje(mensaje),
                this.extraerEntidadesNombradas(mensaje),
                this.detectarSentimiento(mensaje)
            ]);
            
            const analisisCompleto = {
                mensaje,
                agenda,
                datosBarrio,
                clasificacion,
                entidades,
                sentimiento,
                fechaAnalisis: new Date().toISOString()
            };
            
            console.log('🎯 Análisis completo finalizado con Groq');
            return analisisCompleto;
            
        } catch (error) {
            console.error('❌ Error en análisis completo:', error);
            return {
                mensaje,
                agenda: null,
                datosBarrio: null,
                clasificacion: { categoria: "error", confianza: 0.0 },
                entidades: { personas: [], lugares: [], fechas: [], horas: [], telefonos: [], problemas: [] },
                sentimiento: { sentimiento: "neutral", intensidad: 0.0 },
                error: error.message,
                fechaAnalisis: new Date().toISOString()
            };
        }
    }
    
    // Método para validar si la API está disponible
    async validarConexion() {
        try {
            console.log('🔌 Validando conexión con Groq...');
            
            const prompt = 'Responde solo con: {"status": "ok"}';
            const respuesta = await this.llamarGroqConReintentos(prompt);
            const resultado = this.parsearRespuestaJSON(respuesta);
            
            if (resultado && resultado.status === 'ok') {
                console.log('✅ Conexión con Groq OK');
                return true;
            }
            
            return false;
            
        } catch (error) {
            console.error('❌ Error validando conexión con Groq:', error);
            return false;
        }
    }
    
    // Obtener estadísticas de uso
    obtenerEstadisticas() {
        return {
            proveedor: 'Groq',
            modelo: this.config.MODEL,
            apiKey: this.config.GROQ_API_KEY ? 'Configurada' : 'No configurada',
            rateLimit: this.config.RATE_LIMIT_DELAY,
            maxReintentos: this.config.MAX_RETRIES,
            timeout: this.config.TIMEOUT,
            ultimaLlamada: this.lastCallTime ? new Date(this.lastCallTime).toISOString() : 'Nunca'
        };
    }
}

module.exports = IAManager;
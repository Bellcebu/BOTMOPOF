const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

class DriveManager {
    constructor() {
        this.drive = null;
        this.isInitialized = false;
        this.carpetasPrincipales = new Map(); // Cache de carpetas
        
        this.config = {
            CREDENTIALS_PATH: './oauth_credentials.json',
            TOKEN_PATH: './token.json',
            SCOPES: [
                'https://www.googleapis.com/auth/drive.file',
                'https://www.googleapis.com/auth/drive'
            ],
            FOLDER_NAME: 'Mopof',
            FOLDER_ID: null,
            SHARED_DRIVE_ID: null
        };
    }
    
    async inicializar() {
        if (this.isInitialized) {
            return;
        }
        
        try {
            console.log('📁 Inicializando Google Drive Manager...');
            
            const auth = await this.autenticar();
            this.drive = google.drive({ version: 'v3', auth });
            
            this.isInitialized = true;
            console.log('✅ Google Drive Manager inicializado');
            
        } catch (error) {
            console.error('❌ Error inicializando Drive Manager:', error);
            throw error;
        }
    }
    
    async autenticar() {
        try {
            const credentials = JSON.parse(fs.readFileSync(this.config.CREDENTIALS_PATH));
            const { client_secret, client_id } = credentials.installed;
            const redirectUri = 'http://localhost:3000';
            
            const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirectUri);
            
            if (fs.existsSync(this.config.TOKEN_PATH)) {
                const token = fs.readFileSync(this.config.TOKEN_PATH);
                oAuth2Client.setCredentials(JSON.parse(token));
            } else {
                throw new Error('Token no encontrado. Ejecutar autenticación primero.');
            }
            
            return oAuth2Client;
            
        } catch (error) {
            console.error('❌ Error autenticando Google Drive:', error);
            throw error;
        }
    }
    
    async obtenerCarpetaPrincipal() {
        try {
            // Si ya tenemos ID específico, usarlo
            if (this.config.FOLDER_ID) {
                return this.config.FOLDER_ID;
            }
            
            // Si hay Shared Drive configurado
            if (this.config.SHARED_DRIVE_ID) {
                return await this.encontrarOCrearCarpeta(this.config.FOLDER_NAME, this.config.SHARED_DRIVE_ID);
            }
            
            // Buscar o crear carpeta principal
            console.log(`🔍 Buscando/creando carpeta principal: ${this.config.FOLDER_NAME}`);
            const carpetaId = await this.encontrarOCrearCarpeta(this.config.FOLDER_NAME);
            
            if (carpetaId) {
                console.log(`📁 Carpeta principal: ${this.config.FOLDER_NAME} (ID: ${carpetaId})`);
                this.carpetasPrincipales.set('principal', carpetaId);
            }
            
            return carpetaId;
            
        } catch (error) {
            console.error('❌ Error obteniendo carpeta principal:', error);
            return null;
        }
    }
    
    async encontrarOCrearCarpeta(nombreCarpeta, parentId = null) {
        try {
            // Construir query de búsqueda
            let query = `name='${nombreCarpeta}' and mimeType='application/vnd.google-apps.folder'`;
            if (parentId) {
                query += ` and '${parentId}' in parents`;
            }
            
            // Buscar carpeta existente
            const searchResponse = await this.drive.files.list({
                q: query,
                supportsAllDrives: true
            });
            
            if (searchResponse.data.files.length > 0) {
                const carpetaId = searchResponse.data.files[0].id;
                console.log(`📁 Carpeta encontrada: ${nombreCarpeta} (ID: ${carpetaId})`);
                return carpetaId;
            }
            
            // Crear nueva carpeta
            console.log(`🆕 Creando carpeta: ${nombreCarpeta}...`);
            
            const fileMetadata = {
                name: nombreCarpeta,
                mimeType: 'application/vnd.google-apps.folder'
            };
            
            if (parentId) {
                fileMetadata.parents = [parentId];
            }
            
            const response = await this.drive.files.create({
                requestBody: fileMetadata,
                supportsAllDrives: true
            });
            
            const carpetaId = response.data.id;
            
            // Configurar permisos básicos
            try {
                await this.drive.permissions.create({
                    fileId: carpetaId,
                    requestBody: {
                        role: 'owner',
                        type: 'user',
                        emailAddress: 'me'
                    },
                    supportsAllDrives: true
                });
                console.log(`📁 Carpeta creada con permisos: ${nombreCarpeta} (ID: ${carpetaId})`);
            } catch (permError) {
                console.log(`⚠️ Carpeta creada sin cambiar permisos: ${nombreCarpeta}`);
            }
            
            return carpetaId;
            
        } catch (error) {
            console.error(`❌ Error creando/encontrando carpeta ${nombreCarpeta}:`, error);
            return null;
        }
    }
    
    async crearCarpetaBarrio(nombreBarrio) {
        try {
            console.log(`🏘️ Creando estructura para barrio: ${nombreBarrio}`);
            
            const carpetaPrincipal = await this.obtenerCarpetaPrincipal();
            if (!carpetaPrincipal) {
                throw new Error('No se pudo obtener carpeta principal');
            }
            
            // Crear carpeta "Barrio Imagenes" si no existe
            const carpetaBarrioImagenes = await this.encontrarOCrearCarpeta('Barrio Imagenes', carpetaPrincipal);
            if (!carpetaBarrioImagenes) {
                throw new Error('No se pudo crear carpeta "Barrio Imagenes"');
            }
            
            // Crear carpeta específica del barrio con fecha - SIN SUBCARPETAS
            const fechaHoy = new Date().toISOString().split('T')[0];
            const nombreCarpetaBarrio = `Barrio_${nombreBarrio}_${fechaHoy}`;
            
            const carpetaBarrio = await this.encontrarOCrearCarpeta(nombreCarpetaBarrio, carpetaBarrioImagenes);
            
            if (carpetaBarrio) {
                console.log(`✅ Estructura creada: Mopof > Barrio Imagenes > ${nombreCarpetaBarrio}`);
                console.log(`📁 Carpeta lista para recibir media directamente`);
                
                // Guardar en caché para uso posterior
                this.carpetasPrincipales.set(`barrio_${nombreBarrio}`, carpetaBarrio);
                
                return carpetaBarrio;
            }
            
            return null;
            
        } catch (error) {
            console.error(`❌ Error creando carpeta para barrio ${nombreBarrio}:`, error);
            throw error;
        }
    }
    
    async obtenerCarpetaBarrio(nombreBarrio) {
        try {
            // Verificar caché primero
            const cacheKey = `barrio_${nombreBarrio}`;
            if (this.carpetasPrincipales.has(cacheKey)) {
                const carpetaId = this.carpetasPrincipales.get(cacheKey);
                console.log(`💾 Usando carpeta desde caché: ${nombreBarrio} (${carpetaId})`);
                return carpetaId;
            }
            
            // Buscar carpeta existente
            const carpetaPrincipal = await this.obtenerCarpetaPrincipal();
            const carpetaBarrioImagenes = await this.encontrarOCrearCarpeta('Barrio Imagenes', carpetaPrincipal);
            
            // ✅ CORREGIDO: Buscar TODAS las carpetas del barrio (cualquier fecha)
            console.log(`🔍 Buscando carpetas existentes para barrio: ${nombreBarrio}`);
            
            const query = `name contains 'Barrio_${nombreBarrio}_' and mimeType='application/vnd.google-apps.folder' and '${carpetaBarrioImagenes}' in parents`;
            const searchResponse = await this.drive.files.list({
                q: query,
                supportsAllDrives: true,
                orderBy: 'createdTime desc'  // Más reciente primero
            });
            
            if (searchResponse.data.files.length > 0) {
                // Usar la carpeta más reciente
                const carpetaExistente = searchResponse.data.files[0];
                console.log(`✅ Carpeta existente encontrada: ${carpetaExistente.name} (${carpetaExistente.id})`);
                
                this.carpetasPrincipales.set(cacheKey, carpetaExistente.id);
                return carpetaExistente.id;
            }
            
            // Si no existe, crear nueva con fecha ACTUAL
            const fechaHoy = new Date().toLocaleDateString('es-ES').replace(/\//g, '-'); // DD-MM-YYYY
            const nombreCarpetaBarrio = `Barrio_${nombreBarrio}_${fechaHoy}`;
            
            console.log(`🆕 Creando nueva carpeta: ${nombreCarpetaBarrio}`);
            const carpetaBarrio = await this.encontrarOCrearCarpeta(nombreCarpetaBarrio, carpetaBarrioImagenes);
            
            if (carpetaBarrio) {
                console.log(`✅ Nueva carpeta creada: ${nombreCarpetaBarrio}`);
                this.carpetasPrincipales.set(cacheKey, carpetaBarrio);
            }
            
            return carpetaBarrio;
            
        } catch (error) {
            console.error(`❌ Error obteniendo carpeta de barrio ${nombreBarrio}:`, error);
            return null;
        }
    }
    
    // ❌ ELIMINAR - No crear subcarpetas innecesarias
    // async crearSubcarpetas(carpetaPadre, nombresSubcarpetas) {
    //     // Esta función se eliminó porque no necesitamos subcarpetas
    // }
    
    async subirArchivo(filePath, metadata, mimeType) {
        try {
            console.log(`📤 Subiendo archivo: ${metadata.name}`);
            
            // Verificar que el archivo existe
            if (!fs.existsSync(filePath)) {
                throw new Error(`Archivo no encontrado: ${filePath}`);
            }
            
            const media = {
                mimeType: mimeType,
                body: fs.createReadStream(filePath)
            };
            
            const response = await this.drive.files.create({
                requestBody: metadata,
                media: media,
                fields: 'id,name,parents,webViewLink',
                supportsAllDrives: true
            });
            
            const fileId = response.data.id;
            const webViewLink = response.data.webViewLink;
            
            console.log(`✅ Archivo subido: ${metadata.name} (ID: ${fileId})`);
            
            return fileId;
            
        } catch (error) {
            console.error(`❌ Error subiendo archivo ${metadata.name}:`, error);
            throw error;
        }
    }
    
    async generarEnlacePublico(fileId) {
        try {
            // Hacer el archivo público
            await this.drive.permissions.create({
                fileId: fileId,
                requestBody: {
                    role: 'reader',
                    type: 'anyone'
                },
                supportsAllDrives: true
            });
            
            // Obtener enlace
            const response = await this.drive.files.get({
                fileId: fileId,
                fields: 'webViewLink,webContentLink',
                supportsAllDrives: true
            });
            
            return response.data.webViewLink;
            
        } catch (error) {
            console.error('❌ Error generando enlace público:', error);
            return null;
        }
    }
    
    async listarArchivosEnCarpeta(carpetaId, limite = 100) {
        try {
            const response = await this.drive.files.list({
                q: `'${carpetaId}' in parents`,
                pageSize: limite,
                fields: 'files(id,name,mimeType,size,createdTime)',
                supportsAllDrives: true
            });
            
            return response.data.files || [];
            
        } catch (error) {
            console.error('❌ Error listando archivos:', error);
            return [];
        }
    }
    
    async eliminarArchivo(fileId) {
        try {
            await this.drive.files.delete({
                fileId: fileId,
                supportsAllDrives: true
            });
            
            console.log(`🗑️ Archivo eliminado: ${fileId}`);
            return true;
            
        } catch (error) {
            console.error(`❌ Error eliminando archivo ${fileId}:`, error);
            return false;
        }
    }
    
    async obtenerInfoArchivo(fileId) {
        try {
            const response = await this.drive.files.get({
                fileId: fileId,
                fields: 'id,name,mimeType,size,createdTime,modifiedTime,parents,webViewLink',
                supportsAllDrives: true
            });
            
            return response.data;
            
        } catch (error) {
            console.error(`❌ Error obteniendo info de archivo ${fileId}:`, error);
            return null;
        }
    }
    
    async buscarArchivos(nombreArchivo, carpetaPadre = null) {
        try {
            let query = `name contains '${nombreArchivo}'`;
            if (carpetaPadre) {
                query += ` and '${carpetaPadre}' in parents`;
            }
            
            const response = await this.drive.files.list({
                q: query,
                fields: 'files(id,name,mimeType,size,createdTime)',
                supportsAllDrives: true
            });
            
            return response.data.files || [];
            
        } catch (error) {
            console.error('❌ Error buscando archivos:', error);
            return [];
        }
    }
    
    async verificarEspacioDisponible() {
        try {
            const response = await this.drive.about.get({
                fields: 'storageQuota'
            });
            
            const quota = response.data.storageQuota;
            if (quota) {
                return {
                    limite: parseInt(quota.limit),
                    usado: parseInt(quota.usage),
                    disponible: parseInt(quota.limit) - parseInt(quota.usage),
                    porcentajeUso: (parseInt(quota.usage) / parseInt(quota.limit)) * 100
                };
            }
            
            return null;
            
        } catch (error) {
            console.error('❌ Error verificando espacio:', error);
            return null;
        }
    }
    
    formatearTamaño(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    async obtenerEstadisticas() {
        try {
            const espacio = await this.verificarEspacioDisponible();
            const carpetaPrincipal = await this.obtenerCarpetaPrincipal();
            
            return {
                carpetaPrincipal: carpetaPrincipal,
                espacioDisponible: espacio ? this.formatearTamaño(espacio.disponible) : 'Desconocido',
                porcentajeUso: espacio ? espacio.porcentajeUso.toFixed(2) + '%' : 'Desconocido',
                carpetasEnCache: this.carpetasPrincipales.size,
                inicializado: this.isInitialized
            };
            
        } catch (error) {
            console.error('❌ Error obteniendo estadísticas:', error);
            return null;
        }
    }
}

module.exports = DriveManager;
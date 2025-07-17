const { google } = require('googleapis');
const fs = require('fs');

class SheetsManager {
    constructor() {
        this.sheets = null;
        this.drive = null;
        this.spreadsheetId = null;
        this.isInitialized = false;
        this.separadoresCreados = new Set();
        
        this.config = {
            CREDENTIALS_PATH: './oauth_credentials.json',
            TOKEN_PATH: './token.json',
            SCOPES: [
                'https://www.googleapis.com/auth/drive.file',
                'https://www.googleapis.com/auth/spreadsheets',
                'https://www.googleapis.com/auth/drive'
            ],
            BARRIOS_SHEET_NAME: 'Datos Barrios',
            AGENDAS_SHEET_NAME: 'Agendas'
        };
    }
    
    async inicializar() {
        if (this.isInitialized) {
            return;
        }
        
        try {
            console.log('🔐 Inicializando Google Sheets Manager...');
            
            const auth = await this.autenticar();
            this.sheets = google.sheets({ version: 'v4', auth });
            this.drive = google.drive({ version: 'v3', auth });
            
            // Obtener o crear spreadsheet único
            this.spreadsheetId = await this.obtenerSpreadsheetUnico();
            
            // Cargar separadores existentes
            await this.cargarSeparadoresExistentes();
            
            this.isInitialized = true;
            console.log('✅ Google Sheets Manager inicializado');
            
        } catch (error) {
            console.error('❌ Error inicializando Sheets Manager:', error);
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
            console.error('❌ Error autenticando Google Sheets:', error);
            throw error;
        }
    }
    
    async obtenerSpreadsheetUnico() {
        try {
            console.log('📊 Obteniendo/creando spreadsheet único...');
            
            const carpetaPrincipal = await this.obtenerCarpetaPrincipal();
            
            // ✅ CORREGIDO: Crear Reportes DENTRO de Mopof
            const carpetaReportes = await this.encontrarOCrearCarpeta('Reportes', carpetaPrincipal);
            
            // ✅ CORREGIDO: Nombre más claro
            const nombreSpreadsheet = 'Datos_Barrios_Completo';
            
            // Buscar spreadsheet existente
            const query = `name='${nombreSpreadsheet}' and mimeType='application/vnd.google-apps.spreadsheet' and '${carpetaReportes}' in parents`;
            const searchResponse = await this.drive.files.list({ 
                q: query,
                supportsAllDrives: true 
            });
            
            if (searchResponse.data.files.length > 0) {
                const spreadsheetId = searchResponse.data.files[0].id;
                console.log(`✅ Spreadsheet existente encontrado: ${spreadsheetId}`);
                await this.verificarHeaders(spreadsheetId);
                return spreadsheetId;
            }
            
            // Crear nuevo spreadsheet
            console.log(`🆕 Creando nuevo spreadsheet: ${nombreSpreadsheet}...`);
            const spreadsheet = await this.sheets.spreadsheets.create({
                requestBody: {
                    properties: {
                        title: nombreSpreadsheet
                    },
                    sheets: [{
                        properties: {
                            title: this.config.BARRIOS_SHEET_NAME
                        }
                    }]
                }
            });
            
            const spreadsheetId = spreadsheet.data.spreadsheetId;
            
            // Mover a carpeta correcta DENTRO de Mopof
            await this.drive.files.update({
                fileId: spreadsheetId,
                addParents: carpetaReportes,
                supportsAllDrives: true
            });
            
            // Crear headers
            await this.crearHeadersBarrios(spreadsheetId);
            
            console.log(`📊 Nuevo spreadsheet creado en: Mopof/Reportes/${nombreSpreadsheet}`);
            return spreadsheetId;
            
        } catch (error) {
            console.error('❌ Error obteniendo spreadsheet único:', error);
            throw error;
        }
    }
    
    async crearHeadersBarrios(spreadsheetId) {
        try {
            console.log('📋 Creando headers de barrios...');
            
            const headers = [
                'NOMBRE Y APELLIDO', 'CALLE', 'N° DE CASA', 'CELULAR', 'FECHA', 
                'OBSERVACIONES', 'PROBLEMÁTICA', 'FECHA DEL MENSAJE', 'HORA DEL MENSAJE', 
                'CONTACTO', 'MENSAJE ORIGINAL'
            ];
            
            // Insertar headers
            await this.sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `${this.config.BARRIOS_SHEET_NAME}!A1:K1`,
                valueInputOption: 'RAW',
                requestBody: {
                    values: [headers]
                }
            });
            
            // Obtener sheet ID real
            const sheetId = await this.obtenerSheetIdReal(spreadsheetId, this.config.BARRIOS_SHEET_NAME);
            
            // Aplicar formato a headers
            await this.sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                requestBody: {
                    requests: [
                        {
                            repeatCell: {
                                range: {
                                    sheetId: sheetId,
                                    startRowIndex: 0,
                                    endRowIndex: 1,
                                    startColumnIndex: 0,
                                    endColumnIndex: 11
                                },
                                cell: {
                                    userEnteredFormat: {
                                        backgroundColor: {
                                            red: 0.31,
                                            green: 0.51,
                                            blue: 0.74
                                        },
                                        textFormat: {
                                            foregroundColor: {
                                                red: 1.0,
                                                green: 1.0,
                                                blue: 1.0
                                            },
                                            bold: true,
                                            fontSize: 12,
                                            fontFamily: 'Arial'
                                        },
                                        horizontalAlignment: 'CENTER',
                                        verticalAlignment: 'MIDDLE'
                                    }
                                },
                                fields: 'userEnteredFormat'
                            }
                        },
                        // Anchos de columnas específicos
                        ...Array.from({length: 11}, (_, i) => {
                            const widths = [250, 180, 100, 140, 120, 250, 220, 180, 180, 180, 350];
                            return {
                                updateDimensionProperties: {
                                    range: {
                                        sheetId: sheetId,
                                        dimension: 'COLUMNS',
                                        startIndex: i,
                                        endIndex: i + 1
                                    },
                                    properties: { pixelSize: widths[i] },
                                    fields: 'pixelSize'
                                }
                            };
                        })
                    ]
                }
            });
            
            console.log('✅ Headers de barrios creados con formato');
            
        } catch (error) {
            console.error('❌ Error creando headers de barrios:', error);
            throw error;
        }
    }
    
    // ⭐ FUNCIÓN PRINCIPAL: Crear separador con nombre Y fecha
    async crearSeparadorBarrio(nombreBarrio, fechaConfiguracion = null) {
        try {
            // Usar fecha actual si no se proporciona
            const fecha = fechaConfiguracion || new Date().toLocaleDateString('es-ES');
            const separadorCompleto = `${nombreBarrio} - ${fecha}`;
            
            if (this.separadoresCreados.has(separadorCompleto)) {
                console.log(`✅ Separador ya existe: ${separadorCompleto}`);
                return;
            }
            
            console.log(`📋 Creando separador: ${separadorCompleto}`);
            
            // Obtener siguiente fila disponible
            let nextRow = 2;
            try {
                const existingData = await this.sheets.spreadsheets.values.get({
                    spreadsheetId: this.spreadsheetId,
                    range: `${this.config.BARRIOS_SHEET_NAME}!A:A`
                });
                if (existingData.data.values && existingData.data.values.length > 1) {
                    nextRow = existingData.data.values.length + 2;
                }
            } catch (error) {
                console.log('⚠️ Usando fila por defecto: 2');
            }
            
            // Crear fila separadora con formato mejorado
            const filaSeparadora = [`================== BARRIO: ${separadorCompleto} ==================`];
            
            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: `${this.config.BARRIOS_SHEET_NAME}!A${nextRow}:K${nextRow}`,
                valueInputOption: 'RAW',
                requestBody: {
                    values: [filaSeparadora]
                }
            });
            
            // Aplicar formato visual
            const sheetId = await this.obtenerSheetIdReal(this.spreadsheetId, this.config.BARRIOS_SHEET_NAME);
            
            await this.sheets.spreadsheets.batchUpdate({
                spreadsheetId: this.spreadsheetId,
                requestBody: {
                    requests: [
                        // Merge cells
                        {
                            mergeCells: {
                                range: {
                                    sheetId: sheetId,
                                    startRowIndex: nextRow - 1,
                                    endRowIndex: nextRow,
                                    startColumnIndex: 0,
                                    endColumnIndex: 11
                                },
                                mergeType: 'MERGE_ALL'
                            }
                        },
                        // Formato visual
                        {
                            repeatCell: {
                                range: {
                                    sheetId: sheetId,
                                    startRowIndex: nextRow - 1,
                                    endRowIndex: nextRow,
                                    startColumnIndex: 0,
                                    endColumnIndex: 11
                                },
                                cell: {
                                    userEnteredFormat: {
                                        backgroundColor: {
                                            red: 0.2,
                                            green: 0.6,
                                            blue: 0.2
                                        },
                                        textFormat: {
                                            foregroundColor: {
                                                red: 1.0,
                                                green: 1.0,
                                                blue: 1.0
                                            },
                                            bold: true,
                                            fontSize: 14,
                                            fontFamily: 'Arial'
                                        },
                                        horizontalAlignment: 'CENTER',
                                        verticalAlignment: 'MIDDLE'
                                    }
                                },
                                fields: 'userEnteredFormat'
                            }
                        }
                    ]
                }
            });
            
            // Agregar a lista de separadores creados
            this.separadoresCreados.add(separadorCompleto);
            
            console.log(`✅ Separador creado: ${separadorCompleto} en fila ${nextRow}`);
            
        } catch (error) {
            console.error(`❌ Error creando separador para ${nombreBarrio}:`, error);
            throw error;
        }
    }
    
    async cargarSeparadoresExistentes() {
        try {
            console.log('🔍 Cargando separadores existentes...');
            
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: `${this.config.BARRIOS_SHEET_NAME}!A:A`
            });
            
            if (response.data.values) {
                response.data.values.forEach(row => {
                    if (row[0] && row[0].includes('BARRIO:')) {
                        // Buscar patrón: "BARRIO: NOMBRE - FECHA"
                        const match = row[0].match(/BARRIO:\s*([^=]+)/);
                        if (match) {
                            const separadorCompleto = match[1].trim();
                            this.separadoresCreados.add(separadorCompleto);
                            console.log(`📋 Separador detectado: ${separadorCompleto}`);
                        }
                    }
                });
            }
            
            console.log(`✅ ${this.separadoresCreados.size} separadores precargados`);
            
        } catch (error) {
            console.log(`⚠️ Error precargando separadores: ${error.message}`);
        }
    }
    
    async encontrarPosicionInsercionBarrio(nombreBarrio, fechaConfiguracion = null) {
        try {
            const fecha = fechaConfiguracion || new Date().toLocaleDateString('es-ES');
            const separadorBuscado = `${nombreBarrio} - ${fecha}`;
            
            console.log(`🔍 Buscando posición de inserción para: ${separadorBuscado}`);
            
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: `${this.config.BARRIOS_SHEET_NAME}!A:A`
            });
            
            if (!response.data.values) {
                return 2; // Si no hay datos, empezar en fila 2
            }
            
            const values = response.data.values;
            
            // Buscar el separador específico
            let indiceSeparadorBarrio = -1;
            for (let i = 0; i < values.length; i++) {
                if (values[i][0] && values[i][0].includes(`BARRIO: ${separadorBuscado}`)) {
                    indiceSeparadorBarrio = i;
                    break;
                }
            }
            
            if (indiceSeparadorBarrio === -1) {
                console.log(`⚠️ Separador no encontrado: ${separadorBuscado}. Insertando al final.`);
                return values.length + 1;
            }
            
            // Encontrar la primera fila vacía después del separador
            let posicionInsercion = indiceSeparadorBarrio + 1;
            
            for (let i = indiceSeparadorBarrio + 1; i < values.length; i++) {
                if (!values[i] || !values[i][0] || values[i][0].trim() === '') {
                    posicionInsercion = i;
                    break;
                } else if (values[i][0].includes('==================')) {
                    // Siguiente separador encontrado
                    posicionInsercion = i;
                    break;
                } else {
                    posicionInsercion = i + 1;
                }
            }
            
            console.log(`📍 Posición de inserción: fila ${posicionInsercion + 1}`);
            return posicionInsercion + 1;
            
        } catch (error) {
            console.error('❌ Error encontrando posición de inserción:', error);
            return 2;
        }
    }
    
    async insertarFilaBarrio(nuevaFila, nombreBarrio, fechaConfiguracion = null) {
        try {
            console.log(`📝 Insertando datos para barrio: ${nombreBarrio}`);
            
            const posicion = await this.encontrarPosicionInsercionBarrio(nombreBarrio, fechaConfiguracion);
            const sheetId = await this.obtenerSheetIdReal(this.spreadsheetId, this.config.BARRIOS_SHEET_NAME);
            
            // Insertar nueva fila en la posición correcta
            await this.sheets.spreadsheets.batchUpdate({
                spreadsheetId: this.spreadsheetId,
                requestBody: {
                    requests: [
                        {
                            insertDimension: {
                                range: {
                                    sheetId: sheetId,
                                    dimension: 'ROWS',
                                    startIndex: posicion - 1,
                                    endIndex: posicion
                                },
                                inheritFromBefore: false
                            }
                        }
                    ]
                }
            });
            
            // Esperar un momento
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Insertar datos en la nueva fila - CORREGIDO: usar array bidimensional
            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: `${this.config.BARRIOS_SHEET_NAME}!A${posicion}:K${posicion}`,
                valueInputOption: 'RAW',
                requestBody: {
                    values: [nuevaFila] // ✅ CORRECTO: array de arrays
                }
            });
            
            // Aplicar formato normal
            await this.sheets.spreadsheets.batchUpdate({
                spreadsheetId: this.spreadsheetId,
                requestBody: {
                    requests: [
                        {
                            repeatCell: {
                                range: {
                                    sheetId: sheetId,
                                    startRowIndex: posicion - 1,
                                    endRowIndex: posicion,
                                    startColumnIndex: 0,
                                    endColumnIndex: 11
                                },
                                cell: {
                                    userEnteredFormat: {
                                        backgroundColor: {
                                            red: 1.0,
                                            green: 1.0,
                                            blue: 1.0
                                        },
                                        textFormat: {
                                            foregroundColor: {
                                                red: 0.0,
                                                green: 0.0,
                                                blue: 0.0
                                            },
                                            bold: false,
                                            fontSize: 10,
                                            fontFamily: 'Arial'
                                        },
                                        horizontalAlignment: 'LEFT',
                                        verticalAlignment: 'MIDDLE'
                                    }
                                },
                                fields: 'userEnteredFormat'
                            }
                        }
                    ]
                }
            });
            
            console.log(`✅ Fila insertada en posición ${posicion} para barrio ${nombreBarrio}`);
            
        } catch (error) {
            console.error('❌ Error insertando fila de barrio:', error);
            throw error;
        }
    }
    
    // Funciones utilitarias del código original
    async obtenerSheetIdReal(spreadsheetId, sheetName) {
        try {
            const spreadsheetInfo = await this.sheets.spreadsheets.get({
                spreadsheetId: spreadsheetId
            });
            
            const targetSheet = spreadsheetInfo.data.sheets.find(sheet => 
                sheet.properties.title === sheetName
            );
            
            if (targetSheet) {
                return targetSheet.properties.sheetId;
            } else {
                console.log(`⚠️ No se encontró la hoja "${sheetName}", usando 0 por defecto`);
                return 0;
            }
        } catch (error) {
            console.log(`⚠️ Error obteniendo sheet ID real: ${error.message}, usando 0 por defecto`);
            return 0;
        }
    }
    
    async verificarHeaders(spreadsheetId) {
        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId,
                range: `${this.config.BARRIOS_SHEET_NAME}!A1:K1`
            });
            
            if (!response.data.values || response.data.values.length === 0) {
                console.log('📋 Headers no encontrados, creando...');
                await this.crearHeadersBarrios(spreadsheetId);
            } else {
                console.log('✅ Headers ya existen');
            }
        } catch (error) {
            console.log('⚠️ Error verificando headers, creando nuevos...');
            await this.crearHeadersBarrios(spreadsheetId);
        }
    }
    
    async obtenerCarpetaPrincipal() {
        // ✅ CORREGIDO: Implementar correctamente para obtener Mopof
        try {
            const query = `name='Mopof' and mimeType='application/vnd.google-apps.folder'`;
            
            const searchResponse = await this.drive.files.list({
                q: query,
                supportsAllDrives: true
            });
            
            if (searchResponse.data.files.length > 0) {
                const mopofId = searchResponse.data.files[0].id;
                console.log(`📁 Carpeta Mopof encontrada: ${mopofId}`);
                return mopofId;
            }
            
            // Si no existe, crearla
            console.log(`🆕 Creando carpeta Mopof...`);
            const response = await this.drive.files.create({
                requestBody: {
                    name: 'Mopof',
                    mimeType: 'application/vnd.google-apps.folder'
                },
                supportsAllDrives: true
            });
            
            const mopofId = response.data.id;
            console.log(`✅ Carpeta Mopof creada: ${mopofId}`);
            return mopofId;
            
        } catch (error) {
            console.error('❌ Error obteniendo carpeta Mopof:', error);
            return null;
        }
    }
    
    async encontrarOCrearCarpeta(nombreCarpeta, parentId = null) {
        try {
            let query = `name='${nombreCarpeta}' and mimeType='application/vnd.google-apps.folder'`;
            if (parentId) {
                query += ` and '${parentId}' in parents`;
            }
            
            const searchResponse = await this.drive.files.list({
                q: query,
                supportsAllDrives: true
            });
            
            if (searchResponse.data.files.length > 0) {
                return searchResponse.data.files[0].id;
            }
            
            // Crear carpeta
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
            
            return response.data.id;
            
        } catch (error) {
            console.error('❌ Error creando/encontrando carpeta:', error);
            return null;
        }
    }
    
    // Métodos para agendas (mantener funcionalidad original)
    async obtenerSpreadsheetAgendas() {
        try {
            const carpetaPrincipal = await this.obtenerCarpetaPrincipal();
            const carpetaReportes = await this.encontrarOCrearCarpeta('Reportes', carpetaPrincipal);
            
            const nombreSpreadsheet = 'Agendas_Procesadas';
            
            // Buscar spreadsheet existente
            const query = `name='${nombreSpreadsheet}' and mimeType='application/vnd.google-apps.spreadsheet' and '${carpetaReportes}' in parents`;
            const searchResponse = await this.drive.files.list({ 
                q: query,
                supportsAllDrives: true 
            });
            
            if (searchResponse.data.files.length > 0) {
                const spreadsheetId = searchResponse.data.files[0].id;
                console.log(`✅ Spreadsheet de agendas encontrado: ${spreadsheetId}`);
                return spreadsheetId;
            }
            
            // Crear nuevo spreadsheet con headers
            console.log(`🆕 Creando spreadsheet de agendas: ${nombreSpreadsheet}...`);
            const spreadsheet = await this.sheets.spreadsheets.create({
                requestBody: {
                    properties: {
                        title: nombreSpreadsheet
                    },
                    sheets: [{
                        properties: {
                            title: this.config.AGENDAS_SHEET_NAME
                        }
                    }]
                }
            });
            
            const spreadsheetId = spreadsheet.data.spreadsheetId;
            
            // Mover a carpeta correcta
            await this.drive.files.update({
                fileId: spreadsheetId,
                addParents: carpetaReportes,
                supportsAllDrives: true
            });
            
            // Crear headers de agendas
            await this.crearHeadersAgendas(spreadsheetId);
            
            console.log(`📊 Spreadsheet de agendas creado en: Mopof/Reportes/${nombreSpreadsheet}`);
            return spreadsheetId;
            
        } catch (error) {
            console.error('❌ Error obteniendo spreadsheet de agendas:', error);
            return null;
        }
    }
    
    async crearHeadersAgendas(spreadsheetId) {
        try {
            console.log('📋 Creando headers de agendas...');
            
            const headers = [
                'FECHA DE LA AGENDA', 'HORA DE LA AGENDA', 'MOTIVO/TEMA', 'PERSONA/CONVOCA',
                'ESTADO', 'FECHA DEL MENSAJE', 'HORA DEL MENSAJE', 'CONTACTO', 'MENSAJE ORIGINAL'
            ];
            
            // Insertar headers
            await this.sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `${this.config.AGENDAS_SHEET_NAME}!A1:I1`,
                valueInputOption: 'RAW',
                requestBody: {
                    values: [headers]
                }
            });
            
            // Obtener sheet ID real
            const sheetId = await this.obtenerSheetIdReal(spreadsheetId, this.config.AGENDAS_SHEET_NAME);
            
            // Formatear headers
            await this.sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                requestBody: {
                    requests: [
                        {
                            repeatCell: {
                                range: {
                                    sheetId: sheetId,
                                    startRowIndex: 0,
                                    endRowIndex: 1,
                                    startColumnIndex: 0,
                                    endColumnIndex: 9
                                },
                                cell: {
                                    userEnteredFormat: {
                                        backgroundColor: {
                                            red: 0.31,
                                            green: 0.51,
                                            blue: 0.74
                                        },
                                        textFormat: {
                                            foregroundColor: {
                                                red: 1.0,
                                                green: 1.0,
                                                blue: 1.0
                                            },
                                            bold: true,
                                            fontSize: 12,
                                            fontFamily: 'Arial'
                                        },
                                        horizontalAlignment: 'CENTER',
                                        verticalAlignment: 'MIDDLE'
                                    }
                                },
                                fields: 'userEnteredFormat'
                            }
                        },
                        // Anchos de columnas específicos para agendas
                        ...Array.from({length: 9}, (_, i) => {
                            const widths = [200, 200, 250, 200, 120, 200, 200, 180, 300];
                            return {
                                updateDimensionProperties: {
                                    range: {
                                        sheetId: sheetId,
                                        dimension: 'COLUMNS',
                                        startIndex: i,
                                        endIndex: i + 1
                                    },
                                    properties: { pixelSize: widths[i] },
                                    fields: 'pixelSize'
                                }
                            };
                        })
                    ]
                }
            });
            
            console.log(`✅ Headers de agendas creados y formateados`);
            
        } catch (error) {
            console.error('❌ Error creando headers de agendas:', error);
            throw error;
        }
    }
    
    async agregarFilaAgenda(spreadsheetId, nuevaFila) {
        try {
            console.log('📅 Agregando nueva agenda...');
            
            // Obtener la siguiente fila disponible
            let nextRow = 2;
            try {
                const existingData = await this.sheets.spreadsheets.values.get({
                    spreadsheetId,
                    range: `${this.config.AGENDAS_SHEET_NAME}!A:A`
                });
                if (existingData.data.values) {
                    nextRow = existingData.data.values.length + 1;
                }
            } catch (error) {
                console.log('⚠️ Usando fila por defecto: 2');
            }
            
            // Agregar nueva fila
            await this.sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `${this.config.AGENDAS_SHEET_NAME}!A${nextRow}:I${nextRow}`,
                valueInputOption: 'RAW',
                requestBody: {
                    values: [nuevaFila]
                }
            });
            
            console.log(`✅ Agenda agregada en fila ${nextRow}`);
            
        } catch (error) {
            console.error('❌ Error agregando fila de agenda:', error);
            throw error;
        }
    }
    
    // Getter público
    obtenerSpreadsheetBarrios() {
        return this.spreadsheetId;
    }
}

module.exports = SheetsManager;
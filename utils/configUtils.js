const fs = require('fs');

const BARRIOS_CONFIG = {
    BARRIOS_FILE: './config/barrios_config.json',
    barrio1: { nombre: null, activo: false },
    barrio2: { nombre: null, activo: false },
    barrio3: { nombre: null, activo: false }
};

let barriosConfig = { ...BARRIOS_CONFIG };

function cargarBarriosConfig() {
    try {
        if (fs.existsSync(BARRIOS_CONFIG.BARRIOS_FILE)) {
            const data = JSON.parse(fs.readFileSync(BARRIOS_CONFIG.BARRIOS_FILE));
            barriosConfig = { ...BARRIOS_CONFIG, ...data };
            console.log('📍 Configuración de barrios cargada:', barriosConfig);
        } else {
            // Crear archivo de configuración inicial
            const configDir = './config';
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }
            guardarBarriosConfig();
        }
        return barriosConfig;
    } catch (error) {
        console.error('❌ Error cargando configuración de barrios:', error);
        barriosConfig = { ...BARRIOS_CONFIG };
        return barriosConfig;
    }
}

function guardarBarriosConfig() {
    try {
        const configDir = './config';
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }
        
        const dataToSave = {
            barrio1: barriosConfig.barrio1,
            barrio2: barriosConfig.barrio2,
            barrio3: barriosConfig.barrio3,
            fechaActualizacion: new Date().toISOString()
        };
        
        fs.writeFileSync(BARRIOS_CONFIG.BARRIOS_FILE, JSON.stringify(dataToSave, null, 2));
        console.log('💾 Configuración de barrios guardada');
        return true;
    } catch (error) {
        console.error('❌ Error guardando configuración de barrios:', error);
        return false;
    }
}

function actualizarBarrio(numeroBarrio, nombreBarrio) {
    if (numeroBarrio < 1 || numeroBarrio > 3) {
        throw new Error('Número de barrio debe estar entre 1 y 3');
    }
    
    const barrioKey = `barrio${numeroBarrio}`;
    barriosConfig[barrioKey] = {
        nombre: nombreBarrio.toUpperCase(),
        activo: true,
        fechaConfiguracion: new Date().toISOString()
    };
    
    return guardarBarriosConfig();
}

function obtenerBarrio(numeroBarrio) {
    if (numeroBarrio < 1 || numeroBarrio > 3) {
        return null;
    }
    
    const barrioKey = `barrio${numeroBarrio}`;
    return barriosConfig[barrioKey];
}

function resetearTodosLosBarrios() {
    barriosConfig.barrio1 = { nombre: null, activo: false };
    barriosConfig.barrio2 = { nombre: null, activo: false };
    barriosConfig.barrio3 = { nombre: null, activo: false };
    
    return guardarBarriosConfig();
}

function obtenerBarriosActivos() {
    const activos = [];
    
    for (let i = 1; i <= 3; i++) {
        const barrio = obtenerBarrio(i);
        if (barrio && barrio.activo && barrio.nombre) {
            activos.push({
                numero: i,
                nombre: barrio.nombre,
                fechaConfiguracion: barrio.fechaConfiguracion
            });
        }
    }
    
    return activos;
}

function validarConfiguracionBarrios() {
    const errores = [];
    const warnings = [];
    
    for (let i = 1; i <= 3; i++) {
        const barrio = obtenerBarrio(i);
        
        if (!barrio) {
            errores.push(`Barrio ${i}: Configuración no encontrada`);
            continue;
        }
        
        if (!barrio.nombre) {
            warnings.push(`Barrio ${i}: No configurado`);
        } else if (barrio.nombre.length < 3) {
            warnings.push(`Barrio ${i}: Nombre muy corto (${barrio.nombre})`);
        }
        
        if (barrio.activo && !barrio.nombre) {
            errores.push(`Barrio ${i}: Marcado como activo pero sin nombre`);
        }
    }
    
    return { errores, warnings, valida: errores.length === 0 };
}

function obtenerConfiguracionCompleta() {
    return {
        barrios: {
            barrio1: barriosConfig.barrio1,
            barrio2: barriosConfig.barrio2,
            barrio3: barriosConfig.barrio3
        },
        activos: obtenerBarriosActivos(),
        validacion: validarConfiguracionBarrios(),
        archivo: BARRIOS_CONFIG.BARRIOS_FILE
    };
}

// Función para migrar configuración antigua si existe
function migrarConfiguracionAntigua() {
    const archivoAntiguo = './barrios_config.json';
    
    if (fs.existsSync(archivoAntiguo) && !fs.existsSync(BARRIOS_CONFIG.BARRIOS_FILE)) {
        try {
            const configAntigua = JSON.parse(fs.readFileSync(archivoAntiguo));
            barriosConfig = { ...BARRIOS_CONFIG, ...configAntigua };
            guardarBarriosConfig();
            
            // Crear backup del archivo antiguo
            const backupPath = `${archivoAntiguo}.backup`;
            fs.copyFileSync(archivoAntiguo, backupPath);
            
            console.log('🔄 Configuración migrada desde archivo antiguo');
            console.log(`📁 Backup creado: ${backupPath}`);
            
            return true;
        } catch (error) {
            console.error('❌ Error migrando configuración:', error);
            return false;
        }
    }
    
    return false;
}

module.exports = {
    cargarBarriosConfig,
    guardarBarriosConfig,
    actualizarBarrio,
    obtenerBarrio,
    resetearTodosLosBarrios,
    obtenerBarriosActivos,
    validarConfiguracionBarrios,
    obtenerConfiguracionCompleta,
    migrarConfiguracionAntigua,
    barriosConfig: () => barriosConfig
};
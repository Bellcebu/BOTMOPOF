class DefaultStrategy {
    async process(messageInfo) {
        const { codigo, contenido, contacto } = messageInfo;
        
        console.log(`💬 Mensaje sin código válido de ${contacto} - NO SE PROCESA`);
        console.log(`📝 Contenido: ${contenido.substring(0, 50)}...`);
        console.log(`🔢 Código detectado: ${codigo} (no válido)`);
        
        return {
            success: true,
            accion: 'ignorado',
            razon: 'Mensaje sin código válido - no se procesa'
        };
    }
}

module.exports = DefaultStrategy;
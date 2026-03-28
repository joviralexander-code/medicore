/**
 * Servicio de generación de clave de acceso SRI
 * Re-exporta desde @medicore/shared/utils para uso server-side
 */
export {
  generarClaveAcceso,
  validarClaveAcceso,
  calcularDigitoVerificador,
  generarCodigoNumerico,
  type ClaveAccesoParams,
} from '@medicore/shared/utils';

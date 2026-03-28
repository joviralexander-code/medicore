/**
 * Formatea montos como USD
 */
export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('es-EC', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

/**
 * Formatea fechas en formato ecuatoriano DD/MM/YYYY
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('es-EC', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Guayaquil',
  }).format(d);
}

/**
 * Genera un slug URL-safe desde un nombre
 * Ej: "Dr. Juan García" → "dr-juan-garcia"
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remover acentos
    .replace(/[^a-z0-9\s-]/g, '')   // Solo alfanuméricos y guiones
    .replace(/\s+/g, '-')            // Espacios → guiones
    .replace(/-+/g, '-')             // Múltiples guiones → uno
    .replace(/^-|-$/g, '');          // Trim guiones
}

/**
 * Valida cédula ecuatoriana (10 dígitos)
 */
export function validarCedula(cedula: string): boolean {
  if (!/^\d{10}$/.test(cedula)) return false;

  const provincia = parseInt(cedula.slice(0, 2), 10);
  if (provincia < 1 || provincia > 24) return false;

  const tercerDigito = parseInt(cedula[2] ?? '9', 10);
  if (tercerDigito >= 6) return false; // Solo personas naturales con 0-5

  const coeficientes = [2, 1, 2, 1, 2, 1, 2, 1, 2];
  let suma = 0;

  for (let i = 0; i < 9; i++) {
    let valor = parseInt(cedula[i] ?? '0', 10) * (coeficientes[i] ?? 1);
    if (valor >= 10) valor -= 9;
    suma += valor;
  }

  const digitoVerificador = suma % 10 === 0 ? 0 : 10 - (suma % 10);
  return digitoVerificador === parseInt(cedula[9] ?? '-1', 10);
}

/**
 * Valida RUC ecuatoriano (13 dígitos)
 */
export function validarRUC(ruc: string): boolean {
  if (!/^\d{13}$/.test(ruc)) return false;
  if (!ruc.endsWith('001')) return false; // Los últimos 3 deben ser '001'

  const tercerDigito = parseInt(ruc[2] ?? '9', 10);

  // Persona natural
  if (tercerDigito < 6) return validarCedula(ruc.slice(0, 10));

  // Sociedad pública (tercer dígito = 6)
  if (tercerDigito === 6) {
    const coeficientes = [3, 2, 7, 6, 5, 4, 3, 2];
    let suma = 0;
    for (let i = 0; i < 8; i++) {
      suma += parseInt(ruc[i] ?? '0', 10) * (coeficientes[i] ?? 1);
    }
    const verificador = 11 - (suma % 11);
    return verificador === parseInt(ruc[8] ?? '-1', 10);
  }

  // Persona jurídica privada (tercer dígito = 9)
  if (tercerDigito === 9) {
    const coeficientes = [4, 3, 2, 7, 6, 5, 4, 3, 2];
    let suma = 0;
    for (let i = 0; i < 9; i++) {
      suma += parseInt(ruc[i] ?? '0', 10) * (coeficientes[i] ?? 1);
    }
    const residuo = suma % 11;
    const verificador = residuo === 0 ? 0 : 11 - residuo;
    return verificador === parseInt(ruc[9] ?? '-1', 10);
  }

  return false;
}

/**
 * Calcula la edad desde una fecha de nacimiento
 */
export function calcularEdad(fechaNacimiento: Date | string): number {
  const nacimiento = typeof fechaNacimiento === 'string' ? new Date(fechaNacimiento) : fechaNacimiento;
  const hoy = new Date();
  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  const mes = hoy.getMonth() - nacimiento.getMonth();
  if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) {
    edad--;
  }
  return edad;
}

/**
 * Trunca texto a N caracteres con ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

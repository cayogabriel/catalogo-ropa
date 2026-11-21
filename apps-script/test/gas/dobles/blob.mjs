// Blob y bytes al estilo Apps Script: getBytes() devuelve bytes con signo (-128..127).

export function aBuffer(datos) {
  if (Buffer.isBuffer(datos)) return Buffer.from(datos);
  if (typeof datos === 'string') return Buffer.from(datos, 'utf8');
  if (Array.isArray(datos) || ArrayBuffer.isView(datos)) return Buffer.from(Uint8Array.from(datos, (b) => b & 255));
  throw new Error(`Blob: tipo de datos no soportado (${typeof datos})`);
}

export const bytesConSigno = (buf) => Array.from(new Int8Array(buf.buffer, buf.byteOffset, buf.length));

export function crearBlob(datos, tipo = 'application/octet-stream', nombre = null) {
  let buffer = aBuffer(datos);
  let contentType = tipo;
  let name = nombre;
  const blob = {
    getBytes: () => bytesConSigno(buffer),
    getDataAsString: () => buffer.toString('utf8'),
    getContentType: () => contentType,
    setContentType: (t) => ((contentType = t), blob),
    getName: () => name,
    setName: (n) => ((name = n), blob),
    getAs: (t) => crearBlob(buffer, t, name),
    copyBlob: () => crearBlob(buffer, contentType, name),
    setBytes: (b) => ((buffer = aBuffer(b)), blob),
    setDataFromString: (s) => ((buffer = aBuffer(s)), blob),
    _buffer: () => buffer,
  };
  return blob;
}

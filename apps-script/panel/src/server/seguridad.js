// Control de acceso: solo la dueña del script (quien lo despliega) puede usar el Panel.
// El despliegue ya es «solo yo», pero cada función vuelve a comprobarlo.

function requireAdmin_() {
  const activo = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  const dueno = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  if (!activo || activo !== dueno) {
    throw new Error('no_autorizado: esta acción es solo para la administradora del catálogo');
  }
}

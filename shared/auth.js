async function getCurrentUser() {
  const { data: { user } } = await window.sb.auth.getUser();
  return user || null;
}
async function getProfile(userId) {
  if (!userId) return null;
  const { data } = await window.sb.from('profiles').select('*').eq('id', userId).single();
  return data || null;
}
async function protegerAdmin() {
  const user = await getCurrentUser();
  if (!user) { window.location.href = '/loja'; return false; }
  const profile = await getProfile(user.id);
  if (!profile || profile.role !== 'admin') { window.location.href = '/loja'; return false; }
  window.perfil = profile;
  return true;
}
async function logout() { await window.sb.auth.signOut(); window.location.href = '/loja'; }
window.getCurrentUser = getCurrentUser; window.getProfile = getProfile; window.protegerAdmin = protegerAdmin; window.logout = logout; window.fazerLogout = logout;

export async function loadAuthentication(request) {
  const info = await request("/auth/status");
  if (info.setup_required) return { setup: true, user: null };
  try {
    return { setup: false, user: (await request("/auth/me")).username };
  } catch (error) {
    if (error.status === 401) return { setup: false, user: null };
    throw error;
  }
}

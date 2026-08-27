/* ============================================================
   NEXO — supabase-client.js
   Conexão compartilhada, usada por todas as páginas.

   ============================================================
   CONFIGURE AQUI ANTES DE PUBLICAR O SITE (uma vez só):
   cole a URL e a chave "anon public" do SEU projeto Supabase.
   Essa chave é feita pra ficar no código do navegador — ela sozinha
   não dá acesso a nada; quem protege os dados é o RLS (schema.sql).
   ============================================================ */
/* ============================================================
   NEXO — supabase-client.js
   Conexão compartilhada, usada por todas as páginas.

   ============================================================
   CONFIGURE AQUI ANTES DE PUBLICAR O SITE (uma vez só):
   cole a URL e a chave "anon public" do SEU projeto Supabase.
   Essa chave é feita pra ficar no código do navegador — ela sozinha
   não dá acesso a nada; quem protege os dados é o RLS (schema.sql).
   ============================================================ */

const SUPABASE_URL = 'https://dvbrtpvyqlrrcmhrdjgq.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_2Ab-_jftI82sAvN77lLHkQ_-lQsm-m2';

function hasSupabaseConfig(){
  return !!SUPABASE_URL && !SUPABASE_URL.includes('SEU-PROJETO') &&
         !!SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.includes('SUA-ANON-KEY');
}

let supabaseClient = null;
function initSupabase(){
  if(!hasSupabaseConfig()) return null;
  if(!supabaseClient){
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabaseClient;
}

function requireSupabaseConfig(){
  const client = initSupabase();
  if(!client){
    // isso só deve aparecer pra VOCÊ, se esquecer de configurar acima —
    // o usuário final nunca deveria ver esta mensagem
    alert('Sistema ainda não configurado: edite js/supabase-client.js com a URL e a anon key do seu projeto Supabase.');
  }
  return client;
}

// usado nas páginas que exigem login (home, projeto...)
async function requireSession(){
  const client = requireSupabaseConfig();
  if(!client) return null;
  const { data: { session } } = await client.auth.getSession();
  if(!session){
    window.location.href = 'index.html';
    return null;
  }
  return session;
}

async function logout(){
  const client = initSupabase();
  if(client) await client.auth.signOut();
  window.location.href = 'index.html';
}

const SUPABASE_URL = 'https://dvbrtpvyqlrrcmhrdjgq.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_2Ab-_jftI82sAvN77lLHkQ_-lQsm-m2';

function hasSupabaseConfig(){
  return !!SUPABASE_URL && !SUPABASE_URL.includes('SEU-PROJETO') &&
         !!SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.includes('SUA-ANON-KEY');
}

let supabaseClient = null;
function initSupabase(){
  if(!hasSupabaseConfig()) return null;
  if(!supabaseClient){
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabaseClient;
}

function requireSupabaseConfig(){
  const client = initSupabase();
  if(!client){
    // isso só deve aparecer pra VOCÊ, se esquecer de configurar acima —
    // o usuário final nunca deveria ver esta mensagem
    alert('Sistema ainda não configurado: edite js/supabase-client.js com a URL e a anon key do seu projeto Supabase.');
  }
  return client;
}

// usado nas páginas que exigem login (home, projeto...)
async function requireSession(){
  const client = requireSupabaseConfig();
  if(!client) return null;
  const { data: { session } } = await client.auth.getSession();
  if(!session){
    window.location.href = 'index.html';
    return null;
  }
  return session;
}

async function logout(){
  const client = initSupabase();
  if(client) await client.auth.signOut();
  window.location.href = 'index.html';
}

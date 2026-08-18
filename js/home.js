/* ============================================================
   NEXO — home.js
   Lista, cria e apaga projetos do usuário logado.
   ============================================================ */

let client = null;
let currentUser = null;

(async function init(){
  const session = await requireSession();
  if(!session) return;
  client = initSupabase();
  currentUser = session.user;
  document.getElementById('userChip').textContent = currentUser.email;
  await loadProjects();
})();

document.getElementById('btnLogout').addEventListener('click', logout);

async function loadProjects(){
  const loading = document.getElementById('loadingState');
  const empty = document.getElementById('emptyState');
  const grid = document.getElementById('projectsGrid');
  loading.classList.remove('hidden');
  empty.classList.add('hidden');
  grid.classList.add('hidden');

  const { data, error } = await client.from('projects').select('*').order('created_at', { ascending: false });
  loading.classList.add('hidden');

  if(error){
    loading.textContent = 'Erro ao carregar projetos: ' + error.message;
    loading.classList.remove('hidden');
    return;
  }

  if(!data.length){
    empty.classList.remove('hidden');
    return;
  }

  grid.classList.remove('hidden');
  grid.innerHTML = data.map(p => `
    <div class="project-card" data-id="${p.id}">
      <button class="p-del" data-id="${p.id}" title="Excluir projeto">✕</button>
      <span class="p-name">${escapeHtml(p.nome)}</span>
      ${p.area ? `<span class="p-area">${escapeHtml(p.area)}</span>` : ''}
      <span class="p-desc">${escapeHtml(p.descricao || '')}</span>
      <span class="p-meta">criado em ${new Date(p.created_at).toLocaleDateString('pt-BR')}</span>
    </div>`).join('');

  grid.querySelectorAll('.project-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if(e.target.closest('.p-del')) return;
      window.location.href = `project.html?id=${card.dataset.id}`;
    });
  });
  grid.querySelectorAll('.p-del').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if(!confirm('Excluir este projeto? Todos os dados, dashboards e apresentações dele também são apagados.')) return;
      const { error } = await client.from('projects').delete().eq('id', btn.dataset.id);
      if(error){ alert('Erro ao excluir: ' + error.message); return; }
      await loadProjects();
    });
  });
}

function escapeHtml(s){
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

// ---------------- modal novo projeto ----------------
const modal = document.getElementById('newProjectModal');
function openModal(){
  document.getElementById('npNome').value = '';
  document.getElementById('npArea').value = '';
  document.getElementById('npDesc').value = '';
  document.getElementById('npError').classList.add('hidden');
  modal.classList.remove('hidden');
}
document.getElementById('btnNewProject').addEventListener('click', openModal);
document.getElementById('btnNewProjectEmpty').addEventListener('click', openModal);
document.getElementById('btnCloseModal').addEventListener('click', () => modal.classList.add('hidden'));
document.getElementById('btnCancelNew').addEventListener('click', () => modal.classList.add('hidden'));

document.getElementById('btnCreateProject').addEventListener('click', async () => {
  const nome = document.getElementById('npNome').value.trim();
  const area = document.getElementById('npArea').value.trim();
  const descricao = document.getElementById('npDesc').value.trim();
  const errEl = document.getElementById('npError');
  if(!nome){ errEl.textContent = 'Dê um nome pro projeto.'; errEl.classList.remove('hidden'); return; }

  const btn = document.getElementById('btnCreateProject');
  btn.disabled = true;
  const { data, error } = await client.from('projects')
    .insert({ owner_id: currentUser.id, nome, area, descricao })
    .select().single();
  btn.disabled = false;

  if(error){ errEl.textContent = 'Erro ao criar: ' + error.message; errEl.classList.remove('hidden'); return; }
  window.location.href = `project.html?id=${data.id}`;
});

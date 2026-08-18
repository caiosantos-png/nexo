/* ============================================================
   NEXO — project.js
   Fluxo: importar → pré-visualizar/validar → salvar no Supabase
   → montar o painel dinamicamente a partir das colunas detectadas.
   ============================================================ */

const PALETTE = {
  alert: '#E4483C', signal: '#34C3B5', warn: '#F0A93B', grid: '#212B38', text: '#7C8794',
  bars: ['#34C3B5','#F0A93B','#E4483C','#5B8DEF','#B075E5','#EC6BA0','#6FCF97','#F2994A','#56CCF2','#F5D033']
};
Chart.defaults.font.family = "'IBM Plex Mono', monospace";
Chart.defaults.color = PALETTE.text;
Chart.defaults.font.size = 11;
Chart.register(ChartDataLabels);
Chart.defaults.set('plugins.datalabels', { display: false });
const LABEL_ON_DARK = { display:true, color:'#fff', font:{weight:'700', size:11}, textStrokeColor:'rgba(0,0,0,.55)', textStrokeWidth:3 };

const state = {
  client: null, user: null, project: null,
  pendingSheets: [], selectedSheets: [], previewData: [],
  rawFile: null,
  datasets: [], columns: [], records: [],
  charts: {}, slideCharts: {}, currentSlide: 0, slideDefs: [],
  currentAnalysis: null,
  dataPage: 0, dataPageSize: 50, dataSearch: ''
};

function uuid(){
  return crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random()*16|0, v = c==='x'?r:(r&0x3|0x8); return v.toString(16);
  });
}

// Supabase Storage só aceita letras, números, ponto, hífen e underscore na
// chave do objeto — nomes de arquivo reais têm espaço, acento, parênteses etc.
function sanitizeFileName(name){
  const semAcento = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return semAcento.replace(/[^a-zA-Z0-9.\-_]/g, '_');
}

function applyProjectTheme(project){
  const tema = project.tema || {};
  if(tema.cor){
    document.documentElement.style.setProperty('--accent-signal', tema.cor);
    PALETTE.signal = tema.cor;
  }
}

// ----------------------------------------------------------------
// CONFIGURAÇÕES DO PROJETO (cor + logo)
// ----------------------------------------------------------------
const settingsModal = document.getElementById('settingsModal');
let pendingLogoFile = null;

document.getElementById('btnSettings').addEventListener('click', () => {
  const tema = state.project.tema || {};
  document.getElementById('setNome').value = state.project.nome;
  document.getElementById('setCor').value = tema.cor || '#34C3B5';
  const preview = document.getElementById('logoPreview');
  const removeBtn = document.getElementById('btnRemoveLogo');
  if(tema.logoUrl){ preview.src = tema.logoUrl; preview.classList.remove('hidden'); removeBtn.classList.remove('hidden'); }
  else{ preview.classList.add('hidden'); removeBtn.classList.add('hidden'); }
  pendingLogoFile = null;
  document.getElementById('settingsError').classList.add('hidden');
  settingsModal.classList.remove('hidden');
});
document.getElementById('btnCloseSettings').addEventListener('click', () => settingsModal.classList.add('hidden'));
document.getElementById('btnCancelSettings').addEventListener('click', () => settingsModal.classList.add('hidden'));

document.getElementById('logoInput').addEventListener('change', e => {
  const file = e.target.files[0];
  if(!file) return;
  pendingLogoFile = file;
  const preview = document.getElementById('logoPreview');
  preview.src = URL.createObjectURL(file);
  preview.classList.remove('hidden');
  document.getElementById('btnRemoveLogo').classList.remove('hidden');
});
document.getElementById('btnRemoveLogo').addEventListener('click', () => {
  pendingLogoFile = 'remove';
  document.getElementById('logoPreview').classList.add('hidden');
  document.getElementById('btnRemoveLogo').classList.add('hidden');
});

document.getElementById('btnSaveSettings').addEventListener('click', async () => {
  const nome = document.getElementById('setNome').value.trim();
  const cor = document.getElementById('setCor').value;
  const errEl = document.getElementById('settingsError');
  if(!nome){ errEl.textContent = 'Dê um nome pro projeto.'; errEl.classList.remove('hidden'); return; }

  const btn = document.getElementById('btnSaveSettings');
  btn.disabled = true;
  try{
    const tema = { ...(state.project.tema || {}), cor };
    if(pendingLogoFile === 'remove'){
      delete tema.logoUrl;
    }else if(pendingLogoFile){
      const path = `${state.user.id}/${state.project.id}/logo_${Date.now()}_${sanitizeFileName(pendingLogoFile.name)}`;
      const { error: upErr } = await state.client.storage.from('branding').upload(path, pendingLogoFile, { upsert: true });
      if(upErr) throw upErr;
      const { data: pub } = state.client.storage.from('branding').getPublicUrl(path);
      tema.logoUrl = pub.publicUrl;
    }

    const { data, error } = await state.client.from('projects').update({ nome, tema }).eq('id', state.project.id).select().single();
    if(error) throw error;

    state.project = data;
    document.getElementById('projectName').textContent = data.nome;
    applyProjectTheme(data);
    if(state.currentAnalysis) renderDashboard();
    settingsModal.classList.add('hidden');
  }catch(e){
    errEl.textContent = 'Erro ao salvar: ' + (e.message || e);
    errEl.classList.remove('hidden');
  }finally{
    btn.disabled = false;
  }
});

// ----------------------------------------------------------------
// INIT
// ----------------------------------------------------------------
(async function init(){
  const session = await requireSession();
  if(!session) return;
  state.client = initSupabase();
  state.user = session.user;

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if(!id){ window.location.href = 'home.html'; return; }

  const { data, error } = await state.client.from('projects').select('*').eq('id', id).single();
  document.getElementById('loadingState').classList.add('hidden');
  if(error || !data){
    document.getElementById('loadingState').classList.remove('hidden');
    document.getElementById('loadingState').textContent = 'Projeto não encontrado (ou sem acesso).';
    return;
  }
  state.project = data;
  document.getElementById('projectName').textContent = data.nome;
  document.getElementById('projectArea').textContent = data.area || 'projeto';
  applyProjectTheme(data);

  const { data: existingDatasets } = await state.client.from('datasets').select('*').eq('project_id', id);
  if(existingDatasets && existingDatasets.length){
    await loadDashboard();
  }else{
    document.getElementById('uploadSection').classList.remove('hidden');
  }
})();

// ----------------------------------------------------------------
// UPLOAD
// ----------------------------------------------------------------
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('drag-over'); if(e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]); });
fileInput.addEventListener('change', e => { if(e.target.files.length) handleFile(e.target.files[0]); });

document.getElementById('btnImportMore').addEventListener('click', () => {
  document.getElementById('dashboardSection').classList.add('hidden');
  document.getElementById('uploadSection').classList.remove('hidden');
});

function handleFile(file){
  state.rawFile = file;
  document.getElementById('fileNameLabel').textContent = file.name;
  const reader = new FileReader();
  reader.onload = e => {
    state.pendingSheets = parseWorkbook(e.target.result);
    if(!state.pendingSheets.length){
      alert('Não encontrei nenhuma aba com dados reconhecíveis nesse arquivo.');
      return;
    }
    if(state.pendingSheets.length > 1){
      renderSheetPicker();
      document.getElementById('sheetPickerZone').classList.remove('hidden');
    }else{
      state.selectedSheets = [state.pendingSheets[0]];
      analyzeSelectedSheets();
    }
  };
  reader.readAsArrayBuffer(file);
}

function renderSheetPicker(){
  const grid = document.getElementById('sheetPickerGrid');
  grid.innerHTML = state.pendingSheets.map((s,i) => `
    <div class="sheet-row">
      <input type="checkbox" class="sheet-check" data-idx="${i}" ${s.defaultInclude?'checked':''}>
      <div class="sheet-info"><span class="sheet-name">${s.name}</span><span class="sheet-meta">${s.rowCount} linhas de dados${s.isReport ? ' · detectado como relatório com várias tabelas — convertido em Seção/Indicador/Período/Valor' : ''}</span></div>
      <input type="text" class="sheet-rotulo" data-idx="${i}" value="${s.rotulo}">
    </div>`).join('');
}
document.getElementById('btnAnalyzeSheets').addEventListener('click', () => {
  const checks = [...document.querySelectorAll('.sheet-check:checked')];
  if(!checks.length){ alert('Selecione ao menos uma aba.'); return; }
  checks.forEach(c => {
    const idx = parseInt(c.dataset.idx,10);
    const rot = document.querySelector(`.sheet-rotulo[data-idx="${idx}"]`).value.trim();
    if(rot) state.pendingSheets[idx].rotulo = rot;
  });
  state.selectedSheets = checks.map(c => state.pendingSheets[parseInt(c.dataset.idx,10)]);
  analyzeSelectedSheets();
});

// ----------------------------------------------------------------
// PRÉ-VISUALIZAÇÃO / VALIDAÇÃO
// ----------------------------------------------------------------
function analyzeSelectedSheets(){
  state.previewData = state.selectedSheets.map(sheet => ({
    sheet,
    columns: analyzeSheetColumns(sheet.headers, sheet.dataRows)
  }));
  document.getElementById('uploadSection').classList.add('hidden');
  document.getElementById('sheetPickerZone').classList.add('hidden');
  renderPreview();
  document.getElementById('previewSection').classList.remove('hidden');
}

function renderPreview(){
  const totalLinhas = state.previewData.reduce((s,p) => s + p.sheet.rowCount, 0);
  const totalColunas = state.previewData.reduce((s,p) => s + p.columns.length, 0);
  document.getElementById('previewSummary').textContent =
    `Encontramos ${totalLinhas.toLocaleString('pt-BR')} linhas e ${totalColunas} colunas em ${state.previewData.length} aba(s). Revise os tipos abaixo — ajuste o que a detecção errou antes de gerar o painel.`;

  document.getElementById('previewCards').innerHTML = state.previewData.map((p, pIdx) => `
    <div class="panel">
      <div class="panel-head">
        <span class="panel-title">${p.sheet.rotulo} <span style="color:var(--text-dim); font-weight:400;">(${p.sheet.name})</span></span>
        <span class="panel-hint">${p.sheet.rowCount} linhas</span>
      </div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Coluna</th><th>Tipo detectado</th><th>Papel</th><th>Confiança</th><th>Vazios</th><th>Amostra</th></tr></thead>
        <tbody>
          ${p.columns.map((c, cIdx) => `
            <tr>
              <td>${c.nome_coluna}</td>
              <td><select data-p="${pIdx}" data-c="${cIdx}" data-field="tipo_detectado" class="prev-field">
                ${TIPO_OPTIONS.map(t => `<option value="${t}" ${t===c.tipo_detectado?'selected':''}>${t}</option>`).join('')}
              </select></td>
              <td><select data-p="${pIdx}" data-c="${cIdx}" data-field="papel" class="prev-field">
                ${PAPEL_OPTIONS.map(t => `<option value="${t}" ${t===c.papel?'selected':''}>${t}</option>`).join('')}
              </select></td>
              <td><span class="badge ${c.confianca>=0.7?'badge-ok':c.confianca>=0.4?'badge-warn':'badge-low'}">${Math.round(c.confianca*100)}%</span></td>
              <td>${c.vazios || '—'}</td>
              <td style="color:var(--text-muted); max-width:220px; overflow:hidden; text-overflow:ellipsis;">${c.amostra.join(', ')}</td>
            </tr>`).join('')}
        </tbody>
      </table></div>
    </div>`).join('');

  document.querySelectorAll('.prev-field').forEach(el => {
    el.addEventListener('change', () => {
      const p = parseInt(el.dataset.p,10), c = parseInt(el.dataset.c,10);
      state.previewData[p].columns[c][el.dataset.field] = el.value;
    });
  });
}

document.getElementById('btnCancelPreview').addEventListener('click', () => {
  document.getElementById('previewSection').classList.add('hidden');
  document.getElementById('uploadSection').classList.remove('hidden');
});

document.getElementById('btnConfirmPreview').addEventListener('click', confirmImport);

async function confirmImport(){
  const btn = document.getElementById('btnConfirmPreview');
  const status = document.getElementById('previewStatus');
  btn.disabled = true;
  status.textContent = 'Enviando arquivo original...';

  try{
    let fileId = null;
    if(state.rawFile){
      const path = `${state.user.id}/${state.project.id}/${Date.now()}_${sanitizeFileName(state.rawFile.name)}`;
      const { error: upErr } = await state.client.storage.from('uploads').upload(path, state.rawFile);
      if(upErr) throw upErr;
      const { data: fileRow, error: fileErr } = await state.client.from('files')
        .insert({ project_id: state.project.id, nome_arquivo: state.rawFile.name, storage_path: path, tamanho_bytes: state.rawFile.size, status: 'pronto' })
        .select().single();
      if(fileErr) throw fileErr;
      fileId = fileRow.id;
    }

    for(const entry of state.previewData){
      status.textContent = `Salvando aba "${entry.sheet.rotulo}"...`;
      const { data: datasetRow, error: dsErr } = await state.client.from('datasets')
        .insert({ file_id: fileId, project_id: state.project.id, nome_aba: entry.sheet.name, rotulo: entry.sheet.rotulo, total_registros: entry.sheet.dataRows.length })
        .select().single();
      if(dsErr) throw dsErr;

      const colPayload = entry.columns.map((c,i) => ({
        dataset_id: datasetRow.id, nome_coluna: c.nome_coluna, ordem: i,
        tipo_detectado: c.tipo_detectado, papel: c.papel, confianca: c.confianca, confirmado_por_usuario: true
      }));
      const { error: colErr } = await state.client.from('dataset_columns').insert(colPayload);
      if(colErr) throw colErr;

      const records = rowsToRecords(entry.sheet.headers, entry.sheet.dataRows, entry.columns);
      const chunkSize = 300;
      for(let i=0; i<records.length; i+=chunkSize){
        const chunk = records.slice(i, i+chunkSize).map(dados => ({ dataset_id: datasetRow.id, dados }));
        const { error: recErr } = await state.client.from('records').insert(chunk);
        if(recErr) throw recErr;
        status.textContent = `Salvando aba "${entry.sheet.rotulo}"... ${Math.min(i+chunkSize, records.length)}/${records.length}`;
      }
    }

    status.textContent = 'Pronto! Montando o painel...';
    document.getElementById('previewSection').classList.add('hidden');
    await loadDashboard();
  }catch(e){
    console.error(e);
    status.textContent = 'Erro ao salvar: ' + (e.message || e);
    btn.disabled = false;
  }
}

// ----------------------------------------------------------------
// DASHBOARD
// ----------------------------------------------------------------
async function loadDashboard(){
  const { data: datasets } = await state.client.from('datasets').select('*').eq('project_id', state.project.id).order('created_at');
  state.datasets = datasets || [];

  const datasetIds = state.datasets.map(d => d.id);
  const { data: columns } = await state.client.from('dataset_columns').select('*').in('dataset_id', datasetIds);
  const { data: records } = await state.client.from('records').select('*').in('dataset_id', datasetIds);
  state.columns = columns || [];
  state.records = records || [];

  const sel = document.getElementById('filterDataset');
  sel.innerHTML = '<option value="">Todas</option>' + state.datasets.map(d => `<option value="${d.id}">${d.rotulo || d.nome_aba}</option>`).join('');
  sel.onchange = renderDashboard;

  const targetSel = document.getElementById('newRecordTarget');
  targetSel.innerHTML = state.datasets.map(d => `<option value="${d.id}">${d.rotulo || d.nome_aba}</option>`).join('');

  document.getElementById('dashboardSection').classList.remove('hidden');
  renderDashboard();
}

function mergedColumnsFor(datasetIds){
  const relevant = state.columns.filter(c => datasetIds.includes(c.dataset_id));
  const byName = {};
  relevant.forEach(c => { if(!byName[c.nome_coluna]) byName[c.nome_coluna] = c; });
  return Object.values(byName);
}

function renderDashboard(){
  const filterId = document.getElementById('filterDataset').value;
  const datasetIds = filterId ? [filterId] : state.datasets.map(d => d.id);
  const records = state.records.filter(r => datasetIds.includes(r.dataset_id));
  const columns = mergedColumnsFor(datasetIds);

  const analysis = computeAnalysis(columns, records);
  state.currentAnalysis = analysis;
  renderKpis(analysis);
  renderInsights(analysis);
  renderCharts(analysis);
  const hasData = analysis.total > 0;
  document.getElementById('btnPresent').disabled = !hasData;
  document.getElementById('btnExportPdf').disabled = !hasData;
  document.getElementById('btnExportPptx').disabled = !hasData;

  if(document.querySelector('.tab-nav-inline .tab-btn[data-tab="tabDados"]').classList.contains('active')) renderDataTable();
  if(document.querySelector('.tab-nav-inline .tab-btn[data-tab="tabComparativo"]').classList.contains('active')) renderComparativoTab();
}

// ----------------------------------------------------------------
// ABAS INTERNAS (Painel / Dados)
// ----------------------------------------------------------------
document.querySelector('.tab-nav-inline').addEventListener('click', e => {
  const btn = e.target.closest('.tab-btn');
  if(!btn) return;
  document.querySelectorAll('.tab-nav-inline .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#dashboardSection .tab-panel').forEach(p => p.classList.add('hidden'));
  btn.classList.add('active');
  document.getElementById(btn.dataset.tab).classList.remove('hidden');
  if(btn.dataset.tab === 'tabDados') renderDataTable();
  if(btn.dataset.tab === 'tabComparativo') renderComparativoTab();
});

// ----------------------------------------------------------------
// ABA DADOS — incluir, editar, excluir registros e colunas
// ----------------------------------------------------------------
function currentDatasetIds(){
  const filterId = document.getElementById('filterDataset').value;
  return filterId ? [filterId] : state.datasets.map(d => d.id);
}
function datasetLabel(id){
  const d = state.datasets.find(d => d.id === id);
  return d ? (d.rotulo || d.nome_aba) : '—';
}
function columnInputType(col){
  if(col.tipo_detectado === 'data') return 'date';
  if(col.tipo_detectado === 'numero' || col.tipo_detectado === 'moeda') return 'number';
  if(col.tipo_detectado === 'booleano') return 'checkbox';
  return 'text';
}

document.getElementById('btnToggleColumns').addEventListener('click', () => {
  document.getElementById('columnsBody').classList.toggle('hidden');
});

function renderColumnsPanel(){
  const datasetIds = currentDatasetIds();
  const columns = mergedColumnsFor(datasetIds);
  const table = document.getElementById('columnsTable');
  table.innerHTML = '<thead><tr><th>Coluna</th><th>Tipo</th><th>Papel</th><th></th></tr></thead><tbody>' +
    columns.map((c,i) => `
      <tr>
        <td>${c.nome_coluna}</td>
        <td><select data-i="${i}" data-field="tipo_detectado" class="col-field">${TIPO_OPTIONS.map(t=>`<option value="${t}" ${t===c.tipo_detectado?'selected':''}>${t}</option>`).join('')}</select></td>
        <td><select data-i="${i}" data-field="papel" class="col-field">${PAPEL_OPTIONS.map(t=>`<option value="${t}" ${t===c.papel?'selected':''}>${t}</option>`).join('')}</select></td>
        <td><button class="btn-link save-col" data-i="${i}">salvar</button></td>
      </tr>`).join('') + '</tbody>';

  table.querySelectorAll('.save-col').forEach(btn => {
    btn.addEventListener('click', async () => {
      const i = parseInt(btn.dataset.i, 10);
      const col = columns[i];
      const tipoSel = table.querySelector(`.col-field[data-i="${i}"][data-field="tipo_detectado"]`).value;
      const papelSel = table.querySelector(`.col-field[data-i="${i}"][data-field="papel"]`).value;
      btn.textContent = 'salvando...';
      const { error } = await state.client.from('dataset_columns')
        .update({ tipo_detectado: tipoSel, papel: papelSel, confirmado_por_usuario: true })
        .in('dataset_id', datasetIds).eq('nome_coluna', col.nome_coluna);
      if(error){ alert('Erro ao salvar: ' + error.message); btn.textContent = 'salvar'; return; }
      state.columns.forEach(sc => { if(datasetIds.includes(sc.dataset_id) && sc.nome_coluna === col.nome_coluna){ sc.tipo_detectado = tipoSel; sc.papel = papelSel; } });
      renderDashboard();
    });
  });
}

document.getElementById('dataSearch').addEventListener('input', e => {
  state.dataSearch = e.target.value.trim().toLowerCase();
  state.dataPage = 0;
  renderDataTable();
});
document.getElementById('btnDataPrev').addEventListener('click', () => { if(state.dataPage>0){ state.dataPage--; renderDataTable(); } });
document.getElementById('btnDataNext').addEventListener('click', () => { state.dataPage++; renderDataTable(); });

function renderDataTable(){
  renderColumnsPanel();
  const table = document.getElementById('dataTable');
  const datasetIds = currentDatasetIds();
  const columns = mergedColumnsFor(datasetIds);
  let rows = state.records.filter(r => datasetIds.includes(r.dataset_id));

  if(state.dataSearch){
    rows = rows.filter(r => Object.values(r.dados).join(' ').toLowerCase().includes(state.dataSearch) || datasetLabel(r.dataset_id).toLowerCase().includes(state.dataSearch));
  }

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / state.dataPageSize));
  state.dataPage = Math.min(state.dataPage, totalPages - 1);
  const start = state.dataPage * state.dataPageSize;
  const pageRows = rows.slice(start, start + state.dataPageSize);

  const thead = '<thead><tr><th>Planilha</th>' + columns.map(c => `<th>${c.nome_coluna}</th>`).join('') + '<th></th></tr></thead>';
  const tbody = '<tbody>' + pageRows.map(r => {
    const cells = columns.map(c => {
      let type = columnInputType(c);
      let val = r.dados[c.nome_coluna];
      // dados importados antes da detecção de hora existir ainda guardam a fração crua — formata na hora de exibir
      const isHoraCol = /hora|horário|horario|tempo/i.test(c.nome_coluna);
      if(isHoraCol && typeof val === 'number' && val >= 0 && val < 3){
        val = excelFracToHHMM(val);
        type = 'text'; // input numérico/data não aceita "HH:MM" como valor
      }
      if(type === 'checkbox'){
        return `<td><input type="checkbox" data-id="${r.id}" data-col="${c.nome_coluna}" class="edit-field" ${toBool(val)?'checked':''}></td>`;
      }
      return `<td><input type="${type}" data-id="${r.id}" data-col="${c.nome_coluna}" class="edit-field" value="${val ?? ''}"></td>`;
    }).join('');
    return `<tr><td>${datasetLabel(r.dataset_id)}</td>${cells}<td><button class="btn-del-row" data-id="${r.id}" title="Excluir registro">✕</button></td></tr>`;
  }).join('') + '</tbody>';

  table.innerHTML = thead + tbody;
  document.getElementById('dataRangeLabel').textContent = total ? `mostrando ${start+1}–${Math.min(start+state.dataPageSize,total)} de ${total} registros · ${columns.length} colunas` : 'nenhum registro encontrado';
  document.getElementById('dataPageLabel').textContent = `página ${state.dataPage+1} / ${totalPages}`;

  table.querySelectorAll('.edit-field').forEach(el => {
    const evt = el.type === 'checkbox' ? 'change' : 'blur';
    el.addEventListener(evt, () => updateRecordField(el.dataset.id, el.dataset.col, el.type === 'checkbox' ? el.checked : el.value));
  });
  table.querySelectorAll('.btn-del-row').forEach(btn => btn.addEventListener('click', () => deleteRecord(btn.dataset.id)));
}

async function updateRecordField(id, coluna, value){
  const rec = state.records.find(r => r.id === id);
  if(!rec) return;
  if(value === '' || value === null) delete rec.dados[coluna];
  else rec.dados[coluna] = value;
  if(state.client){
    try{ await state.client.from('records').update({ dados: rec.dados }).eq('id', id); }
    catch(e){ console.error('Erro ao salvar no Supabase', e); }
  }
  renderDashboard();
}

async function deleteRecord(id){
  if(!confirm('Excluir este registro?')) return;
  const rec = state.records.find(r => r.id === id);
  if(!rec) return;
  state.records = state.records.filter(r => r.id !== id);
  try{
    await state.client.from('records').delete().eq('id', id);
    await syncDatasetCount(rec.dataset_id);
  }catch(e){ console.error(e); }
  renderDashboard();
}

async function syncDatasetCount(datasetId){
  const count = state.records.filter(r => r.dataset_id === datasetId).length;
  const ds = state.datasets.find(d => d.id === datasetId);
  if(ds) ds.total_registros = count;
  try{ await state.client.from('datasets').update({ total_registros: count }).eq('id', datasetId); }
  catch(e){ console.error(e); }
}

document.getElementById('btnAddRecord').addEventListener('click', async () => {
  const datasetId = document.getElementById('newRecordTarget').value;
  if(!datasetId){ alert('Importe pelo menos uma planilha antes.'); return; }
  const columns = mergedColumnsFor([datasetId]);
  const dados = {};
  columns.forEach(c => { dados[c.nome_coluna] = ''; });
  const { data, error } = await state.client.from('records').insert({ dataset_id: datasetId, dados }).select().single();
  if(error){ alert('Erro ao criar registro: ' + error.message); return; }
  state.records.unshift(data);
  await syncDatasetCount(datasetId);
  state.dataSearch = ''; document.getElementById('dataSearch').value = ''; state.dataPage = 0;
  renderDashboard();
});

document.getElementById('btnAddColumn').addEventListener('click', async () => {
  const name = prompt('Nome da nova coluna:');
  if(!name) return;
  const clean = name.trim();
  if(!clean) return;
  const datasetIds = currentDatasetIds();
  const already = mergedColumnsFor(datasetIds).some(c => c.nome_coluna === clean);
  if(already){ alert('Já existe uma coluna com esse nome nesta seleção.'); return; }

  const payload = datasetIds.map(id => ({ dataset_id: id, nome_coluna: clean, tipo_detectado: 'texto', papel: 'ignorar', confianca: 1, confirmado_por_usuario: true, ordem: 999 }));
  const { data, error } = await state.client.from('dataset_columns').insert(payload).select();
  if(error){ alert('Erro ao criar coluna: ' + error.message); return; }
  state.columns = state.columns.concat(data);
  renderDataTable();
});

// ----------------------------------------------------------------
// ABA COMPARATIVO — mês a mês (qualquer coluna de data) e planilha x planilha
// ----------------------------------------------------------------
function fmtKpiValue(k){
  if(k.format === 'money') return fmtMoney(k.value);
  if(k.format === 'pct') return k.value.toFixed(0) + '%';
  return k.value.toLocaleString('pt-BR');
}
function deltaHtml(v1, v2){
  if(v1 === undefined || v2 === undefined) return '<span style="color:var(--text-dim);">—</span>';
  const diff = v2 - v1;
  if(Math.abs(diff) < 0.0001) return '<span style="color:var(--text-dim);">= estável</span>';
  const pct = v1 !== 0 ? (diff/v1*100) : (v2 !== 0 ? 100 : 0);
  const arrow = diff > 0 ? '▲' : '▼';
  const cor = diff > 0 ? 'var(--accent-warn)' : 'var(--accent-signal)';
  return `<span style="color:${cor};">${arrow} ${Math.abs(pct).toFixed(0)}%</span>`;
}

function renderComparativoTab(){
  const dateCols = [...new Set(state.columns.filter(c => c.papel === 'data').map(c => c.nome_coluna))];
  const sel = document.getElementById('monthDateSelect');
  const prev = sel.value;
  sel.innerHTML = dateCols.map(c => `<option value="${c}">${c}</option>`).join('');
  if(dateCols.length) sel.value = dateCols.includes(prev) ? prev : dateCols[0];
  sel.onchange = renderMonthTable;
  renderMonthTable();
  renderDatasetChecklist();
}

function renderMonthTable(){
  const table = document.getElementById('monthTable');
  const dateCol = document.getElementById('monthDateSelect').value;
  if(!dateCol){ table.innerHTML = '<tbody><tr><td style="color:var(--text-muted);">Nenhuma coluna de data detectada ainda.</td></tr></tbody>'; return; }

  const datasetIds = currentDatasetIds();
  const records = state.records.filter(r => datasetIds.includes(r.dataset_id));
  const columns = mergedColumnsFor(datasetIds);
  const metricas = columns.filter(c => c.papel === 'metrica');
  const boolCols = columns.filter(c => c.papel === 'dimensao' && c.tipo_detectado === 'booleano');

  const porMes = {};
  records.forEach(r => {
    const d = r.dados[dateCol];
    if(!d) return;
    const mes = String(d).slice(0,7);
    if(!/^\d{4}-\d{2}$/.test(mes)) return;
    if(!porMes[mes]) porMes[mes] = { total:0, metricSums:{}, boolTrue:{} };
    porMes[mes].total++;
    metricas.forEach(m => { const v = toNumber(r.dados[m.nome_coluna]); if(v!==null) porMes[mes].metricSums[m.nome_coluna] = (porMes[mes].metricSums[m.nome_coluna]||0) + v; });
    boolCols.forEach(b => { if(toBool(r.dados[b.nome_coluna])) porMes[mes].boolTrue[b.nome_coluna] = (porMes[mes].boolTrue[b.nome_coluna]||0) + 1; });
  });
  const meses = Object.keys(porMes).sort();

  if(!meses.length){
    table.innerHTML = '<tbody><tr><td style="color:var(--text-muted);">Nenhum registro com essa coluna de data preenchida.</td></tr></tbody>';
    return;
  }

  const headCols = ['Mês', 'Registros', ...metricas.map(m=>`Total de ${m.nome_coluna}`), ...boolCols.map(b=>`${b.nome_coluna} (%)`)];
  const thead = '<thead><tr>' + headCols.map(h=>`<th>${h}</th>`).join('') + '</tr></thead>';

  const tbody = '<tbody>' + meses.map((mes,i) => {
    const cur = porMes[mes], prevMes = i>0 ? porMes[meses[i-1]] : null;
    const cells = [`<td>${fmtMonthLabel(mes)}</td>`, `<td>${cur.total} ${deltaHtml(prevMes?.total, cur.total)}</td>`];
    metricas.forEach(m => {
      const v = cur.metricSums[m.nome_coluna] || 0, pv = prevMes ? (prevMes.metricSums[m.nome_coluna]||0) : undefined;
      cells.push(`<td>${fmtMoney(v)} ${deltaHtml(pv, v)}</td>`);
    });
    boolCols.forEach(b => {
      const pct = cur.total ? (cur.boolTrue[b.nome_coluna]||0)/cur.total*100 : 0;
      const prevPct = prevMes && prevMes.total ? (prevMes.boolTrue[b.nome_coluna]||0)/prevMes.total*100 : undefined;
      cells.push(`<td>${pct.toFixed(0)}% ${deltaHtml(prevPct, pct)}</td>`);
    });
    return '<tr>' + cells.join('') + '</tr>';
  }).join('') + '</tbody>';

  table.innerHTML = thead + tbody;
}

const MESES_PT_ORDEM = { JANEIRO:1,FEVEREIRO:2,'MARÇO':3,MARCO:3,ABRIL:4,MAIO:5,JUNHO:6,JULHO:7,AGOSTO:8,SETEMBRO:9,OUTUBRO:10,NOVEMBRO:11,DEZEMBRO:12 };
function periodSortKey(datasetId){
  const d = state.datasets.find(x => x.id === datasetId);
  if(!d) return 0;
  const label = (d.rotulo || d.nome_aba || '').toUpperCase();
  for(const [nome, num] of Object.entries(MESES_PT_ORDEM)){
    if(label.includes(nome)){
      const anoMatch = label.match(/(20\d{2})/);
      return (anoMatch ? parseInt(anoMatch[1],10) : 0) * 100 + num;
    }
  }
  return new Date(d.created_at || 0).getTime(); // sem mês reconhecível: cai pra ordem de importação
}
function sortedDatasetIds(){ return state.datasets.map(d=>d.id).sort((a,b) => periodSortKey(a) - periodSortKey(b)); }

function renderDatasetChecklist(){
  const box = document.getElementById('compareDatasetList');
  if(!state.datasets.length){ box.innerHTML = '<p style="color:var(--text-muted); font-size:13px;">Nenhuma planilha importada ainda.</p>'; return; }
  const ordered = sortedDatasetIds().map(id => state.datasets.find(d=>d.id===id));
  box.innerHTML = ordered.map(d => `
    <label style="display:flex; align-items:center; gap:8px; padding:6px 0; font-size:13px;">
      <input type="checkbox" class="cmp-check" value="${d.id}">
      ${d.rotulo || d.nome_aba} <span style="color:var(--text-dim); font-family:var(--font-mono); font-size:11px;">(${d.total_registros} registros)</span>
    </label>`).join('');
}

document.getElementById('btnCompareDatasets').addEventListener('click', () => {
  let ids = [...document.querySelectorAll('.cmp-check:checked')].map(c => c.value);
  if(ids.length < 2){ alert('Selecione pelo menos 2 planilhas pra comparar.'); return; }
  ids = ids.sort((a,b) => periodSortKey(a) - periodSortKey(b)); // sempre do mês mais antigo pro mais recente
  const analyses = ids.map(id => ({
    id, label: datasetLabel(id),
    analysis: computeAnalysis(mergedColumnsFor([id]), state.records.filter(r => r.dataset_id === id))
  }));
  renderCompareTable(analyses);
});

function renderCompareTable(analyses){
  const labels = [];
  analyses.forEach(a => a.analysis.kpis.forEach(k => { if(!labels.includes(k.label)) labels.push(k.label); }));

  const thead = '<thead><tr><th>Métrica</th>' + analyses.map(a=>`<th>${a.label}</th>`).join('') + (analyses.length===2 ? '<th>Variação</th>' : '') + '</tr></thead>';
  const tbody = '<tbody>' + labels.map(label => {
    const kpis = analyses.map(a => a.analysis.kpis.find(k => k.label === label));
    const cells = kpis.map(k => `<td>${k ? fmtKpiValue(k) : '—'}</td>`).join('');
    const delta = analyses.length === 2 ? `<td>${deltaHtml(kpis[0]?.value, kpis[1]?.value)}</td>` : '';
    return `<tr><td>${label}</td>${cells}${delta}</tr>`;
  }).join('') + '</tbody>';

  document.getElementById('compareTable').innerHTML = thead + tbody;
}

function renderKpis(a){
  const strip = document.getElementById('kpiStrip');
  strip.innerHTML = a.kpis.map(k => `
    <div class="kpi-card">
      <span class="kpi-label">${k.label}</span>
      <span class="kpi-value">${k.format==='money' ? fmtMoney(k.value) : k.format==='pct' ? k.value.toFixed(0)+'%' : k.value.toLocaleString('pt-BR')}</span>
    </div>`).join('');
}

function renderInsights(a){
  const list = document.getElementById('insightsList');
  const insights = generateInsights(a);
  list.innerHTML = insights.length ? insights.map(t => `<li>${t}</li>`).join('') : '<li class="insights-empty">Sem dados suficientes ainda para gerar insights.</li>';
}

function destroyCharts(){ Object.values(state.charts).forEach(c => c.destroy()); state.charts = {}; }

function hiddenWidgets(){ return (state.project.tema && state.project.tema.widgetsOcultos) || []; }

function renderCharts(a){
  destroyCharts();
  const grid = document.getElementById('chartsGrid');
  grid.innerHTML = '';
  let chartIdx = 0;
  const hidden = hiddenWidgets();

  a.rankings.forEach(rk => {
    const key = `ranking:${rk.coluna}`;
    if(hidden.includes(key)) return;
    const id = `chart${chartIdx++}`;
    // poucas categorias fica melhor em pizza; muitas, em barra horizontal
    const usePizza = rk.dados.length <= 6;
    grid.insertAdjacentHTML('beforeend', panelHtml(id, `Top "${rk.coluna}"`, usePizza?'distribuição':'ranking por nº de registros', false, key));
    if(!usePizza){
      state.charts[id] = new Chart(document.getElementById(id), {
        type:'bar',
        data:{ labels: rk.dados.map(r=>r.label), datasets:[{ data: rk.dados.map(r=>r.count), backgroundColor: rk.dados.map((_,i)=>PALETTE.bars[i % PALETTE.bars.length]), borderRadius:4 }] },
        options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}, datalabels:{ display:true, color:PALETTE.text, anchor:'end', align:'end', font:{size:11} }}, scales:{ x:{grid:{color:PALETTE.grid}}, y:{grid:{display:false}} } }
      });
    }else{
      state.charts[id] = new Chart(document.getElementById(id), {
        type:'pie',
        data:{ labels: rk.dados.map(r=>r.label), datasets:[{ data: rk.dados.map(r=>r.count), backgroundColor: PALETTE.bars, borderColor:'#12181F', borderWidth:2 }] },
        options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom', labels:{boxWidth:10,padding:8,font:{size:10.5}}}, datalabels: LABEL_ON_DARK} }
      });
    }
  });

  a.donuts.forEach(dn => {
    const key = `donut:${dn.coluna}`;
    if(hidden.includes(key)) return;
    const id = `chart${chartIdx++}`;
    grid.insertAdjacentHTML('beforeend', panelHtml(id, `"${dn.coluna}"`, 'sim vs. não', false, key));
    state.charts[id] = new Chart(document.getElementById(id), {
      type:'doughnut',
      data:{ labels: dn.dados.map(d=>d.label), datasets:[{ data: dn.dados.map(d=>d.count), backgroundColor:[PALETTE.signal, PALETTE.alert], borderColor:'#12181F', borderWidth:2 }] },
      options:{ responsive:true, maintainAspectRatio:false, cutout:'62%', plugins:{legend:{position:'bottom', labels:{boxWidth:10,padding:10}}, datalabels: LABEL_ON_DARK} }
    });
  });

  a.tendencias.forEach(tend => {
    const key = `line:${tend.coluna}`;
    if(hidden.includes(key)) return;
    const id = `chart${chartIdx++}`;
    grid.insertAdjacentHTML('beforeend', panelHtml(id, `Tendência — "${tend.coluna}"`, 'área, por mês', true, key));
    state.charts[id] = new Chart(document.getElementById(id), {
      type:'line',
      data:{ labels: tend.dados.map(t=>t.label), datasets:[{ data: tend.dados.map(t=>t.count), borderColor:PALETTE.alert, backgroundColor:'rgba(228,72,60,.18)', fill:true, tension:.3, pointRadius:3, pointBackgroundColor:PALETTE.alert }] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ x:{grid:{display:false}}, y:{grid:{color:PALETTE.grid}} } }
    });
  });

  // radar comparando todas as métricas (3+) numa mesma escala normalizada
  const radarKey = 'radar:metricas';
  if(a.metricas.length >= 3 && !hidden.includes(radarKey)){
    const datasetIdsR = currentDatasetIds();
    const recs = state.records.filter(r => datasetIdsR.includes(r.dataset_id));
    const meds = a.metricas.map(m => {
      const vals = recs.map(r=>toNumber(r.dados[m.nome_coluna])).filter(v=>v!==null);
      return vals.length ? vals.reduce((s,v)=>s+v,0)/vals.length : 0;
    });
    const max = Math.max(...meds, 1);
    const id = `chart${chartIdx++}`;
    grid.insertAdjacentHTML('beforeend', panelHtml(id, 'Comparativo de métricas', 'radar, escala normalizada', true, radarKey));
    state.charts[id] = new Chart(document.getElementById(id), {
      type:'radar',
      data:{ labels: a.metricas.map(m=>m.nome_coluna), datasets:[{ label:'Média', data: meds.map(v=>Math.round(v/max*100)), borderColor:PALETTE.signal, backgroundColor:'rgba(52,195,181,.2)', pointBackgroundColor:PALETTE.signal }] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ r:{ grid:{color:PALETTE.grid}, angleLines:{color:PALETTE.grid}, pointLabels:{color:PALETTE.text, font:{size:10.5}}, ticks:{display:false} } } }
    });
  }

  // dispersão entre as duas primeiras métricas — relação entre elas
  const scatterKey = 'scatter:metricas';
  if(a.metricas.length >= 2 && !hidden.includes(scatterKey)){
    const [mx, my] = a.metricas;
    const datasetIds = currentDatasetIds();
    const pts = state.records.filter(r => datasetIds.includes(r.dataset_id)).map(r => ({ x: toNumber(r.dados[mx.nome_coluna]), y: toNumber(r.dados[my.nome_coluna]) })).filter(p => p.x!==null && p.y!==null);
    if(pts.length >= 3){
      const id = `chart${chartIdx++}`;
      grid.insertAdjacentHTML('beforeend', panelHtml(id, `"${mx.nome_coluna}" × "${my.nome_coluna}"`, 'dispersão', true, scatterKey));
      state.charts[id] = new Chart(document.getElementById(id), {
        type:'scatter',
        data:{ datasets:[{ data: pts, backgroundColor: PALETTE.warn }] },
        options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ x:{ title:{display:true,text:mx.nome_coluna,color:PALETTE.text}, grid:{color:PALETTE.grid} }, y:{ title:{display:true,text:my.nome_coluna,color:PALETTE.text}, grid:{color:PALETTE.grid} } } }
      });
    }
  }

  // bolha: 3ª métrica define o tamanho de cada ponto — relação entre 3 métricas de uma vez
  const bubbleKey = 'bubble:metricas';
  if(a.metricas.length >= 3 && !hidden.includes(bubbleKey)){
    const [mx, my, mr] = a.metricas;
    const datasetIdsB = currentDatasetIds();
    const rVals = state.records.filter(r => datasetIdsB.includes(r.dataset_id)).map(r => toNumber(r.dados[mr.nome_coluna])).filter(v=>v!==null);
    const rMax = Math.max(...rVals, 1);
    const bpts = state.records.filter(r => datasetIdsB.includes(r.dataset_id)).map(r => {
      const x = toNumber(r.dados[mx.nome_coluna]), y = toNumber(r.dados[my.nome_coluna]), rv = toNumber(r.dados[mr.nome_coluna]);
      return (x!==null && y!==null && rv!==null) ? { x, y, r: 4 + (rv/rMax)*16 } : null;
    }).filter(Boolean);
    if(bpts.length >= 3){
      const id = `chart${chartIdx++}`;
      grid.insertAdjacentHTML('beforeend', panelHtml(id, `"${mx.nome_coluna}" × "${my.nome_coluna}"`, `bolha · tamanho = "${mr.nome_coluna}"`, true, bubbleKey));
      state.charts[id] = new Chart(document.getElementById(id), {
        type:'bubble',
        data:{ datasets:[{ data: bpts, backgroundColor: 'rgba(52,195,181,.55)', borderColor: PALETTE.signal }] },
        options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ x:{ title:{display:true,text:mx.nome_coluna,color:PALETTE.text}, grid:{color:PALETTE.grid} }, y:{ title:{display:true,text:my.nome_coluna,color:PALETTE.text}, grid:{color:PALETTE.grid} } } }
      });
    }
  }

  if(hidden.length){
    grid.insertAdjacentHTML('beforeend', `<div class="panel panel-wide" style="text-align:center;"><button class="btn-link" id="btnShowAllWidgets">Mostrar ${hidden.length} widget(s) oculto(s)</button></div>`);
    document.getElementById('btnShowAllWidgets').addEventListener('click', () => saveHiddenWidgets([]));
  }

  if(!chartIdx && !hidden.length){
    grid.innerHTML = '<div class="panel panel-wide"><p style="color:var(--text-muted); font-size:13px;">Nenhuma coluna foi classificada como categoria, indicador ou data — revise os papéis na aba Dados se algo parece errado.</p></div>';
  }

  grid.querySelectorAll('.btn-hide-widget').forEach(btn => {
    btn.addEventListener('click', () => saveHiddenWidgets([...hiddenWidgets(), btn.dataset.key]));
  });
}

async function saveHiddenWidgets(list){
  const tema = { ...(state.project.tema || {}), widgetsOcultos: list };
  const { data, error } = await state.client.from('projects').update({ tema }).eq('id', state.project.id).select().single();
  if(error){ console.error(error); return; }
  state.project = data;
  renderDashboard();
}

function panelHtml(id, title, hint, wide, hideKey){
  const hideBtn = hideKey ? `<button class="btn-hide-widget" data-key="${hideKey}" title="Ocultar este gráfico">✕</button>` : '';
  return `<div class="panel ${wide?'panel-wide':''}"><div class="panel-head"><div><span class="panel-title">${title}</span> <span class="panel-hint">${hint}</span></div>${hideBtn}</div><div class="panel-body"><canvas id="${id}"></canvas></div></div>`;
}

// ----------------------------------------------------------------
// APRESENTAÇÃO
// ----------------------------------------------------------------
const presentMode = document.getElementById('presentMode');
const slideContainer = document.getElementById('slideContainer');

document.getElementById('btnPresent').addEventListener('click', () => {
  renderSlides(state.currentAnalysis);
  presentMode.classList.remove('hidden');
});
document.getElementById('btnExitPresent').addEventListener('click', () => presentMode.classList.add('hidden'));
document.getElementById('btnPrevSlide').addEventListener('click', () => { if(state.currentSlide>0){ state.currentSlide--; updateSlideVisibility(); } });
document.getElementById('btnNextSlide').addEventListener('click', () => { if(state.currentSlide < state.slideDefs.length-1){ state.currentSlide++; updateSlideVisibility(); } });
document.addEventListener('keydown', e => {
  if(presentMode.classList.contains('hidden')) return;
  if(e.key === 'Escape') presentMode.classList.add('hidden');
  if(e.key === 'ArrowRight') document.getElementById('btnNextSlide').click();
  if(e.key === 'ArrowLeft') document.getElementById('btnPrevSlide').click();
});

function renderSlides(a){
  state.slideDefs = buildSlideDefs(a);
  slideContainer.innerHTML = '';
  Object.values(state.slideCharts).forEach(c => c.destroy());
  state.slideCharts = {};

  state.slideDefs.forEach((def, idx) => {
    const slide = document.createElement('div');
    slide.className = 'slide';

    if(def.type === 'title'){
      const logo = state.project.tema?.logoUrl ? `<img src="${state.project.tema.logoUrl}" style="height:40px; object-fit:contain; margin-bottom:16px; border-radius:6px;">` : '';
      slide.innerHTML = `
        ${logo}
        <span class="slide-eyebrow">${state.project.nome}${state.project.area ? ' · '+state.project.area : ''}</span>
        <h2>Panorama geral</h2>
        <p style="color:var(--text-muted); font-size:15px;">${a.total.toLocaleString('pt-BR')} registros analisados · gerado em ${new Date().toLocaleDateString('pt-BR')}</p>`;
    }else if(def.type === 'kpis'){
      slide.innerHTML = `
        <span class="slide-eyebrow">indicadores principais</span>
        <h2>Panorama numérico</h2>
        <div class="slide-kpis">${a.kpis.slice(0,4).map(k => `
          <div><div class="slide-kpi-num">${k.format==='money'?fmtMoney(k.value):k.format==='pct'?k.value.toFixed(0)+'%':k.value.toLocaleString('pt-BR')}</div><div class="slide-kpi-label">${k.label}</div></div>`).join('')}
        </div>`;
    }else if(def.type === 'insights'){
      slide.innerHTML = `
        <span class="slide-eyebrow">análise automática</span>
        <h2>Insights</h2>
        <ul class="slide-list">${def.insights.map(t => `<li>${t}</li>`).join('')}</ul>`;
    }else if(def.type === 'closing'){
      slide.innerHTML = `
        <span class="slide-eyebrow">síntese</span>
        <h2>Principais conclusões</h2>
        <ul class="slide-list">${def.insights.slice(0,5).map(t => `<li>${t}</li>`).join('') || '<li>Sem dados suficientes.</li>'}</ul>`;
    }else{
      slide.innerHTML = `
        <span class="slide-eyebrow">análise</span>
        <h2>${def.title}</h2>
        <div class="slide-chart-wrap"><canvas id="slideCanvas${idx}"></canvas></div>`;
    }
    slideContainer.appendChild(slide);
  });

  state.slideDefs.forEach((def, idx) => {
    const canvas = document.getElementById(`slideCanvas${idx}`);
    if(!canvas) return;
    if(def.type === 'ranking') state.slideCharts[idx] = makeSlideChart('bar-h', def.data, canvas);
    if(def.type === 'donut') state.slideCharts[idx] = makeSlideChart('donut', def.data, canvas, [PALETTE.signal, PALETTE.alert]);
    if(def.type === 'line') state.slideCharts[idx] = makeSlideChart('line', def.data, canvas);
  });

  state.currentSlide = 0;
  updateSlideVisibility();
}

function makeSlideChart(kind, data, canvas, colors){
  const labels = data.map(d => d.label), values = data.map(d => d.count);
  if(kind === 'bar-h'){
    return new Chart(canvas, { type:'bar', data:{ labels, datasets:[{ data:values, backgroundColor: labels.map((_,i)=>PALETTE.bars[i % PALETTE.bars.length]), borderRadius:4 }] },
      options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}, datalabels:{ display:true, color:PALETTE.text, anchor:'end', align:'end' }}, scales:{ x:{grid:{color:PALETTE.grid}}, y:{grid:{display:false}} } } });
  }
  if(kind === 'donut'){
    return new Chart(canvas, { type:'doughnut', data:{ labels, datasets:[{ data:values, backgroundColor: colors || PALETTE.bars, borderColor:'#12181F', borderWidth:2 }] },
      options:{ responsive:true, maintainAspectRatio:false, cutout:'62%', plugins:{legend:{position:'bottom', labels:{boxWidth:10,padding:10}}, datalabels: LABEL_ON_DARK} } });
  }
  if(kind === 'line'){
    return new Chart(canvas, { type:'line', data:{ labels, datasets:[{ data:values, borderColor:PALETTE.alert, backgroundColor:'rgba(228,72,60,.12)', fill:true, tension:.3, pointRadius:3, pointBackgroundColor:PALETTE.alert }] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ x:{grid:{display:false}}, y:{grid:{color:PALETTE.grid}} } } });
  }
}

function updateSlideVisibility(){
  const slides = slideContainer.querySelectorAll('.slide');
  slides.forEach((s,i) => s.classList.toggle('active', i===state.currentSlide));
  document.getElementById('slideCounter').textContent = `${state.currentSlide+1} / ${slides.length}`;
}

// ----------------------------------------------------------------
// EXPORT PDF (impressão do navegador)
// ----------------------------------------------------------------
document.getElementById('btnExportPdf').addEventListener('click', () => {
  const a = state.currentAnalysis;
  document.getElementById('reportPrintArea').innerHTML = buildReportHTML(a);
  document.body.classList.add('printing-report');
  window.print();
});
window.addEventListener('afterprint', () => document.body.classList.remove('printing-report'));

function buildReportHTML(a){
  const insights = generateInsights(a);
  const logo = state.project.tema?.logoUrl ? `<img src="${state.project.tema.logoUrl}" style="height:36px; object-fit:contain; margin-bottom:10px;">` : '';
  return `
    ${logo}
    <h1>${state.project.nome}</h1>
    <p class="rp-sub">${a.total.toLocaleString('pt-BR')} registros · gerado em ${new Date().toLocaleString('pt-BR')}</p>
    <h2>Resumo executivo</h2>
    <ul>${a.kpis.map(k => `<li>${k.label}: ${k.format==='money'?fmtMoney(k.value):k.format==='pct'?k.value.toFixed(0)+'%':k.value.toLocaleString('pt-BR')}</li>`).join('')}</ul>
    <h2>Insights automáticos</h2>
    <ul>${insights.map(t=>`<li>${t}</li>`).join('') || '<li>Sem dados suficientes.</li>'}</ul>
    ${a.rankings.map(rk => `
      <h2>Top "${rk.coluna}"</h2>
      <table><thead><tr><th>Valor</th><th class="num">Qtd.</th></tr></thead>
      <tbody>${rk.dados.map(r=>`<tr><td>${r.label}</td><td class="num">${r.count}</td></tr>`).join('')}</tbody></table>`).join('')}
    ${a.tendencias.map(tend => `
      <h2>Tendência — "${tend.coluna}"</h2>
      <table><thead><tr><th>Período</th><th class="num">Registros</th></tr></thead>
      <tbody>${tend.dados.map(t=>`<tr><td>${t.label}</td><td class="num">${t.count}</td></tr>`).join('')}</tbody></table>`).join('')}
  `;
}

// ----------------------------------------------------------------
// EXPORT PPTX
// ----------------------------------------------------------------
document.getElementById('btnExportPptx').addEventListener('click', () => exportPptx(state.currentAnalysis));

async function exportPptx(a){
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name:'NEXO', width:10, height:5.625 });
  pptx.layout = 'NEXO';
  const BG='0A0E13', TEXT='ECF1F6', MUTED='7C8794', ALERT='E4483C', SIGNAL=PALETTE.signal.replace('#',''), WARN='F0A93B';

  function baseSlide(){ const s = pptx.addSlide(); s.background = { color: BG }; return s; }
  function eyebrow(s, text){ s.addText(text.toUpperCase(), { x:0.5, y:0.35, w:9, h:0.35, fontSize:11, color:WARN, fontFace:'Consolas', charSpacing:2 }); }

  let s = baseSlide();
  eyebrow(s, state.project.area || 'painel');
  if(state.project.tema?.logoUrl){
    try{ s.addImage({ path: state.project.tema.logoUrl, x:0.5, y:1.15, w:0.9, h:0.9, sizing:{ type:'contain', w:0.9, h:0.9 } }); }catch(e){ console.warn('logo pptx falhou', e); }
  }
  s.addText(state.project.nome, { x:0.5, y:1.9, w:9, h:1, fontSize:32, bold:true, color:TEXT, fontFace:'Arial' });
  s.addText(`${a.total.toLocaleString('pt-BR')} registros · gerado em ${new Date().toLocaleDateString('pt-BR')}`, { x:0.5, y:2.9, w:9, h:0.5, fontSize:14, color:MUTED, fontFace:'Arial' });

  s = baseSlide();
  eyebrow(s, 'indicadores principais');
  s.addText('Panorama numérico', { x:0.5, y:0.75, w:9, h:0.6, fontSize:26, bold:true, color:TEXT, fontFace:'Arial' });
  a.kpis.slice(0,3).forEach((k,i) => {
    const x = 0.5 + i*3.1;
    const val = k.format==='money'?fmtMoney(k.value):k.format==='pct'?k.value.toFixed(0)+'%':k.value.toLocaleString('pt-BR');
    s.addText(val, { x, y:1.8, w:2.9, h:0.9, fontSize:30, bold:true, color:TEXT, fontFace:'Arial' });
    s.addText(k.label, { x, y:2.65, w:2.9, h:0.5, fontSize:12, color:MUTED, fontFace:'Arial' });
  });

  const insights = generateInsights(a);
  if(insights.length){
    s = baseSlide();
    eyebrow(s, 'análise automática');
    s.addText('Insights', { x:0.5, y:0.75, w:9, h:0.6, fontSize:26, bold:true, color:TEXT, fontFace:'Arial' });
    s.addText(insights.map(t => ({ text:t, options:{ bullet:true, breakLine:true, color:TEXT, fontSize:14.5 } })), { x:0.5, y:1.6, w:9, h:3.6, fontFace:'Arial' });
  }

  a.rankings.forEach(rk => {
    s = baseSlide();
    eyebrow(s, 'ranking');
    s.addText(`Top "${rk.coluna}"`, { x:0.5, y:0.75, w:9, h:0.6, fontSize:24, bold:true, color:TEXT, fontFace:'Arial' });
    s.addChart(pptx.ChartType.bar, [{ name: rk.coluna, labels: rk.dados.map(r=>r.label), values: rk.dados.map(r=>r.count) }],
      { x:0.5, y:1.5, w:9, h:3.7, barDir:'bar', chartColors:[SIGNAL], catAxisLabelColor:TEXT, valAxisLabelColor:TEXT, catAxisLineColor:MUTED, valAxisLineColor:MUTED, showLegend:false });
  });

  a.donuts.forEach(dn => {
    s = baseSlide();
    eyebrow(s, 'análise');
    s.addText(`"${dn.coluna}"`, { x:0.5, y:0.75, w:9, h:0.6, fontSize:24, bold:true, color:TEXT, fontFace:'Arial' });
    s.addChart(pptx.ChartType.doughnut, [{ name: dn.coluna, labels: dn.dados.map(d=>d.label), values: dn.dados.map(d=>d.count) }],
      { x:1.6, y:1.3, w:6.8, h:3.6, chartColors:[SIGNAL, ALERT], showLegend:true, legendColor:TEXT, legendPos:'r' });
  });

  a.tendencias.forEach(tend => {
    s = baseSlide();
    eyebrow(s, 'análise');
    s.addText(`Tendência — "${tend.coluna}"`, { x:0.5, y:0.75, w:9, h:0.6, fontSize:24, bold:true, color:TEXT, fontFace:'Arial' });
    s.addChart(pptx.ChartType.line, [{ name:'Registros', labels: tend.dados.map(t=>t.label), values: tend.dados.map(t=>t.count) }],
      { x:0.5, y:1.5, w:9, h:3.7, chartColors:[ALERT], catAxisLabelColor:TEXT, valAxisLabelColor:TEXT, catAxisLineColor:MUTED, valAxisLineColor:MUTED, showLegend:false, lineDataSymbol:'circle' });
  });

  s = baseSlide();
  eyebrow(s, 'síntese');
  s.addText('Principais conclusões', { x:0.5, y:0.75, w:9, h:0.6, fontSize:26, bold:true, color:TEXT, fontFace:'Arial' });
  s.addText(insights.slice(0,5).map(t => ({ text:t, options:{ bullet:true, breakLine:true, color:TEXT, fontSize:16 } })), { x:0.5, y:1.7, w:9, h:2.8, fontFace:'Arial' });

  pptx.writeFile({ fileName: `${state.project.nome.replace(/\s+/g,'-').toLowerCase()}-${new Date().toISOString().slice(0,10)}.pptx` });
}

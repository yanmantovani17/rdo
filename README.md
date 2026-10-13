# RDO – Relatório Diário de Obra

App de celular para preencher o RDO diário e gerar a planilha pronta no modelo da obra.

**Abrir / instalar:** https://yanmantovani17.github.io/rdo/

No iPhone: abra no Safari → Compartilhar → "Adicionar à Tela de Início".

Os RDOs e fotos ficam guardados no próprio celular (use "Exportar backup" na aba Obra).

# FVS – Fichas de Verificação de Serviço

App de celular para preencher as 67 FVS da Libercon, controlar os reparos (verificação 1 e 2) e gerar o PDF no modelo da ficha.

**Abrir / instalar:** https://yanmantovani17.github.io/rdo/fvs/

No iPhone: abra no Safari → Compartilhar → "Adicionar à Tela de Início".

## Google Sheets / Power BI
O script `google-sheets/Codigo.gs` vai na planilha (Extensões → Apps Script) e recebe os RDOs enviados pelo app nas abas Dias, Producao, Efetivo, Equipamentos e Clima.
O script `google-sheets/FVS.gs` vai numa planilha separada e recebe as FVS enviadas pelo app de FVS nas abas FVS, Itens e Indicadores (% de aprovação por processo e por mês).

# Controle de Material – previsto × real

App de celular para controlar a perda de material: a engenharia cadastra o projeto (material, unidade, código da peça, nº de peças, quantidade por peça) e o campo lança o que foi executado e o que chegou (NF, caminhão, quantidade). Mostra a perda por material, por tipo de peça e por mês.

**Abrir / instalar:** https://yanmantovani17.github.io/rdo/material/

O script `google-sheets/Materiais.gs` vai na planilha de materiais (Extensões → Apps Script) e grava as abas Indicadores, Lancamentos, Entregas, Pecas, Projeto, Materiais e Usuarios (com a coluna Perfil: Engenharia ou Campo).

**Planilha de materiais:** https://docs.google.com/spreadsheets/d/1WPcWJEqgLLRL6I76wyO0XKB4qdPJqqbEG7LENq7842E/edit

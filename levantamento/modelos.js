// Disciplinas, serviços sugeridos (com unidade e método de execução) e checklist geral do levantamento.
// Para acrescentar um serviço: { s: 'nome do serviço', u: 'unidade', c: 'como executar' }
window.LEV_DISC = [
  { id: 'prel', n: 'Serviços preliminares e canteiro', t: [
    { s: 'Mobilização e instalação do canteiro', u: 'vb', c: 'Definir área de apoio, ponto de energia e água provisórios, banheiro e local de guarda de material e ferramentas.' },
    { s: 'Proteção de pisos, esquadrias e móveis', u: 'm²', c: 'Forrar pisos com papelão ondulado ou lona plástica fixada com fita crepe; envelopar esquadrias e móveis que ficarem no local.' },
    { s: 'Tapume / isolamento da área', u: 'm', c: 'Isolar a frente de serviço com tapume ou tela tapume e sinalização, garantindo passagem segura dos moradores.' },
    { s: 'Caçamba de entulho', u: 'un', c: 'Locar caçamba com CTR; verificar se a rua permite e se precisa de autorização da prefeitura ou do condomínio.' },
    { s: 'Andaime / plataforma de trabalho', u: 'm²', c: 'Montar andaime fachadeiro ou tubular com guarda-corpo, rodapé e piso completo; ancorar à estrutura e liberar por responsável.' },
    { s: 'Escoramento provisório', u: 'un', c: 'Escorar com escoras metálicas reguláveis apoiadas sobre base firme (prancha), antes de qualquer demolição ou abertura.' }
  ]},
  { id: 'dem', n: 'Demolições e retiradas', t: [
    { s: 'Demolição de alvenaria', u: 'm²', c: 'Demolir de cima para baixo com marreta e talhadeira, sem impacto em lajes; confirmar antes que a parede não é portante.' },
    { s: 'Remoção de revestimento cerâmico de parede', u: 'm²', c: 'Retirar peças e argamassa de assentamento até o emboço sadio; descartar o emboço que estiver oco ao som da percussão.' },
    { s: 'Remoção de piso cerâmico', u: 'm²', c: 'Retirar piso e argamassa colante; avaliar o contrapiso (som cavo, fissuras, nível) antes de decidir se fica.' },
    { s: 'Demolição de contrapiso', u: 'm²', c: 'Demolir com rompedor leve, protegendo tubulações embutidas; recolher entulho em sacos.' },
    { s: 'Remoção de telhas', u: 'm²', c: 'Retirar telhas de cima para baixo com linha de vida; se forem de fibrocimento antigo, tratar como possível amianto (sem quebrar ou cortar).' },
    { s: 'Remoção de forro', u: 'm²', c: 'Desmontar forro e estrutura de sustentação; desligar e isolar circuitos de iluminação antes.' },
    { s: 'Retirada de esquadria', u: 'un', c: 'Remover folha, batente e contramarco com cuidado para não danificar a alvenaria; guardar se for reaproveitada.' },
    { s: 'Retirada de louças e metais', u: 'un', c: 'Fechar registros, retirar a peça e tamponar os pontos de água e esgoto.' },
    { s: 'Remoção de entulho', u: 'm³', c: 'Ensacar e transportar até a caçamba; medir em volume solto.' }
  ]},
  { id: 'est', n: 'Estrutura e reforço', t: [
    { s: 'Tratamento de armadura exposta', u: 'm²', c: 'Escarificar o concreto solto até 2 cm atrás da barra, limpar com escova de aço, aplicar inibidor de corrosão e recompor com argamassa polimérica ou graute; repor barra se perda de seção > 10%.' },
    { s: 'Tratamento de fissura estrutural (injeção)', u: 'm', c: 'Monitorar com selo de gesso antes; se estabilizada, abrir em V, instalar bicos e injetar resina epóxi de baixa viscosidade.' },
    { s: 'Reforço de viga / pilar (encamisamento)', u: 'm³', c: 'Conforme projeto estrutural: apicoar, armar, aplicar ponte de aderência e concretar com graute; não executar sem projeto e ART.' },
    { s: 'Verga / viga nova', u: 'm', c: 'Executar em concreto armado com apoio mínimo de 30 cm de cada lado do vão; escorar até a cura.' },
    { s: 'Recuperação de laje', u: 'm²', c: 'Escorar, retirar material degradado, tratar armaduras e recompor; avaliar capacidade antes de acrescentar carga.' },
    { s: 'Prospecção / janela de inspeção', u: 'un', c: 'Abrir pequena janela para verificar espessura, armadura e corrosão; registrar com foto e trena e fechar com argamassa polimérica.' }
  ]},
  { id: 'alv', n: 'Alvenaria e vedação', t: [
    { s: 'Alvenaria de bloco cerâmico', u: 'm²', c: 'Assentar com argamassa, amarrando nas paredes existentes com tela ou ferro-cabelo a cada 2 fiadas; encunhar após 7 dias.' },
    { s: 'Fechamento de vão', u: 'm²', c: 'Fechar com bloco igual ao existente, amarrado às laterais; prever verga se ficar abertura.' },
    { s: 'Verga e contraverga', u: 'm', c: 'Executar em concreto armado ou canaleta, com transpasse de 30 cm para cada lado da abertura.' },
    { s: 'Tratamento de trinca em alvenaria', u: 'm', c: 'Abrir a trinca em V, limpar, aplicar selante flexível e tela de poliéster na faixa de 20 cm; refazer reboco e pintura elástica.' },
    { s: 'Parede em drywall', u: 'm²', c: 'Montar guias e montantes a cada 60 cm, chapa adequada ao ambiente (RU em área molhada), tratar juntas com fita e massa.' }
  ]},
  { id: 'imp', n: 'Impermeabilização', t: [
    { s: 'Regularização com caimento', u: 'm²', c: 'Executar argamassa de regularização com caimento mínimo de 1% para os ralos, cantos arredondados (meia-cana).' },
    { s: 'Manta asfáltica', u: 'm²', c: 'Primer + manta asfáltica 4 mm com sobreposição de 10 cm, subindo 30 cm nas paredes; teste de estanqueidade 72 h e proteção mecânica.' },
    { s: 'Membrana acrílica / poliuretânica', u: 'm²', c: 'Aplicar em demãos cruzadas com tela de poliéster estruturante, conforme consumo do fabricante.' },
    { s: 'Argamassa polimérica (área molhada)', u: 'm²', c: 'Aplicar 3 demãos cruzadas em piso e parede até 30 cm (box até 1,80 m), com tela nos cantos e ralos.' },
    { s: 'Tratamento de ralo / passagem', u: 'un', c: 'Reforçar com tela e mastique ou peça pré-moldada de manta em volta de ralos, tubos e ancoragens.' },
    { s: 'Tratamento de umidade ascendente', u: 'm', c: 'Remover reboco até 1 m, aplicar barreira química por injeção na base da parede e refazer com argamassa impermeável.' },
    { s: 'Teste de estanqueidade', u: 'vb', c: 'Lâmina d’água de 5 cm por 72 h, vistoriando o andar de baixo antes da proteção mecânica.' }
  ]},
  { id: 'cob', n: 'Cobertura', t: [
    { s: 'Troca de telhas', u: 'm²', c: 'Substituir telhas quebradas ou porosas, conferindo inclinação mínima do fabricante e sobreposições.' },
    { s: 'Revisão / troca de madeiramento', u: 'm²', c: 'Verificar cupim, apodrecimento e flechas; trocar peças comprometidas e tratar com imunizante.' },
    { s: 'Calha', u: 'm', c: 'Calha em chapa galvanizada ou alumínio com caimento de 0,5%, dimensionada pela área de contribuição.' },
    { s: 'Rufo / contrarrufo', u: 'm', c: 'Instalar rufo embutido na alvenaria com selante PU, garantindo a sobreposição sobre a telha.' },
    { s: 'Cumeeira', u: 'm', c: 'Assentar cumeeiras com argamassa ou fixação mecânica conforme o tipo de telha.' },
    { s: 'Limpeza de calhas e condutores', u: 'm', c: 'Retirar folhas e detritos, testar o escoamento com água.' }
  ]},
  { id: 'rev', n: 'Revestimentos de parede', t: [
    { s: 'Chapisco e reboco', u: 'm²', c: 'Chapisco 1:3, aguardar 3 dias, reboco desempenado com espessura de 1,5 a 2,5 cm; cura úmida.' },
    { s: 'Revestimento cerâmico de parede', u: 'm²', c: 'Assentar com argamassa colante adequada (AC-II/AC-III), dupla colagem acima de 30×30, juntas niveladas.' },
    { s: 'Refazer rejunte', u: 'm²', c: 'Remover rejunte antigo até 2/3 da profundidade, limpar e rejuntar com rejunte epóxi ou cimentício flexível.' },
    { s: 'Tratamento de reboco com umidade / salitre', u: 'm²', c: 'Eliminar a fonte de água, remover reboco até a alvenaria, escovar, aplicar argamassa impermeável e reboco novo.' },
    { s: 'Recuperação de reboco oco', u: 'm²', c: 'Mapear por percussão, cortar com disco o perímetro, remover e refazer chapisco e reboco.' }
  ]},
  { id: 'pis', n: 'Pisos e rodapés', t: [
    { s: 'Contrapiso', u: 'm²', c: 'Contrapiso de argamassa com espessura mínima de 3 cm, nivelado com taliscas e caimento nas áreas molhadas.' },
    { s: 'Piso cerâmico / porcelanato', u: 'm²', c: 'Assentar com AC-III em dupla colagem, juntas de dilatação no perímetro e a cada 30 m² internos.' },
    { s: 'Piso laminado / vinílico', u: 'm²', c: 'Contrapiso nivelado e seco (umidade < 3%), manta de impacto e rodapé para esconder a junta de dilatação.' },
    { s: 'Rodapé', u: 'm', c: 'Instalar rodapé do mesmo material ou poliestireno, colado e rejuntado.' },
    { s: 'Soleira / peitoril', u: 'm', c: 'Granito com pingadeira no peitoril e caimento para fora; soleira nivelada entre ambientes.' },
    { s: 'Piso externo / intertravado', u: 'm²', c: 'Base compactada, colchão de areia de 5 cm, assentamento, contenção lateral e compactação final.' }
  ]},
  { id: 'for', n: 'Forros', t: [
    { s: 'Forro de gesso (placa ou drywall)', u: 'm²', c: 'Estrutura pendurada em tirantes a cada 1 m, tabicas no perímetro, alçapão de inspeção onde houver registros.' },
    { s: 'Forro de PVC', u: 'm²', c: 'Estrutura em metalon ou madeira tratada a cada 60 cm, perfis de acabamento no perímetro.' },
    { s: 'Sanca / tabica', u: 'm', c: 'Executar sanca em gesso conforme projeto luminotécnico.' },
    { s: 'Tratamento de forro com fissuras / manchas', u: 'm²', c: 'Identificar a origem da umidade antes; tratar trincas com fita e massa, selador e repintura.' }
  ]},
  { id: 'pin', n: 'Pintura', t: [
    { s: 'Preparação: lixamento e limpeza', u: 'm²', c: 'Lixar, remover partes soltas, mofo (água sanitária 1:3) e poeira antes de qualquer demão.' },
    { s: 'Selador / fundo preparador', u: 'm²', c: 'Uma demão de selador em reboco novo ou fundo preparador em superfície calcinada.' },
    { s: 'Massa corrida / acrílica', u: 'm²', c: 'Duas demãos de massa (acrílica em áreas úmidas e externas), lixamento entre demãos.' },
    { s: 'Pintura acrílica de parede', u: 'm²', c: 'Duas a três demãos de tinta acrílica, intervalo de 4 h entre demãos.' },
    { s: 'Pintura de teto', u: 'm²', c: 'Tinta acrílica ou látex PVA fosco, duas demãos.' },
    { s: 'Pintura de fachada / textura', u: 'm²', c: 'Lavar com hidrojato, tratar fissuras, fundo e textura ou acrílica elástica em duas demãos.' },
    { s: 'Esmalte em esquadria / grade', u: 'm²', c: 'Remover ferrugem, fundo anticorrosivo e duas demãos de esmalte sintético.' }
  ]},
  { id: 'esq', n: 'Esquadrias, vidros e serralheria', t: [
    { s: 'Porta de madeira completa', u: 'un', c: 'Batente, folha, guarnições e ferragens; conferir prumo e esquadro do vão.' },
    { s: 'Janela de alumínio', u: 'un', c: 'Instalar sobre contramarco com selante PU no perímetro externo; testar estanqueidade.' },
    { s: 'Revisão de esquadria (vedação e ferragens)', u: 'un', c: 'Trocar escovas, borrachas, roldanas e fechos; refazer vedação com PU.' },
    { s: 'Vidro', u: 'm²', c: 'Vidro na espessura e tipo exigidos (temperado ou laminado em guarda-corpo e box).' },
    { s: 'Guarda-corpo', u: 'm', c: 'Altura mínima de 1,10 m, vãos menores que 11 cm, fixação dimensionada (NBR 14718).' },
    { s: 'Portão / grade', u: 'm²', c: 'Serralheria em metalon ou chapa, fundo anticorrosivo e pintura; automatizador se previsto.' }
  ]},
  { id: 'hid', n: 'Instalações hidráulicas (água)', t: [
    { s: 'Pesquisa de vazamento', u: 'vb', c: 'Teste no hidrômetro com registros fechados, geofone ou termografia para localizar o ponto antes de quebrar.' },
    { s: 'Ponto de água fria', u: 'pt', c: 'Tubulação PVC soldável ou PPR até o ponto, teste de pressão antes de fechar a parede.' },
    { s: 'Ponto de água quente', u: 'pt', c: 'Tubulação PPR, CPVC ou cobre, com isolamento térmico; teste de pressão.' },
    { s: 'Registro de gaveta / pressão', u: 'un', c: 'Substituir registro, conferindo rosca e base; testar estanqueidade.' },
    { s: 'Tubulação de água', u: 'm', c: 'Substituir trecho com tubo e conexões do mesmo diâmetro, fixado e testado.' },
    { s: 'Caixa d’água', u: 'un', c: 'Base nivelada sobre parede portante ou viga, boia, extravasor, limpeza e tampa vedada.' }
  ]},
  { id: 'esg', n: 'Esgoto e águas pluviais', t: [
    { s: 'Ponto de esgoto', u: 'pt', c: 'Tubulação PVC com caimento mínimo de 2% (Ø ≤ 75) ou 1% (Ø ≥ 100), ventilação conforme norma.' },
    { s: 'Ralo sifonado / linear', u: 'un', c: 'Instalar com caimento, integrar à impermeabilização e testar com água.' },
    { s: 'Caixa de inspeção / gordura', u: 'un', c: 'Caixa em alvenaria ou pré-fabricada, tampa hermética, fundo com meia-cana.' },
    { s: 'Tubo de queda / condutor pluvial', u: 'm', c: 'PVC série reforçada para esgoto, fixado com abraçadeiras a cada 2 m.' },
    { s: 'Desentupimento / hidrojateamento', u: 'vb', c: 'Desobstruir rede e inspecionar com câmera se for recorrente.' }
  ]},
  { id: 'ele', n: 'Instalações elétricas', t: [
    { s: 'Ponto de tomada', u: 'pt', c: 'Eletroduto, caixa 4×2, cabo de seção adequada ao circuito e tomada padrão NBR 14136.' },
    { s: 'Ponto de iluminação', u: 'pt', c: 'Eletroduto, caixa octogonal, fiação e interruptor; conferir o circuito no quadro.' },
    { s: 'Quadro de distribuição', u: 'un', c: 'Quadro com barramentos, disjuntores por circuito, DR e DPS; identificar todos os circuitos.' },
    { s: 'Disjuntor / DR / DPS', u: 'un', c: 'Dimensionar pelo cabo do circuito; DR obrigatório em áreas molhadas e externas.' },
    { s: 'Recabeamento', u: 'm', c: 'Substituir fiação antiga ou ressecada por cabo antichama na seção do projeto.' },
    { s: 'Aterramento', u: 'vb', c: 'Haste de aterramento, caixa de inspeção e condutor de proteção até o quadro; medir resistência.' },
    { s: 'Luminária', u: 'un', c: 'Instalar luminária conforme projeto, conferindo tensão e potência.' }
  ]},
  { id: 'lou', n: 'Louças, metais e bancadas', t: [
    { s: 'Bacia sanitária', u: 'un', c: 'Fixar com parafusos e anel de vedação novo; conferir alinhamento ao ponto de esgoto.' },
    { s: 'Cuba / lavatório', u: 'un', c: 'Instalar com sifão, válvula e flexíveis novos; vedar com silicone.' },
    { s: 'Torneira / misturador', u: 'un', c: 'Instalar com fita veda-rosca e testar vazamento.' },
    { s: 'Chuveiro', u: 'un', c: 'Conferir circuito exclusivo, bitola e disjuntor compatíveis com a potência.' },
    { s: 'Bancada de granito / quartzo', u: 'm²', c: 'Mão-francesa ou apoio em alvenaria, frontão e saia; furos para cuba e torneira no local.' }
  ]},
  { id: 'ext', n: 'Fachada e área externa', t: [
    { s: 'Lavagem de fachada', u: 'm²', c: 'Hidrojateamento com produto neutro, protegendo esquadrias e vizinhos.' },
    { s: 'Recuperação de muro', u: 'm²', c: 'Tratar trincas, refazer reboco solto, chapim com pingadeira e pintura.' },
    { s: 'Calçada', u: 'm²', c: 'Contrapiso armado com juntas a cada 2 m, caimento para a rua e piso antiderrapante (padrão da prefeitura).' },
    { s: 'Drenagem superficial', u: 'm', c: 'Canaleta com grelha e ligação à rede pluvial.' },
    { s: 'Jardim / paisagismo', u: 'm²', c: 'Preparo do solo, drenagem e plantio; evitar canteiros encostados em parede sem impermeabilização.' }
  ]},
  { id: 'lim', n: 'Limpeza e desmobilização', t: [
    { s: 'Limpeza fina final', u: 'm²', c: 'Limpeza de pisos, vidros, louças e esquadrias com produtos adequados a cada acabamento.' },
    { s: 'Desmobilização', u: 'vb', c: 'Retirada de ferramentas, sobras de material e proteções; vistoria final com o cliente.' }
  ]},
  { id: 'doc', n: 'Projetos, ensaios e documentação', t: [
    { s: 'Projeto estrutural / verificação', u: 'vb', c: 'Levantamento da estrutura existente e verificação das cargas novas por engenheiro estrutural com ART.' },
    { s: 'Projeto de instalações', u: 'vb', c: 'Projeto elétrico e hidrossanitário compatibilizado com a arquitetura.' },
    { s: 'Ensaio de esclerometria', u: 'un', c: 'NBR 7584: mínimo de 16 impactos por área de ensaio, em superfície lixada.' },
    { s: 'Extração de testemunho', u: 'un', c: 'NBR 7680: extração com sonda rotativa e rompimento em laboratório; fechar o furo com graute.' },
    { s: 'Pacometria', u: 'un', c: 'Mapeamento de armaduras e cobrimento com pacômetro.' },
    { s: 'Laudo técnico', u: 'vb', c: 'Laudo de inspeção com diagnóstico, prognóstico e recomendações (NBR 16747).' },
    { s: 'ART / RRT', u: 'un', c: 'Emitir ART do serviço antes do início da obra.' },
    { s: 'Alvará / comunicação de reforma', u: 'vb', c: 'Verificar exigência da prefeitura e do condomínio (NBR 16280 em condomínios).' }
  ]},
  { id: 'out', n: 'Outros', t: [] }
];

// Prioridade do item
window.LEV_PRIO = [
  { id: 'U', n: 'Urgente', d: 'Risco à segurança ou dano progressivo' },
  { id: 'A', n: 'Alta', d: 'Resolver antes dos acabamentos' },
  { id: 'M', n: 'Média', d: 'Faz parte da obra' },
  { id: 'B', n: 'Baixa', d: 'Melhoria / pode esperar' }
];
// Natureza do item
window.LEV_TIPO = [
  { id: 'pat', n: 'Patologia / defeito' },
  { id: 'cli', n: 'Pedido do cliente' },
  { id: 'man', n: 'Manutenção' },
  { id: 'adq', n: 'Adequação / norma' }
];
window.LEV_UND = ['m²', 'm', 'm³', 'un', 'pt', 'vb', 'kg', 'h', 'dia', 'mês'];

// Checklist geral da visita (Sim / Não / N/A + observação)
window.LEV_CHECK = [
  { g: 'Acesso e logística', i: [
    ['ac1', 'Acesso para caminhão de material e caçamba na frente do imóvel'],
    ['ac2', 'Local para descarga e armazenamento de material'],
    ['ac3', 'Caçamba na rua precisa de autorização (prefeitura / condomínio)'],
    ['ac4', 'Transporte vertical de material (escada estreita, elevador, içamento)'],
    ['ac5', 'Horário permitido para obra e para ruído definido'],
    ['ac6', 'Regras do condomínio / vizinhança verificadas']
  ]},
  { g: 'Infraestrutura para a equipe', i: [
    ['in1', 'Energia elétrica disponível (anotar 127 V / 220 V)'],
    ['in2', 'Ponto de água disponível'],
    ['in3', 'Banheiro disponível para a equipe'],
    ['in4', 'Local para refeição e troca de roupa']
  ]},
  { g: 'Segurança', i: [
    ['se1', 'Trabalho em altura (precisa de andaime, linha de vida ou cinto)'],
    ['se2', 'Rede elétrica próxima à área de trabalho'],
    ['se3', 'Elemento estrutural com risco aparente (precisa escorar antes)'],
    ['se4', 'Possível amianto (telhas ou caixas d’água antigas de fibrocimento)'],
    ['se5', 'Gás canalizado / botijão próximo à área de serviço'],
    ['se6', 'Imóvel ocupado durante a obra (moradores, crianças, idosos, animais)']
  ]},
  { g: 'Documentação e projetos', i: [
    ['do1', 'Projeto arquitetônico disponível'],
    ['do2', 'Projeto estrutural disponível'],
    ['do3', 'Projetos elétrico e hidráulico disponíveis'],
    ['do4', 'Precisa de alvará / comunicação de reforma'],
    ['do5', 'Precisa de ART / RRT'],
    ['do6', 'Manual do proprietário / garantia da construtora vigente']
  ]},
  { g: 'Registros da visita', i: [
    ['re1', 'Fotos gerais da fachada, entorno e acesso'],
    ['re2', 'Fotos de danos pré-existentes nos vizinhos (vistoria cautelar)'],
    ['re3', 'Leitura dos medidores de água e energia'],
    ['re4', 'Localização do quadro de luz, registro geral e caixa d’água'],
    ['re5', 'Fonte de umidade identificada (se houver infiltração)'],
    ['re6', 'Móveis e itens a retirar ou proteger combinados com o cliente']
  ]}
];

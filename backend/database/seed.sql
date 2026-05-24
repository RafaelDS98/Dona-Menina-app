-- Dona Menina Beauty Bar — Seed Data
-- Dados de exemplo realistas para desenvolvimento

-- Colaboradoras
INSERT INTO colaboradoras (nome, funcao, comissao_padrao, ativa) VALUES
  ('Elis', 'Nail designer', 50.0, 1),
  ('Tarcia', 'Lash designer / Esteticista', 40.0, 1),
  ('Paula', 'Cabeleireira / Trancista', 45.0, 1);

-- Categorias de servico
INSERT INTO servico_categorias (nome) VALUES
  ('Unhas'),
  ('Cilios'),
  ('Cabelo'),
  ('Estetica'),
  ('Sobrancelha');

-- Servicos
INSERT INTO servicos (nome, categoria_id, preco, tempo_min, ativo, consome_kit_mao, consome_kit_pe) VALUES
  ('Manicure simples',     1, 35.00,  45, 1, 1, 0),
  ('Manicure em gel',      1, 60.00,  60, 1, 1, 0),
  ('Pedicure simples',     1, 40.00,  50, 1, 0, 1),
  ('Pedicure spa',         1, 55.00,  60, 1, 0, 1),
  ('Mao e pe combo',       1, 70.00,  90, 1, 1, 1),
  ('Lash lifting',         2, 80.00,  60, 1, 0, 0),
  ('Extensao de cilios',   2, 120.00, 90, 1, 0, 0),
  ('Manutencao cilios',    2, 70.00,  45, 1, 0, 0),
  ('Escova modelada',      3, 50.00,  40, 1, 0, 0),
  ('Hidratacao capilar',   3, 70.00,  50, 1, 0, 0),
  ('Trancas box braids',   3, 150.00, 180, 1, 0, 0),
  ('Trancas twist',        3, 120.00, 150, 1, 0, 0),
  ('Limpeza de pele',      4, 90.00,  60, 1, 0, 0),
  ('Design de sobrancelha', 5, 30.00, 20, 1, 0, 0),
  ('Henna sobrancelha',    5, 45.00,  30, 1, 0, 0);

-- Clientes
INSERT INTO clientes (nome, telefone, data_nascimento, observacoes, ativa) VALUES
  ('Ana Clara Souza',     '(91) 98765-4321', '1995-03-15', 'Prefere horario pela manha', 1),
  ('Beatriz Mendes',      '(91) 99876-5432', '1988-07-22', NULL, 1),
  ('Camila Rodrigues',    '(91) 97654-3210', '1992-11-08', 'Alergia a esmalte com formol', 1),
  ('Daniela Ferreira',    '(91) 98543-2109', '1990-01-30', NULL, 1),
  ('Elisa Nascimento',    '(91) 99432-1098', '1985-06-14', 'Cliente VIP - sempre pontual', 1),
  ('Fernanda Lima',       '(91) 98321-0987', '1998-09-03', NULL, 1),
  ('Gabriela Santos',     '(91) 97210-9876', '1993-12-25', 'Faz manicure e pedicure juntas', 1),
  ('Helena Costa',        '(91) 96109-8765', '1987-04-18', NULL, 1),
  ('Isabela Martins',     '(91) 95098-7654', '2000-08-07', 'Estudante - prefere sabados', 1),
  ('Julia Almeida',       '(91) 94987-6543', '1996-03-28', NULL, 1);

-- Estoque de kits
INSERT INTO estoque_kits (tipo, quantidade, alerta_atencao, alerta_urgente, alerta_critico) VALUES
  ('mao', 20, 15, 10, 5),
  ('pe',  18, 15, 10, 5);

-- Produtos da lojinha
INSERT INTO estoque_lojinha (nome, marca, preco_custo, preco_venda, quantidade, alerta_minimo, ativo) VALUES
  ('Oleo de cutilas',     'Risque', 8.50, 18.00, 12, 3, 1),
  ('Creme hidratante maos', 'Natura', 15.00, 32.00, 8, 3, 1);

-- Atendimentos historicos
INSERT INTO atendimentos (id, cliente_id, data_hora, valor_total, observacao, cancelado) VALUES
  (1, 1, '2025-01-10T10:00', 95.00,  NULL, 0),
  (2, 3, '2025-01-11T14:00', 120.00, NULL, 0),
  (3, 5, '2025-01-12T09:30', 70.00,  'Cliente VIP', 0),
  (4, 2, '2025-01-13T11:00', 80.00,  NULL, 0),
  (5, 7, '2025-01-14T15:00', 150.00, NULL, 0);

-- Pagamentos dos atendimentos
INSERT INTO atendimento_pagamentos (atendimento_id, forma, valor) VALUES
  (1, 'pix', 95.00),
  (2, 'credito', 120.00),
  (3, 'pix', 70.00),
  (4, 'debito', 80.00),
  (5, 'pix', 100.00),
  (5, 'especie', 50.00);

-- Itens dos atendimentos
INSERT INTO atendimento_itens (id, atendimento_id, tipo, servico_id, descricao, preco_cobrado) VALUES
  (1, 1, 'servico', 1,  'Manicure simples', 35.00),
  (2, 1, 'servico', 3,  'Pedicure simples', 40.00),
  (3, 1, 'servico', 14, 'Design de sobrancelha', 20.00),
  (4, 2, 'servico', 7,  'Extensao de cilios', 120.00),
  (5, 3, 'servico', 5,  'Mao e pe combo', 70.00),
  (6, 4, 'servico', 6,  'Lash lifting', 80.00),
  (7, 5, 'servico', 11, 'Trancas box braids', 150.00);

-- Colaboradoras por item (comissao calculada e congelada)
INSERT INTO atendimento_item_colaboradoras (atendimento_item_id, colaboradora_id, percentual_comissao, valor_comissao) VALUES
  (1, 1, 100, 17.50),
  (2, 1, 100, 20.00),
  (3, 2, 100, 8.00),
  (4, 2, 100, 48.00),
  (5, 1, 100, 35.00),
  (6, 2, 100, 32.00),
  (7, 3, 50,  33.75),
  (7, 1, 50,  37.50);

-- Promocoes
INSERT INTO promocoes (nome, descricao, preco, data_inicio, data_fim, ativa) VALUES
  ('Combo Beleza Completa', 'Manicure + Pedicure + Design de sobrancelha', 85.00, '2025-01-01', '2025-12-31', 1),
  ('Promo Verao Cilios', 'Lash lifting com preco especial', 65.00, '2024-12-01', '2025-02-28', 1);

INSERT INTO promocao_servicos (promocao_id, servico_id) VALUES
  (1, 1), (1, 3), (1, 14),
  (2, 6);

-- Configuracoes padrao
INSERT INTO configuracoes (chave, valor) VALUES
  ('salao_nome', 'Dona Menina Beauty Bar'),
  ('salao_endereco', 'Av. Pedro Alvares Cabral, 1329, Belem/PA'),
  ('salao_telefone', '(91) 99999-0000'),
  ('horario_abertura', '09:00'),
  ('horario_fechamento', '19:00'),
  ('backup_intervalo_dias', '7'),
  ('backup_pasta', './backups');

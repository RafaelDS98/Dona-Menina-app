import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, '..', 'data', 'dona_menina.db');
const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

const categorias = [
  'Trancas', 'Unhas', 'Cabelos', 'Cilios',
  'Depilacao', 'Maquiagem', 'Labios', 'Sobrancelhas',
];

const servicos = [
  { categoria: 'Trancas', nome: 'Boho braids sem material',         preco: 350 },
  { categoria: 'Trancas', nome: 'Boho braids com material',          preco: 450 },
  { categoria: 'Trancas', nome: 'Gypsy braids sem material',         preco: 350 },
  { categoria: 'Trancas', nome: 'Gypsy braids com material',         preco: 480 },
  { categoria: 'Trancas', nome: 'Goddess braids sem material',       preco: 380 },
  { categoria: 'Trancas', nome: 'Goddess braids com material',       preco: 500 },
  { categoria: 'Trancas', nome: 'Gypsy com topo nago sem material',  preco: 350 },
  { categoria: 'Trancas', nome: 'Gypsy com topo nago com material',  preco: 450 },
  { categoria: 'Trancas', nome: 'Entrelace sem material',            preco: 250 },
  { categoria: 'Trancas', nome: 'Entrelace com material',            preco: 400 },
  { categoria: 'Trancas', nome: 'Alongamento na tela sem material',  preco: 200 },
  { categoria: 'Trancas', nome: 'Alongamento na tela com material',  preco: 380 },
  { categoria: 'Trancas', nome: 'Fulani mais entrelace sem material', preco: 300 },
  { categoria: 'Trancas', nome: 'Fulani mais entrelace com material', preco: 450 },
  { categoria: 'Trancas', nome: 'Fulani mais box braids sem material', preco: 350 },
  { categoria: 'Trancas', nome: 'Fulani mais box braids com material', preco: 450 },
  { categoria: 'Trancas', nome: 'Box braids sem material',           preco: 400 },
  { categoria: 'Trancas', nome: 'Box braids com material',           preco: 480 },
  { categoria: 'Trancas', nome: 'Nago topo',                        preco: 50  },
  { categoria: 'Trancas', nome: 'Acessorios',                       preco: 5   },
  { categoria: 'Unhas', nome: 'Manicure',                           preco: 35  },
  { categoria: 'Unhas', nome: 'Pedicure',                           preco: 35  },
  { categoria: 'Unhas', nome: 'Manicure e pedicure',                preco: 60  },
  { categoria: 'Unhas', nome: 'Postica tradicional',                preco: 45  },
  { categoria: 'Unhas', nome: 'Postica realista',                   preco: 80  },
  { categoria: 'Unhas', nome: 'Soft Gel',                           preco: 100 },
  { categoria: 'Unhas', nome: 'Banho de gel',                       preco: 100 },
  { categoria: 'Unhas', nome: 'Esmaltacao em gel',                  preco: 60  },
  { categoria: 'Unhas', nome: 'Plastica dos pes',                   preco: 80  },
  { categoria: 'Unhas', nome: 'Alongamento molde f1',               preco: 150 },
  { categoria: 'Unhas', nome: 'Alongamento acrigel',                preco: 150 },
  { categoria: 'Unhas', nome: 'Alongamento fibra de vidro',         preco: 180 },
  { categoria: 'Unhas', nome: 'Manutencao molde f1',                preco: 100 },
  { categoria: 'Unhas', nome: 'Manutencao acrigel',                 preco: 100 },
  { categoria: 'Unhas', nome: 'Manutencao fibra de vidro',          preco: 130 },
  { categoria: 'Unhas', nome: 'Manutencao banho de gel',            preco: 80  },
  { categoria: 'Unhas', nome: 'Adicional francesinha pedrarias',    preco: 5   },
  { categoria: 'Unhas', nome: 'Adicional unhas desenhadas',         preco: 10  },
  { categoria: 'Unhas', nome: 'Adicional decoracao 3D',             preco: 15  },
  { categoria: 'Cabelos', nome: 'Corte',                            preco: 45  },
  { categoria: 'Cabelos', nome: 'Corte mais escova ou finalizacao', preco: 80  },
  { categoria: 'Cabelos', nome: 'Hidratacao',                       preco: 100 },
  { categoria: 'Cabelos', nome: 'Reconstrucao',                     preco: 120 },
  { categoria: 'Cabelos', nome: 'Nutricao',                         preco: 100 },
  { categoria: 'Cabelos', nome: 'Cauterizacao com queratina',       preco: 120 },
  { categoria: 'Cabelos', nome: 'Coloracao total',                  preco: 200 },
  { categoria: 'Cabelos', nome: 'Coloracao retoque de raiz',        preco: 120 },
  { categoria: 'Cabelos', nome: 'Cronograma capilar 4 sessoes',     preco: 350 },
  { categoria: 'Cabelos', nome: 'Selagem P',                        preco: 150 },
  { categoria: 'Cabelos', nome: 'Selagem M',                        preco: 180 },
  { categoria: 'Cabelos', nome: 'Selagem G',                        preco: 210 },
  { categoria: 'Cabelos', nome: 'Selagem GG',                       preco: 240 },
  { categoria: 'Cabelos', nome: 'Botox P',                          preco: 120 },
  { categoria: 'Cabelos', nome: 'Botox M',                          preco: 150 },
  { categoria: 'Cabelos', nome: 'Botox G',                          preco: 180 },
  { categoria: 'Cabelos', nome: 'Botox GG',                         preco: 210 },
  { categoria: 'Cabelos', nome: 'Escova P',                         preco: 60  },
  { categoria: 'Cabelos', nome: 'Escova M',                         preco: 80  },
  { categoria: 'Cabelos', nome: 'Escova G',                         preco: 100 },
  { categoria: 'Cabelos', nome: 'Escova GG',                        preco: 120 },
  { categoria: 'Cilios', nome: 'Tufinho fio de seda',               preco: 50  },
  { categoria: 'Cilios', nome: 'Lash lifting',                      preco: 100 },
  { categoria: 'Cilios', nome: 'Volume express aplicacao',          preco: 90  },
  { categoria: 'Cilios', nome: 'Volume brasileiro manutencao',      preco: 100 },
  { categoria: 'Cilios', nome: 'Volume brasileiro aplicacao',       preco: 150 },
  { categoria: 'Cilios', nome: 'Volume fox eyes manutencao',        preco: 100 },
  { categoria: 'Cilios', nome: 'Volume fox eyes aplicacao',         preco: 160 },
  { categoria: 'Cilios', nome: 'Volume egipcio manutencao',         preco: 100 },
  { categoria: 'Cilios', nome: 'Volume egipcio aplicacao',          preco: 170 },
  { categoria: 'Cilios', nome: 'Volume Kim Kardashian manutencao',  preco: 115 },
  { categoria: 'Cilios', nome: 'Volume Kim Kardashian aplicacao',   preco: 200 },
  { categoria: 'Cilios', nome: 'Volume luxo manutencao',            preco: 105 },
  { categoria: 'Cilios', nome: 'Volume luxo aplicacao',             preco: 180 },
  { categoria: 'Cilios', nome: 'Volume 30 mais manutencao',         preco: 115 },
  { categoria: 'Cilios', nome: 'Volume 30 mais aplicacao',          preco: 200 },
  { categoria: 'Cilios', nome: 'Remocao de cilios',                 preco: 50  },
  { categoria: 'Depilacao', nome: 'Depilacao Buco',                 preco: 20  },
  { categoria: 'Depilacao', nome: 'Depilacao Testa',                preco: 20  },
  { categoria: 'Depilacao', nome: 'Depilacao Queixo',               preco: 25  },
  { categoria: 'Depilacao', nome: 'Depilacao Rosto',                preco: 60  },
  { categoria: 'Depilacao', nome: 'Depilacao Axilas',               preco: 40  },
  { categoria: 'Depilacao', nome: 'Depilacao Braco',                preco: 45  },
  { categoria: 'Depilacao', nome: 'Depilacao Meia perna',           preco: 60  },
  { categoria: 'Depilacao', nome: 'Depilacao Perna completa',       preco: 75  },
  { categoria: 'Depilacao', nome: 'Depilacao Virilha',              preco: 40  },
  { categoria: 'Depilacao', nome: 'Depilacao Meia pubiana',         preco: 50  },
  { categoria: 'Depilacao', nome: 'Depilacao Pubiana completa',     preco: 65  },
  { categoria: 'Depilacao', nome: 'Depilacao Lateral anal',         preco: 35  },
  { categoria: 'Depilacao', nome: 'Clareamento de areas',           preco: 30  },
  { categoria: 'Maquiagem', nome: 'Maquiagem clean sem cilios',     preco: 120 },
  { categoria: 'Maquiagem', nome: 'Maquiagem glam completa',        preco: 150 },
  { categoria: 'Maquiagem', nome: 'Maquiagem artistica',            preco: 180 },
  { categoria: 'Labios', nome: 'Hydra gloss hidratacao labial',     preco: 80  },
  { categoria: 'Labios', nome: 'Micropigmentacao labial',           preco: 350 },
  { categoria: 'Sobrancelhas', nome: 'Design ou limpeza',           preco: 35  },
  { categoria: 'Sobrancelhas', nome: 'Design com henna',            preco: 55  },
  { categoria: 'Sobrancelhas', nome: 'Brow Lamination',             preco: 100 },
  { categoria: 'Sobrancelhas', nome: 'Micropigmentacao',            preco: 300 },
];

const atualizar = db.transaction(() => {
  db.prepare('UPDATE servicos SET ativo = 0').run();
  db.prepare('UPDATE servicos SET categoria_id = NULL WHERE ativo = 0').run();
  db.prepare('DELETE FROM servico_categorias').run();

  const insertCat = db.prepare('INSERT INTO servico_categorias (nome) VALUES (?)');
  const catMap = {};
  for (const nome of categorias) {
    const r = insertCat.run(nome);
    catMap[nome] = r.lastInsertRowid;
  }

  const insertSvc = db.prepare('INSERT INTO servicos (nome, categoria_id, preco, ativo) VALUES (?, ?, ?, 1)');
  for (const s of servicos) {
    insertSvc.run(s.nome, catMap[s.categoria], s.preco);
  }

  return { cats: categorias.length, svcs: servicos.length };
});

try {
  const { cats, svcs } = atualizar();
  console.log(cats + ' categorias inseridas');
  console.log(svcs + ' servicos inseridos');
  console.log('Catalogo atualizado com sucesso!');
} catch (err) {
  console.error('Erro:', err.message);
} finally {
  db.close();
}

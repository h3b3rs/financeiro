// server.js
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

/* ===== CORS =====
   Em dev, permita as origens que você usa (Live Server e seu domínio).  */
const ALLOWED_ORIGINS = [
  'http://127.0.0.1:5500',
  'http://localhost:5500',
  'https://hpspeniel.com.br',
  'https://www.hpspeniel.com.br'
];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
  credentials: false,
  maxAge: 86400
}));
app.options('*', cors()); // responde preflight

// lê JSON do body
app.use(express.json());
app.set('trust proxy', true);

/* ===== MySQL =====
   ATENÇÃO: o host precisa ser o NOME do serviço MySQL no EasyPanel.
   Se o seu serviço chama “mysql” mesmo, deixe assim.
   Se o nome for outro (ex.: hpspeniel-mysql), troque abaixo. */
const dbConfig = {
  host: process.env.MYSQL_HOST || 'mysql',
  user: process.env.MYSQL_USER || 'mega',
  password: process.env.MYSQL_PASS || 'megamega',
  database: process.env.MYSQL_DB   || 'hpspeniel',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

let pool;

async function initializeDatabase() {
  pool = mysql.createPool(dbConfig);
  const conn = await pool.getConnection();
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS contas_a_pagar (
      id INT AUTO_INCREMENT PRIMARY KEY,
      valor DECIMAL(10,2) NOT NULL,
      classe VARCHAR(50) NOT NULL,
      centroCusto VARCHAR(50) NOT NULL,
      fornecedorNome VARCHAR(255) NOT NULL,
      fornecedorDoc VARCHAR(30) NOT NULL,
      tipoFornecedor ENUM('PF','PJ') NOT NULL,
      dataRegistro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
  await conn.query(createTableQuery);
  conn.release();
  console.log("MySQL OK — tabela 'contas_a_pagar' pronta.");
}

/* ===== Rotas ===== */
app.get('/health', (req, res) => res.json({ ok: true }));

app.get('/', (req, res) => {
  res.status(200).json({ message: "API de Contas a Pagar está online!" });
});

app.post('/contas-a-pagar', async (req, res) => {
  try {
    const { valor, classe, centroCusto, fornecedor } = req.body || {};
    const fornecedorNome = fornecedor?.nome || fornecedor?.razaoSocial;
    const fornecedorDoc  = fornecedor?.documento;
    const tipoFornecedor = fornecedor?.tipo; // 'PF' | 'PJ'

    if (
      valor === undefined || valor === null ||
      !classe || !centroCusto || !fornecedorNome || !fornecedorDoc || !tipoFornecedor
    ) {
      return res.status(400).json({ error: "Todos os campos de conta e fornecedor são obrigatórios." });
    }

    const insertQuery = `
      INSERT INTO contas_a_pagar
      (valor, classe, centroCusto, fornecedorNome, fornecedorDoc, tipoFornecedor)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    const values = [
      Number(valor),
      String(classe),
      String(centroCusto),
      String(fornecedorNome),
      String(fornecedorDoc),
      String(tipoFornecedor)
    ];

    const [result] = await pool.query(insertQuery, values);
    return res.status(201).json({ message: "Conta registrada com sucesso!", id: result.insertId });
  } catch (err) {
    console.error('Erro ao inserir dados:', err);
    return res.status(500).json({ error: "Falha interna ao registrar a conta.", details: err.message });
  }
});

/* ===== Boot ===== */
initializeDatabase()
  .then(() => app.listen(PORT, () => console.log(`API ouvindo em ${PORT}`)))
  .catch(err => {
    console.error('ERRO FATAL ao iniciar o banco:', err.message);
    process.exit(1);
  });

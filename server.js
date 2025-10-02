// server.js
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

/* ===== CORS ===== */
const DEV_ORIGINS  = ['http://127.0.0.1:5500', 'http://localhost:5500'];
const PROD_ORIGINS = ['https://hpspeniel.com.br', 'https://www.hpspeniel.com.br'];

// Em produção, só libera dev se ALLOW_LOCAL_ORIGINS=1
const EXTRA_ORIGINS =
  process.env.ALLOW_LOCAL_ORIGINS === '1' ? DEV_ORIGINS : [];

const ALLOWED_ORIGINS = process.env.NODE_ENV === 'production'
  ? [...PROD_ORIGINS, ...EXTRA_ORIGINS]
  : [...DEV_ORIGINS, ...PROD_ORIGINS];

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
app.options('*', cors()); // preflight

// Body parser
app.use(express.json());
app.set('trust proxy', true);

/* ===== MySQL ===== */
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
      valor DECIMAL(12,2) NOT NULL,
      classe VARCHAR(80) NOT NULL,
      centroCusto VARCHAR(80) NOT NULL,
      fornecedorNome VARCHAR(255) NOT NULL,
      fornecedorDoc VARCHAR(32) NOT NULL,
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

    // aceita "1.500,00" ou "1500.00"
    const rawValor = (valor ?? '').toString().replace(/\./g, '').replace(',', '.');
    const valorNum = Number(rawValor);

    if (!Number.isFinite(valorNum) || valorNum <= 0 ||
        !classe || !centroCusto || !fornecedorNome || !fornecedorDoc ||
        !['PF','PJ'].includes(tipoFornecedor)) {
      return res.status(400).json({ error: "Campos obrigatórios ausentes ou inválidos." });
    }

    const insertQuery = `
      INSERT INTO contas_a_pagar
      (valor, classe, centroCusto, fornecedorNome, fornecedorDoc, tipoFornecedor)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    const values = [valorNum, String(classe), String(centroCusto),
                    String(fornecedorNome), String(fornecedorDoc), String(tipoFornecedor)];

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

const express = require('express');
const mysql = require('mysql2/promise'); // Usando a versão promise para async/await

const app = express();
const PORT = 3000;

// Configuração da Conexão MySQL (Credenciais)
// Estas são as credenciais do seu serviço EasyPanel
const dbConfig = {
    host: 'mysql', // Nome do serviço MySQL na rede Docker (Corrigido)
    user: 'mega',
    password: 'megamega', // Senha que você forneceu.
    database: 'hpspeniel',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

// Middleware CORS MANUAL (Solução para o erro 'Failed to fetch')
// Este bloco garante que o cabeçalho de permissão seja enviado, contornando o proxy.
app.use((req, res, next) => {
    // Permite que qualquer origem (incluindo seu Live Server local) acesse
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    
    // Permite os métodos que o front-end usa (POST para envio, OPTIONS para o pré-voo)
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
    
    // Permite o cabeçalho Content-Type (essencial para o JSON)
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Responde a requisições OPTIONS (pré-voo do CORS) imediatamente
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

app.use(express.json()); // Permite que a API leia corpos de requisição JSON

let pool; // Variável para manter o pool de conexões do MySQL

// Função para iniciar a conexão com o banco e criar a tabela se não existir
async function initializeDatabase() {
    try {
        pool = mysql.createPool(dbConfig);
        const connection = await pool.getConnection();
        
        // Query SQL para criar a tabela se ela ainda não existir
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS contas_a_pagar (
                id INT AUTO_INCREMENT PRIMARY KEY,
                valor DECIMAL(10, 2) NOT NULL,
                classe VARCHAR(50) NOT NULL,
                centroCusto VARCHAR(50) NOT NULL,
                fornecedorNome VARCHAR(255) NOT NULL,
                fornecedorDoc VARCHAR(30) NOT NULL,
                tipoFornecedor ENUM('PF', 'PJ') NOT NULL,
                dataRegistro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;
        
        await connection.query(createTableQuery);
        connection.release(); 
        
        console.log("Conexão com MySQL estabelecida e tabela 'contas_a_pagar' verificada/criada.");

    } catch (error) {
        console.error("ERRO FATAL ao iniciar o banco de dados:", error.message);
        // Garante que o processo Node.js saia se o banco não estiver acessível
        process.exit(1); 
    }
}

// ROTA PRINCIPAL: Salvar uma nova conta a pagar
app.post('/contas-a-pagar', async (req, res) => {
    const { valor, classe, centroCusto, fornecedor } = req.body;
    
    const fornecedorNome = fornecedor.nome || fornecedor.razaoSocial;
    const fornecedorDoc = fornecedor.documento;
    const tipoFornecedor = fornecedor.tipo;

    // Verificação básica dos campos obrigatórios
    if (!valor || !classe || !centroCusto || !fornecedorNome || !fornecedorDoc) {
        return res.status(400).json({ 
            error: "Todos os campos de conta e fornecedor são obrigatórios." 
        });
    }

    try {
        const insertQuery = `
            INSERT INTO contas_a_pagar 
            (valor, classe, centroCusto, fornecedorNome, fornecedorDoc, tipoFornecedor) 
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        
        const values = [
            parseFloat(valor), 
            classe, 
            centroCusto, 
            fornecedorNome, 
            fornecedorDoc, 
            tipoFornecedor
        ];

        const [result] = await pool.query(insertQuery, values);
        
        // Retorna sucesso para o Front-end
        return res.status(201).json({ 
            message: "Conta registrada com sucesso!", 
            id: result.insertId 
        });

    } catch (error) {
        console.error("Erro ao inserir dados:", error);
        return res.status(500).json({ 
            error: "Falha interna ao registrar a conta.", 
            details: error.message 
        });
    }
});

// Rota de saúde simples para verificar se a API está online
app.get('/', (req, res) => {
    res.status(200).json({ message: "API de Contas a Pagar está online!" });
});

// Inicializa o banco de dados e, em seguida, inicia o servidor
initializeDatabase().then(() => {
    app.listen(PORT, () => {
        console.log(`Servidor rodando na porta http://localhost:${PORT}`);
        console.log(`API pronta para receber requisições em /contas-a-pagar`);
    });
});


import pool from "../config/database.js";
export const createDepartment = async (req, res, next) => {
    const { name } = req.body;
    // Validação corrigida
    if (!name) {
        return res.status(400).json({
            message: 'Nome é obrigatório'
        });
    }
    try {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            const [existing] = await connection.query(`SELECT * FROM departments WHERE name = ?`, [name]);
            // Verificação simplificada
            if (existing.length > 0) {
                await connection.rollback();
                return res.status(409).json({
                    message: 'Nome já está em uso'
                });
            }
            // Query corrigida
            const [result] = await connection.query('INSERT INTO departments (name) VALUES (?)', // Placeholder único
            [name]);
            await connection.commit();
            res.status(201).json({
                id: result.insertId,
                name
            });
        }
        catch (error) {
            await connection.rollback();
            // Tratamento de erro duplicado simplificado
            if (error instanceof Error && 'code' in error && error.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({ message: 'Nome já está em uso' });
            }
            console.error('Erro na criação:', error);
            res.status(500).json({
                message: 'Erro ao criar departamento',
                error: error instanceof Error ? error.message : 'Erro desconhecido'
            });
        }
        finally {
            connection.release();
        }
    }
    catch (err) {
        console.error('Erro geral:', err);
        res.status(500).json({
            message: 'Erro ao obter conexão do banco',
            error: err instanceof Error ? err.message : 'Erro desconhecido'
        });
    }
};
export const getDepartments = async (req, res) => {
    const { page = 1, limit = 10, search } = req.query;
    try {
        let query = `
          SELECT * FROM departments
      `;
        const params = [];
        if (search && typeof search === 'string') {
            query += ' WHERE name LIKE ?';
            params.push(`%${search}%`);
        }
        // Executar query com tipagem forte
        const [departments] = await pool.query(query, params);
        res.json(departments);
    }
    catch (error) {
        console.error('Erro ao buscar departamentos:', error);
        res.status(500).json({
            message: 'Erro ao buscar departamentos',
            error: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
};
export const getDepartmentById = async (req, res) => {
    const { id } = req.params;
    try {
        // Converter ID para número de forma segura
        const departmentId = Number(id);
        // Validar ID
        if (isNaN(departmentId)) {
            return res.status(400).json({
                message: 'ID do departamento inválido'
            });
        }
        // Executar query com tipagem forte
        const [rows] = await pool.query('SELECT * FROM departments WHERE id = ?', [departmentId]);
        if (rows.length === 0) {
            return res.status(404).json({
                message: 'Departamento não encontrado'
            });
        }
        res.json(rows[0]);
    }
    catch (error) {
        console.error(`Erro ao buscar departamento ID ${id}:`, error);
        res.status(500).json({
            message: 'Erro ao buscar departamento',
            error: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
};
export const updateDepartment = async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    try {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            // Verifica conflitos excluindo o próprio registro
            const [existing] = await connection.query(`SELECT * FROM departments 
        WHERE (name = ?)
        AND id != ?`, [name, id]);
            if (existing.length > 0) {
                const conflicts = [];
                if (existing.some(d => d.name === name))
                    conflicts.push('nome');
                res.status(409).json({
                    message: `Conflito em: ${conflicts.join(', ')}`
                });
                return;
            }
            // Atualiza o departamento
            const [result] = await connection.query('UPDATE departments SET name = ? WHERE id = ?', [name, id]);
            if (result.affectedRows === 0) {
                res.status(404).json({ message: 'Departamento não encontrado' });
                return;
            }
            await connection.commit();
            res.json({ message: 'Departamento atualizado com sucesso' });
        }
        catch (error) {
            await connection.rollback();
            throw error;
        }
        finally {
            connection.release();
        }
    }
    catch (error) {
        res.status(500).json({ message: 'Erro ao atualizar departamento' });
    }
};
export const deleteDepartment = async (req, res) => {
    const { id } = req.params;
    try {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();
            // Verifica dependências
            const [employees] = await connection.query('SELECT * FROM employee_departments WHERE department_id = ? LIMIT 1', [id]);
            const [os] = await connection.query('SELECT * FROM os_departments WHERE department_id = ? LIMIT 1', [id]);
            if (employees.length > 0 || os.length > 0) {
                await connection.rollback();
                return res.status(400).json({
                    message: 'Departamento está vinculado a colaboradores ou ordens de serviço'
                });
            }
            // Exclui o departamento
            const [result] = await connection.query('DELETE FROM departments WHERE id = ?', [id]);
            if (result.affectedRows === 0) {
                await connection.rollback();
                return res.status(404).json({ message: 'Departamento não encontrado' });
            }
            await connection.commit();
            res.status(204).end();
        }
        catch (error) {
            await connection.rollback();
            throw error;
        }
        finally {
            connection.release();
        }
    }
    catch (error) {
        console.error(error);
        res.status(500).json({
            message: 'Erro ao excluir departamento',
            error: error instanceof Error ? error.message : 'Erro desconhecido'
        });
    }
};

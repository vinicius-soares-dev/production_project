import { NextFunction, Request, Response } from "express";
import pool from "../config/database.js";
import { RowDataPacket } from "mysql2";

interface DepartmentRow extends RowDataPacket {
  id: number;
  name: string;
  production_order: number;
}

interface DepartmentRequest extends Request {
  body: {
    name: string;
    production_order: number;
  };
}

// Tipagem para getDepartmentById
interface GetDepartmentRequest extends Request {
  params: {
    id: string;
  };
}


export const createDepartment = async (req: DepartmentRequest, res: Response, next: NextFunction) => {
  const { name, production_order } = req.body;

  if (!name || production_order === undefined) {
    return res.status(400).json({
      message: 'Nome e ordem de produção são obrigatórios'
    });
  }

  try {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      // Verifica se nome ou ordem já existem
      const [existing] = await connection.query(
        `SELECT * FROM departments 
        WHERE name = ?`,
        [name]
      );

      if ((existing as any[]).length > 0) {
        const conflicts = [];
        if ((existing as any[]).some(d => d.name === name)) conflicts.push('nome');
        
        res.status(409).json({
          message: `Conflito em: ${conflicts.join(', ')}`
        });
        return;
      }

      // Insere o departamento
      const [result] = await connection.query(
        'INSERT INTO departments (name, production_order) VALUES (?, ?)',
        [name, production_order]
      );

      await connection.commit();
      res.status(201).json({ 
        id: (result as any).insertId,
        name,
        production_order
      });
    } catch (error) {
      await connection.rollback();
      next(error);
      
      if (error instanceof Error) {
        if ('code' in error && error.code === 'ER_DUP_ENTRY') {
          return res.status(409).json({ message: 'Departamento já existe' });
        }
      }
      
      res.status(500).json({ message: 'Erro ao criar departamento' });
    } finally {
      connection.release();
    }
  } catch (err) {
    res.status(500).json({ message: 'Erro ao obter conexão do banco' });
  }
};

export const getDepartments = async (req: Request, res: Response) => {
  const { page = 1, limit = 10, search } = req.query;

  try {
      let query = `
          SELECT * FROM departments
      `;
      const params: (string | number)[] = [];
      
      // Converter para números de forma segura
      const numericLimit = Number(limit) || 10;
      const numericPage = Number(page) || 1;
      const offset = (numericPage - 1) * numericLimit;

      if (search && typeof search === 'string') {
          query += ' WHERE name LIKE ?';
          params.push(`%${search}%`);
      }

      query += ' ORDER BY production_order ASC LIMIT ? OFFSET ?';
      params.push(numericLimit, offset);

      // Executar query com tipagem forte
      const [departments] = await pool.query<DepartmentRow[]>(query, params);
      
      res.json(departments);

  } catch (error) {
      console.error('Erro ao buscar departamentos:', error);
      res.status(500).json({ 
          message: 'Erro ao buscar departamentos',
          error: error instanceof Error ? error.message : 'Erro desconhecido'
      });
  }
};

export const getDepartmentById = async (req: GetDepartmentRequest, res: Response) => {
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
      const [rows] = await pool.query<DepartmentRow[]>(
          'SELECT * FROM departments WHERE id = ?',
          [departmentId]
      );

      if (rows.length === 0) {
          return res.status(404).json({ 
              message: 'Departamento não encontrado' 
          });
      }
      
      res.json(rows[0]);

  } catch (error) {
      console.error(`Erro ao buscar departamento ID ${id}:`, error);
      res.status(500).json({ 
          message: 'Erro ao buscar departamento',
          error: error instanceof Error ? error.message : 'Erro desconhecido'
      });
  }
};

export const updateDepartment = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, production_order } = req.body;

  try {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      // Verifica conflitos excluindo o próprio registro
      const [existing] = await connection.query(
        `SELECT * FROM departments 
        WHERE (name = ? OR production_order = ?)
        AND id != ?`,
        [name, production_order, id]
      );

      if ((existing as any[]).length > 0) {
        const conflicts = [];
        if ((existing as any[]).some(d => d.name === name)) conflicts.push('nome');
        if ((existing as any[]).some(d => d.production_order === production_order)) conflicts.push('ordem de produção');
        
        res.status(409).json({
          message: `Conflito em: ${conflicts.join(', ')}`
        });
        return;
      }

      // Atualiza o departamento
      const [result] = await connection.query(
        'UPDATE departments SET name = ?, production_order = ? WHERE id = ?',
        [name, production_order, id]
      );

      if ((result as any).affectedRows === 0) {
        res.status(404).json({ message: 'Departamento não encontrado' });
        return;
      }

      await connection.commit();
      res.json({ message: 'Departamento atualizado com sucesso' });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    res.status(500).json({ message: 'Erro ao atualizar departamento' });
  }
};

export const deleteDepartment = async (req: GetDepartmentRequest, res: Response) => {
  const { id } = req.params;

  try {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      // Verifica dependências
      const [employees] = await connection.query(
        'SELECT * FROM employee_departments WHERE department_id = ? LIMIT 1',
        [id]
      );

      const [os] = await connection.query(
        'SELECT * FROM os_departments WHERE department_id = ? LIMIT 1',
        [id]
      );

      if ((employees as any[]).length > 0 || (os as any[]).length > 0) {
        await connection.rollback();
        return res.status(400).json({
          message: 'Departamento está vinculado a colaboradores ou ordens de serviço'
        });
      }

      // Exclui o departamento
      const [result] = await connection.query(
        'DELETE FROM departments WHERE id = ?',
        [id]
      );

      if ((result as any).affectedRows === 0) {
        await connection.rollback();
        return res.status(404).json({ message: 'Departamento não encontrado' });
      }

      await connection.commit();
      res.status(204).end();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ 
      message: 'Erro ao excluir departamento',
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
};
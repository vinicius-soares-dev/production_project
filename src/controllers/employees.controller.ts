import { NextFunction, Request, Response }  from "express";
import pool from "../config/database.js";
import bcrypt from "bcrypt";
import { ResultSetHeader, RowDataPacket } from "mysql2";


const saltRounds = 10;

// Interface para tipagem dos departamentos
interface Department extends RowDataPacket {
  id: number;
  name: string;
}

export const createEmployee = async (req: Request, res: Response, next: NextFunction) => {
  const { 
      name, 
      username, 
      password, 
      work_schedule, 
      departments 
  }: {
      name: string;
      username: string;
      password: string;
      work_schedule: Record<string, string[]>;
      departments?: number[];
  } = req.body;

  // Validação dos campos obrigatórios
  if (!name || !username || !password || !work_schedule) {
      return res.status(400).json({
          message: 'Dados obrigatórios faltando'
      });
  }

  // Validação da senha
  if (password.length < 8) {
      return res.status(400).json({
          message: 'Senha deve ter no mínimo 8 caracteres'
      });
  }

  try {
      const hashedPassword = await bcrypt.hash(password, saltRounds);
      const connection = await pool.getConnection();
      
      try {
          await connection.beginTransaction();
          const workScheduleJSON = JSON.stringify(work_schedule);

          // 1. Verificação de departamentos
          if (departments?.length) {
              const [existingDepartments] = await connection.query<RowDataPacket[]>(
                  'SELECT id FROM departments WHERE id IN (?)',
                  [departments]
              );

              const existingIds = existingDepartments.map(d => d.id);
              const invalidIds = departments.filter(d => !existingIds.includes(d));

              if (invalidIds.length > 0) {
                  await connection.rollback();
                  return res.status(400).json({
                      message: `Departamentos inválidos: ${invalidIds.join(', ')}`
                  });
              }
          }

          // 2. Inserir colaborador
          const [result] = await connection.query<ResultSetHeader>(
              'INSERT INTO employees (name, username, password, work_schedule) VALUES (?, ?, ?, ?)',
              [name, username, hashedPassword, workScheduleJSON]
          );

          const employeeId = result.insertId;

          // 3. Associar departamentos
          if (departments?.length) {
              await connection.query(
                  'INSERT INTO employee_departments (employee_id, department_id) VALUES ?',
                  [departments.map(d => [employeeId, d])]
              );
          }

          // 4. Buscar departamentos associados
          const [departmentsData] = await connection.query<Department[]>(
              `SELECT d.id, d.name 
               FROM departments d
               INNER JOIN employee_departments ed ON d.id = ed.department_id
               WHERE ed.employee_id = ?`,
              [employeeId]
          );

          await connection.commit();

          // Resposta formatada
          res.status(201).json({
              id: employeeId,
              name,
              username,
              work_schedule: JSON.parse(workScheduleJSON),
              departments: departmentsData
          });

      } catch (error: any) {
          await connection.rollback();
          
          // Tratamento específico para ER_DUP_ENTRY
          if (error.code === 'ER_DUP_ENTRY') {
              return res.status(409).json({ 
                  message: 'Username já está em uso' 
              });
          }

          // Log detalhado do erro
          console.error('Erro na transação:', error);
          res.status(500).json({ 
              message: 'Erro ao processar solicitação',
              error: error.message 
          });

      } finally {
          connection.release();
      }

  } catch (error: any) {
      console.error('Erro geral:', error);
      res.status(500).json({ 
          message: 'Erro interno no servidor',
          error: error.message 
      });
  }
};

export const getEmployees = async (req: Request, res: Response) => {
  const { page = 1, limit = 10, search } = req.query;

  try {
    let query = `
      SELECT e.*, GROUP_CONCAT(d.name) as departments 
      FROM employees e
      LEFT JOIN employee_departments ed ON e.id = ed.employee_id
      LEFT JOIN departments d ON ed.department_id = d.id
    `;

    const params = [];
    
    if (search) {
      query += ' WHERE e.name LIKE ? OR e.username LIKE ?';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ' GROUP BY e.id LIMIT ? OFFSET ?';
    params.push(Number(limit), (Number(page) - 1) * Number(limit));

    const [employees] = await pool.query(query, params);
    
    res.json(employees);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar colaboradores' });
  }
};

export const updateEmployee = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { departments, work_schedule, ...updateData } = req.body;

  try {
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // 1. Atualizar dados básicos
      if (Object.keys(updateData).length > 0) {
        if (updateData.password) {
          updateData.password = await bcrypt.hash(updateData.password, saltRounds);
        }
        
        const sets = Object.keys(updateData).map(key => `${key} = ?`).join(', ');
        await connection.query(
          `UPDATE employees SET ${sets} WHERE id = ?`,
          [...Object.values(updateData), id]
        );
      }

      // 2. Validar e atualizar horários
      if (work_schedule) {
        if (typeof work_schedule !== 'object') {
          throw new Error('Formato de horário inválido');
        }
        
        await connection.query(
          'UPDATE employees SET work_schedule = ? WHERE id = ?',
          [JSON.stringify(work_schedule), id]
        );
      }

      // 3. Atualizar departamentos
      if (departments) {
        await connection.query(
          'DELETE FROM employee_departments WHERE employee_id = ?',
          [id]
        );

        if (departments.length > 0) {
          // Validar departamentos
          const [validDepartments] = await connection.query<RowDataPacket[]>(
            'SELECT id FROM departments WHERE id IN (?)',
            [departments]
          );

          if (validDepartments.length !== departments.length) {
            throw new Error('Departamentos inválidos');
          }

          await connection.query(
            'INSERT INTO employee_departments (employee_id, department_id) VALUES ?',
            [departments.map((d: number) => [id, d])]
          );
        }
      }

      await connection.commit();
      res.json({ message: 'Colaborador atualizado com sucesso' });
    } catch (error: any) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error: any) {
    console.error('Erro na atualização:', error);
    res.status(500).json({ 
      message: error.message || 'Erro ao atualizar colaborador'
    });
  }
};

export const deleteEmployee = async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    await pool.query('DELETE FROM employee_departments WHERE employee_id = ?', [id]);
    await pool.query('DELETE FROM employees WHERE id = ?', [id]);
    
    res.status(204).end();
  } catch (error) {
    res.status(500).json({ message: 'Erro ao excluir colaborador' });
  }
};

export const getAllEmployees = async (req: Request, res: Response) => {
  try {
    const query = `
      SELECT 
        e.id,
        e.name,
        e.username,
        e.work_schedule,
        COALESCE(GROUP_CONCAT(d.name), '') as departments
      FROM employees e
      LEFT JOIN employee_departments ed ON e.id = ed.employee_id
      LEFT JOIN departments d ON ed.department_id = d.id
      GROUP BY e.id
    `;

    const [employees] = await pool.query<RowDataPacket[]>(query);

    const formattedEmployees = employees.map(emp => ({
      id: emp.id,
      name: emp.name,
      departments: emp.departments.split(',').filter(Boolean),
      work_schedule: typeof emp.work_schedule === 'string' 
        ? JSON.parse(emp.work_schedule) 
        : emp.work_schedule
    }));

    res.json(formattedEmployees);
  } catch (error: any) {
    console.error('Erro ao buscar todos os colaboradores:', error);
    res.status(500).json({ 
      message: 'Erro ao buscar colaboradores',
      error: error.message 
    });
  }
};

// Modificar o getAllEmployees para getEmployeeByUsername
export const getEmployeeByUsername = async (req: Request, res: Response) => {
  const { username } = req.params;

  try {
    const query = `
      SELECT 
        e.id,
        e.name,
        e.username,
        e.work_schedule,
        COALESCE(GROUP_CONCAT(d.name), '') as departments
      FROM employees e
      LEFT JOIN employee_departments ed ON e.id = ed.employee_id
      LEFT JOIN departments d ON ed.department_id = d.id
      WHERE e.username = ?
      GROUP BY e.id
    `;

    const [employees] = await pool.query<RowDataPacket[]>(query, [username]);

    if (employees.length === 0) {
      return res.status(404).json({ message: 'Colaborador não encontrado' });
    }

    const formattedEmployee = {
      id: employees[0].id,
      name: employees[0].name,
      departments: employees[0].departments.split(',').filter(Boolean),
      work_schedule: typeof employees[0].work_schedule === 'string' 
        ? JSON.parse(employees[0].work_schedule) 
        : employees[0].work_schedule
    };

    res.json(formattedEmployee);
  } catch (error: any) {
    console.error('Erro ao buscar colaborador:', error);
    res.status(500).json({ 
      message: 'Erro ao buscar colaborador',
      error: error.message 
    });
  }
};
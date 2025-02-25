import { NextFunction, Request, Response } from "express";
import pool from "../config/database.js";
import { ResultSetHeader, RowDataPacket } from "mysql2";

interface OSDepartment extends RowDataPacket {
  id: number;
  department_id: number;
  execution_time: number;
  collaborators_needed: number;
  scheduled_days: string;
}

export const createServiceOrder = async (req: Request, res: Response, next: NextFunction) => {
  const { os_number, departments } = req.body as {
      os_number: string;
      departments?: Array<{
          department_id: number;
          execution_time: number;
          collaborators_needed: number;
          scheduled_days: Record<string, any>;
      }>;
  };

  if (!os_number) {
      return res.status(400).json({ message: 'Número da OS é obrigatório' });
  }

  try {
      const connection = await pool.getConnection();
      
      try {
          await connection.beginTransaction();

          // 1. Validação dos departamentos
          if (departments?.length) {
              // Extrai apenas os IDs dos departamentos
              const departmentIds = departments.map(d => d.department_id);
              
              // Verifica existência
              const [existing] = await connection.query<RowDataPacket[]>(
                  'SELECT id FROM departments WHERE id IN (?)',
                  [departmentIds]
              );

              const existingIds = existing.map(d => d.id);
              const invalidIds = departmentIds.filter(id => !existingIds.includes(id));

              if (invalidIds.length > 0) {
                  await connection.rollback();
                  return res.status(400).json({
                      message: `Departamentos inválidos: ${invalidIds.join(', ')}`
                  });
              }
          }

          // 2. Insere a OS principal
          const [result] = await connection.query<ResultSetHeader>(
              'INSERT INTO service_orders (os_number) VALUES (?)',
              [os_number]
          );

          const osId = result.insertId;

          // 3. Insere os departamentos associados
          if (departments?.length) {
              await connection.query(
                  'INSERT INTO os_departments (os_id, department_id, execution_time, collaborators_needed, scheduled_days) VALUES ?',
                  [
                      departments.map(d => [
                          osId,
                          d.department_id,
                          d.execution_time,
                          d.collaborators_needed,
                          JSON.stringify(d.scheduled_days)
                      ])
                  ]
              );
          }

          await connection.commit();

          // 4. Busca dados completos para resposta
          const [osDepartments] = await connection.query<OSDepartment[]>(
              `SELECT * FROM os_departments WHERE os_id = ?`,
              [osId]
          );

          res.status(201).json({
              id: osId,
              os_number,
              departments: osDepartments.map(d => ({
                  ...d,
                  scheduled_days: JSON.parse(d.scheduled_days)
              }))
          });

      } catch (error: any) {
          await connection.rollback();
          
          if (error.code === 'ER_DUP_ENTRY') {
              return res.status(409).json({ message: 'Número de OS já existe' });
          }
          
          res.status(500).json({ 
              message: 'Erro ao criar ordem de serviço',
              error: error.message
          });
      } finally {
          connection.release();
      }
  } catch (error: any) {
      res.status(500).json({ 
          message: 'Erro de conexão com o banco',
          error: error.message
      });
  }
};

export const getServiceOrders = async (req: Request, res: Response) => {
  const { page = 1, limit = 10, search } = req.query;

  try {
    let query = `
      SELECT so.*, GROUP_CONCAT(d.name) as departments 
      FROM service_orders so
      LEFT JOIN os_departments osd ON so.id = osd.os_id
      LEFT JOIN departments d ON osd.department_id = d.id
    `;

    const params = [];
    
    if (search) {
      query += ' WHERE so.os_number LIKE ?';
      params.push(`%${search}%`);
    }

    query += ' GROUP BY so.id LIMIT ? OFFSET ?';
    params.push(Number(limit), (Number(page) - 1) * Number(limit));

    const [orders] = await pool.query(query, params);
    
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: 'Erro ao buscar ordens de serviço' });
  }
};

export const updateServiceOrder = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { departments, ...updateData } = req.body;

  try {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      // 1. Atualiza dados básicos
      if (Object.keys(updateData).length > 0) {
        await connection.query(
          'UPDATE service_orders SET ? WHERE id = ?',
          [updateData, id]
        );
      }

      // 2. Atualiza departamentos
      if (departments) {
        await connection.query(
          'DELETE FROM os_departments WHERE os_id = ?',
          [id]
        );
        
        if (departments.length > 0) {
          await connection.query(
            'INSERT INTO os_departments (os_id, department_id) VALUES ?',
            [departments.map((d: number) => [id, d])]
          );
        }
      }

      await connection.commit();
      res.json({ message: 'Ordem de serviço atualizada' });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    res.status(500).json({ message: 'Erro ao atualizar ordem de serviço' });
  }
};

export const deleteServiceOrder = async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      await connection.query('DELETE FROM os_departments WHERE os_id = ?', [id]);
      await connection.query('DELETE FROM service_orders WHERE id = ?', [id]);

      await connection.commit();
      res.status(204).end();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    res.status(500).json({ message: 'Erro ao excluir ordem de serviço' });
  }
};
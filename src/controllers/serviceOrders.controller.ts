import { NextFunction, Request, Response } from "express";
import pool from "../config/database.js";
import { ResultSetHeader, RowDataPacket } from "mysql2";

interface OSDepartment extends RowDataPacket {
  id: number;
  department_id: number;
  collaborators_needed: number;
  scheduled_days: string;
}


export const getServiceOrders = async (req: Request, res: Response) => {
  const { page = 1, limit = 10, search } = req.query;

  try {
    // Passo 1: Buscar ordens de serviço com dias
    const [orders] = await pool.query<RowDataPacket[]>(
      `SELECT 
        so.id,
        so.os_number,
        so.created_at,
        GROUP_CONCAT(osd.day_of_week) as service_days
      FROM service_orders so
      LEFT JOIN os_service_days osd ON so.id = osd.os_id
      WHERE so.os_number LIKE ?
      GROUP BY so.id
      LIMIT ? OFFSET ?`,
      [
        `%${search || ''}%`,
        Number(limit),
        (Number(page) - 1) * Number(limit)
      ]
    );

    // Passo 2: Processar dias de serviço e outros relacionamentos
    const ordersWithDetails = await Promise.all(
      orders.map(async (order) => {
        // Converter dias de serviço para array de números
        const service_days = order.service_days 
          ? order.service_days.split(',').map(Number) 
          : [];

        // Buscar departamentos (mantido igual)
        const [departments] = await pool.query<RowDataPacket[]>(
          `SELECT 
            od.id,
            od.department_id,
            od.execution_start,
            od.execution_end,
            d.name AS department_name
          FROM os_departments od
          JOIN departments d ON od.department_id = d.id
          WHERE od.os_id = ?`,
          [order.id]
        );

        // Buscar colaboradores (ajustado para retornar apenas IDs)
        const departmentsWithCollaborators = await Promise.all(
          departments.map(async (dept) => {
            const [collaborators] = await pool.query<RowDataPacket[]>(
              `SELECT 
                collaborator_id 
              FROM os_collaborators 
              WHERE os_department_id = ?`,
              [dept.id]
            );

            return {
              ...dept,
              collaborators: collaborators.map(c => c.collaborator_id)
            };
          })
        );

        return {
          ...order,
          service_days,
          departments: departmentsWithCollaborators
        };
      })
    );

    res.json(ordersWithDetails);
    
  } catch (error) {
    res.status(500).json({ 
      message: 'Erro ao buscar ordens de serviço',
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    });
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


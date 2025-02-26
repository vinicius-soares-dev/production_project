import { NextFunction, Request, Response } from "express";
import pool from "../config/database.js";
import { ResultSetHeader, RowDataPacket } from "mysql2";

interface OSDepartment extends RowDataPacket {
  id: number;
  os_id: number;
  department_id: number;
  execution_start: string;
  execution_end: string;
}

interface OSCollaborator extends RowDataPacket {
  os_department_id: number;
  collaborator_id: number;
}

// Função de validação de horário
const isValidTime = (time: string): boolean => {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(time);
};

// Adicione esta interface no início do arquivo
interface OSServiceDay extends RowDataPacket {
  os_id: number;
  day_of_week: number;
}


export const createServiceOrder = async (req: Request, res: Response, next: NextFunction) => {
  const { os_number, departments, service_days } = req.body as {
    os_number: string;
    service_days?: number[];
    departments?: Array<{
      department_id: number;
      execution_start: string;
      execution_end: string;
      collaborator_ids: number[];
    }>;
  };

  if (!os_number || !service_days || service_days.length === 0) {
    return res.status(400).json({ message: 'Número da OS e dias de serviço são obrigatórios' });
  };

    // Verificar dias válidos (0-6)
  const invalidDay = service_days.some(day => day < 0 || day > 6);
  if (invalidDay) {
      return res.status(400).json({ message: 'Dias de serviço devem estar entre 0 (Domingo) e 6 (Sábado)' });
  };

      // Remover dias duplicados
  const uniqueDays = [...new Set(service_days)];


  try {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      // Validação de departamentos
      if (!departments || departments.length === 0) {
        await connection.rollback();
        return res.status(400).json({ message: 'Pelo menos um departamento é necessário' });
      }

      // Verificar se a OS já existe
      const [existingOS] = await connection.query<RowDataPacket[]>(
        'SELECT id FROM service_orders WHERE os_number = ?',
        [os_number]
      );

      if (existingOS.length > 0) {
        await connection.rollback();
        return res.status(409).json({ message: 'Número de OS já existe' });
      }

      // Inserir OS principal
      const [osResult] = await connection.query<ResultSetHeader>(
        'INSERT INTO service_orders (os_number) VALUES (?)',
        [os_number]
      );
      const osId = osResult.insertId;

      // Inserir dias de serviço
      await connection.query(
          'INSERT INTO os_service_days (os_id, day_of_week) VALUES ?',
          [uniqueDays.map(day => [osId, day])]
      );
      

      // Processar departamentos
      for (const dept of departments) {
        // Validar horários
        if (!isValidTime(dept.execution_start) || !isValidTime(dept.execution_end)) {
          await connection.rollback();
          return res.status(400).json({ message: 'Formato de horário inválido (use HH:MM)' });
        }

        // Inserir departamento
        const [deptResult] = await connection.query<ResultSetHeader>(
          `INSERT INTO os_departments 
          (os_id, department_id, execution_start, execution_end) 
          VALUES (?, ?, ?, ?)`,
          [osId, dept.department_id, dept.execution_start, dept.execution_end]
        );

        // Inserir colaboradores
        if (dept.collaborator_ids?.length > 0) {
          // Validar colaboradores
          const [existingCollabs] = await connection.query<RowDataPacket[]>(
            'SELECT id FROM employees WHERE id IN (?)',
            [dept.collaborator_ids]
          );

          if (existingCollabs.length !== dept.collaborator_ids.length) {
            await connection.rollback();
            return res.status(400).json({ message: 'Colaborador(es) inválido(s)' });
          }

          await connection.query(
            'INSERT INTO os_collaborators (os_department_id, collaborator_id) VALUES ?',
            [dept.collaborator_ids.map(cId => [deptResult.insertId, cId])]
          );
        }
      }

      await connection.commit();
      res.status(201).json(await getOSDetails(osId));

    } catch (error: any) {
      await connection.rollback();
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

// Função auxiliar para obter detalhes da OS
const getOSDetails = async (osId: number) => {
  const connection = await pool.getConnection();
  
  try {
    const [osData] = await connection.query<RowDataPacket[]>(
      'SELECT * FROM service_orders WHERE id = ?',
      [osId]
    );

    const [departments] = await connection.query<OSDepartment[]>(
      `SELECT * FROM os_departments WHERE os_id = ?`,
      [osId]
    );

    const [collaborators] = await connection.query<OSCollaborator[]>(
      `SELECT * FROM os_collaborators WHERE os_department_id IN (?)`,
      [departments.map(d => d.id)]
    );

    // Buscar dias de serviço
    const [serviceDays] = await connection.query<RowDataPacket[]>(
        'SELECT day_of_week FROM os_service_days WHERE os_id = ?',
        [osId]
    );

    return {
      ...osData[0],
      service_days: serviceDays.map(d => d.day_of_week),
      departments: departments.map(d => ({
        id: d.id,
        department_id: d.department_id,
        execution_start: d.execution_start,
        execution_end: d.execution_end,
        collaborators: collaborators
          .filter(c => c.os_department_id === d.id)
          .map(c => c.collaborator_id)
      }))
    };
  } finally {
    connection.release();
  }
};

export const deleteServiceOrder = async (req: Request, res: Response, next: NextFunction) => {
  const osId = parseInt(req.params.id);
  if (isNaN(osId)) {
    return res.status(400).json({ message: 'ID inválido' });
  }

  try {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Verificar se a OS existe
      const [os] = await connection.query<RowDataPacket[]>(
        'SELECT id FROM service_orders WHERE id = ?',
        [osId]
      );
      if (os.length === 0) {
        await connection.rollback();
        return res.status(404).json({ message: 'Ordem de serviço não encontrada' });
      }

      // Obter IDs dos departamentos relacionados
      const [departments] = await connection.query<RowDataPacket[]>(
        'SELECT id FROM os_departments WHERE os_id = ?',
        [osId]
      );
      const departmentIds = departments.map(d => d.id);

      // Deletar colaboradores associados
      if (departmentIds.length > 0) {
        await connection.query(
          'DELETE FROM os_collaborators WHERE os_department_id IN (?)',
          [departmentIds]
        );
      }

      // Deletar departamentos
      await connection.query(
        'DELETE FROM os_departments WHERE os_id = ?',
        [osId]
      );

      // Deletar dias de serviço
      await connection.query(
        'DELETE FROM os_service_days WHERE os_id = ?',
        [osId]
      );

      // Deletar OS principal
      await connection.query(
        'DELETE FROM service_orders WHERE id = ?',
        [osId]
      );

      await connection.commit();
      res.status(200).json({ message: 'Ordem de serviço deletada com sucesso' });
    } catch (error: any) {
      await connection.rollback();
      res.status(500).json({ 
        message: 'Erro ao deletar ordem de serviço',
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

// Controller para buscar OS por ID
export const getServiceOrderById = async (req: Request, res: Response, next: NextFunction) => {
  const osId = parseInt(req.params.id);
  
  // Validação do ID
  if (isNaN(osId)) {
    return res.status(400).json({ message: 'ID da OS inválido' });
  }

  try {
    const connection = await pool.getConnection();
    
    try {
      // Buscar dados básicos da OS
      const [osData] = await connection.query<RowDataPacket[]>(
        'SELECT * FROM service_orders WHERE id = ?',
        [osId]
      );

      // Verificar se a OS existe
      if (osData.length === 0) {
        return res.status(404).json({ message: 'Ordem de serviço não encontrada' });
      }

      // Buscar dias de serviço
      const [serviceDays] = await connection.query<OSServiceDay[]>(
        'SELECT day_of_week FROM os_service_days WHERE os_id = ?',
        [osId]
      );

      // Buscar departamentos e colaboradores
      const [departments] = await connection.query<OSDepartment[]>(
        `SELECT * FROM os_departments WHERE os_id = ?`,
        [osId]
      );

      // Buscar colaboradores para cada departamento
      const departmentsWithCollaborators = await Promise.all(
        departments.map(async (dept) => {
          const [collaborators] = await connection.query<OSCollaborator[]>(
            `SELECT collaborator_id FROM os_collaborators 
            WHERE os_department_id = ?`,
            [dept.id]
          );
          
          return {
            ...dept,
            collaborators: collaborators.map(c => c.collaborator_id)
          };
        })
      );

      // Montar resposta final
      const response = {
        ...osData[0],
        service_days: serviceDays.map(d => d.day_of_week),
        departments: departmentsWithCollaborators
      };

      res.status(200).json(response);

    } finally {
      connection.release();
    }
  } catch (error: any) {
    res.status(500).json({ 
      message: 'Erro ao buscar ordem de serviço',
      error: error.message
    });
  }
};

import { createDepartment, deleteDepartment, getDepartmentById, getDepartments, updateDepartment } from "../controllers/departments.controller.js";
import { createEmployee, deleteEmployee, getAllEmployees, getEmployeeByUsername, getEmployees, updateEmployee } from "../controllers/employees.controller.js";
import { loginEmployee } from "../controllers/loginEmployee.controller.js";
import { createServiceOrder, deleteServiceOrder, getServiceOrders, updateServiceOrder } from "../controllers/serviceOrders.controller.js";
import { RequestHandler, Router } from "express";

const router = Router();

type CreateDepartmentRequest = RequestHandler<
  unknown, 
  unknown, 
  { name: string; production_order: number }
>;

type GetDepartmentByIdRequest = RequestHandler<{ id: string }>;
type DeleteDepartmentRequest = RequestHandler<{ id: string }>;

// rota login
router.post('/auth/login', loginEmployee as any);

// rota colaboradores
router.post('/employee', createEmployee as RequestHandler);
router.get('/employee', getEmployees as RequestHandler);
router.put('/employee/:id', updateEmployee as RequestHandler);
router.delete('/employee/:id', deleteEmployee as RequestHandler);
router.get('/employee/all', getAllEmployees as RequestHandler);
router.get('/employees/:username', getEmployeeByUsername as RequestHandler);

// rota ordem de serviço
router.post('/service-orders', createServiceOrder as RequestHandler);
router.get('/service-orders', getServiceOrders as RequestHandler);
router.patch('/service-orders/:id', updateServiceOrder as RequestHandler);
router.delete('/service-orders/:id', deleteServiceOrder as RequestHandler);

// rota departamentos

router.post('/departments', createDepartment as CreateDepartmentRequest);
router.get('/departments', getDepartments as RequestHandler);
router.put('/departments/:id', updateDepartment as RequestHandler);
router.get('/departments/:id', getDepartmentById as GetDepartmentByIdRequest);
router.delete('/departments/:id', deleteDepartment as DeleteDepartmentRequest);

export default router;
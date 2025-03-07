import { createDepartment, deleteDepartment, getDepartmentById, getDepartments, updateDepartment } from "../controllers/departments.controller.js";
import { createEmployee, deleteEmployee, getAllEmployees, getEmployeeById, getEmployeeByUsername, getEmployees, updateEmployee } from "../controllers/employees.controller.js";
import { loginEmployee } from "../controllers/loginEmployee.controller.js";
import { createServiceOrder, deleteServiceOrder, getServiceOrderById } from "../controllers/os.controller.js";
import { getServiceOrders, updateServiceOrder } from "../controllers/serviceOrders.controller.js";
import { Router } from "express";
const router = Router();
// rota login
router.post('/auth/login', loginEmployee);
// rota colaboradores
router.post('/employee', createEmployee);
router.get('/employee', getEmployees);
router.put('/employee/:id', updateEmployee);
router.delete('/employee/:id', deleteEmployee);
router.get('/employee/all', getAllEmployees);
router.get('/employees/:username', getEmployeeByUsername);
router.get('/employee/:id', getEmployeeById);
// Rotas de Ordens de Serviço (Atualizadas)
router.post('/service-orders', createServiceOrder);
router.get('/service-orders', getServiceOrders);
router.put('/service-orders/:id', updateServiceOrder); // Alterado para PUT
router.delete('/service-orders/:id', deleteServiceOrder);
router.get('/service-orders/:id', getServiceOrderById);
// rota departamentos
router.post('/departments', createDepartment);
router.get('/departments', getDepartments);
router.put('/departments/:id', updateDepartment);
router.get('/departments/:id', getDepartmentById);
router.delete('/departments/:id', deleteDepartment);
export default router;

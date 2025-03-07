import pool from "../config/database.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
export const loginEmployee = async (req, res) => {
    const { username, password } = req.body;
    try {
        const [employees] = await pool.query('SELECT * FROM employees WHERE username = ?', [username]);
        if (employees.length === 0) {
            return res.status(401).json({ message: 'Credenciais inválidas' });
        }
        const employee = employees[0];
        const validPassword = await bcrypt.compare(password, employee.password);
        if (!validPassword) {
            return res.status(401).json({ message: 'Credenciais inválidas' });
        }
        // Gerar token JWT
        const token = jwt.sign({
            id: employee.id,
            username: employee.username,
            role: 'colab'
        }, process.env.JWT_SECRET, { expiresIn: '8h' });
        res.json({ token });
    }
    catch (error) {
        res.status(500).json({ message: 'Erro no servidor' });
    }
};

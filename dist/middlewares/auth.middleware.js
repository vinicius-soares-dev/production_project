import jwt from 'jsonwebtoken';
export const authMiddleware = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
        res.status(401).json({ message: 'Acesso não autorizado' });
        return;
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next(); // Importante chamar next() quando a autenticação for bem-sucedida
    }
    catch (error) {
        res.status(401).json({ message: 'Token inválido' });
    }
};

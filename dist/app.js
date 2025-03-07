import express from "express";
import cors from "cors";
import router from "./routes/index.js";
import dotenv from "dotenv";
dotenv.config();
const app = express();
const PORT = process.env.PORT_APP || 3001;
app.use(cors());
app.use(express.json());
app.use('/api', router);
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

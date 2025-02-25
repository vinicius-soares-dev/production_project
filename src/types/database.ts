// src/types/database.ts
import { RowDataPacket } from "mysql2";

declare global {
  interface Department extends RowDataPacket {
    id: number;
    name: string;
    production_order: number;
  }
}

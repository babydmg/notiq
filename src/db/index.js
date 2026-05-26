import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on("connect", () => console.log("database connected"));
pool.on("error", (err) => console.log(`error occured: ${err}`));

export default pool;
